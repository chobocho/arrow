// Geometry helpers for the arrow mind map.
// All coordinates are expressed in the logical canvas space (0..MAX_CANVAS_SIZE).

export interface Vec {
  x: number;
  y: number;
}

export const MAX_CANVAS_SIZE = 8192;

export function vec(x: number, y: number): Vec {
  return { x, y };
}

export function vecAdd(a: Vec, b: Vec): Vec {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a: Vec, b: Vec): Vec {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(a: Vec, s: number): Vec {
  return { x: a.x * s, y: a.y * s };
}

export function vecLen(a: Vec): number {
  return Math.hypot(a.x, a.y);
}

export function vecDist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Shortest distance from point p to segment a-b. Returns Infinity when the segment is degenerate.
export function pointToSegmentDistance(p: Vec, a: Vec, b: Vec): number {
  const ab = vecSub(b, a);
  const len2 = ab.x * ab.x + ab.y * ab.y;
  if (len2 === 0) return vecDist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2));
  const closest = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return vecDist(p, closest);
}

// Clamp a logical-coordinate point inside the canvas bounds.
export function clampToCanvas(p: Vec): Vec {
  return {
    x: Math.max(0, Math.min(MAX_CANVAS_SIZE, p.x)),
    y: Math.max(0, Math.min(MAX_CANVAS_SIZE, p.y)),
  };
}
