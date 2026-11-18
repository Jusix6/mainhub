/**
 * Social life: traits, relationships, couples, children, adoption, grief and
 * fist fights. Relationships are numbers from -100 to +100 per person known;
 * chatting raises them, quarrels and fights lower them. From +50 friends,
 * from -50 rivals. Two single adults who like each other a lot (+70) become a
 * couple; a man and a woman have children when food allows, other couples
 * adopt orphans.
 */
import { ageOf, dist, has, pickTraits, stage, tileOf, type Human, type StoryEntry, type Thought, type Trait } from './agents';
import type { Ref } from './chronicle';
import type { Sim } from './sim';
import { shiftMood } from './war';

/** Actions the AI can score (ai.ts). */
export type Choice = 'eat' | 'gather' | 'sleep' | 'chat' | 'wander' | 'court' | 'work' | 'build' | 'raid';

/** Extra points per trait and action. Tune here. */
export const TRAIT_MODS: Record<Trait, Partial<Record<Choice, number>>> = {
  brave: { raid: 10 },
  cowardly: { raid: -60 },
  hardworking: { gather: 12, work: 15, build: 10 },
  lazy: { gather: -15, work: -30, build: -30, wander: 6, sleep: 8 },
  friendly: { chat: 15 },
  quarrelsome: { chat: -5 },
  romantic: { court: 20, chat: 5 },
  greedy: { gather: 8 },
  wise: { chat: 5 },
  warlike: { raid: 15 },
};

export const traitBonus = (h: Human, c: Choice) => h.traits.reduce((n, t) => n + (TRAIT_MODS[t][c] ?? 0), 0);

export const FRIEND = 50;
export const RIVAL = -50;
const LOVE = 70;
const YEAR = 30;

export const relOf = (h: Human, o: { id: number }) => h.rel.get(o.id) ?? 0;

export const refOf = (h: Human): Ref => ({ id: h.id, name: h.name, people: h.people });

export function story(h: Human, sim: Sim, kind: StoryEntry['kind'], other?: string) {
  h.story.push({ year: sim.year, kind, other });
  if (h.story.length > 30) h.story.shift();
}

export function think(h: Human, icon: Thought, seconds: number, sim: Sim) {
  h.bubble = icon;
  h.bubbleUntil = sim.time + seconds;
}

/** Changes how `h` feels about `o` (one direction); notes new friends and rivals. */
function shift(h: Human, o: Human, d: number, sim: Sim) {
  const before = relOf(h, o);
  const after = Math.max(-100, Math.min(100, before + d));
  h.rel.set(o.id, after);
  if (before < FRIEND && after >= FRIEND) story(h, sim, 'friend', o.name);
  if (before > RIVAL && after <= RIVAL) story(h, sim, 'rival', o.name);
}

export function changeRel(a: Human, b: Human, d: number, sim: Sim) {
  shift(a, b, d, sim);
  shift(b, a, d, sim);
}

/** Both fall for each other's sex, and they are not family. */
export function match(a: Human, b: Human) {
  const aLikes = b.female ? a.likesWomen : a.likesMen;
  const bLikes = a.female ? b.likesWomen : b.likesMen;
  return aLikes && bLikes && !isRelative(a, b);
}

export function isRelative(a: Human, b: Human) {
  if (a.parents.includes(b.id) || b.parents.includes(a.id)) return true;
  return a.parents.some((p) => b.parents.includes(p));
}

export const single = (h: Human, sim: Sim) => h.partner === undefined && stage(h, sim.time) !== 'child' && h.grief < sim.time;

/**
 * A finished chat: usually they like each other more (friendly people even
 * more), sometimes it ends in a quarrel (more likely with quarrelsome people
 * or if they already dislike each other).
 */
