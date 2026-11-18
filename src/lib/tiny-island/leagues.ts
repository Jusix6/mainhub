/**
 * Leagues and fusion (Update 2, phase D).
 *
 * Leagues: towns and cities that get along well (same people: no feud and a
 * good mood between the places; different peoples: a good mood between the
 * peoples) found a league with a name ("League of the Coast", or after its
 * first city) and a banner colour. Its council is made of the members'
 * leaders. Members:
 *  - never go to war or feud with each other, and like each other more
 *  - trade with each other first and on better terms (town.ts)
 *  - vote before one of them starts a war (war.ts): no majority, no war;
 *    with a majority the members of other peoples join in
 *  - defend each other: a war on one member brings in the others' peoples
 * A member that no longer gets along leaves; a league of one is over.
 *
 * Fusion: two places of one people closer than 26 tiles that have liked each
 * other for ten years grow together into one town with a name made of both.
 */
import type { People } from './agents';
import { fuseNames } from './names';
import type { Sim } from './sim';
import { join, type Village } from './villages';
import { feudKey, moodOf, shiftMood, shiftVillageMood, warBetween } from './war';

export interface League {
  id: number;
  members: number[];
  /** Named after a people (all members of one people) or after its first city. */
  nameKind: 'people' | 'city';
  nameKey: string;
  color: string;
  founded: number;
}

const COLORS = ['#ffd23f', '#7a4fd1', '#e86fa3', '#2fb3a6', '#ff8a1e', '#9fd3ff', '#3ddc84'];
const RANGE = 45;
/** Two places this close have areas that touch (new places start 22 tiles or more apart). */
const FUSE_RANGE = 26;
const FUSE_YEARS = 10;

const byId = (sim: Sim, id: number) => sim.villages.find((v) => v.id === id);
const alive = (v: Village | undefined): v is Village => !!v && !v.ruin;
const big = (v: Village) => v.tier === 'town' || v.tier === 'city';

export const leagueOf = (sim: Sim, v: Village) => sim.leagues.find((l) => l.members.includes(v.id));

/** Encodes a league's name for the chronicle ("people:coast", "city:Ashfell"). */
export const leagueTag = (l: League) => `${l.nameKind}:${l.nameKey}`;

/** How well two places get along: 0 … 100 (feud or war: nothing). */
export function affinity(sim: Sim, a: Village, b: Village): number {
  if (a.people === b.people) {
    if (sim.wars.has(feudKey(a.id, b.id))) return 0;
    return 50 + (sim.vmood.get(feudKey(a.id, b.id)) ?? 0) / 2;
  }
  if (warBetween(sim, a.people, b.people)) return 0;
  return Math.max(0, moodOf(sim, a.people, b.people));
}

/** Do two peoples sit together in a league? Then they never go to war. */
export function sharedLeague(sim: Sim, a: People, b: People): League | undefined {
  return sim.leagues.find((l) => {
    const ps = new Set(l.members.map((id) => byId(sim, id)?.people));
    return ps.has(a) && ps.has(b);
  });
}

/** Once a year: leagues form, grow, lose members and end; places grow together. */
export function leagueTick(sim: Sim) {
  if (sim.leagueYear === sim.year) return;
  sim.leagueYear = sim.year;
  const places = sim.villages.filter((v) => !v.ruin);

  for (const l of [...sim.leagues]) {
    l.members = l.members.filter((id) => alive(byId(sim, id)));
    const members = l.members.map((id) => byId(sim, id)!).filter(Boolean);
    // Members get along better and better
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = [members[i], members[j]];
        if (a.people === b.people) shiftVillageMood(sim, a.id, b.id, 2);
        else shiftMood(sim, a.people, b.people, 2);
      }
    }
    // Whoever no longer feels at home leaves
    for (const v of members) {
      const others = members.filter((o) => o !== v);
      if (!others.length) continue;
      const mean = others.reduce((n, o) => n + affinity(sim, v, o), 0) / others.length;
      if (mean < 20) {
        l.members = l.members.filter((id) => id !== v.id);
        sim.chronicle.add({ year: sim.year, kind: 'leagueExit', a: { id: 0, name: v.name, people: v.people }, v: v.name, u: leagueTag(l), x: v.x, y: v.y });
      }
    }
    if (l.members.length < 2) {
      sim.leagues = sim.leagues.filter((x) => x !== l);
      const v = byId(sim, l.members[0]);
      sim.chronicle.add({ year: sim.year, kind: 'leagueEnd', a: { id: 0, name: '', people: v?.people ?? 'coast' }, u: leagueTag(l), x: v?.x ?? 0, y: v?.y ?? 0 });
    }
  }

  // Towns and cities join a league they like, or found one with a friend
  for (const v of places) {
    if (!big(v) || leagueOf(sim, v)) continue;
    let joined = false;
    for (const l of sim.leagues) {
      const members = l.members.map((id) => byId(sim, id)).filter(alive);
      if (!members.some((o) => Math.hypot(o.x - v.x, o.y - v.y) <= RANGE)) continue;
      const mean = members.reduce((n, o) => n + affinity(sim, v, o), 0) / members.length;
      if (mean < 50) continue;
      l.members.push(v.id);
      sim.chronicle.add({ year: sim.year, kind: 'leagueJoin', a: { id: 0, name: v.name, people: v.people }, v: v.name, u: leagueTag(l), x: v.x, y: v.y });
      joined = true;
      break;
    }
    if (joined) continue;
    const friend = places.find((o) => o !== v && big(o) && !leagueOf(sim, o) && Math.hypot(o.x - v.x, o.y - v.y) <= RANGE && affinity(sim, v, o) >= 60);
    if (!friend) continue;
    const l: League = {
      id: sim.nextLeagueId++,
      members: [v.id, friend.id],
      nameKind: v.people === friend.people ? 'people' : 'city',
      nameKey: v.people === friend.people ? v.people : v.name,
      color: COLORS[(sim.nextLeagueId - 2) % COLORS.length],
      founded: sim.year,
    };
    // Two leagues of one people: the second one is named after its city
    if (l.nameKind === 'people' && sim.leagues.some((x) => x.nameKind === 'people' && x.nameKey === l.nameKey)) {
      l.nameKind = 'city';
      l.nameKey = v.name;
    }
    sim.leagues.push(l);
    sim.puff(v.x + 0.5, v.y - 0.5, 12, [l.color, '#ffffff']);
    sim.chronicle.add({ year: sim.year, kind: 'leagueFounded', a: { id: 0, name: v.name, people: v.people }, v: v.name, w: friend.name, u: leagueTag(l), x: v.x, y: v.y });
  }

  fusion(sim, places);
}

