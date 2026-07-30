/**
 * Karts: circuitos, constantes de conduccion y tipos compartidos.
 *
 * Un circuito se describe con una lista ordenada de "puertas": cada puerta es un
 * segmento que cruza la pista de lado a lado. De esa unica estructura salen tres
 * cosas a la vez, sin datos duplicados que puedan desincronizarse:
 *   - los muros, uniendo los extremos izquierdos entre si y los derechos entre si;
 *   - los checkpoints, que son las propias puertas y deben cruzarse en orden;
 *   - la linea de meta, que es la puerta cero.
 */

export interface KartPoint {
  x: number;
  y: number;
}

export interface KartGate {
  left: KartPoint;
  right: KartPoint;
}

export interface KartTrack {
  id: string;
  name: string;
  description: string;
  /** Puertas en orden de recorrido. La primera es la linea de meta. */
  gates: KartGate[];
  size: { w: number; h: number };
  /** Vueltas por defecto del circuito. */
  laps: number;
}

export const KART = {
  radius: 11,
  /** Velocidad maxima en recta (u/s). */
  maxSpeed: 330,
  reverseSpeed: 110,
  accel: 260,
  brake: 420,
  /** Rozamiento cuando no se acelera (1/s). */
  drag: 0.9,
  /** Giro maximo en radianes por segundo. */
  turnRate: 2.6,
  wallRestitution: 0.35,
  /** Fraccion de velocidad que se conserva al rozar un muro. */
  wallSpeedLoss: 0.55,
} as const;

export const KARTS_COUNTDOWN_MS = 3500;
export const KARTS_MAX_RACE_MS = 5 * 60 * 1000;
/** Cada cuanto se elimina al ultimo clasificado en el modo eliminatoria. */
export const KARTS_ELIMINATION_INTERVAL_MS = 25000;

export interface KartState {
  playerId: string;
  x: number;
  y: number;
  /** Orientacion en radianes. */
  heading: number;
  speed: number;
  lap: number;
  /** Indice de la ultima puerta cruzada. */
  gate: number;
  finished: boolean;
  eliminated: boolean;
  /** Mejor vuelta en ms, o null si aun no completo ninguna. */
  bestLapMs: number | null;
  totalMs: number | null;
  position: number;
}

export interface KartsSnapshot {
  tick: number;
  raceMs: number;
  karts: KartState[];
}

/** Entrada de conduccion que envia el cliente. El servidor la acota siempre. */
export interface KartInput {
  /** -1 marcha atras, 0 inercia, 1 acelerar. */
  throttle: number;
  /** -1 izquierda, 1 derecha. */
  steer: number;
  braking: boolean;
}

/** Construye una puerta a partir del centro de pista, el ancho y el angulo. */
function gate(x: number, y: number, angle: number, width: number): KartGate {
  const nx = Math.cos(angle + Math.PI / 2);
  const ny = Math.sin(angle + Math.PI / 2);
  return {
    left: { x: x + nx * (width / 2), y: y + ny * (width / 2) },
    right: { x: x - nx * (width / 2), y: y - ny * (width / 2) },
  };
}

/** Genera un ovalo cerrado con el numero de puertas indicado. */
function ovalGates(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  width: number,
  count: number,
): KartGate[] {
  const gates: KartGate[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const x = cx + Math.cos(t) * rx;
    const y = cy + Math.sin(t) * ry;
    // Tangente de la elipse en ese punto.
    const angle = Math.atan2(Math.cos(t) * ry, -Math.sin(t) * rx);
    gates.push(gate(x, y, angle, width));
  }
  return gates;
}

/** Circuito 1: óvalo rápido, ideal para aprender los controles. */
const OVALO: KartTrack = {
  id: 'ovalo',
  name: 'Óvalo Neón',
  description: 'Trazado rápido y ancho. Dos curvas largas y dos rectas para adelantar.',
  gates: ovalGates(500, 320, 330, 200, 120, 16),
  size: { w: 1000, h: 640 },
  laps: 3,
};

/**
 * Circuito 2: trazado tecnico.
 * Se genera con una elipse deformada para garantizar que el recorrido no se
 * cruza consigo mismo: un trazado dibujado a mano puede solaparse y romper el
 * conteo de vueltas.
 */
const TECNICO: KartTrack = {
  id: 'tecnico',
  name: 'Circuito Vértigo',
  description: 'Curvas de radio variable y pista más estrecha. Premia frenar antes de girar.',
  gates: (() => {
    const gates: KartGate[] = [];
    const count = 22;
    for (let i = 0; i < count; i++) {
      const t = (i / count) * Math.PI * 2;
      // Radio variable: crea zonas rapidas y horquillas sin auto-interseccion.
      const rx = 300 + Math.cos(t * 2) * 70;
      const ry = 190 + Math.sin(t * 3) * 45;
      const x = 500 + Math.cos(t) * rx;
      const y = 320 + Math.sin(t) * ry;
      const next = ((i + 1) / count) * Math.PI * 2;
      const nx = 500 + Math.cos(next) * (300 + Math.cos(next * 2) * 70);
      const ny = 320 + Math.sin(next) * (190 + Math.sin(next * 3) * 45);
      const angle = Math.atan2(ny - y, nx - x);
      gates.push(gate(x, y, angle, 96));
    }
    return gates;
  })(),
  size: { w: 1000, h: 640 },
  laps: 3,
};

export const KART_TRACKS: KartTrack[] = [OVALO, TECNICO];

export function getKartTrack(id: string): KartTrack {
  return KART_TRACKS.find((track) => track.id === id) ?? OVALO;
}

/** Centro de una puerta, util para colocar la parrilla y dibujar el trazado. */
export function gateCenter(g: KartGate): KartPoint {
  return { x: (g.left.x + g.right.x) / 2, y: (g.left.y + g.right.y) / 2 };
}
