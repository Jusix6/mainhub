/**
 * Kingdoms (Phase 11). Once a people has a city (or a town and at least
 * two more places), its inhabitants crown a ruler there: the leader of the city, else its wisest or bravest elder. The
 * people becomes a kingdom: the king's place is the capital, every other
 * place of the people is a vassal that sends a tenth of its stores to the
 * capital once a year (a fifth under a greedy king).
 *
 * Throne: when the king dies, leaves the people (a conquered capital) or is
 * deposed, the oldest child of the king takes over (from 10 years on): the
 * dynasty, "House of <founder>", goes on. Without heirs someone from the
 * capital is crowned and founds a new house.
 *
 * Loyalty: every vassal has a loyalty of 0 … 100 that drifts towards what it
 * thinks of the king (traits, age, lost wars, a temple, distance to the
 * capital, its own temper, the size of the realm, its art). Below 25 a vassal may
 * rise up: it breaks away and fights the capital in a feud (war.ts). If the rebels take the capital, they
 * overthrow the king and their leader takes the crown; if the capital wins, the
 * rebels come back. Rebels whose loyalty recovers return on their own.
 *
 * God gifts (profile): crown anyone grown-up, or take the crown from a king.
 */
import { owns } from './wonders';
import { claimThrone } from './drama';
import { ageOf, has, PEOPLES, stage, type Human, type People } from './agents';
import type { Ref } from './chronicle';
import type { Sim } from './sim';
import { refOf, story } from './social';
import type { Village } from './villages';
import { feudKey, startFeud } from './war';
import { celebrate, worksIn } from './culture';
import { BALANCE } from './balance';

export interface Kingdom {
  people: People;
  /** The ruling king or queen (none for a while after a house dies out). */
  king?: number;
  /** Name of the ruling house (its founder's name). */
  dynasty: string;
  /** The king's place (village id). */
  capital: number;
  /** Year the kingdom was founded, game time the reign began. */
  founded: number;
  reignStart: number;
  /** The previous ruler, for the chronicle. */
  last?: Ref;
  /** Lost wars weigh on the crown (fades slowly). */
  shame: number;
  /** Next yearly tribute. */
  tributeAt: number;
  /** Phase C: ruled by the king of another people (personal union), and the next royal wedding. */
  union?: People;
  weddingAt?: number;
  /** Update 3, phase B: land hunger 0 … 100, and no new claim before this year (territory.ts). */
  landHunger?: number;
  claimAt?: number;
  /** Update 3, phase D: the state religion (the king's faith). */
  stateFaith?: number;
}

const YEAR = 30;
const REVOLT_AT = 25;
const REJOIN_AT = 60;
/** How much a lost war costs the king in loyalty. */
export const LOST_WAR = 20;

const TRAIT_SCORE: Record<string, number> = { wise: 15, brave: 10, friendly: 10, hardworking: 5, quarrelsome: -10, lazy: -10, greedy: -10, cowardly: -15 };

export const loyaltyOf = (v: Village) => v.loyalty ?? 60;
/** Every place has its own temper: -10 … +10 towards the crown. */
const temper = (v: Village) => ((v.id * 37) % 21) - 10;

export const kingOf = (sim: Sim, k: Kingdom) => (k.king !== undefined ? (sim.byId(k.king) as Human | undefined) : undefined);

/** Ids of all ruling kings and queens. */
export function kingIds(sim: Sim): Set<number> {
  const out = new Set<number>();
  for (const k of sim.kingdoms.values()) if (k.king !== undefined) out.add(k.king);
  return out;
}

/** The kingdom someone rules, if any. */
export const realmOf = (sim: Sim, id: number) => [...sim.kingdoms.values()].find((k) => k.king === id);

/** The places of a kingdom that have not risen up (the capital among them). */
export const realm = (sim: Sim, k: Kingdom) => sim.villages.filter((v) => !v.ruin && v.people === k.people && !v.free);

const villageById = (sim: Sim, id: number | undefined) => (id === undefined ? undefined : sim.villages.find((v) => v.id === id));

/** What the vassals think of the king: traits, age, lost wars. */
export function kingScore(sim: Sim, k: Kingdom): number {
  const king = kingOf(sim, k);
  if (!king) return -15;
  let s = 0;
  for (const t of king.traits) s += TRAIT_SCORE[t] ?? 0;
  if (stage(king, sim.time) === 'child') s -= 20;
  else if (ageOf(king, sim.time) > 65) s -= 10;
  return s - k.shame;
}

