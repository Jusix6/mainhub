/**
 * The island as a grid of tiles (160 × 100, each drawn as 8 × 8 pixels).
 * Knows the terrain of every tile, builds a random island from a seed, lets
 * the player paint terrain and lets nature grow back: forests spread, berry
 * bushes on grass refill, fish in the water recover. Every change marks
 * the tile (and its neighbours, whose look depends on it) as dirty, so the
 * renderer only redraws what changed.
 */
import { createNoise2D, fbm } from './noise';
import { randFor, type Rand } from './rng';

export const W = 160;
export const H = 100;
export const TILE = 8;

export const T = {
  DEEP: 0,
  SHALLOW: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  MOUNTAIN: 5,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

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
const COST = [Infinity, 2.6, 1, 1, 1.6, Infinity];

export const MAX_BERRIES = 3;
export const MAX_FISH = 4;

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export class World {
  readonly w = W;
  readonly h = H;
  readonly tiles = new Uint8Array(W * H);
  /** Indexes of tiles to redraw; `all` means redraw everything. */
  readonly dirty = new Set<number>();
  all = true;
  seed = '';
  /** Goes up with every terrain change; cached paths of older versions are stale. */
  version = 0;
  /** Berry bush per tile: -1 = none, 0…3 = berries on it. Only on grass. */
  readonly bush = new Int8Array(W * H).fill(-1);
  /** Fish per water tile, 0…4. */
  readonly fish = new Uint8Array(W * H);
  private natureClock = 0;

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  get(x: number, y: number): Terrain {
    return (this.inside(x, y) ? this.tiles[y * W + x] : T.DEEP) as Terrain;
  }

  set(x: number, y: number, t: Terrain) {
    if (!this.inside(x, y)) return;
    const i = y * W + x;
    if (this.tiles[i] === t) return;
    this.tiles[i] = t;
    this.version++;
    if (t !== T.GRASS) this.bush[i] = -1;
    this.fish[i] = this.isLand(t) ? 0 : 2;
    // Neighbours too: shore foam, snow caps and forest edges depend on them
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (this.inside(x + dx, y + dy)) this.dirty.add((y + dy) * W + x + dx);
  }

  isLand(t: Terrain) {
    return t !== T.DEEP && t !== T.SHALLOW;
  }

  /** Walking cost of a tile, Infinity where nobody can walk. */
  cost(x: number, y: number) {
    return this.inside(x, y) ? COST[this.tiles[y * W + x]] : Infinity;
  }

  /** Only this tile needs a redraw (berries changed). */
  touch(i: number) {
    this.dirty.add(i);
  }

  /** Builds the island for a seed: simplex noise, falling off towards the edge. */
  generate(seed: string) {
    this.seed = seed;
    const rand = randFor(seed, 'island');
    const elev = createNoise2D(rand);
    const moist = createNoise2D(rand);
    // Each seed moves the island a little and stretches it differently
    const cx = 0.5 + (rand() - 0.5) * 0.08;
    const cy = 0.5 + (rand() - 0.5) * 0.08;
    const sx = 1.05 + rand() * 0.2;
    const sy = 1.05 + rand() * 0.2;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x / W - cx) * 2 * sx;
        const ny = (y / H - cy) * 2 * sy;
        const d = Math.sqrt(nx * nx + ny * ny);
        let e = (fbm(elev, x / 34, y / 34, 5) + 1) / 2;
        e = e + 0.38 - d * d * 0.95;
        const m = (fbm(moist, x / 16 + 100, y / 16, 3) + 1) / 2;
        let t: Terrain;
        if (e < 0.3) t = T.DEEP;
        else if (e < 0.4) t = T.SHALLOW;
        else if (e < 0.45) t = T.SAND;
        else if (e > 0.83) t = T.MOUNTAIN;
        else if (m > 0.55 && e > 0.5) t = T.FOREST;
        else t = T.GRASS;
        // Always open sea at the border
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) t = T.DEEP;
        const i = y * W + x;
        this.tiles[i] = t;
        this.bush[i] = t === T.GRASS && rand() < 0.08 ? MAX_BERRIES : -1;
        this.fish[i] = this.isLand(t) ? 0 : MAX_FISH;
      }
    }
    this.version++;
    this.all = true;
    this.dirty.clear();
  }

  /** A bare little beach in the open sea, for building your own island. */
  generateEmpty() {
    this.seed = 'empty';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot((x - W / 2) / 1.3, y - H / 2);
        const i = y * W + x;
        const t = d < 6 ? T.GRASS : d < 9 ? T.SAND : d < 13 ? T.SHALLOW : T.DEEP;
        this.tiles[i] = t;
        this.bush[i] = t === T.GRASS && (x + y) % 5 === 0 ? MAX_BERRIES : -1;
        this.fish[i] = this.isLand(t) ? 0 : MAX_FISH;
      }
    }
    this.version++;
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
   * Once per game second: berries grow back on bushes, fish recover, and now
   * and then a new bush sprouts on open grass.
   */
  growNature(rand: Rand, dt: number, food = 1) {
    this.natureClock += dt;
    if (this.natureClock < 1) return;
    this.natureClock -= 1;
    const n = W * H;
    for (let i = 0; i < n; i++) {
      const b = this.bush[i];
      if (b >= 0) {
        if (b < MAX_BERRIES && rand() < 0.12 * food) {
          this.bush[i] = b + 1;
          this.touch(i);
        }
      } else if (this.tiles[i] === T.GRASS) {
        if (rand() < 0.00008 * food) {
          this.bush[i] = 0;
          this.touch(i);
        }
      } else if (this.fish[i] < MAX_FISH && !this.isLand(this.tiles[i] as Terrain) && rand() < 0.03 * food) {
        this.fish[i]++;
      }
    }
  }

  /**
   * Forests spread slowly onto grass: a few random tiles per tick, and only
   * grass with at least two forest neighbours can turn into forest.
   */
  growTrees(rand: Rand, samples = 10, chance = 0.12) {
    for (let s = 0; s < samples; s++) {
      const i = Math.floor(rand() * W * H);
      if (this.tiles[i] !== T.GRASS) continue;
      const x = i % W;
      const y = (i / W) | 0;
      if (this.forestAround(x, y) >= 2 && rand() < chance) this.set(x, y, T.FOREST);
    }
  }
}
