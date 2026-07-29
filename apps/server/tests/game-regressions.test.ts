import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PoolWorld } from '@arcade/game-engine';
import type { GamePublicState, MatchResult } from '@arcade/shared';
import { DartsGame } from '../src/games/darts-game.js';
import { PoolGame } from '../src/games/pool-game.js';
import { QuizGame } from '../src/games/quiz-game.js';
import type { GameContext, RoomPlayer } from '../src/rooms/types.js';

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

describe('regresiones de turnos y temporizadores', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('el billar no entrega al siguiente jugador los puntos de quien abandono durante el tiro', () => {
    const roster = [player('a'), player('b'), player('c')];
    const { ctx } = context(roster);
    const game = new PoolGame(ctx, { colorBalls: 9, tableFriction: 'normal' });
    vi.spyOn(PoolWorld.prototype, 'consumeOutcome').mockReturnValue({
      pocketedColors: [1],
      cuePocketed: false,
    });

    game.start();
    game.handleAction('a', { type: 'pool:shoot', angle: 0, power: 0.5 });
    roster.splice(0, 1);
    game.onPlayerLeft('a');
    (game as unknown as { finishShot(): void }).finishShot();

    expect(game.publicState().scores.b).toBe(0);
    expect(game.publicState().activePlayerId).toBe('b');
    game.dispose();
  });

  it('dardos conserva el jugador activo si abandona alguien anterior en el orden', () => {
    const roster = [player('a'), player('b'), player('c')];
    const { ctx } = context(roster);
    const game = new DartsGame(ctx, { startScore: 301, aimAssist: 'normal' });
    game.start();

    for (let index = 0; index < 3; index += 1) {
      game.handleAction('a', { type: 'darts:throw', x: 1.1, y: 1.1 });
    }
    vi.advanceTimersByTime(1500);
    expect(game.publicState().activePlayerId).toBe('b');

    roster.splice(0, 1);
    game.onPlayerLeft('a');
    expect(game.publicState().activePlayerId).toBe('b');
    game.dispose();
  });

  it('el quiz rechaza respuestas recibidas despues del limite aunque el timer aun no haya corrido', () => {
    const roster = [player('a'), player('b')];
    const { ctx } = context(roster);
    const game = new QuizGame(ctx, {
      questionCount: 5,
      secondsPerQuestion: 5,
      categories: [],
    });
    game.start();
    vi.advanceTimersByTime(3000);
    expect(game.publicState().phase).toBe('question');

    vi.advanceTimersByTime(5001);
    game.handleAction('a', {
      type: 'quiz:answer',
      questionIndex: 0,
      answerIndex: 0,
    });

    const state = game.publicState();
    expect(state.phase).toBe('reveal');
    expect(state.answeredPlayerIds).not.toContain('a');
    game.dispose();
  });
});
