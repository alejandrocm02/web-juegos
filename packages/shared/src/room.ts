import type { GameId, PlayerIcon } from './constants.js';
import type {
  ArenaMode,
  BowlingMode,
  KartsMode,
  DartsMode,
  GolfMode,
  PoolMode,
  QuizMode,
  TeamId,
  BlackjackMode,
  SonglessMode,
  AirHockeyMode,
  TableTennisMode,
  HeadSoccerMode,
  HeadBasketballMode,
  TanksMode,
} from './games/modes.js';
import type { TankMapId } from './games/tanks.js';
import type { SoloConfig } from './games/solo.js';

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
  /** true si lo controla el servidor en una sala de práctica. */
  isBot?: boolean;
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

export interface ArenaSettings {
  mode: ArenaMode;
  /** Velocidad a la que se cierra la zona. */
  zonePace: 'lenta' | 'normal' | 'rapida';
  pickups: boolean;
}

export interface BlackjackSettings {
  mode: BlackjackMode;
  rounds: 3 | 5 | 7;
}

export interface SonglessSettings {
  mode: SonglessMode;
  rounds: 5 | 7 | 10;
}

export interface AirHockeySettings {
  mode: AirHockeyMode;
  goalLimit: 5 | 7 | 9;
}

export interface TableTennisSettings {
  mode: TableTennisMode;
  pointsToWin: 7 | 11 | 15;
}

export interface HeadSoccerSettings {
  mode: HeadSoccerMode;
  goalLimit: 3 | 5 | 7;
}

export interface HeadBasketballSettings {
  mode: HeadBasketballMode;
  pointsToWin: 6 | 10 | 14;
}

export interface TanksSettings {
  mode: TanksMode;
  map: TankMapId;
}

export interface GameSettings {
  quiz: QuizSettings;
  darts: DartsSettings;
  pool: PoolSettings;
  golf: GolfSettings;
  bowling: BowlingSettings;
  karts: KartsSettings;
  arena: ArenaSettings;
  blackjack: BlackjackSettings;
  songless: SonglessSettings;
  'air-hockey': AirHockeySettings;
  'table-tennis': TableTennisSettings;
  'head-soccer': HeadSoccerSettings;
  'head-basketball': HeadBasketballSettings;
  tanks: TanksSettings;
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
  arena: { mode: 'individual', zonePace: 'normal', pickups: true },
  blackjack: { mode: 'clasico', rounds: 5 },
  songless: { mode: 'clasico', rounds: 7 },
  'air-hockey': { mode: 'clasico', goalLimit: 7 },
  'table-tennis': { mode: 'clasico', pointsToWin: 11 },
  'head-soccer': { mode: 'clasico', goalLimit: 5 },
  'head-basketball': { mode: 'clasico', pointsToWin: 10 },
  tanks: { mode: 'clasico', map: 'canon-carmesi' },
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
  /**
   * Resultado incluido en el mismo estado de sala.
   *
   * Evita que un cliente quede bloqueado si se reconecta o pierde el evento
   * puntual `game:over` justo al terminar la partida.
   */
  result: MatchResult | null;
  selectedGame: GameId;
  players: PublicPlayer[];
  hostId: string;
  settings: GameSettings;
  maxPlayers: number;
  minPlayers: number;
  createdAt: number;
  /**
   * true en las salas de práctica en solitario.
   *
   * El cliente lo usa para ocultar invitación, expulsiones y traspaso de
   * anfitrión, que no tienen sentido cuando solo hay una persona.
   */
  solo: boolean;
  /** Configuración de rivales del servidor. Solo se usa si `solo` es true. */
  soloConfig: SoloConfig;
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
