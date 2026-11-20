/**
 * Cinema mode (Update 3, phase G): the interface goes, an invisible director
 * shows the most exciting things happening on the island, with black bars, a
 * vignette, a narrator's subtitles and music. Esc or a click ends it.
 *
 * - Scenes come from new chronicle entries (each kind has a tension value,
 *   chronicle.ts `TENSION`) and from what is going on right now: battles and
 *   sieges, armies on the march, eruptions, hurricanes, big fires; when nothing
 *   happens, a time-lapse: the years run ten times as fast and the camera
 *   drifts from place to place (5 s each) until something big happens, then
 *   it cuts there at once. Small things (tension under 35) are left out;
 *   festivals are no scene of their own, the time-lapse likes to drift over
 *   a place that celebrates. A kind of scene seen in the last 45 s counts
 *   20 less, so it does not show five deaths in a row.
 *   Own characters and favourites count 20 more.
 * - A scene runs 4 to 12 seconds (the more exciting, the longer; battles,
 *   sieges and disasters as long as they go on, at most 25); the same scene
 *   never twice in a row.
 *   Smaller scenes (under 60) run at 3x. The camera glides there (battles from afar, weddings
 *   close up) and follows what moves.
 * - Climaxes (a wall breaks, a volcano erupts, a kingdom falls) run 2
 *   seconds in slow motion (0.3×); a new age opens a chapter card.
 * - One line of narration per scene, from 3–5 variants per kind (ui.ts),
 *   else the chronicle's own line.
 * - The music follows the scene: peace, war, festival, grief, disaster.
 * - Clean screen: no bars and no subtitles (for recording).
 */
import type { Camera } from './camera';
import type { ChronicleEntry } from './chronicle';
import { TENSION } from './chronicle';
import type { Human } from './agents';
import type { Music, Mood } from './music';
import type { Sim } from './sim';
import { AGES, ageIndex } from './inventions';
import { TILE } from './world';

export interface CinemaStrings {
  chapter: string;
  peoples: Record<string, string>;
  calm: string[];
  calmWild: string[];
  /** Time-lapse sign: "Year {y}". */
  ff: string;
  lines: Record<string, string[]>;
}

interface Scene {
  key: string;
  kind: string;
  tension: number;
  x: number;
  y: number;
  zoom: number;
  /** Something that moves: the camera follows it. */
  follow?: () => { x: number; y: number } | null;
  entry?: ChronicleEntry;
  /** Live scenes: still going on? */
  alive?: () => boolean;
  /** Real time (ms) the candidate is forgotten. */
  expires: number;
}

/** Below this a chronicle entry is not worth a scene; at least this cuts a time-lapse at once. */
const WORTH = 35;
/** The time-lapse shot of one place (s). */
const LAPSE = 5;

/** Climaxes that slow time down for a moment. */
const CLIMAX = new Set(['breach', 'eruption', 'fall', 'overthrown', 'conquest']);
/** Wide shots and close-ups. */
const WIDE = new Set(['battle', 'battleWon', 'siege', 'war', 'army', 'eruption', 'hurricane', 'fire', 'volcanoWakes', 'seaRises', 'landWon', 'heatwave']);
const CLOSE = new Set(['royalWedding', 'couple', 'birth', 'died', 'kingdom', 'godCrowned', 'succession', 'prophet', 'fool', 'jester', 'struck', 'firebreaker']);

const MOOD_OF: Record<string, Mood> = {
  war: 'war',
  battle: 'war',
  battleWon: 'war',
  siege: 'war',
  army: 'war',
  conquest: 'war',
  breach: 'war',
  claim: 'war',
  landGrab: 'war',
  revolt: 'war',
  eruption: 'disaster',
  volcanoWakes: 'disaster',
  hurricane: 'disaster',
  fire: 'disaster',
  heatwave: 'disaster',
  struck: 'disaster',
  seaRises: 'disaster',
  festival: 'festival',
  royalWedding: 'festival',
  couple: 'festival',
  birth: 'festival',
  kingdom: 'festival',
  godCrowned: 'festival',
  wonderBuilt: 'festival',
  play: 'festival',
  fool: 'festival',
  newAge: 'festival',
  railway: 'festival',
  died: 'grief',
  prophetDied: 'grief',
  foolDied: 'grief',
  fall: 'grief',
  succession: 'grief',
  legend: 'grief',
};

