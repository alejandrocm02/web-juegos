import { describe, expect, it } from 'vitest';
import {
  PHYSICS_DT,
  TANK_BALLISTICS,
  TANK_FIELD,
  TANK_MAPS,
  TANK_MAX_CLIMB,
  tankGroundAt,
  tankTiltAt,
  type TankProjectile,
} from '@arcade/shared';
import { TANK_SPAWNS, TanksWorld } from '../src/tanks-sim.js';

function world(mode: 'clasico' | 'blitz' | 'rebotes' = 'clasico') {
  return new TanksWorld(['a', 'b'], 'canon-carmesi', mode, () => 0.5);
}

describe('TanksWorld', () => {
  it('coloca tanques con blindaje y combustible por turno', () => {
    // En Cráter Lunar la primera roca queda lejos: caben todos los movimientos.
    const game = new TanksWorld(['a', 'b'], 'crater-lunar', 'clasico', () => 0.5);
    expect(game.tanks.map((tank) => tank.x)).toEqual([120, 2100]);
    expect(game.tanks.every((tank) => tank.health === 100)).toBe(true);
    expect(game.beginTurn('a')).toBe(true);
    for (let move = 0; move < TANK_BALLISTICS.movesPerTurn; move += 1) {
      expect(game.moveTank('a', 1)).toBe(true);
    }
    expect(game.moveTank('a', 1)).toBe(false);
    expect(game.tanks.find((tank) => tank.playerId === 'a')?.fuel).toBe(0);
  });

  it('aplica una trayectoria balística desde el cañón', () => {
    const game = world();
    game.beginTurn('a');
    expect(game.fire('a', -Math.PI / 4, 0.8)).toBe(true);
    const start = game.projectile!;
    const startX = start.x;
    const startY = start.y;
    for (let index = 0; index < 12; index += 1) game.step(PHYSICS_DT);
    expect(game.projectile?.x).toBeGreaterThan(startX);
    expect(game.projectile?.y).toBeLessThan(startY);
    expect(game.projectile?.trail.length).toBeGreaterThan(0);
  });

  it('hace daño radial y premia el impacto directo', () => {
    const game = world();
    const target = game.tanks.find((tank) => tank.playerId === 'b')!;
    game.detonate(target.x, target.y, 'a', 'b');
    expect(game.tanks.find((tank) => tank.playerId === 'b')?.health).toBe(20);
    game.detonate(target.x, target.y, 'a', 'b');
    expect(game.tanks.find((tank) => tank.playerId === 'b')?.alive).toBe(false);
    expect(game.tanks.find((tank) => tank.playerId === 'a')?.kills).toBe(1);
    expect(game.drainEvents()).toContainEqual(
      expect.objectContaining({ kind: 'tank-destroyed', playerId: 'a', targetId: 'b' }),
    );
  });

  it('rebota en las paredes solo en el modo Rebotes', () => {
    const game = world('rebotes');
    game.projectile = {
      ownerId: 'a',
      x: TANK_FIELD.width - 5,
      y: 200,
      vx: 300,
      vy: 0,
      radius: TANK_FIELD.projectileRadius,
      bounces: 0,
      trail: [],
    } satisfies TankProjectile;
    game.step(PHYSICS_DT);
    expect(game.projectile?.bounces).toBe(1);
    expect(game.projectile?.vx).toBeLessThan(0);
    expect(game.drainEvents()).toContainEqual(expect.objectContaining({ kind: 'tank-bounce' }));
  });

  it('el modo Blitz reduce el blindaje inicial', () => {
    expect(world('blitz').tanks.every((tank) => tank.health === 70)).toBe(true);
  });
});

describe('campo de batalla grande', () => {
  it('ningún tanque aparece dentro de un obstáculo ni fuera del campo', () => {
    for (const map of TANK_MAPS) {
      for (const [count, positions] of Object.entries(TANK_SPAWNS[map.id])) {
        expect(positions, map.id + ' ' + count).toHaveLength(Number(count));
        for (const x of positions) {
          const left = x - TANK_FIELD.tankWidth / 2;
          const right = x + TANK_FIELD.tankWidth / 2;
          expect(left).toBeGreaterThan(0);
          expect(right).toBeLessThan(TANK_FIELD.width);
          for (const obstacle of map.obstacles) {
            const overlaps = right > obstacle.x && left < obstacle.x + obstacle.width;
            expect(overlaps, map.id + ' x=' + x + ' ' + obstacle.id).toBe(false);
          }
        }
      }
    }
  });

  it('los obstáculos y el decorado caben en el campo y apoyan en el suelo', () => {
    for (const map of TANK_MAPS) {
      for (const obstacle of map.obstacles) {
        expect(obstacle.x).toBeGreaterThanOrEqual(0);
        expect(obstacle.x + obstacle.width).toBeLessThanOrEqual(TANK_FIELD.width);
        // La base llega al punto más bajo del relieve bajo el obstáculo: sin
        // huecos por los que pasar un proyectil.
        for (let x = obstacle.x; x <= obstacle.x + obstacle.width; x += 4) {
          expect(obstacle.y + obstacle.height).toBeGreaterThanOrEqual(tankGroundAt(map.id, x));
        }
      }
      for (const item of map.decor) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x).toBeLessThanOrEqual(TANK_FIELD.width);
      }
    }
  });

  it('un disparo a toda potencia cruza el campo de extremo a extremo con viento en contra', () => {
    // Sin obstáculos en medio para medir solo el alcance.
    const game = new TanksWorld(['a', 'b'], 'crater-lunar', 'clasico', () => 0.5);
    (game as unknown as { obstacles: unknown[] }).obstacles.length = 0;
    game.wind = -1;
    game.fire('a', -Math.PI / 4, 1);
    let farthest = 0;
    for (let step = 0; step < 900 && game.hasProjectile(); step += 1) {
      game.step(PHYSICS_DT);
      farthest = Math.max(farthest, game.projectile?.x ?? farthest);
    }
    expect(farthest).toBeGreaterThan(2080 - TANK_FIELD.explosionRadius);
  });

  it('un disparo casi vertical no se pierde por arriba antes de caer', () => {
    const game = world();
    game.wind = 0;
    game.fire('a', -Math.PI / 2 + 0.13, 1);
    const events: string[] = [];
    for (let step = 0; step < 900 && game.hasProjectile(); step += 1) {
      game.step(PHYSICS_DT);
      events.push(...game.drainEvents().map((event) => event.kind));
    }
    expect(events).not.toContain('tank-miss');
  });
});

