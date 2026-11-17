// Copies the flags of the world into src/assets/flags/ and writes the lists
// that use them:
//
//  - src/data/world-flags.json: the 197 countries (UN members plus Vatican City,
//    Palestine, Taiwan and Kosovo) with name and true aspect ratio. Used by the
//    Impossible level of Paint the Flag.
//  - src/data/library/flags.json: 203 flags, the 197 countries plus a few
//    well-known others (England, Scotland, Wales, Greenland, Hong Kong, Puerto
//    Rico) with capital, continent, kind, parent, other accepted names, main
//    colours and which flags look alike. Used by the Flags book on
//    library.jxsi.ch. The other territories are left out on purpose: most fly
//    a copy of their parent's flag or a near-identical ensign, and hardly
//    anyone knows them.
//
// Sources: the public-domain flag set behind the npm package svg-country-flags
// (Wikipedia renders, 256 flags; the EU and the dissolved Netherlands Antilles
// are left out) and the npm package countries-list (MIT) for capital and
// continent.
//
// One-off, re-run only to refresh the set:
//   npm install --no-save svg-country-flags countries-list
//   node scripts/import-world-flags.mjs
//
// The SVGs are cleaned on the way in (no scripts, no event handlers, no external
// references) and get explicit width/height so every browser can draw them onto
// a canvas.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { countries: COUNTRY_DATA } = require('countries-list');

const SRC = 'node_modules/svg-country-flags/svg';
const OUT = 'src/assets/flags';
const WORLD_META = 'src/data/world-flags.json';
const LIBRARY_META = 'src/data/library/flags.json';

/** Sovereign countries: the Impossible level of Paint the Flag and "country" in the library. */
const COUNTRIES = `af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td
cl cn co km cg cd cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy
ht hn hu is in id ir iq ie il it jm jp jo kz ke ki kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx
fm md mc mn me ma mz mm na nr np nl nz ni ne ng kp mk no om pk pw pa pg py pe ph pl pt qa ro ru rw kn lc vc ws sm
st sa sn rs sc sl sg sk si sb so za kr ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae gb us uy
uz vu ve vn ye zm zw va ps tw xk`
  .split(/\s+/)
  .filter(Boolean);

/** Not countries, but well known enough for the library. */
const KEEP = ['gb-eng', 'gb-sct', 'gb-wls', 'gl', 'hk', 'pr'];

/** Who a territory belongs to (shown as "Territory of …"). Missing = none / disputed. */
const PARENT = {
  gl: 'dk', hk: 'cn', pr: 'us', 'gb-eng': 'gb', 'gb-sct': 'gb', 'gb-wls': 'gb',
};

/** The parts of the UK are not in countries-list. */
const EXTRA = {
  'gb-eng': { name: 'England', capital: 'London', continent: 'EU' },
  'gb-sct': { name: 'Scotland', capital: 'Edinburgh', continent: 'EU' },
  'gb-wls': { name: 'Wales', capital: 'Cardiff', continent: 'EU' },
};

// Short, common English names where the CLDR name is long or political
const NAMES = {
  bo: 'Bolivia',
  cd: 'DR Congo',
  cg: 'Republic of the Congo',
  ci: 'Ivory Coast',
  cz: 'Czechia',
  fm: 'Micronesia',
  gb: 'United Kingdom',
  hk: 'Hong Kong',
  ir: 'Iran',
  kn: 'Saint Kitts & Nevis',
  kp: 'North Korea',
  kr: 'South Korea',
  la: 'Laos',
  lc: 'Saint Lucia',
  md: 'Moldova',
  mm: 'Myanmar',
  ps: 'Palestine',
  ru: 'Russia',
  sy: 'Syria',
  tr: 'Turkey',
  tw: 'Taiwan',
  tz: 'Tanzania',
  us: 'United States',
  va: 'Vatican City',
  vc: 'Saint Vincent & the Grenadines',
  ve: 'Venezuela',
  vn: 'Vietnam',
  xk: 'Kosovo',
};

