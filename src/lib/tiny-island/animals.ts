/**
 * Animal behaviour, simpler than people:
 *  - sheep and chickens graze and wander, run from wolves and hunters, and
 *    have young now and then (up to a cap per kind)
 *  - wolves get hungry, hunt sheep and chickens, and when very hungry a person
 *    who is alone; three or more people close by scare them off
 * Everyone dies of old age; wolves also starve.
 */
import { ageOf, approach, dist, goTo, randomSpot, tileOf, walk, type Agent, type Animal, type Task, type TaskKind, hasPower, type Human } from './agents';
import { CAPS, type Sim } from './sim';
import { penHome, walled } from './pens';

function setTask(a: Animal, task: Task | null) {
  a.task = task;
  a.path = null;
  a.moving = false;
}

const task = (kind: TaskKind, sim: Sim, x: number, y: number, extra: Partial<Task> = {}): Task => ({
  kind,
  tx: x,
  ty: y,
  work: 0,
  until: sim.time + 15,
  ...extra,
});

function flee(a: Animal, sim: Sim, from: { x: number; y: number }) {
  const d = Math.hypot(a.x - from.x, a.y - from.y) || 1;
  const tx = a.x + ((a.x - from.x) / d) * 6;
  const ty = a.y + ((a.y - from.y) / d) * 6;
  const spot = randomSpot(sim.world, { ...a, x: tx, y: ty }, 2, sim.rand) ?? randomSpot(sim.world, a, 5, sim.rand);
  if (!spot) return;
  setTask(a, task('flee', sim, spot.x, spot.y, { until: sim.time + 5 }));
  goTo(a, sim.world, spot.x, spot.y);
}

function wander(a: Animal, sim: Sim, radius: number) {
  const spot = randomSpot(sim.world, a, radius, sim.rand);
  if (!spot) return;
  setTask(a, task('wander', sim, spot.x, spot.y, { work: 1 + sim.rand() * 2 }));
  goTo(a, sim.world, spot.x, spot.y);
}

/** Young ones appear next to an adult parent, as long as there is room. */
function maybeBreed(a: Animal, sim: Sim, chance: number) {
  if (ageOf(a, sim.time) < 1 || sim.count(a.kind) >= CAPS[a.kind] || sim.rand() > chance) return;
  const t = tileOf(a);
  const spot = sim.freeNear(t.x, t.y, 1, sim.rand);
  if (spot) sim.addAnimal(a.kind, spot.x, spot.y, 0);
}

export function thinkAnimal(a: Animal, sim: Sim) {
  if (ageOf(a, sim.time) > a.lifespan) {
    sim.kill(a, 'age');
    return;
  }
  if (a.kind === 'wolf') thinkWolf(a, sim);
  else thinkPrey(a, sim);
}

/** In a pen (Update 3): back inside if outside, else graze and amble about within the fence. */
function thinkPenned(a: Animal, sim: Sim, home: { x: number; y: number }) {
  if (a.task) return;
  const d = Math.hypot(a.x - (home.x + 0.5), a.y - (home.y + 0.5));
  if (d > 2.6) {
    setTask(a, task('wander', sim, home.x, home.y, { work: 1, until: sim.time + 30 }));
    goTo(a, sim.world, home.x, home.y);
    return;
  }
  if (sim.rand() < 0.6) {
    setTask(a, task('graze', sim, Math.floor(a.x), Math.floor(a.y), { work: 1 + sim.rand() * 3 }));
    return;
  }
  const x = home.x + Math.round(sim.rand() * 4 - 2);
  const y = home.y + Math.round(sim.rand() * 4 - 2);
  setTask(a, task('wander', sim, x, y, { work: 1 + sim.rand() * 2 }));
  goTo(a, sim.world, x, y);
}

function thinkPrey(a: Animal, sim: Sim) {
  const home = penHome(sim, a);
  if (home) {
    // A wolf at the fence: they huddle, a stone wall keeps it out
    thinkPenned(a, sim, home);
    return;
  }
  const attacker = sim.byId(a.attacker);
  const wolf = sim.nearest(a.x, a.y, 5, (o) => o.kind === 'wolf');
  const threat = attacker && sim.time - a.attackedAt < 3 ? attacker : wolf;
  if (threat) {
    if (a.task?.kind !== 'flee') flee(a, sim, threat);
    return;
  }
  maybeBreed(a, sim, 0.008);
  if (a.task) return;
  if (sim.rand() < 0.5) setTask(a, task('graze', sim, Math.floor(a.x), Math.floor(a.y), { work: 1 + sim.rand() * 3 }));
  else wander(a, sim, 4);
}

