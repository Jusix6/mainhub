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
import { onBrawlEnd, revengeTarget } from './drama';
import {
  approach,
  dist,
  FOOD_VALUE,
  goTo,
  has,
  PERKS,
  randomSpot,
  stage,
  stat,
  tileOf,
  walk,
  type Human,
  type Resource,
  type Task,
  type TaskKind,
} from './agents';
import { buildStep, gatherTime, villageOf, type Village } from './villages';
import { FARM_TIME, farmSpot, HARVEST, jobUrge, smithTask, toolFactor, wearTools } from './jobs';
import { hasBuilding } from './town';
import { knows, progressWork } from './inventions';
import { BALANCE } from './balance';
import { foodYears } from './hunger';
import { festiveAt, inspire } from './culture';
import { armyOf, atWar, equip, isEnemy, isWarrior, trespass, WEAPON_POWER, type Army } from './war';
import { UNIT, type Unit } from './armies';
import { drillFactor, foodBonus, projectOf, wonderStep } from './wonders';
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
  think,
  traitBonus,
  tryAdopt,
  tryBirth,
  wantsBrawl,
  type Choice,
} from './social';
import type { Sim } from './sim';
import { T } from './world';

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
  /** The army this warrior marches with. */
  army: Army | null;
  sim: Sim;
}

const urge = (need: number) => 100 - need;

/** How hard someone hits: strength 5 = as before, giant strength (20) = 1.6×. */
const might = (h: Human) => 0.8 + stat(h, 'strength') * 0.04;

/** Points per action. Higher wins; the current action gets STICK on top. */
export const SCORES: Record<Choice, (h: Human, c: Ctx) => number> = {
  // Food in the pocket and hungry: eat it (fast, no walking)
  eat: (h) => (h.food > 0 ? urge(h.hunger) * 1.25 : 0),
  // Hungry and nothing (or little) to eat: go and get some. Greedy people stock up more.
  // From hunger 50 on (Update 2) the empty-handed go for food in earnest
  gather: (h, c) =>
    c.small || h.food >= (has(h, 'greedy') ? 5 : 3)
      ? 0
      : (urge(h.hunger) * (h.food === 0 ? 1.1 : 0.7) + (h.food === 0 ? 8 : 0) + (h.food === 0 && h.hunger <= BALANCE.food.eatAt ? 15 : 0)) *
        (c.grieving ? 0.75 : 1),
  // Nights are for sleeping; by day only when worn out
  sleep: (h, c) => (c.night ? 50 + urge(h.energy) * 0.6 : h.energy < 18 ? 85 : urge(h.energy) * 0.25),
  // Lonely and someone is around (less so while grieving)
  chat: (h, c) => (c.partner ? urge(h.social) * 0.75 * (c.grieving ? 0.5 : 1) + (c.flirt ? 40 : 0) : 0),
  // Nothing urgent; singles with nobody to fall for nearby like to roam
  wander: (_h, c) => 14 + (c.adult && !c.old && !c.flirt && !c.love && c.single ? 18 : 0),
  // In love with someone single nearby
  court: (_h, c) => (c.love ? 55 : 0),
  // Work: what the job asks for (jobless grown-ups help where the storage is short)
  work: (h, c) => {
    const v = c.village;
    if (!v || !c.adult) return 0;
    return jobUrge(h, v, c.sim) * (c.old ? 0.6 : 1) * (c.grieving ? 0.7 : 1);
  },
  // A house is being built: builders first, others lend a hand
  // A world wonder (phase H) comes first for builders by day
  build: (h, c) =>
    c.adult && !c.night && h.job === 'builder' && !c.village?.site && projectOf(c.sim, c.village)
      ? 70 * (c.old ? 0.6 : 1)
      : c.village?.site && c.adult
        ? (h.job === 'builder' ? 55 : 28) * (c.old ? 0.6 : 1)
        : 0,
  // Artists play music and paint on the square (by day)
  art: (h, c) => (c.village && !c.night ? (h.job === 'artist' ? 38 : has(h, 'artistic') && c.adult ? 18 : 0) : 0),
  // Soldiers keep watch around the village
  patrol: (h, c) => (c.village && h.job === 'soldier' ? 24 : 0),
  // War: warriors march with their army
  // In an army: by day the march comes first (phase F), at night the tired sleep
  raid: (_h, c) => (c.army ? (c.night ? 55 : 90) : 0),
  // A festival on the square: everyone comes to dance
  festival: (_h, c) => (festiveAt(c.village, c.sim) ? 62 : 0),
};

