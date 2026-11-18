/**
 * The two panels for watching stories: the profile of the selected person
 * (left) and the chronicle (right). Both are plain DOM, refreshed a few
 * times a second; the chronicle only when something new happened.
 * Clicking a name opens that person, clicking a chronicle entry jumps there.
 */
import { ageOf, stage, type Human, type People, type StoryEntry, type Trait } from './agents';
import type { Camera } from './camera';
import type { ChronicleEntry, Ref } from './chronicle';
import type { Sim } from './sim';
import { FRIEND, RIVAL } from './social';
import { villageOf } from './villages';
import { moodOf, warBetween } from './war';
import { chartSvg, indexAt, tipText, CHART_W } from './stats';
import { PEOPLES } from './agents';
import { TILE } from './world';

export interface PanelStrings {
  age: string;
  peoples: Record<People, string>;
  traits: Record<Trait, string>;
  chronicle: {
    empty: string;
    year: string;
    couple: string;
    birth: string;
    adopt: string;
    brawl: string;
    village: string;
    resettle: string;
    leader: string;
    split: string;
    ruin: string;
    war: string;
    warVillage: string;
    peace: string;
    conquest: string;
    died: Record<string, string>;
  };
  rules: {
    none: string;
    atWar: string;
    moods: Record<'friendly' | 'neutral' | 'tense' | 'hostile', string>;
  };
  profile: {
    woman: string;
    man: string;
    girl: string;
    boy: string;
    partner: string;
    parents: string;
    children: string;
    friends: string;
    rivals: string;
    life: string;
    follow: string;
    following: string;
    village: string;
    leader: string;
    noVillage: string;
    favorite: string;
    none: string;
    dead: string;
    needs: Record<'hunger' | 'energy' | 'social', string>;
    story: Record<StoryEntry['kind'], string>;
  };
  year: string;
  statsEmpty: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Panels {
  selected: number | null = null;
  following = false;
  private readonly profile: HTMLElement;
  private readonly list: HTMLElement;
  private readonly ac = new AbortController();
  private chronicleShown = -1;
  private favShown = '';
  private profileAt = 0;
  private rulesAt = 0;
  private statsKey = '';
  private statsHover = -1;
  private relationsShown = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly S: PanelStrings,
    private readonly sim: Sim,
    private readonly cam: Camera,
  ) {
    this.profile = root.querySelector<HTMLElement>('[data-profile]')!;
    this.list = root.querySelector<HTMLElement>('[data-chron-list]')!;
    const chron = root.querySelector<HTMLElement>('[data-chron]')!;
    // Open by default only where there is room for it
    chron.hidden = !window.matchMedia('(min-width: 1100px)').matches;
    this.syncToggle();

    // Hovering the chart shows the numbers of one year
    const stats = root.querySelector<HTMLElement>('[data-stats]');
    if (stats) {
      stats.addEventListener(
        'pointermove',
        (e) => {
          const r = stats.getBoundingClientRect();
          this.statsHover = indexAt(this.sim.history, ((e.clientX - r.left) / r.width) * CHART_W);
          this.renderStats(true);
        },
        { signal: this.ac.signal },
      );
      stats.addEventListener(
        'pointerleave',
        () => {
          this.statsHover = -1;
          this.renderStats(true);
        },
        { signal: this.ac.signal },
      );
    }

    root.addEventListener(
      'click',
      (e) => {
        const t = e.target as Element;
        const person = t.closest<HTMLElement>('[data-person]');
        const entry = t.closest<HTMLElement>('[data-entry]');
        if (person) {
          const id = Number(person.dataset.person);
          this.select(id);
          this.centerOn(id);
        } else if (entry) {
          this.jump(Number(entry.dataset.entry));
        } else if (t.closest('[data-p-close]')) {
          this.select(null);
        } else if (t.closest('[data-p-follow]')) {
          this.following = !this.following;
          this.profileAt = 0;
        } else if (t.closest('[data-p-fav]') && this.selected !== null) {
          const fav = this.sim.favorites;
          if (fav.has(this.selected)) fav.delete(this.selected);
          else fav.add(this.selected);
          this.profileAt = 0;
        } else if (t.closest('[data-chron-toggle]')) {
          chron.hidden = !chron.hidden;
          // Phones: one panel at a time
          if (!chron.hidden && this.narrow()) this.select(null);
          this.syncToggle();
        }
      },
      { signal: this.ac.signal },
    );
  }

