/**
 * Flags for "Paint the Flag" (fun.jxsi.ch/flag).
 *
 * Levels 1–3 (Easy, Medium, Hard) are hand-built from simple shapes. Every
 * colour is one of the palette colours the player can pick, so a perfect
 * painting reaches 100 %. Shapes use the flag's own unit grid (`w` × `h`, e.g.
 * 3 × 2), drawFlag() scales them to the canvas. Adding a flag = one entry.
 *
 *  - Easy: two colours, simple layout (Poland, Japan, Switzerland, Denmark …)
 *  - Medium: three or more stripes, simple emblems (France, Chile, Kuwait …)
 *  - Hard: many parts, stars, diagonals (UK, USA, Seychelles, Guyana …)
 *
 * Level 4 (Impossible) is every country of the world, drawn from the public
 * domain SVGs in src/assets/flags (see scripts/import-world-flags.mjs). Coats
 * of arms included, which is the point.
 */
import WORLD_META from './world-flags.json';

export type ColorKey = 'white' | 'black' | 'red' | 'maroon' | 'orange' | 'yellow' | 'green' | 'sky' | 'blue' | 'navy';

export interface PaletteColor {
  key: ColorKey;
  name: string;
  hex: string;
}

export const PALETTE: readonly PaletteColor[] = [
  { key: 'red', name: 'Red', hex: '#d52b1e' },
  { key: 'maroon', name: 'Maroon', hex: '#8a1538' },
  { key: 'orange', name: 'Orange', hex: '#ff8200' },
  { key: 'yellow', name: 'Yellow', hex: '#fcd116' },
  { key: 'green', name: 'Green', hex: '#009a44' },
  { key: 'sky', name: 'Sky blue', hex: '#6cace4' },
  { key: 'blue', name: 'Blue', hex: '#0055a4' },
  { key: 'navy', name: 'Navy', hex: '#0b2265' },
  { key: 'white', name: 'White', hex: '#ffffff' },
  { key: 'black', name: 'Black', hex: '#111111' },
];

const HEX = Object.fromEntries(PALETTE.map((c) => [c.key, c.hex])) as Record<ColorKey, string>;

export type Shape =
  | { t: 'rect'; x: number; y: number; w: number; h: number; c: ColorKey }
  | { t: 'poly'; p: number[]; c: ColorKey }
  | { t: 'circle'; x: number; y: number; r: number; c: ColorKey }
  /** Five-pointed star; `rot` in radians, 0 = one point straight up. */
  | { t: 'star'; x: number; y: number; r: number; rot?: number; c: ColorKey }
  /** Thick straight band, e.g. the diagonals of the Union Jack. */
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; w: number; c: ColorKey }
  /** Closed outline drawn as a stroke, e.g. the triangles of the Star of David. */
  | { t: 'outline'; p: number[]; w: number; c: ColorKey };

export type Level = 1 | 2 | 3 | 4;
export const LEVELS: readonly Level[] = [1, 2, 3, 4];

export interface Flag {
  /** ISO 3166-1 alpha-2, lower case (xk for Kosovo). Also the ?f= value. */
  code: string;
  name: string;
  level: Level;
  w: number;
  h: number;
  bg: ColorKey;
  shapes: Shape[];
  /** Impossible level: URL of the real flag's SVG instead of shapes. */
  src?: string;
}

type Body = Pick<Flag, 'w' | 'h' | 'bg' | 'shapes'>;

/** Equal (or weighted) stripes, horizontal or vertical. */
function bands(dir: 'h' | 'v', cols: ColorKey[], w: number, h: number, weights: number[] = cols.map(() => 1)): Body {
  const total = weights.reduce((a, b) => a + b, 0);
  const shapes: Shape[] = [];
  let pos = 0;
  cols.forEach((c, i) => {
    const size = ((dir === 'h' ? h : w) * weights[i]) / total;
    shapes.push(dir === 'h' ? { t: 'rect', x: 0, y: pos, w, h: size, c } : { t: 'rect', x: pos, y: 0, w: size, h, c });
    pos += size;
  });
  return { w, h, bg: cols[0], shapes };
}

