/**
 * Diplomacy and war between peoples. Every pair of peoples has a mood from
 * -100 to +100. It drops when their villages are close, when their people
 * quarrel or fight, and when someone gathers or hunts near a foreign village;
 * it rises with marriages across peoples, long peace and a common enemy. The
 * Aggression rule makes every drop stronger.
 *
 * Below -60 a leader declares war. Brave and warlike grown-ups become
 * warriors and march on the nearest enemy village; everyone fights back or
 * flees (ai.ts). A village with attackers on its square and no defenders left
 * is conquered: it takes the colour of the winners and its people join them.
 * Peace comes after 10 years of war or when one side has lost more than half
 * of its warriors.
 */
import { has, PEOPLES, PERKS, stage, type Human, type People } from './agents';
import type { Sim } from './sim';
import { refOf, story } from './social';
import type { Village } from './villages';

export interface War {
  a: People;
  b: People;
  started: number;
  /** Warriors each side had when it started, and how many died since. */
  warriors: Record<string, number>;
  lost: Record<string, number>;
}

const YEAR = 30;
export const WAR_AT = -60;
const WAR_YEARS = 10;

export const pairKey = (a: People, b: People) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function moodOf(sim: Sim, a: People, b: People) {
  return sim.mood.get(pairKey(a, b)) ?? 0;
}

/** Shifts the mood between two peoples; drops get stronger with the Aggression rule. */
export function shiftMood(sim: Sim, a: People, b: People, d: number) {
  if (a === b) return;
  const k = pairKey(a, b);
  const amount = d < 0 ? d * sim.rules.aggression : d;
  sim.mood.set(k, Math.max(-100, Math.min(100, (sim.mood.get(k) ?? 0) + amount)));
}

export function warBetween(sim: Sim, a: People, b: People): War | undefined {
  return a === b ? undefined : sim.wars.get(pairKey(a, b));
}

/** Peoples that `p` is at war with right now. */
export function enemiesOf(sim: Sim, p: People): People[] {
  const out: People[] = [];
  for (const w of sim.wars.values()) {
    if (w.a === p) out.push(w.b);
    else if (w.b === p) out.push(w.a);
  }
  return out;
}

export const isEnemy = (sim: Sim, a: Human, b: Human) => !!warBetween(sim, a.people, b.people);

/** A warrior: grown-up, brave or warlike (or a village leader), and their people is at war. */
export function isWarrior(h: Human, sim: Sim) {
  if (stage(h, sim.time) !== 'adult' || has(h, 'cowardly') || !enemiesOf(sim, h.people).length) return false;
  return has(h, 'brave') || has(h, 'warlike') || sim.villages.some((v) => v.leader === h.id);
}

/** Gathering or hunting close to a village of another people annoys them. */
export function trespass(h: Human, sim: Sim) {
  for (const v of sim.villages) {
    if (v.ruin || v.people === h.people) continue;
    if (Math.hypot(v.x - h.x, v.y - h.y) < 16) shiftMood(sim, h.people, v.people, -0.6);
  }
}

/** Living villages per people. */
function villagesBy(sim: Sim) {
  const by = new Map<People, Village[]>();
  for (const v of sim.villages) {
    if (v.ruin) continue;
    const list = by.get(v.people) ?? [];
    list.push(v);
    by.set(v.people, list);
  }
  return by;
}

