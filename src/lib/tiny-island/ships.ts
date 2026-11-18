/**
 * Seafaring (Update 2, phase G). A coastal place builds a harbor (it needs
 * boats); from the Middle Ages its people sail:
 *
 *  - explorer: a captain sails into the fog towards an island nobody has
 *    seen yet and lifts the fog around the ship; the find goes into the
 *    chronicle with the captain's name, then the ship comes home
 *  - settler ship: six young people (couples first) sail to a free spot on a
 *    discovered island and found a colony (colonies.ts)
 *  - trade ship: between harbors on different islands; brings food over,
 *    lifts the mood, keeps a colony loyal
 *  - warship (Renaissance): carries armies over the sea (war.ts) and, in a
 *    war, sails out against the enemy's harbors; warships shoot at enemy
 *    ships (arrows, cannons once there is gunpowder). A sunk ship leaves a
 *    wreck for three years and whoever is on board is lost at sea.
 *
 * Ships sail on deep and shallow water only (path.ts, mover 'ship'). Whoever
 * is on board (`h.aboard`) is off the map and only rides along.
 */
import { stage, stat, type Human, type People } from './agents';
import { ageIndex, knows } from './inventions';
import { shipName } from './names';
import { findPath } from './path';
import type { Sim } from './sim';
import { refOf, story } from './social';
import { foundColony, type Village } from './villages';
import { isEnemy, warBetween, type Army } from './war';
import { T, type Island, type World } from './world';

export type ShipKind = 'explorer' | 'settler' | 'trader' | 'warship';

export interface Ship {
  id: number;
  kind: ShipKind;
  name: string;
  people: People;
  /** Harbor village it belongs to. */
  home: number;
  x: number;
  y: number;
  facing: 1 | -1;
  path: number[] | null;
  /** Out on its errand, or on the way home. */
  state: 'out' | 'home';
  hp: number;
  maxHp: number;
  aboard: number[];
  captain?: number;
  /** Explorer: the island it looks for (index in world.islands). Trader: the partner village. */
  island?: number;
  partner?: number;
  /** Warship carrying an army, and where that army goes ashore. */
  army?: number;
  land?: { x: number; y: number };
  /** Where it is heading (tile): after loading a saved world the course is planned again. */
  goal?: { x: number; y: number };
  /** Settler ship: where the colony will be. */
  spot?: { x: number; y: number };
  cargo?: number;
  /** Gives up and turns home at this time. */
  until: number;
  shotAt: number;
  moving: boolean;
}

export interface Wreck {
  x: number;
  y: number;
  until: number;
  people: People;
}

const YEAR = 30;
const SPEED: Record<ShipKind, number> = { explorer: 2.6, settler: 2, trader: 2.2, warship: 2 };
const HP: Record<ShipKind, number> = { explorer: 40, settler: 50, trader: 50, warship: 120 };
/** Soldiers per warship. */
export const SHIP_ARMY = 20;
const SEE: Record<ShipKind, number> = { explorer: 9, settler: 6, trader: 6, warship: 7 };
const PATH_BUDGET = 70000;

/* ---- harbors ------------------------------------------------------------------------- */

export const harborOf = (v: Village | undefined) => v?.buildings.find((b) => b.kind === 'harbor');

/** The water tile next to a harbor where ships come in (deep water preferred). */
export function dockOf(world: World, b: { x: number; y: number }): { x: number; y: number } | null {
  let best: { x: number; y: number; s: number } | null = null;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = b.x + dx;
      const y = b.y + dy;
      const t = world.get(x, y);
      if (t !== T.DEEP && t !== T.SHALLOW) continue;
      const s = Math.hypot(dx, dy) + (t === T.DEEP ? 0 : 1.5);
      if (!best || s < best.s) best = { x, y, s };
    }
  }
  return best && { x: best.x, y: best.y };
}

/** Can this people send this kind of ship out? Explorers, settlers and traders from the Middle Ages, warships from the Renaissance. */
export function canSail(sim: Sim, p: People, kind: ShipKind) {
  const age = ageIndex(sim, p);
  return kind === 'warship' ? age >= 4 : age >= 3;
}

/** Harbor villages of a people that have a way out to sea. */
export function ports(sim: Sim, p: People) {
  return sim.villages.filter((v) => !v.ruin && v.people === p && harborOf(v) && dockOf(sim.world, harborOf(v)!));
}