/** A body plus extra shapes on top. */
const plus = (body: Body, ...shapes: Shape[]): Body => ({ ...body, shapes: [...body.shapes, ...shapes] });

const f = (code: string, name: string, level: Level, body: Body): Flag => ({ code, name, level, ...body });

/** Nordic cross: vertical bar at x..x+t, horizontal bar at y..y+t. */
const cross = (w: number, h: number, x: number, y: number, t: number, c: ColorKey): Shape[] => [
  { t: 'rect', x, y: 0, w: t, h, c },
  { t: 'rect', x: 0, y, w, h: t, c },
];

/** Serrated hoist (Bahrain, Qatar): white from 0 to `a`, `teeth` points reaching `b`. */
function serrated(w: number, h: number, a: number, b: number, teeth: number, bg: ColorKey): Body {
  const step = h / (teeth * 2);
  const p = [0, 0, a, 0];
  for (let i = 0; i < teeth; i++) p.push(b, step * (2 * i + 1), a, step * (2 * i + 2));
  p.push(0, h);
  return { w, h, bg, shapes: [{ t: 'poly', p, c: 'white' }] };
}

function usa(): Body {
  const w = 190;
  const h = 100;
  const stripe = h / 13;
  const shapes: Shape[] = [];
  for (let i = 1; i < 13; i += 2) shapes.push({ t: 'rect', x: 0, y: i * stripe, w, h: stripe, c: 'white' });
  const cw = 76;
  const ch = stripe * 7;
  shapes.push({ t: 'rect', x: 0, y: 0, w: cw, h: ch, c: 'navy' });
  for (let row = 0; row < 9; row++) {
    for (let col = row % 2; col < 11; col += 2) {
      shapes.push({ t: 'star', x: ((col + 1) * cw) / 12, y: ((row + 1) * ch) / 10, r: 3.08, c: 'white' });
    }
  }
  return { w, h, bg: 'red', shapes };
}

function liberia(): Body {
  const w = 190;
  const h = 100;
  const stripe = h / 11;
  const shapes: Shape[] = [];
  for (let i = 1; i < 11; i += 2) shapes.push({ t: 'rect', x: 0, y: i * stripe, w, h: stripe, c: 'white' });
  const side = stripe * 5;
  shapes.push({ t: 'rect', x: 0, y: 0, w: side, h: side, c: 'navy' });
  shapes.push({ t: 'star', x: side / 2, y: side / 2, r: side * 0.33, c: 'white' });
  return { w, h, bg: 'red', shapes };
}

function greece(): Body {
  const shapes: Shape[] = [];
  for (let i = 1; i < 9; i += 2) shapes.push({ t: 'rect', x: 0, y: i * 2, w: 27, h: 2, c: 'white' });
  shapes.push({ t: 'rect', x: 0, y: 0, w: 10, h: 10, c: 'blue' });
  shapes.push({ t: 'rect', x: 4, y: 0, w: 2, h: 10, c: 'white' });
  shapes.push({ t: 'rect', x: 0, y: 4, w: 10, h: 2, c: 'white' });
  return { w: 27, h: 18, bg: 'blue', shapes };
}

function china(): Body {
  const small: [number, number][] = [
    [10, 2],
    [12, 4],
    [12, 7],
    [10, 9],
  ];
  return {
    w: 30,
    h: 20,
    bg: 'red',
    shapes: [
      { t: 'star', x: 5, y: 5, r: 3, c: 'yellow' },
      // Each small star points one tip at the centre of the big one
      ...small.map(([x, y]): Shape => ({ t: 'star', x, y, r: 1, rot: Math.atan2(5 - y, 5 - x) + Math.PI / 2, c: 'yellow' })),
    ],
  };
}

