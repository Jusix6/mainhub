/**
 * Screenshots for update posts (src/content/updates), taken in a headless
 * Chrome over the DevTools protocol. One browser session runs a list of steps,
 * so a page can be prepared (clicks, keys, a game played for a while) before
 * each shot. Pictures ending in .webp are converted with sharp (quality 82,
 * optional crop), everything else is saved as PNG.
 *
 *   npm run shots -- <steps.json>
 *
 * steps.json (paths in "out" are relative to the project root):
 * {
 *   "url": "https://www.jxsi.ch/hub", "width": 1280, "height": 800,
 *   "steps": [
 *     { "wait": 1500, "out": "src/assets/updates/hub.webp" },
 *     { "nav": "https://www.jxsi.ch/", "js": "document.querySelector('.face--front').focus(); return 1;",
 *       "wait": 1200, "out": "src/assets/updates/card.webp", "crop": { "left": 260, "top": 150, "width": 770, "height": 510 } },
 *     { "width": 390, "height": 844, "nav": "https://www.jxsi.ch/", "wait": 1500, "out": "src/assets/updates/card-phone.webp" }
 *   ]
 * }
 *
 * "js" is the body of an async function run in the page: it may await and
 * return a value (printed). Local pages work too (http://localhost:4321/...);
 * there the dev hooks such as window.tinyIsland are available, remove the dev
 * toolbar first with document.querySelector('astro-dev-toolbar')?.remove().
 * Chrome is looked up in the usual Windows place, or set CHROME=<path>.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run shots -- <steps.json>');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(file, 'utf8'));
const CHROME =
  process.env.CHROME ??
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome not found, set CHROME=<path>');

const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', `--window-size=${cfg.width},${cfg.height}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = list.find((t) => t.type === 'page');
    } catch {
      // Chrome is still starting
    }
  }
  if (!target) throw new Error('Chrome did not start');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  let loads = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Page.loadEventFired') loads++;
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const size = (w, h) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  const go = async (url) => {
    const before = loads;
    await send('Page.navigate', { url });
    for (let i = 0; i < 150 && loads === before; i++) await sleep(100);
    await sleep(800);
  };

  await send('Page.enable');
  await size(cfg.width, cfg.height);
  await go(cfg.url);
  for (const s of cfg.steps) {
    if (s.width) await size(s.width, s.height);
    if (s.nav) await go(s.nav);
    if (s.js) {
      const res = await send('Runtime.evaluate', { expression: `(async () => { ${s.js} })()`, awaitPromise: true, returnByValue: true });
      if (res.error) console.error('cdp error', JSON.stringify(res.error).slice(0, 300));
      else if (res.result?.exceptionDetails) console.error('script error', JSON.stringify(res.result.exceptionDetails).slice(0, 500));
      else if (res.result?.result?.value !== undefined) console.log('script:', JSON.stringify(res.result.result.value).slice(0, 300));
    }
    if (s.wait) await sleep(s.wait);
    if (s.out) {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      const png = Buffer.from(shot.result.data, 'base64');
      mkdirSync(dirname(s.out), { recursive: true });
      if (s.out.endsWith('.webp')) {
        let img = sharp(png);
        if (s.crop) img = img.extract(s.crop);
        const info = await img.webp({ quality: 82 }).toFile(s.out);
        console.log('saved', s.out, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
      } else {
        writeFileSync(s.out, png);
        console.log('saved', s.out);
      }
    }
  }
  ws.close();
} finally {
  chrome.kill();
}