/** Once a second: kingdoms are founded, thrones pass on, loyalty drifts, vassals pay or rise up. */
export function kingdomTick(sim: Sim) {
  for (const p of PEOPLES) {
    const places = sim.villages.filter((v) => !v.ruin && v.people === p);
    const k = sim.kingdoms.get(p);
    if (!k) {
      // A city, or a town with at least two more places around it, is enough for a crown
      const ranked = [...places].sort((a, b) => b.members - a.members);
      const city = ranked.find((v) => v.tier === 'city') ?? (places.length >= 3 ? ranked.find((v) => v.tier === 'town') : undefined);
      if (city) {
        const ruler = pickRuler(sim, city);
        if (ruler) found(sim, p, ruler, city, 'kingdom');
      }
      continue;
    }
    if (!places.length) {
      sim.kingdoms.delete(p);
      sim.chronicle.add({ year: sim.year, kind: 'fall', a: { id: 0, name: '', people: p }, p, x: 0, y: 0 });
      continue;
    }
    k.shame = Math.max(0, k.shame - 0.02);

    // The throne: someone must sit on it, living in a place of the realm
    const king = kingOf(sim, k);
    const home = king && villageById(sim, king.village);
    // Royal blood: whoever wears the crown can pass on a claim to it
    if (king && !king.royal?.includes(p)) king.royal = [...(king.royal ?? []), p];
    // A personal union: the king lives with the other people, the capital stays
    const union = !!king && !!k.union && king.people === k.union;
    if (union) {
      /* nothing to move */
    } else if (!king || king.people !== p || !home || home.ruin || home.people !== p || home.free) succeed(sim, k, false);
    else if (home.id !== k.capital) moveCapital(sim, k, home);
    if (!realm(sim, k).some((v) => v.id === k.capital)) {
      const biggest = realm(sim, k).sort((a, b) => b.members - a.members)[0];
      if (biggest) moveCapital(sim, k, biggest);
    }
    const capital = villageById(sim, k.capital);
    if (!capital) continue;

    // Loyalty of every other place, rebels too
    // A big realm is harder to hold together
    const score = kingScore(sim, k) - 3 * Math.max(0, places.length - 3);
    for (const v of places) {
      if (v.id === k.capital) continue;
      const far = Math.hypot(v.x - capital.x, v.y - capital.y) > 40 ? 10 : 0;
      const temple = (v.buildings.some((b) => b.kind === 'temple') ? 10 : 0) + (capital.buildings.some((b) => b.kind === 'palace') ? 8 : 0);
      // Songs, murals and statues make people proud of their place and crown
      const art = Math.min(10, worksIn(sim, v).length * 2);
      // A state religion (Update 3): places of another faith are less loyal
      const heretic = k.stateFaith !== undefined && v.faith !== undefined && v.faith !== k.stateFaith ? 10 : 0;
      // Culture (Update 3): an enlightened place hardly ever rises up, an unhappy one sooner
      const culture = ((v.culture ?? 0) >= 4 ? BALANCE.culture.enlightenedLoyalty : 0) - ((v.unhappyYears ?? 0) > 0 ? BALANCE.culture.unhappyLoyalty : 0);
      const target = 45 + score + temper(v) + temple + art - far - heretic + culture;
      const now = loyaltyOf(v);
      v.loyalty = now + Math.max(-0.1, Math.min(0.1, (target - now) * 0.01));
      const atWar = sim.wars.has(feudKey(v.id, capital.id));
      if (!v.free && v.loyalty < REVOLT_AT && v.members >= 6 && !atWar && !owns(sim, p, 'cathedral') && sim.rand() < 0.02) revolt(sim, k, v, capital);
      else if (v.free && v.loyalty >= REJOIN_AT && !atWar) {
        v.free = false;
        sim.chronicle.add({ year: sim.year, kind: 'returned', a: { id: 0, name: v.name, people: p }, v: v.name, p, x: v.x, y: v.y });
      }
    }

    // Tribute once a year
    if (sim.time >= k.tributeAt) {
      k.tributeAt = sim.time + YEAR;
      const greedy = king && has(king, 'greedy');
      for (const v of realm(sim, k)) {
        if (v.id === capital.id) continue;
        for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
          const n = Math.floor(v[res] * (greedy ? 0.2 : 0.1));
          v[res] -= n;
          capital[res] += n;
        }
      }
    }
  }
}

