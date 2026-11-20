/**
 * Prophets and religions (Update 3, phase D). All faiths are made up, new
 * ones for every world.
 *
 * - A prophet is rare: a pious grown-up with charisma 8 and intelligence 6
 *   or more (more likely after hard years of war), or an own character with
 *   the power Prophet. They found a religion (name, symbol, colour, two
 *   doctrines), the place of the vision is holy, and they wander from place
 *   to place preaching. When they die, their grave is a holy place and they
 *   become a legend.
 * - Everyone may have a faith and a devotion 0…100. Devotion fades a little
 *   every year; temples and priests keep it up. People without a faith take
 *   the one of their place, children the one of their mother.
 * - Priests (a job in places with a temple, altar or cathedral) win over
 *   the doubters at home; missionaries (towns and cities) go to places of
 *   another faith and preach there, the better the more charisma they have.
 *   The faith of most (two fifths or more) is the faith of the place; its
 *   symbol is on the sign. A king's faith is the state religion: vassals of
 *   another faith are less loyal (kingdoms.ts).
 * - The devout go on pilgrimages to the holy places of their faith.
 * - A big old religion may split: a charismatic believer far from its holy
 *   places founds a reformed branch, and the two dislike each other.
 * - The same faith brings peoples closer, another one drives them a little
 *   apart (war.ts). Faiths with the doctrine Holy War fight peoples of
 *   other faiths; the losers are partly converted.
 *
 * Doctrines (what believers do differently): peace (fewer wars), holy war,
 * nature (half the woodcutters, no hunting), ancestors (old believers become
 * legends), knowledge (research), sea (better catches), fertility (more
 * children), poverty (half the brawls, a little slower work).
 */
import { BALANCE } from './balance';
import { ageOf, has, hasPower, PEOPLES, stage, stat, type Human, type People } from './agents';
import type { Ref } from './chronicle';
import type { Sim } from './sim';
import { refOf, think } from './social';
import type { Village } from './villages';
import { allied, declareLandWar, pairKey, warBetween } from './war';

export const DOCTRINES = ['peace', 'holyWar', 'nature', 'ancestors', 'knowledge', 'sea', 'fertility', 'poverty'] as const;
export type Doctrine = (typeof DOCTRINES)[number];
export const SYMBOLS = ['sun', 'moon', 'wave', 'flame', 'tree', 'star', 'eye', 'peak'] as const;
export type FaithSymbol = (typeof SYMBOLS)[number];
export const SYMBOL_ICON: Record<FaithSymbol, string> = { sun: '☀', moon: '☾', wave: '≈', flame: '♨', tree: '♣', star: '✦', eye: '◉', peak: '▲' };
const COLORS = ['#f2b02a', '#7a4fd1', '#e8344a', '#2fb5a8', '#ff8a1e', '#4d8dff', '#c2457a', '#7fbf3f'];
const NOUNS = ['Tide', 'Ember', 'Stone', 'Moon', 'Sun', 'Oak', 'Storm', 'Star', 'River', 'Flame', 'Dawn', 'Wolf', 'Shell', 'Wind', 'Mist', 'Hearth'];
const FORMS = ['The Way of the {n}', 'Children of the {n}', 'Order of the {n}', 'Keepers of the {n}', 'The {n} Covenant', 'Light of the {n}'];
const SCHISM = ['Reformed', 'True', 'New', 'Free'];

export interface HolyPlace {
  x: number;
  y: number;
  kind: 'vision' | 'grave';
}

export interface Religion {
  id: number;
  name: string;
  symbol: FaithSymbol;
  color: string;
  doctrines: Doctrine[];
  founder: Ref;
  founded: number;
  /** The religion it broke away from. */
  parent?: number;
  holy: HolyPlace[];
  /** The living prophet (id). */
  prophet?: number;
  /** No more believers. */
  gone?: boolean;
  /** No new split before this year. */
  splitAt?: number;
}

const R = BALANCE.religion;
const YEAR = 30;

export const religionById = (sim: Sim, id: number | undefined) => (id === undefined ? undefined : sim.religions.find((r) => r.id === id));
export const faithOf = (sim: Sim, h: Human) => religionById(sim, h.faith);

/** Does this person's faith teach it? */
export const believes = (sim: Sim, h: Human, d: Doctrine) => !!faithOf(sim, h)?.doctrines.includes(d);

