/**
 * Cloudflare Worker in front of the static assets. Three jobs:
 *
 * 1. Redirects: apex and plain-http requests go to the canonical https host.
 * 2. Subdomains: fun.jxsi.ch serves the pages built under dist/fun/ at the
 *    root (fun.jxsi.ch/the-button → dist/fun/the-button.html), library.jxsi.ch
 *    the ones under dist/library/. The hashed build assets (/_astro/*) are
 *    shared. www.jxsi.ch/fun/* and /library/* redirect over.
 * 3. API for the fun games under /api/*, backed by a Durable Object so the
 *    counters are global, atomic and never reset.
 * 4. YouTube: a cron trigger reads the channel feed (latest video) and the
 *    channel pages (video count) every 30 minutes into the VideoFeed Durable
 *    Object; pages with the video block or the business card get the fresher
 *    values swapped into their HTML.
 *
 * Everything else is handed straight to the static assets (dist/).
 *
 * Hardening (see CLAUDE.md "Sicherheit"): the API only accepts POSTs from our
 * own origins, with a JSON content type and a tiny body, and throttles per IP.
 * The Durable Object caps the number of player rows so storage cannot be
 * flooded with random ids. Everything user-provided is validated here before
 * it reaches the object.
 */
import { DurableObject } from 'cloudflare:workers';
import VIDEO_COUNT from './src/data/video-count.json';
import { fetchVideoSum } from './src/lib/video-count.mjs';

const CANONICAL_HOST = 'www.jxsi.ch';
const APEX_HOST = 'jxsi.ch';
const FUN_HOST = 'fun.jxsi.ch';
const LIBRARY_HOST = 'library.jxsi.ch';
/** Subdomain → folder of its pages in dist/ (src/pages/<folder>/). */
const SUBSITES = { [FUN_HOST]: '/fun', [LIBRARY_HOST]: '/library' };
const OUR_HOSTS = [CANONICAL_HOST, APEX_HOST, FUN_HOST, LIBRARY_HOST];
const OUR_ORIGINS = [`https://${CANONICAL_HOST}`, `https://${FUN_HOST}`];

/** Short links on www and the apex that point at a fun game (jxsi.ch/10s → fun.jxsi.ch/10s). */
const FUN_SHORT_LINKS = { '/10s': '/10s', '/flag': '/flag', '/colors': '/colors', '/tiny-island': '/tiny-island', '/face-witness': '/face-witness', '/2-many-notes': '/2-many-notes' };

/** Main YouTube channel. Keep in sync with SITE.youtube.channelId in src/data/site.ts. */
const YOUTUBE_CHANNEL_ID = 'UCWHDPzJa99zS3XHaetPjdig';
/** Pages with the latest-video block and/or the business card ("Videos" stat). */
const VIDEO_PAGES = ['/', '/card', '/hub', '/creative/tiles'];
/** Older than this, a page request also triggers a refresh (in case the cron missed runs). */
const VIDEO_STALE_MS = 2 * 60 * 60 * 1000;
/** At most one feed request per this interval, whoever asks. */
const VIDEO_MIN_FETCH_MS = 10 * 60 * 1000;

/** Files at the site root that fun pages reference as well. */
const SHARED_ROOT_FILES = ['/favicon.svg', '/apple-touch-icon.png', '/robots.txt'];

