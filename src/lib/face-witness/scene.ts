/**
 * Face Witness cutscene, played after Submit (and again from the verdict):
 *
 *   1. "Printing composite …" with a 95 progress bar in the program window
 *   2. fade to black, film bars, the police station (scene-art.ts), a slow
 *      dolly out; the witness breathes and blinks across the desk
 *   3. the detective's hands bring up the player's sketch: "Is this the guy?"
 *   4. close-up on the witness, who studies it: "…"
 *   5. the reaction by match (delighted ≥ 80, happy ≥ 60, unsure ≥ 40,
 *      annoyed ≥ 20, furious below), with a line naming the best or the worst
 *      part; furious slams the desk (shake, the mug jumps)
 *   6. "See the verdict ▸", fade out, back to the program
 *
 * A click on the dialogue finishes the typing or goes on; Skip or Esc ends
 * the scene. With reduced motion everything still happens, without movement.
 * Only transform and opacity are animated, so it stays smooth.
 */
import type { PartId } from './parts';
import { SCENE_CSS, sceneSvg, WITNESSES } from './scene-art';
import type { FaceWitnessStrings } from './game';

type SceneStrings = FaceWitnessStrings['scene'];
export type Mood = 'delighted' | 'happy' | 'unsure' | 'annoyed' | 'furious';

export function moodOf(total: number): Mood {
  return total >= 80 ? 'delighted' : total >= 60 ? 'happy' : total >= 40 ? 'unsure' : total >= 20 ? 'annoyed' : 'furious';
}

