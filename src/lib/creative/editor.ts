/**
 * Creative mode editor: a 12-column block grid over the card page where the
 * tiles of the site (tiles.ts, templates from /creative/tiles) are placed.
 *
 * - The tile in hand is the one in the picked hotbar slot (inventory.ts: 1–9,
 *   wheel over the hotbar, E for the inventory).
 * - Click places it (an outline shows where, red = no room), right-click
 *   removes a tile, dragging a tile moves it.
 * - R: next size of the tile under the pointer (if it fits), otherwise of the
 *   tile in hand. Middle-click copies a tile into your hand.
 * - Double-click a block (heading, text, sticker) to change its text and colour.
 * - Ctrl+Z / Ctrl+Y (or the arrows in the bar) undo and redo, up to 100 steps.
 * - The menu (⋯) copies a share link (share.ts), starts from the original hub
 *   or clears the grid (both asked first).
 * - Touch: tap places, tap on a tile opens its menu (size, edit, copy, move,
 *   remove; "move" then waits for a tap on the new place). Dragging scrolls.
 *   On narrow screens the grid keeps cells of at least 44 px and scrolls sideways.
 * - Esc (or "Save & quit") leaves. Every change is saved at once (plan.ts).
 * - Keyboard only: the grid takes focus (Tab); arrows move a cursor, Enter
 *   places (or edits the block under the cursor), Delete removes, Shift +
 *   arrows move the tile under the cursor, R size, C copy. Tab stays inside
 *   the open layer (focus trap). Every change is read out (aria-live).
 * - Feedback (fx.ts, sound.ts): tiles pop in, removed ones break into pieces,
 *   short Web Audio sounds (M or the menu switches them off). Reduced motion:
 *   no effects.
 * Links inside tiles are dead while building (the tile content is inert).
 */
import { COLORS, COLS, MAX_ROWS, MAX_TILES, cleanExtra, cleanPlan, loadPlan, overlaps, savePlan, usedRows, type ColorId, type Placed, type Plan } from './plan';
import { createInventory, type InventoryStrings } from './inventory';
import { fitTile, loadLibrary, previewTile, renderTile } from './tiles';
import { encodePlan, shareUrl } from './share';
import { colorsOf, createFx } from './fx';
import { createSound } from './sound';
// Only the URL: Astro would put an imported stylesheet into the head of every page with this script
import stylesUrl from './editor.css?url';

export interface CreativeStrings extends InventoryStrings {
  on: string;
  onSub: string;
  hand: string;
  empty: string;
  loading: string;
  failed: string;
  count: string;
  confirmTemplate: string;
  confirmClear: string;
  shareCopied: string;
  shareSub: string;
  shareFailed: string;
  shareEmpty: string;
  moveHint: string;
  soundOn: string;
  soundOff: string;
  live: Record<'placed' | 'removed' | 'moved' | 'resized' | 'edited' | 'undone' | 'redone' | 'cleared' | 'template' | 'noRoom' | 'cursor' | 'cursorOn', string>;
}

interface Options {
  root: HTMLElement;
  strings: CreativeStrings;
  onExit: () => void;
  /** A short message at the bottom of the screen. */
  say: (title: string, sub?: string) => void;
}

let styles: Promise<void> | null = null;

/** Loads the editor's stylesheet once; call (and wait) before the overlay shows. */
export function loadStyles(): Promise<void> {
  styles ??= new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesUrl;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.append(link);
  });
  return styles;
}

const HISTORY = 100;
/** Smallest cell on narrow screens (touch targets); the grid scrolls sideways below that. */
const MIN_CELL = 44;

