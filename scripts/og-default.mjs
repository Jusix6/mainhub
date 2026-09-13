// Generates the default social preview image (1200x630) at src/assets/og-default.png.
// Run with `npm run og` after changing name or tagline. Text is kept in sync with src/data/site.ts by hand.
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
    <rect x="0" y="0" width="960" height="420" rx="28" fill="#FFD23F" stroke="#111" stroke-width="8"/>
    <clipPath id="c"><rect x="4" y="4" width="952" height="412" rx="24"/></clipPath>
    <g clip-path="url(#c)">
      <rect x="820" y="-80" width="210" height="600" fill="#FF5DA2" stroke="#111" stroke-width="8" transform="rotate(14 925 220)"/>
    </g>
    <rect x="48" y="48" width="72" height="72" rx="14" fill="#fff" stroke="#111" stroke-width="7" transform="rotate(-8 84 84)"/>
    <path d="M84 60l6.9 15.6L108 78l-13 11.4 4 17.3L84 97.8l-15 8.9 4-17.3L60 78l17.1-2.4z" fill="#111" transform="rotate(-8 84 84)"/>
    <text x="48" y="292" font-family="Courier New, monospace" font-size="26" letter-spacing="3" fill="#111">${TAGLINE.toUpperCase()}</text>
    <text x="42" y="382" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="120" letter-spacing="-3" fill="#111">${NAME}</text>
  </g>
  <text x="600" y="590" text-anchor="middle" font-family="Courier New, monospace" font-size="24" letter-spacing="2" fill="#111">${SITE_TITLE} · ${LINE}</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('src/assets/og-default.png');
console.log('wrote src/assets/og-default.png');
