/**
 * Pens and herds (Update 3, phase C). Once a people knows agriculture its
 * places keep animals instead of hunting them out:
 *
 * - A place builds a pen (5 × 5, a wooden fence; with masonry a stone wall
 *   that keeps wolves out) outside its houses: a pasture for sheep, a coop
 *   for chickens, a cow pasture or a paddock for horses.
 * - A new job, the shepherd, catches wild animals of that kind (never the
 *   last three of a kind) and brings them in, chases wolves off a wooden pen
 *   and otherwise tends the animals.
 * - Once a year the animals in a pen have young up to `BALANCE.pens.limit`;
 *   more than that are slaughtered for the store. Hens lay eggs, cows give
 *   milk, sheep wool (food and a little trade), horses go to the stable for
 *   riders. A full pen makes the place build another one.
 * - Wild animals stay wild; penned ones are not hunted by people.
 */
import { BALANCE } from './balance';
import { goTo, tileOf, type Animal, type Human } from './agents';
import type { Sim } from './sim';
import { hasBuilding, type Building, type PenAnimal } from './town';
import type { Village } from './villages';
import { knows } from './inventions';

const P = BALANCE.pens;

/** The pen's id: the tile index of its middle. */
export const penId = (sim: Sim, b: Building) => b.y * sim.world.w + b.x;

export const pensOf = (v: Village) => v.buildings.filter((b) => b.kind === 'pen');

/** Animals living in a pen. */
export const penned = (sim: Sim, b: Building) => {
  const id = penId(sim, b);
  return sim.animals.filter((a) => a.pen === id && !a.dead);
};

/** Wild animals of a kind (not in any pen). */
const wild = (sim: Sim, kind: PenAnimal) => sim.animals.filter((a) => a.kind === kind && a.pen === undefined && !a.dead);

/**
 * The next pen a place wants (for `plan` in villages.ts): one for every 30
 * people (at most four), a kind it has none of yet whose wild animals live
 * on its land, else another one of a kind whose pens are full.
 */
export function wantedPen(v: Village, sim: Sim): PenAnimal | null {
  if (!knows(sim, v.people, 'agriculture') || v.members < P.minPeople) return null;
  const pens = pensOf(v);
  if (pens.length >= Math.min(P.maxPens, 1 + Math.floor(v.members / 30))) return null;
  // Only once the pens there are have animals in them
  if (pens.some((b) => penned(sim, b).length < 2)) return null;
  const near = (kind: PenAnimal) => wild(sim, kind).filter((a) => sim.world.sameLand(a.x, a.y, v.x, v.y) && Math.hypot(a.x - v.x, a.y - v.y) < 45).length > 3;
  for (const kind of P.order as readonly PenAnimal[]) if (!pens.some((b) => b.animal === kind) && near(kind)) return kind;
  const full = pens.find((b) => b.animal && penned(sim, b).length >= P.limit);
  return full?.animal ?? null;
}

/** Once a year: young ones, slaughter, eggs, milk, wool, horses for the stable, stone walls. */
export function penTick(sim: Sim) {
  if (sim.year === sim.penYear) return;
  sim.penYear = sim.year;
  for (const v of sim.villages) {
    if (v.ruin || v.merged) continue;
    for (const b of pensOf(v)) {
      if (!b.animal) continue;
      const herd = penned(sim, b);
      const adults = herd.filter((a) => sim.time - a.born > 30);
      // Young ones, one for every two grown animals, while there is room
      for (let k = 0; k + 1 < adults.length && herd.length < P.limit; k += 2) {
        const young = sim.addAnimal(b.animal, b.x + Math.round(sim.rand() * 2 - 1), b.y + Math.round(sim.rand() * 2 - 1), 0);
        young.pen = penId(sim, b);
        herd.push(young);
      }
      // Too many: some go to the butcher (horses to the stable)
      for (const a of herd.slice(P.limit)) {
        if (b.animal === 'horse') v.horses = Math.min(P.stableMax, (v.horses ?? 0) + 1);
        else v.food += P.meat[b.animal];
        sim.kill(a, 'slaughter');
      }
      // What the animals give every year
      const kept = Math.min(herd.length, P.limit);
      if (b.animal === 'horse') {
        if (kept >= 2) v.horses = Math.min(P.stableMax, (v.horses ?? 0) + 1);
      } else v.food += kept * P.yield[b.animal];
      // A stone wall once they can build one: no wolf gets in
      if (!b.stone && knows(sim, v.people, 'masonry') && v.stone >= P.wallStone) {
        b.stone = true;
        v.stone -= P.wallStone;
      }
    }
  }
  // Animals of a pen that is gone run wild again
  const pens = new Set(sim.villages.filter((v) => !v.ruin).flatMap((v) => pensOf(v).map((b) => penId(sim, b))));
  for (const a of sim.animals) if (a.pen !== undefined && !pens.has(a.pen)) a.pen = undefined;
}

