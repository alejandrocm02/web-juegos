import { describe, expect, it } from 'vitest';
import { TANK_FIELD, type TankState, type TanksPublicState } from '@arcade/shared';
import {
  TANK_AIM_MIN_ZOOM,
  TANK_FLIGHT_MIN_ZOOM,
  TANK_OVERVIEW_ZOOM,
  TANK_VIEW,
  clampCameraX,
  easeCamera,
  predictShot,
  tankCameraTarget,
} from '../src/games/tanks-camera.js';

const tank = (playerId: string, x: number): TankState => ({
  playerId,
  x,
  y: TANK_FIELD.groundY - TANK_FIELD.tankHeight / 2,
  health: 100,
  alive: true,
  angle: -Math.PI / 4,
  power: 0.68,
  fuel: 4,
  kills: 0,
});

type CameraState = Pick<
  TanksPublicState,
  'phase' | 'tanks' | 'activePlayerId' | 'projectile' | 'explosions'
>;

const base: CameraState = {
  phase: 'aiming',
  tanks: [tank('a', 120), tank('b', 2080)],
  activePlayerId: 'a',
  projectile: null,
  explosions: [],
};

describe('cámara de Tanques', () => {
  it('nunca enseña fuera del campo', () => {
    expect(clampCameraX(0, 1)).toBe(TANK_VIEW.width / 2);
    expect(clampCameraX(TANK_FIELD.width, 1)).toBe(TANK_FIELD.width - TANK_VIEW.width / 2);
    expect(clampCameraX(300, TANK_OVERVIEW_ZOOM)).toBe(TANK_FIELD.width / 2);
  });

  it('«Ver todo el campo» y la cuenta atrás enseñan el campo entero', () => {
    expect(tankCameraTarget(base, { overview: true })).toEqual({
      x: TANK_FIELD.width / 2,
      zoom: TANK_OVERVIEW_ZOOM,
    });
    expect(tankCameraTarget({ ...base, phase: 'countdown' }, { overview: false }).zoom).toBe(
      TANK_OVERVIEW_ZOOM,
    );
  });

  it('sin apuntar sigue al tanque activo a zoom 1', () => {
    const target = tankCameraTarget({ ...base, activePlayerId: 'b' }, { overview: false });
    expect(target.zoom).toBe(1);
    expect(target.x).toBe(TANK_FIELD.width - TANK_VIEW.width / 2);
  });

  it('al apuntar lejos se aleja, pero no tanto como para perder el tanque', () => {
    const aim = predictShot({ tank: base.tanks[0]!, angleDeg: 45, power: 100 }, 0, []);
    expect(aim.end.x).toBeGreaterThan(1500);
    const target = tankCameraTarget(base, { overview: false, aim });
    expect(target.zoom).toBeGreaterThanOrEqual(TANK_AIM_MIN_ZOOM);
    expect(target.zoom).toBeLessThan(1);
    const half = TANK_VIEW.width / 2 / target.zoom;
    expect(base.tanks[0]!.x).toBeGreaterThanOrEqual(target.x - half);
  });

  it('sigue al proyectil y se aleja cuando sube mucho', () => {
    const low = tankCameraTarget(
      {
        ...base,
        phase: 'projectile',
        projectile: {
          ownerId: 'a',
          x: 900,
          y: 400,
          vx: 0,
          vy: 0,
          radius: 8,
          bounces: 0,
          trail: [],
        },
      },
      { overview: false },
    );
    expect(low.zoom).toBe(1);
    expect(low.x).toBe(900);
    const high = tankCameraTarget(
      {
        ...base,
        phase: 'projectile',
        projectile: {
          ownerId: 'a',
          x: 900,
          y: -500,
          vx: 0,
          vy: 0,
          radius: 8,
          bounces: 0,
          trail: [],
        },
      },
      { overview: false },
    );
    expect(high.zoom).toBeLessThan(1);
    expect(high.zoom).toBeGreaterThanOrEqual(TANK_FLIGHT_MIN_ZOOM);
  });

  it('la trayectoria prevista se para en los obstáculos', () => {
    const wall = { id: 'muro', x: 300, y: 300, width: 40, height: 228 };
    const aim = predictShot({ tank: base.tanks[0]!, angleDeg: 20, power: 80 }, 0, [wall]);
    expect(aim.end.x).toBeGreaterThanOrEqual(300);
    expect(aim.end.x).toBeLessThanOrEqual(345);
  });

  it('se acerca al objetivo sin saltar', () => {
    const next = easeCamera({ x: 500, zoom: 1 }, { x: 1500, zoom: 1 }, 1 / 60);
    expect(next.x).toBeGreaterThan(500);
    expect(next.x).toBeLessThan(700);
  });
});