/** Bonus for keeping the current action, so nobody flips back and forth. */
const STICK = 15;

/**
 * Work that is under way gets finished: gathering, carrying a load home or
 * hammering on a site weighs much more than starting something new (only
 * real hunger or exhaustion wins).
 */
function commitment(h: Human): number {
  const t = h.task;
  if (!t) return 0;
  if (t.kind === 'work' && (t.phase !== 'go' || h.carry)) return 45;
  if ((t.kind === 'work' || t.kind === 'build' || t.kind === 'craft') && (t.arrived || t.phase === 'go')) return 25;
  // An artist on the way to play (or playing) finishes the piece
  if (t.kind === 'art') return 30;
  return 0;
}

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
  craft: 'work',
  art: 'art',
  patrol: 'patrol',
  festival: 'festival',
};

function setTask(h: Human, task: Task | null) {
  h.task = task;
  h.path = null;
  h.moving = false;
  h.asleep = false;
  h.doing =
    task?.kind === 'gather'
      ? `gather ${task.source}`
      : task?.kind === 'work'
        ? task.farm
          ? `farm ${task.farm}`
          : `work ${task.res}`
        : (task?.kind ?? '');
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
  const war = atWar(sim, h);

  // Danger first: hurt a moment ago by someone close
  const enemy = sim.byId(h.attacker);
  if (enemy && sim.time - h.attackedAt < 2.5 && dist(h, enemy) < 7) {
    if (h.task?.kind === 'fight' || h.task?.kind === 'flee' || h.task?.kind === 'brawl') return;
    // Courage decides: the brave fight on with fewer hit points, the faint-hearted run
    const courage = stat(h, 'courage') + (brave ? 2 : 0);
    if (age === 'adult' && !coward && courage >= 3 && h.hp > 45 - courage * 2.5) {
      const lethal = enemy.kind === 'human' && isEnemy(sim, h, enemy as Human);
      setTask(h, newTask('fight', sim, Math.floor(enemy.x), Math.floor(enemy.y), { target: enemy.id, until: sim.time + 12, lethal }));
    } else {
      startFlee(h, sim, enemy.x, enemy.y);
    }
    return;
  }

  if (war) {
    // Badly hurt warriors go home to heal, and so does an army that ran (phase F)
    if ((h.hp < h.maxHp * 0.35 || (h.fleeHome ?? 0) > sim.time) && h.task?.kind !== 'flee') {
      const home = villageOf(h, sim);
      if (home && Math.hypot(home.x - h.x, home.y - h.y) > 4) {
        setTask(h, newTask('flee', sim, home.x, home.y, { until: sim.time + 30 }));
        if (goTo(h, sim.world, home.x, home.y)) return;
      }
    }
    // Enemy warriors close by, or at the gates of their own village: grown-ups
    // come and fight, the others run
    if (h.task?.kind !== 'fight' && h.task?.kind !== 'flee') {
      const isFoe = (o: { kind: string }) => o.kind === 'human' && isEnemy(sim, h, o as Human) && isWarrior(o as Human, sim);
      const reach = h.unit ? Math.max(8, UNIT[h.unit].range + 1) : 8;
      let foe = sim.nearest(h.x, h.y, reach, isFoe) as Human | null;
      const home = villageOf(h, sim);
      if (!foe && home && age === 'adult' && !coward && Math.hypot(home.x - h.x, home.y - h.y) < 30) {
        foe = sim.nearest(home.x + 0.5, home.y + 0.5, 14, isFoe) as Human | null;
      }
      if (foe) {
        if (age === 'adult' && !coward && stat(h, 'courage') >= 3 && h.hp > h.maxHp * 0.35) {
          setTask(h, newTask('fight', sim, Math.floor(foe.x), Math.floor(foe.y), { target: foe.id, until: sim.time + 12, lethal: true }));
        } else {
          startFlee(h, sim, foe.x, foe.y);
        }
        return;
      }
    }
  }
  if (h.task?.kind === 'fight' || h.task?.kind === 'flee' || h.task?.kind === 'brawl') return;

  // Revenge (drama.ts): the vengeful go after whoever killed their kin
  const foe = revengeTarget(h, sim);
  if (foe) {
    setTask(h, newTask('fight', sim, Math.floor(foe.x), Math.floor(foe.y), { target: foe.id, until: sim.time + 20, lethal: true }));
    return;
  }

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
    army: war ? (armyOf(sim, h) ?? null) : null,
    sim,
  };
  const current = h.task ? CHOICE_OF[h.task.kind] : undefined;

  let best: Choice = 'wander';
  let bestScore = -Infinity;
  for (const c of Object.keys(SCORES) as Choice[]) {
    const base = SCORES[c](h, ctx);
    const s = base + (base > 0 ? traitBonus(h, c) : 0) + (c === current ? STICK + commitment(h) : 0);
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
      const home = armyOf(sim, h) ? null : h.home;
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
      if (!ctx.village) return false;
      // Still carrying something from an interrupted trip: bring it in first
      if (h.carry) {
        const v = ctx.village;
        setTask(h, newTask('work', sim, v.x, v.y, { res: h.carry.res, phase: 'return', until: sim.time + 40 }));
        return goTo(h, sim.world, v.x, v.y) || adjacentGo(h, sim, v.x, v.y);
      }
      return startWork(h, sim, ctx.village);
    case 'raid':
      return ctx.army ? startRaid(h, sim, ctx.army) : false;
    case 'festival': {
      const v = ctx.village;
      if (!v) return false;
      const spot = randomSpot(sim.world, { ...h, x: v.x + 0.5, y: v.y + 0.5 }, 3, sim.rand);
      if (!spot) return false;
      setTask(h, newTask('festival', sim, spot.x, spot.y, { until: v.festivalUntil ?? sim.time + 10 }));
      return goTo(h, sim.world, spot.x, spot.y);
    }
    case 'art':
    case 'patrol': {
      const v = ctx.village;
      if (!v) return false;
      const spot = randomSpot(sim.world, { ...h, x: v.x + 0.5, y: v.y + 0.5 }, choice === 'art' ? 2 : 7, sim.rand);
      if (!spot) return false;
      // Soldiers pick up the best weapon and armour in store
      if (choice === 'patrol') equip(h, v);
      setTask(h, newTask(choice, sim, spot.x, spot.y, { work: choice === 'art' ? 6 : 3, until: sim.time + 25 }));
      return goTo(h, sim.world, spot.x, spot.y);
    }
    case 'build': {
      const site = ctx.village?.site;
      if (!site) {
        // A world wonder (phase H): carry stone or wood to a spot along its site
        const w = projectOf(sim, ctx.village);
        if (!w) return false;
        const side = Math.floor(sim.rand() * 4);
        const along = Math.floor(sim.rand() * 4);
        const x = side === 0 ? w.x - 1 : side === 1 ? w.x + 4 : w.x + along;
        const y = side === 2 ? w.y - 1 : side === 3 ? w.y + 4 : w.y + along;
        setTask(h, newTask('build', sim, x, y, { until: sim.time + 30, wonder: w.id }));
        return goTo(h, sim.world, x, y) || adjacentGo(h, sim, x, y);
      }
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
      const i = y * w.w + x;
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

/**
 * One step of an army (re-planned every few seconds): gather on the home
 * square, then march - the general leads, the others follow close behind -
 * and at a city wall spread out around it for the siege.
 */
function startRaid(h: Human, sim: Sim, army: Army): boolean {
  const from = sim.villages.find((v) => v.id === army.from);
  const target = sim.villages.find((v) => v.id === army.target);
  const general = sim.byId(army.general) as Human | undefined;
  if (!from || !target) return false;
  if (army.state === 'march' && general && general !== h) {
    const t = tileOf(general);
    setTask(h, newTask('raid', sim, t.x, t.y, { target: general.id, until: sim.time + 6 }));
    return true;
  }
  // In a battle the general moves up to five tiles from the enemy general and holds there
  if (army.battle && general === h) {
    const foe = sim.armies.find((a) => a.id === army.battle!.enemy);
    const fg = foe ? sim.byId(foe.general) : undefined;
    if (fg) {
      const d = dist(h, fg);
      const k = d > 6 ? (d - 5) / d : 0;
      const t = { x: Math.floor(h.x + (fg.x - h.x) * k), y: Math.floor(h.y + (fg.y - h.y) * k) };
      setTask(h, newTask('raid', sim, t.x, t.y, { work: 2, until: sim.time + 6, slow: true }));
      return k === 0 || goTo(h, sim.world, t.x, t.y) || adjacentGo(h, sim, t.x, t.y);
    }
  }
  let spot: { x: number; y: number } | null;
  if (army.state === 'gather') spot = randomSpot(sim.world, { ...h, x: from.x + 0.5, y: from.y + 0.5 }, 3, sim.rand);
  else if (army.state === 'siege') {
    // Everyone gets a place of their own around the wall
    const a = (h.id * 2.4) % (Math.PI * 2);
    spot = randomSpot(sim.world, { ...h, x: target.x + 0.5 + Math.cos(a) * 10, y: target.y + 0.5 + Math.sin(a) * 8 }, 2, sim.rand);
  } else spot = { x: target.x, y: target.y };
  if (!spot) return false;
  setTask(h, newTask('raid', sim, spot.x, spot.y, { work: 3, until: sim.time + (army.state === 'march' ? 30 : 6), slow: army.state === 'march' }));
  return goTo(h, sim.world, spot.x, spot.y) || adjacentGo(h, sim, spot.x, spot.y);
}

/**
 * Where someone stands in the formation: `f` tiles ahead of the general and
 * `r` tiles to the right, turned the way the army faces. Null when the army
 * has no direction yet or that spot is in the water.
 */
function formationSpot(h: Human, g: { x: number; y: number }, sim: Sim): { x: number; y: number } | null {
  const s = h.slot;
  if (!s) return null;
  const army = sim.armies.find((a) => a.id === s.army);
  const d = army?.dir;
  if (!d) return null;
  const x = g.x + d.x * s.f - d.y * s.r;
  const y = g.y + d.y * s.f + d.x * s.r;
  const w = sim.world;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!w.isLand(w.get(tx, ty)) || !Number.isFinite(w.cost(tx, ty))) return null;
  return { x, y };
}

/** What a shot looks like. */
const SHOT_OF: Partial<Record<Unit, 'arrow' | 'bolt' | 'stone' | 'ball' | 'bullet'>> = { archer: 'arrow', crossbow: 'bolt', catapult: 'stone', cannon: 'ball', musketeer: 'bullet' };

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
  // Jobs decide what to do (jobs.ts)
  switch (h.job) {
    case 'farmer': {
      const spot = farmSpot(h, v, sim);
      if (spot) {
        setTask(h, newTask('work', sim, spot.x, spot.y, { res: 'food', farm: spot.farm, phase: 'go', work: FARM_TIME[spot.farm] * toolFactor(v), until: sim.time + 40 }));
        if (goTo(h, sim.world, spot.x, spot.y)) return true;
      }
      return gatherFor(h, sim, v, ['food']);
    }
    case 'fisher':
      return gatherFor(h, sim, v, ['food'], true);
    case 'woodcutter':
    case 'builder':
      return gatherFor(h, sim, v, ['wood']);
    case 'stonemason':
      return gatherFor(h, sim, v, ['stone']);
    case 'miner':
      return gatherFor(h, sim, v, ['ore']);
    case 'smith': {
      // Tools, weapons or armour (jobs.ts decides); the material goes right away
      const make = smithTask(v, sim);
      if (!make) return false;
      if (make === 'tool') {
        v.ore--;
        if (v.wood >= 1) v.wood--;
      } else if (make === 'club') v.wood -= 2;
      else v.ore--;
      const craft = (hasBuilding(v, 'smithy') ? 2.5 : 4) * (knows(sim, v.people, 'bronze') ? 0.75 : 1) * (make === 'armor' ? 1.5 : 1) * (1.1 - stat(h, 'intelligence') * 0.02) * (hasBuilding(v, 'factory') ? 0.5 : 1);
      setTask(h, newTask('craft', sim, v.x, v.y, { work: craft, until: sim.time + 30, make }));
      return goTo(h, sim.world, v.x, v.y) || adjacentGo(h, sim, v.x, v.y);
    }
  }
  // Jobless: get what the storage needs most, picked by need with some chance
  // (otherwise food would always win and nobody would cut wood)
  const weight = (r: Resource) => (v.need[r] > 0 ? v.need[r] + 0.15 : 0) * sim.rand();
  const order = (['food', 'wood', 'stone'] as Resource[]).filter((r) => v.need[r] > 0).sort((a, b) => weight(b) - weight(a));
  return gatherFor(h, sim, v, order);
}

