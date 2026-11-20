/**
 * Villages: as soon as four people of the same people without a village are
 * together, they found one, with a name, a square and a storage for food,
 * wood and stone. Once a second the village thinks: who lives here, who
 * leads (the oldest grown-up who is wise or brave), what is missing (food for
 * everyone, wood and stone for the next house), what to build next (tent,
 * then wooden house, then stone house), who gets a finished house, whether
 * it is too crowded (more than 20: young adults leave and found a new
 * village) or empty (then it falls into ruins, which others can resettle).
 */
import { onWonder, projectOf } from './wonders';
import { stat, hasPower, ageOf, has, PERKS, stage, type Human, type People } from './agents';
import { villageName } from './names';
import type { Sim } from './sim';
import { assignJobs } from './jobs';
import type { FestivalKind, Piece } from './culture';
import { knows } from './inventions';
import { BUILDING_COST, crowdedAt, HALF_SIZE, nextBuilding, promote, spoil, tierOf, trade, type Building, type BuildingKind, type PenAnimal, type Tier } from './town';
import { wantedPen } from './pens';
import { refOf, story } from './social';
import { T } from './world';
import { BALANCE } from './balance';
import { foreignLand, landGrab } from './territory';
import { gridSpot, layStreet, livingRadius } from './roads';

/** Tent, wooden house, stone house, town house (two floors, cities only). */
export type HouseLevel = 0 | 1 | 2 | 3;

export interface House {
  x: number;
  y: number;
  level: HouseLevel;
  /** Household living here (a couple or a single grown-up), by id. */
  owners: number[];
}

/** A house being built or upgraded; materials are taken from storage when it starts. */
export interface Site {
  x: number;
  y: number;
  level: HouseLevel;
  /** Upgrading this house (else a new one). */
  house?: House;
  /** A special building instead of a house (town.ts). */
  kind?: BuildingKind;
  /** A pen: for which animals (Update 3). */
  animal?: PenAnimal;
  /** Person-seconds of work done and needed. */
  done: number;
  needed: number;
}

export interface Village {
  id: number;
  name: string;
  people: People;
  /** The square (tile). */
  x: number;
  y: number;
  food: number;
  wood: number;
  stone: number;
  /** Ore from the mountains and the tools the smith makes of it (Phase 7). */
  ore: number;
  tools: number;
  /** Fields around the square and how many are ripe (counted with the jobs). */
  fields: number;
  ripe: number;
  houses: House[];
  /** Granary, market, temple … (town.ts). */
  buildings: Building[];
  tier?: Tier;
  /** Next yearly trade at the market, and with whom it last traded. */
  tradeAt?: number;
  tradedWith?: string;
  site: Site | null;
  leader?: number;
  members: number;
  founded: number;
  ruin: boolean;
  /** 0 … 1, how badly the storage needs each resource (for the work score). */
  need: { food: number; wood: number; stone: number; ore: number };
  /** Next game time to hand out jobs again. */
  jobsAt?: number;
  /** Mountains close enough to get stone and ore from (counted with the jobs). */
  rock?: boolean;
  /** Weapons and armour in store (Phase 10). */
  arms: { club: number; bronze: number; iron: number; musket: number; armor: number };
  /** What is left of the city wall under a siege (full when unset). */
  wallHp?: number;
  /** No new army sets out before this game time. */
  armyAt?: number;
  /** Tamed horses in the stable (phase F): riders take them along. */
  horses?: number;
  /** Kingdoms (Phase 11): risen up against the crown, and loyalty 0 … 100 (60 when unset). */
  free?: boolean;
  loyalty?: number;
  /** Grew together with a bigger neighbour (phase D): gone, not even a ruin to see. */
  merged?: boolean;
  /** Hunger (Update 2): next time help may be asked for, next time a famine may drive people away. */
  aidAt?: number;
  famineAt?: number;
  /** Culture (Phase 12): statues and murals, the festival going on and the next one. */
  art?: Piece[];
  festivalUntil?: number;
  festivalKind?: FestivalKind;
  nextFestival?: number;
  /** Phase G: the mother town of a colony and the colony's loyalty (0 … 100); a colony that rose up against it. */
  colonyOf?: number;
  colonyLoyalty?: number;
  rebelOf?: number;
  /** Gold and spices gathered so far (the treasury), and whether the first find made the chronicle. */
  gold?: number;
  spice?: number;
  goldFound?: boolean;
  spiceFound?: boolean;
  /** Islanders: years in a row a friendly people lived on their island. */
  joinWatch?: number;
  /** False once it turned out the place has no coast for a harbor. */
  coast?: boolean;
  /** Update 3, phase B: the year it fell into ruins (its land goes 20 years later), and extra reach of its land (castles). */
  ruinYear?: number;
  landBonus?: number;
  /** Update 3, phase C: plots of 4 × 3 fields (top-left tiles, jobs.ts). */
  plots?: { x: number; y: number }[];
  /** No new try at a castle before this year (no room was found). */
  castleAt?: number;
  /** Update 3, phase D: the faith of most of its people (religion.ts). */
  faith?: number;
  /** Update 3, phase E: culture level 0…4, the best it reached, its culture points, unhappy years in a row, war trophies (society.ts). */
  culture?: number;
  cultureTop?: number;
  culturePoints?: number;
  unhappyYears?: number;
  trophies?: number;
}

