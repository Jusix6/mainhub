/**
 * World wonders (Update 2, phase H). Eight huge buildings, each only once in
 * a world: whoever finishes it first owns it.
 *
 *  - A city (or a town of 30) of an age that allows the wonder, with food for
 *    two years in store, decides to build one (at most one project per
 *    people). It pays 3 wood (and 3 stone where there is rock) every year
 *    and its people gather more of both while it goes up.
 *    The site is 4 × 4 tiles next to the city and grows in five stages; the
 *    city's builders (and more of them than usual) carry stone and wood over
 *    and work on it (wonderWork).
 *    It takes about 20–40 years, slower when the stores run dry; a city that
 *    shrinks below 10 people, or a site stuck for 80 years, is given up.
 *  - Several peoples may build the same wonder: the first one done wins, the
 *    others are left with a ruin (and do not like the winners for a while).
 *  - Done: a big festival, and a name after the ruler, the leader or a hero
 *    of legend ("The Great Lighthouse of Queen Mira").
 *  - It belongs to whoever holds the city: conquered, the wonder changes
 *    hands too.
 *
 * What they do (`owns`, used all over the sim):
 *  gardens      Bronze Age    food brought home +30 %, lives 10 % longer
 *  library      Bronze Age    research +50 %
 *  colosseum    Iron Age      games every year, half the brawls, soldiers hit 15 % harder
 *  lighthouse   Middle Ages   ships 30 % faster and see farther; lifts the fog far around it
 *  cathedral    Middle Ages   no revolts, vassals more loyal
 *  wall         Middle Ages   its places only fall to armies with catapults or cannons
 *  observatory  Renaissance   research +35 %
 *  colossus     Industry      a giant statue of the greatest hero; everyone likes the people more
 */
import { stage, type Human, type People } from './agents';
import { celebrate } from './culture';
import { ageIndex } from './inventions';
import { kingOf } from './kingdoms';
import type { Sim } from './sim';
import { refOf } from './social';
import type { Village } from './villages';
import { T } from './world';

export const WONDERS = ['gardens', 'library', 'colosseum', 'lighthouse', 'cathedral', 'wall', 'observatory', 'colossus'] as const;
export type WonderKind = (typeof WONDERS)[number];

/** The age (index in AGES) from which a wonder can be built. */
export const WONDER_AGE: Record<WonderKind, number> = { gardens: 1, library: 1, colosseum: 2, lighthouse: 3, cathedral: 3, wall: 3, observatory: 4, colossus: 5 };

export interface Wonder {
  id: number;
  kind: WonderKind;
  /** The city building (or holding) it. */
  village: number;
  /** The people that holds it (changes when the city is conquered). */
  people: People;
  /** Top left tile of the 4 × 4 site. */
  x: number;
  y: number;
  started: number;
  /** Person-seconds of work done and needed. */
  work: number;
  needed: number;
  /** The year it was finished, or the year it was given up (ruin). */
  finished?: number;
  ruin?: boolean;
  /** Named after: "Queen Mira", "Bram" … (`rank` king/queen or empty). */
  ruler?: string;
  rank?: 'king' | 'queen' | '';
  /** For the colossus: the hero it shows (people and look). */
  hero?: { name: string; people: People; female: boolean };
  /** Stores ran dry this year: work goes at half the pace. */
  short?: boolean;
}

export const WONDER_SIZE = 4;

const isDone = (w: Wonder) => w.finished !== undefined && !w.ruin;
const villageById = (sim: Sim, id: number) => sim.villages.find((v) => v.id === id);

/** Does this people hold this (finished) wonder? */
export function owns(sim: Sim, p: People, kind: WonderKind) {
  return sim.wonders.some((w) => w.kind === kind && isDone(w) && w.people === p);
}

/** The project a place is working on, if any. */
export const projectOf = (sim: Sim, v: Village | undefined) => (v ? sim.wonders.find((w) => w.village === v.id && w.finished === undefined && !w.ruin) : undefined);

