import {
  DEFAULT_SETTINGS,
  GAME_META,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  PLAYER_ICONS,
  normalizeName,
  type GameAction,
  type GameId,
  type GamePublicState,
  type GameSettings,
  type MatchResult,
  type PublicPlayer,
  type RoomPhase,
  type RoomSummary,
} from '@arcade/shared';
import { randomUUID, randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { logger } from '../logger.js';
import type { GameContext, GameRunner, RoomPlayer } from './types.js';
import { createGameRunner } from '../games/factory.js';
import { getStats } from '../stats.js';

export type RoomBroadcast = (event: string, payload: unknown) => void;
export type RoomDirect = (socketId: string, event: string, payload: unknown) => void;

export interface RoomDeps {
  broadcast: RoomBroadcast;
  direct: RoomDirect;
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  private players = new Map<string, RoomPlayer>();
  private phase: RoomPhase = 'lobby';
  private selectedGame: GameId = 'quiz';
  private settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  private runner: GameRunner | null = null;
  private lastResult: MatchResult | null = null;
  emptySince: number | null = Date.now();

  constructor(
    code: string,
    private readonly deps: RoomDeps,
  ) {
    this.code = code;
  }

  /* ----------------------------- Consultas ------------------------------ */

  get playerCount(): number {
    return this.players.size;
  }

  get isEmpty(): boolean {
    return this.players.size === 0;
  }

  get currentPhase(): RoomPhase {
    return this.phase;
  }

  get game(): GameId {
    return this.selectedGame;
  }

  getPlayer(playerId: string): RoomPlayer | undefined {
    return this.players.get(playerId);
  }

  findByToken(token: string): RoomPlayer | undefined {
    return [...this.players.values()].find((p) => p.token === token);
  }

  hasName(name: string, exceptId?: string): boolean {
    const normalized = normalizeName(name);
    return [...this.players.values()].some(
      (p) => p.id !== exceptId && normalizeName(p.name) === normalized,
    );
  }

  get hostId(): string {
    const host = [...this.players.values()].find((p) => p.isHost);
    return host?.id ?? '';
  }

  publicPlayers(): PublicPlayer[] {
    return [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        icon: p.icon,
        isHost: p.isHost,
        ready: p.ready,
        connection: p.connection,
        joinedAt: p.joinedAt,
      }));
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      phase: this.phase,
      selectedGame: this.selectedGame,
      players: this.publicPlayers(),
      hostId: this.hostId,
      settings: this.settings,
      inviteUrl: env.PUBLIC_WEB_URL.replace(/\/$/, '') + '/?code=' + this.code,
      maxPlayers: MAX_PLAYERS,
      minPlayers: MIN_PLAYERS,
      createdAt: this.createdAt,
    };
  }

  currentGameState(): GamePublicState | null {
    return this.runner ? this.runner.publicState() : null;
  }

  getLastResult(): MatchResult | null {
    return this.lastResult;
  }

  /* ------------------------------ Jugadores ----------------------------- */

  private nextColor(): { color: string; icon: (typeof PLAYER_ICONS)[number] } {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const index = PLAYER_COLORS.findIndex((c) => !used.has(c));
    const safe = index === -1 ? this.players.size % PLAYER_COLORS.length : index;
    return { color: PLAYER_COLORS[safe]!, icon: PLAYER_ICONS[safe]! };
  }

  addPlayer(name: string, socketId: string): RoomPlayer {
    const { color, icon } = this.nextColor();
    const player: RoomPlayer = {
      id: randomUUID(),
      token: randomBytes(24).toString('hex'),
      name,
      color,
      icon,
      isHost: this.players.size === 0,
      ready: false,
      connection: 'connected',
      socketId,
      joinedAt: Date.now(),
      disconnectedAt: null,
    };
    this.players.set(player.id, player);
    this.emptySince = null;
    logger.info('Jugador entra en la sala', { room: this.code, name, id: player.id });
    return player;
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS;
  }

  attachSocket(playerId: string, socketId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.socketId = socketId;
    player.connection = 'connected';
    player.disconnectedAt = null;
    this.emptySince = null;
    this.runner?.onPlayerRejoined(playerId);
  }

  /**
   * Marca a un jugador como desconectado.
   *
   * Al recargar la pagina el navegador abre el socket nuevo antes de que el
   * servidor procese el cierre del antiguo, asi que el evento de desconexion
   * puede llegar despues de la reconexion. Si el jugador ya tiene otro socket
   * asignado, este aviso pertenece a la conexion vieja y se ignora: de lo
   * contrario la sala mostraria al jugador como caido y el limpiador acabaria
   * expulsandolo pese a estar jugando.
   */
  markDisconnected(playerId: string, socketId?: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    if (socketId && player.socketId !== socketId) return;
    player.connection = 'disconnected';
    player.socketId = null;
    player.disconnectedAt = Date.now();
    if (
      this.players.size > 0 &&
      [...this.players.values()].every((p) => p.connection === 'disconnected')
    ) {
      this.emptySince = Date.now();
    }
    this.broadcastRoom();
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.runner?.onPlayerLeft(playerId);
    if (player.isHost) this.promoteNextHost();
    if (this.players.size === 0) this.emptySince = Date.now();
    logger.info('Jugador sale de la sala', { room: this.code, id: playerId });
    this.ensureViableGame();
    this.broadcastRoom();
  }

  private promoteNextHost(): void {
    const next = [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) next.isHost = true;
  }

  transferHost(fromId: string, toId: string): boolean {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    if (!from?.isHost || !to) return false;
    from.isHost = false;
    to.isHost = true;
    this.broadcastRoom();
    return true;
  }

  /** Si quedan menos jugadores de los necesarios, se cancela la partida. */
  private ensureViableGame(): void {
    if (this.phase === 'playing' && this.players.size < MIN_PLAYERS) {
      this.runner?.dispose();
      this.runner = null;
      this.phase = 'lobby';
      this.resetReady();
      this.deps.broadcast('app:toast', {
        message: 'La partida se ha cancelado: no quedan suficientes jugadores.',
      });
    }
  }

  /* -------------------------------- Lobby ------------------------------- */

  setReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.ready = ready;
    this.broadcastRoom();
  }

  private resetReady(): void {
    for (const player of this.players.values()) player.ready = false;
  }

  selectGame(game: GameId): void {
    if (this.phase !== 'lobby') return;
    this.selectedGame = game;
    this.resetReady();
    this.broadcastRoom();
  }

  updateSettings<K extends GameId>(game: K, settings: GameSettings[K]): void {
    if (this.phase !== 'lobby') return;
    this.settings = { ...this.settings, [game]: settings };
    this.broadcastRoom();
  }

  canStart(): { ok: boolean; reason?: string } {
    if (this.phase !== 'lobby') return { ok: false, reason: 'La partida ya ha comenzado' };
    if (this.players.size < MIN_PLAYERS) {
      return { ok: false, reason: 'Se necesitan al menos ' + MIN_PLAYERS + ' jugadores' };
    }
    return { ok: true };
  }

  startGame(): { ok: boolean; reason?: string } {
    const check = this.canStart();
    if (!check.ok) return check;

    this.phase = 'playing';
    this.lastResult = null;
    const context: GameContext = {
      players: () => [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt),
      broadcastState: (state) => this.deps.broadcast('game:state', state),
      broadcastEvent: (event) => this.deps.broadcast('game:event', event),
      broadcastSnapshot: (snapshot) => this.deps.broadcast('game:snapshot', snapshot),
      finish: (result, extras) => this.finishGame(result, extras),
      toast: (message, playerId) => {
        if (!playerId) {
          this.deps.broadcast('app:toast', { message });
          return;
        }
        const target = this.players.get(playerId);
        if (target?.socketId) this.deps.direct(target.socketId, 'app:toast', { message });
      },
    };

    this.runner = createGameRunner(this.selectedGame, context, this.settings);
    this.broadcastRoom();
    this.deps.broadcast('game:started', {
      game: this.selectedGame,
      state: this.runner.publicState(),
    });
    this.runner.start();
    logger.info('Partida iniciada', { room: this.code, game: this.selectedGame });
    return { ok: true };
  }

  handleAction(playerId: string, action: GameAction): void {
    if (this.phase !== 'playing' || !this.runner) return;
    this.runner.handleAction(playerId, action);
  }

  private finishGame(result: MatchResult, extras?: Record<string, unknown>): void {
    this.phase = 'results';
    this.lastResult = result;
    this.deps.broadcast('game:over', { result });
    this.broadcastRoom();
    const golfExtras = extras?.golf as
      Record<string, { strokes: number; holesInOne: number }> | undefined;
    void getStats()
      .saveMatch({ roomCode: this.code, game: result.game, result, golfExtras })
      .catch((error) => logger.warn('No se pudo guardar el resultado', String(error)));
    logger.info('Partida terminada', {
      room: this.code,
      game: GAME_META[result.game].name,
      winners: result.winnerIds.length,
    });
  }

  backToLobby(): void {
    this.runner?.dispose();
    this.runner = null;
    this.phase = 'lobby';
    this.resetReady();
    this.broadcastRoom();
  }

  dispose(): void {
    this.runner?.dispose();
    this.runner = null;
  }

  broadcastRoom(): void {
    this.deps.broadcast('room:state', this.summary());
  }
}