export function chatOutcome(h: Human, p: Human, sim: Sim) {
  let quarrel = 0.08;
  for (const x of [h, p]) {
    if (has(x, 'quarrelsome')) quarrel += 0.22;
    if (has(x, 'friendly')) quarrel -= 0.04;
  }
  if (relOf(h, p) < -20) quarrel += 0.15;
  if (sim.rand() < quarrel) {
    changeRel(h, p, -15, sim);
    shiftMood(sim, h.people, p.people, -4);
    think(h, 'sword', 2, sim);
    think(p, 'sword', 2, sim);
    return;
  }
  let gain = 8 + sim.rand() * 8;
  if (has(h, 'friendly') || has(p, 'friendly')) gain += 4;
  // Two single grown-ups: it may become more than friendship
  const romance = single(h, sim) && single(p, sim) && match(h, p);
  if (romance) gain += 3;
  if (romance && (has(h, 'romantic') || has(p, 'romantic'))) gain += 5;
  changeRel(h, p, gain, sim);
  if (romance && relOf(h, p) >= LOVE - 15) {
    think(h, 'heart', 2, sim);
    think(p, 'heart', 2, sim);
  }
}

/** Someone single and grown-up nearby whom `h` loves (+70). */
export function findLove(h: Human, sim: Sim): Human | null {
  if (!single(h, sim)) return null;
  let best: Human | null = null;
  for (const [id, v] of h.rel) {
    if (v < LOVE) continue;
    const o = sim.byId(id);
    if (!o || o.kind !== 'human' || !single(o, sim) || !match(h, o)) continue;
    if (dist(h, o) > 25) continue;
    if (!best || v > relOf(h, best)) best = o;
  }
  return best;
}

/** The two become a couple and get a home between them. */
export function makeCouple(a: Human, b: Human, sim: Sim) {
  if (!single(a, sim) || !single(b, sim)) return;
  a.partner = b.id;
  b.partner = a.id;
  const ta = tileOf(a);
  const tb = tileOf(b);
  const mid = sim.freeNear(Math.round((ta.x + tb.x) / 2), Math.round((ta.y + tb.y) / 2), 2, sim.rand) ?? ta;
  a.home = b.home = { x: mid.x, y: mid.y };
  // Villagers: the couple lives in one village, at first on the square
  const va = a.village !== undefined ? sim.villages.find((v) => v.id === a.village && !v.ruin) : undefined;
  const vb = b.village !== undefined ? sim.villages.find((v) => v.id === b.village && !v.ruin) : undefined;
  const v = va ?? vb;
  if (v) {
    for (const h of [a, b]) {
      if (h.village !== v.id) {
        for (const house of sim.villages.flatMap((x) => x.houses)) house.owners = house.owners.filter((id) => id !== h.id);
        h.village = v.id;
        story(h, sim, 'joined', v.name);
      }
    }
    const house = v.houses.find((x) => x.owners.includes(a.id) || x.owners.includes(b.id));
    if (house) {
      house.owners = [a.id, b.id];
      a.home = b.home = { x: house.x, y: house.y };
    } else {
      a.home = b.home = { x: v.x, y: v.y };
    }
  }
  story(a, sim, 'couple', b.name);
  story(b, sim, 'couple', a.name);
  // Love across peoples brings them closer
  shiftMood(sim, a.people, b.people, 15);
  think(a, 'heart', 3, sim);
  think(b, 'heart', 3, sim);
  // Wedding confetti
  sim.puff(a.x, a.y - 0.5, 16, ['#ff5da2', '#ffe066', '#4d8dff', '#3ddc84', '#ffffff', '#ff8a1e']);
  sim.chronicle.add({ year: sim.year, kind: 'couple', a: refOf(a), b: refOf(b), x: a.x, y: a.y });
}

/** Courting: when `h` reaches the loved one, they become a couple if it is mutual. */
export function court(h: Human, o: Human, sim: Sim) {
  if (relOf(o, h) >= LOVE - 20) makeCouple(h, o, sim);
  else changeRel(h, o, -5, sim);
}

