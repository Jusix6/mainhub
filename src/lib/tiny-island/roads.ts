/**
 * Streets, roads, bridges and railways (Update 3, phase C).
 *
 * - Every place is laid out on a grid around its square: streets every 4
 *   tiles (`STREET`) across and down. New houses and buildings go on a free
 *   tile right next to a street (never on one), so every building has a
 *   street at its door. The places grow in rings: the core around the square
 *   (town hall, temple, market …), the living ring (houses, workshops, up to
 *   `livingRadius`) where the wall goes, and outside it the fields, farms
 *   and pens.
 * - When something is built, a street is laid from its door along the grid
 *   to the square (`layStreet`). Roads are tiles in `world.road`: 1 trodden
 *   path, 2 gravel (the wheel), 3 paving (masonry); on shallow water a road
 *   is a bridge (only with masonry). Walking on them is 10 / 25 / 40 % faster
 *   (`world.cost`). Roads get better once a year as their people learn more.
 * - Highways: places of one people on the same land build a road to their
 *   nearest neighbour (up to 70 tiles away), planned once and laid tile by
 *   tile, so one sees it grow.
 * - Railways (industry): cities of one people with a station each, along
 *   the road between them; a train runs back and forth on every finished line.
 */
import { BALANCE } from './balance';
import type { People } from './agents';
import { knows } from './inventions';
import { findPath } from './path';
import type { Sim } from './sim';
import type { Village } from './villages';
import { T } from './world';
import { hasBuilding } from './town';

/** Streets run every this many tiles through a place. */
export const STREET = 4;

export interface Highway {
  /** "a|b" (village ids, smaller first). */
  key: string;
  people: People;
  tiles: number[];
  /** Tiles laid so far (a road under construction); equal to `tiles.length` when done. */
  done: number;
}

export interface Train {
  key: string;
  people: People;
  route: number[];
  /** Position along the route (tiles, fractional), direction and a pause at the ends. */
  pos: number;
  dir: 1 | -1;
  wait: number;
}

const R = BALANCE.roads;

/** How far the houses of a place reach: the wall goes just outside. */
export const livingRadius = (v: Village) => R.living[v.tier ?? 'village'];

const mod = (n: number) => ((n % STREET) + STREET) % STREET;

/** Is (x, y) on a street line of the place? */
export const onStreet = (v: Village, x: number, y: number) => mod(x - v.x) === 0 || mod(y - v.y) === 0;

/** The road a people can build: 1 path, 2 gravel (wheel), 3 paving (masonry). */
export function roadLevel(sim: Sim, p: People): number {
  return knows(sim, p, 'masonry') ? 3 : knows(sim, p, 'wheel') ? 2 : 1;
}

/**
 * A free building spot of the place between r0 and r1 tiles from the square:
 * grass or sand next to a street (not on one), nothing built on it or right
 * next to it, no road, no field, not on foreign land. Near ones first.
 */
export function gridSpot(sim: Sim, v: Village, r0: number, r1: number, taken: (x: number, y: number) => boolean, foreign: (x: number, y: number) => boolean) {
  const w = sim.world;
  let best: { x: number; y: number; s: number } | null = null;
  const r = Math.ceil(r1);
  for (let y = v.y - r; y <= v.y + r; y++) {
    for (let x = v.x - r; x <= v.x + r; x++) {
      const d = Math.hypot(x - v.x, y - v.y);
      if (d < r0 || d > r1) continue;
      const t = w.get(x, y);
      if ((t !== T.GRASS && t !== T.SAND) || onStreet(v, x, y)) continue;
      if (!onStreet(v, x + 1, y) && !onStreet(v, x - 1, y) && !onStreet(v, x, y + 1) && !onStreet(v, x, y - 1)) continue;
      const i = y * w.w + x;
      if (w.road[i] || !w.sameLand(v.x, v.y, x, y) || taken(x, y) || foreign(x, y)) continue;
      const s = d + sim.rand() * 1.5;
      if (!best || s < best.s) best = { x, y, s };
    }
  }
  return best && { x: best.x, y: best.y };
}

