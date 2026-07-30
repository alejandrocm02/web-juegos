import { describe, expect, it } from 'vitest';
import { GOLF, type GolfBallState, type GolfSnapshot } from '@arcade/shared';
import { canShootBall, pickLiveBall } from '../src/games/golf-input.js';

function ball(patch: Partial<GolfBallState> = {}): GolfBallState {
  return {
    playerId: 'a',
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    z: 0,
    airborne: false,
    strokes: 0,
    holed: false,
    holedAtMs: null,
    ace: false,
    aceEligible: true,
    outOfBounds: false,
    finished: false,
    ...patch,
  };
}

function snapshot(balls: GolfBallState[]): GolfSnapshot {
  return { tick: 1, levelClockMs: 1000, timeLeftMs: 50000, balls };
}

describe('permiso para golpear', () => {
  it('permite golpear una bola parada y en juego', () => {
    expect(canShootBall(ball())).toBe(true);
  });

  it('bloquea la bola en movimiento, en el aire, embocada, terminada o fuera', () => {
    expect(canShootBall(ball({ vx: GOLF.stopSpeed + 5 }))).toBe(false);
    expect(canShootBall(ball({ airborne: true }))).toBe(false);
    expect(canShootBall(ball({ holed: true }))).toBe(false);
    expect(canShootBall(ball({ finished: true }))).toBe(false);
    expect(canShootBall(ball({ outOfBounds: true }))).toBe(false);
    expect(canShootBall(null)).toBe(false);
  });

  it('acepta una bola que ya bajo del umbral de reposo', () => {
    expect(canShootBall(ball({ vx: GOLF.stopSpeed - 0.5 }))).toBe(true);
  });
});

describe('eleccion de la bola mas reciente', () => {
  it('prefiere el snapshot al estado publico', () => {
    // El estado publico llega hasta un segundo tarde: si se decidiera con el,
    // el jugador veria su bola parada pero no podria golpear.
    const stale = ball({ vx: 300, x: 100 });
    const fresh = ball({ vx: 0, x: 480 });
    const chosen = pickLiveBall(snapshot([fresh]), [stale], 'a');
    expect(chosen?.x).toBe(480);
    expect(canShootBall(chosen)).toBe(true);
    expect(canShootBall(stale)).toBe(false);
  });

  it('cae al estado publico si aun no hay snapshot', () => {
    const fromState = ball({ x: 42 });
    expect(pickLiveBall(null, [fromState], 'a')?.x).toBe(42);
  });

  it('devuelve null sin jugador o sin datos', () => {
    expect(pickLiveBall(snapshot([ball()]), [], undefined)).toBeNull();
    expect(pickLiveBall(null, [], 'a')).toBeNull();
  });

  it('no confunde la bola de otro jugador', () => {
    const mine = ball({ playerId: 'a', x: 10 });
    const other = ball({ playerId: 'b', x: 900 });
    expect(pickLiveBall(snapshot([other, mine]), [], 'a')?.x).toBe(10);
  });
});
