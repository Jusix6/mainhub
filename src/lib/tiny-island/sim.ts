/**
 * The simulation: clock plus everything alive. Runs in fixed ticks (10 per
 * second of game time), independent of the screen: at 3× or 10× it simply
 * runs more ticks per frame. One day lasts 10 seconds, one year 30 seconds
 * (at 1×). Each tick: needs drop, people and animals act (ai.ts, animals.ts),
 * nature grows back, the dead are cleared away. Social life (couples,
 * children, grief) lives in social.ts, the chronicle in chronicle.ts.
 */
import {
  ageOf,
  makeAnimal,
  makeHuman,
  pickTraits,
  PEOPLES,
  PERKS,
  resetIds,
  YEAR,
  type Agent,
  type AnimalKind,
  type Grave,
  type Human,
  type Animal,
  type People,
  type Puff,
  type Slash,
  type Trait,
} from './agents';
import { Chronicle, type Ref } from './chronicle';
import { onDeath, story } from './social';
import { settle, villageThink, type Village } from './villages';
import { ARMOR, countLoss, warTick, type Army, type War } from './war';
import { record, type Snapshot } from './stats';
import { actAnimal, thinkAnimal } from './animals';
import { actHuman, thinkHuman } from './ai';
import { researchTick, type Tech } from './inventions';
import { kingdomTick, type Kingdom } from './kingdoms';
import { countKill, cultureTick, onHeroDeath, type Legend, type Work } from './culture';
import { pickName } from './names';
import { randFor, type Rand } from './rng';
import { H, T, W, type World } from './world';

export const TICKS_PER_SECOND = 10;
export const DAY_SECONDS = 10;
export const YEAR_SECONDS = YEAR;
export const SPEEDS = [0, 1, 3, 10] as const;
export type Speed = (typeof SPEEDS)[number];

const DT = 1 / TICKS_PER_SECOND;
/** Never run more than this many ticks in one frame (e.g. after a hidden tab). */
const MAX_TICKS_PER_FRAME = 60;
const CELL = 8;
const COLS = Math.ceil(W / CELL);
const ROWS = Math.ceil(H / CELL);

/** Upper limits so the island never fills up with animals. */
export const CAPS: Record<AnimalKind, number> = { sheep: 50, chicken: 40, wolf: 8 };
/** Gravestones stay this long (2 years). */
const GRAVE_TIME = 2 * YEAR;

export class Sim {
  /** Game time in seconds since the island was made. Starts in the morning. */
  time = DAY_SECONDS * 0.15;
  speed: Speed = 1;
  private carry = 0;
  rand: Rand;
  humans: Human[] = [];
  animals: Animal[] = [];
  graves: Grave[] = [];
  puffs: Puff[] = [];
  private byIdMap = new Map<number, Agent>();
  readonly chronicle = new Chronicle();
  villages: Village[] = [];
  nextVillageId = 1;
  /** Mood between peoples (key "a|b") and running wars. */
  readonly mood = new Map<string, number>();
  readonly wars = new Map<string, War>();
  /** Armies on the move, alliances and peace treaties (key → end time), moods between villages of one people (war.ts). */
  armies: Army[] = [];
  nextArmyId = 1;
  readonly alliances = new Set<string>();
  readonly treaties = new Map<string, number>();
  readonly vmood = new Map<string, number>();
  /** Works of art and legends (culture.ts). */
  works: Work[] = [];
  nextWorkId = 1;
  legends: Legend[] = [];
  /** Kingdom of each people that has one (kingdoms.ts). */
  readonly kingdoms = new Map<People, Kingdom>();
  /** What each people has invented so far (inventions.ts). */
  readonly tech = new Map<People, Tech>();
  /** Player rules (Rules tab), each a factor around 1. */
  readonly rules = { aggression: 1, birth: 1, lifespan: 1, food: 1 };
  slashes: Slash[] = [];
  /** Population per people, one snapshot per game year (stats.ts). */
  history: Snapshot[] = [];
  historyYear = 0;
  /** Footprints in the sand, they fade after a few seconds. */
  footprints: { x: number; y: number; t: number }[] = [];
  private villageClock = 0;
  /** Ids the player starred; kept after death so old chronicle entries stay marked. */
  readonly favorites = new Set<number>();
  /** Everyone who ever lived here, so profiles can name the dead too. */
  readonly registry = new Map<number, Ref & { alive: boolean; female: boolean }>();
  private grid: Agent[][] = Array.from({ length: COLS * ROWS }, () => []);

  constructor(readonly world: World) {
    this.rand = randFor(world.seed, 'sim');
  }

