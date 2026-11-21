/**
 * Face Witness: turns the vector parts into the dotted print look and draws
 * the picture (500 × 600 units). Each variant is drawn once at twice the
 * size on three layers, blurred, and turned into random dots whose density
 * follows the darkness; the result is cached as a sprite.
 */
import { ORDER, PARTS, type PartId } from './parts';

type Ctx = CanvasRenderingContext2D;

/** Sprite resolution (pixels per part unit). */
const S = 2;

/** One placed part: variant, position, scale, rotation (degrees), spacing of pairs. */
export interface Part {
  v: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  rot: number;
  sp: number;
}

export type Parts = Partial<Record<PartId, Part>>;

export const newPart = (id: PartId, v: number): Part => {
  const d = PARTS[id].def;
  return { v, x: d.x, y: d.y, sx: 1, sy: 1, rot: 0, sp: d.sp || 0 };
};

export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box blur, two passes (close to a gaussian). */
function blur(a: Float32Array, w: number, h: number, radius: number) {
  const r = Math.round(radius);
  if (r < 1) return;
  const t = new Float32Array(a.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += a[o + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) {
        t[o + x] = sum / n;
        sum += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / n;
        sum += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
      }
    }
  }
}

type Sprite = HTMLCanvasElement & { box: [number, number, number, number] };
const cache = new Map<string, Sprite>();

/** The dotted picture of one variant, with the box of its dots (part units, around the middle). */
function sprite(id: PartId, v: number): Sprite {
  const key = id + v;
  const hit = cache.get(key);
  if (hit) return hit;
  const d = PARTS[id];
  const w = d.w * S;
  const h = d.h * S;
  const layer = () => {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const x = cv.getContext('2d', { willReadFrequently: true })!;
    x.scale(S, S);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    return x;
  };
  const xs = layer();
  const xc = layer();
  const xh = layer();
  const R = rng(hash(key));
  d.variants[v](xs, xc, xh, R);
  const alpha = (x: Ctx) => {
    const id = x.getImageData(0, 0, w, h).data;
    const a = new Float32Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = id[i * 4 + 3] / 255;
    return a;
  };
  const as = alpha(xs);
  const ac = alpha(xc);
  const ah = alpha(xh);
  blur(as, w, h, d.blur * S);
  blur(ac, w, h, 1);
  blur(ah, w, h, 2 * S);
  const out = document.createElement('canvas') as Sprite;
  out.width = w;
  out.height = h;
  const ox = out.getContext('2d')!;
  const im = ox.createImageData(w, h);
  const o = im.data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < as.length; i++) {
    let dd = 1 - (1 - as[i]) * (1 - ac[i]);
    dd *= 1 - ah[i] * 0.95;
    const p = dd < 0.035 ? 0 : Math.min(1, Math.pow(dd, 1.45) * 1.05);
    if (R() < p) {
      const j = i * 4;
      o[j] = o[j + 1] = 20;
      o[j + 2] = 24;
      o[j + 3] = 255;
      const px = i % w;
      const py = (i / w) | 0;
      if (px < x0) x0 = px;
      if (px > x1) x1 = px;
      if (py < y0) y0 = py;
      if (py > y1) y1 = py;
    }
  }
  ox.putImageData(im, 0, 0);
  out.box = x1 > x0 ? [x0 / S - d.w / 2, y0 / S - d.h / 2, x1 / S - d.w / 2, y1 / S - d.h / 2] : [-20, -20, 20, 20];
  cache.set(key, out);
  return out;
}

/** Where a part is drawn: once, or twice mirrored for pairs ([x, y, mirror]). */
function halves(id: PartId, p: Part): [number, number, 1 | -1][] {
  return PARTS[id].pair
    ? [
        [p.x - p.sp, p.y, 1],
        [p.x + p.sp, p.y, -1],
      ]
    : [[p.x, p.y, 1]];
}

export function drawPart(x: Ctx, id: PartId, p: Part) {
  const d = PARTS[id];
  const spr = sprite(id, p.v);
  for (const [cx, cy, m] of halves(id, p)) {
    x.save();
    x.translate(cx, cy);
    x.rotate((m * p.rot * Math.PI) / 180);
    x.scale(p.sx * m * (d.k || 1), p.sy * (d.k || 1));
    x.drawImage(spr, -d.w / 2, -d.h / 2, d.w, d.h);
    x.restore();
  }
}

