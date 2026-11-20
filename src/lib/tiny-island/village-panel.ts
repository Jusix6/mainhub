/**
 * The profile of a place (opened by clicking its sign on the map, its square
 * or its name anywhere in the panels): who lives there, whether there is
 * enough food, what is in store, who works at what, which buildings it has,
 * whom it fights or has peace with, its art and festivals, the latest events
 * and the two god gifts for this very place. Plain HTML, refreshed a few
 * times a second by panels.ts.
 */
import { stage, type People } from './agents';
import { festiveAt, worksIn, type Work } from './culture';
import { COSTS, nextInvention, techOf } from './inventions';
import { kingOf, loyaltyOf } from './kingdoms';
import type { Sim } from './sim';
import type { Village } from './villages';
import { feudKey, pairKey, sideOf, wallMax } from './war';

/** A text for one and for many: "1 child", "3 children". */
export type Forms = [string, string];
export const plural = (forms: Forms, n: number) => (n === 1 ? forms[0] : forms[1]).replace('{n}', String(n));

export interface VillageStrings {
  people: string;
  founded: string;
  ruins: string;
  leader: string;
  noLeader: string;
  realm: { capital: string; vassal: string; free: string; none: string };
  loyalty: string;
  sections: Record<'people' | 'food' | 'stores' | 'work' | 'buildings' | 'war' | 'culture' | 'events', string>;
  inhabitants: Forms;
  ages: Record<'grown' | 'child' | 'elder', Forms>;
  houses: Forms;
  houseKinds: Forms[];
  food: Record<'plenty' | 'enough' | 'low' | 'empty', string>;
  foodLine: string;
  hungry: string;
  noneHungry: string;
  fields: Forms;
  stores: Record<'food' | 'wood' | 'stone' | 'ore' | 'tools' | 'weapons' | 'armor' | 'gold' | 'spice', string>;
  noJobs: string;
  noBuildings: string;
  wall: string;
  peace: string;
  warWith: string;
  feudWith: string;
  armyOut: Record<'gather' | 'march' | 'siege' | 'sail', string>;
  armyIn: Record<'gather' | 'march' | 'siege' | 'sail', string>;
  colonyOf: string;
  colonyLoyalty: string;
  rebel: string;
  island: string;
  shipOut: string;
  shipKinds: Record<string, string>;
  allies: string;
  treaty: string;
  works: Forms;
  noWorks: string;
  festivalNow: string;
  festivalNext: string;
  festivalNextOne: string;
  research: string;
  allKnown: string;
  noEvents: string;
  festival: string;
  festivalTitle: string;
  donate: string;
  donateTitle: string;
  show: string;
}

/** What the panel needs from panels.ts (escaping, links, words). */
export interface VillageCtx {
  sim: Sim;
  S: VillageStrings;
  esc: (s: string) => string;
  peoples: Record<People, string>;
  tiers: Record<string, string>;
  jobs: Record<string, string>;
  buildings: Record<string, string>;
  inventions: Record<string, { name: string; icon: string }>;
  royal: { king: string; queen: string };
  year: string;
  person: (id: number) => string;
  village: (v: Village) => string;
  workTitle: (w: Work) => string;
  entry: (id: number) => string;
  /** The world wonder the place holds or builds (phase H), with its name. */
  wonder: (v: Village) => string | null;
  /** The league the place belongs to, if any (phase D). */
  league: (v: Village) => string | null;
  leagueLine: string;
}