/** The faith of most of a people (worked out once a year). */
export const peopleFaith = (sim: Sim, p: People) => religionById(sim, sim.peopleFaith.get(p));
export const peopleBelieves = (sim: Sim, p: People, d: Doctrine) => !!peopleFaith(sim, p)?.doctrines.includes(d);

/** "Reformed Way of the Tide" and "Way of the Tide" are branches of one tree. */
const related = (a: Religion, b: Religion) => a.parent === b.id || b.parent === a.id || (a.parent !== undefined && a.parent === b.parent);

/** Mood between two peoples per second from their faiths (war.ts). */
export function faithMood(sim: Sim, a: People, b: People): number {
  const fa = peopleFaith(sim, a);
  const fb = peopleFaith(sim, b);
  if (!fa || !fb) return 0;
  if (fa === fb) return R.sameMood;
  // A book on tolerance (society.ts): half the quarrel
  const calm = sim.tolerance.has(a) || sim.tolerance.has(b) ? 0.5 : 1;
  return (related(fa, fb) ? -R.branchMood : -R.otherMood) * calm;
}

/** Someone takes up a faith (or is strengthened in it). */
export function convert(h: Human, rel: Religion, devotion: number = R.newDevotion) {
  if (h.faith === rel.id) {
    h.devotion = Math.min(100, (h.devotion ?? 0) + 10);
    return;
  }
  h.faith = rel.id;
  h.devotion = devotion;
}

function newName(sim: Sim): string {
  for (let k = 0; k < 30; k++) {
    const name = FORMS[Math.floor(sim.rand() * FORMS.length)].replace('{n}', NOUNS[Math.floor(sim.rand() * NOUNS.length)]);
    if (!sim.religions.some((r) => r.name === name)) return name;
  }
  return `The Faith of ${NOUNS[Math.floor(sim.rand() * NOUNS.length)]} ${sim.religions.length + 1}`;
}

