/**
 * Social life: traits, relationships, couples, children, adoption, grief and
 * fist fights. Relationships are numbers from -100 to +100 per person known;
 * chatting raises them, quarrels and fights lower them. From +50 friends,
 * from -50 rivals. Two single adults who like each other a lot (+70) become a
 * couple; a man and a woman have children when food allows, other couples
 * adopt orphans.
 */
import { familyName } from './names';
import { forbiddenLove } from './drama';
import { famished } from './hunger';
import { brawlFactor } from './wonders';
import { stat, hasPower, ageOf, dist, has, pickTraits, stage, tileOf, type Human, type StoryEntry, type Thought, type Trait } from './agents';
import type { Ref } from './chronicle';
import type { Sim } from './sim';
import { believes } from './religion';
import { BALANCE } from './balance';
import { shiftMood, shiftVillageMood } from './war';

/** Actions the AI can score (ai.ts). */
export type Choice = 'eat' | 'gather' | 'sleep' | 'chat' | 'wander' | 'court' | 'work' | 'build' | 'raid' | 'art' | 'patrol' | 'festival' | 'preach' | 'pilgrim' | 'perform' | 'visit' | 'douse';

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
  smart: { work: 3 },
  dumb: { wander: 4 },
  charismatic: { chat: 8 },
  shy: { chat: -12, wander: 6 },
  ambitious: { work: 6, build: 6 },
  loyal: { patrol: 10 },
  scheming: { chat: -4 },
  jealous: { court: 8 },
  vengeful: { raid: 12 },
  kind: { chat: 10 },
  cruel: { raid: 10, chat: -6 },
  curious: { wander: 14 },
  pious: { festival: 15 },
  artistic: { art: 20 },
  lucky: {},
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
  if (has(h, 'kind') || has(p, 'kind')) gain += 3;
  // Charisma makes friends faster (5 = as before)
  gain *= 0.7 + ((stat(h, 'charisma') + stat(p, 'charisma')) / 2) * 0.06;
  // Two single grown-ups: it may become more than friendship
  const romance = single(h, sim) && single(p, sim) && match(h, p);
  if (romance) gain += 3;
  if (romance && (has(h, 'romantic') || has(p, 'romantic'))) gain += 5;
  changeRel(h, p, gain, sim);
  // Magnetic people: everyone likes them at once
  if (hasPower(p, 'magnetic')) shift(h, p, 15, sim);
  if (hasPower(h, 'magnetic')) shift(p, h, 15, sim);
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
  // Phase C: a couple from a big family often starts a branch with a new name
  const man = !a.female ? a : !b.female ? b : a;
  if (man.surname && sim.humans.filter((h) => h.surname === man.surname).length >= 10 && sim.rand() < 0.4) {
    const fresh = familyName(sim.rand, man.people);
    man.surname = fresh;
    (man === a ? b : a).surname = fresh;
  }
  // Phase C: love between peoples at war
  forbiddenLove(sim, a, b);
  // Phase D: a couple from two places of one people brings the places closer
  if (a.people === b.people && va && vb && va !== vb) shiftVillageMood(sim, va.id, vb.id, 5);
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
  // A real shortage (less than a year in store and many hungry): no children for now (Update 2)
  const home = h.village !== undefined ? sim.villages.find((v) => v.id === h.village) : undefined;
  if (home && famished(home, sim)) return;
  const living = h.children.filter((id) => sim.byId(id)).length;
  const fertile = hasPower(h, 'fertile') || hasPower(p, 'fertile');
  if (living >= (fertile ? 10 : 5)) return;
  // Fewer births as the island fills up; on a big world (phase G) each island by its own size
  let room = Math.max(0, 1 - sim.humans.length / 350);
  const w = sim.world;
  if (w.big) {
    const land = w.landAt(Math.floor(h.x), Math.floor(h.y));
    room = Math.max(0, 1 - (sim.landPop.get(land) ?? 0) / Math.max(8, w.landSize(land) * 0.06));
  }
  // About two children every three years while the conditions hold
  // A faith that teaches fertility: more children (Update 3)
  const faithful = believes(sim, h, 'fertility') ? BALANCE.religion.fertility : 1;
  if (sim.rand() > 0.012 * room * sim.rules.birth * (fertile ? 4 : 1) * faithful) return;

  h.lastBirth = sim.time;
  const t = tileOf(h);
  // Children of the fertile nearly always take after that parent
  const inherited = [h, p].flatMap((parent) =>
    sim.rand() < (hasPower(parent, 'fertile') ? 0.95 : 0.5) && parent.traits.length ? [parent.traits[Math.floor(sim.rand() * parent.traits.length)]] : [],
  );
  const people = sim.rand() < 0.5 ? h.people : p.people;
  const baby = sim.addHuman(t.x, t.y, people, sim.rand() < 0.5, 0, { parents: [h, p], traits: pickTraits(sim.rand, inherited) });
  baby.hunger = 100;
  baby.food = 0;
  // Children grow up in their mother's faith (Update 3)
  if (h.faith !== undefined) {
    baby.faith = h.faith;
    baby.devotion = 40;
  }
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
  if (has(h, 'kind')) chance *= 0.3;
  if (has(h, 'cruel')) chance *= 2;
  // A temple keeps the peace
  if (sim.villages.some((v) => v.id === h.village && v.buildings?.some((b) => b.kind === 'temple'))) chance *= 0.5;
  // The games of a colosseum (phase H) too
  chance *= brawlFactor(sim, h.people);
  // A faith of poverty: less greed, less strife (Update 3)
  if (believes(sim, h, 'poverty')) chance *= 0.5;
  // Places of some culture fight less
  if ((sim.villages.find((v) => v.id === h.village)?.culture ?? 0) >= 1) chance *= BALANCE.culture.simpleBrawl;
  if (sim.rand() > chance) return null;
  return sim.nearest(h.x, h.y, 4, (o) => o.kind === 'human' && o !== h && relOf(h, o as Human) <= RIVAL && !(o as Human).asleep) as Human | null;
}

export function startBrawl(a: Human, b: Human, sim: Sim) {
  shiftMood(sim, a.people, b.people, -6);
  if (a.people === b.people && a.village !== undefined && b.village !== undefined) shiftVillageMood(sim, a.village, b.village, -3);
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