const YEAR = 30;
const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function villageHtml(c: VillageCtx, v: Village): string {
  const { sim, S, esc } = c;
  const k = sim.kingdoms.get(v.people);
  const capital = !!k && k.capital === v.id && !v.ruin;
  const head = `
    <header class="ti-p__head">
      <h2 class="ti-p__name">${capital ? '♛ ' : ''}${esc(v.name)}</h2>
      <button type="button" class="ti-p__close" data-p-close aria-label="×">×</button>
    </header>
    <p class="ti-p__meta"><span class="ti-p__dot ti-dot--${v.people}"></span>${esc(S.people.replace('{p}', c.peoples[v.people]))} · ${esc(c.tiers[v.tier ?? 'village'])} · ${esc(S.founded.replace('{n}', String(v.founded)))}</p>`;
  if (v.ruin) return `${head}<p class="ti-v__note">${esc(S.ruins)}</p>${events(c, v)}`;

  const members = sim.humans.filter((h) => h.village === v.id);
  const kids = members.filter((h) => stage(h, sim.time) === 'child').length;
  const elders = members.filter((h) => stage(h, sim.time) === 'old').length;
  const grown = members.length - kids - elders;

  // Kingdom
  let realm = esc(S.realm.none);
  if (k) {
    const king = kingOf(sim, k);
    const r = king?.female ? c.royal.queen : c.royal.king;
    const kingLink = king ? c.person(king.id) : '–';
    if (capital) realm = esc(S.realm.capital.replace('{p}', c.peoples[v.people]));
    else {
      const tpl = v.free ? S.realm.free : S.realm.vassal;
      realm = esc(tpl.replace('{r}', r)).replace('{k}', kingLink);
      realm += bar(S.loyalty, loyaltyOf(v), loyaltyOf(v) < 25 ? 'bad' : loyaltyOf(v) < 45 ? 'mid' : 'good', `${Math.round(loyaltyOf(v))}`);
    }
  }
  const leader = v.leader !== undefined && sim.byId(v.leader) ? c.person(v.leader) : esc(S.noLeader);

  // Inhabitants and houses
  const levels = [0, 0, 0, 0];
  for (const h of v.houses) levels[h.level]++;
  const houses = levels
    .map((n, i) => (n ? plural(S.houseKinds[i], n) : ''))
    .filter(Boolean)
    .join(' · ');

  // Food
  const target = Math.max(1, members.length * 2.5);
  const ratio = v.food / target;
  const status = ratio >= 1 ? 'plenty' : ratio >= 0.5 ? 'enough' : v.food >= 1 ? 'low' : 'empty';
  const hungry = members.filter((h) => h.hunger < 30).length;

  // Stores and work
  const weapons = v.arms.club + v.arms.bronze + v.arms.iron + (v.arms.musket ?? 0);
  const stores = (
    [
      ['wood', v.wood],
      ['stone', v.stone],
      ['ore', v.ore],
      ['tools', v.tools],
      ['weapons', weapons],
      ['armor', v.arms.armor],
      ...(v.gold ? ([['gold', v.gold]] as const) : []),
      ...(v.spice ? ([['spice', v.spice]] as const) : []),
    ] as const
  )
    .map(([key, n]) => `<span>${esc(S.stores[key])} <b>${Math.floor(n)}</b></span>`)
    .join('');
  const jobCount = new Map<string, number>();
  for (const h of members) if (h.job) jobCount.set(h.job, (jobCount.get(h.job) ?? 0) + 1);
  const jobs = jobCount.size
    ? [...jobCount]
        .sort((a, b) => b[1] - a[1])
        .map(([j, n]) => `<span>${esc(c.jobs[j] ?? j)} <b>${n}</b></span>`)
        .join('')
    : `<span>${esc(S.noJobs)}</span>`;

  // Buildings
  const buildings = v.buildings.length ? v.buildings.map((b) => esc(c.buildings[b.kind] ?? b.kind)).join(', ') : esc(S.noBuildings);
  const full = wallMax(sim, v);
  const wall = v.buildings.some((b) => b.kind === 'wall') ? `<p class="ti-v__line">🧱 ${esc(S.wall.replace('{n}', String(pct(((v.wallHp ?? full) / full) * 100))))}</p>` : '';

  // Phase G: the island it lies on, the colony and its loyalty
  const isle = sim.world.islandAt(v.x, v.y);
  const mother = v.colonyOf !== undefined ? sim.villages.find((o) => o.id === v.colonyOf) : undefined;
  const rebelOf = v.rebelOf !== undefined ? sim.villages.find((o) => o.id === v.rebelOf) : undefined;
  let sea = isle && sim.world.islands.length > 1 ? `<p class="ti-v__line">🏝️ ${esc(S.island.replace('{i}', isle.name))}</p>` : '';
  if (mother) {
    const loyal = v.colonyLoyalty ?? 70;
    sea += `<p class="ti-v__line">⛵ ${esc(S.colonyOf).replace('{v}', c.village(mother))}</p>${bar(S.colonyLoyalty, loyal, loyal < 25 ? 'bad' : loyal < 45 ? 'mid' : 'good', `${Math.round(loyal)}`)}`;
  }
  if (rebelOf) sea += `<p class="ti-v__line is-bad">🔥 ${esc(S.rebel).replace('{v}', c.village(rebelOf))}</p>`;
  for (const ship of sim.ships) if (ship.home === v.id) sea += `<p class="ti-v__line">⛵ ${esc(S.shipOut.replace('{s}', ship.name).replace('{k}', S.shipKinds[ship.kind] ?? ship.kind))}</p>`;

  return `${head}
    <p class="ti-p__village">${realm}</p>
    ${sea}
    ${c.league(v) ? `<p class="ti-v__line">🏳️ ${esc(c.leagueLine.replace('{l}', c.league(v)!))}</p>` : ''}
    ${c.wonder(v) ? `<p class="ti-v__line">🏛️ ${esc(c.wonder(v)!)}</p>` : ''}
    <dl class="ti-p__fam"><dt>${esc(S.leader)}</dt><dd>${leader}</dd></dl>

    <h3 class="ti-p__h">${esc(S.sections.people)}</h3>
    <p class="ti-v__big">${esc(plural(S.inhabitants, members.length))}</p>
    <p class="ti-v__line">${esc([plural(S.ages.grown, grown), plural(S.ages.child, kids), plural(S.ages.elder, elders)].join(' · '))}</p>
    <p class="ti-v__line">🏠 ${esc(plural(S.houses, v.houses.length))}${houses ? ` · ${esc(houses)}` : ''}</p>

    <h3 class="ti-p__h">${esc(S.sections.food)}</h3>
    ${bar(S.stores.food, ratio * 100, status === 'plenty' ? 'good' : status === 'enough' ? 'mid' : 'bad', S.food[status])}
    <p class="ti-v__line">${esc(S.foodLine.replace('{f}', String(Math.floor(v.food))).replace('{t}', String(Math.round(target))))}</p>
    <p class="ti-v__line${hungry ? ' is-bad' : ''}">${esc(hungry ? S.hungry.replace('{n}', String(hungry)) : S.noneHungry)}</p>
    <p class="ti-v__line">🌾 ${esc(plural(S.fields, v.fields).replace('{r}', String(v.ripe)))}</p>

    <h3 class="ti-p__h">${esc(S.sections.stores)}</h3>
    <p class="ti-v__chips">${stores}</p>

    <h3 class="ti-p__h">${esc(S.sections.work)}</h3>
    <p class="ti-v__chips">${jobs}</p>
    ${research(c, v.people)}

    <h3 class="ti-p__h">${esc(S.sections.buildings)}</h3>
    <p class="ti-v__line">${buildings}</p>
    ${wall}

    <h3 class="ti-p__h">${esc(S.sections.war)}</h3>
    ${war(c, v)}

    <h3 class="ti-p__h">${esc(S.sections.culture)}</h3>
    ${culture(c, v)}

    <div class="ti-p__actions">
      <button type="button" class="ti-p__btn" data-v-show="${v.id}">${esc(S.show)}</button>
      <button type="button" class="ti-p__btn" data-v-festival="${v.id}" title="${esc(S.festivalTitle)}">🎉 ${esc(S.festival)}</button>
      <button type="button" class="ti-p__btn" data-v-donate="${v.id}" title="${esc(S.donateTitle)}">🏛️ ${esc(S.donate)}</button>
    </div>
    ${events(c, v)}`;
}