  destroy() {
    this.ac.abort();
  }

  private syncToggle() {
    const open = !this.root.querySelector<HTMLElement>('[data-chron]')!.hidden;
    this.root.querySelector('[data-chron-toggle]')?.setAttribute('aria-expanded', String(open));
  }

  private narrow() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  select(id: number | null) {
    if (id !== this.selected) this.following = false;
    this.selected = id;
    this.profileAt = 0;
    this.profile.hidden = id === null;
    if (id !== null && this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
    }
  }

  stopFollow() {
    if (this.following) {
      this.following = false;
      this.profileAt = 0;
    }
  }

  private centerOn(id: number) {
    const a = this.sim.byId(id);
    if (!a) return;
    this.cam.x = a.x * TILE;
    this.cam.y = a.y * TILE;
    this.cam.zoom = Math.max(this.cam.zoom, 3);
    this.cam.clamp();
  }

  private jump(entryId: number) {
    const e = this.sim.chronicle.entries.find((x) => x.id === entryId);
    if (!e) return;
    this.cam.x = e.x * TILE;
    this.cam.y = e.y * TILE;
    this.cam.zoom = Math.max(this.cam.zoom, 3);
    this.cam.clamp();
    if (this.sim.byId(e.a.id)) this.select(e.a.id);
  }

  /** Called every frame: keeps the camera on whoever is followed, refreshes the panels. */
  update(now: number) {
    if (this.selected !== null) {
      const a = this.sim.byId(this.selected);
      if (a && this.following) {
        this.cam.x = a.x * TILE;
        this.cam.y = a.y * TILE;
        this.cam.clamp();
      }
      if (!a) this.following = false;
      if (now - this.profileAt > 250) {
        this.profileAt = now;
        this.renderProfile();
      }
    }
    if (now - this.rulesAt > 500) {
      this.rulesAt = now;
      this.renderRelations();
      this.renderStats(false);
    }
    const favKey = [...this.sim.favorites].join(',');
    if (this.sim.chronicle.version !== this.chronicleShown || favKey !== this.favShown) {
      this.chronicleShown = this.sim.chronicle.version;
      this.favShown = favKey;
      this.renderChronicle();
    }
  }

  /* ---- profile ---------------------------------------------------------------- */

  /** A name: a button if they are alive, a plain "† name" if not. */
  private person(id: number): string {
    const alive = this.sim.byId(id);
    const r = this.sim.registry.get(id);
    if (!r) return '';
    if (alive) return `<button type="button" class="ti-link" data-person="${id}">${esc(r.name)}</button>`;
    return `<span class="ti-dead">† ${esc(r.name)}</span>`;
  }

  private people(ids: number[]): string {
    const out = ids.map((id) => this.person(id)).filter(Boolean);
    return out.length ? out.join(', ') : this.S.profile.none;
  }

