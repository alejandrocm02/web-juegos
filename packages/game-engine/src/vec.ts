export interface V2 {
  x: number;
  y: number;
}

export const v = (x: number, y: number): V2 => ({ x, y });
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: V2, b: V2): number => a.x * b.x + a.y * b.y;
export const len = (a: V2): number => Math.hypot(a.x, a.y);
export const lenSq = (a: V2): number => a.x * a.x + a.y * a.y;

export function normalize(a: V2): V2 {
  const l = Math.hypot(a.x, a.y);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

/** Punto mas cercano del segmento AB al punto P. */
export function closestPointOnSegment(p: V2, a: V2, b: V2): V2 {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denom = abx * abx + aby * aby;
  if (denom < 1e-9) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / denom;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/** Refleja v respecto a la normal n (unitaria) aplicando restitucion. */
export function reflect(vel: V2, n: V2, restitution: number): V2 {
  const d = dot(vel, n);
  return {
    x: vel.x - (1 + restitution) * d * n.x,
    y: vel.y - (1 + restitution) * d * n.y,
  };
}
