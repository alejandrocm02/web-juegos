import {
  BOWLING_SHORT_FRAMES,
  BOWLING_SPREAD,
  BOWLING_TOTAL_FRAMES,
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  assignTeams,
  clamp,
  isTeamMode,
  scoreBowling,
  type BowlingPublicState,
  type BowlingSettings,
  type GameAction,
  type TeamId,
} from '@arcade/shared';
import { BowlingWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

const ROLL_TIMEOUT_MS = 40000;
const RESOLVE_MS = 1800;
const MAX_SIM_MS = 14000;

export class BowlingGame implements GameRunner {
  readonly id = 'bowling' as const;
  private world = new BowlingWorld();
  private order: string[] = [];
  private activeIndex = 0;
  private rolls = new Map<string, number[]>();
  private phase: BowlingPublicState['phase'] = 'aiming';
  private deadline = 0;
  private lastKnocked: number | null = null;
  private lastEvent: BowlingPublicState['lastEvent'] = null;
  private teams: Record<string, TeamId> = {};
  private loop: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;
  private simElapsed = 0;
  private snapshotAccumulator = 0;
  private pinsBeforeRoll = 0;
  private rollingPlayerId: string | null = null;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: BowlingSettings,
  ) {}

  private get totalFrames(): number {
    return this.settings.mode === 'corta' ? BOWLING_SHORT_FRAMES : BOWLING_TOTAL_FRAMES;
  }

  start(): void {
    this.order = this.ctx.players().map((player) => player.id);
    for (const id of this.order) this.rolls.set(id, []);
    if (isTeamMode('bowling', this.settings.mode)) this.teams = assignTeams(this.order);
    this.world.resetFrame();
    this.beginTurn();
  }

  private get activePlayerId(): string {
    return this.order[this.activeIndex] ?? '';
  }

  private beginTurn(): void {
    this.phase = 'aiming';
    this.lastEvent = null;
    this.lastKnocked = null;
    this.deadline = Date.now() + ROLL_TIMEOUT_MS;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.autoRoll(), ROLL_TIMEOUT_MS + 250);
    this.push();
  }

  private autoRoll(): void {
    if (this.phase !== 'aiming') return;
    this.ctx.toast('Tiempo agotado: lanzamiento automatico', this.activePlayerId);
    this.applyRoll(this.activePlayerId, (Math.random() - 0.5) * 0.5, 0.7, 0);
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'bowling:roll') return;
    if (this.phase !== 'aiming') return;
    if (playerId !== this.activePlayerId) return;
    this.applyRoll(playerId, action.aim, action.power, action.spin);
  }

  private applyRoll(playerId: string, aim: number, power: number, spin: number): void {
    // El servidor aplica su propia desviacion: el cliente solo propone.
    const spread = BOWLING_SPREAD[this.settings.precision];
    const noise = (Math.random() - 0.5) * 2 * spread;
    const finalAim = clamp(aim + noise, -1, 1);

    if (!this.world.roll(finalAim, power, clamp(spin, -1, 1))) return;
    if (this.timer) clearTimeout(this.timer);

    this.rollingPlayerId = playerId;
    this.pinsBeforeRoll = this.world.standingPins.length;
    this.phase = 'rolling';
    this.simElapsed = 0;
    this.snapshotAccumulator = 0;
    this.push();
    this.startLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    const stepMs = 1000 / PHYSICS_HZ;
    const snapshotEvery = Math.round(PHYSICS_HZ / SNAPSHOT_HZ);
    this.loop = setInterval(() => {
      this.world.step(PHYSICS_DT);
      this.simElapsed += stepMs;
      this.snapshotAccumulator += 1;
      if (this.snapshotAccumulator >= snapshotEvery) {
        this.snapshotAccumulator = 0;
        this.ctx.broadcastSnapshot(this.world.state);
      }
      if (this.world.settled() || this.simElapsed > MAX_SIM_MS) this.finishRoll();
    }, stepMs);
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private finishRoll(): void {
    this.stopLoop();
    const shooter = this.rollingPlayerId;
    this.rollingPlayerId = null;
    this.ctx.broadcastSnapshot(this.world.state);
    if (!shooter || !this.rolls.has(shooter)) {
      this.advanceTurn();
      return;
    }

    const standingNow = this.world.standingPins.length;
    const knocked = Math.max(0, this.pinsBeforeRoll - standingNow);
    const history = this.rolls.get(shooter)!;
    history.push(knocked);
    this.lastKnocked = knocked;

    const card = scoreBowling(history, this.totalFrames);
    const frame = card.frames[Math.min(card.currentFrame, this.totalFrames - 1)];
    const frameRolls = frame?.rolls ?? [];

    if (knocked === 0) this.lastEvent = 'gutter';
    else if (frameRolls.length === 1 && knocked === 10) this.lastEvent = 'strike';
    else if (frameRolls.length >= 2 && frameRolls[0]! + frameRolls[1]! === 10)
      this.lastEvent = 'spare';
    else this.lastEvent = 'open';

    // Los strikes y spares se anuncian a toda la sala como momento destacado.
    if (this.lastEvent === 'strike' || this.lastEvent === 'spare') {
      this.ctx.broadcastEvent({ kind: this.lastEvent, playerId: shooter, atMs: Date.now() });
    }

    this.phase = 'resolving';
    this.push();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const updated = scoreBowling(this.rolls.get(shooter) ?? [], this.totalFrames);
      // Si el jugador sigue en el mismo frame, repite lanzamiento con los bolos en pie.
      const sameFrame = updated.currentFrame === card.currentFrame && !updated.finished;
      const continuesTenth =
        updated.currentFrame === this.totalFrames - 1 &&
        updated.currentRoll > 0 &&
        !updated.finished;

      if (sameFrame || continuesTenth) {
        if (this.world.standingPins.length === 0) this.world.resetFrame();
        else this.world.prepareNextRoll();
        this.beginTurn();
        return;
      }
      this.advanceTurn();
    }, RESOLVE_MS);
  }

  private advanceTurn(): void {
    if (this.order.length === 0) return;
    if (this.everyoneFinished()) {
      this.finish();
      return;
    }

    let guard = 0;
    do {
      this.activeIndex = (this.activeIndex + 1) % this.order.length;
      guard += 1;
    } while (guard <= this.order.length && this.cardFor(this.activePlayerId).finished);

    this.world.resetFrame();
    this.beginTurn();
  }

  private cardFor(playerId: string) {
    return scoreBowling(this.rolls.get(playerId) ?? [], this.totalFrames);
  }

  private everyoneFinished(): boolean {
    return this.order.every((id) => this.cardFor(id).finished);
  }

  onPlayerLeft(playerId: string): void {
    const wasActive = this.activePlayerId === playerId;
    const index = this.order.indexOf(playerId);
    if (index >= 0) {
      this.order.splice(index, 1);
      if (index < this.activeIndex) this.activeIndex -= 1;
    }
    this.rolls.delete(playerId);
    delete this.teams[playerId];
    if (this.order.length === 0) return;
    if (this.activeIndex >= this.order.length) this.activeIndex = 0;
    if (wasActive && this.phase === 'aiming') this.beginTurn();
    else this.push();
  }

  onPlayerRejoined(): void {
    this.push();
    this.ctx.broadcastSnapshot(this.world.state);
  }

  publicState(): BowlingPublicState {
    const snapshot = this.world.state;
    const cards: BowlingPublicState['cards'] = {};
    for (const id of this.order) cards[id] = this.cardFor(id);

    const teamScores: Record<TeamId, number> = { rojo: 0, azul: 0 };
    for (const [id, team] of Object.entries(this.teams)) {
      teamScores[team] += cards[id]?.total ?? 0;
    }

    return {
      game: 'bowling',
      phase: this.phase,
      mode: this.settings.mode,
      order: this.order,
      activePlayerId: this.activePlayerId,
      cards,
      totalFrames: this.totalFrames,
      ball: snapshot.ball,
      pins: snapshot.pins,
      lastKnocked: this.lastKnocked,
      lastEvent: this.lastEvent,
      teams: this.teams,
      teamScores,
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    this.stopLoop();
    if (this.timer) clearTimeout(this.timer);

    const teamMode = isTeamMode('bowling', this.settings.mode);
    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const card = this.cardFor(player.id);
        const team = this.teams[player.id];
        const score = teamMode && team ? this.teamTotal(team) : card.total;
        return {
          playerId: player.id,
          score,
          detail: teamMode && team ? 'Equipo ' + team : card.total + ' bolos',
        };
      }),
    );
    this.push();
    this.ctx.finish({
      game: 'bowling',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
      extra: { mode: this.settings.mode, teams: this.teams },
    });
  }

  private teamTotal(team: TeamId): number {
    return this.order
      .filter((id) => this.teams[id] === team)
      .reduce((sum, id) => sum + this.cardFor(id).total, 0);
  }

  dispose(): void {
    this.stopLoop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
