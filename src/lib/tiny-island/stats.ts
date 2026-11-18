/**
 * Population per people over the years, as a small line chart (inline SVG)
 * above the chronicle. Lines use the colours of the peoples (as everywhere in
 * the game); because red and green are hard to tell apart for many people,
 * every line also has its own dash pattern and its name at the end. Hovering
 * shows the numbers of one year.
 */
import { PEOPLE_COLORS, PEOPLES, type People } from './agents';

export interface Snapshot {
  year: number;
  counts: Record<People, number>;
}

/** Keep the history short: past 240 points every other one goes. */
export function record(history: Snapshot[], snap: Snapshot) {
  history.push(snap);
  if (history.length > 240) {
    for (let i = history.length - 2; i > 0; i -= 2) history.splice(i, 1);
  }
}

const DASH: Record<People, string> = { coast: '', forest: '6 3', mountain: '2 3', steppe: '9 3 2 3' };
const W = 270;
const H = 120;
const PAD = { l: 26, r: 64, t: 8, b: 18 };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function niceMax(v: number) {
  if (v <= 5) return 5;
  const step = v <= 20 ? 5 : v <= 50 ? 10 : v <= 100 ? 20 : 50;
  return Math.ceil(v / step) * step;
}

/** The chart; `hover` is an index into `history` or -1. */
export function chartSvg(history: Snapshot[], names: Record<People, string>, yearLabel: string, hover: number): string {
  const shown = PEOPLES.filter((p) => history.some((s) => s.counts[p] > 0));
  if (history.length < 2 || !shown.length) return '';
  const y0 = history[0].year;
  const y1 = history[history.length - 1].year;
  const max = niceMax(Math.max(...history.flatMap((s) => shown.map((p) => s.counts[p]))));
  const sx = (year: number) => PAD.l + ((year - y0) / Math.max(1, y1 - y0)) * (W - PAD.l - PAD.r);
  const sy = (n: number) => PAD.t + (1 - n / max) * (H - PAD.t - PAD.b);

  const grid = [0, max / 2, max]
    .map((v) => `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v)}" y2="${sy(v)}" class="ti-s__grid"/><text x="${PAD.l - 4}" y="${sy(v) + 3}" class="ti-s__tick" text-anchor="end">${v}</text>`)
    .join('');
  const axis = `<text x="${PAD.l}" y="${H - 4}" class="ti-s__tick">${esc(yearLabel.replace('{n}', String(y0)))}</text><text x="${W - PAD.r}" y="${H - 4}" class="ti-s__tick" text-anchor="end">${esc(yearLabel.replace('{n}', String(y1)))}</text>`;

  // Labels at the line ends, nudged apart so they never overlap
  const ends = shown.map((p) => ({ p, n: history[history.length - 1].counts[p], y: sy(history[history.length - 1].counts[p]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;

  const lines = shown
    .map((p) => {
      const pts = history.map((s) => `${sx(s.year).toFixed(1)},${sy(s.counts[p]).toFixed(1)}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${PEOPLE_COLORS[p].cloth}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${DASH[p] ? ` stroke-dasharray="${DASH[p]}"` : ''}/>`;
    })
    .join('');
  const labels = ends
    .map((e) => `<circle cx="${W - PAD.r + 6}" cy="${e.y}" r="3" fill="${PEOPLE_COLORS[e.p].cloth}" stroke="#111" stroke-width="1"/><text x="${W - PAD.r + 12}" y="${e.y + 3.5}" class="ti-s__label">${esc(names[e.p])} ${e.n}</text>`)
    .join('');

  let tip = '';
  if (hover >= 0 && hover < history.length) {
    const s = history[hover];
    const x = sx(s.year);
    tip =
      `<line x1="${x}" x2="${x}" y1="${PAD.t}" y2="${H - PAD.b}" class="ti-s__cross"/>` +
      shown.map((p) => `<circle cx="${x}" cy="${sy(s.counts[p])}" r="4" fill="${PEOPLE_COLORS[p].cloth}" stroke="#fff" stroke-width="2"/>`).join('');
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="ti-s__svg" role="img">${grid}${axis}${lines}${labels}${tip}</svg>`;
}

/** Text for the tooltip of one year: "Year 12 · Coast 8 · Forest 5". */
export function tipText(s: Snapshot, names: Record<People, string>, yearLabel: string) {
  const parts = PEOPLES.filter((p) => s.counts[p] > 0).map((p) => `${names[p]} ${s.counts[p]}`);
  return [yearLabel.replace('{n}', String(s.year)), ...parts].join(' · ');
}

/** Index of the snapshot closest to a pointer x (in SVG units). */
export function indexAt(history: Snapshot[], x: number) {
  if (history.length < 2) return -1;
  const y0 = history[0].year;
  const y1 = history[history.length - 1].year;
  const year = y0 + ((x - PAD.l) / (W - PAD.l - PAD.r)) * (y1 - y0);
  let best = 0;
  for (let i = 1; i < history.length; i++) if (Math.abs(history[i].year - year) < Math.abs(history[best].year - year)) best = i;
  return best;
}

export const CHART_W = W;
