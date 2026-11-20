/**
 * A profile for every house and building (Update 3): click one on the map and
 * the profile shows what it is, what it does, who lives or works there and
 * what is going on (animals in a pen, books in a library, the last trade of a
 * market …). Building sites and world wonders too.
 */
import { stage, type Human, type People } from './agents';
import type { Sim } from './sim';
import { HALF_SIZE, type Building, type BuildingKind } from './town';
import type { Village } from './villages';
import { penned } from './pens';
import { progressOf, WONDER_SIZE, type Wonder } from './wonders';
import { wallMax } from './war';
import { BALANCE } from './balance';
import { plural, type Forms } from './village-panel';

/** What was clicked: a house, a special building, a site, a wonder (tile of the thing). */
export interface BuildingRef {
  kind: 'house' | 'building' | 'site' | 'wonder';
  village: number;
  x: number;
  y: number;
  /** Wonders: their id. */
  id?: number;
}

export interface BuildingStrings {
  houses: string[];
  yurts: string[];
  site: string;
  siteHouse: string;
  of: string;
  lives: string;
  empty: string;
  children: Forms;
  does: Record<string, string>;
  animals: string;
  stone: string;
  fence: string;
  workers: Record<string, string>;
  fields: string;
  trade: string;
  noTrade: string;
  ships: Forms;
  books: Forms;
  latest: string;
  faith: string;
  noFaith: string;
  works: string;
  food: string;
  tools: string;
  soldiers: Forms;
  wall: string;
  land: string;
  lines: Forms;
  seat: string;
  wonder: string;
  building: string;
  builtBy: string;
}

/** Which house or building is at (x, y) (tiles, fractions allowed)? Sprites stand on their tile and reach up a bit. */
export function buildingAt(sim: Sim, x: number, y: number): BuildingRef | null {
  const hit = (bx: number, by: number, half = 0) => x >= bx - 0.45 - half && x <= bx + 1.45 + half && y >= by - 1.3 - half && y <= by + 1 + half;
  let best: { ref: BuildingRef; d: number } | null = null;
  const take = (ref: BuildingRef, bx: number, by: number) => {
    const d = Math.hypot(x - (bx + 0.5), y - (by + 0.2));
    if (!best || d < best.d) best = { ref, d };
  };
  for (const v of sim.villages) {
    if (v.merged) continue;
    for (const b of v.buildings) {
      if (b.kind === 'wall') continue;
      const half = HALF_SIZE[b.kind] ?? 0;
      if (hit(b.x, b.y, half)) take({ kind: 'building', village: v.id, x: b.x, y: b.y }, b.x, b.y);
    }
    for (const h of v.houses) if (hit(h.x, h.y)) take({ kind: 'house', village: v.id, x: h.x, y: h.y }, h.x, h.y);
    if (v.site && !v.site.house && hit(v.site.x, v.site.y)) take({ kind: 'site', village: v.id, x: v.site.x, y: v.site.y }, v.site.x, v.site.y);
  }
  if (best) return (best as { ref: BuildingRef }).ref;
  for (const w of sim.wonders) {
    if (x >= w.x && x <= w.x + WONDER_SIZE && y >= w.y - 1.5 && y <= w.y + WONDER_SIZE) return { kind: 'wonder', village: w.village, x: w.x, y: w.y, id: w.id };
  }
  return null;
}

export interface BuildingCtx {
  sim: Sim;
  S: BuildingStrings;
  esc: (s: string) => string;
  buildings: Record<string, string>;
  peoples: Record<People, string>;
  life: Record<string, string>;
  jobs: Record<string, string>;
  royal: { king: string; queen: string };
  wonderName: (w: Wonder) => string;
  faithName: (id: number) => string;
  person: (id: number) => string;
  village: (v: Village) => string;
}

