import { describe, expect, it } from 'vitest';
import { createFpsGuard } from '../src/three/fps-guard.js';

function run(frames: { dt: number; workMs: number }[]) {
  const calls: string[] = [];
  const guard = createFpsGuard({
    onLowQuality: () => calls.push('baja'),
    onGiveUp: (fps) => calls.push('2d:' + Math.round(fps)),
  });
  let previous = 0;
  for (const frame of frames) {
    guard.sample(frame.dt, previous);
    previous = frame.workMs;
  }
  return calls;
}

const repeat = (seconds: number, fps: number, workMs: number) =>
  Array.from({ length: Math.round(seconds * fps) }, () => ({ dt: 1 / fps, workMs }));

describe('vigilancia de fps de la vista 3D', () => {
  it('a 60 fps no hace nada', () => {
    expect(run(repeat(20, 60, 4))).toEqual([]);
  });

  it('un equipo lento baja la calidad y, si sigue lento, vuelve a 2D', () => {
    expect(run(repeat(20, 12, 70))).toEqual(['baja', '2d:12']);
  });

  it('el navegador que estrangula una ventana tapada no manda a 2D', () => {
    // Chrome baja a ~1 fps sin marcar la página como oculta; el fotograma es barato.
    expect(run([...repeat(3, 60, 4), ...repeat(60, 1.3, 4), ...repeat(5, 60, 4)])).toEqual([]);
  });

  it('un fotograma caro seguido de un hueco largo sí cuenta como lentitud', () => {
    expect(run(repeat(30, 1.5, 400))).toEqual(['baja', '2d:2']);
  });

  it('solo avisa una vez', () => {
    expect(run(repeat(60, 10, 90)).filter((call) => call.startsWith('2d'))).toHaveLength(1);
  });
});
