import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PLAYERS } from '@arcade/shared';
import { Room } from '../src/rooms/room.js';
import { RoomManager } from '../src/rooms/manager.js';

function makeRoom() {
  const broadcast = vi.fn();
  const direct = vi.fn();
  return { room: new Room('TEST1', { broadcast, direct }), broadcast, direct };
}

describe('reglas de la sala', () => {
  let ctx: ReturnType<typeof makeRoom>;

  beforeEach(() => {
    ctx = makeRoom();
  });

  it('el primer jugador es el anfitrion', () => {
    const host = ctx.room.addPlayer('Ana', 's1');
    const guest = ctx.room.addPlayer('Bea', 's2');
    expect(host.isHost).toBe(true);
    expect(guest.isHost).toBe(false);
    expect(ctx.room.hostId).toBe(host.id);
  });

  it('detecta nombres duplicados ignorando acentos y mayusculas', () => {
    ctx.room.addPlayer('José', 's1');
    expect(ctx.room.hasName('jose')).toBe(true);
    expect(ctx.room.hasName('Josefa')).toBe(false);
  });

  it('se llena con cinco jugadores', () => {
    for (let i = 0; i < MAX_PLAYERS; i++) ctx.room.addPlayer('J' + i, 's' + i);
    expect(ctx.room.isFull).toBe(true);
    expect(ctx.room.playerCount).toBe(5);
  });

  it('no permite iniciar con menos de dos jugadores', () => {
    const ana = ctx.room.addPlayer('Ana', 's1');
    expect(ctx.room.canStart().ok).toBe(false);
    const bea = ctx.room.addPlayer('Bea', 's2');
    expect(ctx.room.canStart().ok).toBe(false);
    ctx.room.setReady(ana.id, true);
    ctx.room.setReady(bea.id, true);
    expect(ctx.room.canStart().ok).toBe(true);
  });

  it('bloquea la configuracion despues de empezar', () => {
    const ana = ctx.room.addPlayer('Ana', 's1');
    const bea = ctx.room.addPlayer('Bea', 's2');
    ctx.room.selectGame('golf');
    ctx.room.setReady(ana.id, true);
    ctx.room.setReady(bea.id, true);
    ctx.room.updateSettings('golf', {
      ballCollisions: false,
      holeTimeLimitSeconds: 60,
      maxStrokes: 8,
      autoResetOutOfBounds: false,
      outOfBoundsPenalty: false,
    });
    expect(ctx.room.summary().settings.golf.maxStrokes).toBe(8);

    expect(ctx.room.startGame().ok).toBe(true);
    ctx.room.updateSettings('golf', {
      ballCollisions: true,
      holeTimeLimitSeconds: 120,
      maxStrokes: 12,
      autoResetOutOfBounds: true,
      outOfBoundsPenalty: true,
    });
    expect(ctx.room.summary().settings.golf.maxStrokes).toBe(8);
    ctx.room.dispose();
  });

  it('promociona a otro anfitrion cuando el actual se va', () => {
    const host = ctx.room.addPlayer('Ana', 's1');
    const guest = ctx.room.addPlayer('Bea', 's2');
    ctx.room.removePlayer(host.id);
    expect(ctx.room.hostId).toBe(guest.id);
  });

  it('prefiere un anfitrion conectado y no transfiere el rol a un desconectado', () => {
    const host = ctx.room.addPlayer('Ana', 's1');
    const disconnected = ctx.room.addPlayer('Bea', 's2');
    const connected = ctx.room.addPlayer('Caro', 's3');
    ctx.room.markDisconnected(disconnected.id, 's2');
    expect(ctx.room.transferHost(host.id, disconnected.id)).toBe(false);
    ctx.room.removePlayer(host.id);
    expect(ctx.room.hostId).toBe(connected.id);
  });

  it('transfiere el rol de anfitrion solo desde el anfitrion actual', () => {
    const host = ctx.room.addPlayer('Ana', 's1');
    const guest = ctx.room.addPlayer('Bea', 's2');
    ctx.room.setReady(host.id, true);
    ctx.room.setReady(guest.id, true);
    expect(ctx.room.transferHost(guest.id, host.id)).toBe(false);
    expect(ctx.room.transferHost(host.id, guest.id)).toBe(true);
    expect(ctx.room.hostId).toBe(guest.id);
  });

  it('permite reconectar con el token y mantiene la plaza', () => {
    const player = ctx.room.addPlayer('Ana', 's1');
    ctx.room.markDisconnected(player.id);
    expect(ctx.room.summary().players[0]!.connection).toBe('disconnected');
    const found = ctx.room.findByToken(player.token);
    expect(found?.id).toBe(player.id);
    ctx.room.attachSocket(player.id, 's9');
    expect(ctx.room.summary().players[0]!.connection).toBe('connected');
  });

  it('ignora la desconexion del socket antiguo tras reconectar', () => {
    // Al recargar, el socket nuevo entra antes de que el servidor procese el
    // cierre del viejo: ese aviso tardio no debe tumbar al jugador.
    const player = ctx.room.addPlayer('Ana', 'socket-viejo');
    ctx.room.attachSocket(player.id, 'socket-nuevo');
    ctx.room.markDisconnected(player.id, 'socket-viejo');
    expect(ctx.room.summary().players[0]!.connection).toBe('connected');

    // El socket actual si puede marcarlo como desconectado.
    ctx.room.markDisconnected(player.id, 'socket-nuevo');
    expect(ctx.room.summary().players[0]!.connection).toBe('disconnected');
  });

  it('cancela la partida si quedan menos de dos jugadores', () => {
    const host = ctx.room.addPlayer('Ana', 's1');
    const guest = ctx.room.addPlayer('Bea', 's2');
    ctx.room.selectGame('quiz');
    ctx.room.setReady(host.id, true);
    ctx.room.setReady(guest.id, true);
    ctx.room.startGame();
    expect(ctx.room.currentPhase).toBe('playing');
    ctx.room.removePlayer(guest.id);
    expect(ctx.room.currentPhase).toBe('lobby');
    ctx.room.removePlayer(host.id);
    expect(ctx.room.isEmpty).toBe(true);
  });
});

describe('gestor de salas', () => {
  it('genera codigos unicos y limpia salas vacias caducadas', () => {
    const manager = new RoomManager(() => ({ broadcast: vi.fn(), direct: vi.fn() }));
    const a = manager.create();
    const b = manager.create();
    expect(a.code).not.toBe(b.code);
    expect(manager.get(a.code.toLowerCase())?.code).toBe(a.code);

    manager.sweep(Date.now() + 10 * 60_000);
    expect(manager.size).toBe(0);
    manager.stopSweeper();
  });
});
