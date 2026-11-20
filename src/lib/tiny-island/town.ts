/**
 * Towns and cities (Phase 8). A village grows into a town (13 people and 5
 * houses) and a town into a city (30 people with town hall, market and
 * temple). Special buildings come in that order and each one does something:
 *
 *  - granary (village): stored food no longer spoils, harvests give more
 *  - smithy (town): tools are made faster and last longer
 *  - market (town): once a year it trades with the nearest other market,
 *    evening out stocks; trade between peoples lifts their mood
 *  - temple (town): people feel less lonely and fight half as often
 *  - town hall (town): needed for a city; the place may grow bigger before
 *    young people move on
 *  - wall (city): it takes four attackers to take the city, defenders inside
 *    hit harder
 *  - harbor (phase G, coastal places that know boats): ships (ships.ts)
 *
 * Update 3, phase C: new buildings for every age (`AGE_NEEDED`), most of
 * them making people less lonely (`COMFORT`) or helping research:
 *  - stone age: totem pole, smokehouse (stores keep longer)
 *  - bronze age: well (the place may grow 10 % bigger), altar, warehouse
 *    (nothing spoils, twice the wood in store)
 *  - iron age: tavern, the wall (palisade, stone, castle wall by age)
 *  - middle ages: castle (5 × 5 near a border or the capital, more land,
 *    a stronger wall), cathedral, market stalls
 *  - renaissance: palace (capitals: loyal vassals), university and
 *    observatory (research), theatre, museum
 *  - industry: station (railways, roads.ts), lighthouse, park
 *  - farms and pens are put up outside the houses (jobs.ts, pens.ts)
 */
import { ageIndex, knows, type Invention } from './inventions';
import type { Human } from './agents';
import type { Sim } from './sim';
import { refOf } from './social';
import { isEnemy, shiftMood, shiftVillageMood } from './war';
import type { Village } from './villages';

export const BUILDINGS = [
  'granary',
  'smithy',
  'market',
  'temple',
  'townhall',
  'wall',
  'windmill',
  'library',
  'factory',
  'barracks',
  'harbor',
  // Update 3, phase C
  'totem',
  'smokehouse',
  'well',
  'altar',
  'warehouse',
  'tavern',
  'castle',
  'cathedral',
  'palace',
  'university',
  'theater',
  'museum',
  'observatory',
  'station',
  'lighthouse',
  'park',
  'farm',
  'pen',
] as const;
export type BuildingKind = (typeof BUILDINGS)[number];

/** Pens (Update 3): which animals they keep. */
export type PenAnimal = 'sheep' | 'chicken' | 'horse' | 'cow';

export interface Building {
  kind: BuildingKind;
  x: number;
  y: number;
  /** A pen: its animals, and whether a stone wall keeps the wolves out. */
  animal?: PenAnimal;
  stone?: boolean;
}

/** Buildings not built the usual way (or not given by the gods): placed with fields, pens, a castle site. */
export const SPECIAL = new Set<BuildingKind>(['farm', 'pen', 'castle', 'palace', 'station', 'lighthouse']);

/** Big buildings: tiles from their middle to their edge (a castle and a pen are 5 × 5). */
export const HALF_SIZE: Partial<Record<BuildingKind, number>> = { castle: 2, pen: 2 };

/** How much a building takes off loneliness (summed per place, at most a half). */
export const COMFORT: Partial<Record<BuildingKind, number>> = {
  temple: 0.33,
  totem: 0.1,
  altar: 0.1,
  tavern: 0.15,
  cathedral: 0.2,
  theater: 0.1,
  museum: 0.08,
  park: 0.15,
};

export const comfortOf = (v: Village | undefined) => (v ? Math.min(0.5, v.buildings.reduce((s, b) => s + (COMFORT[b.kind] ?? 0), 0)) : 0);

export const TIERS = ['village', 'town', 'city'] as const;
export type Tier = (typeof TIERS)[number];

