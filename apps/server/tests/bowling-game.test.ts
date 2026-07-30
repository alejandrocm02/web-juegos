import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOWLING_LANE,
  DEFAULT_SETTINGS,
  type BowlingPublicState,
  type MatchResult,
} from '@arcade/shared';
import { BowlingWorld } from '@arcade/game-engine';
import { BowlingGame } from '../src/games/bowling-game.js';
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
  const states: BowlingPublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state as BowlingPublicState),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  return { ctx, states, results };
}

describe('simulacion de la pista', () => {
  it('un lanzamiento centrado y potente derriba bolos', () => {
    const world = new BowlingWorld();
    expect(world.roll(0, 1, 0)).toBe(true);
    for (let i = 0; i < 60 * 20 && !world.settled(); i++) world.step(1 / 60);
    expect(world.settled()).toBe(true);
    expect(world.knockedCount()).toBeGreaterThan(0);
  });

  it('la canaleta no derriba ningun bolo', () => {
    const world = new BowlingWorld();
    world.roll(-1, 1, -1);
    for (let i = 0; i < 60 * 20 && !world.settled(); i++) world.step(1 / 60);
    expect(world.state.ball.gutter).toBe(true);
    expect(world.knockedCount()).toBe(0);
  });

  it('no permite lanzar mientras la bola rueda', () => {
    const world = new BowlingWorld();
    world.roll(0, 0.8, 0);
    world.step(1 / 60);
    expect(world.roll(0, 0.8, 0)).toBe(false);
  });

  it('la bola nunca se sale de la pista', () => {
    const world = new BowlingWorld();
    world.roll(0.9, 1, 1);
    for (let i = 0; i < 60 * 20 && !world.settled(); i++) {
      world.step(1 / 60);
      const { ball } = world.state;
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThanOrEqual(BOWLING_LANE.width);
    }
  });

  it('el efecto curva la trayectoria hacia el lado indicado', () => {
    const run = (spin: number) => {
      const world = new BowlingWorld();
      world.roll(0, 0.8, spin);
      for (let i = 0; i < 90; i++) world.step(1 / 60);
      return world.state.ball.x;
    };
    expect(run(1)).toBeGreaterThan(run(-1));
  });

  it('prepareNextRoll conserva solo los bolos en pie', () => {
    const world = new BowlingWorld();
    world.roll(0, 1, 0);
    for (let i = 0; i < 60 * 20 && !world.settled(); i++) world.step(1 / 60);
    const standing = world.standingPins.length;
    world.prepareNextRoll();
    expect(world.pinCount).toBe(standing);
  });
});

describe('partida de bolos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reparte turnos y arranca en el primer frame', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, DEFAULT_SETTINGS.bowling);
    game.start();
    const state = states.at(-1)!;
    expect(state.order).toEqual(['a', 'b']);
    expect(state.activePlayerId).toBe('a');
    expect(state.totalFrames).toBe(10);
    expect(state.cards.a!.currentFrame).toBe(0);
    game.dispose();
  });

  it('el modo corto juega cinco frames', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, { ...DEFAULT_SETTINGS.bowling, mode: 'corta' });
    game.start();
    expect(states.at(-1)!.totalFrames).toBe(5);
    game.dispose();
  });

  it('el modo equipos reparte a los jugadores', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, { ...DEFAULT_SETTINGS.bowling, mode: 'equipos' });
    game.start();
    expect(states.at(-1)!.teams).toEqual({ a: 'rojo', b: 'azul' });
    game.dispose();
  });

  it('ignora los lanzamientos de quien no tiene el turno', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, DEFAULT_SETTINGS.bowling);
    game.start();
    const before = states.length;
    game.handleAction('b', { type: 'bowling:roll', aim: 0, power: 0.8, spin: 0 });
    expect(states.length).toBe(before);
    game.dispose();
  });

  it('resuelve un lanzamiento completo y anota los bolos derribados', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, DEFAULT_SETTINGS.bowling);
    game.start();
    game.handleAction('a', { type: 'bowling:roll', aim: 0, power: 1, spin: 0 });
    expect(states.at(-1)!.phase).toBe('rolling');

    // Se avanza solo hasta que la tirada se resuelve: al empezar el turno
    // siguiente el marcador de "ultimo lanzamiento" vuelve a limpiarse.
    vi.advanceTimersByTime(15000);
    const resolved = states.findLast((state) => state.phase === 'resolving');
    expect(resolved, 'la tirada deberia haberse resuelto').toBeDefined();
    expect(resolved!.lastKnocked).not.toBeNull();
    expect(resolved!.lastEvent).not.toBeNull();
    expect(resolved!.cards.a!.frames[0]!.rolls.length).toBeGreaterThan(0);

    // Y la tirada queda registrada en la tarjeta aunque avance el turno.
    vi.advanceTimersByTime(4000);
    expect(states.at(-1)!.cards.a!.frames[0]!.rolls.length).toBeGreaterThan(0);
    game.dispose();
  });

  it('al abandonar un jugador se libera su turno sin dejarlo colgado', () => {
    const { ctx, states } = makeContext();
    const game = new BowlingGame(ctx, DEFAULT_SETTINGS.bowling);
    game.start();
    game.onPlayerLeft('a');
    const state = states.at(-1)!;
    expect(state.order).toEqual(['b']);
    expect(state.activePlayerId).toBe('b');
    game.dispose();
  });
});
