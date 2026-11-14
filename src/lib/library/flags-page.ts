/**
 * Browser side of the Flags book (src/pages/library/flags.astro): mode tabs,
 * scope, browse grid with detail dialog, flashcards, multiple-choice quiz and
 * the typing test. Progress lives in src/lib/library/progress.ts.
 */
import { UI } from '@/data/ui';
import {
  BY_CODE,
  FLAGS,
  SCOPES,
  check,
  distractors,
  inScope,
  normalise,
  shuffle,
  statusLine,
  suggest,
  type LibFlag,
  type Scope,
} from './flags';
import * as P from './progress';

const F = UI.library.flags;
const MODES = ['browse', 'learn', 'quiz', 'type'] as const;
type Mode = (typeof MODES)[number];

let root: HTMLElement;
let scope: Scope = 'all';
let mode: Mode = 'browse';

const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = root) => el.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = root) => [...el.querySelectorAll<T>(sel)];

const pool = () => FLAGS.filter((f) => inScope(f, scope));

function img(f: LibFlag, cls = '', alt = ''): HTMLImageElement {
  const el = document.createElement('img');
  el.src = f.src;
  el.alt = alt;
  el.width = Math.round((120 * f.w) / f.h);
  el.height = 120;
  if (cls) el.className = cls;
  return el;
}

const status = (f: LibFlag) => statusLine(f, F.browse);

