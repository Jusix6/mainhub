/**
 * Face Witness: the composite studio window. A daily case (the same suspect
 * for everyone, case 1 = the launch day, the day changes at midnight in
 * Zurich) or free drawing. Library: pick a part; drag parts on the picture;
 * part settings change width, height, rotation and spacing. Submit compares
 * with the suspect (case.ts). Undo/redo (Ctrl+Z, Ctrl+Shift+Z), Delete
 * removes the selected part. The draft and the submitted case of the day are
 * kept in localStorage (`jxsi_facewitness_draft_<n>`, `jxsi_facewitness_done_<n>`), and the
 * lines of the witness statement the player ticked off (`jxsi_facewitness_ticks_<n>`).
 */
import type { UI } from '@/data/ui';
import { dayIndex } from '@/lib/daily';
import { hints, makeSuspect, rankOf, score, type Score } from './case';
import { LIB, ORDER, PARTS, type PartId } from './parts';
import { bbox, drawPart, hit, newPart, PAPER, render, type Part, type Parts } from './render';

export type FaceWitnessStrings = (typeof UI)['fun']['faceWitness'];

/** Case 1 is the launch day. */
const LAUNCH = Date.UTC(2026, 10, 21);
/** The picture is drawn at twice its size for sharp dots. */
const K = 2;
const KEY = 'jxsi_facewitness_';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ''));

const store = {
  get<T>(k: string): T | null {
    try {
      return JSON.parse(localStorage.getItem(KEY + k) ?? 'null') as T | null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(KEY + k, JSON.stringify(v));
    } catch {
      /* private mode: kept until the page closes */
    }
  },
};

interface Done {
  parts: Parts;
  r: Score;
}

