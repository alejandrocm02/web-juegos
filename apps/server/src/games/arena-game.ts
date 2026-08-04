import {
  ARENA,
  ARENA_ZONE_PACE,
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  assignTeams,
  isTeamMode,
  type ArenaPublicState,
  type ArenaSettings,
  type GameAction,
  type TeamId,
} from '@arcade/shared';
import { ArenaWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers } from './scoring.js';

const COUNTDOWN_MS = 3000;

/**
 * Battle Royale.
 *
 * El servidor decide movimiento valido, dano, eliminaciones y victoria. El
 * cliente solo manda intencion y dibuja los snapshots, incluso cuando ya esta
 * eliminado: asi el modo espectador no necesita logica aparte.
 */
export class ArenaGame implements GameRunner {
  readonly id = 'arena' as const;
  private world: ArenaWorld;
  private phase: ArenaPublicState['phase'] = 'countdown';
  private loop: NodeJS.Timeout | null = null;
  private countdownMs = COUNTDOWN_MS;
  private snapshotAccumulator = 0;
  private stateAccumulator = 0;
  private teams: Record<string, TeamId> = {};
  private feed: ArenaPublicState['feed'] = [];
  private deadline = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: ArenaSettings,
  ) {
    const ids = ctx.players().map((player) => player.id);
    if (isTeamMode('arena', settings.mode)) this.teams = assignTeams(ids);
    this.world = new ArenaWorld(
      ids,
      this.teams,
      Date.now() % 2147483647,
      ARENA_ZONE_PACE[settings.zonePace],
    );
  }

  start(): void {
    this.phase = 'countdown';
    this.countdownMs = COUNTDOWN_MS;
    this.deadline = Date.now() + COUNTDOWN_MS;
    this.push();
    this.startLoop();
  }

  private startLoop(): void {
    this.stopLoop();
    const stepMs = 1000 / PHYSICS_HZ;
    const snapshotEvery = Math.round(PHYSICS_HZ / SNAPSHOT_HZ);

    this.loop = setInterval(() => {
      if (this.phase === 'countdown') {
        this.countdownMs -= stepMs;
        if (this.countdownMs <= 0) {
          this.phase = 'fighting';
          this.world.running = true;
          this.deadline = Date.now() + ARENA.maxMatchMs;
          this.push();
        }
      } else if (this.phase === 'fighting') {
        this.world.step(PHYSICS_DT);

        const events = this.world.drainEvents();
        if (events.length > 0) {
          const relevant = events.filter((event) => event.kind === 'kill');
          if (relevant.length > 0) {
            this.feed = [
              ...relevant.map((event) => ({
                kind: event.kind,
                playerId: event.playerId,
                targetId: event.targetId,
                atMs: event.atMs,
              })),
              ...this.feed,
            ].slice(0, 8);
            for (const event of relevant) this.ctx.broadcastEvent(event);
          }
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

  /** Fin de partida: un superviviente, un equipo, o se agota el tiempo. */
  private isOver(): boolean {
    if (this.world.matchMs >= ARENA.maxMatchMs) return true;
    if (isTeamMode('arena', this.settings.mode)) return this.world.aliveTeams().length <= 1;
    return this.world.aliveIds().length <= 1;
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'arena:input') return;
    if (this.phase !== 'fighting') return;
    const fighter = this.world.getFighter(playerId);
    // Un jugador eliminado es espectador: su intencion se ignora.
    if (!fighter || !fighter.alive) return;
    this.world.setInput(playerId, {
      moveX: action.moveX,
      moveY: action.moveY,
      facing: action.facing,
      attack: action.attack,
    });
  }

  onPlayerLeft(playerId: string): void {
    this.world.removePlayer(playerId);
    delete this.teams[playerId];
    if (this.world.playerCount === 0) return;
    if (this.phase === 'fighting' && this.isOver()) {
      this.finish();
      return;
    }
    this.push();
  }

  onPlayerRejoined(): void {
    this.ctx.broadcastSnapshot(this.world.snapshot());
    this.push();
  }

  publicState(): ArenaPublicState {
    const snapshot = this.world.snapshot();
    return {
      game: 'arena',
      phase: this.phase,
      mode: this.settings.mode,
      fighters: snapshot.fighters,
      pickups: this.settings.pickups ? snapshot.pickups : [],
      zone: snapshot.zone,
      matchMs: snapshot.matchMs,
      countdownMs: Math.max(0, Math.round(this.countdownMs)),
      aliveCount: this.world.aliveIds().length,
      teams: this.teams,
      feed: this.feed,
      deadline: this.deadline,
    };
  }

  private push(): void {
    this.ctx.broadcastState(this.publicState());
  }

  private stopLoop(): void {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }

  private finish(): void {
    this.phase = 'finished';
    this.stopLoop();

    // Los supervivientes se llevan la primera posicion.
    const survivors = this.world.aliveIds();
    this.world.awardVictory(survivors);
    const fighters = this.world.states;
    const teamMode = isTeamMode('arena', this.settings.mode);

    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const fighter = fighters.find((entry) => entry.playerId === player.id);
        const placement = fighter?.placement ?? fighters.length + 1;
        const detail = fighter?.alive
          ? 'Superviviente | ' + (fighter.kills ?? 0) + ' eliminaciones'
          : (fighter?.kills ?? 0) + ' eliminaciones';
        return {
          playerId: player.id,
          score: placement,
          // A igual posicion, desempata quien elimino mas.
          tiebreak: -(fighter?.kills ?? 0),
          detail: teamMode && this.teams[player.id] ? 'Equipo ' + this.teams[player.id] : detail,
        };
      }),
      { lowerIsBetter: true },
    );

    this.push();
    this.ctx.finish({
      game: 'arena',
      rows,
      winnerIds: rows.filter((row) => row.rank === 1).map((row) => row.playerId),
      finishedAt: Date.now(),
      extra: {
        mode: this.settings.mode,
        survivors,
        kills: Object.fromEntries(fighters.map((entry) => [entry.playerId, entry.kills ?? 0])),
      },
    });
  }

  dispose(): void {
    this.stopLoop();
  }
}
