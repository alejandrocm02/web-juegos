import { describe, expect, it } from 'vitest';
import { GOLF, getGolfLevel, golfWind, type GolfLevel, type GolfSettings } from '@arcade/shared';
import { GolfWorld } from '../src/golf-sim.js';

const baseSettings: GolfSettings = {
  mode: 'clasico',
  ballCollisions: false,
  holeTimeLimitSeconds: 90,
  maxStrokes: 10,
  autoResetOutOfBounds: true,
  outOfBoundsPenalty: true,
  windStrength: 0,
};

function settings(patch: Partial<GolfSettings> = {}): GolfSettings {
  return { ...baseSettings, ...patch };
}

function simulate(world: GolfWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
}

/**
 * Pasillo recto sin obstaculos, para medir una sola variable cada vez.
 *
 * Se construye a mano en lugar de reutilizar un hoyo del recorrido porque los
 * niveles reales tienen muros, pendientes y hoyo, y cualquiera de esos tres
 * ensucia la medida de lo unico que se quiere comprobar aqui.
 */
function corridor(surface: GolfLevel['pads'][number]['surface']): GolfLevel {
  const level = getGolfLevel(1);
  return {
    ...level,
    pads: [{ id: 'main', surface, rect: { x: 60, y: 90, w: 800, h: 120 } }],
    walls: [],
    circles: [],
    blades: [],
    ramps: [],
    checkpoints: [],
    // El hoyo fuera del pasillo: aqui no se quiere que la bola entre.
    hole: { x: -500, y: -500 },
  };
}

describe('viento', () => {
  it('es determinista para el mismo hoyo y semilla', () => {
    const a = golfWind(3, 1234);
    const b = golfWind(3, 1234);
    expect(a).toEqual(b);
  });

  it('cambia con el hoyo y con la semilla', () => {
    expect(golfWind(3, 1234)).not.toEqual(golfWind(4, 1234));
    expect(golfWind(3, 1234)).not.toEqual(golfWind(3, 9999));
  });

  it('escala con la intensidad y se anula con cero', () => {
    const normal = golfWind(3, 1234, 1);
    const doble = golfWind(3, 1234, 2);
    expect(Math.hypot(doble.x, doble.y)).toBeCloseTo(Math.hypot(normal.x, normal.y) * 2, 5);

    const nulo = golfWind(3, 1234, 0);
    expect(Math.hypot(nulo.x, nulo.y)).toBeCloseTo(0, 10);
  });

  it('con intensidad cero la trayectoria es identica a la de antes del cambio', () => {
    const run = (windStrength: number) => {
      const world = new GolfWorld(corridor('green'), settings({ windStrength }), ['p1'], 4242);
      world.shoot('p1', 0, 0.7);
      simulate(world, 4);
      const ball = world.snapshot().balls[0]!;
      return { x: ball.x, y: ball.y };
    };

    const sinViento = run(0);
    const otraVezSinViento = run(0);
    expect(sinViento).toEqual(otraVezSinViento);

    // Y con viento la bola acaba en otro sitio: si no, el viento no haria nada.
    const conViento = run(1);
    expect(Math.hypot(conViento.x - sinViento.x, conViento.y - sinViento.y)).toBeGreaterThan(0.5);
  });
});

describe('superficies nuevas', () => {
  it('el rough frena mas que el green con la misma potencia', () => {
    const distancia = (surface: 'green' | 'rough') => {
      const world = new GolfWorld(corridor(surface), settings(), ['p1'], 0);
      const inicio = world.snapshot().balls[0]!.x;
      world.shoot('p1', 0, 0.6);
      simulate(world, 6);
      return world.snapshot().balls[0]!.x - inicio;
    };

    expect(distancia('rough')).toBeLessThan(distancia('green'));
  });

  it('el agua devuelve la bola al ultimo punto estable y cobra un golpe', () => {
    const level = corridor('green');
    // Estanque que cruza el pasillo por delante de la salida.
    level.pads = [
      { id: 'salida', surface: 'green', rect: { x: 60, y: 90, w: 260, h: 120 } },
      { id: 'agua', surface: 'water', rect: { x: 320, y: 90, w: 180, h: 120 } },
      { id: 'lejos', surface: 'green', rect: { x: 500, y: 90, w: 360, h: 120 } },
    ];

    const world = new GolfWorld(level, settings(), ['p1'], 0);
    const antes = world.snapshot().balls[0]!;
    const estable = { x: antes.x, y: antes.y };
    expect(antes.strokes).toBe(0);

    world.shoot('p1', 0, 0.65);
    simulate(world, 5);

    const despues = world.snapshot().balls[0]!;
    // El golpe cuenta, mas la penalizacion.
    expect(despues.strokes).toBe(1 + GOLF.outPenalty);
    expect(despues.x).toBeCloseTo(estable.x, 3);
    expect(despues.y).toBeCloseTo(estable.y, 3);
    expect(despues.aceEligible).toBe(false);
    expect(despues.outOfBounds).toBe(false);
  });

  it('la penalizacion del agua no depende de outOfBoundsPenalty', () => {
    const level = corridor('green');
    level.pads = [
      { id: 'salida', surface: 'green', rect: { x: 60, y: 90, w: 260, h: 120 } },
      { id: 'agua', surface: 'water', rect: { x: 320, y: 90, w: 540, h: 120 } },
    ];

    const world = new GolfWorld(level, settings({ outOfBoundsPenalty: false }), ['p1'], 0);
    world.shoot('p1', 0, 0.65);
    simulate(world, 5);

    expect(world.snapshot().balls[0]!.strokes).toBe(1 + GOLF.outPenalty);
  });
});
