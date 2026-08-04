import {
  soloUsesBots,
  BOT_DIFFICULTY_META,
  type BotDifficulty,
  type GameAction,
  type GameId,
  type GamePublicState,
} from '@arcade/shared';
import { logger } from '../logger.js';
import { KartsBot } from './karts-bot.js';
import { ArenaBot } from './arena-bot.js';
import { ArcadeSportBot } from './arcade-sport-bot.js';
import { HeadSportBot } from './head-sport-bot.js';
import { TanksBot } from './tanks-bot.js';
import type { BotBrain, BotMemory, BotThinkContext } from './types.js';

export * from './types.js';

/** Frecuencia a la que piensan los bots. Muy por debajo de la fisica (60 Hz). */
export const BOT_TICK_HZ = 20;

export function createBotBrain(game: GameId): BotBrain | null {
  switch (game) {
    case 'karts':
      return new KartsBot();
    case 'arena':
      return new ArenaBot();
    case 'air-hockey':
    case 'table-tennis':
      return new ArcadeSportBot();
    case 'head-soccer':
    case 'head-basketball':
      return new HeadSportBot();
    case 'tanks':
      return new TanksBot();
    default:
      return null;
  }
}

export interface BotSeat {
  playerId: string;
  difficulty: BotDifficulty;
}

export interface BotDirectorDeps {
  /** Estado publico actual de la partida, o null si ya no hay partida. */
  state(): GamePublicState | null;
  /** Entrega la accion al runner exactamente igual que la de un humano. */
  dispatch(playerId: string, action: GameAction): void;
  random?(): number;
}

/**
 * Reloj de los bots.
 *
 * Consulta el estado publico de la partida, deja pensar a cada IA y entrega
 * sus acciones al runner. No toca la simulacion ni los sockets: el servidor
 * sigue siendo la unica autoridad y los bots quedan sometidos a las mismas
 * validaciones que cualquier jugador.
 */
export class BotDirector {
  private timer: NodeJS.Timeout | null = null;
  private lastTick = 0;
  private readonly memories = new Map<string, BotMemory>();

  constructor(
    private readonly brain: BotBrain,
    private readonly seats: BotSeat[],
    private readonly deps: BotDirectorDeps,
  ) {}

  static forGame(game: GameId, seats: BotSeat[], deps: BotDirectorDeps): BotDirector | null {
    if (!soloUsesBots(game) || seats.length === 0) return null;
    const brain = createBotBrain(game);
    return brain ? new BotDirector(brain, seats, deps) : null;
  }

  start(): void {
    this.stop();
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), Math.round(1000 / BOT_TICK_HZ));
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Un unico ciclo de decision. Se expone para poder probarlo sin temporizadores. */
  tick(now = Date.now()): void {
    const state = this.deps.state();
    if (!state) return;
    const dtMs = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    const random = this.deps.random ?? Math.random;

    for (const seat of this.seats) {
      let memory = this.memories.get(seat.playerId);
      if (!memory) {
        memory = {};
        this.memories.set(seat.playerId, memory);
      }
      const ctx: BotThinkContext = {
        botId: seat.playerId,
        difficulty: seat.difficulty,
        meta: BOT_DIFFICULTY_META[seat.difficulty],
        now,
        dtMs,
        memory,
        random,
      };
      try {
        for (const action of this.brain.think(state, ctx)) {
          this.deps.dispatch(seat.playerId, action);
        }
      } catch (error) {
        // Un fallo de una IA nunca debe tumbar la partida del jugador humano.
        logger.warn('Fallo al decidir la acción de un bot', String(error));
      }
    }
  }

  /** Retira a un bot del ciclo, por ejemplo al abandonar la sala. */
  removeSeat(playerId: string): void {
    const index = this.seats.findIndex((seat) => seat.playerId === playerId);
    if (index >= 0) this.seats.splice(index, 1);
    this.memories.delete(playerId);
  }
}