/** The profile of a house, building, site or wonder; null when it is gone. */
export function buildingHtml(c: BuildingCtx, ref: BuildingRef): string | null {
  const { sim, S, esc } = c;
  const v = sim.villages.find((x) => x.id === ref.village);
  const head = (title: string, people?: People) => `
    <header class="ti-p__head">
      <h2 class="ti-p__name">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</h2>
      <button type="button" class="ti-p__close" data-p-close aria-label="×">×</button>
    </header>
    ${v ? `<p class="ti-p__meta"><span class="ti-p__dot ti-dot--${people ?? v.people}"></span>${esc(S.of).replace('{v}', c.village(v))}</p>` : ''}`;
  const line = (icon: string, html: string) => `<p class="ti-v__line">${icon} ${html}</p>`;
  const names = (list: Human[]) => list.map((h) => c.person(h.id)).join(', ');

  if (ref.kind === 'wonder') {
    const w = sim.wonders.find((x) => x.id === ref.id);
    if (!w) return null;
    const done = w.finished !== undefined && !w.ruin;
    return (
      head(c.wonderName(w), w.people) +
      line('🏛️', esc(S.wonder)) +
      (done ? line('📜', esc(S.builtBy.replace('{p}', c.peoples[w.people]).replace('{y}', String(w.finished)))) : line('🏗️', esc(S.building.replace('{n}', String(Math.floor(progressOf(w) * 100))))))
    );
  }
  if (!v) return null;
  const members = sim.humans.filter((h) => h.village === v.id && !h.dead);

  if (ref.kind === 'site') {
    const s = v.site;
    if (!s || s.x !== ref.x || s.y !== ref.y) return null;
    const what = s.kind ? (c.buildings[s.kind] ?? s.kind) : S.siteHouse;
    const pct = Math.floor((s.done / Math.max(1, s.needed)) * 100);
    const builders = members.filter((h) => h.job === 'builder');
    return head(S.site.replace('{b}', what).replace('{n}', String(pct))) + (builders.length ? line('🔨', names(builders)) : '');
  }

  if (ref.kind === 'house') {
    const house = v.houses.find((h) => h.x === ref.x && h.y === ref.y);
    if (!house) return null;
    const title = (v.people === 'steppe' && house.level <= 1 ? S.yurts : S.houses)[house.level] ?? S.houses[0];
    const owners = house.owners.map((id) => sim.byId(id) as Human | undefined).filter((h): h is Human => !!h);
    const kids = members.filter((h) => stage(h, sim.time) === 'child' && h.parents.some((p) => house.owners.includes(p)));
    const upgrade = v.site?.house === house ? line('🏗️', esc(S.site.replace('{b}', (S.houses[v.site.level] ?? '').toLowerCase()).replace('{n}', String(Math.floor((v.site.done / Math.max(1, v.site.needed)) * 100))))) : '';
    return (
      head(title) +
      (owners.length ? line('🏠', `${esc(S.lives)}: ${names(owners)}`) : line('🏠', esc(S.empty))) +
      (kids.length ? line('👶', `${esc(plural(S.children, kids.length))}: ${names(kids)}`) : '') +
      upgrade
    );
  }

  const b = v.buildings.find((x) => x.x === ref.x && x.y === ref.y);
  if (!b) return null;
  return head(c.buildings[b.kind] ?? b.kind) + line('ℹ️', esc(S.does[b.kind] ?? '')) + details(c, v, b, members, line, names);
}

