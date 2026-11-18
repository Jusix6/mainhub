/**
 * Bigger armies (Update 2, phase F). war.ts decides when an army sets out
 * and where it marches; this module makes it an army:
 *
 *  - Who goes: the warriors and, in a war, the levy – grown-ups with a
 *    courage of 4 or more – up to 35 % of the place (and of its neighbours of
 *    the same people in a war between peoples), at most 150. A barracks
 *    keeps a standing army of soldiers (10 % instead of about 6 %, jobs.ts).
 *  - Units by age: clubmen (Stone Age), spearmen and archers (Bronze Age),
 *    swordsmen, riders and catapults (Iron Age, riders need horses), knights
 *    and crossbowmen (Middle Ages), musketeers and cannons (Renaissance).
 *    Spears are strong against riders, archers shoot from the second row,
 *    crossbows go through armour, catapults and cannons break walls.
 *  - Formation on the march: fighters in front, shooters behind, riders on
 *    the wings, siege engines at the back, the general in the middle with
 *    the banner. Every army gets a name: "The Iron Host of Bram".
 *  - Battles: two armies of a war meet – the "Battle of <nearest place>".
 *    Morale falls with every loss and much more when the general dies; under
 *    25 % the army runs. Survivors become veterans (+1 courage, a title),
 *    the badly wounded ones "the Scarred".
 *  - Horses: wild horses roam the grass; a place tames the ones that come
 *    close (one a year), and they breed in the stable. Riders take them along.
 */
import { ageOf, has, stage, stat, type Human } from './agents';
import { ageIndex, knows } from './inventions';
import type { Sim } from './sim';
import { refOf, story } from './social';
import type { Village } from './villages';
import type { Army } from './war';
import { T } from './world';

export const UNITS = ['club', 'spear', 'archer', 'sword', 'rider', 'catapult', 'knight', 'crossbow', 'musketeer', 'cannon'] as const;
export type Unit = (typeof UNITS)[number];

interface UnitStats {
  /** Close combat: a factor on top of the weapon. Shooting: the damage factor of a shot. */
  power: number;
  /** Shooting range in tiles (0 = close combat). */
  range: number;
  /** Seconds between shots or blows. */
  reload: number;
  speed: number;
  mounted?: boolean;
  /** Against riders. */
  vsRider?: number;
  /** Goes through armour. */
  pierce?: boolean;
  /** How much it does to a wall. */
  siege: number;
}

export const UNIT: Record<Unit, UnitStats> = {
  club: { power: 0.9, range: 0, reload: 0.8, speed: 1, siege: 1 },
  spear: { power: 0.95, range: 0, reload: 0.8, speed: 1, vsRider: 2, siege: 1 },
  archer: { power: 0.7, range: 5, reload: 1.4, speed: 1, siege: 0.5 },
  sword: { power: 1, range: 0, reload: 0.8, speed: 1, siege: 1 },
  rider: { power: 1.1, range: 0, reload: 0.8, speed: 1.5, mounted: true, siege: 0.5 },
  catapult: { power: 1.5, range: 8, reload: 3.5, speed: 0.8, siege: 5 },
  knight: { power: 1.3, range: 0, reload: 0.8, speed: 1.4, mounted: true, siege: 0.5 },
  crossbow: { power: 0.9, range: 5, reload: 1.8, speed: 1, pierce: true, siege: 0.5 },
  musketeer: { power: 1.5, range: 6, reload: 2.2, speed: 1, siege: 1 },
  cannon: { power: 2, range: 9, reload: 4, speed: 0.8, siege: 10 },
};

export const MAX_ARMY = 150;
/** How long a shot is in the air (seconds). */
export const SHOT_TIME = 0.45;
const LEVY = 0.35;

/**
 * Who marches out of a place: its warriors, then in a war the levy (courage
 * 4+, grown-ups, not cowardly) up to 35 % of the grown-ups, at most 150. In a
 * war between peoples the neighbours of the same people send their levy too.
 */
export function muster(sim: Sim, v: Village, warriors: Human[], neighbours: Village[] = []): Human[] {
  const out = warriors.slice(0, MAX_ARMY);
  const busy = new Set(sim.armies.flatMap((a) => a.members));
  for (const place of [v, ...neighbours]) {
    const adults = sim.humans.filter((h) => h.village === place.id && stage(h, sim.time) === 'adult');
    let left = Math.floor(adults.length * LEVY) - (place === v ? out.length : 0);
    for (const h of adults) {
      if (left <= 0 || out.length >= MAX_ARMY) break;
      if (out.includes(h) || busy.has(h.id) || has(h, 'cowardly') || stat(h, 'courage') < 4 || h.hp < h.maxHp * 0.6 || ageOf(h, sim.time) > 55) continue;
      out.push(h);
      left--;
    }
  }
  return out;
}