/** Building costs per level: tent, wooden house, stone house. */
const COST: { wood: number; stone: number; work: number }[] = [
  { wood: 2, stone: 0, work: 4 },
  { wood: 6, stone: 0, work: 8 },
  { wood: 2, stone: 6, work: 12 },
  { wood: 4, stone: 6, work: 14 },
];

const costOf = (s: Omit<Site, 'done' | 'needed'>) => (s.kind ? BUILDING_COST[s.kind] : COST[s.level]);

export const FOUND_SIZE = 4;
const RADIUS = 8;

export const villageOf = (h: Human, sim: Sim) => (h.village === undefined ? undefined : sim.villages.find((v) => v.id === h.village));

const isAdult = (h: Human, sim: Sim) => stage(h, sim.time) !== 'child';

/** Is something built on or right next to this tile? (Castles and pens are 5 × 5.) */
export function taken(sim: Sim, tx: number, ty: number) {
  return sim.villages.some(
    (v) =>
      (Math.abs(v.x - tx) < 2 && Math.abs(v.y - ty) < 2) ||
      v.houses.some((h) => Math.abs(h.x - tx) < 2 && Math.abs(h.y - ty) < 2) ||
      v.buildings.some((b) => {
        const r = 2 + (HALF_SIZE[b.kind] ?? 0);
        return Math.abs(b.x - tx) < r && Math.abs(b.y - ty) < r;
      }) ||
      !!v.art?.some((p) => p.kind === 'statue' && Math.abs(p.x - tx) < 2 && Math.abs(p.y - ty) < 2) ||
      (v.site && Math.abs(v.site.x - tx) < 2 && Math.abs(v.site.y - ty) < 2),
  ) || onWonder(sim, tx, ty);
}

/**
 * A spot for a harbor (phase G): free grass or sand within 9 tiles of the
 * square, right at water that leads to the open sea (deep water close by).
 */
export function coastSpot(sim: Sim, v: Village): { x: number; y: number } | null {
  const w = sim.world;
  const water = (x: number, y: number) => w.get(x, y) === T.DEEP || w.get(x, y) === T.SHALLOW;
  for (let r = 2; r <= 9; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = v.x + dx;
        const y = v.y + dy;
        const t = w.get(x, y);
        if ((t !== T.GRASS && t !== T.SAND) || !w.sameLand(v.x, v.y, x, y) || taken(sim, x, y)) continue;
        if (!(water(x + 1, y) || water(x - 1, y) || water(x, y + 1) || water(x, y - 1))) continue;
        let deep = false;
        for (let oy = -4; oy <= 4 && !deep; oy++) for (let ox = -4; ox <= 4 && !deep; ox++) if (w.get(x + ox, y + oy) === T.DEEP) deep = true;
        if (deep) return { x, y };
      }
    }
  }
  return null;
}

