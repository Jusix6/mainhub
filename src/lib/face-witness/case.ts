/**
 * Face Witness: the daily case. From the case number (seed) a suspect is
 * made: one variant per part, a little wider or narrower, higher or lower;
 * sometimes no moustache, mostly no glasses. The witness statement describes
 * it in words, and a submitted picture gets a score per part.
 */
import { LIB, ORDER, PARTS, type PartId } from './parts';
import { newPart, rng, type Parts } from './render';

/** Parts whose height on the face the witness mentions. */
const PLACED: PartId[] = ['eyes', 'brows', 'nose', 'mouth', 'moustache'];

export function makeSuspect(no: number): Parts {
  const R = rng(no * 7919 + 13);
  const t: Parts = {};
  const rnd = (a: number) => Math.round((R() - 0.5) * 2 * a);
  for (const id of ORDER) {
    const d = PARTS[id];
    if (id === 'moustache' && R() < 0.45) continue;
    if (id === 'glasses' && R() < 0.65) continue;
    const p = newPart(id, Math.floor(R() * d.variants.length));
    if (id !== 'glasses') {
      p.sx = +(1 + (R() - 0.5) * 0.44).toFixed(2);
      p.sy = +(1 + (R() - 0.5) * 0.44).toFixed(2);
    }
    if (PLACED.includes(id)) p.y += rnd(14);
    if (d.pair) p.sp += rnd(12);
    t[id] = p;
  }
  // Glasses sit on the eyes
  if (t.glasses && t.eyes) {
    t.glasses.y = t.eyes.y;
    t.glasses.sx = +(t.eyes.sp / 80).toFixed(2);
  }
  return t;
}

export interface HintStrings {
  wider: string;
  narrower: string;
  longer: string;
  shorter: string;
  taller: string;
  flatter: string;
  apart: string;
  close: string;
  low: string;
  high: string;
}

/** What the witness adds about size and place ("wider than normal, sat rather low"). */
export function hints(id: PartId, p: NonNullable<Parts[PartId]>, H: HintStrings): string[] {
  const d = PARTS[id];
  const o: string[] = [];
  if (id === 'glasses') return o;
  const long = id === 'nose' || id === 'head';
  if (p.sx > 1.12) o.push(H.wider);
  else if (p.sx < 0.9) o.push(H.narrower);
  if (p.sy > 1.12) o.push(long ? H.longer : H.taller);
  else if (p.sy < 0.9) o.push(long ? H.shorter : H.flatter);
  if (d.pair && d.def.sp) {
    if (p.sp > d.def.sp + 6) o.push(H.apart);
    else if (p.sp < d.def.sp - 6) o.push(H.close);
  }
  const dy = p.y - d.def.y;
  if (PLACED.includes(id)) {
    if (dy > 7) o.push(H.low);
    else if (dy < -7) o.push(H.high);
  }
  return o;
}

export interface Score {
  /** Per part, in library order: 0 … 100. */
  rows: [PartId, number][];
  total: number;
}

/** The right variant counts most (60), then size, place, rotation and spacing (40). */
export function score(drawn: Parts, suspect: Parts): Score {
  const rows: [PartId, number][] = [];
  for (const id of LIB) {
    const a = drawn[id];
    const b = suspect[id];
    if (!a && !b) {
      if (PARTS[id].optional) rows.push([id, 100]);
      continue;
    }
    if (!a || !b) {
      rows.push([id, 0]);
      continue;
    }
    const d = PARTS[id];
    let e = (Math.abs(a.sx - b.sx) + Math.abs(a.sy - b.sy)) / 0.5 / 2 + Math.hypot(a.x - b.x, a.y - b.y) / 40 + Math.abs(a.rot - b.rot) / 25;
    if (d.pair) e += Math.abs(a.sp - b.sp) / 25;
    e /= d.pair ? 4 : 3;
    const t = Math.max(0, 1 - e);
    rows.push([id, Math.round(a.v === b.v ? 60 + 40 * t : 20 * t)]);
  }
  return { rows, total: Math.round(rows.reduce((s, r) => s + r[1], 0) / rows.length) };
}

/** The rank for a total: [from %, text] from the best down. */
export function rankOf(total: number, ranks: readonly (readonly [number, string])[]): string {
  return (ranks.find(([min]) => total >= min) ?? ranks[ranks.length - 1])[1];
}