/** A labelled bar: good (green), mid (gold) or bad (red). */
function bar(label: string, value: number, tone: 'good' | 'mid' | 'bad', text: string) {
  const e = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return `<div class="ti-p__need ti-v__meter"><span>${e(label)}</span><span class="ti-p__bar ti-v__bar--${tone}"><span style="width:${pct(value)}%"></span></span><b>${e(text)}</b></div>`;
}

function research(c: VillageCtx, p: People): string {
  const next = nextInvention(c.sim, p);
  if (!next) return `<p class="ti-v__line">${c.esc(c.S.allKnown)}</p>`;
  const done = pct((techOf(c.sim, p).progress / COSTS[next]) * 100);
  const inv = c.inventions[next];
  return `<p class="ti-v__line">${c.esc(c.S.research.replace('{i}', `${inv.icon} ${inv.name}`).replace('{n}', String(done)))}</p>`;
}

/** Wars this place is in, armies going out and coming in, allies and treaties. */
function war(c: VillageCtx, v: Village): string {
  const { sim, S, esc } = c;
  const party = { people: v.people, village: v.id };
  const lines: string[] = [];
  for (const w of sim.wars.values()) {
    const side = sideOf(w, party);
    if (!side) continue;
    const since = String(Math.floor(w.started / YEAR) + 1);
    if (w.va !== undefined) {
      const other = sim.villages.find((o) => o.id === (side === 'a' ? w.vb : w.va));
      if (other) lines.push(`<p class="ti-v__line is-bad">⚔️ ${esc(S.feudWith.replace('{n}', since)).replace('{v}', c.village(other))}</p>`);
    } else {
      const foe = side === 'a' ? w.b : w.a;
      lines.push(`<p class="ti-v__line is-bad">⚔️ ${esc(S.warWith.replace('{p}', c.peoples[foe]).replace('{n}', since))}</p>`);
    }
  }
  for (const a of sim.armies) {
    const target = sim.villages.find((o) => o.id === a.target);
    const from = sim.villages.find((o) => o.id === a.from);
    if (a.from === v.id && target) lines.push(`<p class="ti-v__line">🚩 ${esc(S.armyOut[a.state].replace('{n}', String(a.members.length))).replace('{v}', c.village(target))}</p>`);
    if (a.target === v.id && from) lines.push(`<p class="ti-v__line is-bad">🛡️ ${esc(S.armyIn[a.state].replace('{n}', String(a.members.length))).replace('{v}', c.village(from))}</p>`);
  }
  if (!lines.length) lines.push(`<p class="ti-v__line is-good">🕊️ ${esc(S.peace)}</p>`);

  const allies = [...sim.alliances]
    .map((k) => k.split('|') as [People, People])
    .filter(([a, b]) => a === v.people || b === v.people)
    .map(([a, b]) => c.peoples[a === v.people ? b : a]);
  if (allies.length) lines.push(`<p class="ti-v__line">🤝 ${esc(S.allies.replace('{l}', allies.join(', ')))}</p>`);
  for (const [key, until] of sim.treaties) {
    if (until <= sim.time) continue;
    const left = String(Math.ceil((until - sim.time) / YEAR));
    let other = '';
    if (key.startsWith('v')) {
      const ids = key.split('|').map((x) => Number(x.slice(1)));
      if (!ids.includes(v.id) || key !== feudKey(ids[0], ids[1])) continue;
      const o = sim.villages.find((x) => x.id === (ids[0] === v.id ? ids[1] : ids[0]));
      other = o ? c.village(o) : '';
    } else {
      const [a, b] = key.split('|') as [People, People];
      if (a !== v.people && b !== v.people) continue;
      if (key !== pairKey(a, b)) continue;
      other = esc(c.peoples[a === v.people ? b : a]);
    }
    if (other) lines.push(`<p class="ti-v__line">📜 ${esc(S.treaty.replace('{n}', left)).replace('{x}', other)}</p>`);
  }
  return lines.join('');
}

