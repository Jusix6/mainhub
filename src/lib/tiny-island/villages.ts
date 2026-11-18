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
import { ageOf, has, PERKS, stage, type Human, type People } from './agents';
import { villageName } from './names';
import type { Sim } from './sim';
import { assignJobs } from './jobs';
import type { FestivalKind, Piece } from './culture';
import { knows } from './inventions';
import { BUILDING_COST, crowdedAt, nextBuilding, promote, spoil, tierOf, trade, type Building, type BuildingKind, type Tier } from './town';
import { refOf, story } from './social';
import { T } from './world';

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
  arms: { club: number; bronze: number; iron: number; armor: number };
  /** What is left of the city wall under a siege (full when unset). */
  wallHp?: number;
  /** No new army sets out before this game time. */
  armyAt?: number;
  /** Kingdoms (Phase 11): risen up against the crown, and loyalty 0 … 100 (60 when unset). */
  free?: boolean;
  loyalty?: number;
  /** Culture (Phase 12): statues and murals, the festival going on and the next one. */
  art?: Piece[];
  festivalUntil?: number;
  festivalKind?: FestivalKind;
  nextFestival?: number;
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

/** A free land tile around (x, y) between r0 and r1 tiles away, not on a house. */
export function freeSpot(sim: Sim, x: number, y: number, r0: number, r1: number) {
  const taken = (tx: number, ty: number) =>
    sim.villages.some(
      (v) =>
        (Math.abs(v.x - tx) < 2 && Math.abs(v.y - ty) < 2) ||
        v.houses.some((h) => Math.abs(h.x - tx) < 2 && Math.abs(h.y - ty) < 2) ||
        v.buildings.some((b) => Math.abs(b.x - tx) < 2 && Math.abs(b.y - ty) < 2) ||
        !!v.art?.some((p) => p.kind === 'statue' && Math.abs(p.x - tx) < 2 && Math.abs(p.y - ty) < 2) ||
        (v.site && Math.abs(v.site.x - tx) < 2 && Math.abs(v.site.y - ty) < 2),
    );
  for (let k = 0; k < 60; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = r0 + sim.rand() * (r1 - r0);
    const tx = Math.round(x + Math.cos(ang) * d);
    const ty = Math.round(y + Math.sin(ang) * d);
    const t = sim.world.get(tx, ty);
    if ((t === T.GRASS || t === T.SAND) && !taken(tx, ty)) return { x: tx, y: ty };
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
    arms: { club: 0, bronze: 0, iron: 0, armor: 0 },
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
    const near = sim.villages.find((v) => !v.ruin && v.people === h.people && Math.hypot(v.x - h.x, v.y - h.y) < 12);
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
    const candidates = members.filter((h) => isAdult(h, sim) && (has(h, 'wise') || has(h, 'brave')));
    candidates.sort((a, b) => ageOf(b, sim.time) - ageOf(a, sim.time));
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

  // Jobs every few seconds (jobs.ts)
  if ((v.jobsAt ?? 0) <= sim.time) {
    v.jobsAt = sim.time + 5;
    assignJobs(v, sim, members);
  }

  // Start building when the materials are there
  if (!v.site && next && cost) {
    const stoneCost = v.people === 'mountain' ? Math.ceil(cost.stone * 0.7) : cost.stone;
    if (v.wood >= cost.wood && v.stone >= stoneCost) {
      v.wood -= cost.wood;
      v.stone -= stoneCost;
      v.site = { ...next, done: 0, needed: cost.work };
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

  if (members.length > crowdedAt(v)) split(v, sim, members);
}

/** Next thing to build: a new tent while there are too few houses, else an upgrade. */
function plan(v: Village, sim: Sim, members: Human[], grownUps: number): Omit<Site, 'done' | 'needed'> | null {
  if (v.site) return null;
  const households = Math.ceil(grownUps / 2) + 1;
  if (v.houses.length < Math.min(households, Math.ceil(members.length / 2))) {
    const spot = freeSpot(sim, v.x, v.y, 2, 4 + v.houses.length * 0.5);
    return spot ? { x: spot.x, y: spot.y, level: 0 } : null;
  }
  // Special buildings of the tier (granary, market, temple …)
  const kind = nextBuilding(v);
  // Without rock nearby a place cannot count on stone: skip what it cannot pay
  const masonry = knows(sim, v.people, 'masonry');
  // City walls need masonry
  const blocked = kind && ((BUILDING_COST[kind].stone > v.stone && !v.rock) || (kind === 'wall' && !masonry));
  if (kind && !blocked) {
    const spot = kind === 'wall' ? { x: v.x, y: v.y } : freeSpot(sim, v.x, v.y, kind === 'market' ? 2 : 3, kind === 'market' ? 4 : 7);
    if (spot) return { x: spot.x, y: spot.y, level: 0, kind };
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

/** Called by builders: progress on the site; finished houses appear or get better. */
export function buildStep(v: Village, sim: Sim, dt: number): boolean {
  const s = v.site;
  if (!s) return true;
  s.done += dt;
  if (s.done < s.needed) return false;
  if (s.kind) {
    v.buildings.push({ kind: s.kind, x: s.x, y: s.y });
    sim.chronicle.add({ year: sim.year, kind: 'building', a: { id: 0, name: v.name, people: v.people }, v: v.name, w: s.kind, x: s.x, y: s.y });
  } else if (s.house) s.house.level = s.level;
  else v.houses.push({ x: s.x, y: s.y, level: s.level, owners: [] });
  sim.puff(s.x + 0.5, s.y, 6, ['#ffffff', '#ffe066', '#d9b98b']);
  v.site = null;
  return true;
}

/** Too many people (see crowdedAt): a group of young grown-ups (with partners and small children) moves on. */
function split(v: Village, sim: Sim, members: Human[]) {
  const young = members.filter((h) => {
    const age = ageOf(h, sim.time);
    return age >= 16 && age <= 32 && h.id !== v.leader;
  });
  if (young.length < 4) return;
  const spot = farSpot(v, sim);
  if (!spot) return;
  const nv = newVillage(sim, v.people, spot.x, spot.y);
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
  sim.chronicle.add({ year: sim.year, kind: 'split', a: refOf(first), v: v.name, w: nv.name, x: nv.x, y: nv.y });
}

/** Room for a new village: grass, far enough from all others. */
function farSpot(v: Village, sim: Sim) {
  for (let k = 0; k < 200; k++) {
    const ang = sim.rand() * Math.PI * 2;
    const d = 22 + sim.rand() * 30;
    const x = Math.round(v.x + Math.cos(ang) * d);
    const y = Math.round(v.y + Math.sin(ang) * d);
    if (sim.world.get(x, y) !== T.GRASS) continue;
    if (sim.villages.some((o) => !o.ruin && Math.hypot(o.x - x, o.y - y) < 18)) continue;
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