/** Tension of the older kinds of entries (the new ones have theirs in chronicle.ts). */
const BASE: Record<string, number> = {
  battle: 90,
  battleWon: 90,
  breach: 90,
  army: 70,
  war: 85,
  conquest: 85,
  kingdom: 80,
  godCrowned: 80,
  succession: 80,
  newDynasty: 75,
  overthrown: 85,
  revolt: 75,
  fall: 80,
  wonderBuilt: 75,
  royalWedding: 70,
  festival: 30,
  newAge: 60,
  legend: 55,
  independence: 65,
  colony: 50,
  discovered: 45,
  shipSunk: 60,
  tier: 40,
  couple: 20,
  birth: 20,
  died: 25,
};

const roman = (n: number) =>
  [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ].reduce((s, [v, r]) => {
    let out = s;
    while (n >= (v as number)) {
      out += r;
      n -= v as number;
    }
    return out;
  }, '');

export class Cinema {
  active = false;
  /** No bars, no subtitles (for recording). */
  clean = false;
  private scene: Scene | null = null;
  private since = 0;
  private lastKey = '';
  private seen = 0;
  private candidates: Scene[] = [];
  private liveAt = 0;
  private slowUntil = 0;
  private speed: Sim['speed'] = 1;
  private chapter = 0;
  private chapterUntil = 0;
  /** Places the time-lapse has shown lately (so it wanders). */
  private shown: number[] = [];
  /** When each kind of scene was shown last (real time). */
  private recent = new Map<string, number>();

  constructor(
    private readonly sim: Sim,
    private readonly cam: Camera,
    private readonly view: HTMLElement,
    private readonly S: CinemaStrings,
    private readonly describe: (e: ChronicleEntry) => string,
    private readonly music: Music,
    private readonly ageName: (key: string) => string,
  ) {}

  start() {
    if (this.active) return;
    this.active = true;
    this.speed = this.sim.speed;
    this.sim.speed = 1;
    this.scene = null;
    this.lastKey = '';
    this.candidates = [];
    this.seen = this.sim.chronicle.entries[0]?.id ?? 0;
    // The chapters so far: one per age the leading people reached
    this.chapter = Math.max(1, ...[...this.sim.tech.keys()].map((p) => 1 + ageIndex(this.sim, p)));
    this.view.hidden = false;
    this.view.closest('.ti')?.classList.add('is-cinema');
    this.music.start();
    this.render('');
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.sim.speed = this.speed;
    this.view.hidden = true;
    this.view.closest('.ti')?.classList.remove('is-cinema');
  }

  /** Every frame: new candidates, maybe a new scene, the camera; returns the time scale (slow motion). */
  update(now: number, dt: number): number {
    if (!this.active) return 1;
    this.collect(now);
    if (now - this.liveAt > 1000) {
      this.liveAt = now;
      this.live(now);
    }
    this.candidates = this.candidates.filter((c) => c.expires > now && (!c.alive || c.alive()));
    const s = this.scene;
    const age = (now - this.since) / 1000;
    // Seen the same kind of thing a moment ago: worth less
    const score = (c: Scene) => c.tension - (now - (this.recent.get(c.kind) ?? -Infinity) < 45000 ? 20 : 0);
    const best = this.candidates
      .filter((c) => c.key !== s?.key && c.key !== this.lastKey && score(c) >= WORTH)
      .sort((a, b) => score(b) - score(a))[0];
    const lapse = !s || s.kind === 'calm';
    const over = !s || age > this.length(s) || (!!s.alive && !s.alive() && age > 1.5);
    // A time-lapse gives way at once, a scene only to something clearly bigger
    const better = !!best && (lapse || (age > 4 && score(best) > (s?.tension ?? 0) + 5));
    if (over || better) this.cut(best ?? this.calm(now), now);
    this.move(dt);
    // Nothing big: the years fly by; smaller scenes at 3x, big ones in real time
    const t = this.scene?.tension ?? 0;
    this.sim.speed = this.scene?.kind === 'calm' ? 10 : t < 60 ? 3 : 1;
    const card = this.view.querySelector<HTMLElement>('[data-cine-chapter]');
    if (card) card.hidden = now > this.chapterUntil;
    const ff = this.view.querySelector<HTMLElement>('[data-cine-ff]');
    if (ff) {
      ff.hidden = this.scene?.kind !== 'calm' || this.clean;
      if (!ff.hidden) ff.textContent = this.S.ff.replace('{y}', String(this.sim.year));
    }
    return now < this.slowUntil ? 0.3 : 1;
  }

