import type { BotDifficulty, BotDifficultyMeta, GameAction, GamePublicState } from '@arcade/shared';

/**
 * Contexto que recibe una IA en cada decision.
 *
 * La memoria es un objeto libre por bot que sobrevive entre ticks: sirve para
 * guardar el instante de la ultima reaccion, el objetivo elegido o el estado
 * de los botones que se disparan por flanco.
 */
export interface BotThinkContext {
  botId: string;
  difficulty: BotDifficulty;
  meta: BotDifficultyMeta;
  /** Marca de tiempo del tick actual. */
  now: number;
  /** Milisegundos transcurridos desde el tick anterior. */
  dtMs: number;
  memory: BotMemory;
  /** Aleatoriedad inyectada para poder escribir pruebas deterministas. */
  random(): number;
}

export interface BotMemory {
  [key: string]: number | string | boolean | null | undefined;
}

/**
 * Cerebro de una IA.
 *
 * Devuelve las acciones que el servidor ejecutara en nombre del bot. Son
 * exactamente las mismas acciones que envia un cliente humano, asi que pasan
 * por la misma validacion y por el mismo runner: el juego no distingue.
 */
export interface BotBrain {
  think(state: GamePublicState, ctx: BotThinkContext): GameAction[];
}

/** Ruido simetrico acotado a [-amount, amount]. */
export function jitter(random: () => number, amount: number): number {
  return (random() * 2 - 1) * amount;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Diferencia angular mas corta entre dos angulos, en el rango [-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}
