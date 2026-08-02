import {
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  type GameAction,
  type TanksPublicState,
  type TanksSettings,
} from '@arcade/shared';
import { TanksWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers } from './scoring.js';

const COUNTDOWN_MS = 3000;
const RESOLVE_MS = 1100;
const MAX_MATCH_MS = 300_000;

/** Adaptador de sala para el duelo de artillería por turnos. */
export class TanksGame implements GameRunner {
  readonly id = 'tanks' as const;
  private readonly world: TanksWorld;
  private readonly order: string[];
  private readonly turnDurationMs: number;
  private phase: TanksPublicState['phase'] = 'countdown';
  private activePlayerId: string;
  private turnIndex = -1;
  private turnNumber = 0;
  private countdownMs = COUNTDOWN_MS;
  private resolvingMs = 0;
  private deadline = 0;
  private startedAt = 0;
  private loop: NodeJS.Timeout | null = null;
  private stateAccumulator = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: TanksSettings,
  ) {
    this.order = ctx.players().map((player) => player.id);
    this.activePlayerId = this.order[0] ?? '';
    this.turnDurationMs = settings.mode === 'blitz' ? 18_000 : 32_000;
    this.world = new TanksWorld(this.order, settings.map, settings.mode);
  }

  start(): void {
    this.phase = 'countdown';
    this.countdownMs = COUNTDOWN_MS;
    this.deadline = Date.now() + COUNTDOWN_MS;
    this.startedAt = Date.now() + COUNTDOWN_MS;
    this.push();
    this.startLoop();
  }

  handleAction(playerId: string, action: GameAction): void {
    if (this.phase !== 'aiming' || playerId !== this.activePlayerId) return;
    if (action.type === 'tanks:move') {
      if (!this.world.moveTank(playerId, action.direction)) {
        this.ctx.toast('No puedes avanzar más en esa dirección.', playerId);
        return;
      }
      this.push();
      return;
    }
    if (action.type !== 'tanks:fire') return;
    if (!this.world.fire(playerId, action.angle, action.power)) return;
    this.phase = 'projectile';
    this.deadline = 0;
    this.broadcastWorldEvents();
    this.push();
  }

  onPlayerLeft(playerId: string): void {
    this.world.removePlayer(playerId);
    if (this.phase === 'finished') return;
    if (this.world.aliveIds.length <= 1) {
      this.finish();
      return;
    }
    if (playerId === this.activePlayerId && this.phase === 'aiming') this.beginNextTurn();
    this.push();
  }

  onPlayerRejoined(): void {
    this.push();
  }

  publicState(): TanksPublicState {
    return {
      game: 'tanks',
      phase: this.phase,
      mode: this.settings.mode,
      map: this.settings.map,
      order: this.order.slice(),
      activePlayerId: this.activePlayerId,
      turnNumber: this.turnNumber,
      turnDurationMs: this.turnDurationMs,
      countdownMs: Math.max(0, Math.round(this.countdownMs)),
      deadline: this.deadline,
      ...this.world.snapshot(),
    };
  }

  dispose(): void {
    this.stopLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    const stepMs = 1000 / PHYSICS_HZ;
    const stateEvery = Math.round(PHYSICS_HZ / SNAPSHOT_HZ);
    this.loop = setInterval(() => {
      if (this.phase === 'countdown') {
        this.countdownMs -= stepMs;
        if (this.countdownMs <= 0) this.beginNextTurn();
      } else if (this.phase === 'aiming') {
        if (Date.now() >= this.deadline) this.autoFire();
      } else if (this.phase === 'projectile') {
        this.world.step(PHYSICS_DT);
        this.broadcastWorldEvents();
        if (!this.world.hasProjectile()) {
          this.phase = 'resolving';
          this.resolvingMs = RESOLVE_MS;
          this.deadline = Date.now() + RESOLVE_MS;
          this.push();
        }
      } else if (this.phase === 'resolving') {
        this.world.step(PHYSICS_DT);
        this.resolvingMs -= stepMs;
        if (this.resolvingMs <= 0) {
          if (this.world.aliveIds.length <= 1 || Date.now() - this.startedAt >= MAX_MATCH_MS) {
            this.finish();
            return;
          }
          this.beginNextTurn();
        }
      }

      this.stateAccumulator += 1;
      if (this.stateAccumulator >= stateEvery) {
        this.stateAccumulator = 0;
        this.push();
      }
    }, stepMs);
  }

  private autoFire(): void {
    const tank = this.world.tanks.find((entry) => entry.playerId === this.activePlayerId);
    if (!tank || !this.world.fire(this.activePlayerId, tank.angle, tank.power)) {
      this.beginNextTurn();
      return;
    }
    this.ctx.toast('Tiempo agotado: disparo automático.', this.activePlayerId);
    this.phase = 'projectile';
    this.deadline = 0;
    this.broadcastWorldEvents();
    this.push();
  }

  private beginNextTurn(): void {
    const alive = new Set(this.world.aliveIds);
    for (let offset = 0; offset < this.order.length; offset += 1) {
      this.turnIndex = (this.turnIndex + 1) % this.order.length;
      const candidate = this.order[this.turnIndex]!;
      if (!alive.has(candidate)) continue;
      this.activePlayerId = candidate;
      this.turnNumber += 1;
      this.phase = 'aiming';
      this.countdownMs = 0;
      this.deadline = Date.now() + this.turnDurationMs;
      this.world.beginTurn(candidate);
      this.push();
      return;
    }
    this.finish();
  }

  private finish(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.deadline = 0;
    this.stopLoop();
    const tanks = new Map(this.world.tanks.map((tank) => [tank.playerId, tank]));
    const players = this.ctx.players();
    const rows = rankPlayers(
      players,
      players.map((player) => {
        const tank = tanks.get(player.id);
        const health = tank?.health ?? 0;
        const kills = tank?.kills ?? 0;
        return {
          playerId: player.id,
          score: health + kills * 100,
          tiebreak: health,
          detail: health + ' PV · ' + kills + (kills === 1 ? ' baja' : ' bajas'),
        };
      }),
    );
    const bestRank = rows[0]?.rank;
    const winnerIds = rows.filter((row) => row.rank === bestRank).map((row) => row.playerId);
    this.push();
    this.ctx.finish({
      game: 'tanks',
      rows,
      winnerIds,
      finishedAt: Date.now(),
      extra: { mode: this.settings.mode, map: this.settings.map },
    });
  }

  private broadcastWorldEvents(): void {
    for (const event of this.world.drainEvents()) this.ctx.broadcastEvent(event);
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}
