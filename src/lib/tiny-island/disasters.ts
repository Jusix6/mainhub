/**
 * Disasters (Update 3, phase F). They come by themselves (Rules: Off, Rare,
 * Normal, Chaos) or from the player (the Disasters window), and the islanders
 * build up again afterwards. Cute, not cruel: smoke, sparks and dust.
 *
 * - Lightning: strikes a tree, a wooden house or someone in the open.
 * - Fire: spreads over forest and wooden houses (in a heatwave over grass
 *   too); people nearby put it out, faster with a well at home. Whoever puts
 *   out many fires becomes "the Firebreaker". A big fire gets a name.
 * - Volcano: only on mountains. Smoke rises for a few years, then lava runs
 *   down; lava becomes new rock and, years later, very fertile soil.
 * - Hurricane: comes from the sea and crosses the island, unroofs houses,
 *   uproots trees, sinks ships; a lighthouse warns the places nearby.
 * - Heatwave: one to three years; fields and bushes give less, fires spread,
 *   places without a granary lose some of their stores.
 * - Greenhouse: factories and trains warm the world (a line in the
 *   statistics). Warmer means more heatwaves and hurricanes; from a high
 *   level (Normal or Chaos only) the sea rises and takes the shore, and the
 *   snow on the peaks melts. Forests, faiths of nature and a movement started
 *   by a philosopher cool it down again.
 * - God power Rain: puts out every fire around and shortens a heatwave.
 * - After a disaster the survivors' faith grows (some lose it), and prophets
 *   come more often.
 */
import { BALANCE } from './balance';
import { has, stage, type Human } from './agents';
import type { Sim } from './sim';
import { refOf } from './social';
import { sink } from './ships';
import { hasBuilding } from './town';
import type { House, Village } from './villages';
import { T } from './world';

const D = BALANCE.disasters;
const YEAR = 30;
const STORM_NAMES = ['Ada', 'Bram', 'Cora', 'Dagny', 'Egon', 'Fenna', 'Gorm', 'Hilde', 'Ivo', 'Jorun', 'Kasimir', 'Lotta', 'Mads', 'Nele', 'Odo', 'Pia'];
const PEAK_NAMES = ['Ember', 'Ash', 'Thunder', 'Cinder', 'Grim', 'Glow', 'Smoke', 'Fury'];

export interface Hurricane {
  x: number;
  y: number;
  dx: number;
  dy: number;
  until: number;
  name: string;
  houses: number;
  trees: number;
  ships: number;
}

export interface Volcano {
  x: number;
  y: number;
  name: string;
  /** Smoke until this game time, then it erupts for a while. */
  erupts: number;
  until?: number;
  streams?: { x: number; y: number; left: number }[];
}

export interface FireEvent {
  name: string;
  x: number;
  y: number;
  burned: number;
  houses: number;
}

/** How often disasters come by themselves: Off, Rare, Normal, Chaos. */
const often = (sim: Sim) => D.often[Math.max(0, Math.min(3, Math.round(sim.rules.disasters)))];

/** Houses of wood (tents and wooden houses) by tile, they burn. */
function woodenHouses(sim: Sim): Map<number, { v: Village; h: House }> {
  const out = new Map<number, { v: Village; h: House }>();
  for (const v of sim.villages) {
    if (v.ruin) continue;
    for (const h of v.houses) if (h.level <= 1) out.set(h.y * sim.world.w + h.x, { v, h });
  }
  return out;
}

/** A house is lost (fire, lava, storm): its people need a new one. */
function loseHouse(sim: Sim, v: Village, h: House) {
  v.houses = v.houses.filter((x) => x !== h);
  for (const id of h.owners) {
    const o = sim.byId(id) as Human | undefined;
    if (o) o.home = { x: v.x, y: v.y };
  }
  sim.puff(h.x + 0.5, h.y, 8, ['#5a5a5a', '#8a8a8a', '#ffb000']);
}

/* ---- fire -------------------------------------------------------------------------- */

/** Sets a tile on fire, if there is something to burn. */
export function ignite(sim: Sim, x: number, y: number, houses = woodenHouses(sim)): boolean {
  const w = sim.world;
  if (!w.inside(x, y)) return false;
  const i = y * w.w + x;
  if (sim.fires.has(i)) return false;
  const t = w.tiles[i];
  const burns = t === T.FOREST || houses.has(i) || (t === T.GRASS && !!sim.heat) || t === T.FIELD;
  if (!burns) return false;
  sim.fires.set(i, D.fireTime);
  if (!sim.fireEvent) {
    const v = nearestPlace(sim, x, y);
    sim.fireEvent = { name: v ? `The Fire of ${v.name}` : 'The Fire', x, y, burned: 0, houses: 0 };
  }
  return true;
}