/**
 * A colony (phase G): the settlers of a ship found a place of their people
 * on another island; it belongs to the town they came from.
 */
export function foundColony(sim: Sim, people: People, x: number, y: number, mother: Village | undefined, settlers: Human[]): Village {
  const spot = freeSpot(sim, x, y, 0, 3) ?? { x, y };
  const v = newVillage(sim, people, spot.x, spot.y);
  v.food += 6;
  v.wood += 4;
  if (mother) {
    v.colonyOf = mother.id;
    v.colonyLoyalty = 70;
  }
  for (const h of settlers) {
    for (const house of sim.villages.flatMap((o) => o.houses)) house.owners = house.owners.filter((id) => id !== h.id);
    h.home = null;
    join(h, v, sim);
  }
  return v;
}

/** A free land tile around (x, y) between r0 and r1 tiles away, not on a house. */
export function freeSpot(sim: Sim, x: number, y: number, r0: number, r1: number) {
  for (let k = 0; k < 60; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = r0 + sim.rand() * (r1 - r0);
    const tx = Math.round(x + Math.cos(ang) * d);
    const ty = Math.round(y + Math.sin(ang) * d);
    const t = sim.world.get(tx, ty);
    if ((t === T.GRASS || t === T.SAND) && !taken(sim, tx, ty) && sim.world.sameLand(x, y, tx, ty)) return { x: tx, y: ty };
  }
  return null;
}

function newVillage(sim: Sim, people: People, x: number, y: number): Village {
  const v: Village = {
    id: sim.nextVillageId++,
    name: villageName(sim.rand, people, sim.villages.map((o) => o.name)),
    people,
    x,
    y,
    food: 4,
    wood: 2,
    stone: 0,
    ore: 0,
    tools: 0,
    fields: 0,
    ripe: 0,
    houses: [],
    buildings: [],
    arms: { club: 0, bronze: 0, iron: 0, musket: 0, armor: 0 },
    tier: 'village',
    site: null,
    members: 0,
    founded: sim.year,
    ruin: false,
    need: { food: 0, wood: 0, stone: 0, ore: 0 },
  };
  sim.villages.push(v);
  return v;
}

/** Puts someone (and their small children) into a village. */
export function join(h: Human, v: Village, sim: Sim) {
  if (h.village === v.id) return;
  h.village = v.id;
  if (!h.home || !v.houses.some((x) => x.owners.includes(h.id))) h.home = { x: v.x, y: v.y };
  for (const id of h.children) {
    const c = sim.byId(id) as Human | undefined;
    if (c && stage(c, sim.time) === 'child' && c.village !== v.id) {
      c.village = v.id;
      c.home = h.home;
    }
  }
}

/**
 * Every 2 seconds: people without a village join one of their people close
 * by, or found a new one when four of them are together (in the ruins of an
 * old village if there is one nearby).
 */
