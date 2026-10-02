// Generates the default social preview image (1200x630) at src/assets/og-default.png.
// Run with `npm run og` after changing name or tagline. Text is kept in sync with src/data/site.ts by hand.
// The logo (src/assets/logo.png, from scripts/logo-icons.mjs) is composited onto the card.
import sharp from 'sharp';

const NAME = 'Jusi';
const TAGLINE = 'Creative from Switzerland';
const SITE_TITLE = 'MAINHUB';
const LINE = 'Apps · Games · Music · Videos · Digital Products · Experiments';

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#FFF8E7"/>
  <!-- card -->
  <g transform="translate(120 105) rotate(-2 480 210)">
    <rect x="12" y="12" width="960" height="420" rx="28" fill="#111"/>
    <rect x="0" y="0" width="960" height="420" rx="28" fill="#FFA300" stroke="#111" stroke-width="8"/>
    <clipPath id="c"><rect x="4" y="4" width="952" height="412" rx="24"/></clipPath>
    <g clip-path="url(#c)">
      <rect x="820" y="-80" width="210" height="600" fill="#FF5DA2" stroke="#111" stroke-width="8" transform="rotate(14 925 220)"/>
    </g>
    <text x="48" y="292" font-family="Courier New, monospace" font-size="26" letter-spacing="3" fill="#111">${TAGLINE.toUpperCase()}</text>
    <text x="42" y="382" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="120" letter-spacing="-3" fill="#111">${NAME}</text>
  </g>
  <text x="600" y="590" text-anchor="middle" font-family="Courier New, monospace" font-size="24" letter-spacing="2" fill="#111">${SITE_TITLE} · ${LINE}</text>
</svg>`;

// Logo top-left on the card, slightly tilted like the nav mark, with a hard shadow
const LOGO = 96;
const logo = await sharp('src/assets/logo.png').resize(LOGO, LOGO).toBuffer();
const shadow = await sharp(logo)
  .composite([{ input: Buffer.from([17, 17, 17, 255]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'in' }])
  .toBuffer();
const tilt = (buf) => sharp(buf).rotate(-8, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

await sharp(Buffer.from(svg))
  .composite([
    { input: await tilt(shadow), left: 170, top: 152 },
    { input: await tilt(logo), left: 164, top: 146 },
  ])
  .png({ compressionLevel: 9 })
  .toFile('src/assets/og-default.png');
console.log('wrote src/assets/og-default.png');
