import { describe, expect, it } from 'vitest';
import { PHYSICS_DT, TANK_FIELD, type TankProjectile } from '@arcade/shared';
import { TanksWorld } from '../src/tanks-sim.js';

function world(mode: 'clasico' | 'blitz' | 'rebotes' = 'clasico') {
  return new TanksWorld(['a', 'b'], 'canon-carmesi', mode, () => 0.5);
}

describe('TanksWorld', () => {
  it('coloca tanques con blindaje y combustible por turno', () => {
    const game = world();
    expect(game.tanks.map((tank) => tank.x)).toEqual([80, 920]);
    expect(game.tanks.every((tank) => tank.health === 100)).toBe(true);
    expect(game.beginTurn('a')).toBe(true);
    expect(game.moveTank('a', 1)).toBe(true);
    expect(game.moveTank('a', 1)).toBe(true);
    expect(game.moveTank('a', 1)).toBe(true);
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
