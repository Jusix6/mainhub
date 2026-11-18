/**
 * Everything that lives on the island: people (with needs), sheep, chickens
 * and wolves, plus gravestones and small effects. Positions are in tiles
 * (x = 10.5 is the middle of tile 10). Movement follows a path of tile
 * indexes from path.ts; speed depends on the terrain underfoot.
 */
import type { Unit } from './armies';
import { findPath, type Mover } from './path';
import type { Job } from './jobs';
import type { Memory } from './drama';
import type { Rand } from './rng';
import type { World } from './world';

export const PEOPLES = ['coast', 'forest', 'mountain', 'steppe', 'islanders'] as const;
export type People = (typeof PEOPLES)[number];
/** The peoples the player can place and pick in the editor; the islanders (phase G) only live on far islands. */
export const PLAYABLE = ['coast', 'forest', 'mountain', 'steppe'] as const satisfies readonly People[];

/** Clothing colours per people (roofs and flags later use them too). */
export const PEOPLE_COLORS: Record<People, { cloth: string; dark: string }> = {
  coast: { cloth: '#3b7ddd', dark: '#24529b' },
  forest: { cloth: '#3aa64b', dark: '#25733a' },
  mountain: { cloth: '#9097a6', dark: '#5f6573' },
  steppe: { cloth: '#d9443a', dark: '#9c2a23' },
  islanders: { cloth: '#f08c2e', dark: '#a85a17' },
};

export const SKINS = ['#f3d2b3', '#e2b48c', '#c68b5e', '#8d5a3b', '#5e3b26'];
export const HAIRS = ['#2b1d14', '#5a3b22', '#a8662c', '#e3c06b', '#1a1a1a', '#7a2e1b'];
export const GREY_HAIR = '#d9d9d9';

export type AnimalKind = 'sheep' | 'chicken' | 'wolf' | 'horse';

/**
 * Character traits, two per person born on the island (own characters may
 * have any number). Each one shifts the points of some actions (social.ts);
 * the second line came with Update 2.
 */
export const TRAITS = [
  'brave',
  'cowardly',
  'hardworking',
  'lazy',
  'friendly',
  'quarrelsome',
  'romantic',
  'greedy',
  'wise',
  'warlike',
  'smart',
  'dumb',
  'charismatic',
  'shy',
  'ambitious',
  'loyal',
  'scheming',
  'jealous',
  'vengeful',
  'kind',
  'cruel',
  'curious',
  'pious',
  'artistic',
  'lucky',
] as const;
export type Trait = (typeof TRAITS)[number];
export const OPPOSITE: Partial<Record<Trait, Trait>> = {
  brave: 'cowardly',
  cowardly: 'brave',
  hardworking: 'lazy',
  lazy: 'hardworking',
  friendly: 'quarrelsome',
  quarrelsome: 'friendly',
  smart: 'dumb',
  dumb: 'smart',
  charismatic: 'shy',
  shy: 'charismatic',
  kind: 'cruel',
  cruel: 'kind',
  loyal: 'scheming',
  scheming: 'loyal',
};

/**
 * Five abilities from 1 to 10 for everyone (Update 2): strength (fighting,
 * wood and stone), intelligence (research, smiths, builders), charisma
 * (friends, love, leadership), courage (fight or flee, soldiers, generals),
 * health (hit points, a longer life).
 */
export const STATS = ['strength', 'intelligence', 'charisma', 'courage', 'health'] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, number>;

/** Special powers, only for own characters (characters.ts). */
export const POWERS = ['immortal', 'invincible', 'eternalYouth', 'giantStrength', 'genius', 'magnetic', 'fertile', 'wolfWhisperer', 'lucky'] as const;
export type Power = (typeof POWERS)[number];

/** Looks of own characters, drawn over the normal sprite. */
export const HAIR_STYLES = ['short', 'long', 'bald', 'bun', 'spiky'] as const;
export const HATS = ['none', 'hat', 'crown', 'hood', 'flower'] as const;
export interface Look {
  hairStyle: (typeof HAIR_STYLES)[number];
  beard: boolean;
  hat: (typeof HATS)[number];
  /** Favourite clothing colour (else the colour of the people). */
  cloth?: string;
}

/** An ability, 5 when unknown. */
export const stat = (h: { stats?: Stats }, s: Stat) => h.stats?.[s] ?? 5;
export const hasPower = (h: { powers?: Power[] }, p: Power) => !!h.powers?.includes(p);

/** Traits push some abilities. */
const PUSH: Partial<Record<Trait, [Stat, number]>> = {
  smart: ['intelligence', 3],
  dumb: ['intelligence', -3],
  wise: ['intelligence', 2],
  charismatic: ['charisma', 3],
  shy: ['charisma', -2],
  brave: ['courage', 3],
  cowardly: ['courage', -3],
  warlike: ['courage', 1],
  hardworking: ['strength', 1],
};

