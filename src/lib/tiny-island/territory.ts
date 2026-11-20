/**
 * Land and borders (Update 3, phase B). Every land tile belongs to nobody or
 * to one place (`world.owner`, a village id), and so to its people and
 * kingdom.
 *
 * - Each place claims the land around it, more the bigger it is (village 8
 *   tiles, town 12, city 16, `BALANCE.land.radius`), on its own land mass.
 *   Free land goes to the nearest place; land of another place of the same
 *   people goes to whichever is nearer; land of another people is never
 *   taken by itself. A place that shrinks keeps its land; ruins lose theirs
 *   after 20 years, places that merged at once.
 * - Land hunger: every kingdom wants more land, the more crowded it is, the
 *   less it has in store, and with an ambitious (or greedy) king. When its
 *   settlers find no free spot for a new place any more, the king lays claim to the land
 *   of a neighbour around one of its places (hatched on the map). The mood
 *   drops; after a few years the claim becomes a war for that land, unless
 *   the two peoples are allies or joined by a royal wedding by then.
 * - Land grab: settlers who found a place on land of another people (when
 *   there is no free land) make the owners furious (mood −50) and get an
 *   ultimatum: after three years they either leave or the owners go to war.
 * - After a won war the land changes hands: a conquered place keeps its land
 *   (it now belongs to the winners), a war for land hands over the claimed
 *   area.
 */
import { BALANCE } from './balance';
import { has, type Human, type People } from './agents';
import type { Sim } from './sim';
import type { Village } from './villages';
import { join } from './villages';
import { allied, armyOf, declareLandWar, isWarrior, pairKey, shiftMood, warBetween } from './war';
import { refOf } from './social';
import { T } from './world';
import { sharedLeague } from './leagues';

export interface Claim {
  id: number;
  /** `claim`: a king wants the land of a neighbour; `grab`: settlers sit on land of another people. */
  kind: 'claim' | 'grab';
  /** Who wants the land, and whose land it is. */
  by: People;
  from: People;
  /** The place that gets the land (claim: the claimant's place nearest to it; grab: the settlers' place). */
  base: number;
  /** The place whose land it is (claim) or that owns the spot (grab). */
  target: number;
  /** The area: a circle (tiles). */
  x: number;
  y: number;
  r: number;
  /** Year it was made; a claim turns into war, an ultimatum ends, in year `due`. */
  since: number;
  due: number;
  /** Key of the war fought over it. */
  war?: string;
}

const L = BALANCE.land;

/** How far a place's land reaches (tiles). */
export function landRadius(v: Village): number {
  return L.radius[v.tier ?? 'village'] + (v.landBonus ?? 0) + ((v.culture ?? 0) >= 3 ? BALANCE.culture.culturedLand : 0);
}

/** The people a tile belongs to, if any. */
export function ownerPeople(sim: Sim, x: number, y: number): People | null {
  const w = sim.world;
  if (!w.inside(x, y)) return null;
  const id = w.owner[y * w.w + x];
  if (id < 0) return null;
  return sim.villages.find((v) => v.id === id)?.people ?? null;
}

/**
 * Once a second: places claim the land around them and lose what they cannot
 * keep. Marks `world.ownerVersion` up when anything changed (for the map).
 */
export function claimLand(sim: Sim) {
  const w = sim.world;
  const own = w.owner;
  const n = w.w * w.h;
  const byId = new Map(sim.villages.map((v) => [v.id, v]));
  let changed = false;

  // Ruins: when they fell (their land goes after 20 years)
  for (const v of sim.villages) {
    if (v.ruin && v.ruinYear === undefined) v.ruinYear = sim.year;
    else if (!v.ruin && v.ruinYear !== undefined) delete v.ruinYear;
  }
  // Land nobody can hold any more: gone or merged places, old ruins, flooded tiles
  for (let i = 0; i < n; i++) {
    const id = own[i];
    if (id < 0) continue;
    const v = byId.get(id);
    const lost = !v || v.merged || (v.ruin && sim.year - (v.ruinYear ?? sim.year) >= L.ruinYears) || !w.landTile(i);
    if (lost) {
      own[i] = -1;
      changed = true;
    }
  }

  // Free land: the nearest place that reaches it; land of the same people: the nearer place
  const best = new Map<number, { id: number; d: number }>();
  for (const v of sim.villages) {
    if (v.ruin || v.merged) continue;
    const r = landRadius(v);
    for (let y = Math.max(0, v.y - r); y <= Math.min(w.h - 1, v.y + r); y++) {
      for (let x = Math.max(0, v.x - r); x <= Math.min(w.w - 1, v.x + r); x++) {
        const d = Math.hypot(x - v.x, y - v.y);
        if (d > r) continue;
        const i = y * w.w + x;
        if (!w.landTile(i) || !w.sameLand(v.x, v.y, x, y)) continue;
        const cur = own[i];
        if (cur === v.id) continue;
        if (cur < 0) {
          const b = best.get(i);
          if (!b || d < b.d) best.set(i, { id: v.id, d });
          continue;
        }
        const o = byId.get(cur);
        if (o && o.people === v.people && (o.ruin || d < Math.hypot(x - o.x, y - o.y))) {
          own[i] = v.id;
          changed = true;
        }
      }
    }
  }
  for (const [i, b] of best) {
    own[i] = b.id;
    changed = true;
  }
  if (changed) w.ownerVersion++;
}

