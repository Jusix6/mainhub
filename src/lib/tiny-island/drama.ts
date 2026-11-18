/**
 * Memories, families and drama (Update 2, phase C).
 *
 * Memories: everyone remembers who helped or hurt them, with a strength from
 * -100 (grudge) to +100 (gratitude). They fade a little every year (strong
 * ones hardly), at most 20 are kept (the strongest). A new memory also moves
 * how that person feels about the other one.
 *
 * Families: everyone has a family name (children take the father's, else the
 * mother's). A couple from a big family (ten or more living) often starts a
 * branch of its own with a new name (social.ts). A killing makes the victim's family remember the killer and dislike
 * his whole family. Vengeful (and cruel) people hunt the killer, even years
 * later and across borders; a revenge killing starts a blood feud between the
 * two families that can go on for generations, until one family dies out or
 * a kind or pious member forgives.
 *
 * Dramas: jealous partners grow angry at very close friends of their partner
 * (a fight, maybe the end of the couple); couples whose love has cooled go
 * separate ways; old wise people take a young student (intelligence, maybe a
 * trait); lovers from peoples at war either run away together or their
 * wedding ends the war.
 *
 * Marriage diplomacy: every few years a ruler marries a grown child to a
 * child of another ruler. The spouse moves (with a dowry), the peoples like
 * each other much more, often they become allies, a war may end. A child of
 * two royal lines carries both claims: when the other throne has no heir of
 * its own, that leads to a personal union (good mood) or a war of succession.
 */
import { ageOf, has, stage, stat, type Agent, type Human, type People } from './agents';
import type { Ref } from './chronicle';
import type { Sim } from './sim';
import { changeRel, match, refOf, relOf, single, startBrawl, story, think } from './social';
import { join, type Village } from './villages';
import { T } from './world';
import { allied, declareWar, makePeace, moodOf, pairKey, shiftMood, warBetween } from './war';

export type MemoryKind = 'killedKin' | 'savedMe' | 'beatMe' | 'leftMe' | 'jealous' | 'teacher' | 'student' | 'avenged';

export interface Memory {
  /** The other person, as they were. */
  id: number;
  name: string;
  family?: string;
  kind: MemoryKind;
  /** -100 … +100. */
  s: number;
  year: number;
  /** Who of the family it was about ("father", "sister" …). */
  rel?: string;
}

export interface BloodFeud {
  a: string;
  b: string;
  since: number;
  deaths: number;
}

const YEAR = 30;
const MAX_MEMORIES = 20;

export const feudOf = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** A new memory (a stronger one of the same kind about the same person replaces it). */
export function remember(sim: Sim, h: Human, o: { id: number; name: string; surname?: string }, kind: MemoryKind, s: number, rel?: string) {
  if (h.dead || h.id === o.id) return;
  const list = h.memories ?? (h.memories = []);
  const old = list.find((m) => m.id === o.id && m.kind === kind);
  if (old) {
    if (Math.abs(s) >= Math.abs(old.s)) Object.assign(old, { s, year: sim.year, rel });
  } else list.push({ id: o.id, name: o.name, family: o.surname, kind, s, year: sim.year, rel });
  list.sort((a, b) => Math.abs(b.s) - Math.abs(a.s));
  if (list.length > MAX_MEMORIES) list.length = MAX_MEMORIES;
  h.rel.set(o.id, Math.max(-100, Math.min(100, (h.rel.get(o.id) ?? 0) + s / 2)));
}

/** The living relatives of someone, with what the victim was to them. */
function kinOf(sim: Sim, v: Human): [Human, string][] {
  const out: [Human, string][] = [];
  const add = (id: number | undefined, rel: string) => {
    const k = id !== undefined ? (sim.byId(id) as Human | undefined) : undefined;
    if (k && !out.some(([x]) => x === k)) out.push([k, rel]);
  };
  add(v.partner, 'partner');
  for (const id of v.children) add(id, v.female ? 'mother' : 'father');
  for (const id of v.parents) add(id, v.female ? 'daughter' : 'son');
  for (const h of sim.humans) {
    if (h !== v && h.parents.some((p) => v.parents.includes(p))) add(h.id, v.female ? 'sister' : 'brother');
  }
  return out;
}

