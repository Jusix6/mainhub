// Builds src/data/colors.json for Color Hunter (fun.jxsi.ch/colors) from the
// xkcd colour survey (scripts/data/xkcd-colors.txt, CC0, https://xkcd.com/color/rgb.txt).
//
//   node scripts/build-colors.mjs        (a few minutes)
//
// Per colour:
//  - OKLab value and colour family (from OKLCh hue, chroma, lightness)
//  - steps: fewest 1:1 mixing steps from the five start colours, with the
//    loose rule "nearest named colour within LOOSE_DISTANCE" (null = not
//    reachable that way; needs the later unlocks)
//  - tier from steps: common 1–2, uncommon 3–4, rare 5–7, legendary 8+ or null
//  - tol: how close a mix must land to count. Starts at the tier value and is
//    raised only as far as needed so that every colour can actually be hit:
//    the script mixes everything reachable with all unlocks (ratios 1:2 and
//    1:3, magenta, cyan) and, for colours still out of reach, loosens their
//    tolerance to the closest mix that ever landed on them. Repeats until
//    nothing changes.
//  - daily: fewest mixing levels (1–3) from the start colours, with every
//    ratio and no names in between, that hit the colour within its tolerance;
//    null = not a daily target candidate
import { readFileSync, writeFileSync } from 'node:fs';
import spectral from 'spectral.js';
import { deltaE, hexToOklab } from '../src/lib/color-math.mjs';

/** The game's rules; keep in sync with src/pages/fun/colors.astro. */
const LOOSE_DISTANCE = 0.05;
const TIER_TOL = { common: 0.06, uncommon: 0.04, rare: 0.025, legendary: 0.015 };
const START = ['red', 'yellow', 'blue', 'white', 'black'];
const UNLOCK_BASES = ['magenta', 'cyan'];
const RATIOS = [1, 2, 3];
/** Survey names too crude for the site: faeces and urine. Puke, vomit, snot and booger stay. */
const CRUDE = /\b(shit|poo|poop|piss|diarrhea)\b/;

const lines = readFileSync('scripts/data/xkcd-colors.txt', 'utf8')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'));

const colors = lines
  .map((l) => {
    const [name, hex] = l.split('\t').map((s) => s.trim());
    return { name, hex: hex.toLowerCase() };
  })
  .filter((c) => !CRUDE.test(c.name))
  .map((c, id) => ({ id, ...c, lab: hexToOklab(c.hex) }));
const byName = (n) => {
  const c = colors.find((x) => x.name === n);
  if (!c) throw new Error(`colour missing: ${n}`);
  return c;
};

/* ---- family from OKLCh ---------------------------------------------------- */

function family([L, a, b]) {
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  if (C < 0.035) return 'grey';
  if (h >= 20 && h < 100 && L < 0.62 && C < 0.16) return 'brown';
  if (h < 20 || h >= 345) return L > 0.74 ? 'pink' : 'red';
  if (h < 70) return 'orange';
  if (h < 115) return 'yellow';
  if (h < 175) return 'green';
  if (h < 270) return 'blue';
  if (h < 320) return 'purple';
  return 'pink';
}

/* ---- mixing and nearest-colour lookup ------------------------------------------ */

const mixCache = new Map();
/** a:b in the ratio 1:r (r = 1, 2 or 3) */
function mix(a, b, r = 1) {
  const key = r === 1 ? (a < b ? a + b : b + a) : `${a}${b}${r}`;
  let hex = mixCache.get(key);
  if (!hex) {
    hex = spectral.mix([new spectral.Color(a), 1], [new spectral.Color(b), r]).toString().toLowerCase();
    mixCache.set(key, hex);
  }
  return hex;
}

