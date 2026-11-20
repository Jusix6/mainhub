/**
 * Inventions (Phase 9). Every people researches the same chain, one after
 * the other. Research points come once a second from its villages: a little
 * from every grown-up, more from wise ones, from a smithy, a town hall and
 * from being a city; writing speeds it all up. Each invention changes
 * something you can see:
 *
 *  - tools: the smith can make tools, all work a bit faster
 *  - agriculture: farmers plough fields (before, they only forage), crops grow faster
 *  - wheel: loads go on a little cart, twice as much per trip
 *  - masonry: stone houses, town houses and city walls become possible
 *  - bronze: smiths forge bronze swords and armour; tools are made faster
 *  - writing: research 50 % faster
 *  - iron: smiths forge iron swords; tools last longer
 *  - boats: fishers row out in boats and catch more
 *
 * A god gift (Rules tab) hands a people its next invention at once.
 */
import { researchBonus } from './wonders';
import { celebrate } from './culture';
import { has, hasPower, PEOPLES, stage, stat, type Human, type People } from './agents';
import type { Sim } from './sim';
import { refOf, story } from './social';

export const INVENTIONS = [
  'tools',
  'agriculture',
  'wheel',
  'masonry',
  'bronze',
  'writing',
  'iron',
  'boats',
  'windmill',
  'castle',
  'chainmail',
  'navigation',
  'printing',
  'gunpowder',
  'banking',
  'steam',
  'railway',
] as const;
export type Invention = (typeof INVENTIONS)[number];

/**
 * Research points each invention takes, in order. The later ones are set for
 * the research of big peoples (about 100–800 points a year from year 100 on):
 * measured over 350 years, the leading people reaches the Middle Ages
 * around year 95–105, the Renaissance around 160–200 and industry around
 * 210–240, then a progress level every 20–30 years; slower peoples stay a
 * whole age or more behind.
 */
export const COSTS: Record<Invention, number> = {
  tools: 60,
  agriculture: 100,
  wheel: 160,
  masonry: 240,
  bronze: 340,
  writing: 460,
  iron: 620,
  boats: 800,
  windmill: 2600,
  castle: 3400,
  chainmail: 4200,
  navigation: 5000,
  printing: 6000,
  gunpowder: 7200,
  banking: 8500,
  steam: 10500,
  railway: 13000,
};

/** The six ages (Update 2, phase E) and the invention that opens each one. */
export const AGES = ['stone', 'bronze', 'iron', 'medieval', 'renaissance', 'industry'] as const;
export type Age = (typeof AGES)[number];
const AGE_OF: Record<Invention, Age> = {
  tools: 'stone',
  agriculture: 'stone',
  wheel: 'bronze',
  masonry: 'bronze',
  bronze: 'bronze',
  writing: 'bronze',
  iron: 'iron',
  boats: 'iron',
  windmill: 'medieval',
  castle: 'medieval',
  chainmail: 'medieval',
  navigation: 'medieval',
  printing: 'renaissance',
  gunpowder: 'renaissance',
  banking: 'renaissance',
  steam: 'industry',
  railway: 'industry',
};

/** After the last invention: endless progress levels, each a little dearer. */
export const progressCost = (level: number) => 15000 + 4000 * (level - 1);

export interface Tech {
  known: Invention[];
  progress: number;
  /** Progress levels reached after the last invention. */
  level?: number;
}

/** The age a people lives in (0 = Stone Age … 5 = industry). */
export function ageIndex(sim: Sim, p: People): number {
  let i = 0;
  for (const inv of techOf(sim, p).known) i = Math.max(i, AGES.indexOf(AGE_OF[inv]));
  return i;
}

/** Progress makes all work a little faster: 2 % per level, at most 30 %. */
export const progressWork = (sim: Sim, p: People) => Math.max(0.7, 1 - 0.02 * (techOf(sim, p).level ?? 0));

export function techOf(sim: Sim, p: People): Tech {
  let t = sim.tech.get(p);
  if (!t) {
    t = { known: [], progress: 0 };
    sim.tech.set(p, t);
  }
  return t;
}

/** Does this people know the invention? */
export const knows = (sim: Sim, p: People, inv: Invention) => techOf(sim, p).known.includes(inv);

