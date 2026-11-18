/**
 * Jobs (Phase 7). Every few seconds a village hands out jobs to its
 * grown-ups by what it needs: farmers for the fields, fishers when there is
 * water close by, woodcutters, stonemasons and miners when there are forests
 * and mountains, a smith once there is ore, builders while something is being
 * built, an artist and soldiers in bigger villages. People keep their job as
 * long as it is still needed; traits and peoples make some jobs more likely
 * (the coast people fish, the forest people cut wood, brave ones become
 * soldiers, romantic ones artists …).
 *
 * Also here: fields (plough, sow, harvest) and tools (the smith makes them
 * from ore and wood; work goes faster while the village has some, and they
 * wear out).
 */
import { ageOf, has, stage, stat, type Human, type People } from './agents';
import type { Sim } from './sim';
import { knows } from './inventions';
import { BALANCE } from './balance';
import { foodYears } from './hunger';
import { atWar, equip, isWarrior, WEAPONS, type Weapon } from './war';
import type { Village } from './villages';
import { hasBuilding } from './town';
import { T } from './world';

export const JOBS = ['farmer', 'fisher', 'woodcutter', 'stonemason', 'miner', 'smith', 'builder', 'artist', 'soldier'] as const;
export type Job = (typeof JOBS)[number];

/** How far around the square a village looks for fields, water, forest, rock. */
const REACH = 9;

/** Seconds a job keeps someone busy before they look again (plough / sow / harvest). */
export const FARM_TIME = { plough: 3, sow: 1.5, harvest: 2 } as const;
export const HARVEST = 6;

/** What a village has around its square (scanned once in a while). */
export interface Surroundings {
  water: boolean;
  forest: boolean;
  rock: boolean;
  fields: number;
  ripe: number;
}

export function surroundings(v: Village, sim: Sim): Surroundings {
  const w = sim.world;
  const out: Surroundings = { water: false, forest: false, rock: false, fields: 0, ripe: 0 };
  const R = 16;
  for (let y = v.y - R; y <= v.y + R; y++) {
    for (let x = v.x - R; x <= v.x + R; x++) {
      if (!w.inside(x, y)) continue;
      const t = w.get(x, y);
      const d = Math.hypot(x - v.x, y - v.y);
      if (d > R) continue;
      if (t === T.SHALLOW || t === T.DEEP) out.water ||= d < 12;
      else if (t === T.FOREST) out.forest = true;
      else if (t === T.MOUNTAIN) out.rock = true;
      else if (t === T.FIELD && d <= REACH) {
        out.fields++;
        if (w.crop[y * w.w + x] >= 4) out.ripe++;
      }
    }
  }
  return out;
}

/** How well someone fits a job: traits and people, plus a bonus for staying. */
function affinity(h: Human, job: Job): number {
  let a = h.job === job ? 30 : 0;
  const people: Partial<Record<People, Job[]>> = {
    coast: ['fisher'],
    forest: ['woodcutter', 'artist'],
    mountain: ['miner', 'stonemason', 'smith'],
    steppe: ['soldier', 'farmer'],
  };
  if (people[h.people]?.includes(job)) a += 15;
  const traits: Record<string, Job[]> = {
    brave: ['soldier'],
    warlike: ['soldier', 'smith'],
    romantic: ['artist'],
    wise: ['builder', 'smith', 'artist'],
    hardworking: ['farmer', 'miner', 'stonemason', 'builder'],
    lazy: ['fisher', 'artist'],
    greedy: ['farmer', 'fisher'],
    friendly: ['farmer', 'builder'],
    quarrelsome: ['soldier', 'miner'],
    cowardly: ['farmer', 'artist'],
  };
  for (const t of h.traits) if (traits[t]?.includes(job)) a += 12;
  if (job === 'soldier' && has(h, 'cowardly')) a -= 50;
  // Abilities (Update 2)
  if (job === 'soldier') a += (stat(h, 'courage') - 5) * 4;
  if (job === 'smith' || job === 'builder') a += (stat(h, 'intelligence') - 5) * 3;
  if (job === 'woodcutter' || job === 'stonemason' || job === 'miner' || job === 'farmer') a += (stat(h, 'strength') - 5) * 2;
  if (job === 'artist' && has(h, 'artistic')) a += 20;
  return a;
}