  private renderProfile() {
    const P = this.S.profile;
    const id = this.selected;
    if (id === null) return;
    const h = this.sim.byId(id) as Human | undefined;
    const r = this.sim.registry.get(id);
    if (!r) return;
    const fav = this.sim.favorites.has(id);
    if (!h) {
      this.profile.innerHTML = `
        <header class="ti-p__head"><h2 class="ti-p__name">† ${esc(r.name)}</h2><button type="button" class="ti-p__close" data-p-close aria-label="×">×</button></header>
        <p class="ti-p__meta">${esc(this.S.peoples[r.people])} · ${esc(P.dead)}</p>`;
      return;
    }
    const age = Math.floor(ageOf(h, this.sim.time));
    const village = villageOf(h, this.sim);
    const kid = stage(h, this.sim.time) === 'child';
    const sex = h.female ? (kid ? P.girl : P.woman) : kid ? P.boy : P.man;
    const friends: number[] = [];
    const rivals: number[] = [];
    for (const [oid, v] of [...h.rel.entries()].sort((a, b) => b[1] - a[1])) {
      if (!this.sim.byId(oid)) continue;
      if (v >= FRIEND && friends.length < 5) friends.push(oid);
      if (v <= RIVAL && rivals.length < 5) rivals.push(oid);
    }
    const bar = (label: string, v: number) =>
      `<div class="ti-p__need"><span>${esc(label)}</span><span class="ti-p__bar"><span style="width:${Math.round(v)}%"></span></span></div>`;
    const story = [...h.story]
      .reverse()
      .map((s) => `<li><span class="ti-p__yr">${esc(this.S.year.replace('{n}', String(s.year)))}</span> ${esc(P.story[s.kind].replace('{o}', s.other ?? ''))}</li>`)
      .join('');
    this.profile.innerHTML = `
      <header class="ti-p__head">
        <h2 class="ti-p__name">${esc(h.name)}</h2>
        <button type="button" class="ti-p__close" data-p-close aria-label="×">×</button>
      </header>
      <p class="ti-p__meta"><span class="ti-p__dot ti-dot--${h.people}"></span>${esc(this.S.peoples[h.people])} · ${esc(sex)} · ${esc(this.S.age.replace('{n}', String(age)))}</p>
      <p class="ti-p__traits">${h.traits.map((t) => `<span>${esc(this.S.traits[t])}</span>`).join('')}</p>
      <p class="ti-p__village">🏠 ${village ? `<b>${esc(village.name)}</b>${village.leader === h.id ? ` · 👑 ${esc(P.leader)}` : ''}` : esc(P.noVillage)}</p>
      ${bar(P.needs.hunger, h.hunger)}${bar(P.needs.energy, h.energy)}${bar(P.needs.social, h.social)}
      <dl class="ti-p__fam">
        <dt>${esc(P.partner)}</dt><dd>${h.partner !== undefined ? this.person(h.partner) : P.none}</dd>
        <dt>${esc(P.parents)}</dt><dd>${this.people(h.parents)}</dd>
        <dt>${esc(P.children)}</dt><dd>${this.people(h.children)}</dd>
        <dt>${esc(P.friends)}</dt><dd>${this.people(friends)}</dd>
        <dt>${esc(P.rivals)}</dt><dd>${this.people(rivals)}</dd>
      </dl>
      <div class="ti-p__actions">
        <button type="button" class="ti-p__btn" data-p-follow aria-pressed="${this.following}">${esc(this.following ? P.following : P.follow)}</button>
        <button type="button" class="ti-p__btn" data-p-fav aria-pressed="${fav}">${fav ? '★' : '☆'} ${esc(P.favorite)}</button>
      </div>
      <h3 class="ti-p__h">${esc(P.life)}</h3>
      <ol class="ti-p__story">${story}</ol>`;
  }

  /* ---- population chart ------------------------------------------------------- */