const nearestPlace = (sim: Sim, x: number, y: number) =>
  sim.villages.filter((v) => !v.ruin && !v.merged).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];

/** Once a second: fires burn down and spread; people and animals in them get hurt. */
function fireSecond(sim: Sim) {
  if (!sim.fires.size) return;
  const w = sim.world;
  const houses = woodenHouses(sim);
  const ev = sim.fireEvent!;
  for (const [i, left] of [...sim.fires]) {
    const x = i % w.w;
    const y = Math.floor(i / w.w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const j = (y + dy) * w.w + x + dx;
      if (!w.inside(x + dx, y + dy) || sim.fires.has(j)) continue;
      const t = w.tiles[j];
      const chance = t === T.FOREST ? D.spreadForest : houses.has(j) ? D.spreadHouse : t === T.FIELD ? D.spreadField : t === T.GRASS && sim.heat ? D.spreadGrass : 0;
      if (chance && sim.rand() < chance * (sim.heat ? 1.5 : 1)) ignite(sim, x + dx, y + dy, houses);
    }
    for (const a of sim.near(x + 0.5, y + 0.5, 0.8, () => true)) sim.hurt(a, D.fireHurt, 'fire');
    if (left > 1) {
      sim.fires.set(i, left - 1);
      continue;
    }
    // Burnt down: the forest is gone, a house is lost, the field is bare; a dark scar for a few years
    sim.fires.delete(i);
    ev.burned++;
    const home = houses.get(i);
    if (home) {
      loseHouse(sim, home.v, home.h);
      ev.houses++;
    }
    if (w.tiles[i] === T.FOREST) w.set(x, y, T.GRASS);
    if (w.tiles[i] === T.FIELD) w.crop[i] = 0;
    sim.scorched.set(i, sim.year + D.scarYears);
    sim.puff(x + 0.5, y, 3, ['#5a5a5a', '#8a8a8a']);
  }
  if (!sim.fires.size) {
    if (ev.burned >= D.namedFire) {
      const name = ev.burned >= D.greatFire ? `The Great Fire of Year ${sim.year}` : ev.name;
      sim.chronicle.add({ year: sim.year, kind: 'fire', a: { id: 0, name, people: 'coast' }, u: name, n: ev.burned, w: String(ev.houses), x: ev.x, y: ev.y });
      afterShock(sim, ev.x, ev.y, 20);
    }
    sim.fireEvent = undefined;
  }
}

/** The nearest fire within reach of someone (ai.ts: people put it out). */
export function nearestFire(sim: Sim, h: Human, reach = D.douseReach): { x: number; y: number; i: number } | null {
  if (!sim.fires.size) return null;
  const w = sim.world;
  let best: { x: number; y: number; i: number; d: number } | null = null;
  for (const i of sim.fires.keys()) {
    const x = i % w.w;
    const y = Math.floor(i / w.w);
    const d = Math.hypot(x + 0.5 - h.x, y + 0.5 - h.y);
    if (d <= reach && (!best || d < best.d)) best = { x, y, i, d };
  }
  return best;
}

/** One tick of putting out a fire (water from the well is quicker). Returns true when it is out. */
export function douse(sim: Sim, h: Human, i: number, dt: number): boolean {
  const left = sim.fires.get(i);
  if (left === undefined) return true;
  const v = h.village !== undefined ? sim.villages.find((x) => x.id === h.village) : undefined;
  const rate = hasBuilding(v, 'well') ? D.douseWell : D.douse;
  const now = left - rate * dt;
  if (now > 0) {
    sim.fires.set(i, now);
    return false;
  }
  sim.fires.delete(i);
  sim.puff((i % sim.world.w) + 0.5, Math.floor(i / sim.world.w), 4, ['#d5ecff', '#ffffff']);
  h.saves = (h.saves ?? 0) + 1;
  if (h.saves === D.heroSaves) {
    sim.chronicle.add({ year: sim.year, kind: 'firebreaker', a: refOf(h), x: h.x, y: h.y });
  }
  return true;
}

/* ---- lightning ------------------------------------------------------------------------ */