/** Encodes a wonder's name for the chronicle ("wonder:lighthouse:queen:Mira"). */
export const wonderTag = (w: Wonder) => `wonder:${w.kind}:${w.rank ?? ''}:${w.ruler ?? ''}`;

/** Is (x, y) on a wonder site? Nothing else is built there. */
export function onWonder(sim: Sim, x: number, y: number, margin = 1) {
  return sim.wonders.some((w) => x >= w.x - margin && x < w.x + WONDER_SIZE + margin && y >= w.y - margin && y < w.y + WONDER_SIZE + margin);
}

/* ---- once a year: new projects, owners, the games ------------------------------------ */

export function wonderTick(sim: Sim) {
  if (sim.wonderYear === sim.year) return;
  sim.wonderYear = sim.year;
  for (const w of sim.wonders) {
    const v = villageById(sim, w.village);
    // Changed hands with its city
    if (isDone(w) && v && !v.ruin && v.people !== w.people) {
      w.people = v.people;
      sim.chronicle.add({ year: sim.year, kind: 'wonderTaken', a: { id: 0, name: v.name, people: v.people }, u: wonderTag(w), v: v.name, p: v.people, x: w.x + 2, y: w.y + 2 });
    }
    // A project whose city is gone, conquered, shrunk to a handful or stuck for 80 years is given up
    if (w.finished === undefined && !w.ruin && (!v || v.ruin || v.people !== w.people || v.members < 10 || sim.year - w.started > 80)) giveUp(sim, w, v);
    // Building costs stone and wood every year
    // Stone only where the place can get any
    if (w.finished === undefined && !w.ruin && v) {
      const stone = v.rock ? 3 : 0;
      w.short = v.stone < stone || v.wood < 3;
      if (!w.short) {
        v.stone -= stone;
        v.wood -= 3;
      }
    }
    // The colosseum: games every year
    if (isDone(w) && w.kind === 'colosseum' && v && !v.ruin) celebrate(sim, v, 'games');
    // The cathedral: the vassals grow more loyal
    if (isDone(w) && w.kind === 'cathedral') {
      for (const o of sim.villages) if (!o.ruin && o.people === w.people && o.loyalty !== undefined) o.loyalty = Math.min(100, o.loyalty + 3);
    }
    // The colossus: everyone thinks better of its people
    if (isDone(w) && w.kind === 'colossus') {
      for (const p of new Set(sim.villages.filter((o) => !o.ruin).map((o) => o.people))) {
        if (p === w.people) continue;
        const k = p < w.people ? `${p}|${w.people}` : `${w.people}|${p}`;
        sim.mood.set(k, Math.min(100, (sim.mood.get(k) ?? 0) + 3));
      }
    }
  }
  plan(sim);
}

/** Cities that can afford it may start a wonder nobody has finished yet. */
function plan(sim: Sim) {
  for (const v of sim.villages) {
    // Cities, and big towns
    if (v.ruin || (v.tier !== 'city' && !(v.tier === 'town' && v.members >= 30)) || v.members < 20 || sim.rand() > 0.15) continue;
    if (sim.wonders.some((w) => w.people === v.people && w.finished === undefined && !w.ruin)) continue;
    if (v.food < v.members * 2) continue;
    const age = ageIndex(sim, v.people);
    const options = WONDERS.filter(
      (k) =>
        WONDER_AGE[k] <= age &&
        !sim.wonders.some((w) => w.kind === k && (isDone(w) || (w.people === v.people && !w.ruin))) &&
        (k !== 'lighthouse' || v.buildings.some((b) => b.kind === 'harbor')),
    );
    if (!options.length) continue;
    // The newest wonders are the most tempting
    options.sort((a, b) => WONDER_AGE[b] - WONDER_AGE[a]);
    const kind = sim.rand() < 0.6 ? options[0] : options[Math.floor(sim.rand() * options.length)];
    const spot = siteFor(sim, v);
    if (!spot) continue;
    const w: Wonder = { id: sim.nextWonderId++, kind, village: v.id, people: v.people, x: spot.x, y: spot.y, started: sim.year, work: 0, needed: 1500 + 250 * WONDER_AGE[kind] };
    sim.wonders.push(w);
    const leader = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
    sim.chronicle.add({ year: sim.year, kind: 'wonderBegun', a: leader ? refOf(leader) : { id: 0, name: v.name, people: v.people }, u: wonderTag(w), v: v.name, x: spot.x + 2, y: spot.y + 2 });
  }
}

