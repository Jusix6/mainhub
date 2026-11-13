// Draws the 16:9 thumbnails for the game list on fun.jxsi.ch, in the site's
// neo-brutalist style (thick outlines, hard shadows, loud flat colours).
//
//   node scripts/fun-thumbs.mjs
//
// Writes src/assets/fun/thumbs/<game>.png (1280x720). Fonts are system fonts
// (Arial Black / Courier New), so run it on a machine that has them.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const W = 1280;
const H = 720;
const INK = '#111';
const OUT = 'src/assets/fun/thumbs';
mkdirSync(OUT, { recursive: true });

const display = 'Arial Black, Arial, sans-serif';
const mono = 'Courier New, monospace';

/** Box with a hard offset shadow. */
const box = (x, y, w, h, fill, r = 22, shadow = 14, stroke = 8) =>
  `<rect x="${x + shadow}" y="${y + shadow}" width="${w}" height="${h}" rx="${r}" fill="${INK}"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${INK}" stroke-width="${stroke}"/>`;

/** Paint drop: a slightly squashed blob with a hard shadow. */
const drop = (cx, cy, r, fill) => {
  const path = (dx, dy) =>
    `M${cx + dx} ${cy - r + dy} C ${cx + r * 0.62 + dx} ${cy - r + dy} ${cx + r + dx} ${cy - r * 0.5 + dy} ${cx + r + dx} ${cy + r * 0.08 + dy} C ${cx + r + dx} ${cy + r * 0.62 + dy} ${cx + r * 0.6 + dx} ${cy + r * 0.98 + dy} ${cx + dx} ${cy + r * 0.98 + dy} C ${cx - r * 0.6 + dx} ${cy + r * 0.98 + dy} ${cx - r + dx} ${cy + r * 0.62 + dy} ${cx - r + dx} ${cy + r * 0.08 + dy} C ${cx - r + dx} ${cy - r * 0.5 + dy} ${cx - r * 0.62 + dx} ${cy - r + dy} ${cx + dx} ${cy - r + dy} Z`;
  return `<path d="${path(10, 12)}" fill="${INK}"/><path d="${path(0, 0)}" fill="${fill}" stroke="${INK}" stroke-width="8"/>`;
};

/** Pill label. */
const pill = (cx, y, text, fill = '#fff', size = 34) => {
  const w = text.length * size * 0.62 + 48;
  return `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${size + 26}" rx="${(size + 26) / 2}" fill="${fill}" stroke="${INK}" stroke-width="6"/>` +
    `<text x="${cx}" y="${y + size + 6}" text-anchor="middle" font-family="${display}" font-size="${size}" fill="${INK}">${text}</text>`;
};

/** Big tilted headline with a hard shadow. */
const headline = (x, y, text, size, fill = '#fff', rot = -4, anchor = 'start') =>
  `<g transform="rotate(${rot} ${x} ${y})">` +
  `<text x="${x + 7}" y="${y + 8}" text-anchor="${anchor}" font-family="${display}" font-size="${size}" fill="${INK}">${text}</text>` +
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${display}" font-size="${size}" fill="${fill}" stroke="${INK}" stroke-width="5" paint-order="stroke">${text}</text>` +
  `</g>`;

const dots = (fill = 'rgba(17,17,17,0.13)') =>
  `<defs><pattern id="d" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="2.4" fill="${fill}"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#d)"/>`;

