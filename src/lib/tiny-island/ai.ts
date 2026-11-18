/**
 * How people decide ("utility AI"): every half second each person scores
 * every possible action and does the one with the most points. Danger comes
 * first (fight back or run), then family matters (children, adoption) and
 * the odd fist fight between rivals. The point functions are in SCORES
 * below, one line per action; traits add their bonus from TRAIT_MODS in
 * social.ts.
 *
 * Needs go from 0 (desperate) to 100 (fine), so `100 - need` is the urge.
 */
import {
  approach,
  dist,
  FOOD_VALUE,
  goTo,
  has,
  PERKS,
  randomSpot,
  stage,
  tileOf,
  walk,
  type Human,
  type Resource,
  type Task,
  type TaskKind,
} from './agents';
import { buildStep, gatherTime, villageOf, type Village } from './villages';
import { enemiesOf, isEnemy, isWarrior, trespass } from './war';
import {
  changeRel,
  chatOutcome,
  match,
  court,
  findLove,
  relOf,
  RIVAL,
  single,
  startBrawl,
  traitBonus,
  tryAdopt,
  tryBirth,
  wantsBrawl,
  type Choice,
} from './social';
import type { Sim } from './sim';
import { T, W } from './world';

interface Ctx {
  night: boolean;
  /** Someone awake nearby to talk to. */
  partner: Human | null;
  /** That someone is single and a match: worth getting to know. */
  flirt: boolean;
  /** Someone single nearby whom this person loves. */
  love: Human | null;
  grieving: boolean;
  /** Under 6: parents feed them, they do not forage. */
  small: boolean;
  adult: boolean;
  old: boolean;
  single: boolean;
  village: Village | undefined;
  /** Enemy village to march on (warriors in a war). */
  raid: Village | null;
}

const urge = (need: number) => 100 - need;

/** Points per action. Higher wins; the current action gets STICK on top. */
export const SCORES: Record<Choice, (h: Human, c: Ctx) => number> = {
  // Food in the pocket and hungry: eat it (fast, no walking)
  eat: (h) => (h.food > 0 ? urge(h.hunger) * 1.25 : 0),
  // Hungry and nothing (or little) to eat: go and get some. Greedy people stock up more.
  gather: (h, c) =>
    c.small || h.food >= (has(h, 'greedy') ? 5 : 3)
      ? 0
      : (urge(h.hunger) * (h.food === 0 ? 1.1 : 0.7) + (h.food === 0 ? 8 : 0)) * (c.grieving ? 0.75 : 1),
  // Nights are for sleeping; by day only when worn out
  sleep: (h, c) => (c.night ? 50 + urge(h.energy) * 0.6 : h.energy < 18 ? 85 : urge(h.energy) * 0.25),
  // Lonely and someone is around (less so while grieving)
  chat: (h, c) => (c.partner ? urge(h.social) * 0.75 * (c.grieving ? 0.5 : 1) + (c.flirt ? 40 : 0) : 0),
  // Nothing urgent; singles with nobody to fall for nearby like to roam
  wander: (_h, c) => 14 + (c.adult && !c.old && !c.flirt && !c.love && c.single ? 18 : 0),
  // In love with someone single nearby
  court: (_h, c) => (c.love ? 55 : 0),
  // The village storage is short of something: go and get it
  work: (_h, c) => {
    const v = c.village;
    if (!v || !c.adult) return 0;
    const need = Math.max(v.need.food, v.need.wood, v.need.stone);
    return need > 0 ? (need * 45 + 8) * (c.old ? 0.6 : 1) * (c.grieving ? 0.7 : 1) : 0;
  },
  // A house is being built and needs hands
  build: (_h, c) => (c.village?.site && c.adult ? 40 * (c.old ? 0.6 : 1) : 0),
  // War: warriors march on the nearest enemy village
  raid: (_h, c) => (c.raid ? 70 : 0),
};

/** Bonus for keeping the current action, so nobody flips back and forth. */
const STICK = 15;

const CHOICE_OF: Partial<Record<TaskKind, Choice>> = {
  eat: 'eat',
  gather: 'gather',
  sleep: 'sleep',
  chat: 'chat',
  wander: 'wander',
  court: 'court',
  work: 'work',
  build: 'build',
  raid: 'raid',
};

