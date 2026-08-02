import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type GamePublicState, type MatchResult } from '@arcade/shared';
import { TanksGame } from '../src/games/tanks-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

const players: RoomPlayer[] = ['Ana', 'Bea', 'Caro'].map((name, index) => ({
  id: String.fromCharCode(97 + index),
  token: 'token-' + index,
  name,
  color: index ? '#f00' : '#0ff',
  icon: index ? 'triangle' : 'circle',
  isHost: index === 0,
  ready: true,
  connection: 'connected',
  socketId: 'socket-' + index,
  joinedAt: index,
  disconnectedAt: null,
}));

function setup(settings = DEFAULT_SETTINGS.tanks, roster = players) {
  const states: GamePublicState[] = [];
  const events: unknown[] = [];
  const results: MatchResult[] = [];
  const toasts: string[] = [];
  const ctx: GameContext = {
    players: () => roster,
    broadcastState: (state) => states.push(state),
    broadcastEvent: (event) => events.push(event),
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: (message) => toasts.push(message),
  };
  const game = new TanksGame(ctx, settings);
  return { game, states, events, results, toasts };
}

describe('partida de Tanques', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('inicia la fase de apuntado tras la cuenta atrás', () => {
    const { game } = setup();
    game.start();
    expect(game.publicState().phase).toBe('countdown');
    vi.advanceTimersByTime(3_200);
    expect(game.publicState().phase).toBe('aiming');
    expect(game.publicState().activePlayerId).toBe('a');
    expect(game.publicState().tanks.find((tank) => tank.playerId === 'a')?.fuel).toBe(3);
    game.dispose();
  });

  it('solo permite mover y disparar al jugador activo', () => {
    const { game } = setup();
    game.start();
    vi.advanceTimersByTime(3_200);
    const before = game.publicState().tanks.find((tank) => tank.playerId === 'b')!.x;
    game.handleAction('b', { type: 'tanks:move', direction: -1 });
    expect(game.publicState().tanks.find((tank) => tank.playerId === 'b')?.x).toBe(before);
    game.handleAction('a', { type: 'tanks:move', direction: 1 });
    expect(game.publicState().tanks.find((tank) => tank.playerId === 'a')?.fuel).toBe(2);
    game.handleAction('a', { type: 'tanks:fire', angle: -Math.PI / 4, power: 0.7 });
    expect(game.publicState().phase).toBe('projectile');
    expect(game.publicState().projectile?.ownerId).toBe('a');
    game.dispose();
  });

  it('configura Blitz con menos vida y turnos más cortos', () => {
    const { game } = setup({ ...DEFAULT_SETTINGS.tanks, mode: 'blitz' });
    expect(game.publicState().turnDurationMs).toBe(18_000);
    expect(game.publicState().tanks.every((tank) => tank.health === 70)).toBe(true);
    game.dispose();
  });

  it('finaliza y premia al superviviente si el rival abandona', () => {
    const { game, results } = setup(DEFAULT_SETTINGS.tanks, players.slice(0, 2));
    game.start();
    vi.advanceTimersByTime(3_200);
    game.onPlayerLeft('b');
    expect(results).toHaveLength(1);
    expect(results[0]?.game).toBe('tanks');
    expect(results[0]?.winnerIds).toEqual(['a']);
    expect(game.publicState().phase).toBe('finished');
    game.dispose();
  });
});