// Uniform grid over OKLab so the nearest search only looks at neighbouring cells
const CELL = 0.05;
const grid = new Map();
const cellKey = (lab) => lab.map((v) => Math.floor(v / CELL)).join(',');
for (const c of colors) {
  const k = cellKey(c.lab);
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push(c);
}
const nearestCache = new Map();
/** [colour, distance] of the nearest named colour (searched within 2 cells; enough for our limits) */
function nearest(hex) {
  let hit = nearestCache.get(hex);
  if (hit) return hit;
  const lab = hexToOklab(hex);
  const [x, y, z] = lab.map((v) => Math.floor(v / CELL));
  let best = null;
  let bestD = Infinity;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++)
      for (let k = -2; k <= 2; k++) {
        for (const c of grid.get(`${x + i},${y + j},${z + k}`) ?? []) {
          const d = deltaE(lab, c.lab);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
  hit = [best, bestD];
  nearestCache.set(hex, hit);
  return hit;
}

/* ---- 1: steps and tiers (loose rule, 1:1, five start colours) ------------------- */

const steps = new Map();
{
  let pool = START.map(byName);
  for (const c of pool) steps.set(c.id, 0);
  for (let step = 1; ; step++) {
    const added = [];
    for (let i = 0; i < pool.length; i++)
      for (let j = i + 1; j < pool.length; j++) {
        const [hit, d] = nearest(mix(pool[i].hex, pool[j].hex));
        if (hit && d <= LOOSE_DISTANCE && !steps.has(hit.id)) {
          steps.set(hit.id, step);
          added.push(hit);
        }
      }
    if (!added.length) break;
    pool = [...pool, ...added];
  }
}
const tierOf = (s) => (s === undefined ? 'legendary' : s <= 2 ? 'common' : s <= 4 ? 'uncommon' : s <= 7 ? 'rare' : 'legendary');
for (const c of colors) {
  c.steps = steps.get(c.id) ?? null;
  c.tier = tierOf(steps.get(c.id));
  c.tol = TIER_TOL[c.tier];
}

/* ---- 2: make every colour reachable with all unlocks ------------------------------ */

const bases = [...START, ...UNLOCK_BASES].map(byName);
let round = 0;
let unreachable = [];
for (;;) {
  round++;
  // Closure under the strict rule: everything reachable with all unlocks
  const reached = new Set(bases.map((c) => c.id));
  let pool = [...bases];
  for (let fresh = pool; fresh.length; ) {
    const added = [];
    const consider = (a, b, r) => {
      const [hit, d] = nearest(mix(a.hex, b.hex, r));
      if (hit && d <= hit.tol && !reached.has(hit.id)) {
        reached.add(hit.id);
        added.push(hit);
      }
    };
    // Only pairs involving a colour new in the last round, everything else was tried
    const freshIds = new Set(fresh.map((c) => c.id));
    for (const a of pool)
      for (const b of pool) {
        if (a === b || (!freshIds.has(a.id) && !freshIds.has(b.id))) continue;
        for (const r of RATIOS) if (r !== 1 || a.id < b.id) consider(a, b, r);
      }
    pool = [...pool, ...added];
    fresh = added;
  }

  // Closest any mix of the closure came to each colour it is nearest to
  const closest = new Map();
  for (const a of pool)
    for (const b of pool) {
      if (a === b) continue;
      for (const r of RATIOS) {
        if (r === 1 && a.id > b.id) continue;
        const [hit, d] = nearest(mix(a.hex, b.hex, r));
        if (hit && !reached.has(hit.id) && d < (closest.get(hit.id) ?? Infinity)) closest.set(hit.id, d);
      }
    }
  let loosened = 0;
  for (const [id, d] of closest) {
    const c = colors[id];
    const next = Math.ceil(d * 1.02 * 10000) / 10000;
    if (next > c.tol) {
      c.tol = next;
      loosened++;
    }
  }
  unreachable = colors.filter((c) => !reached.has(c.id) && !closest.has(c.id));
  console.log(`round ${round}: ${reached.size} reachable, ${loosened} tolerances loosened, ${unreachable.length} never hit`);
  if (!loosened || round >= 8) break;
}

/* ---- 3: daily target candidates ---------------------------------------------------------- */

// The daily starts everyone with the five start colours and every ratio. A
// colour can be a daily target only if it is hit within its tolerance by a
// chain of at most three mixing levels (raw mixes, no snapping to names), so
// every daily is solvable. dailyDepth = the smallest such level.
const dailyDepth = new Map();
{
  const startHex = START.map((n) => byName(n).hex);
  const check = (hex, depth) => {
    const lab = hexToOklab(hex);
    const [x, y, z] = lab.map((v) => Math.floor(v / CELL));
    for (let i = -2; i <= 2; i++)
      for (let j = -2; j <= 2; j++)
        for (let k = -2; k <= 2; k++)
          for (const c of grid.get(`${x + i},${y + j},${z + k}`) ?? []) {
            if (!dailyDepth.has(c.id) && deltaE(lab, c.lab) <= c.tol) dailyDepth.set(c.id, depth);
          }
  };
  /** All mixes of a with b in every ratio (both orders for 1:2 and 1:3). */
  const allMixes = (a, b) => [mix(a, b, 1), mix(a, b, 2), mix(b, a, 2), mix(a, b, 3), mix(b, a, 3)];
  const level = (as, bs, depth) => {
    const out = new Set();
    for (const a of as)
      for (const b of bs) {
        if (a === b) continue;
        for (const m of allMixes(a, b)) {
          if (out.has(m)) continue;
          out.add(m);
          check(m, depth);
        }
      }
    return out;
  };
  const s1 = new Set([...startHex, ...level(startHex, startHex, 1)]);
  const s2 = new Set([...s1, ...level([...s1], [...s1], 2)]);
  level([...s2], [...s1], 3);
  console.log(`daily: ${dailyDepth.size} colours reachable within three mixing levels (${s1.size} level-1, ${s2.size} level-2 colours)`);
}

/* ---- output -------------------------------------------------------------------------- */

const r4 = (n) => Math.round(n * 10000) / 10000;
const out = colors
  .filter((c) => !unreachable.includes(c))
  .map((c) => ({
    id: c.id,
    name: c.name,
    hex: c.hex,
    lab: c.lab.map(r4),
    family: family(c.lab),
    tier: c.tier,
    steps: c.steps,
    tol: r4(c.tol),
    daily: dailyDepth.get(c.id) ?? null,
  }));

writeFileSync(
  'src/data/colors.json',
  JSON.stringify({ start: START, unlockBases: UNLOCK_BASES, tierTol: TIER_TOL, looseDistance: LOOSE_DISTANCE, colors: out }) + '\n',
);

const count = (key) => out.reduce((acc, c) => ((acc[c[key]] = (acc[c[key]] ?? 0) + 1), acc), {});
console.log(`${out.length} colours written (${lines.length - colors.length} crude names removed, ${unreachable.length} unreachable dropped${unreachable.length ? `: ${unreachable.map((c) => c.name).join(', ')}` : ''})`);
console.log('families', JSON.stringify(count('family')));
console.log('tiers', JSON.stringify(count('tier')));
console.log('loosened beyond tier value:', out.filter((c) => c.tol > TIER_TOL[c.tier]).length);
const dailyPool = (tiers) => out.filter((c) => c.daily !== null && tiers.includes(c.tier)).length;
console.log(`daily pool: ${dailyPool(['common', 'uncommon'])} common/uncommon, ${dailyPool(['rare'])} rare (Mondays)`);
