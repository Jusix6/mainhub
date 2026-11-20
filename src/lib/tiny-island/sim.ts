/**
 * The simulation: clock plus everything alive. Runs in fixed ticks (10 per
 * second of game time), independent of the screen: at 3× or 10× it simply
 * runs more ticks per frame. One day lasts 10 seconds, one year 30 seconds
 * (at 1×). Each tick: needs drop, people and animals act (ai.ts, animals.ts),
 * nature grows back, the dead are cleared away. Social life (couples,
 * children, grief) lives in social.ts, the chronicle in chronicle.ts.
 */
import { plotTick, type Plot } from './plots';
import { leagueTick, type League } from './leagues';
import { dramaTick, onKilled, type BloodFeud } from './drama';
import {
  ageOf,
  has,
  hasPower,
  makeAnimal,
  makeHuman,
  pickTraits,
  PLAYABLE,
  PERKS,
  resetIds,
  rollStats,
  stat,
  YEAR,
  type Agent,
  type AnimalKind,
  type Grave,
  type Human,
  type Animal,
  type People,
  type Puff,
  type Shot, type Slash,
  type Trait,
} from './agents';
import { Chronicle, type Ref, type Moment } from './chronicle';
import { onDeath, story } from './social';
import { settle, strays, villageThink, type Village } from './villages';
import { ARMOR, countLoss, warTick, type Army, type War } from './war';
import { record, type Snapshot } from './stats';
import { actAnimal, thinkAnimal } from './animals';
import { SHOT_TIME, stables } from './armies';
import { discoveries, moveShips, shipTick, type Ship, type Wreck } from './ships';
import { colonyTick } from './colonies';
import { lifeBonus, WONDER_SIZE, wonderTick, wonderWork, type Wonder } from './wonders';
import { actHuman, thinkHuman } from './ai';
import { researchTick, type Tech, knows } from './inventions';
import { kingdomTick, type Kingdom } from './kingdoms';
import { claimLand, ownerPeople, territoryTick, type Claim } from './territory';
import { comfortOf } from './town';
import { penTick } from './pens';
import { onProphetDeath, religionTick, type Religion } from './religion';
import { moodTick, onFoolDeath, societyTick, type Book } from './society';
import { disasterSecond, disasterYear, moveDisasters, type FireEvent, type Hurricane, type Volcano } from './disasters';
import { moveTrains, roadTick, roadWork, type Highway, type Train } from './roads';
import { countKill, cultureTick, onHeroDeath, type Legend, type Work } from './culture';
import { BALANCE } from './balance';
import { hungerTick } from './hunger';
import { storyTick } from './storyteller';
import { pickName, familyName } from './names';
import { randFor, type Rand } from './rng';
import { T, type World } from './world';

export const TICKS_PER_SECOND = 10;
export const DAY_SECONDS = 10;
export const YEAR_SECONDS = YEAR;
export const SPEEDS = [0, 1, 3, 10] as const;
export type Speed = (typeof SPEEDS)[number];

const DT = 1 / TICKS_PER_SECOND;
/** Never run more than this many ticks in one frame (e.g. after a hidden tab). */
const MAX_TICKS_PER_FRAME = 60;
const CELL = 8;

