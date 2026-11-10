/**
 * Puntería tipo tirachinas, independiente de la cámara.
 *
 * El jugador arrastra en la pantalla; aquí se traduce ese gesto al plano de la
 * mesa usando hacia dónde mira la cámara. Así el mismo gesto —tirar hacia uno
 * mismo para lanzar hacia delante— funciona con cualquier vista.
 */

export interface GroundBasis {
  /** Dirección «hacia el fondo de la pantalla» proyectada en el suelo (x, z). */
  forwardX: number;
  forwardZ: number;
}

export interface SlingShot {
  /** Dirección unitaria del tiro en el suelo (x, z del mundo). */
  x: number;
  z: number;
  /** Potencia entre 0 y 1. */
  power: number;
}

/** Arrastre mínimo, en píxeles, para que cuente como tiro y no como toque. */
export const SLING_DEAD_ZONE = 8;

/**
 * @param dragX desplazamiento horizontal del puntero desde el inicio (px, derecha positivo)
 * @param dragY desplazamiento vertical del puntero desde el inicio (px, abajo positivo)
 * @param reach píxeles de arrastre que equivalen a potencia máxima
 */
export function slingShot(
  dragX: number,
  dragY: number,
  reach: number,
  basis: GroundBasis,
): SlingShot | null {
  const length = Math.hypot(dragX, dragY);
  if (length < SLING_DEAD_ZONE || reach <= 0) return null;
  // «Derecha» en el suelo es la perpendicular horaria de «adelante».
  const rightX = -basis.forwardZ;
  const rightZ = basis.forwardX;
  // El tiro sale en sentido contrario al arrastre.
  const pullRight = -dragX / length;
  const pullForward = dragY / length;
  return {
    x: rightX * pullRight + basis.forwardX * pullForward,
    z: rightZ * pullRight + basis.forwardZ * pullForward,
    power: Math.min(1, length / reach),
  };
}