function pickDoctrines(sim: Sim, keep?: Doctrine): Doctrine[] {
  const pool = DOCTRINES.filter((d) => d !== keep);
  const out: Doctrine[] = keep ? [keep] : [];
  while (out.length < 2) {
    const d = pool[Math.floor(sim.rand() * pool.length)];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

/** A prophet has a vision: a new religion, the spot is holy, the family and some neighbours follow. */
export function foundReligion(sim: Sim, h: Human): Religion {
  const used = new Set(sim.religions.filter((r) => !r.gone).map((r) => r.color));
  const rel: Religion = {
    id: sim.nextReligionId++,
    name: newName(sim),
    symbol: SYMBOLS[Math.floor(sim.rand() * SYMBOLS.length)],
    color: COLORS.find((c) => !used.has(c)) ?? COLORS[Math.floor(sim.rand() * COLORS.length)],
    doctrines: pickDoctrines(sim),
    founder: refOf(h),
    founded: sim.year,
    holy: [{ x: Math.floor(h.x), y: Math.floor(h.y), kind: 'vision' }],
    prophet: h.id,
  };
  sim.religions.push(rel);
  h.prophet = rel.id;
  convert(h, rel, 100);
  // The family and some of the place follow at once
  for (const o of sim.humans) {
    if (o === h || o.dead) continue;
    const family = h.partner === o.id || h.children.includes(o.id) || o.parents.includes(h.id);
    if (family || (o.village !== undefined && o.village === h.village && sim.rand() < R.firstFollowers)) convert(o, rel, 60);
  }
  sim.prophetYear = sim.year;
  sim.chronicle.add({ year: sim.year, kind: 'prophet', a: refOf(h), u: `faith:${rel.id}`, x: h.x, y: h.y });
  sim.puff(h.x, h.y - 1, 12, ['#ffe066', '#ffffff', rel.color]);
  return rel;
}

/** A prophet died: the grave is a holy place (sim.ts). */
export function onProphetDeath(sim: Sim, h: Human) {
  const rel = religionById(sim, h.prophet);
  if (!rel) return;
  rel.prophet = undefined;
  rel.holy.push({ x: Math.floor(h.x), y: Math.floor(h.y), kind: 'grave' });
  sim.chronicle.add({ year: sim.year, kind: 'prophetDied', a: refOf(h), u: `faith:${rel.id}`, x: h.x, y: h.y });
}

/** Can this person become a prophet? */
const callable = (sim: Sim, h: Human) =>
  !h.dead && h.prophet === undefined && stage(h, sim.time) === 'adult' && ageOf(h, sim.time) < 60 && has(h, 'pious') && stat(h, 'charisma') >= 8 && stat(h, 'intelligence') >= 6;

/** Once a year: places and peoples take on faiths, devotion fades or grows, prophets, splits, state religions, holy wars. */
export function religionTick(sim: Sim) {
  if (sim.year === sim.religionYear) return;
  sim.religionYear = sim.year;
  const live = sim.villages.filter((v) => !v.ruin && !v.merged);
  const byVillage = new Map<number, Human[]>();
  for (const h of sim.humans) {
    if (h.dead || h.village === undefined) continue;
    let list = byVillage.get(h.village);
    if (!list) byVillage.set(h.village, (list = []));
    list.push(h);
  }

  // Devotion: fades, a temple and priests keep it up; the faithless take the faith of their place
  for (const v of live) {
    const members = byVillage.get(v.id) ?? [];
    const shrine = v.buildings.some((b) => b.kind === 'temple' || b.kind === 'altar' || b.kind === 'cathedral');
    const priests = members.filter((h) => h.job === 'priest').length;
    const home = religionById(sim, v.faith);
    for (const h of members) {
      if (h.faith !== undefined) {
        h.pilgrimAt ??= nextPilgrimage(sim);
        h.devotion = (h.devotion ?? 0) - (has(h, 'pious') ? 1 : R.fade) + (shrine ? 3 : 0) + (priests && h.faith === v.faith ? 10 : 0);
        h.devotion = Math.min(100, h.devotion);
        if (h.devotion <= 0) {
          h.faith = undefined;
          h.devotion = 0;
        } else if (home && h.faith !== home.id && priests && h.devotion < 35 && sim.rand() < R.priestWin) convert(h, home);
      } else if (home && sim.rand() < R.adopt) convert(h, home);
    }
    // The faith of most is the faith of the place
    const count = new Map<number, number>();
    for (const h of members) if (h.faith !== undefined) count.set(h.faith, (count.get(h.faith) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    // A place keeps its faith while three in ten still hold it (no flipping back and forth)
    const keeps = v.faith !== undefined && (count.get(v.faith) ?? 0) >= members.length * R.keepShare;
    const faith = keeps ? v.faith : top && top[1] >= members.length * R.placeShare ? top[0] : undefined;
    if (faith !== v.faith) {
      const was = v.faith;
      v.faith = faith;
      if (faith !== undefined && was !== undefined && members.length >= 6) {
        sim.chronicle.add({ year: sim.year, kind: 'converted', a: { id: 0, name: v.name, people: v.people }, v: v.name, u: `faith:${faith}`, x: v.x, y: v.y });
      }
    }
  }
  // …and of most of a people
  sim.peopleFaith.clear();
  for (const p of PEOPLES) {
    const all = sim.humans.filter((h) => h.people === p && !h.dead);
    const count = new Map<number, number>();
    for (const h of all) if (h.faith !== undefined) count.set(h.faith, (count.get(h.faith) ?? 0) + 1);
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= all.length * R.peopleShare) sim.peopleFaith.set(p, top[0]);
  }

  // Religions without believers are forgotten
  for (const r of sim.religions) {
    if (r.gone) continue;
    if (!sim.humans.some((h) => h.faith === r.id && !h.dead)) r.gone = true;
  }

  // Prophets: own characters with the power at once, others rarely (more often after a war)
  for (const h of sim.humans) if (hasPower(h, 'prophet') && h.prophet === undefined && !h.dead && stage(h, sim.time) === 'adult') foundReligion(sim, h);
  const alive = sim.religions.filter((r) => !r.gone).length;
  if (alive < R.maxFaiths && sim.year - sim.prophetYear >= R.prophetGap) {
    const wars = sim.deaths.recent.filter(([y, c]) => c === 'human' && y >= sim.year - 10).length;
    // Hard times bring prophets: wars, and disasters in the last ten years (Update 3)
    const chance = R.prophetChance * (1 + Math.min(2, wars / 20)) * (sim.year - sim.disasterYear < 10 ? 2 : 1);
    const called = sim.humans.filter((h) => callable(sim, h));
    const pick = called.find(() => sim.rand() < chance);
    if (pick) foundReligion(sim, pick);
  }

  // Splits: a big old faith, a charismatic believer far from its holy places
  for (const r of [...sim.religions]) {
    if (r.gone || sim.year - r.founded < R.splitAge || (r.splitAt ?? 0) > sim.year) continue;
    const flock = sim.humans.filter((h) => h.faith === r.id && !h.dead);
    if (flock.length < R.splitSize || sim.rand() > R.splitChance) continue;
    const far = (h: Human) => r.holy.every((p) => Math.hypot(p.x - h.x, p.y - h.y) > 25);
    const rebel = flock.find((h) => stage(h, sim.time) === 'adult' && h.prophet === undefined && stat(h, 'charisma') >= 7 && far(h));
    if (!rebel) continue;
    split(sim, r, rebel);
  }

  // State religions: the faith of the king
  for (const k of sim.kingdoms.values()) {
    const king = k.king !== undefined ? (sim.byId(k.king) as Human | undefined) : undefined;
    if (!king || king.faith === undefined || king.faith === k.stateFaith) continue;
    k.stateFaith = king.faith;
    sim.chronicle.add({ year: sim.year, kind: 'stateFaith', a: refOf(king), p: k.people, u: `faith:${king.faith}`, x: king.x, y: king.y });
  }

  holyWars(sim, live);
}

/** A branch breaks away: one doctrine kept, one new, the rebel's place goes with it. */
function split(sim: Sim, parent: Religion, rebel: Human) {
  // A name nobody had before: "Reformed …", "True …", else "Second Reformed …"
  const base = parent.name.replace(/^(The |Reformed |True |New |Free |Second |Third )+/, '');
  const taken = new Set(sim.religions.map((r) => r.name));
  const options = [...SCHISM.map((p) => `${p} ${base}`), ...SCHISM.map((p) => `Second ${p} ${base}`), ...SCHISM.map((p) => `Third ${p} ${base}`)];
  const free = options.filter((n) => !taken.has(n));
  const plain = free.filter((n) => !/^(Second|Third) /.test(n));
  const name = (plain.length ? plain[Math.floor(sim.rand() * plain.length)] : free[0]) ?? `${SCHISM[0]} ${base} ${sim.religions.length}`;
  const used = new Set(sim.religions.filter((r) => !r.gone).map((r) => r.color));
  const rel: Religion = {
    id: sim.nextReligionId++,
    name,
    symbol: parent.symbol,
    color: COLORS.find((c) => !used.has(c)) ?? parent.color,
    doctrines: pickDoctrines(sim, parent.doctrines[0]),
    founder: refOf(rebel),
    founded: sim.year,
    parent: parent.id,
    holy: [{ x: Math.floor(rebel.x), y: Math.floor(rebel.y), kind: 'vision' }],
  };
  sim.religions.push(rel);
  parent.splitAt = sim.year + R.splitPause;
  rel.splitAt = sim.year + R.splitPause;
  for (const h of sim.humans) {
    if (h.dead || h.faith !== parent.id) continue;
    if (h === rebel || (h.village !== undefined && h.village === rebel.village && sim.rand() < 0.7)) convert(h, rel, 60);
  }
  const v = rebel.village !== undefined ? sim.villages.find((x) => x.id === rebel.village) : undefined;
  sim.chronicle.add({ year: sim.year, kind: 'schism', a: refOf(rebel), u: `faith:${rel.id}`, w: `faith:${parent.id}`, v: v?.name, x: rebel.x, y: rebel.y });
}

/** Peoples whose faith teaches holy war fight their neighbours of another faith now and then. */
function holyWars(sim: Sim, live: Village[]) {
  for (const p of PEOPLES) {
    const mine = peopleFaith(sim, p);
    if (!mine?.doctrines.includes('holyWar')) continue;
    for (const q of PEOPLES) {
      if (q === p) continue;
      const theirs = peopleFaith(sim, q);
      if (!theirs || theirs === mine || warBetween(sim, p, q) || allied(sim, p, q)) continue;
      if ((sim.treaties.get(pairKey(p, q)) ?? 0) > sim.time) continue;
      // Neighbours on the same land, or known places over the sea for a people with a harbor (like war.ts)
      const mineV = live.filter((v) => v.people === p);
      const theirsV = live.filter((v) => v.people === q);
      const harbor = mineV.some((v) => v.buildings.some((b) => b.kind === 'harbor'));
      const near = mineV.some((a) => theirsV.some((b) => sim.world.sameLand(a.x, a.y, b.x, b.y) || (harbor && sim.world.seen(b.x, b.y))));
      if (!near || sim.rand() > R.holyWarChance * sim.rules.aggression * (sim.tolerance.has(p) ? 0.5 : 1)) continue;
      // The goal: a holy place of the other faith in their land, else to convert them
      const target = live.find((v) => v.people === q && theirs.holy.some((h) => Math.hypot(h.x - v.x, h.y - v.y) < 10));
      declareLandWar(sim, p, q, { kind: 'faith', village: target?.id });
      return;
    }
  }
}

/** A holy war is won: part of the losing people takes the winners' faith (war.ts). */
export function holyWarWon(sim: Sim, winner: People, loser: People) {
  const rel = peopleFaith(sim, winner);
  if (!rel) return;
  for (const h of sim.humans) if (h.people === loser && !h.dead && sim.rand() < R.holyWarConvert) convert(h, rel);
}

/* ---- preaching and pilgrims (ai.ts) ------------------------------------------------- */

/** Where a prophet or missionary goes to preach: the nearest place of another faith on the same land (else home). */
export function preachTarget(sim: Sim, h: Human): Village | undefined {
  const own = h.village !== undefined ? sim.villages.find((v) => v.id === h.village) : undefined;
  if (h.job === 'priest') return own;
  const reach = h.prophet !== undefined ? 70 : 45;
  const others = sim.villages
    .filter((v) => !v.ruin && !v.merged && v.faith !== h.faith && sim.world.sameLand(v.x, v.y, h.x, h.y) && Math.hypot(v.x - h.x, v.y - h.y) < reach)
    .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
  // A prophet starts at home until most there believe
  if (h.prophet !== undefined && own && own.faith !== h.faith) return own;
  return others[Math.floor(sim.rand() * Math.min(3, others.length))] ?? own;
}

/** One tick of preaching: listeners nearby may take up the faith (the more charisma, the better). */
export function preach(sim: Sim, h: Human, dt: number) {
  const rel = faithOf(sim, h);
  if (!rel) return;
  const power = (h.prophet !== undefined ? R.prophetPower : h.job === 'missionary' ? R.missionaryPower : R.priestPower) * (stat(h, 'charisma') / 5);
  for (const o of sim.near(h.x, h.y, 5, (a) => a.kind === 'human' && a !== h)) {
    const p = o as Human;
    if (stage(p, sim.time) === 'child') continue;
    if (p.faith === rel.id) {
      p.devotion = Math.min(100, (p.devotion ?? 0) + 4 * dt);
      continue;
    }
    // Stronger believers of another faith are harder to win over; the pious hold on longest
    const resist = (p.devotion ?? 0) / 100 + (has(p, 'pious') && p.faith !== undefined ? 0.3 : 0);
    if (sim.rand() < power * dt * Math.max(0.05, 1 - resist)) {
      convert(p, rel);
      think(p, 'light', 2, sim);
    }
  }
  if (sim.rand() < dt * 0.4) think(h, 'light', 1.5, sim);
}

/** A holy place of the person's faith on the same land, for a pilgrimage. */
export function pilgrimSite(sim: Sim, h: Human): HolyPlace | undefined {
  const rel = faithOf(sim, h);
  if (!rel) return undefined;
  return rel.holy
    .filter((p) => sim.world.sameLand(p.x, p.y, h.x, h.y) && Math.hypot(p.x - h.x, p.y - h.y) > 6)
    .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
}

/** Next possible pilgrimage, some years ahead (so the devout do not all go at once). */
export const nextPilgrimage = (sim: Sim) => sim.time + (R.pilgrimYears * (0.5 + sim.rand())) * YEAR;

/** Wants a priest or a missionary (jobs.ts). */
export function faithJobs(sim: Sim, v: Village): { priest: number; missionary: number } {
  if (v.faith === undefined) return { priest: 0, missionary: 0 };
  const shrine = v.buildings.some((b) => b.kind === 'temple' || b.kind === 'altar' || b.kind === 'cathedral');
  const town = (v.tier ?? 'village') !== 'village';
  const other = town && sim.villages.some((o) => !o.ruin && o.faith !== v.faith && sim.world.sameLand(o.x, o.y, v.x, v.y) && Math.hypot(o.x - v.x, o.y - v.y) < 45);
  return { priest: shrine ? 1 : 0, missionary: other ? 1 : 0 };
}
