import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { CLIENT_EVENTS, type ClockSyncReply } from '@arcade/shared';
import { createApp } from '../src/index.js';

let httpServer: Awaited<ReturnType<typeof createApp>>['httpServer'];
let ioServer: Awaited<ReturnType<typeof createApp>>['io'];
let url = '';
const clients: Socket[] = [];

async function connect(): Promise<Socket> {
  const socket = ioClient(url, { transports: ['websocket'], forceNew: true });
  clients.push(socket);
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  return socket;
}

beforeAll(async () => {
  const app = await createApp();
  httpServer = app.httpServer;
  ioServer = app.io;
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = 'http://127.0.0.1:' + (httpServer.address() as AddressInfo).port;
});

afterAll(async () => {
  for (const client of clients) client.close();
  ioServer.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('sincronización de reloj', () => {
  it('responde con la hora del servidor, sin necesidad de estar en una sala', async () => {
    const socket = await connect();
    const before = Date.now();
    const reply = (await socket
      .timeout(2000)
      .emitWithAck(CLIENT_EVENTS.clockSync)) as ClockSyncReply;
    const after = Date.now();
    expect(reply.serverTime).toBeGreaterThanOrEqual(before);
    expect(reply.serverTime).toBeLessThanOrEqual(after);
  });

  it('no gasta el cupo de acciones de juego', async () => {
    const socket = await connect();
    // Mas peticiones de reloj que el limite general por ventana: ninguna debe
    // provocar RATE_LIMITED en las acciones que vengan detras.
    const errors: unknown[] = [];
    socket.on('app:error', (error) => errors.push(error));
    for (let i = 0; i < 8; i += 1) {
      await socket.timeout(2000).emitWithAck(CLIENT_EVENTS.clockSync);
    }
    expect(errors).toEqual([]);
  });

  it('deja de responder a quien satura el canal, sin cerrar la conexión', async () => {
    const socket = await connect();
    const replies = await Promise.allSettled(
      Array.from({ length: 40 }, () => socket.timeout(1500).emitWithAck(CLIENT_EVENTS.clockSync)),
    );
    const answered = replies.filter((reply) => reply.status === 'fulfilled').length;
    expect(answered).toBeGreaterThan(0);
    expect(answered).toBeLessThan(40);
    expect(socket.connected).toBe(true);
  });
});
