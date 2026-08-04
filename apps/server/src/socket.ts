import type { Server, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  createRoomSchema,
  createSoloRoomSchema,
  gameActionSchema,
  joinRoomSchema,
  readySchema,
  recordsQuerySchema,
  rejoinSchema,
  selectGameSchema,
  settingsPatchSchema,
  targetPlayerSchema,
  updateSoloConfigSchema,
  type AppError,
  type ErrorCode,
} from '@arcade/shared';
import type { ZodSchema } from 'zod';
import { logger } from './logger.js';
import { RoomManager } from './rooms/manager.js';
import { listSoloRecords } from './records.js';
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
      fail(socket, 'RATE_LIMITED', 'Estás enviando demasiadas acciones. Espera un momento.');
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

  function leaveCurrentSession(socket: Socket, keepPlayerId?: string): void {
    const current = sessions.get(socket.id);
    if (!current) return;
    if (keepPlayerId && current.playerId === keepPlayerId) return;
    sessions.delete(socket.id);
    void socket.leave(roomChannel(current.roomCode));
    manager.get(current.roomCode)?.removePlayer(current.playerId);
  }

  async function sendRecords(socket: Socket, profileId: string): Promise<void> {
    try {
      const records = await listSoloRecords(profileId);
      socket.emit(SERVER_EVENTS.soloRecords, { records });
    } catch (error) {
      logger.warn('No se pudieron enviar las marcas personales', String(error));
      socket.emit(SERVER_EVENTS.soloRecords, { records: [] });
    }
  }

  function revokePreviousSocket(roomCode: string, socketId: string | null): void {
    if (!socketId) return;
    sessions.delete(socketId);
    const previous = io.sockets.sockets.get(socketId);
    if (!previous) return;
    void previous.leave(roomChannel(roomCode));
    previous.emit(SERVER_EVENTS.sessionReplaced, {});
  }

  io.on('connection', (socket) => {
    logger.debug('Socket conectado', socket.id);

    socket.on(CLIENT_EVENTS.createRoom, (payload) => {
      guard(socket, createRoomSchema, payload, ({ name }) => {
        leaveCurrentSession(socket);
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

    socket.on(CLIENT_EVENTS.createSoloRoom, (payload) => {
      guard(socket, createSoloRoomSchema, payload, ({ name, profileId, game, config }) => {
        leaveCurrentSession(socket);
        const room = manager.create({ solo: { game, profileId, config } });
        const player = room.addPlayer(name, socket.id);
        // En práctica no hay a quién esperar: el único jugador entra listo.
        room.setReady(player.id, true);
        room.prepareSolo();
        joinChannel(socket, room.code, player.id);
        socket.emit(SERVER_EVENTS.session, {
          playerId: player.id,
          token: player.token,
          code: room.code,
        });
        room.broadcastRoom();
        void sendRecords(socket, profileId);
      });
    });

    socket.on(CLIENT_EVENTS.updateSoloConfig, (payload) => {
      guard(socket, updateSoloConfigSchema, payload, (config) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        if (!context.room.solo) {
          return fail(socket, 'SOLO_ROOM', 'Esta opción solo existe en las salas de práctica.');
        }
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede cambiar la configuración.');
        }
        if (!context.room.updateSoloConfig(config)) {
          fail(socket, 'ALREADY_STARTED', 'La configuración está bloqueada.');
        }
      });
    });

    socket.on(CLIENT_EVENTS.requestRecords, (payload) => {
      guard(socket, recordsQuerySchema, payload, ({ profileId }) => {
        void sendRecords(socket, profileId);
      });
    });

    socket.on(CLIENT_EVENTS.joinRoom, (payload) => {
      guard(socket, joinRoomSchema, payload, ({ code, name }) => {
        const room = manager.get(code);
        if (!room) return fail(socket, 'ROOM_NOT_FOUND', 'No existe ninguna sala con ese código.');
        if (room.solo) {
          return fail(socket, 'SOLO_ROOM', 'Esa sala es una partida de práctica en solitario.');
        }
        if (room.isFull) return fail(socket, 'ROOM_FULL', 'La sala está completa.');
        if (room.currentPhase !== 'lobby') {
          return fail(socket, 'ROOM_IN_PROGRESS', 'La partida ya ha empezado en esa sala.');
        }
        if (room.hasName(name)) {
          return fail(socket, 'NAME_TAKEN', 'Ya hay alguien con ese nombre en la sala.');
        }
        leaveCurrentSession(socket);
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
        if (!player) return fail(socket, 'SESSION_EXPIRED', 'Tu sesión ha caducado.');
        leaveCurrentSession(socket, player.id);
        if (player.socketId !== socket.id) {
          revokePreviousSocket(room.code, player.socketId);
        }
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
        const outcome = room.getLastSoloOutcome();
        if (outcome) socket.emit(SERVER_EVENTS.soloOutcome, outcome);
        if (room.soloProfileId) void sendRecords(socket, room.soloProfileId);
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
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede cambiar de juego.');
        }
        context.room.selectGame(game);
      });
    });

    socket.on(CLIENT_EVENTS.updateSettings, (payload) => {
      guard(socket, settingsPatchSchema, payload, (patch) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede cambiar la configuración.');
        }
        if (context.room.currentPhase !== 'lobby') {
          return fail(socket, 'ALREADY_STARTED', 'La configuración está bloqueada.');
        }
        context.room.updateSettings(patch.game, patch.settings);
      });
    });

    socket.on(CLIENT_EVENTS.setReady, (payload) => {
      guard(socket, readySchema, payload, ({ ready }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        context.room.setReady(context.player.id, ready);
      });
    });

    socket.on(CLIENT_EVENTS.startGame, () => {
      const context = sessionOf(socket);
      if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
      if (!context.player.isHost) {
        return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede iniciar la partida.');
      }
      const result = context.room.startGame();
      if (!result.ok) {
        const connectedPlayers = context.room
          .publicPlayers()
          .filter((player) => player.connection === 'connected' && !player.isBot).length;
        const code: ErrorCode =
          context.room.currentPhase !== 'lobby'
            ? 'ALREADY_STARTED'
            : connectedPlayers < context.room.minPlayers
              ? 'NOT_ENOUGH_PLAYERS'
              : 'ACTION_REJECTED';
        fail(socket, code, result.reason ?? 'No se puede iniciar la partida.');
      }
    });

    socket.on(CLIENT_EVENTS.kickPlayer, (payload) => {
      guard(socket, targetPlayerSchema, payload, ({ playerId }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        if (!context.player.isHost) {
          return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede expulsar jugadores.');
        }
        if (context.room.solo) {
          return fail(
            socket,
            'SOLO_ROOM',
            'En una sala de práctica los rivales se ajustan desde la configuración.',
          );
        }
        if (playerId === context.player.id) return;
        const target = context.room.getPlayer(playerId);
        if (!target) return;
        if (target.socketId) {
          const targetSocket = io.sockets.sockets.get(target.socketId);
          sessions.delete(target.socketId);
          if (targetSocket) {
            void targetSocket.leave(roomChannel(context.room.code));
            targetSocket.emit(SERVER_EVENTS.kicked, {});
          }
        }
        context.room.removePlayer(playerId);
      });
    });

    socket.on(CLIENT_EVENTS.transferHost, (payload) => {
      guard(socket, targetPlayerSchema, payload, ({ playerId }) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
        if (context.room.solo) {
          return fail(socket, 'SOLO_ROOM', 'No hay a quién ceder el anfitrión en una práctica.');
        }
        if (!context.room.transferHost(context.player.id, playerId)) {
          fail(socket, 'NOT_HOST', 'No puedes transferir el rol de anfitrión.');
        }
      });
    });

    socket.on(CLIENT_EVENTS.backToLobby, () => {
      const context = sessionOf(socket);
      if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
      if (!context.player.isHost) {
        return fail(socket, 'NOT_HOST', 'Solo el anfitrión puede volver al lobby.');
      }
      context.room.backToLobby();
    });

    socket.on(CLIENT_EVENTS.gameAction, (payload) => {
      guard(socket, gameActionSchema, payload, (action) => {
        const context = sessionOf(socket);
        if (!context) return fail(socket, 'NOT_IN_ROOM', 'No estás en ninguna sala.');
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
