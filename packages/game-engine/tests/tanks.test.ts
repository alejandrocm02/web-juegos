import { describe, expect, it } from 'vitest';
import {
  PHYSICS_DT,
  TANK_BALLISTICS,
  TANK_FIELD,
  TANK_MAPS,
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
    expect(game.tanks.map((tank) => tank.x)).toEqual([120, 2080]);
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
        expect(obstacle.y + obstacle.height).toBe(TANK_FIELD.groundY);
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
