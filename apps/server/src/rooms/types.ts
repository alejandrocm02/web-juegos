import type {
  ConnectionState,
  GameAction,
  GameId,
  GamePublicState,
  MatchResult,
  PlayerIcon,
} from '@arcade/shared';

export interface RoomPlayer {
  id: string;
  token: string;
  name: string;
  color: string;
  icon: PlayerIcon;
  isHost: boolean;
  ready: boolean;
  connection: ConnectionState;
  socketId: string | null;
  joinedAt: number;
  disconnectedAt: number | null;
  /**
   * true si lo controla el servidor.
   *
   * Un bot ocupa un asiento normal de la sala: los juegos lo tratan como a
   * cualquier otro jugador y sus acciones pasan por el mismo runner.
   */
  isBot?: boolean;
}

/** Contexto que la sala expone a cada juego. El juego nunca toca los sockets. */
export interface GameContext {
  players(): RoomPlayer[];
  broadcastState(state: GamePublicState): void;
  broadcastEvent(event: unknown): void;
  broadcastSnapshot(snapshot: unknown): void;
  finish(result: MatchResult, extras?: Record<string, unknown>): void;
  toast(message: string, playerId?: string): void;
}

export interface GameRunner {
  readonly id: GameId;
  start(): void;
  handleAction(playerId: string, action: GameAction): void;
  onPlayerLeft(playerId: string): void;
  onPlayerRejoined(playerId: string): void;
  publicState(): GamePublicState;
  dispose(): void;
}
