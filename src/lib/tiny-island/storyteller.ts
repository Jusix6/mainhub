/**
 * The storyteller (Update 2, phase A): when nothing big has happened for 15
 * years, the island gets a push. One of these, picked at random among the
 * ones that fit right now:
 *
 *  - a child of destiny is born (brave and wise) to a couple in a village
 *  - a stranger washes ashore near a village, sometimes of a people that is
 *    not on the island yet
 *  - a pretender in a vassal place claims the throne and rises up (kingdoms)
 *  - miners strike a rich vein of ore
 */
import { ageOf, PLAYABLE, stage, type Human } from './agents';
import { BALANCE } from './balance';
import type { ChronicleEntry } from './chronicle';
import type { Sim } from './sim';
import { refOf, story } from './social';
import { T } from './world';
import type { Village } from './villages';
import { feudKey, startFeud } from './war';

const B = BALANCE.storyteller;

/** Chronicle kinds that count as something big happening. */
const BIG = new Set<ChronicleEntry['kind']>([
  'war',
  'feud',
  'revolt',
  'conquest',
  'kingdom',
  'newDynasty',
  'overthrown',
  'invention',
  'breach',
  'battle',
  'legend',
  'tier',
  'alliance',
  'omen',
]);

/** Once a second: remember the last big event; after a long quiet spell, make one. */
export function storyTick(sim: Sim) {
  const last = sim.chronicle.entries.find((e) => BIG.has(e.kind));
  const lastYear = Math.max(last?.year ?? 1, sim.quietSince);
  if (sim.year - lastYear < B.quietYears) return;
  sim.quietSince = sim.year;
  const places = sim.villages.filter((v) => !v.ruin);
  if (!places.length) return;
  const options: (() => boolean)[] = [() => heroBorn(sim, places), () => stranger(sim, places), () => claimant(sim), () => oreFind(sim, places)];
  // Try them in a random order until one fits
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(sim.rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  for (const o of options) if (o()) return;
}

const pick = <T>(sim: Sim, list: T[]) => list[Math.floor(sim.rand() * list.length)];

function omen(sim: Sim, e: Omit<ChronicleEntry, 'id' | 'kind' | 'year'>) {
  sim.chronicle.add({ year: sim.year, kind: 'omen', ...e });
}

function heroBorn(sim: Sim, places: Village[]): boolean {
  const mothers = sim.humans.filter((h) => {
    if (!h.female || h.partner === undefined || h.village === undefined) return false;
    const age = ageOf(h, sim.time);
    const p = sim.byId(h.partner) as Human | undefined;
    return age >= 18 && age <= 45 && !!p && !p.female && p.village === h.village;
  });
  if (!mothers.length) return false;
  const mother = pick(sim, mothers);
  const father = sim.byId(mother.partner!) as Human;
  const baby = sim.addHuman(Math.floor(mother.x), Math.floor(mother.y), sim.rand() < 0.5 ? mother.people : father.people, sim.rand() < 0.5, 0, {
    parents: [mother, father],
    traits: ['brave', 'wise'],
  });
  baby.hunger = 100;
  mother.lastBirth = sim.time;
  story(mother, sim, 'child', baby.name);
  story(father, sim, 'child', baby.name);
  sim.favorites.add(baby.id);
  sim.puff(mother.x, mother.y - 0.8, 16, ['#ffe066', '#ffffff', '#4d8dff']);
  const v = places.find((x) => x.id === mother.village);
  omen(sim, { a: refOf(baby), b: refOf(mother), c: refOf(father), v: v?.name, w: 'hero', x: mother.x, y: mother.y });
  return true;
}

function stranger(sim: Sim, places: Village[]): boolean {
  const v = pick(sim, places);
  const w = sim.world;
  // A beach close to the place
  for (let k = 0; k < 80; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = 4 + sim.rand() * 20;
    const x = Math.round(v.x + Math.cos(ang) * d);
    const y = Math.round(v.y + Math.sin(ang) * d);
    if (w.get(x, y) !== T.SAND) continue;
    // Now and then from a people that does not live here yet
    const missing = PLAYABLE.filter((p) => !sim.humans.some((h) => h.people === p));
    const people = missing.length && sim.rand() < 0.4 ? pick(sim, missing) : pick(sim, [...PLAYABLE]);
    const h = sim.addHuman(x, y, people, sim.rand() < 0.5, 20 + sim.rand() * 15);
    sim.puff(x + 0.5, y, 10, ['#ffffff', '#9fd3ff']);
    omen(sim, { a: refOf(h), v: v.name, w: 'stranger', p: people, x, y });
    return true;
  }
  return false;
}

function claimant(sim: Sim): boolean {
  for (const k of sim.kingdoms.values()) {
    const capital = sim.villages.find((v) => v.id === k.capital);
    if (!capital) continue;
    const vassals = sim.villages.filter((v) => !v.ruin && !v.free && v.people === k.people && v.id !== k.capital && v.members >= 6 && !sim.wars.has(feudKey(v.id, capital.id)));
    if (!vassals.length) continue;
    const v = pick(sim, vassals);
    const pretender =
      (v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined) ??
      sim.humans.find((h) => h.village === v.id && stage(h, sim.time) === 'adult');
    if (!pretender) continue;
    v.free = true;
    v.loyalty = 10;
    startFeud(sim, v, capital, { year: sim.year, kind: 'omen', a: refOf(pretender), v: v.name, p: k.people, w: 'claimant', x: v.x, y: v.y });
    return true;
  }
  return false;
}

function oreFind(sim: Sim, places: Village[]): boolean {
  const rocky = places.filter((v) => v.rock);
  if (!rocky.length) return false;
  const v = pick(sim, rocky);
  v.ore += B.oreFind;
  sim.puff(v.x + 0.5, v.y - 0.3, 12, ['#ffd36b', '#ffffff', '#6c727d']);
  omen(sim, { a: { id: 0, name: v.name, people: v.people }, v: v.name, w: 'ore', n: B.oreFind, x: v.x, y: v.y });
  return true;
}
