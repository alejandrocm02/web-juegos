import type { GameId } from './constants.js';
import type { GolfSettings, MatchResult, ScoreRow } from './room.js';
import type { DartThrow, DartsTurnHistoryEntry } from './games/darts.js';
import type { PublicQuizQuestion, QuizAnswerBreakdown } from './games/quiz.js';
import type { CricketBoard } from './games/cricket.js';
import type { PoolBallState, PoolGroup } from './games/pool.js';
import type { GolfBallState, GolfFeedEvent, GolfHoleResult, GolfLevel } from './games/golf.js';
import type { BowlingBallState, BowlingPinState, BowlingScorecard } from './games/bowling.js';
import type { KartState, KartTrack } from './games/karts.js';
import type { ArenaFighterState, ArenaPickup, ArenaZone } from './games/arena.js';
import type { TeamId } from './games/modes.js';
import type {
  BlackjackCard,
  BlackjackPlayerHand,
  BlackjackRoundResult,
} from './games/blackjack.js';

/* --------------------------------- Quiz ---------------------------------- */

export type QuizPhase = 'countdown' | 'question' | 'reveal' | 'finished';

export interface QuizPublicState {
  game: 'quiz';
  phase: QuizPhase;
  mode: string;
  teams: Record<string, TeamId>;
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
  mode: string;
  teams: Record<string, TeamId>;
  order: string[];
  activePlayerId: string;
  scores: Record<string, number>;
  throwsLeft: number;
  currentThrows: DartThrow[];
  turnStartScore: number;
  history: DartsTurnHistoryEntry[];
  lastBust: boolean;
  /** Solo en el modo cricket: marcas y puntos por jugador. */
  cricket: CricketBoard | null;
  deadline: number;
}

/* --------------------------------- Billar -------------------------------- */

export type PoolPhase = 'aiming' | 'simulating' | 'finished';

export interface PoolPublicState {
  game: 'pool';
  phase: PoolPhase;
  mode: string;
  teams: Record<string, TeamId>;
  order: string[];
  activePlayerId: string;
  scores: Record<string, number>;
  balls: PoolBallState[];
  ballsLeft: number;
  /** Solo en bola 8: grupo asignado a cada jugador, null si la mesa sigue abierta. */
  groups: Record<string, PoolGroup | null>;
  /** true mientras nadie tiene grupo asignado. */
  tableOpen: boolean;
  /** Solo en bola 8: bando de cada jugador (con 3-5 jugadores se reparten). */
  sides: Record<string, TeamId>;
  lastShotSummary: string | null;
  deadline: number;
}

/* -------------------------------- Minigolf ------------------------------- */

export type GolfPhase = 'playing' | 'scoreboard' | 'finished';

export interface GolfPublicState {
  game: 'golf';
  phase: GolfPhase;
  mode: string;
  teams: Record<string, TeamId>;
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

/* --------------------------------- Bolos --------------------------------- */

export type BowlingPhase = 'aiming' | 'rolling' | 'resolving' | 'finished';

export interface BowlingPublicState {
  game: 'bowling';
  phase: BowlingPhase;
  mode: string;
  order: string[];
  activePlayerId: string;
  /** Tarjeta de puntuacion por jugador, ya resuelta con strikes y spares. */
  cards: Record<string, BowlingScorecard>;
  totalFrames: number;
  ball: BowlingBallState;
  pins: BowlingPinState[];
  /** Bolos derribados en el ultimo lanzamiento resuelto. */
  lastKnocked: number | null;
  lastEvent: 'strike' | 'spare' | 'open' | 'gutter' | null;
  teams: Record<string, TeamId>;
  teamScores: Record<TeamId, number>;
  deadline: number;
}

/* --------------------------------- Karts --------------------------------- */

export type KartsPhase = 'countdown' | 'racing' | 'finished';

export interface KartsPublicState {
  game: 'karts';
  phase: KartsPhase;
  mode: string;
  track: KartTrack;
  totalLaps: number;
  karts: KartState[];
  /** Milisegundos que faltan para la salida durante la cuenta atras. */
  countdownMs: number;
  raceMs: number;
  /** Momento de la proxima eliminacion en el modo eliminatoria, o null. */
  nextEliminationMs: number | null;
  teams: Record<string, TeamId>;
  deadline: number;
}

/* ----------------------------- Battle Royale ----------------------------- */

export type ArenaPhase = 'countdown' | 'fighting' | 'finished';

export interface ArenaPublicState {
  game: 'arena';
  phase: ArenaPhase;
  mode: string;
  fighters: ArenaFighterState[];
  pickups: ArenaPickup[];
  zone: ArenaZone;
  matchMs: number;
  countdownMs: number;
  /** Jugadores todavia en pie. */
  aliveCount: number;
  teams: Record<string, TeamId>;
  /** Ultimos sucesos de combate para el marcador lateral. */
  feed: { kind: string; playerId: string; targetId?: string; atMs: number }[];
  deadline: number;
}

/* ------------------------------- Blackjack ------------------------------- */

export type BlackjackPhase = 'playing' | 'dealer' | 'round-over' | 'finished';

export interface BlackjackPublicState {
  game: 'blackjack';
  phase: BlackjackPhase;
  mode: string;
  round: number;
  totalRounds: number;
  order: string[];
  activePlayerId: string;
  hands: Record<string, BlackjackPlayerHand>;
  /** La segunda carta es null hasta que el crupier revela su mano. */
  dealerCards: (BlackjackCard | null)[];
  dealerTotal: number | null;
  dealerSoft: boolean;
  points: Record<string, number>;
  roundResults: Record<string, BlackjackRoundResult>;
  deadline: number;
}

export type GamePublicState =
  | QuizPublicState
  | DartsPublicState
  | PoolPublicState
  | GolfPublicState
  | BowlingPublicState
  | KartsPublicState
  | ArenaPublicState
  | BlackjackPublicState;

export interface GameStartedPayload {
  game: GameId;
  state: GamePublicState;
}

export interface GameOverPayload {
  result: MatchResult;
}