/** Called for every kill by a person (sim.ts): saving, grudges, revenge, blood feuds. */
export function onKilled(sim: Sim, victim: Agent, killer: Human) {
  // Whoever the victim was going for was saved
  const saved = victim.task?.target !== undefined ? (sim.byId(victim.task.target) as Human | undefined) : undefined;
  if (saved && saved.kind === 'human' && saved !== killer) remember(sim, saved, killer, 'savedMe', 60);
  if (victim.kind !== 'human') return;
  const v = victim as Human;
  // Was this revenge? The killer remembered the victim (or the victim's family) for a killing
  const grudge = killer.memories?.find((m) => m.kind === 'killedKin' && (m.id === v.id || (m.family && m.family === v.surname)));
  for (const [k, rel] of kinOf(sim, v)) {
    remember(sim, k, killer, 'killedKin', -90, rel);
    // The whole family of the killer is not liked any more
    for (const o of sim.humans) if (o.surname && o.surname === killer.surname && o !== killer) k.rel.set(o.id, Math.min(k.rel.get(o.id) ?? 0, -30));
  }
  if (!grudge || !killer.surname || !v.surname || killer.surname === v.surname) return;
  sim.chronicle.add({ year: sim.year, kind: 'revenge', a: refOf(killer), b: refOf(v), c: { id: grudge.id, name: grudge.name, people: killer.people }, x: v.x, y: v.y });
  story(killer, sim, 'avenged', grudge.name);
  for (const [k, rel] of kinOf(sim, killer)) if (k.surname === killer.surname) remember(sim, k, killer, 'avenged', 50, rel);
  // A killing for a killing between two families: a blood feud
  const key = feudOf(killer.surname, v.surname);
  const feud = sim.bloodFeuds.get(key);
  if (feud) feud.deaths++;
  else {
    sim.bloodFeuds.set(key, { a: killer.surname, b: v.surname, since: sim.year, deaths: 2 });
    sim.chronicle.add({ year: sim.year, kind: 'bloodFeud', a: refOf(killer), v: killer.surname, w: v.surname, x: v.x, y: v.y });
  }
}

/** A fist fight ended: the one in worse shape remembers who beat them. */
export function onBrawlEnd(sim: Sim, a: Human, b: Human) {
  const [loser, winner] = a.hp < b.hp ? [a, b] : [b, a];
  remember(sim, loser, winner, 'beatMe', -25);
}

/** Someone worth going after: the killer of a relative, or (in a blood feud) any grown-up of the other family. */
export function revengeTarget(h: Human, sim: Sim): Human | null {
  if (stage(h, sim.time) !== 'adult' || has(h, 'cowardly') || h.hp < h.maxHp * 0.7 || !h.memories?.length) return null;
  const vengeful = has(h, 'vengeful') ? 1 : has(h, 'cruel') ? 0.6 : 0;
  if (!vengeful) return null;
  if (sim.rand() > 0.006 * vengeful) return null;
  for (const m of h.memories) {
    if (m.kind !== 'killedKin' || m.s > -70) continue;
    const killer = sim.byId(m.id) as Human | undefined;
    if (killer && Math.hypot(killer.x - h.x, killer.y - h.y) < 40) return killer;
    // The killer is gone: in a blood feud the rest of the family will do
    if (m.family && h.surname && sim.bloodFeuds.has(feudOf(m.family, h.surname))) {
      const other = sim.nearest(h.x, h.y, 15, (o) => o.kind === 'human' && (o as Human).surname === m.family && stage(o as Human, sim.time) === 'adult') as Human | null;
      if (other) return other;
    }
  }
  return null;
}

/* ---- once a second: dramas, blood feuds, weddings --------------------------------- */

export function dramaTick(sim: Sim) {
  // A new year: memories fade
  if (sim.dramaYear !== sim.year) {
    sim.dramaYear = sim.year;
    for (const h of sim.humans) {
      if (!h.memories?.length) continue;
      for (const m of h.memories) m.s *= Math.abs(m.s) >= 70 ? 0.995 : 0.96;
      h.memories = h.memories.filter((m) => Math.abs(m.s) >= 5);
    }
    feuds(sim);
    if (sim.year % 4 === 0) weddings(sim);
  }
  // A tenth of the people each second
  const turn = Math.floor(sim.time) % 10;
  for (const h of sim.humans) {
    if (h.dead || h.id % 10 !== turn) continue;
    jealousy(h, sim);
    separation(h, sim);
    mentor(h, sim);
  }
}

