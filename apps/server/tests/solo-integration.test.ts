import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AppError,
  type BlackjackPublicState,
  type MatchResult,
  type RoomSummary,
  type SoloOutcome,
  type SoloRecord,
} from '@arcade/shared';
import { createApp } from '../src/index.js';

let httpServer: Awaited<ReturnType<typeof createApp>>['httpServer'];
let ioServer: Awaited<ReturnType<typeof createApp>>['io'];
let url = '';
const clients: Socket[] = [];

/** Perfil anonimo distinto en cada prueba para no mezclar marcas. */
function profile(suffix: string): string {
  return 'perfil-test-' + suffix;
}

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
    }, 25000);
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
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address() as AddressInfo;
  url = 'http://127.0.0.1:' + address.port;
});

afterAll(async () => {
  for (const client of clients) client.close();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('recorrido completo del modo individual', () => {
  it('crea una practica, la juega entera y guarda la marca personal', async () => {
    const player = connect();
    await once(player, 'connect');

    const roomPromise = once<RoomSummary>(player, SERVER_EVENTS.roomState);
    player.emit(CLIENT_EVENTS.createSoloRoom, {
      name: 'Alejandro',
      profileId: profile('blackjack'),
      game: 'blackjack',
      config: { botCount: 0, botDifficulty: 'normal' },
    });

    const room = await roomPromise;
    expect(room.solo).toBe(true);
    expect(room.minPlayers).toBe(1);
    expect(room.players).toHaveLength(1);
    // Sin gente a la que invitar no se publica enlace.
    expect(room.solo).toBe(true);
    // El unico jugador entra ya preparado: no hay a quien esperar.
    expect(room.players[0]!.ready).toBe(true);

    // Tres rondas es la partida mas corta: el crupier y los descansos entre
    // rondas los controla el servidor, asi que la prueba termina sola.
    player.emit(CLIENT_EVENTS.updateSettings, {
      game: 'blackjack',
      settings: { mode: 'clasico', rounds: 3 },
    });
    await once<RoomSummary>(
      player,
      SERVER_EVENTS.roomState,
      (summary) => summary.settings.blackjack.rounds === 3,
    );

    // El jugador se planta en cuanto le toca: la mano concreta da igual, lo
    // que se comprueba es que la partida llega al final y deja marca. El
    // oyente se registra antes de arrancar para no perder el primer turno, que
    // llega inmediatamente después de `game:started`.
    const myId = room.players[0]!.id;
    const stand = (state: BlackjackPublicState) => {
      if (state.game !== 'blackjack' || state.phase !== 'playing') return;
      if (state.activePlayerId !== myId) return;
      player.emit(CLIENT_EVENTS.gameAction, { type: 'blackjack:stand' });
    };
    player.on(SERVER_EVENTS.gameState, stand);
    player.on(SERVER_EVENTS.gameStarted, (payload: { state: BlackjackPublicState }) =>
      stand(payload.state),
    );

    // El servidor calcula la marca justo detras del fin de partida, asi que
    // ambos oyentes se registran antes de empezar. Es lo mismo que hace el
    // cliente real, que los engancha al montar la aplicacion.
    const overPromise = once<{ result: MatchResult }>(player, SERVER_EVENTS.gameOver);
    const outcomePromise = once<SoloOutcome>(player, SERVER_EVENTS.soloOutcome);

    const started = once(player, SERVER_EVENTS.gameStarted);
    player.emit(CLIENT_EVENTS.startGame);
    await started;

    const over = await overPromise;
    expect(over.result.game).toBe('blackjack');
    expect(over.result.rows).toHaveLength(1);

    const outcome = await outcomePromise;
    expect(outcome.game).toBe('blackjack');
    // Primera partida de este perfil: siempre entra como marca.
    expect(outcome.improved).toBe(true);
    expect(outcome.previousValue).toBeNull();
    expect(outcome.record.plays).toBe(1);
    expect(outcome.record.value).toBe(outcome.value);

    // Y queda consultable para la proxima sesion.
    const records = once<{ records: SoloRecord[] }>(player, SERVER_EVENTS.soloRecords);
    player.emit(CLIENT_EVENTS.requestRecords, { profileId: profile('blackjack') });
    const stored = await records;
    expect(stored.records.some((record) => record.game === 'blackjack')).toBe(true);
  }, 40000);

  it('nadie puede colarse en una sala de practica ajena', async () => {
    const owner = connect();
    await once(owner, 'connect');
    const roomPromise = once<RoomSummary>(owner, SERVER_EVENTS.roomState);
    owner.emit(CLIENT_EVENTS.createSoloRoom, {
      name: 'Alejandro',
      profileId: profile('privado'),
      game: 'darts',
      config: { botCount: 0, botDifficulty: 'normal' },
    });
    const room = await roomPromise;

    const intruder = connect();
    await once(intruder, 'connect');
    const errorPromise = once<AppError>(intruder, SERVER_EVENTS.error);
    intruder.emit(CLIENT_EVENTS.joinRoom, { code: room.code, name: 'Intruso' });
    const error = await errorPromise;
    expect(error.code).toBe('SOLO_ROOM');
  }, 20000);

  it('rechaza configuraciones de practica invalidas', async () => {
    const player = connect();
    await once(player, 'connect');
    const errorPromise = once<AppError>(player, SERVER_EVENTS.error);
    player.emit(CLIENT_EVENTS.createSoloRoom, {
      name: 'Alejandro',
      // Identificador de perfil con caracteres no permitidos.
      profileId: 'perfil con espacios',
      game: 'karts',
      config: { botCount: 2, botDifficulty: 'normal' },
    });
    const error = await errorPromise;
    expect(error.code).toBe('INVALID_PAYLOAD');
  }, 20000);

  it('coloca rivales del servidor y bloquea su ajuste al empezar', async () => {
    const player = connect();
    await once(player, 'connect');
    const roomPromise = once<RoomSummary>(player, SERVER_EVENTS.roomState);
    player.emit(CLIENT_EVENTS.createSoloRoom, {
      name: 'Alejandro',
      profileId: profile('karts'),
      game: 'karts',
      config: { botCount: 2, botDifficulty: 'facil' },
    });
    const room = await roomPromise;
    expect(room.players.filter((entry) => entry.isBot)).toHaveLength(2);

    const updated = once<RoomSummary>(
      player,
      SERVER_EVENTS.roomState,
      (summary) => summary.soloConfig.botDifficulty === 'dificil',
    );
    player.emit(CLIENT_EVENTS.updateSoloConfig, { botCount: 4, botDifficulty: 'dificil' });
    const afterConfig = await updated;
    expect(afterConfig.players.filter((entry) => entry.isBot)).toHaveLength(4);

    const started = once(player, SERVER_EVENTS.gameStarted);
    player.emit(CLIENT_EVENTS.startGame);
    await started;

    const errorPromise = once<AppError>(player, SERVER_EVENTS.error);
    player.emit(CLIENT_EVENTS.updateSoloConfig, { botCount: 1, botDifficulty: 'facil' });
    const error = await errorPromise;
    expect(error.code).toBe('ALREADY_STARTED');
  }, 20000);
});