export default {
  /** Cron trigger (wrangler.jsonc "triggers"): keep the latest video fresh. */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(refreshVideo(env, true));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // `wrangler dev --var DEV:1` (npm run fun) talks plain http to a simulated host
    if (!env.DEV && url.protocol === 'http:' && OUR_HOSTS.includes(url.hostname)) {
      url.protocol = 'https:';
      if (url.hostname === APEX_HOST) url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    const shortPath = url.pathname.replace(/\/+$/, '') || '/';
    if ((url.hostname === APEX_HOST || url.hostname === CANONICAL_HOST) && FUN_SHORT_LINKS[shortPath]) {
      url.protocol = 'https:';
      url.hostname = FUN_HOST;
      url.pathname = FUN_SHORT_LINKS[shortPath];
      return Response.redirect(url.toString(), 302);
    }
    if (url.hostname === APEX_HOST) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);

    if (SUBSITES[url.hostname]) return serveSubsite(request, env, url, SUBSITES[url.hostname]);

    // www.jxsi.ch/fun/x → fun.jxsi.ch/x, www.jxsi.ch/library → library.jxsi.ch
    if (url.hostname === CANONICAL_HOST) {
      for (const [host, prefix] of Object.entries(SUBSITES)) {
        if (url.pathname !== prefix && !url.pathname.startsWith(prefix + '/')) continue;
        url.protocol = 'https:';
        url.hostname = host;
        url.pathname = url.pathname.slice(prefix.length) || '/';
        return Response.redirect(url.toString(), 302);
      }
    }

    if (url.hostname === CANONICAL_HOST && request.method === 'GET' && VIDEO_PAGES.includes(url.pathname)) {
      return withLatestVideo(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

/* ---------------------------------------------------------------------------
 * Latest YouTube video
 * ------------------------------------------------------------------------- */

const feedStub = (env) => env.VIDEO_FEED.get(env.VIDEO_FEED.idFromName('youtube'));

function decodeXml(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/** First <entry> of a channel feed, same rules as src/lib/youtube.ts. */
function parseFeed(xml) {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;
  const pick = (tag) => entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim();
  const id = pick('yt:videoId');
  const title = pick('title');
  const published = pick('published');
  if (!id || !/^[\w-]{11}$/.test(id) || !title || !published || Number.isNaN(Date.parse(published))) return null;
  return { id, title: decodeXml(title), published: new Date(published).toISOString() };
}

/** Reads the channel feed into the VideoFeed object. Never throws. */
async function refreshVideo(env, force = false) {
  try {
    const stub = feedStub(env);
    if (!(await stub.claim(force ? 0 : VIDEO_MIN_FETCH_MS))) return;
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`, {
      headers: { accept: 'application/atom+xml, application/xml;q=0.9' },
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    const video = parseFeed(await res.text());
    if (!video) throw new Error('feed had no usable entry');
    await stub.set({ ...video, checkedAt: Date.now() });
  } catch (err) {
    console.warn('[video] refresh failed:', err?.message ?? err);
  }
  try {
    const sum = await fetchVideoSum(VIDEO_COUNT.channels);
    if (sum === null) throw new Error('a channel page could not be read');
    await feedStub(env).setCount(VIDEO_COUNT.offset + sum);
  } catch (err) {
    console.warn('[video] count failed:', err?.message ?? err);
  }
}

const videoDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Serves a page with the newest known upload in its video block. The build
 * bakes in whatever was latest then; if the feed has something newer, the
 * block is rewritten on the fly. Thumbnails of swapped-in videos come straight
 * from i.ytimg.com (allowed in the CSP), the rest of the page stays static.
 */
async function withLatestVideo(request, env, ctx) {
  // No conditional requests: the HTML may change without a rebuild
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const res = await env.ASSETS.fetch(new Request(request, { headers }));
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return res;

  let video = null;
  let count = null;
  try {
    const stub = feedStub(env);
    [video, count] = await Promise.all([stub.get(), stub.getCount()]);
    if (!video || Date.now() - video.checkedAt > VIDEO_STALE_MS) ctx.waitUntil(refreshVideo(env));
  } catch (err) {
    console.warn('[video] store unavailable:', err?.message ?? err);
  }

  const out = new Response(res.body, res);
  out.headers.delete('etag');
  out.headers.set('cache-control', 'public, max-age=0, must-revalidate');
  if (!video && count === null) return out;

  const thumb = video ? `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` : '';
  const when = video ? new Date(video.published) : new Date(0);
  let swap = false;
  return new HTMLRewriter()
    .on('[data-stat="videos"] [data-stat-value]', {
      element(el) {
        // Latest count from the cron (it can also go down, e.g. after deleting a video)
        if (typeof count === 'number') el.setInnerContent(String(count));
      },
    })
    .on('[data-video]', {
      element(el) {
        if (!video) return;
        const builtId = el.getAttribute('data-video-id');
        const builtAt = Date.parse(el.getAttribute('data-video-published') ?? '') || 0;
        // Only replace with something newer than the build already knew about
        swap = builtId !== video.id && when.getTime() > builtAt;
        if (!swap) return;
        el.setAttribute('data-video-id', video.id);
        el.setAttribute('data-video-published', video.published);
      },
    })
    .on('[data-video] [data-video-play]', {
      element(el) {
        if (swap) el.setAttribute('aria-label', `Play: ${video.title}`);
      },
    })
    .on('[data-video] img', {
      element(el) {
        if (!swap) return;
        el.setAttribute('src', thumb);
        el.removeAttribute('srcset');
        el.removeAttribute('sizes');
      },
    })
    .on('[data-video] .video__title', {
      element(el) {
        if (!swap) return;
        el.setAttribute('href', `https://www.youtube.com/watch?v=${video.id}`);
        el.setInnerContent(video.title);
      },
    })
    .on('[data-video] time', {
      element(el) {
        if (!swap) return;
        el.setAttribute('datetime', video.published.slice(0, 10));
        el.setInnerContent(videoDate.format(when));
      },
    })
    .transform(out);
}

export class VideoFeed extends DurableObject {
  /** The newest upload seen in the feed: { id, title, published, checkedAt } or null. */
  async get() {
    return (await this.ctx.storage.get('latest')) ?? null;
  }

  async set(video) {
    await this.ctx.storage.put('latest', video);
  }

  /** The "Videos" stat for the business card (offset already added), or null. */
  async getCount() {
    return (await this.ctx.storage.get('count')) ?? null;
  }

  async setCount(n) {
    await this.ctx.storage.put('count', n);
  }

  /** True if a feed request may go out now; records the attempt. */
  async claim(minMs) {
    const last = (await this.ctx.storage.get('attempt')) ?? 0;
    if (Date.now() - last < minMs) return false;
    await this.ctx.storage.put('attempt', Date.now());
    return true;
  }
}

/** A subdomain: map its root to the dist/<prefix>/ pages, keep shared assets reachable. */
async function serveSubsite(request, env, url, prefix) {
  // Someone copied a www-style /fun/... path onto the subdomain
  if (url.pathname === prefix || url.pathname.startsWith(prefix + '/')) {
    url.pathname = url.pathname.slice(prefix.length) || '/';
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/_astro/') || SHARED_ROOT_FILES.includes(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  const assetUrl = new URL(url);
  // dist/fun.html is the index (build.format 'file'), served by the asset layer at /fun
  assetUrl.pathname = url.pathname === '/' ? prefix : prefix + url.pathname;
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));

  // The asset layer may answer with a trailing-slash redirect; strip the prefix again.
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    const target = new URL(location, url);
    if (target.pathname.startsWith(prefix)) target.pathname = target.pathname.slice(prefix.length) || '/';
    return Response.redirect(target.toString(), res.status);
  }
  return res;
}