/** How many of each job a village wants, in the order they are handed out. */
function wanted(v: Village, s: Surroundings, adults: number, tools: boolean): [Job, number][] {
  const out: [Job, number][] = [];
  const add = (job: Job, n: number) => n > 0 && out.push([job, Math.round(n)]);
  add('builder', v.site ? Math.max(1, adults / 8) : adults >= 6 ? 1 : 0);
  // Less than two years of food in store: more hands for food (Update 2)
  const short = foodYears(v) < BALANCE.food.warnYears ? 1.5 : 1;
  add('farmer', Math.max(1, adults * 0.3 * short));
  if (s.water) add('fisher', Math.max(1, adults * (v.people === 'coast' ? 0.25 : 0.12) * short));
  if (s.forest) add('woodcutter', Math.max(1, adults * (v.people === 'forest' ? 0.2 : 0.12)));
  if (s.rock && adults >= 5) add('stonemason', v.need.stone > 0 ? 2 : 1);
  if (s.rock && adults >= 6) add('miner', v.people === 'mountain' ? 2 : 1);
  // A smith only once the people knows how to make tools (inventions.ts)
  // (without mountains close by they still make clubs from wood)
  if (tools && adults >= 8) add('smith', 1);
  if (adults >= 10) add('artist', 1);
  // A barracks (phase F) keeps a bigger standing army
  if (adults >= 8) add('soldier', hasBuilding(v, 'barracks') ? adults / 5 : adults / 8);
  return out;
}

/** Hands out jobs; the rest of the grown-ups help wherever it is needed (no job). */
export function assignJobs(v: Village, sim: Sim, members: Human[]) {
  const s = surroundings(v, sim);
  v.fields = s.fields;
  v.ripe = s.ripe;
  v.rock = s.rock;
  const adults = members.filter((h) => stage(h, sim.time) !== 'child');
  for (const h of members) if (stage(h, sim.time) === 'child') h.job = undefined;
  // Own characters with a fixed job keep it
  const free = new Set(adults.filter((h) => !h.fixedJob));
  const next = new Map<Human, Job>();
  for (const [job, n] of wanted(v, s, adults.length, knows(sim, v.people, 'tools'))) {
    const ranked = [...free].sort((a, b) => affinity(b, job) - affinity(a, job) + (ageOf(a, sim.time) > 60 && job === 'soldier' ? 99 : 0));
    for (const h of ranked.slice(0, n)) {
      next.set(h, job);
      free.delete(h);
    }
  }
  for (const h of adults) {
    h.job = h.fixedJob ?? next.get(h);
    // Soldiers take the best weapon and armour in store
    if (h.job === 'soldier') equip(h, v);
  }
}

/** How many fields a village wants: about one for every two people. */
export const fieldTarget = (v: Village) => Math.min(16, Math.ceil(v.members / 2) + 1);

/**
 * The next thing for a farmer to do around the square: harvest a ripe field,
 * sow an empty one, or plough a new one while there are too few.
 */
export function farmSpot(h: Human, v: Village, sim: Sim): { x: number; y: number; farm: keyof typeof FARM_TIME } | null {
  const w = sim.world;
  let ripe: { x: number; y: number; d: number } | null = null;
  let empty: { x: number; y: number; d: number } | null = null;
  for (let y = v.y - REACH; y <= v.y + REACH; y++) {
    for (let x = v.x - REACH; x <= v.x + REACH; x++) {
      if (w.get(x, y) !== T.FIELD) continue;
      const d = Math.hypot(x - h.x, y - h.y);
      const c = w.crop[y * w.w + x];
      if (c >= 4 && (!ripe || d < ripe.d)) ripe = { x, y, d };
      if (c === 0 && (!empty || d < empty.d)) empty = { x, y, d };
    }
  }
  if (ripe) return { x: ripe.x, y: ripe.y, farm: 'harvest' };
  if (empty) return { x: empty.x, y: empty.y, farm: 'sow' };
  // New fields only once the people has invented agriculture
  if ((v.fields ?? 0) >= fieldTarget(v) || !knows(sim, v.people, 'agriculture')) return null;
  // A new field near the square: open grass first, else clear some forest; never next to a house
  let best: { x: number; y: number; score: number } | null = null;
  for (let y = v.y - REACH; y <= v.y + REACH; y++) {
    for (let x = v.x - REACH; x <= v.x + REACH; x++) {
      const t = w.get(x, y);
      if (t !== T.GRASS && t !== T.FOREST) continue;
      const d = Math.hypot(x - v.x, y - v.y);
      if (d < 3 || d > REACH) continue;
      if (v.houses.some((house) => Math.abs(house.x - x) < 2 && Math.abs(house.y - y) < 2)) continue;
      if (v.site && Math.abs(v.site.x - x) < 2 && Math.abs(v.site.y - y) < 2) continue;
      const score = d + (t === T.FOREST ? 4 : 0) + sim.rand() * 2;
      if (!best || score < best.score) best = { x, y, score };
    }
  }
  if (best) return { x: best.x, y: best.y, farm: 'plough' };
  return null;
}