  /** How long a scene may run (s): the more exciting, the longer; live ones while they last. */
  private length(s: Scene) {
    if (s.kind === 'calm') return LAPSE;
    if (s.alive && s.tension >= 80) return 25;
    return Math.min(12, 4 + (s.tension - WORTH) / 7);
  }

  /** New chronicle entries become candidates (with a place to look at). */
  private collect(now: number) {
    const fresh = this.sim.chronicle.entries.filter((e) => e.id > this.seen);
    if (!fresh.length) return;
    this.seen = fresh[0].id;
    for (const e of fresh) {
      let tension = (TENSION as Record<string, number | undefined>)[e.kind] ?? BASE[e.kind] ?? 15;
      // Own characters and favourites (+20)
      if ([e.a, e.b, e.c].some((r) => r?.id && (this.sim.favorites.has(r.id) || this.sim.registry.get(r.id)?.custom))) tension += 20;
      if (tension < WORTH) continue;
      const at = this.placeOf(e);
      if (!at) continue;
      this.candidates.push({ key: `e${e.id}`, kind: e.kind, tension, x: at.x, y: at.y, zoom: this.zoomFor(e.kind), entry: e, expires: now + 15000 });
      if (e.kind === 'newAge') this.chapterCard(e, now);
    }
  }

  /** Where it happened: its tile, else the place named in it, else the capital of its people. */
  private placeOf(e: ChronicleEntry): { x: number; y: number } | null {
    if (e.x || e.y) return { x: e.x, y: e.y };
    const v = this.sim.villages.find((x) => !x.ruin && (x.name === e.v || x.name === e.w));
    if (v) return { x: v.x, y: v.y };
    const k = this.sim.kingdoms.get(e.p ?? e.a.people);
    const cap = k && this.sim.villages.find((x) => x.id === k.capital);
    return cap ? { x: cap.x, y: cap.y } : null;
  }

  private zoomFor(kind: string) {
    return WIDE.has(kind) ? 1.7 : CLOSE.has(kind) ? 4 : 2.8;
  }