/** Who the people of a place would crown: their leader, else a wise or brave elder, else the oldest grown-up. */
function pickRuler(sim: Sim, v: Village, skip?: (h: Human) => boolean): Human | undefined {
  const adults = sim.humans.filter((h) => h.village === v.id && h.people === v.people && stage(h, sim.time) !== 'child' && !skip?.(h)).sort((a, b) => a.born - b.born);
  const leader = adults.find((h) => h.id === v.leader);
  return leader ?? adults.find((h) => has(h, 'wise') || has(h, 'brave')) ?? adults[0];
}

/** A new kingdom (or a new crown given by the gods to a people without one). */
function found(sim: Sim, p: People, ruler: Human, capital: Village, kind: 'kingdom' | 'godCrowned') {
  sim.kingdoms.set(p, { people: p, king: ruler.id, dynasty: ruler.name, capital: capital.id, founded: sim.year, reignStart: sim.time, shame: 0, tributeAt: sim.time + YEAR });
  crownFx(sim, ruler, capital);
  sim.chronicle.add({ year: sim.year, kind, a: refOf(ruler), v: capital.name, p, w: ruler.name, x: capital.x, y: capital.y });
}

function crownFx(sim: Sim, h: Human, v: Village) {
  if (!h.royal?.includes(v.people)) h.royal = [...(h.royal ?? []), v.people];
  story(h, sim, 'crowned', v.name);
  sim.puff(h.x, h.y - 0.8, 14, ['#ffc83d', '#ffffff', '#ff5da2', '#4d8dff']);
  celebrate(sim, v, 'coronation');
}

function moveCapital(sim: Sim, k: Kingdom, v: Village) {
  if (k.capital === v.id) return;
  k.capital = v.id;
  v.loyalty = undefined;
  sim.chronicle.add({ year: sim.year, kind: 'capital', a: { id: 0, name: v.name, people: k.people }, v: v.name, p: k.people, x: v.x, y: v.y });
}

/**
 * The throne passes on: to the oldest child of the last ruler (10 years or
 * older), else - or when the house has fallen - to someone from the capital,
 * who founds a new house.
 */
function succeed(sim: Sim, k: Kingdom, houseFalls: boolean) {
  const prev = k.king !== undefined ? sim.registry.get(k.king) : undefined;
  const prevId = k.king;
  k.union = undefined;
  if (prev) k.last = { id: prev.id, name: prev.name, people: prev.people };
  const inRealm = new Set(realm(sim, k).map((v) => v.id));
  const heir = houseFalls
    ? undefined
    : sim.humans
        .filter((h) => prevId !== undefined && h.parents.includes(prevId) && h.people === k.people && h.village !== undefined && inRealm.has(h.village) && ageOf(h, sim.time) >= 10)
        .sort((a, b) => a.born - b.born)[0];
  // No heir of the house: a ruler elsewhere with royal blood may claim the throne (drama.ts)
  if (!heir && !houseFalls) {
    const claimant = claimThrone(sim, k.people, k.last);
    if (claimant) {
      k.king = claimant.id;
      k.union = claimant.people;
      k.reignStart = sim.time;
      k.dynasty = sim.kingdoms.get(claimant.people)?.dynasty ?? claimant.name;
      return;
    }
  }
  let seat = villageById(sim, k.capital);
  if (!seat || !inRealm.has(seat.id)) seat = realm(sim, k).sort((a, b) => b.members - a.members)[0];
  const ruler = heir ?? (seat ? pickRuler(sim, seat, (h) => h.id === prevId || (houseFalls && prevId !== undefined && h.parents.includes(prevId))) : undefined);
  if (!ruler) {
    k.king = undefined;
    return;
  }
  k.king = ruler.id;
  k.reignStart = sim.time;
  const home = villageById(sim, ruler.village);
  if (home) moveCapital(sim, k, home);
  if (home) crownFx(sim, ruler, home);
  if (heir) {
    sim.chronicle.add({ year: sim.year, kind: 'succession', a: refOf(ruler), b: k.last, w: k.dynasty, x: ruler.x, y: ruler.y });
  } else {
    k.dynasty = ruler.name;
    sim.chronicle.add({ year: sim.year, kind: 'newDynasty', a: refOf(ruler), b: k.last, w: k.dynasty, x: ruler.x, y: ruler.y });
  }
}