/** Land tiles per people and free land tiles, counted from `world.owner`. */
export function landShares(sim: Sim): { by: Map<People, number>; free: number; land: number } {
  const w = sim.world;
  const peopleOf = new Map(sim.villages.map((v) => [v.id, v.people]));
  const by = new Map<People, number>();
  let free = 0;
  let land = 0;
  for (let i = 0; i < w.w * w.h; i++) {
    if (!w.landTile(i)) continue;
    land++;
    const p = w.owner[i] >= 0 ? peopleOf.get(w.owner[i]) : undefined;
    if (p) by.set(p, (by.get(p) ?? 0) + 1);
    else free++;
  }
  return { by, free, land };
}

/**
 * Is there still free land to settle? Like settlers looking for a spot
 * (villages.ts): grass 22–52 tiles from one of the people's places, on the
 * same land, 18 tiles from every other place, not on foreign land.
 */
function roomToSettle(sim: Sim, p: People, places: Village[]) {
  const w = sim.world;
  for (const v of places) {
    for (let k = 0; k < 40; k++) {
      const ang = sim.rand() * Math.PI * 2;
      const d = 22 + sim.rand() * 30;
      const x = Math.round(v.x + Math.cos(ang) * d);
      const y = Math.round(v.y + Math.sin(ang) * d);
      if (w.get(x, y) !== T.GRASS || !w.sameLand(v.x, v.y, x, y)) continue;
      if (sim.villages.some((o) => !o.ruin && Math.hypot(o.x - x, o.y - y) < 18)) continue;
      if (!foreignLand(sim, p, x, y)) return true;
    }
  }
  return false;
}

/** The foreign places the land of a people touches, with the length of the shared border. */
function frontier(sim: Sim, p: People) {
  const w = sim.world;
  const peopleOf = new Map(sim.villages.map((v) => [v.id, v.people]));
  const touch = new Map<number, number>();
  for (let y = 0; y < w.h; y++) {
    for (let x = 0; x < w.w; x++) {
      const i = y * w.w + x;
      if (w.owner[i] < 0 || peopleOf.get(w.owner[i]) !== p) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!w.inside(nx, ny)) continue;
        const j = ny * w.w + nx;
        if (!w.landTile(j)) continue;
        const o = w.owner[j];
        if (o >= 0 && peopleOf.get(o) !== p) touch.set(o, (touch.get(o) ?? 0) + 1);
      }
    }
  }
  return { touch };
}

/** Tiles of the area of a claim that still belong to the place it is about. */
export function claimTiles(sim: Sim, c: Claim): number[] {
  const w = sim.world;
  const out: number[] = [];
  for (let y = Math.max(0, c.y - c.r); y <= Math.min(w.h - 1, c.y + c.r); y++) {
    for (let x = Math.max(0, c.x - c.r); x <= Math.min(w.w - 1, c.x + c.r); x++) {
      if (Math.hypot(x - c.x, y - c.y) > c.r) continue;
      const i = y * w.w + x;
      const o = w.owner[i];
      if (o < 0) continue;
      const v = sim.villages.find((u) => u.id === o);
      if (v && v.people === c.from) out.push(i);
    }
  }
  return out;
}