describe('coberturas', () => {
  it('los sacos terreros paran al tanque que avanza contra ellos', () => {
    const game = world();
    game.beginTurn('a');
    const moves = [1, 2, 3, 4].map(() => game.moveTank('a', 1));
    expect(moves).toEqual([true, true, true, false]);
  });
});

describe('relieve', () => {
  it('ningún mapa es plano y todos tienen colinas y hondonadas', () => {
    for (const map of TANK_MAPS) {
      const heights = Array.from({ length: 111 }, (_, index) => tankGroundAt(map.id, index * 20));
      expect(Math.max(...heights) - Math.min(...heights), map.id).toBeGreaterThan(70);
      for (const height of heights) {
        expect(height).toBeGreaterThan(380);
        expect(height).toBeLessThan(TANK_FIELD.height - 30);
      }
    }
  });

  it('los tanques salen apoyados en el suelo y en zonas sin mucha pendiente', () => {
    for (const map of TANK_MAPS) {
      for (const positions of Object.values(TANK_SPAWNS[map.id])) {
        for (const x of positions) {
          expect(Math.abs(tankTiltAt(map.id, x)), map.id + ' x=' + x).toBeLessThan(0.35);
        }
      }
      const game = new TanksWorld(['a', 'b'], map.id, 'clasico', () => 0.5);
      for (const tank of game.tanks) {
        expect(tank.y + TANK_FIELD.tankHeight / 2).toBeCloseTo(tankGroundAt(map.id, tank.x), 5);
      }
    }
  });

  it('al moverse el tanque sigue el relieve', () => {
    const game = new TanksWorld(['a', 'b'], 'crater-lunar', 'clasico', () => 0.5);
    game.beginTurn('a');
    expect(game.moveTank('a', 1)).toBe(true);
    const tank = game.tanks.find((entry) => entry.playerId === 'a')!;
    expect(tank.y + TANK_FIELD.tankHeight / 2).toBeCloseTo(tankGroundAt('crater-lunar', tank.x), 5);
  });

  it('una cuesta demasiado empinada no se sube, pero se puede bajar', () => {
    // Cráter Lunar: la pared derecha del cráter de x≈1300 sube 46 en 80.
    const game = new TanksWorld(['a', 'b'], 'crater-lunar', 'clasico', () => 0.5);
    const tank = (
      game as unknown as { tanksById: Map<string, { x: number; y: number }> }
    ).tanksById.get('a')!;
    tank.x = 1300;
    tank.y = tankGroundAt('crater-lunar', 1300) - TANK_FIELD.tankHeight / 2;
    game.beginTurn('a');
    const climb = tankGroundAt('crater-lunar', 1300) - tankGroundAt('crater-lunar', 1252);
    expect(climb).toBeGreaterThan(48 * TANK_MAX_CLIMB);
    expect(game.moveTank('a', -1)).toBe(false);
    // Hacia la derecha también sube, pero menos: se puede.
    expect(game.moveTank('a', 1)).toBe(true);
  });

  it('una colina para el proyectil aunque no llegue al nivel del suelo de referencia', () => {
    const game = new TanksWorld(['a', 'b'], 'canon-carmesi', 'clasico', () => 0.5);
    game.wind = 0;
    // Tiro raso desde la izquierda contra la loma del búnker oeste.
    game.fire('a', -0.25, 0.5);
    for (let step = 0; step < 600 && game.hasProjectile(); step += 1) {
      game.step(PHYSICS_DT);
    }
    const exploded = game.explosions.at(-1) ?? null;
    expect(exploded).not.toBeNull();
    expect(exploded!.y).toBeLessThan(TANK_FIELD.groundY - 20);
  });
});