/** Abilities for someone new: half the time near the parents' average, else a bell curve around 5. */
export function rollStats(rand: Rand, traits: Trait[], parents: { stats?: Stats }[] = []): Stats {
  const out = {} as Stats;
  for (const s of STATS) {
    const v = parents.length && rand() < 0.5 ? parents.reduce((n, p) => n + stat(p, s), 0) / parents.length + (rand() - 0.5) * 3 : 1 + rand() * 4.5 + rand() * 4.5;
    out[s] = v;
  }
  for (const t of traits) {
    const p = PUSH[t];
    if (p) out[p[0]] += p[1];
  }
  for (const s of STATS) out[s] = Math.max(1, Math.min(10, Math.round(out[s])));
  return out;
}

/** Two traits that do not contradict each other; `inherited` ones go first. */
export function pickTraits(rand: Rand, inherited: Trait[] = []): Trait[] {
  const out: Trait[] = [];
  const fits = (t: Trait) => !out.includes(t) && !(OPPOSITE[t] && out.includes(OPPOSITE[t]!));
  for (const t of inherited) if (out.length < 2 && fits(t)) out.push(t);
  for (let k = 0; out.length < 2 && k < 50; k++) {
    const t = TRAITS[Math.floor(rand() * TRAITS.length)];
    if (fits(t)) out.push(t);
  }
  return out;
}

/** Little pictures over the head: what someone wants or feels. */
export type Thought = 'heart' | 'sword' | 'tear' | 'food' | 'note';

/** One line in a person's life story; `other` is a name, kept as text. */
export interface StoryEntry {
  year: number;
  kind: 'arrive' | 'born' | 'couple' | 'child' | 'adopt' | 'adopted' | 'widowed' | 'friend' | 'rival' | 'brawl' | 'founded' | 'leader' | 'moved' | 'joined' | 'conquered' | 'invented' | 'crowned' | 'deposed' | 'artwork' | 'separated' | 'eloped' | 'avenged' | 'mentor' | 'student' | 'royalWedding' | 'banished' | 'battle' | 'discovered' | 'colony' | 'joinedPeople';
  other?: string;
}

export type TaskKind =
  | 'eat'
  | 'gather'
  | 'sleep'
  | 'chat'
  | 'wander'
  | 'fight'
  | 'flee'
  | 'hunt'
  | 'graze'
  | 'court'
  | 'brawl'
  | 'work'
  | 'build'
  | 'raid'
  | 'craft'
  | 'art'
  | 'patrol'
  | 'festival';

/** What a village stores and people carry back to it. */
export type Resource = 'food' | 'wood' | 'stone' | 'ore';

export interface Task {
  kind: TaskKind;
  /** Where to go (tile). */
  tx: number;
  ty: number;
  /** Agent this task is about (prey, chat partner, enemy). */
  target?: number;
  /** Seconds of work left once there (gathering, eating, chatting). */
  work: number;
  /** Food source of a gather task; 'store' = the village storage. */
  source?: 'berries' | 'fish' | 'hunt' | 'store';
  /** Work task: what to bring to the village, and how far along. */
  res?: Resource;
  phase?: 'go' | 'gather' | 'return';
  /** Farm work on a field tile. */
  farm?: 'plough' | 'sow' | 'harvest';
  /** Give up after this game time. */
  until: number;
  arrived?: boolean;
  /** Joined a chat someone else started (only the starter counts the outcome). */
  passive?: boolean;
  /** A fight in a war: nobody holds back. */
  lethal?: boolean;
  /** Craft task: what the smith makes (default: a tool). */
  make?: 'tool' | 'club' | 'bronze' | 'iron' | 'musket' | 'armor';
  /** Walks a bit slower (an army's general, so the others keep up). */
  slow?: boolean;
}

interface Base {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Game time of birth (seconds). */
  born: number;
  /** Age in years at which this one dies of old age. */
  lifespan: number;
  path: number[] | null;
  task: Task | null;
  thinkAt: number;
  /** Next time this one may strike again. */
  hitAt: number;
  facing: 1 | -1;
  moving: boolean;
  dead: boolean;
  /** Who hurt this one last, and when (for fighting back or fleeing). */
  attacker?: number;
  attackedAt: number;
}

