import {
  PHYSICS_DT,
  TANK_BALLISTICS,
  TANK_FIELD,
  TANK_MAPS,
  tankShotSpeed,
  type TankExplosion,
  type TankMapId,
  type TankObstacle,
  type TankProjectile,
  type TankSnapshot,
  type TankState,
  type TanksMode,
} from '@arcade/shared';

export interface TankEvent {
  kind: 'tank-fire' | 'tank-hit' | 'tank-destroyed' | 'tank-miss' | 'tank-bounce';
  playerId?: string;
  targetId?: string;
  damage?: number;
  atTick: number;
}

/**
 * Posiciones de salida por mapa y número de jugadores, siempre en huecos libres
 * entre obstáculos (lo comprueba un test). Con el campo de 2200 los extremos
 * quedan a 1960 de distancia: al alcance de un disparo a toda potencia.
 */
export const TANK_SPAWNS: Record<TankMapId, Record<number, number[]>> = {
  'canon-carmesi': {
    2: [120, 2080],
    3: [120, 1210, 2080],
    4: [120, 800, 1400, 2080],
    5: [120, 520, 1000, 1640, 2080],
  },
  'fortaleza-neon': {
    2: [120, 2080],
    3: [120, 1200, 2080],
    4: [120, 700, 1480, 2080],
    5: [120, 420, 960, 1760, 2080],
  },
  'crater-lunar': {
    2: [120, 2080],
    3: [120, 1250, 2080],
    4: [120, 600, 1600, 2080],
    5: [120, 600, 950, 1600, 2080],
  },
};

/** Simulación autoritativa de artillería lateral. */
export class TanksWorld {
  private readonly tanksById = new Map<string, TankState>();
  private readonly events: TankEvent[] = [];
  private projectileAgeMs = 0;
  private explosionSequence = 0;

  readonly obstacles: TankObstacle[];
  projectile: TankProjectile | null = null;
  explosions: TankExplosion[] = [];
  wind = 0;
  tick = 0;

  constructor(
    playerIds: string[],
    readonly mapId: TankMapId,
    readonly mode: TanksMode,
    private readonly random: () => number = Math.random,
  ) {
    const map = TANK_MAPS.find((entry) => entry.id === mapId) ?? TANK_MAPS[0]!;
    this.obstacles = map.obstacles.map((obstacle) => ({ ...obstacle }));
    const positions = TANK_SPAWNS[map.id][playerIds.length] ?? TANK_SPAWNS[map.id][2]!;
    const maxHealth = mode === 'blitz' ? 70 : 100;
    playerIds.forEach((playerId, index) => {
      const x = positions[index] ?? 120 + index * 400;
      const facingRight = x < TANK_FIELD.width / 2;
      this.tanksById.set(playerId, {
        playerId,
        x,
        y: TANK_FIELD.groundY - TANK_FIELD.tankHeight / 2,
        health: maxHealth,
        alive: true,
        angle: facingRight ? -Math.PI / 4 : (-3 * Math.PI) / 4,
        power: 0.68,
        fuel: 0,
        kills: 0,
      });
    });
    this.randomizeWind();
  }

  get tanks(): TankState[] {
    return [...this.tanksById.values()].map((tank) => ({ ...tank }));
  }

  get aliveIds(): string[] {
    return [...this.tanksById.values()].filter((tank) => tank.alive).map((tank) => tank.playerId);
  }

  snapshot(): TankSnapshot {
    return {
      tick: this.tick,
      tanks: this.tanks.map((tank) => ({
        ...tank,
        x: round(tank.x),
        y: round(tank.y),
        angle: round(tank.angle),
        power: round(tank.power),
      })),
      projectile: this.projectile
        ? {
            ...this.projectile,
            x: round(this.projectile.x),
            y: round(this.projectile.y),
            vx: round(this.projectile.vx),
            vy: round(this.projectile.vy),
            trail: this.projectile.trail.map((point) => ({ x: round(point.x), y: round(point.y) })),
          }
        : null,
      explosions: this.explosions.map((explosion) => ({ ...explosion })),
      obstacles: this.obstacles.map((obstacle) => ({ ...obstacle })),
      wind: round(this.wind),
    };
  }

  beginTurn(playerId: string): boolean {
    const tank = this.tanksById.get(playerId);
    if (!tank?.alive || this.projectile) return false;
    for (const entry of this.tanksById.values()) entry.fuel = 0;
    tank.fuel = TANK_BALLISTICS.movesPerTurn;
    this.randomizeWind();
    return true;
  }

