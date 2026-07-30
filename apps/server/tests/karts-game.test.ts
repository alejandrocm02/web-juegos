import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  KARTS_COUNTDOWN_MS,
  type KartsPublicState,
  type MatchResult,
} from '@arcade/shared';
import { KartsGame } from '../src/games/karts-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

function player(id: string, name: string): RoomPlayer {
  return {
    id,
    token: 't-' + id,
    name,
    color: '#fff',
    icon: 'circle',
    isHost: id === 'a',
    ready: true,
    connection: 'connected',
    socketId: 's-' + id,
    joinedAt: id.charCodeAt(0),
    disconnectedAt: null,
  };
}

const roster = [player('a', 'Ana'), player('b', 'Bea')];

function makeContext(players: RoomPlayer[] = roster) {
  const states: KartsPublicState[] = [];
  const results: MatchResult[] = [];
  const toasts: { message: string; playerId?: string }[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state as KartsPublicState),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: (message, playerId) => toasts.push({ message, playerId }),
  };
  return { ctx, states, results, toasts };
}

describe('carrera de karts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('empieza en cuenta atras y nadie corre todavia', () => {
    const { ctx, states } = makeContext();
    const game = new KartsGame(ctx, DEFAULT_SETTINGS.karts);
    game.start();
    const state = states.at(-1)!;
    expect(state.phase).toBe('countdown');
    expect(state.countdownMs).toBeGreaterThan(0);
    expect(state.karts).toHaveLength(2);
    expect(state.karts.every((kart) => kart.lap === 0)).toBe(true);
    game.dispose();
  });

  it('la carrera arranca al terminar la cuenta atras', () => {
    const { ctx, states } = makeContext();
    const game = new KartsGame(ctx, DEFAULT_SETTINGS.karts);
    game.start();
    vi.advanceTimersByTime(KARTS_COUNTDOWN_MS + 500);
    expect(states.at(-1)!.phase).toBe('racing');
    game.dispose();
  });

  it('ignora la conduccion durante la cuenta atras', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, DEFAULT_SETTINGS.karts);
    game.start();
    game.handleAction('a', { type: 'karts:input', throttle: 1, steer: 0, braking: false });
    vi.advanceTimersByTime(500);
    expect(game.publicState().karts.every((kart) => kart.speed === 0)).toBe(true);
    game.dispose();
  });

  it('acepta la conduccion una vez en carrera', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, DEFAULT_SETTINGS.karts);
    game.start();
    vi.advanceTimersByTime(KARTS_COUNTDOWN_MS + 100);
    game.handleAction('a', { type: 'karts:input', throttle: 1, steer: 0, braking: false });
    vi.advanceTimersByTime(600);
    const mine = game.publicState().karts.find((kart) => kart.playerId === 'a')!;
    expect(Math.abs(mine.speed)).toBeGreaterThan(0);
    game.dispose();
  });

  it('el circuito y las vueltas configurados llegan al estado publico', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, { ...DEFAULT_SETTINGS.karts, track: 'tecnico', laps: 5 });
    game.start();
    const state = game.publicState();
    expect(state.track.id).toBe('tecnico');
    expect(state.totalLaps).toBe(5);
    game.dispose();
  });

  it('el modo eliminatoria expone el tiempo hasta la proxima eliminacion', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, { ...DEFAULT_SETTINGS.karts, mode: 'eliminatoria' });
    game.start();
    expect(game.publicState().nextEliminationMs).not.toBeNull();
    game.dispose();
  });

  it('en carrera rapida los modos sin eliminacion no exponen contador', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, { ...DEFAULT_SETTINGS.karts, mode: 'rapida' });
    game.start();
    expect(game.publicState().nextEliminationMs).toBeNull();
    game.dispose();
  });

  it('abandonar retira el kart sin romper la carrera', () => {
    const { ctx } = makeContext();
    const game = new KartsGame(ctx, DEFAULT_SETTINGS.karts);
    game.start();
    vi.advanceTimersByTime(KARTS_COUNTDOWN_MS + 100);
    game.onPlayerLeft('b');
    expect(game.publicState().karts.map((kart) => kart.playerId)).toEqual(['a']);
    game.dispose();
  });

  it('la carrera termina al agotarse el tiempo maximo y reparte clasificacion', () => {
    const { ctx, results } = makeContext();
    const game = new KartsGame(ctx, { ...DEFAULT_SETTINGS.karts, laps: 5 });
    game.start();
    // Nadie conduce: se agota el limite y la carrera se cierra igualmente.
    vi.advanceTimersByTime(KARTS_COUNTDOWN_MS + 5 * 60 * 1000 + 1000);
    expect(results).toHaveLength(1);
    expect(results[0]!.game).toBe('karts');
    expect(results[0]!.rows).toHaveLength(2);
    expect(results[0]!.winnerIds.length).toBeGreaterThanOrEqual(1);
    game.dispose();
  }, 30000);
});
