/**
 * Saving and loading the island in localStorage (`jxsi_tiny_island_v1`):
 * terrain, berries, fish, everyone alive, graves, villages, chronicle, moods,
 * wars, favourites, rules and the population history. Tasks and paths are
 * not saved; everyone simply thinks again after loading.
 */
import { familyName } from './names';
import { type BloodFeud } from './drama';
import { PEOPLES, rollStats, setNextId, type Animal, type Human, type People } from './agents';
import type { ChronicleEntry, Ref } from './chronicle';
import { INVENTIONS, type Invention, type Tech } from './inventions';
import { randFor } from './rng';
import type { Sim } from './sim';
import type { Snapshot } from './stats';
import type { Village } from './villages';
import type { Army, War } from './war';
import type { Kingdom } from './kingdoms';
import type { Legend, Work } from './culture';
import { H, W, type Island, type World } from './world';
import type { Ship, Wreck } from './ships';
import type { Wonder } from './wonders';

const KEY = 'jxsi_tiny_island_v1';

type SavedHuman = Omit<Human, 'rel' | 'path' | 'task'> & { rel: [number, number][] };
type SavedAnimal = Omit<Animal, 'path' | 'task'>;

/** Format version; `migrate` brings older saves up to it. */
const VERSION = 5;

interface SaveData {
  v: number;
  savedAt: number;
  seed: string;
  time: number;
  tiles: string;
  bush: string;
  fish: string;
  /** Crops on fields (Phase 7; older saves have none). */
  crop?: string;
  humans: SavedHuman[];
  animals: SavedAnimal[];
  graves: Sim['graves'];
  villages: Village[];
  nextVillageId: number;
  nextAgentId: number;
  chronicle: { entries: ChronicleEntry[]; nextId: number };
  mood: [string, number][];
  wars: [string, War][];
  favorites: number[];
  registry: [number, Ref & { alive: boolean; female: boolean }][];
  rules: Sim['rules'];
  history: Snapshot[];
  /** Inventions per people (Phase 9; older saves have none). */
  tech?: [People, Tech][];
  /** Armies, alliances, treaties and moods between villages (Phase 10). */
  armies?: Army[];
  nextArmyId?: number;
  alliances?: string[];
  treaties?: [string, number][];
  /** Who lost the last war between two peoples (phase F). */
  grudges?: [string, People][];
  vmood?: [string, number][];
  /** Leagues, plots, places growing together (phase D; older saves have none). */
  leagues?: Sim['leagues'];
  nextLeagueId?: number;
  plots?: Sim['plots'];
  nextPlotId?: number;
  fusionWatch?: [string, number][];
  /** Blood feuds (v4). */
  bloodFeuds?: [string, BloodFeud][];
  /** Kingdoms (Phase 11). */
  kingdoms?: [People, Kingdom][];
  /** Tree ages and deaths by cause, storyteller (v2, Update 2). */
  treeEnd?: string;
  deaths?: Sim['deaths'];
  quietSince?: number;
  /** Works of art and legends (Phase 12). */
  works?: Work[];
  nextWorkId?: number;
  legends?: Legend[];
  /** Phase G (v5): the world's size (older saves: 160 × 100), fog, gold and spices, islands, ships, wrecks. */
  w?: number;
  h?: number;
  fog?: string;
  deposit?: string;
  islands?: Island[];
  ships?: Ship[];
  nextShipId?: number;
  wrecks?: Wreck[];
  /** World wonders (phase H). */
  wonders?: Wonder[];
  nextWonderId?: number;
}

function toB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string, into: Uint8Array) {
  const bin = atob(s);
  for (let i = 0; i < bin.length && i < into.length; i++) into[i] = bin.charCodeAt(i);
}

