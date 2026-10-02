/**
 * Cloudflare Worker in front of the static assets. Three jobs:
 *
 * 1. Redirects: apex and plain-http requests go to the canonical https host.
 * 2. Fun subdomain: fun.jxsi.ch serves the pages built under dist/fun/ at the
 *    root (fun.jxsi.ch/the-button → dist/fun/the-button.html). The hashed
 *    build assets (/_astro/*) are shared. www.jxsi.ch/fun/* redirects over.
 * 3. API for the fun games under /api/*, backed by a Durable Object so the
 *    counters are global, atomic and never reset.
 *
 * Everything else is handed straight to the static assets (dist/).
 */
import { DurableObject } from 'cloudflare:workers';

const CANONICAL_HOST = 'www.jxsi.ch';
const APEX_HOST = 'jxsi.ch';
const FUN_HOST = 'fun.jxsi.ch';
const FUN_PREFIX = '/fun';
const OUR_HOSTS = [CANONICAL_HOST, APEX_HOST, FUN_HOST];

/** Files at the site root that fun pages reference as well. */
const SHARED_ROOT_FILES = ['/favicon.svg', '/apple-touch-icon.png', '/robots.txt'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // `wrangler dev --var DEV:1` (npm run fun) talks plain http to a simulated host
    if (!env.DEV && url.protocol === 'http:' && OUR_HOSTS.includes(url.hostname)) {
      url.protocol = 'https:';
      if (url.hostname === APEX_HOST) url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }
    if (url.hostname === APEX_HOST) {
      url.hostname = CANONICAL_HOST;
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname.startsWith('/api/')) return handleApi(request, env, url);

    if (url.hostname === FUN_HOST) return serveFun(request, env, url);

    if (url.hostname === CANONICAL_HOST && (url.pathname === FUN_PREFIX || url.pathname.startsWith(FUN_PREFIX + '/'))) {
      url.protocol = 'https:';
      url.hostname = FUN_HOST;
      url.pathname = url.pathname.slice(FUN_PREFIX.length) || '/';
      return Response.redirect(url.toString(), 302);
    }

    return env.ASSETS.fetch(request);
  },
};

/** fun.jxsi.ch: map the root to the dist/fun/ pages, keep shared assets reachable. */
async function serveFun(request, env, url) {
  // Someone copied a www-style /fun/... path onto the fun host
  if (url.pathname === FUN_PREFIX || url.pathname.startsWith(FUN_PREFIX + '/')) {
    url.pathname = url.pathname.slice(FUN_PREFIX.length) || '/';
    return Response.redirect(url.toString(), 301);
  }
  if (url.pathname.startsWith('/_astro/') || SHARED_ROOT_FILES.includes(url.pathname)) {
    return env.ASSETS.fetch(request);
  }

  const assetUrl = new URL(url);
  // dist/fun.html is the index (build.format 'file'), served by the asset layer at /fun
  assetUrl.pathname = url.pathname === '/' ? FUN_PREFIX : FUN_PREFIX + url.pathname;
  const res = await env.ASSETS.fetch(new Request(assetUrl, request));

  // The asset layer may answer with a trailing-slash redirect; strip the prefix again.
  const location = res.headers.get('location');
  if (res.status >= 300 && res.status < 400 && location) {
    const target = new URL(location, url);
    if (target.pathname.startsWith(FUN_PREFIX)) target.pathname = target.pathname.slice(FUN_PREFIX.length) || '/';
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
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

async function handleApi(request, env, url) {
  const match = url.pathname.match(/^\/api\/the-button(?:\/(click))?$/);
  if (!match) return json({ error: 'not found' }, 404);

  const stub = env.THE_BUTTON.get(env.THE_BUTTON.idFromName('the-button'));

  if (request.method === 'GET' && !match[1]) {
    const player = url.searchParams.get('player') ?? '';
    return json(await stub.stats(PLAYER_ID.test(player) ? player : ''));
  }

  if (request.method === 'POST' && match[1] === 'click') {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad json' }, 400);
    }
    const player = typeof body?.player === 'string' ? body.player : '';
    if (!PLAYER_ID.test(player)) return json({ error: 'bad player' }, 400);
    const n = Math.max(0, Math.min(MAX_CLICKS_PER_REQUEST, Math.floor(Number(body.n) || 0)));
    return json(await stub.click(player, n, cleanName(body.name)));
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
