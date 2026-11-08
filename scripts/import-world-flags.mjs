// Copies the flags of every country (UN members plus Vatican City, Palestine,
// Taiwan and Kosovo) into src/assets/flags/ and writes src/data/world-flags.json
// with name and true aspect ratio. Source: the public-domain set behind the npm
// package svg-country-flags (Wikipedia renders). Used by the Impossible level of
// Paint the Flag.
//
// One-off, re-run only to refresh the set:
//   npm install --no-save svg-country-flags
//   node scripts/import-world-flags.mjs
//
// The SVGs are cleaned on the way in (no scripts, no event handlers, no external
// references) and get explicit width/height so every browser can draw them onto
// a canvas.
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';

const SRC = 'node_modules/svg-country-flags/svg';
const OUT = 'src/assets/flags';
const META = 'src/data/world-flags.json';

const CODES = `af al dz ad ao ag ar am au at az bs bh bd bb by be bz bj bt bo ba bw br bn bg bf bi cv kh cm ca cf td
cl cn co km cg cd cr ci hr cu cy cz dk dj dm do ec eg sv gq er ee sz et fj fi fr ga gm ge de gh gr gd gt gn gw gy
ht hn hu is in id ir iq ie il it jm jp jo kz ke ki kw kg la lv lb ls lr ly li lt lu mg mw my mv ml mt mh mr mu mx
fm md mc mn me ma mz mm na nr np nl nz ni ne ng kp mk no om pk pw pa pg py pe ph pl pt qa ro ru rw kn lc vc ws sm
st sa sn rs sc sl sg sk si sb so za kr ss es lk sd sr se ch sy tj tz th tl tg to tt tn tr tm tv ug ua ae gb us uy
uz vu ve vn ye zm zw va ps tw xk`
  .split(/\s+/)
  .filter(Boolean);

// Short, common English names where the CLDR name is long or political
const NAMES = {
  bo: 'Bolivia',
  cd: 'DR Congo',
  cg: 'Republic of the Congo',
  ci: 'Ivory Coast',
  cz: 'Czechia',
  fm: 'Micronesia',
  gb: 'United Kingdom',
  ir: 'Iran',
  kp: 'North Korea',
  kr: 'South Korea',
  la: 'Laos',
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
  ve: 'Venezuela',
  vn: 'Vietnam',
  xk: 'Kosovo',
};

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

/** Explicit width/height (drawImage needs an intrinsic size) and a viewBox for scaling. */
function normalise(svg) {
  const { root, w, h, hasViewBox } = size(svg);
  let next = root.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
  if (!hasViewBox) next = next.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
  next = next.replace(/<svg\b/i, `<svg width="${w}" height="${h}"`);
  return { svg: svg.replace(root, next), w, h };
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const meta = [];
const missing = [];
let bytes = 0;
for (const code of CODES) {
  let raw;
  try {
    raw = readFileSync(`${SRC}/${code}.svg`, 'utf8');
  } catch {
    missing.push(code);
    continue;
  }
  const { svg, w, h } = normalise(clean(raw));
  writeFileSync(`${OUT}/${code}.svg`, svg + '\n');
  bytes += statSync(`${OUT}/${code}.svg`).size;
  const name = NAMES[code] ?? display.of(code.toUpperCase()) ?? code.toUpperCase();
  meta.push({ code, name, w: +w.toFixed(3), h: +h.toFixed(3) });
}

meta.sort((a, b) => a.name.localeCompare(b.name, 'en'));
writeFileSync(META, JSON.stringify(meta, null, 1) + '\n');
console.log(`${meta.length} flags, ${(bytes / 1024 / 1024).toFixed(2)} MB in ${OUT}, list in ${META}`);
if (missing.length) {
  console.error(`missing in source: ${missing.join(', ')}`);
  process.exitCode = 1;
}
