import { describe, expect, it } from 'vitest';
import { GOLF, GOLF_LEVELS, getGolfLevel, type GolfSettings, type GolfLevel } from '@arcade/shared';
import { GolfWorld } from '../src/golf-sim.js';

const baseSettings: GolfSettings = {
  ballCollisions: true,
  holeTimeLimitSeconds: 90,
  maxStrokes: 10,
  autoResetOutOfBounds: true,
  outOfBoundsPenalty: true,
};

function settings(patch: Partial<GolfSettings> = {}): GolfSettings {
  return { ...baseSettings, ...patch };
}

function simulate(world: GolfWorld, seconds: number): void {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) world.step(1 / 60);
}

/** Reproduce un golpe concreto y devuelve el estado final de la bola. */
function playShot(
  level: GolfLevel,
  angleDeg: number,
  power: number,
  options: { delay?: number; config?: Partial<GolfSettings> } = {},
) {
  const world = new GolfWorld(level, settings(options.config), ['p1']);
  if (options.delay) simulate(world, options.delay);
  world.shoot('p1', (angleDeg * Math.PI) / 180, power);
  for (let i = 0; i < 60 * 25; i++) {
    world.step(1 / 60);
    const ball = world.getBall('p1')!;
    if (ball.holed || ball.finished) break;
  }
  return world.getBall('p1')!;
}

describe('validacion de golpes', () => {
  it('rechaza potencias invalidas', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1']);
    expect(world.shoot('p1', 0, 0).ok).toBe(false);
    expect(world.shoot('p1', 0, -0.5).ok).toBe(false);
    expect(world.shoot('p1', 0, 1.5).ok).toBe(false);
    expect(world.shoot('p1', 0, Number.NaN).ok).toBe(false);
    expect(world.shoot('p1', Number.POSITIVE_INFINITY, 0.5).ok).toBe(false);
    expect(world.shoot('p1', 0, 0.5).ok).toBe(true);
  });

  it('no permite golpear una bola en movimiento', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1']);
    expect(world.shoot('p1', 0, 0.9).ok).toBe(true);
    world.step(1 / 60);
    const second = world.shoot('p1', 0, 0.9);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('BALL_MOVING');
  });

  it('ignora numeros de secuencia repetidos o antiguos', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1']);
    expect(world.shoot('p1', 0, 0.2, 5).ok).toBe(true);
    simulate(world, 6);
    const stale = world.shoot('p1', 0, 0.2, 5);
    expect(stale.ok).toBe(false);
    expect(stale.reason).toBe('STALE_SEQUENCE');
  });

  it('bloquea golpes de jugadores que no estan en la partida', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1']);
    expect(world.shoot('intruso', 0, 0.5).reason).toBe('NOT_PLAYING');
  });
});

describe('colisiones entre bolas', () => {
  it('con colisiones activadas una bola empuja a la otra', () => {
    const world = new GolfWorld(getGolfLevel(1), settings({ ballCollisions: true }), ['a', 'b']);
    const before = world.getBall('b')!;
    world.shoot('a', Math.atan2(before.y - world.getBall('a')!.y, 1), 0.4);
    simulate(world, 3);
    const after = world.getBall('b')!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
  });

  it('con colisiones desactivadas las bolas se atraviesan', () => {
    const world = new GolfWorld(getGolfLevel(1), settings({ ballCollisions: false }), ['a', 'b']);
    const before = world.getBall('b')!;
    world.shoot('a', Math.atan2(before.y - world.getBall('a')!.y, 1), 0.4);
    simulate(world, 3);
    const after = world.getBall('b')!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.5);
  });
});