  reset() {
    this.time = DAY_SECONDS * 0.15;
    this.carry = 0;
    this.rand = randFor(this.world.seed, 'sim');
    this.humans = [];
    this.animals = [];
    this.graves = [];
    this.puffs = [];
    this.byIdMap.clear();
    this.registry.clear();
    this.villages = [];
    this.nextVillageId = 1;
    this.mood.clear();
    this.wars.clear();
    this.tech.clear();
    this.armies = [];
    this.nextArmyId = 1;
    this.alliances.clear();
    this.treaties.clear();
    this.vmood.clear();
    this.kingdoms.clear();
    this.works = [];
    this.nextWorkId = 1;
    this.legends = [];
    this.slashes = [];
    this.footprints = [];
    this.history = [];
    this.historyYear = 0;
    this.villageClock = 0;
    this.favorites.clear();
    this.chronicle.clear();
    resetIds();
  }

  /* ---- clock ------------------------------------------------------------------ */

  /** Advances by `dt` real seconds; returns how many ticks ran. */
  advance(dt: number): number {
    if (this.speed === 0) return 0;
    this.carry += Math.min(dt, 0.25) * this.speed * TICKS_PER_SECOND;
    let n = 0;
    while (this.carry >= 1 && n < MAX_TICKS_PER_FRAME) {
      this.tick();
      this.carry -= 1;
      n++;
    }
    if (n === MAX_TICKS_PER_FRAME) this.carry = 0;
    return n;
  }

  private tick() {
    this.time += DT;
    this.world.growTrees(this.rand);
    this.world.growNature(this.rand, DT, this.rules.food);
    this.buildGrid();
    if (this.year !== this.historyYear) {
      this.historyYear = this.year;
      const counts = { coast: 0, forest: 0, mountain: 0, steppe: 0 };
      for (const h of this.humans) counts[h.people]++;
      record(this.history, { year: this.year, counts });
    }
    this.villageClock += DT;
    if (this.villageClock >= 1) {
      this.villageClock -= 1;
      for (const v of this.villages) villageThink(v, this);
      warTick(this);
      kingdomTick(this);
      researchTick(this);
      cultureTick(this);
      if (Math.round(this.time) % 2 === 0) settle(this);
    }

    for (const h of this.humans) {
      if (h.dead) continue;
      this.needs(h);
      if (this.time >= h.thinkAt) {
        h.thinkAt = this.time + 0.5;
        thinkHuman(h, this);
      }
      actHuman(h, this, DT);
    }
    for (const a of this.animals) {
      if (a.dead) continue;
      if (this.time >= a.thinkAt) {
        a.thinkAt = this.time + 0.6 + this.rand() * 0.2;
        thinkAnimal(a, this);
      }
      actAnimal(a, this, DT);
    }

    this.humans = this.humans.filter((h) => !h.dead);
    this.animals = this.animals.filter((a) => !a.dead);
    if (this.graves.length) this.graves = this.graves.filter((g) => g.until > this.time);
    if (this.puffs.length) this.puffs = this.puffs.filter((p) => this.time - p.born < p.life);
    if (this.slashes.length) this.slashes = this.slashes.filter((s) => this.time - s.born < 0.25);
    // Feet leave marks in the sand
    for (const h of this.humans) {
      if (h.moving && this.rand() < 0.12 && this.world.get(Math.floor(h.x), Math.floor(h.y)) === T.SAND) {
        this.footprints.push({ x: h.x, y: h.y + 0.3, t: this.time });
      }
    }
    if (this.footprints.length) {
      if (this.footprints.length > 400) this.footprints.splice(0, this.footprints.length - 400);
      if (this.time - this.footprints[0].t > 8) this.footprints = this.footprints.filter((f) => this.time - f.t < 8);
    }
  }

  /** Needs drop over time; an empty stomach hurts, a full one heals. Small children get fed. */
  private needs(h: Human) {
    const age = ageOf(h, this.time);
    h.hunger = Math.max(0, h.hunger - (age < 6 ? 1.6 : 2.4) * DT);
    if (age < 6 && h.hunger < 60) {
      const parent = this.nearest(h.x, h.y, 4, (o) => o.kind === 'human' && h.parents.includes(o.id) && (o as Human).food > 0) as Human | null;
      if (parent) {
        parent.food--;
        h.hunger = Math.min(100, h.hunger + 34);
      }
    }
    // Belonging to a place with a temple, people feel less lonely
    const temple = h.village !== undefined && this.villages.some((v) => v.id === h.village && v.buildings?.some((b) => b.kind === 'temple'));
    h.social = Math.max(0, h.social - (temple ? 0.8 : 1.2) * DT);
    if (!h.asleep) h.energy = Math.max(0, h.energy - 3.6 * DT);
    if (h.hunger <= 0) this.hurt(h, 3 * DT, 'hunger');
    else if (h.hunger > 30 && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + 1.5 * DT);
    if (ageOf(h, this.time) > h.lifespan * this.rules.lifespan) this.kill(h, 'age');
  }

