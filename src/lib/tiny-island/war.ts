/**
 * Diplomacy and war (Phases 5 and 10).
 *
 * Peoples: every pair has a mood from -100 to +100. It drops when their
 * villages are close, when their people quarrel or fight, and when someone
 * gathers or hunts near a foreign village; it rises with marriages across
 * peoples, trade, long peace and a common enemy. The Aggression rule makes
 * every drop stronger. Above +60 two peoples become allies (below +20 the
 * alliance breaks); allies join each other's wars. Below -60 a leader
 * declares war.
 *
 * Feuds: villages of the same people have a mood too. Big neighbours rub
 * each other the wrong way, rival leaders make it worse, trade makes it
 * better. Below -60 they start a feud: a war between just those two places.
 *
 * Armies: in a war, the warriors of a village gather on its square, then
 * march together behind their general (with a banner) on the nearest enemy
 * place. A city wall has to be besieged first: the army stands around it and
 * wears it down until it is breached. A place with attackers on its square
 * and no defenders left falls: in a war between peoples it changes sides, in
 * a feud it pays half of its stores and loses its leader.
 *
 * Kingdoms (kingdoms.ts): a king declares the wars of his people from the
 * capital; rebels fight their capital in a feud; a lost war costs the crown
 * loyalty; conquered places become vassals of the winners.
 *
 * Peace comes after 10 years (feuds 5), when one side has lost more than half
 * of its warriors or when one side is gone. Then a peace treaty holds for 15
 * years (the mood cannot sink below -40); a beaten side pays tribute.
 */
import { has, PEOPLES, PERKS, stage, type Human, type People } from './agents';
import type { Sim } from './sim';
import type { ChronicleEntry } from './chronicle';
import { lostWar, onSubdued } from './kingdoms';
import { celebrate } from './culture';
import { refOf, RIVAL, relOf, story } from './social';
import type { Village } from './villages';

export interface War {
  a: People;
  b: People;
  /** A feud: two villages of the same people (ids) instead of two peoples. */
  va?: number;
  vb?: number;
  started: number;
  /** Warriors each side had when it started, and how many died since (by side key). */
  warriors: Record<string, number>;
  lost: Record<string, number>;
}

export interface Army {
  id: number;
  /** Key of the war in `sim.wars`. */
  war: string;
  people: People;
  /** Village it comes from and the one it marches on (ids). */
  from: number;
  target: number;
  general: number;
  members: number[];
  state: 'gather' | 'march' | 'siege';
  /** Gathering ends at this game time. */
  until: number;
}

/** Someone or some place that can be on a side of a war. */
export interface Party {
  people: People;
  village?: number;
}

type Side = 'a' | 'b';

const YEAR = 30;
export const WAR_AT = -60;
const WAR_YEARS = 10;
const FEUD_YEARS = 5;
const TREATY_YEARS = 15;
const ALLY_AT = 60;
const ALLY_END = 20;
/** Feuds only between places this close (tiles). */
const FEUD_RANGE = 35;
/** Hit points of a city wall. */
export const WALL_HP = 100;

export const pairKey = (a: People, b: People) => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const feudKey = (x: number, y: number) => (x < y ? `v${x}|v${y}` : `v${y}|v${x}`);

const partyOf = (v: Village): Party => ({ people: v.people, village: v.id });

export function moodOf(sim: Sim, a: People, b: People) {
  return sim.mood.get(pairKey(a, b)) ?? 0;
}

/** Keeps a mood in -100 … +100; under a peace treaty it cannot sink below -40. */
function setMood(sim: Sim, map: Map<string, number>, k: string, before: number, after: number) {
  const floor = (sim.treaties.get(k) ?? 0) > sim.time ? Math.min(before, -40) : -100;
  map.set(k, Math.max(floor, Math.min(100, after)));
}

/** Shifts the mood between two peoples; drops get stronger with the Aggression rule. */
export function shiftMood(sim: Sim, a: People, b: People, d: number) {
  if (a === b) return;
  const k = pairKey(a, b);
  const before = sim.mood.get(k) ?? 0;
  setMood(sim, sim.mood, k, before, before + (d < 0 ? d * sim.rules.aggression : d));
}

