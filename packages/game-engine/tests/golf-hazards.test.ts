import { describe, expect, it } from 'vitest';
import { getGolfLevel, type GolfLevel, type GolfSettings, type GolfSurface } from '@arcade/shared';
import { GolfWorld } from '../src/golf-sim.js';

const settings: GolfSettings = {
  ballCollisions: true,
  holeTimeLimitSeconds: 90,
  maxStrokes: 10,
  autoResetOutOfBounds: true,
  outOfBoundsPenalty: true,
};

/** Pasillo recto de 900 de largo hecho con las superficies que se indiquen, en orden. */
function corridor(surfaces: { surface: GolfSurface; w: number }[]): GolfLevel {
  let x = 0;
  const pads = surfaces.map((entry, index) => {
    const pad = { id: 'p' + index, rect: { x, y: 0, w: entry.w, h: 100 }, surface: entry.surface };
    x += entry.w;
    return pad;
  });
  return {
    id: 999,
    name: 'Prueba',
    theme: 'Prueba',
    difficulty: 'Fácil',
    par: 3,
    aceRoute: false,
    hint: '',
    size: { w: x, h: 100 },
    start: { x: 40, y: 50 },
    hole: { x: x - 30, y: 50 },
    pads,
    walls: [],
    circles: [],
    blades: [],
    ramps: [],
    checkpoints: [],
    respawnZones: [],
  };
}

function runUntilStopped(world: GolfWorld, playerId = 'p1'): void {
  for (let i = 0; i < 60 * 20; i++) {
    world.step(1 / 60);
    if (world.isBallStopped(playerId)) break;
  }
}

describe('agua', () => {
  const level = corridor([
    { surface: 'green', w: 200 },
    { surface: 'water', w: 60 },
    { surface: 'green', w: 640 },
  ]);

  it('devuelve la bola al punto del golpe y suma un golpe de castigo', () => {
    const world = new GolfWorld(level, settings, ['p1']);
    world.shoot('p1', 0, 0.5);
    runUntilStopped(world);
    const ball = world.getBall('p1')!;
    expect(ball.x).toBeCloseTo(level.start.x, 0);
    expect(ball.strokes).toBe(2);
    expect(ball.aceEligible).toBe(false);
    const kinds = world.drainFeed().map((event) => event.kind);
    expect(kinds).toContain('water');
    expect(kinds).toContain('penalty');
  });

  it('castiga aunque la sala no penalice salirse del recorrido', () => {
    const world = new GolfWorld(level, { ...settings, outOfBoundsPenalty: false }, ['p1']);
    world.shoot('p1', 0, 0.5);
    runUntilStopped(world);
    expect(world.getBall('p1')!.strokes).toBe(2);
  });

  it('una bola a toda potencia no cruza el estanque sin mojarse', () => {
    const world = new GolfWorld(level, settings, ['p1']);
    world.shoot('p1', 0, 1);
    runUntilStopped(world);
    const ball = world.getBall('p1')!;
    expect(ball.x).toBeLessThan(200);
    expect(ball.strokes).toBe(2);
  });

  it('desde un punto intermedio vuelve a ese punto, no a la salida', () => {
    const world = new GolfWorld(level, settings, ['p1']);
    world.shoot('p1', 0, 0.12);
    runUntilStopped(world);
    const halfway = world.getBall('p1')!.x;
    expect(halfway).toBeGreaterThan(level.start.x + 20);
    expect(halfway).toBeLessThan(200);
    world.shoot('p1', 0, 0.6);
    runUntilStopped(world);
    expect(world.getBall('p1')!.x).toBeCloseTo(halfway, 0);
  });
});

describe('hierba alta (rough)', () => {
  function distance(surface: GolfSurface): number {
    const world = new GolfWorld(corridor([{ surface, w: 900 }]), settings, ['p1']);
    world.shoot('p1', 0, 0.45);
    runUntilStopped(world);
    return world.getBall('p1')!.x - 40;
  }

  it('frena más que el green y menos que la arena', () => {
    const green = distance('green');
    const rough = distance('rough');
    const sand = distance('sand');
    expect(rough).toBeLessThan(green * 0.7);
    expect(rough).toBeGreaterThan(sand);
  });
});

describe('hoyo 5 con estanque', () => {
  const level = getGolfLevel(5);

  it('tiene un estanque y hierba alta', () => {
    const surfaces = level.pads.map((pad) => pad.surface);
    expect(surfaces).toContain('water');
    expect(surfaces).toContain('rough');
  });

  it('el hoyo queda en green y la salida sigue jugable', () => {
    const onPad = (x: number, y: number) =>
      level.pads.find(
        (pad) =>
          x >= pad.rect.x &&
          x <= pad.rect.x + pad.rect.w &&
          y >= pad.rect.y &&
          y <= pad.rect.y + pad.rect.h,
      );
    expect(onPad(level.hole.x, level.hole.y)?.surface).toBe('green');
    expect(onPad(level.start.x, level.start.y)?.surface).toBe('green');
  });

  it('se puede embocar sin pisar el agua', () => {
    // Búsqueda sencilla de golpes: el hoyo tiene que poder completarse en par
    // + 2 como mucho sin caer al estanque, por el atajo o por abajo.
    let best = Infinity;
    for (let first = -40; first <= 40 && best > level.par; first += 5) {
      for (const power1 of [0.55, 0.65, 0.75, 0.85]) {
        const world = new GolfWorld(level, settings, ['p1']);
        world.shoot('p1', (first * Math.PI) / 180, power1);
        runUntilStopped(world);
        for (let shot = 0; shot < 4; shot++) {
          const ball = world.getBall('p1')!;
          if (ball.holed || ball.finished) break;
          const angle = Math.atan2(level.hole.y - ball.y, level.hole.x - ball.x);
          const reach = Math.hypot(level.hole.x - ball.x, level.hole.y - ball.y);
          world.shoot('p1', angle, Math.min(1, 0.08 + reach / 700));
          runUntilStopped(world);
        }
        const ball = world.getBall('p1')!;
        const wet = world.drainFeed().some((event) => event.kind === 'water');
        if (ball.holed && !wet) best = Math.min(best, ball.strokes);
      }
    }
    expect(best).toBeLessThanOrEqual(level.par + 2);
  }, 30000);
});
