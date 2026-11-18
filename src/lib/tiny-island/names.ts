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
