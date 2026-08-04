import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { CLIENT_EVENTS, SERVER_EVENTS, type AppError, type RoomSummary } from '@arcade/shared';
import { createApp } from '../src/index.js';
import { IpQuota, MAX_ROOMS_PER_IP, MAX_SOCKETS_PER_IP } from '../src/security.js';
import { RoomCapacityError, RoomManager } from '../src/rooms/manager.js';

/**
 * Limites de recursos.
 *
 * Cubren dos huecos que el limitador por socket no tapaba: los eventos sin
 * payload, que no pasaban por el guardian y por tanto no gastaban cupo, y la
 * creacion de salas, que no tenia techo alguno pese a ser la operacion mas
 * cara del servidor (una partida en curso mantiene un bucle a 60 Hz).
 */

/**
 * Servidor propio por prueba.
 *
 * Las cuotas se llevan por proceso y por IP, y en los tests todos los clientes
 * comparten 127.0.0.1: reutilizar un servidor haria que una prueba consumiera
 * el cupo de la siguiente y el resultado dependiera del orden.
 */
async function startServer() {
  const app = await createApp();
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const url = 'http://127.0.0.1:' + (app.httpServer.address() as AddressInfo).port;
  const sockets: Socket[] = [];

  return {
    url,
    connect(): Socket {
      const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
      sockets.push(socket);
      return socket;
    },
    async close(): Promise<void> {
      for (const socket of sockets) socket.close();
      app.io.close();
      await new Promise<void>((resolve) => app.httpServer.close(() => resolve()));
    },
  };
}

type Server = Awaited<ReturnType<typeof startServer>>;
let server: Server | null = null;

afterEach(async () => {
  await server?.close();
  server = null;
});

function once<T>(socket: Socket, event: string, timeoutMs = 8000) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error('Tiempo agotado esperando ' + event));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

describe('limitador en eventos sin payload', () => {
  it('frena una rafaga de room:leave', async () => {
    server = await startServer();
    const socket = server.connect();
    await once(socket, 'connect');

    // `room:leave` no lleva payload y no tiene efecto fuera de una sala: sirve
    // para medir el limitador aislado de cualquier otra regla. Antes de este
    // cambio esquivaba el guardian y se podia repetir sin coste.
    const limited = once<AppError>(socket, SERVER_EVENTS.error);
    for (let i = 0; i < 200; i += 1) socket.emit(CLIENT_EVENTS.leaveRoom);

    expect((await limited).code).toBe('RATE_LIMITED');
  });

  it('frena una rafaga de room:start', async () => {
    server = await startServer();
    const socket = server.connect();
    await once(socket, 'connect');
    socket.emit(CLIENT_EVENTS.createRoom, { name: 'Ana' });
    await once(socket, SERVER_EVENTS.session);

    const errors: AppError[] = [];
    socket.on(SERVER_EVENTS.error, (error: AppError) => errors.push(error));
    for (let i = 0; i < 200; i += 1) socket.emit(CLIENT_EVENTS.startGame);
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Los primeros rechazos son por falta de jugadores; a partir del cupo, el
    // limitador toma el relevo y deja de evaluarse siquiera la regla del juego.
    expect(errors.some((error) => error.code === 'RATE_LIMITED')).toBe(true);
  });
});

describe('cuota de salas por direccion IP', () => {
  it('rechaza crear mas salas de las permitidas', async () => {
    server = await startServer();
    const socket = server.connect();
    await once(socket, 'connect');

    // Cada `room:create` abandona la sala anterior, pero esa sala sigue viva
    // hasta que el barredor la retira: ese es justo el hueco explotable.
    const codes: string[] = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP; i += 1) {
      socket.emit(CLIENT_EVENTS.createRoom, { name: 'Jugador' + i });
      const session = await once<{ code: string }>(socket, SERVER_EVENTS.session);
      codes.push(session.code);
    }
    expect(new Set(codes).size).toBe(MAX_ROOMS_PER_IP);

    const rejected = once<AppError>(socket, SERVER_EVENTS.error);
    socket.emit(CLIENT_EVENTS.createRoom, { name: 'UnaMas' });
    expect((await rejected).code).toBe('SERVER_BUSY');
  });
});

describe('contador de cuotas por IP', () => {
  it('cuenta y descuenta sockets sin bajar de cero', () => {
    const quota = new IpQuota();
    expect(quota.addSocket('1.2.3.4')).toBe(true);
    expect(quota.socketCount('1.2.3.4')).toBe(1);
    quota.removeSocket('1.2.3.4');
    expect(quota.socketCount('1.2.3.4')).toBe(0);
    // Un aviso de desconexion duplicado no debe dejar el contador en negativo:
    // eso concederia cupo infinito a esa IP.
    quota.removeSocket('1.2.3.4');
    expect(quota.socketCount('1.2.3.4')).toBe(0);
  });

  it('corta al llegar al techo de sockets y de salas', () => {
    const quota = new IpQuota();
    for (let i = 0; i < MAX_SOCKETS_PER_IP; i += 1) {
      expect(quota.addSocket('9.9.9.9')).toBe(true);
    }
    expect(quota.addSocket('9.9.9.9')).toBe(false);
    // El techo de una IP no afecta a las demas.
    expect(quota.addSocket('8.8.8.8')).toBe(true);

    for (let i = 0; i < MAX_ROOMS_PER_IP; i += 1) {
      expect(quota.addRoom('9.9.9.9')).toBe(true);
    }
    expect(quota.addRoom('9.9.9.9')).toBe(false);
    quota.removeRoom('9.9.9.9');
    expect(quota.addRoom('9.9.9.9')).toBe(true);
  });
});

describe('techo global de salas del proceso', () => {
  it('deja de crear salas al llegar al maximo y avisa al retirarlas', () => {
    const manager = new RoomManager(
      () => ({ broadcast: () => undefined, direct: () => undefined }),
      2,
    );
    const retiradas: string[] = [];
    manager.onRoomRemoved = (room) => retiradas.push(room.code);

    const first = manager.create();
    manager.create();
    expect(manager.hasCapacity).toBe(false);
    expect(() => manager.create()).toThrow(RoomCapacityError);

    manager.remove(first.code);
    expect(retiradas).toEqual([first.code]);
    // Liberado el hueco, vuelve a haber sitio.
    expect(manager.hasCapacity).toBe(true);
    expect(() => manager.create()).not.toThrow();
  });

  it('guarda la IP creadora para poder descontar la cuota al barrer', () => {
    const manager = new RoomManager(() => ({
      broadcast: () => undefined,
      direct: () => undefined,
    }));
    expect(manager.create({ ownerIp: '10.0.0.7' }).ownerIp).toBe('10.0.0.7');
    // Sin IP conocida (vias internas y tests) no rompe nada.
    expect(manager.create().ownerIp).toBeNull();
  });
});

describe('resumen de sala', () => {
  it('no publica enlace de invitacion: lo construye el navegador', async () => {
    server = await startServer();
    const socket = server.connect();
    await once(socket, 'connect');
    // `room:state` llega inmediatamente despues de `session`: hay que estar
    // escuchando antes de emitir o la difusion se pierde.
    const state = once<RoomSummary>(socket, SERVER_EVENTS.roomState);
    socket.emit(CLIENT_EVENTS.createRoom, { name: 'Ana' });
    expect(await state).not.toHaveProperty('inviteUrl');
  });
});
