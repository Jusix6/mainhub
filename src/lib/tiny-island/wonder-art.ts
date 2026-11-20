/**
 * How the eight world wonders look (phase H): drawn from rectangles on their
 * 4 × 4 tiles (32 × 32 world pixels, the tall ones reach higher). Under
 * construction only the lower part stands, in five stages, with scaffolding
 * and a crane; a lost race leaves a grey ruin.
 */
import type { WonderKind } from './wonders';

export interface WonderLook {
  /** Seconds of game time, for flames, water and flags. */
  t: number;
  /** Colours of the people holding it. */
  cloth: string;
  dark: string;
  /** 0 … 1 built; 1 = done. */
  progress: number;
  ruin: boolean;
  night: number;
  /** The colossus: the hero in bronze. */
  hero?: { female: boolean };
}

type Rect = (x: number, y: number, w: number, h: number, c: string) => void;

const STONE = '#d8d4c8';
const STONE_DARK = '#a9a49a';
const SAND = '#d9b98b';
const SAND_DARK = '#b08a5c';
const WOOD = '#8a5a2b';
const LEAF = '#3aa64b';
const LEAF_DARK = '#2f8a3a';

/** Ruins and unfinished sites: everything in greys. */
function grey(c: string) {
  const n = parseInt(c.slice(1), 16);
  const g = Math.round(((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) * 0.85 + 20);
  const h = Math.min(255, g).toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/** Draws a wonder with its bottom left corner at (x0, y0 + 32) in world pixels. */
export function drawWonder(ctx: CanvasRenderingContext2D, kind: WonderKind, x0: number, y0: number, look: WonderLook) {
  const base = y0 + 32;
  const r: Rect = (x, y, w, h, c) => {
    ctx.fillStyle = look.ruin ? grey(c) : c;
    ctx.fillRect(x0 + x, base - y - h, w, h);
  };
  // The site: trodden earth
  ctx.fillStyle = 'rgba(204, 174, 124, 0.6)';
  ctx.fillRect(x0 - 1, y0 + 2, 34, 31);
  const done = look.progress >= 1 && !look.ruin;
  // Only the built part: five stages from the ground up (a ruin keeps what it had)
  const stage = done ? 1 : Math.max(0.2, Math.ceil(look.progress * 5) / 5);
  const tall = TALL[kind];
  ctx.save();
  if (!done) {
    ctx.beginPath();
    ctx.rect(x0 - 4, base - tall * stage, 40, tall * stage + 2);
    ctx.clip();
  }
  ART[kind](r, look);
  ctx.restore();
  if (look.ruin) rubble(r);
  else if (!done) scaffold(r, Math.round(tall * stage), look.t);
}

/** How tall each one gets (pixels above the ground line). */
const TALL: Record<WonderKind, number> = { gardens: 26, library: 26, colosseum: 22, lighthouse: 44, cathedral: 42, wall: 26, observatory: 30, colossus: 38 };

function scaffold(r: Rect, h: number, t: number) {
  // Poles and planks around what stands, a crane swinging a stone
  for (const x of [-1, 10, 21, 32]) r(x, 0, 1, h + 3, WOOD);
  for (let y = 6; y < h + 3; y += 7) r(-1, y, 34, 1, '#a8743f');
  const top = h + 8;
  r(31, 0, 1, top, '#5a3a1e');
  r(18, top - 1, 15, 1, '#5a3a1e');
  const swing = Math.round(Math.sin(t * 0.8) * 3);
  r(21 + swing, top - 5, 1, 4, '#3a2a20');
  r(20 + swing, top - 7, 3, 2, STONE_DARK);
}

function rubble(r: Rect) {
  for (const [x, w] of [
    [2, 4],
    [9, 3],
    [17, 5],
    [26, 3],
  ])
    r(x, 0, w, 2, STONE_DARK);
}

const ART: Record<WonderKind, (r: Rect, l: WonderLook) => void> = {
  /** Three terraces full of plants, a waterfall down the middle. */
  gardens: (r, l) => {
    const levels = [
      [1, 0, 30],
      [5, 9, 22],
      [9, 18, 14],
    ];
    for (const [x, y, w] of levels) {
      r(x, y, w, 7, STONE);
      r(x, y, w, 1, STONE_DARK);
      for (let k = 0; k < w; k += 2) r(x + k, y + 7, 2, 2, k % 4 ? LEAF : LEAF_DARK);
      for (let k = 1; k < w; k += 5) r(x + k, y + 9, 1, 1, k % 2 ? '#ff8fc0' : '#ffe066');
      for (let k = 3; k < w - 2; k += 6) r(x + k, y + 3, 2, 2, '#4e2d14');
    }
    // Trees on top
    r(13, 27, 6, 4, LEAF_DARK);
    r(14, 31, 4, 2, LEAF);
    // Water, sparkling
    for (let y = 0; y < 26; y++) r(15, y, 2, 1, (Math.floor(l.t * 6) + y) % 4 ? '#66afef' : '#d5ecff');
    r(12, 0, 8, 2, '#4c9ae6');
  },
  /** A temple of books: steps, eight columns, a roof in the people's colour. */
  library: (r, l) => {
    r(0, 0, 32, 2, STONE_DARK);
    r(1, 2, 30, 2, STONE);
    r(3, 4, 26, 14, '#f4f1e8');
    for (let k = 0; k < 8; k++) r(4 + k * 3, 4, 2, 13, STONE);
    r(13, 4, 6, 8, '#5a3a1e');
    r(2, 18, 28, 2, STONE_DARK);
    for (let k = 0; k < 7; k++) r(3 + k * 2, 20 + k, 26 - k * 4, 1, k % 2 ? l.dark : l.cloth);
    r(15, 18 + 7, 2, 2, '#ffd23f');
  },
  /** A round arena with three rows of arches and flags on top. */
  colosseum: (r, l) => {
    r(0, 0, 32, 20, SAND);
    r(0, 0, 32, 1, SAND_DARK);
    for (let row = 0; row < 3; row++) {
      const y = 2 + row * 6;
      r(0, y + 5, 32, 1, SAND_DARK);
      for (let k = 1; k < 31; k += 4) r(k, y, 2, 4, '#7a5532');
    }
    // The broken edge every arena has, on the right
    r(28, 18, 4, 2, SAND_DARK);
    for (const x of [3, 15, 27]) {
      r(x, 20, 1, 6, '#5a3a1e');
      r(x + 1, 23 + (Math.floor(l.t * 3 + x) % 2), 3, 2, l.cloth);
    }
  },
  /** A tall white tower with stripes in the people's colour, a fire on top. */
  lighthouse: (r, l) => {
    r(4, 0, 24, 4, STONE_DARK);
    r(6, 4, 20, 2, STONE);
    for (let y = 6; y < 36; y++) {
      const w = Math.round(12 - (y - 6) * 0.15);
      const x = 16 - Math.floor(w / 2);
      r(x, y, w, 1, Math.floor((y - 6) / 6) % 2 ? l.cloth : '#f4f1e8');
    }
    r(12, 36, 8, 2, l.dark);
    r(13, 38, 6, 4, '#3a2a20');
    const flick = Math.floor(l.t * 8) % 3;
    r(14, 38, 4, 3, flick ? '#ffd23f' : '#ff8a1e');
    r(15, 41, 2, 2 + (flick ? 1 : 0), '#fff3a0');
    r(15, 43, 2, 1, l.dark);
    if (l.night > 0.2) {
      // A beam over the water at night
      for (let k = 0; k < 12; k++) r(19 + k * 2, 39 - (k >> 2), 2, 1, `rgba(255, 236, 140, ${(0.6 - k * 0.045).toFixed(2)})`);
    }
  },
  /** Two spires, a long nave and a round window of coloured glass. */
  cathedral: (r, l) => {
    r(0, 0, 32, 2, STONE_DARK);
    r(6, 2, 20, 18, '#b4b9c2');
    for (let k = 0; k < 8; k++) r(8 + k * 2, 20 + k, 16 - k * 4, 1, '#5f6573');
    for (const x of [1, 25]) {
      r(x, 2, 6, 30, '#9aa0aa');
      r(x + 2, 8, 2, 5, '#3a4a6a');
      r(x + 2, 18, 2, 5, '#3a4a6a');
      for (let k = 0; k < 6; k++) r(x + Math.floor(k / 2), 32 + k, 6 - k, 1, '#5f6573');
      r(x + 2, 38, 2, 2, '#ffd23f');
    }
    // Rose window
    const glass = [l.cloth, '#ffd23f', '#e8344a', '#4d8dff', '#3ddc84'];
    for (let k = 0; k < 9; k++) r(14 + (k % 3) * 1, 12 + Math.floor(k / 3), 1, 1, glass[k % glass.length]);
    r(13, 11, 5, 1, '#5f6573');
    r(14, 2, 4, 7, '#5a3a1e');
  },
  /** A stretch of mighty wall with battlements and a gate tower. */
  wall: (r, l) => {
    r(0, 0, 32, 12, '#9aa0aa');
    for (let k = 0; k < 32; k += 4) r(k, 12, 2, 2, '#9aa0aa');
    for (let y = 2; y < 12; y += 3) r((y * 3) % 5, y, 32, 1, '#8d929c');
    r(10, 0, 12, 22, '#b4b9c2');
    for (let k = 0; k < 12; k += 3) r(10 + k, 22, 2, 2, '#b4b9c2');
    r(14, 0, 4, 7, '#3a2a20');
    r(15, 13, 2, 3, '#3a4a6a');
    r(15, 24, 1, 8, '#5a3a1e');
    r(16, 28 + (Math.floor(l.t * 3) % 2), 5, 3, l.cloth);
  },
  /** A white house with a big dome, a slit and a brass telescope. */
  observatory: (r, l) => {
    r(2, 0, 28, 2, STONE_DARK);
    r(4, 2, 24, 12, '#f4f1e8');
    for (const x of [7, 13, 19, 24]) r(x, 5, 2, 4, '#3a4a6a');
    for (let k = 0; k < 10; k++) {
      const w = Math.round(22 * Math.sqrt(1 - (k / 10) ** 2));
      r(16 - Math.floor(w / 2), 14 + k, w, 1, k % 3 ? '#9fd3ff' : '#8cbde6');
    }
    r(15, 14, 2, 10, '#3a4a6a');
    for (let k = 0; k < 6; k++) r(17 + k, 22 + k, 2, 1, '#d08a3a');
    r(14, 24, 4, 1, l.cloth);
  },
  /** The greatest hero in bronze on a stone pedestal, a torch held high. */
  colossus: (r, l) => {
    r(6, 0, 20, 3, STONE_DARK);
    r(8, 3, 16, 5, STONE);
    const bronze = '#c0843c';
    const shade = '#8a5a2b';
    // Legs, body, head, arm with a torch (three pixels for every pixel of a person)
    r(11, 8, 3, 9, shade);
    r(18, 8, 3, 9, shade);
    r(10, 17, 12, 10, bronze);
    if (l.hero?.female) r(9, 17, 14, 4, bronze);
    r(13, 27, 6, 6, bronze);
    r(13, 31, 6, 2, shade);
    r(22, 22, 3, 3, bronze);
    r(24, 25, 3, 9, bronze);
    r(23, 34, 5, 2, '#5a3a1e');
    const flick = Math.floor(l.t * 8) % 2;
    r(24, 36, 3, 2, flick ? '#ffd23f' : '#ff8a1e');
    r(25, 38, 1, 1 + flick, '#fff3a0');
    r(8, 22, 3, 3, bronze);
    r(15, 29, 2, 1, '#3a2a20');
  },
};