export function settle(sim: Sim) {
  const homeless = sim.humans.filter((h) => h.village === undefined && !h.dead);
  for (const h of homeless) {
    if (h.village !== undefined) continue;
    const near = sim.villages.find((v) => !v.ruin && v.people === h.people && Math.hypot(v.x - h.x, v.y - h.y) < 12 && sim.world.sameLand(v.x, v.y, h.x, h.y));
    if (near) {
      join(h, near, sim);
      story(h, sim, 'joined', near.name);
      continue;
    }
    const group = homeless.filter((o) => o.village === undefined && o.people === h.people && Math.hypot(o.x - h.x, o.y - h.y) < RADIUS);
    if (group.filter((o) => isAdult(o, sim)).length < FOUND_SIZE - 1 || group.length < FOUND_SIZE) continue;
    const cx = Math.round(group.reduce((s, o) => s + o.x, 0) / group.length);
    const cy = Math.round(group.reduce((s, o) => s + o.y, 0) / group.length);
    if (sim.villages.some((v) => !v.ruin && Math.hypot(v.x - cx, v.y - cy) < 14)) continue;
    // Not on land of another people (Update 3)
    if (foreignLand(sim, h.people, cx, cy)) continue;
    const ruin = sim.villages.find((v) => v.ruin && Math.hypot(v.x - cx, v.y - cy) < 12);
    let v: Village;
    if (ruin) {
      v = ruin;
      v.ruin = false;
      v.people = h.people;
      v.food = Math.max(v.food, 2);
      sim.chronicle.add({ year: sim.year, kind: 'resettle', a: refOf(h), v: v.name, x: v.x, y: v.y });
    } else {
      const spot = freeSpot(sim, cx, cy, 0, 3) ?? { x: Math.floor(h.x), y: Math.floor(h.y) };
      v = newVillage(sim, h.people, spot.x, spot.y);
      sim.chronicle.add({ year: sim.year, kind: 'village', a: refOf(h), v: v.name, x: v.x, y: v.y });
    }
    for (const o of group) {
      join(o, v, sim);
      story(o, sim, 'founded', v.name);
    }
  }
}

/**
 * Phase G: someone whose place lies on another island (a wounded soldier
 * left overseas, a castaway) cannot get home: they join a place of their
 * people on the island they are on, or are homeless and may found one.
 * Those in an army or on board are on their way and left alone.
 */
export function strays(sim: Sim) {
  const w = sim.world;
  if (!w.islands.length) return;
  for (const h of sim.humans) {
    if (h.village === undefined || h.aboard !== undefined || h.slot || h.dead) continue;
    const v = villageOf(h, sim);
    if (v && !v.ruin && w.sameLand(h.x, h.y, v.x, v.y)) continue;
    const here = sim.villages.find((o) => !o.ruin && o.people === h.people && w.sameLand(o.x, o.y, h.x, h.y));
    for (const house of v?.houses ?? []) house.owners = house.owners.filter((id) => id !== h.id);
    if (here) {
      h.home = null;
      join(h, here, sim);
      story(h, sim, 'joined', here.name);
    } else {
      h.village = undefined;
      h.home = null;
      h.job = undefined;
    }
  }
}