/** Hands out units by the people's age, its horses and the size of the army; places everyone in the formation. */
export function assignUnits(sim: Sim, army: Army, members: Human[], v: Village) {
  const p = v.people;
  const age = ageIndex(sim, p);
  const bronze = age >= 1;
  const iron = age >= 2;
  const medieval = age >= 3;
  const guns = knows(sim, p, 'gunpowder');
  const n = members.length;
  const others = members.filter((h) => h.id !== army.general);
  let i = 0;
  const take = (count: number, unit: Unit) => {
    for (let k = 0; k < count && i < others.length; k++, i++) others[i].unit = unit;
  };
  // Siege engines first (a crew of one each), then riders, shooters, the rest fights in front
  if (iron) take(Math.floor(n / 15), guns ? 'cannon' : 'catapult');
  const riders = iron ? Math.min(v.horses ?? 0, Math.floor(n * 0.2)) : 0;
  take(riders, medieval ? 'knight' : 'rider');
  v.horses = (v.horses ?? 0) - Math.min(riders, others.length);
  if (bronze) take(Math.floor(n * 0.3), guns ? 'musketeer' : medieval ? 'crossbow' : 'archer');
  take(others.length, iron ? 'sword' : bronze ? 'spear' : 'club');
  const general = members.find((h) => h.id === army.general);
  if (general) general.unit = iron ? 'sword' : bronze ? 'spear' : 'club';
  // Formation slots: forward (f) and to the right (r) of the general, in tiles
  const groups = new Map<string, Human[]>();
  for (const h of others) {
    const u = UNIT[h.unit!];
    const g = u.mounted ? 'wing' : u.siege >= 5 ? 'engine' : u.range ? 'shoot' : 'front';
    groups.set(g, [...(groups.get(g) ?? []), h]);
  }
  const row = (list: Human[] | undefined, f0: number, step: number, width: number) =>
    (list ?? []).forEach((h, k) => {
      const r = Math.floor(k / width);
      const c = k % width;
      h.slot = { f: f0 + step * r, r: (c - (width - 1) / 2) * 1.1, army: army.id };
    });
  row(groups.get('front'), 1.5, 1, 7);
  row(groups.get('shoot'), -1.5, -1, 7);
  row(groups.get('engine'), -4, -1.5, 3);
  (groups.get('wing') ?? []).forEach((h, k) => {
    h.slot = { f: 0.5 - Math.floor(k / 2) * 1.1, r: (k % 2 === 0 ? 1 : -1) * (4.8 + Math.floor(k / 6)), army: army.id };
  });
  if (general) general.slot = { f: 0, r: 0, army: army.id };
  army.size0 = n;
  army.morale = 100;
  army.name = { age, noun: n < 10 ? 0 : n < 30 ? 1 : n < 70 ? 2 : 3, general: general?.name ?? '' };
}

/** Back home: units, slots and horses are given back. */
export function releaseUnits(sim: Sim, army: Army) {
  const from = sim.villages.find((v) => v.id === army.from);
  for (const id of army.members) {
    const h = sim.byId(id) as Human | undefined;
    if (!h) continue;
    if (from && h.unit && UNIT[h.unit].mounted) from.horses = (from.horses ?? 0) + 1;
    h.unit = undefined;
    h.slot = undefined;
  }
}

/** Encodes an army's name for the chronicle ("army:2:1:Bram"). */
export const armyTag = (a: Army) => (a.name ? `army:${a.name.age}:${a.name.noun}:${a.name.general}` : '');

/* ---- battles (called once a second by war.ts) -------------------------------------- */

