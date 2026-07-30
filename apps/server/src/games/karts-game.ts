import {
  KARTS_COUNTDOWN_MS,
  KARTS_ELIMINATION_INTERVAL_MS,
  KARTS_MAX_RACE_MS,
  PHYSICS_DT,
  PHYSICS_HZ,
  SNAPSHOT_HZ,
  getKartTrack,
  type GameAction,
  type KartsPublicState,
  type KartsSettings,
  type TeamId,
} from '@arcade/shared';
import { KartsWorld } from '@arcade/game-engine';
import type { GameContext, GameRunner } from '../rooms/types.js';
import { rankPlayers, winnersFrom } from './scoring.js';

/**
 * Carrera de karts.
 *
 * El servidor es la unica autoridad: recibe intencion de conduccion acotada,
 * simula a 60 Hz y reparte snapshots a 20 Hz. El cliente no decide posiciones,
 * vueltas ni ganadores.
 */
export class KartsGame implements GameRunner {
  readonly id = 'karts' as const;
  private world: KartsWorld;
  private phase: KartsPublicState['phase'] = 'countdown';
  private loop: NodeJS.Timeout | null = null;
  private countdownMs = KARTS_COUNTDOWN_MS;
  private snapshotAccumulator = 0;
  private stateAccumulator = 0;
  private lastEliminationMs = 0;
  private teams: Record<string, TeamId> = {};
  private deadline = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly settings: KartsSettings,
  ) {
    this.world = new KartsWorld(
      getKartTrack(settings.track),
      ctx.players().map((player) => player.id),
      settings.laps,
    );
  }

  start(): void {
    this.phase = 'countdown';
    this.countdownMs = KARTS_COUNTDOWN_MS;
    this.deadline = Date.now() + KARTS_COUNTDOWN_MS;
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
          this.phase = 'racing';
          this.world.running = true;
          this.deadline = Date.now() + KARTS_MAX_RACE_MS;
          this.push();
        }
      } else if (this.phase === 'racing') {
        this.world.step(PHYSICS_DT);
        this.applyElimination();

        if (this.world.everyoneFinished() || this.world.raceMs >= KARTS_MAX_RACE_MS) {
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
      if (this.stateAccumulator >= PHYSICS_HZ) {
        this.stateAccumulator = 0;
        this.push();
      }
    }, stepMs);
  }

  /** En eliminatoria, cada intervalo cae quien va ultimo entre los activos. */
  private applyElimination(): void {
    if (this.settings.mode !== 'eliminatoria') return;
    if (this.world.raceMs - this.lastEliminationMs < KARTS_ELIMINATION_INTERVAL_MS) return;

    const active = this.world.standings().filter((kart) => !kart.eliminated && !kart.finished);
    if (active.length <= 1) return;

    const lastPlace = active[active.length - 1]!;
    this.world.eliminate(lastPlace.playerId);
    this.lastEliminationMs = this.world.raceMs;
    this.ctx.toast('Eliminado por ir último', lastPlace.playerId);
    this.push();
  }

  handleAction(playerId: string, action: GameAction): void {
    if (action.type !== 'karts:input') return;
    if (this.phase !== 'racing') return;
    const kart = this.world.getKart(playerId);
    if (!kart || kart.finished || kart.eliminated) return;
    this.world.setInput(playerId, {
      throttle: action.throttle,
      steer: action.steer,
      braking: action.braking,
    });
  }

  onPlayerLeft(playerId: string): void {
    this.world.removePlayer(playerId);
    delete this.teams[playerId];
    if (this.world.playerCount === 0) return;
    this.push();
  }

  onPlayerRejoined(playerId: string): void {
    this.world.addPlayer(playerId);
    this.ctx.broadcastSnapshot(this.world.snapshot());
    this.push();
  }

  publicState(): KartsPublicState {
    return {
      game: 'karts',
      phase: this.phase,
      mode: this.settings.mode,
      track: this.world.track,
      totalLaps: this.world.totalLaps,
      karts: this.world.standings(),
      countdownMs: Math.max(0, Math.round(this.countdownMs)),
      raceMs: Math.round(this.world.raceMs),
      nextEliminationMs:
        this.settings.mode === 'eliminatoria'
          ? Math.max(
              0,
              Math.round(
                KARTS_ELIMINATION_INTERVAL_MS - (this.world.raceMs - this.lastEliminationMs),
              ),
            )
          : null,
      teams: this.teams,
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
    const standings = this.world.standings();

    // La contrarreloj puntua por mejor vuelta; el resto por posicion.
    const byBestLap = this.settings.mode === 'contrarreloj';
    const rows = rankPlayers(
      this.ctx.players(),
      this.ctx.players().map((player) => {
        const kart = standings.find((entry) => entry.playerId === player.id);
        if (byBestLap) {
          const best = kart?.bestLapMs ?? null;
          return {
            playerId: player.id,
            // Sin vuelta valida se queda al final con un tiempo imposible.
            score: best ?? KARTS_MAX_RACE_MS,
            detail: best ? (best / 1000).toFixed(2) + ' s' : 'Sin vuelta valida',
          };
        }
        return {
          playerId: player.id,
          score: kart?.position ?? standings.length + 1,
          detail: kart?.eliminated
            ? 'Eliminado'
            : kart?.finished
              ? 'Vuelta ' + kart.lap + ' | ' + ((kart.totalMs ?? 0) / 1000).toFixed(1) + ' s'
              : 'Vuelta ' + (kart?.lap ?? 0),
        };
      }),
      { lowerIsBetter: true },
    );

    this.push();
    this.ctx.finish({
      game: 'karts',
      rows,
      winnerIds: winnersFrom(rows),
      finishedAt: Date.now(),
      extra: { mode: this.settings.mode, track: this.settings.track, laps: this.world.totalLaps },
    });
  }

  dispose(): void {
    this.stopLoop();
  }
}