export interface Human extends Base {
  kind: 'human';
  name: string;
  people: People;
  female: boolean;
  skin: string;
  hair: string;
  /** Needs, 0 (desperate) … 100 (fine). */
  hunger: number;
  energy: number;
  social: number;
  /** Food carried, each portion fills hunger by FOOD_VALUE. */
  food: number;
  asleep: boolean;
  /** Show speech dots until this time. */
  chatUntil: number;
  /** What they are up to, for the label and the profile. */
  doing: string;
  traits: Trait[];
  /** How much this person likes others they know, -100 … +100, by id. */
  rel: Map<number, number>;
  partner?: number;
  parents: number[];
  children: number[];
  story: StoryEntry[];
  /** Grieving until this game time. */
  grief: number;
  bubble: Thought | null;
  bubbleUntil: number;
  /** Where a couple lives (a tile); sleeping and strolling stay near it. */
  home: { x: number; y: number } | null;
  lastBirth: number;
  /** Village they belong to (id), if any. */
  village?: number;
  /** Job in the village (jobs.ts); none = helps wherever needed. */
  job?: Job;
  /** Carrying something to the village storage. */
  carry: { res: Resource; n: number } | null;
  /** Culture (Phase 12): an artist's inspiration, foes and wolves beaten (for legends). */
  inspiration?: number;
  kills?: number;
  wolves?: number;
  /** Abilities 1–10 (Update 2); own characters also have powers, looks, a fixed job and a ✦. */
  stats: Stats;
  custom?: boolean;
  powers?: Power[];
  look?: Look;
  fixedJob?: Job;
  /** Health has already been added to the lifespan. */
  healthDone?: boolean;
  /** Phase C: family name, memories, teacher and student, royal blood (peoples whose throne they may claim). */
  surname?: string;
  memories?: Memory[];
  mentor?: number;
  student?: number;
  royal?: People[];
  /** Weapon and armour from the smith (Phase 10). */
  weapon?: 'club' | 'bronze' | 'iron' | 'musket';
  armor?: boolean;
  /** Phase F: unit and place in the formation while in an army, veteran of a battle, badly scarred, running home after a rout. */
  unit?: Unit;
  slot?: { f: number; r: number; army: number };
  veteran?: string;
  scarred?: boolean;
  fleeHome?: number;
  /** Phase G: on board this ship (off the map). */
  aboard?: number;
  /** Who they fall for: most people the other sex, some their own, some both. */
  likesWomen: boolean;
  likesMen: boolean;
}

export interface Animal extends Base {
  kind: AnimalKind;
  hunger: number;
}

export type Agent = Human | Animal;

export interface Grave {
  x: number;
  y: number;
  until: number;
}

/** A shot in a war (phase F): an arrow, a bolt, a stone or a ball flying from (x0, y0) to (x1, y1). */
export interface Shot {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  kind: 'arrow' | 'bolt' | 'stone' | 'ball' | 'bullet';
}

/** A sword swing in a war fight: a short white stroke. */
export interface Slash {
  x: number;
  y: number;
  born: number;
  dir: 1 | -1;
}

/** A tiny puff (dust, stars) for hits and kills: cute, no blood. */
export interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
}

export const FOOD_VALUE = 34;

export const SPEED: Record<Agent['kind'], number> = { human: 1.5, sheep: 1, chicken: 1.2, wolf: 2.1, horse: 1.9 };

/** What each people is good at (Phase 4). */
export const PERKS: Record<People, { fish: number; wood: number; stone: number; speed: number; fight: number; hp: number }> = {
  coast: { fish: 2, wood: 1, stone: 1, speed: 1, fight: 1, hp: 100 },
  forest: { fish: 1, wood: 2, stone: 1, speed: 1, fight: 1, hp: 100 },
  mountain: { fish: 1, wood: 1, stone: 1.5, speed: 1, fight: 1, hp: 130 },
  steppe: { fish: 1, wood: 1, stone: 1, speed: 1.2, fight: 1.4, hp: 100 },
  islanders: { fish: 2, wood: 1.2, stone: 1, speed: 1.1, fight: 1, hp: 95 },
};
export const MAX_HP: Record<Agent['kind'], number> = { human: 100, sheep: 22, chicken: 9, wolf: 40, horse: 50 };
/** Typical life in years, a little randomness on top. */
const LIFE: Record<Agent['kind'], [number, number]> = { human: [70, 22], sheep: [12, 4], chicken: [8, 3], wolf: [14, 4], horse: [20, 5] };

export const YEAR = 30;

export const ageOf = (a: { born: number }, time: number) => (time - a.born) / YEAR;

export function stage(h: Human, time: number): 'child' | 'adult' | 'old' {
  const age = ageOf(h, time);
  return age < 16 ? 'child' : age < 60 ? 'adult' : 'old';
}

export const mover = (a: Agent): Mover => (a.kind === 'human' ? 'human' : 'animal');

let nextId = 1;
export const resetIds = () => {
  nextId = 1;
};
/** After loading a saved island: continue numbering after the highest id. */
export const setNextId = (n: number) => {
  nextId = n;
};

