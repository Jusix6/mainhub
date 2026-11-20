/**
 * Share links for creative builds: the plan, compressed (deflate-raw) and
 * base64url, in the hash: https://www.jxsi.ch/#build=1<code>. The hash never
 * reaches the server. The first character says how it is packed: "1" =
 * compressed, "0" = plain JSON (browsers without CompressionStream).
 * Decoding is strictly limited (length, characters, unpacked size); the
 * result is raw and must still go through cleanPlan.
 */
import type { Plan } from './plan';

export const HASH = '#build=';
const MAX_CODE = 24000;
const MAX_JSON = 200_000;

export async function encodePlan(plan: Plan): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, tiles: plan.tiles }));
  if (typeof CompressionStream === 'undefined') return '0' + toB64(json);
  const packed = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
  return '1' + toB64(new Uint8Array(packed));
}

export async function decodePlan(code: string): Promise<unknown> {
  if (code.length < 2 || code.length > MAX_CODE || !/^[01][A-Za-z0-9_-]+$/.test(code)) throw new Error('bad code');
  let bytes = fromB64(code.slice(1));
  if (code[0] === '1') {
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_JSON) {
        void reader.cancel();
        throw new Error('too big');
      }
      parts.push(value);
    }
    bytes = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
      bytes.set(p, at);
      at += p.length;
    }
  } else if (bytes.length > MAX_JSON) throw new Error('too big');
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** The code from the current address, if it carries a build. */
export function codeFromHash(): string | null {
  return location.hash.startsWith(HASH) ? location.hash.slice(HASH.length) : null;
}

export const shareUrl = (code: string) => `${location.origin}/${HASH}${code}`;

function toB64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