/** A water tile next to the land of (tx, ty), as close to it as there is one; and the land tile beside it. */
export function landingNear(world: World, tx: number, ty: number): { water: { x: number; y: number }; land: { x: number; y: number } } | null {
  const id = world.landAt(Math.floor(tx), Math.floor(ty));
  if (!id) return null;
  for (let r = 1; r < 40; r++) {
    let best: { water: { x: number; y: number }; land: { x: number; y: number }; d: number } | null = null;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.floor(tx) + dx;
        const y = Math.floor(ty) + dy;
        const t = world.get(x, y);
        if (t !== T.DEEP && t !== T.SHALLOW) continue;
        for (const [ax, ay] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const lx = x + ax;
          const ly = y + ay;
          if (!world.isLand(world.get(lx, ly)) || !Number.isFinite(world.cost(lx, ly)) || world.landAt(lx, ly) !== id) continue;
          const d = Math.hypot(dx, dy);
          if (!best || d < best.d) best = { water: { x, y }, land: { x: lx, y: ly }, d };
        }
      }
    }
    if (best) return { water: best.water, land: best.land };
  }
  return null;
}

/* ---- sailing --------------------------------------------------------------------------- */

function setCourse(sim: Sim, ship: Ship, x: number, y: number): boolean {
  const p = findPath(sim.world, Math.floor(ship.x), Math.floor(ship.y), x, y, 'ship', PATH_BUDGET);
  ship.path = p;
  ship.goal = { x, y };
  return p !== null;
}

/** A new ship at the harbor of `v`, on its way to (x, y); null if it cannot get there. */
export function launch(sim: Sim, v: Village, kind: ShipKind, to: { x: number; y: number }, extra: Partial<Ship> = {}): Ship | null {
  const b = harborOf(v);
  const dock = b && dockOf(sim.world, b);
  if (!dock) return null;
  const ship: Ship = {
    id: sim.nextShipId++,
    kind,
    name: shipName(sim.rand),
    people: v.people,
    home: v.id,
    x: dock.x + 0.5,
    y: dock.y + 0.5,
    facing: 1,
    path: null,
    state: 'out',
    hp: HP[kind],
    maxHp: HP[kind],
    aboard: [],
    until: sim.time + 4 * YEAR,
    shotAt: 0,
    moving: false,
    ...extra,
  };
  if (!setCourse(sim, ship, to.x, to.y)) return null;
  sim.ships.push(ship);
  return ship;
}

/** Puts someone on board: off the map, riding along. */
export function embark(ship: Ship, h: Human) {
  h.aboard = ship.id;
  h.task = null;
  h.path = null;
  h.moving = false;
  h.x = ship.x;
  h.y = ship.y;
  ship.aboard.push(h.id);
}

/** Lets everyone off onto the land around (x, y). */
function disembark(sim: Sim, ship: Ship, x: number, y: number, ids = ship.aboard) {
  for (const id of ids) {
    const h = sim.byId(id) as Human | undefined;
    if (!h) continue;
    const spot = sim.freeNear(x, y, 2, sim.rand) ?? { x, y };
    h.aboard = undefined;
    h.x = spot.x + 0.5;
    h.y = spot.y + 0.5;
    h.thinkAt = sim.time;
  }
  ship.aboard = ship.aboard.filter((id) => !ids.includes(id));
}

/** Every tick: ships move along their course and carry whoever is on board. */
export function moveShips(sim: Sim, dt: number) {
  const w = sim.world.w;
  for (const ship of [...sim.ships]) {
    if (!ship.path || !ship.path.length) {
      ship.moving = false;
      if (ship.path) {
        ship.path = null;
        arrive(sim, ship);
      }
      continue;
    }
    let step = SPEED[ship.kind] * dt;
    while (step > 0 && ship.path.length) {
      const next = ship.path[0];
      const nx = (next % w) + 0.5;
      const ny = Math.floor(next / w) + 0.5;
      const dx = nx - ship.x;
      const dy = ny - ship.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) ship.facing = dx > 0 ? 1 : -1;
      if (d <= step) {
        ship.x = nx;
        ship.y = ny;
        step -= d;
        ship.path.shift();
      } else {
        ship.x += (dx / d) * step;
        ship.y += (dy / d) * step;
        step = 0;
      }
    }
    ship.moving = true;
    for (const id of ship.aboard) {
      const h = sim.byId(id);
      if (h) {
        h.x = ship.x;
        h.y = ship.y;
      }
    }
  }
}

