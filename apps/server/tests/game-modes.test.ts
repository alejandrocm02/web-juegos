import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  GAME_MODE_CATALOG,
  assignTeams,
  isTeamMode,
  type GamePublicState,
  type MatchResult,
  type QuizPublicState,
  type DartsPublicState,
} from '@arcade/shared';
import { QuizGame } from '../src/games/quiz-game.js';
import { DartsGame } from '../src/games/darts-game.js';
import { GolfGame } from '../src/games/golf-game.js';
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
  const states: GamePublicState[] = [];
  const results: MatchResult[] = [];
  const ctx: GameContext = {
    players: () => players,
    broadcastState: (state) => states.push(state as GamePublicState),
    broadcastEvent: () => undefined,
    broadcastSnapshot: () => undefined,
    finish: (result) => results.push(result),
    toast: () => undefined,
  };
  return { ctx, states, results };
}

const last = <T extends GamePublicState>(states: GamePublicState[]) => states.at(-1) as T;

describe('catalogo de modos', () => {
  it('cada juego declara sus modos con identificadores unicos', () => {
    // Minimos por juego segun lo pedido: la arena solo tiene individual y
    // equipos, el resto llegan a tres o mas. Dardos incluye cricket y billar
    // incluye bola 8.
    const minimums: Record<string, number> = {
      quiz: 4,
      darts: 4,
      pool: 4,
      golf: 3,
      bowling: 3,
      karts: 3,
      arena: 2,
    };
    for (const [game, modes] of Object.entries(GAME_MODE_CATALOG)) {
      expect(modes.length, game).toBeGreaterThanOrEqual(minimums[game] ?? 2);
      expect(new Set(modes.map((mode) => mode.id)).size, game).toBe(modes.length);
      for (const mode of modes) {
        expect(mode.name.length, game + '/' + mode.id).toBeGreaterThan(2);
        expect(mode.rule.length, game + '/' + mode.id).toBeGreaterThan(10);
      }
    }
  });

  it('marca correctamente los modos por equipos', () => {
    expect(isTeamMode('quiz', 'equipos')).toBe(true);
    expect(isTeamMode('quiz', 'clasico')).toBe(false);
    expect(isTeamMode('pool', 'equipos')).toBe(true);
  });

  it('reparte los equipos de forma alterna y estable', () => {
    expect(assignTeams(['a', 'b', 'c', 'd'])).toEqual({
      a: 'rojo',
      b: 'azul',
      c: 'rojo',
      d: 'azul',
    });
  });
});

