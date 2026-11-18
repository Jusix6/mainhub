/**
 * Colonies, gold, spices and the islanders (Update 2, phase G). Once a year:
 *
 *  - a colony (founded by a settler ship, ships.ts) pays its mother town a
 *    tenth of its stores and half of its gold and spices. Its loyalty
 *    (0 … 100, starts at 70) drops by 1 a year, 1 more when it is big (over
 *    25 people) and 1 more while its people is at war; trade ships raise it
 *    by 4 a visit. Under 25, with 15 people or
 *    more, it declares its independence: a war of independence (a feud).
 *    If the mother wins, it stays a colony; otherwise it is free.
 *  - places near gold or spice tiles (9 tiles around the square) gain one of
 *    it per tile. Gold pays scholars (research +15 a piece), spices are sold
 *    for food (+4 a piece); both go into the place's treasury for the panel.
 *  - the islanders, a small people living on one of the far islands, join a
 *    people that trades with them as a good friend (mood 40 or more), or that
 *    settles on their island and gets along with them (mood
 *    over -20, no war, for four years running). Else it may come to war, and a
 *    conquered islander place joins the winners the usual way.
 */
import { stage, type Human, type People } from './agents';
import { techOf } from './inventions';
import type { Sim } from './sim';
import { refOf, story } from './social';
import type { Village } from './villages';
import { feudKey, moodOf, startFeud, warBetween } from './war';
import { DEPOSIT } from './world';

const byId = (sim: Sim, id: number | undefined) => (id === undefined ? undefined : sim.villages.find((v) => v.id === id));

export function colonyTick(sim: Sim) {
  if (sim.colonyYear === sim.year) return;
  sim.colonyYear = sim.year;
  for (const v of sim.villages) {
    if (v.ruin) continue;
    riches(sim, v);
    if (v.colonyOf !== undefined) colony(sim, v);
  }
  islanders(sim);
}

/** Gold and spice tiles around the square. */
function riches(sim: Sim, v: Village) {
  const w = sim.world;
  let gold = 0;
  let spice = 0;
  for (let y = v.y - 9; y <= v.y + 9; y++) {
    for (let x = v.x - 9; x <= v.x + 9; x++) {
      if (!w.inside(x, y)) continue;
      const d = w.deposit[y * w.w + x];
      if (d === DEPOSIT.GOLD) gold++;
      else if (d === DEPOSIT.SPICE) spice++;
    }
  }
  if (!gold && !spice) return;
  const leader = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  const who = leader ? refOf(leader) : { id: 0, name: v.name, people: v.people };
  if (gold && !v.goldFound) {
    v.goldFound = true;
    sim.chronicle.add({ year: sim.year, kind: 'goldFound', a: who, v: v.name, x: v.x, y: v.y });
  }
  if (spice && !v.spiceFound) {
    v.spiceFound = true;
    sim.chronicle.add({ year: sim.year, kind: 'spiceFound', a: who, v: v.name, x: v.x, y: v.y });
  }
  v.gold = (v.gold ?? 0) + gold;
  v.spice = (v.spice ?? 0) + spice;
  techOf(sim, v.people).progress += gold * 15;
  v.food += spice * 4;
}

function colony(sim: Sim, v: Village) {
  const mother = byId(sim, v.colonyOf);
  // The mother is gone or went over to another people: the colony is on its own
  if (!mother || mother.ruin || mother.people !== v.people) {
    v.colonyOf = undefined;
    return;
  }
  // Tribute
  for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
    const n = Math.floor(v[res] / 10);
    v[res] -= n;
    mother[res] += n;
  }
  for (const res of ['gold', 'spice'] as const) {
    const n = Math.floor((v[res] ?? 0) / 2);
    v[res] = (v[res] ?? 0) - n;
    mother[res] = (mother[res] ?? 0) + n;
  }
  // Loyalty
  let loyalty = (v.colonyLoyalty ?? 70) - 1;
  if (v.members > 25) loyalty -= 1;
  if ([...sim.wars.values()].some((w) => w.va === undefined && (w.a === v.people || w.b === v.people))) loyalty -= 1;
  v.colonyLoyalty = Math.max(0, Math.min(100, loyalty));
  if (v.colonyLoyalty >= 25 || v.members < 15 || sim.wars.has(feudKey(v.id, mother.id))) return;
  // Independence!
  const leader = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  v.colonyOf = undefined;
  v.rebelOf = mother.id;
  startFeud(sim, v, mother, {
    year: sim.year,
    kind: 'independence',
    a: leader ? refOf(leader) : { id: 0, name: v.name, people: v.people },
    v: v.name,
    w: mother.name,
    x: v.x,
    y: v.y,
  });
}

/** A feud between a free colony and its old mother is over (war.ts): back under the mother, or free for good. */
export function independenceOver(sim: Sim, a: Village | undefined, b: Village | undefined, winner: Village | undefined) {
  for (const [rebel, mother] of [
    [a, b],
    [b, a],
  ] as const) {
    if (!rebel || !mother || rebel.rebelOf !== mother.id) continue;
    rebel.rebelOf = undefined;
    if (winner === mother) {
      rebel.colonyOf = mother.id;
      rebel.colonyLoyalty = 55;
      sim.chronicle.add({ year: sim.year, kind: 'colonyBack', a: { id: 0, name: rebel.name, people: rebel.people }, v: rebel.name, w: mother.name, x: rebel.x, y: rebel.y });
    } else {
      sim.chronicle.add({ year: sim.year, kind: 'independent', a: { id: 0, name: rebel.name, people: rebel.people }, v: rebel.name, w: mother.name, x: rebel.x, y: rebel.y });
    }
  }
}

/** The islanders join a friendly people that settled on their island. */
function islanders(sim: Sim) {
  const world = sim.world;
  for (const v of sim.villages) {
    if (v.ruin || v.people !== 'islanders') continue;
    const land = world.landAt(v.x, v.y);
    // Neighbours on their island who are not hostile, or good friends from over the sea (trade ships lift the mood)
    const neighbours = sim.villages.filter((o) => !o.ruin && o.people !== 'islanders' && world.landAt(o.x, o.y) === land).map((o) => o.people);
    const friends = [...new Set(sim.villages.filter((o) => !o.ruin && o.people !== 'islanders').map((o) => o.people))].filter((p) => moodOf(sim, p, 'islanders') >= 40);
    const friend = [...neighbours.filter((p) => moodOf(sim, p, 'islanders') > -20), ...friends].find((p) => !warBetween(sim, p, 'islanders'));
    if (!friend) {
      v.joinWatch = 0;
      continue;
    }
    v.joinWatch = (v.joinWatch ?? 0) + 1;
    if (v.joinWatch >= 4) join(sim, v, friend);
  }
}

function join(sim: Sim, v: Village, p: People) {
  v.people = p;
  v.joinWatch = undefined;
  for (const h of sim.humans) {
    if (h.village !== v.id) continue;
    h.people = p;
    sim.applyHealth(h);
    if (stage(h, sim.time) !== 'child') story(h, sim, 'joinedPeople', v.name);
    const r = sim.registry.get(h.id);
    if (r) r.people = p;
  }
  sim.puff(v.x + 0.5, v.y, 12, ['#ffffff', '#ffe066', '#f08c2e']);
  sim.chronicle.add({ year: sim.year, kind: 'islandersJoin', a: { id: 0, name: v.name, people: p }, v: v.name, p, x: v.x, y: v.y });
}
