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
import { knows } from './inventions';
import { armyTag, assignUnits, endBattles, findBattles, muster, releaseUnits, UNIT } from './armies';
import { canShip, ferryHome, shipArmy } from './ships';
import { independenceOver } from './colonies';
import { councilVote, defenders, leagueTag, sharedLeague } from './leagues';
import { has, PEOPLES, stage, stat, type Human, type People } from './agents';
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
  /** What the side that declared it wants (phase F): a place, tribute or revenge. Feuds have none. */
  goal?: { kind: 'conquest' | 'tribute' | 'revenge'; village?: number };
  /** Battles won by each side. */
  wins?: { a: number; b: number };
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
  /** `sail`: on warships over the sea (phase G). */
  state: 'gather' | 'march' | 'siege' | 'sail';
  /** Gathering ends at this game time. */
  until: number;
  /** Phase F: its name, morale 0 … 100, how many set out, the way it faces and the battle it is in. */
  name?: { age: number; noun: number; general: string };
  morale?: number;
  size0?: number;
  dir?: { x: number; y: number };
  battle?: { enemy: number; place: string; since: number; ids: number[]; foe: string; foeIds: number[] };
  /** Phase G: its target lies overseas, and it has gone ashore there. */
  sea?: boolean;
  landed?: boolean;
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
  if (stage(h, sim.time) !== 'adult' || !atWar(sim, h) || (h.fleeHome ?? 0) > sim.time) return false;
  // The levy (phase F): called up into an army
  if (h.unit) return true;
  if (has(h, 'cowardly')) return false;
  return has(h, 'brave') || has(h, 'warlike') || h.job === 'soldier' || stat(h, 'courage') >= 8 || sim.villages.some((v) => v.leader === h.id);
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

/** A wall's full strength: castles (phase E) build it twice as strong. */
export const wallMax = (sim: Sim, v: Village) => (knows(sim, v.people, 'castle') ? WALL_HP * 2 : WALL_HP);
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
      // Peoples that never met (phase G: islands far apart) leave each other alone
      if (!contact(sim, by.get(a)!, by.get(b)!)) continue;
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
        // A colony that rose up and lost goes back to its mother (phase G)
        const winner = villageById(sim, side === 'a' ? war.vb! : war.va!);
        independenceOver(sim, v, winner, winner);
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
    if (tired || beaten || gone) {
      endWar(sim, k, war, beaten ?? null, gone);
      continue;
    }
    // A war goal reached, or the attackers see it is hopeless
    const goal = goalReached(sim, war);
    if (goal) endWar(sim, k, war, goal);
  }
}

/** The side that has to give in: the defenders once the goal is reached, the attackers after three lost battles. */
function goalReached(sim: Sim, war: War): Side | null {
  if (!war.goal) return null;
  const wins = war.wins ?? { a: 0, b: 0 };
  if (wins.b >= 3 && wins.b > wins.a) return 'a';
  const lostB = war.warriors[war.b] > 0 ? (war.lost[war.b] ?? 0) / war.warriors[war.b] : 0;
  switch (war.goal.kind) {
    case 'conquest': {
      const v = war.goal.village !== undefined ? villageById(sim, war.goal.village) : undefined;
      return v && !v.ruin && v.people === war.a ? 'b' : null;
    }
    case 'tribute':
      return wins.a >= 2 || lostB > 0.3 ? 'b' : null;
    case 'revenge':
      return wins.a >= 1 || lostB > 0.25 ? 'b' : null;
  }
}

/**
 * Do two peoples know each other? They share an island, or one of them has a
 * harbor and the other one's places are out of the fog (phase G). On an old
 * island everyone shares the one island.
 */
function contact(sim: Sim, as: Village[], bs: Village[]) {
  const w = sim.world;
  if (as.some((x) => bs.some((y) => w.sameLand(x.x, x.y, y.x, y.y)))) return true;
  const sails = (list: Village[]) => list.some((v) => v.buildings.some((b) => b.kind === 'harbor'));
  const known = (list: Village[]) => list.some((v) => w.seen(v.x, v.y));
  return (sails(as) && known(bs)) || (sails(bs) && known(as));
}