  moveTank(playerId: string, direction: -1 | 1): boolean {
    const tank = this.tanksById.get(playerId);
    if (!tank?.alive || tank.fuel <= 0 || this.projectile) return false;
    const nextX = clamp(
      tank.x + direction * TANK_BALLISTICS.moveStep,
      TANK_FIELD.tankWidth / 2 + 10,
      TANK_FIELD.width - TANK_FIELD.tankWidth / 2 - 10,
    );
    if (Math.abs(nextX - tank.x) < 1 || this.tankHitsObstacle(nextX)) return false;
    tank.x = nextX;
    tank.fuel -= 1;
    return true;
  }

  fire(playerId: string, angle: number, power: number): boolean {
    const tank = this.tanksById.get(playerId);
    if (!tank?.alive || this.projectile) return false;
    tank.angle = clamp(angle, -Math.PI + 0.12, -0.12);
    tank.power = clamp(power, 0.2, 1);
    tank.fuel = 0;
    const speed = tankShotSpeed(tank.power);
    const turretX = Math.cos(tank.angle);
    const turretY = Math.sin(tank.angle);
    this.projectile = {
      ownerId: playerId,
      x: tank.x + turretX * TANK_BALLISTICS.muzzle,
      y: tank.y - 9 + turretY * TANK_BALLISTICS.muzzle,
      vx: turretX * speed,
      vy: turretY * speed,
      radius: TANK_FIELD.projectileRadius,
      bounces: 0,
      trail: [],
    };
    this.projectileAgeMs = 0;
    this.events.push({ kind: 'tank-fire', playerId, atTick: this.tick });
    return true;
  }

  removePlayer(playerId: string): void {
    this.tanksById.delete(playerId);
  }

  hasProjectile(): boolean {
    return this.projectile !== null;
  }

  drainEvents(): TankEvent[] {
    const drained = this.events.slice();
    this.events.length = 0;
    return drained;
  }

  step(dt = PHYSICS_DT): void {
    this.tick += 1;
    this.updateExplosions(dt);
    const projectile = this.projectile;
    if (!projectile) return;
    this.projectileAgeMs += dt * 1000;
    projectile.trail.push({ x: projectile.x, y: projectile.y });
    if (projectile.trail.length > 24) projectile.trail.shift();
    projectile.vx += this.wind * TANK_BALLISTICS.windAccel * dt;
    projectile.vy += TANK_BALLISTICS.gravity * dt;
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;

    if (projectile.y + projectile.radius >= TANK_FIELD.groundY) {
      projectile.y = TANK_FIELD.groundY - projectile.radius;
      this.detonate(projectile.x, projectile.y, projectile.ownerId);
      return;
    }

    if (this.resolveWall(projectile)) return;
    for (const obstacle of this.obstacles) {
      if (!circleHitsRect(projectile, obstacle)) continue;
      if (this.mode === 'rebotes' && projectile.bounces < 2) {
        this.bounceOffObstacle(projectile, obstacle);
        return;
      }
      this.detonate(projectile.x, projectile.y, projectile.ownerId);
      return;
    }

    for (const tank of this.tanksById.values()) {
      if (!tank.alive || (tank.playerId === projectile.ownerId && this.projectileAgeMs < 300))
        continue;
      if (!projectileHitsTank(projectile, tank)) continue;
      this.detonate(projectile.x, projectile.y, projectile.ownerId, tank.playerId);
      return;
    }

    if (projectile.y > TANK_FIELD.height + 80 || projectile.y < TANK_BALLISTICS.ceilingY) {
      this.miss(projectile.ownerId);
    }
  }

