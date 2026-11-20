/**
 * The two panels for watching stories: the profile of the selected person
 * (left) and the chronicle (right). Both are plain DOM, refreshed a few
 * times a second; the chronicle only when something new happened.
 * Clicking a name opens that person, clicking a chronicle entry jumps there.
 */
import { ageOf, stage, stat, STATS, type Human, type People, type StoryEntry, type Trait } from './agents';
import type { Camera } from './camera';
import type { ChronicleEntry, Ref } from './chronicle';
import type { Sim } from './sim';
import { FRIEND, RIVAL } from './social';
import { villageOf } from './villages';
import { allied, moodOf, pairKey, warBetween, makePeace, type War } from './war';
import { armyTag } from './armies';
import { progressOf, wonderTag, type WonderKind } from './wonders';
import { crown, depose, kingOf, loyaltyOf, realmOf } from './kingdoms';
import { blessedPlace, celebrate, culturedPeoples, giftBuilding, giftBuildingAt, giftFestival, type Work } from './culture';
import { plural, villageHtml, type Forms, type VillageStrings } from './village-panel';
import type { Village } from './villages';
import { chartSvg, indexAt, tipText, CHART_W } from './stats';
import { AGE_OF, COSTS, gift, INVENTIONS, nextInvention, researchRate, techOf, AGES, ageIndex, progressCost, type Invention } from './inventions';
import { drawWonder } from './wonder-art';
import { PEOPLE_COLORS, PEOPLES } from './agents';
import { TILE } from './world';
import { landShares } from './territory';
import { religionById, SYMBOL_ICON } from './religion';
import { LEVELS } from './society';
import { buildingHtml, type BuildingRef, type BuildingStrings } from './building-panel';

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
    aid: string;
    exodus: string;
    created: string;
    revenge: string;
    bloodFeud: string;
    bloodFeudEnd: string;
    forgiven: string;
    jealousy: string;
    separated: string;
    mentor: string;
    forbiddenLove: string;
    eloped: string;
    loveEndsWar: string;
    royalWedding: string;
    weddingPeace: string;
    royalFlight: string;
    union: string;
    successionWar: string;
    leagueFounded: string;
    leagueJoin: string;
    leagueExit: string;
    leagueEnd: string;
    leagueVote: string;
    leagueVeto: string;
    fusion: string;
    plotSpy: string;
    plotSpyCaught: string;
    plotSabotage: string;
    plotSabotageCaught: string;
    coup: string;
    coupCaught: string;
    betrayal: string;
    betrayalCaught: string;
    bribe: string;
    bribeCaught: string;
    godPeace: string;
    godAlly: string;
    newAge: string;
    progress: string;
    warGoal: Record<'conquest' | 'tribute' | 'revenge' | 'land' | 'expel' | 'faith', string>;
    claim: string;
    claimDropped: string;
    claimDroppedWhy: Record<string, string>;
    fool: Record<string, string>;
    cultureLevel: string;
    foolDied: string;
    jester: string;
    book: string;
    play: string;
    discontent: string;
    fire: string;
    firebreaker: string;
    struck: string;
    volcanoWakes: string;
    eruption: string;
    hurricane: string;
    heatwave: string;
    godRain: string;
    movement: string;
    seaRises: string;
    landWon: string;
    landGrab: string;
    withdrew: string;
    drivenOut: string;
    railway: string;
    prophet: string;
    prophetDied: string;
    schism: string;
    stateFaith: string;
    converted: string;
    battle: string;
    battleWon: string;
    rout: string;
    discovered: string;
    discoveredNoCaptain: string;
    setSail: string;
    settlersSail: string;
    colony: string;
    shipSunk: string;
    fleet: string;
    armySails: string;
    goldFound: string;
    spiceFound: string;
    independence: string;
    colonyBack: string;
    independent: string;
    islandersJoin: string;
    wonderBegun: string;
    wonderBuilt: string;
    wonderLost: string;
    wonderAbandoned: string;
    wonderTaken: string;
    omen: Record<string, string>;
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
    progress: string;
    peace: string;
    peaceTitle: string;
    ally: string;
    allyTitle: string;
    next: string;
    allKnown: string;
    gift: string;
    giftTitle: string;
    /** The details of one invention (click its symbol). */
    techInfo: { by: string; found: string; gift: string; old: string; working: string; later: string; first: string; only: string; others: string; close: string };
    goals: Record<'conquest' | 'tribute' | 'revenge' | 'land' | 'expel' | 'faith', string>;
    seas: string;
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
    needs: Record<'hunger' | 'energy' | 'social' | 'culture' | 'mood', string>;
    /** Update 3: culture roles (the fool of a capital is the court jester). */
    roles: Record<'philosopher' | 'musician' | 'fool' | 'actor' | 'jester', string>;
    yours: string;
    memories: { title: string; none: string; kinds: Record<string, string>; kin: Record<string, string> };
    abilities: string;
    inArmy: string;
    veteran: string;
    scarred: string;
    aboard: string;
    smite: string;
    smiteTitle: string;
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
  ages: Record<string, string>;
  wonders: {
    title: string;
    names: Record<string, string>;
    does: Record<string, string>;
    of: string;
    plain: string;
    ranks: Record<string, string>;
    built: string;
    building: string;
    rising: string;
    none: string;
    ruins: string;
  };
  armies: {
    name: string;
    adjectives: string[];
    nouns: string[];
    units: Record<string, string>;
    men: Forms;
    morale: string;
    gather: string;
    marching: string;
    siege: string;
    battle: string;
  };
  leagues: { title: string; none: string; names: { people: Record<string, string>; city: string }; council: string; since: string; plots: string; plotsNone: string; member: string };
  deaths: { none: string; causes: Record<string, string>; tip: string };
  stats: Record<string, string>;
  powers: Record<string, { name: string; does: string }>;
  culture: {
    /** Update 3: culture levels, places and books in the Culture tab. */
    levels: Record<string, string>;
    places: string;
    points: string;
    books: string;
    none: string;
    works: Forms;
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
  /** Update 3: profiles of houses and buildings, and animal names. */
  building: BuildingStrings;
  life: Record<string, string>;
  /** Update 3, phase F: the warming in the Population tab. */
  disasters: { temperature: string; movement: string; melted: string };
  /** Update 3, phase D: the Religions tab and faith lines. */
  religion: {
    none: string;
    believers: Forms;
    places: Forms;
    branchOf: string;
    founder: string;
    prophet: string;
    state: string;
    holy: Forms;
    forgotten: string;
    faith: string;
    prophetOf: string;
    doctrines: Record<string, { name: string; does: string }>;
  };
  /** Update 3, phase B: the Territory tab. */
  territory: {
    share: string;
    hunger: string;
    free: string;
    none: string;
    claims: string;
    claim: string;
    claimWar: string;
    grab: string;
    grabWar: string;
    noClaims: string;
  };
  kingdoms: {
    none: string;
    king: string;
    queen: string;
    royal: { king: string; queen: string };
    noKing: string;
    house: string;
    capital: string;
    vassals: Forms;
    loyalty: string;
    rebels: string;
    kingOf: string;
    crown: string;
    crownTitle: string;
    depose: string;
    deposeTitle: string;
  };
}

