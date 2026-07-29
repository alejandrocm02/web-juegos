import {
  GOLF_LEVELS,
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  type GameAction,
  type GolfFeedEvent,
  type GolfHoleResult,
  type GolfPublicState,
  type GolfSettings,
} from '@arcade/shared';
import { GolfWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers } from './scoring.js';

const SCOREBOARD_MS = 6000;

export class GolfGame implements GameRunner {
  readonly id = 'golf' as const;
  private levelIndex = 0;
  private world: GolfWorld;
  private phase: GolfPublicState['phase'] = 'playing';
  private loop: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout | null = null;
  private snapshotAccumulator = 0;
  private stateAccumulator = 0;
  private deadline = 0;

  private totals = new Map<string, number>();
  private totalTime = new Map<string, number>();
  private aces = new Map<string, number>();
  private holeResults: GolfHoleResult[] = [];
  private feed: GolfFeedEvent[] = [];

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: GolfSettings,
  ) {
    this.world = new GolfWorld(
      GOLF_LEVELS[0]!,
      settings,
      ctx.players().map((p) => p.id),
    );
  }

  start(): void {
    for (const player of this.ctx.players()) {
      this.totals.set(player.id, 0);
      this.totalTime.set(player.id, 0);
      this.aces.set(player.id, 0);
    }
    this.beginLevel(0);
  }

  private beginLevel(index: number): void {
    this.levelIndex = index;
    this.phase = 'playing';
    this.holeResults = [];
    this.feed = [];
    this.world = new GolfWorld(
      GOLF_LEVELS[index]!,
      this.settings,
      this.ctx.players().map((p) => p.id),
    );
    this.deadline = Date.now() + this.settings.holeTimeLimitSeconds * 1000;
    this.push();
    this.startLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    const stepMs = 1000 / PHYSICS_HZ;
    const snapshotEvery = Math.round(PHYSICS_HZ / SNAPSHOT_HZ);
    this.loop = setInterval(() => {
      this.world.step(PHYSICS_DT);

      const events = this.world.drainFeed();
      if (events.length > 0) {
        this.feed = [...events, ...this.feed].slice(0, 12);
        for (const event of events) this.ctx.broadcastEvent(event);
      }

      this.snapshotAccumulator += 1;
      if (this.snapshotAccumulator >= snapshotEvery) {
        this.snapshotAccumulator = 0;
        this.ctx.broadcastSnapshot(this.world.snapshot());
      }

      this.stateAccumulator += 1;
      if (events.length > 0 || this.stateAccumulator >= PHYSICS_HZ) {
        this.stateAccumulator = 0;
        this.push();
      }

      if (this.world.allFinished()) this.completeLevel();
    }, stepMs);
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private completeLevel(): void {
    this.stopLoop();
    this.phase = 'scoreboard';

    this.holeResults = this.world.balls.map((ball) => ({
      playerId: ball.playerId,
      strokes: ball.strokes,
      timeMs: ball.holedAtMs ?? this.world.timeLimitMs,
      holed: ball.holed,
      ace: ball.ace,
    }));

    for (const result of this.holeResults) {
      this.totals.set(result.playerId, (this.totals.get(result.playerId) ?? 0) + result.strokes);
      this.totalTime.set(
        result.playerId,
        (this.totalTime.get(result.playerId) ?? 0) + result.timeMs,
      );
      if (result.ace) this.aces.set(result.playerId, (this.aces.get(result.playerId) ?? 0) + 1);
    }

    this.deadline = Date.now() + SCOREBOARD_MS;
    this.push();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.levelIndex + 1 >= GOLF_LEVELS.length) this.finish();
      else this.beginLevel(this.levelIndex + 1);
    }, SCOREBOARD_MS);
  }

  handleAction(playerId: string, action: GameAction): void {
    if (this.phase !== 'playing') return;
    if (action.type === 'golf:sync') {
      this.ctx.broadcastSnapshot(this.world.snapshot());
      this.push();
      return;
    }
    if (action.type === 'golf:reset') {
      if (this.world.manualReset(playerId)) this.push();
      return;
    }
    if (action.type !== 'golf:shoot') return;
    const result = this.world.shoot(playerId, action.angle, action.power, action.seq);
    if (!result.ok) {
      this.ctx.toast(describeRejection(result.reason), playerId);
      return;
    }
    this.push();
  }

  onPlayerLeft(playerId: string): void {
    this.world.removePlayer(playerId);
    this.totals.delete(playerId);
    this.totalTime.delete(playerId);
    this.aces.delete(playerId);
    this.push();
  }

  onPlayerRejoined(playerId: string): void {
    this.world.addPlayer(playerId);
    if (!this.totals.has(playerId)) this.totals.set(playerId, 0);
    this.ctx.broadcastSnapshot(this.world.snapshot());
    this.push();
  }

  private scoreboard() {
    return rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((p) => ({
        playerId: p.id,
        score: this.totals.get(p.id) ?? 0,
        tiebreak: this.totalTime.get(p.id) ?? 0,
        detail: (this.aces.get(p.id) ?? 0) + ' hoyo(s) en uno',
      })),
      { lowerIsBetter: true },
    );
  }

  publicState(): GolfPublicState {
    const snapshot = this.world.snapshot();
    const totals: Record<string, number> = {};
    const times: Record<string, number> = {};
    const aces: Record<string, number> = {};
    const lastSequences: Record<string, number> = {};
    for (const [id, value] of this.totals) totals[id] = value;
    for (const [id, value] of this.totalTime) times[id] = value;
    for (const [id, value] of this.aces) aces[id] = value;
    for (const player of this.ctx.players()) {
      lastSequences[player.id] = this.world.lastSequence(player.id);
    }

    return {
      game: 'golf',
      phase: this.phase,
      settings: this.settings,
      levelIndex: this.levelIndex,
      totalLevels: GOLF_LEVELS.length,
      level: GOLF_LEVELS[this.levelIndex]!,
      balls: snapshot.balls,
      lastSequences,
      holeResults: this.holeResults,
      totals,
      totalTimeMs: times,
      aces,
      feed: this.feed,
      timeLeftMs: snapshot.timeLeftMs,
      scoreboard: this.scoreboard(),
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private finish(): void {
    this.phase = 'finished';
    this.stopLoop();
    const rows = this.scoreboard();
    this.push();
    const golfExtras: Record<string, { strokes: number; holesInOne: number }> = {};
    for (const player of this.ctx.players()) {
      golfExtras[player.id] = {
        strokes: this.totals.get(player.id) ?? 0,
        holesInOne: this.aces.get(player.id) ?? 0,
      };
    }
    this.ctx.finish(
      {
        game: 'golf',
        rows,
        winnerIds: rows.filter((row) => row.rank === 1).map((row) => row.playerId),
        finishedAt: Date.now(),
        extra: {
          aces: Object.fromEntries(this.aces),
          totalTimeMs: Object.fromEntries(this.totalTime),
        },
      },
      { golf: golfExtras },
    );
  }

  dispose(): void {
    this.stopLoop();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function describeRejection(reason?: string): string {
  switch (reason) {
    case 'BALL_MOVING':
      return 'No puedes golpear mientras la bola se mueve';
    case 'MAX_STROKES':
      return 'Has alcanzado el limite de golpes de este hoyo';
    case 'OUT_OF_BOUNDS':
      return 'Tu bola esta fuera: pulsa reiniciar para volver al recorrido';
    case 'INVALID_POWER':
      return 'Potencia invalida';
    case 'BALL_HOLED':
      return 'Ya has terminado este hoyo';
    case 'STALE_SEQUENCE':
      return 'Golpe duplicado ignorado';
    default:
      return 'Golpe rechazado';
  }
}
