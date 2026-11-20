/**
 * Card game 01: Card Breaker, a brick breaker whose bricks are tiny copies
 * of the business card. Clicking the "01" of JXSI-CH-01 on the card page
 * starts it (CardGames.astro); the big card falls apart into a wall of small
 * ones that fly into place.
 *
 * - Paddle: mouse or finger anywhere on the screen, or ← → (A D)
 * - Launch: click, tap, space or enter; P pauses, Esc (or ×) ends the game
 * - Three lives; every cleared wall is a new level with one more row and a
 *   slightly faster ball. Higher rows are worth more. The best score is kept
 *   in localStorage (`jxsi_cardbreaker_best`).
 * - From the second wall on, broken cards now and then drop an item (14 %);
 *   catch it with the paddle: more balls (+2), a wider paddle (15 s), TNT
 *   (the next card hit blows up its neighbours), a life back (up to 5), slow
 *   balls (8 s), every ball doubled (up to 12 balls), a strong ball that goes
 *   right through cards (7 s), a big ball (8 s). A life is only lost when the
 *   last ball is gone.
 * - Reduced motion: no fly-in and no flying pieces, the game itself stays.
 *
 * All drawing is on one canvas; the mini cards are rendered once per row
 * colour into small offscreen canvases.
 */

export interface BreakoutStrings {
  score: string;
  lives: string;
  best: string;
  level: string;
  launch: string;
  paused: string;
  over: string;
  again: string;
  cleared: string;
  items: Record<ItemKind, string>;
}

export interface BreakoutOptions {
  canvas: HTMLCanvasElement;
  strings: BreakoutStrings;
  /** The portrait for the little cards. */
  portrait: string;
  /** Where the big card was on screen: the little ones fly out of it. */
  from?: DOMRect;
  reducedMotion: boolean;
  /** Called when the player leaves (Esc). */
  onExit: () => void;
}

interface Brick {
  x: number;
  y: number;
  row: number;
  col: number;
  alive: boolean;
  /** Time it was hit (for the shrink), and where it starts flying from. */
  hitAt: number;
  sx: number;
  sy: number;
  delay: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  born: number;
}

export type ItemKind = 'multi' | 'wide' | 'tnt' | 'life' | 'slow' | 'double' | 'strong' | 'big';

interface Item {
  kind: ItemKind;
  x: number;
  y: number;
}

type State = 'intro' | 'serve' | 'play' | 'paused' | 'over' | 'cleared';

const BEST_KEY = 'jxsi_cardbreaker_best';
/** Row tints, top to bottom (the site's colours). */
const ROW_COLORS = ['#ff5da2', '#ff5a1f', '#ffa300', '#3ddc84', '#4d8dff', '#9b5de5', '#ff5da2', '#ffa300'];
const INK = '#111111';
const FLY_MS = 900;

/** The items: how they look (a capsule with a symbol) and how long they last (ms, 0 = at once). */
const ITEMS: Record<ItemKind, { label: string; color: string; ms: number; weight: number }> = {
  multi: { label: '+2', color: '#4d8dff', ms: 0, weight: 3 },
  wide: { label: '⟷', color: '#ffa300', ms: 15000, weight: 3 },
  tnt: { label: 'TNT', color: '#e8344a', ms: 0, weight: 2 },
  life: { label: '♥', color: '#ff5da2', ms: 0, weight: 1 },
  slow: { label: '◔', color: '#9fd3ff', ms: 8000, weight: 2 },
  double: { label: '×2', color: '#9b5de5', ms: 0, weight: 2 },
  strong: { label: '⚡', color: '#ff5a1f', ms: 7000, weight: 2 },
  big: { label: '●', color: '#3ddc84', ms: 8000, weight: 2 },
};
const ITEM_CHANCE = 0.14;
const MAX_BALLS = 12;
const MAX_LIVES = 5;