/** Mood between two villages of one people; a feud when it gets too low. */
function feudMood(sim: Sim, a: Village, b: Village) {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d > FEUD_RANGE) return;
  const k = feudKey(a.id, b.id);
  if (sim.wars.has(k)) return;
  // Members of one league do not feud
  if (sim.leagues.some((l) => l.members.includes(a.id) && l.members.includes(b.id))) return;
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
  // Peoples sitting together in a league never go to war with each other
  if (sharedLeague(sim, a, b)) {
    sim.mood.set(pairKey(a, b), Math.max(moodOf(sim, a, b), -40));
    return;
  }
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
  // A league member asks its council first (leagues.ts)
  let joiners: People[] = [];
  if (!ally && v) {
    const vote = councilVote(sim, v, b);
    if (vote.league) {
      sim.chronicle.add({ year: sim.year, kind: vote.ok ? 'leagueVote' : 'leagueVeto', a: { id: 0, name: v.name, people: a }, v: v.name, p: b, u: leagueTag(vote.league), x: v.x, y: v.y });
      if (!vote.ok) {
        sim.mood.set(pairKey(a, b), -40);
        return;
      }
      joiners = vote.join;
    }
  }
  const war: War = { a, b, started: sim.time, warriors: { [a]: count(a), [b]: count(b) }, lost: { [a]: 0, [b]: 0 }, wins: { a: 0, b: 0 } };
  // The war goal: revenge after an old war, a place when much stronger, else tribute
  const size = (p: People) => (by.get(p) ?? []).reduce((n, x) => n + x.members, 0);
  const prize = v ? [...(by.get(b) ?? [])].sort((x, y) => Math.hypot(x.x - v.x, x.y - v.y) - Math.hypot(y.x - v.x, y.y - v.y))[0] : undefined;
  if (!ally) {
    if (sim.grudges.get(pairKey(a, b)) === a) war.goal = { kind: 'revenge' };
    else if (prize && size(a) > size(b) * 1.2) war.goal = { kind: 'conquest', village: prize.id };
    else war.goal = { kind: 'tribute' };
  }
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
    cause: war.goal?.kind,
    w: war.goal?.kind === 'conquest' ? prize?.name : undefined,
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
  // The league goes with the vote, and leagues defend their members
  for (const c of joiners) declare(sim, c, b, by, true);
  for (const c of defenders(sim, b, a)) declare(sim, c, a, by, true);
}

/** Ends a war between two peoples with a treaty (a wedding, a love, later a god gift). */
export function makePeace(sim: Sim, a: People, b: People) {
  const k = pairKey(a, b);
  const w = sim.wars.get(k);
  if (w) endWar(sim, k, w, null);
}

/** A war declared for a reason of its own (a war of succession). */
export function declareWar(sim: Sim, a: People, b: People) {
  declare(sim, a, b, villagesBy(sim));
}