/** Armies of the two sides of a war within 12 tiles of each other start a battle. */
export function findBattles(sim: Sim, sideOfArmy: (a: Army) => 'a' | 'b' | null) {
  for (const a of sim.armies) {
    if (a.battle || a.state === 'gather' || a.state === 'sail') continue;
    const ga = sim.byId(a.general);
    if (!ga) continue;
    for (const b of sim.armies) {
      if (b === a || b.battle || b.war !== a.war || b.state === 'gather' || b.state === 'sail' || sideOfArmy(a) === sideOfArmy(b)) continue;
      const gb = sim.byId(b.general);
      if (!gb || Math.hypot(ga.x - gb.x, ga.y - gb.y) > 12) continue;
      const mx = (ga.x + gb.x) / 2;
      const my = (ga.y + gb.y) / 2;
      const place = sim.villages.filter((v) => !v.ruin).sort((x, y) => Math.hypot(x.x - mx, x.y - my) - Math.hypot(y.x - mx, y.y - my))[0];
      const name = place?.name ?? '';
      a.battle = { enemy: b.id, place: name, since: sim.time, ids: [...a.members], foe: armyTag(b), foeIds: [...b.members] };
      b.battle = { enemy: a.id, place: name, since: sim.time, ids: [...b.members], foe: armyTag(a), foeIds: [...a.members] };
      sim.chronicle.add({ year: sim.year, kind: 'battle', a: refOf(ga as Human), b: refOf(gb as Human), u: armyTag(a), w: armyTag(b), v: name, x: mx, y: my });
      break;
    }
  }
}

/**
 * A battle is over when one army runs (morale under 25 %) or is gone: the
 * other one wins. Everyone who fought and lives becomes a veteran.
 */
export function endBattles(sim: Sim): { ran: Army[]; won: Army[] } {
  const ran: Army[] = [];
  const won: Army[] = [];
  const alive = (ids: number[]) => ids.filter((id) => sim.byId(id)).length;
  for (const a of sim.armies) {
    const battle = a.battle;
    if (!battle) continue;
    const enemy = sim.armies.find((x) => x.id === battle.enemy);
    const beaten = (a.morale ?? 100) < 25 || a.members.length < 2;
    if (enemy && !beaten) continue;
    // a ran (the enemy wins), or the enemy is gone (a wins)
    const winner = beaten ? enemy : a;
    const loserIds = beaten ? battle.ids : battle.foeIds;
    if (beaten) ran.push(a);
    if (winner) {
      won.push(winner);
      const g = sim.byId(winner.general) as Human | undefined;
      if (g) {
        sim.chronicle.add({
          year: sim.year,
          kind: 'battleWon',
          a: refOf(g),
          u: armyTag(winner),
          w: beaten ? armyTag(a) : battle.foe,
          v: battle.place,
          n: Math.max(0, loserIds.length - alive(loserIds)),
          x: g.x,
          y: g.y,
        });
      }
    }
    veterans(sim, battle.ids, battle.place);
    veterans(sim, battle.foeIds, battle.place);
    a.battle = undefined;
    if (enemy) enemy.battle = undefined;
  }
  return { ran, won };
}

function veterans(sim: Sim, ids: number[], place: string) {
  for (const id of ids) {
    const h = sim.byId(id) as Human | undefined;
    if (!h || h.kind !== 'human' || h.veteran === place) continue;
    h.veteran = place;
    if (h.hp < h.maxHp * 0.6) h.scarred = true;
    h.stats.courage = Math.min(10, stat(h, 'courage') + 1);
    story(h, sim, 'battle', place);
  }
}

/* ---- horses ------------------------------------------------------------------------- */

/** Once a year: places tame a wild horse that comes close, and their horses breed. */
export function stables(sim: Sim) {
  if (sim.stableYear === sim.year) return;
  sim.stableYear = sim.year;
  for (const v of sim.villages) {
    if (v.ruin || v.members < 6) continue;
    const cap = Math.ceil(v.members / 4);
    const horses = v.horses ?? 0;
    if (horses >= 2 && horses < cap && sim.rand() < 0.25) v.horses = horses + 1;
    if ((v.horses ?? 0) >= cap) continue;
    const wild = sim.nearest(v.x + 0.5, v.y + 0.5, 15, (o) => o.kind === 'horse');
    if (wild) {
      sim.kill(wild, 'tamed');
      v.horses = (v.horses ?? 0) + 1;
    }
  }
  // Wild herds come over from the mainland when the island has (almost) none
  if (sim.count('horse') < 4) {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(sim.rand() * sim.world.w);
      const y = Math.floor(sim.rand() * sim.world.h);
      if (sim.world.get(x, y) !== T.GRASS || sim.villages.some((v) => !v.ruin && Math.hypot(v.x - x, v.y - y) < 12)) continue;
      sim.addAnimal('horse', x, y);
      break;
    }
  }
}