/* ---------------------------------------------------------------------------
 * API
 * ------------------------------------------------------------------------- */

const PLAYER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLICKS_PER_REQUEST = 50;
const MAX_NAME_LENGTH = 16;
/** A click request is `{player, n, name?}`: a few dozen bytes. Anything bigger is not ours. */
const MAX_BODY_BYTES = 512;
/** Per-IP throttle (per isolate, so a soft limit). The client sends at most ~3 requests/s while clicking. */
const RATE_LIMIT = 240;
const RATE_WINDOW_MS = 60_000;
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const API_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-robots-tag': 'noindex',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: API_HEADERS });
}

/** Display names are shown to everyone: short, printable, no markup tricks. */
function cleanName(value) {
  if (typeof value !== 'string') return undefined;
  const name = value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name;
}

/**
 * Only pages we serve may write. Browsers always send Origin on POST and
 * sendBeacon. In `wrangler dev` the proxy rewrites Origin to the simulated
 * host over plain http, so DEV also accepts our hosts without https.
 */
function allowedOrigin(request, env) {
  const origin = request.headers.get('origin') ?? '';
  if (OUR_ORIGINS.includes(origin)) return true;
  if (!env.DEV) return false;
  if (DEV_ORIGIN.test(origin)) return true;
  try {
    return OUR_HOSTS.includes(new URL(origin).hostname);
  } catch {
    return false;
  }
}

const hits = new Map();
let lastSweep = 0;

/** Sliding one-minute counter per client IP. Memory is bounded by sweeping old entries. */
function throttled(request) {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const now = Date.now();
  if (now - lastSweep > RATE_WINDOW_MS) {
    for (const [key, entry] of hits) if (now - entry.start > RATE_WINDOW_MS) hits.delete(key);
    lastSweep = now;
  }
  const entry = hits.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

async function handleApi(request, env, url) {
  const match = url.pathname.match(/^\/api\/the-button(?:\/(click))?$/);
  if (!match) return json({ error: 'not found' }, 404);
  if (throttled(request)) return json({ error: 'too many requests' }, 429);

  const stub = env.THE_BUTTON.get(env.THE_BUTTON.idFromName('the-button'));

  if (request.method === 'GET' && !match[1]) {
    const player = url.searchParams.get('player') ?? '';
    return json(await stub.stats(PLAYER_ID.test(player) ? player : ''));
  }

  if (request.method === 'POST' && match[1] === 'click') {
    if (!allowedOrigin(request, env)) return json({ error: 'forbidden' }, 403);
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return json({ error: 'unsupported media type' }, 415);
    }
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413);
    let body;
    try {
      const text = await request.text();
      if (text.length > MAX_BODY_BYTES) return json({ error: 'payload too large' }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'bad json' }, 400);
    const player = typeof body.player === 'string' ? body.player : '';
    if (!PLAYER_ID.test(player)) return json({ error: 'bad player' }, 400);
    const n = Math.max(0, Math.min(MAX_CLICKS_PER_REQUEST, Math.floor(Number(body.n) || 0)));
    return json(await stub.click(player.toLowerCase(), n, cleanName(body.name)));
  }

  return json({ error: 'method not allowed' }, 405);
}