/** Starts the game; returns a function that stops it and cleans up. */
export function startBreakout(o: BreakoutOptions): () => void {
  const { canvas, strings: S } = o;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const fontMono = css.getPropertyValue('--font-mono').trim() || 'monospace';
  const fontDisplay = css.getPropertyValue('--font-display').trim() || 'sans-serif';
  const bg = css.getPropertyValue('--bg').trim() || '#fff8e7';

  let dpr = 1;
  let W = 0;
  let H = 0;
  let level = 1;
  let score = 0;
  let lives = 3;
  let best = readBest();
  let bricks: Brick[] = [];
  let pieces: Piece[] = [];
  let items: Item[] = [];
  let balls: Ball[] = [];
  let bw = 0;
  let bh = 0;
  let sprites: HTMLCanvasElement[] = [];
  let state = 'intro' as State;
  let stateAt = performance.now();
  let raf = 0;
  let last = performance.now();
  const paddle = { x: 0, w: 120, base: 120, h: 14, y: 0, target: 0 };
  let baseR = 7;
  let speed = 0;
  let hits = 0;
  /** Effects running until (game time, ms; paused time does not count). */
  const until: Partial<Record<ItemKind, number>> = {};
  let clock = 0;
  let tnt = false;
  /** The name of the item just caught, shown for a moment. */
  let banner: { text: string; at: number } | null = null;
  const keys = { left: false, right: false };

  const photo = new Image();
  photo.src = o.portrait;
  photo.onload = () => {
    sprites = [];
  };

  const active = (k: ItemKind) => (until[k] ?? 0) > clock;
  const ballR = () => baseR * (active('big') ? 2 : 1);
  const ballSpeed = () => speed * (active('slow') ? 0.5 : 1);

  /* ---- layout -------------------------------------------------------------------------- */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    paddle.base = Math.max(80, Math.min(170, W * 0.15));
    paddle.w = paddle.base * (active('wide') ? 1.5 : 1);
    paddle.y = H - Math.max(36, H * 0.07);
    paddle.x = Math.min(Math.max(paddle.x || W / 2, paddle.w / 2), W - paddle.w / 2);
    paddle.target = paddle.x;
    baseR = Math.max(5, Math.min(8, W / 140));
    layoutBricks(false);
  }

  /** The wall: as many columns as fit (5 to 10), rows by level. A wall already standing keeps its columns when the window changes size. */
  let wallCols = 0;
  function layoutBricks(fresh: boolean) {
    if (fresh || !bricks.length) wallCols = Math.max(5, Math.min(10, Math.floor(W / 115)));
    const cols = wallCols;
    const rows = fresh || !bricks.length ? Math.min(8, 4 + level) : Math.max(...bricks.map((b) => b.row)) + 1;
    const side = Math.max(12, W * 0.04);
    const gap = Math.max(5, W / 160);
    bw = (W - side * 2 - gap * (cols - 1)) / cols;
    bh = (bw * 55) / 85;
    // Leave room under the wall on short screens
    const maxH = H * (W < 560 ? 0.36 : 0.42);
    if (rows * (bh + gap) > maxH) {
      bh = maxH / rows - gap;
      bw = (bh * 85) / 55;
    }
    const total = cols * bw + (cols - 1) * gap;
    const x0 = (W - total) / 2;
    // Below the score line(s) and the row of running effects
    const y0 = Math.max(W < 560 ? 124 : 96, H * 0.1);
    if (fresh || !bricks.length) {
      const from = o.from;
      bricks = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          bricks.push({
            x: x0 + c * (bw + gap),
            y: y0 + r * (bh + gap),
            row: r,
            col: c,
            alive: true,
            hitAt: 0,
            // Out of the big card, in a ripple
            sx: from ? from.left + ((c + 0.5) / cols) * from.width - bw / 2 : W / 2,
            sy: from ? from.top + ((r + 0.5) / rows) * from.height - bh / 2 : -bh,
            delay: (r * cols + c) * 12,
          });
        }
      }
    } else {
      // Same wall, new positions (the window changed size)
      for (const b of bricks) {
        b.x = x0 + b.col * (bw + gap);
        b.y = y0 + b.row * (bh + gap);
      }
    }
    sprites = [];
  }

  /* ---- the little cards ---------------------------------------------------------------- */

  /** One small business card per row colour, drawn once. */
  function sprite(row: number): HTMLCanvasElement {
    if (sprites[row]) return sprites[row];
    const c = document.createElement('canvas');
    const w = Math.max(10, Math.round(bw * dpr));
    const h = Math.max(8, Math.round(bh * dpr));
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const s = w / 85;
    const tint = ROW_COLORS[row % ROW_COLORS.length];
    // Card: a pale wash of the row colour, a dark edge
    roundRect(g, 0.5 * s, 0.5 * s, w - s, h - s, 4 * s);
    g.fillStyle = mix(tint, '#ffffff', 0.72);
    g.fill();
    g.lineWidth = Math.max(1, 1.6 * s);
    g.strokeStyle = INK;
    g.stroke();
    // Photo on the left
    const px = 5 * s;
    const py = 5 * s;
    const pw = 22 * s;
    const ph = 28 * s;
    if (photo.complete && photo.naturalWidth) {
      const ar = photo.naturalWidth / photo.naturalHeight;
      const sw = ar > pw / ph ? photo.naturalHeight * (pw / ph) : photo.naturalWidth;
      const sh = ar > pw / ph ? photo.naturalHeight : photo.naturalWidth / (pw / ph);
      g.drawImage(photo, (photo.naturalWidth - sw) / 2, (photo.naturalHeight - sh) / 2, sw, sh, px, py, pw, ph);
    } else {
      g.fillStyle = '#c9b8a6';
      g.fillRect(px, py, pw, ph);
    }
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.6, 0.6 * s);
    g.strokeRect(px, py, pw, ph);
    // Barcode under the photo
    g.fillStyle = INK;
    for (let i = 0; i < 11; i++) g.fillRect(px + i * 2 * s, py + ph + 3 * s, (i % 3 ? 0.8 : 1.4) * s, 6 * s);
    // "SWITZERLAND" and the red number
    g.fillStyle = '#2a5bd7';
    g.fillRect(31 * s, 6 * s, 40 * s, 6 * s);
    g.fillStyle = '#d3202f';
    g.fillRect(31 * s, 15 * s, 22 * s, 3 * s);
    g.fillRect(31 * s, 21 * s, 12 * s, 3 * s);
    g.fillRect(48 * s, 21 * s, 12 * s, 3 * s);
    // The fields: little grey lines
    g.fillStyle = 'rgba(17, 17, 17, 0.45)';
    for (let i = 0; i < 3; i++) g.fillRect(31 * s, (27 + i * 3.5) * s, (34 - i * 6) * s, 1.4 * s);
    // Signature squiggle
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.6, 0.8 * s);
    g.beginPath();
    g.moveTo(50 * s, 42 * s);
    g.quadraticCurveTo(54 * s, 34 * s, 57 * s, 42 * s);
    g.quadraticCurveTo(60 * s, 47 * s, 64 * s, 39 * s);
    g.stroke();
    // Name bottom left
    g.fillStyle = INK;
    g.fillRect(5 * s, 46 * s, 16 * s, 4 * s);
    sprites[row] = c;
    return c;
  }

  /* ---- game flow ------------------------------------------------------------------------- */

  function setState(s: State) {
    state = s;
    stateAt = performance.now();
  }

  /** One ball waits on the paddle; items and effects are gone. */
  function serve() {
    balls = [{ x: paddle.x, y: paddle.y - baseR - 1, vx: 0, vy: 0 }];
    items = [];
    for (const k of Object.keys(until) as ItemKind[]) delete until[k];
    tnt = false;
    paddle.w = paddle.base;
    hits = 0;
    setState('serve');
  }

  function launch() {
    speed = Math.max(300, Math.min(W, H) * 0.62) * (1 + (level - 1) * 0.08);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    balls[0].vx = Math.cos(ang) * speed;
    balls[0].vy = Math.sin(ang) * speed;
    setState('play');
  }

  function freshWall() {
    layoutBricks(true);
    for (const b of bricks) {
      b.sx = b.x;
      b.sy = -bh - Math.random() * H * 0.3;
    }
    setState(o.reducedMotion ? 'serve' : 'intro');
    serve();
    if (!o.reducedMotion) setState('intro');
  }

  function newGame() {
    level = 1;
    score = 0;
    lives = 3;
    pieces = [];
    freshWall();
  }

  function nextLevel() {
    level++;
    freshWall();
  }

  /** A card breaks: points, pieces, maybe an item (from the second wall on), maybe a bigger bang. */
  function breakBrick(b: Brick, now: number, chain = true) {
    if (!b.alive) return;
    b.alive = false;
    b.hitAt = now;
    score += 10 + (Math.min(8, 4 + level) - 1 - b.row) * 5;
    if (score > best) {
      best = score;
      writeBest(best);
    }
    hits++;
    // A little faster every eight cards
    if (hits % 8 === 0) speed *= 1.04;
    if (!o.reducedMotion) {
      const color = ROW_COLORS[b.row % ROW_COLORS.length];
      for (let i = 0; i < 10; i++) {
        pieces.push({
          x: b.x + Math.random() * bw,
          y: b.y + Math.random() * bh,
          vx: (Math.random() - 0.5) * 220,
          vy: -Math.random() * 160,
          size: 2 + Math.random() * 4,
          color: i % 3 ? color : i % 2 ? INK : '#ffffff',
          born: now,
        });
      }
    }
    if (level >= 2 && Math.random() < ITEM_CHANCE) items.push({ kind: pickItem(), x: b.x + bw / 2, y: b.y + bh / 2 });
    // TNT: this card takes its eight neighbours along
    if (chain && tnt) {
      tnt = false;
      for (const n of bricks) if (n.alive && Math.abs(n.row - b.row) <= 1 && Math.abs(n.col - b.col) <= 1) breakBrick(n, now, false);
      if (!o.reducedMotion) {
        for (let i = 0; i < 30; i++) {
          pieces.push({
            x: b.x + bw / 2,
            y: b.y + bh / 2,
            vx: (Math.random() - 0.5) * 520,
            vy: (Math.random() - 0.8) * 420,
            size: 3 + Math.random() * 5,
            color: i % 3 ? '#ffa300' : i % 2 ? '#e8344a' : INK,
            born: now,
          });
        }
      }
    }
    if (bricks.every((x) => !x.alive)) setState('cleared');
  }

  function pickItem(): ItemKind {
    const kinds = Object.keys(ITEMS) as ItemKind[];
    const total = kinds.reduce((n, k) => n + ITEMS[k].weight, 0);
    let r = Math.random() * total;
    for (const k of kinds) {
      r -= ITEMS[k].weight;
      if (r <= 0) return k;
    }
    return 'multi';
  }

  /** The paddle caught an item. */
  function take(kind: ItemKind) {
    banner = { text: S.items[kind] ?? kind, at: performance.now() };
    const fly = (b: Ball, turn: number): Ball => {
      const ang = Math.atan2(b.vy, b.vx) + turn;
      const v = Math.hypot(b.vx, b.vy) || speed;
      return { x: b.x, y: b.y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
    };
    switch (kind) {
      case 'multi': {
        const from = balls[0];
        if (from) for (const turn of [-0.45, 0.45]) if (balls.length < MAX_BALLS) balls.push(fly(from, turn));
        break;
      }
      case 'double':
        for (const b of [...balls]) if (balls.length < MAX_BALLS) balls.push(fly(b, 0.5));
        break;
      case 'life':
        lives = Math.min(MAX_LIVES, lives + 1);
        break;
      case 'tnt':
        tnt = true;
        break;
      default:
        until[kind] = clock + ITEMS[kind].ms;
    }
  }

  /* ---- physics --------------------------------------------------------------------------- */

  function update(dt: number, now: number) {
    clock += dt * 1000;
    paddle.w += (paddle.base * (active('wide') ? 1.5 : 1) - paddle.w) * Math.min(1, dt * 10);
    // Paddle: towards the pointer, or with the keys
    const kv = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (kv) paddle.target += kv * Math.max(420, W * 0.9) * dt;
    paddle.target = Math.min(Math.max(paddle.target, paddle.w / 2), W - paddle.w / 2);
    paddle.x += (paddle.target - paddle.x) * Math.min(1, dt * 25);

    if (state === 'intro' && now - stateAt > FLY_MS + bricks.length * 12) setState('serve');
    if (state === 'cleared' && now - stateAt > 1500) nextLevel();
    if ((state === 'serve' || state === 'intro') && balls[0]) {
      balls[0].x = paddle.x;
      balls[0].y = paddle.y - ballR() - 1;
    }
    if (state === 'play') {
      // Small steps so no ball ever skips a card
      const v = ballSpeed();
      const steps = Math.max(1, Math.ceil((v * dt) / 4));
      for (let i = 0; i < steps && state === 'play'; i++) step(dt / steps, now);
      // Items fall; the paddle catches them
      for (const it of items) it.y += Math.max(140, H * 0.22) * dt;
      for (const it of items) {
        if (it.y >= paddle.y - 8 && it.y <= paddle.y + paddle.h + 8 && Math.abs(it.x - paddle.x) <= paddle.w / 2 + 14) {
          it.y = H + 100;
          take(it.kind);
        }
      }
      items = items.filter((it) => it.y < H + 30);
    }
    if (pieces.length) {
      for (const p of pieces) {
        p.vy += 600 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      pieces = pieces.filter((p) => now - p.born < 1200 && p.y < H + 20);
    }
  }

  function step(dt: number, now: number) {
    const r = ballR();
    const v = ballSpeed();
    const strong = active('strong');
    for (const ball of balls) {
      // Keep every ball at the current speed (slow, faster with each level …)
      const cur = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / cur) * v;
      ball.vy = (ball.vy / cur) * v;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      // Walls
      if (ball.x < r) {
        ball.x = r;
        ball.vx = Math.abs(ball.vx);
      } else if (ball.x > W - r) {
        ball.x = W - r;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y < r) {
        ball.y = r;
        ball.vy = Math.abs(ball.vy);
      }
      // Paddle: the further out it hits, the steeper it goes
      if (ball.vy > 0 && ball.y + r >= paddle.y && ball.y - r <= paddle.y + paddle.h && Math.abs(ball.x - paddle.x) <= paddle.w / 2 + r) {
        const off = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2)));
        const ang = -Math.PI / 2 + off * (Math.PI / 3);
        ball.vx = Math.cos(ang) * v;
        ball.vy = Math.sin(ang) * v;
        ball.y = paddle.y - r;
      }
      // Cards: the first one the ball overlaps, bounced off its nearer side (a strong ball goes through)
      for (const b of bricks) {
        if (!b.alive) continue;
        const nx = Math.max(b.x, Math.min(ball.x, b.x + bw));
        const ny = Math.max(b.y, Math.min(ball.y, b.y + bh));
        const dx = ball.x - nx;
        const dy = ball.y - ny;
        if (dx * dx + dy * dy > r * r) continue;
        if (!strong) {
          const overlapX = Math.min(ball.x + r - b.x, b.x + bw - (ball.x - r));
          const overlapY = Math.min(ball.y + r - b.y, b.y + bh - (ball.y - r));
          if (overlapX < overlapY) ball.vx = ball.x < b.x + bw / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
          else ball.vy = ball.y < b.y + bh / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
        }
        breakBrick(b, now);
        if (!strong) break;
      }
    }
    // Balls that fell out are gone; a life only goes with the last one
    balls = balls.filter((b) => b.y - r <= H);
    if (!balls.length && state === 'play') {
      lives--;
      if (lives <= 0) setState('over');
      else serve();
    }
  }

  /* ---- drawing ------------------------------------------------------------------------------ */

  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // A faint grid, like paper
    ctx.strokeStyle = 'rgba(17, 17, 17, 0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += 32) ctx.moveTo(x + 0.5, 0), ctx.lineTo(x + 0.5, H);
    for (let y = 0; y < H; y += 32) ctx.moveTo(0, y + 0.5), ctx.lineTo(W, y + 0.5);
    ctx.stroke();

    // The cards: flying in, standing, or shrinking away
    for (const b of bricks) {
      let x = b.x;
      let y = b.y;
      let scale = 1;
      let alpha = 1;
      if (state === 'intro') {
        const t = Math.max(0, Math.min(1, (now - stateAt - b.delay) / FLY_MS));
        const e = 1 - Math.pow(1 - t, 3);
        x = b.sx + (b.x - b.sx) * e;
        y = b.sy + (b.y - b.sy) * e;
        scale = 0.6 + 0.4 * e;
      }
      if (!b.alive) {
        const t = (now - b.hitAt) / 220;
        if (t >= 1 || o.reducedMotion) continue;
        scale = 1 - t * 0.6;
        alpha = 1 - t;
      }
      ctx.globalAlpha = alpha;
      const w = bw * scale;
      const h = bh * scale;
      ctx.drawImage(sprite(b.row), x + (bw - w) / 2, y + (bh - h) / 2, w, h);
    }
    ctx.globalAlpha = 1;

    for (const p of pieces) {
      ctx.globalAlpha = Math.max(0, 1 - (now - p.born) / 1200);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Falling items: capsules with a symbol
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const it of items) {
      const def = ITEMS[it.kind];
      const w = 40;
      const h = 22;
      ctx.fillStyle = INK;
      roundRect(ctx, it.x - w / 2 + 2, it.y - h / 2 + 2, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = def.color;
      roundRect(ctx, it.x - w / 2, it.y - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.font = `700 ${def.label.length > 2 ? 10 : 13}px ${fontMono}`;
      ctx.fillText(def.label, it.x, it.y + 1);
    }

    // Paddle: a yellow pill with a hard shadow, like the site's buttons (orange when wide)
    const px = paddle.x - paddle.w / 2;
    ctx.fillStyle = INK;
    roundRect(ctx, px + 3, paddle.y + 3, paddle.w, paddle.h, paddle.h / 2);
    ctx.fill();
    ctx.fillStyle = active('wide') ? '#ff5a1f' : '#ffa300';
    roundRect(ctx, px, paddle.y, paddle.w, paddle.h, paddle.h / 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // Balls: ink, orange-hot when strong, a red fuse ring when TNT waits
    if (state !== 'over') {
      const r = ballR();
      for (const b of balls) {
        if (tnt) {
          ctx.strokeStyle = '#e8344a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r + 3 + Math.sin(now / 80), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = active('strong') ? '#ff5a1f' : INK;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x - r * 0.35, b.y - r * 0.35, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Score, level and lives, best: one line at the top; two on narrow screens
    ctx.fillStyle = INK;
    ctx.font = `700 ${Math.max(12, Math.min(15, W / 60))}px ${fontMono}`;
    ctx.textBaseline = 'middle';
    const narrow = W < 560;
    const top = Math.max(22, H * 0.035);
    const lifeLine = `${S.level.replace('{n}', String(level))} · ${S.lives} ${'●'.repeat(Math.max(0, lives))}${'○'.repeat(Math.max(0, 3 - lives))}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${S.score} ${score}`, 16, top);
    ctx.textAlign = 'right';
    ctx.fillText(`${S.best} ${best}`, W - 64, top);
    ctx.textAlign = narrow ? 'left' : 'center';
    ctx.fillText(lifeLine, narrow ? 16 : W / 2, narrow ? top + 24 : top);

    // Running effects under the score: symbol and seconds left (wrapping on narrow screens)
    const running = (Object.keys(ITEMS) as ItemKind[]).filter((k) => ITEMS[k].ms && active(k));
    if (tnt) running.unshift('tnt');
    ctx.textAlign = 'left';
    ctx.font = `700 12px ${fontMono}`;
    const perRow = Math.max(1, Math.floor((W - 24) / 64));
    running.forEach((k, i) => {
      const x = 16 + (i % perRow) * 64;
      const y = top + (narrow ? 50 : 26) + Math.floor(i / perRow) * 24;
      ctx.fillStyle = ITEMS[k].color;
      roundRect(ctx, x, y - 10, 58, 20, 10);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = INK;
      const left = k === 'tnt' ? '' : ` ${Math.ceil(((until[k] ?? 0) - clock) / 1000)}s`;
      ctx.fillText(`${ITEMS[k].label}${left}`, x + 8, y + 1);
    });

    // The item just caught, for a moment
    if (banner && now - banner.at < 1400) {
      ctx.globalAlpha = Math.min(1, (1400 - (now - banner.at)) / 400);
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      ctx.font = `${Math.max(18, Math.min(28, W / 34))}px ${fontDisplay}`;
      ctx.fillText(banner.text, W / 2, paddle.y - Math.max(110, H * 0.2));
      ctx.globalAlpha = 1;
    }

    // Messages in the middle
    const msg =
      state === 'serve'
        ? [S.launch]
        : state === 'paused'
          ? [S.paused]
          : state === 'over'
            ? [S.over, S.again]
            : state === 'cleared'
              ? [S.cleared]
              : [];
    if (msg.length) {
      ctx.textAlign = 'center';
      ctx.fillStyle = INK;
      const big = state === 'over' || state === 'cleared';
      const y = paddle.y - Math.max(70, H * 0.14);
      if (big) {
        ctx.font = `${Math.max(26, Math.min(48, W / 18))}px ${fontDisplay}`;
        ctx.fillText(msg[0], W / 2, y - 24);
      }
      ctx.font = `600 ${Math.max(13, Math.min(16, W / 55))}px ${fontMono}`;
      ctx.fillText(big ? (msg[1] ?? '') : msg[0], W / 2, big ? y + 14 : y);
    }
  }

  /* ---- loop and input ------------------------------------------------------------------------ */

  function frame(now: number) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    if (state !== 'paused') update(dt, now);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  const ac = new AbortController();
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window) =>
    target.addEventListener(type, fn as EventListener, { signal: ac.signal });

  on('resize', resize);
  on(
    'pointermove',
    (e: PointerEvent) => {
      paddle.target = e.clientX;
    },
    canvas,
  );
  on(
    'pointerdown',
    (e: PointerEvent) => {
      paddle.target = e.clientX;
      act();
    },
    canvas,
  );
  on('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    else if (e.key === ' ' || e.key === 'Enter') act();
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key === 'Escape') o.onExit();
    else return;
    e.preventDefault();
  });
  on('keyup', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && state === 'play') togglePause();
    },
    { signal: ac.signal },
  );

  /** Click, tap, space: launch, go on, or play again. */
  function act() {
    if (state === 'serve') launch();
    else if (state === 'paused') togglePause();
    else if (state === 'over' && performance.now() - stateAt > 600) newGame();
  }

  let pausedFrom: State = 'play';
  function togglePause() {
    if (state === 'paused') {
      state = pausedFrom;
      last = performance.now();
    } else if (state === 'play' || state === 'serve') {
      pausedFrom = state;
      state = 'paused';
    }
  }

  // Local development only: lets tests jump to a level and hand out items
  if (import.meta.env.DEV) {
    (window as unknown as { cardBreaker: unknown }).cardBreaker = {
      level: () => nextLevel(),
      take,
      info: () => ({ state, level, lives, score, balls: balls.length, items: items.length, paddle: Math.round(paddle.w), r: ballR(), speed: Math.round(ballSpeed()), tnt, effects: { ...until }, clock }),
      clear: () => bricks.forEach((b) => (b.alive = false)),
    };
  }

  resize();
  layoutBricks(true);
  serve();
  setState(o.reducedMotion ? 'serve' : 'intro');
  raf = requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  return () => {
    cancelAnimationFrame(raf);
    ac.abort();
  };
}

/* ---- helpers --------------------------------------------------------------------------------- */

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Mixes two #rrggbb colours (amount of b, 0 … 1). */
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

function readBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeBest(n: number) {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* private mode: the best score lives only until the page closes */
  }
}
