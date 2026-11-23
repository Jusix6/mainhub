/**
 * 2 Many Notes, phase 4: small pixel textures (32–128 px, NearestFilter: no
 * smoothing, the crisp PS2 look), all drawn in code with a seeded random
 * generator so they look the same every time. Most are light grey detail maps
 * (around white) that the material colour tints, so one wood texture serves
 * every wooden thing. Only the notes stay smooth and clean.
 */
import * as THREE from 'three';

/** Small seeded random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function make(w: number, h: number, paint: (img: ImageData, r: () => number) => void, seed: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  paint(img, rng(seed));
  g.putImageData(img, 0, 0);
  return c;
}

function texture(c: HTMLCanvasElement, rx = 1, ry = 1, color = false) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const set = (img: ImageData, i: number, v: number) => {
  const k = Math.max(0, Math.min(255, Math.round(v)));
  img.data[i * 4] = k;
  img.data[i * 4 + 1] = k;
  img.data[i * 4 + 2] = k;
  img.data[i * 4 + 3] = 255;
};

const cache = new Map<string, HTMLCanvasElement>();
function canvasOf(name: string) {
  if (cache.has(name)) return cache.get(name)!;
  let c: HTMLCanvasElement;
  switch (name) {
    case 'wood':
      // Long grain along x, a few darker streaks and knots
      c = make(
        64,
        64,
        (img, r) => {
          const rows = Array.from({ length: 64 }, () => 205 + r() * 40);
          for (let y = 0; y < 64; y++) {
            const streak = r() < 0.12 ? -30 : 0;
            for (let x = 0; x < 64; x++) {
              const wave = Math.sin((x / 64) * Math.PI * 2 * 2 + y * 0.7) * 6;
              set(img, y * 64 + x, rows[y] + wave + streak + (r() - 0.5) * 10);
            }
          }
        },
        7,
      );
      break;
    case 'plaster':
      c = make(
        64,
        64,
        (img, r) => {
          for (let i = 0; i < 64 * 64; i++) set(img, i, 238 + (r() - 0.5) * 16 - (r() < 0.03 ? 22 : 0));
        },
        11,
      );
      break;
    case 'carpet':
      c = make(
        64,
        64,
        (img, r) => {
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) set(img, y * 64 + x, 215 + (r() - 0.5) * 60 + ((x + y) % 8 < 1 ? -14 : 0));
        },
        13,
      );
      break;
    case 'ceiling':
      // One ceiling tile with its frame and pinholes
      c = make(
        64,
        64,
        (img, r) => {
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const edge = x < 2 || y < 2 || x > 61 || y > 61;
              set(img, y * 64 + x, edge ? 170 : 240 + (r() - 0.5) * 12 - (r() < 0.06 ? 50 : 0));
            }
        },
        17,
      );
      break;
    case 'cork':
      c = make(
        64,
        64,
        (img, r) => {
          for (let i = 0; i < 64 * 64; i++) set(img, i, 215 + (r() - 0.5) * 70);
        },
        19,
      );
      break;
    case 'plastic':
      c = make(
        32,
        32,
        (img, r) => {
          for (let i = 0; i < 32 * 32; i++) set(img, i, 244 + (r() - 0.5) * 12);
        },
        23,
      );
      break;
    case 'metal':
      // The bin's mesh: rows of holes
      c = make(
        32,
        32,
        (img) => {
          for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) set(img, y * 32 + x, x % 4 < 2 && y % 4 < 2 ? 120 : 240);
        },
        29,
      );
      break;
    case 'keys': {
      // Keyboard top: rows of keys
      c = make(
        128,
        40,
        (img, r) => {
          for (let i = 0; i < 128 * 40; i++) set(img, i, 150);
          const rows = [14, 14, 13, 12];
          rows.forEach((n, row) => {
            const kw = Math.floor(120 / n);
            for (let k = 0; k < n; k++) {
              const x0 = 4 + k * kw + (row % 2) * 2;
              const y0 = 3 + row * 9;
              const w = row === 3 && k === Math.floor(n / 2) ? kw * 4 : kw - 2;
              if (row === 3 && k > n / 2 && k < n / 2 + 3) continue;
              for (let y = y0; y < y0 + 7; y++)
                for (let x = x0; x < Math.min(126, x0 + w); x++) set(img, y * 128 + x, (y === y0 ? 255 : 236) + (r() - 0.5) * 6);
            }
          });
        },
        31,
      );
      break;
    }
    default:
      throw new Error(name);
  }
  cache.set(name, c);
  return c;
}

export type TexName = 'wood' | 'plaster' | 'carpet' | 'ceiling' | 'cork' | 'plastic' | 'metal' | 'keys';

/** A detail texture, repeated rx × ry times over the face. */
export const pix = (name: TexName, rx = 1, ry = 1) => texture(canvasOf(name), rx, ry);

/** A coloured pixel texture from a 2D drawing (labels, the mug). */
export function pixPaint(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  return texture(c, 1, 1, true);
}

/**
 * A sharp texture for printing that should be read (Update 2): drawn at k times
 * the size with the same commands, smooth when scaled.
 */
export function hiPaint(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, k = 4) {
  const c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const g = c.getContext('2d')!;
  g.scale(k, k);
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Puts a detail texture on a mesh (keeps its colour as the tint). */
export function skin(m: THREE.Mesh, name: TexName, rx = 1, ry = 1) {
  const mat = m.material as THREE.MeshLambertMaterial;
  mat.map = pix(name, rx, ry);
  mat.needsUpdate = true;
  return m;
}