/** Other names the typing quiz accepts (on top of the CLDR and countries-list names). */
const ALIASES = {
  ae: ['UAE', 'Emirates'],
  ba: ['Bosnia'],
  cd: ['Congo-Kinshasa', 'Democratic Republic of the Congo', 'DRC'],
  cf: ['CAR'],
  cg: ['Congo-Brazzaville', 'Congo'],
  ci: ["Côte d'Ivoire"],
  cv: ['Cape Verde'],
  cz: ['Czech Republic'],
  do: ['Dominican Rep'],
  gb: ['UK', 'Great Britain', 'Britain'],
  gq: ['Eq Guinea'],
  kn: ['Saint Kitts and Nevis', 'St Kitts'],
  kp: ['DPRK'],
  kr: ['Korea'],
  mk: ['Macedonia'],
  mm: ['Burma'],
  nl: ['Holland'],
  ps: ['Palestinian Territories'],
  sz: ['Swaziland'],
  tl: ['East Timor'],
  tr: ['Türkiye', 'Turkiye'],
  us: ['USA', 'US', 'America', 'United States of America'],
  va: ['Vatican', 'Holy See'],
};

/** Places without an official capital, or where the data has a technicality. */
const CAPITALS = { hk: '' };

const CONTINENTS = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };

const display = new Intl.DisplayNames(['en'], { type: 'region' });

function clean(svg) {
  return svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:xlink:)?href\s*=\s*("(?:https?:|javascript:)[^"]*"|'(?:https?:|javascript:)[^']*')/gi, '')
    .trim();
}

function size(svg) {
  const root = svg.match(/<svg\b[^>]*>/i)?.[0] ?? '';
  const vb = root.match(/viewBox\s*=\s*["']\s*([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)[\s,]+([-\d.e]+)/i);
  const num = (attr) => parseFloat(root.match(new RegExp(`\\s${attr}\\s*=\\s*["']([\\d.]+)`, 'i'))?.[1] ?? 'NaN');
  const w = vb ? parseFloat(vb[3]) : num('width');
  const h = vb ? parseFloat(vb[4]) : num('height');
  if (!(w > 0 && h > 0)) throw new Error('no size');
  return { root, w, h, hasViewBox: Boolean(vb) };
}

/**
 * Explicit width/height (drawImage needs an intrinsic size) and a viewBox for
 * scaling. Every flag gets the same intrinsic height (600 px) so an <img> with
 * `width: auto` is never tiny: some sources say 27×18, others 1200×800.
 */
const INTRINSIC_H = 600;
function normalise(svg) {
  const { root, w, h, hasViewBox } = size(svg);
  let next = root.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  if (!hasViewBox) next = next.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
  next = next.replace(/<svg\b/i, `<svg width="${Math.round((INTRINSIC_H * w) / h)}" height="${INTRINSIC_H}"`);
  return { svg: svg.replace(root, next), w, h };
}

const hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/** Small render of the flag: main colours (≥ 6 % of the area) and a pixel signature for look-alikes. */
async function analyse(svg, w) {
  const W = 30;
  const H = 20;
  // Render at ~240 px wide whatever the SVG's own size, then shrink
  const density = Math.min(2400, Math.max(1, (72 * 240) / w));
  const { data } = await sharp(Buffer.from(svg), { density, limitInputPixels: false }).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 3) {
    // 4 levels per channel: enough to tell red from orange, merges anti-aliasing
    const key = [data[i], data[i + 1], data[i + 2]].map((v) => Math.round(v / 85)).join('');
    const b = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    b.n++;
    b.r += data[i];
    b.g += data[i + 1];
    b.b += data[i + 2];
    buckets.set(key, b);
  }
  const total = W * H;
  const colors = [...buckets.values()]
    .filter((b) => b.n / total >= 0.06)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)
    .map((b) => hex(Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)));
  return { colors, pixels: data };
}

