/**
 * Creative mode hotbar and inventory.
 *
 * Hotbar (always at the bottom): 9 slots with a small picture of the tile.
 * 1–9 or the mouse wheel over the hotbar pick a slot; the tile in the picked
 * slot is the one in your hand. Right-click a slot to empty it; drag a slot
 * onto another to swap them. The hotbar is saved (plan.ts, loadHotbar).
 *
 * Inventory (E, or the button in the bar): every tile in six tabs plus a
 * search. Click a tile: it goes into the picked slot. Point at a tile and
 * press 1–9: it goes into that slot. Or drag it onto a slot.
 */
import { SLOTS, loadHotbar, saveHotbar, type Slot } from './plan';
import type { Library, Tile } from './tiles';

export interface InventoryStrings {
  inventory: string;
  search: string;
  noResults: string;
  emptySlot: string;
  sizes: string;
  tabs: Record<string, string>;
}

interface Options {
  root: HTMLElement;
  lib: Library;
  strings: InventoryStrings;
  /** Small picture of a tile in one of its sizes, `box` pixels square. */
  preview: (tile: Tile, size: number, box: number) => HTMLElement;
  /** The tile in hand changed (other slot, other tile, other size). */
  onChange: () => void;
  /** The inventory opened or closed. */
  onToggle?: (open: boolean) => void;
  signal: AbortSignal;
}

export interface Inventory {
  hand(): Slot;
  /** Next size of the tile in hand (R). */
  turn(): void;
  select(i: number): void;
  /** Middle-click on a placed tile: the slot that holds it is picked (in that size), or it goes into the picked slot. */
  pick(id: string, size: number): void;
  isOpen(): boolean;
  toggle(open?: boolean): void;
  /** Keys while the inventory is open; true = handled. */
  key(e: KeyboardEvent): boolean;
  slots: Slot[];
}

/** Starting hotbar: a bit of everything. */
function defaultSlots(lib: Library): Slot[] {
  const first = (prefix: string) => lib.order.find((id) => id.startsWith(prefix));
  const ids = ['name', 'card', 'portrait', first('p:'), first('g:'), 'video', 'latest-update', 'b:heading', 'b:text'];
  return Array.from({ length: SLOTS }, (_, i) => {
    const id = ids[i];
    return id && lib.tiles.has(id) ? { id, size: 0 } : null;
  });
}