  /** What is going on right now: battles, sieges, eruptions, the hurricane, a big fire, festivals. */
  private live(now: number) {
    const sim = this.sim;
    const add = (key: string, kind: string, tension: number, x: number, y: number, alive: () => boolean, follow?: Scene['follow']) => {
      const old = this.candidates.find((c) => c.key === key);
      if (old) {
        old.expires = now + 3000;
        return;
      }
      this.candidates.push({ key, kind, tension, x, y, zoom: this.zoomFor(kind), alive, follow, expires: now + 3000 });
    };
    for (const a of sim.armies) {
      if (a.battle) {
        const g = sim.byId(a.general);
        if (g) add(`battle${a.id}`, 'battle', 90, g.x, g.y, () => sim.armies.some((x) => x.id === a.id && !!x.battle), () => sim.byId(a.general) ?? null);
      } else if (a.state === 'siege') {
        const t = sim.villages.find((v) => v.id === a.target);
        if (t) add(`siege${a.id}`, 'siege', 90, t.x, t.y, () => sim.armies.some((x) => x.id === a.id && x.state === 'siege'));
      } else if (a.state === 'march' || a.state === 'sail') {
        // An army on its way: the war is coming
        const g = sim.byId(a.general);
        if (g) add(`march${a.id}`, 'army', 65, g.x, g.y, () => sim.armies.some((x) => x.id === a.id && (x.state === 'march' || x.state === 'sail')), () => sim.byId(a.general) ?? null);
      }
    }
    for (const v of sim.volcanoes) {
      const erupting = sim.time >= v.erupts;
      add(`volcano${v.x}:${v.y}:${erupting}`, erupting ? 'eruption' : 'volcanoWakes', erupting ? 95 : 55, v.x, v.y, () => sim.volcanoes.includes(v));
    }
    const hu = sim.hurricane;
    if (hu) add(`hurricane${hu.name}`, 'hurricane', 95, hu.x, hu.y, () => sim.hurricane === hu, () => (sim.hurricane ? { x: sim.hurricane.x, y: sim.hurricane.y } : null));
    if (sim.fireEvent && sim.fires.size >= 5) add(`fire${sim.fireEvent.name}`, 'fire', 80, sim.fireEvent.x, sim.fireEvent.y, () => sim.fires.size > 0);
  }

  /**
   * The time-lapse: the camera drifts slowly over a place (one not shown
   * lately, bigger ones more often; sometimes a favourite), the years fly by.
   */
  private calm(now: number): Scene {
    const sim = this.sim;
    const fav = sim.humans.filter((h) => !h.dead && h.aboard === undefined && sim.favorites.has(h.id));
    if (fav.length && Math.random() < 0.3) {
      const h = fav[Math.floor(Math.random() * fav.length)] as Human;
      return { key: `calm${now}`, kind: 'calm', tension: 10, x: h.x, y: h.y, zoom: 3.4, follow: () => (sim.byId(h.id) as Human | undefined) ?? null, expires: now + 20000 };
    }
    const places = sim.villages.filter((v) => !v.ruin && !v.merged);
    // Half the time a place that celebrates, if there is one
    const fest = places.filter((v) => (v.festivalUntil ?? 0) > sim.time && !this.shown.includes(v.id));
    const fresh = fest.length && Math.random() < 0.5 ? fest : places.filter((v) => !this.shown.includes(v.id));
    const pool = fresh.length ? fresh : places;
    const weight = (v: (typeof pool)[number]) => 1 + v.houses.length;
    let roll = Math.random() * pool.reduce((n, v) => n + weight(v), 0);
    const v = pool.find((p) => (roll -= weight(p)) <= 0) ?? pool[0];
    if (v) this.shown = [v.id, ...this.shown].slice(0, Math.max(1, Math.min(6, places.length - 1)));
    const cx = v ? v.x : this.cam.x / TILE;
    const cy = v ? v.y : this.cam.y / TILE;
    // A slow drift across the place
    const a = Math.random() * Math.PI * 2;
    const start = now;
    return {
      key: `calm${now}`,
      kind: 'calm',
      tension: 10,
      x: cx - Math.cos(a) * 4,
      y: cy - Math.sin(a) * 4,
      zoom: 2.4 + Math.random() * 0.8,
      follow: () => {
        const k = Math.min(1, (performance.now() - start) / (LAPSE * 1000));
        return { x: cx + Math.cos(a) * (k * 8 - 4), y: cy + Math.sin(a) * (k * 8 - 4) };
      },
      expires: now + 20000,
    };
  }

  /** Cut to a scene: subtitle, music, slow motion for climaxes. */
  private cut(s: Scene, now: number) {
    if (this.scene) this.lastKey = this.scene.key;
    this.scene = s;
    this.since = now;
    this.recent.set(s.kind, now);
    this.candidates = this.candidates.filter((c) => c !== s);
    if (CLIMAX.has(s.kind)) this.slowUntil = now + 2000;
    const party = s.kind === 'calm' && this.sim.villages.some((v) => (v.festivalUntil ?? 0) > this.sim.time && Math.hypot(v.x - s.x, v.y - s.y) < 6);
    this.music.setMood(party ? 'festival' : (MOOD_OF[s.kind] ?? 'peace'));
    this.render(this.narrate(s));
  }

