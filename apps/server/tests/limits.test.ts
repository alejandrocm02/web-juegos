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
  /**
   * Regresion: la cuota contaba salas existentes, no salas en uso.
   *
   * Una sala vacia sobrevive ROOM_EMPTY_TTL_SECONDS por si alguien vuelve, asi
   * que encadenar partidas desde el mismo sitio agotaba el cupo aunque en ningun
   * momento hubiera mas de una sala con gente dentro. Se detecto porque tumbo la
   * novena prueba de extremo a extremo, pero fuera de los tests era peor: todo un
   * NAT domestico o de oficina comparte una sola IP publica.
   */
  it('crear una sala tras otra no agota el cupo: las vacias no cuentan', async () => {
    server = await startServer();
    const socket = server.connect();
    await once(socket, 'connect');

    const codes: string[] = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP + 6; i += 1) {
      socket.emit(CLIENT_EVENTS.createRoom, { name: 'Jugador' + i });
      const session = await once<{ code: string }>(socket, SERVER_EVENTS.session);
      codes.push(session.code);
    }
    // Todas distintas y ninguna rechazada: solo una tenia gente en cada momento.
    expect(new Set(codes).size).toBe(MAX_ROOMS_PER_IP + 6);
  });

  it('rechaza pasar del cupo de salas con gente dentro', async () => {
    server = await startServer();

    // Un socket por sala, para que todas queden ocupadas a la vez.
    for (let i = 0; i < MAX_ROOMS_PER_IP; i += 1) {
      const socket = server.connect();
      await once(socket, 'connect');
      socket.emit(CLIENT_EVENTS.createRoom, { name: 'Jugador' + i });
      await once(socket, SERVER_EVENTS.session);
    }

    const extra = server.connect();
    await once(extra, 'connect');
    const rejected = once<AppError>(extra, SERVER_EVENTS.error);
    extra.emit(CLIENT_EVENTS.createRoom, { name: 'UnaMas' });
    expect((await rejected).code).toBe('SERVER_BUSY');
  });

  /**
   * Regresion del mismo fallo por otra via.
   *
   * Cerrar la pestana no borra al jugador: conserva la plaza durante
   * RECONNECT_GRACE_SECONDS por si vuelve. Contando plazas en vez de conexiones,
   * una sala abandonada seguia ocupando cupo minuto y medio, que es lo que
   * encadenaba los fallos entre pruebas de extremo a extremo.
   */
  it('una sala abandonada al cerrar la pestana deja de contar', async () => {
    server = await startServer();
    const abandonados = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP; i += 1) {
      const socket = server.connect();
      await once(socket, 'connect');
      socket.emit(CLIENT_EVENTS.createRoom, { name: 'Jugador' + i });
      await once(socket, SERVER_EVENTS.session);
      abandonados.push(socket);
    }

    // Se cierran todas las conexiones, sin avisar de que se abandona la sala.
    for (const socket of abandonados) socket.close();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const extra = server.connect();
    await once(extra, 'connect');
    const sesion = once(extra, SERVER_EVENTS.session);
    extra.emit(CLIENT_EVENTS.createRoom, { name: 'Despues del cierre' });
    expect(await sesion).toBeDefined();
  });

  it('al vaciarse una sala se libera su hueco', async () => {
    server = await startServer();
    const ocupados = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP; i += 1) {
      const socket = server.connect();
      await once(socket, 'connect');
      socket.emit(CLIENT_EVENTS.createRoom, { name: 'Jugador' + i });
      await once(socket, SERVER_EVENTS.session);
      ocupados.push(socket);
    }

    // El primero se va: su sala queda vacia y deja de contar de inmediato,
    // sin esperar a que el barredor la retire.
    ocupados[0]?.emit(CLIENT_EVENTS.leaveRoom);
    await new Promise((resolve) => setTimeout(resolve, 150));

    const extra = server.connect();
    await once(extra, 'connect');
    const sesion = once(extra, SERVER_EVENTS.session);
    extra.emit(CLIENT_EVENTS.createRoom, { name: 'Recien llegada' });
    expect(await sesion).toBeDefined();
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

  it('corta al llegar al techo de sockets', () => {
    const quota = new IpQuota();
    for (let i = 0; i < MAX_SOCKETS_PER_IP; i += 1) {
      expect(quota.addSocket('9.9.9.9')).toBe(true);
    }
    expect(quota.addSocket('9.9.9.9')).toBe(false);
    // El techo de una IP no afecta a las demas.
    expect(quota.addSocket('8.8.8.8')).toBe(true);
  });
});

describe('techo global de salas del proceso', () => {
  it('deja de crear salas al llegar al maximo y libera al retirarlas', () => {
    const manager = new RoomManager(
      () => ({ broadcast: () => undefined, direct: () => undefined }),
      2,
    );

    const first = manager.create();
    manager.create();
    expect(manager.hasCapacity).toBe(false);
    expect(() => manager.create()).toThrow(RoomCapacityError);

    manager.remove(first.code);
    expect(manager.hasCapacity).toBe(true);
    expect(() => manager.create()).not.toThrow();
  });

  it('solo cuenta como activas las salas con alguien conectado', () => {
    const manager = new RoomManager(() => ({
      broadcast: () => undefined,
      direct: () => undefined,
    }));
    const room = manager.create({ ownerIp: '10.0.0.7' });
    expect(manager.activeRoomsForIp('10.0.0.7')).toBe(0);

    const ana = room.addPlayer('Ana', 'socket-1');
    expect(manager.activeRoomsForIp('10.0.0.7')).toBe(1);
    // Otra IP no ve nada de esta.
    expect(manager.activeRoomsForIp('10.0.0.8')).toBe(0);

    // Se cae la conexion: conserva la plaza para reconectar, pero la sala ya no
    // esta en uso y no debe seguir ocupando cupo.
    room.markDisconnected(ana.id, 'socket-1');
    expect(manager.activeRoomsForIp('10.0.0.7')).toBe(0);

    // Y al volver, cuenta otra vez.
    room.attachSocket(ana.id, 'socket-2');
    expect(manager.activeRoomsForIp('10.0.0.7')).toBe(1);

    room.removePlayer(ana.id);
    expect(manager.activeRoomsForIp('10.0.0.7')).toBe(0);
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