export function createInventory(o: Options): Inventory {
  const { root, lib, strings: S, signal } = o;
  const bar = root.querySelector<HTMLElement>('[data-cr-hotbar]')!;
  const slotEls = [...bar.querySelectorAll<HTMLButtonElement>('[data-slot]')];
  const slotName = root.querySelector<HTMLElement>('[data-cr-slotname]')!;
  const inv = root.querySelector<HTMLElement>('[data-cr-inv]')!;
  const tabsEl = inv.querySelector<HTMLElement>('[data-cr-tabs]')!;
  const items = inv.querySelector<HTMLElement>('[data-cr-items]')!;
  const search = inv.querySelector<HTMLInputElement>('[data-cr-search]')!;
  const openBtn = root.querySelector<HTMLButtonElement>('[data-cr-inv-btn]')!;

  const slots: Slot[] = loadHotbar(lib.tiles) ?? defaultSlots(lib);
  let selected = 0;
  let tab = Object.keys(S.tabs)[0];
  /** Tile under the pointer in the inventory (for 1–9). */
  let pointed: string | null = null;

  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}) =>
    el.addEventListener(type, fn as EventListener, { ...opts, signal });

  /* ---- hotbar ------------------------------------------------------------------------------ */

  function renderSlot(i: number) {
    const el = slotEls[i];
    const s = slots[i];
    const tile = s ? lib.tiles.get(s.id) : undefined;
    el.querySelector('.cr-slot__item')?.remove();
    if (tile && s) {
      const pic = o.preview(tile, s.size, 46);
      pic.classList.add('cr-slot__item');
      el.append(pic);
    }
    el.setAttribute('aria-label', `${i + 1}: ${tile ? `${tile.name} (${sizeText(tile, s!.size)})` : S.emptySlot}`);
    el.setAttribute('aria-pressed', String(i === selected));
  }

  function renderHotbar() {
    for (let i = 0; i < SLOTS; i++) renderSlot(i);
  }

  /** The name of the tile in hand pops up over the hotbar for a moment. */
  let nameTimer = 0;
  function showName() {
    const s = slots[selected];
    const tile = s ? lib.tiles.get(s.id) : undefined;
    slotName.textContent = tile ? `${tile.name} · ${sizeText(tile, s!.size)}` : S.emptySlot;
    slotName.classList.remove('is-on');
    void slotName.offsetWidth;
    slotName.classList.add('is-on');
    clearTimeout(nameTimer);
    nameTimer = window.setTimeout(() => slotName.classList.remove('is-on'), 1800);
  }

  function select(i: number) {
    const before = selected;
    selected = ((i % SLOTS) + SLOTS) % SLOTS;
    slotEls[before].setAttribute('aria-pressed', 'false');
    slotEls[selected].setAttribute('aria-pressed', 'true');
    showName();
    o.onChange();
  }

  function put(i: number, id: string) {
    slots[i] = { id, size: 0 };
    saveHotbar(slots);
    renderSlot(i);
    slotEls[i].classList.remove('is-new');
    void slotEls[i].offsetWidth;
    slotEls[i].classList.add('is-new');
    if (i === selected) {
      showName();
      o.onChange();
    }
  }

  function pick(id: string, size: number) {
    const i = slots.findIndex((s) => s?.id === id);
    const at = i >= 0 ? i : selected;
    slots[at] = { id, size };
    saveHotbar(slots);
    renderSlot(at);
    if (at !== selected) select(at);
    else {
      showName();
      o.onChange();
    }
  }

  function turn() {
    const s = slots[selected];
    if (!s) return;
    s.size = (s.size + 1) % lib.tiles.get(s.id)!.sizes.length;
    saveHotbar(slots);
    renderSlot(selected);
    showName();
    o.onChange();
  }

  on(bar, 'wheel', (e) => {
    e.preventDefault();
    select(selected + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  on(bar, 'contextmenu', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-slot]');
    e.preventDefault();
    if (!el) return;
    const i = Number(el.dataset.slot);
    slots[i] = null;
    saveHotbar(slots);
    renderSlot(i);
    if (i === selected) {
      showName();
      o.onChange();
    }
  });

  /* ---- dragging (inventory → slot, slot → slot) -------------------------------------------- */

  let drag: { id: string; from: number; x: number; y: number; pointer: number; ghost: HTMLElement | null } | null = null;
  /** A drag ends with a click on the element it started on; that click must not count. */
  let suppressClick = false;

  function startDrag(e: PointerEvent, id: string, from: number) {
    if (e.button !== 0) return;
    drag = { id, from, x: e.clientX, y: e.clientY, pointer: e.pointerId, ghost: null };
  }

  on(window, 'pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      const tile = lib.tiles.get(drag.id)!;
      drag.ghost = o.preview(tile, drag.from >= 0 ? (slots[drag.from]?.size ?? 0) : 0, 56);
      drag.ghost.classList.add('cr-drag');
      root.append(drag.ghost);
    }
    drag.ghost.style.translate = `${e.clientX - 28}px ${e.clientY - 28}px`;
    for (const el of slotEls) el.classList.toggle('is-drop', el === document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot]'));
  });
  on(window, 'pointerup', (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const d = drag;
    drag = null;
    for (const el of slotEls) el.classList.remove('is-drop');
    if (!d.ghost) return; // a click, handled by the click listeners
    d.ghost.remove();
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]');
    if (!target) return;
    const i = Number(target.dataset.slot);
    if (d.from >= 0) {
      // Slot onto slot: swap
      [slots[i], slots[d.from]] = [slots[d.from], slots[i]];
      saveHotbar(slots);
      renderSlot(i);
      renderSlot(d.from);
      if (i === selected || d.from === selected) o.onChange();
    } else put(i, d.id);
  });

  on(bar, 'pointerdown', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-slot]');
    const i = el ? Number(el.dataset.slot) : -1;
    if (el && slots[i]) startDrag(e, slots[i]!.id, i);
  });
  on(bar, 'click', (e) => {
    const el = (e.target as Element).closest<HTMLElement>('[data-slot]');
    if (el && !suppressClick) select(Number(el.dataset.slot));
  });

  /* ---- inventory --------------------------------------------------------------------------- */

  function buildTabs() {
    tabsEl.replaceChildren();
    for (const [key, label] of Object.entries(S.tabs)) {
      if (!lib.order.some((id) => lib.tiles.get(id)!.tab === key)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cr-tab';
      b.textContent = label;
      b.dataset.tab = key;
      b.setAttribute('role', 'tab');
      tabsEl.append(b);
    }
  }

  function renderItems() {
    const q = search.value.trim().toLowerCase();
    for (const b of tabsEl.querySelectorAll<HTMLElement>('[data-tab]')) b.setAttribute('aria-selected', String(!q && b.dataset.tab === tab));
    const ids = lib.order.filter((id) => {
      const t = lib.tiles.get(id)!;
      return q ? t.name.toLowerCase().includes(q) || id.includes(q) : t.tab === tab;
    });
    items.replaceChildren();
    if (!ids.length) {
      const p = document.createElement('p');
      p.className = 'cr-inv__empty';
      p.textContent = S.noResults;
      items.append(p);
      return;
    }
    for (const id of ids) {
      const t = lib.tiles.get(id)!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cr-item';
      b.dataset.item = id;
      b.title = `${t.name} · ${S.sizes}: ${t.sizes.map(([w, h]) => `${w}×${h}`).join(', ')}`;
      b.append(o.preview(t, squarest(t), 72));
      const name = document.createElement('span');
      name.className = 'cr-item__name';
      name.textContent = t.name;
      b.append(name);
      items.append(b);
    }
  }

  let lastFocus: HTMLElement | null = null;
  function toggle(open = inv.hidden) {
    if (open === !inv.hidden) return;
    inv.hidden = !open;
    openBtn.setAttribute('aria-expanded', String(open));
    o.onToggle?.(open);
    if (open) {
      lastFocus = document.activeElement as HTMLElement | null;
      renderItems();
      (items.querySelector<HTMLElement>('.cr-item') ?? search).focus({ preventScroll: true });
    } else {
      pointed = null;
      lastFocus?.focus({ preventScroll: true });
    }
  }

  on(tabsEl, 'click', (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-tab]');
    if (!b) return;
    tab = b.dataset.tab!;
    search.value = '';
    renderItems();
  });
  on(search, 'input', renderItems);
  on(items, 'pointerover', (e) => {
    pointed = (e.target as Element).closest<HTMLElement>('[data-item]')?.dataset.item ?? null;
  });
  on(items, 'pointerleave', () => {
    pointed = null;
  });
  on(items, 'focusin', (e) => {
    pointed = (e.target as Element).closest<HTMLElement>('[data-item]')?.dataset.item ?? pointed;
  });
  on(items, 'pointerdown', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-item]')?.dataset.item;
    if (id) startDrag(e, id, -1);
  });
  on(items, 'click', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-item]')?.dataset.item;
    if (id && !suppressClick) put(selected, id);
  });
  on(openBtn, 'click', () => toggle());
  on(inv, 'click', (e) => {
    if ((e.target as Element).closest('[data-cr-inv-close]')) toggle(false);
  });

  function key(e: KeyboardEvent): boolean {
    const typing = e.target === search;
    if (e.key === 'Escape' || ((e.key === 'e' || e.key === 'E') && !typing)) {
      toggle(false);
      return true;
    }
    if (!typing && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1;
      if (pointed) put(i, pointed);
      else select(i);
      return true;
    }
    return false;
  }

  buildTabs();
  renderHotbar();

  return {
    hand: () => slots[selected],
    turn,
    select,
    pick,
    isOpen: () => !inv.hidden,
    toggle,
    key,
    slots,
  };
}

/** The size closest to a square: its picture reads best in a small square box. */
function squarest(tile: Tile) {
  let best = 0;
  tile.sizes.forEach(([w, h], i) => {
    const [bw, bh] = tile.sizes[best];
    if (Math.max(w, h) / Math.min(w, h) < Math.max(bw, bh) / Math.min(bw, bh)) best = i;
  });
  return best;
}

function sizeText(tile: Tile, size: number) {
  const [w, h] = tile.sizes[size] ?? tile.sizes[0];
  return `${w}×${h}`;
}