/** The same between two villages of one people (feuds). */
export function shiftVillageMood(sim: Sim, x: number, y: number, d: number) {
  if (x === y) return;
  const k = feudKey(x, y);
  const before = sim.vmood.get(k) ?? 0;
  setMood(sim, sim.vmood, k, before, before + (d < 0 ? d * sim.rules.aggression : d));
}

/** A war between two peoples (not feuds). */
export function warBetween(sim: Sim, a: People, b: People): War | undefined {
  return a === b ? undefined : sim.wars.get(pairKey(a, b));
}

export const allied = (sim: Sim, a: People, b: People) => a !== b && sim.alliances.has(pairKey(a, b));

/** Which side of a war someone (or some place) is on. */
export function sideOf(w: War, x: Party): Side | null {
  if (w.va !== undefined) return x.village === w.va ? 'a' : x.village === w.vb ? 'b' : null;
  return x.people === w.a ? 'a' : x.people === w.b ? 'b' : null;
}

const other = (s: Side): Side => (s === 'a' ? 'b' : 'a');
const sideKey = (w: War, s: Side) => (w.va !== undefined ? String(s === 'a' ? w.va : w.vb) : s === 'a' ? w.a : w.b);

/** Peoples that `p` is at war with right now (wars between peoples only). */
export function enemiesOf(sim: Sim, p: People): People[] {
  const out: People[] = [];
  for (const w of sim.wars.values()) {
    if (w.va !== undefined) continue;
    if (w.a === p) out.push(w.b);
    else if (w.b === p) out.push(w.a);
  }
  return out;
}

/** Is this person or place in any war (between peoples or a feud)? */
export function atWar(sim: Sim, x: Party) {
  for (const w of sim.wars.values()) if (sideOf(w, x)) return true;
  return false;
}

/** On opposite sides of some war? */
export function isEnemy(sim: Sim, x: Party, y: Party) {
  for (const w of sim.wars.values()) {
    const sx = sideOf(w, x);
    const sy = sideOf(w, y);
    if (sx && sy && sx !== sy) return true;
  }
  return false;
}

/** A warrior: grown-up, brave or warlike (or a soldier or leader), and in a war. */
export function isWarrior(h: Human, sim: Sim) {
  if (stage(h, sim.time) !== 'adult' || has(h, 'cowardly') || !atWar(sim, h)) return false;
  return has(h, 'brave') || has(h, 'warlike') || h.job === 'soldier' || sim.villages.some((v) => v.leader === h.id);
}

/** The army someone marches with, if any. */
export const armyOf = (sim: Sim, h: Human) => sim.armies.find((a) => a.members.includes(h.id));