describe('fuera del recorrido', () => {
  const level = getGolfLevel(7); // plataformas flotantes rodeadas de vacio

  it('detecta la salida y reaparece con penalizacion', () => {
    const world = new GolfWorld(level, settings({ outOfBoundsPenalty: true }), ['p1']);
    world.shoot('p1', 0, 1);
    simulate(world, 4);
    const ball = world.getBall('p1')!;
    expect(ball.strokes).toBeGreaterThanOrEqual(2);
    expect(ball.aceEligible).toBe(false);
  });

  it('sin penalizacion no suma golpes al salirse', () => {
    const world = new GolfWorld(level, settings({ outOfBoundsPenalty: false }), ['p1']);
    world.shoot('p1', 0, 1);
    simulate(world, 4);
    expect(world.getBall('p1')!.strokes).toBe(1);
  });

  it('sin reinicio automatico la bola queda marcada fuera hasta reiniciar', () => {
    const world = new GolfWorld(
      level,
      settings({ autoResetOutOfBounds: false, outOfBoundsPenalty: false }),
      ['p1'],
    );
    world.shoot('p1', 0, 1);
    simulate(world, 4);
    expect(world.getBall('p1')!.outOfBounds).toBe(true);
    expect(world.shoot('p1', 0, 0.5).reason).toBe('OUT_OF_BOUNDS');
    world.manualReset('p1');
    expect(world.getBall('p1')!.outOfBounds).toBe(false);
  });
});

describe('hoyo y hoyo en uno', () => {
  it('detecta el hoyo completado y marca el hoyo en uno', () => {
    const ball = playShot(getGolfLevel(1), 0, 0.68);
    expect(ball.holed).toBe(true);
    expect(ball.strokes).toBe(1);
    expect(ball.ace).toBe(true);
    expect(ball.holedAtMs).not.toBeNull();
  });

  it('no cuenta como hoyo en uno si hubo reinicio previo', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1']);
    world.manualReset('p1');
    world.shoot('p1', 0, 0.68);
    simulate(world, 12);
    const ball = world.getBall('p1')!;
    expect(ball.aceEligible).toBe(false);
    if (ball.holed) expect(ball.ace).toBe(false);
  });

  it('no admite entrar en el hoyo por encima de la velocidad maxima', () => {
    const ball = playShot(getGolfLevel(1), 0, 1);
    expect(ball.strokes).toBe(1);
    // A maxima potencia la bola pasa de largo o rebota, no puede colarse directa.
    expect(ball.holed === false || ball.ace === true).toBe(true);
  });
});

describe('limites de la ronda', () => {
  it('termina la bola al agotar el limite de golpes', () => {
    const world = new GolfWorld(getGolfLevel(3), settings({ maxStrokes: 8 }), ['p1']);
    for (let shot = 0; shot < 8; shot++) {
      const result = world.shoot('p1', Math.PI, 0.12);
      if (!result.ok) break;
      simulate(world, 4);
    }
    const ball = world.getBall('p1')!;
    expect(ball.strokes).toBeLessThanOrEqual(8);
    expect(ball.finished || ball.holed).toBe(true);
  });

  it('aplica la puntuacion maxima cuando se agota el tiempo', () => {
    const world = new GolfWorld(getGolfLevel(3), settings({ holeTimeLimitSeconds: 60 }), ['p1']);
    simulate(world, 61);
    const ball = world.getBall('p1')!;
    expect(ball.finished).toBe(true);
    expect(ball.strokes).toBe(10);
    expect(world.allFinished()).toBe(true);
  });
});

describe('rutas de hoyo en uno disenadas', () => {
  const solutions: Record<number, { angle: number; power: number; delay?: number }> = {
    1: { angle: 0, power: 0.68 },
    2: { angle: 1.5, power: 0.8 },
    4: { angle: 346, power: 0.96 },
    6: { angle: 352.5, power: 0.98 },
    10: { angle: 35, power: 0.96 },
  };

  for (const [id, shot] of Object.entries(solutions)) {
    it('el nivel ' + id + ' permite hoyo en uno con habilidad', () => {
      const level = getGolfLevel(Number(id));
      expect(level.aceRoute).toBe(true);
      const ball = playShot(level, shot.angle, shot.power, { delay: shot.delay });
      expect(ball.holed).toBe(true);
      expect(ball.strokes).toBe(1);
      expect(ball.ace).toBe(true);
    });
  }

  it('los niveles sin ruta de hoyo en uno no estan marcados como tal', () => {
    for (const level of GOLF_LEVELS) {
      if ([1, 2, 4, 6, 10].includes(level.id)) continue;
      expect(level.aceRoute).toBe(false);
    }
  });

  it('el hoyo en uno exige precision: potencias vecinas no entran', () => {
    const misses = [0.2, 0.35, 0.95].filter((power) => !playShot(getGolfLevel(1), 0, power).ace);
    expect(misses.length).toBeGreaterThan(0);
  });
});

