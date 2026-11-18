/**
 * The world as a grid of tiles, each drawn as 8 × 8 pixels. Old islands are
 * 160 × 100; new random worlds (phase G) are 320 × 200: the main island in
 * the middle, the size the old island had, and 3 to 6 smaller islands around
 * it under a fog that only explorers (and settlers) lift. Some of the small
 * islands hold gold or spices.
 *
 * Knows the terrain of every tile, builds a random world from a seed, lets
 * the player paint terrain and lets nature grow back: forests spread, berry
 * bushes on grass refill, fish in the water recover. Every change marks
 * the tile (and its neighbours, whose look depends on it) as dirty, so the
 * renderer only redraws what changed.
 */
import { BALANCE } from './balance';
import { islandName } from './names';
import { createNoise2D, fbm } from './noise';
import { randFor, type Rand } from './rng';

/** The classic island (and every save from before phase G). */
export const W = 160;
export const H = 100;
/** New random worlds (phase G). */
export const BIG_W = 320;
export const BIG_H = 200;
export const TILE = 8;

export const T = {
  DEEP: 0,
  SHALLOW: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  MOUNTAIN: 5,
  /** Farmland, ploughed by farmers (Phase 7). */
  FIELD: 6,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

/** Rare goods on the small islands (phase G). */
export const DEPOSIT = { NONE: 0, GOLD: 1, SPICE: 2 } as const;

/** Tool keys of the Shape tab, in toolbar order. */
export const TERRAIN_KEYS = ['deep', 'shallow', 'sand', 'grass', 'forest', 'mountain'] as const;
export type TerrainKey = (typeof TERRAIN_KEYS)[number];
export const TERRAIN_BY_KEY: Record<TerrainKey, Terrain> = {
  deep: T.DEEP,
  shallow: T.SHALLOW,
  sand: T.SAND,
  grass: T.GRASS,
  forest: T.FOREST,
  mountain: T.MOUNTAIN,
};

/** Walking cost per terrain (Infinity = blocked). Shallow water: wading. */
const COST = [Infinity, 2.6, 1, 1, 1.6, Infinity, 1.2];

export const MAX_BERRIES = 3;
export const MAX_FISH = 4;

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** An island of a generated world: its middle, size and name, and when it was found. */
export interface Island {
  x: number;
  y: number;
  rx: number;
  ry: number;
  name: string;
  main: boolean;
  /** Year it was discovered (0 = still under the fog). */
  found: number;
}

export class World {
  w = W;
  h = H;
  tiles = new Uint8Array(W * H);
  /** Indexes of tiles to redraw; `all` means redraw everything. */
  readonly dirty = new Set<number>();
  all = true;
  seed = '';
  /** Goes up with every terrain change; cached paths of older versions are stale. */
  version = 0;
  /** Berry bush per tile: -1 = none, 0…3 = berries on it. Only on grass. */
  bush = new Int8Array(W * H).fill(-1);
  /** Fish per water tile, 0…4. */
  fish = new Uint8Array(W * H);
  /** Crop on a field tile: 0 = bare, 1–3 growing, 4 = ripe. */
  crop = new Uint8Array(W * H);
  /** Year a tree falls (0 = not set yet; set on the next nature check). */
  treeEnd = new Uint16Array(W * H);
  /** Tiles where no new tree may grow (around squares, houses, sites); filled by the sim each second. */
  noTree = new Uint8Array(W * H);
  /** Phase G: 1 = still under the fog; `fogVersion` goes up when some of it lifts. */
  fog = new Uint8Array(W * H);
  fogVersion = 0;
  /** Gold and spices (DEPOSIT). */
  deposit = new Uint8Array(W * H);
  /** The islands of a generated world (old islands: none). */
  islands: Island[] = [];
  /** Share of the land covered by forest, counted each second. */
  forestShare = 0;
  private natureClock = 0;
  /** Land masses (land and shallow water, 4 neighbours), worked out again after terrain changes. */
  private landId = new Int32Array(W * H);
  private landVersion = -1;
  /** Land tiles (no water) per land mass. */
  private landTiles = new Map<number, number>();

  /** A world of another size: every layer starts empty. */
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const n = w * h;
    this.tiles = new Uint8Array(n);
    this.bush = new Int8Array(n).fill(-1);
    this.fish = new Uint8Array(n);
    this.crop = new Uint8Array(n);
    this.treeEnd = new Uint16Array(n);
    this.noTree = new Uint8Array(n);
    this.fog = new Uint8Array(n);
    this.deposit = new Uint8Array(n);
    this.landId = new Int32Array(n);
    this.landVersion = -1;
    this.dirty.clear();
    this.all = true;
  }

  get big() {
    return this.w > W;
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): Terrain {
    return (this.inside(x, y) ? this.tiles[y * this.w + x] : T.DEEP) as Terrain;
  }

  set(x: number, y: number, t: Terrain) {
    if (!this.inside(x, y)) return;
    const w = this.w;
    const i = y * w + x;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    this.version++;
    if (t !== T.GRASS) this.bush[i] = -1;
    this.crop[i] = 0;
    this.treeEnd[i] = 0;
    this.fish[i] = this.isLand(t) ? 0 : 2;
    if (!this.isLand(t)) this.deposit[i] = 0;
    // Neighbours too: shore foam, snow caps and forest edges depend on them
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (this.inside(x + dx, y + dy)) this.dirty.add((y + dy) * w + x + dx);
  }

  isLand(t: Terrain) {
    return t !== T.DEEP && t !== T.SHALLOW;
  }

  /** Walking cost of a tile, Infinity where nobody can walk. */
  cost(x: number, y: number) {
    return this.inside(x, y) ? COST[this.tiles[y * this.w + x]] : Infinity;
  }

  /** Only this tile needs a redraw (berries changed). */
  touch(i: number) {
    this.dirty.add(i);
  }

  /* ---- fog (phase G) ----------------------------------------------------------- */

  /** Is this tile seen (no fog)? Outside the map counts as seen. */
  seen(x: number, y: number) {
    return !this.inside(x, y) || this.fog[y * this.w + x] === 0;
  }

  /** Lifts the fog in a circle; returns how many tiles became visible. */
  reveal(cx: number, cy: number, r: number): number {
    let n = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r));
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.w + x;
        if (!this.fog[i]) continue;
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        this.fog[i] = 0;
        n++;
      }
    }
    if (n) this.fogVersion++;
    return n;
  }

  /* ---- land masses ---------------------------------------------------------------- */

  /** Id of the land mass a tile belongs to (0 = open water). Two tiles with the same id can be walked between, mountains aside. */
  landAt(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    if (this.landVersion !== this.version) this.findLand();
    return this.landId[y * this.w + x];
  }

  /** Can someone walk (or wade) from one tile to the other? */
  sameLand(ax: number, ay: number, bx: number, by: number) {
    const a = this.landAt(Math.floor(ax), Math.floor(ay));
    return a !== 0 && a === this.landAt(Math.floor(bx), Math.floor(by));
  }

  private findLand() {
    const { w, h } = this;
    const id = this.landId;
    id.fill(0);
    this.landTiles.clear();
    const stack: number[] = [];
    let next = 0;
    for (let i = 0; i < w * h; i++) {
      if (id[i] || this.tiles[i] === T.DEEP) continue;
      next++;
      id[i] = next;
      stack.push(i);
      let size = 0;
      while (stack.length) {
        const c = stack.pop()!;
        if (this.tiles[c] !== T.SHALLOW) size++;
        const cx = c % w;
        const cy = (c / w) | 0;
        for (const [dx, dy] of N4) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (id[ni] || this.tiles[ni] === T.DEEP) continue;
          id[ni] = next;
          stack.push(ni);
        }
      }
      this.landTiles.set(next, size);
    }
    this.landVersion = this.version;
  }

  /** How many land tiles a land mass has (for how many people it can feed). */
  landSize(id: number) {
    if (this.landVersion !== this.version) this.findLand();
    return this.landTiles.get(id) ?? 0;
  }

  /** The named island under a tile (generated worlds only). */
  islandAt(x: number, y: number): Island | undefined {
    const id = this.landAt(Math.floor(x), Math.floor(y));
    if (!id) return undefined;
    return this.islands.find((is) => this.landAt(Math.round(is.x), Math.round(is.y)) === id) ?? this.islands.find((is) => Math.hypot((is.x - x) / is.rx, (is.y - y) / is.ry) < 1.3);
  }

  /* ---- making worlds ------------------------------------------------------------------ */

  /**
   * A new random world for a seed (phase G): 320 × 200 with the main island
   * in the middle and 3–6 small ones around it, all but the main one under
   * fog. Simplex noise, falling off towards the edge of each island.
   */
  generate(seed: string) {
    this.resize(BIG_W, BIG_H);
    this.seed = seed;
    const { w, h } = this;
    const rand = randFor(seed, 'island');
    const elev = createNoise2D(rand);
    const moist = createNoise2D(rand);
    // Shapes: land reaches to about 0.72 of the shape radius (more where the noise is high).
    // The main island has the shape of the old one, a little moved and stretched per seed.
    const mrx = 80 / (1.05 + rand() * 0.2);
    const mry = 50 / (1.05 + rand() * 0.2);
    const main = { x: w / 2 + (rand() - 0.5) * 12, y: h / 2 + (rand() - 0.5) * 8, rx: mrx * 0.72, ry: mry * 0.72 };
    // The small islands around it, spread over the compass, with deep water between
    const small: { x: number; y: number; rx: number; ry: number }[] = [];
    const count = 3 + Math.floor(rand() * 4);
    const turn = rand() * Math.PI * 2;
    for (let k = 0; k < count * 8 && small.length < count; k++) {
      const ang = turn + (small.length / count) * Math.PI * 2 + (rand() - 0.5) * 0.7;
      const rx = 11 + rand() * 12;
      const ry = rx * (0.6 + rand() * 0.25);
      const x = main.x + Math.cos(ang) * (main.rx + rx + 18 + rand() * 10);
      const y = main.y + Math.sin(ang) * (main.ry + ry + 14 + rand() * 8);
      if (x - rx * 1.2 < 4 || y - ry * 1.2 < 4 || x + rx * 1.2 > w - 4 || y + ry * 1.2 > h - 4) continue;
      if (small.some((o) => Math.hypot((o.x - x) / (o.rx + rx + 14), (o.y - y) / (o.ry + ry + 10)) < 1)) continue;
      small.push({ x, y, rx, ry });
    }
    const all = [main, ...small];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // The island whose shape counts most here
        let best = -Infinity;
        for (const is of all) {
          const nx = ((x - is.x) / is.rx) * 0.72;
          const ny = ((y - is.y) / is.ry) * 0.72;
          const d = Math.sqrt(nx * nx + ny * ny);
          best = Math.max(best, 0.38 - d * d * 0.95);
        }
        const e = (fbm(elev, x / 34, y / 34, 5) + 1) / 2 + best;
        const m = (fbm(moist, x / 16 + 100, y / 16, 3) + 1) / 2;
        let t: Terrain;
        if (e < 0.3) t = T.DEEP;
        else if (e < 0.4) t = T.SHALLOW;
        else if (e < 0.45) t = T.SAND;
        else if (e > 0.83) t = T.MOUNTAIN;
        else if (m > 0.55 && e > 0.5) t = T.FOREST;
        else t = T.GRASS;
        // Always open sea at the border
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) t = T.DEEP;
        const i = y * w + x;
        this.tiles[i] = t;
        this.bush[i] = t === T.GRASS && rand() < 0.08 ? MAX_BERRIES : -1;
        this.fish[i] = this.isLand(t) ? 0 : MAX_FISH;
        this.crop[i] = 0;
        this.deposit[i] = 0;
        // The first forests are of every age: they fall over the first 120 years
        this.treeEnd[i] = t === T.FOREST ? 1 + Math.floor(rand() * BALANCE.trees.lifeMax) : 0;
      }
    }
    // Names, and the fog over everything but the main island and its shore
    const taken: string[] = [];
    this.islands = all.map((is, k) => {
      const name = islandName(rand, taken);
      taken.push(name);
      return { x: is.x, y: is.y, rx: is.rx, ry: is.ry, name, main: k === 0, found: k === 0 ? 1 : 0 };
    });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x - main.x) / (main.rx * 1.18), (y - main.y) / (main.ry * 1.22));
        this.fog[y * w + x] = d < 1 ? 0 : 1;
      }
    }
    // Gold on some small islands, spices on others: a few tiles each
    for (const is of this.islands) {
      if (is.main) continue;
      const kind = rand() < 0.5 ? DEPOSIT.GOLD : rand() < 0.75 ? DEPOSIT.SPICE : DEPOSIT.NONE;
      if (kind === DEPOSIT.NONE) continue;
      let placed = 0;
      for (let k = 0; k < 400 && placed < 3 + Math.floor(rand() * 3); k++) {
        const x = Math.round(is.x + (rand() - 0.5) * is.rx * 1.4);
        const y = Math.round(is.y + (rand() - 0.5) * is.ry * 1.4);
        const t = this.get(x, y);
        const fits = kind === DEPOSIT.GOLD ? t === T.MOUNTAIN || t === T.GRASS || t === T.SAND : t === T.GRASS || t === T.FOREST;
        if (!fits || this.deposit[y * w + x]) continue;
        this.deposit[y * w + x] = kind;
        placed++;
      }
    }
    this.version++;
    this.fogVersion++;
    this.all = true;
    this.dirty.clear();
  }

  /** A bare little beach in the open sea, for building your own island (the old size, no fog). */
  generateEmpty() {
    this.resize(W, H);
    this.seed = 'empty';
    this.islands = [];
    const { w, h } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x - w / 2) / 1.3, y - h / 2);
        const i = y * w + x;
        const t = d < 6 ? T.GRASS : d < 9 ? T.SAND : d < 13 ? T.SHALLOW : T.DEEP;
        this.tiles[i] = t;
        this.bush[i] = t === T.GRASS && (x + y) % 5 === 0 ? MAX_BERRIES : -1;
        this.fish[i] = this.isLand(t) ? 0 : MAX_FISH;
        this.crop[i] = 0;
        this.treeEnd[i] = 0;
        this.deposit[i] = 0;
      }
    }
    this.fog.fill(0);
    this.version++;
    this.fogVersion++;
    this.all = true;
    this.dirty.clear();
  }

  /** Paints a round brush of `radius` tiles (0 = a single tile). */
  paint(cx: number, cy: number, radius: number, t: Terrain) {
    const r2 = radius * radius + radius;
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) if (dx * dx + dy * dy <= r2) this.set(cx + dx, cy + dy, t);
  }

  /** How many of the 8 neighbours are forest. */
  forestAround(x: number, y: number) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && this.get(x + dx, y + dy) === T.FOREST) n++;
    return n;
  }

  /** True if any of the 4 direct neighbours has the terrain. */
  touches(x: number, y: number, t: Terrain) {
    return N4.some(([dx, dy]) => this.get(x + dx, y + dy) === t);
  }

  /**
   * Once per game second: berries grow back on bushes, fish recover, now and
   * then a new bush sprouts on open grass, and old trees fall (each lives
   * 60–120 years). Also counts how much of the land is forest.
   */
  growNature(rand: Rand, dt: number, food = 1, year = 1) {
    this.natureClock += dt;
    if (this.natureClock < 1) return;
    this.natureClock -= 1;
    const w = this.w;
    const n = w * this.h;
    const life = BALANCE.trees;
    let land = 0;
    let forest = 0;
    for (let i = 0; i < n; i++) {
      const t = this.tiles[i];
      if (t !== T.DEEP && t !== T.SHALLOW) land++;
      if (t === T.FOREST) {
        forest++;
        if (!this.treeEnd[i]) this.treeEnd[i] = year + life.lifeMin + Math.floor(rand() * (life.lifeMax - life.lifeMin));
        else if (year >= this.treeEnd[i]) this.set(i % w, (i / w) | 0, T.GRASS);
        continue;
      }
      const b = this.bush[i];
      if (b >= 0) {
        if (b < MAX_BERRIES && rand() < 0.12 * food) {
          this.bush[i] = b + 1;
          this.touch(i);
        }
      } else if (t === T.FIELD) {
        const c = this.crop[i];
        if (c >= 1 && c < 4 && rand() < 0.14 * food) {
          this.crop[i] = c + 1;
          this.touch(i);
        }
      } else if (t === T.GRASS) {
        if (rand() < 0.00008 * food) {
          this.bush[i] = 0;
          this.touch(i);
        }
      } else if (this.fish[i] < MAX_FISH && t === T.SHALLOW && rand() < 0.03 * food) {
        this.fish[i]++;
      } else if (this.fish[i] < MAX_FISH && t === T.DEEP && rand() < 0.03 * food) {
        this.fish[i]++;
      }
    }
    this.forestShare = land ? forest / land : 0;
  }

  /**
   * Forests spread slowly onto grass: a few random tiles per tick (more on a
   * bigger world, so the pace per island stays the same), and only grass
   * with at least two forest neighbours can turn into forest. They stop at
   * 30 % of the land and never grow close to squares, houses or sites.
   */
  growTrees(rand: Rand, samples: number = BALANCE.trees.spreadSamples, chance: number = BALANCE.trees.spreadChance) {
    if (this.forestShare >= BALANCE.trees.maxForestShare) return;
    const w = this.w;
    const n = w * this.h;
    const count = Math.round((samples * n) / (W * H));
    for (let s = 0; s < count; s++) {
      const i = Math.floor(rand() * n);
      if (this.tiles[i] !== T.GRASS || this.noTree[i]) continue;
      const x = i % w;
      const y = (i / w) | 0;
      if (this.forestAround(x, y) >= 2 && rand() < chance) this.set(x, y, T.FOREST);
    }
  }
}