function setTask(h: Human, task: Task | null) {
  h.task = task;
  h.path = null;
  h.moving = false;
  h.asleep = false;
  h.doing = task?.kind === 'gather' ? `gather ${task.source}` : task?.kind === 'work' ? `work ${task.res}` : (task?.kind ?? '');
}

function newTask(kind: TaskKind, sim: Sim, x: number, y: number, extra: Partial<Task> = {}): Task {
  return { kind, tx: x, ty: y, work: 0, until: sim.time + 25, ...extra };
}

/**
 * Who to talk to: people they like, never rivals (unless quarrelsome). Single
 * grown-ups are drawn to other singles who are not family.
 */
function chatPartner(h: Human, sim: Sim): Human | null {
  let best: Human | null = null;
  let bestScore = -Infinity;
  const looking = single(h, sim);
  for (const o of sim.near(h.x, h.y, 12, (o) => o.kind === 'human' && o !== h && !(o as Human).asleep)) {
    const other = o as Human;
    const r = relOf(h, other);
    if (r <= RIVAL && !has(h, 'quarrelsome')) continue;
    const spark = looking && single(other, sim) && match(h, other) ? 50 : 0;
    const score = Math.min(r, 30) + spark + sim.rand() * 30 - dist(h, o);
    if (score > bestScore) {
      bestScore = score;
      best = o as Human;
    }
  }
  return best;
}