export function startFaceWitness(root: HTMLElement, T: FaceWitnessStrings) {
  const $ = <E extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<E>(sel)!;
  const cv = $<HTMLCanvasElement>('[data-cv]');
  const cx = cv.getContext('2d')!;
  const win = $('[data-win]');
  const caseBox = $('[data-case]');
  const grid = $('[data-grid]');
  const cats = $('[data-cats]');
  const pSet = $('[data-pset]');
  const pLib = $('[data-plib]');
  const name = (id: PartId) => T.parts[id].name;
  const variantName = (id: PartId, v: number) => T.parts[id].variants[v]?.[0] ?? '';

  let mode: 'daily' | 'free' = 'daily';
  let parts: Parts = {};
  let sel: PartId | null = null;
  let cat: PartId = 'eyes';
  let undo: string[] = [];
  let redo: string[] = [];
  let last = '{}';
  let guides = false;
  let tab: 'lib' | 'set' = 'lib';
  let suspect: Parts = {};
  let day = { no: 1, date: '' };
  let done: Done | null = null;

  const draw = () => render(cx, parts, K, { sel, guides });

  /* ---- history ---------------------------------------------------------------------------- */

  function commit() {
    const s = JSON.stringify(parts);
    if (s !== last) {
      undo.push(last);
      if (undo.length > 100) undo.shift();
      redo = [];
      last = s;
      if (mode === 'daily' && !done) store.set(`draft_${day.no}`, parts);
    }
    ui();
  }

  function reset(p: Parts) {
    parts = p;
    sel = null;
    undo = [];
    redo = [];
    last = JSON.stringify(parts);
    ui();
  }

  function travel(from: string[], to: string[]) {
    const s = from.pop();
    if (s === undefined) return;
    to.push(last);
    last = s;
    parts = JSON.parse(s) as Parts;
    if (sel && !parts[sel]) sel = null;
    ui();
  }
  const doUndo = () => travel(undo, redo);
  const doRedo = () => travel(redo, undo);

  function delPart() {
    if (!sel) return;
    delete parts[sel];
    sel = null;
    commit();
  }

  /* ---- the daily case ------------------------------------------------------------------------- */

  function today() {
    // Local development only: ?case=N plays another case (tests, screenshots without spoilers)
    const forced = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get('case')) : 0;
    const no = forced > 0 ? forced : dayIndex(LAUNCH);
    return { no, date: new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'short', year: 'numeric' }) };
  }

  /** Lines of the statement the player has ticked off (struck through), per case. */
  let ticks = new Set<string>();

  function caseHTML() {
    ticks = new Set(store.get<string[]>(`ticks_${day.no}`) ?? []);
    const line = (id: PartId, text: string) =>
      `<li><label class="fw-tick${ticks.has(id) ? ' is-done' : ''}"><input type="checkbox" data-tick="${id}"${ticks.has(id) ? ' checked' : ''}><span>${esc(text)}</span></label></li>`;
    const lines = LIB.map((id) => {
      const p = suspect[id];
      const words: { none?: string; variants: readonly (readonly string[])[] } = T.parts[id];
      if (!p) return words.none ? line(id, words.none) : '';
      const h = hints(id, p, T.hints);
      return line(id, `${words.variants[p.v][1]}${h.length ? ` – ${h.join(', ')}` : ''}`);
    }).join('');
    return `<details open><summary><h2>${esc(fill(T.caseTitle, { n: day.no, date: day.date }))}</h2></summary><q>${esc(T.quote)}</q><ul>${lines}</ul></details>`;
  }

  function startDaily() {
    mode = 'daily';
    day = today();
    suspect = makeSuspect(day.no);
    done = store.get<Done>(`done_${day.no}`);
    reset(done ? done.parts : (store.get<Parts>(`draft_${day.no}`) ?? { head: newPart('head', 0) }));
    caseBox.hidden = false;
    caseBox.innerHTML = caseHTML();
    if (done) showResult();
  }

  function startFree() {
    mode = 'free';
    done = null;
    caseBox.hidden = true;
    const p: Parts = {};
    for (const id of ['head', 'hair', 'brows', 'eyes', 'nose', 'mouth', 'moustache'] as PartId[]) p[id] = newPart(id, 0);
    reset(p);
  }

  /** The cutscene at the police station (scene.ts, loaded when needed), then the verdict. */
  let playing = false;
  async function scene() {
    if (!done || playing) return;
    playing = true;
    const sketch = document.createElement('canvas');
    sketch.width = 500;
    sketch.height = 600;
    render(sketch.getContext('2d')!, done.parts, 1);
    const { playScene } = await import('./scene');
    await playScene({
      root,
      strings: T.scene,
      caseNo: day.no,
      sketch,
      total: done.r.total,
      rows: done.r.rows,
      has: (id) => !!suspect[id],
    });
    playing = false;
    showResult();
  }

  function submit() {
    if (!done) {
      done = { parts: JSON.parse(JSON.stringify(parts)) as Parts, r: score(parts, suspect) };
      store.set(`done_${day.no}`, done);
      ui();
      void scene();
      return;
    }
    showResult();
  }

  /* ---- dialogs ------------------------------------------------------------------------------- */

  type Action = [string, ((b: HTMLButtonElement) => boolean | void) | null];

  function dialog(title: string, body: string, acts: Action[] = [[T.ok, null]], wide = false) {
    const bg = document.createElement('div');
    bg.className = 'fw-dlgbg';
    bg.innerHTML =
      `<div class="fw-dlg fw-bev${wide ? ' fw-dlg--wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">` +
      `<div class="fw-title"><span class="fw-title__t">${esc(title)}</span><span class="fw-wb"><button type="button" class="fw-bev fw-x" data-x aria-label="${esc(T.result.close)}">×</button></span></div>` +
      `<div class="fw-dlg__body">${body}</div><div class="fw-dlg__acts"></div></div>`;
    const before = document.activeElement as HTMLElement | null;
    const close = () => {
      bg.remove();
      before?.focus();
    };
    bg.querySelector<HTMLElement>('[data-x]')!.onclick = close;
    bg.onclick = (e) => {
      if (e.target === bg) close();
    };
    bg.onkeydown = (e) => {
      if (e.key === 'Escape') close();
    };
    for (const [label, fn] of acts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'fw-btn fw-bev';
      b.textContent = label;
      b.onclick = () => {
        if (fn && fn(b) === false) return;
        close();
      };
      bg.querySelector('.fw-dlg__acts')!.append(b);
    }
    root.append(bg);
    bg.querySelector<HTMLElement>('.fw-dlg__acts .fw-btn')?.focus({ preventScroll: true });
    return bg;
  }

  function showResult() {
    if (!done) return;
    const r = done.r;
    const t = r.total;
    const rank = rankOf(t, T.ranks);
    const share = fill(T.share, {
      n: day.no,
      p: t,
      rank: rank.split(' –')[0],
      squares: r.rows.map(([, v]) => (v >= 80 ? '🟩' : v >= 50 ? '🟨' : '🟥')).join(''),
    });
    const bars = r.rows
      .map(([id, v]) => `<div class="fw-bar"><span>${esc(name(id))}</span><i><s style="width:${v}%"></s></i><em>${v}</em></div>`)
      .join('');
    const bg = dialog(
      fill(T.result.title, { n: day.no }),
      `<div class="fw-res"><div class="fw-cmp"><figure><figcaption>${esc(T.result.yours)}</figcaption><canvas data-r1 width="500" height="600"></canvas></figure>` +
        `<figure><figcaption>${esc(T.result.suspect)}</figcaption><canvas data-r2 width="500" height="600"></canvas></figure></div>` +
        `<div><p class="fw-big">${t} %</p><p>${esc(rank)}</p><div class="fw-bars">${bars}</div>` +
        `<textarea class="fw-share" readonly aria-label="${esc(T.result.copy)}">${esc(share)}</textarea><p class="fw-small">${esc(T.result.next)}</p></div></div>`,
      [
        [
          T.scene.replay,
          () => {
            void scene();
          },
        ],
        [
          T.result.copy,
          (b) => {
            const ta = bg.querySelector<HTMLTextAreaElement>('.fw-share')!;
            navigator.clipboard?.writeText(share).then(
              () => (b.textContent = T.result.copied),
              () => ta.select(),
            ) ?? ta.select();
            return false;
          },
        ],
        [T.result.close, null],
      ],
      true,
    );
    render(bg.querySelector<HTMLCanvasElement>('[data-r1]')!.getContext('2d')!, done.parts, 1);
    render(bg.querySelector<HTMLCanvasElement>('[data-r2]')!.getContext('2d')!, suspect, 1);
  }

  /** A "WANTED" poster of the current picture, to save. */
  function savePic() {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 780;
    const x = c.getContext('2d')!;
    x.fillStyle = PAPER;
    x.fillRect(0, 0, 600, 780);
    x.save();
    x.translate(50, 110);
    render(x, parts, 1);
    x.restore();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#111';
    x.font = '900 58px Arial, sans-serif';
    x.textAlign = 'center';
    x.fillText(T.save.wanted, 300, 76);
    x.font = '700 20px Arial, sans-serif';
    x.fillText(mode === 'daily' ? fill(T.save.footerDaily, { n: day.no }) : T.save.footerFree, 300, 748);
    dialog(T.save.title, `<p class="fw-small">${esc(T.save.text)}</p><img class="fw-pic fw-in" alt="${esc(T.save.alt)}" src="${c.toDataURL('image/png')}">`);
  }

  const help = () => dialog(T.help.title, `<p>${esc(T.help.daily)}</p><p>${esc(T.help.how)}</p><p>${esc(T.help.submit)}</p>`);

  const openCase = () =>
    dialog(T.open.title, `<p>${esc(T.open.question)}</p>`, [
      [fill(T.open.daily, { n: today().no }), () => startDaily()],
      [T.open.free, () => startFree()],
    ]);

  /* ---- library and settings ------------------------------------------------------------------- */

  function buildCats() {
    cats.innerHTML = LIB.map((id) => `<button type="button" class="fw-cat fw-bev${id === cat ? ' is-on' : ''}" data-c="${id}" aria-pressed="${id === cat}">${esc(name(id))}</button>`).join('');
  }

  let thumbJob = 0;
  function buildGrid() {
    const cur = parts[cat];
    grid.innerHTML = PARTS[cat].variants
      .map(
        (_, i) =>
          `<button type="button" class="fw-th fw-in${cur?.v === i ? ' is-on' : ''}" data-v="${i}" aria-label="${esc(variantName(cat, i))}"><canvas width="240" height="200"></canvas><small>${esc(variantName(cat, i))}</small><b>${String(i + 1).padStart(3, '0')}</b></button>`,
      )
      .join('');
    // Thumbnails one per frame (the first drawing of a part takes a moment)
    const job = ++thumbJob;
    const canvases = [...grid.querySelectorAll('canvas')];
    let i = 0;
    const step = () => {
      if (job !== thumbJob || i >= canvases.length) return;
      const x = canvases[i].getContext('2d')!;
      const p = newPart(cat, i);
      const b = bbox(cat, p);
      const bw = b[2] - b[0];
      const bh = b[3] - b[1];
      const k = Math.min((240 * 0.84) / bw, (200 * 0.72) / bh, 1.7);
      x.setTransform(k, 0, 0, k, 120 - (b[0] + bw / 2) * k, 104 - (b[1] + bh / 2) * k);
      drawPart(x, cat, p);
      i++;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function buildSet() {
    const p = sel ? parts[sel] : undefined;
    if (!sel || !p) {
      pSet.innerHTML = `<p class="fw-empty">${esc(T.settings.empty)}</p>`;
      return;
    }
    const id = sel;
    const d = PARTS[id];
    type Row = [keyof Part, string, number, number, (v: number) => number, (v: number) => number, string];
    const pct = (v: number) => Math.round(v * 100);
    const unpct = (v: number) => v / 100;
    const same = (v: number) => v;
    const rows: Row[] = [
      ['sx', T.settings.width, 50, 160, pct, unpct, '%'],
      ['sy', T.settings.height, 50, 160, pct, unpct, '%'],
      ['rot', T.settings.rotation, -30, 30, same, same, '°'],
    ];
    if (d.pair && d.def.sp) rows.push(['sp', T.settings.spacing, d.def.sp - 40, d.def.sp + 50, same, same, 'px']);
    pSet.innerHTML =
      `<p class="fw-set__head">${esc(name(id))} · ${esc(variantName(id, p.v))}</p>` +
      rows
        .map(
          ([k, label, min, max, show, , unit]) =>
            `<label class="fw-row"><span>${esc(label)}</span><input type="range" data-s="${k}" min="${min}" max="${max}" step="1" value="${show(p[k])}"><output data-o="${k}">${show(p[k])}${unit}</output></label>`,
        )
        .join('') +
      `<div class="fw-pad"><button type="button" class="fw-btn fw-bev" data-n="0,-2" aria-label="${esc(T.settings.up)}">↑</button><button type="button" class="fw-btn fw-bev" data-n="0,2" aria-label="${esc(T.settings.down)}">↓</button>` +
      `<button type="button" class="fw-btn fw-bev" data-n="-2,0" aria-label="${esc(T.settings.left)}">←</button><button type="button" class="fw-btn fw-bev" data-n="2,0" aria-label="${esc(T.settings.right)}">→</button>` +
      `<button type="button" class="fw-btn fw-bev" data-reset>${esc(T.settings.reset)}</button></div>`;
    for (const [k, , , , , back, unit] of rows) {
      const inp = pSet.querySelector<HTMLInputElement>(`[data-s="${k}"]`)!;
      inp.oninput = () => {
        const part = parts[id];
        if (!part) return;
        part[k] = back(+inp.value);
        pSet.querySelector(`[data-o="${k}"]`)!.textContent = inp.value + unit;
        draw();
      };
      inp.onchange = commit;
    }
    pSet.querySelectorAll<HTMLElement>('[data-n]').forEach(
      (b) =>
        (b.onclick = () => {
          const [dx, dy] = b.dataset.n!.split(',').map(Number);
          const part = parts[id];
          if (!part) return;
          part.x += dx;
          part.y += dy;
          commit();
        }),
    );
    pSet.querySelector<HTMLElement>('[data-reset]')!.onclick = () => {
      parts[id] = newPart(id, p.v);
      commit();
    };
  }

  function ui() {
    draw();
    $<HTMLButtonElement>('[data-undo]').disabled = !undo.length;
    $<HTMLButtonElement>('[data-redo]').disabled = !redo.length;
    $<HTMLButtonElement>('[data-del]').disabled = !sel;
    const sub = $<HTMLButtonElement>('[data-submit]');
    sub.hidden = mode !== 'daily';
    sub.textContent = done ? T.tools.result : T.tools.submit;
    grid.querySelectorAll<HTMLElement>('.fw-th').forEach((b) => b.classList.toggle('is-on', parts[cat]?.v === +b.dataset.v!));
    if (tab === 'set') buildSet();
    $('[data-st1]').textContent =
      mode === 'daily' ? `${fill(T.status.daily, { n: day.no })} · ${done ? fill(T.status.submitted, { p: done.r.total }) : T.status.open}` : T.status.free;
    $('[data-st2]').textContent = sel ? fill(T.status.selected, { part: name(sel) }) : fill(T.status.count, { n: Object.keys(parts).length });
  }

  function setCat(c: PartId) {
    if (c === cat) return;
    cat = c;
    buildCats();
    buildGrid();
  }

  function setTab(t: 'lib' | 'set') {
    tab = t;
    root.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.t === t);
      b.setAttribute('aria-selected', String(b.dataset.t === t));
    });
    pLib.hidden = t !== 'lib';
    pSet.hidden = t !== 'set';
    if (t === 'set') buildSet();
  }

  /* ---- input ----------------------------------------------------------------------------------- */

  // Ticking a line of the statement off: struck through, remembered for the case
  caseBox.addEventListener('change', (e) => {
    const box = (e.target as Element).closest<HTMLInputElement>('[data-tick]');
    if (!box) return;
    if (box.checked) ticks.add(box.dataset.tick!);
    else ticks.delete(box.dataset.tick!);
    box.closest('.fw-tick')?.classList.toggle('is-done', box.checked);
    store.set(`ticks_${day.no}`, [...ticks]);
  });

  cats.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-c]');
    if (b) setCat(b.dataset.c as PartId);
  };
  grid.onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-v]');
    if (!b) return;
    const v = +b.dataset.v!;
    const p = parts[cat];
    if (p) p.v = v;
    else parts[cat] = newPart(cat, v);
    sel = cat;
    commit();
  };
  root.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => (b.onclick = () => setTab(b.dataset.t as 'lib' | 'set')));
  $('[data-undo]').onclick = doUndo;
  $('[data-redo]').onclick = doRedo;
  $('[data-del]').onclick = delPart;
  $('[data-save]').onclick = savePic;
  $('[data-submit]').onclick = submit;
  $('[data-open]').onclick = openCase;

  const M = T.menus;
  const MENUS: Record<string, [string, () => void][]> = {
    file: [
      [M.openCase, openCase],
      [M.daily, startDaily],
      [M.free, startFree],
      [
        M.blank,
        () => {
          parts = {};
          sel = null;
          commit();
        },
      ],
      [M.savePic, savePic],
    ],
    edit: [
      [M.undo, doUndo],
      [M.redo, doRedo],
      [M.deletePart, delPart],
    ],
    view: [
      [
        M.statement,
        () => {
          if (mode === 'daily') caseBox.hidden = !caseBox.hidden;
        },
      ],
      [
        M.guides,
        () => {
          guides = !guides;
          draw();
        },
      ],
    ],
    help: [[M.howTo, help]],
  };
  let drop: HTMLElement | null = null;
  const closeDrop = () => {
    if (!drop) return;
    drop.remove();
    drop = null;
    root.querySelectorAll('[data-m]').forEach((b) => {
      b.classList.remove('is-on');
      b.setAttribute('aria-expanded', 'false');
    });
  };
  $('[data-menu]').onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>('[data-m]');
    if (!b) return;
    const was = drop?.dataset.m === b.dataset.m;
    closeDrop();
    if (was) return;
    b.classList.add('is-on');
    b.setAttribute('aria-expanded', 'true');
    drop = document.createElement('div');
    drop.className = 'fw-drop fw-bev';
    drop.setAttribute('role', 'menu');
    drop.dataset.m = b.dataset.m;
    drop.style.left = `${b.offsetLeft}px`;
    drop.style.top = `${b.offsetTop + b.offsetHeight}px`;
    for (const [label, fn] of MENUS[b.dataset.m!]) {
      const it = document.createElement('button');
      it.type = 'button';
      it.setAttribute('role', 'menuitem');
      it.textContent = label;
      it.onclick = () => {
        closeDrop();
        fn();
      };
      drop.append(it);
    }
    win.append(drop);
    drop.querySelector('button')?.focus();
    e.stopPropagation();
  };

  const ac = new AbortController();
  document.addEventListener(
    'click',
    (e) => {
      if (drop && !drop.contains(e.target as Node)) closeDrop();
    },
    { signal: ac.signal },
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && drop) {
        closeDrop();
        return;
      }
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !typing && !root.querySelector('.fw-dlgbg')) {
        e.preventDefault();
        delPart();
      }
    },
    { signal: ac.signal },
  );

  // Dragging parts on the picture (the head only when nothing else is under the pointer)
  let drag: { dx: number; dy: number } | null = null;
  const pt = (e: PointerEvent): [number, number] => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 500, ((e.clientY - r.top) / r.height) * 600];
  };
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = pt(e);
    let h: PartId | null = null;
    const selected = sel ? parts[sel] : undefined;
    if (sel && selected && sel !== 'head' && hit(sel, selected, x, y)) h = sel;
    if (!h)
      for (const id of [...ORDER].reverse()) {
        const p = parts[id];
        if (p && hit(id, p, x, y)) {
          h = id;
          break;
        }
      }
    sel = h;
    if (h) {
      const p = parts[h]!;
      setCat(h);
      drag = { dx: x - p.x, dy: y - p.y };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('is-dragging');
    }
    ui();
  });
  cv.addEventListener('pointermove', (e) => {
    const p = sel ? parts[sel] : undefined;
    if (!drag || !p) return;
    const [x, y] = pt(e);
    p.x = Math.round(x - drag.dx);
    p.y = Math.round(y - drag.dy);
    draw();
  });
  const end = () => {
    if (!drag) return;
    drag = null;
    cv.classList.remove('is-dragging');
    commit();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);

  buildCats();
  buildGrid();
  startDaily();

  return () => {
    ac.abort();
    closeDrop();
  };
}