/** Back to the home harbor (or, if it is gone, the nearest one of the people). */
function goHome(sim: Sim, ship: Ship) {
  ship.state = 'home';
  ship.until = sim.time + 4 * YEAR;
  let home = sim.villages.find((v) => v.id === ship.home && !v.ruin && v.people === ship.people);
  if (!home || !harborOf(home)) home = ports(sim, ship.people).sort((a, b) => Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y))[0];
  const dock = home && dockOf(sim.world, harborOf(home)!);
  if (home && dock && setCourse(sim, ship, dock.x, dock.y)) {
    ship.home = home.id;
    return;
  }
  // Nowhere to go: everyone goes ashore at the nearest land, the ship is left behind
  const land = landingNear(sim.world, ship.x, ship.y);
  if (ship.aboard.length) disembark(sim, ship, land?.land.x ?? Math.floor(ship.x), land?.land.y ?? Math.floor(ship.y));
  sim.ships = sim.ships.filter((s) => s !== ship);
}

function arrive(sim: Sim, ship: Ship) {
  if (ship.state === 'home') {
    const home = sim.villages.find((v) => v.id === ship.home);
    const b = harborOf(home);
    if (ship.aboard.length) disembark(sim, ship, b?.x ?? Math.floor(ship.x), b?.y ?? Math.floor(ship.y));
    // A trader brings home what it earned
    if (ship.kind === 'trader' && home && ship.cargo) home.food += Math.ceil(ship.cargo / 2);
    sim.ships = sim.ships.filter((s) => s !== ship);
    return;
  }
  switch (ship.kind) {
    case 'explorer':
      break;
    case 'settler':
      settle(sim, ship);
      break;
    case 'trader':
      tradeAt(sim, ship);
      break;
    case 'warship':
      // The army goes ashore, unless its war ended on the way: then everyone sails home again
      if (ship.army !== undefined && ship.land && sim.armies.some((a) => a.id === ship.army)) {
        disembark(sim, ship, ship.land.x, ship.land.y);
        landed(sim, ship.army);
      }
      break;
  }
  goHome(sim, ship);
}

/* ---- once a second: sight, finds, sea battles; once a year: new voyages ---------------- */

export function shipTick(sim: Sim) {
  const world = sim.world;
  for (const ship of [...sim.ships]) {
    // Loaded from a save: plan the course again
    if (!ship.path && (!ship.goal || !setCourse(sim, ship, ship.goal.x, ship.goal.y))) {
      goHome(sim, ship);
      continue;
    }
    if (world.reveal(ship.x, ship.y, SEE[ship.kind])) discoveries(sim, ship);
    // Too long at sea: home
    if (ship.state === 'out' && sim.time > ship.until) goHome(sim, ship);
  }
  seaBattles(sim);
  if (sim.wrecks.length) sim.wrecks = sim.wrecks.filter((w) => w.until > sim.time);
  if (sim.shipYear !== sim.year) {
    sim.shipYear = sim.year;
    voyages(sim);
  }
}

/** Islands that came out of the fog: into the chronicle, with the captain who found them. */
export function discoveries(sim: Sim, ship?: Ship) {
  const world = sim.world;
  world.islands.forEach((is, k) => {
    if (is.found || !islandSeen(world, is)) return;
    is.found = sim.year;
    const captain = ship?.captain !== undefined ? (sim.byId(ship.captain) as Human | undefined) : undefined;
    if (captain) story(captain, sim, 'discovered', is.name);
    sim.chronicle.add({
      year: sim.year,
      kind: 'discovered',
      a: captain ? refOf(captain) : { id: 0, name: ship?.name ?? '', people: ship?.people ?? 'coast' },
      v: is.name,
      w: ship?.name,
      p: ship?.people,
      n: k,
      x: is.x,
      y: is.y,
    });
    if (ship?.kind === 'explorer' && ship.island === k && ship.state === 'out') goHome(sim, ship);
  });
}

