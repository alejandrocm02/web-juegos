import type { GolfLevel, GolfPad, LinearMotion, Rect, Vec2 } from '@arcade/shared';
import { GOLF, motionOffsetPublic } from '@arcade/shared';

const EPS = 0.5;

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  restitution: number;
}

export function rectContains(rect: Rect, x: number, y: number, pad = 0): boolean {
  return (
    x >= rect.x - pad &&
    x <= rect.x + rect.w + pad &&
    y >= rect.y - pad &&
    y <= rect.y + rect.h + pad
  );
}

/** Desplazamiento actual de un movimiento lineal de ida y vuelta. */
export function motionOffset(motion: LinearMotion, timeSec: number): Vec2 {
  return motionOffsetPublic(motion, timeSec);
}

export function padRectAt(pad: GolfPad, timeSec: number): Rect {
  if (!pad.motion) return pad.rect;
  const off = motionOffset(pad.motion, timeSec);
  return { x: pad.rect.x + off.x, y: pad.rect.y + off.y, w: pad.rect.w, h: pad.rect.h };
}

interface Interval {
  from: number;
  to: number;
}

function subtractIntervals(base: Interval, cuts: Interval[]): Interval[] {
  let parts: Interval[] = [base];
  for (const cut of cuts) {
    const next: Interval[] = [];
    for (const part of parts) {
      if (cut.to <= part.from + EPS || cut.from >= part.to - EPS) {
        next.push(part);
        continue;
      }
      if (cut.from > part.from + EPS) next.push({ from: part.from, to: cut.from });
      if (cut.to < part.to - EPS) next.push({ from: cut.to, to: part.to });
    }
    parts = next;
  }
  return parts.filter((p) => p.to - p.from > EPS);
}

/**
 * Deriva las paredes estaticas del nivel a partir de los pads: cada borde que no
 * limita con otro pad se convierte en pared, salvo que el pad lo declare abierto.
 */
export function buildLevelWalls(level: GolfLevel): Segment[] {
  const restitution = level.wallRestitution ?? GOLF.wallRestitution;
  const statics = level.pads.filter((p) => !p.floating && !p.motion);
  const out: Segment[] = [];

  for (const pad of statics) {
    const r = pad.rect;
    const open = new Set(pad.open ?? []);
    const others = statics.filter((p) => p.id !== pad.id);

    if (!open.has('top')) {
      const cuts = others
        .filter((o) => Math.abs(o.rect.y + o.rect.h - r.y) < EPS)
        .map((o) => ({ from: o.rect.x, to: o.rect.x + o.rect.w }));
      for (const part of subtractIntervals({ from: r.x, to: r.x + r.w }, cuts)) {
        out.push({ ax: part.from, ay: r.y, bx: part.to, by: r.y, restitution });
      }
    }
    if (!open.has('bottom')) {
      const y = r.y + r.h;
      const cuts = others
        .filter((o) => Math.abs(o.rect.y - y) < EPS)
        .map((o) => ({ from: o.rect.x, to: o.rect.x + o.rect.w }));
      for (const part of subtractIntervals({ from: r.x, to: r.x + r.w }, cuts)) {
        out.push({ ax: part.from, ay: y, bx: part.to, by: y, restitution });
      }
    }
    if (!open.has('left')) {
      const cuts = others
        .filter((o) => Math.abs(o.rect.x + o.rect.w - r.x) < EPS)
        .map((o) => ({ from: o.rect.y, to: o.rect.y + o.rect.h }));
      for (const part of subtractIntervals({ from: r.y, to: r.y + r.h }, cuts)) {
        out.push({ ax: r.x, ay: part.from, bx: r.x, by: part.to, restitution });
      }
    }
    if (!open.has('right')) {
      const x = r.x + r.w;
      const cuts = others
        .filter((o) => Math.abs(o.rect.x - x) < EPS)
        .map((o) => ({ from: o.rect.y, to: o.rect.y + o.rect.h }));
      for (const part of subtractIntervals({ from: r.y, to: r.y + r.h }, cuts)) {
        out.push({ ax: x, ay: part.from, bx: x, by: part.to, restitution });
      }
    }
  }
  return out;
}
