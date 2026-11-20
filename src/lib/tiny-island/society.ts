/**
 * Culture and mood (Update 3, phase E).
 *
 * - A fourth need, culture (0…100): it sinks slowly and rises by listening to
 *   musicians, laughing at the fool, philosophers' talks, plays, a visit to
 *   the tavern, library, museum, theatre or park, and at festivals.
 * - Mood: all needs together (food, energy, company, culture), shown in the
 *   profile and as a face over the head when it is very good or very bad.
 * - Culture people (a role besides the job, given once a year):
 *     philosopher (wise and intelligence 8+, or trained at a university):
 *       writes books ("On the Nature of Tides"), kept in the library for
 *       research; a book on tolerance softens the quarrels between faiths
 *     musician (artistic): plays on the square or in the tavern
 *     fool (dumb and friendly, one per place): everyone laughs, silly things
 *       for the chronicle; in a capital the court jester; the whole place
 *       mourns them
 *     actor (renaissance, a theatre): plays about real events of the world
 * - Culture points per place (buildings, culture people, works of art) give
 *   five levels, shown as stars on the sign: Primitive, Simple (less
 *   strife), Educated (research), Cultured (people move in from poorer
 *   places, the land reaches 2 tiles further), Enlightened (hardly any
 *   revolt, the neighbours admire it).
 * - A place whose people are unhappy for years loses some of them (they
 *   leave to found a new place) and is less loyal to its king.
 */
import { BALANCE } from './balance';
import { ageOf, has, stage, stat, type Human, type People } from './agents';
import type { Sim } from './sim';
import { refOf, think } from './social';
import { emigrate, join, type Village } from './villages';
import { worksIn, festiveAt } from './culture';
import { ageIndex } from './inventions';
import { hasBuilding } from './town';

export type Role = 'philosopher' | 'musician' | 'fool' | 'actor';
export const LEVELS = ['primitive', 'simple', 'educated', 'cultured', 'enlightened'] as const;
export type CultureLevel = (typeof LEVELS)[number];

export interface Book {
  id: number;
  title: string;
  author: { id: number; name: string; people: People };
  village: number;
  year: number;
}

const C = BALANCE.culture;
const TOPICS = ['Tides', 'Stars', 'Kings', 'Wolves', 'Bread', 'Time', 'Friendship', 'the Sea', 'Silence', 'Fire', 'Mountains', 'Children', 'Rain', 'the Gods', 'Courage'];
const FORMS = ['On the Nature of {x}', 'Thoughts on {x}', 'The Book of {x}', 'Letters about {x}', 'In Praise of {x}', 'A Question of {x}'];

/** Culture points of a place: its buildings, its culture people, its works. */
export function culturePoints(sim: Sim, v: Village, members: Human[]): number {
  let p = 0;
  for (const b of v.buildings) p += C.buildingPoints[b.kind as keyof typeof C.buildingPoints] ?? 0;
  for (const h of members) {
    if (h.role) p += C.rolePoints[h.role];
    else if (h.job === 'artist') p += 1;
  }
  p += Math.min(5, worksIn(sim, v).length * 0.5);
  p += Math.min(4, sim.books.filter((b) => b.village === v.id).length * 0.5);
  return p;
}

/** 0 primitive … 4 enlightened. */
export const levelOf = (v: Village | undefined) => v?.culture ?? 0;

/** The places a performer plays at: tavern, theatre, library, else the square. */
function stage4(v: Village, role: Role): { x: number; y: number } {
  const kind = role === 'actor' ? 'theater' : role === 'philosopher' ? 'library' : role === 'musician' ? 'tavern' : null;
  const b = kind ? v.buildings.find((x) => x.kind === kind) : undefined;
  return b ? { x: b.x, y: b.y + 1 } : { x: v.x, y: v.y + 1 };
}

/** Where a performer goes (ai.ts). */
export const performSpot = (v: Village, h: Human) => stage4(v, h.role!);

/** A building to visit for culture (ai.ts): tavern, theatre, museum, library or park. */
export function visitSpot(v: Village | undefined): { x: number; y: number } | null {
  if (!v) return null;
  const b = v.buildings.find((x) => C.visit.includes(x.kind as (typeof C.visit)[number]));
  return b ? { x: b.x, y: b.y + 1 } : null;
}