function jealousy(h: Human, sim: Sim) {
  if (!has(h, 'jealous') || h.partner === undefined || sim.rand() > 0.05) return;
  const p = sim.byId(h.partner) as Human | undefined;
  if (!p) return;
  let rival: Human | null = null;
  for (const [id, r] of p.rel) {
    if (r < 70 || id === h.id) continue;
    const o = sim.byId(id) as Human | undefined;
    if (o && o.kind === 'human' && match(p, o) && stage(o, sim.time) !== 'child' && !p.children.includes(o.id) && !p.parents.includes(o.id)) {
      rival = o;
      break;
    }
  }
  if (!rival) return;
  remember(sim, h, rival, 'jealous', -35);
  changeRel(h, p, -8, sim);
  think(h, 'sword', 2, sim);
  if (Math.hypot(rival.x - h.x, rival.y - h.y) < 6 && sim.rand() < 0.3) {
    startBrawl(h, rival, sim);
    sim.chronicle.add({ year: sim.year, kind: 'jealousy', a: refOf(h), b: refOf(rival), x: h.x, y: h.y });
  }
}

/** A couple whose love has cooled goes separate ways. */
function separation(h: Human, sim: Sim) {
  if (h.partner === undefined) return;
  const p = sim.byId(h.partner) as Human | undefined;
  if (!p || relOf(h, p) >= 15 || relOf(p, h) >= 40) return;
  h.partner = undefined;
  p.partner = undefined;
  h.home = null;
  for (const house of sim.villages.flatMap((v) => v.houses)) house.owners = house.owners.filter((id) => id !== h.id);
  remember(sim, p, h, 'leftMe', -40);
  story(h, sim, 'separated', p.name);
  story(p, sim, 'separated', h.name);
  think(p, 'tear', 4, sim);
  sim.chronicle.add({ year: sim.year, kind: 'separated', a: refOf(h), b: refOf(p), x: h.x, y: h.y });
}

/** An old wise head takes a young student and passes on what they know. */
function mentor(h: Human, sim: Sim) {
  if (h.student !== undefined || h.village === undefined || ageOf(h, sim.time) < 55 || sim.rand() > 0.02) return;
  if (!(has(h, 'wise') || has(h, 'smart')) || stat(h, 'intelligence') < 7) return;
  const young = sim.humans.find((o) => o.village === h.village && o.mentor === undefined && !h.children.includes(o.id) && ageOf(o, sim.time) >= 12 && ageOf(o, sim.time) <= 22);
  if (!young) return;
  h.student = young.id;
  young.mentor = h.id;
  young.stats.intelligence = Math.min(10, stat(young, 'intelligence') + (has(h, 'wise') ? 2 : 1));
  // Now and then a trait rubs off
  const gift = h.traits.find((t) => !young.traits.includes(t) && t !== 'cowardly' && t !== 'lazy');
  if (gift && sim.rand() < 0.5) young.traits.push(gift);
  remember(sim, young, h, 'teacher', 50);
  remember(sim, h, young, 'student', 30);
  story(h, sim, 'mentor', young.name);
  story(young, sim, 'student', h.name);
  // In the chronicle only when someone you follow is part of it
  const notable = (x: Human) => sim.favorites.has(x.id) || !!x.custom || !!x.royal?.length;
  if (notable(h) || notable(young)) sim.chronicle.add({ year: sim.year, kind: 'mentor', a: refOf(h), b: refOf(young), x: h.x, y: h.y });
}