/** Starts the editor in the overlay; returns a function that stops it. */
export async function startCreative(o: Options): Promise<() => void> {
  const { root, strings: S } = o;
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const grid = $('[data-cr-grid]');
  const scroller = $('[data-cr-scroll]');
  const handLabel = $('[data-cr-hand]');
  const countLabel = $('[data-cr-count]');
  const status = $('[data-cr-status]');
  const undoBtn = $<HTMLButtonElement>('[data-cr-undo]');
  const redoBtn = $<HTMLButtonElement>('[data-cr-redo]');
  const menuBtn = $<HTMLButtonElement>('[data-cr-menu-btn]');
  const menu = $('[data-cr-menu]');
  const confirmBox = $('[data-cr-confirm]');
  const editBox = $('[data-cr-edit]');
  const tileMenu = $('[data-cr-tilemenu]');
  const shareField = $<HTMLInputElement>('[data-cr-share-url]');

  status.textContent = S.loading;
  status.hidden = false;
  let lib: Awaited<ReturnType<typeof loadLibrary>>;
  try {
    lib = await loadLibrary();
  } catch {
    status.textContent = S.failed;
    return () => {};
  }
  status.hidden = true;

  const plan: Plan = cleanPlan(loadPlan(), lib.tiles);
  let cell = 40;
  let gap = 10;
  let rows = 0;
  let hover: { x: number; y: number } | null = null;
  /** The placed tile under the pointer (for R). */
  let hoverEl: HTMLElement | null = null;
  /** A tile being moved: index, where it was grabbed (cells from its corner), where it would land. */
  let drag: { i: number; el: HTMLElement; sx: number; sy: number; dx: number; dy: number; pointer: number; moving: boolean; target: Placed } | null = null;
  /** A drag ends with a click; that click must not place anything. */
  let suppressClick = false;

  const ghost = document.createElement('div');
  ghost.className = 'cr-ghost';
  ghost.hidden = true;

  const ac = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}) =>
    el.addEventListener(type, fn as EventListener, { ...opts, signal: ac.signal });

  /* ---- grid ------------------------------------------------------------------------------ */

  function measure() {
    const w = grid.parentElement!.clientWidth;
    gap = w < 560 ? 6 : 10;
    cell = Math.max(MIN_CELL, (w - gap * (COLS - 1)) / COLS);
    grid.style.setProperty('--cell', `${cell}px`);
    grid.style.setProperty('--gap', `${gap}px`);
  }

  /** Enough rows to fill the screen, and always a few free ones under the lowest tile. */
  function setRows() {
    const screen = Math.ceil(scroller.clientHeight / (cell + gap));
    rows = Math.min(MAX_ROWS, Math.max(screen, usedRows(plan) + 4));
    grid.style.setProperty('--rows', String(rows));
  }

  /** Placed tiles on screen by placement; only new or removed ones are touched, so the others don't flash. */
  const shown = new Map<string, HTMLElement>();
  const keyOf = (p: Placed) => JSON.stringify(p);

  function render() {
    if (!ghost.isConnected) grid.append(ghost);
    const keys = new Set(plan.tiles.map(keyOf));
    for (const [k, el] of shown) {
      if (keys.has(k)) continue;
      el.remove();
      shown.delete(k);
    }
    const added: HTMLElement[] = [];
    for (const p of plan.tiles) {
      const k = keyOf(p);
      const tile = lib.tiles.get(p[0]);
      if (shown.has(k) || !tile) continue;
      const el = renderTile(tile, p, true);
      el.dataset.key = k;
      grid.append(el);
      shown.set(k, el);
      added.push(el);
    }
    setRows();
    countLabel.textContent = S.count.replace('{n}', String(plan.tiles.length));
    requestAnimationFrame(() => added.forEach(fitTile));
  }

  const indexOf = (el: HTMLElement | null) => (el ? plan.tiles.findIndex((p) => keyOf(p) === el.dataset.key) : -1);

  function cellAt(e: { clientX: number; clientY: number }) {
    const r = grid.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / (cell + gap));
    const y = Math.floor((e.clientY - r.top) / (cell + gap));
    if (x < 0 || y < 0 || x >= COLS || y >= rows) return null;
    return { x, y };
  }

  /** Room for `p`? `ignore` = the index of a tile that is being moved or resized (it doesn't block itself). */
  function fits(p: Placed, ignore = -1) {
    if (p[2] + p[4] > MAX_ROWS) return false;
    if (ignore < 0 && plan.tiles.length >= MAX_TILES) return false;
    return !plan.tiles.some((t, i) => i !== ignore && overlaps(t, p));
  }

  /** Where the tile in hand would go with its top left corner on the hovered cell (pushed in from the right edge). */
  function target(): Placed | null {
    const hand = inv.hand();
    if (!hand || !hover) return null;
    const [w, h] = lib.tiles.get(hand.id)!.sizes[hand.size];
    return [hand.id, Math.max(0, Math.min(COLS - w, hover.x)), hover.y, w, h];
  }

  function showGhost(p: Placed | null = drag?.moving ? drag.target : target(), ignore = drag?.moving ? drag.i : -1) {
    ghost.hidden = !p;
    if (!p) return;
    ghost.style.gridColumn = `${p[1] + 1} / span ${p[3]}`;
    ghost.style.gridRow = `${p[2] + 1} / span ${p[4]}`;
    ghost.classList.toggle('is-bad', !fits(p, ignore));
  }

  /* ---- history ------------------------------------------------------------------------------ */

  const past: string[] = [];
  const future: string[] = [];

  /** Call before every change, so it can be undone. */
  function remember() {
    past.push(JSON.stringify(plan.tiles));
    if (past.length > HISTORY) past.shift();
    future.length = 0;
    updateHistory();
  }

  function travel(from: string[], to: string[]) {
    const s = from.pop();
    if (s === undefined) return;
    to.push(JSON.stringify(plan.tiles));
    plan.tiles = cleanPlan({ tiles: JSON.parse(s) }, lib.tiles).tiles;
    changed();
    updateHistory();
    sound.play('undo');
    announce(from === past ? S.live.undone : S.live.redone);
  }

  const undo = () => travel(past, future);
  const redo = () => travel(future, past);

  function updateHistory() {
    undoBtn.disabled = !past.length;
    redoBtn.disabled = !future.length;
  }

  function changed() {
    savePlan(plan);
    render();
    showGhost();
  }

  /* ---- feedback: effects, sounds, screen readers ---------------------------------------------- */

  const fx = createFx(root);
  const sound = createSound();
  const live = $('[data-cr-live]');
  const soundBtn = $<HTMLButtonElement>('[data-cr-sound]');
  const nameOf = (p: Placed) => lib.tiles.get(p[0])?.name ?? p[0];
  const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

  /** A polite message for screen readers (cleared first, so the same text twice is read twice). */
  function announce(text: string) {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = text));
  }

  function updateSoundBtn() {
    soundBtn.textContent = sound.isOn() ? S.soundOn : S.soundOff;
    soundBtn.setAttribute('aria-pressed', String(sound.isOn()));
  }

  function toggleSound() {
    const on = sound.toggle();
    updateSoundBtn();
    o.say(on ? S.soundOn : S.soundOff);
  }

  /** The tile at `p` pops in; `puff` > 0 adds a few pieces around it. */
  function landed(p: Placed, puff: number) {
    const el = shown.get(keyOf(p));
    if (!el) return;
    fx.pop(el);
    if (puff) fx.burst(el.getBoundingClientRect(), colorsOf(el), 8, puff);
  }

  function addTile(p: Placed) {
    remember();
    plan.tiles.push(p);
    changed();
    landed(p, 0.45);
    sound.play('place');
    announce(fill(S.live.placed, { name: nameOf(p), x: p[1] + 1, y: p[2] + 1 }));
  }

  function removeAt(i: number) {
    const p = plan.tiles[i];
    const el = shown.get(keyOf(p));
    if (el) {
      const r = el.getBoundingClientRect();
      const colors = colorsOf(el);
      fx.vanish(el);
      fx.burst(r, colors, 16);
    }
    remember();
    plan.tiles.splice(i, 1);
    hoverEl = null;
    changed();
    sound.play('remove');
    announce(fill(S.live.removed, { name: nameOf(p) }));
  }

  /** Tile i moved, resized or edited. */
  function setTile(i: number, next: Placed, kind: 'moved' | 'resized' | 'edited') {
    remember();
    plan.tiles[i] = next;
    changed();
    landed(next, 0);
    sound.play(kind === 'moved' ? 'move' : 'place');
    announce(fill(S.live[kind], { name: nameOf(next), x: next[1] + 1, y: next[2] + 1, w: next[3], h: next[4] }));
  }

  function noRoom() {
    sound.play('bad');
    announce(S.live.noRoom);
  }

  /* ---- hand ------------------------------------------------------------------------------ */

  function updateHand() {
    const hand = inv.hand();
    const t = hand ? lib.tiles.get(hand.id) : undefined;
    if (!hand || !t) {
      handLabel.textContent = S.empty;
      return;
    }
    const [w, h] = t.sizes[hand.size];
    handLabel.textContent = `${S.hand}: ${t.name} (${w}×${h})`;
  }

  const inv = createInventory({
    root,
    lib,
    strings: S,
    preview: previewTile,
    signal: ac.signal,
    onChange: () => {
      updateHand();
      showGhost();
      sound.play('pick');
    },
    onToggle: (open) => sound.play(open ? 'open' : 'close'),
  });

  /* ---- editing placed tiles ----------------------------------------------------------------- */

  /** R on a placed tile: its next size that fits where it stands (pulled in from the right edge). */
  function resize(i: number) {
    const p = plan.tiles[i];
    const sizes = lib.tiles.get(p[0])!.sizes;
    const cur = Math.max(0, sizes.findIndex(([w, h]) => w === p[3] && h === p[4]));
    for (let k = 1; k < sizes.length; k++) {
      const [w, h] = sizes[(cur + k) % sizes.length];
      const next: Placed = [p[0], Math.min(p[1], COLS - w), p[2], w, h];
      if (p[5]) next.push(p[5]);
      if (!fits(next, i)) continue;
      setTile(i, next, 'resized');
      return;
    }
    nudge(shown.get(keyOf(p)));
  }

  /** A short shake: that did not work. */
  function nudge(el: HTMLElement | undefined) {
    noRoom();
    if (!el) return;
    el.classList.remove('is-blocked');
    void el.offsetWidth;
    el.classList.add('is-blocked');
  }

  /* ---- block editor (double-click) ----------------------------------------------------------- */

  const editText = editBox.querySelector<HTMLTextAreaElement>('[data-cr-edit-text]')!;
  const editColors = editBox.querySelector<HTMLElement>('[data-cr-edit-colors]')!;
  let editing = -1;
  let editColor: ColorId | undefined;

  function openEdit(i: number) {
    const p = plan.tiles[i];
    const tile = lib.tiles.get(p[0])!;
    if (!tile.edit) return;
    editing = i;
    const current = shown.get(keyOf(p))?.querySelector('[data-text]')?.textContent ?? '';
    editText.value = p[5]?.t ?? current;
    editText.maxLength = tile.edit.max;
    editText.rows = tile.edit.max > 40 ? 4 : 1;
    editText.closest('label')!.hidden = !tile.edit.text;
    editColors.closest('fieldset')!.hidden = !tile.edit.color;
    editColor = p[5]?.c;
    for (const b of editColors.querySelectorAll<HTMLElement>('[data-color-id]')) b.setAttribute('aria-pressed', String(b.dataset.colorId === editColor));
    // Next to the tile, kept on screen
    const r = shown.get(keyOf(p))!.getBoundingClientRect();
    editBox.hidden = false;
    const w = editBox.offsetWidth;
    const h = editBox.offsetHeight;
    editBox.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
    editBox.style.top = `${r.bottom + h + 8 < innerHeight - 90 ? r.bottom + 8 : Math.max(70, r.top - h - 8)}px`;
    (tile.edit.text ? editText : editColors.querySelector<HTMLElement>('button'))?.focus();
  }

  function closeEdit(apply: boolean) {
    if (editing < 0) return;
    const i = editing;
    editing = -1;
    editBox.hidden = true;
    if (!apply) return;
    const p = plan.tiles[i];
    const tile = lib.tiles.get(p[0])!;
    const extra = cleanExtra({ t: editText.value, c: editColor }, tile);
    const next: Placed = [p[0], p[1], p[2], p[3], p[4]];
    if (extra) next.push(extra);
    if (keyOf(next) === keyOf(p)) return;
    setTile(i, next, 'edited');
  }

  for (const c of COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cr-swatch';
    b.dataset.colorId = c;
    b.style.setProperty('--sw', `var(--c-${c})`);
    b.setAttribute('aria-label', c);
    editColors.append(b);
  }
  on(editColors, 'click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-color-id]');
    if (!b) return;
    editColor = b.dataset.colorId as ColorId;
    for (const x of editColors.querySelectorAll('[data-color-id]')) x.setAttribute('aria-pressed', String(x === b));
  });
  on(editBox, 'click', (e) => {
    if ((e.target as Element).closest('[data-cr-edit-done]')) closeEdit(true);
  });

  /* ---- menu and questions ------------------------------------------------------------------- */

  let answer: ((yes: boolean) => void) | null = null;

  function ask(text: string): Promise<boolean> {
    confirmBox.querySelector('[data-cr-confirm-text]')!.textContent = text;
    confirmBox.hidden = false;
    confirmBox.querySelector<HTMLElement>('[data-cr-yes]')!.focus();
    return new Promise((r) => (answer = r));
  }

  function reply(yes: boolean) {
    confirmBox.hidden = true;
    answer?.(yes);
    answer = null;
  }

  on(confirmBox, 'click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-cr-yes]')) reply(true);
    else if (t.closest('[data-cr-no]') || t === confirmBox) reply(false);
  });

  function toggleMenu(open = menu.hidden) {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  async function startFrom(name: string) {
    const layout = lib.plans.get(name);
    if (!layout) return;
    if (plan.tiles.length && !(await ask(S.confirmTemplate))) return;
    remember();
    plan.tiles = cleanPlan({ tiles: layout.tiles }, lib.tiles).tiles;
    changed();
    scroller.scrollTop = 0;
    sound.play('place');
    announce(S.live.template);
  }

  async function clearAll() {
    if (!plan.tiles.length || !(await ask(S.confirmClear))) return;
    // Every tile on screen breaks apart (a few pieces each)
    for (const el of [...shown.values()].slice(0, 40)) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      fx.vanish(el);
      fx.burst(r, colorsOf(el), 6);
    }
    remember();
    plan.tiles = [];
    changed();
    sound.play('clear');
    announce(S.live.cleared);
  }

  $('[data-cr-template]').hidden = !lib.plans.has('hub');
  on(menu, 'click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-cr-share]')) void share();
    else if (t.closest('[data-cr-sound]')) toggleSound();
    else if (t.closest('[data-cr-template]')) {
      toggleMenu(false);
      void startFrom('hub');
    } else if (t.closest('[data-cr-clear]')) {
      toggleMenu(false);
      void clearAll();
    }
  });
  on(menuBtn, 'click', () => toggleMenu());
  on($('[data-cr-done]'), 'click', () => o.onExit());
  on(undoBtn, 'click', undo);
  on(redoBtn, 'click', redo);

  /* ---- share link ------------------------------------------------------------------------------ */

  async function share() {
    if (!plan.tiles.length) {
      o.say(S.shareEmpty);
      return;
    }
    const url = shareUrl(await encodePlan(plan));
    shareField.value = url;
    shareField.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      o.say(S.shareCopied, S.shareSub);
    } catch {
      toggleMenu(true);
      shareField.focus();
      shareField.select();
      o.say(S.shareFailed);
    }
  }

  /* ---- touch: tile menu -------------------------------------------------------------------------- */

  /** Tile waiting for a tap on its new place ("move" in the tile menu), or -1. */
  let touchMove = -1;
  let menuTile = -1;

  function openTileMenu(i: number) {
    menuTile = i;
    const p = plan.tiles[i];
    const tile = lib.tiles.get(p[0])!;
    tileMenu.querySelector<HTMLElement>('[data-act="edit"]')!.hidden = !tile.edit;
    tileMenu.querySelector<HTMLElement>('[data-act="size"]')!.hidden = tile.sizes.length < 2;
    const r = shown.get(keyOf(p))!.getBoundingClientRect();
    tileMenu.hidden = false;
    const w = tileMenu.offsetWidth;
    const h = tileMenu.offsetHeight;
    tileMenu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tileMenu.style.top = `${Math.max(64, Math.min(innerHeight - h - 90, r.top + 8))}px`;
  }

  function closeTileMenu() {
    tileMenu.hidden = true;
    menuTile = -1;
  }

  function endTouchMove() {
    if (touchMove < 0) return;
    shown.get(keyOf(plan.tiles[touchMove]))?.classList.remove('is-moving');
    touchMove = -1;
  }

  on(tileMenu, 'click', (e) => {
    const act = (e.target as Element).closest<HTMLElement>('[data-act]')?.dataset.act;
    const i = menuTile;
    if (!act || i < 0) return;
    closeTileMenu();
    const p = plan.tiles[i];
    if (act === 'size') resize(i);
    else if (act === 'edit') openEdit(i);
    else if (act === 'copy') {
      const size = lib.tiles.get(p[0])!.sizes.findIndex(([w, h]) => w === p[3] && h === p[4]);
      inv.pick(p[0], Math.max(0, size));
    } else if (act === 'move') {
      touchMove = i;
      shown.get(keyOf(p))?.classList.add('is-moving');
      o.say(S.moveHint);
    } else if (act === 'remove') removeAt(i);
  });

  /** A tap (touch): move the waiting tile, open a tile's menu, or place the tile in hand. */
  function tap(e: MouseEvent) {
    const at = cellAt(e);
    if (touchMove >= 0) {
      const i = touchMove;
      const p = plan.tiles[i];
      endTouchMove();
      if (!at) return;
      const next: Placed = [p[0], Math.max(0, Math.min(COLS - p[3], at.x)), at.y, p[3], p[4]];
      if (p[5]) next.push(p[5]);
      if (!fits(next, i)) {
        nudge(shown.get(keyOf(p)));
        return;
      }
      setTile(i, next, 'moved');
      return;
    }
    const i = indexOf((e.target as Element).closest<HTMLElement>('.cr-tile'));
    if (i >= 0) {
      openTileMenu(i);
      return;
    }
    hover = at;
    const p = target();
    hover = null;
    if (!p) return;
    if (!fits(p)) {
      noRoom();
      showGhost(p);
      setTimeout(() => showGhost(null), 600);
      return;
    }
    addTile(p);
    showGhost(null);
  }

  /* ---- pointer -------------------------------------------------------------------------------- */

  /** How the last press on the grid came: touch taps work differently (tap(), no drag-to-move). */
  let pointerType = 'mouse';

  on(grid, 'pointerdown', (e) => {
    pointerType = e.pointerType;
    if (e.button === 1) e.preventDefault(); // no auto-scroll on middle-click
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const el = (e.target as Element).closest<HTMLElement>('.cr-tile');
    const i = indexOf(el);
    const at = cellAt(e);
    if (i < 0 || !at || !el) return;
    const p = plan.tiles[i];
    drag = { i, el, sx: e.clientX, sy: e.clientY, dx: at.x - p[1], dy: at.y - p[2], pointer: e.pointerId, moving: false, target: p };
  });
  on(window, 'pointermove', (e) => {
    if (drag && e.pointerId === drag.pointer) {
      if (!drag.moving && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.moving = true;
      drag.el.classList.add('is-moving');
      grid.classList.add('is-dragging');
      const at = cellAt(e);
      if (at) {
        const p = plan.tiles[drag.i];
        const t: Placed = [p[0], Math.max(0, Math.min(COLS - p[3], at.x - drag.dx)), Math.max(0, at.y - drag.dy), p[3], p[4]];
        if (p[5]) t.push(p[5]);
        drag.target = t;
      }
      showGhost();
      autoScroll(e.clientY);
    }
  });
  on(window, 'pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    d.el.classList.remove('is-moving');
    grid.classList.remove('is-dragging');
    if (!d.moving) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const p = plan.tiles[d.i];
    if (fits(d.target, d.i) && keyOf(d.target) !== keyOf(p)) setTile(d.i, d.target, 'moved');
    else {
      if (!fits(d.target, d.i)) noRoom();
      showGhost();
    }
  });

  on(window, 'pointercancel', () => {
    if (!drag) return;
    drag.el.classList.remove('is-moving');
    grid.classList.remove('is-dragging');
    drag = null;
    showGhost();
  });

  /** Dragging near the top or bottom edge scrolls the grid. */
  function autoScroll(y: number) {
    const r = scroller.getBoundingClientRect();
    if (y < r.top + 40) scroller.scrollTop -= 12;
    else if (y > r.bottom - 120) scroller.scrollTop += 12;
  }

  on(grid, 'pointermove', (e) => {
    hover = cellAt(e);
    hoverEl = (e.target as Element).closest<HTMLElement>('.cr-tile');
    if (!drag?.moving) showGhost();
  });
  on(grid, 'pointerleave', () => {
    hover = null;
    hoverEl = null;
    if (!drag?.moving) showGhost();
  });
  on(grid, 'click', (e) => {
    if (suppressClick) return;
    if (pointerType === 'touch') {
      tap(e);
      return;
    }
    hover = cellAt(e);
    const p = target();
    if (!p) return;
    if (!fits(p)) noRoom();
    else addTile(p);
  });
  on(grid, 'dblclick', (e) => {
    const i = indexOf((e.target as Element).closest<HTMLElement>('.cr-tile'));
    if (i >= 0) openEdit(i);
  });
  on(grid, 'contextmenu', (e) => {
    e.preventDefault();
    const i = indexOf((e.target as Element).closest<HTMLElement>('.cr-tile'));
    if (i >= 0) removeAt(i);
  });
  // Middle-click: copy that tile (in its size) into your hand
  on(grid, 'auxclick', (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    const i = indexOf((e.target as Element).closest<HTMLElement>('.cr-tile'));
    if (i < 0) return;
    const p = plan.tiles[i];
    const size = lib.tiles.get(p[0])!.sizes.findIndex(([w, h]) => w === p[3] && h === p[4]);
    inv.pick(p[0], Math.max(0, size));
  });

  /* ---- keys ------------------------------------------------------------------------------------ */

  /* ---- keyboard building: a cursor on the grid ------------------------------------------------- */

  let cursor = { x: 0, y: 0 };
  const cursorEl = document.createElement('div');
  cursorEl.className = 'cr-cursor';
  cursorEl.hidden = true;
  const tileAt = (x: number, y: number) => plan.tiles.findIndex((t) => x >= t[1] && x < t[1] + t[3] && y >= t[2] && y < t[2] + t[4]);

  function showCursor() {
    if (!cursorEl.isConnected) grid.append(cursorEl);
    cursorEl.hidden = false;
    cursorEl.style.gridColumn = String(cursor.x + 1);
    cursorEl.style.gridRow = String(cursor.y + 1);
    hover = { ...cursor };
    showGhost();
    // Keep it on screen (above the hotbar)
    const r = cursorEl.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    if (r.top < s.top + 8) scroller.scrollTop -= s.top + 8 - r.top;
    else if (r.bottom > s.bottom - 110) scroller.scrollTop += r.bottom - (s.bottom - 110);
    if (r.left < s.left + 8) scroller.scrollLeft -= s.left + 8 - r.left;
    else if (r.right > s.right - 8) scroller.scrollLeft += r.right - (s.right - 8);
  }

  function describeCursor() {
    const i = tileAt(cursor.x, cursor.y);
    const v = { x: cursor.x + 1, y: cursor.y + 1, name: i >= 0 ? nameOf(plan.tiles[i]) : '' };
    announce(fill(i >= 0 ? S.live.cursorOn : S.live.cursor, v));
  }

  const DIRS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

  /** Keys while the grid has focus; true = handled. */
  function gridKey(e: KeyboardEvent): boolean {
    const d = DIRS[e.key];
    const i = tileAt(cursor.x, cursor.y);
    if (d) {
      if (e.shiftKey && i >= 0) {
        const p = plan.tiles[i];
        const next: Placed = [p[0], p[1] + d[0], p[2] + d[1], p[3], p[4]];
        if (p[5]) next.push(p[5]);
        if (next[1] < 0 || next[2] < 0 || next[1] + next[3] > COLS || !fits(next, i)) noRoom();
        else {
          setTile(i, next, 'moved');
          cursor = { x: cursor.x + d[0], y: cursor.y + d[1] };
          showCursor();
        }
        return true;
      }
      cursor = { x: Math.max(0, Math.min(COLS - 1, cursor.x + d[0])), y: Math.max(0, Math.min(rows - 1, cursor.y + d[1])) };
      showCursor();
      describeCursor();
      return true;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      hover = { ...cursor };
      const p = target();
      if (p && fits(p)) addTile(p);
      else if (i >= 0 && lib.tiles.get(plan.tiles[i][0])?.edit) openEdit(i);
      else noRoom();
      return true;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (i >= 0) removeAt(i);
      return true;
    }
    const k = e.key.toLowerCase();
    if (k === 'c' && i >= 0) {
      const p = plan.tiles[i];
      inv.pick(p[0], Math.max(0, lib.tiles.get(p[0])!.sizes.findIndex(([w, h]) => w === p[3] && h === p[4])));
      return true;
    }
    if (k === 'r') {
      if (i >= 0) resize(i);
      else inv.turn();
      return true;
    }
    return false;
  }

  on(grid, 'focus', () => {
    // Start where the pointer was, or top left
    if (hover) cursor = { ...hover };
    showCursor();
    describeCursor();
  });
  on(grid, 'blur', () => {
    cursorEl.hidden = true;
    hover = null;
    showGhost();
  });

  /** Tab stays inside the layer that is open on top (question, block editor, or the whole mode). */
  function trapFocus(e: KeyboardEvent) {
    const layer = !confirmBox.hidden ? confirmBox : editing >= 0 ? editBox : root;
    const items = [...layer.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex="0"]')].filter(
      (el) => el.getClientRects().length > 0 && !el.closest('[hidden], [inert]'),
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (!active || !layer.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  on(window, 'keydown', (e) => {
    if (e.key === 'Tab') {
      trapFocus(e);
      return;
    }
    if (!confirmBox.hidden) {
      if (e.key === 'Escape') reply(false);
      return;
    }
    if (editing >= 0) {
      if (e.key === 'Escape') closeEdit(false);
      else if (e.key === 'Enter' && (e.target !== editText || editText.rows === 1 || e.ctrlKey || e.metaKey)) closeEdit(true);
      else return;
      e.preventDefault();
      return;
    }
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (k === 'z' || k === 'y')) {
      if (k === 'y' || e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (inv.isOpen()) {
      if (inv.key(e)) e.preventDefault();
      return;
    }
    if (document.activeElement === grid && gridKey(e)) {
      e.preventDefault();
      return;
    }
    if (k === 'm' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
      toggleSound();
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (!tileMenu.hidden) closeTileMenu();
      else if (touchMove >= 0) endTouchMove();
      else if (!menu.hidden) toggleMenu(false);
      else o.onExit();
    } else if (k === 'e') inv.toggle(true);
    else if (/^[1-9]$/.test(e.key)) inv.select(Number(e.key) - 1);
    else if (k === 'r') {
      const i = indexOf(hoverEl);
      if (i >= 0) resize(i);
      else inv.turn();
    } else return;
    e.preventDefault();
  });

  // Clicks outside the menu or the block editor close them
  on(root, 'pointerdown', (e) => {
    const t = e.target as Element;
    if (!menu.hidden && !t.closest('[data-cr-menu], [data-cr-menu-btn]')) toggleMenu(false);
    if (!tileMenu.hidden && !t.closest('[data-cr-tilemenu]')) closeTileMenu();
    if (editing >= 0 && !t.closest('[data-cr-edit]')) closeEdit(true);
  });

  on(window, 'resize', () => {
    measure();
    setRows();
    for (const el of shown.values()) fitTile(el);
  });
  // Pictures that arrive late change the height of "scale" tiles
  grid.addEventListener(
    'load',
    (e) => {
      const el = (e.target as Element).closest<HTMLElement>('.cr-tile');
      if (el) fitTile(el);
    },
    { capture: true, signal: ac.signal },
  );

  // Local development only: lets tests look inside and build without a mouse
  if (import.meta.env.DEV) {
    (window as unknown as { creative: unknown }).creative = {
      plan: () => plan,
      ids: () => lib.order,
      inv,
      undo,
      redo,
      resize,
      edit: openEdit,
      sound,
      place: (id: string, x: number, y: number, size = 0) => {
        const [w, h] = lib.tiles.get(id)!.sizes[size];
        const p: Placed = [id, x, y, w, h];
        if (!fits(p)) return false;
        addTile(p);
        return true;
      },
    };
  }

  measure();
  render();
  updateHand();
  updateHistory();
  updateSoundBtn();
  scroller.scrollTop = 0;

  return () => {
    closeEdit(true);
    reply(false);
    closeTileMenu();
    endTouchMove();
    shareField.hidden = true;
    ac.abort();
    savePlan(plan);
  };
}