/** The claimed area changes hands: the land goes to the claimant's place. */
export function handOver(sim: Sim, c: Claim) {
  const base = sim.villages.find((v) => v.id === c.base && !v.ruin);
  if (!base) return;
  const tiles = claimTiles(sim, c);
  if (!tiles.length) return;
  for (const i of tiles) sim.world.owner[i] = base.id;
  sim.world.ownerVersion++;
  const target = sim.villages.find((v) => v.id === c.target);
  sim.chronicle.add({ year: sim.year, kind: 'landWon', a: { id: 0, name: base.name, people: c.by }, p: c.by, q: c.from, v: base.name, w: target?.name ?? base.name, n: tiles.length, x: c.x, y: c.y });
}

/**
 * A war over a claim is over: the land changes hands if the claimants won;
 * settlers who lost the war to drive them out have to leave.
 */
export function claimWarOver(sim: Sim, key: string, claimantWon: boolean) {
  const c = sim.claims.find((x) => x.war === key);
  if (!c) return;
  sim.claims = sim.claims.filter((x) => x !== c);
  sim.claimsVersion++;
  if (claimantWon) handOver(sim, c);
  else if (c.kind === 'grab') {
    const base = sim.villages.find((v) => v.id === c.base);
    if (base && !base.ruin && base.people === c.by) withdraw(sim, c, base, true);
  }
}

/** Warriors of a people (for who gives in to an ultimatum). */
const strength = (sim: Sim, p: People) => sim.humans.filter((h) => h.people === p && !h.dead && isWarrior(h, sim)).length;

/**
 * Once a year: land hunger of every kingdom, new claims, claims that turn
 * into war or are given up, ultimatums that run out.
 */
export function territoryTick(sim: Sim) {
  if (sim.year === sim.territoryYear) return;
  sim.territoryYear = sim.year;
  const shares = landShares(sim);

  for (const [p, k] of sim.kingdoms) {
    const pop = sim.humans.filter((h) => h.people === p && !h.dead).length;
    const land = shares.by.get(p) ?? 0;
    const places = sim.villages.filter((v) => v.people === p && !v.ruin && !v.merged);
    const food = places.reduce((s, v) => s + v.food, 0);
    const king = k.king !== undefined ? (sim.byId(k.king) as Human | undefined) : undefined;
    // Crowded land, empty stores, an ambitious or greedy king
    let want = Math.min(70, (pop / Math.max(1, land) / L.crowded) * 50);
    if (food < pop * 1.5) want += 15;
    if (king && has(king, 'ambitious')) want += 25;
    if (king && has(king, 'greedy')) want += 10;
    k.landHunger = Math.round((k.landHunger ?? 0) * 0.7 + Math.min(100, want) * 0.3);
    if (!king || (k.landHunger ?? 0) < L.claimAt || sim.claims.some((c) => c.by === p && c.kind === 'claim')) continue;
    if ((k.claimAt ?? 0) > sim.year) continue;
    // Free land comes first
    if (roomToSettle(sim, p, places)) continue;
    const f = frontier(sim, p);
    // The foreign place with the longest border (not allies, not at war already)
    const target = [...f.touch.entries()]
      .map(([id, len]) => ({ v: sim.villages.find((x) => x.id === id)!, len }))
      .filter(({ v }) => v && !v.ruin && !v.merged && v.people !== p && !allied(sim, p, v.people) && !warBetween(sim, p, v.people))
      .sort((a, b) => b.len - a.len)[0]?.v;
    if (!target) continue;
    const base = places.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
    if (!base) continue;
    const c: Claim = {
      id: sim.nextClaimId++,
      kind: 'claim',
      by: p,
      from: target.people,
      base: base.id,
      target: target.id,
      x: Math.round((base.x + target.x * 2) / 3),
      y: Math.round((base.y + target.y * 2) / 3),
      r: L.claimRadius,
      since: sim.year,
      due: sim.year + L.claimYears,
    };
    if (claimTiles(sim, c).length < 4) continue;
    sim.claims.push(c);
    sim.claimsVersion++;
    k.claimAt = sim.year + L.claimPause;
    shiftMood(sim, p, target.people, -L.claimMood);
    sim.chronicle.add({ year: sim.year, kind: 'claim', a: refOf(king), p, q: target.people, v: base.name, w: target.name, x: c.x, y: c.y });
  }

  for (const c of [...sim.claims]) {
    const base = sim.villages.find((v) => v.id === c.base);
    const target = sim.villages.find((v) => v.id === c.target);
    const drop = (why?: string) => {
      sim.claims = sim.claims.filter((x) => x !== c);
      sim.claimsVersion++;
      if (why) sim.chronicle.add({ year: sim.year, kind: 'claimDropped', a: { id: 0, name: '', people: c.by }, p: c.by, q: c.from, w: target?.name ?? '', cause: why, x: c.x, y: c.y });
    };
    if (c.war) {
      if (!sim.wars.has(c.war)) drop();
      continue;
    }
    if (!base || base.ruin || base.merged || base.people !== c.by) {
      drop();
      continue;
    }
    if (c.kind === 'claim') {
      if (!target || target.ruin || target.people !== c.from || !claimTiles(sim, c).length) {
        drop();
        continue;
      }
      // Friends do not fight over land
      const union = sim.kingdoms.get(c.by)?.union === c.from || sim.kingdoms.get(c.from)?.union === c.by;
      if (allied(sim, c.by, c.from) || union) {
        drop(union ? 'wedding' : 'alliance');
        continue;
      }
      if (sim.year < c.due) continue;
      const key = pairKey(c.by, c.from);
      if ((sim.treaties.get(key) ?? 0) > sim.time) continue;
      if (declareLandWar(sim, c.by, c.from, { kind: 'land', village: c.target })) {
        c.war = key;
        sim.claimsVersion++;
      } else if (sim.year > c.due + L.claimYears * 2) drop(sharedLeague(sim, c.by, c.from) ? 'veto' : 'time');
      continue;
    }
    // A land grab: the ultimatum
    const ownerNow = sim.world.owner[base.y * sim.world.w + base.x];
    const owner = sim.villages.find((v) => v.id === ownerNow);
    if (!owner || owner.people !== c.from) {
      drop();
      continue;
    }
    if (sim.year < c.due) continue;
    const chance = (strength(sim, c.from) >= strength(sim, c.by) ? 0.7 : 0.4) * Math.min(1.5, sim.rules.aggression);
    if (sim.rand() < chance && declareLandWar(sim, c.from, c.by, { kind: 'expel', village: base.id })) {
      c.war = pairKey(c.by, c.from);
      sim.claimsVersion++;
    } else withdraw(sim, c, base);
  }
}

