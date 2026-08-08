import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  type AppError,
  type ChatMessage,
  type RoomSummary,
} from '@arcade/shared';
import { createApp } from '../src/index.js';

/**
 * Pruebas de abuso de la capa de sockets.
 *
 * Complementan a `limits.test.ts`, que ya cubre rafagas, cuotas por IP y el
 * techo de salas. Aqui se comprueban los casos de contenido: payloads enormes,
 * acciones fuera de sala, potencias imposibles, nombres invalidos y las
 * validaciones de torneo y chat.
 */

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
  url = 'http://127.0.0.1:' + (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const client of clients) client.close();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('resistencia de la capa de sockets', () => {
  it('descarta un payload desproporcionado sin tumbar la conexion', async () => {
    const socket = connect();
    socket.emit(CLIENT_EVENTS.createRoom, { name: 'Gordo' });
    await once<RoomSummary>(socket, SERVER_EVENTS.roomState);

    const rejected = once<AppError>(
      socket,
      SERVER_EVENTS.error,
      (error) => error.code === 'INVALID_PAYLOAD',
    );
    socket.emit(CLIENT_EVENTS.selectGame, { game: 'quiz', relleno: 'x'.repeat(20000) });
    await expect(rejected).resolves.toMatchObject({ code: 'INVALID_PAYLOAD' });
    expect(socket.connected).toBe(true);
  });

  it('un jugador que no es anfitrion no puede iniciar ni configurar', async () => {
    const host = connect();
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Anfitriona' });
    const created = await once<RoomSummary>(host, SERVER_EVENTS.roomState);

    const guest = connect();
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: 'Invitado' });
    await once<RoomSummary>(guest, SERVER_EVENTS.roomState, (room) => room.players.length === 2);

    const notHost = once<AppError>(
      guest,
      SERVER_EVENTS.error,
      (error) => error.code === 'NOT_HOST',
    );
    guest.emit(CLIENT_EVENTS.startGame);
    await expect(notHost).resolves.toMatchObject({ code: 'NOT_HOST' });

    const notHostSettings = once<AppError>(
      guest,
      SERVER_EVENTS.error,
      (error) => error.code === 'NOT_HOST',
    );
    guest.emit(CLIENT_EVENTS.selectGame, { game: 'darts' });
    await expect(notHostSettings).resolves.toMatchObject({ code: 'NOT_HOST' });

    // El juego elegido sigue siendo el del anfitrion.
    const room = manager.get(created.code);
    expect(room?.game).toBe('quiz');
  });

  it('rechaza una accion de juego sin estar en ninguna sala', async () => {
    const socket = connect();
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));

    const rejected = once<AppError>(
      socket,
      SERVER_EVENTS.error,
      (error) => error.code === 'NOT_IN_ROOM',
    );
    socket.emit(CLIENT_EVENTS.gameAction, {
      type: 'quiz:answer',
      questionIndex: 0,
      answerIndex: 0,
    });
    await expect(rejected).resolves.toMatchObject({ code: 'NOT_IN_ROOM' });
  });

  it('rechaza golpes de golf con potencia fuera de rango', async () => {
    const socket = connect();
    socket.emit(CLIENT_EVENTS.createRoom, { name: 'Tramposa' });
    await once<RoomSummary>(socket, SERVER_EVENTS.roomState);

    for (const power of [0, -5, 12, Number.NaN]) {
      const rejected = once<AppError>(
        socket,
        SERVER_EVENTS.error,
        (error) => error.code === 'INVALID_PAYLOAD',
      );
      socket.emit(CLIENT_EVENTS.gameAction, { type: 'golf:shoot', angle: 0, power, seq: 1 });
      await expect(rejected, 'potencia ' + String(power)).resolves.toMatchObject({
        code: 'INVALID_PAYLOAD',
      });
    }
  });

  it('rechaza un nombre vacio y uno repetido en la misma sala', async () => {
    const host = connect();
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Repetida' });
    const created = await once<RoomSummary>(host, SERVER_EVENTS.roomState);

    const guest = connect();
    const invalidName = once<AppError>(
      guest,
      SERVER_EVENTS.error,
      (error) => error.code === 'INVALID_PAYLOAD',
    );
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: '   ' });
    await expect(invalidName).resolves.toMatchObject({ code: 'INVALID_PAYLOAD' });

    const taken = once<AppError>(guest, SERVER_EVENTS.error, (e) => e.code === 'NAME_TAKEN');
    // Mayusculas y acentos no cuentan como nombre distinto.
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: 'repetída' });
    await expect(taken).resolves.toMatchObject({ code: 'NAME_TAKEN' });
  });

  it('el torneo lo monta el anfitrion y fija la primera prueba', async () => {
    const host = connect();
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Organiza' });
    const created = await once<RoomSummary>(host, SERVER_EVENTS.roomState);

    const guest = connect();
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: 'Compite' });
    await once<RoomSummary>(guest, SERVER_EVENTS.roomState, (room) => room.players.length === 2);

    // Un invitado no puede montarlo.
    const denied = once<AppError>(guest, SERVER_EVENTS.error, (e) => e.code === 'NOT_HOST');
    guest.emit(CLIENT_EVENTS.updateTournament, {
      enabled: true,
      settings: { games: ['darts', 'quiz', 'bowling'], preset: 'personalizado' },
    });
    await expect(denied).resolves.toMatchObject({ code: 'NOT_HOST' });

    const withTournament = once<RoomSummary>(
      host,
      SERVER_EVENTS.roomState,
      (room) => room.tournament !== null,
    );
    host.emit(CLIENT_EVENTS.updateTournament, {
      enabled: true,
      settings: { games: ['darts', 'quiz', 'bowling'], preset: 'personalizado' },
    });
    const state = await withTournament;

    // La primera prueba pasa a ser el juego seleccionado de la sala.
    expect(state.selectedGame).toBe('darts');
    expect(state.tournament?.games).toEqual(['darts', 'quiz', 'bowling']);
    expect(state.tournament?.finished).toBe(false);
    expect(state.tournament?.standings).toHaveLength(2);

    // Dos pruebas no llegan al minimo: el esquema lo rechaza.
    const tooShort = once<AppError>(host, SERVER_EVENTS.error, (e) => e.code === 'INVALID_PAYLOAD');
    host.emit(CLIENT_EVENTS.updateTournament, {
      enabled: true,
      settings: { games: ['quiz', 'darts'], preset: 'personalizado' },
    });
    await expect(tooShort).resolves.toMatchObject({ code: 'INVALID_PAYLOAD' });

    // Con torneo activo, cambiar de juego a mano no tiene efecto.
    const room = manager.get(created.code);
    room?.selectGame('golf');
    expect(room?.game).toBe('darts');
  });

  it('el chat llega a la sala, respeta el enfriamiento y se recupera al entrar', async () => {
    const host = connect();
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Habla' });
    const created = await once<RoomSummary>(host, SERVER_EVENTS.roomState);

    const first = once<ChatMessage>(host, SERVER_EVENTS.chatMessage);
    host.emit(CLIENT_EVENTS.sendChat, { text: '  hola   a todos\n' });
    const message = await first;
    expect(message.text).toBe('hola a todos');
    expect(message.name).toBe('Habla');

    // Dos mensajes seguidos: el segundo cae por enfriamiento.
    const limited = once<AppError>(host, SERVER_EVENTS.error, (e) => e.code === 'RATE_LIMITED');
    host.emit(CLIENT_EVENTS.sendChat, { text: 'y otro mas' });
    await expect(limited).resolves.toMatchObject({ code: 'RATE_LIMITED' });

    // Quien entra despues recibe el hilo.
    const guest = connect();
    const history = once<{ messages: ChatMessage[] }>(guest, SERVER_EVENTS.chatHistory);
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: 'Escucha' });
    const received = await history;
    expect(received.messages.map((m) => m.text)).toEqual(['hola a todos']);
  });

  it('las reacciones solo aceptan el catalogo y avisan a toda la sala', async () => {
    const host = connect();
    host.emit(CLIENT_EVENTS.createRoom, { name: 'Reacciona' });
    const created = await once<RoomSummary>(host, SERVER_EVENTS.roomState);

    const guest = connect();
    guest.emit(CLIENT_EVENTS.joinRoom, { code: created.code, name: 'Observa' });
    await once<RoomSummary>(guest, SERVER_EVENTS.roomState, (room) => room.players.length === 2);

    // La reaccion de uno la ve el otro.
    const seen = once<{ reaction: string; name: string }>(guest, SERVER_EVENTS.chatReaction);
    host.emit(CLIENT_EVENTS.sendReaction, { reaction: 'aplauso' });
    await expect(seen).resolves.toMatchObject({ reaction: 'aplauso', name: 'Reacciona' });

    const invalid = once<AppError>(guest, SERVER_EVENTS.error, (e) => e.code === 'INVALID_PAYLOAD');
    guest.emit(CLIENT_EVENTS.sendReaction, { reaction: 'no-existe' });
    await expect(invalid).resolves.toMatchObject({ code: 'INVALID_PAYLOAD' });
  });
});