/** Gathering or hunting close to a village of another people annoys them. */
export function trespass(h: Human, sim: Sim) {
  for (const v of sim.villages) {
    if (v.ruin || v.people === h.people) continue;
    if (Math.hypot(v.x - h.x, v.y - h.y) < 12) shiftMood(sim, h.people, v.people, -0.3);
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

const hasWall = (v: Village) => v.buildings.some((b) => b.kind === 'wall');
export const wallIntact = (v: Village) => hasWall(v) && (v.wallHp ?? WALL_HP) > 0;
const villageById = (sim: Sim, id: number) => sim.villages.find((v) => v.id === id);

/** Once a second: moods drift, alliances and wars start, armies move, places fall, wars end. */
export function warTick(sim: Sim) {
  const by = villagesBy(sim);
  const present = PEOPLES.filter((p) => by.has(p));

  // Peoples
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i];
      const b = present[j];
      if (warBetween(sim, a, b)) continue;
      // Two peoples on one small island always compete a little; close borders make it worse
      let border = 0;
      for (const va of by.get(a)!) for (const vb of by.get(b)!) border += Math.max(0, 1 - Math.hypot(va.x - vb.x, va.y - vb.y) / 60) * 0.2;
      shiftMood(sim, a, b, -(0.05 + border));
      // Long peace calms things down slowly; a common enemy brings people together
      shiftMood(sim, a, b, 0.04);
      const common = enemiesOf(sim, a).some((e) => enemiesOf(sim, b).includes(e));
      if (common) shiftMood(sim, a, b, 0.3);
      const m = moodOf(sim, a, b);
      const k = pairKey(a, b);
      if (!sim.alliances.has(k) && m >= ALLY_AT) {
        sim.alliances.add(k);
        sim.chronicle.add({ year: sim.year, kind: 'alliance', a: { id: 0, name: '', people: a }, p: a, q: b, x: 0, y: 0 });
      } else if (sim.alliances.has(k) && m < ALLY_END) {
        sim.alliances.delete(k);
        sim.chronicle.add({ year: sim.year, kind: 'allianceEnd', a: { id: 0, name: '', people: a }, p: a, q: b, x: 0, y: 0 });
      }
      if (m < WAR_AT) declare(sim, a, b, by);
    }
  }

  // Feuds between big neighbouring places of one people
  for (const list of by.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        feudMood(sim, list[i], list[j]);
      }
    }
  }

  armyTick(sim);

  for (const [k, war] of sim.wars) {
    // A place with attackers on its square and nobody left to defend it falls;
    // a city wall has to be breached first
    for (const v of sim.villages) {
      if (v.ruin) continue;
      const side = sideOf(war, partyOf(v));
      if (!side || wallIntact(v)) continue;
      const enemy = other(side);
      const attackers = sim.near(v.x + 0.5, v.y + 0.5, 6, (o) => o.kind === 'human' && stage(o as Human, sim.time) === 'adult' && sideOf(war, o as Human) === enemy);
      if (attackers.length < 2) continue;
      const defenders = sim.near(v.x + 0.5, v.y + 0.5, 12, (o) => o.kind === 'human' && (o as Human).village === v.id && stage(o as Human, sim.time) === 'adult' && !has(o as Human, 'cowardly'));
      if (defenders.length) continue;
      if (war.va !== undefined) {
        // The subdued place already paid half of its stores
        subdue(sim, v, attackers[0] as Human);
        endWar(sim, k, war, null);
        break;
      }
      conquer(sim, v, enemy === 'a' ? war.a : war.b, attackers[0] as Human);
    }
    if (!sim.wars.has(k)) continue;
    const feud = war.va !== undefined;
    const tired = sim.time - war.started > (feud ? FEUD_YEARS : WAR_YEARS) * YEAR;
    const beaten = (['a', 'b'] as Side[]).find((s) => {
      const key = sideKey(war, s);
      return war.warriors[key] > 0 && war.lost[key] > war.warriors[key] / 2;
    });
    let gone = false;
    if (feud) {
      const va = villageById(sim, war.va!);
      const vb = villageById(sim, war.vb!);
      gone = !va || !vb || va.ruin || vb.ruin || va.people !== vb.people;
    } else gone = !by.has(war.a) || !by.has(war.b);
    if (tired || beaten || gone) endWar(sim, k, war, beaten ?? null, gone);
  }
}

/** Mood between two villages of one people; a feud when it gets too low. */
function feudMood(sim: Sim, a: Village, b: Village) {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d > FEUD_RANGE) return;
  const k = feudKey(a.id, b.id);
  if (sim.wars.has(k)) return;
  // Only big places get in each other's way
  if (a.members >= 8 && b.members >= 8) shiftVillageMood(sim, a.id, b.id, -(0.05 + (1 - d / FEUD_RANGE) * 0.1));
  shiftVillageMood(sim, a.id, b.id, 0.02);
  const la = a.leader !== undefined ? (sim.byId(a.leader) as Human | undefined) : undefined;
  const lb = b.leader !== undefined ? (sim.byId(b.leader) as Human | undefined) : undefined;
  if (la && lb && (relOf(la, lb) <= RIVAL || relOf(lb, la) <= RIVAL)) shiftVillageMood(sim, a.id, b.id, -0.15);
  if ((sim.vmood.get(k) ?? 0) >= WAR_AT || a.members < 8 || b.members < 8) return;
  startFeud(sim, a, b, { year: sim.year, kind: 'feud', a: la ? refOf(la) : { id: 0, name: a.name, people: a.people }, v: a.name, w: b.name, x: a.x, y: a.y });
}