/** A vassal breaks away and fights the capital. */
function revolt(sim: Sim, k: Kingdom, v: Village, capital: Village) {
  v.free = true;
  const king = kingOf(sim, k);
  startFeud(sim, v, capital, {
    year: sim.year,
    kind: 'revolt',
    a: king ? refOf(king) : { id: 0, name: '', people: k.people },
    v: v.name,
    w: capital.name,
    x: v.x,
    y: v.y,
  });
}

/**
 * After a feud was won by force (war.ts): rebels who take the capital
 * overthrow the king; rebels beaten by a loyal place come back.
 */
export function onSubdued(sim: Sim, loser: Village, winner: Village) {
  const k = sim.kingdoms.get(loser.people);
  if (!k) return;
  if (loser.id === k.capital && winner.free) {
    const old = kingOf(sim, k);
    if (old) story(old, sim, 'deposed');
    const prev = k.king !== undefined ? sim.registry.get(k.king) : undefined;
    const ruler = pickRuler(sim, winner);
    winner.free = false;
    winner.loyalty = undefined;
    loser.loyalty = 30;
    if (!ruler) return;
    k.last = prev ? { id: prev.id, name: prev.name, people: prev.people } : undefined;
    k.king = ruler.id;
    k.dynasty = ruler.name;
    k.reignStart = sim.time;
    k.capital = winner.id;
    crownFx(sim, ruler, winner);
    sim.chronicle.add({ year: sim.year, kind: 'overthrown', a: refOf(ruler), b: k.last, v: winner.name, w: ruler.name, x: winner.x, y: winner.y });
  } else if (loser.free && !winner.free) {
    loser.free = false;
    loser.loyalty = 45;
    sim.chronicle.add({ year: sim.year, kind: 'returned', a: { id: 0, name: loser.name, people: loser.people }, v: loser.name, p: loser.people, x: loser.x, y: loser.y });
  }
}

/* ---- god gifts ------------------------------------------------------------------- */

/** The gods crown someone grown-up; their place becomes the capital (and returns if it had risen up). */
export function crown(sim: Sim, h: Human): boolean {
  const v = villageById(sim, h.village);
  if (!v || v.ruin || stage(h, sim.time) === 'child') return false;
  const k = sim.kingdoms.get(h.people);
  if (!k) {
    found(sim, h.people, h, v, 'godCrowned');
    return true;
  }
  if (k.king === h.id) return false;
  const old = kingOf(sim, k);
  if (old) story(old, sim, 'deposed');
  const prev = k.king !== undefined ? sim.registry.get(k.king) : undefined;
  k.last = prev ? { id: prev.id, name: prev.name, people: prev.people } : undefined;
  // A child of the old ruler keeps the house; anyone else founds a new one
  if (!(k.king !== undefined && h.parents.includes(k.king))) k.dynasty = h.name;
  k.king = h.id;
  k.reignStart = sim.time;
  v.free = false;
  moveCapital(sim, k, v);
  crownFx(sim, h, v);
  sim.chronicle.add({ year: sim.year, kind: 'godCrowned', a: refOf(h), b: k.last, v: v.name, p: h.people, w: k.dynasty, x: v.x, y: v.y });
  return true;
}

/** The gods take the crown: the house falls, someone else from the capital is crowned. */
export function depose(sim: Sim, k: Kingdom) {
  const old = kingOf(sim, k);
  if (!old) return;
  story(old, sim, 'deposed');
  sim.chronicle.add({ year: sim.year, kind: 'godDeposed', a: refOf(old), p: k.people, x: old.x, y: old.y });
  succeed(sim, k, true);
}

/** A coup (plots.ts): the plotter takes the throne and founds a new house. */
export function usurp(sim: Sim, k: Kingdom, h: Human) {
  const old = kingOf(sim, k);
  if (old) {
    story(old, sim, 'deposed');
    k.last = refOf(old);
  }
  k.king = h.id;
  k.dynasty = h.name;
  k.reignStart = sim.time;
  k.union = undefined;
  const home = villageById(sim, h.village);
  if (home) {
    moveCapital(sim, k, home);
    crownFx(sim, h, home);
  }
}

/** A lost war costs the crown loyalty. */
export function lostWar(sim: Sim, p: People) {
  const k = sim.kingdoms.get(p);
  if (k) k.shame += LOST_WAR;
}
