// Builds a 1600x1000 project cover from a square app icon:
// icon with iOS-style rounded corners and a soft shadow, centered on a gradient.
// Usage: node scripts/cover-from-icon.mjs <slug> <fromColor> <toColor>
//   e.g. node scripts/cover-from-icon.mjs forgot "#3d12a5" "#1b0540"
// Expects src/assets/projects/<slug>/icon.png, writes cover.png next to it.
import sharp from 'sharp';

const [slug, from = '#3d12a5', to = '#1b0540'] = process.argv.slice(2);
if (!slug) throw new Error('Usage: node scripts/cover-from-icon.mjs <slug> [fromColor] [toColor]');

const W = 1600;
const H = 1000;
const SIZE = 640;
const RADIUS = Math.round(SIZE * 0.2237); // Apple's icon corner ratio
const dir = `src/assets/projects/${slug}`;

const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="28"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="${(W - SIZE) / 2}" y="${(H - SIZE) / 2 + 36}" width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="#000" opacity="0.45" filter="url(#blur)"/>
</svg>`);

const mask = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" fill="#fff"/>
</svg>`);

const icon = await sharp(`${dir}/icon.png`)
  .resize(SIZE, SIZE, { fit: 'cover' })
  .composite([{ input: mask, blend: 'dest-in' }])
  .png()
  .toBuffer();

await sharp(background)
  .composite([{ input: icon, left: (W - SIZE) / 2, top: (H - SIZE) / 2 }])
  .png({ compressionLevel: 9 })
  .toFile(`${dir}/cover.png`);

console.log(`wrote ${dir}/cover.png`);
