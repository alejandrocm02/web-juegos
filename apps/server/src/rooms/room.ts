import {
  BOT_NAMES,
  CHAT_HISTORY_SIZE,
  CHAT_MESSAGE_COOLDOWN_MS,
  CHAT_REACTION_COOLDOWN_MS,
  DEFAULT_SETTINGS,
  GAME_META,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLAYER_COLORS,
  PLAYER_ICONS,
  SERVER_EVENTS,
  SOLO_MIN_PLAYERS,
  clampBotCount,
  coerceSoloMode,
  defaultSoloConfig,
  normalizeName,
  soloUsesBots,
  type GameAction,
  type GameId,
  type GamePublicState,
  type GameSettings,
  type MatchResult,
  type PublicPlayer,
  type RoomPhase,
  type RoomSummary,
  type SoloConfig,
  type SoloOutcome,
  type ChatMessage,
  type ChatReactionEvent,
  type ChatReactionId,
  type TournamentPublicState,
  type TournamentSettings,
} from '@arcade/shared';
import { randomUUID, randomBytes } from 'node:crypto';
import { logger } from '../logger.js';
import type { GameContext, GameRunner, RoomPlayer } from './types.js';
import { createGameRunner } from '../games/factory.js';
import { getStats } from '../stats.js';
import { BotDirector, type BotSeat } from '../bots/index.js';
import { describeOutcome, recordSoloMatch } from '../records.js';
import { Tournament } from './tournament.js';

export type RoomBroadcast = (event: string, payload: unknown) => void;
export type RoomDirect = (socketId: string, event: string, payload: unknown) => void;

export interface RoomDeps {
  broadcast: RoomBroadcast;
  direct: RoomDirect;
}

/** Datos que solo existen en una sala de práctica en solitario. */
export interface SoloRoomOptions {
  game: GameId;
  /** Identificador anónimo del navegador, usado para las marcas personales. */
  profileId: string;
  config: SoloConfig;
}

export interface RoomOptions {
  solo?: SoloRoomOptions;
  /**
   * IP que creo la sala. Solo se usa para descontar la cuota cuando el
   * barredor la retira; no se registra en logs ni se expone al cliente.
   */
  ownerIp?: string;
}

export class Room {
  readonly code: string;
  readonly createdAt = Date.now();
  readonly ownerIp: string | null;
  /** true si la sala es de práctica: un humano y, si hace falta, bots. */
  readonly solo: boolean;
  private readonly profileId: string | null;
  private soloConfig: SoloConfig;
  private players = new Map<string, RoomPlayer>();
  private phase: RoomPhase = 'lobby';
  private selectedGame: GameId = 'quiz';
  private settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  private runner: GameRunner | null = null;
  private botDirector: BotDirector | null = null;
  private lastResult: MatchResult | null = null;
  private lastSoloOutcome: SoloOutcome | null = null;
  /**
   * Torneo configurado para esta sala, o null si juega partidas sueltas.
   *
   * Es lo que decide cual es la siguiente prueba cuando termina una partida.
   */
  private tournament: Tournament | null = null;
  /** Ultimos mensajes de chat. Se recortan a CHAT_HISTORY_SIZE. */
  private readonly chatLog: ChatMessage[] = [];
  private readonly chatCooldowns = new Map<string, number>();
  private readonly reactionCooldowns = new Map<string, number>();
  emptySince: number | null = Date.now();

  constructor(
    code: string,
    private readonly deps: RoomDeps,
    options: RoomOptions = {},
  ) {
    this.code = code;
    this.ownerIp = options.ownerIp ?? null;
    this.solo = Boolean(options.solo);
    this.profileId = options.solo?.profileId ?? null;
    if (options.solo) {
      this.selectedGame = options.solo.game;
      this.soloConfig = {
        botCount: clampBotCount(options.solo.game, options.solo.config.botCount),
        botDifficulty: options.solo.config.botDifficulty,
      };
    } else {
      this.soloConfig = defaultSoloConfig(this.selectedGame);
    }
  }

  /** Jugadores necesarios para arrancar. En práctica basta con uno. */
  get minPlayers(): number {
    return this.solo ? SOLO_MIN_PLAYERS : MIN_PLAYERS;
  }

  /* ----------------------------- Consultas ------------------------------ */