function hexagram(cx: number, cy: number, r: number): number[][] {
  const tri = (start: number) =>
    [0, 1, 2].flatMap((i) => {
      const a = start + (i * 2 * Math.PI) / 3;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
  return [tri(-Math.PI / 2), tri(Math.PI / 2)];
}

export const FLAGS: readonly Flag[] = [
  /* ---- Easy: two colours, simple layout -------------------------------- */
  f('pl', 'Poland', 1, bands('h', ['white', 'red'], 8, 5)),
  f('id', 'Indonesia', 1, bands('h', ['red', 'white'], 3, 2)),
  f('mc', 'Monaco', 1, bands('h', ['red', 'white'], 5, 4)),
  f('ua', 'Ukraine', 1, bands('h', ['blue', 'yellow'], 3, 2)),
  f('at', 'Austria', 1, bands('h', ['red', 'white', 'red'], 3, 2)),
  f('lv', 'Latvia', 1, bands('h', ['maroon', 'white', 'maroon'], 2, 1, [2, 1, 2])),
  f('pe', 'Peru', 1, bands('v', ['red', 'white', 'red'], 3, 2)),
  f('ng', 'Nigeria', 1, bands('v', ['green', 'white', 'green'], 2, 1)),
  f('jp', 'Japan', 1, { w: 300, h: 200, bg: 'white', shapes: [{ t: 'circle', x: 150, y: 100, r: 60, c: 'red' }] }),
  f('bd', 'Bangladesh', 1, { w: 10, h: 6, bg: 'green', shapes: [{ t: 'circle', x: 4.5, y: 3, r: 2, c: 'red' }] }),
  f('pw', 'Palau', 1, { w: 8, h: 5, bg: 'sky', shapes: [{ t: 'circle', x: 3.5, y: 2.5, r: 1.5, c: 'yellow' }] }),
  f('ch', 'Switzerland', 1, {
    w: 32,
    h: 32,
    bg: 'red',
    shapes: [
      { t: 'rect', x: 13, y: 6, w: 6, h: 20, c: 'white' },
      { t: 'rect', x: 6, y: 13, w: 20, h: 6, c: 'white' },
    ],
  }),
  f('dk', 'Denmark', 1, { w: 37, h: 28, bg: 'red', shapes: cross(37, 28, 12, 12, 4, 'white') }),
  f('se', 'Sweden', 1, { w: 16, h: 10, bg: 'blue', shapes: cross(16, 10, 5, 4, 2, 'yellow') }),
  f('fi', 'Finland', 1, { w: 18, h: 11, bg: 'white', shapes: cross(18, 11, 5, 4, 3, 'blue') }),

  /* ---- Medium: three or more colours, simple emblems -------------------- */
  f('fr', 'France', 2, bands('v', ['blue', 'white', 'red'], 3, 2)),
  f('it', 'Italy', 2, bands('v', ['green', 'white', 'red'], 3, 2)),
  f('ie', 'Ireland', 2, bands('v', ['green', 'white', 'orange'], 2, 1)),
  f('be', 'Belgium', 2, bands('v', ['black', 'yellow', 'red'], 15, 13)),
  f('ro', 'Romania', 2, bands('v', ['navy', 'yellow', 'red'], 3, 2)),
  f('ml', 'Mali', 2, bands('v', ['green', 'yellow', 'red'], 3, 2)),
  f('gn', 'Guinea', 2, bands('v', ['red', 'yellow', 'green'], 3, 2)),
  f('ci', 'Ivory Coast', 2, bands('v', ['orange', 'white', 'green'], 3, 2)),
  f('de', 'Germany', 2, bands('h', ['black', 'red', 'yellow'], 5, 3)),
  f('nl', 'Netherlands', 2, bands('h', ['red', 'white', 'blue'], 3, 2)),
  f('ru', 'Russia', 2, bands('h', ['white', 'blue', 'red'], 3, 2)),
  f('hu', 'Hungary', 2, bands('h', ['red', 'white', 'green'], 2, 1)),
  f('bg', 'Bulgaria', 2, bands('h', ['white', 'green', 'red'], 5, 3)),
  f('ee', 'Estonia', 2, bands('h', ['blue', 'black', 'white'], 11, 7)),
  f('lt', 'Lithuania', 2, bands('h', ['yellow', 'green', 'red'], 5, 3)),
  f('lu', 'Luxembourg', 2, bands('h', ['red', 'white', 'sky'], 5, 3)),
  f('ga', 'Gabon', 2, bands('h', ['green', 'yellow', 'blue'], 4, 3)),
  f('ye', 'Yemen', 2, bands('h', ['red', 'white', 'black'], 3, 2)),
  f('sl', 'Sierra Leone', 2, bands('h', ['green', 'white', 'blue'], 3, 2)),
  f('mu', 'Mauritius', 2, bands('h', ['red', 'blue', 'yellow', 'green'], 3, 2)),
  f('co', 'Colombia', 2, bands('h', ['yellow', 'blue', 'red'], 3, 2, [2, 1, 1])),
  f('bw', 'Botswana', 2, bands('h', ['sky', 'white', 'black', 'white', 'sky'], 3, 2, [9, 1, 4, 1, 9])),
  f('gm', 'Gambia', 2, bands('h', ['red', 'white', 'blue', 'white', 'green'], 3, 2, [6, 1, 4, 1, 6])),
  f('th', 'Thailand', 2, bands('h', ['red', 'white', 'navy', 'white', 'red'], 3, 2, [1, 1, 2, 1, 1])),
  f('no', 'Norway', 2, { w: 22, h: 16, bg: 'red', shapes: [...cross(22, 16, 6, 6, 4, 'white'), ...cross(22, 16, 7, 7, 2, 'navy')] }),
  f('is', 'Iceland', 2, { w: 25, h: 18, bg: 'blue', shapes: [...cross(25, 18, 7, 7, 4, 'white'), ...cross(25, 18, 8, 8, 2, 'red')] }),
  f('la', 'Laos', 2, plus(bands('h', ['red', 'navy', 'red'], 3, 2, [1, 2, 1]), { t: 'circle', x: 1.5, y: 1, r: 0.4, c: 'white' })),
  f('cz', 'Czechia', 2, plus(bands('h', ['white', 'red'], 3, 2), { t: 'poly', p: [0, 0, 1.5, 1, 0, 2], c: 'blue' })),
  f('kw', 'Kuwait', 2, plus(bands('h', ['green', 'white', 'red'], 4, 2), { t: 'poly', p: [0, 0, 1, 2 / 3, 1, 4 / 3, 0, 2], c: 'black' })),
  f('sd', 'Sudan', 2, plus(bands('h', ['red', 'white', 'black'], 6, 3), { t: 'poly', p: [0, 0, 2, 1.5, 0, 3], c: 'green' })),
  f('bs', 'Bahamas', 2, plus(bands('h', ['sky', 'yellow', 'sky'], 6, 3), { t: 'poly', p: [0, 0, 2.598, 1.5, 0, 3], c: 'black' })),
  f('bj', 'Benin', 2, plus(bands('h', ['yellow', 'red'], 3, 2), { t: 'rect', x: 0, y: 0, w: 1.2, h: 2, c: 'green' })),
  f('mg', 'Madagascar', 2, plus(bands('h', ['red', 'green'], 3, 2), { t: 'rect', x: 0, y: 0, w: 1, h: 2, c: 'white' })),
  f('cl', 'Chile', 2, plus(bands('h', ['white', 'red'], 3, 2), { t: 'rect', x: 0, y: 0, w: 1, h: 1, c: 'blue' }, { t: 'star', x: 0.5, y: 0.5, r: 0.25, c: 'white' })),
  f('bf', 'Burkina Faso', 2, plus(bands('h', ['red', 'green'], 3, 2), { t: 'star', x: 1.5, y: 1, r: 0.33, c: 'yellow' })),
  f('vn', 'Vietnam', 2, { w: 3, h: 2, bg: 'red', shapes: [{ t: 'star', x: 1.5, y: 1, r: 0.6, c: 'yellow' }] }),
  f('so', 'Somalia', 2, { w: 3, h: 2, bg: 'sky', shapes: [{ t: 'star', x: 1.5, y: 1, r: 0.6, c: 'white' }] }),
  f('mm', 'Myanmar', 2, plus(bands('h', ['yellow', 'green', 'red'], 3, 2), { t: 'star', x: 1.5, y: 1.04, r: 0.83, c: 'white' })),
  f('bh', 'Bahrain', 2, serrated(5, 3, 1.2, 1.9, 5, 'red')),
  f('qa', 'Qatar', 2, serrated(28, 11, 7, 10, 9, 'maroon')),

  /* ---- Hard: many parts, stars, diagonals -------------------------------- */
  f('gr', 'Greece', 3, greece()),
  f('gb', 'United Kingdom', 3, {
    w: 60,
    h: 30,
    bg: 'navy',
    shapes: [
      { t: 'line', x1: -6, y1: -3, x2: 66, y2: 33, w: 6, c: 'white' },
      { t: 'line', x1: -6, y1: 33, x2: 66, y2: -3, w: 6, c: 'white' },
      { t: 'line', x1: -6, y1: -3, x2: 66, y2: 33, w: 2, c: 'red' },
      { t: 'line', x1: -6, y1: 33, x2: 66, y2: -3, w: 2, c: 'red' },
      ...cross(60, 30, 25, 10, 10, 'white'),
      ...cross(60, 30, 27, 12, 6, 'red'),
    ],
  }),
  f('us', 'United States', 3, usa()),
  f('lr', 'Liberia', 3, liberia()),
  f('cn', 'China', 3, china()),
  f('tr', 'Turkey', 3, {
    w: 1200,
    h: 800,
    bg: 'red',
    shapes: [
      { t: 'circle', x: 444, y: 400, r: 200, c: 'white' },
      { t: 'circle', x: 470, y: 400, r: 160, c: 'red' },
      { t: 'star', x: 683.3, y: 400, r: 100, rot: -Math.PI / 2, c: 'white' },
    ],
  }),
  f('il', 'Israel', 3, {
    w: 220,
    h: 160,
    bg: 'white',
    shapes: [
      { t: 'rect', x: 0, y: 15, w: 220, h: 25, c: 'blue' },
      { t: 'rect', x: 0, y: 120, w: 220, h: 25, c: 'blue' },
      ...hexagram(110, 80, 30).map((p): Shape => ({ t: 'outline', p, w: 5.5, c: 'blue' })),
    ],
  }),
  f(
    'cu',
    'Cuba',
    3,
    plus(
      bands('h', ['blue', 'white', 'blue', 'white', 'blue'], 2, 1),
      { t: 'poly', p: [0, 0, 0.866, 0.5, 0, 1], c: 'red' },
      { t: 'star', x: 0.289, y: 0.5, r: 0.14, c: 'white' },
    ),
  ),
  f('pa', 'Panama', 3, {
    w: 3,
    h: 2,
    bg: 'white',
    shapes: [
      { t: 'rect', x: 1.5, y: 0, w: 1.5, h: 1, c: 'red' },
      { t: 'rect', x: 0, y: 1, w: 1.5, h: 1, c: 'blue' },
      { t: 'star', x: 0.75, y: 0.5, r: 0.3, c: 'blue' },
      { t: 'star', x: 2.25, y: 1.5, r: 0.3, c: 'red' },
    ],
  }),
  f(
    'tg',
    'Togo',
    3,
    plus(
      bands('h', ['green', 'yellow', 'green', 'yellow', 'green'], 809, 500),
      { t: 'rect', x: 0, y: 0, w: 300, h: 300, c: 'red' },
      { t: 'star', x: 150, y: 150, r: 95, c: 'white' },
    ),
  ),
  f('jm', 'Jamaica', 3, {
    w: 24,
    h: 12,
    bg: 'yellow',
    shapes: [
      { t: 'poly', p: [0, 0, 24, 0, 12, 6], c: 'green' },
      { t: 'poly', p: [0, 12, 24, 12, 12, 6], c: 'green' },
      { t: 'poly', p: [0, 0, 12, 6, 0, 12], c: 'black' },
      { t: 'poly', p: [24, 0, 12, 6, 24, 12], c: 'black' },
      { t: 'line', x1: -2, y1: -1, x2: 26, y2: 13, w: 2, c: 'yellow' },
      { t: 'line', x1: -2, y1: 13, x2: 26, y2: -1, w: 2, c: 'yellow' },
    ],
  }),
  f('tz', 'Tanzania', 3, {
    w: 3,
    h: 2,
    bg: 'green',
    shapes: [
      { t: 'poly', p: [3, 0, 3, 2, 0, 2], c: 'sky' },
      { t: 'line', x1: -0.3, y1: 2.2, x2: 3.3, y2: -0.2, w: 0.62, c: 'yellow' },
      { t: 'line', x1: -0.3, y1: 2.2, x2: 3.3, y2: -0.2, w: 0.42, c: 'black' },
    ],
  }),
  f('sc', 'Seychelles', 3, {
    w: 2,
    h: 1,
    bg: 'green',
    shapes: [
      { t: 'poly', p: [0, 1, 0, 0, 2 / 3, 0], c: 'blue' },
      { t: 'poly', p: [0, 1, 2 / 3, 0, 4 / 3, 0], c: 'yellow' },
      { t: 'poly', p: [0, 1, 4 / 3, 0, 2, 0, 2, 1 / 3], c: 'red' },
      { t: 'poly', p: [0, 1, 2, 1 / 3, 2, 2 / 3], c: 'white' },
    ],
  }),
  f('gy', 'Guyana', 3, {
    w: 5,
    h: 3,
    bg: 'green',
    shapes: [
      { t: 'poly', p: [0, 0, 5, 1.5, 0, 3], c: 'white' },
      { t: 'poly', p: [0, 0.18, 4.65, 1.5, 0, 2.82], c: 'yellow' },
      { t: 'poly', p: [0, 0, 2.6, 1.5, 0, 3], c: 'black' },
      { t: 'poly', p: [0, 0.12, 2.4, 1.5, 0, 2.88], c: 'red' },
    ],
  }),
];

/* ---- Impossible: every country, from SVG ---------------------------------- */

const SVG_URLS = import.meta.glob('../assets/flags/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export const WORLD: readonly Flag[] = (WORLD_META as { code: string; name: string; w: number; h: number }[]).map((m) => ({
  code: m.code,
  name: m.name,
  level: 4,
  w: m.w,
  h: m.h,
  bg: 'white',
  shapes: [],
  src: SVG_URLS[`../assets/flags/${m.code}.svg`],
}));

