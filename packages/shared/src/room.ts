import type { GameId, PlayerIcon } from './constants.js';
import type {
  BowlingMode,
  KartsMode,
  DartsMode,
  GolfMode,
  PoolMode,
  QuizMode,
  TeamId,
} from './games/modes.js';

export type ConnectionState = 'connected' | 'disconnected';

export interface PublicPlayer {
  id: string;
  name: string;
  color: string;
  icon: PlayerIcon;
  isHost: boolean;
  ready: boolean;
  connection: ConnectionState;
  joinedAt: number;
  /** Solo se rellena en los modos por equipos. */
  team?: TeamId;
}

export type RoomPhase = 'lobby' | 'playing' | 'results';

/** Configuraciones por juego. Se bloquean al iniciar la partida. */
export interface QuizSettings {
  mode: QuizMode;
  questionCount: number;
  secondsPerQuestion: number;
  categories: string[];
}

export interface DartsSettings {
  mode: DartsMode;
  aimAssist: 'facil' | 'normal' | 'dificil';
}

export interface PoolSettings {
  mode: PoolMode;
  colorBalls: number;
  tableFriction: 'lenta' | 'normal' | 'rapida';
}

export interface GolfSettings {
  mode: GolfMode;
  ballCollisions: boolean;
  holeTimeLimitSeconds: 60 | 90 | 120;
  maxStrokes: 8 | 10 | 12;
  autoResetOutOfBounds: boolean;
  outOfBoundsPenalty: boolean;
}

export interface BowlingSettings {
  mode: BowlingMode;
  /** Desviacion que aplica el servidor al lanzamiento, como en dardos. */
  precision: 'facil' | 'normal' | 'dificil';
}

export interface KartsSettings {
  mode: KartsMode;
  /** Identificador del circuito elegido. */
  track: string;
  laps: 2 | 3 | 5;
}

export interface GameSettings {
  quiz: QuizSettings;
  darts: DartsSettings;
  pool: PoolSettings;
  golf: GolfSettings;
  bowling: BowlingSettings;
  karts: KartsSettings;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quiz: {
    mode: 'clasico',
    questionCount: 10,
    secondsPerQuestion: 15,
    categories: [],
  },
  darts: { mode: '301', aimAssist: 'normal' },
  pool: { mode: 'clasico', colorBalls: 9, tableFriction: 'normal' },
  bowling: { mode: 'individual', precision: 'normal' },
  karts: { mode: 'rapida', track: 'ovalo', laps: 3 },
  golf: {
    mode: 'clasico',
    ballCollisions: true,
    holeTimeLimitSeconds: 90,
    maxStrokes: 10,
    autoResetOutOfBounds: true,
    outOfBoundsPenalty: true,
  },
};

export interface RoomSummary {
  code: string;
  phase: RoomPhase;
  selectedGame: GameId;
  players: PublicPlayer[];
  hostId: string;
  settings: GameSettings;
  inviteUrl: string;
  maxPlayers: number;
  minPlayers: number;
  createdAt: number;
}

export interface ScoreRow {
  playerId: string;
  name: string;
  color: string;
  icon: PlayerIcon;
  score: number;
  detail?: string;
  rank: number;
  tied: boolean;
}

export interface MatchResult {
  game: GameId;
  rows: ScoreRow[];
  winnerIds: string[];
  finishedAt: number;
  extra?: Record<string, unknown>;
}