/** A bolt from the sky: a tree or a wooden house catches fire, someone in the open may be hit. */
export function strike(sim: Sim, x: number, y: number) {
  sim.bolts.push({ x, y, t: sim.time });
  sim.puff(x + 0.5, y, 6, ['#ffffff', '#ffe066', '#cfe8ff']);
  ignite(sim, x, y);
  const hit = sim.nearest(x + 0.5, y + 0.5, 0.9, (a) => a.kind === 'human') as Human | null;
  if (hit && sim.rand() < D.lightningKill) {
    sim.chronicle.add({ year: sim.year, kind: 'struck', a: refOf(hit), x, y });
    sim.kill(hit, 'lightning');
  } else if (hit) sim.hurt(hit, 30, 'lightning');
}

/** A thunderstorm: a few strikes near a place over the next seconds. */
function storm(sim: Sim) {
  const places = sim.villages.filter((v) => !v.ruin && !v.merged);
  const v = places[Math.floor(sim.rand() * places.length)];
  if (!v) return;
  sim.storm = { x: v.x, y: v.y, until: sim.time + D.stormSeconds };
}

function stormSecond(sim: Sim) {
  const s = sim.storm;
  if (!s) return;
  if (sim.time > s.until) {
    sim.storm = undefined;
    return;
  }
  if (sim.rand() > D.strikesPerSecond) return;
  const w = sim.world;
  for (let k = 0; k < 12; k++) {
    const x = Math.round(s.x + (sim.rand() - 0.5) * 40);
    const y = Math.round(s.y + (sim.rand() - 0.5) * 30);
    if (!w.inside(x, y) || !w.isLand(w.get(x, y))) continue;
    strike(sim, x, y);
    return;
  }
}

/* ---- volcanoes ---------------------------------------------------------------------------- */

/** A mountain wakes up: smoke for a while (years when it comes by itself, seconds from the gods), then lava. */
export function wakeVolcano(sim: Sim, x: number, y: number, soon = false): boolean {
  const w = sim.world;
  if (w.get(x, y) !== T.MOUNTAIN || sim.volcanoes.some((v) => Math.hypot(v.x - x, v.y - y) < 8)) return false;
  const name = `Mount ${PEAK_NAMES[Math.floor(sim.rand() * PEAK_NAMES.length)]}`;
  const vol: Volcano = { x, y, name, erupts: sim.time + (soon ? D.godWarning : D.warnYears * YEAR) };
  sim.volcanoes.push(vol);
  const place = nearestPlace(sim, x, y);
  if (!soon) sim.chronicle.add({ year: sim.year, kind: 'volcanoWakes', a: { id: 0, name, people: 'coast' }, u: name, v: place?.name, x, y });
  return true;
}

/** A random big mountain for a volcano. */
function volcanoSpot(sim: Sim): { x: number; y: number } | null {
  const w = sim.world;
  for (let k = 0; k < 300; k++) {
    const x = Math.floor(sim.rand() * w.w);
    const y = Math.floor(sim.rand() * w.h);
    if (w.get(x, y) !== T.MOUNTAIN) continue;
    let rock = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (w.get(x + dx, y + dy) === T.MOUNTAIN) rock++;
    if (rock >= 18) return { x, y };
  }
  return null;
}