/** All flags of a level, in a stable order (the daily pick depends on it). */
export function flagsOf(level: Level): Flag[] {
  return (level === 4 ? [...WORLD] : FLAGS.filter((fl) => fl.level === level)).sort((a, b) => a.code.localeCompare(b.code));
}

/** A hand-built flag if there is one, otherwise the real one from the world set. */
export function findFlag(code: string | null | undefined, level?: Level): Flag | undefined {
  if (!code) return undefined;
  const c = code.toLowerCase();
  if (level === 4) return WORLD.find((fl) => fl.code === c);
  return FLAGS.find((fl) => fl.code === c) ?? WORLD.find((fl) => fl.code === c);
}

/** 🇨🇭 from "ch". Kosovo has no regional-indicator emoji, so it gets 🏳️. */
export function emoji(code: string): string {
  if (code === 'xk') return '🏳️';
  return [...code.toUpperCase()].map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)).join('');
}

const images = new Map<string, HTMLImageElement>();

/** Loads the SVG of an Impossible flag; drawFlag() needs it to be ready. */
export async function prepareFlag(flag: Flag): Promise<void> {
  if (!flag.src || images.has(flag.code)) return;
  const img = new Image();
  img.decoding = 'async';
  img.src = flag.src;
  await img.decode();
  images.set(flag.code, img);
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.382;
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + rad * Math.cos(a);
    const py = y + rad * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function polyPath(ctx: CanvasRenderingContext2D, p: number[]) {
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 2) {
    if (i === 0) ctx.moveTo(p[i], p[i + 1]);
    else ctx.lineTo(p[i], p[i + 1]);
  }
  ctx.closePath();
}

