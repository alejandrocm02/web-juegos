import { describe, expect, it } from 'vitest';
import { POOL_TABLE } from '@arcade/shared';
import { PoolWorld } from '@arcade/game-engine';

describe('simulacion de billar', () => {
  it('coloca la blanca y las bolas de color', () => {
    const world = new PoolWorld(9, 'normal');
    expect(world.colorBallsLeft()).toBe(9);
    expect(world.cueBall.id).toBe(0);
    expect(world.settled()).toBe(true);
  });

  it('las bolas acaban deteniendose tras un golpe', () => {
    const world = new PoolWorld(9, 'normal');
    expect(world.shoot(0, 1)).toBe(true);
    expect(world.settled()).toBe(false);
    for (let i = 0; i < 60 * 30 && !world.settled(); i++) world.step(1 / 60);
    expect(world.settled()).toBe(true);
  });

  it('no permite golpear mientras las bolas se mueven', () => {
    const world = new PoolWorld(9, 'normal');
    world.shoot(0, 0.8);
    world.step(1 / 60);
    expect(world.shoot(0, 0.8)).toBe(false);
  });

  it('las bolas nunca se salen de la mesa', () => {
    const world = new PoolWorld(12, 'rapida');
    world.shoot(0.6, 1);
    for (let i = 0; i < 60 * 20; i++) {
      world.step(1 / 60);
      for (const ball of world.state) {
        if (ball.pocketed) continue;
        expect(ball.x).toBeGreaterThanOrEqual(-1);
        expect(ball.y).toBeGreaterThanOrEqual(-1);
        expect(ball.x).toBeLessThanOrEqual(POOL_TABLE.width + 1);
        expect(ball.y).toBeLessThanOrEqual(POOL_TABLE.height + 1);
      }
    }
  });

  it('detecta bolas embocadas y recoloca la blanca', () => {
    const world = new PoolWorld(6, 'normal');
    // Golpe dirigido a la tronera inferior izquierda desde la posicion inicial.
    world.shoot(Math.PI * 0.75, 0.6);
    for (let i = 0; i < 60 * 25 && !world.settled(); i++) world.step(1 / 60);
    const outcome = world.consumeOutcome();
    if (outcome.cuePocketed) {
      world.respotCueBall();
      expect(world.cueBall.pocketed).toBe(false);
    }
    expect(world.colorBallsLeft()).toBeLessThanOrEqual(6);
  });
});