/** Once a second: volcanoes erupt, lava runs downhill (away from the crater), kills, burns and cools to rock. */
function volcanoSecond(sim: Sim) {
  const w = sim.world;
  for (const vol of [...sim.volcanoes]) {
    if (sim.time < vol.erupts) continue;
    if (!vol.streams) {
      vol.until = sim.time + D.eruption;
      vol.streams = Array.from({ length: 3 + Math.floor(sim.rand() * 3) }, () => ({ x: vol.x, y: vol.y, left: D.lavaMin + Math.floor(sim.rand() * (D.lavaMax - D.lavaMin)) }));
      sim.chronicle.add({ year: sim.year, kind: 'eruption', a: { id: 0, name: vol.name, people: 'coast' }, u: vol.name, v: nearestPlace(sim, vol.x, vol.y)?.name, x: vol.x, y: vol.y });
      sim.puff(vol.x + 0.5, vol.y - 0.5, 20, ['#ff5a1e', '#ffb000', '#5a5a5a']);
    }
    const houses = new Map<number, { v: Village; h: House }>();
    for (const v of sim.villages) if (!v.ruin) for (const h of v.houses) houses.set(h.y * w.w + h.x, { v, h });
    for (const s of vol.streams) {
      if (s.left <= 0) continue;
      // The next tile: downhill = away from the crater, a little at random, never back into the sea
      let best: { x: number; y: number; score: number } | null = null;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = s.x + dx;
          const y = s.y + dy;
          if (!w.inside(x, y) || sim.lava.has(y * w.w + x)) continue;
          const score = Math.hypot(x - vol.x, y - vol.y) + sim.rand() * 1.5 + (w.get(x, y) === T.MOUNTAIN ? 0 : 0.5);
          if (!best || score > best.score) best = { x, y, score };
        }
      if (!best) {
        s.left = 0;
        continue;
      }
      s.x = best.x;
      s.y = best.y;
      s.left--;
      const i = s.y * w.w + s.x;
      const t = w.tiles[i];
      if (t === T.DEEP || t === T.SHALLOW) {
        // Into the sea: steam, and the stream stops
        sim.puff(s.x + 0.5, s.y, 8, ['#ffffff', '#d5ecff']);
        s.left = 0;
        continue;
      }
      // The stream is two or three tiles wide where it can spread
      const flow = [i];
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]) {
        const j = (s.y + dy) * w.w + s.x + dx;
        if (w.inside(s.x + dx, s.y + dy) && w.landTile(j) && sim.rand() < 0.3) flow.push(j);
      }
      for (const k of flow) {
        sim.lava.set(k, sim.time + D.lavaCool);
        const home = houses.get(k);
        if (home) loseHouse(sim, home.v, home.h);
        for (const a of sim.near((k % w.w) + 0.5, Math.floor(k / w.w) + 0.5, 0.9, () => true)) sim.kill(a, 'lava');
      }
      ignite(sim, s.x + 1, s.y);
      ignite(sim, s.x - 1, s.y);
    }
    if (sim.time > (vol.until ?? 0)) {
      sim.volcanoes = sim.volcanoes.filter((x) => x !== vol);
      afterShock(sim, vol.x, vol.y, 25);
    }
  }
  // Cooled lava: new rock, which turns into rich soil years later
  for (const [i, until] of [...sim.lava]) {
    if (sim.time < until) continue;
    sim.lava.delete(i);
    w.set(i % w.w, Math.floor(i / w.w), T.MOUNTAIN);
    sim.lavaRock.set(i, sim.year + D.soilYears);
  }
}

/* ---- hurricanes ----------------------------------------------------------------------------- */

/** A hurricane comes in from the sea towards (tx, ty) (the middle of the main island when it comes by itself). */
export function hurricane(sim: Sim, tx?: number, ty?: number) {
  if (sim.hurricane) return;
  const w = sim.world;
  const main = w.islands.find((is) => is.main);
  const cx = tx ?? main?.x ?? w.w / 2;
  const cy = ty ?? main?.y ?? w.h / 2;
  const ang = sim.rand() * Math.PI * 2;
  const far = 45;
  const x = cx + Math.cos(ang) * far;
  const y = cy + Math.sin(ang) * far * 0.7;
  const d = Math.hypot(cx - x, cy - y) || 1;
  const name = `Hurricane ${STORM_NAMES[Math.floor(sim.rand() * STORM_NAMES.length)]}`;
  sim.hurricane = { x, y, dx: ((cx - x) / d) * D.hurricaneSpeed, dy: ((cy - y) / d) * D.hurricaneSpeed, until: sim.time + (far * 2) / D.hurricaneSpeed, name, houses: 0, trees: 0, ships: 0 };
}

/** Every tick: the hurricane moves. */
export function moveDisasters(sim: Sim, dt: number) {
  const hu = sim.hurricane;
  if (hu) {
    hu.x += hu.dx * dt;
    hu.y += hu.dy * dt;
  }
}

