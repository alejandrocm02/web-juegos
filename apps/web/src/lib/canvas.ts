/**
 * Ajuste de resolucion de los lienzos a la densidad real de la pantalla.
 *
 * Todos los juegos declaran su lienzo con un tamano logico fijo (`width` y
 * `height` en el JSX) y lo estiran por CSS con `w-full`. En una pantalla 2x eso
 * significa que el navegador escala un mapa de bits de baja resolucion: el
 * resultado se ve borroso en cualquier portatil moderno o movil.
 *
 * La solucion es separar las dos dimensiones que hasta ahora eran una sola:
 *
 * - el *buffer* del lienzo pasa a medir `logico x dpr` pixeles reales;
 * - el *sistema de coordenadas* sigue siendo el logico, porque el contexto
 *   arranca cada fotograma con una transformacion de escala `dpr`.
 *
 * Asi ninguna vista tiene que recalcular geometria: sigue dibujando en las
 * mismas coordenadas de siempre y solo gana nitidez.
 */

/**
 * Tope de densidad aplicado.
 *
 * Por encima de 2x el area a rellenar crece con el cuadrado del factor
 * (una pantalla 3x pinta 9 veces mas pixeles) y la nitidez percibida ya no
 * mejora en proporcion. Con juegos que repintan a 60 fps, ese coste se nota
 * antes que la mejora.
 */
export const MAX_DPR = 2;

/** Densidad efectiva de la pantalla, acotada y a prueba de entornos sin DOM. */
export function canvasDpr(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

/** Lienzo visto por el codigo de dibujo: medidas logicas, no del buffer. */
export interface Viewport {
  width: number;
  height: number;
  /** Escala aplicada al contexto. Ausente equivale a 1 (tests, entornos sin DOM). */
  dpr?: number;
}

/**
 * Sincroniza el buffer del lienzo con la densidad de pantalla y deja el
 * contexto escalado y listo para dibujar en coordenadas logicas.
 *
 * Es idempotente y barata: solo toca `width`/`height` cuando cambian, porque
 * asignarlos vacia el lienzo y reinicia todo el estado del contexto.
 *
 * @returns el viewport logico que debe recibir el codigo de dibujo.
 */
export function syncCanvasResolution(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  logicalWidth: number,
  logicalHeight: number,
): Viewport {
  const dpr = canvasDpr();
  const width = Math.round(logicalWidth * dpr);
  const height = Math.round(logicalHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width: logicalWidth, height: logicalHeight, dpr };
}

/**
 * Reinicia la transformacion a la escala de densidad.
 *
 * Sustituye a `ctx.setTransform(1, 0, 0, 1, 0, 0)`: ese reset volvia al sistema
 * de coordenadas del buffer y anulaba el escalado, que es justo lo que no se
 * quiere ahora que buffer y coordenadas logicas ya no coinciden.
 */
export function resetToViewport(ctx: CanvasRenderingContext2D, view: Viewport): void {
  const dpr = view.dpr ?? 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
