// Social preview images for library.jxsi.ch (1200x630):
//   src/assets/library/library-og.png  the shelf
//   src/assets/library/flags-og.png    the Flags book, a mosaic of real flags
//
//   node scripts/library-og.mjs
//
// Fonts are system fonts (Arial Black), flags come from src/assets/flags.
import { mkdirSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const INK = '#111';
const OUT = 'src/assets/library';
mkdirSync(OUT, { recursive: true });
const display = 'Arial Black, Arial, sans-serif';

const label = (x, y, text, size, fill = '#fff', rot = -3) =>
  `<g transform="rotate(${rot} ${x} ${y})">` +
  `<text x="${x + 6}" y="${y + 7}" font-family="${display}" font-size="${size}" fill="${INK}">${text}</text>` +
  `<text x="${x}" y="${y}" font-family="${display}" font-size="${size}" fill="${fill}" stroke="${INK}" stroke-width="5" paint-order="stroke">${text}</text></g>`;

async function flagTile(code, w, h) {
  const svg = readFileSync(`src/assets/flags/${code}.svg`);
  const flag = await sharp(svg, { density: 300, limitInputPixels: false }).resize(w - 8, h - 8, { fit: 'fill' }).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: INK } })
    .composite([{ input: flag, left: 4, top: 4 }])
    .png()
    .toBuffer();
}