/** A free 4 × 4 patch of grass or sand 5 to 13 tiles from the square, on the city's island. */
function siteFor(sim: Sim, v: Village): { x: number; y: number } | null {
  const world = sim.world;
  const busy = (x: number, y: number) =>
    sim.villages.some(
      (o) =>
        (Math.abs(o.x - x) < 3 && Math.abs(o.y - y) < 3) ||
        o.houses.some((h) => Math.abs(h.x - x) < 2 && Math.abs(h.y - y) < 2) ||
        o.buildings.some((b) => Math.abs(b.x - x) < 2 && Math.abs(b.y - y) < 2) ||
        (o.site && Math.abs(o.site.x - x) < 2 && Math.abs(o.site.y - y) < 2),
    ) || onWonder(sim, x, y, 2);
  for (let k = 0; k < 120; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = 5 + sim.rand() * 8;
    const x0 = Math.round(v.x + Math.cos(ang) * d) - 2;
    const y0 = Math.round(v.y + Math.sin(ang) * d) - 2;
    let ok = true;
    for (let y = y0; y < y0 + WONDER_SIZE && ok; y++) {
      for (let x = x0; x < x0 + WONDER_SIZE && ok; x++) {
        const t = world.get(x, y);
        if ((t !== T.GRASS && t !== T.SAND && t !== T.FOREST) || !world.sameLand(v.x, v.y, x, y) || busy(x, y)) ok = false;
      }
    }
    if (!ok) continue;
    // Trees on the site are cleared
    for (let y = y0; y < y0 + WONDER_SIZE; y++) for (let x = x0; x < x0 + WONDER_SIZE; x++) if (world.get(x, y) === T.FOREST) world.set(x, y, T.GRASS);
    return { x: x0, y: y0 };
  }
  return null;
}

/* ---- building -------------------------------------------------------------------------- */

/**
 * Once a second: every builder of the city who is awake and not far away
 * moves the work on (half a person-second each). Those who walked over to
 * the site add their own hands on top (wonderStep).
 */
export function wonderWork(sim: Sim) {
  for (const w of sim.wonders) {
    if (w.finished !== undefined || w.ruin) continue;
    let hands = 0;
    for (const h of sim.humans) {
      if (h.village !== w.village || h.job !== 'builder' || h.asleep || h.aboard !== undefined || stage(h, sim.time) === 'child') continue;
      if (Math.hypot(h.x - w.x - 2, h.y - w.y - 2) < 25) hands++;
    }
    if (hands) wonderStep(sim, w, hands * 0.5);
  }
}

/** Work on the wonder (person-seconds); true once it is finished. */
export function wonderStep(sim: Sim, w: Wonder, dt: number): boolean {
  if (w.finished !== undefined || w.ruin) return true;
  w.work += dt * (w.short ? 0.5 : 1);
  if (sim.rand() < 0.04) sim.puff(w.x + 1 + sim.rand() * 2, w.y + 2 + sim.rand() * 2, 1, ['#d9b98b', '#b4b9c2']);
  if (w.work < w.needed) return false;
  finish(sim, w);
  return true;
}

/** How far along it is (0 … 1). */
export const progressOf = (w: Wonder) => Math.min(1, w.work / w.needed);

