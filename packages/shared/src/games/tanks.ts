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
  /**
   * Relieve del suelo: puntos [x, y] de izquierda a derecha, de 0 al ancho del
   * campo. Entre puntos se suaviza con una curva coseno. `y` crece hacia abajo,
   * como en todo el campo: menos y = más alto.
   */
  terrain: readonly (readonly [number, number])[];
  obstacles: TankObstacle[];
  decor: TankDecor[];
}

/** Pendiente máxima que puede subir un tanque en un desplazamiento (subida/avance). */
export const TANK_MAX_CLIMB = 0.85;

/** Altura del suelo en `x` según un relieve (interpolación coseno entre puntos). */
export function terrainHeight(terrain: TankMap['terrain'], x: number): number {
  if (terrain.length === 0) return TANK_FIELD.groundY;
  const first = terrain[0]!;
  const last = terrain[terrain.length - 1]!;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let index = 1; index < terrain.length; index += 1) {
    const [x1, y1] = terrain[index]!;
    if (x > x1) continue;
    const [x0, y0] = terrain[index - 1]!;
    const t = (x - x0) / Math.max(1, x1 - x0);
    const eased = (1 - Math.cos(t * Math.PI)) / 2;
    return y0 + (y1 - y0) * eased;
  }
  return last[1];
}

/** Inclinación del suelo en `x`, en radianes (positiva = sube hacia la derecha en pantalla). */
export function terrainTilt(terrain: TankMap['terrain'], x: number, span = 22): number {
  const left = terrainHeight(terrain, x - span);
  const right = terrainHeight(terrain, x + span);
  return Math.atan2(right - left, span * 2);
}

/** Obstáculo apoyado en el relieve: su base llega al punto más bajo bajo él, un poco enterrada. */
function blockOn(terrain: TankMap['terrain']) {
  return (
    id: string,
    kind: TankObstacleKind,
    x: number,
    width: number,
    height: number,
  ): TankObstacle => {
    let lowest = -Infinity;
    let highest = Infinity;
    for (let px = x; px <= x + width; px += 4) {
      const ground = terrainHeight(terrain, px);
      lowest = Math.max(lowest, ground);
      highest = Math.min(highest, ground);
    }
    const bottom = Math.round(lowest + 4);
    const top = Math.round(highest - height);
    return { id, kind, x, y: top, width, height: bottom - top };
  };
}

const CANON_TERRAIN = [
  [0, 506],
  [180, 510],
  [420, 522],
  [560, 476],
  [720, 462],
  [860, 500],
  [990, 446],
  [1100, 414],
  [1210, 446],
  [1340, 500],
  [1480, 462],
  [1640, 476],
  [1780, 522],
  [2020, 510],
  [2200, 506],
] as const;

const FORTALEZA_TERRAIN = [
  [0, 520],
  [240, 520],
  [380, 474],
  [660, 468],
  [790, 520],
  [980, 548],
  [1100, 506],
  [1220, 548],
  [1410, 520],
  [1540, 468],
  [1820, 474],
  [1960, 520],
  [2200, 520],
] as const;

const CRATER_TERRAIN = [
  [0, 512],
  [170, 506],
  [260, 546],
  [350, 504],
  [520, 474],
  [610, 524],
  [700, 492],
  [900, 458],
  [1070, 436],
  [1230, 470],
  [1300, 540],
  [1380, 494],
  [1560, 522],
  [1700, 474],
  [1900, 500],
  [2010, 546],
  [2100, 508],
  [2200, 512],
] as const;

const canon = blockOn(CANON_TERRAIN);
const fortaleza = blockOn(FORTALEZA_TERRAIN);
const crater = blockOn(CRATER_TERRAIN);

export const TANK_MAPS: TankMap[] = [
  {
    id: 'canon-carmesi',
    name: 'Cañón Carmesí',
    description:
      'Cañón rojo: la gran aguja corona la colina central, con búnkeres en las lomas y trincheras de sacos al fondo de cada valle.',
    terrain: CANON_TERRAIN,
    obstacles: [
      canon('aguja', 'spire', 1055, 90, 160),
      canon('sacos-oeste', 'sandbags', 330, 76, 34),
      canon('bunker-oeste', 'bunker', 640, 110, 72),
      canon('roca-centro-oeste', 'rock', 880, 54, 46),
      canon('roca-centro-este', 'rock', 1270, 54, 46),
      canon('bunker-este', 'bunker', 1450, 110, 72),
      canon('sacos-este', 'sandbags', 1794, 76, 34),
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
      'Base fortificada: dos terraplenes con búnker y muro, y entre ellos una hondonada de tierra de nadie con la torre de vigilancia en un montículo.',
    terrain: FORTALEZA_TERRAIN,
    obstacles: [
      fortaleza('bunker-oeste', 'bunker', 520, 96, 110),
      fortaleza('muro-oeste', 'wall', 300, 34, 90),
      fortaleza('sacos-oeste', 'sandbags', 820, 80, 34),
      fortaleza('torre', 'tower', 1080, 40, 210),
      fortaleza('sacos-este', 'sandbags', 1300, 80, 34),
      fortaleza('muro-este', 'wall', 1866, 34, 90),
      fortaleza('bunker-este', 'bunker', 1584, 96, 110),
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
      'Terreno ondulado y lleno de cráteres de verdad, con el monolito en la cima: hondonadas que cubren y pocas rocas.',
    terrain: CRATER_TERRAIN,
    obstacles: [
      crater('monolito', 'spire', 1070, 60, 110),
      crater('roca-oeste', 'rock', 400, 62, 60),
      crater('ruina-oeste', 'ruin', 760, 44, 80),
      crater('ruina-este', 'ruin', 1396, 44, 80),
      crater('roca-este', 'rock', 1738, 62, 60),
    ],
    decor: [
      { kind: 'crater', x: 260, size: 120 },
      { kind: 'crater', x: 600, size: 90 },
      { kind: 'wreck', x: 920, size: 64 },
      { kind: 'crater', x: 1300, size: 120 },
      { kind: 'crater', x: 1560, size: 90 },
      { kind: 'wreck', x: 1880, size: 64 },
      { kind: 'crater', x: 2020, size: 100 },
    ],
  },
];

const TERRAIN_BY_MAP = new Map(TANK_MAPS.map((map) => [map.id as string, map.terrain]));

/** Altura del suelo de un mapa en `x`. Mapa desconocido: suelo plano. */
export function tankGroundAt(mapId: string, x: number): number {
  const terrain = TERRAIN_BY_MAP.get(mapId);
  return terrain ? terrainHeight(terrain, x) : TANK_FIELD.groundY;
}

/** Inclinación del suelo de un mapa en `x`, en radianes. */
export function tankTiltAt(mapId: string, x: number): number {
  const terrain = TERRAIN_BY_MAP.get(mapId);
  return terrain ? terrainTilt(terrain, x) : 0;
}

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