/** Mean per-channel difference of two signatures, 0..255. */
function pixelDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
mkdirSync('src/data/library', { recursive: true });

const codes = readdirSync(SRC)
  .filter((f) => f.endsWith('.svg'))
  .map((f) => f.slice(0, -4))
  .filter((c) => COUNTRIES.includes(c) || KEEP.includes(c));

const missing = COUNTRIES.filter((c) => !codes.includes(c));
const world = [];
const library = [];
const signatures = new Map();
let bytes = 0;

for (const code of codes) {
  const { svg, w, h } = normalise(clean(readFileSync(`${SRC}/${code}.svg`, 'utf8')));
  writeFileSync(`${OUT}/${code}.svg`, svg + '\n');
  bytes += statSync(`${OUT}/${code}.svg`).size;

  const upper = code.toUpperCase();
  const data = COUNTRY_DATA[upper] ?? EXTRA[code];
  if (!data) throw new Error(`no data for ${code}`);
  const cldr = code.includes('-') ? undefined : display.of(upper);
  const name = NAMES[code] ?? EXTRA[code]?.name ?? cldr ?? data.name;
  const isCountry = COUNTRIES.includes(code);
  const size = { w: +w.toFixed(3), h: +h.toFixed(3) };
  if (isCountry) world.push({ code, name, ...size });

  const { colors, pixels } = await analyse(svg, (INTRINSIC_H * w) / h);
  signatures.set(code, pixels);

  const aliases = [...new Set([cldr, data.name, ...(ALIASES[code] ?? [])].filter(Boolean))].filter((a) => norm(a) !== norm(name));
  library.push({
    code,
    name,
    aliases,
    capital: CAPITALS[code] ?? data.capital ?? '',
    continent: CONTINENTS[data.continent],
    kind: isCountry ? 'country' : 'territory',
    ...(PARENT[code] ? { parent: PARENT[code] } : {}),
    colors,
    ...size,
  });
}

// How alike two flags are, from a 30×20 render (mean channel difference):
//  - same: identical flag (Bouvet Island = Norway, Saint Martin = France …). The
//    quizzes accept either answer and never offer one against the other.
//  - like: practically identical (Indonesia/Monaco, Egypt/Yemen): never offered
//    against each other, but only the right one counts.
//  - near: look-alikes (Romania/Chad, Australia/New Zealand): good wrong options
//    for harder questions.
const SAME = 1;
const LIKE = 5;
const NEAR = 12;
for (const a of library) {
  const groups = { same: [], like: [], near: [] };
  for (const b of library) {
    if (b === a) continue;
    const d = pixelDistance(signatures.get(a.code), signatures.get(b.code));
    const sameRatio = Math.abs(a.w / a.h - b.w / b.h) < 0.02;
    if (d < SAME && sameRatio) groups.same.push(b.code);
    else if (d < LIKE) groups.like.push(b.code);
    else if (d < NEAR) groups.near.push(b.code);
  }
  for (const [k, v] of Object.entries(groups)) if (v.length) a[k] = v;
}

world.sort((a, b) => a.name.localeCompare(b.name, 'en'));
library.sort((a, b) => a.name.localeCompare(b.name, 'en'));
writeFileSync(WORLD_META, JSON.stringify(world, null, 1) + '\n');
writeFileSync(LIBRARY_META, JSON.stringify(library) + '\n');

console.log(`${library.length} flags (${world.length} countries), ${(bytes / 1024 / 1024).toFixed(2)} MB in ${OUT}`);
for (const k of ['same', 'like']) console.log(`${k}:`, library.filter((f) => f[k]).map((f) => `${f.code}=${f[k].join('/')}`).join(' '));
const unparented = library.filter((f) => f.kind === 'territory' && !f.parent).map((f) => f.code);
console.log('territories without parent:', unparented.join(' ') || '–');
if (missing.length) {
  console.error(`missing in source: ${missing.join(', ')}`);
  process.exitCode = 1;
}
