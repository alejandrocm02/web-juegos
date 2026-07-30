import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARENA, DEFAULT_SETTINGS, type ArenaPublicState, type MatchResult } from '@arcade/shared';
import { ArenaGame } from '../src/games/arena-game.js';
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

const roster = [player('a', 'Ana'), player('b', 'Bea'), player('c', 'Caro')];

function makeContext(players: RoomPlayer[] = roster) {
  const states: ArenaPublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state as ArenaPublicState),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  return { ctx, states, results };
}

describe('partida de battle royale', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('empieza en cuenta atras con todos vivos y a maxima vida', () => {
    const { ctx, states } = makeContext();
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    const state = states.at(-1)!;
    expect(state.phase).toBe('countdown');
    expect(state.aliveCount).toBe(3);
    expect(state.fighters.every((fighter) => fighter.health === ARENA.maxHealth)).toBe(true);
    expect(state.zone.radius).toBe(ARENA.zoneStartRadius);
    game.dispose();
  });

  it('el combate arranca al terminar la cuenta atras', () => {
    const { ctx, states } = makeContext();
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    vi.advanceTimersByTime(3500);
    expect(states.at(-1)!.phase).toBe('fighting');
    game.dispose();
  });

  it('ignora la intencion durante la cuenta atras', () => {
    const { ctx } = makeContext();
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    const before = game.publicState().fighters.find((fighter) => fighter.playerId === 'a')!;
    game.handleAction('a', { type: 'arena:input', moveX: 1, moveY: 0, facing: 0, attack: true });
    vi.advanceTimersByTime(500);
    const after = game.publicState().fighters.find((fighter) => fighter.playerId === 'a')!;
    expect(after.x).toBe(before.x);
    game.dispose();
  });

  it('la zona se cierra con el paso del tiempo', () => {
    const { ctx } = makeContext();
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    vi.advanceTimersByTime(3500);
    const initial = game.publicState().zone.radius;
    vi.advanceTimersByTime(ARENA.zoneGraceMs + 30000);
    expect(game.publicState().zone.radius).toBeLessThan(initial);
    game.dispose();
  });

  it('el ritmo rapido cierra la zona antes que el lento', () => {
    const advance = (pace: 'lenta' | 'rapida') => {
      const { ctx } = makeContext();
      const game = new ArenaGame(ctx, { ...DEFAULT_SETTINGS.arena, zonePace: pace });
      game.start();
      vi.advanceTimersByTime(3500 + ARENA.zoneGraceMs + 40000);
      const radius = game.publicState().zone.radius;
      game.dispose();
      return radius;
    };
    expect(advance('rapida')).toBeLessThan(advance('lenta'));
  });

  it('el modo equipos reparte bandos y los expone', () => {
    const { ctx } = makeContext();
    const game = new ArenaGame(ctx, { ...DEFAULT_SETTINGS.arena, mode: 'equipos' });
    game.start();
    const state = game.publicState();
    expect(state.teams).toEqual({ a: 'rojo', b: 'azul', c: 'rojo' });
    expect(state.fighters.every((fighter) => fighter.team)).toBe(true);
    game.dispose();
  });

  it('sin objetos activados la arena no reparte ninguno', () => {
    const { ctx } = makeContext();
    const game = new ArenaGame(ctx, { ...DEFAULT_SETTINGS.arena, pickups: false });
    game.start();
    expect(game.publicState().pickups).toHaveLength(0);
    game.dispose();
  });

  it('con objetos activados aparecen en la arena', () => {
    const { ctx } = makeContext();
    const game = new ArenaGame(ctx, { ...DEFAULT_SETTINGS.arena, pickups: true });
    game.start();
    expect(game.publicState().pickups.length).toBe(ARENA.pickupCount);
    game.dispose();
  });

  it('un jugador eliminado queda como espectador y su intencion se ignora', () => {
    const { ctx } = makeContext([roster[0]!, roster[1]!, roster[2]!]);
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    vi.advanceTimersByTime(3500);

    // Abandonar equivale a caer: deja de estar vivo.
    game.onPlayerLeft('c');
    const state = game.publicState();
    expect(state.fighters.some((fighter) => fighter.playerId === 'c')).toBe(false);
    expect(state.aliveCount).toBe(2);

    // Y una intencion de un jugador que ya no esta no altera nada.
    game.handleAction('c', { type: 'arena:input', moveX: 1, moveY: 1, facing: 0, attack: true });
    expect(game.publicState().aliveCount).toBe(2);
    game.dispose();
  });

  it('termina cuando solo queda un jugador en pie y reparte clasificacion', () => {
    const { ctx, results } = makeContext([roster[0]!, roster[1]!]);
    const game = new ArenaGame(ctx, DEFAULT_SETTINGS.arena);
    game.start();
    vi.advanceTimersByTime(3500);
    game.onPlayerLeft('b');
    vi.advanceTimersByTime(200);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.game).toBe('arena');
    expect(result.winnerIds).toContain('a');
    game.dispose();
  });

  it('termina al agotarse el tiempo maximo aunque nadie muera', () => {
    const { ctx, results } = makeContext();
    const game = new ArenaGame(ctx, { ...DEFAULT_SETTINGS.arena, zonePace: 'lenta' });
    game.start();
    vi.advanceTimersByTime(3500 + ARENA.maxMatchMs + 1000);
    expect(results).toHaveLength(1);
    expect(results[0]!.rows).toHaveLength(3);
    game.dispose();
  }, 30000);
});