/** One tick of a performance: everyone close by gets culture (and company); the fool makes them laugh. */
export function perform(sim: Sim, h: Human, dt: number) {
  const gain = C.performGain[h.role ?? 'musician'] * dt;
  for (const o of sim.near(h.x, h.y, 5, (a) => a.kind === 'human' && a !== h)) {
    const p = o as Human;
    p.culture = Math.min(100, (p.culture ?? 60) + gain);
    p.social = Math.min(100, p.social + gain * 0.4);
    if (h.role === 'fool' && sim.rand() < dt * 0.03) think(p, 'happy', 1.2, sim);
  }
  h.culture = Math.min(100, (h.culture ?? 60) + gain);
  if (sim.rand() < dt * 0.25) think(h, h.role === 'musician' ? 'note' : h.role === 'philosopher' ? 'light' : 'happy', 1.2, sim);
}

/** Every second: culture fades, mood follows the needs. */
export function moodTick(sim: Sim) {
  for (const h of sim.humans) {
    if (h.dead) continue;
    const v = h.village !== undefined ? sim.villages.find((x) => x.id === h.village) : undefined;
    // Festivals fill it up; art in the place slows the fading
    const fest = festiveAt(v, sim) ? C.festivalGain : 0;
    h.culture = Math.max(0, Math.min(100, (h.culture ?? 60) - C.fade * (v?.art?.length ? 0.8 : 1) + fest));
    const target = h.hunger * C.weights.hunger + h.energy * C.weights.energy + h.social * C.weights.social + h.culture * C.weights.culture;
    h.mood = (h.mood ?? target) + (target - (h.mood ?? target)) * 0.1;
  }
}

/** Once a year: roles, culture levels, books, plays, the fools, moving to better places, unhappy places. */
export function societyTick(sim: Sim) {
  if (sim.year === sim.societyYear) return;
  sim.societyYear = sim.year;
  const live = sim.villages.filter((v) => !v.ruin && !v.merged);
  const byVillage = new Map<number, Human[]>();
  for (const h of sim.humans) {
    if (h.dead || h.village === undefined) continue;
    let list = byVillage.get(h.village);
    if (!list) byVillage.set(h.village, (list = []));
    list.push(h);
  }
  for (const v of live) {
    const members = byVillage.get(v.id) ?? [];
    assignRoles(sim, v, members);
    // The level of culture
    const points = culturePoints(sim, v, members);
    let level = 0;
    C.levels.forEach((need, i) => {
      if (points >= need) level = i;
    });
    if (level !== v.culture) {
      if (level > (v.culture ?? 0) && level >= 3 && (v.cultureTop ?? 0) < level) {
        v.cultureTop = level;
        sim.chronicle.add({ year: sim.year, kind: 'cultureLevel', a: { id: 0, name: v.name, people: v.people }, v: v.name, w: LEVELS[level], x: v.x, y: v.y });
      }
      v.culture = level;
    }
    v.culturePoints = Math.round(points);
    for (const h of members) if (h.role === 'philosopher') philosopher(sim, v, h);
    for (const h of members) if (h.role === 'fool') fool(sim, v, h, members);
    play(sim, v, members);
    unhappy(sim, v, members);
  }
  // Cultured places draw people from poor and unhappy places of their people
  for (const v of live) {
    if ((v.culture ?? 0) < 3) continue;
    const from = live.find((o) => o !== v && o.people === v.people && (o.culture ?? 0) <= 1 && sim.world.sameLand(o.x, o.y, v.x, v.y) && avgMood(byVillage.get(o.id) ?? []) < C.moveMood);
    if (!from) continue;
    const movers = (byVillage.get(from.id) ?? []).filter((h) => stage(h, sim.time) === 'adult' && h.partner === undefined && ageOf(h, sim.time) < 35 && h.id !== from.leader).slice(0, 2);
    for (const h of movers) {
      for (const house of from.houses) house.owners = house.owners.filter((id) => id !== h.id);
      h.home = null;
      join(h, v, sim);
    }
  }
  // Books on tolerance wear off
  for (const [p, until] of sim.tolerance) if (until <= sim.year) sim.tolerance.delete(p);
}