/** Once a second per village: members, leader, needs, building, crowding, ruin. */
export function villageThink(v: Village, sim: Sim) {
  if (v.ruin) return;
  const members = sim.humans.filter((h) => h.village === v.id && !h.dead);
  v.members = members.length;

  if (!members.length) {
    v.ruin = true;
    v.leader = undefined;
    v.site = null;
    for (const house of v.houses) house.owners = [];
    sim.chronicle.add({ year: sim.year, kind: 'ruin', a: { id: 0, name: v.name, people: v.people }, v: v.name, x: v.x, y: v.y });
    return;
  }

  // Leader: the oldest grown-up who is wise or brave
  const current = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  if (!current || current.village !== v.id) {
    // Wise, brave, charismatic or ambitious grown-ups; age and charisma count, the magnetic win
    const candidates = members.filter(
      (h) => isAdult(h, sim) && (has(h, 'wise') || has(h, 'brave') || has(h, 'ambitious') || stat(h, 'charisma') >= 8 || hasPower(h, 'magnetic')),
    );
    const weight = (h: Human) => ageOf(h, sim.time) / 10 + stat(h, 'charisma') + (has(h, 'ambitious') ? 2 : 0) + (hasPower(h, 'magnetic') ? 100 : 0);
    candidates.sort((a, b) => weight(b) - weight(a));
    const next = candidates[0];
    v.leader = next?.id;
    if (next) {
      story(next, sim, 'leader', v.name);
      sim.chronicle.add({ year: sim.year, kind: 'leader', a: refOf(next), v: v.name, x: v.x, y: v.y });
    }
  }

  // What is missing
  const grownUps = members.filter((h) => isAdult(h, sim));
  const foodTarget = members.length * 2.5;
  v.need.food = Math.max(0, Math.min(0.9, 1 - v.food / foodTarget));
  const next = plan(v, sim, members, grownUps.length);
  const cost = next ? costOf(next) : null;
  v.need.wood = cost && v.wood < cost.wood + 2 ? 0.8 : v.wood < 4 ? 0.3 : 0;
  v.need.stone = cost && cost.stone && v.stone < cost.stone ? 0.8 : 0;
  v.need.ore = v.ore < 6 ? 0.4 : 0;
  // A world wonder going up (phase H) eats wood and stone
  if (projectOf(sim, v)) {
    if (v.wood < 12) v.need.wood = Math.max(v.need.wood, 0.6);
    if (v.rock && v.stone < 12) v.need.stone = Math.max(v.need.stone, 0.6);
  }

  // Jobs every few seconds (jobs.ts)
  if ((v.jobsAt ?? 0) <= sim.time) {
    v.jobsAt = sim.time + 5;
    assignJobs(v, sim, members);
  }

  // Start building when the materials are there
  if (!v.site && next && cost) {
    const stoneCost = v.people === 'mountain' ? Math.ceil(cost.stone * 0.7) : cost.stone;
    if (v.wood >= cost.wood && v.stone >= stoneCost) {
      // A castle finds its hill now; without room it waits for the next try
      const spot = next.kind === 'castle' ? bigSpot(v, sim, 2, livingRadius(v) + 3, livingRadius(v) + 16, castleBonus(v, sim)) : next;
      if (spot) {
        v.wood -= cost.wood;
        v.stone -= stoneCost;
        v.site = { ...next, x: spot.x, y: spot.y, done: 0, needed: cost.work };
      } else v.castleAt = sim.year + 20;
    }
  }

  // Free houses go to households without one: couples first, then single grown-ups
  for (const house of v.houses) {
    house.owners = house.owners.filter((id) => sim.byId(id));
    if (house.owners.length) continue;
    const housed = new Set(v.houses.flatMap((x) => x.owners));
    const couple = grownUps.find((h) => h.partner !== undefined && !housed.has(h.id) && (sim.byId(h.partner) as Human | undefined)?.village === v.id);
    const who = couple ? [couple, sim.byId(couple.partner) as Human] : grownUps.filter((h) => !housed.has(h.id) && h.partner === undefined && h.parents.every((p) => !sim.byId(p))).slice(0, 1);
    if (!who.length) continue;
    house.owners = who.map((h) => h.id);
    for (const h of who) {
      h.home = { x: house.x, y: house.y };
      for (const id of h.children) {
        const c = sim.byId(id) as Human | undefined;
        if (c && stage(c, sim.time) === 'child') c.home = h.home;
      }
    }
  }

  // Towns and cities (town.ts)
  promote(v, sim, members);
  spoil(v);
  trade(v, sim);

  if (members.length > crowdedAt(v, sim)) split(v, sim, members);
}