/** Has any land of this island come out of the fog? */
function islandSeen(world: World, is: Island) {
  const x0 = Math.max(0, Math.floor(is.x - is.rx * 1.3));
  const x1 = Math.min(world.w - 1, Math.ceil(is.x + is.rx * 1.3));
  const y0 = Math.max(0, Math.floor(is.y - is.ry * 1.3));
  const y1 = Math.min(world.h - 1, Math.ceil(is.y + is.ry * 1.3));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * world.w + x;
      if (!world.fog[i] && world.isLand(world.tiles[i] as never)) return true;
    }
  }
  return false;
}

/** Warships shoot at enemy ships close by; a ship at 0 goes down. */
function seaBattles(sim: Sim) {
  for (const ship of sim.ships) {
    if (ship.kind !== 'warship' || ship.hp <= 0 || sim.time < ship.shotAt) continue;
    const foe = sim.ships.find((o) => o !== ship && o.hp > 0 && Math.hypot(o.x - ship.x, o.y - ship.y) < 7 && shipsAtWar(sim, ship, o));
    if (!foe) continue;
    const guns = knows(sim, ship.people, 'gunpowder');
    ship.shotAt = sim.time + 2 + sim.rand();
    sim.shots.push({ x0: ship.x, y0: ship.y - 0.6, x1: foe.x, y1: foe.y - 0.4, born: sim.time, kind: guns ? 'ball' : 'arrow' });
    if (guns) sim.puff(ship.x + ship.facing * 0.6, ship.y - 0.6, 4, ['#d8d4c8', '#ffffff', '#b4b9c2']);
    foe.hp -= (guns ? 18 : 9) * (0.8 + sim.rand() * 0.4);
    if (foe.hp <= 0) sink(sim, foe, ship);
  }
}

function shipsAtWar(sim: Sim, a: Ship, b: Ship) {
  if (a.people !== b.people) return !!warBetween(sim, a.people, b.people);
  return isEnemy(sim, { people: a.people, village: a.home }, { people: b.people, village: b.home });
}

/** Down it goes: a wreck stays for three years, nobody on board survives. */
export function sink(sim: Sim, ship: Ship, by?: Ship) {
  ship.hp = 0;
  sim.ships = sim.ships.filter((s) => s !== ship);
  sim.wrecks.push({ x: ship.x, y: ship.y, until: sim.time + 3 * YEAR, people: ship.people });
  sim.puff(ship.x, ship.y - 0.4, 14, ['#ffffff', '#d5ecff', '#8a5a2b']);
  const lost = ship.aboard.length;
  for (const id of ship.aboard) {
    const h = sim.byId(id) as Human | undefined;
    if (!h) continue;
    h.aboard = undefined;
    if (by) h.attacker = undefined;
    sim.kill(h, 'sea');
  }
  ship.aboard = [];
  sim.chronicle.add({ year: sim.year, kind: 'shipSunk', a: { id: 0, name: ship.name, people: ship.people }, w: ship.name, p: ship.people, q: by?.people, n: lost, x: ship.x, y: ship.y });
}

/* ---- the voyages ---------------------------------------------------------------------- */

/** Once a year per people: maybe an explorer, a settler ship, traders, a warship. */
function voyages(sim: Sim) {
  const peoples = [...new Set(sim.villages.filter((v) => !v.ruin).map((v) => v.people))];
  for (const p of peoples) {
    const harbors = ports(sim, p);
    if (!harbors.length) continue;
    const atSea = (kind: ShipKind) => sim.ships.some((s) => s.people === p && s.kind === kind);
    // The islanders stay a small people at home: they trade, but they do not explore, settle or send fleets
    if (p === 'islanders') {
      for (const v of harbors) if (canSail(sim, p, 'trader') && v.buildings.some((b) => b.kind === 'market') && !sim.ships.some((s) => s.home === v.id) && sim.rand() < 0.5) traderFrom(sim, v);
      continue;
    }
    if (canSail(sim, p, 'explorer') && !atSea('explorer') && sim.rand() < 0.5) explore(sim, harbors);
    if (canSail(sim, p, 'settler') && !atSea('settler') && sim.rand() < 0.2) colonize(sim, harbors);
    if (canSail(sim, p, 'trader')) for (const v of harbors) if (v.buildings.some((b) => b.kind === 'market') && !sim.ships.some((s) => s.home === v.id && s.kind === 'trader') && sim.rand() < 0.5) traderFrom(sim, v);
    if (canSail(sim, p, 'warship') && !sim.ships.some((s) => s.people === p && s.kind === 'warship' && s.army === undefined) && sim.rand() < 0.4) patrol(sim, p, harbors);
  }
}