/** Neighbours of one people who have liked each other for ten years grow together. */
function fusion(sim: Sim, places: Village[]) {
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      const [a, b] = [places[i], places[j]];
      // Only neighbours on the same island grow together (phase G)
      if (a.ruin || b.ruin || a.people !== b.people || Math.hypot(a.x - b.x, a.y - b.y) > FUSE_RANGE || !sim.world.sameLand(a.x, a.y, b.x, b.y)) continue;
      const key = feudKey(a.id, b.id);
      if ((sim.vmood.get(key) ?? 0) < 40 || sim.wars.has(key)) {
        sim.fusionWatch.delete(key);
        continue;
      }
      const since = sim.fusionWatch.get(key);
      if (since === undefined) sim.fusionWatch.set(key, sim.year);
      else if (sim.year - since >= FUSE_YEARS) {
        sim.fusionWatch.delete(key);
        const [keep, gone] = a.members >= b.members ? [a, b] : [b, a];
        fuse(sim, keep, gone);
      }
    }
  }
}

function fuse(sim: Sim, keep: Village, gone: Village) {
  const name = fuseNames(keep.name, gone.name, sim.villages.map((v) => v.name));
  const before = keep.name;
  for (const h of sim.humans) if (h.village === gone.id) join(h, keep, sim);
  keep.houses.push(...gone.houses);
  for (const b of gone.buildings) if (!keep.buildings.some((x) => x.kind === b.kind)) keep.buildings.push(b);
  keep.art = [...(keep.art ?? []), ...(gone.art ?? [])];
  for (const res of ['food', 'wood', 'stone', 'ore', 'tools'] as const) keep[res] += gone[res];
  for (const k of ['club', 'bronze', 'iron', 'musket', 'armor'] as const) keep.arms[k] += gone.arms[k] ?? 0;
  if (gone.tier === 'city' || (gone.tier === 'town' && keep.tier === 'village')) keep.tier = gone.tier;
  for (const w of sim.works) if (w.village === gone.id) w.village = keep.id;
  for (const l of sim.leagues) {
    if (l.members.includes(gone.id)) l.members = [...new Set(l.members.map((id) => (id === gone.id ? keep.id : id)))];
  }
  for (const k of sim.kingdoms.values()) if (k.capital === gone.id) k.capital = keep.id;
  gone.houses = [];
  gone.buildings = [];
  gone.art = [];
  gone.site = null;
  gone.leader = undefined;
  gone.ruin = true;
  gone.merged = true;
  keep.name = name;
  sim.puff(keep.x + 0.5, keep.y - 0.5, 16, ['#ffe066', '#ffffff', '#3ddc84']);
  sim.chronicle.add({ year: sim.year, kind: 'fusion', a: { id: 0, name, people: keep.people }, v: before, w: gone.name, u: name, x: keep.x, y: keep.y });
}

/**
 * Before a war: the council of the declaring place's league votes. Members
 * of the same people say yes; the others only if they dislike the enemy
 * too. Returns false when the league says no. On a yes, members of other
 * peoples go to war as well (the returned list).
 */
export function councilVote(sim: Sim, declarer: Village, enemy: People): { ok: boolean; join: People[]; league?: League; yes: number; no: number } {
  const l = leagueOf(sim, declarer);
  if (!l) return { ok: true, join: [], yes: 0, no: 0 };
  const members = l.members.map((id) => byId(sim, id)).filter(alive);
  let yes = 0;
  let no = 0;
  for (const m of members) {
    if (m.people === enemy) no++;
    else if (m.people === declarer.people || moodOf(sim, m.people, enemy) < -30) yes++;
    else no++;
  }
  const ok = yes > no;
  const join = ok ? [...new Set(members.map((m) => m.people))].filter((p) => p !== declarer.people && p !== enemy) : [];
  return { ok, join, league: l, yes, no };
}

/** Defence: a war on a member brings in the other peoples of its league. */
export function defenders(sim: Sim, attacked: People, attacker: People): People[] {
  const out = new Set<People>();
  for (const l of sim.leagues) {
    const members = l.members.map((id) => byId(sim, id)).filter(alive);
    if (!members.some((m) => m.people === attacked)) continue;
    for (const m of members) if (m.people !== attacked && m.people !== attacker) out.add(m.people);
  }
  return [...out];
}