const svg = (bg, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${bg}"/>${body}</svg>`;

const thumbs = {
  // Yellow + blue = green on a dotted board, the core of the game
  colors: svg(
    '#fff8e7',
    dots() +
      headline(70, 150, 'COLOR HUNTER', 104, '#9b5de5', -3) +
      drop(270, 400, 105, '#ffff14') +
      `<text x="440" y="430" text-anchor="middle" font-family="${display}" font-size="110" fill="${INK}">+</text>` +
      drop(610, 400, 105, '#0343df') +
      `<text x="790" y="430" text-anchor="middle" font-family="${display}" font-size="110" fill="${INK}">=</text>` +
      drop(970, 360, 125, '#39ad48') +
      pill(970, 505, 'medium green', '#fff', 34) +
      pill(250, 600, '927 COLOURS', '#ffa300', 32),
  ),

  // A wobbly painted Swiss flag next to the real one, with the score
  flag: svg(
    '#3ddc84',
    headline(60, 140, 'PAINT THE FLAG', 96, '#fff', -3) +
      `<g transform="translate(0 -22)">` +
      box(110, 230, 380, 380, '#ece7da') +
      `<polygon points="118,240 488,236 484,604 114,600" fill="#d52b1e"/>` +
      // brush streaks so it reads as painted by hand
      `<g stroke="#b8241a" stroke-width="14" stroke-linecap="round" opacity="0.55" fill="none">` +
      `<path d="M135 262 C 210 250 330 270 465 255"/><path d="M140 580 C 240 590 360 572 470 586"/>` +
      `<path d="M138 330 C 160 420 128 500 150 560"/><path d="M462 300 C 448 380 470 470 452 545"/></g>` +
      `<polygon points="270,290 318,296 312,384 432,378 438,436 316,444 322,556 262,560 258,446 150,452 152,390 262,384" fill="#fff"/>` +
      `<path d="M300 556 L 300 590 Q 300 602 292 602 Q 284 602 286 590 L 288 556 Z" fill="#fff"/>` +
      `<circle cx="398" cy="470" r="9" fill="#fff"/><circle cx="196" cy="350" r="6" fill="#fff"/>` +
      `<rect x="110" y="230" width="380" height="380" rx="22" fill="none" stroke="${INK}" stroke-width="8"/>` +
      box(790, 230, 380, 380, '#d52b1e') +
      `<rect x="${790 + 155}" y="${230 + 71}" width="71" height="238" fill="#fff"/>` +
      `<rect x="${790 + 71}" y="${230 + 155}" width="238" height="71" fill="#fff"/>` +
      `<text x="640" y="430" text-anchor="middle" font-family="${display}" font-size="120" fill="${INK}">vs</text>` +
      `<g transform="rotate(8 640 560)">${pill(640, 520, '74% accurate', '#ffa300', 40)}</g>` +
      `</g>`,
  ),

  // Huge timer, no clock in sight
  '10s': svg(
    '#4d8dff',
    dots('rgba(255,255,255,0.18)') +
      headline(70, 140, 'HOW LONG IS', 72, '#fff', -3) +
      box(150, 210, 980, 330, '#fff', 40) +
      `<text x="640" y="455" text-anchor="middle" font-family="${display}" font-size="230" fill="${INK}" letter-spacing="-8">10.00s</text>` +
      `<circle cx="1114" cy="204" r="92" fill="${INK}"/>` +
      `<circle cx="1100" cy="190" r="92" fill="#ff3b30" stroke="${INK}" stroke-width="8"/>` +
      `<text x="1100" y="206" text-anchor="middle" font-family="${display}" font-size="44" fill="#fff" stroke="${INK}" stroke-width="3" paint-order="stroke">STOP</text>` +
      pill(330, 590, 'no clock. just your gut.', '#ffa300', 34),
  ),

  // The big red button and a counter that never resets
  'the-button': svg(
    '#ff5da2',
    headline(60, 140, 'THE BUTTON', 104, '#fff', -3) +
      `<ellipse cx="640" cy="500" rx="270" ry="200" fill="${INK}"/>` +
      `<ellipse cx="640" cy="440" rx="260" ry="190" fill="#c81d14" stroke="${INK}" stroke-width="8"/>` +
      `<rect x="380" y="410" width="520" height="40" fill="#c81d14"/>` +
      `<ellipse cx="640" cy="410" rx="260" ry="190" fill="#ff3b30" stroke="${INK}" stroke-width="8"/>` +
      `<ellipse cx="560" cy="350" rx="90" ry="45" fill="rgba(255,255,255,0.35)"/>` +
      `<text x="640" y="440" text-anchor="middle" font-family="${display}" font-size="96" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke">PRESS</text>` +
      `<g transform="rotate(-6 1080 230)">${pill(1080, 200, 'never resets', '#ffa300', 34)}</g>`,
  ),
};

for (const [name, body] of Object.entries(thumbs)) {
  await sharp(Buffer.from(body)).png({ compressionLevel: 9 }).toFile(`${OUT}/${name}.png`);
  console.log(`wrote ${OUT}/${name}.png`);
}