/** Is this animal safe from wolves (a pen with a stone wall)? */
export function walled(sim: Sim, a: Animal) {
  if (a.pen === undefined) return false;
  const x = a.pen % sim.world.w;
  const y = Math.floor(a.pen / sim.world.w);
  return sim.villages.some((v) => v.buildings.some((b) => b.kind === 'pen' && b.x === x && b.y === y && b.stone));
}

/** The middle of an animal's pen (tiles), if it has one. */
export function penHome(sim: Sim, a: Animal): { x: number; y: number } | null {
  if (a.pen === undefined) return null;
  return { x: a.pen % sim.world.w, y: Math.floor(a.pen / sim.world.w) };
}

/** How badly a shepherd is needed: a pen to fill or a wolf at a wooden fence. */
export function shepherdUrge(v: Village, sim: Sim): number {
  for (const b of pensOf(v)) {
    if (!b.stone && sim.nearest(b.x + 0.5, b.y + 0.5, 6, (o) => o.kind === 'wolf')) return 60;
    if (b.animal && penned(sim, b).length < 2 && wild(sim, b.animal).length > 3) return 35;
  }
  return pensOf(v).length ? 8 : 0;
}

/**
 * The shepherd's work (ai.ts calls it with the task helpers): chase a wolf
 * off a wooden pen, catch an animal for a pen that needs some, or tend the
 * animals for a while.
 */
export function herdWork(h: Human, sim: Sim, v: Village, task: (kind: 'fight' | 'herd', x: number, y: number, extra: { target?: number; work?: number; until: number }) => void): boolean {
  const pens = pensOf(v);
  if (!pens.length) return false;
  for (const b of pens) {
    if (b.stone) continue;
    const wolf = sim.nearest(b.x + 0.5, b.y + 0.5, 6, (o) => o.kind === 'wolf');
    if (wolf) {
      const t = tileOf(wolf);
      task('fight', t.x, t.y, { target: wolf.id, until: sim.time + 12 });
      return goTo(h, sim.world, t.x, t.y);
    }
  }
  for (const b of pens) {
    if (!b.animal || penned(sim, b).length >= 2 || wild(sim, b.animal).length <= 3) continue;
    const kind = b.animal;
    const a = sim.nearest(h.x, h.y, 40, (o) => o.kind === kind && (o as Animal).pen === undefined && sim.world.sameLand(o.x, o.y, v.x, v.y)) as Animal | null;
    if (!a) continue;
    const t = tileOf(a);
    task('herd', t.x, t.y, { target: a.id, until: sim.time + 30 });
    return goTo(h, sim.world, t.x, t.y);
  }
  // Tending: a while at a pen
  const b = pens[Math.floor(sim.rand() * pens.length)];
  const x = b.x + (sim.rand() < 0.5 ? -3 : 3);
  task('herd', x, b.y, { work: 3 + sim.rand() * 3, until: sim.time + 20 });
  return goTo(h, sim.world, x, b.y);
}

/** The shepherd reached the animal: it belongs to the pen from now on (and walks there by itself). */
export function catchAnimal(sim: Sim, v: Village, a: Animal) {
  const b = pensOf(v).find((p) => p.animal === a.kind && penned(sim, p).length < P.limit);
  if (!b) return;
  a.pen = penId(sim, b);
  a.task = null;
  a.path = null;
}

export const keepsPens = (v: Village) => hasBuilding(v, 'pen');
