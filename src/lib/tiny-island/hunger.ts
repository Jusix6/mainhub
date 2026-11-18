/**
 * Hunger (Update 2, phase A). Every place knows for how many years its store
 * will feed everyone (`foodYears`). Below two years more people farm and
 * fish (jobs.ts), below one year the store hands out one portion at a time
 * (ai.ts) and, if many are hungry, nobody has children (`famished`, social.ts).
 *
 * Once a second: a place with plenty (more than three years) sends grain to
 * the nearest hungry place of its own people or of an ally, and in a real
 * famine a group of young people leaves for a place with more to eat.
 */
import { stage } from './agents';
import { BALANCE } from './balance';
import type { Sim } from './sim';
import type { Village } from './villages';
import { emigrate } from './villages';
import { allied, isEnemy } from './war';

const B = BALANCE.food;
const YEAR = 30;

/** How many years the store feeds everyone in the place. */
export function foodYears(v: Village) {
  return v.food / Math.max(1, v.members * B.perPersonYear);
}

/**
 * A real shortage: under a year of food in store, at least six people, and a
 * quarter of them hungry. Then nobody has children (social.ts). The store
 * alone is not enough: young places live mostly from berries and fish.
 */
export function famished(v: Village, sim: Sim) {
  if (v.members < 6 || foodYears(v) >= B.shortYears) return false;
  const people = sim.humans.filter((h) => h.village === v.id);
  return people.filter((h) => h.hunger < 40).length >= people.length / 4;
}

export function hungerTick(sim: Sim) {
  for (const v of sim.villages) {
    if (v.ruin || v.members === 0) continue;
    const years = foodYears(v);
    if (years < B.shortYears && (v.aidAt ?? 0) <= sim.time) {
      v.aidAt = sim.time + B.aidCooldown * YEAR;
      sendAid(sim, v);
    }
    if (foodYears(v) < B.famineYears && v.members >= 8 && (v.famineAt ?? 0) <= sim.time) {
      const starving = sim.humans.filter((h) => h.village === v.id && h.hunger < 25 && stage(h, sim.time) !== 'child').length;
      if (starving >= 3) {
        v.famineAt = sim.time + B.famineCooldown * YEAR;
        emigrate(v, sim);
      }
    }
  }
}

/** The nearest place of the same people (or an ally) with plenty sends what it can spare. */
function sendAid(sim: Sim, v: Village) {
  let donor: Village | null = null;
  let best = Infinity;
  for (const o of sim.villages) {
    if (o === v || o.ruin || foodYears(o) <= B.aidSurplusYears) continue;
    const friend = o.people === v.people ? !isEnemy(sim, { people: o.people, village: o.id }, { people: v.people, village: v.id }) : allied(sim, o.people, v.people);
    if (!friend) continue;
    const d = Math.hypot(o.x - v.x, o.y - v.y);
    if (d < best) {
      best = d;
      donor = o;
    }
  }
  if (!donor) return;
  const spare = donor.food - donor.members * B.perPersonYear * 2;
  const want = v.members * B.perPersonYear * 1.5 - v.food;
  const amount = Math.floor(Math.min(spare, want));
  if (amount <= 0) return;
  donor.food -= amount;
  v.food += amount;
  sim.puff(v.x + 0.5, v.y - 0.3, 6, ['#ffe066', '#e8c26a', '#ffffff']);
  if (amount >= B.aidMin) {
    sim.chronicle.add({ year: sim.year, kind: 'aid', a: { id: 0, name: donor.name, people: donor.people }, v: donor.name, w: v.name, n: amount, x: v.x, y: v.y });
  }
}