/** Children of a man and a woman, if both are fed and the family is not too big. */
export function tryBirth(h: Human, sim: Sim) {
  if (!h.female || h.partner === undefined) return;
  const p = sim.byId(h.partner) as Human | undefined;
  if (!p || p.female) return;
  const age = ageOf(h, sim.time);
  if (age < 18 || age > 45 || stage(p, sim.time) === 'child') return;
  if (sim.time - h.lastBirth < 1.2 * YEAR) return;
  if (h.hunger < 40 || p.hunger < 40 || h.grief > sim.time) return;
  const living = h.children.filter((id) => sim.byId(id)).length;
  if (living >= 5) return;
  // Fewer births as the island fills up
  const room = Math.max(0, 1 - sim.humans.length / 350);
  // About two children every three years while the conditions hold
  if (sim.rand() > 0.012 * room * sim.rules.birth) return;

  h.lastBirth = sim.time;
  const t = tileOf(h);
  const inherited = [h, p].flatMap((parent) => (sim.rand() < 0.5 ? [parent.traits[Math.floor(sim.rand() * 2)]] : []));
  const people = sim.rand() < 0.5 ? h.people : p.people;
  const baby = sim.addHuman(t.x, t.y, people, sim.rand() < 0.5, 0, { parents: [h, p], traits: pickTraits(sim.rand, inherited) });
  baby.hunger = 100;
  baby.food = 0;
  story(h, sim, 'child', baby.name);
  story(p, sim, 'child', baby.name);
  if (sim.favorites.has(h.id) || sim.favorites.has(p.id)) {
    sim.chronicle.add({ year: sim.year, kind: 'birth', a: refOf(baby), b: refOf(h), c: refOf(p), x: h.x, y: h.y });
  }
}

/** Couples without a full house take in a child whose parents are gone. */
export function tryAdopt(h: Human, sim: Sim) {
  if (h.partner === undefined) return;
  const p = sim.byId(h.partner) as Human | undefined;
  if (!p) return;
  const living = h.children.filter((id) => sim.byId(id)).length;
  if (living >= 3) return;
  const sameSex = h.female === p.female;
  if (sim.rand() > (sameSex ? 0.08 : 0.015)) return;
  const orphan = sim.nearest(h.x, h.y, 15, (o) => o.kind === 'human' && stage(o as Human, sim.time) === 'child' && !(o as Human).parents.some((id) => sim.byId(id))) as Human | null;
  if (!orphan) return;
  orphan.parents = [h.id, p.id];
  h.children.push(orphan.id);
  p.children.push(orphan.id);
  orphan.home = h.home;
  story(orphan, sim, 'adopted', `${h.name} & ${p.name}`);
  story(h, sim, 'adopt', orphan.name);
  story(p, sim, 'adopt', orphan.name);
  think(h, 'heart', 2, sim);
  sim.chronicle.add({ year: sim.year, kind: 'adopt', a: refOf(orphan), b: refOf(h), c: refOf(p), x: h.x, y: h.y });
}

/** Rivals close by may start a fist fight (nobody dies of it). */
export function wantsBrawl(h: Human, sim: Sim): Human | null {
  if (stage(h, sim.time) !== 'adult' || h.hp < 60) return null;
  let chance = 0.025;
  if (has(h, 'quarrelsome')) chance *= 2;
  if (has(h, 'warlike')) chance *= 2;
  if (has(h, 'cowardly')) chance *= 0.2;
  if (has(h, 'friendly')) chance *= 0.5;
  if (sim.rand() > chance) return null;
  return sim.nearest(h.x, h.y, 4, (o) => o.kind === 'human' && o !== h && relOf(h, o as Human) <= RIVAL && !(o as Human).asleep) as Human | null;
}

export function startBrawl(a: Human, b: Human, sim: Sim) {
  shiftMood(sim, a.people, b.people, -6);
  story(a, sim, 'brawl', b.name);
  story(b, sim, 'brawl', a.name);
  think(a, 'sword', 3, sim);
  think(b, 'sword', 3, sim);
  sim.chronicle.add({ year: sim.year, kind: 'brawl', a: refOf(a), b: refOf(b), x: a.x, y: a.y });
}

/** Someone died: the partner grieves, the chronicle notes it. */
export function onDeath(h: Human, sim: Sim, cause: string) {
  const age = Math.floor(ageOf(h, sim.time));
  sim.chronicle.add({ year: sim.year, kind: 'died', a: refOf(h), n: age, cause, x: h.x, y: h.y });
  if (h.partner !== undefined) {
    const p = sim.byId(h.partner) as Human | undefined;
    if (p) {
      p.partner = undefined;
      p.grief = sim.time + YEAR;
      story(p, sim, 'widowed', h.name);
      think(p, 'tear', 4, sim);
    }
  }
}
