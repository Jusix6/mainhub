/**
 * Low-quality image placeholder: a ~24px wide, blurred WebP of a local image as a
 * data URI (~500 bytes). Used as CSS background behind covers so nothing flashes
 * while the full-size image loads or a view transition morphs.
 * Runs at build time only (sharp), results are cached per source file.
 */
import sharp from 'sharp';
import type { ImageMetadata } from 'astro';

const cache = new Map<string, Promise<string>>();

export function lqip(image: ImageMetadata): Promise<string> {
  // fsPath is set on ESM-imported images at build time but not part of the public type.
  const path = (image as ImageMetadata & { fsPath?: string }).fsPath;
  if (!path) return Promise.resolve('');
  let p = cache.get(path);
  if (!p) {
    p = sharp(path)
      .resize(24, 15, { fit: 'cover' })
      .blur(1.2)
      .webp({ quality: 40, alphaQuality: 40 })
      .toBuffer()
      .then((buf) => `data:image/webp;base64,${buf.toString('base64')}`)
      .catch(() => '');
    cache.set(path, p);
  }
  return p;
}
