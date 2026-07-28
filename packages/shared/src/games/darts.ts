/** Modalidad 301. Diana con zonas simples, dobles, triples, bull y bullseye. */

export type DartRing = 'miss' | 'single' | 'double' | 'triple' | 'bull' | 'bullseye';

export interface DartThrow {
  /** Sector (1-20) o 25 para bull / bullseye. 0 si es fallo. */
  sector: number;
  ring: DartRing;
  points: number;
  /** Posicion normalizada del impacto en la diana, radio 1 = borde exterior. */
  x: number;
  y: number;
}

export interface DartsTurnHistoryEntry {
  playerId: string;
  throws: DartThrow[];
  scoreBefore: number;
  scoreAfter: number;
  bust: boolean;
}

/** Orden de los sectores de una diana estandar, empezando en el 20 (arriba). */
export const DART_SECTORS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

/** Radios normalizados (1 = borde exterior del anillo de dobles). */
export const DART_RADII = {
  bullseye: 0.037,
  bull: 0.094,
  tripleInner: 0.582,
  tripleOuter: 0.629,
  doubleInner: 0.953,
  doubleOuter: 1,
} as const;

/** Desviacion aleatoria aplicada por el servidor segun la dificultad elegida. */
export const DART_SPREAD: Record<'facil' | 'normal' | 'dificil', number> = {
  facil: 0.02,
  normal: 0.045,
  dificil: 0.08,
};

export const DARTS_PER_TURN = 3;

/** Convierte una posicion normalizada de impacto en puntuacion. */
export function resolveDartHit(x: number, y: number): DartThrow {
  const r = Math.hypot(x, y);
  if (r <= DART_RADII.bullseye) return { sector: 25, ring: 'bullseye', points: 50, x, y };
  if (r <= DART_RADII.bull) return { sector: 25, ring: 'bull', points: 25, x, y };
  if (r > DART_RADII.doubleOuter) return { sector: 0, ring: 'miss', points: 0, x, y };

  // El sector 20 esta centrado arriba; cada sector abarca 18 grados.
  let angle = Math.atan2(x, -y); // 0 = arriba, sentido horario
  if (angle < 0) angle += Math.PI * 2;
  const index = Math.floor((angle + Math.PI / 20) / (Math.PI / 10)) % 20;
  const sector = DART_SECTORS[index]!;

  if (r >= DART_RADII.tripleInner && r <= DART_RADII.tripleOuter) {
    return { sector, ring: 'triple', points: sector * 3, x, y };
  }
  if (r >= DART_RADII.doubleInner) {
    return { sector, ring: 'double', points: sector * 2, x, y };
  }
  return { sector, ring: 'single', points: sector, x, y };
}