/* Flags book: rows of flags, title on a white card */
{
  const codes = ['ch', 'jp', 'br', 'za', 'ca', 'kr', 'se', 'np', 'gb-sct', 'mx', 'in', 'ke', 'gr', 'ar', 'bt', 'fr', 'au', 'ng', 'tr', 'pt', 'is', 'jm', 'cn', 'de', 'us', 'kz', 'it', 'pe'];
  const tw = 150;
  const th = 100;
  const tiles = await Promise.all(codes.map((c) => flagTile(c, tw, th)));
  const cols = 7;
  const layers = tiles.map((input, i) => ({
    input,
    left: 30 + (i % cols) * (tw + 20) + (Math.floor(i / cols) % 2 ? 40 : -20),
    top: 20 + Math.floor(i / cols) * (th + 54),
  }));
  const card = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
      `<rect x="164" y="214" width="900" height="210" rx="24" fill="${INK}"/>` +
      `<rect x="150" y="200" width="900" height="210" rx="24" fill="#fff8e7" stroke="${INK}" stroke-width="8"/>` +
      label(190, 300, 'FLAGS OF THE WORLD', 62, '#4d8dff', -2) +
      `<text x="196" y="372" font-family="${display}" font-size="34" fill="${INK}">203 flags · learn them, then prove it</text>` +
      `</svg>`,
  );
  await sharp({ create: { width: W, height: H, channels: 3, background: '#4d8dff' } })
    .composite([...layers, { input: card, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/flags-og.png`);
  console.log(`wrote ${OUT}/flags-og.png`);
}

/* The reading room: walnut case, leather volumes, brass plaque */
{
  const serif = 'Georgia, Times New Roman, serif';
  const leathers = ['#6d1f1f', '#234d33', '#3a2a5e', '#7a5a1c', '#5b3a1e', '#1f4a4a', '#4a2340', '#2e3b1f', '#7a2e12'];
  const base = 560;
  const spines = [];
  let x = 150;
  // The real book first, then a row of old volumes
  const real = { w: 96, h: 300 };
  spines.push(
    `<rect x="${x}" y="${base - real.h}" width="${real.w}" height="${real.h}" rx="4" fill="#1d3d6b"/>` +
      `<rect x="${x}" y="${base - real.h}" width="${real.w}" height="${real.h}" rx="4" fill="url(#round)"/>` +
      `<rect x="${x + 10}" y="${base - real.h + 46}" width="${real.w - 20}" height="${real.h - 140}" fill="rgb(0 0 0 / 0.28)" stroke="#e2bf6a" stroke-width="2"/>` +
      `<text transform="translate(${x + real.w / 2 - 12} ${base - real.h + 62}) rotate(90)" font-family="${serif}" font-weight="700" font-size="22" fill="#e2bf6a" letter-spacing="2">FLAGS OF</text>` +
      `<text transform="translate(${x + real.w / 2 + 14} ${base - real.h + 62}) rotate(90)" font-family="${serif}" font-weight="700" font-size="22" fill="#e2bf6a" letter-spacing="2">THE WORLD</text>` +
      bands(x, real.w, base - real.h, real.h),
  );
  x += real.w + 4;
  for (let k = 0; k < 13; k++) {
    const w = 38 + ((k * 37) % 22);
    const h = 200 + ((k * 53) % 80);
    spines.push(
      `<g opacity="0.85"><rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="3" fill="${leathers[k % leathers.length]}"/>` +
        `<rect x="${x}" y="${base - h}" width="${w}" height="${h}" rx="3" fill="url(#round)"/>` +
        bands(x, w, base - h, h) +
        `</g>`,
    );
    x += w + 3;
    if (k === 6) x += 70; // room for the globe
  }

  function bands(x0, w, y0, h) {
    const line = (y) => `<rect x="${x0}" y="${y}" width="${w}" height="2.5" fill="#e2bf6a"/>`;
    return line(y0 + 16) + line(y0 + 26) + line(y0 + h - 28) + line(y0 + h - 18);
  }

  const globeX = 150 + real.w + 4 + 7 * 48 + 20;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
    `<linearGradient id="round" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.22" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.7" stop-color="#000" stop-opacity="0.1"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></linearGradient>` +
    `<linearGradient id="brassG" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="#f6dc94"/><stop offset="0.45" stop-color="#c99a3e"/><stop offset="0.7" stop-color="#e8c674"/><stop offset="1" stop-color="#a87a2c"/></linearGradient>` +
    `<radialGradient id="glow" cx="0.5" cy="0" r="0.8"><stop offset="0" stop-color="#ffc478" stop-opacity="0.28"/><stop offset="1" stop-color="#ffc478" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="sea" cx="0.38" cy="0.35" r="0.75"><stop offset="0" stop-color="#efe0b4"/><stop offset="0.7" stop-color="#c9ad74"/><stop offset="1" stop-color="#8f7442"/></radialGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="#24150c"/>` +
    `<rect width="${W}" height="${H}" fill="url(#glow)"/>` +
    // case: posts, back panel, crown, board
    `<rect x="110" y="200" width="${W - 220}" height="400" fill="#4a2c18"/>` +
    `<rect x="132" y="236" width="${W - 264}" height="324" fill="#1c100a"/>` +
    `<rect x="96" y="190" width="${W - 192}" height="40" rx="4" fill="#6b4325"/>` +
    `<rect x="96" y="226" width="${W - 192}" height="4" fill="#a8873f"/>` +
    spines.join('') +
    // globe
    `<g transform="translate(${globeX} 380)">` +
    `<path d="M18 172h44l-6-10H24z" fill="#4a2c18"/><rect x="36" y="128" width="8" height="36" fill="#5b3a1e"/>` +
    `<circle cx="40" cy="78" r="46" fill="url(#sea)" stroke="#5a3d12" stroke-width="2"/>` +
    `<path d="M10 60c9 1 13 8 20 6s7-10 16-8 9 10 4 15-15 2-17 10 9 12 3 18-14 1-17-5-8-13-14-16" fill="#7a5a2c" opacity="0.75"/>` +
    `<path d="M2 112A54 54 0 0 1 40 24" fill="none" stroke="#d4ad5a" stroke-width="5" stroke-linecap="round"/></g>` +
    `<rect x="100" y="${base}" width="${W - 200}" height="30" fill="#7a4c2a"/>` +
    `<rect x="100" y="${base}" width="${W - 200}" height="3" fill="#a26c3d"/>` +
    // brass plaque
    `<rect x="${W / 2 - 230}" y="52" width="460" height="104" rx="8" fill="url(#brassG)" stroke="#3a2410" stroke-width="3"/>` +
    [[W / 2 - 214, 68], [W / 2 + 214, 68], [W / 2 - 214, 140], [W / 2 + 214, 140]].map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="4" fill="#5a3d12"/>`).join('') +
    `<text x="${W / 2}" y="124" text-anchor="middle" font-family="${serif}" font-weight="700" font-size="62" fill="#3a2410">The Library</text>` +
    `<text x="${W - 100}" y="${H - 14}" text-anchor="end" font-family="${serif}" font-style="italic" font-size="26" fill="#f1d48a">library.jxsi.ch</text>` +
    `</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`${OUT}/library-og.png`);
  console.log(`wrote ${OUT}/library-og.png`);
}
