import {
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  assignTeams,
  type GameAction,
  type HeadBasketballSettings,
  type HeadSoccerSettings,
  type HeadSportId,
  type HeadSportPublicState,
  type TeamId,
} from '@arcade/shared';
import { HeadSportWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers } from './scoring.js';

const COUNTDOWN_MS = 3000;
const MAX_MATCH_MS = 180_000;

type HeadSettings = HeadSoccerSettings | HeadBasketballSettings;

/** Adaptador de sala para fútbol y baloncesto de cabezones. */
export class HeadSportGame implements GameRunner {
  readonly id: HeadSportId;
  private readonly world: HeadSportWorld;
  private readonly targetScore: number;
  private phase: HeadSportPublicState['phase'] = 'countdown';
  private loop: NodeJS.Timeout | null = null;
  private countdownMs = COUNTDOWN_MS;
  private deadline = 0;
  private snapshotAccumulator = 0;
  private stateAccumulator = 0;

  constructor(
    game: HeadSportId,
    private readonly ctx: GameContext,
    private readonly settings: HeadSettings,
  ) {
    this.id = game;
    const ids = ctx.players().map((player) => player.id);
    const teams = assignTeams(ids);
    const speedScale =
      (game === 'head-soccer' && settings.mode === 'turbo') ||
      (game === 'head-basketball' && settings.mode === 'rapido')
        ? 1.25
        : 1;
    const gravityScale = game === 'head-basketball' && settings.mode === 'gravedad-baja' ? 0.62 : 1;
    this.world = new HeadSportWorld(game, ids, teams, speedScale, gravityScale);
    this.targetScore = this.resolveTargetScore();
  }

  start(): void {
    this.phase = 'countdown';
    this.countdownMs = COUNTDOWN_MS;
    this.deadline = Date.now() + COUNTDOWN_MS;
    this.push();
    this.startLoop();
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'head-sport:input' || action.game !== this.id || this.phase !== 'playing')
      return;
    this.world.setInput(playerId, {
      moveX: action.moveX,
      jump: action.jump,
      kick: action.kick,
    });
  }

  onPlayerLeft(playerId: string): void {
    this.world.removePlayer(playerId);
    if (this.phase === 'playing' && (!this.world.hasTeam('rojo') || !this.world.hasTeam('azul'))) {
      this.finish();
      return;
    }
    this.push();
  }

  onPlayerRejoined(): void {
    this.ctx.broadcastSnapshot(this.world.snapshot());
    this.push();
  }

  publicState(): HeadSportPublicState {
    return {
      game: this.id,
      phase: this.phase,
      mode: this.settings.mode,
      targetScore: this.targetScore,
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
    const snapshotEvery = Math.round(PHYSICS_HZ / SNAPSHOT_HZ);
    this.loop = setInterval(() => {
      if (this.phase === 'countdown') {
        this.countdownMs -= stepMs;
        if (this.countdownMs <= 0) {
          this.phase = 'playing';
          this.world.running = true;
          this.deadline = Date.now() + MAX_MATCH_MS;
          this.push();
        }
      } else if (this.phase === 'playing') {
        this.world.step(PHYSICS_DT);
        for (const event of this.world.drainEvents()) {
          if (event.kind === 'head-score') this.ctx.broadcastEvent(event);
        }
        if (this.isOver()) {
          this.finish();
          return;
        }
      }

      this.snapshotAccumulator += 1;
      if (this.snapshotAccumulator >= snapshotEvery) {
        this.snapshotAccumulator = 0;
        this.ctx.broadcastSnapshot(this.world.snapshot());
      }
      this.stateAccumulator += 1;
      if (this.stateAccumulator >= PHYSICS_HZ / 2) {
        this.stateAccumulator = 0;
        this.push();
      }
    }, stepMs);
  }

  private resolveTargetScore(): number {
    if (this.id === 'head-soccer') {
      const settings = this.settings as HeadSoccerSettings;
      return settings.mode === 'gol-de-oro' ? 1 : settings.goalLimit;
    }
    const settings = this.settings as HeadBasketballSettings;
    return settings.mode === 'rapido' ? 6 : settings.pointsToWin;
  }

  private isOver(): boolean {
    if (this.world.scores.rojo >= this.targetScore || this.world.scores.azul >= this.targetScore) {
      return true;
    }
    return this.world.matchMs >= MAX_MATCH_MS && this.world.scores.rojo !== this.world.scores.azul;
  }

  private finish(): void {
    if (this.phase === 'finished') return;
    this.phase = 'finished';
    this.world.running = false;
    this.stopLoop();
    const red = this.world.hasTeam('rojo') ? this.world.scores.rojo : -1;
    const blue = this.world.hasTeam('azul') ? this.world.scores.azul : -1;
    const winningTeams: TeamId[] =
      red === blue ? ['rojo', 'azul'] : red > blue ? ['rojo'] : ['azul'];
    const players = this.ctx.players();
    const rows = rankPlayers(
      players,
      players.map((player) => {
        const team = this.world.teams[player.id] ?? 'rojo';
        const own = this.world.scores[team];
        const rival = this.world.scores[team === 'rojo' ? 'azul' : 'rojo'];
        return {
          playerId: player.id,
          score: own,
          tiebreak: -rival,
          detail: 'Equipo ' + team + ' · ' + own + '-' + rival,
        };
      }),
    );
    const winnerIds = players
      .filter((player) => winningTeams.includes(this.world.teams[player.id] ?? 'rojo'))
      .map((player) => player.id);
    this.push();
    this.ctx.finish({
      game: this.id,
      rows,
      winnerIds,
      finishedAt: Date.now(),
      extra: { mode: this.settings.mode, scores: { ...this.world.scores } },
    });
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}