export function save(sim: Sim, world: World): boolean {
  const strip = <T extends { path: unknown; task: unknown }>(a: T) => {
    const { path: _p, task: _t, ...rest } = a;
    return rest;
  };
  const data: SaveData = {
    v: VERSION,
    savedAt: Date.now(),
    seed: world.seed,
    time: sim.time,
    tiles: toB64(world.tiles),
    bush: toB64(new Uint8Array(world.bush.buffer)),
    fish: toB64(world.fish),
    crop: toB64(world.crop),
    treeEnd: toB64(new Uint8Array(world.treeEnd.buffer)),
    deaths: sim.deaths,
    quietSince: sim.quietSince,
    humans: sim.humans.filter((h) => !h.dead).map((h) => ({ ...strip(h), rel: [...h.rel.entries()].map(([k, v]) => [k, Math.round(v)]) })),
    animals: sim.animals.filter((a) => !a.dead).map(strip),
    graves: sim.graves,
    villages: sim.villages,
    nextVillageId: sim.nextVillageId,
    nextAgentId: Math.max(0, ...sim.registry.keys(), ...sim.animals.map((a) => a.id)) + 1,
    chronicle: { entries: sim.chronicle.entries, nextId: sim.chronicle.nextIdValue },
    mood: [...sim.mood.entries()],
    wars: [...sim.wars.entries()],
    favorites: [...sim.favorites],
    registry: [...sim.registry.entries()],
    rules: sim.rules,
    history: sim.history,
    tech: [...sim.tech.entries()],
    armies: sim.armies,
    nextArmyId: sim.nextArmyId,
    alliances: [...sim.alliances],
    treaties: [...sim.treaties.entries()],
    grudges: [...sim.grudges.entries()],
    vmood: [...sim.vmood.entries()],
    kingdoms: [...sim.kingdoms.entries()],
    bloodFeuds: [...sim.bloodFeuds.entries()],
    leagues: sim.leagues,
    nextLeagueId: sim.nextLeagueId,
    plots: sim.plots,
    nextPlotId: sim.nextPlotId,
    fusionWatch: [...sim.fusionWatch.entries()],
    works: sim.works,
    nextWorkId: sim.nextWorkId,
    legends: sim.legends,
    w: world.w,
    h: world.h,
    fog: toB64(world.fog),
    deposit: toB64(world.deposit),
    islands: world.islands,
    ships: sim.ships.map((s) => ({ ...s, path: null })),
    nextShipId: sim.nextShipId,
    wrecks: sim.wrecks,
    wonders: sim.wonders,
    nextWonderId: sim.nextWonderId,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

function read(): SaveData | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return raw && typeof raw.v === 'number' && raw.v >= 1 && raw.v <= VERSION ? migrate(raw as SaveData) : null;
  } catch {
    return null;
  }
}

/**
 * Older saves, step by step:
 *  - v1 → v2 (Update 2): no tree ages (every forest gets one on the next
 *    nature check), no death statistics, the storyteller starts counting now
 *  - v2 → v3 (phase B): abilities for everyone
 *  - v3 → v4 (phase C): family names (royal blood comes back with the next tick)
 *  - v4 → v5 (phase G): the old 160 × 100 island stays as it is, no fog, no ships
 */
function migrate(d: SaveData): SaveData {
  if (d.v < 2) {
    d.deaths = { total: {}, recent: [] };
    d.quietSince = Math.floor(d.time / 30) + 1;
    d.v = 2;
  }
  if (d.v < 3) {
    // Everyone gets abilities, from the island's seed so it is the same each time
    const rand = randFor(d.seed, 'stats');
    for (const h of d.humans) if (!h.stats) h.stats = rollStats(rand, h.traits ?? []);
    d.v = 3;
  }
  if (d.v < 4) {
    // Family names: the oldest first, children take their father's (else their mother's)
    const rand = randFor(d.seed, 'families');
    const byId = new Map(d.humans.map((h) => [h.id, h]));
    for (const h of [...d.humans].sort((a, b) => a.born - b.born)) {
      if (h.surname) continue;
      const parents = h.parents.map((id) => byId.get(id)).filter((p): p is SavedHuman => !!p);
      const from = parents.find((p) => !p.female) ?? parents[0];
      h.surname = from?.surname ?? familyName(rand, h.people);
    }
    d.v = 4;
  }
  if (d.v < 5) {
    d.w = W;
    d.h = H;
    d.v = 5;
  }
  return d;
}

/** A short summary for the start screen, or null if nothing is saved. */
export function savedSummary(): { year: number; people: number; seed: string } | null {
  const d = read();
  return d ? { year: Math.floor(d.time / 30) + 1, people: d.humans.length, seed: d.seed } : null;
}

/**
 * Saves from before inventions: every people keeps what it already had, so
 * it gets the inventions up to the last one it was using (tools, fields,
 * stone houses or walls).
 */
function oldTech(sim: Sim) {
  for (const p of PEOPLES) {
    const vs = sim.villages.filter((v) => v.people === p && !v.ruin);
    let upTo: Invention | null = null;
    if (vs.some((v) => v.tools > 0)) upTo = 'tools';
    if (vs.some((v) => v.fields > 0)) upTo = 'agriculture';
    if (vs.some((v) => v.houses.some((h) => h.level >= 2) || v.buildings.some((b) => b.kind === 'wall'))) upTo = 'masonry';
    if (upTo) sim.tech.set(p, { known: INVENTIONS.slice(0, INVENTIONS.indexOf(upTo) + 1), progress: 0 });
  }
}

