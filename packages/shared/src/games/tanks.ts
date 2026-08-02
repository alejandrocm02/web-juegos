export const TANK_MAP_IDS = ['canon-carmesi', 'fortaleza-neon', 'crater-lunar'] as const;
export type TankMapId = (typeof TANK_MAP_IDS)[number];

export const TANK_FIELD = {
  width: 1000,
  height: 600,
  groundY: 528,
  tankWidth: 58,
  tankHeight: 30,
  projectileRadius: 8,
  explosionRadius: 82,
} as const;

export interface TankObstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TankMap {
  id: TankMapId;
  name: string;
  description: string;
  obstacles: TankObstacle[];
}

export const TANK_MAPS: TankMap[] = [
  {
    id: 'canon-carmesi',
    name: 'Cañón Carmesí',
    description: 'Una gran aguja central obliga a buscar trayectorias altas.',
    obstacles: [{ id: 'aguja', x: 455, y: 344, width: 90, height: 184 }],
  },
  {
    id: 'fortaleza-neon',
    name: 'Fortaleza Neón',
    description: 'Dos búnkeres crean líneas de tiro estrechas y rebotes imprevisibles.',
    obstacles: [
      { id: 'bunker-oeste', x: 225, y: 408, width: 86, height: 120 },
      { id: 'bunker-este', x: 689, y: 408, width: 86, height: 120 },
    ],
  },
  {
    id: 'crater-lunar',
    name: 'Cráter Lunar',
    description: 'Tres formaciones bajas premian los disparos precisos y tensos.',
    obstacles: [
      { id: 'roca-oeste', x: 158, y: 458, width: 62, height: 70 },
      { id: 'monolito', x: 470, y: 412, width: 60, height: 116 },
      { id: 'roca-este', x: 790, y: 458, width: 62, height: 70 },
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