describe('modos del quiz', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('el modo rapido recorta el tiempo por pregunta a la mitad', () => {
    const { ctx, states } = makeContext();
    const game = new QuizGame(ctx, { ...DEFAULT_SETTINGS.quiz, mode: 'rapido' });
    game.start();
    vi.advanceTimersByTime(3200);
    const state = last<QuizPublicState>(states);
    expect(state.phase).toBe('question');
    // 15 s de base pasan a 7 s (redondeado) en el modo rapido.
    const remaining = state.deadline - Date.now();
    expect(remaining).toBeLessThanOrEqual(8000);
    expect(remaining).toBeGreaterThan(4000);
    game.dispose();
  });

  it('el modo eliminacion deja fuera a quien no contesta y cierra la partida', () => {
    const { ctx, states, results } = makeContext([roster[0]!, roster[1]!]);
    const game = new QuizGame(ctx, {
      ...DEFAULT_SETTINGS.quiz,
      mode: 'eliminacion',
      questionCount: 5,
    });
    game.start();
    vi.advanceTimersByTime(3200);
    expect(last<QuizPublicState>(states).phase).toBe('question');

    // Nadie responde: en eliminacion eso deja fuera a los dos.
    vi.advanceTimersByTime(16000);
    const board = last<QuizPublicState>(states).scoreboard;
    expect(board.every((row) => row.detail === 'Eliminado')).toBe(true);

    vi.advanceTimersByTime(6000);
    expect(results).toHaveLength(1);
    game.dispose();
  });

  it('un jugador eliminado ya no puede responder', () => {
    const { ctx, states } = makeContext([roster[0]!, roster[1]!]);
    const game = new QuizGame(ctx, {
      ...DEFAULT_SETTINGS.quiz,
      mode: 'eliminacion',
      questionCount: 5,
    });
    game.start();
    vi.advanceTimersByTime(3200);
    const first = last<QuizPublicState>(states);
    vi.advanceTimersByTime(16000); // expira: ambos quedan eliminados

    const before = last<QuizPublicState>(states).answeredPlayerIds.length;
    game.handleAction('a', {
      type: 'quiz:answer',
      questionIndex: first.questionIndex,
      answerIndex: 0,
    });
    expect(last<QuizPublicState>(states).answeredPlayerIds.length).toBe(before);
    game.dispose();
  });

  it('el modo equipos reparte a los jugadores y suma por equipo', () => {
    const { ctx, states } = makeContext();
    const game = new QuizGame(ctx, { ...DEFAULT_SETTINGS.quiz, mode: 'equipos' });
    game.start();
    vi.advanceTimersByTime(3200);
    const state = last<QuizPublicState>(states);
    expect(state.mode).toBe('equipos');
    expect(state.teams).toEqual({ a: 'rojo', b: 'azul', c: 'rojo' });
    game.dispose();
  });
});

describe('modos de dardos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('el modo 501 arranca en 501 y el 301 en 301', () => {
    const first = makeContext();
    const game501 = new DartsGame(first.ctx, { ...DEFAULT_SETTINGS.darts, mode: '501' });
    game501.start();
    expect(last<DartsPublicState>(first.states).scores.a).toBe(501);
    game501.dispose();

    const second = makeContext();
    const game301 = new DartsGame(second.ctx, { ...DEFAULT_SETTINGS.darts, mode: '301' });
    game301.start();
    expect(last<DartsPublicState>(second.states).scores.a).toBe(301);
    game301.dispose();
  });

  it('la puntuacion libre empieza en cero y suma en lugar de restar', () => {
    const { ctx, states } = makeContext();
    const game = new DartsGame(ctx, { ...DEFAULT_SETTINGS.darts, mode: 'libre' });
    game.start();
    expect(last<DartsPublicState>(states).scores.a).toBe(0);

    game.handleAction('a', { type: 'darts:throw', x: 0, y: 0 });
    expect(last<DartsPublicState>(states).scores.a).toBeGreaterThan(0);
    game.dispose();
  });
});

describe('modos del minigolf', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('menos-golpes juega un recorrido corto con menos golpes permitidos', () => {
    const { ctx } = makeContext();
    const game = new GolfGame(ctx, { ...DEFAULT_SETTINGS.golf, mode: 'menos-golpes' });
    game.start();
    const state = game.publicState();
    expect(state.totalLevels).toBe(5);
    expect(state.settings.maxStrokes).toBe(5);
    game.dispose();
  });

  it('contrarreloj recorta el tiempo por hoyo', () => {
    const { ctx } = makeContext();
    const game = new GolfGame(ctx, {
      ...DEFAULT_SETTINGS.golf,
      mode: 'contrarreloj',
      holeTimeLimitSeconds: 120,
    });
    game.start();
    expect(game.publicState().settings.holeTimeLimitSeconds).toBe(60);
    game.dispose();
  });

  it('el modo clasico conserva los diez hoyos y los ajustes originales', () => {
    const { ctx } = makeContext();
    const game = new GolfGame(ctx, { ...DEFAULT_SETTINGS.golf, mode: 'clasico' });
    game.start();
    const state = game.publicState();
    expect(state.totalLevels).toBe(10);
    expect(state.settings.maxStrokes).toBe(DEFAULT_SETTINGS.golf.maxStrokes);
    game.dispose();
  });
});