/** Blood feuds end when a family dies out, or when someone kind or pious forgives. */
function feuds(sim: Sim) {
  for (const [key, f] of sim.bloodFeuds) {
    const aLeft = sim.humans.filter((h) => h.surname === f.a);
    const bLeft = sim.humans.filter((h) => h.surname === f.b);
    if (!aLeft.length || !bLeft.length) {
      sim.bloodFeuds.delete(key);
      const gone = aLeft.length ? f.b : f.a;
      sim.chronicle.add({ year: sim.year, kind: 'bloodFeudEnd', a: { id: 0, name: '', people: (aLeft[0] ?? bLeft[0])?.people ?? 'coast' }, v: f.a, w: gone, x: 0, y: 0 });
      continue;
    }
    const peacemaker = [...aLeft, ...bLeft].find((h) => (has(h, 'kind') || has(h, 'pious')) && stage(h, sim.time) !== 'child');
    if (peacemaker && sim.rand() < 0.08) {
      sim.bloodFeuds.delete(key);
      const otherFamily = peacemaker.surname === f.a ? f.b : f.a;
      for (const h of [...aLeft, ...bLeft]) if (h.memories) h.memories = h.memories.filter((m) => !(m.kind === 'killedKin' && (m.family === f.a || m.family === f.b)));
      sim.chronicle.add({ year: sim.year, kind: 'forgiven', a: refOf(peacemaker), w: otherFamily, x: peacemaker.x, y: peacemaker.y });
    }
  }
}

/* ---- love across the battle lines ----------------------------------------------- */

/** Called when a couple forms (social.ts): love between peoples at war or deeply at odds. */
export function forbiddenLove(sim: Sim, a: Human, b: Human) {
  if (a.people === b.people) return;
  // Only a real war makes it forbidden (a bad mood alone is everyday life)
  const war = warBetween(sim, a.people, b.people);
  if (!war) return;
  sim.chronicle.add({ year: sim.year, kind: 'forbiddenLove', a: refOf(a), b: refOf(b), x: a.x, y: a.y });
  const royal = (h: Human) => sim.villages.some((v) => v.leader === h.id) || [...sim.kingdoms.values()].some((k) => k.king !== undefined && h.parents.includes(k.king));
  if (royal(a) || royal(b) || sim.rand() < 0.35) {
    makePeace(sim, a.people, b.people);
    sim.chronicle.add({ year: sim.year, kind: 'loveEndsWar', a: refOf(a), b: refOf(b), p: a.people, q: b.people, x: a.x, y: a.y });
    return;
  }
  // They run away together, far from both peoples
  for (const h of [a, b]) {
    for (const house of sim.villages.flatMap((v) => v.houses)) house.owners = house.owners.filter((id) => id !== h.id);
    h.village = undefined;
    h.job = undefined;
    story(h, sim, 'eloped', (h === a ? b : a).name);
  }
  const spot = lonelySpot(sim, a);
  a.home = b.home = spot;
  sim.chronicle.add({ year: sim.year, kind: 'eloped', a: refOf(a), b: refOf(b), x: a.x, y: a.y });
}

/** Grass far from every village. */
function lonelySpot(sim: Sim, from: Human) {
  for (let k = 0; k < 200; k++) {
    const x = Math.floor(from.x + (sim.rand() - 0.5) * 80);
    const y = Math.floor(from.y + (sim.rand() - 0.5) * 60);
    if (sim.world.get(x, y) !== T.GRASS) continue;
    if (sim.villages.some((v) => !v.ruin && Math.hypot(v.x - x, v.y - y) < 20)) continue;
    return { x, y };
  }
  return null;
}

/* ---- marriage diplomacy ------------------------------------------------------------ */

const rulerChildren = (sim: Sim, kingId: number | undefined) =>
  kingId === undefined ? [] : sim.humans.filter((h) => h.parents.includes(kingId) && single(h, sim) && ageOf(h, sim.time) >= 16 && ageOf(h, sim.time) <= 40);

function weddings(sim: Sim) {
  const ks = [...sim.kingdoms.values()].filter((k) => k.king !== undefined && sim.byId(k.king));
  for (const ka of ks) {
    if ((ka.weddingAt ?? 0) > sim.year) continue;
    for (const kb of ks) {
      if (kb === ka || kb.people === ka.people) continue;
      const war = warBetween(sim, ka.people, kb.people);
      // At war only once both sides are tired of it
      if (war && sim.time - war.started < 3 * YEAR) continue;
      for (const a of rulerChildren(sim, ka.king)) {
        const b = rulerChildren(sim, kb.king).find((o) => match(a, o));
        if (!b) continue;
        ka.weddingAt = kb.weddingAt = sim.year + 8;
        wed(sim, a, b, ka.dynasty, kb.dynasty, ka.capital, kb.capital);
        return;
      }
    }
  }
}