  get year() {
    return Math.floor(this.time / YEAR_SECONDS) + 1;
  }

  /** 0 … 1 through the day, starting in the morning. */
  get dayPhase() {
    return (this.time % DAY_SECONDS) / DAY_SECONDS;
  }

  /**
   * How dark it is, 0 (bright day) to 1 (deep night). Day for the first 55 %,
   * then dusk, night and dawn.
   */
  get darkness() {
    const p = this.dayPhase;
    const ramp = (a: number, b: number, v: number) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    if (p < 0.55) return 0;
    if (p < 0.68) return ramp(0.55, 0.68, p);
    if (p < 0.88) return 1;
    return 1 - ramp(0.88, 1, p);
  }

  get isNight() {
    return this.darkness > 0.5;
  }

  /* ---- who is where ------------------------------------------------------------- */

  private buildGrid() {
    for (const cell of this.grid) cell.length = 0;
    const add = (a: Agent) => {
      const cx = Math.min(COLS - 1, Math.max(0, Math.floor(a.x / CELL)));
      const cy = Math.min(ROWS - 1, Math.max(0, Math.floor(a.y / CELL)));
      this.grid[cy * COLS + cx].push(a);
    };
    for (const h of this.humans) if (!h.dead) add(h);
    for (const a of this.animals) if (!a.dead) add(a);
  }

  /** Living agents within `r` tiles of (x, y). */
  near(x: number, y: number, r: number, test?: (a: Agent) => boolean): Agent[] {
    const out: Agent[] = [];
    const c0 = Math.max(0, Math.floor((x - r) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL));
    const r1 = Math.min(ROWS - 1, Math.floor((y + r) / CELL));
    const r2 = r * r;
    for (let cy = r0; cy <= r1; cy++)
      for (let cx = c0; cx <= c1; cx++)
        for (const a of this.grid[cy * COLS + cx]) {
          if (a.dead) continue;
          const dx = a.x - x;
          const dy = a.y - y;
          if (dx * dx + dy * dy <= r2 && (!test || test(a))) out.push(a);
        }
    return out;
  }

