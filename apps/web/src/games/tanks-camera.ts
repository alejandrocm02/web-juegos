import {
  TANK_BALLISTICS,
  TANK_FIELD,
  tankGroundAt,
  tankShotSpeed,
  type TankObstacle,
  type TankState,
  type TanksPublicState,
} from '@arcade/shared';

/**
 * Cámara y trayectoria prevista de Tanques, compartidas por la vista 2D y la 3D.
 *
 * El campo mide 2200 de ancho y la pantalla enseña un tramo de 1000 a zoom 1.
 * La cámara sigue lo que importa en cada fase: el tanque que apunta (y hasta
 * dónde llega su tiro), el proyectil en vuelo y la explosión. Se aleja sola
 * cuando el proyectil sube mucho, y con «Ver todo el campo» enseña el campo
 * entero.
 */

/** Ancho y alto lógicos de la vista 2D. */
export const TANK_VIEW = { width: 1000, height: 600 } as const;

/**
 * Zoom mínimo al seguir la acción. Alejarse más deja los tanques diminutos y
 * casi toda la pantalla en cielo; para ver el campo entero está «Ver todo el
 * campo» y el radar.
 */
export const TANK_AIM_MIN_ZOOM = 0.7;
export const TANK_FLIGHT_MIN_ZOOM = 0.6;

/** Zoom con el que cabe el campo entero a lo ancho. */
export const TANK_OVERVIEW_ZOOM = TANK_VIEW.width / TANK_FIELD.width;

export interface TankCameraTarget {
  /** Centro horizontal en coordenadas del campo. */
  x: number;
  /** 1 = tramo de 1000; TANK_OVERVIEW_ZOOM = campo entero. */
  zoom: number;
}

export interface TankAimPreview {
  tank: TankState;
  angleDeg: number;
  power: number;
}

export interface PredictedShot {
  points: { x: number; y: number }[];
  /** Último punto antes de tocar suelo, obstáculo o borde. */
  end: { x: number; y: number };
}

/** Misma integración que el servidor, a paso grueso: sirve para dibujar. */
export function predictShot(
  preview: TankAimPreview,
  wind: number,
  obstacles: TankObstacle[],
  mapId: string,
): PredictedShot {
  const step = 0.035;
  const angle = (-preview.angleDeg * Math.PI) / 180;
  const speed = tankShotSpeed(preview.power / 100);
  let x = preview.tank.x + Math.cos(angle) * TANK_BALLISTICS.muzzle;
  let y = preview.tank.y - 9 + Math.sin(angle) * TANK_BALLISTICS.muzzle;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;
  const points: { x: number; y: number }[] = [];
  for (let index = 0; index < 220; index += 1) {
    vx += wind * TANK_BALLISTICS.windAccel * step;
    vy += TANK_BALLISTICS.gravity * step;
    const nx = x + vx * step;
    const ny = y + vy * step;
    const ground = tankGroundAt(mapId, clamp(nx, 0, TANK_FIELD.width));
    if (nx < 0 || nx > TANK_FIELD.width || ny >= ground) {
      return { points, end: { x: clamp(nx, 0, TANK_FIELD.width), y: Math.min(ny, ground) } };
    }
    const blocked = obstacles.some(
      (o) => nx >= o.x && nx <= o.x + o.width && ny >= o.y && ny <= o.y + o.height,
    );
    if (blocked) return { points, end: { x: nx, y: ny } };
    x = nx;
    y = ny;
    points.push({ x, y });
  }
  return { points, end: { x, y } };
}

/** Zoom máximo que deja ver una altura dada (y de campo) con el suelo abajo. */
export function zoomForHeight(y: number): number {
  const needed = TANK_FIELD.groundY - y + 70;
  return TANK_FIELD.groundY / Math.max(TANK_FIELD.groundY, needed);
}

/** Zoom máximo que deja ver dos puntos separados horizontalmente, con margen. */
export function zoomForSpan(a: number, b: number): number {
  return TANK_VIEW.width / Math.max(TANK_VIEW.width, Math.abs(a - b) + 320);
}

/** Centro válido: nunca enseña fuera del campo. */
export function clampCameraX(x: number, zoom: number): number {
  const half = TANK_VIEW.width / 2 / zoom;
  if (half * 2 >= TANK_FIELD.width) return TANK_FIELD.width / 2;
  return clamp(x, half, TANK_FIELD.width - half);
}

export function tankCameraTarget(
  state: Pick<TanksPublicState, 'phase' | 'tanks' | 'activePlayerId' | 'projectile' | 'explosions'>,
  options: { overview: boolean; meId?: string; aim?: PredictedShot | null },
): TankCameraTarget {
  if (options.overview || state.phase === 'countdown' || state.phase === 'finished') {
    return { x: TANK_FIELD.width / 2, zoom: TANK_OVERVIEW_ZOOM };
  }
  let x: number;
  let zoom = 1;
  if (state.projectile) {
    x = state.projectile.x + state.projectile.vx * 0.25;
    zoom = Math.max(TANK_FLIGHT_MIN_ZOOM, zoomForHeight(state.projectile.y));
  } else if (state.explosions.length > 0) {
    x = state.explosions[state.explosions.length - 1]!.x;
  } else {
    const active =
      state.tanks.find((tank) => tank.playerId === state.activePlayerId) ??
      state.tanks.find((tank) => tank.playerId === options.meId);
    x = active?.x ?? TANK_FIELD.width / 2;
    if (active && options.aim) {
      // Apuntando: se ve el tanque y hasta dónde llega el tiro previsto.
      const top = Math.min(...options.aim.points.map((point) => point.y), active.y);
      x = (active.x + options.aim.end.x) / 2;
      zoom = Math.max(
        TANK_AIM_MIN_ZOOM,
        Math.min(zoomForSpan(active.x, options.aim.end.x), zoomForHeight(top)),
      );
      // Si el tiro llega más lejos de lo que cabe, se prima ver el tanque.
      const half = TANK_VIEW.width / 2 / zoom;
      x = clamp(x, active.x - half + 120, active.x + half - 120);
    }
  }
  zoom = clamp(zoom, TANK_OVERVIEW_ZOOM, 1);
  return { x: clampCameraX(x, zoom), zoom };
}

/** Acerca la cámara al objetivo sin saltos; `dt` en segundos. */
export function easeCamera(
  current: TankCameraTarget,
  target: TankCameraTarget,
  dt: number,
): TankCameraTarget {
  const k = 1 - Math.exp(-dt * 4.5);
  const zoom = current.zoom + (target.zoom - current.zoom) * k;
  return { x: clampCameraX(current.x + (target.x - current.x) * k, zoom), zoom };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