/** The settlers give in (or lost the war): their place is left (a ruin), they go back to their people. */
function withdraw(sim: Sim, c: Claim, base: Village, driven = false) {
  sim.claims = sim.claims.filter((x) => x !== c);
  sim.claimsVersion++;
  const home = sim.villages
    .filter((v) => v.people === c.by && v !== base && !v.ruin && !v.merged && sim.world.sameLand(v.x, v.y, base.x, base.y))
    .sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y))[0];
  for (const h of sim.humans) {
    if (h.village !== base.id || armyOf(sim, h)) continue;
    for (const house of base.houses) house.owners = house.owners.filter((id) => id !== h.id);
    h.home = null;
    if (home) join(h, home, sim);
    else h.village = undefined;
  }
  base.ruin = true;
  base.members = 0;
  if (home) home.food += base.food;
  base.food = 0;
  const owner = sim.villages.find((v) => v.id === c.target);
  sim.chronicle.add({ year: sim.year, kind: 'withdrew', a: { id: 0, name: base.name, people: c.by }, p: c.by, q: c.from, v: home?.name ?? '', w: base.name, u: owner?.name, cause: driven ? 'war' : undefined, x: base.x, y: base.y });
}

/**
 * Settlers found a place on land of another people (villages.ts): the owners
 * are furious and set an ultimatum.
 */
export function landGrab(sim: Sim, nv: Village, from: Village) {
  const w = sim.world;
  const ownerId = w.owner[nv.y * w.w + nv.x];
  const owner = sim.villages.find((v) => v.id === ownerId);
  if (!owner || owner.people === nv.people) return;
  sim.claims.push({
    id: sim.nextClaimId++,
    kind: 'grab',
    by: nv.people,
    from: owner.people,
    base: nv.id,
    target: owner.id,
    x: nv.x,
    y: nv.y,
    r: L.grabRadius,
    since: sim.year,
    due: sim.year + L.ultimatumYears,
  });
  sim.claimsVersion++;
  shiftMood(sim, nv.people, owner.people, -L.grabMood);
  sim.chronicle.add({ year: sim.year, kind: 'landGrab', a: { id: 0, name: from.name, people: nv.people }, p: nv.people, q: owner.people, v: from.name, w: nv.name, u: owner.name, x: nv.x, y: nv.y });
}

/** Is this tile on land of another people than `p`? */
export function foreignLand(sim: Sim, p: People, x: number, y: number) {
  const o = ownerPeople(sim, x, y);
  return o !== null && o !== p;
}
