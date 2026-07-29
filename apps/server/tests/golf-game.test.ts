import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfPublicState, MatchResult } from '@arcade/shared';
import { GolfGame } from '../src/games/golf-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

function player(id: string, name: string): RoomPlayer {
  return {
    id,
    token: 't-' + id,
    name,
    color: '#38bdf8',
    icon: 'circle',
    isHost: id === 'a',
    ready: true,
    connection: 'connected',
    socketId: 's-' + id,
    joinedAt: 0,
    disconnectedAt: null,
  };
}

const roster = [player('a', 'Ana'), player('b', 'Bea')];

function makeContext() {
  const states: GolfPublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => roster,
    broadcastState: (state) => states.push(state as GolfPublicState),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  return { ctx, states, results };
}

describe('partida completa de minigolf', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('recorre los 10 niveles y suma las puntuaciones al terminar el tiempo', () => {
    const { ctx, results } = makeContext();
    const game = new GolfGame(ctx, {
      ballCollisions: true,
      holeTimeLimitSeconds: 60,
      maxStrokes: 8,
      autoResetOutOfBounds: true,
      outOfBoundsPenalty: true,
    });

    game.start();
    expect(game.publicState().level.id).toBe(1);
    expect(game.publicState().totalLevels).toBe(10);

    // Cada nivel termina por tiempo (60s) mas la pantalla de clasificacion (6s).
    for (let level = 0; level < 10; level++) {
      vi.advanceTimersByTime(61_000);
      vi.advanceTimersByTime(6_500);
    }

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.game).toBe('golf');
    // 10 hoyos x 8 golpes maximos = 80 golpes por jugador.
    for (const row of result.rows) expect(row.score).toBe(80);
    expect(result.rows).toHaveLength(2);
    expect(result.winnerIds.length).toBeGreaterThanOrEqual(1);
    game.dispose();
  }, 60000);

  it('rechaza golpes fuera de rango y avisa al jugador', () => {
    const messages: string[] = [];
    const { ctx } = makeContext();
    const game = new GolfGame(
      { ...ctx, toast: (message) => messages.push(message) },
      {
        ballCollisions: false,
        holeTimeLimitSeconds: 90,
        maxStrokes: 10,
        autoResetOutOfBounds: true,
        outOfBoundsPenalty: true,
      },
    );
    game.start();

    game.handleAction('a', { type: 'golf:shoot', angle: 0, power: 0.6, seq: 1 });
    expect(game.publicState().lastSequences.a).toBe(1);
    vi.advanceTimersByTime(100);
    game.handleAction('a', { type: 'golf:shoot', angle: 0, power: 0.6, seq: 2 });
    expect(messages.some((m) => m.includes('mientras la bola se mueve'))).toBe(true);

    game.handleAction('intruso', { type: 'golf:shoot', angle: 0, power: 0.6, seq: 1 });
    expect(game.publicState().balls).toHaveLength(2);
    game.dispose();
  });

  it('el reinicio manual penaliza e invalida el hoyo en uno', () => {
    const { ctx } = makeContext();
    const game = new GolfGame(ctx, {
      ballCollisions: false,
      holeTimeLimitSeconds: 90,
      maxStrokes: 10,
      autoResetOutOfBounds: true,
      outOfBoundsPenalty: true,
    });
    game.start();
    game.handleAction('a', { type: 'golf:reset' });
    const ball = game.publicState().balls.find((b) => b.playerId === 'a')!;
    expect(ball.strokes).toBe(1);
    expect(ball.aceEligible).toBe(false);
    game.dispose();
  });
});