/** What is going on in and around a building. */
function details(c: BuildingCtx, v: Village, b: Building, members: Human[], line: (i: string, h: string) => string, names: (l: Human[]) => string): string {
  const { sim, S, esc } = c;
  const workers = (job: string) => members.filter((h) => h.job === job);
  const role = (r: Human['role']) => members.filter((h) => h.role === r);
  const who = (label: string, list: Human[]) => (list.length ? line('👥', `${esc(label)}: ${names(list)}`) : '');
  const out: string[] = [];
  const kind: BuildingKind = b.kind;
  switch (kind) {
    case 'pen': {
      const herd = penned(sim, b).length;
      if (b.animal) out.push(line('🐾', esc(S.animals.replace('{n}', String(herd)).replace('{m}', String(BALANCE.pens.limit)).replace('{a}', c.life[b.animal] ?? b.animal))));
      out.push(line(b.stone ? '🧱' : '🪵', esc(b.stone ? S.stone : S.fence)));
      out.push(who(S.workers.shepherd, workers('shepherd')));
      break;
    }
    case 'farm':
    case 'windmill': {
      const plots = (v.plots ?? []).filter((p) => Math.hypot(p.x + 2 - b.x, p.y + 1.5 - b.y) < 9);
      out.push(line('🌾', esc(S.fields.replace('{n}', String(v.fields)).replace('{r}', String(v.ripe)))));
      if (kind === 'farm' && plots.length) out.push(who(S.workers.farmer, workers('farmer').slice(0, 6)));
      break;
    }
    case 'market':
      out.push(line('⚖️', esc(v.tradedWith ? S.trade.replace('{v}', v.tradedWith) : S.noTrade)));
      break;
    case 'harbor': {
      const ships = sim.ships.filter((s) => s.home === v.id).length;
      out.push(line('⛵', esc(plural(S.ships, ships))));
      break;
    }
    case 'library': {
      const books = sim.books.filter((x) => x.village === v.id);
      out.push(line('📚', esc(plural(S.books, books.length))));
      if (books.length) out.push(line('📖', esc(S.latest.replace('{t}', `“${books[books.length - 1].title}”`))));
      out.push(who(S.workers.philosopher, role('philosopher')));
      break;
    }
    case 'university':
      out.push(who(S.workers.philosopher, role('philosopher')));
      break;
    case 'museum':
      out.push(line('🖼️', esc(S.works.replace('{w}', String(sim.works.filter((w) => w.village === v.id).length)).replace('{t}', String(v.trophies ?? 0)))));
      break;
    case 'theater':
      out.push(who(S.workers.actor, role('actor')));
      break;
    case 'tavern':
      out.push(who(S.workers.musician, role('musician')));
      break;
    case 'temple':
    case 'altar':
    case 'cathedral':
      out.push(line('✨', v.faith !== undefined ? esc(S.faith).replace('{r}', c.faithName(v.faith)) : esc(S.noFaith)));
      out.push(who(S.workers.priest, workers('priest')));
      break;
    case 'smithy':
      out.push(line('🛠️', esc(S.tools.replace('{n}', String(v.tools)))));
      out.push(who(S.workers.smith, workers('smith')));
      break;
    case 'barracks':
      out.push(line('⚔️', esc(plural(S.soldiers, workers('soldier').length))));
      break;
    case 'granary':
    case 'warehouse':
    case 'smokehouse':
      out.push(line('🧺', esc(S.food.replace('{n}', String(Math.round(v.food))))));
      break;
    case 'castle': {
      const full = wallMax(sim, v);
      out.push(line('🚩', esc(S.land.replace('{n}', String(v.landBonus ?? 0)))));
      if (v.buildings.some((x) => x.kind === 'wall')) out.push(line('🧱', esc(S.wall.replace('{n}', String(Math.round(((v.wallHp ?? full) / full) * 100))))));
      break;
    }
    case 'station':
      out.push(line('🚂', esc(plural(S.lines, sim.railways.filter((r) => r.key.split('|').includes(String(v.id))).length))));
      break;
    case 'palace': {
      const k = sim.kingdoms.get(v.people);
      const king = k?.king !== undefined ? (sim.byId(k.king) as Human | undefined) : undefined;
      if (king) out.push(line('👑', esc(S.seat).replace('{r}', esc(king.female ? c.royal.queen : c.royal.king)).replace('{a}', c.person(king.id))));
      break;
    }
    case 'townhall':
      if (v.leader !== undefined) out.push(line('👑', c.person(v.leader)));
      break;
    default:
      break;
  }
  return out.join('');
}
