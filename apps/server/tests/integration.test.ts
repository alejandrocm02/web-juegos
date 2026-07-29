import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type GolfPublicState,
  type GolfSnapshot,
  type QuizPublicState,
  type RoomSummary,
} from '@arcade/shared';
import { createApp } from '../src/index.js';

let httpServer: Awaited<ReturnType<typeof createApp>>['httpServer'];
let ioServer: Awaited<ReturnType<typeof createApp>>['io'];
let manager: Awaited<ReturnType<typeof createApp>>['manager'];
let url = '';
const clients: Socket[] = [];

function connect(): Socket {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  return socket;
}

function once<T>(socket: Socket, event: string, predicate: (value: T) => boolean = () => true) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error('Tiempo agotado esperando el evento ' + event));
    }, 8000);
    const handler = (payload: T) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

beforeAll(async () => {
  const app = await createApp();
  httpServer = app.httpServer;
  ioServer = app.io;
  manager = app.manager;
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address() as AddressInfo;
  url = 'http://127.0.0.1:' + address.port;
});

afterAll(async () => {
  for (const client of clients) client.close();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('flujo multijugador por sockets', () => {
  it('crea sala, valida entradas y sincroniza el lobby entre dos clientes', async () => {
    const host = connect();
    const guest = connect();
    await once(host, 'connect');
    await once(guest, 'connect');

    host.emit(CLIENT_EVENTS.createRoom, { name: 'Ana' });
    const session = await once<{ code: string; token: string; playerId: string }>(
      host,
      SERVER_EVENTS.session,
    );
    expect(session.code).toHaveLength(5);

    // Nombre invalido
    guest.emit(CLIENT_EVENTS.joinRoom, { code: session.code, name: 'x' });
    const invalid = await once<{ code: string }>(guest, SERVER_EVENTS.error);
    expect(invalid.code).toBe('INVALID_PAYLOAD');

    // Nombre duplicado
    guest.emit(CLIENT_EVENTS.joinRoom, { code: session.code, name: 'ANA' });
    const duplicated = await once<{ code: string }>(guest, SERVER_EVENTS.error);
    expect(duplicated.code).toBe('NAME_TAKEN');

    // Sala inexistente
    guest.emit(CLIENT_EVENTS.joinRoom, { code: 'ZZZZZ', name: 'Bea' });
    const missing = await once<{ code: string }>(guest, SERVER_EVENTS.error);
    expect(missing.code).toBe('ROOM_NOT_FOUND');

    guest.emit(CLIENT_EVENTS.joinRoom, { code: session.code, name: 'Bea' });
    const room = await once<RoomSummary>(
      host,
      SERVER_EVENTS.roomState,
      (value) => value.players.length === 2,
    );
    expect(room.players.map((p) => p.name)).toEqual(['Ana', 'Bea']);
    expect(room.inviteUrl).toContain(session.code);

    // Un invitado no puede cambiar el juego
    guest.emit(CLIENT_EVENTS.selectGame, { game: 'darts' });
    const notHost = await once<{ code: string }>(guest, SERVER_EVENTS.error);
    expect(notHost.code).toBe('NOT_HOST');

    host.emit(CLIENT_EVENTS.selectGame, { game: 'quiz' });
    host.emit(CLIENT_EVENTS.updateSettings, {
      game: 'quiz',
      settings: { questionCount: 5, secondsPerQuestion: 5, categories: [] },
    });
    await once<RoomSummary>(
      guest,
      SERVER_EVENTS.roomState,
      (value) => value.settings.quiz.questionCount === 5,
    );

    host.emit(CLIENT_EVENTS.setReady, { ready: true });
    guest.emit(CLIENT_EVENTS.setReady, { ready: true });
    await once<RoomSummary>(host, SERVER_EVENTS.roomState, (value) =>
      value.players.every((player) => player.ready),
    );
    host.emit(CLIENT_EVENTS.startGame);
    const started = await once<{ game: string }>(guest, SERVER_EVENTS.gameStarted);
    expect(started.game).toBe('quiz');

    const question = await once<QuizPublicState>(
      guest,
      SERVER_EVENTS.gameState,
      (value) => value.game === 'quiz' && value.phase === 'question',
    );
    expect(question.question?.answers).toHaveLength(4);
    expect(question.correctIndex).toBeNull();

    host.emit(CLIENT_EVENTS.gameAction, {
      type: 'quiz:answer',
      questionIndex: question.questionIndex,
      answerIndex: 0,
    });
    guest.emit(CLIENT_EVENTS.gameAction, {
      type: 'quiz:answer',
      questionIndex: question.questionIndex,
      answerIndex: 1,
    });

    const reveal = await once<QuizPublicState>(
      host,
      SERVER_EVENTS.gameState,
      (value) => value.game === 'quiz' && value.phase === 'reveal',
    );
    expect(reveal.correctIndex).not.toBeNull();
    expect(reveal.breakdown).toHaveLength(2);
    expect(reveal.scoreboard).toHaveLength(2);
  }, 25000);

  it('recupera la sesion al reconectar con el token guardado', async () => {
    const host = connect();
    const guest = connect();
    await once(host, 'connect');
    await once(guest, 'connect');

    host.emit(CLIENT_EVENTS.createRoom, { name: 'Host' });
    const session = await once<{ code: string; token: string }>(host, SERVER_EVENTS.session);
    guest.emit(CLIENT_EVENTS.joinRoom, { code: session.code, name: 'Invitado' });
    const guestSession = await once<{ token: string; playerId: string }>(
      guest,
      SERVER_EVENTS.session,
    );

    guest.close();
    await once<RoomSummary>(host, SERVER_EVENTS.roomState, (value) =>
      value.players.some((p) => p.connection === 'disconnected'),
    );

    const reconnected = connect();
    await once(reconnected, 'connect');

    // Los dos eventos llegan en la misma respuesta: hay que escuchar antes de emitir.
    const restoredPromise = once<{ playerId: string }>(reconnected, SERVER_EVENTS.session);
    const statePromise = once<RoomSummary>(reconnected, SERVER_EVENTS.roomState, (value) =>
      value.players.every((p) => p.connection === 'connected'),
    );
    reconnected.emit(CLIENT_EVENTS.rejoin, { code: session.code, token: guestSession.token });

    const restored = await restoredPromise;
    expect(restored.playerId).toBe(guestSession.playerId);
    const state = await statePromise;
    expect(state.players).toHaveLength(2);

    reconnected.emit(CLIENT_EVENTS.rejoin, { code: session.code, token: 'token-inventado-12345' });
    const expired = await once<{ code: string }>(reconnected, SERVER_EVENTS.error);
    expect(expired.code).toBe('SESSION_EXPIRED');
  }, 25000);

  it('abandona la sala anterior al reutilizar un socket y revoca la conexion reemplazada', async () => {
    const original = connect();
    await once(original, 'connect');
    original.emit(CLIENT_EVENTS.createRoom, { name: 'Primero' });
    const first = await once<{ code: string; token: string; playerId: string }>(
      original,
      SERVER_EVENTS.session,
    );

    original.emit(CLIENT_EVENTS.createRoom, { name: 'Segundo' });
    const second = await once<{ code: string; token: string }>(original, SERVER_EVENTS.session);
    expect(second.code).not.toBe(first.code);
    expect(manager.get(first.code)?.playerCount).toBe(0);

    const replacement = connect();
    await once(replacement, 'connect');
    const replaced = once(original, SERVER_EVENTS.sessionReplaced);
    const restored = once<{ playerId: string }>(replacement, SERVER_EVENTS.session);
    replacement.emit(CLIENT_EVENTS.rejoin, { code: second.code, token: second.token });
    await restored;
    await replaced;

    original.emit(CLIENT_EVENTS.gameAction, {
      type: 'quiz:answer',
      questionIndex: 0,
      answerIndex: 0,
    });
    const unauthorized = await once<{ code: string }>(original, SERVER_EVENTS.error);
    expect(unauthorized.code).toBe('NOT_IN_ROOM');
  }, 25000);

  it('sincroniza el minigolf entre dos navegadores y valida los golpes', async () => {
    const host = connect();
    const guest = connect();
    await once(host, 'connect');
    await once(guest, 'connect');

    host.emit(CLIENT_EVENTS.createRoom, { name: 'Golfista1' });
    const session = await once<{ code: string; playerId: string }>(host, SERVER_EVENTS.session);
    guest.emit(CLIENT_EVENTS.joinRoom, { code: session.code, name: 'Golfista2' });
    await once<RoomSummary>(host, SERVER_EVENTS.roomState, (v) => v.players.length === 2);

    host.emit(CLIENT_EVENTS.selectGame, { game: 'golf' });
    host.emit(CLIENT_EVENTS.setReady, { ready: true });
    guest.emit(CLIENT_EVENTS.setReady, { ready: true });
    await once<RoomSummary>(host, SERVER_EVENTS.roomState, (value) =>
      value.players.every((player) => player.ready),
    );
    host.emit(CLIENT_EVENTS.startGame);
    const started = await once<{ game: string; state: GolfPublicState }>(
      guest,
      SERVER_EVENTS.gameStarted,
    );
    expect(started.game).toBe('golf');
    expect(started.state.level.id).toBe(1);
    expect(started.state.totalLevels).toBe(10);

    // Golpe invalido: potencia fuera de rango.
    host.emit(CLIENT_EVENTS.gameAction, { type: 'golf:shoot', angle: 0, power: 5, seq: 1 });
    const rejected = await once<{ code: string }>(host, SERVER_EVENTS.error);
    expect(rejected.code).toBe('INVALID_PAYLOAD');

    host.emit(CLIENT_EVENTS.gameAction, { type: 'golf:shoot', angle: 0, power: 0.5, seq: 1 });

    const hostSnapshot = await once<GolfSnapshot>(host, SERVER_EVENTS.gameSnapshot, (value) =>
      value.balls.some((ball) => Math.abs(ball.vx) > 1),
    );
    const guestSnapshot = await once<GolfSnapshot>(
      guest,
      SERVER_EVENTS.gameSnapshot,
      (value) => value.tick >= hostSnapshot.tick,
    );
    const hostBall = hostSnapshot.balls.find((b) => b.playerId === session.playerId)!;
    const guestBall = guestSnapshot.balls.find((b) => b.playerId === session.playerId)!;
    expect(hostBall.strokes).toBe(1);
    expect(guestBall.strokes).toBe(1);
    expect(guestBall.x).toBeGreaterThanOrEqual(hostBall.x);
    expect(guestSnapshot.balls).toHaveLength(2);
  }, 25000);
});