/** Next thing to build: a new tent while there are too few houses, else an upgrade. */
function plan(v: Village, sim: Sim, members: Human[], grownUps: number): Omit<Site, 'done' | 'needed'> | null {
  if (v.site) return null;
  const households = Math.ceil(grownUps / 2) + 1;
  if (v.houses.length < Math.min(households, Math.ceil(members.length / 2))) {
    // On the grid of streets, in the living ring (Update 3); in the open if there is no room
    const spot = layoutSpot(v, sim, 2, livingRadius(v)) ?? freeSpot(sim, v.x, v.y, 2, 4 + v.houses.length * 0.5);
    return spot ? { x: spot.x, y: spot.y, level: 0 } : null;
  }
  // Special buildings of the tier (granary, market, temple …)
  const kind = nextBuilding(v, sim);
  // Without rock nearby a place cannot count on stone: skip what it cannot pay
  const masonry = knows(sim, v.people, 'masonry');
  // City walls need masonry
  const blocked = kind && ((BUILDING_COST[kind].stone > v.stone && !v.rock) || (kind === 'wall' && !masonry));
  // A castle: named now (so wood and stone get gathered for it), its spot is
  // looked for only once the materials are there (villageThink), as that takes a while
  if (kind === 'castle' && !blocked) return { x: v.x, y: v.y, level: 0, kind };
  if (kind && !blocked) {
    const core = CORE.has(kind);
    const ring = livingRadius(v);
    const spot =
      kind === 'wall'
        ? { x: v.x, y: v.y }
        : kind === 'harbor' || kind === 'lighthouse'
          ? coastSpot(sim, v)
          : kind === 'windmill'
            ? (layoutSpot(v, sim, ring - 2, ring) ?? freeSpot(sim, v.x, v.y, 3, 7))
            : (layoutSpot(v, sim, core ? 1.5 : 2, core ? 4.5 : ring) ?? freeSpot(sim, v.x, v.y, kind === 'market' ? 2 : 3, kind === 'market' ? 4 : 7));
    // No coast for a harbor: the place stops asking for one
    if (kind === 'harbor' && !spot) v.coast = false;
    if (spot) return { x: spot.x, y: spot.y, level: 0, kind };
  }
  // Pens for animals once the people farms (pens.ts), outside the houses
  const animal = v.wood >= BUILDING_COST.pen.wood ? wantedPen(v, sim) : null;
  if (animal) {
    const ring = livingRadius(v);
    const spot = bigSpot(v, sim, 2, ring + 3, ring + 10);
    if (spot) return { x: spot.x, y: spot.y, level: 0, kind: 'pen', animal };
  }
  const tent = v.houses.find((h) => h.level === 0);
  if (tent) return { x: tent.x, y: tent.y, level: 1, house: tent };
  // Stone houses and town houses need masonry
  if (!masonry) return null;
  const wooden = v.houses.find((h) => h.level === 1);
  if (wooden && (v.people === 'mountain' || members.length >= 8)) return { x: wooden.x, y: wooden.y, level: 2, house: wooden };
  // Cities build town houses with two floors
  const stone = tierOf(v) === 'city' ? v.houses.find((h) => h.level === 2) : undefined;
  if (stone) return { x: stone.x, y: stone.y, level: 3, house: stone };
  return null;
}

/** Buildings around the square (the core ring, Update 3); the rest go into the living ring. */
const CORE = new Set<string>(['market', 'townhall', 'temple', 'palace', 'cathedral', 'totem', 'altar', 'well']);

/**
 * Tiles with something built on them or right next to it, around (cx, cy):
 * the same as `taken`, worked out once for a whole search (Update 3).
 */
export function occupied(sim: Sim, cx: number, cy: number, range: number): Set<number> {
  const w = sim.world;
  const out = new Set<number>();
  const mark = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (w.inside(x + dx, y + dy)) out.add((y + dy) * w.w + x + dx);
  };
  for (const v of sim.villages) {
    if (Math.hypot(v.x - cx, v.y - cy) > range + 30) continue;
    mark(v.x, v.y, 1);
    for (const h of v.houses) mark(h.x, h.y, 1);
    for (const b of v.buildings) mark(b.x, b.y, 1 + (HALF_SIZE[b.kind] ?? 0));
    for (const p of v.art ?? []) if (p.kind === 'statue') mark(p.x, p.y, 1);
    if (v.site) mark(v.site.x, v.site.y, 1 + (v.site.kind ? (HALF_SIZE[v.site.kind] ?? 0) : 0));
    for (const p of v.plots ?? []) for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 4; dx++) out.add((p.y + dy) * w.w + p.x + dx);
  }
  for (const won of sim.wonders) mark(won.x + 2, won.y + 2, 3);
  return out;
}

/** A spot on the street grid of the place (roads.ts), not on foreign land. */
function layoutSpot(v: Village, sim: Sim, r0: number, r1: number) {
  const busy = occupied(sim, v.x, v.y, r1);
  return gridSpot(
    sim,
    v,
    r0,
    r1,
    (x, y) => busy.has(y * sim.world.w + x),
    (x, y) => foreignLand(sim, v.people, x, y),
  );
}