function culture(c: VillageCtx, v: Village): string {
  const { sim, S, esc } = c;
  const works = worksIn(sim, v);
  const lines: string[] = [];
  if (festiveAt(v, sim)) lines.push(`<p class="ti-v__line is-good">${esc(S.festivalNow)}</p>`);
  else if (v.nextFestival !== undefined && v.members >= 6) {
    const years = Math.max(1, Math.round((v.nextFestival - sim.time) / YEAR));
    lines.push(`<p class="ti-v__line">🎉 ${esc(years === 1 ? S.festivalNextOne : S.festivalNext.replace('{n}', String(years)))}</p>`);
  }
  if (!works.length) lines.push(`<p class="ti-v__line">${esc(S.noWorks)}</p>`);
  else {
    lines.push(`<p class="ti-v__line">🎨 ${esc(plural(S.works, works.length))}</p>`);
    const icons = { song: '🎵', mural: '🖼️', statue: '🗿' };
    for (const w of works.slice(-3).reverse()) lines.push(`<p class="ti-v__line ti-v__work">${icons[w.kind]} “${esc(c.workTitle(w))}”</p>`);
  }
  return lines.join('');
}

/** The latest chronicle lines about this place; a click jumps there. */
function events(c: VillageCtx, v: Village): string {
  const list = c.sim.chronicle.entries.filter((e) => e.v === v.name || e.w === v.name).slice(0, 6);
  const items = list.length ? list.map((e) => c.entry(e.id)).join('') : `<li class="ti-v__line">${c.esc(c.S.noEvents)}</li>`;
  return `<h3 class="ti-p__h">${c.esc(c.S.sections.events)}</h3><ol class="ti-p__story ti-v__events">${items}</ol>`;
}