/** Peace: a treaty for 15 years; a beaten side pays a fifth of its stores to the winners. */
function endWar(sim: Sim, k: string, war: War, loser: Side | null, gone = false) {
  sim.wars.delete(k);
  for (const a of sim.armies) {
    if (a.war !== k) continue;
    if (a.landed) ferryHome(sim, a);
    releaseUnits(sim, a);
  }
  // A war of independence (phase G): the colony is free unless its mother won
  if (war.va !== undefined) {
    const va = villageById(sim, war.va);
    const vb = villageById(sim, war.vb!);
    const winner = loser === 'a' ? vb : loser === 'b' ? va : undefined;
    independenceOver(sim, va, vb, winner);
  }
  sim.armies = sim.armies.filter((a) => a.war !== k);
  if (gone) return;
  const feud = war.va !== undefined;
  sim.treaties.set(k, sim.time + TREATY_YEARS * YEAR);
  if (feud) sim.vmood.set(k, -10);
  else sim.mood.set(k, -10);
  if (loser && !feud) lostWar(sim, loser === 'a' ? war.a : war.b);
  if (!feud) {
    if (loser) sim.grudges.set(k, loser === 'a' ? war.a : war.b);
    else sim.grudges.delete(k);
  }
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
    for (const v of [...sim.villages].sort((x, y) => y.members - x.members)) {
      if (v.ruin || (v.armyAt ?? 0) > sim.time) continue;
      const side = sideOf(war, partyOf(v));
      if (!side || sim.armies.some((a) => a.from === v.id)) continue;
      // Over land if possible; overseas only with warships (phase G)
      let target = nearestTarget(sim, war, other(side), v, false);
      const sea = !target && canShip(sim, v);
      if (sea) target = nearestTarget(sim, war, other(side), v, true);
      if (!target) continue;
      const ready = sim.humans.filter(
        (h) => h.village === v.id && isWarrior(h, sim) && h.hp > h.maxHp * 0.6 && !armyOf(sim, h) && Math.hypot(h.x - v.x, h.y - v.y) < 25,
      );
      if (ready.length < 3) continue;
      // The leader, else the one with the most courage and wits
      const general = ready.find((h) => h.id === v.leader) ?? [...ready].sort((x, y) => stat(y, 'courage') + stat(y, 'intelligence') - stat(x, 'courage') - stat(x, 'intelligence'))[0];
      // Phase F: the levy joins the warriors (up to 30 % of the grown-ups, at most 150)
      const neighbours =
        war.va === undefined
          ? sim.villages.filter((o) => !o.ruin && o !== v && o.people === v.people && Math.hypot(o.x - v.x, o.y - v.y) < 35 && !sim.armies.some((a) => a.from === o.id))
          : [];
      const members = muster(sim, v, ready, neighbours);
      const levy = members.length - ready.length;
      if (levy > 0) war.warriors[sideKey(war, side)] = (war.warriors[sideKey(war, side)] ?? 0) + levy;
      // The levy of the neighbours needs a little longer to come; those places raise no army of their own for now
      const far = members.some((h) => h.village !== v.id);
      for (const o of neighbours) if (members.some((h) => h.village === o.id)) o.armyAt = sim.time + 40;
      const army: Army = { id: sim.nextArmyId++, war: key, people: v.people, from: v.id, target: target.id, general: general.id, members: members.map((h) => h.id), state: 'gather', until: sim.time + (far ? 25 : 12), sea };
      sim.armies.push(army);
      for (const h of members) equip(h, v);
      assignUnits(sim, army, members, v);
      sim.chronicle.add({ year: sim.year, kind: 'army', a: refOf(general), v: v.name, w: target.name, n: members.length, u: armyTag(army), x: v.x, y: v.y });
    }
  }

  for (const army of [...sim.armies]) {
    const war = sim.wars.get(army.war);
    const from = villageById(sim, army.from);
    const before = army.members;
    const generalDied = !sim.byId(army.general);
    army.members = army.members.filter((id) => {
      const h = sim.byId(id) as Human | undefined;
      return !!h && isWarrior(h, sim) && h.hp > h.maxHp * 0.35;
    });
    // Losses cost morale, the general's death much more
    morale(army, before.length, generalDied);
    for (const id of before) {
      if (army.members.includes(id)) continue;
      const h = sim.byId(id) as Human | undefined;
      if (h) {
        h.slot = undefined;
        if (from && h.unit && UNIT[h.unit].mounted) from.horses = (from.horses ?? 0) + 1;
        h.unit = undefined;
      }
    }
    const side = war && from ? sideOf(war, partyOf(from)) : null;
    if (!war || !from || from.ruin || from.people !== army.people || !side || army.members.length < 2) {
      disband(sim, army);
      continue;
    }
    // At sea: the ships carry it (ships.ts)
    if (army.state === 'sail') continue;
    // The target fell or changed sides: on to the next one on this island, or home
    let target = villageById(sim, army.target);
    if (!target || target.ruin || sideOf(war, partyOf(target)) !== other(side)) {
      const here = (sim.byId(army.general) as Human | undefined) ?? from;
      target = nearestTarget(sim, war, other(side), here, false) ?? undefined;
      if (!target) {
        disband(sim, army);
        continue;
      }
      army.target = target.id;
      army.state = 'march';
    }
    if (!army.members.includes(army.general)) {
      // The bravest and wisest one left takes over in the middle
      const next = army.members.map((id) => sim.byId(id) as Human).sort((x, y) => stat(y, 'courage') + stat(y, 'intelligence') - stat(x, 'courage') - stat(x, 'intelligence'))[0];
      army.general = next.id;
      next.slot = { f: 0, r: 0, army: army.id };
    }
    const general = sim.byId(army.general) as Human;
    // The way the army faces: at the enemy army in a battle, else at its target
    const foeArmy = army.battle ? sim.armies.find((x) => x.id === army.battle!.enemy) : undefined;
    const foe = foeArmy ? (sim.byId(foeArmy.general) as Human | undefined) : undefined;
    const fx = (foe ? foe.x : target.x + 0.5) - general.x;
    const fy = (foe ? foe.y : target.y + 0.5) - general.y;
    const fd = Math.hypot(fx, fy);
    if (fd > 1) army.dir = { x: fx / fd, y: fy / fd };
    if (army.state === 'gather' && sim.time >= army.until) {
      // Overseas: aboard the warships
      if (army.sea && !army.landed) {
        if (shipArmy(sim, army, from, target)) army.state = 'sail';
        else disband(sim, army);
        continue;
      }
      army.state = 'march';
    }
    const near = Math.hypot(general.x - target.x, general.y - target.y) < 14;
    if (army.state === 'march' && near && wallIntact(target)) army.state = 'siege';
    if (army.state === 'siege') {
      if (!wallIntact(target)) {
        army.state = 'march';
        continue;
      }
      // Everyone close to the wall chips away at it; catapults and cannons much more
      let at = 0;
      for (const id of army.members) {
        const h = sim.byId(id) as Human;
        const d = Math.hypot(h.x - target.x, h.y - target.y);
        if (d > 7 && d < 14) at += h.unit ? UNIT[h.unit].siege : 1;
      }
      target.wallHp = (target.wallHp ?? wallMax(sim, target)) - at * 0.4;
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

  // Battles (armies.ts): armies of both sides meet; whoever runs goes home
  const sideOfArmy = (a: Army) => {
    const w = sim.wars.get(a.war);
    const from = villageById(sim, a.from);
    return w && from ? sideOf(w, partyOf(from)) : null;
  };
  findBattles(sim, sideOfArmy);
  const { ran, won } = endBattles(sim);
  for (const a of won) {
    const w = sim.wars.get(a.war);
    const s = sideOfArmy(a);
    if (w && s) {
      w.wins = w.wins ?? { a: 0, b: 0 };
      w.wins[s]++;
    }
  }
  for (const a of ran) {
    const g = (sim.byId(a.general) as Human | undefined) ?? (a.members.length ? (sim.byId(a.members[0]) as Human) : undefined);
    if (g) sim.chronicle.add({ year: sim.year, kind: 'rout', a: refOf(g), u: armyTag(a), x: g.x, y: g.y });
    for (const id of a.members) {
      const h = sim.byId(id) as Human | undefined;
      if (h) h.fleeHome = sim.time + 20;
    }
    disband(sim, a);
  }
}

/** Morale: a loss costs in proportion to the army's size, the general's death 30 points; it comes back slowly. */
function morale(army: Army, before: number, generalDied: boolean) {
  const lost = before - army.members.length;
  let m = army.morale ?? 100;
  if (lost > 0) m -= (lost / Math.max(4, army.size0 ?? before)) * 150;
  if (generalDied) m -= 30;
  if (!army.battle) m += 0.5;
  army.morale = Math.max(0, Math.min(100, m));
}

function disband(sim: Sim, army: Army) {
  sim.armies = sim.armies.filter((a) => a !== army);
  // Overseas: whoever cannot walk home gets a ship (phase G)
  if (army.landed) ferryHome(sim, army);
  releaseUnits(sim, army);
  const from = villageById(sim, army.from);
  // A while before the next army sets out from there
  if (from) from.armyAt = sim.time + 20;
}

/** The closest place on the other side of this war: on the same island, or (`overseas`) anywhere. */
function nearestTarget(sim: Sim, war: War, side: Side, from: { x: number; y: number }, overseas: boolean): Village | null {
  let best: Village | null = null;
  let bestD = Infinity;
  for (const v of sim.villages) {
    if (v.ruin || sideOf(war, partyOf(v)) !== side) continue;
    if (!overseas && !sim.world.sameLand(from.x, from.y, v.x, v.y)) continue;
    const d = Math.hypot(v.x - from.x, v.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = v;
    }
  }
  return best;
}

/* ---- weapons and armour --------------------------------------------------------- */

export const WEAPONS = ['club', 'bronze', 'iron', 'musket'] as const;
export type Weapon = (typeof WEAPONS)[number];

/** How hard a weapon hits in war (no weapon: fists and sticks). */
export const WEAPON_POWER: Record<Weapon | 'none', number> = { none: 1, club: 1.15, bronze: 1.35, iron: 1.6, musket: 1.9 };

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
    // New people, new hit points (health still counts)
    sim.applyHealth(h);
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