  get playerCount(): number {
    return this.players.size;
  }

  /** Jugadores reales. Los bots no cuentan para vaciar ni cerrar la sala. */
  private humans(): RoomPlayer[] {
    return [...this.players.values()].filter((player) => !player.isBot);
  }

  private bots(): RoomPlayer[] {
    return [...this.players.values()].filter((player) => player.isBot);
  }

  get isEmpty(): boolean {
    return this.humans().length === 0;
  }

  /**
   * true si ahora mismo hay alguien conectado en la sala.
   *
   * No es lo mismo que `!isEmpty`: al cerrar la pestana el jugador no se
   * borra, se marca como desconectado y conserva su plaza durante
   * RECONNECT_GRACE_SECONDS por si vuelve. Para las cuotas lo que cuenta es si
   * la sala se esta usando de verdad, no si queda alguien apuntado en ella.
   */
  get hasPlayersOnline(): boolean {
    return this.emptySince === null;
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

  /** Perfil anónimo del jugador de una sala de práctica. */
  get soloProfileId(): string | null {
    return this.profileId;
  }

  get currentSoloConfig(): SoloConfig {
    return { ...this.soloConfig };
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
        ...(p.isBot ? { isBot: true as const } : {}),
      }));
  }

  summary(): RoomSummary {
    return {
      code: this.code,
      phase: this.phase,
      result: this.phase === 'results' ? this.lastResult : null,
      selectedGame: this.selectedGame,
      players: this.publicPlayers(),
      hostId: this.hostId,
      settings: this.settings,
      maxPlayers: MAX_PLAYERS,
      minPlayers: this.minPlayers,
      createdAt: this.createdAt,
      solo: this.solo,
      soloConfig: this.currentSoloConfig,
      tournament: this.tournamentState(),
    };
  }

  /* ------------------------------- Torneo -------------------------------- */

  /** Foto del torneo para el cliente, o null si la sala no juega uno. */
  tournamentState(): TournamentPublicState | null {
    if (!this.tournament) return null;
    return this.tournament.publicState(
      this.humans().map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
      })),
    );
  }

  /**
   * Activa, reconfigura o cancela el torneo. Solo en el lobby.
   *
   * Al activarlo, el juego seleccionado pasa a ser la primera prueba: asi el
   * anfitrion ve en el lobby exactamente lo que va a empezar.
   */
  configureTournament(
    config: { enabled: false } | { enabled: true; settings: TournamentSettings },
  ): { ok: true } | { ok: false; reason: string } {
    if (this.phase !== 'lobby') return { ok: false, reason: 'El torneo ya ha empezado' };
    if (this.solo) return { ok: false, reason: 'El torneo necesita más de un jugador' };

    if (!config.enabled) {
      this.tournament = null;
      this.broadcastRoom();
      return { ok: true };
    }

    this.tournament = new Tournament(config.settings);
    const first = this.tournament.currentGame;
    if (first) this.selectedGame = first;
    this.resetReady();
    this.broadcastRoom();
    return { ok: true };
  }

  /**
   * Prepara la siguiente prueba del torneo.
   *
   * No arranca la partida: deja la sala en el lobby con el juego cambiado y a
   * todo el mundo sin marcar. El anfitrion sigue decidiendo cuando se juega.
   */
  private advanceTournament(): void {
    const next = this.tournament?.currentGame;
    if (!next) return;
    this.selectedGame = next;
    this.resetReady();
  }

  currentGameState(): GamePublicState | null {
    return this.runner ? this.runner.publicState() : null;
  }

  getLastResult(): MatchResult | null {
    return this.lastResult;
  }

  /**
   * Marca de la última práctica terminada.
   *
   * Se conserva para poder reenviarla al reconectar: el evento puntual se
   * emite justo al acabar y un navegador que recargue en ese instante lo
   * perdería.
   */
  getLastSoloOutcome(): SoloOutcome | null {
    return this.lastSoloOutcome;
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

  /**
   * Ajusta el número de bots al configurado para el juego elegido.
   *
   * Se llama al crear la sala, al cambiar de juego y al tocar la dificultad.
   * Nunca durante una partida: la configuración queda bloqueada al empezar.
   */
  private syncBots(): void {
    if (!this.solo || this.phase !== 'lobby') return;
    const wanted = soloUsesBots(this.selectedGame)
      ? clampBotCount(this.selectedGame, this.soloConfig.botCount)
      : 0;
    this.soloConfig.botCount = wanted;

    const current = this.bots();
    for (let index = current.length; index > wanted; index -= 1) {
      const victim = current[index - 1];
      if (victim) this.players.delete(victim.id);
    }
    for (let index = current.length; index < wanted; index += 1) {
      if (this.players.size >= MAX_PLAYERS) break;
      this.addBot();
    }
    this.coerceSoloMode();
  }

  private addBot(): void {
    const { color, icon } = this.nextColor();
    const used = new Set(this.bots().map((bot) => bot.name));
    const name = BOT_NAMES.find((candidate) => !used.has(candidate)) ?? 'Bot';
    const bot: RoomPlayer = {
      id: randomUUID(),
      token: randomBytes(24).toString('hex'),
      name,
      color,
      icon,
      isHost: false,
      // Un bot siempre está listo: no debe bloquear el inicio de la partida.
      ready: true,
      connection: 'connected',
      socketId: null,
      joinedAt: Date.now() + this.players.size,
      disconnectedAt: null,
      isBot: true,
    };
    this.players.set(bot.id, bot);
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
    const humans = this.humans();
    if (humans.length > 0 && humans.every((p) => p.connection === 'disconnected')) {
      this.emptySince = Date.now();
    }
    this.broadcastRoom();
  }

  removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    this.players.delete(playerId);
    this.chatCooldowns.delete(playerId);
    this.reactionCooldowns.delete(playerId);
    this.runner?.onPlayerLeft(playerId);
    this.botDirector?.removeSeat(playerId);
    if (player.isHost) this.promoteNextHost();
    if (this.isEmpty) {
      this.emptySince = Date.now();
      // Sin humanos la práctica no tiene sentido: se retiran los bots.
      if (this.solo) this.stopSolo();
    }
    logger.info('Jugador sale de la sala', { room: this.code, id: playerId });
    this.ensureViableGame();
    this.broadcastRoom();
  }

  /** Detiene la IA y libera los asientos de los bots. */
  private stopSolo(): void {
    this.botDirector?.stop();
    this.botDirector = null;
    for (const bot of this.bots()) this.players.delete(bot.id);
  }

  private promoteNextHost(): void {
    const ordered = this.humans().sort((a, b) => a.joinedAt - b.joinedAt);
    const next = ordered.find((player) => player.connection === 'connected') ?? ordered[0];
    if (next) next.isHost = true;
  }

  transferHost(fromId: string, toId: string): boolean {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    // Un bot no puede ser anfitrión: no hay nadie al otro lado que configure.
    if (!from?.isHost || !to || to.isBot || to.connection !== 'connected') return false;
    from.isHost = false;
    to.isHost = true;
    this.broadcastRoom();
    return true;
  }

  /** Si quedan menos jugadores de los necesarios, se cancela la partida. */
  private ensureViableGame(): void {
    if (this.phase === 'playing' && this.players.size < this.minPlayers) {
      this.runner?.dispose();
      this.runner = null;
      this.botDirector?.stop();
      this.botDirector = null;
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
    for (const player of this.players.values()) player.ready = Boolean(player.isBot);
  }

  selectGame(game: GameId): void {
    if (this.phase !== 'lobby') return;
    // Durante un torneo el orden de las pruebas lo decide el torneo, no el
    // anfitrion: cambiarlo a mitad haria que la clasificacion no cuadrase con
    // las pruebas anunciadas al empezar.
    if (this.tournament && !this.tournament.finished) return;
    this.selectedGame = game;
    this.resetReady();
    if (this.solo) {
      // Cada juego admite un número distinto de rivales: se reajusta al cambiar.
      this.soloConfig.botCount = clampBotCount(game, this.soloConfig.botCount);
      this.syncBots();
    }
    this.broadcastRoom();
  }

  /** Cambia rivales y dificultad de una sala de práctica. */
  updateSoloConfig(config: SoloConfig): boolean {
    if (!this.solo || this.phase !== 'lobby') return false;
    this.soloConfig = {
      botCount: clampBotCount(this.selectedGame, config.botCount),
      botDifficulty: config.botDifficulty,
    };
    this.syncBots();
    this.broadcastRoom();
    return true;
  }

  /** Coloca los bots iniciales. Se llama justo después de entrar el humano. */
  prepareSolo(): void {
    if (!this.solo) return;
    this.syncBots();
  }

  updateSettings<K extends GameId>(game: K, settings: GameSettings[K]): void {
    if (this.phase !== 'lobby') return;
    this.settings = { ...this.settings, [game]: settings };
    if (this.solo) this.coerceSoloMode(game);
    this.broadcastRoom();
  }

  /**
   * Ajusta el modo del juego elegido a uno jugable en solitario.
   *
   * Sin rivales, los modos por equipos y la bola 8 no tienen sentido. En vez de
   * dejar que la partida arranque rota, se sustituye por el primer modo válido.
   */
  private coerceSoloMode(game: GameId = this.selectedGame): void {
    if (!this.solo) return;
    const current = this.settings[game] as { mode: string };
    const participants = 1 + this.bots().length;
    const next = coerceSoloMode(game, current.mode, participants);
    if (next === current.mode) return;
    this.settings = { ...this.settings, [game]: { ...current, mode: next } };
  }

  canStart(): { ok: boolean; reason?: string } {
    if (this.phase !== 'lobby') return { ok: false, reason: 'La partida ya ha comenzado' };
    const connected = this.humans().filter((player) => player.connection === 'connected');
    if (connected.length < this.minPlayers) {
      return {
        ok: false,
        reason: 'Se necesitan al menos ' + this.minPlayers + ' jugadores conectados',
      };
    }
    if (connected.some((player) => !player.ready)) {
      return { ok: false, reason: 'Todos los jugadores conectados deben estar listos' };
    }
    return { ok: true };
  }

  startGame(): { ok: boolean; reason?: string } {
    const check = this.canStart();
    if (!check.ok) return check;

    this.phase = 'playing';
    this.lastResult = null;
    this.lastSoloOutcome = null;
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
    this.startBots();
    logger.info('Partida iniciada', {
      room: this.code,
      game: this.selectedGame,
      solo: this.solo,
      bots: this.bots().length,
    });
    return { ok: true };
  }

  /** Pone en marcha la IA de los bots que participan en la partida. */
  private startBots(): void {
    this.botDirector?.stop();
    this.botDirector = null;
    const seats: BotSeat[] = this.bots().map((bot) => ({
      playerId: bot.id,
      difficulty: this.soloConfig.botDifficulty,
    }));
    if (seats.length === 0) return;

    this.botDirector = BotDirector.forGame(this.selectedGame, seats, {
      state: () => (this.phase === 'playing' ? (this.runner?.publicState() ?? null) : null),
      dispatch: (playerId, action) => {
        // Misma puerta de entrada que un humano: el runner valida turno y acción.
        if (this.phase === 'playing') this.runner?.handleAction(playerId, action);
      },
    });
    this.botDirector?.start();
  }

  handleAction(playerId: string, action: GameAction): void {
    if (this.phase !== 'playing' || !this.runner) return;
    this.runner.handleAction(playerId, action);
  }

  private finishGame(result: MatchResult, extras?: Record<string, unknown>): void {
    this.phase = 'results';
    this.lastResult = result;
    this.botDirector?.stop();
    this.botDirector = null;

    // En torneo, la prueba recien terminada suma puntos y se anuncia la
    // siguiente. La clasificacion de la prueba se sigue mostrando igual: lo que
    // cambia es que debajo aparece la general.
    if (this.tournament) {
      const round = this.tournament.recordResult(result);
      if (this.tournament.finished) {
        this.lastResult = this.tournament.finalResult(
          this.humans().map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            icon: player.icon,
          })),
        );
        this.deps.broadcast('app:toast', {
          message: 'Torneo terminado tras ' + this.tournament.totalRounds + ' pruebas.',
        });
      } else {
        this.advanceTournament();
        this.deps.broadcast('app:toast', {
          message:
            'Prueba ' +
            (round.index + 1) +
            ' de ' +
            this.tournament.totalRounds +
            ' terminada. Siguiente: ' +
            GAME_META[this.selectedGame].name +
            '.',
        });
      }
      this.deps.broadcast('tournament:state', this.tournamentState());
    }

    this.deps.broadcast('game:over', { result: this.lastResult });
    this.broadcastRoom();
    this.saveSoloRecord(result);
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

  /**
   * Calcula y guarda la marca personal de una partida en solitario.
   *
   * Es deliberadamente asíncrono y aislado: si la base de datos falla, la
   * partida ya ha terminado correctamente y el jugador no se entera.
   */
  private saveSoloRecord(result: MatchResult): void {
    if (!this.solo || !this.profileId) return;
    const human = this.humans()[0];
    if (!human) return;
    const usesBots = soloUsesBots(result.game) && this.bots().length > 0;

    void recordSoloMatch({
      profileId: this.profileId,
      playerId: human.id,
      result,
      difficulty: usesBots ? this.soloConfig.botDifficulty : null,
    })
      .then((outcome) => {
        if (!outcome) return;
        this.lastSoloOutcome = outcome;
        this.deps.broadcast(SERVER_EVENTS.soloOutcome, outcome);
        if (outcome.improved)
          this.deps.broadcast('app:toast', { message: describeOutcome(outcome) });
      })
      .catch((error) => logger.warn('No se pudo registrar la marca personal', String(error)));
  }

  backToLobby(): void {
    this.runner?.dispose();
    this.runner = null;
    this.botDirector?.stop();
    this.botDirector = null;
    this.phase = 'lobby';
    this.lastResult = null;
    this.lastSoloOutcome = null;
    // Un torneo terminado se retira al volver al lobby: la sala vuelve a jugar
    // partidas sueltas hasta que alguien monte otro.
    if (this.tournament?.finished) this.tournament = null;
    this.resetReady();
    // Los bots se recolocan por si cambió el juego o la configuración.
    this.syncBots();
    this.broadcastRoom();
  }

  dispose(): void {
    this.runner?.dispose();
    this.runner = null;
    this.botDirector?.stop();
    this.botDirector = null;
  }

  /* -------------------------------- Chat --------------------------------- */

  /**
   * Publica un mensaje de chat.
   *
   * El texto llega ya saneado por Zod. Aqui solo se aplica el enfriamiento por
   * jugador —el limitador general de sockets es demasiado generoso para una
   * conversacion— y se guarda una copia del nombre y el color, para que el hilo
   * siga leyendose aunque el autor se vaya de la sala.
   */
  postChatMessage(playerId: string, text: string): { ok: boolean; reason?: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, reason: 'No estás en la sala' };

    const now = Date.now();
    const last = this.chatCooldowns.get(playerId) ?? 0;
    if (now - last < CHAT_MESSAGE_COOLDOWN_MS) {
      return { ok: false, reason: 'Espera un momento antes de volver a escribir' };
    }
    this.chatCooldowns.set(playerId, now);

    const message: ChatMessage = {
      id: randomUUID(),
      playerId,
      name: player.name,
      color: player.color,
      text,
      at: now,
    };
    this.chatLog.push(message);
    if (this.chatLog.length > CHAT_HISTORY_SIZE) this.chatLog.shift();
    this.deps.broadcast('chat:message', message);
    return { ok: true };
  }

  /**
   * Emite una reaccion efimera.
   *
   * No se guarda en el historial a proposito: durante una partida se lanzan
   * muchas y el valor es el instante, no el registro.
   */
  postReaction(playerId: string, reaction: ChatReactionId): { ok: boolean; reason?: string } {
    const player = this.players.get(playerId);
    if (!player) return { ok: false, reason: 'No estás en la sala' };

    const now = Date.now();
    const last = this.reactionCooldowns.get(playerId) ?? 0;
    if (now - last < CHAT_REACTION_COOLDOWN_MS) {
      return { ok: false, reason: 'Reacciona un poco más despacio' };
    }
    this.reactionCooldowns.set(playerId, now);

    const event: ChatReactionEvent = {
      playerId,
      name: player.name,
      color: player.color,
      reaction,
      at: now,
    };
    this.deps.broadcast('chat:reaction', event);
    return { ok: true };
  }

  /** Historial para quien entra o se reconecta. */
  chatHistory(): ChatMessage[] {
    return [...this.chatLog];
  }

  /** Aviso puntual a toda la sala. Lo usa el apagado ordenado del proceso. */
  announce(message: string): void {
    this.deps.broadcast('app:toast', { message });
  }

  broadcastRoom(): void {
    this.deps.broadcast('room:state', this.summary());
  }
}
