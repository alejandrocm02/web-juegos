import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_DPR, canvasDpr, resetToViewport, syncCanvasResolution } from '../src/lib/canvas.js';

/**
 * Ajuste de resolucion de los lienzos.
 *
 * Lo que se comprueba aqui es la separacion entre las dos dimensiones que
 * antes eran una sola: el buffer crece con la densidad de pantalla, pero el
 * viewport que ve el codigo de dibujo sigue midiendo lo mismo de siempre.
 */

/** Lienzo y contexto minimos: solo hace falta lo que toca esta funcion. */
function fakeCanvas() {
  const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
  const transforms: number[][] = [];
  const ctx = {
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) =>
      transforms.push([a, b, c, d, e, f]),
  } as unknown as CanvasRenderingContext2D;
  return { canvas, ctx, transforms };
}

function withDpr(value: number) {
  vi.stubGlobal('window', { devicePixelRatio: value });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('densidad efectiva', () => {
  it('usa la densidad real de la pantalla', () => {
    withDpr(2);
    expect(canvasDpr()).toBe(2);
  });

  it('acota la densidad al maximo permitido', () => {
    // Una pantalla 3x pintaria nueve veces mas pixeles por fotograma; a 60 fps
    // el coste llega antes que la mejora perceptible.
    withDpr(3);
    expect(canvasDpr()).toBe(MAX_DPR);
  });

  it('cae a 1 cuando el navegador no informa de densidad', () => {
    vi.stubGlobal('window', {});
    expect(canvasDpr()).toBe(1);
  });
});

describe('sincronizacion del lienzo', () => {
  it('agranda el buffer pero mantiene el viewport logico', () => {
    withDpr(2);
    const { canvas, ctx } = fakeCanvas();

    const view = syncCanvasResolution(canvas, ctx, 960, 560);

    // El buffer duplica su tamano...
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1120);
    // ...pero el codigo de dibujo sigue trabajando en 960x560, asi que ninguna
    // vista tiene que recalcular geometria ni campo de vision.
    expect(view).toEqual({ width: 960, height: 560, dpr: 2 });
  });

  it('escala el contexto para compensar el buffer mayor', () => {
    withDpr(2);
    const { canvas, ctx, transforms } = fakeCanvas();
    syncCanvasResolution(canvas, ctx, 100, 50);
    expect(transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('no reasigna el tamano si no ha cambiado', () => {
    withDpr(1);
    const { canvas, ctx } = fakeCanvas();
    syncCanvasResolution(canvas, ctx, 300, 150);

    // Asignar width o height vacia el lienzo y reinicia el contexto: repetirlo
    // en cada fotograma seria un borrado extra y estado perdido.
    let writes = 0;
    Object.defineProperty(canvas, 'width', {
      get: () => 300,
      set: () => {
        writes += 1;
      },
    });
    syncCanvasResolution(canvas, ctx, 300, 150);
    expect(writes).toBe(0);
  });

  it('sigue la densidad si cambia de pantalla entre fotogramas', () => {
    const { canvas, ctx } = fakeCanvas();
    withDpr(1);
    expect(syncCanvasResolution(canvas, ctx, 200, 100).dpr).toBe(1);
    expect(canvas.width).toBe(200);

    // Arrastrar la ventana a un monitor de mayor densidad.
    withDpr(2);
    expect(syncCanvasResolution(canvas, ctx, 200, 100).dpr).toBe(2);
    expect(canvas.width).toBe(400);
  });
});

describe('reinicio de transformacion', () => {
  it('vuelve a la escala de densidad, no a la identidad', () => {
    const { ctx, transforms } = fakeCanvas();
    resetToViewport(ctx, { width: 960, height: 560, dpr: 2 });
    expect(transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
  });

  it('trata un viewport sin densidad como escala 1', () => {
    const { ctx, transforms } = fakeCanvas();
    resetToViewport(ctx, { width: 960, height: 560 });
    expect(transforms).toEqual([[1, 0, 0, 1, 0, 0]]);
  });
});