  private renderStats(force: boolean) {
    const box = this.root.querySelector<HTMLElement>('[data-stats]');
    const tip = this.root.querySelector<HTMLElement>('[data-stats-tip]');
    if (!box || box.closest('[hidden]')) return;
    const h = this.sim.history;
    const last = h[h.length - 1];
    const key = `${this.sim.world.seed}:${h.length}:${last?.year}:${last ? Object.values(last.counts).join('-') : ''}:${this.statsHover}`;
    if (!force && key === this.statsKey) return;
    this.statsKey = key;
    // The legend lists only the peoples that have lived here
    this.root.querySelectorAll<HTMLElement>('[data-legend]').forEach((el) => {
      const p = el.dataset.legend as keyof typeof this.S.peoples;
      el.hidden = !h.some((snap) => snap.counts[p] > 0);
    });
    const svg = chartSvg(h, this.S.peoples, this.S.chronicle.year, this.statsHover);
    box.innerHTML = svg || `<p class="ti-s__empty">${esc(this.S.statsEmpty)}</p>`;
    if (tip) {
      const s = h[this.statsHover];
      tip.textContent = s ? tipText(s, this.S.peoples, this.S.chronicle.year) : '';
      tip.hidden = !s;
    }
  }

  /* ---- relations (Rules tab) ---------------------------------------------------- */

  /** One line per pair of peoples that both have villages: mood bar, word, war badge. */
  private renderRelations() {
    const box = this.root.querySelector<HTMLElement>('[data-relations]');
    if (!box || box.closest('[hidden]')) return;
    const present = PEOPLES.filter((p) => this.sim.villages.some((v) => !v.ruin && v.people === p));
    const rows: string[] = [];
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        const m = Math.round(moodOf(this.sim, a, b));
        const war = !!warBetween(this.sim, a, b);
        const M = this.S.rules.moods;
        const word = m > 30 ? M.friendly : m > -30 ? M.neutral : m > -60 ? M.tense : M.hostile;
        const pct = (m + 100) / 2;
        rows.push(
          `<li class="ti-r${war ? ' is-war' : ''}"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${a}"></span>${esc(this.S.peoples[a])} · <span class="ti-p__dot ti-dot--${b}"></span>${esc(this.S.peoples[b])}</span>` +
            `<span class="ti-r__bar"><span style="left:${pct}%"></span></span><span class="ti-r__word">${war ? `⚔️ ${esc(this.S.rules.atWar)}` : `${esc(word)} ${m > 0 ? '+' : ''}${m}`}</span></li>`,
        );
      }
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(this.S.rules.none)}</li>`;
    if (html !== this.relationsShown) {
      this.relationsShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- chronicle ------------------------------------------------------------- */

  private ref(r: Ref | undefined) {
    return r ? `<b>${esc(r.name)}</b> (${esc(this.S.peoples[r.people])})` : '';
  }

  text(e: ChronicleEntry): string {
    const C = this.S.chronicle;
    const tpl = e.kind === 'died' ? (C.died[e.cause ?? ''] ?? C.died.other) : e.kind === 'war' && !e.a.id ? C.warVillage : C[e.kind];
    return esc(tpl)
      .replace('{a}', this.ref(e.a))
      .replace('{b}', this.ref(e.b))
      .replace('{c}', this.ref(e.c))
      .replace('{n}', String(e.n ?? ''))
      .replace('{v}', `<b>${esc(e.v ?? '')}</b>`)
      .replace('{w}', `<b>${esc(e.w ?? '')}</b>`)
      .replace('{p}', e.p ? `<b>${esc(this.S.peoples[e.p])}</b>` : '')
      .replace('{q}', e.q ? `<b>${esc(this.S.peoples[e.q])}</b>` : '');
  }

  private renderChronicle() {
    const entries = this.sim.chronicle.entries;
    if (!entries.length) {
      this.list.innerHTML = `<li class="ti-c__empty">${esc(this.S.chronicle.empty)}</li>`;
      return;
    }
    const fav = this.sim.favorites;
    this.list.innerHTML = entries
      .map((e) => {
        const star = [e.a, e.b, e.c].some((r) => r && fav.has(r.id));
        return `<li><button type="button" class="ti-c__entry${star ? ' is-fav' : ''} ti-c--${e.kind}" data-entry="${e.id}"><span class="ti-c__yr">${esc(this.S.chronicle.year.replace('{n}', String(e.year)))}</span> ${this.text(e)}</button></li>`;
      })
      .join('');
  }
}
