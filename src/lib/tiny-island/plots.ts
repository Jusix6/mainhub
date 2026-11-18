/**
 * Plots (Update 2, phase D). Only scheming or ambitious grown-ups with an
 * intelligence of 6 or more plot, and nobody sees it: a plot shows up in the
 * chronicle only when it succeeds or comes to light, two to five years later.
 *
 *  - spying (in a war): a spy steals research from the enemy; caught: banished
 *  - sabotage: the stores (or the building site) of a rival place burn;
 *    caught: a feud with that place (same people) or a much worse mood
 *  - coup: an ambitious one takes over from their leader or king;
 *    caught: banished, and the whole family falls into disgrace
 *  - betrayal: a ruler whose ally is at war switches sides; everyone trusts
 *    that people less; caught: the ally is cross
 *  - bribery: a ruler pays a vassal of another kingdom to turn against its
 *    king (it will rise up soon); caught: war with that kingdom
 *
 * Success: 30 % plus 7 % per point of intelligence over 6 (+10 % scheming);
 * otherwise it comes to light, or (one time in five) it is quietly dropped.
 */
import { ageOf, has, stage, stat, type Human, type People } from './agents';
import { techOf } from './inventions';
import { kingOf, loyaltyOf, usurp } from './kingdoms';
import type { Sim } from './sim';
import { refOf, story } from './social';
import type { Village } from './villages';
import { allied, declareWar, enemiesOf, feudKey, makePeace, pairKey, shiftMood, startFeud, warBetween } from './war';

export type PlotKind = 'spy' | 'sabotage' | 'coup' | 'betrayal' | 'bribe';

export interface Plot {
  id: number;
  kind: PlotKind;
  by: number;
  /** The place it is aimed at, or (betrayal) the ally. */
  target: number;
  people?: People;
  /** Coup: against the king instead of the village leader. */
  throne?: boolean;
  ends: number;
}

const YEAR = 30;

const villageById = (sim: Sim, id: number | undefined) => (id === undefined ? undefined : sim.villages.find((v) => v.id === id));

/** Can this one plot at all? */
const schemer = (h: Human, sim: Sim) => (has(h, 'scheming') || has(h, 'ambitious')) && stat(h, 'intelligence') >= 6 && stage(h, sim.time) !== 'child' && ageOf(h, sim.time) >= 18;

/** The ruler of a people: its king, else the leader of its biggest place. */
function rulerOf(sim: Sim, p: People): Human | undefined {
  const k = sim.kingdoms.get(p);
  const king = k && kingOf(sim, k);
  if (king) return king;
  const v = sim.villages.filter((x) => !x.ruin && x.people === p).sort((a, b) => b.members - a.members)[0];
  return v?.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
}

/** Once a year: plots come to an end, new ones are hatched. */
export function plotTick(sim: Sim) {
  if (sim.plotYear === sim.year) return;
  sim.plotYear = sim.year;
  for (const p of [...sim.plots]) if (sim.time >= p.ends) resolve(sim, p);
  const busy = new Set(sim.plots.map((p) => p.by));
  for (const h of sim.humans) {
    if (busy.has(h.id) || h.village === undefined || !schemer(h, sim) || sim.rand() > 0.015) continue;
    const plot = hatch(sim, h);
    if (plot) sim.plots.push(plot);
  }
}

/** Picks a plot that fits the situation, or none. */
function hatch(sim: Sim, h: Human): Plot | null {
  const home = villageById(sim, h.village)!;
  const ends = sim.time + (2 + sim.rand() * 3) * YEAR;
  const base = { id: sim.nextPlotId++, by: h.id, ends };
  const options: Plot[] = [];
  const ruler = rulerOf(sim, h.people) === h;
  // Coup: the ambitious want the top
  if (has(h, 'ambitious')) {
    const k = sim.kingdoms.get(h.people);
    if (k && k.capital === home.id && k.king !== h.id && k.king !== undefined) options.push({ ...base, kind: 'coup', target: home.id, throne: true });
    else if (home.leader !== undefined && home.leader !== h.id) options.push({ ...base, kind: 'coup', target: home.id });
  }
  // Spying on an enemy in a war
  const foes = sim.villages.filter((v) => !v.ruin && v.people !== h.people && warBetween(sim, h.people, v.people));
  if (foes.length) {
    const t = foes.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
    options.push({ ...base, kind: 'spy', target: t.id, people: t.people });
  }
  // Sabotage a rival place
  if (has(h, 'scheming')) {
    const rival = sim.villages.find(
      (v) => !v.ruin && v !== home && (v.people === h.people ? (sim.vmood.get(feudKey(v.id, home.id)) ?? 0) < -30 || sim.wars.has(feudKey(v.id, home.id)) : !!warBetween(sim, h.people, v.people)),
    );
    if (rival) options.push({ ...base, kind: 'sabotage', target: rival.id, people: rival.people });
  }
  if (ruler) {
    // Betrayal: an ally at war, and the enemy is tempting
    for (const [key] of [...sim.alliances].map((k) => [k] as const)) {
      const [a, b] = key.split('|') as [People, People];
      const ally = a === h.people ? b : b === h.people ? a : null;
      if (!ally || !enemiesOf(sim, ally).length) continue;
      const capital = sim.villages.find((v) => !v.ruin && v.people === ally);
      if (capital) options.push({ ...base, kind: 'betrayal', target: capital.id, people: ally });
    }
    // Bribery: a vassal of another kingdom
    for (const k of sim.kingdoms.values()) {
      if (k.people === h.people || allied(sim, k.people, h.people)) continue;
      const vassal = sim.villages.find((v) => !v.ruin && !v.free && v.people === k.people && v.id !== k.capital && loyaltyOf(v) < 60);
      if (vassal) options.push({ ...base, kind: 'bribe', target: vassal.id, people: k.people });
    }
  }
  if (!options.length) return null;
  return options[Math.floor(sim.rand() * options.length)];
}