function thinkWolf(w: Animal, sim: Sim) {
  const people = sim.near(w.x, w.y, 5, (o) => o.kind === 'human');
  if (people.length >= 3) {
    if (w.task?.kind !== 'flee') {
      const cx = people.reduce((s, p) => s + p.x, 0) / people.length;
      const cy = people.reduce((s, p) => s + p.y, 0) / people.length;
      flee(w, sim, { x: cx, y: cy });
    }
    return;
  }
  const attacker = sim.byId(w.attacker);
  if (attacker && sim.time - w.attackedAt < 3 && w.hp < w.maxHp * 0.4) {
    if (w.task?.kind !== 'flee') flee(w, sim, attacker);
    return;
  }
  if (w.hunger > 60) maybeBreed(w, sim, 0.012);
  if (w.task?.kind === 'hunt' || w.task?.kind === 'flee') return;

  if (w.hunger < 45) {
    // Penned animals behind a stone wall are out of reach (Update 3)
    let prey: Agent | null = sim.nearest(w.x, w.y, 20, (o) => (o.kind === 'sheep' || o.kind === 'chicken') && sim.huntable(o.kind) && !walled(sim, o as Animal));
    // Very hungry: someone who is alone will do
    if (!prey && w.hunger < 30) {
      prey = sim.nearest(w.x, w.y, 12, (o) => o.kind === 'human' && !hasPower(o as Human, 'wolfWhisperer') && sim.near(o.x, o.y, 4, (n) => n.kind === 'human').length === 1);
    }
    if (prey) {
      const t = tileOf(prey);
      setTask(w, task('hunt', sim, t.x, t.y, { target: prey.id, until: sim.time + 15 }));
      goTo(w, sim.world, t.x, t.y);
      return;
    }
  }
  // A wolf whisperer close by: the wolves follow them around
  const friend = sim.nearest(w.x, w.y, 15, (o) => o.kind === 'human' && hasPower(o as Human, 'wolfWhisperer'));
  if (friend && !w.task && Math.hypot(friend.x - w.x, friend.y - w.y) > 2.5) {
    const t = tileOf(friend);
    setTask(w, task('wander', sim, t.x, t.y, { until: sim.time + 6 }));
    goTo(w, sim.world, t.x, t.y);
    return;
  }
  if (!w.task) wander(w, sim, 8);
}

export function actAnimal(a: Animal, sim: Sim, dt: number) {
  if (a.kind === 'wolf') {
    a.hunger = Math.max(0, a.hunger - 1.3 * dt);
    if (a.hunger <= 0) sim.hurt(a, 2 * dt, 'hunger');
    if (a.dead) return;
  }
  const t = a.task;
  if (!t) {
    a.moving = false;
    return;
  }
  if (sim.time > t.until) return setTask(a, null);
  const w = sim.world;

  switch (t.kind) {
    case 'graze':
      a.moving = false;
      t.work -= dt;
      if (t.work <= 0) setTask(a, null);
      return;
    case 'wander':
      if (!t.arrived) {
        if (walk(a, w, dt)) t.arrived = true;
      } else {
        t.work -= dt;
        if (t.work <= 0) setTask(a, null);
      }
      return;
    case 'flee':
      if (walk(a, w, dt, 1.4)) setTask(a, null);
      return;
    case 'hunt': {
      const prey = sim.byId(t.target);
      if (!prey) return setTask(a, null);
      const d = dist(a, prey);
      if (d > 0.9) {
        if (d < 2.5) {
          a.path = null;
          approach(a, w, prey.x, prey.y, dt);
        } else {
          const pt = tileOf(prey);
          if (!a.path || Math.hypot(pt.x - t.tx, pt.y - t.ty) > 1.5) {
            t.tx = pt.x;
            t.ty = pt.y;
            goTo(a, w, pt.x, pt.y);
          }
          walk(a, w, dt);
        }
        return;
      }
      a.moving = false;
      a.facing = prey.x > a.x ? 1 : -1;
      if (sim.time >= a.hitAt) {
        a.hitAt = sim.time + 1;
        if (sim.hit(a, prey, 12)) {
          a.hunger = Math.min(100, a.hunger + (prey.kind === 'sheep' || prey.kind === 'cow' ? 50 : prey.kind === 'human' ? 60 : 25));
          setTask(a, null);
        }
      }
      return;
    }
    default:
      setTask(a, null);
  }
}