/** Who goes: the bravest and cleverest grown-up of the place who is not its leader. */
function pickCaptain(sim: Sim, v: Village): Human | undefined {
  return sim.humans
    .filter((h) => h.village === v.id && h.aboard === undefined && stage(h, sim.time) === 'adult' && h.id !== v.leader && !h.slot)
    .sort((a, b) => stat(b, 'courage') + stat(b, 'intelligence') - stat(a, 'courage') - stat(a, 'intelligence'))[0];
}

function explore(sim: Sim, harbors: Village[]) {
  const world = sim.world;
  const hidden = world.islands.map((is, k) => ({ is, k })).filter(({ is }) => !is.found);
  if (!hidden.length) return;
  const from = [...harbors].sort((a, b) => b.members - a.members)[0];
  const { is, k } = hidden.sort((a, b) => Math.hypot(a.is.x - from.x, a.is.y - from.y) - Math.hypot(b.is.x - from.x, b.is.y - from.y))[0];
  const to = landingNear(world, is.x, is.y);
  const captain = pickCaptain(sim, from);
  if (!to || !captain) return;
  const ship = launch(sim, from, 'explorer', to.water, { island: k, captain: captain.id });
  if (!ship) return;
  embark(ship, captain);
  sim.chronicle.add({ year: sim.year, kind: 'setSail', a: refOf(captain), v: from.name, w: ship.name, x: from.x, y: from.y });
}

/** A free spot for a colony on a discovered island of another land than the harbor's: grass, nobody within 16 tiles. */
function colonySpot(sim: Sim, from: Village): { x: number; y: number } | null {
  const world = sim.world;
  const home = world.landAt(from.x, from.y);
  const options = world.islands.filter((is) => is.found && world.landAt(Math.round(is.x), Math.round(is.y)) !== home);
  for (let k = 0; k < 80 && options.length; k++) {
    const is = options[Math.floor(sim.rand() * options.length)];
    const x = Math.round(is.x + (sim.rand() - 0.5) * is.rx * 1.4);
    const y = Math.round(is.y + (sim.rand() - 0.5) * is.ry * 1.4);
    if (world.get(x, y) !== T.GRASS || world.landAt(x, y) === home || !world.landAt(x, y)) continue;
    if (sim.villages.some((v) => !v.ruin && Math.hypot(v.x - x, v.y - y) < 16)) continue;
    return { x, y };
  }
  return null;
}

function colonize(sim: Sim, harbors: Village[]) {
  const from = harbors.filter((v) => v.members >= 14).sort((a, b) => b.members - a.members)[0];
  if (!from) return;
  const spot = colonySpot(sim, from);
  const to = spot && landingNear(sim.world, spot.x, spot.y);
  if (!spot || !to) return;
  // Six young grown-ups, couples together
  const young = sim.humans.filter((h) => h.village === from.id && h.aboard === undefined && !h.slot && h.id !== from.leader && stage(h, sim.time) === 'adult' && (sim.time - h.born) / YEAR <= 40);
  const going: Human[] = [];
  for (const h of young) {
    if (going.length >= 6 || going.includes(h)) continue;
    going.push(h);
    const partner = h.partner !== undefined ? young.find((o) => o.id === h.partner) : undefined;
    if (partner && going.length < 6 && !going.includes(partner)) going.push(partner);
  }
  if (going.length < 4) return;
  // Their small children come along
  const kids = sim.humans.filter((h) => h.village === from.id && h.aboard === undefined && stage(h, sim.time) === 'child' && h.parents.some((id) => going.some((g) => g.id === id)));
  const ship = launch(sim, from, 'settler', to.water, { spot, land: to.land, captain: going[0].id, cargo: Math.min(18, Math.floor(from.food / 5)) });
  if (!ship) return;
  from.food -= ship.cargo ?? 0;
  for (const h of [...going, ...kids]) embark(ship, h);
  sim.chronicle.add({ year: sim.year, kind: 'settlersSail', a: refOf(going[0]), v: from.name, w: ship.name, n: going.length, x: from.x, y: from.y });
}

