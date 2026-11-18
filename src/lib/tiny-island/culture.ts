/**
 * Art and culture (Phase 12).
 *
 * Works: artists gather inspiration while they play on the square (twice as
 * fast at a festival). After about 24 seconds of music they make something: a song, a mural on a
 * house (wooden or better) or a statue next to the square (3 stone, needs
 * masonry). Titles are made of building blocks (template, a hero or place,
 * an adjective and a noun of the people); the words live in ui.ts. Works make
 * a place more loyal to its king (kingdoms.ts).
 *
 * Legends: someone who did great things becomes a legend when they die: a
 * long-reigning king (the Great), a warrior with many foes beaten (the
 * Fearless, the Brave), an inventor (the Wise), a wolf hunter (the
 * Wolf-Slayer). Artists sing of them and carve their statues.
 *
 * Festivals: every place of six or more holds one every eight years (four
 * with a temple) when at peace, plus a feast after a won war and after a
 * crowning. For a day and a bit everyone comes to the square to dance, there
 * is confetti and bunting, company fills up and loyalty rises.
 *
 * God gifts (Rules tab): a festival, or a building for the biggest place of a
 * people (whatever it would build next, else a statue).
 */
import { PEOPLES, type Human, type People } from './agents';
import type { Ref } from './chronicle';
import { knows } from './inventions';
import type { Sim } from './sim';
import { refOf, story } from './social';
import { freeSpot, type Village } from './villages';
import { BUILDINGS, nextBuilding, type BuildingKind } from './town';

export type WorkKind = 'song' | 'mural' | 'statue';

export interface Work {
  id: number;
  kind: WorkKind;
  /** Title template key (ui.ts) and what goes into it. */
  tpl: string;
  /** A person (with an epithet key) or a place. */
  name?: string;
  epithet?: string;
  adj?: number;
  noun?: number;
  artist: Ref;
  people: People;
  village: number;
  year: number;
}

/** Art in a place you can see: statues next to the square, murals on houses. */
export interface Piece {
  kind: 'statue' | 'mural';
  x: number;
  y: number;
  work: number;
}

export interface Legend {
  id: number;
  name: string;
  people: People;
  epithet: string;
  year: number;
}

export type FestivalKind = 'harvest' | 'midsummer' | 'victory' | 'coronation' | 'gods';

const YEAR = 30;
/** Seconds of playing on the square for one work. */
const INSPIRATION = 24;
const FESTIVAL_TIME = 12;
const STATUE_STONE = 3;
const MAX_WORKS = 300;
/** Words for nature titles: how many adjectives and nouns per people there are in ui.ts. */
export const ADJECTIVES = 10;
export const NOUNS = 6;

const villageById = (sim: Sim, id: number | undefined) => (id === undefined ? undefined : sim.villages.find((v) => v.id === id));

export const festiveAt = (v: Village | undefined, sim: Sim) => !!v && (v.festivalUntil ?? 0) > sim.time;

/** Works made in a place (songs too). */
export const worksIn = (sim: Sim, v: Village) => sim.works.filter((w) => w.village === v.id);

/* ---- works ----------------------------------------------------------------------- */

/** While playing on the square inspiration grows; when there is enough, a work is made. */
export function inspire(h: Human, sim: Sim, v: Village, dt: number) {
  h.inspiration = (h.inspiration ?? 0) + dt * (festiveAt(v, sim) ? 2 : 1);
  if (h.inspiration < INSPIRATION) return;
  h.inspiration = 0;
  makeWork(sim, v, refOf(h), h);
}

