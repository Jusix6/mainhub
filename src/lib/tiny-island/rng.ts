/**
 * Seeded randomness for Tiny Island. A world is fully described by its seed
 * (a short text, also in the URL as ?seed=…), so the same seed always gives
 * the same island.
 */
import { mulberry32 } from '@/lib/daily';

export type Rand = () => number;

/** FNV-1a: turns any seed text into a 32-bit number. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function randFor(seed: string, salt = ''): Rand {
  return mulberry32(hashSeed(seed + salt));
}

/** A fresh, readable seed like "k3f9qz" (no look-alike characters). */
export function newSeed(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/** Stable pseudo-random value in [0, 1) for a tile, used for pixel details. */
export function tileHash(x: number, y: number, k = 0): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + k * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