/** The next invention a people is working on, or null when it knows them all. */
export const nextInvention = (sim: Sim, p: People): Invention | null => INVENTIONS.find((i) => !techOf(sim, p).known.includes(i)) ?? null;

/** Points a people gains per second right now. */
export function researchRate(sim: Sim, p: People): number {
  let rate = 0;
  for (const v of sim.villages) {
    if (v.ruin || v.people !== p) continue;
    if (v.buildings.some((b) => b.kind === 'smithy')) rate += 0.4;
    if (v.buildings.some((b) => b.kind === 'townhall')) rate += 0.3;
    if (v.tier === 'city') rate += 0.5;
    // Printing: every library adds a lot
    if (v.buildings.some((b) => b.kind === 'library')) rate += 1.5;
  }
  for (const h of sim.humans) {
    if (h.people !== p || h.village === undefined || stage(h, sim.time) === 'child') continue;
    // Intelligence 5 = as before; wise and curious people add more
    rate += 0.03 * (stat(h, 'intelligence') / 5) + (has(h, 'wise') ? 0.15 : 0) + (has(h, 'curious') ? 0.02 : 0);
  }
  // A living genius makes the whole people research three times as fast
  const genius = sim.humans.some((h) => h.people === p && hasPower(h, 'genius'));
  return rate * (knows(sim, p, 'writing') ? 1.5 : 1) * (genius ? 3 : 1) * researchBonus(sim, p);
}

/** Once a second: research moves on, and inventions are made. */
export function researchTick(sim: Sim) {
  for (const p of PEOPLES) {
    const next = nextInvention(sim, p);
    const rate = researchRate(sim, p);
    if (!rate) continue;
    const t = techOf(sim, p);
    t.progress += rate;
    if (next) {
      if (t.progress >= COSTS[next]) invent(sim, p, next);
      continue;
    }
    // Everything invented: progress never stops
    const level = (t.level ?? 0) + 1;
    if (t.progress >= progressCost(level)) {
      t.level = level;
      t.progress = 0;
      const v = capitalOf(sim, p);
      sim.chronicle.add({ year: sim.year, kind: 'progress', a: { id: 0, name: '', people: p }, p, n: level, x: v?.x ?? 0, y: v?.y ?? 0 });
    }
  }
}

/** The people learns it; the wisest grown-up among them gets the credit. */
export function invent(sim: Sim, p: People, inv: Invention) {
  const t = techOf(sim, p);
  if (t.known.includes(inv)) return;
  const before = ageIndex(sim, p);
  t.known.push(inv);
  t.progress = 0;
  // A new age: a big line in the chronicle and a feast in the capital
  if (AGES.indexOf(AGE_OF[inv]) > before) {
    const capital = capitalOf(sim, p);
    sim.chronicle.add({ year: sim.year, kind: 'newAge', a: { id: 0, name: '', people: p }, p, w: AGE_OF[inv], x: capital?.x ?? 0, y: capital?.y ?? 0 });
    celebrate(sim, capital, 'newAge');
  }
  const people = sim.humans.filter((h) => h.people === p && h.village !== undefined && stage(h, sim.time) !== 'child');
  const inventor =
    people.filter((h) => has(h, 'wise')).sort((a, b) => a.born - b.born)[0] ?? people.sort((a, b) => a.born - b.born)[0] ?? (undefined as Human | undefined);
  if (inventor) {
    story(inventor, sim, 'invented', inv);
    sim.puff(inventor.x, inventor.y - 0.6, 10, ['#ffe066', '#ffffff', '#4d8dff']);
  }
  sim.chronicle.add({
    year: sim.year,
    kind: 'invention',
    a: inventor ? refOf(inventor) : { id: 0, name: '', people: p },
    p,
    w: inv,
    x: inventor?.x ?? 0,
    y: inventor?.y ?? 0,
  });
}

/** The capital of a people, else its biggest place. */
function capitalOf(sim: Sim, p: People) {
  const k = sim.kingdoms.get(p);
  return sim.villages.find((v) => v.id === k?.capital && !v.ruin) ?? sim.villages.filter((v) => !v.ruin && v.people === p).sort((a, b) => b.members - a.members)[0];
}

/** God gift: the next invention, right now. */
export function gift(sim: Sim, p: People): Invention | null {
  const next = nextInvention(sim, p);
  if (next) invent(sim, p, next);
  return next;
}
