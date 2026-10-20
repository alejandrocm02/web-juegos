import { describe, expect, it } from 'vitest';
import { PHYSICS_DT, POOL_TABLE } from '@arcade/shared';
import { PoolWorld } from './pool-sim.js';

describe('PoolWorld: seguridad y colisiones', () => {
  it('rechaza disparos con parámetros inválidos', () => {
    const world = new PoolWorld(1, 'normal');
    expect(world.shoot(Number.NaN, 0.5)).toBe(false);
    expect(world.shoot(0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(world.shoot(0, 0)).toBe(false);
    expect(world.cueBall.vx).toBe(0);
    expect(world.cueBall.vy).toBe(0);
  });

  it('no avanza la simulación con un intervalo inválido', () => {
    const world = new PoolWorld(1, 'normal');
    world.step(Number.NaN);
    world.step(-1);
    expect(world.tick).toBe(0);
  });

  it('resuelve una superposición exacta de dos bolas', () => {
    const world = new PoolWorld(1, 'normal');
    const cue = world.cueBall;
    const other = world.state.find((ball) => ball.id === 1)!;
    // Se usan referencias internas para configurar una situación física extrema.
    const balls = (world as unknown as { balls: typeof world.state }).balls;
    balls[1]!.x = cue.x;
    balls[1]!.y = cue.y;
    world.step(PHYSICS_DT);
    const distance = Math.hypot(balls[1]!.x - cue.x, balls[1]!.y - cue.y);
    expect(distance).toBeGreaterThanOrEqual(POOL_TABLE.ballRadius * 2);
    expect(Number.isFinite(other.x)).toBe(true);
  });

  it('transfiere movimiento a la bola objetivo durante un choque frontal', () => {
    const world = new PoolWorld(1, 'normal');
    const balls = (world as unknown as { balls: typeof world.state }).balls;
    const cue = balls[0]!;
    const target = balls[1]!;
    target.x = cue.x + POOL_TABLE.ballRadius * 2 + 0.3;
    target.y = cue.y;
    cue.vx = 100;
    world.step(PHYSICS_DT);
    expect(target.vx).toBeGreaterThan(0);
    expect(cue.vx).toBeLessThan(100);
  });
});
