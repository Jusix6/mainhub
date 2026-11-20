/**
 * Creative mode tiles: loads the templates from /creative/tiles (see that page)
 * and turns a placed tile into an element. Used by the editor and, later, by
 * the start page that shows a saved build.
 */
import { parseSizes, type Extra, type Placed, type TileInfo } from './plan';

export interface Tile extends TileInfo {
  id: string;
  tab: string;
  name: string;
  fit: 'fill' | 'scale';
  template: HTMLTemplateElement;
}

export interface Library {
  tiles: Map<string, Tile>;
  /** Tile ids in the order of the templates page. */
  order: string[];
  /** Starting layouts (the "original hub"), raw: run them through cleanPlan. */
  plans: Map<string, { name: string; tiles: unknown }>;
}

let library: Promise<Library> | null = null;

/** Fetches the tile templates once and takes over their stylesheets. */
export function loadLibrary(): Promise<Library> {
  library ??= (async () => {
    const res = await fetch('/creative/tiles', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`tiles ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    adoptStyles(doc);
    const tiles = new Map<string, Tile>();
    const order: string[] = [];
    for (const t of doc.querySelectorAll<HTMLTemplateElement>('template[data-tile]')) {
      const id = t.dataset.tile!;
      if (tiles.has(id)) continue;
      const edit = (t.dataset.edit ?? '').split(/\s+/);
      tiles.set(id, {
        id,
        tab: t.dataset.tab ?? 'blocks',
        name: t.dataset.name ?? id,
        sizes: parseSizes(t.dataset.sizes),
        fit: t.dataset.fit === 'scale' ? 'scale' : 'fill',
        edit: t.dataset.edit ? { text: edit.includes('text'), color: edit.includes('color'), max: Number(t.dataset.max) || 40 } : undefined,
        template: t,
      });
      order.push(id);
    }
    const plans = new Map<string, { name: string; tiles: unknown }>();
    for (const t of doc.querySelectorAll<HTMLTemplateElement>('template[data-plan]')) {
      try {
        plans.set(t.dataset.plan!, { name: t.dataset.name ?? t.dataset.plan!, tiles: JSON.parse(t.dataset.tiles ?? '[]') });
      } catch {
        /* a broken layout is left out */
      }
    }
    return { tiles, order, plans };
  })();
  library.catch(() => {
    library = null;
  });
  return library;
}

/** Stylesheets of the templates page that this page does not have yet. */
function adoptStyles(doc: Document) {
  const hrefs = new Set([...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => l.href));
  const texts = new Set([...document.querySelectorAll('style')].map((s) => s.textContent));
  for (const el of doc.head.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')) {
    if (el instanceof HTMLLinkElement) {
      const href = new URL(el.getAttribute('href') ?? '', location.href).href;
      if (hrefs.has(href)) continue;
      hrefs.add(href);
    } else if (texts.has(el.textContent)) continue;
    document.head.append(document.importNode(el, true));
  }
}

/** Own text (as text, never HTML) and colour of a block. */
export function applyExtra(root: ParentNode, extra: Extra | undefined) {
  if (!extra) return;
  if (extra.t !== undefined) {
    const el = root.querySelector('[data-text]');
    if (el) el.textContent = extra.t;
  }
  if (extra.c) {
    const holder = root.querySelector<HTMLElement>('[data-color]');
    const target = holder?.dataset.colorOn ? holder.querySelector<HTMLElement>(holder.dataset.colorOn) : holder;
    target?.style.setProperty(holder!.dataset.color!, `var(--c-${extra.c})`);
  }
}

/** One tile as an element, placed on the grid. `edit` makes its content inert (no links while building). */
export function renderTile(tile: Tile, p: Placed, edit: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cr-tile';
  el.dataset.id = p[0];
  el.dataset.fit = tile.fit;
  el.style.gridColumn = `${p[1] + 1} / span ${p[3]}`;
  el.style.gridRow = `${p[2] + 1} / span ${p[4]}`;
  const inner = document.createElement('div');
  inner.className = 'cr-tile__inner';
  inner.append(document.importNode(tile.template.content, true));
  applyExtra(inner, p[5]);
  if (edit) inner.inert = true;
  el.append(inner);
  return el;
}

/** A small picture of a tile in one of its sizes, `box` pixels square (hotbar, inventory). */
export function previewTile(tile: Tile, size: number, box: number): HTMLElement {
  const [w, h] = tile.sizes[size] ?? tile.sizes[0];
  const unit = 60;
  const gap = 8;
  const pw = w * unit + (w - 1) * gap;
  const ph = h * unit + (h - 1) * gap;
  const s = box / Math.max(pw, ph);
  const wrap = document.createElement('span');
  wrap.className = 'cr-prev';
  wrap.style.width = `${box}px`;
  wrap.style.height = `${box}px`;
  const el = renderTile(tile, [tile.id, 0, 0, w, h], true);
  el.style.gridColumn = '';
  el.style.gridRow = '';
  el.style.width = `${pw}px`;
  el.style.height = `${ph}px`;
  el.style.left = `${(box - pw * s) / 2}px`;
  el.style.top = `${(box - ph * s) / 2}px`;
  el.style.transform = `scale(${s})`;
  wrap.append(el);
  requestAnimationFrame(() => fitTile(el));
  return wrap;
}

/** "scale" tiles keep their own layout at the tile's width and shrink until they fit the height. */
export function fitTile(el: HTMLElement) {
  if (el.dataset.fit !== 'scale') return;
  const inner = el.firstElementChild as HTMLElement;
  inner.style.transform = '';
  const h = inner.scrollHeight;
  const box = el.clientHeight;
  const s = h > box && h > 0 ? box / h : 1;
  inner.style.transform = s < 1 ? `scale(${s})` : '';
}
