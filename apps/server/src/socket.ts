import type { Server, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  MIN_PLAYERS,
  SERVER_EVENTS,
  createRoomSchema,
  gameActionSchema,
  joinRoomSchema,
  readySchema,
  rejoinSchema,
  selectGameSchema,
  settingsPatchSchema,
  targetPlayerSchema,
  type AppError,
  type ErrorCode,
} from '@arcade/shared';
import type { ZodSchema } from 'zod';
import { logger } from './logger.js';
import { RoomManager } from './rooms/manager.js';
import { SocketRateLimiter, payloadTooLarge } from './security.js';

interface SocketSession {
  roomCode: string;
  playerId: string;
}

export function registerSocketHandlers(io: Server): RoomManager {
  const manager = new RoomManager((code) => ({
    broadcast: (event, payload) => io.to(roomChannel(code)).emit(event, payload),
    direct: (socketId, event, payload) => io.to(socketId).emit(event, payload),
  }));
  manager.startSweeper();

  const limiter = new SocketRateLimiter();
  const sessions = new Map<string, SocketSession>();

  function roomChannel(code: string): string {
    return 'room:' + code;
  }

  function fail(socket: Socket, code: ErrorCode, message: string): void {
    const error: AppError = { code, message };
    socket.emit(SERVER_EVENTS.error, error);
  }

  function guard<T>(
    socket: Socket,
    schema: ZodSchema<T>,
    payload: unknown,
    handler: (value: T) => void,
  ): void {
    if (!limiter.allow(socket.id)) {
      fail(socket, 'RATE_LIMITED', 'Estas enviando demasiadas acciones. Espera un momento.');
      return;
    }
    if (payloadTooLarge(payload)) {
      fail(socket, 'INVALID_PAYLOAD', 'Mensaje demasiado grande.');
      return;
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      fail(socket, 'INVALID_PAYLOAD', first?.message ?? 'Datos invalidos.');
      return;
    }
    try {
      handler(parsed.data);
    } catch (error) {
      logger.error('Error tratando un evento de socket', String(error));
      fail(socket, 'INTERNAL', 'Se ha producido un error inesperado.');
    }
  }

  function sessionOf(socket: Socket) {
    const session = sessions.get(socket.id);
    if (!session) return null;
    const room = manager.get(session.roomCode);
    if (!room) return null;
    const player = room.getPlayer(session.playerId);
    if (!player) return null;
    return { room, player };
  }

  function joinChannel(socket: Socket, code: string, playerId: string): void {
    sessions.set(socket.id, { roomCode: code, playerId });
    void socket.join(roomChannel(code));
  }

  io.on('connection', (socket) => {
    logger.debug('Socket conectado', socket.id);

    socket.on(CLIENT_EVENTS.createRoom, (payload) => {
      guard(socket, createRoomSchema, payload, ({ name }) => {
        const room = manager.create();
        const player = room.addPlayer(name, socket.id);
        joinChannel(socket, room.code, player.id);
        socket.emit(SERVER_EVENTS.session, {
          playerId: player.id,
          token: player.token,
          code: room.code,
        });
        room.broadcastRoom();
      });
    });

    socket.on(CLIENT_EVENTS.joinRoom, (payload) => {
      guard(socket, joinRoomSchema, payload, ({ code, name }) => {
        const room = manager.get(code);
        if (!room) return fail(socket, 'ROOM_NOT_FOUND', 'No existe ninguna sala con ese codigo.');
        if (room.isFull) return fail(socket, 'ROOM_FULL', 'La sala esta completa.');
        if (room.currentPhase !== 'lobby') {
          return fail(socket, 'ROOM_IN_PROGRESS', 'La partida ya ha empezado en esa sala.');
        }
        if (room.hasName(name)) {
          return fail(socket, 'NAME_TAKEN', 'Ya hay alguien con ese nombre en la sala.');
        }
        const player = room.addPlayer(name, socket.id);
        joinChannel(socket, room.code, player.id);
        socket.emit(SERVER_EVENTS.session, {
          playerId: player.id,
          token: player.token,
          code: room.code,
        });
        room.broadcastRoom();
      });
    });

    socket.on(CLIENT_EVENTS.rejoin, (payload) => {
      guard(socket, rejoinSchema, payload, ({ code, token }) => {
        const room = manager.get(code);
        if (!room) return fail(socket, 'ROOM_NOT_FOUND', 'La sala ya no existe.');
        const player = room.findByToken(token);
        if (!player) return fail(socket, 'SESSION_EXPIRED', 'Tu sesion ha caducado.');
        room.attachSocket(player.id, socket.id);
        joinChannel(socket, room.code, player.id);
        socket.emit(SERVER_EVENTS.session, {
          playerId: player.id,
          token: player.token,
          code: room.code,
        });
        room.broadcastRoom();
        const state = room.currentGameState();
        if (state) socket.emit(SERVER_EVENTS.gameState, state);
        const result = room.getLastResult();
        if (result) socket.emit(SERVER_EVENTS.gameOver, { result });
      });
    });

    socket.on(CLIENT_EVENTS.leaveRoom, () => {
      const context = sessionOf(socket);
      if (!context) return;
      const { room, player } = context;
      void socket.leave(roomChannel(room.code));
      sessions.delete(socket.id);
      room.removePlayer(player.id);
    });

    socket.on(CLIENT_EVENTS.selectGame, (payload) => {
      guard(socket, selectGameSchema, payload, ({ game }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrion puede cambiar de juego.');
        }
        context.room.selectGame(game);
      });
    });

    socket.on(CLIENT_EVENTS.updateSettings, (payload) => {
      guard(socket, settingsPatchSchema, payload, (patch) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrion puede cambiar la configuracion.');
        }
        if (context.room.currentPhase !== 'lobby') {
          return fail(socket, 'ALREADY_STARTED', 'La configuracion esta bloqueada.');
        }
        context.room.updateSettings(patch.game, patch.settings);
      });
    });

    socket.on(CLIENT_EVENTS.setReady, (payload) => {
      guard(socket, readySchema, payload, ({ ready }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        context.room.setReady(context.player.id, ready);
      });
    });

    socket.on(CLIENT_EVENTS.startGame, () => {
      const context = sessionOf(socket);
      if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
      if (!context.player.isHost) {
        return fail(socket, 'NOT_HOST', 'Solo el anfitrion puede iniciar la partida.');
      }
      const result = context.room.startGame();
      if (!result.ok) {
        const code: ErrorCode =
          context.room.playerCount < MIN_PLAYERS ? 'NOT_ENOUGH_PLAYERS' : 'ALREADY_STARTED';
        fail(socket, code, result.reason ?? 'No se puede iniciar la partida.');
      }
    });

    socket.on(CLIENT_EVENTS.kickPlayer, (payload) => {
      guard(socket, targetPlayerSchema, payload, ({ playerId }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrion puede expulsar jugadores.');
        }
        if (playerId === context.player.id) return;
        const target = context.room.getPlayer(playerId);
        if (!target) return;
        if (target.socketId) io.to(target.socketId).emit(SERVER_EVENTS.kicked, {});
        context.room.removePlayer(playerId);
      });
    });

    socket.on(CLIENT_EVENTS.transferHost, (payload) => {
      guard(socket, targetPlayerSchema, payload, ({ playerId }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        if (!context.room.transferHost(context.player.id, playerId)) {
          fail(socket, 'NOT_HOST', 'No puedes transferir el rol de anfitrion.');
        }
      });
    });

    socket.on(CLIENT_EVENTS.backToLobby, () => {
      const context = sessionOf(socket);
      if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
      if (!context.player.isHost) {
        return fail(socket, 'NOT_HOST', 'Solo el anfitrion puede volver al lobby.');
      }
      context.room.backToLobby();
    });

    socket.on(CLIENT_EVENTS.gameAction, (payload) => {
      guard(socket, gameActionSchema, payload, (action) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estas en ninguna sala.');
        context.room.handleAction(context.player.id, action);
      });
    });

    socket.on('disconnect', () => {
      const context = sessionOf(socket);
      limiter.forget(socket.id);
      sessions.delete(socket.id);
      if (!context) return;
      context.room.markDisconnected(context.player.id, socket.id);
      logger.debug('Socket desconectado', socket.id);
    });
  });

  return manager;
}
