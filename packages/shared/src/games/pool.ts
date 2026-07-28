/** Billar casual por turnos, vista cenital. Unidades del mundo en centimetros. */

export const POOL_TABLE = {
  width: 254,
  height: 127,
  cushion: 6,
  ballRadius: 2.85,
  pocketRadius: 6.4,
} as const;

export const POOL_MAX_POWER = 1;
/** Velocidad maxima (cm/s) que puede imprimirse a la bola blanca. */
export const POOL_MAX_SPEED = 620;
/** Por debajo de esta velocidad (cm/s) una bola se considera detenida. */
export const POOL_STOP_SPEED = 2.5;

export const POOL_FRICTION: Record<'lenta' | 'normal' | 'rapida', number> = {
  lenta: 1.05,
  normal: 0.78,
  rapida: 0.52,
};

export interface PoolBallState {
  id: number;
  /** 0 es la bola blanca. */
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  pocketed: boolean;
}

export interface PoolSnapshot {
  balls: PoolBallState[];
  settled: boolean;
  tick: number;
}

export function poolPockets(): { x: number; y: number }[] {
  const { width, height } = POOL_TABLE;
  return [
    { x: 0, y: 0 },
    { x: width / 2, y: -1.5 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width / 2, y: height + 1.5 },
    { x: width, y: height },
  ];
}
