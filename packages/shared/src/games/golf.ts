/**
 * Tipos y constantes del minigolf. La geometria de los niveles es puramente
 * declarativa: el motor deriva las paredes a partir de los "pads" (suelo) y
 * anade las paredes extra que declare el nivel.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type GolfSurface = 'green' | 'sand' | 'ice' | 'turbo' | 'stone';

export type PadSide = 'top' | 'bottom' | 'left' | 'right';

/** Movimiento lineal de ida y vuelta, deterministico a partir del reloj del nivel. */
export interface LinearMotion {
  /** Desplazamiento maximo respecto a la posicion base. */
  offset: Vec2;
  /** Periodo completo (ida + vuelta) en segundos. */
  period: number;
  /** Desfase inicial en segundos. */
  phase: number;
}

export interface GolfPad {
  id: string;
  rect: Rect;
  surface: GolfSurface;
  /** Aceleracion constante de la superficie (pendientes o cintas), en u/s^2. */
  accel?: Vec2;
  /** Lados sin pared: el borde queda abierto y la bola puede caer al vacio. */
  open?: PadSide[];
  /** Plataforma flotante: no genera paredes automaticas. */
  floating?: boolean;
  motion?: LinearMotion;
}

export interface GolfWall {
  id: string;
  a: Vec2;
  b: Vec2;
  restitution: number;
  motion?: LinearMotion;
}

export interface GolfCircleObstacle {
  id: string;
  pos: Vec2;
  radius: number;
  restitution: number;
  kind: 'bumper' | 'rock';
}

/** Obstaculo rotatorio (molino, aspas, brazos giratorios). */
export interface GolfBlade {
  id: string;
  center: Vec2;
  armLength: number;
  armRadius: number;
  arms: number;
  /** Radianes por segundo. */
  angularSpeed: number;
  phase: number;
  restitution: number;
}

/** Rampa de salto: si la bola entra con velocidad suficiente, pasa a estar en el aire. */
export interface GolfRamp {
  id: string;
  rect: Rect;
  /** Direccion de subida de la rampa. Solo se activa si la bola va hacia ella. */
  dir: Vec2;
  minSpeed: number;
  flightTime: number;
  /** Multiplicador de velocidad al despegar. */
  boost: number;
  /** Si se indica, la rampa actua como trampolin y fija la direccion de vuelo. */
  launchDir?: Vec2;
}

/** Zona que actualiza el punto de reaparicion al pasar por encima. */
export interface GolfCheckpoint {
  id: string;
  rect: Rect;
  respawn: Vec2;
}

/** Zona de vacio con punto de reaparicion propio (permite continuar tras fallar). */
export interface GolfRespawnZone {
  id: string;
  rect: Rect;
  respawn: Vec2;
}

export type GolfDifficulty =
  'Fácil' | 'Fácil-media' | 'Media' | 'Media-alta' | 'Difícil' | 'Muy difícil' | 'Experto';

export interface GolfLevel {
  id: number;
  name: string;
  theme: string;
  difficulty: GolfDifficulty;
  par: number;
  /** true si el nivel esta disenado con una ruta valida de hoyo en uno. */
  aceRoute: boolean;
  hint: string;
  size: { w: number; h: number };
  /** Restitucion de las paredes generadas automaticamente a partir de los pads. */
  wallRestitution?: number;
  start: Vec2;
  hole: Vec2;
  pads: GolfPad[];
  walls: GolfWall[];
  circles: GolfCircleObstacle[];
  blades: GolfBlade[];
  ramps: GolfRamp[];
  checkpoints: GolfCheckpoint[];
  respawnZones: GolfRespawnZone[];
}

export const GOLF = {
  ballRadius: 7,
  holeRadius: 13,
  /** Velocidad maxima (u/s) que puede imprimirse con potencia 1. */
  maxShotSpeed: 900,
  /** Por debajo de esta velocidad la bola se considera detenida. */
  stopSpeed: 6,
  /** Velocidad maxima con la que una bola puede entrar en el hoyo. */
  holeCaptureSpeed: 430,
  /** Restitucion por defecto de las paredes. */
  wallRestitution: 0.72,
  /** Golpes de penalizacion al salir del recorrido (si esta activada). */
  outPenalty: 1,
  /** Golpes que suma el boton de reinicio manual. */
  manualResetPenalty: 1,
} as const;

/** Friccion lineal por superficie (1/s). Mayor valor = la bola frena antes. */
export const GOLF_SURFACE_FRICTION: Record<GolfSurface, number> = {
  green: 0.95,
  sand: 3.4,
  ice: 0.75,
  turbo: 0.5,
  stone: 0.7,
};

export const GOLF_SURFACE_COLORS: Record<GolfSurface, string> = {
  green: '#1c7a4b',
  sand: '#c9a86a',
  ice: '#7dd3fc',
  turbo: '#a855f7',
  stone: '#5b6472',
};

export interface GolfBallState {
  playerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Altura simulada durante los saltos (solo visual + reglas de vuelo). */
  z: number;
  airborne: boolean;
  strokes: number;
  holed: boolean;
  holedAtMs: number | null;
  ace: boolean;
  /** Se invalida el hoyo en uno si hubo reinicio o penalizacion en el nivel. */
  aceEligible: boolean;
  outOfBounds: boolean;
  finished: boolean;
}

export interface GolfSnapshot {
  tick: number;
  levelClockMs: number;
  timeLeftMs: number;
  balls: GolfBallState[];
}

export interface GolfHoleResult {
  playerId: string;
  strokes: number;
  timeMs: number;
  holed: boolean;
  ace: boolean;
}

export type GolfEventKind = 'ace' | 'holed' | 'out' | 'penalty' | 'reset' | 'maxStrokes' | 'timeUp';

export interface GolfFeedEvent {
  kind: GolfEventKind;
  playerId: string;
  levelId: number;
  atMs: number;
  strokes?: number;
}

/**
 * Desplazamiento de un movimiento lineal de ida y vuelta en un instante dado.
 * Vive en el paquete compartido para que servidor y cliente dibujen y simulen
 * exactamente el mismo estado de los obstaculos moviles.
 */
export function motionOffsetPublic(motion: LinearMotion, timeSec: number): Vec2 {
  const t = (timeSec + motion.phase) / motion.period;
  const phase = t - Math.floor(t);
  const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
  return { x: motion.offset.x * triangle, y: motion.offset.y * triangle };
}
