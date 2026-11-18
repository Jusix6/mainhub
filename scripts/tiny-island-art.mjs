// Draws the social preview and the fun-list thumbnail of Tiny Island from a
// real island: the game's own world generator and tile painter
// (src/lib/tiny-island/world.ts + tiles.ts, bundled on the fly with esbuild),
// plus a title card in the site's neo-brutalist style.
//
//   node scripts/tiny-island-art.mjs [seed]
//
// Writes src/assets/fun/tiny-island-og.png (1200x630) and
// src/assets/fun/thumbs/tiny-island.png (1280x720). Fonts are system fonts
// (Arial Black), like the other image scripts.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import sharp from 'sharp';

const SEED = process.argv[2] ?? 'jusi';
const MAP_W = 1280;
const MAP_H = 800;
const INK = '#111';
const display = 'Arial Black, Arial, sans-serif';

// Bundle the game code (TypeScript, @/ imports) into a temporary module
const dir = mkdtempSync(join(tmpdir(), 'tiny-island-'));
const out = join(dir, 'art.mjs');
await build({
  stdin: {
    contents: `
      import { World, W, H } from './src/lib/tiny-island/world';
      import { paintTile } from './src/lib/tiny-island/tiles';
      export function paint(seed) {
        const w = new World();
        w.generate(seed);
        const buf = new Uint32Array(${MAP_W * MAP_H});
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(w, buf, x, y);
        return new Uint8Array(buf.buffer);
      }`,
    resolveDir: resolve('.'),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  alias: { '@': resolve('src') },
  logLevel: 'error',
});
const { paint } = await import(pathToFileURL(out).href);
const raw = Buffer.from(paint(SEED));
rmSync(dir, { recursive: true, force: true });

const island = sharp(raw, { raw: { width: MAP_W, height: MAP_H, channels: 4 } });

/** Title card with a hard shadow, the FUN sticker and a tagline. */
function card(x, y, w, title, tagline, size) {
  const h = size * 2.6;
  return (
    `<rect x="${x + 14}" y="${y + 14}" width="${w}" height="${h}" rx="22" fill="${INK}"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="#fff8e7" stroke="${INK}" stroke-width="8"/>` +
    `<g transform="rotate(-5 ${x + 40} ${y - 6})"><rect x="${x + 28}" y="${y - 30}" width="120" height="52" rx="10" fill="#ff5da2" stroke="${INK}" stroke-width="6"/>` +
    `<text x="${x + 88}" y="${y + 8}" text-anchor="middle" font-family="${display}" font-size="30" fill="${INK}">FUN</text></g>` +
    `<text x="${x + 34}" y="${y + size * 1.35}" font-family="${display}" font-size="${size}" fill="${INK}">${title}</text>` +
    `<text x="${x + 36}" y="${y + size * 2.1}" font-family="Arial, sans-serif" font-weight="700" font-size="${size * 0.36}" fill="#444">${tagline}</text>`
  );
}

// Social preview: the island at 1:1, a little zoomed, with the card bottom left
const og = await island
  .clone()
  .extract({ left: 80, top: 50, width: 1120, height: 588 })
  .resize(1200, 630, { kernel: 'nearest' })
  .png()
  .toBuffer();
await sharp(og)
  .composite([{ input: Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">${card(40, 430, 640, 'Tiny Island', 'Shape an island. Watch it live.', 78)}</svg>`) }])
  .png()
  .toFile('src/assets/fun/tiny-island-og.png');

// Thumbnail: closer in, so the pixel trees and mountains show
const thumb = await island
  .clone()
  .extract({ left: 260, top: 150, width: 760, height: 428 })
  .resize(1280, 720, { kernel: 'nearest' })
  .png()
  .toBuffer();
await sharp(thumb)
  .composite([{ input: Buffer.from(`<svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">${card(48, 520, 600, 'Tiny Island', 'Watch it live.', 74)}</svg>`) }])
  .png()
  .toFile('src/assets/fun/thumbs/tiny-island.png');

console.log(`wrote tiny-island-og.png and thumbs/tiny-island.png (seed ${SEED})`);