const avgMood = (members: Human[]) => (members.length ? members.reduce((s, h) => s + (h.mood ?? 60), 0) / members.length : 60);

/** Roles once a year: philosophers, musicians, one fool, actors in a theatre. */
function assignRoles(sim: Sim, v: Village, members: Human[]) {
  const adults = members.filter((h) => stage(h, sim.time) === 'adult');
  let thinkers = members.filter((h) => h.role === 'philosopher').length;
  for (const h of adults) {
    if (h.role) continue;
    const uni = hasBuilding(v, 'university') && thinkers < C.maxPhilosophers && stat(h, 'intelligence') >= 7 && sim.rand() < 0.03;
    if (uni) thinkers++;
    if ((has(h, 'wise') && stat(h, 'intelligence') >= 8) || uni) h.role = 'philosopher';
    else if (has(h, 'artistic') && h.job !== 'artist' && sim.rand() < 0.5) h.role = 'musician';
  }
  // One fool per place (of eight or more): dumb and friendly, else just dumb, else simple and friendly
  if (members.length >= 8 && !members.some((h) => h.role === 'fool')) {
    const free = adults.filter((h) => !h.role && h.id !== v.leader);
    const f =
      free.find((h) => has(h, 'dumb') && has(h, 'friendly')) ??
      free.find((h) => has(h, 'dumb')) ??
      free.find((h) => has(h, 'friendly') && stat(h, 'intelligence') <= 3);
    if (f) {
      f.role = 'fool';
      const k = sim.kingdoms.get(v.people);
      if (k?.capital === v.id) sim.chronicle.add({ year: sim.year, kind: 'jester', a: refOf(f), p: v.people, v: v.name, x: v.x, y: v.y });
    }
  }
  // Actors from the renaissance, for a theatre
  if (hasBuilding(v, 'theater') && ageIndex(sim, v.people) >= 4) {
    const actors = members.filter((h) => h.role === 'actor').length;
    const want = adults.filter((h) => !h.role && (has(h, 'charismatic') || has(h, 'artistic') || stat(h, 'charisma') >= 7));
    for (const h of want.slice(0, Math.max(0, C.actors - actors))) h.role = 'actor';
  }
}

/** A philosopher writes now and then; a book on tolerance makes the faiths of their people get along. */
function philosopher(sim: Sim, v: Village, h: Human, said?: Human) {
  if (!said && (sim.rand() > C.bookChance || sim.books.some((b) => b.village === v.id && sim.year - b.year < C.bookYears))) return;
  const tolerance = !said && sim.rand() < 0.15;
  const title = said
    ? `The Sayings of ${said.name}`
    : tolerance
      ? 'On Tolerance'
      : FORMS[Math.floor(sim.rand() * FORMS.length)].replace('{x}', TOPICS[Math.floor(sim.rand() * TOPICS.length)]);
  const book: Book = { id: sim.nextBookId++, title, author: refOf(h), village: v.id, year: sim.year };
  sim.books.push(book);
  if (sim.books.length > 120) sim.books.shift();
  if (tolerance) sim.tolerance.set(v.people, sim.year + C.toleranceYears);
  sim.chronicle.add({ year: sim.year, kind: 'book', a: refOf(h), v: v.name, u: `“${title}”`, x: v.x, y: v.y });
}

/** The fool of the place gets into trouble once in a while (the chronicle loves it). */
function fool(sim: Sim, v: Village, h: Human, members: Human[]) {
  if (sim.rand() > C.foolChance) return;
  const options: string[] = ['shoe', 'dance', 'wise'];
  if (hasBuilding(v, 'well')) options.push('well', 'well');
  if (v.buildings.some((b) => b.kind === 'pen' && b.animal === 'sheep') || sim.nearest(h.x, h.y, 20, (o) => o.kind === 'sheep')) options.push('sheep', 'sheep');
  const what = options[Math.floor(sim.rand() * options.length)];
  // Something wise by mistake: a philosopher of the place writes it down
  const writer = what === 'wise' ? members.find((m) => m.role === 'philosopher') : undefined;
  sim.chronicle.add({ year: sim.year, kind: 'fool', a: refOf(h), b: writer ? refOf(writer) : undefined, v: v.name, cause: writer ? 'wiseBook' : what, x: h.x, y: h.y });
  for (const m of members) m.culture = Math.min(100, (m.culture ?? 60) + 10);
  if (writer) philosopher(sim, v, writer, h);
}