/** A war between two places of one people (a feud, or rebels against their capital). */
export function startFeud(sim: Sim, a: Village, b: Village, entry: Omit<ChronicleEntry, 'id'>) {
  const k = feudKey(a.id, b.id);
  if (sim.wars.has(k)) return;
  const count = (v: Village) => sim.humans.filter((h) => h.village === v.id && warriorLike(h, sim)).length;
  sim.wars.set(k, { a: a.people, b: b.people, va: a.id, vb: b.id, started: sim.time, warriors: { [a.id]: count(a), [b.id]: count(b) }, lost: { [a.id]: 0, [b.id]: 0 } });
  sim.chronicle.add(entry);
}

/** Would fight in a war (brave, warlike, soldier or leader; never cowardly). */
function warriorLike(h: Human, sim: Sim) {
  if (stage(h, sim.time) !== 'adult' || has(h, 'cowardly')) return false;
  return has(h, 'brave') || has(h, 'warlike') || h.job === 'soldier' || sim.villages.some((v) => v.leader === h.id);
}

function declare(sim: Sim, a: People, b: People, by: Map<People, Village[]>, ally = false) {
  if (warBetween(sim, a, b)) return;
  // The leader of the village of `a` closest to `b` declares it
  let best: { v: Village; d: number } | null = null;
  for (const va of by.get(a) ?? []) for (const vb of by.get(b) ?? []) {
    const d = Math.hypot(va.x - vb.x, va.y - vb.y);
    if (!best || d < best.d) best = { v: va, d };
  }
  // A kingdom's war is declared by the king from the capital
  const kingdom = sim.kingdoms.get(a);
  const king = kingdom?.king !== undefined ? (sim.byId(kingdom.king) as Human | undefined) : undefined;
  const capital = king && sim.villages.find((x) => x.id === kingdom!.capital);
  const v = capital ?? best?.v;
  const leader = king ?? (v?.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined);
  const count = (p: People) => sim.humans.filter((h) => h.people === p && warriorLike(h, sim)).length;
  const war: War = { a, b, started: sim.time, warriors: { [a]: count(a), [b]: count(b) }, lost: { [a]: 0, [b]: 0 } };
  sim.wars.set(pairKey(a, b), war);
  sim.alliances.delete(pairKey(a, b));
  if (ally) {
    sim.chronicle.add({ year: sim.year, kind: 'joinWar', a: { id: 0, name: '', people: a }, p: a, q: b, x: v?.x ?? 0, y: v?.y ?? 0 });
    return;
  }
  sim.chronicle.add({
    year: sim.year,
    kind: 'war',
    a: leader ? refOf(leader) : { id: 0, name: v?.name ?? '', people: a },
    v: v?.name,
    p: b,
    x: v ? v.x : 0,
    y: v ? v.y : 0,
  });
  // Allies stand by each other (unless they are friends with both sides)
  for (const [mine, foe] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const c of PEOPLES) {
      if (c === mine || c === foe || !by.has(c) || !allied(sim, c, mine) || allied(sim, c, foe)) continue;
      declare(sim, c, foe, by, true);
    }
  }
}

/** Peace: a treaty for 15 years; a beaten side pays a fifth of its stores to the winners. */
function endWar(sim: Sim, k: string, war: War, loser: Side | null, gone = false) {
  sim.wars.delete(k);
  sim.armies = sim.armies.filter((a) => a.war !== k);
  if (gone) return;
  const feud = war.va !== undefined;
  sim.treaties.set(k, sim.time + TREATY_YEARS * YEAR);
  if (feud) sim.vmood.set(k, -10);
  else sim.mood.set(k, -10);
  if (loser && !feud) lostWar(sim, loser === 'a' ? war.a : war.b);
  if (loser) {
    const winners = sim.villages.filter((v) => !v.ruin && sideOf(war, partyOf(v)) === other(loser)).sort((x, y) => y.members - x.members);
    const capital = winners[0];
    // The winners celebrate
    celebrate(sim, capital, 'victory');
    if (capital) {
      for (const v of sim.villages) {
        if (v.ruin || sideOf(war, partyOf(v)) !== loser) continue;
        for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
          const n = Math.floor(v[res] / 5);
          v[res] -= n;
          capital[res] += n;
        }
      }
    }
  }
  const va = feud ? villageById(sim, war.va!) : undefined;
  const vb = feud ? villageById(sim, war.vb!) : undefined;
  sim.chronicle.add({
    year: sim.year,
    kind: 'peace',
    a: { id: 0, name: '', people: war.a },
    p: war.a,
    q: war.b,
    v: va?.name,
    w: vb?.name,
    loser: loser ? sideKey(war, loser) : undefined,
    x: va?.x ?? 0,
    y: va?.y ?? 0,
  });
}