function makeWork(sim: Sim, v: Village, artist: Ref, h?: Human, kind?: WorkKind) {
  const r = sim.rand;
  const pieces = v.art ?? (v.art = []);
  const murals = pieces.filter((p) => p.kind === 'mural').length;
  const statues = pieces.filter((p) => p.kind === 'statue').length;
  const bare = v.houses.filter((house) => house.level >= 1 && !pieces.some((p) => p.kind === 'mural' && p.x === house.x && p.y === house.y));
  const canStatue = statues < 3 && v.stone >= STATUE_STONE && knows(sim, v.people, 'masonry');
  if (!kind) {
    const options: WorkKind[] = ['song', 'song', 'song'];
    if (bare.length && murals < 6) options.push('mural', 'mural');
    if (canStatue) options.push('statue', 'statue', 'statue');
    kind = options[Math.floor(r() * options.length)];
  }
  const legends = sim.legends.filter((l) => l.people === v.people);
  const legend = legends.length && r() < 0.6 ? legends[Math.floor(r() * legends.length)] : undefined;
  const k = sim.kingdoms.get(v.people);
  const king = k?.king !== undefined ? (sim.byId(k.king) as Human | undefined) : undefined;
  const others = sim.villages.filter((o) => !o.ruin && o.people === v.people && o !== v);
  const work: Work = { id: sim.nextWorkId++, kind, tpl: 'nature', artist, people: v.people, village: v.id, year: sim.year };
  const nature = () => {
    work.adj = Math.floor(r() * ADJECTIVES);
    work.noun = Math.floor(r() * NOUNS);
  };

  if (kind === 'statue') {
    const spot = freeSpot(sim, v.x, v.y, 2, 5);
    if (!spot) return;
    if (h) v.stone -= STATUE_STONE;
    if (legend) Object.assign(work, { tpl: 'hero', name: legend.name, epithet: legend.epithet });
    else if (king && r() < 0.6) Object.assign(work, { tpl: 'king', name: king.name });
    else {
      work.tpl = 'watcher';
      nature();
    }
    pieces.push({ kind: 'statue', x: spot.x, y: spot.y, work: work.id });
    sim.puff(spot.x + 0.5, spot.y, 8, ['#ffffff', '#c3c6cc', '#ffe066']);
  } else if (kind === 'mural') {
    const house = bare[Math.floor(r() * bare.length)];
    if (!house) return;
    const recentWar = sim.chronicle.entries.some((e) => (e.kind === 'conquest' || e.kind === 'breach' || e.kind === 'army') && sim.year - e.year < 10 && (e.v === v.name || e.w === v.name));
    const pick = r();
    if (recentWar && pick < 0.5) Object.assign(work, { tpl: 'battle', name: v.name });
    else if (king && pick < 0.7) Object.assign(work, { tpl: 'crowning', name: king.name });
    else if (pick < 0.85) Object.assign(work, { tpl: 'harvest', name: v.name });
    else Object.assign(work, { tpl: 'founding', name: v.name });
    pieces.push({ kind: 'mural', x: house.x, y: house.y, work: work.id });
  } else {
    const pick = r();
    // Heroes of war get ballads, the others now and then a lament
    if (legend) Object.assign(work, { tpl: legend.epithet === 'brave' || legend.epithet === 'fearless' || pick < 0.5 ? 'ballad' : 'lament', name: legend.name, epithet: legend.epithet });
    else if (pick < 0.3) Object.assign(work, { tpl: 'place', name: v.name });
    else if (pick < 0.45 && others.length) Object.assign(work, { tpl: 'road', name: others[Math.floor(r() * others.length)].name });
    else if (pick < 0.55) Object.assign(work, { tpl: 'evening', name: v.name });
    else nature();
  }

  sim.works.push(work);
  if (sim.works.length > MAX_WORKS) {
    // Old songs are forgotten first; statues and murals stay
    const i = sim.works.findIndex((w) => w.kind === 'song');
    sim.works.splice(i >= 0 ? i : 0, 1);
  }
  // A gift of the gods has its own line in the chronicle (giftBuilding)
  if (!h) return;
  story(h, sim, 'artwork', String(work.id));
  sim.puff(h.x, h.y - 0.8, 6, ['#ff5da2', '#ffe066', '#4d8dff']);
  sim.chronicle.add({ year: sim.year, kind: 'artwork', a: artist, v: v.name, work: { ...work }, x: v.x, y: v.y });
}

/* ---- legends ------------------------------------------------------------------- */

/** Someone died: if they did great things, they become a legend. */
export function onHeroDeath(sim: Sim, h: Human) {
  const k = [...sim.kingdoms.values()].find((x) => x.king === h.id);
  const reign = k ? (sim.time - k.reignStart) / YEAR : 0;
  const inventions = h.story.filter((s) => s.kind === 'invented').length;
  const kills = h.kills ?? 0;
  const epithet =
    reign >= 15 ? 'great' : kills >= 6 ? 'fearless' : kills >= 3 ? 'brave' : inventions >= 2 ? 'wise' : (h.wolves ?? 0) >= 2 ? 'wolfslayer' : null;
  // Names come back over the generations: one legend per name, epithet and people
  if (!epithet || sim.legends.some((l) => l.name === h.name && l.epithet === epithet && l.people === h.people)) return;
  sim.legends.push({ id: h.id, name: h.name, people: h.people, epithet, year: sim.year });
  if (sim.legends.length > 40) sim.legends.shift();
  sim.chronicle.add({ year: sim.year, kind: 'legend', a: refOf(h), w: epithet, x: h.x, y: h.y });
}

/** A blow that killed: warriors count beaten foes, hunters wolves. */
export function countKill(killer: Human, victim: { kind: string }) {
  if (victim.kind === 'human') killer.kills = (killer.kills ?? 0) + 1;
  else if (victim.kind === 'wolf') killer.wolves = (killer.wolves ?? 0) + 1;
}