/** Draws the real flag, `width` pixels wide, at the canvas origin. */
export function drawFlag(ctx: CanvasRenderingContext2D, flag: Flag, width: number) {
  if (flag.src) {
    const img = images.get(flag.code);
    if (img) ctx.drawImage(img, 0, 0, width, (width * flag.h) / flag.w);
    return;
  }
  const s = width / flag.w;
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = HEX[flag.bg];
  ctx.fillRect(0, 0, flag.w, flag.h);
  for (const sh of flag.shapes) {
    ctx.fillStyle = HEX[sh.c];
    ctx.strokeStyle = HEX[sh.c];
    switch (sh.t) {
      case 'rect':
        ctx.fillRect(sh.x, sh.y, sh.w, sh.h);
        break;
      case 'poly':
        polyPath(ctx, sh.p);
        ctx.fill();
        break;
      case 'circle':
        ctx.beginPath();
        ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'star':
        starPath(ctx, sh.x, sh.y, sh.r, sh.rot);
        ctx.fill();
        break;
      case 'line':
        ctx.lineWidth = sh.w;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(sh.x1, sh.y1);
        ctx.lineTo(sh.x2, sh.y2);
        ctx.stroke();
        break;
      case 'outline':
        ctx.lineWidth = sh.w;
        ctx.lineJoin = 'miter';
        polyPath(ctx, sh.p);
        ctx.stroke();
        break;
    }
  }
  ctx.restore();
}