/** Plots in the Rules overview (phase D). */

const PLOT_KINDS = new Set<string>(['plotSpy', 'plotSpyCaught', 'plotSabotage', 'plotSabotageCaught', 'coup', 'coupCaught', 'betrayal', 'betrayalCaught', 'bribe', 'bribeCaught']);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Panels {
  selected: number | null = null;
  following = false;
  /** The place whose profile is open (instead of a person), if any. */
  selectedVillage: number | null = null;
  /** Update 3: the house or building whose profile is open. */
  selectedBuilding: BuildingRef | null = null;
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
  private wondersShown = '';
  private relationsShown = '';
  private techShown = '';
  /** The invention whose details are open in the World window (one people, one symbol). */
  private techPick: { p: People; i: Invention } | null = null;
  private kingdomsShown = '';
  private leaguesShown = '';
  private cultureShown = '';
  private deathsShown = '';

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
        // Jumping to a place or person from the World window: out of the way if it would cover the profile
        const win = t.closest<HTMLElement>('[data-win]');
        if (win && (place || person) && win.getBoundingClientRect().left < 310) win.querySelector<HTMLElement>('[data-win-close]')?.click();
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
        } else if (t.closest('[data-peace]')) {
          // God gift: the war ends with a treaty
          const [a, b] = t.closest<HTMLElement>('[data-peace]')!.dataset.peace!.split('|') as [People, People];
          makePeace(this.sim, a, b);
          this.sim.chronicle.add({ year: this.sim.year, kind: 'godPeace', a: { id: 0, name: '', people: a }, p: a, q: b, x: 0, y: 0 });
          this.rulesAt = 0;
        } else if (t.closest('[data-ally]')) {
          // God gift: the two peoples become allies
          const [a, b] = t.closest<HTMLElement>('[data-ally]')!.dataset.ally!.split('|') as [People, People];
          this.sim.alliances.add(pairKey(a, b));
          this.sim.mood.set(pairKey(a, b), Math.max(moodOf(this.sim, a, b), 60));
          this.sim.chronicle.add({ year: this.sim.year, kind: 'godAlly', a: { id: 0, name: '', people: a }, p: a, q: b, x: 0, y: 0 });
          this.rulesAt = 0;
        } else if (t.closest('[data-festival]')) {
          // God gifts: a festival or a building for the people's biggest place
          giftFestival(this.sim, t.closest<HTMLElement>('[data-festival]')!.dataset.festival as People);
          this.rulesAt = 0;
        } else if (t.closest('[data-donate]')) {
          giftBuilding(this.sim, t.closest<HTMLElement>('[data-donate]')!.dataset.donate as People);
          this.rulesAt = 0;
        } else if (t.closest('[data-inv]')) {
          // An invention's symbol: its details below the row (again: closed)
          const [p, i] = t.closest<HTMLElement>('[data-inv]')!.dataset.inv!.split(':') as [People, Invention];
          this.techPick = this.techPick?.p === p && this.techPick.i === i ? null : { p, i };
          this.rulesAt = 0;
        } else if (t.closest('[data-inv-close]')) {
          this.techPick = null;
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
        } else if (t.closest('[data-p-smite]') && this.selected !== null) {
          // God gift: strike this person down
          const h = this.sim.byId(this.selected) as Human | undefined;
          if (h) this.sim.smite(h);
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
        } else if (t.closest('[data-win-open], [data-tab]')) {
          // A window or tab just opened: fill its lists right away
          this.rulesAt = 0;
        } else if (t.closest('[data-chron-toggle]')) {
          chron.hidden = !chron.hidden;
          // Phones: one panel at a time
          if (!chron.hidden && this.narrow()) {
            this.select(null);
            this.closeWindows();
          }
          this.syncToggle();
        }
      },
      { signal: this.ac.signal },
    );
  }

  destroy() {
    this.ac.abort();
  }

  /** Phones: one panel at a time, so the open window of the bar closes. */
  private closeWindows() {
    this.root.querySelector<HTMLElement>('[data-win]:not([hidden]) [data-win-close]')?.click();
  }

  /** Phones: a window of the bar opened, so the chronicle and the profile close. */
  makeRoom() {
    this.select(null);
    this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
    this.syncToggle();
  }

  private syncToggle() {
    const open = !this.root.querySelector<HTMLElement>('[data-chron]')!.hidden;
    this.root.querySelectorAll('[data-chron-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }

  private narrow() {
    return window.matchMedia('(max-width: 640px)').matches;
  }

  select(id: number | null) {
    if (id !== this.selected) this.following = false;
    this.selected = id;
    this.selectedVillage = null;
    this.selectedBuilding = null;
    this.profileAt = 0;
    this.profile.hidden = id === null;
    if (id !== null && this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
      this.closeWindows();
    }
  }

  /** Opens the profile of a house or building (Update 3). */
  selectBuilding(ref: BuildingRef) {
    this.select(null);
    this.selectedBuilding = ref;
    this.profile.hidden = false;
    if (this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
      this.closeWindows();
    }
  }

  private renderBuilding() {
    const ref = this.selectedBuilding;
    if (!ref) return;
    const html = buildingHtml(
      {
        sim: this.sim,
        S: this.S.building,
        esc,
        buildings: this.S.buildings,
        peoples: this.S.peoples,
        life: this.S.life,
        jobs: this.S.jobs,
        royal: this.S.kingdoms.royal,
        wonderName: (w) => this.wonderName(wonderTag(w)),
        faithName: (id) => this.faithName(id),
        person: (id) => this.person(id),
        village: (v) => this.villageLink(v),
      },
      ref,
    );
    if (html === null) {
      this.select(null);
      return;
    }
    this.setProfile(html);
  }

  /** Opens the profile of a place. */
  selectVillage(id: number) {
    this.select(null);
    this.selectedVillage = id;
    this.profile.hidden = false;
    if (this.narrow()) {
      this.root.querySelector<HTMLElement>('[data-chron]')!.hidden = true;
      this.syncToggle();
      this.closeWindows();
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
    // Lines about own characters stand out with a ✦
    const own = [e.a, e.b, e.c].some((r) => r && r.id && this.sim.registry.get(r.id)?.custom);
    return `<li><button type="button" class="ti-c__entry${star ? ' is-fav' : ''}${own ? ' is-own' : ''} ti-c--${e.kind}" data-entry="${e.id}"><span class="ti-c__yr">${esc(this.S.chronicle.year.replace('{n}', String(e.year)))}</span> ${own ? '✦ ' : ''}${this.text(e)}</button></li>`;
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
          leagueLine: this.S.leagues.member,
          wonder: (x) => {
            const w = this.sim.wonders.find((o) => o.village === x.id && !o.ruin);
            if (!w) return null;
            const name = this.wonderName(wonderTag(w));
            return w.finished !== undefined ? name : `${name} · ${this.S.wonders.building.replace('{n}', String(Math.floor(progressOf(w) * 100)))}`;
          },
          league: (x) => {
            const l = this.sim.leagues.find((g) => g.members.includes(x.id));
            return l ? this.leagueName(`${l.nameKind}:${l.nameKey}`) : null;
          },
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
    if (this.selectedBuilding && now - this.profileAt > 250) {
      this.profileAt = now;
      this.renderBuilding();
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
      this.renderLeagues();
      this.renderWonders();
      this.renderCulture();
      this.renderStats(false);
      this.renderDeaths();
      this.renderTerritory();
      this.renderReligions();
      this.renderTemperature();
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
        <h2 class="ti-p__name">${esc(h.name)}${h.surname ? ` <span class="ti-p__surname">${esc(h.surname)}</span>` : ''}</h2>
        <button type="button" class="ti-p__close" data-p-close aria-label="×">×</button>
      </header>
      <p class="ti-p__meta"><span class="ti-p__dot ti-dot--${h.people}"></span>${esc(this.S.peoples[h.people])} · ${esc(sex)} · ${esc(this.S.age.replace('{n}', String(age)))}</p>
      ${realm ? `<p class="ti-p__royal">👑 ${esc(K.kingOf.replace('{r}', h.female ? K.queen : K.king).replace('{p}', this.S.peoples[realm.people]))} · ${esc(K.house.replace('{d}', realm.dynasty))}</p>` : ''}
      ${h.custom ? `<p class="ti-p__own">✦ ${esc(P.yours)}</p>` : ''}
      ${this.soldierLine(h)}
      ${this.faithLine(h)}
      ${this.roleLine(h)}
      <p class="ti-p__traits">${h.traits.map((t) => `<span>${esc(this.S.traits[t] ?? t)}</span>`).join('')}</p>
      ${h.powers?.length ? `<p class="ti-p__traits ti-p__powers">${h.powers.map((p) => `<span title="${esc(this.S.powers[p]?.does ?? '')}">${esc(this.S.powers[p]?.name ?? p)}</span>`).join('')}</p>` : ''}
      <p class="ti-p__village">🏠 ${village ? `${this.villageLink(village)}${village.leader === h.id ? ` · 👑 ${esc(P.leader)}` : ''}` : esc(P.noVillage)}${h.job ? ` · 🛠️ ${esc(this.S.jobs[h.job])}` : ''}${h.weapon ? ` · ⚔️ ${esc(this.S.weapons[h.weapon])}` : ''}${h.armor ? ` · 🛡️ ${esc(this.S.armor)}` : ''}</p>
      ${bar(P.needs.hunger, h.hunger)}${bar(P.needs.energy, h.energy)}${bar(P.needs.social, h.social)}${bar(P.needs.culture, h.culture ?? 60)}${bar(P.needs.mood, h.mood ?? 60)}
      <div class="ti-p__stats" aria-label="${esc(P.abilities)}">${STATS.map((s) => {
        const n = stat(h, s);
        return `<div class="ti-p__need ti-p__stat"><span>${esc(this.S.stats[s])}</span><span class="ti-p__bar"><span style="width:${Math.min(100, n * 10)}%"></span></span><b>${n}</b></div>`;
      }).join('')}</div>
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
        <button type="button" class="ti-p__btn" data-p-smite title="${esc(P.smiteTitle)}">${esc(P.smite)}</button>
        ${
          realm
            ? `<button type="button" class="ti-p__btn" data-p-depose title="${esc(K.deposeTitle)}">${esc(K.depose)}</button>`
            : village && !kid
              ? `<button type="button" class="ti-p__btn" data-p-crown title="${esc(K.crownTitle)}">👑 ${esc(K.crown)}</button>`
              : ''
        }
      </div>
      <h3 class="ti-p__h">${esc(P.memories.title)}</h3>
      ${this.memoriesHtml(h)}
      <h3 class="ti-p__h">${esc(P.life)}</h3>
      <ol class="ti-p__story">${story}</ol>`);
  }

  /** The strongest memories (at most five): grudges red, gratitude green. */
  private memoriesHtml(h: Human): string {
    const M = this.S.profile.memories;
    const list = (h.memories ?? []).slice(0, 5);
    if (!list.length) return `<p class="ti-p__mem-none">${esc(M.none)}</p>`;
    return `<ul class="ti-p__mems">${list
      .map((m) => {
        const text = (M.kinds[m.kind] ?? '{o}').replace('{r}', M.kin[m.rel ?? ''] ?? m.rel ?? '');
        const who = this.sim.byId(m.id) ? this.person(m.id) : `<b>${esc(m.name)}</b>`;
        return `<li class="${m.s < 0 ? 'is-grudge' : 'is-thanks'}">${m.s < 0 ? '😠' : '🙂'} ${esc(text).replace('{o}', who)} <span class="ti-p__yr">${esc(this.S.year.replace('{n}', String(m.year)))}</span></li>`;
      })
      .join('')}</ul>`;
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

  /* ---- causes of death (chronicle panel) ---------------------------------------- */

  /**
   * One bar per cause (all deaths since the island began), longest first;
   * a single colour, so no legend; the number at the end of each bar; hover
   * shows the share and the last 50 years.
   */
  private renderDeaths() {
    const box = this.root.querySelector<HTMLElement>('[data-deaths]');
    if (!box || box.closest('[hidden]')) return;
    const D = this.S.deaths;
    const total = this.sim.deaths.total;
    const all = Object.values(total).reduce((n, x) => n + x, 0);
    const recent = new Map<string, number>();
    for (const [, c] of this.sim.deaths.recent) recent.set(c, (recent.get(c) ?? 0) + 1);
    const rows = Object.entries(total)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    const max = rows[0]?.[1] ?? 1;
    const html = rows.length
      ? rows
          .map(([cause, n]) => {
            const label = D.causes[cause] ?? cause;
            const tip = D.tip
              .replace('{c}', label)
              .replace('{n}', String(n))
              .replace('{p}', String(Math.round((n / all) * 100)))
              .replace('{r}', String(recent.get(cause) ?? 0));
            return `<li class="ti-d" title="${esc(tip)}"><span>${esc(label)}</span><span class="ti-d__bar"><span style="width:${Math.max(2, Math.round((n / max) * 100))}%"></span></span><b>${n}</b></li>`;
          })
          .join('')
      : `<li class="ti-d__none">${esc(D.none)}</li>`;
    if (html !== this.deathsShown) {
      this.deathsShown = html;
      box.innerHTML = html;
    }
  }

  /** Phase F: "⚔️ Archer in the Iron Host of Bram" and "🎖️ Veteran of the Battle of Ashfell · the Scarred". */
  private soldierLine(h: Human): string {
    const P = this.S.profile;
    const parts: string[] = [];
    const army = h.slot ? this.sim.armies.find((a) => a.id === h.slot!.army) : undefined;
    if (h.unit && army?.name) {
      const unit = this.S.armies.units[h.unit];
      parts.push(`⚔️ ${esc(P.inArmy.replace('{t}', unit).replace('{a}', this.armyName(armyTag(army))))}`);
    }
    const ship = h.aboard !== undefined ? this.sim.ships.find((s) => s.id === h.aboard) : undefined;
    if (ship) parts.push(`⛵ ${esc(P.aboard.replace('{s}', ship.name))}`);
    if (h.veteran) parts.push(`🎖️ ${esc(P.veteran.replace('{v}', h.veteran))}${h.scarred ? ` · ${esc(P.scarred)}` : ''}`);
    return parts.length ? `<p class="ti-p__soldier">${parts.join('<br>')}</p>` : '';
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
        const warObj = warBetween(this.sim, a, b);
        const war = !!warObj;
        const M = this.S.rules.moods;
        const word = m > 30 ? M.friendly : m > -30 ? M.neutral : m > -60 ? M.tense : M.hostile;
        const pct = (m + 100) / 2;
        rows.push(
          `<li class="ti-r${war ? ' is-war' : ''}"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${a}"></span>${esc(this.S.peoples[a])} · <span class="ti-p__dot ti-dot--${b}"></span>${esc(this.S.peoples[b])}</span>` +
            `<span class="ti-r__bar"><span style="left:${pct}%"></span></span><span class="ti-r__word">${war ? `⚔️ ${esc(this.S.rules.atWar)}${this.goalText(warObj!)}` : `${esc(word)} ${m > 0 ? '+' : ''}${m}`}${this.pactText(pairKey(a, b), allied(this.sim, a, b))}</span>` +
            // God gifts: peace for a war, an alliance for the others
            (war
              ? `<button type="button" class="ti-t__gift" data-peace="${a}|${b}" title="${esc(this.S.rules.peaceTitle)}">🕊️ ${esc(this.S.rules.peace)}</button>`
              : !allied(this.sim, a, b)
                ? `<button type="button" class="ti-t__gift" data-ally="${a}|${b}" title="${esc(this.S.rules.allyTitle)}">🤝 ${esc(this.S.rules.ally)}</button>`
                : '<span></span>') +
            `</li>`,
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
          `<span></span><span class="ti-r__word">⚔️ ${esc(this.S.rules.feud)}</span><span></span></li>`,
      );
    }
    // Armies on the move (phase F): name, size, morale and what they are doing
    const A = this.S.armies;
    for (const army of this.sim.armies) {
      if (!army.name) continue;
      const target = this.sim.villages.find((v) => v.id === army.target)?.name ?? '';
      const from = this.sim.villages.find((v) => v.id === army.from)?.name ?? '';
      const doing = army.battle
        ? A.battle.replace('{v}', army.battle.place)
        : army.state === 'gather'
          ? A.gather.replace('{v}', from)
          : army.state === 'siege'
            ? A.siege.replace('{v}', target)
            : A.marching.replace('{v}', target);
      const morale = Math.round(army.morale ?? 100);
      rows.push(
        `<li class="ti-r ti-army${army.battle ? ' is-war' : ''}"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${army.people}"></span>🚩 ${esc(this.armyName(armyTag(army)))}</span>` +
          `<span class="ti-r__morale" title="${esc(A.morale.replace('{n}', String(morale)))}"><span style="width:${morale}%"></span></span>` +
          `<span class="ti-r__word">${esc(plural(A.men, army.members.length))} · ${esc(doing)}</span><span></span></li>`,
      );
    }
    const isles = this.sim.world.islands;
    if (isles.length > 1) {
      const found = isles.filter((is) => is.found).length;
      rows.push(
        `<li class="ti-r ti-seas"><span class="ti-r__pair">🏝️ ${esc(this.S.rules.seas.replace('{f}', String(found)).replace('{n}', String(isles.length)).replace('{s}', String(this.sim.ships.length)))}</span><span></span><span class="ti-r__word">${esc(
          isles
            .filter((is) => is.found)
            .map((is) => is.name)
            .join(', '),
        )}</span><span></span></li>`,
      );
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(this.S.rules.none)}</li>`;
    if (html !== this.relationsShown) {
      this.relationsShown = html;
      box.innerHTML = html;
    }
  }

  /** " · goal: take Ashfell" after "at war" (phase F). */
  private goalText(w: War): string {
    if (!w.goal) return '';
    const G = this.S.rules.goals;
    const v = w.goal.village !== undefined ? (this.sim.villages.find((x) => x.id === w.goal!.village)?.name ?? '') : '';
    return ` · ${esc(G[w.goal.kind].replace('{v}', v))}`;
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
          `<span class="ti-cu__works">🎨 ${esc(plural(C.works, works.length))} · ${C.icons.song} ${count('song')} · ${C.icons.mural} ${count('mural')} · ${C.icons.statue} ${count('statue')}</span>` +
          `<span class="ti-cu__legends">${esc(legends.length ? C.legends.replace('{l}', legends.join(', ')) : C.noLegends)}</span>` +
          `<span class="ti-cu__gifts"><button type="button" class="ti-t__gift" data-festival="${p}" title="${esc(C.festivalTitle.replace('{v}', place))}">🎉 ${esc(C.festival)}</button>` +
          `<button type="button" class="ti-t__gift" data-donate="${p}" title="${esc(C.donateTitle.replace('{v}', place))}">🏛️ ${esc(C.donate)}</button></span></li>`,
      );
    }
    // Update 3: the places with the most culture, the latest books
    const places = this.sim.villages.filter((v) => !v.ruin && !v.merged && (v.culture ?? 0) >= 1).sort((a, b) => (b.culturePoints ?? 0) - (a.culturePoints ?? 0)).slice(0, 8);
    if (places.length) {
      rows.push(`<li class="ti-cu__h">${esc(C.places)}</li>`);
      for (const v of places) {
        rows.push(`<li class="ti-cu__work">${'★'.repeat((v.culture ?? 0) + 1)} ${this.villageLink(v)} · ${esc(C.levels[LEVELS[v.culture ?? 0]] ?? '')} · ${esc(C.points.replace('{n}', String(v.culturePoints ?? 0)))}</li>`);
      }
    }
    const books = this.sim.books.slice(-4).reverse();
    if (books.length) {
      rows.push(`<li class="ti-cu__h">${esc(C.books)}</li>`);
      for (const b of books) rows.push(`<li class="ti-cu__work">📜 <b>“${esc(b.title)}”</b> · ${esc(b.author.name)} · ${esc(this.S.year.replace('{n}', String(b.year)))}</li>`);
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

  /* ---- world wonders (Rules tab, phase H) ------------------------------------------ */

  /**
   * Only wonders that stand: a small picture (drawn with the map's own art),
   * the name, who holds it and since when, what it does. Wonders still being
   * built show as a line without a name (no spoilers: you find out what it is
   * when it is finished). Nothing at all while none is begun.
   */
  private renderWonders() {
    const box = this.root.querySelector<HTMLElement>('[data-wonders]');
    if (!box || box.closest('[hidden]')) return;
    const W = this.S.wonders;
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const built = this.sim.wonders.filter((w) => w.finished !== undefined && !w.ruin).sort((a, b) => a.finished! - b.finished!);
    const rising = this.sim.wonders.filter((w) => w.finished === undefined && !w.ruin);
    const rows = built.map((w) => {
      const v = this.sim.villages.find((x) => x.id === w.village);
      const hero = w.hero ? (w.hero.female ? 'f' : 'm') : '';
      return (
        `<li class="ti-wd is-done"><canvas class="ti-wd__art" width="40" height="46" data-wd-art="${w.kind}|${w.people}|${hero}" aria-hidden="true"></canvas>` +
        `<b>${esc(cap(this.wonderName(wonderTag(w))))}</b>` +
        `<span><span class="ti-p__dot ti-dot--${w.people}"></span>${v ? this.villageLink(v) : ''} · ${esc(W.built.replace('{n}', String(w.finished)))}</span>` +
        `<span class="ti-wd__does">${esc(W.does[w.kind] ?? '')}</span></li>`
      );
    });
    for (const w of rising) {
      const v = this.sim.villages.find((x) => x.id === w.village);
      rows.push(
        `<li class="ti-wd is-rising"><span class="ti-wd__art ti-wd__art--rising" aria-hidden="true">🏗️</span>` +
          `<span><span class="ti-p__dot ti-dot--${w.people}"></span>${esc(W.rising).replace('{v}', v ? this.villageLink(v) : '?').replace('{n}', String(Math.floor(progressOf(w) * 100)))}</span></li>`,
      );
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(W.none)}</li>`;
    if (html === this.wondersShown) return;
    this.wondersShown = html;
    box.innerHTML = html;
    // The pictures: the wonder as it stands on the map, in the colours of its people
    for (const c of box.querySelectorAll<HTMLCanvasElement>('[data-wd-art]')) {
      const [kind, people, hero] = c.dataset.wdArt!.split('|');
      const ctx = c.getContext('2d');
      if (!ctx) continue;
      const col = PEOPLE_COLORS[people as People];
      drawWonder(ctx, kind as WonderKind, 4, 12, {
        t: 0,
        cloth: col.cloth,
        dark: col.dark,
        progress: 1,
        ruin: false,
        beam: false,
        hero: hero ? { female: hero === 'f' } : undefined,
      });
    }
  }

  /* ---- leagues and plots (Rules tab) ------------------------------------------- */

  /** A league's name from its tag ("people:coast" → "League of the Coast"). */
  leagueName(tag: string): string {
    const [kind, key] = tag.split(':');
    const L = this.S.leagues.names;
    return kind === 'people' ? (L.people[key] ?? key) : L.city.replace('{v}', key ?? '');
  }

  /** A wonder's name from its tag ("wonder:lighthouse:queen:Mira" → "the Great Lighthouse of Queen Mira"). */
  wonderName(tag: string): string {
    const [, kind, rank, ...ruler] = tag.split(':');
    const W = this.S.wonders;
    const name = W.names[kind] ?? kind;
    const who = ruler.join(':');
    if (!who) return W.plain.replace('{w}', name);
    return W.of.replace('{w}', name).replace('{r}', rank ? `${W.ranks[rank] ?? ''} ${who}` : who);
  }

  /** An army's name from its tag ("army:2:2:Bram" → "Iron Host of Bram"). */
  armyName(tag: string): string {
    const [, age, noun, ...general] = tag.split(':');
    const A = this.S.armies;
    return A.name
      .replace('{adj}', A.adjectives[Number(age)] ?? '')
      .replace('{noun}', A.nouns[Number(noun)] ?? '')
      .replace('{g}', general.join(':'));
  }

  /** {u} in a chronicle line: a league, an army, or a place (fusion). */
  private leagueOrPlace(u: string | undefined): string {
    if (!u) return '';
    if (u.startsWith('faith:')) return this.faithName(Number(u.slice(6)));
    if (u.startsWith('army:')) return `<b>${esc(this.armyName(u))}</b>`;
    if (u.startsWith('wonder:')) return `<b>${esc(this.wonderName(u))}</b>`;
    if (u.startsWith('people:') || u.startsWith('city:')) return `<b>${esc(this.leagueName(u))}</b>`;
    return this.placeName(u);
  }

  /** One line per league (colour, name, members, council, age), then the plots that came to light. */
  private renderLeagues() {
    const box = this.root.querySelector<HTMLElement>('[data-leagues]');
    if (!box || box.closest('[hidden]')) return;
    const L = this.S.leagues;
    const rows = this.sim.leagues.map((l) => {
      const members = l.members.map((id) => this.sim.villages.find((v) => v.id === id)).filter((v): v is Village => !!v && !v.ruin);
      return (
        `<li class="ti-lg"><span class="ti-lg__flag" style="background:${l.color}"></span><b>${esc(this.leagueName(`${l.nameKind}:${l.nameKey}`))}</b>` +
        `<span>${members.map((v) => this.villageLink(v)).join(', ')}</span>` +
        `<span class="ti-lg__meta">${esc(L.council.replace('{n}', String(members.length)))} · ${esc(L.since.replace('{n}', String(l.founded)))}</span></li>`
      );
    });
    const plots = this.sim.chronicle.entries.filter((e) => PLOT_KINDS.has(e.kind)).slice(0, 6);
    const html =
      (rows.length ? rows.join('') : `<li class="ti-r__none">${esc(L.none)}</li>`) +
      `<li class="ti-lg__h">${esc(L.plots)}</li>` +
      (plots.length ? plots.map((e) => this.entryHtml(e)).join('') : `<li class="ti-r__none">${esc(L.plotsNone)}</li>`);
    if (html !== this.leaguesShown) {
      this.leaguesShown = html;
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
          `<span class="ti-k__realm">${esc(K.capital).replace('{v}', capital ? this.villageLink(capital) : '–')} · ${esc(plural(K.vassals, vassals.length))}` +
          `${loyalty !== null ? ` · ${esc(K.loyalty.replace('{n}', String(loyalty)))}` : ''}${rebels ? ` · ⚔️ ${esc(K.rebels.replace('{n}', String(rebels)))}` : ''}</span></li>`,
      );
    }
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(K.none)}</li>`;
    if (html !== this.kingdomsShown) {
      this.kingdomsShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- warming (Population tab, Update 3) --------------------------------------------- */

  private tempShown = '';

  /** The temperature of the world as a little line over the years, and what is going on (heat, movement). */
  private renderTemperature() {
    const box = this.root.querySelector<HTMLElement>('[data-temp]');
    if (!box || box.closest('[hidden]')) return;
    const Dz = this.S.disasters;
    const hist = this.sim.tempHistory;
    const now = this.sim.temperature;
    let svg = '';
    if (hist.length >= 2) {
      const max = Math.max(1, ...hist.map((p) => p[1]));
      const W = 260;
      const H = 44;
      const pts = hist.map((p, k) => `${((k / (hist.length - 1)) * W).toFixed(1)},${(H - 2 - (p[1] / max) * (H - 6)).toFixed(1)}`).join(' ');
      svg = `<svg class="ti-temp__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#e8344a" stroke-width="2" /></svg>`;
    }
    const lines = [`🌡️ ${esc(Dz.temperature.replace('{n}', now.toFixed(2)))}`];
    if (this.sim.heat) lines.push(`🔥 ${esc(this.sim.heat.name)}`);
    if (this.sim.movementUntil > this.sim.year) lines.push(`🌱 ${esc(Dz.movement)}`);
    if (this.sim.world.melted) lines.push(`🏔️ ${esc(Dz.melted)}`);
    const html = `${lines.map((l) => `<p class="ti-temp__line">${l}</p>`).join('')}${svg}`;
    if (html !== this.tempShown) {
      this.tempShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- religions (World window and profiles, Update 3) ----------------------------- */

  /** "🎭 Musician", "🃏 Court jester" … (Update 3). */
  private roleLine(h: Human): string {
    if (!h.role) return '';
    const P = this.S.profile;
    const capital = h.role === 'fool' && [...this.sim.kingdoms.values()].some((k) => k.capital === h.village);
    const icon = h.role === 'fool' ? '🃏' : h.role === 'philosopher' ? '📜' : h.role === 'musician' ? '🎵' : '🎭';
    return `<p class="ti-p__village">${icon} ${esc(capital ? P.roles.jester : P.roles[h.role])}</p>`;
  }

  /** "✨ Way of the Tide · devotion 64", or the prophet's title. */
  private faithLine(h: Human): string {
    const Rl = this.S.religion;
    const r = religionById(this.sim, h.faith);
    if (!r) return '';
    const title = h.prophet !== undefined ? `<p class="ti-p__royal">✨ ${esc(Rl.prophetOf).replace('{r}', this.faithName(h.prophet))}</p>` : '';
    return `${title}<p class="ti-p__village">✨ ${esc(Rl.faith).replace('{r}', this.faithName(r.id)).replace('{n}', String(Math.round(h.devotion ?? 0)))}</p>`;
  }

  private religionsShown = '';

  /** Every faith: symbol, name, branch, doctrines, believers and places, founder, state religion, holy places. */
  private renderReligions() {
    const box = this.root.querySelector<HTMLElement>('[data-religions]');
    if (!box || box.closest('[hidden]')) return;
    const Rl = this.S.religion;
    const count = new Map<number, number>();
    for (const h of this.sim.humans) if (h.faith !== undefined && !h.dead) count.set(h.faith, (count.get(h.faith) ?? 0) + 1);
    const list = [...this.sim.religions].sort((a, b) => Number(!!a.gone) - Number(!!b.gone) || (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0));
    const rows = list.map((r) => {
      const places = this.sim.villages.filter((v) => !v.ruin && v.faith === r.id).length;
      const states = [...this.sim.kingdoms.values()].filter((k) => k.stateFaith === r.id).map((k) => this.S.peoples[k.people]);
      const prophet = r.prophet !== undefined ? this.person(r.prophet) : esc(r.founder.name);
      const meta = [
        r.gone ? esc(Rl.forgotten) : `${esc(plural(Rl.believers, count.get(r.id) ?? 0))} · ${esc(plural(Rl.places, places))}`,
        esc(Rl.founder).replace('{a}', prophet).replace('{y}', String(r.founded)),
        r.parent !== undefined ? esc(Rl.branchOf).replace('{r}', this.faithName(r.parent)) : '',
        states.length ? esc(Rl.state.replace('{p}', states.join(', '))) : '',
        esc(plural(Rl.holy, r.holy.length)),
      ].filter(Boolean);
      const doctrines = r.doctrines.map((d) => `<span title="${esc(Rl.doctrines[d]?.does ?? '')}">${esc(Rl.doctrines[d]?.name ?? d)}</span>`).join('');
      return `<li class="ti-rl${r.gone ? ' is-gone' : ''}"><span class="ti-rl__name">${this.faithName(r.id)}</span><span class="ti-rl__docs">${doctrines}</span><span class="ti-rl__meta">${meta.join(' · ')}</span></li>`;
    });
    const html = rows.length ? rows.join('') : `<li class="ti-r__none">${esc(Rl.none)}</li>`;
    if (html !== this.religionsShown) {
      this.religionsShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- territory (World window, Update 3) ---------------------------------------- */

  private territoryShown = '';

  /** Land per people (share, tiles, land hunger of kingdoms), free land, open claims and ultimatums. */
  private renderTerritory() {
    const box = this.root.querySelector<HTMLElement>('[data-territory]');
    if (!box || box.closest('[hidden]')) return;
    const Tt = this.S.territory;
    const { by, free, land } = landShares(this.sim);
    const pct = (n: number) => (land ? Math.round((n / land) * 100) : 0);
    const rows = [...by.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([p, n]) => {
        const k = this.sim.kingdoms.get(p);
        const hunger = k ? ` · ${esc(Tt.hunger.replace('{n}', String(k.landHunger ?? 0)))}` : '';
        return (
          `<li class="ti-tr"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${p}"></span>${k ? '👑 ' : ''}${esc(this.S.peoples[p])}</span>` +
          `<span class="ti-tr__bar"><span class="ti-dot--${p}" style="width:${pct(n)}%"></span></span>` +
          `<span>${esc(Tt.share.replace('{n}', String(pct(n))).replace('{t}', String(n)))}${hunger}</span></li>`
        );
      });
    rows.push(`<li class="ti-tr ti-tr--free"><span>${esc(Tt.free.replace('{n}', String(pct(free))))}</span></li>`);
    const name = (id: number) => {
      const v = this.sim.villages.find((x) => x.id === id);
      return v ? this.villageLink(v) : '–';
    };
    const pp = (p: People) => `<b>${esc(this.S.peoples[p])}</b>`;
    const claims = this.sim.claims.map((c) => {
      const tpl = c.kind === 'claim' ? (c.war ? Tt.claimWar : Tt.claim) : c.war ? Tt.grabWar : Tt.grab;
      return `<li class="ti-tr ti-tr--claim">${esc(tpl)
        .replace('{p}', pp(c.by))
        .replace('{q}', pp(c.from))
        .replace('{w}', name(c.kind === 'claim' ? c.target : c.base))
        .replace('{y}', String(c.due))}</li>`;
    });
    const html =
      (by.size ? rows.join('') : `<li class="ti-r__none">${esc(Tt.none)}</li>`) +
      `<li class="ti-lg__h">${esc(Tt.claims)}</li>` +
      (claims.length ? claims.join('') : `<li class="ti-r__none">${esc(Tt.noClaims)}</li>`);
    if (html !== this.territoryShown) {
      this.territoryShown = html;
      box.innerHTML = html;
    }
  }

  /* ---- inventions (Rules tab) ------------------------------------------------- */

  /**
   * One block per people with villages: its inventions as symbols (clickable:
   * the details open below the row), a bar to its next invention and the gift
   * button. The list is only rebuilt when something new was invented or
   * another symbol is opened; the bars are updated in place.
   */
  private renderTech() {
    const box = this.root.querySelector<HTMLElement>('[data-tech]');
    if (!box || box.closest('[hidden]')) return;
    const R = this.S.rules;
    const I = this.S.inventions;
    const present = PEOPLES.filter((p) => this.sim.villages.some((v) => !v.ruin && v.people === p));
    if (this.techPick && !present.includes(this.techPick.p)) this.techPick = null;
    const pick = this.techPick;
    // The open details show the progress of the next invention: rebuild them when it moves on a whole percent
    const pickPct = pick && nextInvention(this.sim, pick.p) === pick.i ? Math.floor((techOf(this.sim, pick.p).progress / COSTS[pick.i]) * 100) : -1;
    const key =
      present.map((p) => `${p}:${techOf(this.sim, p).known.join(',')}:${techOf(this.sim, p).level ?? 0}`).join('|') + `|${pick?.p}:${pick?.i}:${pickPct}`;
    if (key !== this.techShown) {
      this.techShown = key;
      box.innerHTML = present.length
        ? present
            .map((p) => {
              const t = techOf(this.sim, p);
              const next = nextInvention(this.sim, p);
              const icons = INVENTIONS.map((i) => {
                const open = pick?.p === p && pick.i === i;
                return `<button type="button" class="ti-t__icon${t.known.includes(i) ? ' is-known' : ''}${open ? ' is-open' : ''}" data-inv="${p}:${i}" aria-pressed="${open}" title="${esc(I[i].name)}" aria-label="${esc(I[i].name)}">${I[i].icon}</button>`;
              }).join('');
              // The age the people lives in (phase E)
              const age = this.S.ages[AGES[ageIndex(this.sim, p)]];
              return (
                `<li class="ti-t"><span class="ti-r__pair"><span class="ti-p__dot ti-dot--${p}"></span>${esc(this.S.peoples[p])} <small class="ti-t__age">${esc(age)}</small></span>` +
                `<span class="ti-t__icons">${icons}</span>` +
                `<span class="ti-t__next" data-tech-next="${p}"></span><span class="ti-r__bar ti-t__bar"><span data-tech-bar="${p}"></span></span>` +
                (next
                  ? `<button type="button" class="ti-t__gift" data-gift="${p}" title="${esc(R.giftTitle.replace('{i}', I[next].name))}">🎁 ${esc(R.gift)}</button>`
                  : '<span></span>') +
                (pick?.p === p ? this.techInfo(p, pick.i) : '') +
                `</li>`
              );
            })
            .join('')
        : `<li class="ti-r__none">${esc(R.techNone)}</li>`;
    }
    for (const p of present) {
      const t = techOf(this.sim, p);
      const next = nextInvention(this.sim, p);
      // After the last invention: the next progress level
      const level = (t.level ?? 0) + 1;
      const cost = next ? COSTS[next] : progressCost(level);
      const pct = Math.min(100, Math.round((t.progress / cost) * 100));
      const bar = box.querySelector<HTMLElement>(`[data-tech-bar="${p}"]`);
      const label = box.querySelector<HTMLElement>(`[data-tech-next="${p}"]`);
      if (bar) bar.style.width = `${pct}%`;
      if (label) {
        const rate = researchRate(this.sim, p);
        const what = next ? `${I[next].icon} ${I[next].name}` : `⚙️ ${R.progress.replace('{n}', String(level))}`;
        label.textContent = R.next.replace('{i}', what).replace('{n}', String(pct));
        label.title = `+${rate.toFixed(1)} / s`;
      }
    }
  }

  /**
   * The details of one invention for one people: big symbol, name, age, what
   * it does; who found it, where and when (or that the gods gave it); if it
   * was the first on the island; which other peoples know it.
   */
  private techInfo(p: People, inv: Invention): string {
    const I = this.S.inventions[inv];
    const T = this.S.rules.techInfo;
    const t = techOf(this.sim, p);
    const f = t.by?.[inv];
    let status: string;
    let extra = '';
    if (t.known.includes(inv)) {
      if (!f) status = esc(T.old);
      else if (f.g) status = esc(T.gift.replace('{y}', String(f.y)));
      else if (f.h || f.n) {
        const who = (f.h ? this.person(f.h) : '') || `<b>${esc(f.n ?? '')}</b>`;
        const v = f.v !== undefined ? this.sim.villages.find((x) => x.id === f.v) : undefined;
        status = esc(T.by)
          .replace('{y}', String(f.y))
          .replace('{who}', who)
          .replace('{v}', v ? ` (${this.villageLink(v)})` : '');
      } else status = esc(T.found.replace('{y}', String(f.y)));
      // Who else knows it, with the year where it is known; first on the island?
      const others = PEOPLES.filter((o) => o !== p && techOf(this.sim, o).known.includes(inv));
      const years = [p, ...others].map((o) => techOf(this.sim, o).by?.[inv]?.y);
      if (f && others.length && years.every((y) => y !== undefined) && f.y < Math.min(...(years.slice(1) as number[]))) extra += `<p class="ti-t__first">⭐ ${esc(T.first)}</p>`;
      extra += others.length
        ? `<p>${esc(T.others)} ${others
            .map((o) => {
              const y = techOf(this.sim, o).by?.[inv]?.y;
              return `<span class="ti-t__other"><span class="ti-p__dot ti-dot--${o}"></span>${esc(this.S.peoples[o])}${y !== undefined ? ` (${y})` : ''}</span>`;
            })
            .join(' ')}</p>`
        : `<p>${esc(T.only)}</p>`;
    } else if (nextInvention(this.sim, p) === inv) {
      status = esc(T.working.replace('{n}', String(Math.min(100, Math.floor((t.progress / COSTS[inv]) * 100)))));
    } else status = esc(T.later);
    return (
      `<div class="ti-t__info${t.known.includes(inv) ? '' : ' is-unknown'}"><span class="ti-t__big" aria-hidden="true">${I.icon}</span>` +
      `<div><p><b>${esc(I.name.charAt(0).toUpperCase() + I.name.slice(1))}</b> <small class="ti-t__age">${esc(this.S.ages[AGE_OF[inv]] ?? '')}</small></p>` +
      `<p class="ti-t__does">${esc(I.does)}</p><p>${status}</p>${extra}</div>` +
      `<button type="button" class="ti-t__close" data-inv-close aria-label="${esc(T.close)}">×</button></div>`
    );
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
        : e.kind === 'war' && !e.a.id && !e.cause
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
                          : e.kind === 'omen'
                            ? (C.omen[e.w ?? ''] ?? '')
                            : e.kind === 'newAge'
                              ? C.newAge.replace('{g}', this.S.ages[e.w ?? ''] ?? '')
                              : e.kind === 'wonderLost' && !e.q
                                ? C.wonderAbandoned
                              : e.kind === 'discovered' && !e.a.id
                                ? C.discoveredNoCaptain
                              : e.kind === 'war' && e.cause
                                ? `${e.a.id ? C.war : C.warVillage}${C.warGoal[e.cause as 'conquest'] ?? ''}`
                                : e.kind === 'fool'
                                  ? (C.fool[e.cause ?? ''] ?? '')
                                : e.kind === 'cultureLevel'
                                  ? C.cultureLevel.replace('{l}', this.S.culture.levels[e.w ?? ''] ?? '')
                                : e.kind === 'withdrew' && e.cause === 'war'
                                  ? C.drivenOut
                                : e.kind === 'claimDropped'
                                  ? `${C.claimDropped}${C.claimDroppedWhy[e.cause ?? ''] ?? ''}`
                                : C[e.kind];
    return esc(tpl)
      .replace('{a}', this.ref(e.a))
      .replace('{b}', this.ref(e.b))
      .replace('{c}', this.ref(e.c))
      .replace('{n}', String(e.n ?? ''))
      .replace('{u}', this.leagueOrPlace(e.u))
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

  /** A religion by id: its symbol and name in its colour (Update 3). */
  private faithName(id: number | undefined): string {
    const r = religionById(this.sim, id);
    return r ? `<b class="ti-faith" style="--faith:${r.color}">${SYMBOL_ICON[r.symbol]} ${esc(r.name)}</b>` : '';
  }

  /** A name in a chronicle line: clickable when it is a living place. */
  private placeName(name: string | undefined): string {
    if (name?.startsWith('faith:')) return this.faithName(Number(name.slice(6)));
    if (name?.startsWith('army:')) return `<b>${esc(this.armyName(name))}</b>`;
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
