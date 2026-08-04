/**
 * Modo individual: practicar en solitario cualquiera de los juegos.
 *
 * Una sala de practica es una sala normal con un unico jugador humano. La
 * diferencia esta en dos puntos:
 *
 *  - Los juegos de duelo en tiempo real reciben rivales controlados por el
 *    servidor (bots). Se comportan como jugadores mas: ocupan un hueco en la
 *    sala, tienen color e icono y el juego no sabe que no son humanos.
 *  - Al terminar, el servidor calcula una marca personal y la compara con la
 *    mejor guardada para ese perfil anonimo.
 *
 * Aqui viven las piezas que cliente y servidor deben interpretar igual.
 */

import type { GameId } from '../constants.js';
import type { MatchResult } from '../room.js';
import { GAME_MODE_CATALOG, isTeamMode } from './modes.js';

/* -------------------------------------------------------------------------- */
/*  Dificultad de los bots                                                     */
/* -------------------------------------------------------------------------- */

export const BOT_DIFFICULTIES = ['facil', 'normal', 'dificil'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

export interface BotDifficultyMeta {
  name: string;
  description: string;
  /** Destreza normalizada. Cada IA la traduce a su propio comportamiento. */
  skill: number;
  /** Error aleatorio maximo que se aplica a las decisiones, en tanto por uno. */
  noise: number;
  /** Retardo de reaccion en milisegundos. */
  reactionMs: number;
}

export const BOT_DIFFICULTY_META: Record<BotDifficulty, BotDifficultyMeta> = {
  facil: {
    name: 'Fácil',
    description: 'Reaccionan tarde y fallan a menudo. Ideal para aprender los controles.',
    skill: 0.42,
    noise: 0.34,
    reactionMs: 260,
  },
  normal: {
    name: 'Normal',
    description: 'Rivales equilibrados: cometen errores, pero castigan los tuyos.',
    skill: 0.68,
    noise: 0.18,
    reactionMs: 150,
  },
  dificil: {
    name: 'Difícil',
    description: 'Apuntan fino y apenas dejan hueco. Para pulir la técnica.',
    skill: 0.92,
    noise: 0.07,
    reactionMs: 70,
  },
};

/* -------------------------------------------------------------------------- */
/*  Que juegos llevan bots                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Juegos de duelo en tiempo real. Sin rival la partida no tiene sentido, asi
 * que el modo individual añade bots.
 */
export const SOLO_BOT_GAMES = [
  'karts',
  'arena',
  'air-hockey',
  'table-tennis',
  'head-soccer',
  'head-basketball',
  'tanks',
] as const;
export type SoloBotGame = (typeof SOLO_BOT_GAMES)[number];

/**
 * Juegos por turnos o de preguntas. En solitario se juegan tal cual y lo que
 * importa es superar la marca propia.
 */
export const SOLO_PRACTICE_GAMES = [
  'pool',
  'quiz',
  'darts',
  'golf',
  'bowling',
  'blackjack',
  'songless',
] as const;
export type SoloPracticeGame = (typeof SOLO_PRACTICE_GAMES)[number];

export function soloUsesBots(game: GameId): game is SoloBotGame {
  return (SOLO_BOT_GAMES as readonly string[]).includes(game);
}

/** Numero de bots permitido en cada juego que los usa. */
export const SOLO_BOT_RANGE: Record<SoloBotGame, { min: number; max: number; preferred: number }> =
  {
    karts: { min: 1, max: 4, preferred: 3 },
    arena: { min: 1, max: 4, preferred: 3 },
    'air-hockey': { min: 1, max: 3, preferred: 1 },
    'table-tennis': { min: 1, max: 3, preferred: 1 },
    'head-soccer': { min: 1, max: 3, preferred: 1 },
    'head-basketball': { min: 1, max: 3, preferred: 1 },
    tanks: { min: 1, max: 4, preferred: 2 },
  };

/** Nombres, colores e iconos propios del parque para los rivales del servidor. */
export const BOT_NAMES = ['Chispa', 'Tuerca', 'Neón', 'Bólido'] as const;

export function botRangeFor(game: GameId): { min: number; max: number; preferred: number } {
  return soloUsesBots(game) ? SOLO_BOT_RANGE[game] : { min: 0, max: 0, preferred: 0 };
}

/** Acota el numero de bots al rango valido del juego elegido. */
export function clampBotCount(game: GameId, count: number): number {
  const range = botRangeFor(game);
  if (range.max === 0) return 0;
  return Math.min(range.max, Math.max(range.min, Math.round(count)));
}

/* -------------------------------------------------------------------------- */
/*  Configuracion de la sala individual                                        */
/* -------------------------------------------------------------------------- */

export interface SoloConfig {
  botCount: number;
  botDifficulty: BotDifficulty;
}

export function defaultSoloConfig(game: GameId): SoloConfig {
  return { botCount: botRangeFor(game).preferred, botDifficulty: 'normal' };
}

/* -------------------------------------------------------------------------- */
/*  Modos compatibles con la práctica                                          */
/* -------------------------------------------------------------------------- */

/**
 * true si un modo se puede jugar con el numero de participantes indicado.
 *
 * En cuanto hay bots la sala se comporta como una partida normal y todos los
 * modos valen. Con un unico participante hay dos excepciones que no tendrian
 * sentido: los modos por equipos, que repartirian a una sola persona en dos
 * bandos, y la bola 8, que necesita un rival al que asignarle el otro grupo.
 */
export function soloSupportsMode(game: GameId, modeId: string, participants: number): boolean {
  if (participants >= 2) return true;
  if (isTeamMode(game, modeId)) return false;
  if (game === 'pool' && modeId === 'bola8') return false;
  return true;
}

/** Modos que el selector debe ofrecer en una sala de práctica. */
export function soloModesFor(game: GameId, participants: number): string[] {
  return (GAME_MODE_CATALOG[game] ?? [])
    .filter((mode) => soloSupportsMode(game, mode.id, participants))
    .map((mode) => mode.id);
}

/**
 * Devuelve un modo válido para la práctica.
 *
 * Si el elegido no lo es (por ejemplo al pasar de una sala con bots a una sin
 * ellos), cae al primer modo compatible en vez de dejar la sala bloqueada.
 */
export function coerceSoloMode(game: GameId, modeId: string, participants: number): string {
  if (soloSupportsMode(game, modeId, participants)) return modeId;
  return soloModesFor(game, participants)[0] ?? modeId;
}

/* -------------------------------------------------------------------------- */
/*  Marcas personales                                                          */
/* -------------------------------------------------------------------------- */

export type SoloRecordFormat = 'puntos' | 'golpes' | 'tiempo' | 'posicion' | 'dardos';

export interface SoloRecordMeta {
  /** Texto corto que describe la marca. */
  label: string;
  /** Frase que explica como se mejora. */
  goal: string;
  lowerIsBetter: boolean;
  format: SoloRecordFormat;
}

export const SOLO_RECORD_META: Record<GameId, SoloRecordMeta> = {
  pool: {
    label: 'Bolas embocadas',
    goal: 'Emboca más bolas de color sin colar la blanca.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  quiz: {
    label: 'Puntos',
    goal: 'Acierta más preguntas y responde antes.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  darts: {
    label: 'Dardos para cerrar',
    goal: 'Llega a cero usando menos dardos.',
    lowerIsBetter: true,
    format: 'dardos',
  },
  golf: {
    label: 'Golpes totales',
    goal: 'Completa los hoyos con menos golpes.',
    lowerIsBetter: true,
    format: 'golpes',
  },
  bowling: {
    label: 'Bolos',
    goal: 'Encadena strikes para subir la tarjeta.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  karts: {
    label: 'Mejor vuelta',
    goal: 'Traza mejor las curvas y baja el crono.',
    lowerIsBetter: true,
    format: 'tiempo',
  },
  arena: {
    label: 'Eliminaciones',
    goal: 'Sobrevive a la zona y elimina a más rivales.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  blackjack: {
    label: 'Fichas',
    goal: 'Gana más manos contra el crupier.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  songless: {
    label: 'Puntos',
    goal: 'Reconoce las melodías con menos fragmentos.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  'air-hockey': {
    label: 'Goles a favor',
    goal: 'Marca más y encaja menos que los bots.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  'table-tennis': {
    label: 'Puntos ganados',
    goal: 'Gana peloteos largos sin fallar.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  'head-soccer': {
    label: 'Goles a favor',
    goal: 'Remata más goles que el rival.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  'head-basketball': {
    label: 'Canastas',
    goal: 'Encesta más que los bots.',
    lowerIsBetter: false,
    format: 'puntos',
  },
  tanks: {
    label: 'Bajas',
    goal: 'Calcula el viento y destruye más tanques.',
    lowerIsBetter: false,
    format: 'puntos',
  },
};

/** Marca personal guardada para un perfil anonimo. */
export interface SoloRecord {
  game: GameId;
  /** Mejor valor conseguido segun `SOLO_RECORD_META[game]`. */
  value: number;
  detail: string;
  difficulty: BotDifficulty | null;
  plays: number;
  wins: number;
  updatedAt: number;
}

/** Resultado de comparar la partida recien terminada con la marca anterior. */
export interface SoloOutcome {
  game: GameId;
  value: number;
  detail: string;
  won: boolean;
  improved: boolean;
  previousValue: number | null;
  record: SoloRecord;
}

interface ExtraNumbers {
  [playerId: string]: number;
}

function numberFrom(source: unknown, playerId: string): number | null {
  if (!source || typeof source !== 'object') return null;
  const value = (source as ExtraNumbers)[playerId];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Extrae la marca de la partida para un jugador.
 *
 * Se apoya en la fila de puntuacion que ya calcula cada juego y, cuando hace
 * falta un dato mas fino (dardos usados, mejor vuelta, eliminaciones), en el
 * bloque `extra` que el propio juego rellena.
 */
export function soloRecordValue(
  result: MatchResult,
  playerId: string,
): { value: number; detail: string } | null {
  const row = result.rows.find((entry) => entry.playerId === playerId);
  if (!row) return null;
  const extra = result.extra ?? {};

  switch (result.game) {
    case 'darts': {
      const throws = numberFrom(extra.throws, playerId);
      // Sin cierre no hay marca valida: la practica solo cuenta si llegas a 0.
      if (throws === null || row.score > 0) return null;
      return { value: throws, detail: throws + ' dardos para cerrar' };
    }
    case 'karts': {
      const bestLap = numberFrom(extra.bestLaps, playerId);
      if (bestLap === null || bestLap <= 0) return null;
      return { value: Math.round(bestLap), detail: (bestLap / 1000).toFixed(2) + ' s por vuelta' };
    }
    case 'arena': {
      const kills = numberFrom(extra.kills, playerId) ?? 0;
      const placement = row.score;
      return {
        value: kills,
        detail: kills + (kills === 1 ? ' eliminación' : ' eliminaciones') + ' · ' + placement + 'º',
      };
    }
    case 'golf': {
      const aces = numberFrom(extra.aces, playerId) ?? 0;
      return {
        value: row.score,
        detail: row.score + ' golpes' + (aces > 0 ? ' · ' + aces + ' hoyo(s) en uno' : ''),
      };
    }
    case 'tanks': {
      const kills = numberFrom(extra.kills, playerId) ?? 0;
      return { value: kills, detail: kills + (kills === 1 ? ' baja' : ' bajas') };
    }
    default:
      return { value: row.score, detail: row.detail ?? String(row.score) };
  }
}

/** true si `value` mejora la marca anterior del juego. */
export function improvesRecord(game: GameId, value: number, previous: number | null): boolean {
  if (previous === null) return true;
  return SOLO_RECORD_META[game].lowerIsBetter ? value < previous : value > previous;
}

/** Texto listo para mostrar una marca en la interfaz. */
export function formatSoloRecord(game: GameId, value: number): string {
  const meta = SOLO_RECORD_META[game];
  switch (meta.format) {
    case 'tiempo':
      return (value / 1000).toFixed(2) + ' s';
    case 'golpes':
      return value + ' golpes';
    case 'dardos':
      return value + ' dardos';
    case 'posicion':
      return value + 'º';
    default:
      return String(value);
  }
}
