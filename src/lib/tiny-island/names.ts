/** Short, friendly first names for the islanders (seeded picks). */
import type { Rand } from './rng';

const FEMALE = [
  'Mira', 'Lena', 'Ava', 'Nora', 'Ida', 'Lia', 'Elsa', 'Yara', 'Tilda', 'Runa', 'Maya', 'Selma', 'Ines', 'Juna', 'Kira', 'Liv',
  'Rosa', 'Alma', 'Nia', 'Ella', 'Freya', 'Hanna', 'Isla', 'Luna', 'Mila', 'Sora', 'Thea', 'Vera', 'Wren', 'Zoe', 'Fenna', 'Greta',
  'Hazel', 'Iris', 'Juni', 'Kaja', 'Lotte', 'Mara', 'Nele', 'Oda', 'Pia', 'Ruby', 'Saga', 'Tove', 'Una', 'Veda', 'Edda', 'Brea',
];
const MALE = [
  'Tomas', 'Finn', 'Leo', 'Arlo', 'Bram', 'Cai', 'Dario', 'Emil', 'Felix', 'Gus', 'Hugo', 'Ivo', 'Jonas', 'Kai', 'Lars', 'Milo',
  'Nils', 'Otto', 'Pavel', 'Quin', 'Rasmus', 'Sven', 'Theo', 'Udo', 'Vito', 'Wim', 'Yannik', 'Zeno', 'Aron', 'Bodo', 'Colm', 'Dag',
  'Elio', 'Falk', 'Gian', 'Henrik', 'Ilan', 'Jari', 'Knut', 'Linus', 'Mats', 'Noah', 'Oskar', 'Per', 'Rune', 'Silas', 'Tarek', 'Vince',
];

export function pickName(rand: Rand, female: boolean): string {
  const list = female ? FEMALE : MALE;
  return list[Math.floor(rand() * list.length)];
}

const START = ['Mist', 'Pine', 'Stone', 'Gull', 'Wind', 'Ash', 'Red', 'Salt', 'Lark', 'Oak', 'Fox', 'Elder', 'Moss', 'Raven', 'Sun', 'Amber', 'Frost', 'Hazel', 'Bright', 'Dusk'];
/** Endings that fit where a people likes to live. */
const END: Record<string, string[]> = {
  coast: ['bay', 'cove', 'port', 'haven', 'shore', 'wick'],
  forest: ['hollow', 'fern', 'wood', 'grove', 'dell', 'glade'],
  mountain: ['rock', 'ridge', 'peak', 'crag', 'hold', 'fell'],
  steppe: ['field', 'moor', 'ford', 'stead', 'heath', 'mark'],
  islanders: ['reef', 'lagoon', 'atoll', 'key', 'palm', 'sands'],
};

/** A village name like "Mistbay" or "Oakridge", avoiding names already in use. */
export function villageName(rand: Rand, people: string, taken: string[]): string {
  const ends = END[people] ?? END.steppe;
  for (let k = 0; k < 30; k++) {
    const name = START[Math.floor(rand() * START.length)] + ends[Math.floor(rand() * ends.length)];
    if (!taken.includes(name)) return name;
  }
  return START[Math.floor(rand() * START.length)] + ends[0] + ' II';
}

/** Family names (Update 2): a start and an ending that fits the people, e.g. "Silverwater" or "Ironstone". */
const FAMILY_START = ['Ash', 'Black', 'Brook', 'Copper', 'Dun', 'Fair', 'Glen', 'Gold', 'Green', 'Hart', 'Holly', 'Iron', 'Kings', 'Long', 'Marsh', 'North', 'Red', 'Silver', 'Thorn', 'West', 'White', 'Wild'];
const FAMILY_END: Record<string, string[]> = {
  coast: ['water', 'strand', 'sail', 'net', 'tide'],
  forest: ['wood', 'leaf', 'bough', 'root', 'brook'],
  mountain: ['stone', 'smith', 'helm', 'forge', 'crag'],
  steppe: ['rider', 'horn', 'mane', 'wind', 'field'],
  islanders: ['shell', 'reef', 'wave', 'palm', 'coral'],
};

export function familyName(rand: Rand, people: string): string {
  const ends = FAMILY_END[people] ?? FAMILY_END.steppe;
  return FAMILY_START[Math.floor(rand() * FAMILY_START.length)] + ends[Math.floor(rand() * ends.length)];
}

/** Two places grow together: the start of one name and the end of the other ("Mistbay" + "Oakridge" = "Mistridge"). */
export function fuseNames(a: string, b: string, taken: string[]): string {
  const startA = START.find((s) => a.startsWith(s));
  const startB = START.find((s) => b.startsWith(s));
  const tries: string[] = [];
  if (startA && startB) tries.push(startA + b.slice(startB.length), startB + a.slice(startA.length));
  for (const name of tries) if (name !== a && name !== b && !taken.includes(name)) return name;
  return `${a}-${b}`;
}

/** Island names (phase G): "Gullholm", "Emberkey" … */
const ISLE_START = ['Gull', 'Ember', 'Raven', 'Coral', 'Thorn', 'Mist', 'Storm', 'Amber', 'Kelp', 'Puffin', 'Sable', 'Driftwood', 'Seal', 'Heron', 'Cinder', 'Opal'];
const ISLE_END = ['holm', 'key', 'isle', 'rock', 'skerry', 'reach'];

export function islandName(rand: Rand, taken: string[]): string {
  for (let k = 0; k < 30; k++) {
    const name = ISLE_START[Math.floor(rand() * ISLE_START.length)] + ISLE_END[Math.floor(rand() * ISLE_END.length)];
    if (!taken.includes(name)) return name;
  }
  return `${ISLE_START[0]}${ISLE_END[0]} ${taken.length + 1}`;
}

/** Ship names (phase G): "Swift Gull", "Golden Heron" … */
const SHIP_ADJ = ['Swift', 'Brave', 'Silver', 'Lucky', 'Golden', 'Northern', 'Quiet', 'Bold', 'Red', 'Morning', 'Wandering', 'Proud'];
const SHIP_NOUN = ['Gull', 'Wave', 'Star', 'Otter', 'Heron', 'Dolphin', 'Petrel', 'Comet', 'Tide', 'Lark', 'Albatross', 'Pearl'];

export function shipName(rand: Rand): string {
  return `${SHIP_ADJ[Math.floor(rand() * SHIP_ADJ.length)]} ${SHIP_NOUN[Math.floor(rand() * SHIP_NOUN.length)]}`;
}