  /** The closest living agent within `r` that passes `test`. */
  nearest(x: number, y: number, r: number, test: (a: Agent) => boolean): Agent | null {
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const a of this.near(x, y, r, test)) {
      const d = (a.x - x) ** 2 + (a.y - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    return best;
  }

  /** Makes an agent findable by id (used when loading a saved island). */
  index(a: Agent) {
    this.byIdMap.set(a.id, a);
  }

  byId(id: number | undefined): Agent | undefined {
    if (id === undefined) return undefined;
    const a = this.byIdMap.get(id);
    return a && !a.dead ? a : undefined;
  }

  count(kind: Agent['kind']) {
    return kind === 'human' ? this.humans.length : this.animals.reduce((n, a) => n + (a.kind === kind ? 1 : 0), 0);
  }

  /** The last few of a kind are left alone, so no animal dies out by hunting. */
  huntable(kind: AnimalKind) {
    if (this.countTime !== this.time) {
      this.countTime = this.time;
      this.counts = { sheep: this.count('sheep'), chicken: this.count('chicken'), wolf: this.count('wolf') };
    }
    return this.counts[kind] > 3;
  }
  private counts: Record<AnimalKind, number> = { sheep: 0, chicken: 0, wolf: 0 };
  private countTime = -1;

  /* ---- life and death -------------------------------------------------------------- */

  addHuman(
    x: number,
    y: number,
    people: People,
    female: boolean,
    ageYears = 18 + this.rand() * 14,
    opts: { parents?: Human[]; traits?: Trait[] } = {},
  ): Human {
    const h = makeHuman(x, y, people, female, pickName(this.rand, female), this.time, ageYears, this.rand, opts.traits ?? pickTraits(this.rand));
    h.maxHp = h.hp = PERKS[people].hp;
    this.humans.push(h);
    this.byIdMap.set(h.id, h);
    this.registry.set(h.id, { id: h.id, name: h.name, people: h.people, female: h.female, alive: true });
    if (opts.parents?.length) {
      h.parents = opts.parents.map((p) => p.id);
      for (const p of opts.parents) p.children.push(h.id);
      h.home = opts.parents[0].home;
      h.village = opts.parents[0].village;
      story(h, this, 'born', opts.parents.map((p) => p.name).join(' & '));
    } else {
      story(h, this, 'arrive');
    }
    return h;
  }

  addAnimal(kind: AnimalKind, x: number, y: number, ageYears = 1 + this.rand() * 3): Animal {
    const a = makeAnimal(kind, x, y, this.time, ageYears, this.rand);
    this.animals.push(a);
    this.byIdMap.set(a.id, a);
    return a;
  }

  /** Damage without a fight (hunger). */
  hurt(a: Agent, amount: number, cause: string) {
    a.hp -= amount;
    if (a.hp <= 0) this.kill(a, cause);
  }

  /**
   * One strike: damage, a puff of dust and stars, maybe a death. `gentle`
   * strikes (fist fights between people) never go below 35 hit points.
   */
  hit(attacker: Agent, target: Agent, damage: number, gentle = false): boolean {
    // Armour takes the edge off real blows
    if (!gentle && target.kind === 'human' && target.armor) damage *= ARMOR;
    target.hp = gentle ? Math.max(35, target.hp - damage) : target.hp - damage;
    target.attacker = attacker.id;
    target.attackedAt = this.time;
    this.puff(target.x, target.y - 0.3, 4, ['#ffffff', '#ffe066', '#f1e2c4']);
    if (target.hp <= 0) {
      this.kill(target, attacker.kind);
      return true;
    }
    return false;
  }

  kill(a: Agent, cause: string) {
    if (a.dead) return;
    a.dead = true;
    this.byIdMap.delete(a.id);
    // Warriors count the foes they beat, hunters the wolves (for legends)
    const killer = a.attacker !== undefined ? this.byIdMap.get(a.attacker) : undefined;
    if (cause === 'human' && killer?.kind === 'human') countKill(killer as Human, a);
    if (a.kind === 'human') {
      onHeroDeath(this, a);
      this.graves.push({ x: a.x, y: a.y, until: this.time + GRAVE_TIME });
      const r = this.registry.get(a.id);
      if (r) r.alive = false;
      if (cause === 'human') countLoss(this, a);
      onDeath(a, this, cause);
    }
    this.puff(a.x, a.y - 0.2, 6, ['#ffffff', '#e8e8e8', '#ffe066']);
  }

  puff(x: number, y: number, n: number, colors: string[]) {
    for (let i = 0; i < n; i++) {
      const ang = this.rand() * Math.PI * 2;
      const sp = 0.6 + this.rand() * 0.9;
      this.puffs.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.6,
        born: this.time,
        life: 0.5 + this.rand() * 0.3,
        color: colors[i % colors.length],
      });
    }
  }

  /* ---- start of a new island ---------------------------------------------------------- */

  /**
   * Two peoples with two men and two women each, far apart on grass, plus a
   * few sheep, chickens and wolves. Seeded, so the same seed starts the same.
   */
  populate() {
    const rand = randFor(this.world.seed, 'life');
    const w = this.world;
    const spots = (t: number, n: number) => {
      const out: { x: number; y: number }[] = [];
      for (let k = 0; k < 4000 && out.length < n; k++) {
        const x = Math.floor(rand() * W);
        const y = Math.floor(rand() * H);
        if (w.get(x, y) === t) out.push({ x, y });
      }
      return out;
    };
    const grass = spots(T.GRASS, 400);
    if (grass.length < 2) return;

    // Two camps as far apart as the grass allows
    const a = grass[0];
    let b = grass[1];
    for (const g of grass) if (Math.hypot(g.x - a.x, g.y - a.y) > Math.hypot(b.x - a.x, b.y - a.y)) b = g;
    const order = [...PEOPLES].sort(() => rand() - 0.5);
    [a, b].forEach((camp, i) => {
      const people = order[i];
      for (let k = 0; k < 4; k++) {
        const spot = this.freeNear(camp.x, camp.y, 3, rand);
        if (spot) this.addHuman(spot.x, spot.y, people, k % 2 === 1, 18 + rand() * 12);
      }
    });

    const place = (kind: AnimalKind, list: { x: number; y: number }[], n: number) => {
      for (let k = 0; k < n && list.length; k++) {
        const s = list[Math.floor(rand() * list.length)];
        this.addAnimal(kind, s.x, s.y, 1 + rand() * 3);
      }
    };
    place('sheep', grass, 10);
    place('chicken', grass, 8);
    const forest = spots(T.FOREST, 60);
    place('wolf', forest.length ? forest : grass, 3);
  }

  /** A land tile near (x, y) for placing someone. */
  freeNear(x: number, y: number, r: number, rand: Rand) {
    for (let k = 0; k < 30; k++) {
      const nx = x + Math.round((rand() * 2 - 1) * r);
      const ny = y + Math.round((rand() * 2 - 1) * r);
      if (this.world.isLand(this.world.get(nx, ny)) && Number.isFinite(this.world.cost(nx, ny))) return { x: nx, y: ny };
    }
    return null;
  }

  /** Placed by the player: true if the spot works for this kind. */
  place(kind: 'human' | AnimalKind, x: number, y: number, people: People): boolean {
    const w = this.world;
    if (!w.isLand(w.get(x, y)) || !Number.isFinite(w.cost(x, y))) return false;
    if (kind === 'human') this.addHuman(x, y, people, this.rand() < 0.5);
    else this.addAnimal(kind, x, y);
    return true;
  }
}

