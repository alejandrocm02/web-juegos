import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolWorld } from '@arcade/game-engine';
import { EIGHT_BALL, groupOfBall } from '@arcade/shared';
import type { GamePublicState, MatchResult, PoolBallState, PoolSettings } from '@arcade/shared';
import { PoolGame } from '../src/games/pool-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

const SETTINGS: PoolSettings = { mode: 'bola8', colorBalls: 9, tableFriction: 'normal' };

function player(id: string): RoomPlayer {
  return {
    id,
    token: 'token-' + id,
    name: id.toUpperCase(),
    color: '#38bdf8',
    icon: 'circle',
    isHost: id === 'a',
    ready: true,
    connection: 'connected',
    socketId: 'socket-' + id,
    joinedAt: id.charCodeAt(0),
    disconnectedAt: null,
  };
}

function context(roster: RoomPlayer[]) {
  const states: GamePublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => roster,
    broadcastState: (state) => states.push(state),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  return { ctx, states, results };
}

/** Ejecuta un tiro con un resultado concreto, sin depender de la fisica. */
function shoot(
  game: PoolGame,
  playerId: string,
  outcome: { pocketedColors: number[]; cuePocketed: boolean },
): void {
  vi.spyOn(PoolWorld.prototype, 'consumeOutcome').mockReturnValue(outcome);
  // El helper no simula: dejamos la mesa quieta para que el tiro se acepte.
  for (const ball of internalBalls(game)) {
    ball.vx = 0;
    ball.vy = 0;
  }
  game.handleAction(playerId, { type: 'pool:shoot', angle: 0, power: 0.5 });
  (game as unknown as { finishShot(): void }).finishShot();
}

/**
 * `world.state` devuelve copias redondeadas, asi que para preparar escenarios
 * hay que tocar el array interno de la simulacion.
 */
function internalBalls(game: PoolGame): PoolBallState[] {
  const world = (game as unknown as { world: PoolWorld }).world;
  return (world as unknown as { balls: PoolBallState[] }).balls;
}

/** Retira bolas de la mesa para simular el estado previo a un tiro. */
function clearBalls(game: PoolGame, ids: number[]): void {
  for (const ball of internalBalls(game)) if (ids.includes(ball.id)) ball.pocketed = true;
}

describe('bola 8 en el servidor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('coloca las quince bolas con la negra en el centro del triangulo', () => {
    const world = new PoolWorld(9, 'normal', true);
    // world.state incluye la blanca (id 0) ademas de las quince numeradas.
    const numbered = world.state.filter((ball) => ball.id > 0);
    expect(numbered).toHaveLength(EIGHT_BALL.totalBalls);
    const ids = numbered.map((ball) => ball.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids[14]).toBe(15);
    const black = numbered.find((ball) => ball.id === EIGHT_BALL.blackId);
    const others = numbered.filter((ball) => ball.id !== EIGHT_BALL.blackId);
    const meanY = others.reduce((sum, ball) => sum + ball.y, 0) / others.length;
    // La negra debe quedar practicamente en el eje central de la mesa.
    expect(Math.abs((black?.y ?? 0) - meanY)).toBeLessThan(1);
    expect(numbered.filter((ball) => groupOfBall(ball.id) === 'lisas')).toHaveLength(7);
    expect(numbered.filter((ball) => groupOfBall(ball.id) === 'rayadas')).toHaveLength(7);
  });

  it('empieza con la mesa abierta y sin grupos asignados', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    const state = game.publicState();
    expect(state.tableOpen).toBe(true);
    expect(state.groups.a).toBeNull();
    expect(state.groups.b).toBeNull();
    game.dispose();
  });

  it('asigna los dos grupos a la vez y conserva el turno del tirador', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [11], cuePocketed: false });
    const state = game.publicState();
    expect(state.groups.a).toBe('rayadas');
    expect(state.groups.b).toBe('lisas');
    expect(state.tableOpen).toBe(false);
    expect(state.activePlayerId).toBe('a');
    game.dispose();
  });

  it('la blanca embocada es falta y cede el turno sin asignar grupo', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [2], cuePocketed: true });
    const state = game.publicState();
    expect(state.groups.a).toBeNull();
    expect(state.activePlayerId).toBe('b');
    game.dispose();
  });

  it('gana quien emboca la negra despues de limpiar su grupo', () => {
    const roster = [player('a'), player('b')];
    const { ctx, results } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [1], cuePocketed: false });
    clearBalls(game, [1, 2, 3, 4, 5, 6, 7]);
    shoot(game, 'a', { pocketedColors: [EIGHT_BALL.blackId], cuePocketed: false });
    expect(results).toHaveLength(1);
    expect(results[0]?.winnerIds).toEqual(['a']);
    expect(results[0]?.rows[0]?.playerId).toBe('a');
    game.dispose();
  });

  it('pierde quien emboca la negra con bolas propias en la mesa', () => {
    const roster = [player('a'), player('b')];
    const { ctx, results } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [1], cuePocketed: false });
    shoot(game, 'a', { pocketedColors: [EIGHT_BALL.blackId], cuePocketed: false });
    expect(results).toHaveLength(1);
    expect(results[0]?.winnerIds).toEqual(['b']);
    game.dispose();
  });

  it('con tres jugadores reparte dos bandos que comparten grupo y victoria', () => {
    const roster = [player('a'), player('b'), player('c')];
    const { ctx, results } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [1], cuePocketed: false });
    const state = game.publicState();
    // Los bandos alternan: a y c contra b.
    expect(state.groups.a).toBe('lisas');
    expect(state.groups.c).toBe('lisas');
    expect(state.groups.b).toBe('rayadas');
    clearBalls(game, [1, 2, 3, 4, 5, 6, 7]);
    shoot(game, 'a', { pocketedColors: [EIGHT_BALL.blackId], cuePocketed: false });
    expect(results[0]?.winnerIds.sort()).toEqual(['a', 'c']);
    game.dispose();
  });

  it('embocar bolas del rival cede el turno', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, SETTINGS);
    game.start();
    shoot(game, 'a', { pocketedColors: [1], cuePocketed: false });
    shoot(game, 'a', { pocketedColors: [9], cuePocketed: false });
    expect(game.publicState().activePlayerId).toBe('b');
    game.dispose();
  });

  it('el modo casual sigue puntuando por bolas y no asigna grupos', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, { ...SETTINGS, mode: 'clasico' });
    game.start();
    shoot(game, 'a', { pocketedColors: [1, 2], cuePocketed: false });
    const state = game.publicState();
    expect(state.scores.a).toBe(2);
    expect(state.tableOpen).toBe(false);
    expect(state.activePlayerId).toBe('b');
    game.dispose();
  });
});