/**
 * Room for something of (2 · half + 1)² tiles between r0 and r1 from the
 * square (a castle, a pen): grass, sand or forest (cleared when it is
 * built), nothing built, no road, the place's own or free land. `bonus` makes some spots better (castles: on a
 * hill by the mountains, near a border).
 */
function bigSpot(v: Village, sim: Sim, half: number, r0: number, r1: number, bonus?: (x: number, y: number) => number) {
  const w = sim.world;
  const busy = occupied(sim, v.x, v.y, r1 + half);
  let best: { x: number; y: number; s: number } | null = null;
  for (let k = 0; k < 200; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = r0 + sim.rand() * (r1 - r0);
    const cx = Math.round(v.x + Math.cos(ang) * d);
    const cy = Math.round(v.y + Math.sin(ang) * d);
    let ok = true;
    for (let dy = -half; dy <= half && ok; dy++) {
      for (let dx = -half; dx <= half && ok; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const t = w.get(x, y);
        const i = y * w.w + x;
        ok = (t === T.GRASS || t === T.SAND || t === T.FOREST) && !w.road[i] && !busy.has(i) && w.sameLand(v.x, v.y, x, y) && !foreignLand(sim, v.people, x, y);
      }
    }
    if (!ok) continue;
    const s = d - (bonus ? bonus(cx, cy) : 0) + sim.rand() * 2;
    if (!best || s < best.s) best = { x: cx, y: cy, s };
  }
  return best && { x: best.x, y: best.y };
}

/** A castle likes a hill: mountains close by, and land of another people not far. */
function castleBonus(v: Village, sim: Sim) {
  const w = sim.world;
  return (x: number, y: number) => {
    let s = 0;
    for (let dy = -5; dy <= 5; dy += 1) for (let dx = -5; dx <= 5; dx += 1) if (w.get(x + dx, y + dy) === T.MOUNTAIN) s += 0.4;
    for (let dy = -10; dy <= 10; dy += 2)
      for (let dx = -10; dx <= 10; dx += 2) {
        if (!w.inside(x + dx, y + dy)) continue;
        const o = w.owner[(y + dy) * w.w + x + dx];
        if (o >= 0 && o !== v.id && foreignLand(sim, v.people, x + dx, y + dy)) {
          s += 1;
          dy = 99;
          break;
        }
      }
    return Math.min(8, s);
  };
}

/** Called by builders: progress on the site; finished houses appear or get better. */
export function buildStep(v: Village, sim: Sim, dt: number): boolean {
  const s = v.site;
  if (!s) return true;
  s.done += dt;
  if (s.done < s.needed) return false;
  if (s.kind) {
    v.buildings.push({ kind: s.kind, x: s.x, y: s.y, ...(s.animal ? { animal: s.animal } : {}) });
    // A castle makes the land reach further (territory.ts)
    if (s.kind === 'castle') v.landBonus = BALANCE.land.castleBonus;
    // Castles and pens: the trees on their ground are cut
    const half = HALF_SIZE[s.kind] ?? 0;
    for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) if (sim.world.get(s.x + dx, s.y + dy) === T.FOREST) sim.world.set(s.x + dx, s.y + dy, T.GRASS);
    sim.chronicle.add({ year: sim.year, kind: 'building', a: { id: 0, name: v.name, people: v.people }, v: v.name, w: s.kind, x: s.x, y: s.y });
  } else if (s.house) s.house.level = s.level;
  else v.houses.push({ x: s.x, y: s.y, level: s.level, owners: [] });
  sim.puff(s.x + 0.5, s.y, 6, ['#ffffff', '#ffe066', '#d9b98b']);
  v.site = null;
  // A street from the door to the square (Update 3); a castle and a pen from their gate
  if (s.kind === 'castle' || s.kind === 'pen') layStreet(sim, v, s.x, s.y + 3);
  else if (s.kind !== 'wall') layStreet(sim, v, s.x, s.y);
  return true;
}

