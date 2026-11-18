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
import { allied, moodOf, pairKey, warBetween } from './war';
import { crown, depose, kingOf, loyaltyOf, realmOf } from './kingdoms';
import { blessedPlace, celebrate, culturedPeoples, giftBuilding, giftBuildingAt, giftFestival, type Work } from './culture';
import { villageHtml, type VillageStrings } from './village-panel';
import type { Village } from './villages';
import { chartSvg, indexAt, tipText, CHART_W } from './stats';
import { COSTS, gift, INVENTIONS, nextInvention, researchRate, techOf } from './inventions';
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
    tier: Record<string, string>;
    building: string;
    invention: string;
    inventionPeople: string;
    peaceTribute: string;
    feudPeace: string;
    feudTribute: string;
    feud: string;
    army: string;
    breach: string;
    subdued: string;
    alliance: string;
    allianceEnd: string;
    joinWar: string;
    kingdom: string;
    succession: string;
    newDynasty: string;
    capital: string;
    revolt: string;
    overthrown: string;
    returned: string;
    godCrowned: string;
    godDeposed: string;
    fall: string;
    artwork: Record<'song' | 'mural' | 'statue', string>;
    legend: string;
    festival: Record<string, string>;
    gift: string;
    died: Record<string, string>;
  };
  rules: {
    none: string;
    atWar: string;
    moods: Record<'friendly' | 'neutral' | 'tense' | 'hostile', string>;
    techNone: string;
    allies: string;
    treaty: string;
    feud: string;
    next: string;
    allKnown: string;
    gift: string;
    giftTitle: string;
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
  jobs: Record<string, string>;
  buildings: Record<string, string>;
  inventions: Record<string, { name: string; icon: string; does: string }>;
  weapons: Record<string, string>;
  armor: string;
  tiers: Record<string, string>;
  village: VillageStrings;
  culture: {
    none: string;
    works: string;
    legends: string;
    noLegends: string;
    latest: string;
    festival: string;
    festivalTitle: string;
    donate: string;
    donateTitle: string;
    epithets: Record<string, string>;
    titles: Record<'song' | 'mural' | 'statue', Record<string, string>>;
    adjectives: string[];
    nouns: Record<People, string[]>;
    icons: Record<'song' | 'mural' | 'statue', string>;
  };
  kingdoms: {
    none: string;
    king: string;
    queen: string;
    royal: { king: string; queen: string };
    noKing: string;
    house: string;
    capital: string;
    vassals: string;
    loyalty: string;
    rebels: string;
    kingOf: string;
    crown: string;
    crownTitle: string;
    depose: string;
    deposeTitle: string;
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Panels {
  selected: number | null = null;
  following = false;
  /** The place whose profile is open (instead of a person), if any. */
  selectedVillage: number | null = null;
  private readonly profile: HTMLElement;
  private readonly list: HTMLElement;
  private readonly ac = new AbortController();
  private chronicleShown = -1;
  private favShown = '';
  private profileAt = 0;
  /** Last profile markup, and whether a button in it is being pressed (then it must not be replaced). */
  private profileShown = '';
  private pressedAt = 0;
  private rulesAt = 0;
  private statsKey = '';
  private statsHover = -1;
  private relationsShown = '';
  private techShown = '';
  private kingdomsShown = '';
  private cultureShown = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly S: PanelStrings,
    private readonly sim: Sim,
    private readonly cam: Camera,
  ) {
    this.profile = root.querySelector<HTMLElement>('[data-profile]')!;
    // Redrawing the profile between press and release would swallow the click
    this.profile.addEventListener('pointerdown', () => (this.pressedAt = performance.now()), { signal: this.ac.signal });
    window.addEventListener('pointerup', () => (this.pressedAt = 0), { signal: this.ac.signal });
    window.addEventListener('pointercancel', () => (this.pressedAt = 0), { signal: this.ac.signal });
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
        const place = t.closest<HTMLElement>('[data-village]');
        const vAction = t.closest<HTMLElement>('[data-v-show], [data-v-festival], [data-v-donate]');
        if (place) {
          // A place name anywhere: open its profile and look at it
          const id = Number(place.dataset.village);
          this.selectVillage(id);
          this.showVillage(id);
        } else if (vAction) {
          const id = Number(vAction.dataset.vShow ?? vAction.dataset.vFestival ?? vAction.dataset.vDonate);
          const v = this.sim.villages.find((x) => x.id === id);
          if (v && vAction.dataset.vShow) this.showVillage(id);
          // God gifts for this very place
          else if (v && vAction.dataset.vFestival) celebrate(this.sim, v, 'gods');
          else if (v && vAction.dataset.vDonate) giftBuildingAt(this.sim, v);
          this.profileAt = 0;
          this.rulesAt = 0;
        } else if (person) {
          const id = Number(person.dataset.person);
          this.select(id);
          this.centerOn(id);
        } else if (entry) {
          this.jump(Number(entry.dataset.entry));
        } else if (t.closest('[data-festival]')) {
          // God gifts: a festival or a building for the people's biggest place
          giftFestival(this.sim, t.closest<HTMLElement>('[data-festival]')!.dataset.festival as People);
          this.rulesAt = 0;
        } else if (t.closest('[data-donate]')) {
          giftBuilding(this.sim, t.closest<HTMLElement>('[data-donate]')!.dataset.donate as People);
          this.rulesAt = 0;
        } else if (t.closest('[data-gift]')) {
          // God gift: the next invention for that people, right away
          gift(this.sim, t.closest<HTMLElement>('[data-gift]')!.dataset.gift as People);
          this.rulesAt = 0;
        } else if (t.closest('[data-p-close]')) {
          this.select(null);
        } else if (t.closest('[data-p-follow]')) {
          this.following = !this.following;
          this.profileAt = 0;
        } else if (t.closest('[data-p-crown]') && this.selected !== null) {
          // God gift: crown this person
          const h = this.sim.byId(this.selected) as Human | undefined;
          if (h) crown(this.sim, h);
          this.profileAt = 0;
          this.rulesAt = 0;
        } else if (t.closest('[data-p-depose]') && this.selected !== null) {
          // God gift: take the crown away
          const k = realmOf(this.sim, this.selected);
          if (k) depose(this.sim, k);
          this.profileAt = 0;
          this.rulesAt = 0;
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
    this.selectedVillage = null;
    this.profileAt = 0;
    this.profile.hidden = id === null;
    if (id !== null && this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
    }
  }

  /** Opens the profile of a place. */
  selectVillage(id: number) {
    this.select(null);
    this.selectedVillage = id;
    this.profile.hidden = false;
    if (this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
    }
  }

  /** Moves the camera to a place. */
  private showVillage(id: number) {
    const v = this.sim.villages.find((x) => x.id === id);
    if (!v) return;
    this.cam.x = (v.x + 0.5) * TILE;
    this.cam.y = (v.y + 0.5) * TILE;
    this.cam.zoom = Math.max(this.cam.zoom, 3);
    this.cam.clamp();
  }

  /** A place name that opens its profile (a button; inside chronicle buttons a span). */
  private villageLink(v: Village, inline = false): string {
    return inline
      ? `<b class="ti-vlink" data-village="${v.id}">${esc(v.name)}</b>`
      : `<button type="button" class="ti-link" data-village="${v.id}">${esc(v.name)}</button>`;
  }

  /** One line of the chronicle (also used in the village profile). */
  private entryHtml(e: ChronicleEntry): string {
    const star = [e.a, e.b, e.c].some((r) => r && this.sim.favorites.has(r.id));
    return `<li><button type="button" class="ti-c__entry${star ? ' is-fav' : ''} ti-c--${e.kind}" data-entry="${e.id}"><span class="ti-c__yr">${esc(this.S.chronicle.year.replace('{n}', String(e.year)))}</span> ${this.text(e)}</button></li>`;
  }

  private renderVillage() {
    const v = this.sim.villages.find((x) => x.id === this.selectedVillage);
    if (!v) {
      this.select(null);
      return;
    }
    this.setProfile(
      villageHtml(
        {
          sim: this.sim,
          S: this.S.village,
          esc,
          peoples: this.S.peoples,
          tiers: this.S.tiers,
          jobs: this.S.jobs,
          buildings: this.S.buildings,
          inventions: this.S.inventions,
          royal: this.S.kingdoms.royal,
          year: this.S.year,
          person: (id) => this.person(id),
          village: (x) => this.villageLink(x),
          workTitle: (w) => this.workTitle(w),
          entry: (id) => {
            const e = this.sim.chronicle.entries.find((x) => x.id === id);
            return e ? this.entryHtml(e) : '';
          },
        },
        v,
      ),
    );
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
    if (this.selectedVillage !== null && now - this.profileAt > 250) {
      this.profileAt = now;
      this.renderVillage();
    }
    if (now - this.rulesAt > 500) {
      this.rulesAt = now;
      this.renderRelations();
      this.renderTech();
      this.renderKingdoms();
      this.renderCulture();
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
      this.setProfile(`
        <header class="ti-p__head"><h2 class="ti-p__name">† ${esc(r.name)}</h2><button type="button" class="ti-p__close" data-p-close aria-label="×">×</button></header>
        <p class="ti-p__meta">${esc(this.S.peoples[r.people])} · ${esc(P.dead)}</p>`);
      return;
    }
    const age = Math.floor(ageOf(h, this.sim.time));
    const village = villageOf(h, this.sim);
    const kid = stage(h, this.sim.time) === 'child';
    const sex = h.female ? (kid ? P.girl : P.woman) : kid ? P.boy : P.man;
    const K = this.S.kingdoms;
    const realm = realmOf(this.sim, h.id);
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
      .map((s) => {
        const work = s.kind === 'artwork' ? this.sim.works.find((w) => String(w.id) === s.other) : undefined;
        const other =
          s.kind === 'invented'
            ? (this.S.inventions[s.other ?? '']?.name ?? '')
            : s.kind === 'artwork'
              ? work
                ? this.workTitle(work)
                : '…'
              : (s.other ?? '');
        return `<li><span class="ti-p__yr">${esc(this.S.year.replace('{n}', String(s.year)))}</span> ${esc(P.story[s.kind].replace('{o}', other))}</li>`;
      })
      .join('');
    this.setProfile(`
      <header class="ti-p__head">
        <h2 class="ti-p__name">${esc(h.name)}</h2>
        <button type="button" class="ti-p__close" data-p-close aria-label="×">×</button>
      </header>
      <p class="ti-p__meta"><span class="ti-p__dot ti-dot--${h.people}"></span>${esc(this.S.peoples[h.people])} · ${esc(sex)} · ${esc(this.S.age.replace('{n}', String(age)))}</p>
      ${realm ? `<p class="ti-p__royal">👑 ${esc(K.kingOf.replace('{r}', h.female ? K.queen : K.king).replace('{p}', this.S.peoples[realm.people]))} · ${esc(K.house.replace('{d}', realm.dynasty))}</p>` : ''}
      <p class="ti-p__traits">${h.traits.map((t) => `<span>${esc(this.S.traits[t])}</span>`).join('')}</p>
      <p class="ti-p__village">🏠 ${village ? `${this.villageLink(village)}${village.leader === h.id ? ` · 👑 ${esc(P.leader)}` : ''}` : esc(P.noVillage)}${h.job ? ` · 🛠️ ${esc(this.S.jobs[h.job])}` : ''}${h.weapon ? ` · ⚔️ ${esc(this.S.weapons[h.weapon])}` : ''}${h.armor ? ` · 🛡️ ${esc(this.S.armor)}` : ''}</p>
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
        ${
          realm
            ? `<button type="button" class="ti-p__btn" data-p-depose title="${esc(K.deposeTitle)}">${esc(K.depose)}</button>`
            : village && !kid
              ? `<button type="button" class="ti-p__btn" data-p-crown title="${esc(K.crownTitle)}">👑 ${esc(K.crown)}</button>`
              : ''
        }
      </div>
      <h3 class="ti-p__h">${esc(P.life)}</h3>
      <ol class="ti-p__story">${story}</ol>`);
  }

  /** Only touches the DOM when something changed, and never while a button is held down (at most a second). */
  private setProfile(html: string) {
    if (html === this.profileShown || (this.pressedAt && performance.now() - this.pressedAt < 1000)) return;
    this.profileShown = html;
    this.profile.innerHTML = html;
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
            `<span class="ti-r__bar"><span style="left:${pct}%"></span></span><span class="ti-r__word">${war ? `⚔️ ${esc(this.S.rules.atWar)}` : `${esc(word)} ${m > 0 ? '+' : ''}${m}`}${this.pactText(pairKey(a, b), allied(this.sim, a, b))}</span></li>`,
        );
      }
    }
    // Feuds between places of one people
    for (const w of this.sim.wars.values()) {
      if (w.va === undefined) continue;
      const va = this.sim.villages.find((v) => v.id === w.va);
      const vb = this.sim.villages.find((v) => v.id === w.vb);
      if (!va || !vb) continue;
      rows.push(
        `<li class="ti-r is-war"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${va.people}"></span>${esc(va.name)} · ${esc(vb.name)}</span>` +
          `<span></span><span class="ti-r__word">⚔️ ${esc(this.S.rules.feud)}</span></li>`,
      );
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(this.S.rules.none)}</li>`;
    if (html !== this.relationsShown) {
      this.relationsShown = html;
      box.innerHTML = html;
    }
  }

  /** " · 🤝 allies" or " · 📜 treaty 12 y" after the mood. */
  private pactText(key: string, ally: boolean): string {
    if (ally) return ` · 🤝 ${esc(this.S.rules.allies)}`;
    const until = this.sim.treaties.get(key) ?? 0;
    if (until <= this.sim.time) return '';
    return ` · 📜 ${esc(this.S.rules.treaty.replace('{n}', String(Math.ceil((until - this.sim.time) / 30))))}`;
  }

  /* ---- culture (Rules tab) ------------------------------------------------------ */

  /** A work's title from its building blocks. */
  workTitle(w: Work): string {
    const C = this.S.culture;
    const x = w.name ? (w.epithet ? `${w.name} ${C.epithets[w.epithet] ?? ''}` : w.name) : '';
    return (C.titles[w.kind]?.[w.tpl] ?? '')
      .replace('{x}', x)
      .replace('{adj}', C.adjectives[w.adj ?? 0] ?? '')
      .replace('{noun}', C.nouns[w.people]?.[w.noun ?? 0] ?? '');
  }

  /**
   * One line per people: its works, its legends and the two god gifts; then
   * the latest works on the island.
   */
  private renderCulture() {
    const box = this.root.querySelector<HTMLElement>('[data-culture]');
    if (!box || box.closest('[hidden]')) return;
    const C = this.S.culture;
    const rows: string[] = [];
    for (const p of culturedPeoples(this.sim)) {
      const works = this.sim.works.filter((w) => w.people === p);
      const count = (k: Work['kind']) => works.filter((w) => w.kind === k).length;
      const legends = this.sim.legends
        .filter((l) => l.people === p)
        .slice(-3)
        .reverse()
        .map((l) => `${l.name} ${C.epithets[l.epithet] ?? ''}`);
      const place = blessedPlace(this.sim, p)?.name ?? '';
      rows.push(
        `<li class="ti-cu"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${p}"></span>${esc(this.S.peoples[p])}</span>` +
          `<span class="ti-cu__works">🎨 ${esc(C.works.replace('{n}', String(works.length)))} · ${C.icons.song} ${count('song')} · ${C.icons.mural} ${count('mural')} · ${C.icons.statue} ${count('statue')}</span>` +
          `<span class="ti-cu__legends">${esc(legends.length ? C.legends.replace('{l}', legends.join(', ')) : C.noLegends)}</span>` +
          `<span class="ti-cu__gifts"><button type="button" class="ti-t__gift" data-festival="${p}" title="${esc(C.festivalTitle.replace('{v}', place))}">🎉 ${esc(C.festival)}</button>` +
          `<button type="button" class="ti-t__gift" data-donate="${p}" title="${esc(C.donateTitle.replace('{v}', place))}">🏛️ ${esc(C.donate)}</button></span></li>`,
      );
    }
    const latest = this.sim.works.slice(-4).reverse();
    if (latest.length) {
      rows.push(`<li class="ti-cu__h">${esc(C.latest)}</li>`);
      for (const w of latest) {
        rows.push(`<li class="ti-cu__work">${C.icons[w.kind]} <b>“${esc(this.workTitle(w))}”</b>${w.artist.id ? ` · ${esc(w.artist.name)}` : ''} · ${esc(this.S.year.replace('{n}', String(w.year)))}</li>`);
      }
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(C.none)}</li>`;
    if (html !== this.cultureShown) {
      this.cultureShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- kingdoms (Rules tab) ---------------------------------------------------- */

  /** One line per kingdom: ruler, house, capital, vassals with their mean loyalty, places that rose up. */
  private renderKingdoms() {
    const box = this.root.querySelector<HTMLElement>('[data-kingdoms]');
    if (!box || box.closest('[hidden]')) return;
    const K = this.S.kingdoms;
    const rows: string[] = [];
    for (const k of this.sim.kingdoms.values()) {
      const king = kingOf(this.sim, k);
      const capital = this.sim.villages.find((v) => v.id === k.capital);
      const places = this.sim.villages.filter((v) => !v.ruin && v.people === k.people && v.id !== k.capital);
      const vassals = places.filter((v) => !v.free);
      const rebels = places.length - vassals.length;
      const loyalty = vassals.length ? Math.round(vassals.reduce((n, v) => n + loyaltyOf(v), 0) / vassals.length) : null;
      const ruler = king ? `👑 ${esc(king.female ? K.queen : K.king)} ${this.person(king.id)}` : esc(K.noKing);
      rows.push(
        `<li class="ti-k"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${k.people}"></span>${esc(this.S.peoples[k.people])}</span>` +
          `<span>${ruler} · ${esc(K.house.replace('{d}', k.dynasty))}</span>` +
          `<span class="ti-k__realm">${esc(K.capital).replace('{v}', capital ? this.villageLink(capital) : '–')} · ${esc(K.vassals.replace('{n}', String(vassals.length)))}` +
          `${loyalty !== null ? ` · ${esc(K.loyalty.replace('{n}', String(loyalty)))}` : ''}${rebels ? ` · ⚔️ ${esc(K.rebels.replace('{n}', String(rebels)))}` : ''}</span></li>`,
      );
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(K.none)}</li>`;
    if (html !== this.kingdomsShown) {
      this.kingdomsShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- inventions (Rules tab) ------------------------------------------------- */

  /**
   * One block per people with villages: the icons of what it knows, a bar to
   * its next invention and the gift button. The list is only rebuilt when
   * something new was invented; the bars are updated in place.
   */
  private renderTech() {
    const box = this.root.querySelector<HTMLElement>('[data-tech]');
    if (!box || box.closest('[hidden]')) return;
    const R = this.S.rules;
    const I = this.S.inventions;
    const present = PEOPLES.filter((p) => this.sim.villages.some((v) => !v.ruin && v.people === p));
    const key = present.map((p) => `${p}:${techOf(this.sim, p).known.join(',')}`).join('|');
    if (key !== this.techShown) {
      this.techShown = key;
      box.innerHTML = present.length
        ? present
            .map((p) => {
              const t = techOf(this.sim, p);
              const next = nextInvention(this.sim, p);
              const icons = INVENTIONS.map(
                (i) => `<span class="ti-t__icon${t.known.includes(i) ? ' is-known' : ''}" title="${esc(`${I[i].name}: ${I[i].does}`)}">${I[i].icon}</span>`,
              ).join('');
              return (
                `<li class="ti-t"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${p}"></span>${esc(this.S.peoples[p])}</span>` +
                `<span class="ti-t__icons">${icons}</span>` +
                (next
                  ? `<span class="ti-t__next" data-tech-next="${p}"></span><span class="ti-r__bar ti-t__bar"><span data-tech-bar="${p}"></span></span>` +
                    `<button type="button" class="ti-t__gift" data-gift="${p}" title="${esc(R.giftTitle.replace('{i}', I[next].name))}">🎁 ${esc(R.gift)}</button>`
                  : `<span class="ti-t__next">${esc(R.allKnown)}</span>`) +
                `</li>`
              );
            })
            .join('')
        : `<li class="ti-r__none">${esc(R.techNone)}</li>`;
    }
    for (const p of present) {
      const next = nextInvention(this.sim, p);
      if (!next) continue;
      const pct = Math.min(100, Math.round((techOf(this.sim, p).progress / COSTS[next]) * 100));
      const bar = box.querySelector<HTMLElement>(`[data-tech-bar="${p}"]`);
      const label = box.querySelector<HTMLElement>(`[data-tech-next="${p}"]`);
      if (bar) bar.style.width = `${pct}%`;
      if (label) {
        const rate = researchRate(this.sim, p);
        label.textContent = R.next.replace('{i}', `${I[next].icon} ${I[next].name}`).replace('{n}', String(pct));
        label.title = `+${rate.toFixed(1)} / s`;
      }
    }
  }

  /* ---- chronicle ------------------------------------------------------------- */

  private ref(r: Ref | undefined) {
    return r ? `<b>${esc(r.name)}</b> (${esc(this.S.peoples[r.people])})` : '';
  }

  text(e: ChronicleEntry): string {
    const C = this.S.chronicle;
    const tpl =
      e.kind === 'died'
        ? (C.died[e.cause ?? ''] ?? C.died.other)
        : e.kind === 'war' && !e.a.id
          ? C.warVillage
          : e.kind === 'tier'
            ? (C.tier[e.w ?? ''] ?? '')
            : e.kind === 'building'
              ? C.building.replace('{b}', this.S.buildings[e.w ?? ''] ?? e.w ?? '')
              : e.kind === 'invention'
                ? (e.a.id ? C.invention : C.inventionPeople).replace('{i}', this.S.inventions[e.w ?? '']?.name ?? e.w ?? '')
                : e.kind === 'peace'
                  ? this.peaceText(e)
                  : e.kind === 'artwork'
                    ? e.work
                      ? C.artwork[e.work.kind].replace('{t}', this.workTitle(e.work))
                      : ''
                    : e.kind === 'legend'
                      ? C.legend.replace('{e}', `${e.a.name} ${this.S.culture.epithets[e.w ?? ''] ?? ''}`)
                      : e.kind === 'festival'
                        ? (C.festival[e.w ?? ''] ?? '')
                        : e.kind === 'gift'
                          ? C.gift.replace('{b}', this.S.buildings[e.w ?? ''] ?? e.w ?? '')
                          : C[e.kind];
    return esc(tpl)
      .replace('{a}', this.ref(e.a))
      .replace('{b}', this.ref(e.b))
      .replace('{c}', this.ref(e.c))
      .replace('{n}', String(e.n ?? ''))
      .replace('{v}', this.placeName(e.v))
      .replace('{w}', this.placeName(e.w))
      .replace('{p}', e.p ? `<b>${esc(this.S.peoples[e.p])}</b>` : '')
      .replace('{r}', esc(this.sim.registry.get(e.a.id)?.female ? this.S.kingdoms.royal.queen : this.S.kingdoms.royal.king))
      .replace('{q}', e.q ? `<b>${esc(this.S.peoples[e.q])}</b>` : '');
  }

  /** Peace between peoples or the end of a feud, with who pays tribute. */
  private peaceText(e: ChronicleEntry): string {
    const C = this.S.chronicle;
    if (e.v && e.w) {
      if (!e.loser) return C.feudPeace;
      const loser = this.sim.villages.find((v) => String(v.id) === e.loser)?.name ?? '';
      return C.feudTribute.replace('{l}', loser);
    }
    if (!e.loser) return C.peace;
    return C.peaceTribute.replace('{l}', this.S.peoples[e.loser as People] ?? '');
  }

  /** A name in a chronicle line: clickable when it is a living place. */
  private placeName(name: string | undefined): string {
    const v = name ? this.sim.villages.find((x) => x.name === name && !x.ruin) : undefined;
    return v ? this.villageLink(v, true) : `<b>${esc(name ?? '')}</b>`;
  }

  private renderChronicle() {
    const entries = this.sim.chronicle.entries;
    if (!entries.length) {
      this.list.innerHTML = `<li class="ti-c__empty">${esc(this.S.chronicle.empty)}</li>`;
      return;
    }
    this.list.innerHTML = entries.map((e) => this.entryHtml(e)).join('');
  }
}