/* ---- armies --------------------------------------------------------------------- */

function armyTick(sim: Sim) {
  // New armies: a place in a war with at least three warriors ready and no army out
  for (const [key, war] of sim.wars) {
    for (const v of sim.villages) {
      if (v.ruin || (v.armyAt ?? 0) > sim.time) continue;
      const side = sideOf(war, partyOf(v));
      if (!side || sim.armies.some((a) => a.from === v.id)) continue;
      const target = nearestTarget(sim, war, other(side), v);
      if (!target) continue;
      const ready = sim.humans.filter(
        (h) => h.village === v.id && isWarrior(h, sim) && h.hp > h.maxHp * 0.6 && !armyOf(sim, h) && Math.hypot(h.x - v.x, h.y - v.y) < 25,
      );
      if (ready.length < 3) continue;
      const general = ready.find((h) => h.id === v.leader) ?? [...ready].sort((x, y) => Number(has(y, 'brave')) - Number(has(x, 'brave')) || x.born - y.born)[0];
      sim.armies.push({ id: sim.nextArmyId++, war: key, people: v.people, from: v.id, target: target.id, general: general.id, members: ready.map((h) => h.id), state: 'gather', until: sim.time + 12 });
      for (const h of ready) equip(h, v);
      sim.chronicle.add({ year: sim.year, kind: 'army', a: refOf(general), v: v.name, w: target.name, n: ready.length, x: v.x, y: v.y });
    }
  }

  for (const army of [...sim.armies]) {
    const war = sim.wars.get(army.war);
    const from = villageById(sim, army.from);
    army.members = army.members.filter((id) => {
      const h = sim.byId(id) as Human | undefined;
      return !!h && isWarrior(h, sim) && h.hp > h.maxHp * 0.35;
    });
    const side = war && from ? sideOf(war, partyOf(from)) : null;
    if (!war || !from || from.ruin || from.people !== army.people || !side || army.members.length < 2) {
      disband(sim, army);
      continue;
    }
    // The target fell or changed sides: on to the next one, or home
    let target = villageById(sim, army.target);
    if (!target || target.ruin || sideOf(war, partyOf(target)) !== other(side)) {
      target = nearestTarget(sim, war, other(side), from) ?? undefined;
      if (!target) {
        disband(sim, army);
        continue;
      }
      army.target = target.id;
      army.state = 'march';
    }
    if (!army.members.includes(army.general)) army.general = army.members[0];
    const general = sim.byId(army.general) as Human;
    if (army.state === 'gather' && sim.time >= army.until) army.state = 'march';
    const near = Math.hypot(general.x - target.x, general.y - target.y) < 14;
    if (army.state === 'march' && near && wallIntact(target)) army.state = 'siege';
    if (army.state === 'siege') {
      if (!wallIntact(target)) {
        army.state = 'march';
        continue;
      }
      // Everyone close to the wall chips away at it
      let at = 0;
      for (const id of army.members) {
        const h = sim.byId(id) as Human;
        const d = Math.hypot(h.x - target.x, h.y - target.y);
        if (d > 7 && d < 14) at++;
      }
      target.wallHp = (target.wallHp ?? WALL_HP) - at * 0.4;
      if (at) {
        const ang = sim.rand() * Math.PI * 2;
        sim.puff(target.x + 0.5 + Math.cos(ang) * 11, target.y + 0.5 + Math.sin(ang) * 8.8, 4, ['#b4b9c2', '#8d929c', '#ffffff']);
      }
      if (target.wallHp <= 0) {
        target.buildings = target.buildings.filter((b) => b.kind !== 'wall');
        target.wallHp = undefined;
        army.state = 'march';
        sim.puff(target.x + 0.5, target.y, 16, ['#b4b9c2', '#8d929c', '#ffffff', '#ffe066']);
        sim.chronicle.add({ year: sim.year, kind: 'breach', a: refOf(general), v: from.name, w: target.name, x: target.x, y: target.y });
      }
    }
  }
}

