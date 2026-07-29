import type { GameId } from './constants.js';
import type { GolfSettings, MatchResult, ScoreRow } from './room.js';
import type { DartThrow, DartsTurnHistoryEntry } from './games/darts.js';
import type { PublicQuizQuestion, QuizAnswerBreakdown } from './games/quiz.js';
import type { PoolBallState } from './games/pool.js';
import type { GolfBallState, GolfFeedEvent, GolfHoleResult, GolfLevel } from './games/golf.js';

/* --------------------------------- Quiz ---------------------------------- */

export type QuizPhase = 'countdown' | 'question' | 'reveal' | 'finished';

export interface QuizPublicState {
  game: 'quiz';
  phase: QuizPhase;
  question: PublicQuizQuestion | null;
  /** Marca de tiempo del servidor (ms epoch) en la que expira la fase actual. */
  deadline: number;
  answeredPlayerIds: string[];
  correctIndex: number | null;
  breakdown: QuizAnswerBreakdown[];
  scoreboard: ScoreRow[];
  questionIndex: number;
  totalQuestions: number;
}

/* --------------------------------- Dardos -------------------------------- */

export type DartsPhase = 'aiming' | 'resolving' | 'finished';

export interface DartsPublicState {
  game: 'darts';
  phase: DartsPhase;
  order: string[];
  activePlayerId: string;
  scores: Record<string, number>;
  throwsLeft: number;
  currentThrows: DartThrow[];
  turnStartScore: number;
  history: DartsTurnHistoryEntry[];
  lastBust: boolean;
  deadline: number;
}

/* --------------------------------- Billar -------------------------------- */

export type PoolPhase = 'aiming' | 'simulating' | 'finished';

export interface PoolPublicState {
  game: 'pool';
  phase: PoolPhase;
  order: string[];
  activePlayerId: string;
  scores: Record<string, number>;
  balls: PoolBallState[];
  ballsLeft: number;
  lastShotSummary: string | null;
  deadline: number;
}

/* -------------------------------- Minigolf ------------------------------- */

export type GolfPhase = 'playing' | 'scoreboard' | 'finished';

export interface GolfPublicState {
  game: 'golf';
  phase: GolfPhase;
  settings: GolfSettings;
  levelIndex: number;
  totalLevels: number;
  level: GolfLevel;
  balls: GolfBallState[];
  /** Ultima secuencia de golpe aceptada por jugador para restaurar el cliente al reconectar. */
  lastSequences: Record<string, number>;
  holeResults: GolfHoleResult[];
  /** Totales acumulados de golpes por jugador. */
  totals: Record<string, number>;
  totalTimeMs: Record<string, number>;
  aces: Record<string, number>;
  feed: GolfFeedEvent[];
  timeLeftMs: number;
  scoreboard: ScoreRow[];
  /** Marca de tiempo en la que termina la pantalla de clasificacion intermedia. */
  deadline: number;
}

export type GamePublicState =
  QuizPublicState | DartsPublicState | PoolPublicState | GolfPublicState;

export interface GameStartedPayload {
  game: GameId;
  state: GamePublicState;
}

export interface GameOverPayload {
  result: MatchResult;
}
