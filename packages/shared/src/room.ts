import type { GameId, PlayerIcon } from './constants.js';

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
}

export type RoomPhase = 'lobby' | 'playing' | 'results';

/** Configuraciones por juego. Se bloquean al iniciar la partida. */
export interface QuizSettings {
  questionCount: number;
  secondsPerQuestion: number;
  categories: string[];
}

export interface DartsSettings {
  startScore: 301;
  aimAssist: 'facil' | 'normal' | 'dificil';
}

export interface PoolSettings {
  colorBalls: number;
  tableFriction: 'lenta' | 'normal' | 'rapida';
}

export interface GolfSettings {
  ballCollisions: boolean;
  holeTimeLimitSeconds: 60 | 90 | 120;
  maxStrokes: 8 | 10 | 12;
  autoResetOutOfBounds: boolean;
  outOfBoundsPenalty: boolean;
}

export interface GameSettings {
  quiz: QuizSettings;
  darts: DartsSettings;
  pool: PoolSettings;
  golf: GolfSettings;
}

export const DEFAULT_SETTINGS: GameSettings = {
  quiz: {
    questionCount: 10,
    secondsPerQuestion: 15,
    categories: [],
  },
  darts: { startScore: 301, aimAssist: 'normal' },
  pool: { colorBalls: 9, tableFriction: 'normal' },
  golf: {
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
