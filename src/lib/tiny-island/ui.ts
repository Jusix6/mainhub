/**
 * Everything the player touches: the toolbar (tabs, tools, brush size,
 * random island, placing life), the speed buttons, clock and population,
 * the input on the map (drag to move, wheel / pinch to zoom, paint with a
 * brush, click to place) and the little label over whoever the mouse is on.
 */
import { ageOf, type AnimalKind, type Human, type People } from './agents';
import type { Camera } from './camera';
import { SPEEDS, type Sim, type Speed } from './sim';
import { loyaltyOf } from './kingdoms';
import { festiveAt, worksIn } from './culture';
import type { Village } from './villages';
import { TERRAIN_BY_KEY, TILE, type TerrainKey, type World } from './world';

export interface Strings {
  year: string;
  day: string;
  night: string;
  age: string;
  peoples: Record<People, string>;
  life: Record<'human' | AnimalKind, string>;
  doing: Record<string, string>;
  jobs: Record<string, string>;
  villageTip: string;
  tiers: Record<string, string>;
  buildings: Record<string, string>;
  kingdoms: { realm: Record<'capital' | 'vassal' | 'free', string> };
}

type LifeTool = 'human' | AnimalKind;

/** Weapons and armour in store, for the village tip (empty when there are none). */
function armsText(arms: { club: number; bronze: number; iron: number; armor: number } | undefined): string {
  if (!arms) return '';
  const weapons = arms.club + arms.bronze + arms.iron;
  return `${weapons ? ` · ⚔️ ${weapons}` : ''}${arms.armor ? ` · 🛡️ ${arms.armor}` : ''}`;
}
type Tool = 'move' | TerrainKey | LifeTool;
const LIFE_TOOLS: readonly string[] = ['human', 'sheep', 'chicken', 'wolf'];
const isLife = (t: Tool): t is LifeTool => LIFE_TOOLS.includes(t);
const SIZES = { s: 0, m: 2, l: 4 } as const;
type Size = keyof typeof SIZES;

export interface UiHooks {
  /** The player asked for a new random island. */
  onRandom: () => void;
  /** A click or tap on the map without dragging (screen px). */
  onTap: (x: number, y: number) => void;
  /** The player started moving the map by hand. */
  onPan: () => void;
  /** Is there something to click at (x, y) (a village sign)? */
  pointable: (x: number, y: number) => boolean;
}