export function thinkHuman(h: Human, sim: Sim) {
  const age = stage(h, sim.time);

  const brave = has(h, 'brave');
  const coward = has(h, 'cowardly');
  const atWar = enemiesOf(sim, h.people).length > 0;

  // Danger first: hurt a moment ago by someone close
  const enemy = sim.byId(h.attacker);
  if (enemy && sim.time - h.attackedAt < 2.5 && dist(h, enemy) < 7) {
    if (h.task?.kind === 'fight' || h.task?.kind === 'flee' || h.task?.kind === 'brawl') return;
    if (age === 'adult' && !coward && h.hp > (brave ? 20 : 30)) {
      const lethal = enemy.kind === 'human' && isEnemy(sim, h, enemy as Human);
      setTask(h, newTask('fight', sim, Math.floor(enemy.x), Math.floor(enemy.y), { target: enemy.id, until: sim.time + 12, lethal }));
    } else {
      startFlee(h, sim, enemy.x, enemy.y);
    }
    return;
  }

  if (atWar) {
    // Badly hurt warriors go home to heal
    if (h.hp < h.maxHp * 0.35 && h.task?.kind !== 'flee') {
      const home = villageOf(h, sim);
      if (home && Math.hypot(home.x - h.x, home.y - h.y) > 4) {
        setTask(h, newTask('flee', sim, home.x, home.y, { until: sim.time + 30 }));
        if (goTo(h, sim.world, home.x, home.y)) return;
      }
    }
    // Enemy warriors close by: grown-ups stand and fight, the others run
    if (h.task?.kind !== 'fight' && h.task?.kind !== 'flee') {
      const foe = sim.nearest(h.x, h.y, 8, (o) => o.kind === 'human' && isEnemy(sim, h, o as Human) && isWarrior(o as Human, sim)) as Human | null;
      if (foe) {
        if (age === 'adult' && !coward && h.hp > h.maxHp * 0.35) {
          setTask(h, newTask('fight', sim, Math.floor(foe.x), Math.floor(foe.y), { target: foe.id, until: sim.time + 12, lethal: true }));
        } else {
          startFlee(h, sim, foe.x, foe.y);
        }
        return;
      }
    }
  }
  if (h.task?.kind === 'fight' || h.task?.kind === 'flee' || h.task?.kind === 'brawl') return;

  // Family
  if (h.partner !== undefined) {
    tryBirth(h, sim);
    if (sim.rand() < 0.1) tryAdopt(h, sim);
  }

  // Rivals close by may come to blows
  const rival = wantsBrawl(h, sim);
  if (rival) {
    startBrawl(h, rival, sim);
    setTask(h, newTask('brawl', sim, Math.floor(rival.x), Math.floor(rival.y), { target: rival.id, until: sim.time + 10 }));
    return;
  }

  const partner = chatPartner(h, sim);
  const ctx: Ctx = {
    night: sim.isNight,
    partner,
    flirt: !!partner && single(h, sim) && single(partner, sim) && match(h, partner),
    love: findLove(h, sim),
    grieving: h.grief > sim.time,
    small: age === 'child' && sim.time - h.born < 6 * 30,
    adult: age !== 'child',
    old: age === 'old',
    single: single(h, sim),
    village: villageOf(h, sim),
    raid: atWar && isWarrior(h, sim) && h.hp > h.maxHp * 0.5 ? nearestEnemyVillage(h, sim) : null,
  };
  const current = h.task ? CHOICE_OF[h.task.kind] : undefined;

  let best: Choice = 'wander';
  let bestScore = -Infinity;
  for (const c of Object.keys(SCORES) as Choice[]) {
    const base = SCORES[c](h, ctx);
    const s = base + (base > 0 ? traitBonus(h, c) : 0) + (c === current ? STICK : 0);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (best === current) return;
  if (!start(h, best, sim, ctx)) start(h, 'wander', sim, ctx);
}

function start(h: Human, choice: Choice, sim: Sim, ctx: Ctx): boolean {
  const here = tileOf(h);
  switch (choice) {
    case 'eat':
      setTask(h, newTask('eat', sim, here.x, here.y, { work: 1 }));
      return true;
    case 'sleep': {
      // Couples and their children sleep at home; warriors on the march sleep where they are
      const home = isWarrior(h, sim) ? null : h.home;
      if (home && Math.hypot(home.x - here.x, home.y - here.y) > 3) {
        setTask(h, newTask('sleep', sim, home.x, home.y, { until: sim.time + 40 }));
        if (goTo(h, sim.world, home.x, home.y)) return true;
      }
      setTask(h, newTask('sleep', sim, here.x, here.y, { until: sim.time + 40, arrived: true }));
      return true;
    }
    case 'chat':
    case 'court': {
      const p = choice === 'chat' ? ctx.partner : ctx.love;
      if (!p) return false;
      const t = tileOf(p);
      setTask(h, newTask(choice, sim, t.x, t.y, { target: p.id, work: 2.5, until: sim.time + (choice === 'court' ? 20 : 10) }));
      return goTo(h, sim.world, t.x, t.y);
    }
    case 'gather':
      return startGather(h, sim);
    case 'work':
      return !!ctx.village && startWork(h, sim, ctx.village);
    case 'raid': {
      const v = ctx.raid;
      if (!v) return false;
      setTask(h, newTask('raid', sim, v.x, v.y, { work: 3, until: sim.time + 60 }));
      return goTo(h, sim.world, v.x, v.y) || adjacentGo(h, sim, v.x, v.y);
    }
    case 'build': {
      const site = ctx.village?.site;
      if (!site) return false;
      setTask(h, newTask('build', sim, site.x, site.y, { until: sim.time + 20 }));
      return goTo(h, sim.world, site.x, site.y) || adjacentGo(h, sim, site.x, site.y);
    }
    case 'wander': {
      // Singles now and then set off to meet someone they could fall for, far away too
      if (single(h, sim) && !ctx.love && sim.rand() < 0.5) {
        let far: Human | null = null;
        let farD = Infinity;
        for (const o of sim.humans) {
          if (o === h || o.dead || !single(o, sim) || !match(h, o)) continue;
          const d = dist(h, o);
          if (d > 12 && d < farD) {
            far = o;
            farD = d;
          }
        }
        const spot = far && randomSpot(sim.world, far, 3, sim.rand);
        if (spot) {
          setTask(h, newTask('wander', sim, spot.x, spot.y, { work: 2, until: sim.time + 60 }));
          if (goTo(h, sim.world, spot.x, spot.y)) return true;
        }
      }
      // Children stay near a parent, couples near home, everyone else roams
      const parent = stage(h, sim.time) === 'child' ? h.parents.map((id) => sim.byId(id)).find(Boolean) : undefined;
      const anchor = parent ?? (h.home && sim.rand() < 0.6 ? { ...h, x: h.home.x + 0.5, y: h.home.y + 0.5 } : h);
      const spot = randomSpot(sim.world, anchor as Human, parent ? 3 : h.home ? 5 : 6, sim.rand);
      if (!spot) return false;
      setTask(h, newTask('wander', sim, spot.x, spot.y, { work: 1 + sim.rand() * 2, until: sim.time + 15 }));
      return goTo(h, sim.world, spot.x, spot.y);
    }
  }
}

/** Berries, fish or a hunt: whatever is closest (hunting counts as further). */
function startGather(h: Human, sim: Sim): boolean {
  const w = sim.world;
  const here = tileOf(h);
  const R = 14;
  let berry: { x: number; y: number; d: number } | null = null;
  let fishSpot: { x: number; y: number; d: number } | null = null;
  for (let y = here.y - R; y <= here.y + R; y++) {
    for (let x = here.x - R; x <= here.x + R; x++) {
      if (!w.inside(x, y)) continue;
      const d = Math.hypot(x - here.x, y - here.y);
      if (d > R) continue;
      const i = y * W + x;
      if (w.bush[i] > 0 && (!berry || d < berry.d)) berry = { x, y, d };
      if ((!fishSpot || d < fishSpot.d) && w.isLand(w.get(x, y)) && Number.isFinite(w.cost(x, y)) && fishAt(sim, x, y) >= 0) {
        fishSpot = { x, y, d };
      }
    }
  }
  const adult = stage(h, sim.time) !== 'child';
  const prey = adult ? sim.nearest(h.x, h.y, R, (o) => (o.kind === 'sheep' || o.kind === 'chicken') && sim.huntable(o.kind)) : null;

  const options: { d: number; go: () => boolean }[] = [];
  if (berry) {
    const b = berry;
    options.push({
      d: b.d,
      go: () => {
        setTask(h, newTask('gather', sim, b.x, b.y, { source: 'berries', work: 1.5 }));
        return goTo(h, w, b.x, b.y);
      },
    });
  }
  if (fishSpot) {
    const f = fishSpot;
    options.push({
      d: f.d * 1.2,
      go: () => {
        setTask(h, newTask('gather', sim, f.x, f.y, { source: 'fish', work: gatherTime('food', 'fish', h.people) }));
        return goTo(h, w, f.x, f.y);
      },
    });
  }
  // The village storage: the easiest meal for villagers
  const v = villageOf(h, sim);
  if (v && !v.ruin && v.food >= 2) {
    options.push({
      d: Math.hypot(v.x - here.x, v.y - here.y),
      go: () => {
        setTask(h, newTask('gather', sim, v.x, v.y, { source: 'store', work: 0.5 }));
        return goTo(h, w, v.x, v.y) || adjacentGo(h, sim, v.x, v.y);
      },
    });
  }
  if (prey) {
    const p = prey;
    options.push({
      d: dist(h, p) * 1.4,
      go: () => {
        const t = tileOf(p);
        setTask(h, newTask('gather', sim, t.x, t.y, { source: 'hunt', target: p.id, until: sim.time + 15 }));
        goTo(h, w, t.x, t.y);
        return true;
      },
    });
  }
  options.sort((a, b) => a.d - b.d);
  for (const o of options) if (o.go()) return true;
  return false;
}

/** The closest village of a people at war with this person. */
function nearestEnemyVillage(h: Human, sim: Sim): Village | null {
  const enemies = enemiesOf(sim, h.people);
  let best: Village | null = null;
  let bestD = Infinity;
  for (const v of sim.villages) {
    if (v.ruin || !enemies.includes(v.people)) continue;
    const d = Math.hypot(v.x - h.x, v.y - h.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/** Walk to a tile next to (x, y) when (x, y) itself cannot be reached. */
function adjacentGo(h: Human, sim: Sim, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    if (Number.isFinite(sim.world.cost(x + dx, y + dy)) && goTo(h, sim.world, x + dx, y + dy)) return true;
  }
  return false;
}

/**
 * Work for the village: get what the storage needs most (food from bushes or
 * the water, wood from the forest, stone from the foot of a mountain) and
 * carry it to the square.
 */
function startWork(h: Human, sim: Sim, v: Village): boolean {
  // Pick by need, but with chance: otherwise food would always win and nobody would cut wood
  const weight = (r: Resource) => (v.need[r] > 0 ? v.need[r] + 0.15 : 0) * sim.rand();
  const order = (['food', 'wood', 'stone'] as Resource[]).filter((r) => v.need[r] > 0).sort((a, b) => weight(b) - weight(a));
  for (const res of order) {
    const spot = findSource(h, sim, res);
    if (!spot) continue;
    setTask(h, newTask('work', sim, spot.x, spot.y, { res, phase: 'go', source: spot.source, work: spot.time, until: sim.time + 40 }));
    if (goTo(h, sim.world, spot.x, spot.y)) return true;
  }
  return false;
}

function findSource(h: Human, sim: Sim, res: Resource): { x: number; y: number; time: number; source?: 'berries' | 'fish' } | null {
  const w = sim.world;
  const here = tileOf(h);
  const R = res === 'food' ? 18 : 24;
  let best: { x: number; y: number; d: number; time: number; source?: 'berries' | 'fish' } | null = null;
  for (let y = here.y - R; y <= here.y + R; y++) {
    for (let x = here.x - R; x <= here.x + R; x++) {
      if (!w.inside(x, y)) continue;
      const d = Math.hypot(x - here.x, y - here.y);
      if (d > R || (best && d >= best.d)) continue;
      const t = w.get(x, y);
      if (res === 'food') {
        if (w.bush[y * W + x] > 0) best = { x, y, d, time: gatherTime('food', 'berries', h.people), source: 'berries' };
        else if (w.isLand(t) && Number.isFinite(w.cost(x, y)) && fishAt(sim, x, y) >= 0) {
          const time = gatherTime('food', 'fish', h.people);
          // Fishing counts as a bit further, except for the coast people who are good at it
          const dd = d * (PERKS[h.people].fish > 1 ? 0.8 : 1.3);
          if (!best || dd < best.d) best = { x, y, d: dd, time, source: 'fish' };
        }
      } else if (res === 'wood') {
        if (t === T.FOREST) best = { x, y, d, time: gatherTime('wood', 'tree', h.people) };
      } else if (t === T.GRASS || t === T.SAND) {
        if ([w.get(x + 1, y), w.get(x - 1, y), w.get(x, y + 1), w.get(x, y - 1)].includes(T.MOUNTAIN)) {
          best = { x, y, d, time: gatherTime('stone', 'rock', h.people) };
        }
      }
    }
  }
  return best;
}

/** Index of a neighbouring water tile with fish, or -1. */
function fishAt(sim: Sim, x: number, y: number): number {
  const w = sim.world;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    const t = w.get(nx, ny);
    if ((t === T.DEEP || t === T.SHALLOW) && w.inside(nx, ny) && w.fish[ny * W + nx] > 0) return ny * W + nx;
  }
  return -1;
}

function startFlee(h: Human, sim: Sim, fx: number, fy: number) {
  const d = Math.hypot(h.x - fx, h.y - fy) || 1;
  const tx = Math.floor(h.x + ((h.x - fx) / d) * 6);
  const ty = Math.floor(h.y + ((h.y - fy) / d) * 6);
  const spot = randomSpot(sim.world, { ...h, x: tx + 0.5, y: ty + 0.5 }, 2, sim.rand) ?? randomSpot(sim.world, h, 6, sim.rand);
  if (!spot) return;
  setTask(h, newTask('flee', sim, spot.x, spot.y, { until: sim.time + 6 }));
  goTo(h, sim.world, spot.x, spot.y);
}

/** Follows a moving agent: straight in the last stretch, else by path. */
function chase(h: Human, sim: Sim, target: { x: number; y: number }, dt: number, speed: number) {
  const task = h.task!;
  const d = dist(h, target);
  if (d < 2.5) {
    h.path = null;
    approach(h, sim.world, target.x, target.y, dt, speed);
    return;
  }
  const t = tileOf(target);
  if (!h.path || Math.hypot(t.x - task.tx, t.y - task.ty) > 1.5) {
    task.tx = t.x;
    task.ty = t.y;
    goTo(h, sim.world, t.x, t.y);
  }
  walk(h, sim.world, dt, speed);
}

const end = (h: Human) => setTask(h, null);

/** Carries out the current task for one tick. */
export function actHuman(h: Human, sim: Sim, dt: number) {
  const task = h.task;
  if (!task) {
    h.moving = false;
    return;
  }
  if (sim.time > task.until) return end(h);
  const age = stage(h, sim.time);
  const speed = (age === 'old' ? 0.7 : age === 'child' ? 0.8 : 1) * (h.energy <= 0 ? 0.6 : 1) * PERKS[h.people].speed;
  const w = sim.world;

  switch (task.kind) {
    case 'sleep':
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.asleep = true;
      h.moving = false;
      h.energy = Math.min(100, h.energy + 12 * dt);
      if (h.energy >= 99 || (!sim.isNight && h.energy > 65)) end(h);
      return;

    case 'eat':
      h.moving = false;
      task.work -= dt;
      if (task.work <= 0) {
        if (h.food > 0) {
          h.food--;
          h.hunger = Math.min(100, h.hunger + FOOD_VALUE);
        }
        end(h);
      }
      return;

    case 'wander':
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
      } else {
        task.work -= dt;
        if (task.work <= 0) end(h);
      }
      return;

    case 'flee':
      if (walk(h, w, dt, speed * 1.3)) end(h);
      return;

    case 'chat': {
      const p = sim.byId(task.target) as Human | undefined;
      if (!p || p.asleep) return end(h);
      if (dist(h, p) > 1.6) {
        chase(h, sim, p, dt, speed);
        return;
      }
      h.moving = false;
      h.path = null;
      h.facing = p.x > h.x ? 1 : -1;
      // The other one stops and joins in, unless busy with something that matters more
      const busy = ['sleep', 'eat', 'fight', 'flee', 'brawl', 'chat'];
      if (!task.passive && (!p.task || !busy.includes(p.task.kind))) {
        setTask(p, newTask('chat', sim, Math.floor(p.x), Math.floor(p.y), { target: h.id, work: task.work, until: sim.time + 6, passive: true }));
      }
      if (p.task?.kind === 'chat' && p.task.target === h.id) {
        p.moving = false;
        p.path = null;
        p.facing = h.x > p.x ? 1 : -1;
      }
      h.chatUntil = p.chatUntil = sim.time + 0.6;
      h.social = Math.min(100, h.social + 16 * dt);
      p.social = Math.min(100, p.social + 10 * dt);
      task.work -= dt;
      if (task.work <= 0) {
        if (!task.passive) chatOutcome(h, p, sim);
        end(h);
      }
      return;
    }

    case 'court': {
      const p = sim.byId(task.target) as Human | undefined;
      if (!p) return end(h);
      if (dist(h, p) > 1.6) {
        chase(h, sim, p, dt, speed);
        return;
      }
      h.facing = p.x > h.x ? 1 : -1;
      court(h, p, sim);
      end(h);
      return;
    }

    case 'fight':
    case 'brawl': {
      const enemy = sim.byId(task.target);
      if (!enemy || dist(h, enemy) > 8) return end(h);
      // Between people it is a fist fight that ends before anyone gets badly hurt, unless it is war
      const people = enemy.kind === 'human' && !task.lethal;
      if (people && (enemy.hp <= 40 || h.hp <= 40)) {
        changeRel(h, enemy as Human, -10, sim);
        return end(h);
      }
      if (dist(h, enemy) > 0.9) {
        chase(h, sim, enemy, dt, speed);
        return;
      }
      h.moving = false;
      h.facing = enemy.x > h.x ? 1 : -1;
      if (sim.time >= h.hitAt) {
        h.hitAt = sim.time + 0.8;
        if (task.lethal) sim.slashes.push({ x: enemy.x, y: enemy.y - 0.4, born: sim.time, dir: h.facing });
        if (sim.hit(h, enemy, (people ? 8 : 10) * PERKS[h.people].fight, people)) end(h);
      }
      return;
    }

    case 'gather': {
      if (task.source === 'hunt') {
        const prey = sim.byId(task.target);
        if (!prey) return end(h);
        if (dist(h, prey) > 0.9) {
          chase(h, sim, prey, dt, speed);
          return;
        }
        h.moving = false;
        h.facing = prey.x > h.x ? 1 : -1;
        if (sim.time >= h.hitAt) {
          h.hitAt = sim.time + 0.8;
          if (sim.hit(h, prey, 10 * PERKS[h.people].fight)) {
            h.food += prey.kind === 'sheep' ? 4 : 2;
            trespass(h, sim);
            end(h);
          }
        }
        return;
      }
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      task.work -= dt;
      if (task.work > 0) return;
      if (task.source !== 'store') trespass(h, sim);
      if (task.source === 'store') {
        const v = villageOf(h, sim);
        const take = v ? Math.min(has(h, 'greedy') ? 3 : 2, Math.floor(v.food)) : 0;
        if (v && take > 0) {
          v.food -= take;
          h.food += take;
        }
      } else if (task.source === 'berries') {
        const i = task.ty * W + task.tx;
        const take = Math.min(2, w.bush[i]);
        if (take > 0) {
          w.bush[i] -= take;
          h.food += take;
          w.touch(i);
        }
      } else {
        const i = fishAt(sim, task.tx, task.ty);
        if (i >= 0) {
          w.fish[i]--;
          h.food += 2;
        }
      }
      end(h);
      return;
    }

    case 'work':
      return actWork(h, sim, task, dt, speed);

    case 'raid':
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      task.work -= dt;
      if (task.work <= 0) end(h);
      return;

    case 'build': {
      const v = villageOf(h, sim);
      if (!v || !v.site) return end(h);
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      // Hammering shows as little puffs now and then
      if (sim.rand() < 0.05) sim.puff(v.site.x + 0.5, v.site.y + 0.2, 1, ['#d9b98b']);
      if (buildStep(v, sim, dt * (has(h, 'hardworking') ? 1.3 : 1))) end(h);
      return;
    }

    default:
      end(h);
  }
}

/** Go to the source, gather a load, carry it to the village square. */
function actWork(h: Human, sim: Sim, task: Task, dt: number, speed: number) {
  const w = sim.world;
  const v = villageOf(h, sim);
  if (!v || v.ruin) return end(h);
  if (task.phase === 'go') {
    if (walk(h, w, dt, speed)) task.phase = 'gather';
    return;
  }
  if (task.phase === 'gather') {
    h.moving = false;
    task.work -= dt;
    if (task.work > 0) return;
    let n = 0;
    if (task.res === 'food' && task.source === 'berries') {
      const i = task.ty * W + task.tx;
      n = Math.max(0, Math.min(3, w.bush[i]));
      w.bush[i] -= n;
      w.touch(i);
    } else if (task.res === 'food') {
      const i = fishAt(sim, task.tx, task.ty);
      if (i >= 0) {
        w.fish[i]--;
        n = PERKS[h.people].fish > 1 ? 3 : 2;
      }
    } else if (task.res === 'wood') {
      n = 2;
      // Some trees are cut down for good; the forest grows back elsewhere
      if (w.get(task.tx, task.ty) === T.FOREST && sim.rand() < 0.3) w.set(task.tx, task.ty, T.GRASS);
    } else if (task.res === 'stone') {
      n = 2;
    }
    if (!n) return end(h);
    trespass(h, sim);
    h.carry = { res: task.res!, n };
    task.phase = 'return';
    task.until = sim.time + 40;
    if (!goTo(h, w, v.x, v.y) && !adjacentGo(h, sim, v.x, v.y)) {
      v[task.res!] += n;
      h.carry = null;
      end(h);
    }
    return;
  }
  // Carrying it home
  if (walk(h, w, dt, speed * 0.9)) {
    if (h.carry) v[h.carry.res] += h.carry.n;
    h.carry = null;
    end(h);
  }
}

