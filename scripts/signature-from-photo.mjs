// Extracts a pen signature from a photo: ink becomes solid black, paper becomes transparent,
// the result is trimmed to the ink and saved as src/assets/signature.png.
// Usage: node scripts/signature-from-photo.mjs <photo> [threshold 0-255, default 120]
import sharp from 'sharp';

const [input, thresholdArg] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/signature-from-photo.mjs <photo> [threshold]');
const threshold = Number(thresholdArg ?? 120);

// Grayscale, flatten lighting, then threshold: dark pixels → 255 (ink), light → 0
const { data, info } = await sharp(input)
  .rotate()
  .grayscale()
  .normalise()
  // median filter kills paper grain and dust specks, pen strokes are much wider
  .median(9)
  .threshold(threshold)
  .negate()
  .raw()
  .toBuffer({ resolveWithObject: true });

// Build an RGBA image: black everywhere, alpha = ink mask
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0, j = 0; i < data.length; i++, j += 4) {
  rgba[j] = 17;
  rgba[j + 1] = 17;
  rgba[j + 2] = 17;
  rgba[j + 3] = data[i];
}

const out = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .trim({ threshold: 10 })
  .resize({ width: 1200, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toFile('src/assets/signature.png');

console.log(`wrote src/assets/signature.png ${out.width}x${out.height}`);