export class Controls {
  tool: Tool = 'move';
  size: Size = 'm';
  people: People = 'coast';
  /** Last mouse position on the map (screen px), for the hover label. */
  private mouse: { x: number; y: number } | null = null;
  private tipFor = '';
  /** Tile under the mouse, for the brush outline (null on touch or off-map). */
  hover: { x: number; y: number } | null = null;
  private readonly ac = new AbortController();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private mode: 'none' | 'pan' | 'paint' | 'pinch' = 'none';
  private lastTile: { x: number; y: number } | null = null;
  private pinch = { dist: 0, mx: 0, my: 0 };
  /** Where a press started, to tell a tap from a drag. */
  private press: { x: number; y: number; moved: boolean } | null = null;
  private spaceDown = false;
  /** Space was used to move the map, so letting go must not pause. */
  private spacePanned = false;
  private clockText = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly S: Strings,
    private readonly world: World,
    private readonly sim: Sim,
    private readonly cam: Camera,
    private readonly hooks: UiHooks,
  ) {
    this.bindToolbar();
    this.bindMap();
    this.bindKeys();
    this.renderSpeed();
    this.renderTool();
  }

  destroy() {
    this.ac.abort();
  }

  private on<K extends keyof HTMLElementEventMap>(el: EventTarget, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}) {
    el.addEventListener(type, fn as EventListener, { ...opts, signal: this.ac.signal });
  }

  /* ---- toolbar ---------------------------------------------------------------- */

  private bindToolbar() {
    const root = this.root;
    // Rules tab: every slider sets the factor of the same name
    root.querySelectorAll<HTMLInputElement>('[data-rule]').forEach((slider) => {
      const key = slider.dataset.rule as keyof Sim['rules'];
      this.on(slider, 'input', () => {
        this.sim.rules[key] = Number(slider.value);
      });
    });
    this.on(root, 'click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-tool], [data-size], [data-speed], [data-tab], [data-random], [data-people]');
      if (!el) return;
      if (el.dataset.people) {
        this.people = el.dataset.people as People;
        this.tool = 'human';
        this.renderTool();
      } else if (el.dataset.tool) {
        this.tool = el.dataset.tool as Tool;
        this.renderTool();
      } else if (el.dataset.size) {
        this.size = el.dataset.size as Size;
        this.renderTool();
      } else if (el.dataset.speed) {
        this.setSpeed(Number(el.dataset.speed) as Speed);
      } else if (el.dataset.tab && !el.hasAttribute('aria-disabled')) {
        this.showTab(el.dataset.tab);
      } else if (el.hasAttribute('data-random')) {
        this.hooks.onRandom();
      }
    });
  }

  private showTab(tab: string) {
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    this.root.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  }

  /** " · 🎨 3" for works of art made here, " · 🎉" while a festival is on. */
  private cultureText(v: Village): string {
    const n = worksIn(this.sim, v).length;
    return `${n ? ` · 🎨 ${n}` : ''}${festiveAt(v, this.sim) ? ' · 🎉' : ''}`;
  }

  /** ", capital" / ", loyalty 54" / ", risen up" for places of a kingdom. */
  private realmText(v: Village): string {
    const k = this.sim.kingdoms.get(v.people);
    if (!k) return '';
    const R = this.S.kingdoms.realm;
    const text = k.capital === v.id ? R.capital : v.free ? R.free : R.vassal.replace('{n}', String(Math.round(loyaltyOf(v))));
    return `, ${text}`;
  }

  private renderTool() {
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
    this.root.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === this.size)));
    this.root.querySelectorAll<HTMLElement>('[data-people]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.people === this.people)));
    this.root.dataset.tool = this.tool;
  }

  setSpeed(speed: Speed) {
    this.sim.speed = speed;
    this.renderSpeed();
  }

  private renderSpeed() {
    this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === this.sim.speed)));
  }

  /** Year and sun/moon, only touched when the text changes. */
  renderClock() {
    const night = this.sim.isNight;
    const text = `${this.S.year.replace('{n}', String(this.sim.year))}|${night}`;
    if (text === this.clockText) return;
    this.clockText = text;
    this.root.querySelector('[data-year]')!.textContent = this.S.year.replace('{n}', String(this.sim.year));
    const dn = this.root.querySelector<HTMLElement>('[data-daynight]')!;
    dn.dataset.night = String(night);
    dn.setAttribute('aria-label', night ? this.S.night : this.S.day);
    dn.title = night ? this.S.night : this.S.day;
  }

  /** Brush outline for the renderer, while a terrain brush or a creature is picked. */
  brush() {
    if (this.tool === 'move' || !this.hover || this.mode === 'pan' || this.mode === 'pinch') return null;
    return { ...this.hover, r: isLife(this.tool) ? 0 : SIZES[this.size] };
  }

  /** Population counters, only touched when a number changes. */
  renderPopulation() {
    const counts = {
      human: this.sim.humans.length,
      sheep: this.sim.count('sheep'),
      chicken: this.sim.count('chicken'),
      wolf: this.sim.count('wolf'),
      villages: this.sim.villages.filter((v) => !v.ruin).length,
    };
    for (const [k, v] of Object.entries(counts)) {
      const el = this.root.querySelector<HTMLElement>(`[data-pop="${k}"]`);
      if (el && el.textContent !== String(v)) el.textContent = String(v);
    }
  }

  /** Name, age and what they are doing, for whoever is under the mouse. */
  renderTip() {
    const tip = this.root.querySelector<HTMLElement>('[data-tip]');
    if (!tip) return;
    const m = this.mouse;
    if (!m || this.mode === 'pan' || this.mode === 'pinch') {
      tip.hidden = true;
      return;
    }
    const p = this.cam.toWorld(m.x, m.y);
    const who = this.sim.nearest(p.x / TILE, p.y / TILE + 0.3, 0.8, () => true);
    // Over a village square: what is in its storage
    const square = who ? undefined : this.sim.villages.find((v) => !v.ruin && Math.hypot(v.x + 0.5 - p.x / TILE, v.y + 0.5 - p.y / TILE) < 1.4);
    if (!who && !square) {
      tip.hidden = true;
      return;
    }
    let text: string;
    if (square) {
      text = this.S.villageTip
        .replace('{v}', square.name)
        .replace('{p}', String(square.members))
        .replace('{f}', String(Math.floor(square.food)))
        .replace('{w}', String(square.wood))
        .replace('{s}', String(square.stone))
        .replace('{o}', String(square.ore))
        .replace('{t}', String(square.tools))
        .replace('{fi}', String(square.fields))
        .replace('{tier}', this.S.tiers[square.tier ?? 'village'])
        .replace('{b}', square.buildings.length ? ` · ${square.buildings.map((b) => this.S.buildings[b.kind]).join(', ')}` : '')
        .replace('{arms}', armsText(square.arms) + this.cultureText(square))
        .replace('{realm}', this.realmText(square));
    } else if (who!.kind === 'human') {
      const h = who as Human;
      const age = this.S.age.replace('{n}', String(Math.floor(ageOf(h, this.sim.time))));
      const village = h.village !== undefined ? this.sim.villages.find((v) => v.id === h.village) : undefined;
      const job = h.job ? ` · ${this.S.jobs[h.job]}` : '';
      text = `${h.name} · ${village ? village.name : this.S.peoples[h.people]}${job} · ${age} · ${this.S.doing[h.doing] ?? h.doing}`;
    } else {
      text = `${this.S.life[who!.kind as AnimalKind]} · ${this.S.age.replace('{n}', String(Math.floor(ageOf(who!, this.sim.time))))}`;
    }
    if (text !== this.tipFor) {
      tip.textContent = text;
      this.tipFor = text;
    }
    tip.hidden = false;
    tip.style.transform = `translate(${Math.round(m.x + 14)}px, ${Math.round(m.y - 28)}px)`;
  }

  /* ---- input on the map -------------------------------------------------------- */

  private local(e: { clientX: number; clientY: number }) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private tileAt(sx: number, sy: number) {
    const p = this.cam.toWorld(sx, sy);
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  }

  /** Paints every tile on the line from the last tile, so fast strokes have no gaps. */
  private paintTo(tile: { x: number; y: number }) {
    if (this.tool === 'move' || isLife(this.tool)) return;
    const t = TERRAIN_BY_KEY[this.tool];
    const r = SIZES[this.size];
    const from = this.lastTile ?? tile;
    const steps = Math.max(Math.abs(tile.x - from.x), Math.abs(tile.y - from.y), 1);
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(from.x + ((tile.x - from.x) * i) / steps);
      const y = Math.round(from.y + ((tile.y - from.y) * i) / steps);
      this.world.paint(x, y, r, t);
    }
    if (!this.lastTile) this.world.paint(tile.x, tile.y, r, t);
    this.lastTile = tile;
  }

  private startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.mode = 'pinch';
    this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  private bindMap() {
    const c = this.canvas;
    this.on(c, 'contextmenu', (e) => e.preventDefault());

    this.on(c, 'pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      const p = this.local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2) {
        this.press = null;
        this.hooks.onPan();
        this.startPinch();
        return;
      }
      if (this.pointers.size > 2) return;
      const pan = this.tool === 'move' || e.button === 1 || e.button === 2 || this.spaceDown;
      if (this.spaceDown) this.spacePanned = true;
      this.press = e.button === 0 ? { x: p.x, y: p.y, moved: false } : null;
      this.mode = pan ? 'pan' : 'paint';
      this.root.classList.toggle('is-panning', pan);
      if (!pan && isLife(this.tool)) {
        const t = this.tileAt(p.x, p.y);
        this.sim.place(this.tool, t.x, t.y, this.people);
        this.mode = 'none';
      } else if (!pan) {
        this.lastTile = null;
        this.paintTo(this.tileAt(p.x, p.y));
      }
    });

    this.on(c, 'pointermove', (e) => {
      const p = this.local(e);
      if (e.pointerType === 'mouse') {
        this.hover = this.tileAt(p.x, p.y);
        this.mouse = p;
        this.root.classList.toggle('is-pointing', this.tool === 'move' && this.hooks.pointable(p.x, p.y));
      }
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      this.pointers.set(e.pointerId, p);
      if (this.mode === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if (this.pinch.dist > 0) this.cam.zoomAt(dist / this.pinch.dist, mx, my);
        this.cam.pan(mx - this.pinch.mx, my - this.pinch.my);
        this.pinch = { dist, mx, my };
      } else if (this.mode === 'pan') {
        if (this.press && !this.press.moved && Math.hypot(p.x - this.press.x, p.y - this.press.y) > 6) {
          this.press.moved = true;
          this.hooks.onPan();
        }
        this.cam.pan(p.x - prev.x, p.y - prev.y);
      } else if (this.mode === 'paint') {
        this.paintTo(this.tileAt(p.x, p.y));
      }
    });

    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      // A press without dragging on the map with the Move tool picks someone
      if (e.type === 'pointerup' && this.press && !this.press.moved && this.mode === 'pan' && this.pointers.size === 0 && this.tool === 'move') {
        this.hooks.onTap(this.press.x, this.press.y);
      }
      if (this.pointers.size === 0) this.press = null;
      if (this.pointers.size === 0) {
        this.mode = 'none';
        this.lastTile = null;
        this.root.classList.remove('is-panning');
      } else if (this.mode === 'pinch' && this.pointers.size === 1) {
        // One finger left after a pinch: keep moving, never paint by accident
        this.mode = 'pan';
      }
    };
    this.on(c, 'pointerup', end);
    this.on(c, 'pointercancel', end);
    this.on(c, 'pointerleave', (e) => {
      if (e.pointerType === 'mouse') {
        this.hover = null;
        this.mouse = null;
      }
    });

    this.on(
      c,
      'wheel',
      (e) => {
        e.preventDefault();
        const p = this.local(e);
        this.cam.zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
      },
      { passive: false },
    );
  }

  /* ---- keyboard ------------------------------------------------------------------ */

  private bindKeys() {
    const typing = (e: KeyboardEvent) => (e.target as Element | null)?.closest('input, textarea, select, [contenteditable]');
    this.on(window, 'keydown', (e) => {
      if (typing(e)) return;
      if (e.key === ' ') {
        // Space: hold to move the map with any tool, tap to pause / resume
        if (!e.repeat) this.spaceDown = true;
        if ((e.target as Element | null)?.closest('button')) return;
        e.preventDefault();
      } else if (e.key === '1' || e.key === '2' || e.key === '3') {
        this.setSpeed(SPEEDS[Number(e.key)]);
      } else if (e.key === '0' || e.key.toLowerCase() === 'p') {
        this.setSpeed(0);
      } else if (e.key === '+' || e.key === '=') {
        this.cam.zoomAt(1.25, this.cam.vw / 2, this.cam.vh / 2);
      } else if (e.key === '-') {
        this.cam.zoomAt(0.8, this.cam.vw / 2, this.cam.vh / 2);
      }
    });
    this.on(window, 'keyup', (e) => {
      if (e.key !== ' ' || typing(e)) return;
      const panned = this.spacePanned;
      this.spaceDown = false;
      this.spacePanned = false;
      if (!panned && !(e.target as Element | null)?.closest('button')) this.setSpeed(this.sim.speed === 0 ? 1 : 0);
    });
  }
}