/** Once a second: the hurricane does its damage (half as much where a lighthouse warned the people). */
function hurricaneSecond(sim: Sim) {
  const hu = sim.hurricane;
  if (!hu) return;
  const w = sim.world;
  if (sim.time > hu.until || !w.inside(Math.floor(hu.x), Math.floor(hu.y)) && sim.time > hu.until - 5) {
    if (hu.houses + hu.ships > 0) {
      sim.chronicle.add({ year: sim.year, kind: 'hurricane', a: { id: 0, name: hu.name, people: 'coast' }, u: hu.name, n: hu.houses, w: String(hu.ships), x: hu.x, y: hu.y });
      afterShock(sim, hu.x, hu.y, 30);
    }
    sim.hurricane = undefined;
    return;
  }
  const r = D.hurricaneRadius;
  const warned = (v: Village) => sim.villages.some((o) => !o.ruin && hasBuilding(o, 'lighthouse') && Math.hypot(o.x - v.x, o.y - v.y) < 40);
  for (const v of sim.villages) {
    if (v.ruin) continue;
    const harm = warned(v) ? 0.5 : 1;
    for (const h of [...v.houses]) {
      if (Math.hypot(h.x - hu.x, h.y - hu.y) > r || sim.rand() > D.unroof * harm) continue;
      hu.houses++;
      if (h.level === 0) loseHouse(sim, v, h);
      else {
        h.level = (h.level - 1) as House['level'];
        sim.puff(h.x + 0.5, h.y - 0.5, 4, ['#a0703c', '#8a8a8a']);
      }
    }
  }
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(hu.x) + dx;
      const y = Math.floor(hu.y) + dy;
      if (dx * dx + dy * dy > r * r || w.get(x, y) !== T.FOREST || sim.rand() > D.uproot) continue;
      w.set(x, y, T.GRASS);
      hu.trees++;
    }
  for (const ship of [...sim.ships]) {
    if (Math.hypot(ship.x - hu.x, ship.y - hu.y) > r || sim.rand() > D.sinkShip) continue;
    hu.ships++;
    sink(sim, ship);
  }
  for (const a of sim.near(hu.x, hu.y, r, (o) => o.kind === 'human')) sim.hurt(a, D.stormHurt, 'storm');
}

/* ---- heatwaves, warming, the sea --------------------------------------------------------------- */

export function heatwave(sim: Sim, years = 1 + Math.floor(sim.rand() * 3)) {
  if (sim.heat) {
    sim.heat.until += years * YEAR;
    return;
  }
  const name = `The Long Summer of Year ${sim.year}`;
  sim.heat = { until: sim.time + years * YEAR, name };
  sim.chronicle.add({ year: sim.year, kind: 'heatwave', a: { id: 0, name, people: 'coast' }, u: name, n: years, x: 0, y: 0 });
}

/** God power Rain: every fire around goes out, a heatwave ends sooner. */
export function rain(sim: Sim, x: number, y: number) {
  const w = sim.world;
  for (const i of [...sim.fires.keys()]) if (Math.hypot((i % w.w) - x, Math.floor(i / w.w) - y) <= D.rainRadius) sim.fires.delete(i);
  if (sim.heat) sim.heat.until = Math.max(sim.time, sim.heat.until - YEAR);
  sim.rains.push({ x, y, until: sim.time + 4 });
  sim.chronicle.add({ year: sim.year, kind: 'godRain', a: { id: 0, name: '', people: 'coast' }, v: nearestPlace(sim, x, y)?.name, x, y });
}

/** After a disaster: the survivors close by pray harder (some lose their faith); prophets come more often. */
function afterShock(sim: Sim, x: number, y: number, r: number) {
  sim.disasterYear = sim.year;
  for (const h of sim.near(x, y, r, (o) => o.kind === 'human') as Human[]) {
    if (h.faith === undefined) continue;
    if (sim.rand() < D.faithLost && !has(h, 'pious')) h.devotion = Math.max(0, (h.devotion ?? 0) - 40);
    else h.devotion = Math.min(100, (h.devotion ?? 0) + 15);
  }
}

/** Once a second (sim.ts). */
export function disasterSecond(sim: Sim) {
  fireSecond(sim);
  stormSecond(sim);
  volcanoSecond(sim);
  hurricaneSecond(sim);
}

