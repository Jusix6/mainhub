/**
 * Everything the player touches: the bar at the bottom and its windows
 * (Build with tabs for tools, brush size, random island and placing life;
 * Rules; World with its tabs), the speed buttons, clock and population,
 * the input on the map (drag to move, wheel / pinch to zoom, paint with a
 * brush, click to place) and the little label over whoever the mouse is on.
 */
import { ageOf, type AnimalKind, type Human, type People } from './agents';
import type { Camera } from './camera';
import { SPEEDS, type Sim, type Speed } from './sim';
import { loyaltyOf } from './kingdoms';
import { placeCharacter, saveTemplate, type Template } from './characters';
import { festiveAt, worksIn } from './culture';
import type { Village } from './villages';
import { TERRAIN_BY_KEY, TILE, type TerrainKey, type World } from './world';

export interface Strings {
  year: string;
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
function armsText(arms: { club: number; bronze: number; iron: number; musket?: number; armor: number } | undefined): string {
  if (!arms) return '';
  const weapons = arms.club + arms.bronze + arms.iron + (arms.musket ?? 0);
  return `${weapons ? ` · ⚔️ ${weapons}` : ''}${arms.armor ? ` · 🛡️ ${arms.armor}` : ''}`;
}
type Tool = 'move' | TerrainKey | LifeTool | 'character' | DisasterTool;
/** Update 3, phase F: the tools of the Disasters window (a click on the map). */
export type DisasterTool = 'lightning' | 'volcano' | 'hurricane' | 'rain';
const DISASTER_TOOLS: readonly string[] = ['lightning', 'volcano', 'hurricane', 'rain'];
const isDisaster = (t: Tool): t is DisasterTool => DISASTER_TOOLS.includes(t);
const LIFE_TOOLS: readonly string[] = ['human', 'sheep', 'chicken', 'wolf', 'horse', 'cow'];
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
  /** An own character was placed (its id). */
  onPlaced: (id: number) => void;
  /** A window of the bar opened on a phone (the side panels make room). */
  onWindow?: () => void;
  /** Update 3: the Borders button or key G (normal → strong → off). */
  onBorders?: () => void;
  /** Update 3, phase F: a disaster tool clicked on the map (tile), and the heatwave button. */
  onDisaster?: (tool: DisasterTool, x: number, y: number) => void;
  onHeatwave?: () => void;
  /** Update 3, phase G: the Cinema button or key K. */
  onCinema?: () => void;
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
  /** The own character the next click places (characters.ts). */
  private placing: Template | null = null;

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
        // A slider in steps shows its word (Update 3: disasters Off … Chaos)
        const out = root.querySelector(`[data-rule-out="${key}"]`);
        if (out && slider.dataset.words) out.textContent = (JSON.parse(slider.dataset.words) as string[])[Number(slider.value)] ?? '';
      });
    });
    this.on(root, 'click', (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-tool], [data-size], [data-speed], [data-tab], [data-random], [data-people], [data-win-open], [data-win-close], [data-drop-tool], [data-borders], [data-heatwave], [data-cinema]');
      if (!el) return;
      if (el.hasAttribute('data-cinema')) {
        this.hooks.onCinema?.();
      } else if (el.hasAttribute('data-heatwave')) {
        this.hooks.onHeatwave?.();
      } else if (el.hasAttribute('data-borders')) {
        this.hooks.onBorders?.();
      } else if (el.dataset.winOpen) {
        this.toggleWindow(el.dataset.winOpen);
      } else if (el.hasAttribute('data-win-close')) {
        this.toggleWindow(null);
      } else if (el.hasAttribute('data-drop-tool')) {
        this.placing = null;
        this.tool = 'move';
        this.renderTool();
      } else if (el.dataset.people) {
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
        this.showTab(el);
      } else if (el.hasAttribute('data-random')) {
        this.hooks.onRandom();
      }
    });
  }

  /** A tab inside a window (Build or World): only that window's tabs and panels change. */
  private showTab(btn: HTMLElement) {
    const set = btn.closest<HTMLElement>('[data-tabset]') ?? this.root;
    const tab = btn.dataset.tab;
    set.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    set.querySelectorAll<HTMLElement>('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
  }

  /** Opens one window of the bar (closing the others), or closes it when it is open already (null: close all). */
  toggleWindow(name: string | null) {
    const open = this.root.querySelector<HTMLElement>(`[data-win="${name}"]`);
    const show = open?.hidden ? name : null;
    this.root.querySelectorAll<HTMLElement>('[data-win]').forEach((w) => (w.hidden = w.dataset.win !== show));
    this.root.querySelectorAll<HTMLElement>('[data-win-open]').forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.winOpen === show)));
    // Phones: the window takes the place of the chronicle and the profile
    if (show && window.matchMedia('(max-width: 640px)').matches) this.hooks.onWindow?.();
    this.renderTool();
  }

  /** The open window of the bar, if any. */
  private openWindow() {
    return this.root.querySelector<HTMLElement>('[data-win]:not([hidden])')?.dataset.win ?? null;
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
    const hint = this.root.querySelector<HTMLElement>('[data-place-hint]');
    if (hint) hint.hidden = this.tool !== 'character';
    this.root.querySelectorAll<HTMLElement>('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
    this.root.querySelectorAll<HTMLElement>('[data-size]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.size === this.size)));
    this.root.querySelectorAll<HTMLElement>('[data-people]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.people === this.people)));
    this.root.dataset.tool = this.tool;
    // With the Build window closed, the bar shows the brush in hand
    const chip = this.root.querySelector<HTMLElement>('[data-drop-tool]');
    if (chip) {
      chip.hidden = this.tool === 'move' || this.openWindow() === 'build';
      const label = this.tool === 'character' ? (this.placing?.name ?? '') : this.tool === 'human' ? `${this.S.life.human} · ${this.S.peoples[this.people]}` : (this.root.querySelector<HTMLElement>(`[data-tool="${this.tool}"]`)?.title ?? '');
      chip.querySelector('[data-current]')!.textContent = label;
    }
  }

  setSpeed(speed: Speed) {
    this.sim.speed = speed;
    this.renderSpeed();
  }

  private renderSpeed() {
    this.root.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === this.sim.speed)));
  }

  /** The year, only touched when it changes. */
  renderClock() {
    const text = this.S.year.replace('{n}', String(this.sim.year));
    if (text === this.clockText) return;
    this.clockText = text;
    this.root.querySelector('[data-year]')!.textContent = text;
  }

  /** Brush outline for the renderer, while a terrain brush or a creature is picked. */
  /** Own character: the next click on land places it. */
  startPlacing(t: Template) {
    this.placing = t;
    this.tool = 'character';
    this.renderTool();
  }

  private placeCharacter(sx: number, sy: number) {
    if (!this.placing) return;
    const t = this.tileAt(sx, sy);
    const h = placeCharacter(this.sim, this.placing, t.x, t.y);
    if (!h) return;
    saveTemplate(this.placing);
    this.placing = null;
    this.tool = 'move';
    this.renderTool();
    this.hooks.onPlaced(h.id);
  }

  brush() {
    if (this.tool === 'move' || !this.hover || this.mode === 'pan' || this.mode === 'pinch') return null;
    return { ...this.hover, r: isLife(this.tool) || this.tool === 'character' || isDisaster(this.tool) ? 0 : SIZES[this.size] };
  }

  /** Population counters, only touched when a number changes. */
  renderPopulation() {
    const counts = {
      human: this.sim.humans.length,
      sheep: this.sim.count('sheep'),
      chicken: this.sim.count('chicken'),
      wolf: this.sim.count('wolf'),
      horse: this.sim.count('horse'),
      cow: this.sim.count('cow'),
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
    if (this.tool === 'move' || this.tool === 'character' || isLife(this.tool) || isDisaster(this.tool)) return;
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
      if (!pan && this.tool === 'character') {
        this.placeCharacter(p.x, p.y);
        this.mode = 'none';
      } else if (!pan && isDisaster(this.tool)) {
        const t = this.tileAt(p.x, p.y);
        this.hooks.onDisaster?.(this.tool, t.x, t.y);
        this.mode = 'none';
      } else if (!pan && isLife(this.tool)) {
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
      } else if (e.key === 'Escape') {
        // The character editor closes first (editor.ts marks the key as used)
        if (e.defaultPrevented || this.root.querySelector('[data-editor]:not([hidden])')) return;
        this.toggleWindow(null);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && ['b', 'r', 'w', 'd'].includes(e.key.toLowerCase())) {
        this.toggleWindow({ b: 'build', r: 'rules', w: 'world', d: 'disasters' }[e.key.toLowerCase()]!);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'k') {
        this.hooks.onCinema?.();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'g') {
        this.hooks.onBorders?.();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'c') {
        this.root.querySelector<HTMLElement>('.ti__bar [data-chron-toggle]')?.click();
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