/** Lays one road tile (level only goes up); forest is cleared, fields and mountains are left alone. */
function roadAt(sim: Sim, x: number, y: number, level: number, bridges: boolean, blocked?: (x: number, y: number) => boolean): boolean {
  const w = sim.world;
  if (!w.inside(x, y)) return false;
  const i = y * w.w + x;
  const t = w.tiles[i];
  if (t === T.DEEP || t === T.MOUNTAIN || t === T.FIELD) return false;
  if (t === T.SHALLOW && !bridges) return false;
  if (blocked?.(x, y)) return false;
  if (t === T.FOREST) w.set(x, y, T.GRASS);
  w.setRoad(i, Math.max(w.road[i], level));
  return true;
}

/**
 * A street from a building at (bx, by) to the square: to the street next to
 * the door, then along the grid (down a street that runs north–south first,
 * else along one that runs east–west).
 */
export function layStreet(sim: Sim, v: Village, bx: number, by: number) {
  const level = roadLevel(sim, v.people);
  const bridges = knows(sim, v.people, 'masonry');
  const built = (x: number, y: number) =>
    v.houses.some((h) => h.x === x && h.y === y) || v.buildings.some((b) => b.x === x && b.y === y) || (!!v.site && v.site.x === x && v.site.y === y);
  // The street tile at the door
  let sx = bx;
  let sy = by;
  if (!onStreet(v, bx, by)) {
    const door = [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ].find(([dx, dy]) => onStreet(v, bx + dx, by + dy));
    if (door) {
      sx = bx + door[0];
      sy = by + door[1];
    }
  }
  const tiles: [number, number][] = [];
  let x = sx;
  let y = sy;
  const step = (tx: number, ty: number) => {
    while (x !== tx) {
      tiles.push([x, y]);
      x += Math.sign(tx - x);
    }
    while (y !== ty) {
      tiles.push([x, y]);
      y += Math.sign(ty - y);
    }
  };
  if (mod(sx - v.x) === 0) {
    step(sx, v.y);
    step(v.x, v.y);
  } else {
    step(v.x, sy);
    step(v.x, v.y);
  }
  tiles.push([v.x, v.y]);
  for (const [tx, ty] of tiles) roadAt(sim, tx, ty, level, bridges, built);
}

/** All streets of a place again (old saves, after a conquest): from every house and building. */
export function layAllStreets(sim: Sim, v: Village) {
  for (const h of v.houses) layStreet(sim, v, h.x, h.y);
  for (const b of v.buildings) if (b.kind !== 'wall') layStreet(sim, v, b.x, b.y);
}

const hwKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Once a year: roads get better with what their people know, places plan a
 * highway to their nearest neighbour of the same people, cities with
 * stations plan a railway along it, the walls are mended.
 */