/** Once a year: disasters by themselves, warming, the sea, the lava fields turning green, old scars. */
export function disasterYear(sim: Sim) {
  if (sim.year === sim.disasterTickYear) return;
  sim.disasterTickYear = sim.year;
  const w = sim.world;
  const f = often(sim);
  const warm = 1 + sim.temperature * 0.5;
  if (f > 0) {
    if (sim.rand() < D.stormChance * f * (sim.heat ? 2 : 1)) storm(sim);
    if (!sim.volcanoes.length && sim.rand() < D.volcanoChance * f) {
      const spot = volcanoSpot(sim);
      if (spot) wakeVolcano(sim, spot.x, spot.y);
    }
    if (!sim.hurricane && sim.rand() < D.hurricaneChance * f * warm) hurricane(sim);
    if (!sim.heat && sim.rand() < D.heatChance * f * warm) heatwave(sim);
  }
  // A heatwave: places without a granary lose part of their stores
  if (sim.heat) {
    if (sim.time > sim.heat.until) sim.heat = undefined;
    else for (const v of sim.villages) if (!v.ruin && !hasBuilding(v, 'granary')) v.food *= 1 - D.heatSpoil;
  }

  // Warming: factories and trains; forests, faiths of nature and a movement cool it down
  const factories = sim.villages.filter((v) => !v.ruin && hasBuilding(v, 'factory')).length;
  let dt = factories * D.factoryHeat + sim.trains.length * D.trainHeat;
  if (w.forestShare > 0.22) dt -= D.forestCool;
  dt -= [...sim.peopleFaith.values()].filter((id) => sim.religions.find((r) => r.id === id)?.doctrines.includes('nature')).length * D.natureCool;
  if (sim.movementUntil > sim.year) dt -= D.movementCool;
  sim.temperature = Math.max(0, sim.temperature + dt);
  sim.tempHistory.push([sim.year, Math.round(sim.temperature * 100) / 100]);
  if (sim.tempHistory.length > 240) sim.tempHistory.splice(0, sim.tempHistory.length - 240);
  // A philosopher starts a movement to protect the earth
  if (sim.temperature >= D.movementAt && sim.movementUntil <= sim.year && sim.rand() < 0.15) {
    const thinker = sim.humans.find((h) => h.role === 'philosopher' && !h.dead && stage(h, sim.time) === 'adult');
    if (thinker) {
      sim.movementUntil = sim.year + D.movementYears;
      sim.chronicle.add({ year: sim.year, kind: 'movement', a: refOf(thinker), x: thinker.x, y: thinker.y });
    }
  }
  // The snow on the peaks melts when it is warm
  const melted = sim.temperature >= D.meltAt;
  if (melted !== w.melted) {
    w.melted = melted;
    w.all = true;
  }
  // The sea rises (only with Normal or Chaos)
  if (sim.rules.disasters >= 2 && sim.temperature >= D.seaAt) seaRises(sim, Math.floor((sim.temperature - D.seaAt + 0.5) * D.seaTiles));

  // Lava fields turn into rich green land
  for (const [i, year] of [...sim.lavaRock]) {
    if (sim.year < year) continue;
    sim.lavaRock.delete(i);
    if (w.tiles[i] !== T.MOUNTAIN) continue;
    w.set(i % w.w, Math.floor(i / w.w), T.GRASS);
    w.fertile[i] = 1;
  }
  for (const [i, until] of [...sim.scorched]) if (until <= sim.year) sim.scorched.delete(i);
}

/** The sea takes some tiles of the shore: sand first, then grass; whatever stood there is lost. */
function seaRises(sim: Sim, n: number) {
  if (n <= 0) return;
  const w = sim.world;
  const shore: number[] = [];
  for (let i = 0; i < w.w * w.h; i++) {
    const t = w.tiles[i];
    if (t !== T.SAND && t !== T.GRASS) continue;
    const x = i % w.w;
    const y = Math.floor(i / w.w);
    if (w.touches(x, y, T.SHALLOW) || w.touches(x, y, T.DEEP)) shore.push(i);
  }
  shore.sort((a, b) => Number(w.tiles[b] === T.SAND) - Number(w.tiles[a] === T.SAND) || sim.rand() - 0.5);
  let near: Village | undefined;
  for (const i of shore.slice(0, n)) {
    const x = i % w.w;
    const y = Math.floor(i / w.w);
    w.set(x, y, T.SHALLOW);
    for (const v of sim.villages) {
      if (v.ruin) continue;
      const h = v.houses.find((o) => o.x === x && o.y === y);
      if (h) loseHouse(sim, v, h);
      if (v.buildings.some((b) => b.x === x && b.y === y)) v.buildings = v.buildings.filter((b) => b.x !== x || b.y !== y);
      if (Math.hypot(v.x - x, v.y - y) < 10) near = v;
    }
  }
  if (near && sim.year - sim.seaYear >= 10) {
    sim.seaYear = sim.year;
    sim.chronicle.add({ year: sim.year, kind: 'seaRises', a: { id: 0, name: near.name, people: near.people }, v: near.name, x: near.x, y: near.y });
  }
}
