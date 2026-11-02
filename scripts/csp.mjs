// Post-build step (part of `npm run build`): fills the Content-Security-Policy in
// dist/_headers with the hashes of every inline <script> the build produced, so
// the policy can stay strict (`script-src 'self'` plus exactly those hashes) while
// Head.astro keeps its tiny inline bootstrap. Fails the build if an inline script
// shows up that nobody expected, which is the point: surprises are the risk.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const PLACEHOLDER = '__CSP_SCRIPT_HASHES__';
/** Inline scripts the build is allowed to contain, by a stable substring. */
const EXPECTED = ["localStorage.getItem('theme')"];

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const hashes = new Map();
const unexpected = [];
for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const [, attrs, body] = m;
    if (/\bsrc\s*=/i.test(attrs)) continue;
    if (/\btype\s*=\s*["']?application\/ld\+json/i.test(attrs)) continue; // data, never executed
    const hash = `'sha256-${createHash('sha256').update(body).digest('base64')}'`;
    if (!hashes.has(hash)) {
      hashes.set(hash, file);
      if (!EXPECTED.some((s) => body.includes(s))) unexpected.push(`${file}: ${body.trim().slice(0, 80)}`);
    }
  }
}

if (unexpected.length) {
  console.error('[csp] inline scripts the policy does not expect:\n  ' + unexpected.join('\n  '));
  console.error('[csp] Move them to a bundled <script>, or add a stable substring to EXPECTED in scripts/csp.mjs.');
  process.exit(1);
}

const headersPath = join(DIST, '_headers');
const headers = readFileSync(headersPath, 'utf8');
if (!headers.includes(PLACEHOLDER)) throw new Error(`[csp] ${PLACEHOLDER} missing in public/_headers`);
writeFileSync(headersPath, headers.replace(PLACEHOLDER, [...hashes.keys()].join(' ')));
console.log(`[csp] ${hashes.size} inline script hash(es) written to ${headersPath}`);
