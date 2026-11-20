/**
 * A* path finding on the tile grid, 8 directions, no cutting corners past
 * blocked tiles. Humans may wade through shallow water (slowly), animals stay
 * on land. Paths are cached per world version, so a painted tile makes old
 * paths invalid automatically.
 */
import { T, type World } from './world';

export type Mover = 'human' | 'animal' | 'ship';

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

// Reused between searches; `stamp` avoids clearing the arrays every time
let g = new Float32Array(0);
let from = new Int32Array(0);
let seen = new Uint32Array(0);
let closed = new Uint32Array(0);
let stamp = 0;

/** The search buffers match the world's size (bigger worlds in phase G). */
function buffers(n: number) {
  if (g.length === n) return;
  g = new Float32Array(n);
  from = new Int32Array(n);
  seen = new Uint32Array(n);
  closed = new Uint32Array(n);
  stamp = 0;
}

/** Small binary min-heap of tile indexes, ordered by f score. */
class Heap {
  private items: number[] = [];
  private f: number[] = [];
  get size() {
    return this.items.length;
  }
  clear() {
    this.items.length = 0;
    this.f.length = 0;
  }
  push(i: number, f: number) {
    const a = this.items;
    const fs = this.f;
    let n = a.length;
    a.push(i);
    fs.push(f);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (fs[p] <= f) break;
      a[n] = a[p];
      fs[n] = fs[p];
      n = p;
    }
    a[n] = i;
    fs[n] = f;
  }
  pop(): number {
    const a = this.items;
    const fs = this.f;
    const top = a[0];
    const lastI = a.pop()!;
    const lastF = fs.pop()!;
    if (a.length) {
      let n = 0;
      const len = a.length;
      for (;;) {
        const l = 2 * n + 1;
        if (l >= len) break;
        const r = l + 1;
        const c = r < len && fs[r] < fs[l] ? r : l;
        if (fs[c] >= lastF) break;
        a[n] = a[c];
        fs[n] = fs[c];
        n = c;
      }
      a[n] = lastI;
      fs[n] = lastF;
    }
    return top;
  }
}
const heap = new Heap();

const cache = new Map<string, number[] | null>();
const CACHE_MAX = 600;

/** Movement cost of a tile for a mover, Infinity if blocked. */
export function stepCost(world: World, x: number, y: number, mover: Mover): number {
  // Ships: open sea, a little slower in the shallows, never on land
  if (mover === 'ship') {
    if (!world.inside(x, y)) return Infinity;
    const t = world.get(x, y);
    return t === T.DEEP ? 1 : t === T.SHALLOW ? 1.4 : Infinity;
  }
  const c = world.cost(x, y);
  if (mover === 'animal' && !world.isLand(world.get(x, y))) return Infinity;
  return c;
}

/**
 * Tiles to walk through from (sx, sy) to (tx, ty), start excluded, goal
 * included; [] if already there, null if there is no way (within budget).
 */
export function findPath(world: World, sx: number, sy: number, tx: number, ty: number, mover: Mover, budget = 12000): number[] | null {
  if (sx === tx && sy === ty) return [];
  if (!world.inside(tx, ty) || stepCost(world, tx, ty, mover) === Infinity) return null;
  const W = world.w;
  buffers(W * world.h);
  const key = `${world.uid}:${world.version}:${W}:${mover}:${sy * W + sx}:${ty * W + tx}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit && hit.slice();

  stamp++;
  heap.clear();
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
  };
  g[start] = 0;
  from[start] = -1;
  seen[start] = stamp;
  heap.push(start, h(sx, sy));
  let expanded = 0;
  let found = false;

  while (heap.size && expanded < budget) {
    const cur = heap.pop();
    if (closed[cur] === stamp) continue;
    closed[cur] = stamp;
    if (cur === goal) {
      found = true;
      break;
    }
    expanded++;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!world.inside(nx, ny)) continue;
      const cost = stepCost(world, nx, ny, mover);
      if (cost === Infinity) continue;
      // Diagonals only if both straight neighbours are open
      if (dx && dy && (stepCost(world, cx + dx, cy, mover) === Infinity || stepCost(world, cx, cy + dy, mover) === Infinity)) continue;
      const ni = ny * W + nx;
      if (closed[ni] === stamp) continue;
      const ng = g[cur] + len * cost;
      if (seen[ni] === stamp && ng >= g[ni]) continue;
      seen[ni] = stamp;
      g[ni] = ng;
      from[ni] = cur;
      heap.push(ni, ng + h(nx, ny));
    }
  }

  let path: number[] | null = null;
  if (found) {
    path = [];
    for (let i = goal; i !== start; i = from[i]) path.push(i);
    path.reverse();
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, path);
  return path && path.slice();
}