/** Work goes a quarter faster while the village has tools. */
export const toolFactor = (v: Village | undefined) => (v && v.tools > 0 ? 0.75 : 1);

/** After a load: tools wear out now and then. */
export function wearTools(v: Village, sim: Sim) {
  // A smithy makes tools that last twice as long, iron ones last twice as long again
  const wear = (v.buildings?.some((b) => b.kind === 'smithy') ? 0.0075 : 0.015) * (knows(sim, v.people, 'iron') ? 0.5 : 1);
  if (v.tools > 0 && sim.rand() < wear) v.tools--;
}

/** The smith wants enough tools for about half of the grown-ups. */
export const toolTarget = (v: Village) => Math.max(2, Math.ceil(v.members / 2));

export type Make = 'tool' | Weapon | 'armor';

/**
 * What the smith should make next: tools while they are short, then a weapon
 * for every soldier (and every warrior while the place is at war), armour
 * once bronze is known, better weapons for those with old ones, and the rest
 * of the tools. Clubs need two wood; bronze, iron and armour one ore each.
 */
export function smithTask(v: Village, sim: Sim): Make | null {
  const members = sim.humans.filter((h) => h.village === v.id);
  const war = atWar(sim, { people: v.people, village: v.id });
  const fighters = members.filter((h) => h.job === 'soldier' || (war && isWarrior(h, sim))).length;
  const arms = v.arms;
  const weapons = arms.club + arms.bronze + arms.iron + (arms.musket ?? 0) + members.filter((h) => h.weapon).length;
  const armour = arms.armor + members.filter((h) => h.armor).length;
  const bronze = knows(sim, v.people, 'bronze');
  const best: Weapon =
    knows(sim, v.people, 'gunpowder') && v.ore >= 1 ? 'musket' : knows(sim, v.people, 'iron') && v.ore >= 1 ? 'iron' : bronze && v.ore >= 1 ? 'bronze' : 'club';
  const canWeapon = best !== 'club' || v.wood >= 2;
  if (v.tools < toolTarget(v) / 2 && v.ore >= 1) return 'tool';
  if (weapons < fighters && canWeapon) return best;
  if (bronze && armour < fighters && v.ore >= 1) return 'armor';
  if (best !== 'club') {
    const outdated = members.filter((h) => h.weapon && WEAPONS.indexOf(h.weapon) < WEAPONS.indexOf(best)).length;
    if (arms[best] < outdated) return best;
  }
  if (v.tools < toolTarget(v) && v.ore >= 1) return 'tool';
  return null;
}

/**
 * How much someone with a job wants to work right now (0 = nothing to do).
 * Jobless grown-ups help where the storage is short, as before.
 */
export function jobUrge(h: Human, v: Village, sim: Sim): number {
  const n = v.need;
  switch (h.job) {
    // A base that loses against free time when nothing is short, more when it is
    case 'farmer':
    case 'fisher':
      return 20 + n.food * 35;
    case 'woodcutter':
      return 18 + n.wood * 35;
    case 'stonemason':
      return n.stone > 0 ? 22 + n.stone * 30 : 10;
    case 'miner':
      return v.ore < 6 ? 24 : 8;
    case 'smith':
      return smithTask(v, sim) ? 40 : 0;
    case 'builder':
      return 15 + n.wood * 25;
    case 'artist':
    case 'soldier':
      return 0;
    default: {
      const need = Math.max(n.food, n.wood, n.stone);
      return need > 0 ? need * 45 + 8 : 0;
    }
  }
}