function base(kind: Agent['kind'], x: number, y: number, time: number, ageYears: number, rand: Rand): Base {
  const [life, spread] = LIFE[kind];
  return {
    id: nextId++,
    x: x + 0.5,
    y: y + 0.5,
    hp: MAX_HP[kind],
    maxHp: MAX_HP[kind],
    born: time - ageYears * YEAR,
    lifespan: life + rand() * spread,
    path: null,
    task: null,
    thinkAt: time + rand() * 0.5,
    hitAt: 0,
    facing: rand() < 0.5 ? 1 : -1,
    moving: false,
    dead: false,
    attackedAt: -99,
  };
}

export function makeHuman(
  x: number,
  y: number,
  people: People,
  female: boolean,
  name: string,
  time: number,
  ageYears: number,
  rand: Rand,
  traits: Trait[],
): Human {
  return {
    ...base('human', x, y, time, ageYears, rand),
    kind: 'human',
    name,
    people,
    female,
    skin: SKINS[Math.floor(rand() * SKINS.length)],
    hair: HAIRS[Math.floor(rand() * HAIRS.length)],
    hunger: 70 + rand() * 30,
    energy: 70 + rand() * 30,
    social: 60 + rand() * 40,
    food: 1,
    asleep: false,
    chatUntil: 0,
    doing: '',
    traits,
    stats: rollStats(rand, traits),
    rel: new Map(),
    parents: [],
    children: [],
    story: [],
    grief: 0,
    bubble: null,
    bubbleUntil: 0,
    home: null,
    lastBirth: -999,
    carry: null,
    ...orientation(female, rand),
  };
}

function orientation(female: boolean, rand: Rand) {
  const r = rand();
  const other = r < 0.88;
  const both = r >= 0.95;
  return {
    likesWomen: both || (female ? !other : other),
    likesMen: both || (female ? other : !other),
  };
}

export const has = (h: Human, t: Trait) => h.traits.includes(t);

export function makeAnimal(kind: AnimalKind, x: number, y: number, time: number, ageYears: number, rand: Rand): Animal {
  return { ...base(kind, x, y, time, ageYears, rand), kind, hunger: 70 + rand() * 30 };
}

export const tileOf = (a: { x: number; y: number }) => ({ x: Math.floor(a.x), y: Math.floor(a.y) });
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Plans a path to (tx, ty); false if there is no way. */
export function goTo(a: Agent, world: World, tx: number, ty: number): boolean {
  const t = tileOf(a);
  const p = findPath(world, t.x, t.y, tx, ty, mover(a));
  a.path = p;
  return p !== null;
}

/** Moves along the path; returns true once the path is used up. */
export function walk(a: Agent, world: World, dt: number, speedFactor = 1): boolean {
  if (!a.path || !a.path.length) {
    a.moving = false;
    a.path = null;
    return true;
  }
  const t = tileOf(a);
  const cost = Math.min(world.cost(t.x, t.y), 3);
  let step = (SPEED[a.kind] * speedFactor * dt) / (Number.isFinite(cost) ? cost : 1);
  while (step > 0 && a.path.length) {
    const next = a.path[0];
    const nx = (next % world.w) + 0.5;
    const ny = Math.floor(next / world.w) + 0.5;
    const dx = nx - a.x;
    const dy = ny - a.y;
    const d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) a.facing = dx > 0 ? 1 : -1;
    if (d <= step) {
      a.x = nx;
      a.y = ny;
      step -= d;
      a.path.shift();
    } else {
      a.x += (dx / d) * step;
      a.y += (dy / d) * step;
      step = 0;
    }
  }
  a.moving = true;
  if (!a.path.length) {
    a.path = null;
    a.moving = false;
    return true;
  }
  return false;
}

/** Straight steps towards a moving target (last metre of a chase). */
export function approach(a: Agent, world: World, tx: number, ty: number, dt: number, speedFactor = 1) {
  const dx = tx - a.x;
  const dy = ty - a.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return;
  const step = Math.min(d, SPEED[a.kind] * speedFactor * dt);
  const nx = a.x + (dx / d) * step;
  const ny = a.y + (dy / d) * step;
  if (Number.isFinite(world.cost(Math.floor(nx), Math.floor(ny)))) {
    a.x = nx;
    a.y = ny;
  }
  if (Math.abs(dx) > 0.01) a.facing = dx > 0 ? 1 : -1;
  a.moving = true;
}

/** A random tile around (x, y) that this agent can stand on, or null. */
export function randomSpot(world: World, a: Agent, radius: number, rand: Rand, landOnly = true): { x: number; y: number } | null {
  const t = tileOf(a);
  for (let k = 0; k < 12; k++) {
    const x = t.x + Math.round((rand() * 2 - 1) * radius);
    const y = t.y + Math.round((rand() * 2 - 1) * radius);
    if (!world.inside(x, y)) continue;
    const ground = world.get(x, y);
    if (landOnly ? world.isLand(ground) && Number.isFinite(world.cost(x, y)) : Number.isFinite(world.cost(x, y))) return { x, y };
  }
  return null;
}
