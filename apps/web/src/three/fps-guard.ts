/**
 * Vigilancia de rendimiento de la vista 3D, sin dependencias de Three.js para
 * poder probarla sola.
 *
 * Cada fotograma aporta el tiempo real desde el anterior y lo que tardó en
 * prepararse. Si en una ventana de 3 s la media baja de 25 fps, primero se
 * pide calidad baja y, si sigue igual, se abandona la 3D.
 *
 * Un hueco largo entre fotogramas con un fotograma barato no es un equipo
 * lento: es el navegador que estrangula `requestAnimationFrame` porque la
 * ventana está tapada o minimizada (Chrome baja a ~1 fps sin marcar la página
 * como oculta). Esos fotogramas no cuentan; antes mandaban a 2D a cualquiera
 * que tapase la ventana unos segundos.
 */

export const SLOW_FPS = 25;
export const WINDOW_SECONDS = 3;
/** Por encima de este hueco (s) el fotograma es sospechoso de estrangulamiento. */
export const THROTTLE_GAP_SECONDS = 0.5;
/** Por debajo de este coste (ms) el fotograma anterior no explica el hueco. */
export const CHEAP_FRAME_MS = 50;

export interface FpsGuardHooks {
  /** Primera vez por debajo: bajar la calidad. */
  onLowQuality: () => void;
  /** Segunda vez por debajo, ya en calidad baja: volver a 2D. */
  onGiveUp: (fps: number) => void;
}

export function createFpsGuard(hooks: FpsGuardHooks) {
  let windowTime = 0;
  let windowFrames = 0;
  let lowQuality = false;
  let warmup = 2;
  let finished = false;

  return {
    /**
     * @param realDt segundos reales desde el fotograma anterior.
     * @param previousWorkMs lo que tardó en prepararse el fotograma anterior.
     */
    sample(realDt: number, previousWorkMs: number): void {
      if (finished) return;
      if (realDt > THROTTLE_GAP_SECONDS && previousWorkMs < CHEAP_FRAME_MS) return;
      if (warmup > 0) {
        warmup -= realDt;
        return;
      }
      windowTime += realDt;
      windowFrames += 1;
      if (windowTime < WINDOW_SECONDS) return;
      const fps = windowFrames / windowTime;
      windowTime = 0;
      windowFrames = 0;
      if (fps >= SLOW_FPS) return;
      if (!lowQuality) {
        lowQuality = true;
        warmup = 1;
        hooks.onLowQuality();
      } else {
        finished = true;
        hooks.onGiveUp(fps);
      }
    },
  };
}
