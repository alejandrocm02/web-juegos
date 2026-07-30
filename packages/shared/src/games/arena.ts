/**
 * Battle Royale: arena, zona segura, objetos y tipos compartidos.
 *
 * Todo lo que decide el resultado de la partida (dano, posicion valida,
 * eliminacion y victoria) lo calcula el servidor. Aqui solo viven las
 * constantes y las formas de datos que ambos lados necesitan conocer para
 * dibujar y validar lo mismo.
 */

export const ARENA = {
  width: 900,
  height: 900,
  playerRadius: 13,
  maxHealth: 100,
  /** Velocidad base de desplazamiento (u/s). */
  moveSpeed: 145,
  /** Alcance del ataque cuerpo a cuerpo. */
  attackRange: 58,
  /** Semiangulo del cono de ataque, en radianes. */
  attackArc: 0.7,
  attackDamage: 22,
  /** Tiempo entre ataques, en ms. */
  attackCooldownMs: 700,
  /** Dano por segundo al estar fuera de la zona segura. */
  zoneDamagePerSecond: 9,
  /** Radio inicial de la zona segura. */
  zoneStartRadius: 430,
  /** Radio minimo al que se cierra. */
  zoneEndRadius: 70,
  /** Tiempo total de cierre de la zona, en ms. */
  zoneShrinkMs: 105000,
  /** Espera antes de que la zona empiece a cerrarse. */
  zoneGraceMs: 12000,
  /** Duracion maxima de una partida. */
  maxMatchMs: 180000,
  pickupRadius: 16,
  /** Objetos simultaneos en la arena. */
  pickupCount: 6,
  pickupRespawnMs: 9000,
} as const;

export const ARENA_PICKUP_KINDS = ['botiquin', 'escudo', 'velocidad', 'dano'] as const;
export type ArenaPickupKind = (typeof ARENA_PICKUP_KINDS)[number];

export const ARENA_PICKUP_META: Record<
  ArenaPickupKind,
  { name: string; description: string; color: string }
> = {
  botiquin: { name: 'Botiquin', description: 'Recupera 30 de vida', color: '#34d399' },
  escudo: { name: 'Escudo', description: 'Absorbe 40 de dano', color: '#1d5ae1' },
  velocidad: { name: 'Turbo', description: 'Mas velocidad durante 12 s', color: '#fbbf24' },
  dano: { name: 'Filo', description: 'Mas dano durante 12 s', color: '#e11d2e' },
};

export const ARENA_BUFF_MS = 12000;
export const ARENA_HEAL_AMOUNT = 30;
export const ARENA_SHIELD_AMOUNT = 40;
export const ARENA_SPEED_MULTIPLIER = 1.45;
export const ARENA_DAMAGE_MULTIPLIER = 1.6;

export interface ArenaObstacle {
  x: number;
  y: number;
  radius: number;
}

/** Obstaculos fijos de la arena. Bloquean el paso pero no los ataques. */
export const ARENA_OBSTACLES: ArenaObstacle[] = [
  { x: 250, y: 250, radius: 46 },
  { x: 650, y: 250, radius: 38 },
  { x: 450, y: 450, radius: 58 },
  { x: 250, y: 650, radius: 38 },
  { x: 650, y: 650, radius: 46 },
  { x: 450, y: 160, radius: 30 },
  { x: 450, y: 740, radius: 30 },
  { x: 160, y: 450, radius: 30 },
  { x: 740, y: 450, radius: 30 },
];

export interface ArenaPickup {
  id: number;
  kind: ArenaPickupKind;
  x: number;
  y: number;
  /** false mientras espera reaparecer. */
  active: boolean;
}

export interface ArenaFighterState {
  playerId: string;
  x: number;
  y: number;
  /** Direccion a la que mira, en radianes. Define el cono de ataque. */
  facing: number;
  health: number;
  shield: number;
  alive: boolean;
  /** Posicion en la clasificacion final: 1 es el ganador. */
  placement: number | null;
  kills: number;
  /** ms que faltan para poder atacar otra vez. */
  attackCooldownMs: number;
  speedBuffMs: number;
  damageBuffMs: number;
  /** true si esta fuera de la zona segura y perdiendo vida. */
  inStorm: boolean;
  team?: string;
}

export interface ArenaZone {
  x: number;
  y: number;
  radius: number;
}

export interface ArenaSnapshot {
  tick: number;
  matchMs: number;
  zone: ArenaZone;
  fighters: ArenaFighterState[];
  pickups: ArenaPickup[];
}

/** Intencion de movimiento y ataque que envia el cliente. */
export interface ArenaInput {
  /** Vector de movimiento, ya normalizado por el servidor. */
  moveX: number;
  moveY: number;
  /** Direccion a la que apunta el jugador. */
  facing: number;
  attack: boolean;
}

/** Multiplicador de duracion del cierre segun el ritmo elegido por el anfitrion. */
export const ARENA_ZONE_PACE: Record<'lenta' | 'normal' | 'rapida', number> = {
  lenta: 1.6,
  normal: 1,
  rapida: 0.6,
};

/**
 * Radio de la zona segura en un instante dado.
 * Se calcula igual en cliente y servidor para que el circulo dibujado coincida
 * exactamente con el que aplica dano.
 */
export function zoneRadiusAt(matchMs: number, paceScale = 1): number {
  if (matchMs <= ARENA.zoneGraceMs) return ARENA.zoneStartRadius;
  const elapsed = matchMs - ARENA.zoneGraceMs;
  const total = ARENA.zoneShrinkMs * Math.max(0.1, paceScale);
  const progress = Math.min(1, elapsed / total);
  return ARENA.zoneStartRadius - (ARENA.zoneStartRadius - ARENA.zoneEndRadius) * progress;
}

/** Puntos de aparicion repartidos en circulo, mirando al centro. */
export function arenaSpawnPoints(count: number): { x: number; y: number; facing: number }[] {
  const points: { x: number; y: number; facing: number }[] = [];
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  const radius = ARENA.zoneStartRadius * 0.78;
  for (let i = 0; i < count; i++) {
    const angle = (i / Math.max(1, count)) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      facing: angle + Math.PI,
    });
  }
  return points;
}