function wed(sim: Sim, a: Human, b: Human, houseA: string, houseB: string, capA: number, capB: number) {
  // In love with someone else? Half of them run off with their love instead
  for (const [h, other, house] of [
    [a, b, houseB],
    [b, a, houseA],
  ] as const) {
    let love: Human | null = null;
    for (const [id, r] of h.rel) {
      if (r < 75 || id === other.id) continue;
      const o = sim.byId(id) as Human | undefined;
      if (o && o.kind === 'human' && single(o, sim) && match(h, o)) love = o;
    }
    if (love && sim.rand() < 0.5) {
      shiftMood(sim, a.people, b.people, -20);
      remember(sim, other, h, 'leftMe', -50);
      sim.chronicle.add({ year: sim.year, kind: 'royalFlight', a: refOf(h), b: refOf(love), w: house, x: h.x, y: h.y });
      return;
    }
  }
  const va = sim.villages.find((v) => v.id === capA);
  const vb = sim.villages.find((v) => v.id === capB);
  // The child of the smaller realm moves, with a dowry of a tenth of the stores
  const aBigger = (va?.members ?? 0) >= (vb?.members ?? 0);
  const [mover, home, from] = aBigger ? [b, va, vb] : [a, vb, va];
  if (home && !home.ruin) {
    join(mover, home, sim);
    if (from) dowry(from, home);
  }
  a.partner = b.id;
  b.partner = a.id;
  a.home = b.home = home ? { x: home.x, y: home.y } : null;
  for (const h of [a, b]) story(h, sim, 'royalWedding', (h === a ? b : a).name);
  sim.puff(mover.x, mover.y - 0.5, 18, ['#ffc83d', '#ff5da2', '#ffffff', '#4d8dff']);
  sim.chronicle.add({ year: sim.year, kind: 'royalWedding', a: refOf(a), b: refOf(b), v: houseA, w: houseB, x: mover.x, y: mover.y });
  shiftMood(sim, a.people, b.people, 40);
  if (warBetween(sim, a.people, b.people)) {
    makePeace(sim, a.people, b.people);
    sim.chronicle.add({ year: sim.year, kind: 'weddingPeace', a: refOf(a), p: a.people, q: b.people, x: mover.x, y: mover.y });
  } else if (!allied(sim, a.people, b.people) && moodOf(sim, a.people, b.people) >= 60) {
    sim.alliances.add(pairKey(a.people, b.people));
    sim.chronicle.add({ year: sim.year, kind: 'alliance', a: { id: 0, name: '', people: a.people }, p: a.people, q: b.people, x: 0, y: 0 });
  }
}

function dowry(from: Village, to: Village) {
  for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
    const n = Math.floor(from[res] / 10);
    from[res] -= n;
    to[res] += n;
  }
}

/**
 * A throne without an heir of its own (kingdoms.ts asks before founding a
 * new house): someone of its royal blood who lives with another people
 * claims it. Good mood between the peoples: a personal union; else a war.
 * Returns the claimant when the claim was settled peacefully (they rule both).
 */
export function claimThrone(sim: Sim, p: People, last: Ref | undefined): Human | null {
  if (!last) return null;
  // A ruler of another people with royal blood of this throne
  const claimant = sim.humans.find((h) => h.people !== p && h.royal?.includes(p) && stage(h, sim.time) !== 'child' && sim.kingdoms.get(h.people)?.king === h.id);
  if (!claimant) return null;
  if (moodOf(sim, claimant.people, p) >= 40) {
    sim.chronicle.add({ year: sim.year, kind: 'union', a: refOf(claimant), p: claimant.people, q: p, x: claimant.x, y: claimant.y });
    return claimant;
  }
  if (!warBetween(sim, claimant.people, p)) {
    sim.chronicle.add({ year: sim.year, kind: 'successionWar', a: refOf(claimant), q: p, x: claimant.x, y: claimant.y });
    declareWar(sim, claimant.people, p);
  }
  return null;
}
