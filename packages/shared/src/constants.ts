/** Constantes compartidas entre cliente y servidor. */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 16;

/** Longitud del código de sala. Alfabeto sin caracteres ambiguos. */
export const ROOM_CODE_LENGTH = 5;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Frecuencia de simulación del servidor (Hz) para juegos con física. */
export const PHYSICS_HZ = 60;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
/** Frecuencia de envío de snapshots a los clientes (Hz). */
export const SNAPSHOT_HZ = 20;

/** Colores asignados a los jugadores por orden de entrada. */
export const PLAYER_COLORS = ['#38bdf8', '#f472b6', '#facc15', '#4ade80', '#a78bfa'] as const;
/** Iconos/patrones para que la identidad no dependa únicamente del color. */
export const PLAYER_ICONS = ['circle', 'triangle', 'square', 'diamond', 'star'] as const;

export type PlayerIcon = (typeof PLAYER_ICONS)[number];

export const GAME_IDS = ['pool', 'quiz', 'darts', 'golf', 'bowling', 'karts', 'arena'] as const;
export type GameId = (typeof GAME_IDS)[number];

export const GAME_META: Record<GameId, { name: string; tagline: string; accent: string }> = {
  pool: { name: 'Billar', tagline: 'Mesa casual por turnos', accent: '#22d3ee' },
  quiz: { name: 'Quiz', tagline: '10 preguntas a contrarreloj', accent: '#f472b6' },
  darts: { name: 'Dardos', tagline: 'Modalidad 301', accent: '#fbbf24' },
  golf: { name: 'Minigolf', tagline: '10 hoyos del parque', accent: '#4ade80' },
  bowling: { name: 'Bolos', tagline: 'Diez frames, strikes y spares', accent: '#f87171' },
  karts: { name: 'Karts', tagline: 'Carreras por vueltas y checkpoints', accent: '#60a5fa' },
  arena: {
    name: 'Battle Royale',
    tagline: 'Último en pie con zona que se cierra',
    accent: '#e11d2e',
  },
};