  /** Ejecuta una explosión; se mantiene pública para pruebas deterministas del motor. */
  detonate(x: number, y: number, ownerId: string, directTargetId?: string): void {
    const radius = TANK_FIELD.explosionRadius * (this.mode === 'blitz' ? 1.06 : 1);
    const maxDamage = this.mode === 'blitz' ? 74 : 62;
    this.explosions.push({
      id: ++this.explosionSequence,
      x: round(x),
      y: round(y),
      radius,
      ttlMs: 720,
    });

    for (const tank of this.tanksById.values()) {
      if (!tank.alive) continue;
      const distance = Math.hypot(tank.x - x, tank.y - y);
      if (distance > radius) continue;
      const directBonus = tank.playerId === directTargetId ? 18 : 0;
      let damage = Math.max(1, Math.round(maxDamage * (1 - distance / radius) + directBonus));
      if (tank.playerId === ownerId) damage = Math.round(damage * 0.72);
      tank.health = Math.max(0, tank.health - damage);
      this.events.push({
        kind: 'tank-hit',
        playerId: ownerId,
        targetId: tank.playerId,
        damage,
        atTick: this.tick,
      });
      if (tank.health === 0) {
        tank.alive = false;
        tank.fuel = 0;
        if (tank.playerId !== ownerId) {
          const owner = this.tanksById.get(ownerId);
          if (owner) owner.kills += 1;
        }
        this.events.push({
          kind: 'tank-destroyed',
          playerId: ownerId,
          targetId: tank.playerId,
          atTick: this.tick,
        });
      }
    }
    this.projectile = null;
  }

  private randomizeWind(): void {
    const strength = this.mode === 'blitz' ? 1.15 : 1;
    this.wind = clamp((this.random() * 2 - 1) * strength, -1, 1);
  }

  private tankHitsObstacle(x: number): boolean {
    const left = x - TANK_FIELD.tankWidth / 2;
    const right = x + TANK_FIELD.tankWidth / 2;
    const top = TANK_FIELD.groundY - TANK_FIELD.tankHeight;
    return this.obstacles.some(
      (obstacle) =>
        right > obstacle.x &&
        left < obstacle.x + obstacle.width &&
        TANK_FIELD.groundY > obstacle.y &&
        top < obstacle.y + obstacle.height,
    );
  }

  private resolveWall(projectile: TankProjectile): boolean {
    const outsideLeft = projectile.x - projectile.radius <= 0;
    const outsideRight = projectile.x + projectile.radius >= TANK_FIELD.width;
    if (!outsideLeft && !outsideRight) return false;
    if (this.mode === 'rebotes' && projectile.bounces < 2) {
      projectile.x = outsideLeft ? projectile.radius : TANK_FIELD.width - projectile.radius;
      projectile.vx *= -0.78;
      projectile.bounces += 1;
      this.events.push({ kind: 'tank-bounce', playerId: projectile.ownerId, atTick: this.tick });
      return false;
    }
    this.miss(projectile.ownerId);
    return true;
  }

  private bounceOffObstacle(projectile: TankProjectile, obstacle: TankObstacle): void {
    const distances = [
      { side: 'left', value: Math.abs(projectile.x - obstacle.x) },
      { side: 'right', value: Math.abs(projectile.x - (obstacle.x + obstacle.width)) },
      { side: 'top', value: Math.abs(projectile.y - obstacle.y) },
      { side: 'bottom', value: Math.abs(projectile.y - (obstacle.y + obstacle.height)) },
    ].sort((a, b) => a.value - b.value);
    const side = distances[0]?.side;
    if (side === 'left' || side === 'right') {
      projectile.x =
        side === 'left'
          ? obstacle.x - projectile.radius
          : obstacle.x + obstacle.width + projectile.radius;
      projectile.vx *= -0.74;
    } else {
      projectile.y =
        side === 'top'
          ? obstacle.y - projectile.radius
          : obstacle.y + obstacle.height + projectile.radius;
      projectile.vy *= -0.74;
    }
    projectile.bounces += 1;
    this.events.push({ kind: 'tank-bounce', playerId: projectile.ownerId, atTick: this.tick });
  }

  private miss(ownerId: string): void {
    this.projectile = null;
    this.events.push({ kind: 'tank-miss', playerId: ownerId, atTick: this.tick });
  }

  private updateExplosions(dt: number): void {
    for (const explosion of this.explosions) explosion.ttlMs -= dt * 1000;
    this.explosions = this.explosions.filter((explosion) => explosion.ttlMs > 0);
  }
}

function circleHitsRect(
  circle: Pick<TankProjectile, 'x' | 'y' | 'radius'>,
  rect: TankObstacle,
): boolean {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
  return Math.hypot(circle.x - closestX, circle.y - closestY) <= circle.radius;
}

function projectileHitsTank(projectile: TankProjectile, tank: TankState): boolean {
  const left = tank.x - TANK_FIELD.tankWidth / 2;
  const top = tank.y - TANK_FIELD.tankHeight / 2;
  return circleHitsRect(projectile, {
    id: tank.playerId,
    x: left,
    y: top,
    width: TANK_FIELD.tankWidth,
    height: TANK_FIELD.tankHeight,
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