export const BUILDING_COST: Record<BuildingKind, { wood: number; stone: number; work: number }> = {
  granary: { wood: 8, stone: 0, work: 10 },
  smithy: { wood: 4, stone: 4, work: 10 },
  market: { wood: 6, stone: 2, work: 10 },
  temple: { wood: 2, stone: 8, work: 14 },
  townhall: { wood: 6, stone: 10, work: 18 },
  wall: { wood: 0, stone: 16, work: 24 },
  windmill: { wood: 8, stone: 2, work: 12 },
  library: { wood: 4, stone: 8, work: 16 },
  factory: { wood: 6, stone: 12, work: 24 },
  barracks: { wood: 8, stone: 6, work: 14 },
  harbor: { wood: 10, stone: 4, work: 14 },
  totem: { wood: 3, stone: 0, work: 5 },
  smokehouse: { wood: 5, stone: 0, work: 8 },
  well: { wood: 1, stone: 5, work: 8 },
  altar: { wood: 0, stone: 6, work: 8 },
  warehouse: { wood: 10, stone: 2, work: 12 },
  tavern: { wood: 8, stone: 2, work: 12 },
  castle: { wood: 10, stone: 20, work: 40 },
  cathedral: { wood: 6, stone: 24, work: 32 },
  palace: { wood: 10, stone: 24, work: 32 },
  university: { wood: 6, stone: 16, work: 24 },
  theater: { wood: 8, stone: 10, work: 18 },
  museum: { wood: 4, stone: 14, work: 20 },
  observatory: { wood: 4, stone: 12, work: 18 },
  station: { wood: 8, stone: 12, work: 20 },
  lighthouse: { wood: 4, stone: 12, work: 18 },
  park: { wood: 4, stone: 2, work: 8 },
  farm: { wood: 6, stone: 0, work: 8 },
  pen: { wood: 6, stone: 0, work: 8 },
};

/** Buildings of later ages need their invention (phase E). */
const NEEDS: Partial<Record<BuildingKind, Invention>> = {
  windmill: 'windmill',
  library: 'writing',
  factory: 'steam',
  barracks: 'bronze',
  harbor: 'boats',
  wall: 'masonry',
  castle: 'castle',
  station: 'railway',
  lighthouse: 'navigation',
};

/** …and the new ones of Update 3 their age (0 stone … 5 industry). */
const AGE_NEEDED: Partial<Record<BuildingKind, number>> = {
  well: 1,
  altar: 1,
  warehouse: 1,
  tavern: 2,
  castle: 3,
  cathedral: 3,
  palace: 4,
  university: 4,
  theater: 4,
  museum: 4,
  observatory: 4,
  station: 5,
  lighthouse: 5,
  park: 5,
};

/** Which special buildings a place of each tier wants, in building order. */
const WANTED: Record<Tier, BuildingKind[]> = {
  village: ['granary', 'totem', 'smokehouse', 'harbor', 'well'],
  town: ['granary', 'market', 'totem', 'smokehouse', 'harbor', 'well', 'smithy', 'temple', 'altar', 'townhall', 'warehouse', 'barracks', 'tavern', 'wall', 'windmill', 'library', 'castle', 'cathedral', 'lighthouse'],
  city: [
    'granary',
    'market',
    'harbor',
    'smithy',
    'temple',
    'townhall',
    'well',
    'warehouse',
    'barracks',
    'tavern',
    'wall',
    'station',
    'factory',
    'windmill',
    'library',
    'castle',
    'cathedral',
    'palace',
    'university',
    'theater',
    'museum',
    'observatory',
    'lighthouse',
    'park',
  ],
};

/**
 * Who may build it at all: a palace only in a capital, a castle only in a
 * capital or a place near foreign land, a lighthouse only by a harbor.
 */
function allowed(v: Village, k: BuildingKind, sim?: Sim): boolean {
  if (!sim) return true;
  if (AGE_NEEDED[k] !== undefined && ageIndex(sim, v.people) < AGE_NEEDED[k]!) return false;
  if (k === 'palace') return sim.kingdoms.get(v.people)?.capital === v.id;
  if (k === 'lighthouse') return hasBuilding(v, 'harbor');
  if (k === 'castle') {
    const capital = sim.kingdoms.get(v.people)?.capital === v.id;
    const castles = sim.villages.filter((o) => o.people === v.people && !o.ruin && hasBuilding(o, 'castle')).length;
    return castles < 3 && (v.castleAt ?? 0) <= sim.year && (capital || nearForeign(sim, v));
  }
  return true;
}

/** Is there land of another people within 16 tiles? */
function nearForeign(sim: Sim, v: Village) {
  const w = sim.world;
  const peopleOf = new Map(sim.villages.map((o) => [o.id, o.people]));
  for (let y = v.y - 16; y <= v.y + 16; y += 2) {
    for (let x = v.x - 16; x <= v.x + 16; x += 2) {
      if (!w.inside(x, y)) continue;
      const o = w.owner[y * w.w + x];
      if (o >= 0 && peopleOf.get(o) !== v.people) return true;
    }
  }
  return false;
}

export const hasBuilding = (v: Village | undefined, kind: BuildingKind) => !!v && v.buildings.some((b) => b.kind === kind);

export const tierOf = (v: Village): Tier => v.tier ?? 'village';