/** Too many people (see crowdedAt): a group of young grown-ups (with partners and small children) moves on. */
function split(v: Village, sim: Sim, members: Human[], famine = false) {
  const young = members.filter((h) => {
    const age = ageOf(h, sim.time);
    return age >= 16 && age <= 32 && h.id !== v.leader;
  });
  if (young.length < 4) return;
  let spot = famine ? richSpot(v, sim) : farSpot(v, sim);
  // No free land left (Update 3): now and then they settle on land of another people anyway
  let grab = false;
  if (!spot && sim.rand() < BALANCE.land.grabChance) {
    spot = farSpot(v, sim, true);
    grab = !!spot && foreignLand(sim, v.people, spot.x, spot.y);
  }
  if (!spot) return;
  const nv = newVillage(sim, v.people, spot.x, spot.y);
  // A new place gets a few years before hunger can drive its people on again
  // (else a starving group founded one place after the other)
  nv.famineAt = sim.time + BALANCE.food.famineCooldown * 30;
  const leaving = new Set<Human>();
  for (const h of young.slice(0, 6)) {
    leaving.add(h);
    const p = h.partner !== undefined ? (sim.byId(h.partner) as Human | undefined) : undefined;
    if (p && p.village === v.id) leaving.add(p);
  }
  // Take a share of the food along
  const share = Math.floor(v.food * (leaving.size / members.length));
  v.food -= share;
  nv.food += share;
  const first = [...leaving][0];
  for (const h of leaving) {
    for (const house of v.houses) house.owners = house.owners.filter((id) => id !== h.id);
    h.home = null;
    join(h, nv, sim);
    story(h, sim, 'moved', nv.name);
  }
  sim.chronicle.add({ year: sim.year, kind: famine ? 'exodus' : 'split', a: refOf(first), v: v.name, w: nv.name, x: nv.x, y: nv.y });
  if (grab) landGrab(sim, nv, v);
}

/** A famine: a group of young people leaves for a place with more to eat (hunger.ts). */
export function emigrate(v: Village, sim: Sim) {
  split(
    v,
    sim,
    sim.humans.filter((h) => h.village === v.id),
    true,
  );
}

/** Of a dozen free spots far away, the one with the most berries and fish around. */
function richSpot(v: Village, sim: Sim) {
  const w = sim.world;
  let best: { x: number; y: number; food: number } | null = null;
  for (let k = 0; k < 12; k++) {
    const spot = farSpot(v, sim);
    if (!spot) continue;
    let food = 0;
    for (let y = spot.y - 6; y <= spot.y + 6; y++) {
      for (let x = spot.x - 6; x <= spot.x + 6; x++) {
        if (!w.inside(x, y)) continue;
        const i = y * w.w + x;
        food += Math.max(0, w.bush[i]) + w.fish[i] * 0.5;
      }
    }
    if (!best || food > best.food) best = { ...spot, food };
  }
  return best;
}

/** Room for a new village: grass, far enough from all others, not on land of another people (unless `grab`). */
function farSpot(v: Village, sim: Sim, grab = false) {
  for (let k = 0; k < 200; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = 22 + sim.rand() * 30;
    const x = Math.round(v.x + Math.cos(ang) * d);
    const y = Math.round(v.y + Math.sin(ang) * d);
    if (sim.world.get(x, y) !== T.GRASS || !sim.world.sameLand(v.x, v.y, x, y)) continue;
    if (sim.villages.some((o) => !o.ruin && Math.hypot(o.x - x, o.y - y) < 18)) continue;
    if (!grab && foreignLand(sim, v.people, x, y)) continue;
    return { x, y };
  }
  return null;
}

/** How long one load takes to gather, by resource and people. */
export function gatherTime(res: 'food' | 'wood' | 'stone', source: 'berries' | 'fish' | 'tree' | 'rock', people: People) {
  const perks = PERKS[people];
  if (source === 'fish') return 3 / perks.fish;
  if (source === 'tree') return 3 / perks.wood;
  if (source === 'rock') return 4 / perks.stone;
  return res === 'food' ? 1.5 : 2;
}
