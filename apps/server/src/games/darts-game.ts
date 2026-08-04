import {
  DARTS_PER_TURN,
  DART_SPREAD,
  applyCricketThrow,
  assignTeams,
  clamp,
  createCricketBoard,
  cricketWinner,
  isTeamMode,
  resolveDartHit,
  type DartThrow,
  type DartsPublicState,
  type DartsSettings,
  type DartsTurnHistoryEntry,
  type CricketBoard,
  type GameAction,
  type TeamId,
} from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const THROW_TIMEOUT_MS = 30000;
const FREE_SCORING_TURNS = 8;
const RESOLVE_MS = 1400;

export class DartsGame implements GameRunner {
  readonly id = 'darts' as const;
  private order: string[] = [];
  private activeIndex = 0;
  private scores = new Map<string, number>();
  private throwsLeft = DARTS_PER_TURN;
  private currentThrows: DartThrow[] = [];
  private turnStartScore = 301;
  private history: DartsTurnHistoryEntry[] = [];
  private phase: DartsPublicState['phase'] = 'aiming';
  private deadline = 0;
  private lastBust = false;
  private timer: NodeJS.Timeout | null = null;
  private winnerId: string | null = null;
  private teams: Record<string, TeamId> = {};
  /** Turnos jugados por cada jugador, para cerrar el modo de puntuacion libre. */
  private turnsPlayed = new Map<string, number>();
  /** Dardos lanzados por jugador. Es la marca personal del modo individual. */
  private throwsMade = new Map<string, number>();
  private cricket: CricketBoard | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: DartsSettings,
  ) {}

  /** Puntuacion inicial segun el modo. En libre se acumulan puntos desde cero. */
  private get startScore(): number {
    if (this.settings.mode === '501') return 501;
    if (this.settings.mode === 'libre') return 0;
    return 301;
  }

  private get isFreeScoring(): boolean {
    return this.settings.mode === 'libre';
  }

  private get isCricket(): boolean {
    return this.settings.mode === 'cricket';
  }

  start(): void {
    this.order = this.ctx.players().map((p) => p.id);
    for (const id of this.order) {
      this.scores.set(id, this.startScore);
      this.turnsPlayed.set(id, 0);
      this.throwsMade.set(id, 0);
    }
    if (isTeamMode('darts', this.settings.mode)) this.teams = assignTeams(this.order);
    if (this.isCricket) this.cricket = createCricketBoard(this.order);
    this.activeIndex = 0;
    this.beginTurn();
  }

  private get activePlayerId(): string {
    return this.order[this.activeIndex] ?? '';
  }

  private beginTurn(): void {
    this.throwsLeft = DARTS_PER_TURN;
    this.currentThrows = [];
    this.lastBust = false;
    this.turnStartScore = this.scores.get(this.activePlayerId) ?? this.startScore;
    this.phase = 'aiming';
    this.armTimeout();
    this.push();
  }

  private armTimeout(): void {
    this.deadline = Date.now() + THROW_TIMEOUT_MS;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.autoThrow(), THROW_TIMEOUT_MS + 200);
  }

  private autoThrow(): void {
    if (this.phase !== 'aiming') return;
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.35 + Math.random() * 0.5;
    this.ctx.toast('Tiempo agotado: lanzamiento automatico', this.activePlayerId);
    this.applyThrow(this.activePlayerId, Math.cos(angle) * radius, Math.sin(angle) * radius);
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'darts:throw') return;
    if (this.phase !== 'aiming') return;
    if (playerId !== this.activePlayerId) return;
    this.applyThrow(playerId, action.x, action.y);
  }

  private applyThrow(playerId: string, aimX: number, aimY: number): void {
    if (this.winnerId) return;
    this.throwsMade.set(playerId, (this.throwsMade.get(playerId) ?? 0) + 1);
    // El servidor aplica su propia desviacion: el cliente solo propone puntería.
    const spread = DART_SPREAD[this.settings.aimAssist];
    const angle = Math.random() * Math.PI * 2;
    const magnitude = Math.sqrt(Math.random()) * spread;
    const x = clamp(aimX + Math.cos(angle) * magnitude, -1.15, 1.15);
    const y = clamp(aimY + Math.sin(angle) * magnitude, -1.15, 1.15);

    const hit = resolveDartHit(x, y);
    this.currentThrows.push(hit);
    this.throwsLeft -= 1;

    if (this.isCricket && this.cricket) {
      const result = applyCricketThrow(this.cricket, playerId, hit);
      // El marcador visible es el de puntos de cricket.
      this.scores.set(playerId, this.cricket[playerId]?.score ?? 0);
      if (result.closed && result.number) {
        this.ctx.toast('Numero ' + result.number + ' cerrado', playerId);
      }
      const winner = cricketWinner(this.cricket);
      if (winner) {
        this.winnerId = winner;
        this.finish();
        return;
      }
      if (this.throwsLeft <= 0) {
        this.endTurn(playerId, false);
        return;
      }
      this.armTimeout();
      this.push();
      return;
    }

    const before = this.scores.get(playerId) ?? this.startScore;

    if (this.isFreeScoring) {
      // Puntuacion libre: se suma sin objetivo que cerrar ni bust.
      this.scores.set(playerId, before + hit.points);
      if (this.throwsLeft <= 0) {
        this.endTurn(playerId, false);
        return;
      }
      this.armTimeout();
      this.push();
      return;
    }

    const after = before - hit.points;
    if (after < 0) {
      this.endTurn(playerId, true);
      return;
    }
    this.scores.set(playerId, after);
    if (after === 0) {
      this.winnerId = playerId;
      this.ctx.broadcastEvent({ kind: 'checkout', playerId, atMs: Date.now() });
      this.finish();
      return;
    }
    if (this.throwsLeft <= 0) {
      this.endTurn(playerId, false);
      return;
    }
    this.armTimeout();
    this.push();
  }

  private endTurn(playerId: string, bust: boolean): void {
    if (bust) this.scores.set(playerId, this.turnStartScore);
    this.lastBust = bust;
    this.history.unshift({
      playerId,
      throws: this.currentThrows.slice(),
      scoreBefore: this.turnStartScore,
      scoreAfter: this.scores.get(playerId) ?? this.turnStartScore,
      bust,
    });
    this.history = this.history.slice(0, 20);
    this.phase = 'resolving';
    if (bust) {
      this.ctx.toast('Bust: se recupera la puntuación inicial del turno', playerId);
      // Todos ven el bust: es informacion de partida, no solo del que tira.
      this.ctx.broadcastEvent({ kind: 'bust', playerId, atMs: Date.now() });
    }
    this.turnsPlayed.set(playerId, (this.turnsPlayed.get(playerId) ?? 0) + 1);
    this.push();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.isFreeScoring && this.freeScoringOver()) {
        this.finish();
        return;
      }
      this.advancePlayer();
      this.beginTurn();
    }, RESOLVE_MS);
  }

  /** El modo libre dura ocho turnos por jugador. */
  private freeScoringOver(): boolean {
    return this.order.every((id) => (this.turnsPlayed.get(id) ?? 0) >= FREE_SCORING_TURNS);
  }

  private advancePlayer(): void {
    if (this.order.length === 0) return;
    this.activeIndex = (this.activeIndex + 1) % this.order.length;
  }

  onPlayerLeft(playerId: string): void {
    const wasActive = this.activePlayerId === playerId;
    const index = this.order.indexOf(playerId);
    if (index >= 0) {
      this.order.splice(index, 1);
      if (index < this.activeIndex) this.activeIndex -= 1;
    }
    this.scores.delete(playerId);
    if (this.order.length === 0) return;
    this.activeIndex %= this.order.length;
    if (wasActive) this.beginTurn();
    else this.push();
  }

  onPlayerRejoined(): void {
    this.push();
  }

  publicState(): DartsPublicState {
    const scores: Record<string, number> = {};
    for (const [id, value] of this.scores) scores[id] = value;
    return {
      game: 'darts',
      phase: this.phase,
      mode: this.settings.mode,
      teams: this.teams,
      order: this.order,
      activePlayerId: this.activePlayerId,
      scores,
      throwsLeft: this.throwsLeft,
      currentThrows: this.currentThrows,
      turnStartScore: this.turnStartScore,
      history: this.history,
      lastBust: this.lastBust,
      cricket: this.cricket,
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    if (this.timer) clearTimeout(this.timer);
    const teamMode = isTeamMode('darts', this.settings.mode);
    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const own = this.scores.get(player.id) ?? this.startScore;
        const team = this.teams[player.id];
        const score = teamMode && team ? this.teamTotal(team) : own;
        return {
          playerId: player.id,
          score,
          detail: player.id === this.winnerId ? 'Cierre exacto' : undefined,
        };
      }),
      { lowerIsBetter: !this.isFreeScoring && !this.isCricket },
    );
    this.push();
    this.ctx.finish({
      game: 'darts',
      rows,
      winnerIds: this.winnerId ? [this.winnerId] : winnersFrom(rows),
      finishedAt: Date.now(),
      extra: { mode: this.settings.mode, throws: Object.fromEntries(this.throwsMade) },
    });
  }

  private teamTotal(team: TeamId): number {
    return this.order
      .filter((id) => this.teams[id] === team)
      .reduce((sum, id) => sum + (this.scores.get(id) ?? 0), 0);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
