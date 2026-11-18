/**
 * Own characters (Update 2, phase B). The editor (editor.ts) builds a
 * template: name, sex, age, people, who they fall for, looks, the five
 * abilities, any traits, a job and special powers. Placing it on the map
 * makes a real inhabitant from it: from then on it lives like everyone else,
 * carries a little ✦ over the head and is a favourite.
 *
 * Every placed template is kept in this browser ("My Characters",
 * localStorage `jxsi_tiny_island_chars`) and can be placed again in any world.
 */
import { HAIR_STYLES, HAIRS, HATS, PLAYABLE, POWERS, SKINS, STATS, TRAITS, type Human, type Look, type People, type Power, type Stats, type Trait } from './agents';
import { JOBS, type Job } from './jobs';
import type { Sim } from './sim';
import { refOf } from './social';

export interface Template {
  id: string;
  name: string;
  female: boolean;
  /** Age in years when placed. */
  age: number;
  people: People;
  likes: 'women' | 'men' | 'both';
  skin: string;
  hair: string;
  look: Look;
  stats: Stats;
  traits: Trait[];
  job: Job | 'auto';
  powers: Power[];
}

const KEY = 'jxsi_tiny_island_chars';
const MAX = 24;

export function loadTemplates(): Template[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? (list as Template[]).filter((t) => t && typeof t.name === 'string') : [];
  } catch {
    return [];
  }
}

function store(list: Template[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* private mode or full: the character still lives on the island */
  }
}

/** Keeps a template (a newer one with the same id replaces the old one), newest first. */
export function saveTemplate(t: Template) {
  store([t, ...loadTemplates().filter((x) => x.id !== t.id)]);
}

export function removeTemplate(id: string) {
  store(loadTemplates().filter((x) => x.id !== id));
}

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

/** A random start for the editor. */
export function randomTemplate(): Template {
  const female = Math.random() < 0.5;
  const traits: Trait[] = [];
  while (traits.length < 2) {
    const t = pick(TRAITS);
    if (!traits.includes(t)) traits.push(t);
  }
  const stats = {} as Stats;
  for (const s of STATS) stats[s] = 3 + Math.floor(Math.random() * 6);
  return {
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: '',
    female,
    age: 20 + Math.floor(Math.random() * 15),
    people: pick(PLAYABLE),
    likes: female ? 'men' : 'women',
    skin: pick(SKINS),
    hair: pick(HAIRS),
    look: { hairStyle: pick(HAIR_STYLES), beard: !female && Math.random() < 0.3, hat: Math.random() < 0.2 ? pick(HATS) : 'none' },
    stats,
    traits,
    job: 'auto',
    powers: [],
  };
}

/** Is everything in the template something the game knows (e.g. after an update)? */
export function cleanTemplate(t: Template): Template {
  return {
    ...t,
    traits: t.traits.filter((x) => (TRAITS as readonly string[]).includes(x)),
    powers: t.powers.filter((x) => (POWERS as readonly string[]).includes(x)),
    job: t.job === 'auto' || (JOBS as readonly string[]).includes(t.job) ? t.job : 'auto',
    people: (PLAYABLE as readonly string[]).includes(t.people) ? t.people : 'coast',
  };
}

/** The template comes to life at (x, y); null if that is not land. */
export function placeCharacter(sim: Sim, raw: Template, x: number, y: number): Human | null {
  const t = cleanTemplate(raw);
  const w = sim.world;
  if (!w.isLand(w.get(x, y)) || !Number.isFinite(w.cost(x, y))) return null;
  const h = sim.addHuman(x, y, t.people, t.female, t.age, { traits: [...t.traits] });
  h.name = t.name.trim() || h.name;
  h.skin = t.skin;
  h.hair = t.hair;
  h.look = { ...t.look };
  h.stats = { ...t.stats };
  if (t.powers.includes('giantStrength')) h.stats.strength = 20;
  h.powers = [...t.powers];
  h.custom = true;
  h.likesWomen = t.likes !== 'men';
  h.likesMen = t.likes !== 'women';
  if (t.job !== 'auto') h.fixedJob = t.job;
  sim.applyHealth(h);
  const r = sim.registry.get(h.id);
  if (r) {
    r.name = h.name;
    r.custom = true;
  }
  sim.favorites.add(h.id);
  sim.puff(h.x, h.y - 0.6, 14, ['#ffffff', '#9fd3ff', '#ffe066']);
  sim.chronicle.add({ year: sim.year, kind: 'created', a: refOf(h), x: h.x, y: h.y });
  return h;
}
