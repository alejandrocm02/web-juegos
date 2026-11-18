export const TANK_MAP_IDS = ['canon-carmesi', 'fortaleza-neon', 'crater-lunar'] as const;
export type TankMapId = (typeof TANK_MAP_IDS)[number];

/**
 * Campo de batalla visto de lado.
 *
 * Desde el 18 nov. de 2026 mide 2200 de ancho (antes 1000): la pantalla
 * enseña un tramo y la cámara sigue al tanque activo y al proyectil. El alto no
 * cambia.
 */
export const TANK_FIELD = {
  width: 2200,
  height: 600,
  groundY: 528,
  tankWidth: 58,
  tankHeight: 30,
  projectileRadius: 8,
  explosionRadius: 82,
} as const;

/**
 * Balística común del servidor, los bots y la trayectoria prevista de las dos
 * vistas. Antes cada uno copiaba los números; ahora salen de aquí.
 */
export const TANK_BALLISTICS = {
  /** Velocidad de salida con potencia 0 y lo que suma la potencia 1 (u/s). */
  baseSpeed: 380,
  powerSpeed: 560,
  gravity: 350,
  /** Aceleración horizontal del viento a intensidad 1 (u/s²). */
  windAccel: 58,
  /** Distancia del centro del tanque a la boca del cañón. */
  muzzle: 42,
  /** Por encima de esta altura el proyectil se da por perdido. */
  ceilingY: -1600,
  /** Desplazamientos por turno y lo que avanza cada uno. */
  movesPerTurn: 4,
  moveStep: 48,
} as const;

export function tankShotSpeed(power: number): number {
  return TANK_BALLISTICS.baseSpeed + power * TANK_BALLISTICS.powerSpeed;
}

/** Aspecto de un obstáculo. Solo cambia el dibujo: todos chocan igual. */
export type TankObstacleKind = 'rock' | 'spire' | 'bunker' | 'sandbags' | 'wall' | 'tower' | 'ruin';

export interface TankObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kind?: TankObstacleKind;
}

/** Decorado sin colisión: cráteres, alambradas, árboles, restos y banderas. */
export interface TankDecor {
  kind: 'crater' | 'wire' | 'tree' | 'wreck' | 'flag' | 'post';
  x: number;
  /** Ancho aproximado en unidades del campo. */
  size: number;
}

export interface TankMap {
  id: TankMapId;
  name: string;
  description: string;
  obstacles: TankObstacle[];
  decor: TankDecor[];
}

const G = TANK_FIELD.groundY;
/** Obstáculo apoyado en el suelo. */
const block = (
  id: string,
  kind: TankObstacleKind,
  x: number,
  width: number,
  height: number,
): TankObstacle => ({ id, kind, x, y: G - height, width, height });

export const TANK_MAPS: TankMap[] = [
  {
    id: 'canon-carmesi',
    name: 'Cañón Carmesí',
    description:
      'Desierto rojo con una gran aguja en el centro, trincheras de sacos terreros y dos búnkeres.',
    obstacles: [
      block('aguja', 'spire', 1055, 90, 184),
      block('sacos-oeste', 'sandbags', 330, 76, 34),
      block('bunker-oeste', 'bunker', 640, 110, 72),
      block('roca-centro-oeste', 'rock', 880, 54, 46),
      block('roca-centro-este', 'rock', 1270, 54, 46),
      block('bunker-este', 'bunker', 1450, 110, 72),
      block('sacos-este', 'sandbags', 1794, 76, 34),
    ],
    decor: [
      { kind: 'crater', x: 230, size: 80 },
      { kind: 'wire', x: 470, size: 110 },
      { kind: 'tree', x: 560, size: 46 },
      { kind: 'crater', x: 790, size: 110 },
      { kind: 'wreck', x: 980, size: 70 },
      { kind: 'flag', x: 1100, size: 30 },
      { kind: 'crater', x: 1380, size: 90 },
      { kind: 'tree', x: 1630, size: 52 },
      { kind: 'wire', x: 1620, size: 110 },
      { kind: 'crater', x: 1960, size: 80 },
    ],
  },
  {
    id: 'fortaleza-neon',
    name: 'Fortaleza Neón',
    description:
      'Base fortificada: muros de hormigón, dos búnkeres altos y una torre de vigilancia en tierra de nadie.',
    obstacles: [
      block('bunker-oeste', 'bunker', 520, 96, 120),
      block('muro-oeste', 'wall', 300, 34, 96),
      block('sacos-oeste', 'sandbags', 800, 80, 34),
      block('torre', 'tower', 1080, 40, 220),
      block('sacos-este', 'sandbags', 1320, 80, 34),
      block('muro-este', 'wall', 1866, 34, 96),
      block('bunker-este', 'bunker', 1584, 96, 120),
    ],
    decor: [
      { kind: 'post', x: 160, size: 20 },
      { kind: 'wire', x: 690, size: 130 },
      { kind: 'flag', x: 568, size: 30 },
      { kind: 'crater', x: 960, size: 100 },
      { kind: 'wreck', x: 1200, size: 74 },
      { kind: 'crater', x: 1260, size: 70 },
      { kind: 'wire', x: 1430, size: 130 },
      { kind: 'flag', x: 1632, size: 30 },
      { kind: 'post', x: 2040, size: 20 },
    ],
  },
  {
    id: 'crater-lunar',
    name: 'Cráter Lunar',
    description:
      'Llanura llena de cráteres y ruinas bajas: pocas coberturas y disparos largos y tensos.',
    obstacles: [
      block('monolito', 'spire', 1070, 60, 116),
      block('roca-oeste', 'rock', 400, 62, 70),
      block('ruina-oeste', 'ruin', 760, 44, 88),
      block('ruina-este', 'ruin', 1396, 44, 88),
      block('roca-este', 'rock', 1738, 62, 70),
    ],
    decor: [
      { kind: 'crater', x: 260, size: 120 },
      { kind: 'crater', x: 600, size: 90 },
      { kind: 'wreck', x: 920, size: 64 },
      { kind: 'crater', x: 1240, size: 140 },
      { kind: 'crater', x: 1560, size: 90 },
      { kind: 'wreck', x: 1880, size: 64 },
      { kind: 'crater', x: 2020, size: 100 },
    ],
  },
];

export interface TankState {
  playerId: string;
  x: number;
  y: number;
  health: number;
  alive: boolean;
  angle: number;
  power: number;
  fuel: number;
  kills: number;
}

export interface TankProjectile {
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bounces: number;
  trail: { x: number; y: number }[];
}

export interface TankExplosion {
  id: number;
  x: number;
  y: number;
  radius: number;
  ttlMs: number;
}

export interface TankSnapshot {
  tick: number;
  tanks: TankState[];
  projectile: TankProjectile | null;
  explosions: TankExplosion[];
  obstacles: TankObstacle[];
  wind: number;
}