/** A fool died: the whole place mourns (sim.ts). */
export function onFoolDeath(sim: Sim, h: Human) {
  const v = h.village !== undefined ? sim.villages.find((x) => x.id === h.village) : undefined;
  if (!v || v.ruin || v.members < 12) return;
  for (const m of sim.humans) if (m.village === v.id && !m.dead) m.grief = Math.max(m.grief, sim.time + 8);
  sim.chronicle.add({ year: sim.year, kind: 'foolDied', a: refOf(h), v: v.name, x: v.x, y: v.y });
}

/** Actors stage a play about something that really happened (a recent war, a crowning, a wonder …). */
function play(sim: Sim, v: Village, members: Human[]) {
  if (!hasBuilding(v, 'theater') || members.filter((h) => h.role === 'actor').length < 2 || sim.rand() > C.playChance) return;
  const e = sim.chronicle.entries.find((x) => ['battleWon', 'conquest', 'kingdom', 'succession', 'wonderBuilt', 'prophet', 'royalWedding', 'revolt', 'landWon'].includes(x.kind) && sim.year - x.year < 40);
  if (!e) return;
  const subject = e.a.name || e.v || v.name;
  const title =
    e.kind === 'battleWon'
      ? `The Battle of ${e.v ?? subject}`
      : e.kind === 'conquest'
        ? `The Fall of ${e.v ?? subject}`
        : e.kind === 'wonderBuilt'
          ? `The Builders of ${e.v ?? subject}`
          : e.kind === 'prophet'
            ? `The Vision of ${subject}`
            : e.kind === 'royalWedding'
              ? `The Wedding of ${subject}`
              : e.kind === 'revolt'
                ? `The Rising of ${e.v ?? subject}`
                : e.kind === 'landWon'
                  ? `The Land of ${e.w ?? subject}`
                  : `The Crown of ${subject}`;
  for (const m of members) m.culture = Math.min(100, (m.culture ?? 60) + 25);
  sim.chronicle.add({ year: sim.year, kind: 'play', a: { id: 0, name: v.name, people: v.people }, v: v.name, u: `“${title}”`, x: v.x, y: v.y });
}

/** Unhappy for years: some leave to find a better life. */
function unhappy(sim: Sim, v: Village, members: Human[]) {
  if (members.length < 10) return;
  if (avgMood(members) < C.unhappyMood) v.unhappyYears = (v.unhappyYears ?? 0) + 1;
  else v.unhappyYears = 0;
  if ((v.unhappyYears ?? 0) < C.unhappyYears) return;
  v.unhappyYears = 0;
  sim.chronicle.add({ year: sim.year, kind: 'discontent', a: { id: 0, name: v.name, people: v.people }, v: v.name, x: v.x, y: v.y });
  emigrate(v, sim);
}

/** The average mood of a place (village profile, loyalty). */
export const placeMood = (sim: Sim, v: Village) => avgMood(sim.humans.filter((h) => h.village === v.id && !h.dead));

/** Points per year of research from culture: educated places and the books in the libraries. */
export function cultureResearch(sim: Sim, p: People): number {
  let r = 0;
  for (const v of sim.villages) {
    if (v.ruin || v.people !== p) continue;
    if ((v.culture ?? 0) >= 2) r += C.educatedResearch;
    if (hasBuilding(v, 'library')) r += Math.min(10, sim.books.filter((b) => b.village === v.id).length) * C.bookResearch;
  }
  return r;
}

/** Visitors (ai.ts): culture while at a tavern, library, museum, theatre or park. */
export function visitGain(h: Human, dt: number) {
  h.culture = Math.min(100, (h.culture ?? 60) + C.visitGain * dt);
  h.social = Math.min(100, h.social + C.visitGain * 0.3 * dt);
}