function resolve(sim: Sim, p: Plot) {
  sim.plots = sim.plots.filter((x) => x !== p);
  const h = sim.byId(p.by) as Human | undefined;
  const target = villageById(sim, p.target);
  if (!h || h.village === undefined || !target || target.ruin) return;
  const chance = 0.3 + (stat(h, 'intelligence') - 6) * 0.07 + (has(h, 'scheming') ? 0.1 : 0);
  const r = sim.rand();
  if (r < chance) succeed(sim, p, h, target);
  else if (r < chance + (1 - chance) * 0.8) caught(sim, p, h, target);
}

function entry(sim: Sim, kind: Parameters<Sim['chronicle']['add']>[0]['kind'], h: Human, v: Village, extra: object = {}) {
  sim.chronicle.add({ year: sim.year, kind, a: refOf(h), v: v.name, p: v.people, x: v.x, y: v.y, ...extra });
}

function succeed(sim: Sim, p: Plot, h: Human, v: Village) {
  switch (p.kind) {
    case 'spy': {
      techOf(sim, h.people).progress += 40;
      entry(sim, 'plotSpy', h, v);
      break;
    }
    case 'sabotage': {
      v.food = Math.floor(v.food / 2);
      v.wood = Math.floor(v.wood / 2);
      if (v.site) v.site.done = 0;
      sim.puff(v.x + 0.5, v.y - 0.3, 18, ['#ff8a1e', '#ffe066', '#5a5a5a']);
      entry(sim, 'plotSabotage', h, v);
      break;
    }
    case 'coup': {
      if (p.throne) {
        const k = sim.kingdoms.get(h.people);
        const old = k && kingOf(sim, k);
        if (!k || !old) return;
        entry(sim, 'coup', h, v, { b: refOf(old) });
        usurp(sim, k, h);
      } else {
        const old = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
        v.leader = h.id;
        story(h, sim, 'leader', v.name);
        entry(sim, 'coup', h, v, { b: old ? refOf(old) : undefined });
      }
      break;
    }
    case 'betrayal': {
      const ally = p.people!;
      sim.alliances.delete(pairKey(h.people, ally));
      for (const foe of enemiesOf(sim, ally)) makePeace(sim, h.people, foe);
      declareWar(sim, h.people, ally);
      for (const other of new Set(sim.villages.map((x) => x.people))) if (other !== h.people) shiftMood(sim, h.people, other, -20);
      entry(sim, 'betrayal', h, v, { q: ally });
      break;
    }
    case 'bribe': {
      const home = villageById(sim, h.village);
      if (home) {
        const gold = Math.min(15, Math.floor(home.food / 3));
        home.food -= gold;
        v.food += gold;
      }
      v.loyalty = 10;
      entry(sim, 'bribe', h, v);
      break;
    }
  }
}

function caught(sim: Sim, p: Plot, h: Human, v: Village) {
  const home = villageById(sim, h.village);
  switch (p.kind) {
    case 'spy':
      shiftMood(sim, h.people, v.people, -10);
      banish(sim, h);
      entry(sim, 'plotSpyCaught', h, v);
      break;
    case 'sabotage':
      if (v.people === h.people && home && !sim.wars.has(feudKey(v.id, home.id))) {
        startFeud(sim, home, v, { year: sim.year, kind: 'plotSabotageCaught', a: refOf(h), v: v.name, w: home.name, p: v.people, x: v.x, y: v.y });
      } else {
        shiftMood(sim, h.people, v.people, -20);
        entry(sim, 'plotSabotageCaught', h, v, { w: home?.name });
      }
      break;
    case 'coup': {
      const k = sim.kingdoms.get(h.people);
      const victim = p.throne && k ? kingOf(sim, k) : v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
      entry(sim, 'coupCaught', h, v, { b: victim ? refOf(victim) : undefined, w: h.surname });
      // The family falls into disgrace
      if (h.surname) {
        for (const o of sim.humans) {
          if (o.surname !== h.surname || o === h) continue;
          for (const n of sim.humans) if (n.village === o.village && n !== o) n.rel.set(o.id, Math.min(n.rel.get(o.id) ?? 0, -25));
        }
      }
      banish(sim, h);
      break;
    }
    case 'betrayal':
      shiftMood(sim, h.people, p.people!, -15);
      entry(sim, 'betrayalCaught', h, v, { q: p.people });
      break;
    case 'bribe':
      entry(sim, 'bribeCaught', h, v);
      if (!warBetween(sim, h.people, v.people)) declareWar(sim, h.people, v.people);
      break;
  }
}

/** Sent away: no village, no house, no job, no office. */
function banish(sim: Sim, h: Human) {
  const v = villageById(sim, h.village);
  if (v?.leader === h.id) v.leader = undefined;
  for (const house of sim.villages.flatMap((x) => x.houses)) house.owners = house.owners.filter((id) => id !== h.id);
  h.village = undefined;
  h.job = undefined;
  h.home = null;
  story(h, sim, 'banished', v?.name);
}