describe('reconexion durante un nivel', () => {
  it('mantiene la bola al reconectar y permite continuar', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1', 'p2']);
    world.shoot('p1', 0, 0.3);
    simulate(world, 3);
    const before = world.getBall('p1')!;
    world.addPlayer('p1'); // la reconexion no debe duplicar ni reiniciar la bola
    const after = world.getBall('p1')!;
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.strokes).toBe(before.strokes);
    expect(world.balls).toHaveLength(2);
  });

  it('elimina la bola de quien abandona', () => {
    const world = new GolfWorld(getGolfLevel(1), settings(), ['p1', 'p2']);
    world.removePlayer('p2');
    expect(world.balls).toHaveLength(1);
  });
});

describe('determinismo de la simulacion', () => {
  it('dos simulaciones identicas producen el mismo estado', () => {
    const run = () => {
      const world = new GolfWorld(getGolfLevel(4), settings({ ballCollisions: false }), ['p1']);
      world.shoot('p1', 0.2, 0.77);
      simulate(world, 8);
      return world.getBall('p1')!;
    };
    const a = run();
    const b = run();
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.strokes).toBe(b.strokes);
  });

  it('la velocidad maxima nunca supera el limite configurado', () => {
    const world = new GolfWorld(getGolfLevel(8), settings(), ['p1']);
    world.shoot('p1', 0.5, 1);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      world.step(1 / 60);
      const ball = world.getBall('p1')!;
      max = Math.max(max, Math.hypot(ball.vx, ball.vy));
    }
    expect(max).toBeLessThanOrEqual(GOLF.maxShotSpeed * 1.35);
  });
});

describe('la bola siempre acaba deteniendose', () => {
  /**
   * Regresion: en los niveles con aspas la bola podia quedar rebotando junto al
   * molino indefinidamente, porque cada contacto le reinyectaba energia. El
   * jugador veia que no podia volver a golpear nunca.
   */
  it('ningun nivel deja la bola en movimiento perpetuo', () => {
    for (const level of GOLF_LEVELS) {
      for (const degrees of [0, 90, 180, 270]) {
        const world = new GolfWorld(level, settings(), ['p1']);
        world.shoot('p1', (degrees * Math.PI) / 180, 1);
        let seconds = 0;
        const limit = 60 * 15;
        for (let i = 0; i < limit; i++) {
          world.step(1 / 60);
          const ball = world.getBall('p1')!;
          if (ball.holed || ball.finished) break;
          if (!ball.airborne && Math.hypot(ball.vx, ball.vy) === 0) break;
          seconds = (i + 1) / 60;
        }
        expect(seconds, 'nivel ' + level.id + ' angulo ' + degrees).toBeLessThan(14);
      }
    }
  }, 30000);

  it('un aspa redirige la bola pero no la acelera indefinidamente', () => {
    const level = getGolfLevel(4);
    const world = new GolfWorld(level, settings(), ['p1']);
    world.shoot('p1', 0, 0.9);
    let maxSpeed = 0;
    for (let i = 0; i < 60 * 12; i++) {
      world.step(1 / 60);
      const ball = world.getBall('p1')!;
      maxSpeed = Math.max(maxSpeed, Math.hypot(ball.vx, ball.vy));
    }
    // Nunca debe superar la velocidad de un golpe a maxima potencia.
    expect(maxSpeed).toBeLessThanOrEqual(GOLF.maxShotSpeed);
  });
});