/** The next special building this place should put up, if any. */
export function nextBuilding(v: Village, sim?: Sim): BuildingKind | null {
  if (tierOf(v) === 'village' && v.members < 6) return null;
  return (
    WANTED[tierOf(v)].find(
      (k) => !hasBuilding(v, k) && v.site?.kind !== k && (k !== 'harbor' || v.coast !== false) && (!NEEDS[k] || !sim || knows(sim, v.people, NEEDS[k]!)) && allowed(v, k, sim),
    ) ?? null
  );
}

/** Above this many people, young grown-ups move away and found a new place. */
export function crowdedAt(v: Village, sim?: Sim) {
  // Every age lets places grow 15 % bigger (phase E)
  const age = sim ? 1 + 0.15 * ageIndex(sim, v.people) : 1;
  // A well lets the place grow a tenth bigger (Update 3)
  return Math.round(crowdedBase(v) * age * (hasBuilding(v, 'well') ? 1.1 : 1));
}

function crowdedBase(v: Village) {
  const tier = tierOf(v);
  if (tier === 'city') return 70;
  if (tier === 'town') return hasBuilding(v, 'townhall') ? 40 : 30;
  return 22;
}

/** Village → town → city, with a line in the chronicle. */
export function promote(v: Village, sim: Sim, members: Human[]) {
  const tier = tierOf(v);
  let next: Tier | null = null;
  if (tier === 'village' && members.length >= 13 && v.houses.length >= 5) next = 'town';
  if (tier === 'town' && members.length >= 30 && hasBuilding(v, 'townhall') && hasBuilding(v, 'market') && hasBuilding(v, 'temple')) next = 'city';
  if (!next) return;
  v.tier = next;
  const leader = v.leader !== undefined ? (sim.byId(v.leader) as Human | undefined) : undefined;
  sim.chronicle.add({ year: sim.year, kind: 'tier', a: leader ? refOf(leader) : { id: 0, name: v.name, people: v.people }, v: v.name, w: next, x: v.x, y: v.y });
  sim.puff(v.x + 0.5, v.y, 14, ['#ffe066', '#ffffff', '#ff5da2', '#4d8dff']);
}

const sameLeague = (sim: Sim, a: Village, b: Village) => sim.leagues.some((l) => l.members.includes(a.id) && l.members.includes(b.id));

/** Without a granary, big food stocks slowly go bad (about a sixth a year). */
export function spoil(v: Village) {
  // A warehouse keeps everything, a smokehouse half of what would spoil (Update 3)
  if (hasBuilding(v, 'granary') || hasBuilding(v, 'warehouse') || v.food <= 10) return;
  v.food *= 1 - (hasBuilding(v, 'smokehouse') ? 0.003 : 0.006);
}

/**
 * Once a year a market trades with the nearest other market that is not an
 * enemy: whatever one has much more of moves over in part.
 */
export function trade(v: Village, sim: Sim) {
  if (!hasBuilding(v, 'market') || (v.tradeAt ?? 0) > sim.time) return;
  // Railways: trade twice a year
  v.tradeAt = sim.time + (knows(sim, v.people, 'railway') ? 15 : 30);
  let partner: Village | null = null;
  let best = Infinity;
  for (const o of sim.villages) {
    if (o === v || o.ruin || !hasBuilding(o, 'market') || isEnemy(sim, { people: v.people, village: v.id }, { people: o.people, village: o.id })) continue;
    // Over land only; across the sea trade ships do it (phase G)
    if (!sim.world.sameLand(v.x, v.y, o.x, o.y)) continue;
    // League partners come first (phase D)
    const d = Math.hypot(o.x - v.x, o.y - v.y) * (sameLeague(sim, v, o) ? 0.4 : 1);
    if (d < best) {
      best = d;
      partner = o;
    }
  }
  if (!partner) return;
  let moved = false;
  for (const res of ['food', 'wood', 'stone', 'ore'] as const) {
    const diff = v[res] - partner[res];
    if (Math.abs(diff) < 6) continue;
    // Leagues and banks trade on better terms
    const amount = Math.floor(Math.abs(diff) / ((sameLeague(sim, v, partner) ? 3 : 4) - (knows(sim, v.people, 'banking') ? 1 : 0)));
    if (diff > 0) {
      v[res] -= amount;
      partner[res] += amount;
    } else {
      v[res] += amount;
      partner[res] -= amount;
    }
    moved = true;
  }
  if (!moved) return;
  v.tradedWith = partner.name;
  partner.tradedWith = v.name;
  if (partner.people !== v.people) shiftMood(sim, v.people, partner.people, 3);
  else shiftVillageMood(sim, v.id, partner.id, 1);
  for (const o of [v, partner]) sim.puff(o.x + 0.5, o.y - 0.2, 5, ['#ffe066', '#ffffff']);
}