/** Loads the saved island into `sim` and `world`; false if there is none. */
export function load(sim: Sim, world: World): boolean {
  const d = read();
  if (!d) return false;
  world.resize(d.w ?? W, d.h ?? H);
  world.seed = d.seed;
  fromB64(d.tiles, world.tiles);
  fromB64(d.bush, new Uint8Array(world.bush.buffer));
  fromB64(d.fish, world.fish);
  world.crop.fill(0);
  if (d.crop) fromB64(d.crop, world.crop);
  world.treeEnd.fill(0);
  if (d.treeEnd) fromB64(d.treeEnd, new Uint8Array(world.treeEnd.buffer));
  world.fog.fill(0);
  if (d.fog) fromB64(d.fog, world.fog);
  world.deposit.fill(0);
  if (d.deposit) fromB64(d.deposit, world.deposit);
  world.islands = d.islands ?? [];
  world.fogVersion++;
  world.version++;
  world.all = true;
  world.dirty.clear();

  sim.reset();
  sim.time = d.time;
  sim.rand = randFor(d.seed, `load${Math.floor(d.time)}`);
  for (const h of d.humans) {
    const human: Human = { ...h, rel: new Map(h.rel), path: null, task: null, thinkAt: d.time + Math.random() * 0.5, asleep: false, moving: false, chatUntil: 0 };
    sim.humans.push(human);
    sim.index(human);
  }
  for (const a of d.animals) {
    const animal: Animal = { ...a, path: null, task: null, thinkAt: d.time + Math.random() * 0.6, moving: false };
    sim.animals.push(animal);
    sim.index(animal);
  }
  sim.graves = d.graves;
  // Older saves: villages without the Phase 7 storage
  sim.villages = d.villages.map((v) => ({
    ...v,
    ore: v.ore ?? 0,
    tools: v.tools ?? 0,
    fields: v.fields ?? 0,
    ripe: v.ripe ?? 0,
    buildings: v.buildings ?? [],
    tier: v.tier ?? 'village',
    // Older saves: no muskets yet (phase E)
    arms: Object.assign({ club: 0, bronze: 0, iron: 0, musket: 0, armor: 0 }, v.arms),
    need: { ...v.need, ore: v.need?.ore ?? 0 },
  }));
  sim.nextVillageId = d.nextVillageId;
  sim.chronicle.restore(d.chronicle.entries, d.chronicle.nextId);
  for (const [k, v] of d.mood) sim.mood.set(k, v);
  for (const [k, v] of d.wars) sim.wars.set(k, v);
  for (const id of d.favorites) sim.favorites.add(id);
  for (const [k, v] of d.registry) sim.registry.set(k, v);
  Object.assign(sim.rules, d.rules);
  sim.history = d.history;
  sim.historyYear = sim.year;
  sim.armies = d.armies ?? [];
  sim.nextArmyId = d.nextArmyId ?? 1;
  for (const k of d.alliances ?? []) sim.alliances.add(k);
  for (const [k, t] of d.treaties ?? []) sim.treaties.set(k, t);
  for (const [k, p] of d.grudges ?? []) sim.grudges.set(k, p);
  for (const [k, m] of d.vmood ?? []) sim.vmood.set(k, m);
  for (const [p, k] of d.kingdoms ?? []) sim.kingdoms.set(p, k);
  for (const [k, f] of d.bloodFeuds ?? []) sim.bloodFeuds.set(k, f);
  sim.leagues = d.leagues ?? [];
  sim.nextLeagueId = d.nextLeagueId ?? 1;
  sim.plots = d.plots ?? [];
  sim.nextPlotId = d.nextPlotId ?? 1;
  for (const [k, y] of d.fusionWatch ?? []) sim.fusionWatch.set(k, y);
  sim.works = d.works ?? [];
  sim.deaths = d.deaths ?? { total: {}, recent: [] };
  sim.quietSince = d.quietSince ?? sim.year;
  sim.nextWorkId = d.nextWorkId ?? 1;
  sim.legends = d.legends ?? [];
  sim.nextShipId = d.nextShipId ?? 1;
  sim.wrecks = d.wrecks ?? [];
  sim.wonders = d.wonders ?? [];
  sim.nextWonderId = d.nextWonderId ?? 1;
  // Ships plan their course again from where they are
  sim.ships = (d.ships ?? []).map((s) => ({ ...s, path: null }));
  if (d.tech) for (const [p, t] of d.tech) sim.tech.set(p, { known: [...t.known], progress: t.progress });
  else oldTech(sim);
  setNextId(d.nextAgentId);
  return true;
}