/** Box around everything a part covers on the picture. */
export function bbox(id: PartId, p: Part): [number, number, number, number] {
  const kk = PARTS[id].k || 1;
  const b = sprite(id, p.v).box.map((v) => v * kk);
  let a: [number, number, number, number] = [1e9, 1e9, -1e9, -1e9];
  for (const [cx, cy, m] of halves(id, p)) {
    const r = (m * p.rot * Math.PI) / 180;
    for (const lx of [b[0], b[2]])
      for (const ly of [b[1], b[3]]) {
        const X = lx * p.sx * m;
        const Y = ly * p.sy;
        const px = cx + X * Math.cos(r) - Y * Math.sin(r);
        const py = cy + X * Math.sin(r) + Y * Math.cos(r);
        a = [Math.min(a[0], px), Math.min(a[1], py), Math.max(a[2], px), Math.max(a[3], py)];
      }
  }
  return a;
}

/** Is the point (picture units) on the part? */
export function hit(id: PartId, p: Part, x: number, y: number) {
  const kk = PARTS[id].k || 1;
  const b = sprite(id, p.v).box.map((v) => v * kk);
  for (const [cx, cy, m] of halves(id, p)) {
    const r = (m * p.rot * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    const X = dx * Math.cos(r) + dy * Math.sin(r);
    const Y = -dx * Math.sin(r) + dy * Math.cos(r);
    const lx = X / (p.sx * m);
    const ly = Y / p.sy;
    if (lx > b[0] - 8 && lx < b[2] + 8 && ly > b[1] - 8 && ly < b[3] + 8) return true;
  }
  return false;
}

export const PAPER = '#f1f0ed';

/** The whole picture at scale `k`; optional guide lines and the selected part with its move handle. */
export function render(x: Ctx, parts: Parts, k: number, o: { guides?: boolean; sel?: PartId | null } = {}) {
  x.setTransform(k, 0, 0, k, 0, 0);
  x.fillStyle = PAPER;
  x.fillRect(0, 0, 500, 600);
  if (o.guides) {
    x.strokeStyle = 'rgba(30,60,220,.35)';
    x.lineWidth = 1;
    x.setLineDash([5, 5]);
    x.beginPath();
    x.moveTo(250, 0);
    x.lineTo(250, 600);
    for (const y of [238, 288, 345, 472]) {
      x.moveTo(60, y);
      x.lineTo(440, y);
    }
    x.stroke();
    x.setLineDash([]);
  }
  for (const id of ORDER) {
    const p = parts[id];
    if (p) drawPart(x, id, p);
  }
  const sel = o.sel ? parts[o.sel] : undefined;
  if (o.sel && sel) {
    const b = bbox(o.sel, sel);
    x.strokeStyle = '#2430d0';
    x.lineWidth = 1.6;
    x.strokeRect(b[0] - 4, b[1] - 4, b[2] - b[0] + 8, b[3] - b[1] + 8);
    // A grey 95 button with a move cross next to it
    const mx = Math.min(462, b[2] + 10);
    const my = Math.max(4, b[1] - 40);
    x.fillStyle = '#c3c3c3';
    x.fillRect(mx, my, 34, 34);
    x.fillStyle = '#fff';
    x.fillRect(mx, my, 34, 2);
    x.fillRect(mx, my, 2, 34);
    x.fillStyle = '#555';
    x.fillRect(mx, my + 32, 34, 2);
    x.fillRect(mx + 32, my, 2, 34);
    x.fillStyle = '#00107f';
    const c0 = mx + 17;
    const c1 = my + 17;
    x.beginPath();
    for (const [a, b2] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      x.moveTo(c0 + a * 12, c1 + b2 * 12);
      x.lineTo(c0 + a * 5 - b2 * 6, c1 + b2 * 5 + a * 6);
      x.lineTo(c0 + a * 5 + b2 * 6, c1 + b2 * 5 - a * 6);
    }
    x.fill();
    x.fillRect(c0 - 3, c1 - 3, 6, 6);
  }
}