export function roadTick(sim: Sim) {
  if (sim.year === sim.roadYear) return;
  sim.roadYear = sim.year;
  const w = sim.world;
  const peopleOf = new Map(sim.villages.map((v) => [v.id, v.people]));
  const levels = new Map<People, number>();
  const levelOf = (p: People) => levels.get(p) ?? (levels.set(p, roadLevel(sim, p)), levels.get(p)!);
  for (let i = 0; i < w.w * w.h; i++) {
    const r = w.road[i];
    if (!r) continue;
    const p = w.owner[i] >= 0 ? peopleOf.get(w.owner[i]) : undefined;
    if (p && levelOf(p) > r) w.setRoad(i, levelOf(p));
  }

  const live = sim.villages.filter((v) => !v.ruin && !v.merged);
  for (const v of live) {
    // Mending the walls after a siege
    if (v.wallHp !== undefined) v.wallHp += R.wallRepair;
    // One highway under construction per people at a time
    if (sim.highways.some((h) => h.people === v.people && h.done < h.tiles.length)) continue;
    const near = live
      .filter((o) => o !== v && o.people === v.people && w.sameLand(v.x, v.y, o.x, o.y) && Math.hypot(o.x - v.x, o.y - v.y) <= R.highwayReach)
      .sort((a, b) => Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
    if (!near || sim.highways.some((h) => h.key === hwKey(v.id, near.id))) continue;
    const path = findPath(w, v.x, v.y, near.x, near.y, 'human', 30000);
    if (!path || path.length < 4) continue;
    sim.highways.push({ key: hwKey(v.id, near.id), people: v.people, tiles: [v.y * w.w + v.x, ...path], done: 0 });
  }

  // Railways: every city with a station to the nearest other one of its people on the same land
  const stations = live.filter((v) => hasBuilding(v, 'station') && knows(sim, v.people, 'railway'));
  for (const a of stations) {
    if (sim.railways.some((r) => r.people === a.people && r.done < r.tiles.length)) continue;
    const b = stations
      .filter((o) => o !== a && o.people === a.people && w.sameLand(a.x, a.y, o.x, o.y) && Math.hypot(o.x - a.x, o.y - a.y) <= R.railReach)
      .sort((x, y) => Math.hypot(x.x - a.x, x.y - a.y) - Math.hypot(y.x - a.x, y.y - a.y))[0];
    if (!b || sim.railways.some((r) => r.key === hwKey(a.id, b.id))) continue;
    const path = findPath(w, a.x, a.y, b.x, b.y, 'human', 40000);
    if (!path || path.length < 4) continue;
    sim.railways.push({ key: hwKey(a.id, b.id), people: a.people, tiles: [a.y * w.w + a.x, ...path].filter((i) => w.landTile(i) || w.road[i]), done: 0 });
  }
}

/** Every second: highways and railways under construction grow by a few tiles. */
export function roadWork(sim: Sim) {
  const w = sim.world;
  for (const h of sim.highways) {
    if (h.done >= h.tiles.length) continue;
    const level = roadLevel(sim, h.people);
    const bridges = knows(sim, h.people, 'masonry');
    if (sim.rand() > R.highwayPerSecond) continue;
    const i = h.tiles[h.done++];
    roadAt(sim, i % w.w, Math.floor(i / w.w), level, bridges);
  }
  for (const r of sim.railways) {
    if (r.done >= r.tiles.length) continue;
    if (sim.rand() > R.railPerSecond) continue;
    w.setRail(r.tiles[r.done++], 1);
    if (r.done >= r.tiles.length) {
      sim.trains.push({ key: r.key, people: r.people, route: r.tiles, pos: 0, dir: 1, wait: 0 });
      const [a, b] = r.key.split('|').map((id) => sim.villages.find((v) => v.id === Number(id)));
      if (a && b) sim.chronicle.add({ year: sim.year, kind: 'railway', a: { id: 0, name: a.name, people: a.people }, p: a.people, v: a.name, w: b.name, x: a.x, y: a.y });
    }
  }
}

/** Every tick: trains run along their lines and wait a moment at each station. */
export function moveTrains(sim: Sim, dt: number) {
  for (const t of sim.trains) {
    if (t.wait > 0) {
      t.wait -= dt;
      continue;
    }
    t.pos += t.dir * R.trainSpeed * dt;
    const end = t.route.length - 1;
    if (t.pos >= end || t.pos <= 0) {
      t.pos = Math.max(0, Math.min(end, t.pos));
      t.dir = t.dir === 1 ? -1 : 1;
      t.wait = R.trainWait;
    }
  }
  // Lines whose ends are gone or changed hands stop running
  sim.trains = sim.trains.filter((t) => {
    const [a, b] = t.key.split('|').map((id) => sim.villages.find((v) => v.id === Number(id)));
    return a && b && !a.ruin && !b.ruin && a.people === t.people && b.people === t.people;
  });
}

/** The trains again after loading (one per finished railway). */
export function restoreTrains(sim: Sim) {
  sim.trains = sim.railways.filter((r) => r.done >= r.tiles.length).map((r) => ({ key: r.key, people: r.people, route: r.tiles, pos: 0, dir: 1 as const, wait: 0 }));
}
