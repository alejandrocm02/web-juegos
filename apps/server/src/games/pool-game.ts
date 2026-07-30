import {
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  assignTeams,
  isTeamMode,
  type GameAction,
  type PoolPublicState,
  type PoolSettings,
  type TeamId,
} from '@arcade/shared';
import { PoolWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const SHOT_TIMEOUT_MS = 45000;
/** Puntos que cierran la partida en el modo rapido. */
const QUICK_TARGET = 3;
const MAX_SIM_MS = 25000;

export class PoolGame implements GameRunner {
  readonly id = 'pool' as const;
  private world: PoolWorld;
  private order: string[] = [];
  private activeIndex = 0;
  private scores = new Map<string, number>();
  private phase: PoolPublicState['phase'] = 'aiming';
  private deadline = 0;
  private lastShotSummary: string | null = null;
  private loop: NodeJS.Timeout | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private simElapsed = 0;
  private snapshotAccumulator = 0;
  private shotPlayerId: string | null = null;
  private teams: Record<string, TeamId> = {};

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: PoolSettings,
  ) {
    this.world = new PoolWorld(settings.colorBalls, settings.tableFriction);
  }

  start(): void {
    this.order = this.ctx.players().map((p) => p.id);
    for (const id of this.order) this.scores.set(id, 0);
    if (isTeamMode('pool', this.settings.mode)) this.teams = assignTeams(this.order);
    this.beginTurn();
  }

  private get activePlayerId(): string {
    return this.order[this.activeIndex] ?? '';
  }

  private beginTurn(): void {
    this.phase = 'aiming';
    this.deadline = Date.now() + SHOT_TIMEOUT_MS;
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = setTimeout(() => this.skipTurn(), SHOT_TIMEOUT_MS + 250);
    this.push();
  }

  private skipTurn(): void {
    if (this.phase !== 'aiming') return;
    this.ctx.toast('Tiempo agotado: pierdes el turno', this.activePlayerId);
    this.nextTurn();
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'pool:shoot') return;
    if (this.phase !== 'aiming') return;
    if (playerId !== this.activePlayerId) return;
    if (!this.world.settled()) return;
    if (!this.world.shoot(action.angle, action.power)) return;

    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.shotPlayerId = playerId;
    this.phase = 'simulating';
    this.simElapsed = 0;
    this.snapshotAccumulator = 0;
    this.push();
    this.startLoop();
  }

  private startLoop(): void {
    if (this.loop) clearInterval(this.loop);
    const stepMs = 1000 / PHYSICS_HZ;
    const snapshotEvery = PHYSICS_HZ / SNAPSHOT_HZ;
    this.loop = setInterval(() => {
      this.world.step(PHYSICS_DT);
      this.simElapsed += stepMs;
      this.snapshotAccumulator += 1;
      if (this.snapshotAccumulator >= snapshotEvery) {
        this.snapshotAccumulator = 0;
        this.ctx.broadcastSnapshot(this.world.snapshot());
      }
      if (this.world.settled() || this.simElapsed > MAX_SIM_MS) this.finishShot();
    }, stepMs);
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private finishShot(): void {
    this.stopLoop();
    const outcome = this.world.consumeOutcome();
    const shooter = this.shotPlayerId;
    this.shotPlayerId = null;
    let delta = outcome.pocketedColors.length;
    const parts: string[] = [];
    if (outcome.pocketedColors.length > 0) {
      parts.push('+' + outcome.pocketedColors.length + ' bola(s) de color');
    }
    if (outcome.cuePocketed) {
      delta -= 1;
      parts.push('-1 por embocar la blanca');
      this.world.respotCueBall();
    }
    if (shooter && this.scores.has(shooter)) {
      this.scores.set(shooter, (this.scores.get(shooter) ?? 0) + delta);
    }
    this.lastShotSummary = parts.length > 0 ? parts.join(' | ') : 'Sin bolas embocadas';
    this.ctx.broadcastSnapshot(this.world.snapshot());

    if (this.world.colorBallsLeft() === 0) {
      this.finish();
      return;
    }
    // Modo rapido: la partida termina en cuanto alguien alcanza el objetivo.
    if (this.settings.mode === 'rapido') {
      const best = Math.max(0, ...[...this.scores.values()]);
      if (best >= QUICK_TARGET) {
        this.finish();
        return;
      }
    }
    if (this.order.length === 0) return;
    const shooterIndex = shooter ? this.order.indexOf(shooter) : -1;
    if (shooterIndex >= 0) this.activeIndex = (shooterIndex + 1) % this.order.length;
    else this.activeIndex %= this.order.length;
    this.beginTurn();
  }

  private nextTurn(): void {
    if (this.order.length === 0) return;
    this.activeIndex = (this.activeIndex + 1) % this.order.length;
    this.beginTurn();
  }

  onPlayerLeft(playerId: string): void {
    const wasActive = this.activePlayerId === playerId;
    const index = this.order.indexOf(playerId);
    if (index >= 0) {
      this.order.splice(index, 1);
      if (index < this.activeIndex) this.activeIndex -= 1;
    }
    this.scores.delete(playerId);
    delete this.teams[playerId];
    if (this.order.length === 0) return;
    this.activeIndex %= this.order.length;
    if (wasActive && this.phase === 'aiming') this.beginTurn();
    else this.push();
  }

  onPlayerRejoined(): void {
    this.push();
    this.ctx.broadcastSnapshot(this.world.snapshot());
  }

  publicState(): PoolPublicState {
    const scores: Record<string, number> = {};
    for (const [id, value] of this.scores) scores[id] = value;
    return {
      game: 'pool',
      phase: this.phase,
      mode: this.settings.mode,
      teams: this.teams,
      order: this.order,
      activePlayerId: this.activePlayerId,
      scores,
      balls: this.world.state,
      ballsLeft: this.world.colorBallsLeft(),
      lastShotSummary: this.lastShotSummary,
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    this.stopLoop();
    if (this.turnTimer) clearTimeout(this.turnTimer);
    const teamMode = isTeamMode('pool', this.settings.mode);
    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const own = this.scores.get(player.id) ?? 0;
        const team = this.teams[player.id];
        return {
          playerId: player.id,
          score: teamMode && team ? this.teamTotal(team) : own,
          detail: teamMode && team ? 'Equipo ' + team : own + ' puntos',
        };
      }),
    );
    this.push();
    this.ctx.finish({
      game: 'pool',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
    });
  }

  private teamTotal(team: TeamId): number {
    return this.order
      .filter((id) => this.teams[id] === team)
      .reduce((sum, id) => sum + (this.scores.get(id) ?? 0), 0);
  }

  dispose(): void {
    this.stopLoop();
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }
}