/** Go to the closest source of the first resource that has one (fishers: only water). */
function gatherFor(h: Human, sim: Sim, v: Village, order: Resource[], fishOnly = false): boolean {
  for (const res of order) {
    const spot = findSource(h, sim, res, fishOnly, v);
    if (!spot) continue;
    // Strong arms cut wood and break stone faster
    const arms = (res === 'food' ? 1 : Math.max(0.5, 1.1 - stat(h, 'strength') * 0.02)) * progressWork(sim, h.people);
    setTask(h, newTask('work', sim, spot.x, spot.y, { res, phase: 'go', source: spot.source, work: spot.time * toolFactor(v) * arms, until: sim.time + 40 }));
    if (goTo(h, sim.world, spot.x, spot.y)) {
      // A long way from home: take a portion along (Update 2)
      if (h.food === 0 && v.food >= 3 && foodYears(v) >= 0.5 && Math.hypot(spot.x - v.x, spot.y - v.y) > BALANCE.food.provisionDistance) {
        v.food--;
        h.food++;
      }
      return true;
    }
  }
  return false;
}

function findSource(h: Human, sim: Sim, res: Resource, fishOnly = false, v?: Village): { x: number; y: number; time: number; source?: 'berries' | 'fish' } | null {
  const w = sim.world;
  const here = tileOf(h);
  const R = res === 'food' ? 18 : 24;
  // Some sources count as closer than they are (fishing for good fishers, trees in the village area)
  const minFactor = res === 'wood' ? BALANCE.trees.villageTreeFactor : res === 'food' ? 0.8 : 1;
  let best: { x: number; y: number; d: number; time: number; source?: 'berries' | 'fish' } | null = null;
  for (let y = here.y - R; y <= here.y + R; y++) {
    for (let x = here.x - R; x <= here.x + R; x++) {
      if (!w.inside(x, y)) continue;
      const d = Math.hypot(x - here.x, y - here.y);
      if (d > R || (best && d * minFactor >= best.d)) continue;
      const t = w.get(x, y);
      if (res === 'food') {
        if (!fishOnly && w.bush[y * w.w + x] > 0) best = { x, y, d, time: gatherTime('food', 'berries', h.people), source: 'berries' };
        else if (w.isLand(t) && Number.isFinite(w.cost(x, y)) && fishAt(sim, x, y) >= 0) {
          const time = gatherTime('food', 'fish', h.people);
          // Fishing counts as a bit further, except for the coast people (and anyone with boats)
          const dd = d * (PERKS[h.people].fish > 1 || knows(sim, h.people, 'boats') ? 0.8 : 1.3);
          if (!best || dd < best.d) best = { x, y, d: dd, time, source: 'fish' };
        }
      } else if (res === 'wood') {
        // Trees in the village area are cleared first (Update 2)
        const home = v && Math.hypot(x - v.x, y - v.y) <= BALANCE.trees.villageClear;
        const dd = home ? d * BALANCE.trees.villageTreeFactor : d;
        if (t === T.FOREST && (!best || dd < best.d)) best = { x, y, d: dd, time: gatherTime('wood', 'tree', h.people) };
      } else if (t === T.GRASS || t === T.SAND) {
        if ([w.get(x + 1, y), w.get(x - 1, y), w.get(x, y + 1), w.get(x, y - 1)].includes(T.MOUNTAIN)) {
          // Ore lies deeper: mining takes longer than breaking stone
          best = { x, y, d, time: gatherTime('stone', 'rock', h.people) * (res === 'ore' ? 1.4 : 1) };
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
    if ((t === T.DEEP || t === T.SHALLOW) && w.inside(nx, ny) && w.fish[ny * w.w + nx] > 0) return ny * w.w + nx;
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
      const busy = ['sleep', 'eat', 'fight', 'flee', 'brawl', 'chat', 'raid'];
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
      const unit = task.lethal && h.unit ? UNIT[h.unit] : undefined;
      const reach = unit?.range || 0.9;
      if (!enemy || dist(h, enemy) > Math.max(8, reach + 2)) return end(h);
      // Between people it is a fist fight that ends before anyone gets badly hurt, unless it is war
      const people = enemy.kind === 'human' && !task.lethal;
      if (people && (enemy.hp <= 40 || h.hp <= 40)) {
        changeRel(h, enemy as Human, -10, sim);
        onBrawlEnd(sim, h, enemy as Human);
        return end(h);
      }
      if (dist(h, enemy) > reach) {
        chase(h, sim, enemy, dt, speed * (unit?.speed ?? 1));
        return;
      }
      h.moving = false;
      h.facing = enemy.x > h.x ? 1 : -1;
      // Shooters (phase F): a shot flies, it hits when it lands
      if (unit?.range && h.unit) {
        if (sim.time >= h.hitAt) {
          h.hitAt = sim.time + unit.reload * (0.9 + sim.rand() * 0.2);
          sim.shots.push({ x0: h.x, y0: h.y - 0.5, x1: enemy.x, y1: enemy.y - 0.3, born: sim.time, kind: SHOT_OF[h.unit] ?? 'arrow' });
          // Guns: a puff of smoke at the muzzle
          if (h.unit === 'musketeer' || h.unit === 'cannon') sim.puff(h.x + h.facing * 0.5, h.y - 0.5, h.unit === 'cannon' ? 5 : 2, ['#d8d4c8', '#ffffff', '#b4b9c2']);
          if (sim.hit(h, enemy, 10 * PERKS[h.people].fight * unit.power * might(h), false, unit.pierce)) end(h);
        }
        return;
      }
      if (sim.time >= h.hitAt) {
        h.hitAt = sim.time + 0.8;
        if (task.lethal) sim.slashes.push({ x: enemy.x, y: enemy.y - 0.4, born: sim.time, dir: h.facing });
        // Defenders behind their city wall hit harder
        const home = villageOf(h, sim);
        const walled = task.lethal && hasBuilding(home, 'wall') && home && Math.hypot(home.x - h.x, home.y - h.y) < 12 ? 1.3 : 1;
        // Bronze and iron weapons hit harder in war
        const weapon = task.lethal ? WEAPON_POWER[h.weapon ?? 'none'] : 1;
        // Units (phase F): spears are deadly against riders; soldiers from a barracks are drilled
        const foeUnit = enemy.kind === 'human' ? (enemy as Human).unit : undefined;
        const kind = unit ? unit.power * (unit.vsRider && foeUnit && UNIT[foeUnit].mounted ? unit.vsRider : 1) : 1;
        const drill = (task.lethal && h.job === 'soldier' && hasBuilding(home, 'barracks') ? 1.15 : 1) * (task.lethal && (h.job === 'soldier' || h.unit) ? drillFactor(sim, h.people) : 1);
        if (sim.hit(h, enemy, (people ? 8 : 10) * PERKS[h.people].fight * walled * weapon * kind * drill * might(h), people)) end(h);
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
          if (sim.hit(h, prey, 10 * PERKS[h.people].fight * might(h))) {
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
        // Rations: when food is short everyone gets one portion at a time
        const ration = v && foodYears(v) < BALANCE.food.shortYears ? 1 : has(h, 'greedy') ? 3 : 2;
        const take = v ? Math.min(ration, Math.floor(v.food)) : 0;
        if (v && take > 0) {
          v.food -= take;
          h.food += take;
        }
      } else if (task.source === 'berries') {
        const i = task.ty * sim.world.w + task.tx;
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

    case 'craft': {
      // The smith hammers ore and wood into tools on the square
      const v = villageOf(h, sim);
      if (!v) return end(h);
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      if (sim.rand() < 0.08) sim.puff(h.x + h.facing * 0.4, h.y - 0.3, 1, ['#ffb347', '#ffe066']);
      task.work -= dt;
      if (task.work <= 0) {
        if (!task.make || task.make === 'tool') v.tools++;
        else v.arms[task.make]++;
        end(h);
      }
      return;
    }

    case 'art':
    case 'patrol': {
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      task.work -= dt;
      // Artists: every second on the square brings inspiration for a work
      if (task.kind === 'art') {
        const v = villageOf(h, sim);
        if (v) inspire(h, sim, v, dt);
      }
      if (task.kind === 'art' && sim.rand() < dt) {
        // Music: a note over the head, and everyone close by cheers up a little
        think(h, 'note', 1.5, sim);
        for (const o of sim.near(h.x, h.y, 5, (a) => a.kind === 'human' && a !== h)) (o as Human).social = Math.min(100, (o as Human).social + 4);
      }
      if (task.work <= 0) end(h);
      return;
    }

    case 'festival': {
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      // Dancing: turning around, singing now and then, never lonely
      h.moving = false;
      h.social = Math.min(100, h.social + 8 * dt);
      if (sim.rand() < dt * 1.5) h.facing = h.facing === 1 ? -1 : 1;
      if (sim.rand() < dt * 0.4) think(h, 'note', 1.2, sim);
      return;
    }

    case 'raid': {
      // Following the general, each in their place in the formation (phase F)
      if (task.target !== undefined) {
        const g = sim.byId(task.target);
        if (!g) return end(h);
        const spot = formationSpot(h, g, sim);
        if (spot) {
          // Whoever has fallen behind hurries to catch up
          const gap = dist(h, spot);
          if (gap > 0.5) chase(h, sim, spot, dt, speed * Math.max(1, h.unit ? UNIT[h.unit].speed : 1) * (gap > 2 ? 1.3 : 1));
          else {
            h.moving = false;
            h.path = null;
            const army = sim.armies.find((a) => a.id === h.slot!.army);
            if (army?.dir) h.facing = army.dir.x >= 0 ? 1 : -1;
          }
        } else if (dist(h, g) > 2.2) chase(h, sim, g, dt, speed);
        else {
          h.moving = false;
          h.path = null;
        }
        return;
      }
      if (!task.arrived) {
        if (walk(h, w, dt, speed * (task.slow ? 0.85 : 1))) task.arrived = true;
        return;
      }
      h.moving = false;
      task.work -= dt;
      if (task.work <= 0) end(h);
      return;
    }

    case 'build': {
      const v = villageOf(h, sim);
      if (task.wonder !== undefined) {
        const won = sim.wonders.find((x) => x.id === task.wonder);
        if (!won || won.finished !== undefined) return end(h);
        if (!task.arrived) {
          if (walk(h, w, dt, speed * 0.85)) task.arrived = true;
          return;
        }
        h.moving = false;
        h.facing = won.x + 2 > h.x ? 1 : -1;
        if (wonderStep(sim, won, dt * (has(h, 'hardworking') ? 1.3 : 1) * (0.9 + stat(h, 'intelligence') * 0.02))) end(h);
        return;
      }
      if (!v || !v.site) return end(h);
      if (!task.arrived) {
        if (walk(h, w, dt, speed)) task.arrived = true;
        return;
      }
      h.moving = false;
      // Hammering shows as little puffs now and then
      if (sim.rand() < 0.05) sim.puff(v.site.x + 0.5, v.site.y + 0.2, 1, ['#d9b98b']);
      if (buildStep(v, sim, dt * (has(h, 'hardworking') ? 1.3 : 1) * (0.9 + stat(h, 'intelligence') * 0.02))) end(h);
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
    if (task.farm) {
      const i = task.ty * sim.world.w + task.tx;
      if (task.farm === 'plough') {
        const t = w.get(task.tx, task.ty);
        if (t === T.GRASS || t === T.FOREST) {
          // Clearing forest for a field gives some wood
          if (t === T.FOREST) v.wood += 2;
          w.set(task.tx, task.ty, T.FIELD);
          v.fields++;
        }
        return end(h);
      }
      if (task.farm === 'sow') {
        if (w.get(task.tx, task.ty) === T.FIELD && w.crop[i] === 0) {
          w.crop[i] = 1;
          w.touch(i);
        }
        return end(h);
      }
      if (w.get(task.tx, task.ty) === T.FIELD && w.crop[i] >= 4) {
        w.crop[i] = 0;
        w.touch(i);
        // A granary keeps more of the harvest
        n = HARVEST + (hasBuilding(v, 'granary') ? 2 : 0) + (hasBuilding(v, 'windmill') ? 2 : 0);
      }
    } else if (task.res === 'food' && task.source === 'berries') {
      const i = task.ty * sim.world.w + task.tx;
      n = Math.max(0, Math.min(3, w.bush[i]));
      w.bush[i] -= n;
      w.touch(i);
    } else if (task.res === 'food') {
      const i = fishAt(sim, task.tx, task.ty);
      if (i >= 0) {
        w.fish[i]--;
        // With boats they row out and catch one more
        n = (PERKS[h.people].fish > 1 ? 3 : 2) + (knows(sim, h.people, 'boats') ? 1 : 0) + (knows(sim, h.people, 'navigation') ? 1 : 0);
      }
    } else if (task.res === 'wood') {
      n = 2;
      // Some trees are cut down for good, those in the village area always; the forest grows back elsewhere
      const clear = Math.hypot(task.tx - v.x, task.ty - v.y) <= BALANCE.trees.villageClear;
      if (w.get(task.tx, task.ty) === T.FOREST && (clear || sim.rand() < 0.3)) w.set(task.tx, task.ty, T.GRASS);
    } else if (task.res === 'stone') {
      n = 2;
    } else if (task.res === 'ore') {
      n = (PERKS[h.people].stone > 1 ? 3 : 2) + (hasBuilding(v, 'factory') ? 1 : 0);
    }
    if (!n) return end(h);
    // The wheel: wood, stone and ore go home on a cart, twice as much
    if (task.res !== 'food' && knows(sim, h.people, 'wheel')) n *= 2;
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
    // The Hanging Gardens (phase H): food brought home counts 30 % more
    if (h.carry) v[h.carry.res] += h.carry.res === 'food' ? h.carry.n * foodBonus(sim, v.people) : h.carry.n;
    h.carry = null;
    wearTools(v, sim);
    end(h);
  }
}

