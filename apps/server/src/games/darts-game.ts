import {
  DARTS_PER_TURN,
  DART_SPREAD,
  clamp,
  resolveDartHit,
  type DartThrow,
  type DartsPublicState,
  type DartsSettings,
  type DartsTurnHistoryEntry,
  type GameAction,
} from '@arcade/shared';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const THROW_TIMEOUT_MS = 30000;
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

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: DartsSettings,
  ) {}

  start(): void {
    this.order = this.ctx.players().map((p) => p.id);
    for (const id of this.order) this.scores.set(id, this.settings.startScore);
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
    this.turnStartScore = this.scores.get(this.activePlayerId) ?? this.settings.startScore;
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
    // El servidor aplica su propia desviacion: el cliente solo propone puntería.
    const spread = DART_SPREAD[this.settings.aimAssist];
    const angle = Math.random() * Math.PI * 2;
    const magnitude = Math.sqrt(Math.random()) * spread;
    const x = clamp(aimX + Math.cos(angle) * magnitude, -1.15, 1.15);
    const y = clamp(aimY + Math.sin(angle) * magnitude, -1.15, 1.15);

    const hit = resolveDartHit(x, y);
    this.currentThrows.push(hit);
    this.throwsLeft -= 1;

    const before = this.scores.get(playerId) ?? this.settings.startScore;
    const after = before - hit.points;

    if (after < 0) {
      this.endTurn(playerId, true);
      return;
    }
    this.scores.set(playerId, after);
    if (after === 0) {
      this.winnerId = playerId;
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
    if (bust) this.ctx.toast('Bust: se recupera la puntuacion inicial del turno', playerId);
    this.push();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.advancePlayer();
      this.beginTurn();
    }, RESOLVE_MS);
  }

  private advancePlayer(): void {
    if (this.order.length === 0) return;
    this.activeIndex = (this.activeIndex + 1) % this.order.length;
  }

  onPlayerLeft(playerId: string): void {
    const wasActive = this.activePlayerId === playerId;
    const index = this.order.indexOf(playerId);
    if (index >= 0) this.order.splice(index, 1);
    this.scores.delete(playerId);
    if (this.order.length === 0) return;
    if (this.activeIndex >= this.order.length) this.activeIndex = 0;
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
      order: this.order,
      activePlayerId: this.activePlayerId,
      scores,
      throwsLeft: this.throwsLeft,
      currentThrows: this.currentThrows,
      turnStartScore: this.turnStartScore,
      history: this.history,
      lastBust: this.lastBust,
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    if (this.timer) clearTimeout(this.timer);
    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((p) => ({
        playerId: p.id,
        score: this.scores.get(p.id) ?? this.settings.startScore,
        detail: p.id === this.winnerId ? 'Cierre exacto' : undefined,
      })),
      { lowerIsBetter: true },
    );
    this.push();
    this.ctx.finish({
      game: 'darts',
      rows,
      winnerIds: this.winnerId ? [this.winnerId] : winnersFrom(rows),
      finishedAt: Date.now(),
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
