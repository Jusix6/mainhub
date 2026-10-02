// Builds the logo assets from the master file: a square, trimmed src/assets/logo.png
// (transparent, used by the nav brand mark) and public/apple-touch-icon.png (180x180,
// opaque on the site background because iOS ignores transparency).
// Usage: node scripts/logo-icons.mjs "F:/JXSI LOGO.png"
import sharp from 'sharp';

const [source] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/logo-icons.mjs <logo.png>');

const BG = '#fff8e7'; // --bg from src/styles/tokens.css

const trimmed = await sharp(source).trim().toBuffer();
await sharp(trimmed)
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 })
  .toFile('src/assets/logo.png');
console.log('wrote src/assets/logo.png (512x512, transparent)');

await sharp(trimmed)
  .resize(148, 148, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: BG })
  .flatten({ background: BG })
  .png({ compressionLevel: 9 })
  .toFile('public/apple-touch-icon.png');
console.log('wrote public/apple-touch-icon.png (180x180)');
