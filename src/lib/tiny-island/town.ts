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
 */
import type { Human } from './agents';
import type { Sim } from './sim';
import { refOf } from './social';
import { isEnemy, shiftMood, shiftVillageMood } from './war';
import type { Village } from './villages';

export const BUILDINGS = ['granary', 'smithy', 'market', 'temple', 'townhall', 'wall'] as const;
export type BuildingKind = (typeof BUILDINGS)[number];

export interface Building {
  kind: BuildingKind;
  x: number;
  y: number;
}

export const TIERS = ['village', 'town', 'city'] as const;
export type Tier = (typeof TIERS)[number];

export const BUILDING_COST: Record<BuildingKind, { wood: number; stone: number; work: number }> = {
  granary: { wood: 8, stone: 0, work: 10 },
  smithy: { wood: 4, stone: 4, work: 10 },
  market: { wood: 6, stone: 2, work: 10 },
  temple: { wood: 2, stone: 8, work: 14 },
  townhall: { wood: 6, stone: 10, work: 18 },
  wall: { wood: 0, stone: 16, work: 24 },
};

/** Which special buildings a place of each tier wants, in building order. */
const WANTED: Record<Tier, BuildingKind[]> = {
  village: ['granary'],
  town: ['granary', 'market', 'smithy', 'temple', 'townhall'],
  city: ['granary', 'market', 'smithy', 'temple', 'townhall', 'wall'],
};

export const hasBuilding = (v: Village | undefined, kind: BuildingKind) => !!v && v.buildings.some((b) => b.kind === kind);

export const tierOf = (v: Village): Tier => v.tier ?? 'village';

/** The next special building this place should put up, if any. */
export function nextBuilding(v: Village): BuildingKind | null {
  if (tierOf(v) === 'village' && v.members < 6) return null;
  return WANTED[tierOf(v)].find((k) => !hasBuilding(v, k) && v.site?.kind !== k) ?? null;
}

/** Above this many people, young grown-ups move away and found a new place. */
export function crowdedAt(v: Village) {
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

/** Without a granary, big food stocks slowly go bad (about a sixth a year). */
export function spoil(v: Village) {
  if (!hasBuilding(v, 'granary') && v.food > 10) v.food *= 1 - 0.006;
}

/**
 * Once a year a market trades with the nearest other market that is not an
 * enemy: whatever one has much more of moves over in part.
 */
export function trade(v: Village, sim: Sim) {
  if (!hasBuilding(v, 'market') || (v.tradeAt ?? 0) > sim.time) return;
  v.tradeAt = sim.time + 30;
  let partner: Village | null = null;
  let best = Infinity;
  for (const o of sim.villages) {
    if (o === v || o.ruin || !hasBuilding(o, 'market') || isEnemy(sim, { people: v.people, village: v.id }, { people: o.people, village: o.id })) continue;
    const d = Math.hypot(o.x - v.x, o.y - v.y);
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
    const amount = Math.floor(Math.abs(diff) / 4);
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