/** The settlers go ashore and found their colony. */
function settle(sim: Sim, ship: Ship) {
  const settlers = ship.aboard.map((id) => sim.byId(id) as Human | undefined).filter((h): h is Human => !!h);
  const mother = sim.villages.find((v) => v.id === ship.home);
  const spot = ship.spot ?? ship.land;
  if (!settlers.length || !spot || !ship.land) return;
  disembark(sim, ship, ship.land.x, ship.land.y);
  // The spot may have been taken meanwhile: then right where they landed
  const free = !sim.villages.some((v) => !v.ruin && Math.hypot(v.x - spot.x, v.y - spot.y) < 12);
  const at = free ? spot : ship.land;
  const v = foundColony(sim, ship.people, at.x, at.y, mother, settlers);
  v.food += ship.cargo ?? 0;
  ship.cargo = 0;
  const is = sim.world.islandAt(at.x, at.y);
  for (const h of settlers) story(h, sim, 'colony', v.name);
  sim.chronicle.add({ year: sim.year, kind: 'colony', a: refOf(settlers[0]), v: mother?.name ?? '', w: v.name, u: is?.name, x: v.x, y: v.y });
}

function traderFrom(sim: Sim, v: Village) {
  const world = sim.world;
  const land = world.landAt(v.x, v.y);
  const partners = sim.villages.filter(
    (o) =>
      o !== v &&
      !o.ruin &&
      harborOf(o) &&
      world.landAt(o.x, o.y) !== land &&
      !isEnemy(sim, { people: v.people, village: v.id }, { people: o.people, village: o.id }) &&
      world.seen(o.x, o.y),
  );
  if (!partners.length) return;
  // Its own colonies and mother first, then the nearest
  const kin = (o: Village) => o.colonyOf === v.id || v.colonyOf === o.id;
  const partner = partners.sort((a, b) => (kin(b) ? 1 : 0) - (kin(a) ? 1 : 0) || Math.hypot(a.x - v.x, a.y - v.y) - Math.hypot(b.x - v.x, b.y - v.y))[0];
  const dock = dockOf(world, harborOf(partner)!);
  if (!dock) return;
  const cargo = Math.min(15, Math.floor(v.food * 0.15));
  const ship = launch(sim, v, 'trader', dock, { partner: partner.id, cargo });
  if (ship) v.food -= cargo;
}

/** The trader sells its goods: food over, the mood up, a colony more loyal. */
function tradeAt(sim: Sim, ship: Ship) {
  const partner = sim.villages.find((v) => v.id === ship.partner && !v.ruin);
  if (!partner) return;
  partner.food += ship.cargo ?? 0;
  // The way back: goods of the partner (half of it stays as profit at home, see arrive)
  ship.cargo = Math.min(15, Math.floor(partner.food * 0.1));
  partner.food -= ship.cargo;
  if (partner.people !== ship.people) shiftPeopleMood(sim, ship.people, partner.people);
  if (partner.colonyOf === ship.home || sim.villages.find((v) => v.id === ship.home)?.colonyOf === partner.id) {
    for (const v of [partner, sim.villages.find((x) => x.id === ship.home)]) if (v?.colonyOf !== undefined) v.colonyLoyalty = Math.min(100, (v.colonyLoyalty ?? 70) + 4);
  }
  partner.tradedWith = sim.villages.find((v) => v.id === ship.home)?.name ?? partner.tradedWith;
  sim.puff(partner.x + 0.5, partner.y - 0.2, 5, ['#ffe066', '#ffffff']);
}

/** Trade lifts the mood between two peoples (war.ts would import this module, so it is set here directly). */
function shiftPeopleMood(sim: Sim, a: People, b: People) {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  sim.mood.set(k, Math.min(100, (sim.mood.get(k) ?? 0) + 3));
}

/** In a war: a warship sails against the nearest enemy harbor overseas and fights the ships it meets. */
function patrol(sim: Sim, p: People, harbors: Village[]) {
  const world = sim.world;
  for (const from of harbors) {
    const land = world.landAt(from.x, from.y);
    const foes = sim.villages.filter(
      (o) => !o.ruin && harborOf(o) && world.landAt(o.x, o.y) !== land && isEnemy(sim, { people: p, village: from.id }, { people: o.people, village: o.id }),
    );
    if (!foes.length) continue;
    const foe = foes.sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0];
    const dock = dockOf(world, harborOf(foe)!);
    const captain = pickCaptain(sim, from);
    if (!dock || !captain) continue;
    const ship = launch(sim, from, 'warship', dock, { captain: captain.id, until: sim.time + 2 * YEAR });
    if (!ship) continue;
    embark(ship, captain);
    sim.chronicle.add({ year: sim.year, kind: 'fleet', a: refOf(captain), v: from.name, w: foe.name, x: from.x, y: from.y });
    return;
  }
}