export interface SceneOptions {
  /** The program root (.fw): the printing dialog and the scene go in here. */
  root: HTMLElement;
  strings: SceneStrings;
  caseNo: number;
  /** The player's sketch, 500 × 600. */
  sketch: HTMLCanvasElement;
  total: number;
  /** Score per part, and which parts the suspect really has. */
  rows: [PartId, number][];
  has: (id: PartId) => boolean;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let styled = false;
function addStyles() {
  if (styled) return;
  styled = true;
  const st = document.createElement('style');
  st.textContent = SCENE_CSS + PRINT_CSS;
  document.head.append(st);
}

const PRINT_CSS = `
.fwp-bar{display:flex;gap:3px;height:24px;margin-top:10px;padding:3px;background:#fff;border:2px solid;border-color:#7b7b7b #fff #fff #7b7b7b}
.fwp-bar i{flex:1;background:#00107f;opacity:0;transition:opacity .05s}
.fwp-bar i.is-on{opacity:1}
.fwp-icon{display:inline-block;margin-right:8px;vertical-align:-4px}
`;

/** The line the witness says, with the best or worst part filled in. */
function reply(S: SceneStrings, mood: Mood, rows: [PartId, number][], has: (id: PartId) => boolean): string {
  // Best: a part the suspect really has (a "right" missing moustache is no compliment); worst: anything
  const real = rows.filter(([id]) => has(id));
  const best = [...(real.length ? real : rows)].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'eyes';
  const worst = [...rows].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'nose';
  const line = pick(S.reactions[mood]).replace('{best}', S.parts[best]).replace('{worst}', S.parts[worst]);
  // A part at the start of a sentence gets its capital ("… maybe? The face, yes")
  return cap(line).replace(/([.!?] )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

/** Plays the scene; resolves when it is over (finished or skipped). */
export function playScene(o: SceneOptions): Promise<void> {
  addStyles();
  const S = o.strings;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const who = o.caseNo % WITNESSES.length;
  const person = S.witnesses[who];
  const mood = moodOf(o.total);
  const now = new Date();

  return new Promise<void>((resolve) => {
    let over = false;
    /** Everything that waits; Skip resolves them all at once. */
    const waiting = new Set<() => void>();
    const wait = (ms: number) =>
      new Promise<void>((r) => {
        if (over) return r();
        const done = () => {
          clearTimeout(t);
          waiting.delete(done);
          r();
        };
        const t = setTimeout(done, reduced ? Math.min(ms, 400) : ms);
        waiting.add(done);
      });

    /* ---- 1. printing ------------------------------------------------------------------------- */
    const print = document.createElement('div');
    print.className = 'fw-dlgbg';
    print.innerHTML =
      `<div class="fw-dlg fw-bev" role="status"><div class="fw-title"><span class="fw-title__t">PRINT</span></div>` +
      `<div class="fw-dlg__body"><p><svg class="fwp-icon" width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="5" y="1" width="16" height="8" fill="#fff" stroke="#000"/><rect x="1" y="8" width="24" height="9" fill="#c3c3c3" stroke="#000"/><rect x="5" y="14" width="16" height="7" fill="#fff" stroke="#000"/><circle cx="21" cy="11" r="1.4" fill="#2a2"/></svg>${esc(S.printing)}</p>` +
      `<div class="fwp-bar">${'<i></i>'.repeat(16)}</div></div></div>`;
    o.root.append(print);
    const blocks = [...print.querySelectorAll('i')];

    /* ---- the scene ---------------------------------------------------------------------------- */
    const sc = document.createElement('div');
    sc.className = 'fwsc';
    sc.setAttribute('role', 'dialog');
    sc.setAttribute('aria-modal', 'true');
    sc.setAttribute('aria-label', S.label);
    sc.innerHTML =
      `<div class="fwsc-stage"><div class="fwsc-shake"><div class="fwsc-cam" data-shot="start">` +
      sceneSvg({
        witness: who,
        sketch: o.sketch.toDataURL('image/png'),
        paperTitle: esc(S.paper.replace('{n}', String(o.caseNo))),
        stamp: esc(S.stamp),
        time: [now.getHours(), now.getMinutes(), now.getSeconds()],
      }) +
      `</div></div><div class="fwsc-bar fwsc-bar--top"></div><div class="fwsc-bar fwsc-bar--bot"></div><div class="fwsc-fade"></div>` +
      `<div class="fwsc-box" aria-live="polite"><b class="fwsc-name"></b><p class="fwsc-text"></p><button type="button" class="fwsc-next" hidden>${esc(S.verdict)}</button></div></div>` +
      `<button type="button" class="fwsc-skip">${esc(S.skip)}</button>`;
    const $ = <E extends HTMLElement | SVGElement = HTMLElement>(sel: string) => sc.querySelector(sel) as E;
    const svg = $<SVGSVGElement>('svg.sc');
    const cam = $('.fwsc-cam');
    const shaker = $('.fwsc-shake');
    const box = $('.fwsc-box');
    const nameEl = $('.fwsc-name');
    const textEl = $('.fwsc-text');
    const next = $<HTMLButtonElement>('.fwsc-next');
    const mug = $<SVGGElement>('.sc-mug');

    const shot = (s: 'wide' | 'push' | 'close' | 'closer') => (cam.dataset.shot = s);
    const state = (s: string) => svg.setAttribute('data-st', s);
    const paper = (s: 'down' | 'up' | 'show') => svg.setAttribute('data-paper', s);

    /* ---- the dialogue: typed, a click completes it ------------------------------------------- */
    let typing: (() => void) | null = null;
    async function say(name: string, text: string, slow = false) {
      if (over) return;
      nameEl.textContent = name;
      textEl.textContent = '';
      box.classList.add('is-on');
      const caret = document.createElement('span');
      caret.className = 'fwsc-caret';
      let full = false;
      typing = () => (full = true);
      const node = document.createTextNode('');
      textEl.append(node, caret);
      for (let i = 0; i < text.length && !over; i++) {
        if (full || reduced) {
          node.data = text;
          break;
        }
        node.data = text.slice(0, i + 1);
        const ch = text[i];
        await wait(slow ? 380 : /[.!?…]/.test(ch) ? 190 : /[,—–]/.test(ch) ? 120 : 26 + Math.random() * 18);
      }
      node.data = text;
      typing = null;
    }

    /** After a line: wait for a click, or go on after `ms`. */
    let goOn: (() => void) | null = null;
    const pause = (ms: number) =>
      new Promise<void>((r) => {
        if (over) return r();
        const done = () => {
          goOn = null;
          waiting.delete(done);
          clearTimeout(t);
          r();
        };
        const t = setTimeout(done, ms);
        goOn = done;
        waiting.add(done);
      });

    box.addEventListener('click', (e) => {
      if ((e.target as Element).closest('.fwsc-next')) return;
      if (typing) typing();
      else goOn?.();
    });

    /* ---- the end ------------------------------------------------------------------------------- */
    const prevFocus = document.activeElement as HTMLElement | null;
    async function end() {
      if (over) return;
      over = true;
      for (const f of [...waiting]) f();
      print.remove();
      sc.classList.add('is-closing');
      await new Promise((r) => setTimeout(r, reduced ? 0 : 450));
      sc.remove();
      document.removeEventListener('keydown', onKey);
      prevFocus?.focus({ preventScroll: true });
      resolve();
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void end();
      } else if ((e.key === 'Enter' || e.key === ' ') && !next.hidden && document.activeElement !== next) {
        e.preventDefault();
        void end();
      }
    };
    document.addEventListener('keydown', onKey);
    $('.fwsc-skip').addEventListener('click', () => void end());
    next.addEventListener('click', () => void end());

    /* ---- the timeline ------------------------------------------------------------------------- */
    void (async () => {
      // 1. Printing in the program
      for (let i = 0; i < blocks.length && !over; i++) {
        blocks[i].classList.add('is-on');
        await wait(55 + Math.random() * 40);
      }
      await wait(250);
      if (over) return;
      print.remove();

      // 2. Into the room
      o.root.append(sc);
      sc.querySelector<HTMLElement>('.fwsc-skip')!.focus({ preventScroll: true });
      // A moment later, so the start state is painted first and the fade and dolly run
      setTimeout(() => {
        sc.classList.add('is-open', 'is-film');
        shot('wide');
      }, 40);
      await wait(1300);

      // 3. The sketch comes up: "Is this the guy?"
      paper('up');
      await wait(700);
      await say(S.you, pick(S.ask).replace('{title}', person.title));
      paper('show');
      await pause(900);

      // 4. Close-up: the witness studies it
      shot('close');
      state('look');
      await wait(500);
      await say(person.name, S.think, true);
      await wait(900);

      // 5. The reaction
      state(mood);
      if (mood === 'furious') {
        shot('closer');
        for (const at of [380, 1000]) {
          setTimeout(() => {
            if (over) return;
            shaker.classList.remove('is-shake');
            void shaker.offsetWidth;
            shaker.classList.add('is-shake');
            mug.classList.remove('is-jump');
            void mug.getBoundingClientRect();
            mug.classList.add('is-jump');
          }, at);
        }
      } else if (mood === 'delighted') shot('push');
      await wait(mood === 'furious' ? 300 : 450);
      await say(person.name, reply(S, mood, o.rows, o.has));
      if (over) return;

      // 6. Back to the verdict
      next.hidden = false;
      next.focus({ preventScroll: true });
    })();
  });
}