/** "Same flag as France, Réunion …" or empty. */
function sameNote(f: LibFlag): string {
  const names = (f.same ?? []).map((c) => BY_CODE.get(c)?.name).filter(Boolean);
  if (!names.length) return '';
  const shown = names.slice(0, 3).join(', ');
  return `${F.sameNote} ${shown}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
}

/* ---- Progress -------------------------------------------------------------- */

function renderProgress() {
  const s = P.summary(pool().map((f) => f.code));
  for (const k of ['known', 'learning', 'fresh'] as const) $(`[data-count="${k}"]`).textContent = String(s[k]);
  $('[data-bar="known"]').style.width = `${(100 * s.known) / s.total}%`;
  $('[data-bar="learning"]').style.width = `${(100 * s.learning) / s.total}%`;
  for (const dot of $$('[data-dot]')) {
    const code = dot.closest<HTMLElement>('[data-code]')!.dataset.code!;
    const b = P.boxOf(code);
    dot.dataset.state = b >= P.KNOWN_BOX ? 'known' : b >= 0 ? 'learning' : 'fresh';
  }
}

/* ---- Modes and scope ------------------------------------------------------- */

function setMode(next: Mode, focus = false) {
  mode = next;
  for (const tab of $$<HTMLButtonElement>('[role="tab"]')) {
    const on = tab.dataset.mode === next;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    if (on && focus) tab.focus();
  }
  for (const panel of $$('[data-panel]')) panel.hidden = panel.dataset.panel !== next;
  const url = new URL(location.href);
  if (next === 'browse') url.searchParams.delete('mode');
  else url.searchParams.set('mode', next);
  history.replaceState(history.state, '', url);
  if (next === 'learn') startLearn();
  if (next === 'quiz' || next === 'type') showSetup(next);
}

function setScope(next: Scope) {
  scope = next;
  P.setSetting('scope', next);
  $<HTMLSelectElement>('[data-scope]').value = next;
  filterGrid();
  renderProgress();
  if (mode === 'learn') startLearn();
  if (mode === 'quiz' || mode === 'type') showSetup(mode);
}

/* ---- Browse ---------------------------------------------------------------- */

function filterGrid() {
  const q = normalise($<HTMLInputElement>('[data-search]').value);
  let shown = 0;
  for (const li of $$('[data-grid] > li')) {
    const f = BY_CODE.get(li.dataset.code!)!;
    const hit =
      inScope(f, scope) &&
      (!q || [f.name, f.capital, ...f.aliases].some((s) => normalise(s).includes(q)));
    li.hidden = !hit;
    if (hit) shown++;
  }
  $('[data-none]').hidden = shown > 0;
}

function chip(f: LibFlag): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.dataset.open = f.code;
  b.append(img(f), f.name);
  return b;
}

function openDetail(code: string) {
  const f = BY_CODE.get(code);
  if (!f) return;
  const d = $<HTMLDialogElement>('[data-detail]');
  const im = $<HTMLImageElement>('[data-d-img]', d);
  im.src = f.src;
  im.alt = f.name;
  $('[data-d-name]', d).textContent = f.name;
  $('[data-d-capital]', d).textContent = f.capital || F.browse.noCapital;
  $('[data-d-continent]', d).textContent = f.continent;
  $('[data-d-kind]', d).textContent = status(f);
  const st = P.statsOf(code);
  $('[data-d-stats-row]', d).hidden = !P.isSeen(code);
  $('[data-d-stats]', d).textContent = `✓ ${st.right}  ✗ ${st.wrong}`;
  const same = (f.same ?? []).map((c) => BY_CODE.get(c)!).filter(Boolean);
  const near = [...(f.like ?? []), ...(f.near ?? [])].map((c) => BY_CODE.get(c)!).filter(Boolean);
  $('[data-d-same-row]', d).hidden = !same.length;
  $('[data-d-same]', d).replaceChildren(...same.map(chip));
  $('[data-d-near-row]', d).hidden = !near.length;
  $('[data-d-near]', d).replaceChildren(...near.map(chip));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

/* ---- Learn: flashcards ----------------------------------------------------- */

let queue: string[] = [];
let card: string | null = null;
let flipped = false;

function startLearn(anyway = false) {
  const codes = pool().map((f) => f.code);
  queue = anyway ? P.reviewAnyway(codes) : P.roundOf(codes);
  $('[data-learn-done]').hidden = true;
  $('[data-learn-empty]').hidden = queue.length > 0;
  $('[data-learn-play]').hidden = queue.length === 0;
  nextCard();
}

function nextCard() {
  card = queue.shift() ?? null;
  if (!card) {
    if (!$('[data-learn-play]').hidden) {
      $('[data-learn-play]').hidden = true;
      $('[data-learn-done]').hidden = false;
    }
    return;
  }
  const f = BY_CODE.get(card)!;
  flipped = false;
  $('[data-flash]').classList.remove('is-flipped');
  $<HTMLImageElement>('[data-learn-img]').src = f.src;
  // Fill the back after the flip-back animation so the next answer does not flash
  window.setTimeout(() => {
    if (card !== f.code) return;
    $<HTMLImageElement>('[data-learn-img-back]').src = f.src;
    $('[data-learn-name]').textContent = f.name;
    $('[data-learn-info]').textContent = [f.capital, f.continent].filter(Boolean).join(' · ');
    $('[data-learn-note]').textContent = [f.kind === 'territory' ? status(f) : '', sameNote(f)].filter(Boolean).join(' · ');
  }, 250);
  $('[data-learn-show]').hidden = false;
  $('[data-learn-rate]').hidden = true;
  $('[data-learn-left]').textContent = String(queue.length + 1);
}

function flip() {
  if (!card || flipped) return;
  flipped = true;
  const f = BY_CODE.get(card)!;
  // In case the delayed fill has not run yet
  $<HTMLImageElement>('[data-learn-img-back]').src = f.src;
  $('[data-learn-name]').textContent = f.name;
  $('[data-learn-info]').textContent = [f.capital, f.continent].filter(Boolean).join(' · ');
  $('[data-learn-note]').textContent = [f.kind === 'territory' ? status(f) : '', sameNote(f)].filter(Boolean).join(' · ');
  $('[data-flash]').classList.add('is-flipped');
  $('[data-learn-show]').hidden = true;
  $('[data-learn-rate]').hidden = false;
  $<HTMLButtonElement>('[data-learn-knew]').focus({ preventScroll: true });
}

function rate(knew: boolean) {
  if (!card || !flipped) return;
  if (knew) P.knew(card);
  else {
    P.missed(card);
    // Comes back a few cards later in this round
    queue.splice(Math.min(3, queue.length), 0, card);
  }
  renderProgress();
  nextCard();
}

/* ---- Quiz and typing ------------------------------------------------------- */

interface Answer {
  f: LibFlag;
  ok: boolean;
  given?: string;
}

interface Test {
  kind: 'quiz' | 'type';
  items: LibFlag[];
  i: number;
  answers: Answer[];
  dir: 'flag' | 'name';
  done: boolean;
}

let test: Test | null = null;

function lengthOf(kind: 'quiz' | 'type'): number {
  const v = $<HTMLInputElement>(`input[name="${kind}-len"]:checked`).value;
  return Number(v) || Infinity;
}

function showSetup(kind: 'quiz' | 'type') {
  test = null;
  $(`[data-setup="${kind}"]`).hidden = false;
  $(`[data-play="${kind}"]`).hidden = true;
  $(`[data-result="${kind}"]`).hidden = true;
}

function startTest(kind: 'quiz' | 'type') {
  const all = pool();
  const n = Math.min(lengthOf(kind), all.length);
  const dir = kind === 'quiz' ? ($<HTMLInputElement>('input[name="quiz-dir"]:checked').value as 'flag' | 'name') : 'flag';
  P.setSetting(kind === 'quiz' ? 'quizLen' : 'typeLen', Number.isFinite(n) ? lengthOf(kind) : 0);
  if (kind === 'quiz') P.setSetting('quizDir', dir);
  // Missed and due flags first, then the rest at random
  const items = shuffle(all).sort((a, b) => weight(a) - weight(b)).slice(0, n);
  test = { kind, items: shuffle(items), i: 0, answers: [], dir, done: false };
  $(`[data-setup="${kind}"]`).hidden = true;
  $(`[data-result="${kind}"]`).hidden = true;
  $(`[data-play="${kind}"]`).hidden = false;
  renderQuestion();
}

/** Lower comes first in a test: flags you missed or that are due. */
function weight(f: LibFlag): number {
  const b = P.boxOf(f.code);
  if (b === 0) return 0;
  if (P.isDue(f.code)) return 1;
  return 2 + Math.random();
}

function head(kind: 'quiz' | 'type') {
  if (!test) return;
  const p = kind === 'quiz' ? 'q' : 't';
  const right = test.answers.filter((a) => a.ok).length;
  $(`[data-${p}-count]`).textContent = `${F.quiz.question} ${test.i + 1} / ${test.items.length}`;
  $(`[data-${p}-score]`).textContent = `✓ ${right}`;
}

function renderQuestion() {
  if (!test) return;
  const f = test.items[test.i];
  head(test.kind);
  if (test.kind === 'quiz') {
    const prompt = $('[data-q-prompt]');
    const q = document.createElement('p');
    q.className = 'prompt__q';
    if (test.dir === 'flag') {
      q.textContent = F.quiz.whichCountry;
      prompt.replaceChildren(img(f), q);
    } else {
      q.textContent = F.quiz.whichFlag;
      const name = document.createElement('p');
      name.className = 'prompt__name';
      name.textContent = f.name;
      prompt.replaceChildren(q, name);
    }
    const options = shuffle([f, ...distractors(f, pool())]);
    const box = $('[data-q-options]');
    box.replaceChildren(
      ...options.map((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt';
        b.dataset.code = o.code;
        if (test!.dir === 'flag') b.textContent = o.name;
        else b.append(img(o, '', `${i + 1}`));
        b.setAttribute('aria-keyshortcuts', String(i + 1));
        return b;
      }),
    );
    $('[data-q-feedback]').textContent = '';
    $('[data-q-next]').hidden = true;
  } else {
    $('[data-t-prompt]').replaceChildren(img(f));
    const input = $<HTMLInputElement>('[data-t-input]');
    input.value = '';
    input.disabled = false;
    input.classList.remove('is-right', 'is-wrong');
    closeSuggest();
    $('[data-t-feedback]').textContent = '';
    $('[data-t-next]').hidden = true;
    $<HTMLButtonElement>('[data-t-submit]').hidden = false;
    $<HTMLButtonElement>('[data-t-skip]').hidden = false;
    input.focus({ preventScroll: true });
  }
}

function record(ok: boolean, given?: string) {
  if (!test) return;
  const f = test.items[test.i];
  test.answers.push({ f, ok, given });
  if (ok) P.quizRight(f.code);
  else P.missed(f.code);
  renderProgress();
  head(test.kind);
}

function answerQuiz(code: string) {
  if (!test || test.kind !== 'quiz' || test.answers.length > test.i) return;
  const f = test.items[test.i];
  const ok = code === f.code || (f.same ?? []).includes(code);
  const given = BY_CODE.get(code)?.name;
  for (const b of $$<HTMLButtonElement>('[data-q-options] .opt')) {
    b.disabled = true;
    if (b.dataset.code === f.code) b.classList.add('is-right');
    else if (b.dataset.code === code) b.classList.add('is-wrong');
  }
  record(ok, given);
  const fb = $('[data-q-feedback]');
  fb.textContent = ok ? `${F.quiz.correct} ${f.name}.` : `${F.quiz.wrong} ${f.name}.`;
  const next = $<HTMLButtonElement>('[data-q-next]');
  next.hidden = false;
  next.focus({ preventScroll: true });
}

function answerType(skip = false) {
  if (!test || test.kind !== 'type' || test.answers.length > test.i) return;
  const f = test.items[test.i];
  const input = $<HTMLInputElement>('[data-t-input]');
  const given = input.value.trim();
  if (!skip && !given) return;
  const v = skip ? ({ ok: false } as const) : check(given, f);
  closeSuggest();
  input.disabled = true;
  input.classList.add(v.ok ? 'is-right' : 'is-wrong');
  record(v.ok, skip ? undefined : given);
  const fb = $('[data-t-feedback]');
  if (v.ok && v.exact) fb.textContent = `${F.quiz.correct} ${f.name}.`;
  else if (v.ok) fb.textContent = `${F.type.almost} ${f.name}.`;
  else fb.textContent = `${F.quiz.wrong} ${f.name}.`;
  const same = sameNote(f);
  if (same) fb.textContent += ` (${same})`;
  $<HTMLButtonElement>('[data-t-submit]').hidden = true;
  $<HTMLButtonElement>('[data-t-skip]').hidden = true;
  const next = $<HTMLButtonElement>('[data-t-next]');
  next.hidden = false;
  next.focus({ preventScroll: true });
}

function nextQuestion() {
  if (!test || test.answers.length <= test.i) return;
  test.i++;
  if (test.i >= test.items.length) return showResult();
  renderQuestion();
}

function showResult() {
  if (!test) return;
  const t = test;
  t.done = true;
  const right = t.answers.filter((a) => a.ok).length;
  const box = $(`[data-result="${t.kind}"]`);
  const score = document.createElement('p');
  score.className = 'result__score';
  score.textContent = `${right} / ${t.answers.length}`;
  const label = document.createElement('p');
  label.className = 'meta';
  label.textContent = F.quiz.score;
  const wrong = t.answers.filter((a) => !a.ok);
  const parts: Node[] = [label, score];
  if (wrong.length) {
    const h = document.createElement('h2');
    h.textContent = F.quiz.mistakes;
    const ul = document.createElement('ul');
    ul.className = 'result__list';
    for (const a of wrong) {
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = a.f.name;
      li.append(img(a.f), name);
      if (a.given) {
        const s = document.createElement('s');
        s.textContent = a.given;
        li.append(s);
      }
      ul.append(li);
    }
    const note = document.createElement('p');
    note.className = 'meta';
    note.textContent = F.quiz.mistakesNote;
    parts.push(h, ul, note);
  } else {
    const p = document.createElement('p');
    p.textContent = F.quiz.perfect;
    parts.push(p);
  }
  const actions = document.createElement('div');
  actions.className = 'result__actions';
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'tab';
  again.dataset.again = t.kind;
  again.textContent = F.quiz.again;
  actions.append(again);
  if (wrong.length) {
    const learn = document.createElement('button');
    learn.type = 'button';
    learn.className = 'tab';
    learn.dataset.goLearn = '';
    learn.textContent = F.modes.learn;
    actions.append(learn);
  }
  parts.push(actions);
  box.replaceChildren(...parts);
  $(`[data-play="${t.kind}"]`).hidden = true;
  box.hidden = false;
  again.focus({ preventScroll: true });
}

/* ---- Typing suggestions ---------------------------------------------------- */

let active = -1;

function closeSuggest() {
  const list = $('[data-t-suggest]');
  list.hidden = true;
  list.replaceChildren();
  active = -1;
  $('[data-t-input]').setAttribute('aria-expanded', 'false');
  $('[data-t-input]').removeAttribute('aria-activedescendant');
}

function updateSuggest() {
  const input = $<HTMLInputElement>('[data-t-input]');
  const names = suggest(input.value, FLAGS);
  const list = $('[data-t-suggest]');
  if (!names.length || (names.length === 1 && normalise(names[0]) === normalise(input.value))) return closeSuggest();
  active = -1;
  list.replaceChildren(
    ...names.map((n, i) => {
      const li = document.createElement('li');
      li.id = `type-opt-${i}`;
      li.role = 'option';
      li.textContent = n;
      li.setAttribute('aria-selected', 'false');
      return li;
    }),
  );
  list.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}

function moveSuggest(step: number) {
  const items = $$('[data-t-suggest] li');
  if (!items.length) return false;
  active = (active + step + items.length) % items.length;
  items.forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
  $('[data-t-input]').setAttribute('aria-activedescendant', items[active].id);
  return true;
}

function pickSuggest(name: string) {
  const input = $<HTMLInputElement>('[data-t-input]');
  input.value = name;
  closeSuggest();
  input.focus();
}

/* ---- Wiring ---------------------------------------------------------------- */

function onKey(e: KeyboardEvent) {
  if (!root?.isConnected || $<HTMLDialogElement>('[data-detail]').open) return;
  const target = e.target instanceof HTMLElement ? e.target : document.body;
  const typing = target.matches('input[type="text"], input[type="search"], select');
  if (typing || target.closest('[role="tab"]')) return;
  if (mode === 'learn' && !$('[data-learn-play]').hidden) {
    if (!flipped && (e.code === 'Space' || (e.code === 'Enter' && !target.matches('button')))) {
      e.preventDefault();
      flip();
    } else if (flipped && (e.key === '1' || e.key === 'ArrowLeft')) rate(false);
    else if (flipped && (e.key === '2' || e.key === 'ArrowRight')) rate(true);
  }
  if (mode === 'quiz' && test && !test.done) {
    const n = Number(e.key);
    const opts = $$<HTMLButtonElement>('[data-q-options] .opt');
    if (n >= 1 && n <= opts.length && !opts[n - 1].disabled) answerQuiz(opts[n - 1].dataset.code!);
  }
}

export function init() {
  const el = document.querySelector<HTMLElement>('[data-flags-book]');
  if (!el) return;
  root = el;

  const saved = P.settings();
  scope = (SCOPES as readonly string[]).includes(saved.scope ?? '') ? (saved.scope as Scope) : 'all';
  $<HTMLSelectElement>('[data-scope]').value = scope;
  if (saved.quizDir) {
    const r = $<HTMLInputElement>(`input[name="quiz-dir"][value="${saved.quizDir}"]`);
    if (r) r.checked = true;
  }
  for (const [kind, len] of [['quiz', saved.quizLen], ['type', saved.typeLen]] as const) {
    if (len === undefined) continue;
    const r = root.querySelector<HTMLInputElement>(`input[name="${kind}-len"][value="${len}"]`);
    if (r) r.checked = true;
  }

  filterGrid();
  renderProgress();

  // Tabs (arrow keys move between them, as tabs should)
  const tabs = $$<HTMLButtonElement>('[role="tab"]');
  for (const tab of tabs) {
    tab.addEventListener('click', () => setMode(tab.dataset.mode as Mode));
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      setMode(tabs[(i + step + tabs.length) % tabs.length].dataset.mode as Mode, true);
    });
  }
  $<HTMLSelectElement>('[data-scope]').addEventListener('change', (e) => setScope((e.target as HTMLSelectElement).value as Scope));

  // Browse
  $<HTMLInputElement>('[data-search]').addEventListener('input', filterGrid);
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const open = t.closest<HTMLElement>('[data-open]');
    if (open) return openDetail(open.dataset.open!);
    if (t.closest('[data-again]')) return startTest(t.closest<HTMLElement>('[data-again]')!.dataset.again as 'quiz' | 'type');
    if (t.closest('[data-go-learn]')) return setMode('learn');
    const opt = t.closest<HTMLButtonElement>('[data-q-options] .opt');
    if (opt && !opt.disabled) return answerQuiz(opt.dataset.code!);
    const sug = t.closest<HTMLElement>('[data-t-suggest] li');
    if (sug) return pickSuggest(sug.textContent ?? '');
  });
  const dialog = $<HTMLDialogElement>('[data-detail]');
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // Learn
  $('[data-flash]').addEventListener('click', () => (flipped ? undefined : flip()));
  $('[data-learn-show]').addEventListener('click', flip);
  $('[data-learn-knew]').addEventListener('click', () => rate(true));
  $('[data-learn-missed]').addEventListener('click', () => rate(false));
  $('[data-learn-next]').addEventListener('click', () => startLearn());
  $('[data-learn-anyway]').addEventListener('click', () => startLearn(true));

  // Quiz and typing
  for (const b of $$<HTMLButtonElement>('[data-start]')) b.addEventListener('click', () => startTest(b.dataset.start as 'quiz' | 'type'));
  $('[data-q-next]').addEventListener('click', nextQuestion);
  $('[data-t-next]').addEventListener('click', nextQuestion);
  $<HTMLFormElement>('[data-t-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    if (active >= 0) {
      const li = $$('[data-t-suggest] li')[active];
      if (li) return pickSuggest(li.textContent ?? '');
    }
    answerType();
  });
  $('[data-t-skip]').addEventListener('click', () => answerType(true));
  const input = $<HTMLInputElement>('[data-t-input]');
  input.addEventListener('input', updateSuggest);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && moveSuggest(1)) e.preventDefault();
    else if (e.key === 'ArrowUp' && moveSuggest(-1)) e.preventDefault();
    else if (e.key === 'Escape') closeSuggest();
  });
  input.addEventListener('blur', () => window.setTimeout(closeSuggest, 150));

  document.removeEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey);

  const wanted = new URL(location.href).searchParams.get('mode');
  setMode((MODES as readonly string[]).includes(wanted ?? '') ? (wanted as Mode) : 'browse');
}