/** Once a second: moods drift, wars start, villages fall, wars end. */
export function warTick(sim: Sim) {
  const by = villagesBy(sim);
  const present = PEOPLES.filter((p) => by.has(p));

  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i];
      const b = present[j];
      const war = warBetween(sim, a, b);
      if (war) continue;
      // Two peoples on one small island always compete a little; close borders make it worse
      let border = 0;
      for (const va of by.get(a)!) for (const vb of by.get(b)!) border += Math.max(0, 1 - Math.hypot(va.x - vb.x, va.y - vb.y) / 60) * 0.2;
      shiftMood(sim, a, b, -(0.05 + border));
      // Long peace calms things down slowly; a common enemy brings people together
      shiftMood(sim, a, b, 0.04);
      const common = enemiesOf(sim, a).some((e) => enemiesOf(sim, b).includes(e));
      if (common) shiftMood(sim, a, b, 0.3);
      if (moodOf(sim, a, b) < WAR_AT) declare(sim, a, b, by);
    }
  }

  for (const [k, war] of sim.wars) {
    // A village with attackers on its square and nobody left to defend it falls
    for (const side of [war.a, war.b]) {
      const enemy = side === war.a ? war.b : war.a;
      for (const v of by.get(side) ?? []) {
        const attackers = sim.near(v.x + 0.5, v.y + 0.5, 6, (o) => o.kind === 'human' && (o as Human).people === enemy && stage(o as Human, sim.time) === 'adult');
        if (!attackers.length) continue;
        const defenders = sim.near(v.x + 0.5, v.y + 0.5, 12, (o) => o.kind === 'human' && (o as Human).village === v.id && stage(o as Human, sim.time) === 'adult' && !has(o as Human, 'cowardly'));
        if (!defenders.length) conquer(sim, v, enemy, attackers[0] as Human);
      }
    }
    const tired = sim.time - war.started > WAR_YEARS * YEAR;
    const beaten = [war.a, war.b].some((p) => war.warriors[p] > 0 && war.lost[p] > war.warriors[p] / 2);
    const gone = !by.has(war.a) || !by.has(war.b);
    if (tired || beaten || gone) {
      sim.wars.delete(k);
      sim.mood.set(k, -10);
      sim.chronicle.add({ year: sim.year, kind: 'peace', a: { id: 0, name: '', people: war.a }, p: war.a, q: war.b, x: 0, y: 0 });
    }
  }
}

function declare(sim: Sim, a: People, b: People, by: Map<People, Village[]>) {
  // The leader of the village of `a` closest to `b` declares it
  let best: { v: Village; d: number } | null = null;
  for (const va of by.get(a)!) for (const vb of by.get(b)!) {
    const d = Math.hypot(va.x - vb.x, va.y - vb.y);
    if (!best || d < best.d) best = { v: va, d };
  }
  const v = best?.v;
  const leader = v?.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  const leaders = new Set(sim.villages.map((x) => x.leader));
  const count = (p: People) =>
    sim.humans.filter((h) => h.people === p && (has(h, 'brave') || has(h, 'warlike') || leaders.has(h.id)) && !has(h, 'cowardly') && stage(h, sim.time) === 'adult').length;
  const war: War = { a, b, started: sim.time, warriors: { [a]: count(a), [b]: count(b) }, lost: { [a]: 0, [b]: 0 } };
  sim.wars.set(pairKey(a, b), war);
  sim.chronicle.add({
    year: sim.year,
    kind: 'war',
    a: leader ? refOf(leader) : { id: 0, name: v?.name ?? '', people: a },
    v: v?.name,
    p: b,
    x: v ? v.x : 0,
    y: v ? v.y : 0,
  });
}

/** The winners take the village: new colour, its people join them. */
function conquer(sim: Sim, v: Village, winner: People, by: Human) {
  const loser = v.people;
  v.people = winner;
  v.leader = undefined;
  for (const h of sim.humans) {
    if (h.village !== v.id) continue;
    h.people = winner;
    const hpShare = h.hp / h.maxHp;
    h.maxHp = PERKS[winner].hp;
    h.hp = h.maxHp * hpShare;
    story(h, sim, 'conquered', v.name);
    const r = sim.registry.get(h.id);
    if (r) r.people = winner;
  }
  sim.puff(v.x + 0.5, v.y, 10, ['#ffffff', '#ffe066', '#f1e2c4']);
  sim.chronicle.add({ year: sim.year, kind: 'conquest', a: refOf(by), v: v.name, p: winner, q: loser, x: v.x, y: v.y });
}

/** A death in a war counts against that side (for "lost more than half"). */
export function countLoss(sim: Sim, dead: Human) {
  if (dead.attacker === undefined) return;
  const killer = sim.registry.get(dead.attacker);
  if (!killer) return;
  const war = warBetween(sim, dead.people, killer.people);
  if (war) war.lost[dead.people] = (war.lost[dead.people] ?? 0) + 1;
}