function finish(sim: Sim, w: Wonder) {
  w.finished = sim.year;
  const v = villageById(sim, w.village);
  // Named after the ruler (king or queen), else the city's leader; the colossus shows the greatest hero
  const k = sim.kingdoms.get(w.people);
  const king = k ? kingOf(sim, k) : undefined;
  const leader = v?.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  if (king) {
    w.ruler = king.name;
    w.rank = king.female ? 'queen' : 'king';
  } else {
    w.ruler = leader?.name ?? v?.name ?? '';
    w.rank = '';
  }
  if (w.kind === 'colossus') {
    const legend = sim.legends.find((l) => l.people === w.people) ?? sim.legends[0];
    const hero = legend ? sim.registry.get(legend.id) : undefined;
    const who = hero ? { name: hero.name, people: hero.people, female: hero.female } : (king ?? leader) ? { name: (king ?? leader)!.name, people: w.people, female: (king ?? leader)!.female } : undefined;
    if (who) {
      w.hero = who;
      w.ruler = who.name;
      w.rank = '';
    }
  }
  const x = w.x + 2;
  const y = w.y + 2;
  sim.puff(x, y - 1, 30, ['#ffe066', '#ffffff', '#ff5da2', '#4d8dff', '#3ddc84']);
  sim.chronicle.add({ year: sim.year, kind: 'wonderBuilt', a: king ? refOf(king) : leader ? refOf(leader) : { id: 0, name: v?.name ?? '', people: w.people }, u: wonderTag(w), v: v?.name, p: w.people, x, y });
  celebrate(sim, v, 'wonder');
  // The lighthouse lifts the fog far around it
  if (w.kind === 'lighthouse') sim.world.reveal(x, y, 45);
  // The others building the same wonder are left with a ruin, and are cross with the winners
  for (const o of sim.wonders) {
    if (o === w || o.kind !== w.kind || o.finished !== undefined || o.ruin) continue;
    giveUp(sim, o, villageById(sim, o.village), w.people);
  }
}

function giveUp(sim: Sim, w: Wonder, v: Village | undefined, winner?: People) {
  w.ruin = true;
  w.finished = sim.year;
  if (winner && winner !== w.people) {
    const k = winner < w.people ? `${winner}|${w.people}` : `${w.people}|${winner}`;
    sim.mood.set(k, Math.max(-100, (sim.mood.get(k) ?? 0) - 20));
  }
  sim.chronicle.add({ year: sim.year, kind: 'wonderLost', a: { id: 0, name: v?.name ?? '', people: w.people }, u: wonderTag(w), v: v?.name, q: winner, x: w.x + 2, y: w.y + 2 });
}

/* ---- effects (read by the sim) ---------------------------------------------------------- */

/** Research factor of a people: Great Library and Observatory. */
export const researchBonus = (sim: Sim, p: People) => (owns(sim, p, 'library') ? 1.5 : 1) * (owns(sim, p, 'observatory') ? 1.35 : 1);

/** Food factor (Hanging Gardens). */
export const foodBonus = (sim: Sim, p: People) => (owns(sim, p, 'gardens') ? 1.3 : 1);

/** Lifespan factor (Hanging Gardens). */
export const lifeBonus = (sim: Sim, p: People) => (owns(sim, p, 'gardens') ? 1.1 : 1);

/** Brawl factor (Colosseum: half as many). */
export const brawlFactor = (sim: Sim, p: People) => (owns(sim, p, 'colosseum') ? 0.5 : 1);

/** Damage factor of soldiers in war (Colosseum). */
export const drillFactor = (sim: Sim, p: People) => (owns(sim, p, 'colosseum') ? 1.15 : 1);

/** Great Wall: can these attackers take a place of this people? Only with catapults or cannons among them. */
export function wallHolds(sim: Sim, v: Village, attackers: Human[]) {
  if (!owns(sim, v.people, 'wall')) return false;
  return !attackers.some((h) => h.unit === 'catapult' || h.unit === 'cannon') && !sim.humans.some((h) => (h.unit === 'catapult' || h.unit === 'cannon') && h.people !== v.people && Math.hypot(h.x - v.x, h.y - v.y) < 14);
}

/** Workers wanted on a wonder (jobs.ts): a sixth of the grown-ups. */
export function wonderBuilders(sim: Sim, v: Village, adults: number) {
  return projectOf(sim, v) ? Math.max(2, adults / 6) : 0;
}
