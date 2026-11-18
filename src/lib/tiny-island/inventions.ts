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
import { has, PEOPLES, stage, type Human, type People } from './agents';
import type { Sim } from './sim';
import { refOf, story } from './social';

export const INVENTIONS = ['tools', 'agriculture', 'wheel', 'masonry', 'bronze', 'writing', 'iron', 'boats'] as const;
export type Invention = (typeof INVENTIONS)[number];

/** Research points each invention takes, in order. */
export const COSTS: Record<Invention, number> = {
  tools: 60,
  agriculture: 100,
  wheel: 160,
  masonry: 240,
  bronze: 340,
  writing: 460,
  iron: 620,
  boats: 800,
};

export interface Tech {
  known: Invention[];
  progress: number;
}

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
  }
  for (const h of sim.humans) {
    if (h.people !== p || h.village === undefined || stage(h, sim.time) === 'child') continue;
    rate += 0.03 + (has(h, 'wise') ? 0.15 : 0);
  }
  return rate * (knows(sim, p, 'writing') ? 1.5 : 1);
}

/** Once a second: research moves on, and inventions are made. */
export function researchTick(sim: Sim) {
  for (const p of PEOPLES) {
    const next = nextInvention(sim, p);
    if (!next) continue;
    const rate = researchRate(sim, p);
    if (!rate) continue;
    const t = techOf(sim, p);
    t.progress += rate;
    if (t.progress >= COSTS[next]) invent(sim, p, next);
  }
}

/** The people learns it; the wisest grown-up among them gets the credit. */
export function invent(sim: Sim, p: People, inv: Invention) {
  const t = techOf(sim, p);
  if (t.known.includes(inv)) return;
  t.known.push(inv);
  t.progress = 0;
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

/** God gift: the next invention, right now. */
export function gift(sim: Sim, p: People): Invention | null {
  const next = nextInvention(sim, p);
  if (next) invent(sim, p, next);
  return next;
}