/** Upper limits so the island never fills up with animals. */
export const CAPS: Record<AnimalKind, number> = { sheep: 50, chicken: 40, wolf: 8, horse: 20, cow: 24 };
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
  /** Phase F: the people that lost the last war between two peoples (key "a|b"), for wars of revenge. */
  readonly grudges = new Map<string, People>();
  readonly vmood = new Map<string, number>();
  /** Deaths by cause, all of them and those of the last 50 years (Update 2). */
  deaths: { total: Record<string, number>; recent: [number, string][] } = { total: {}, recent: [] };
  /** Small moments for the cinema narrator (births …), newest last, at most 30, not saved. */
  moments: Moment[] = [];
  /** The storyteller waits at least until this year before the next push. */
  quietSince = 1;
  /** Leagues, places about to grow together and plots under way (phase D). */
  leagues: League[] = [];
  nextLeagueId = 1;
  leagueYear = 0;
  readonly fusionWatch = new Map<string, number>();
  plots: Plot[] = [];
  nextPlotId = 1;
  plotYear = 0;
  /** Blood feuds between families (drama.ts), and the year memories last faded. */
  readonly bloodFeuds = new Map<string, BloodFeud>();
  dramaYear = 0;
  /** Works of art and legends (culture.ts). */
  works: Work[] = [];
  nextWorkId = 1;
  legends: Legend[] = [];
  /** Kingdom of each people that has one (kingdoms.ts). */
  readonly kingdoms = new Map<People, Kingdom>();
  /** What each people has invented so far (inventions.ts). */
  readonly tech = new Map<People, Tech>();
  /** Player rules (Rules tab), each a factor around 1. */
  readonly rules = { aggression: 1, birth: 1, lifespan: 1, food: 1, disasters: 2 };
  slashes: Slash[] = [];
  /** Arrows, bolts, stones and balls in the air (phase F), and the year the stables were last counted. */
  shots: Shot[] = [];
  stableYear = 0;
  /** Phase G: ships at sea, wrecks, and the years voyages and colonies were last looked at. */
  ships: Ship[] = [];
  nextShipId = 1;
  wrecks: Wreck[] = [];
  shipYear = 0;
  colonyYear = 0;
  /** Update 3, phase B: claims on land and land grabs (territory.ts); the version goes up when they change. */
  claims: Claim[] = [];
  nextClaimId = 1;
  claimsVersion = 0;
  territoryYear = 0;
  /** Update 3, phase C: highways and railways (built and under construction), the trains on them. */
  highways: Highway[] = [];
  railways: Highway[] = [];
  trains: Train[] = [];
  roadYear = 0;
  penYear = 0;
  /** Update 3, phase D: religions, the faith of most of each people (yearly), the year of the last prophet. */
  religions: Religion[] = [];
  nextReligionId = 1;
  readonly peopleFaith = new Map<People, number>();
  religionYear = 0;
  prophetYear = 0;
  /** Update 3, phase E: books of the philosophers, peoples made tolerant by a book (until year), the yearly clock. */
  books: Book[] = [];
  nextBookId = 1;
  readonly tolerance = new Map<People, number>();
  societyYear = 0;
  /** Update 3, phase F: what is burning (tile → seconds left), storms, volcanoes, the hurricane, the heat, the warming. */
  fires = new Map<number, number>();
  fireEvent?: FireEvent;
  storm?: { x: number; y: number; until: number };
  volcanoes: Volcano[] = [];
  hurricane?: Hurricane;
  heat?: { until: number; name: string };
  temperature = 0;
  tempHistory: [number, number][] = [];
  movementUntil = 0;
  /** Lava (tile → game time it cools), cooled lava (tile → year it is soil), burn scars (tile → year), bolts and rain to draw. */
  lava = new Map<number, number>();
  lavaRock = new Map<number, number>();
  scorched = new Map<number, number>();
  bolts: { x: number; y: number; t: number }[] = [];
  rains: { x: number; y: number; until: number }[] = [];
  disasterYear = -99;
  disasterTickYear = 0;
  seaYear = 0;
  /** World wonders (phase H). */
  wonders: Wonder[] = [];
  nextWonderId = 1;
  wonderYear = 0;
  /** People per land mass, counted once a second (births slow down as an island fills up). */
  landPop = new Map<number, number>();
  /** Population per people, one snapshot per game year (stats.ts). */
  history: Snapshot[] = [];
  historyYear = 0;
  /** Footprints in the sand, they fade after a few seconds. */
  footprints: { x: number; y: number; t: number }[] = [];
  private villageClock = 0;
  /** Ids the player starred; kept after death so old chronicle entries stay marked. */
  readonly favorites = new Set<number>();
  /** Everyone who ever lived here, so profiles can name the dead too. */
  readonly registry = new Map<number, Ref & { alive: boolean; female: boolean; custom?: boolean }>();
  private grid: Agent[][] = [];
  private cols = 0;
  private rows = 0;

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
    this.grudges.clear();
    this.vmood.clear();
    this.kingdoms.clear();
    this.works = [];
    this.bloodFeuds.clear();
    this.dramaYear = 0;
    this.leagues = [];
    this.nextLeagueId = 1;
    this.leagueYear = 0;
    this.fusionWatch.clear();
    this.plots = [];
    this.nextPlotId = 1;
    this.plotYear = 0;
    this.deaths = { total: {}, recent: [] };
    this.moments = [];
    this.quietSince = 1;
    this.nextWorkId = 1;
    this.legends = [];
    this.slashes = [];
    this.shots = [];
    this.stableYear = 0;
    this.ships = [];
    this.nextShipId = 1;
    this.wrecks = [];
    this.shipYear = 0;
    this.colonyYear = 0;
    this.wonders = [];
    this.nextWonderId = 1;
    this.wonderYear = 0;
    this.claims = [];
    this.nextClaimId = 1;
    this.claimsVersion++;
    this.territoryYear = 0;
    this.highways = [];
    this.railways = [];
    this.trains = [];
    this.roadYear = 0;
    this.penYear = 0;
    this.religions = [];
    this.nextReligionId = 1;
    this.peopleFaith.clear();
    this.religionYear = 0;
    this.prophetYear = 0;
    this.books = [];
    this.nextBookId = 1;
    this.tolerance.clear();
    this.societyYear = 0;
    this.fires.clear();
    this.fireEvent = undefined;
    this.storm = undefined;
    this.volcanoes = [];
    this.hurricane = undefined;
    this.heat = undefined;
    this.temperature = 0;
    this.tempHistory = [];
    this.movementUntil = 0;
    this.lava.clear();
    this.lavaRock.clear();
    this.scorched.clear();
    this.bolts = [];
    this.rains = [];
    this.disasterYear = -99;
    this.disasterTickYear = 0;
    this.seaYear = 0;
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
    // A heatwave halves what grows (Update 3)
    this.world.growNature(this.rand, DT, this.rules.food * (this.heat ? 0.5 : 1), this.year);
    this.buildGrid();
    if (this.year !== this.historyYear) {
      this.historyYear = this.year;
      const counts = { coast: 0, forest: 0, mountain: 0, steppe: 0, islanders: 0 };
      for (const h of this.humans) counts[h.people]++;
      record(this.history, { year: this.year, counts });
    }
    this.villageClock += DT;
    if (this.villageClock >= 1) {
      this.villageClock -= 1;
      for (const v of this.villages) villageThink(v, this);
      this.markNoTree();
      claimLand(this);
      territoryTick(this);
      roadTick(this);
      roadWork(this);
      penTick(this);
      religionTick(this);
      moodTick(this);
      societyTick(this);
      disasterSecond(this);
      disasterYear(this);
      hungerTick(this);
      storyTick(this);
      dramaTick(this);
      leagueTick(this);
      plotTick(this);
      warTick(this);
      stables(this);
      shipTick(this);
      colonyTick(this);
      wonderTick(this);
      wonderWork(this);
      this.lookAround();
      kingdomTick(this);
      researchTick(this);
      cultureTick(this);
      if (Math.round(this.time) % 2 === 0) {
        strays(this);
        settle(this);
      }
    }

    moveShips(this, DT);
    moveTrains(this, DT);
    moveDisasters(this, DT);
    if (this.bolts.length && this.time - this.bolts[0].t > 1) this.bolts.shift();
    if (this.rains.length && this.time > this.rains[0].until) this.rains.shift();
    for (const h of this.humans) {
      if (h.dead) continue;
      // On a ship (phase G): riding along, fed from the ship's stores
      if (h.aboard !== undefined) {
        h.hunger = Math.max(h.hunger, 70);
        h.energy = Math.max(h.energy, 50);
        continue;
      }
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
    if (this.shots.length) this.shots = this.shots.filter((s) => this.time - s.born < SHOT_TIME);
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
    // Belonging to a place with a temple (Update 3: a totem, a tavern, a park …), people feel less lonely
    const comfort = h.village !== undefined ? comfortOf(this.villages.find((v) => v.id === h.village)) : 0;
    h.social = Math.max(0, h.social - 1.2 * (1 - comfort) * DT);
    // No nights since Update 3: tiredness comes slowly, a short nap fixes it
    if (!h.asleep) h.energy = Math.max(0, h.energy - BALANCE.sleep.drain * DT);
    if (h.hunger <= 0 && !hasPower(h, 'immortal') && !hasPower(h, 'invincible')) this.hurt(h, 3 * DT, 'hunger');
    else if (h.hunger > 30 && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + 1.5 * DT);
    if (ageOf(h, this.time) > h.lifespan * this.rules.lifespan * lifeBonus(this, h.people)) this.kill(h, 'age');
  }

  get year() {
    return Math.floor(this.time / YEAR_SECONDS) + 1;
  }

  /* ---- who is where ------------------------------------------------------------- */

  private buildGrid() {
    const cols = Math.ceil(this.world.w / CELL);
    const rows = Math.ceil(this.world.h / CELL);
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.grid = Array.from({ length: cols * rows }, () => []);
    }
    for (const cell of this.grid) cell.length = 0;
    const add = (a: Agent) => {
      const cx = Math.min(cols - 1, Math.max(0, Math.floor(a.x / CELL)));
      const cy = Math.min(rows - 1, Math.max(0, Math.floor(a.y / CELL)));
      this.grid[cy * cols + cx].push(a);
    };
    // Those on a ship (phase G) are not on the map
    for (const h of this.humans) if (!h.dead && h.aboard === undefined) add(h);
    for (const a of this.animals) if (!a.dead) add(a);
  }

  /** Living agents within `r` tiles of (x, y). */
  near(x: number, y: number, r: number, test?: (a: Agent) => boolean): Agent[] {
    const out: Agent[] = [];
    const COLS = this.cols;
    const c0 = Math.max(0, Math.floor((x - r) / CELL));
    const c1 = Math.min(COLS - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL));
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
      this.counts = { sheep: this.count('sheep'), chicken: this.count('chicken'), wolf: this.count('wolf'), horse: this.count('horse'), cow: this.count('cow') };
    }
    return this.counts[kind] > 3;
  }
  private counts: Record<AnimalKind, number> = { sheep: 0, chicken: 0, wolf: 0, horse: 0, cow: 0 };
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
    if (opts.parents?.length) h.stats = rollStats(this.rand, h.traits, opts.parents);
    // Family name from the father (else the mother), or a new family; royal blood is handed down
    const father = opts.parents?.find((p) => !p.female) ?? opts.parents?.[0];
    h.surname = father?.surname ?? familyName(this.rand, people);
    const royal = [...new Set(opts.parents?.flatMap((p) => p.royal ?? []) ?? [])];
    if (royal.length) h.royal = royal;
    this.applyHealth(h);
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

  /**
   * Health and strength in hit points and lifespan: health 5 is as before,
   * every point more gives 4 % more hit points and 2 more years; giant
   * strength makes a body half again as tough.
   */
  applyHealth(h: Human) {
    const share = h.maxHp ? h.hp / h.maxHp : 1;
    h.maxHp = PERKS[h.people].hp * (0.8 + stat(h, 'health') * 0.04) * (hasPower(h, 'giantStrength') ? 1.5 : 1);
    h.hp = h.maxHp * share;
    if (!h.healthDone) {
      h.lifespan += (stat(h, 'health') - 5) * 2;
      h.healthDone = true;
    }
  }

  /** God gift: a bolt from the sky, nobody survives it (not even the invincible). */
  smite(h: Human) {
    for (let i = 0; i < 4; i++) this.puff(h.x, h.y - 0.4 - i * 0.6, 4, ['#ffffff', '#fff3a0', '#9fd3ff']);
    this.kill(h, 'smite');
  }

  /** Powers and luck: does this one live through what would kill them? */
  private survives(h: Human, cause: string): boolean {
    if (cause === 'smite') return false;
    if (hasPower(h, 'invincible')) return true;
    if (hasPower(h, 'immortal') && (cause === 'age' || cause === 'hunger')) return true;
    if (cause === 'human' || cause === 'wolf') {
      const luck = hasPower(h, 'lucky') ? 0.5 : has(h, 'lucky') ? 0.15 : 0;
      if (luck && this.rand() < luck) {
        this.puff(h.x, h.y - 0.6, 6, ['#3ddc84', '#ffffff']);
        return true;
      }
    }
    return false;
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
  hit(attacker: Agent, target: Agent, damage: number, gentle = false, pierce = false): boolean {
    // Armour takes the edge off real blows (crossbow bolts go through it)
    if (!gentle && !pierce && target.kind === 'human' && target.armor) damage *= knows(this, target.people, 'chainmail') ? 0.55 : ARMOR;
    target.hp = gentle ? Math.max(35, target.hp - damage) : target.hp - damage;
    target.attacker = attacker.id;
    target.attackedAt = this.time;
    this.puff(target.x, target.y - 0.3, 4, ['#ffffff', '#ffe066', '#f1e2c4']);
    if (target.hp <= 0) {
      this.kill(target, attacker.kind);
      return target.dead;
    }
    return false;
  }

  kill(a: Agent, cause: string) {
    if (a.dead) return;
    if (a.kind === 'human' && this.survives(a, cause)) {
      a.hp = Math.max(1, a.hp);
      return;
    }
    a.dead = true;
    this.byIdMap.delete(a.id);
    // Warriors count the foes they beat, hunters the wolves (for legends)
    const killer = a.attacker !== undefined ? this.byIdMap.get(a.attacker) : undefined;
    if (cause === 'human' && killer?.kind === 'human') {
      countKill(killer as Human, a);
      // Memories, revenge and blood feuds (drama.ts)
      onKilled(this, a, killer as Human);
    }
    if (a.kind === 'human') {
      if (a.prophet !== undefined) onProphetDeath(this, a);
      if (a.role === 'fool') onFoolDeath(this, a);
      onHeroDeath(this, a);
      this.countDeath(cause);
      this.graves.push({ x: a.x, y: a.y, until: this.time + GRAVE_TIME });
      const r = this.registry.get(a.id);
      if (r) r.alive = false;
      if (cause === 'human') countLoss(this, a);
      onDeath(a, this, cause);
    }
    this.puff(a.x, a.y - 0.2, 6, ['#ffffff', '#e8e8e8', '#ffe066']);
  }

  /** Causes of death for the statistics; the recent list keeps 50 years. */
  private countDeath(cause: string) {
    const key = ['age', 'hunger', 'wolf', 'human', 'smite', 'sea', 'fire', 'lava', 'storm', 'lightning'].includes(cause) ? cause : 'other';
    this.deaths.total[key] = (this.deaths.total[key] ?? 0) + 1;
    this.deaths.recent.push([this.year, key]);
    while (this.deaths.recent.length && this.deaths.recent[0][0] < this.year - 50) this.deaths.recent.shift();
  }

  /**
   * Phase G: people lift the fog around them (the islanders don't count,
   * the fog is what the other peoples know), and islands that come out of it
   * are found.
   */
  private lookAround() {
    const w = this.world;
    if (!w.islands.length) return;
    this.landPop.clear();
    for (const h of this.humans) {
      if (h.dead || h.aboard !== undefined) continue;
      const land = w.landAt(Math.floor(h.x), Math.floor(h.y));
      this.landPop.set(land, (this.landPop.get(land) ?? 0) + 1);
    }
    let more = false;
    for (const h of this.humans) {
      if (h.dead || h.aboard !== undefined || h.people === 'islanders') continue;
      if (w.reveal(h.x, h.y, 5)) more = true;
    }
    if (more) discoveries(this);
  }

  /** No new trees around squares (ruins only at their edge), houses, buildings and sites. */
  private markNoTree() {
    const mask = this.world.noTree;
    mask.fill(0);
    const mark = (cx: number, cy: number, r: number) => {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if (x < 0 || y < 0 || x >= this.world.w || y >= this.world.h || Math.hypot(x - cx, y - cy) > r) continue;
          mask[y * this.world.w + x] = 1;
        }
      }
    };
    for (const v of this.villages) {
      if (v.merged) continue;
      mark(v.x, v.y, v.ruin ? BALANCE.trees.ruinClear : BALANCE.trees.villageClear);
      if (v.ruin) continue;
      for (const h of v.houses) mark(h.x, h.y, 1);
      for (const b of v.buildings) mark(b.x, b.y, 1);
      if (v.site) mark(v.site.x, v.site.y, 1);
    }
    for (const w of this.wonders) mark(w.x + WONDER_SIZE / 2, w.y + WONDER_SIZE / 2, 4);
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
        const x = Math.floor(rand() * w.w);
        const y = Math.floor(rand() * w.h);
        if (w.get(x, y) === t) out.push({ x, y });
      }
      return out;
    };
    // On a big world (phase G) the two peoples start on the main island
    const main = w.islands.find((is) => is.main);
    const onMain = (s: { x: number; y: number }) => !main || w.landAt(s.x, s.y) === w.landAt(Math.round(main.x), Math.round(main.y));
    const all = spots(T.GRASS, w.islands.length ? 1600 : 400);
    const grass = all.filter(onMain).slice(0, 400);
    if (grass.length < 2) return;

    // Two camps as far apart as the grass allows
    const a = grass[0];
    let b = grass[1];
    for (const g of grass) if (Math.hypot(g.x - a.x, g.y - a.y) > Math.hypot(b.x - a.x, b.y - a.y)) b = g;
    const order = [...PLAYABLE].sort(() => rand() - 0.5);
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
    place('horse', grass, 6);
    place('cow', grass, 6);
    // Far islands: wild horses on some, and sometimes a small people of their own, the islanders
    const far = all.filter((s) => !onMain(s));
    if (far.length) {
      place('horse', far, 4);
      place('sheep', far, 4);
      const homes = w.islands.filter((is) => !is.main && is.rx >= 14);
      if (homes.length && rand() < 0.65) {
        const is = homes[Math.floor(rand() * homes.length)];
        const land = w.landAt(Math.round(is.x), Math.round(is.y));
        const there = far.filter((s) => w.landAt(s.x, s.y) === land);
        const camp = there.sort((a, b) => Math.hypot(a.x - is.x, a.y - is.y) - Math.hypot(b.x - is.x, b.y - is.y))[0];
        if (camp) {
          for (let k = 0; k < 7; k++) {
            const spot = this.freeNear(camp.x, camp.y, 3, rand);
            if (spot) this.addHuman(spot.x, spot.y, 'islanders', k % 2 === 1, k < 6 ? 18 + rand() * 16 : 6 + rand() * 6);
          }
        }
      }
    }
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
  /**
   * The people a new person placed at (x, y) belongs to (no choosing): the
   * people whose land it is, else of the nearest place on that land, else of
   * the nearest person, else one at random.
   */
  peopleAt(x: number, y: number): People {
    const owner = ownerPeople(this, x, y);
    if (owner) return owner;
    const w = this.world;
    const place = this.villages
      .filter((v) => !v.ruin && !v.merged && w.sameLand(v.x, v.y, x, y))
      .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (place) return place.people;
    const near = this.nearest(x, y, 60, (o) => o.kind === 'human') as Human | null;
    if (near) return near.people;
    return PLAYABLE[Math.floor(this.rand() * PLAYABLE.length)];
  }

  place(kind: 'human' | AnimalKind, x: number, y: number, people: People = this.peopleAt(x, y)): boolean {
    const w = this.world;
    if (!w.isLand(w.get(x, y)) || !Number.isFinite(w.cost(x, y))) return false;
    if (kind === 'human') this.addHuman(x, y, people, this.rand() < 0.5);
    else this.addAnimal(kind, x, y);
    return true;
  }
}