function disband(sim: Sim, army: Army) {
  sim.armies = sim.armies.filter((a) => a !== army);
  const from = villageById(sim, army.from);
  // A while before the next army sets out from there
  if (from) from.armyAt = sim.time + 20;
}

/** The closest place on the other side of this war. */
function nearestTarget(sim: Sim, war: War, side: Side, from: Village): Village | null {
  let best: Village | null = null;
  let bestD = Infinity;
  for (const v of sim.villages) {
    if (v.ruin || sideOf(war, partyOf(v)) !== side) continue;
    const d = Math.hypot(v.x - from.x, v.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/* ---- weapons and armour --------------------------------------------------------- */

export const WEAPONS = ['club', 'bronze', 'iron'] as const;
export type Weapon = (typeof WEAPONS)[number];

/** How hard a weapon hits in war (no weapon: fists and sticks). */
export const WEAPON_POWER: Record<Weapon | 'none', number> = { none: 1, club: 1.15, bronze: 1.35, iron: 1.6 };

/** Armour takes this much off every blow in war. */
export const ARMOR = 0.7;

/** Takes the best weapon (and armour) the village has in store, if better than their own. */
export function equip(h: Human, v: Village) {
  const arms = v.arms;
  for (const w of [...WEAPONS].reverse()) {
    if (arms[w] < 1) continue;
    if (h.weapon && WEAPONS.indexOf(h.weapon) >= WEAPONS.indexOf(w)) break;
    arms[w]--;
    h.weapon = w;
    break;
  }
  if (!h.armor && arms.armor >= 1) {
    arms.armor--;
    h.armor = true;
  }
}

/* ---- conquest --------------------------------------------------------------------- */

/** The winners take the village: new colour, its people join them. */
function conquer(sim: Sim, v: Village, winner: People, by: Human) {
  const loser = v.people;
  v.people = winner;
  v.leader = undefined;
  // It becomes a vassal of the winners, not a happy one
  v.free = false;
  v.loyalty = 35;
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

/** A feud is lost: half of the stores go to the winners, the leader has to go. */
function subdue(sim: Sim, v: Village, by: Human) {
  const winner = villageById(sim, by.village ?? -1);
  if (winner) {
    for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
      const n = Math.floor(v[res] / 2);
      v[res] -= n;
      winner[res] += n;
    }
  }
  v.leader = undefined;
  for (const h of sim.humans) if (h.village === v.id) story(h, sim, 'conquered', v.name);
  sim.puff(v.x + 0.5, v.y, 10, ['#ffffff', '#ffe066', '#f1e2c4']);
  sim.chronicle.add({ year: sim.year, kind: 'subdued', a: refOf(by), v: winner?.name ?? '', w: v.name, x: v.x, y: v.y });
  // Kingdoms: rebels who take the capital overthrow the king, beaten rebels come back
  if (winner) onSubdued(sim, v, winner);
}

/** A death in a war counts against that side (for "lost more than half"). */
export function countLoss(sim: Sim, dead: Human) {
  if (dead.attacker === undefined) return;
  const killer = (sim.byId(dead.attacker) as Human | undefined) ?? sim.registry.get(dead.attacker);
  if (!killer) return;
  for (const w of sim.wars.values()) {
    const sd = sideOf(w, dead);
    const sk = sideOf(w, killer as Party);
    if (!sd || !sk || sd === sk) continue;
    const key = sideKey(w, sd);
    w.lost[key] = (w.lost[key] ?? 0) + 1;
  }
}