/* ---------------------------------------------------------------------------
 * Scoring
 * ------------------------------------------------------------------------- */

const RGB = PALETTE.map((c) => [1, 3, 5].map((i) => parseInt(c.hex.slice(i, i + 2), 16)));

function toLab([r, g, b]: number[]): number[] {
  const lin = (v: number) => {
    const c = v / 255;
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const fn = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [fn(x), fn(y), fn(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const LAB = RGB.map(toLab);

/** Partial credit for a close colour (blue for navy) instead of all or nothing. */
const SIM: number[][] = LAB.map((a) =>
  LAB.map((b) => {
    const dE = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    return Math.max(0, 1 - dE / 50);
  }),
);

/** Index of the palette colour closest to an RGB pixel, limited to `allowed` indexes. */
function nearest(r: number, g: number, b: number, allowed: number[]): [index: number, dist2: number] {
  let best = allowed[0];
  let bestD = Infinity;
  for (const i of allowed) {
    const [pr, pg, pb] = RGB[i];
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [best, bestD];
}

/** A painted pixel this far from every palette colour is an anti-aliased edge, not a choice. */
const BLEND_DIST2 = 30 ** 2;
/** Real flags from SVG: a palette colour must cover this share to count as an area of its own. */
const MIN_AREA = 0.015;

const ALL = PALETTE.map((_, i) => i);
export const SCORE_WIDTH = 180;

/**
 * 0–100. For every colour area of the real flag: how much of it the player
 * painted in that colour (close colours earn partial credit, unpainted counts
 * as wrong). The areas are averaged with equal weight, so painting Switzerland
 * all red gives 50 %, not the 80 % a plain pixel count would. Transparent
 * parts of a real flag (Nepal's shape) are not scored.
 */
export function scorePainting(flag: Flag, painting: HTMLCanvasElement): number {
  const W = SCORE_WIDTH;
  const H = Math.max(1, Math.round((W * flag.h) / flag.w));
  // The real flag is drawn at the painting's own size, then both are shrunk the
  // same way without smoothing: blending edges would invent colours (yellow
  // next to blue turning green) and cost points on a perfect painting.
  const full = document.createElement('canvas');
  full.width = painting.width;
  full.height = painting.height;
  drawFlag(full.getContext('2d')!, flag, painting.width);
  const shrink = (src: HTMLCanvasElement) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const cx = c.getContext('2d', { willReadFrequently: true })!;
    cx.imageSmoothingEnabled = false;
    cx.drawImage(src, 0, 0, W, H);
    return cx.getImageData(0, 0, W, H).data;
  };

  const rd = shrink(full);
  const ud = shrink(painting);

  // Which palette colours make up the real flag
  let own: number[];
  if (flag.src) {
    const tally = new Uint32Array(PALETTE.length);
    let total = 0;
    for (let i = 0; i < rd.length; i += 4) {
      if (rd[i + 3] < 128) continue;
      tally[nearest(rd[i], rd[i + 1], rd[i + 2], ALL)[0]]++;
      total++;
    }
    own = ALL.filter((k) => tally[k] >= total * MIN_AREA);
    if (!own.length) own = [tally.indexOf(Math.max(...tally))];
  } else {
    own = [...new Set<ColorKey>([flag.bg, ...flag.shapes.map((sh) => sh.c)])].map((k) => PALETTE.findIndex((c) => c.key === k));
  }

  const sums = new Float64Array(PALETTE.length);
  const counts = new Uint32Array(PALETTE.length);
  for (let i = 0; i < rd.length; i += 4) {
    if (rd[i + 3] < 128) continue;
    // Snap the real flag to its own colours so anti-aliased edges never form extra areas
    const [k] = nearest(rd[i], rd[i + 1], rd[i + 2], own);
    counts[k]++;
    if (ud[i + 3] < 128) continue;
    // Clean palette colours are judged as painted; edge blends go to the flag's closest colour
    const [u, d2] = nearest(ud[i], ud[i + 1], ud[i + 2], ALL);
    sums[k] += SIM[k][d2 > BLEND_DIST2 ? nearest(ud[i], ud[i + 1], ud[i + 2], own)[0] : u];
  }

  const areas = own.filter((k) => counts[k] > 0);
  if (!areas.length) return 0;
  const mean = areas.reduce((acc, k) => acc + sums[k] / counts[k], 0) / areas.length;
  return Math.round(Math.max(0, Math.min(1, mean)) * 100);
}

/* ---------------------------------------------------------------------------
 * Daily
 * ------------------------------------------------------------------------- */

/** Day 1 of the daily game. */
const LAUNCH_UTC = Date.UTC(2026, 10, 8);
const zurichDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
const zurichTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Daily puzzle number, changing at midnight Swiss time. Day 1 = 2026-11-08. */
export function dayNumber(now = new Date()): number {
  const [y, m, d] = zurichDate.format(now).split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(y, m - 1, d) - LAUNCH_UTC) / 86_400_000) + 1);
}

/** Seconds until the next daily flags (midnight in Zurich). */
export function secondsToNextDay(now = new Date()): number {
  const [h, m, s] = zurichTime.format(now).split(':').map(Number);
  return 86_400 - (h * 3600 + m * 60 + s);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Today's flag of a level, the same for everyone. Each level walks through a
 * shuffled order of its flags, so no flag repeats before all have had a turn.
 * Adding flags to a level reshuffles that level's future days.
 */
export function dailyFlag(level: Level, day = dayNumber()): Flag {
  const pool = flagsOf(level);
  const cycle = Math.floor((day - 1) / pool.length);
  const order = pool.map((_, i) => i);
  const rnd = mulberry32(level * 1_000_003 + cycle * 7919 + 20261108);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return pool[order[(day - 1) % pool.length]];
}