/* ---- armies over the sea (called by war.ts) ------------------------------------------------ */

/** Can this place ship an army across the sea? A harbor and the Renaissance. */
export function canShip(sim: Sim, v: Village) {
  return canSail(sim, v.people, 'warship') && !!harborOf(v) && !!dockOf(sim.world, harborOf(v)!);
}

/**
 * The army boards warships at its harbor (20 soldiers each, at most four
 * ships) and sails to the coast next to its target. Those too far from the
 * harbor stay behind. False if no ship can get there.
 */
export function shipArmy(sim: Sim, army: Army, from: Village, target: Village): boolean {
  const to = landingNear(sim.world, target.x, target.y);
  if (!to) return false;
  const b = harborOf(from);
  const members = army.members.map((id) => sim.byId(id) as Human | undefined).filter((h): h is Human => !!h && h.aboard === undefined && !!b && Math.hypot(h.x - b.x, h.y - b.y) < 30);
  if (members.length < 2) return false;
  const ships: Ship[] = [];
  for (let i = 0; i < members.length && ships.length < 4; i += SHIP_ARMY) {
    const ship = launch(sim, from, 'warship', to.water, { army: army.id, land: to.land, until: sim.time + 3 * YEAR });
    if (!ship) break;
    ships.push(ship);
    for (const h of members.slice(i, i + SHIP_ARMY)) embark(ship, h);
  }
  if (!ships.length) return false;
  army.members = army.members.filter((id) => ships.some((s) => s.aboard.includes(id)));
  if (!army.members.includes(army.general)) army.general = army.members[0];
  ships[0].captain = army.general;
  sim.chronicle.add({ year: sim.year, kind: 'armySails', a: refOf(sim.byId(army.general) as Human), v: from.name, w: target.name, n: army.members.length, x: from.x, y: from.y });
  return true;
}

/** A ship of the army landed: once none is still at sea, the army marches on. */
function landed(sim: Sim, armyId: number) {
  const army = sim.armies.find((a) => a.id === armyId);
  if (!army) return;
  if (sim.ships.some((s) => s.army === armyId && s.state === 'out' && s.aboard.length)) return;
  army.state = 'march';
  army.landed = true;
}

/**
 * An army that went overseas is over: whoever is not on their home island
 * stays with a place of their people there, or a warship takes them home.
 */
export function ferryHome(sim: Sim, army: Army) {
  const from = sim.villages.find((v) => v.id === army.from);
  const world = sim.world;
  const stranded = army.members
    .map((id) => sim.byId(id) as Human | undefined)
    .filter((h): h is Human => !!h && h.aboard === undefined && !!from && !world.sameLand(h.x, h.y, from.x, from.y));
  if (!stranded.length || !from) return;
  const left: Human[] = [];
  for (const h of stranded) {
    const near = sim.villages.find((v) => !v.ruin && v.people === h.people && world.sameLand(v.x, v.y, h.x, h.y));
    if (near) h.village = near.id;
    else left.push(h);
  }
  if (!left.length) return;
  const first = left[0];
  const at = landingNear(world, first.x, first.y);
  const b = harborOf(from);
  const dock = b && dockOf(world, b);
  if (!at || !dock) return;
  const ship: Ship = {
    id: sim.nextShipId++,
    kind: 'warship',
    name: shipName(sim.rand),
    people: from.people,
    home: from.id,
    x: at.water.x + 0.5,
    y: at.water.y + 0.5,
    facing: 1,
    path: null,
    state: 'home',
    hp: HP.warship,
    maxHp: HP.warship,
    aboard: [],
    until: sim.time + 3 * YEAR,
    shotAt: 0,
    moving: false,
  };
  if (!setCourse(sim, ship, dock.x, dock.y)) return;
  sim.ships.push(ship);
  for (const h of left) embark(ship, h);
}

/** Islands still under the fog, for the panels. */
export const hiddenIslands = (world: World) => world.islands.filter((is) => !is.found).length;

export const shipOf = (sim: Sim, h: Human) => (h.aboard === undefined ? undefined : sim.ships.find((s) => s.id === h.aboard));