/* ---- festivals ------------------------------------------------------------------ */

/** A festival begins in a place (unless one is going on). */
export function celebrate(sim: Sim, v: Village | undefined, kind: FestivalKind) {
  if (!v || v.ruin || festiveAt(v, sim)) return;
  v.festivalUntil = sim.time + FESTIVAL_TIME;
  v.festivalKind = kind;
  v.nextFestival = sim.time + (8 + sim.rand() * 2) * YEAR;
  if (v.loyalty !== undefined) v.loyalty = Math.min(100, v.loyalty + 5);
  sim.puff(v.x + 0.5, v.y - 0.5, 20, CONFETTI);
  sim.chronicle.add({ year: sim.year, kind: 'festival', a: { id: 0, name: v.name, people: v.people }, v: v.name, w: kind, x: v.x, y: v.y });
}

export const CONFETTI = ['#e8344a', '#ffe066', '#4d8dff', '#3ddc84', '#ff5da2', '#ffffff'];

/** Once a second: festivals start when it is time, confetti flies where one is going on. */
export function cultureTick(sim: Sim) {
  for (const v of sim.villages) {
    if (v.ruin) continue;
    if (festiveAt(v, sim)) {
      sim.puff(v.x + 0.5 + (sim.rand() - 0.5) * 4, v.y - 1 + (sim.rand() - 0.5) * 2, 5, CONFETTI);
      continue;
    }
    if (v.members < 6) continue;
    if (v.nextFestival === undefined) {
      v.nextFestival = sim.time + (2 + sim.rand() * 4) * YEAR;
      continue;
    }
    if (sim.time < v.nextFestival) continue;
    const war = [...sim.wars.values()].some((w) => (w.va !== undefined ? w.va === v.id || w.vb === v.id : w.a === v.people || w.b === v.people));
    if (war) {
      v.nextFestival = sim.time + YEAR;
      continue;
    }
    celebrate(sim, v, v.food >= v.members * 3 ? 'harvest' : 'midsummer');
    // Places with a temple celebrate twice as often
    if (v.buildings.some((b) => b.kind === 'temple')) v.nextFestival = sim.time + (4 + sim.rand()) * YEAR;
  }
}

/* ---- god gifts --------------------------------------------------------------------- */

/** The place the gods bless: the capital, else the biggest place of the people. */
export function blessedPlace(sim: Sim, p: People): Village | undefined {
  const k = sim.kingdoms.get(p);
  const capital = k && villageById(sim, k.capital);
  if (capital && !capital.ruin) return capital;
  return sim.villages.filter((v) => !v.ruin && v.people === p).sort((a, b) => b.members - a.members)[0];
}

export function giftFestival(sim: Sim, p: People) {
  const v = blessedPlace(sim, p);
  if (v) celebrate(sim, v, 'gods');
}

/**
 * The gods put up a building at once: what the place would build next (a
 * site under way is finished), else one the place does not have yet, else a
 * statue.
 */
export function giftBuilding(sim: Sim, p: People) {
  const v = blessedPlace(sim, p);
  if (v) giftBuildingAt(sim, v);
}

/** The same for one particular place (village profile). */
export function giftBuildingAt(sim: Sim, v: Village) {
  const p = v.people;
  if (v.ruin) return;
  let kind: BuildingKind | 'statue' | null = v.site?.kind ?? nextBuilding(v) ?? BUILDINGS.find((b) => !v.buildings.some((x) => x.kind === b)) ?? null;
  let spot: { x: number; y: number } | null = null;
  if (kind === 'wall') spot = { x: v.x, y: v.y };
  else if (kind && v.site?.kind === kind) spot = { x: v.site.x, y: v.site.y };
  else if (kind) spot = freeSpot(sim, v.x, v.y, kind === 'market' ? 2 : 3, kind === 'market' ? 4 : 7);
  if (!spot) kind = 'statue';
  if (kind === 'statue') {
    makeWork(sim, v, { id: 0, name: '', people: p }, undefined, 'statue');
  } else if (kind && spot) {
    if (v.site?.kind === kind) v.site = null;
    v.buildings.push({ kind, x: spot.x, y: spot.y });
    if (kind === 'wall') v.wallHp = undefined;
  }
  sim.puff(v.x + 0.5, v.y - 0.5, 16, ['#ffe066', '#ffffff', '#4d8dff']);
  sim.chronicle.add({ year: sim.year, kind: 'gift', a: { id: 0, name: v.name, people: p }, v: v.name, w: kind ?? 'statue', x: v.x, y: v.y });
}

/** For the Rules tab: peoples with places, in a fixed order. */
export const culturedPeoples = (sim: Sim) => PEOPLES.filter((p) => sim.villages.some((v) => !v.ruin && v.people === p));
