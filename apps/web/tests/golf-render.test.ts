import { describe, expect, it } from 'vitest';
import { getGolfLevel, type GolfBallState } from '@arcade/shared';
import { drawGolfFrame, type PlayerLook, type RenderBall } from '../src/games/golf-render.js';

/** Contexto 2D falso que apunta el orden de las operaciones de dibujo. */
function createRecordingContext() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(
        name + '(' + args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',') + ')',
      );
    };
  const ctx = {
    calls,
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    translate: record('translate'),
    scale: record('scale'),
    save: record('save'),
    restore: record('restore'),
    rotate: record('rotate'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    globalAlpha: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D & { calls: string[] };
}

const canvas = { width: 960, height: 560 } as HTMLCanvasElement;

function ball(playerId: string, x: number, y: number): RenderBall {
  const base: GolfBallState = {
    playerId,
    x,
    y,
    vx: 0,
    vy: 0,
    z: 0,
    airborne: false,
    strokes: 1,
    holed: false,
    holedAtMs: null,
    ace: false,
    aceEligible: true,
    outOfBounds: false,
    finished: false,
  };
  return { ...base, rx: x, ry: y };
}

const looks = new Map<string, PlayerLook>([
  ['a', { color: '#38bdf8', icon: 'circle', name: 'Ana' }],
  ['b', { color: '#f472b6', icon: 'triangle', name: 'Bea' }],
]);

describe('render del minigolf', () => {
  it('limpia el canvas una sola vez por fotograma', () => {
    const ctx = createRecordingContext();
    const level = getGolfLevel(2);
    drawGolfFrame(ctx, canvas, {
      level,
      balls: [ball('a', level.start.x, level.start.y)],
      camera: { x: level.start.x, y: level.start.y, zoom: 1 },
      time: 0,
      colorOf: looks,
      myId: 'a',
      aim: null,
    });
    const clears = ctx.calls.filter((c) => c.startsWith('clearRect'));
    expect(clears).toHaveLength(1);
  });

  it('dibuja el nivel despues del ultimo borrado, no antes', () => {
    const ctx = createRecordingContext();
    const level = getGolfLevel(1);
    drawGolfFrame(ctx, canvas, {
      level,
      balls: [ball('a', level.start.x, level.start.y)],
      camera: { x: level.start.x, y: level.start.y, zoom: 1 },
      time: 0,
      colorOf: looks,
      myId: 'a',
      aim: null,
    });

    const lastClear = ctx.calls.lastIndexOf(
      ctx.calls.filter((c) => c.startsWith('clearRect')).pop()!,
    );
    // El suelo de cada pad se pinta con fillRect: debe haber alguno posterior al borrado.
    const padFills = ctx.calls
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.startsWith('fillRect'))
      .map(({ i }) => i);
    expect(padFills.some((i) => i > lastClear)).toBe(true);
    // Y el hoyo (un arco) tambien.
    const arcs = ctx.calls.map((c, i) => ({ c, i })).filter(({ c }) => c.startsWith('arc'));
    expect(arcs.some(({ i }) => i > lastClear)).toBe(true);
  });

  it('pinta el suelo de todos los pads del nivel', () => {
    const ctx = createRecordingContext();
    const level = getGolfLevel(5);
    drawGolfFrame(ctx, canvas, {
      level,
      balls: [],
      camera: { x: 0, y: 0, zoom: 1 },
      time: 0,
      colorOf: looks,
      aim: null,
    });
    const fills = ctx.calls.filter((c) => c.startsWith('fillRect'));
    // Fondo + un relleno por pad, como minimo.
    expect(fills.length).toBeGreaterThanOrEqual(level.pads.length + 1);
  });

  it('dibuja las bolas encima del nivel y omite las embocadas', () => {
    const ctx = createRecordingContext();
    const level = getGolfLevel(1);
    const holed = { ...ball('b', 200, 150), holed: true };
    drawGolfFrame(ctx, canvas, {
      level,
      balls: [ball('a', 130, 150), holed],
      camera: { x: 130, y: 150, zoom: 1 },
      time: 0,
      colorOf: looks,
      myId: 'a',
      aim: null,
    });
    const names = ctx.calls.filter((c) => c.startsWith('fillText'));
    expect(names.some((c) => c.includes('Ana'))).toBe(true);
    expect(names.some((c) => c.includes('Bea'))).toBe(false);
  });

  it('dibuja la linea de apuntado cuando se esta arrastrando', () => {
    const level = getGolfLevel(1);
    const mine = ball('a', 130, 150);
    const withAim = createRecordingContext();
    drawGolfFrame(withAim, canvas, {
      level,
      balls: [mine],
      camera: { x: 130, y: 150, zoom: 1 },
      time: 0,
      colorOf: looks,
      myId: 'a',
      aim: { ball: mine, drag: { x: 60, y: 150 } },
    });
    const withoutAim = createRecordingContext();
    drawGolfFrame(withoutAim, canvas, {
      level,
      balls: [mine],
      camera: { x: 130, y: 150, zoom: 1 },
      time: 0,
      colorOf: looks,
      myId: 'a',
      aim: null,
    });
    expect(withAim.calls.filter((c) => c.startsWith('setLineDash')).length).toBeGreaterThan(
      withoutAim.calls.filter((c) => c.startsWith('setLineDash')).length,
    );
  });

  it('los obstaculos moviles se dibujan en posiciones distintas segun el reloj', () => {
    const level = getGolfLevel(7); // plataformas flotantes
    const snapshot = (time: number) => {
      const ctx = createRecordingContext();
      drawGolfFrame(ctx, canvas, {
        level,
        balls: [],
        camera: { x: 470, y: 330, zoom: 1 },
        time,
        colorOf: looks,
        aim: null,
      });
      return ctx.calls.filter((c) => c.startsWith('fillRect')).join('|');
    };
    expect(snapshot(0)).not.toBe(snapshot(2.2));
  });
});
