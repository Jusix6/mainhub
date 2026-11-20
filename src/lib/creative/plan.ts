/**
 * Creative mode build plan: which tile sits where on the grid. Saved in
 * localStorage (`jxsi_creative`); later also carried in share links, so every
 * plan from outside is checked strictly before use (known tiles only, allowed
 * sizes, inside the grid, no overlaps, a size limit).
 */

export const COLS = 12;
export const MAX_TILES = 120;
export const MAX_ROWS = 200;
const KEY = 'jxsi_creative';

/** The site colours a block can take (as `--c-<id>`). */
export const COLORS = ['yellow', 'pink', 'blue', 'purple', 'orange', 'green'] as const;
export type ColorId = (typeof COLORS)[number];

/** Own text and colour of a block tile (heading, text, sticker). */
export interface Extra {
  t?: string;
  c?: ColorId;
}

/** One placed tile: id, column, row (0-based), width, height (in cells), own text/colour. */
export type Placed = [id: string, x: number, y: number, w: number, h: number, extra?: Extra];

export interface Plan {
  v: 1;
  cols: number;
  tiles: Placed[];
}

/** What the plan check needs to know about a tile. */
export interface TileInfo {
  sizes: [number, number][];
  /** Blocks with own text (up to `max` characters) and/or colour. */
  edit?: { text: boolean; color: boolean; max: number };
}

/** Own text and colour, only what the tile allows, text shortened and on one line or a few. */
export function cleanExtra(raw: unknown, info: TileInfo): Extra | undefined {
  if (!info.edit || !raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: Extra = {};
  if (info.edit.text && typeof r.t === 'string') {
    // No control characters except line breaks; spaces squeezed; at most one empty line in a row
    const t = r.t
      .replace(/[^\S\n]+/g, ' ')
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    out.t = [...t].slice(0, info.edit.max).join('');
  }
  if (info.edit.color && typeof r.c === 'string' && (COLORS as readonly string[]).includes(r.c)) out.c = r.c as ColorId;
  return out.t !== undefined || out.c ? out : undefined;
}

export const emptyPlan = (): Plan => ({ v: 1, cols: COLS, tiles: [] });

/** Parses "4x3 2x2" into [[4, 3], [2, 2]]. */
export function parseSizes(s: string | undefined): [number, number][] {
  const out: [number, number][] = [];
  for (const part of (s ?? '').split(/\s+/)) {
    const m = /^(\d+)x(\d+)$/.exec(part);
    if (m) out.push([Number(m[1]), Number(m[2])]);
  }
  return out.length ? out : [[2, 2]];
}

export function overlaps(a: Placed, b: Placed) {
  return a[1] < b[1] + b[3] && b[1] < a[1] + a[3] && a[2] < b[2] + b[4] && b[2] < a[2] + a[4];
}

/** Keeps only what is valid: known tiles, allowed sizes, inside the grid, first come first served on overlaps. */
export function cleanPlan(raw: unknown, catalog: Map<string, TileInfo>): Plan {
  const plan = emptyPlan();
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Plan).tiles)) return plan;
  for (const t of (raw as Plan).tiles) {
    if (plan.tiles.length >= MAX_TILES) break;
    if (!Array.isArray(t) || t.length < 5) continue;
    const [id, x, y, w, h] = t;
    const info = typeof id === 'string' ? catalog.get(id) : undefined;
    if (!info || ![x, y, w, h].every((n) => Number.isInteger(n))) continue;
    if (!info.sizes.some(([sw, sh]) => sw === w && sh === h)) continue;
    if (x < 0 || y < 0 || x + w > COLS || y + h > MAX_ROWS) continue;
    const p: Placed = [id, x, y, w, h];
    const extra = cleanExtra(t[5], info);
    if (extra) p.push(extra);
    if (plan.tiles.some((o) => overlaps(o, p))) continue;
    plan.tiles.push(p);
  }
  return plan;
}

export function loadPlan(): unknown {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

export function savePlan(plan: Plan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(plan));
  } catch {
    /* private mode or full: the build lives until the page closes */
  }
}

/** Rows in use (the lowest tile's bottom edge). */
export const usedRows = (plan: Plan) => plan.tiles.reduce((n, t) => Math.max(n, t[2] + t[4]), 0);

/* ---- hotbar ------------------------------------------------------------------------------- */

export const SLOTS = 9;
const HOTBAR_KEY = 'jxsi_creative_hotbar';

/** One hotbar slot: a tile id and which of its sizes is chosen, or empty. */
export type Slot = { id: string; size: number } | null;

export function loadHotbar(catalog: Map<string, TileInfo>): Slot[] | null {
  try {
    const raw = JSON.parse(localStorage.getItem(HOTBAR_KEY) ?? 'null');
    if (!Array.isArray(raw)) return null;
    return Array.from({ length: SLOTS }, (_, i) => {
      const s = raw[i];
      const info = s && typeof s.id === 'string' ? catalog.get(s.id) : undefined;
      if (!info) return null;
      const size = Number.isInteger(s.size) && s.size >= 0 && s.size < info.sizes.length ? s.size : 0;
      return { id: s.id, size };
    });
  } catch {
    return null;
  }
}

export function saveHotbar(slots: Slot[]) {
  try {
    localStorage.setItem(HOTBAR_KEY, JSON.stringify(slots));
  } catch {
    /* see savePlan */
  }
}
