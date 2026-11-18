/**
 * Saving and loading the island in localStorage (`jxsi_tiny_island_v1`):
 * terrain, berries, fish, everyone alive, graves, villages, chronicle, moods,
 * wars, favourites, rules and the population history. Tasks and paths are
 * not saved; everyone simply thinks again after loading.
 */
import { PEOPLES, setNextId, type Animal, type Human, type People } from './agents';
import type { ChronicleEntry, Ref } from './chronicle';
import { INVENTIONS, type Invention, type Tech } from './inventions';
import { randFor } from './rng';
import type { Sim } from './sim';
import type { Snapshot } from './stats';
import type { Village } from './villages';
import type { Army, War } from './war';
import type { Kingdom } from './kingdoms';
import type { Legend, Work } from './culture';
import type { World } from './world';

const KEY = 'jxsi_tiny_island_v1';

type SavedHuman = Omit<Human, 'rel' | 'path' | 'task'> & { rel: [number, number][] };
type SavedAnimal = Omit<Animal, 'path' | 'task'>;

interface SaveData {
  v: 1;
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
  vmood?: [string, number][];
  /** Kingdoms (Phase 11). */
  kingdoms?: [People, Kingdom][];
  /** Works of art and legends (Phase 12). */
  works?: Work[];
  nextWorkId?: number;
  legends?: Legend[];
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
    v: 1,
    savedAt: Date.now(),
    seed: world.seed,
    time: sim.time,
    tiles: toB64(world.tiles),
    bush: toB64(new Uint8Array(world.bush.buffer)),
    fish: toB64(world.fish),
    crop: toB64(world.crop),
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
    vmood: [...sim.vmood.entries()],
    kingdoms: [...sim.kingdoms.entries()],
    works: sim.works,
    nextWorkId: sim.nextWorkId,
    legends: sim.legends,
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
    return raw && raw.v === 1 ? (raw as SaveData) : null;
  } catch {
    return null;
  }
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
  world.seed = d.seed;
  fromB64(d.tiles, world.tiles);
  fromB64(d.bush, new Uint8Array(world.bush.buffer));
  fromB64(d.fish, world.fish);
  world.crop.fill(0);
  if (d.crop) fromB64(d.crop, world.crop);
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
    arms: v.arms ?? { club: 0, bronze: 0, iron: 0, armor: 0 },
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
  for (const [k, m] of d.vmood ?? []) sim.vmood.set(k, m);
  for (const [p, k] of d.kingdoms ?? []) sim.kingdoms.set(p, k);
  sim.works = d.works ?? [];
  sim.nextWorkId = d.nextWorkId ?? 1;
  sim.legends = d.legends ?? [];
  if (d.tech) for (const [p, t] of d.tech) sim.tech.set(p, { known: [...t.known], progress: t.progress });
  else oldTech(sim);
  setNextId(d.nextAgentId);
  return true;
}