  /** The narrator's line: a variant for its kind with real names, else the chronicle's line. */
  private narrate(s: Scene): string {
    const sim = this.sim;
    const pick = (list: string[], seed: number) => list[Math.abs(seed) % list.length];
    if (s.kind === 'calm') {
      const v = sim.villages.filter((x) => !x.ruin).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      const fest = v && (v.festivalUntil ?? 0) > sim.time ? this.S.lines.live_festival : undefined;
      // Before the first place there is only the island
      return pick(fest?.length ? fest : v ? this.S.calm : this.S.calmWild, Math.floor(s.x * 7 + s.y))
        .replace('{y}', String(sim.year))
        .replace('{v}', v?.name ?? '');
    }
    const e = s.entry;
    const lines = this.S.lines[s.kind];
    if (e && lines?.length) {
      // Entries like a declaration of war keep the other side in p (the own people is the one of a)
      const foe = !e.q && !!e.p && e.p !== e.a.people;
      return pick(lines, e.id)
        .replace('{y}', String(e.year))
        .replace('{a}', e.a.name)
        .replace('{b}', e.b?.name ?? '')
        .replace('{v}', e.v ?? '')
        .replace('{w}', e.w ?? '')
        .replace('{u}', (e.u ?? '').replace(/^faith:\d+$/, ''))
        .replace('{p}', this.S.peoples[foe ? e.a.people : (e.p ?? e.a.people)] ?? '')
        .replace('{q}', this.S.peoples[foe ? (e.p ?? '') : (e.q ?? '')] ?? '');
    }
    if (e) return `${e.year}. ${this.describe(e)}`;
    // Live scenes without an entry
    const live = this.S.lines[`live_${s.kind}`];
    const v = sim.villages.filter((x) => !x.ruin).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
    return live?.length ? pick(live, Math.floor(s.x + s.y)).replace('{y}', String(sim.year)).replace('{v}', v?.name ?? '') : '';
  }

  /** A new age: "Chapter IV – The Iron Age". */
  private chapterCard(e: ChronicleEntry, now: number) {
    const idx = AGES.indexOf((e.w ?? '') as (typeof AGES)[number]) + 1;
    if (idx <= this.chapter && this.chapter > 1) return;
    this.chapter = Math.max(this.chapter + 1, idx);
    const card = this.view.querySelector<HTMLElement>('[data-cine-chapter]');
    if (!card) return;
    card.textContent = this.S.chapter.replace('{n}', roman(this.chapter)).replace('{a}', this.ageName(e.w ?? ''));
    this.chapterUntil = now + 3500;
  }

  /** The camera glides after the scene (follows what moves), zooming in or out. */
  private move(dt: number) {
    const s = this.scene;
    if (!s) return;
    const f = s.follow?.();
    if (f) {
      s.x = f.x;
      s.y = f.y;
    }
    const k = Math.min(1, dt * 1.5);
    this.cam.x += (s.x * TILE - this.cam.x) * k;
    this.cam.y += (s.y * TILE - this.cam.y) * k;
    this.cam.zoom += (s.zoom - this.cam.zoom) * Math.min(1, dt * 0.8);
    this.cam.clamp();
  }

  private render(sub: string) {
    const el = this.view.querySelector<HTMLElement>('[data-cine-sub]');
    if (el) el.textContent = sub;
    this.view.classList.toggle('is-clean', this.clean);
  }

  /** The music outside cinema mode: what is going on in the world. */
  static worldMood(sim: Sim): Mood {
    if (sim.hurricane || sim.volcanoes.some((v) => sim.time >= v.erupts) || sim.fires.size > 5) return 'disaster';
    if (sim.armies.some((a) => a.battle || a.state === 'siege')) return 'war';
    if (sim.villages.some((v) => (v.festivalUntil ?? 0) > sim.time)) return 'festival';
    if (sim.wars.size) return 'war';
    return 'peace';
  }
}