/* ---------------------------------------------------------------------------
 * The Button: one Durable Object holds every click ever made.
 * ------------------------------------------------------------------------- */

/** Clicks closer together than this count as one streak. */
const STREAK_GAP_MS = 2500;
/** Sustained click rate accepted per player: one click per this many ms, plus a small burst. */
const MIN_MS_PER_CLICK = 40;
const BURST_ALLOWANCE = 5;
const LEADERBOARD_SIZE = 5;
/** Storage guard: beyond this many player rows, unknown ids are counted nowhere. */
const MAX_PLAYERS = 100_000;

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' });

export class TheButton extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT '',
        clicks INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        best_streak INTEGER NOT NULL DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS players_clicks ON players (clicks DESC);
      CREATE INDEX IF NOT EXISTS players_best_streak ON players (best_streak DESC);
      CREATE TABLE IF NOT EXISTS daily (
        day TEXT PRIMARY KEY,
        clicks INTEGER NOT NULL DEFAULT 0
      );
    `);
  }

  /** Current numbers, plus the calling player's own if known. */
  stats(player) {
    return this.snapshot(player, 0);
  }

  /**
   * Adds up to `n` clicks for a player (the client batches a few hundred ms of
   * clicking into one request). Returns the fresh numbers. `n` may be 0 to only
   * set the name.
   */
  click(player, n, name) {
    const now = Date.now();
    let row = this.sql.exec('SELECT * FROM players WHERE id = ?', player).toArray()[0];
    if (!row) {
      const count = this.sql.exec('SELECT COUNT(*) AS c FROM players').one().c;
      if (count >= MAX_PLAYERS) return this.snapshot('', 0);
      this.sql.exec('INSERT INTO players (id, first_seen, last_seen) VALUES (?, ?, ?)', player, now, 0);
      row = { clicks: 0, streak: 0, best_streak: 0, last_seen: 0 };
    }

    const elapsed = now - row.last_seen;
    // Autoclicker guard: more than a human can do is quietly dropped, not banned.
    const accepted = Math.max(0, Math.min(n, Math.floor(elapsed / MIN_MS_PER_CLICK) + BURST_ALLOWANCE));

    if (accepted > 0) {
      const streak = elapsed <= STREAK_GAP_MS ? row.streak + accepted : accepted;
      this.sql.exec(
        'UPDATE players SET clicks = clicks + ?, streak = ?, best_streak = MAX(best_streak, ?), last_seen = ? WHERE id = ?',
        accepted,
        streak,
        streak,
        now,
        player,
      );
      this.sql.exec(
        'INSERT INTO daily (day, clicks) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET clicks = clicks + excluded.clicks',
        dayFormat.format(now),
        accepted,
      );
    }
    if (name !== undefined) {
      this.sql.exec('UPDATE players SET name = ? WHERE id = ?', name, player);
    }
    return this.snapshot(player, accepted);
  }

  snapshot(player, accepted) {
    const totals = this.sql.exec('SELECT COALESCE(SUM(clicks), 0) AS total, COUNT(*) AS players FROM players WHERE clicks > 0').one();
    const today = this.sql.exec('SELECT clicks FROM daily WHERE day = ?', dayFormat.format(Date.now())).toArray()[0]?.clicks ?? 0;
    const record = this.sql.exec('SELECT name, best_streak FROM players WHERE best_streak > 0 ORDER BY best_streak DESC, last_seen ASC LIMIT 1').toArray()[0];
    const top = this.sql
      .exec(`SELECT name, clicks FROM players WHERE clicks > 0 ORDER BY clicks DESC, last_seen ASC LIMIT ${LEADERBOARD_SIZE}`)
      .toArray()
      .map((r) => ({ name: r.name, clicks: r.clicks }));
    const you = player ? this.sql.exec('SELECT name, clicks, best_streak FROM players WHERE id = ?', player).toArray()[0] : undefined;
    const rank = you?.clicks > 0 ? this.sql.exec('SELECT COUNT(*) + 1 AS rank FROM players WHERE clicks > ?', you.clicks).one().rank : null;

    return {
      total: totals.total,
      players: totals.players,
      today,
      record: record ? { name: record.name, streak: record.best_streak } : null,
      top,
      you: { name: you?.name ?? '', clicks: you?.clicks ?? 0, best: you?.best_streak ?? 0, rank },
      accepted,
    };
  }
}
