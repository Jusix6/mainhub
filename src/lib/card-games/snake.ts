/**
 * Card game 02: Snake. Clicking the "S" of the name on the card page starts
 * it (CardGames.astro); the board grows out of the card.
 *
 * Classic rules, kept simple on purpose:
 * - A checkered board (17 × 15, turned to 15 × 17 on tall screens); the snake
 *   starts on the left with four pieces, the apple waits on the right.
 * - It starts moving with the first arrow key (or WASD), swipe, click or space,
 *   and keeps going at one even speed. Every apple is one point and one piece
 *   longer; the wall or its own tail ends the run.
 * - Turns are buffered (two ahead), so quick double turns are not lost; a turn
 *   straight back is ignored.
 * - P pauses (hiding the tab does too), Esc (or ×) ends the game. The best
 *   score is kept in localStorage (`jxsi_snake_best`).
 * - The snake glides smoothly between cells; reduced motion: no grow-in and
 *   no apple pieces, the game itself stays.
 */

export interface SnakeStrings {
  name: string;
  score: string;
  best: string;
  start: string;
  paused: string;
  over: string;
  again: string;
  won: string;
  record: string;
}

export interface SnakeOptions {
  canvas: HTMLCanvasElement;
  strings: SnakeStrings;
  /** Where the card was on screen: the board grows out of it. */
  from?: DOMRect;
  reducedMotion: boolean;
  /** Called when the player leaves (Esc). */
  onExit: () => void;
}

type Dir = 0 | 1 | 2 | 3; // right, down, left, up
type State = 'ready' | 'play' | 'paused' | 'dying' | 'over';

interface Cell {
  x: number;
  y: number;
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

const BEST_KEY = 'jxsi_snake_best';
const STEP_MS = 135;
const GROW_MS = 550;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const INK = '#111111';
const SNAKE = '#3ddc84';
const SNAKE_DARK = '#1fa862';
const APPLE = '#ff5a1f';
const TILE_A = '#fff1cc';
const TILE_B = '#ffe7ad';

/** Starts the game; returns a function that stops it and cleans up. */
export function startSnake(o: SnakeOptions): () => void {
  const { canvas, strings: S } = o;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const fontMono = css.getPropertyValue('--font-mono').trim() || 'monospace';
  const fontDisplay = css.getPropertyValue('--font-display').trim() || 'sans-serif';
  const bg = css.getPropertyValue('--bg').trim() || '#fff8e7';

  let dpr = 1;
  let W = 0;
  let H = 0;
  let cols = 17;
  let rows = 15;
  let cell = 20;
  let bx = 0;
  let by = 0;

  let snake: Cell[] = [];
  /** Where the last piece was before the latest step (the tail glides out of it). */
  let tailFrom: Cell = { x: 0, y: 0 };
  let dir: Dir = 0;
  let lastDir: Dir = 0;
  const turns: Dir[] = [];
  let grow = 0;
  let apple: Cell = { x: 0, y: 0 };
  let appleAt = 0;
  let score = 0;
  let best = readBest();
  let newBest = false;
  let won = false;
  let pieces: Piece[] = [];
  let pops: { x: number; y: number; at: number }[] = [];

  let state = 'ready' as State;
  let stateAt = performance.now();
  let acc = 0;
  let raf = 0;
  let last = performance.now();
  const bornAt = performance.now();

  /* ---- layout -------------------------------------------------------------------------- */

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    place();
  }

  /** Board size and position: as big as fits under the score line. */
  function place() {
    const top = W < 560 ? 70 : 84;
    const side = W < 560 ? 12 : 32;
    cell = Math.floor(Math.max(8, Math.min(48, (W - side * 2) / cols, (H - top - side) / rows)));
    bx = Math.round((W - cols * cell) / 2);
    by = Math.round(top + (H - top - side - rows * cell) / 2);
  }

  /* ---- game flow ------------------------------------------------------------------------- */

  function setState(s: State) {
    state = s;
    stateAt = performance.now();
  }

  function newGame() {
    // Tall screens get the board turned round
    [cols, rows] = H > W * 1.1 ? [15, 17] : [17, 15];
    place();
    const y = Math.floor(rows / 2);
    const x = Math.min(4, Math.floor(cols / 4));
    snake = [0, 1, 2, 3].map((i) => ({ x: x - i, y }));
    tailFrom = { x: x - 4, y };
    dir = 0;
    lastDir = 0;
    turns.length = 0;
    grow = 0;
    score = 0;
    newBest = false;
    won = false;
    pieces = [];
    pops = [];
    apple = { x: cols - 1 - x, y };
    appleAt = performance.now();
    acc = 0;
    setState('ready');
  }

  /** A new apple on a free cell (none left: the board is full, the game is won). */
  function placeApple() {
    const taken = new Set(snake.map((c) => c.y * cols + c.x));
    const free: number[] = [];
    for (let i = 0; i < cols * rows; i++) if (!taken.has(i)) free.push(i);
    if (!free.length) return false;
    const i = free[Math.floor(Math.random() * free.length)];
    apple = { x: i % cols, y: Math.floor(i / cols) };
    appleAt = performance.now();
    return true;
  }

  /** Queue a turn; the first one also starts the run. */
  function steer(d: Dir) {
    if (state === 'paused') togglePause();
    if (state === 'over') return;
    const ref = turns.length ? turns[turns.length - 1] : lastDir;
    if (state === 'ready') {
      if ((d + 2) % 4 === dir) return;
      dir = d;
      lastDir = d;
      start();
      return;
    }
    if (state !== 'play') return;
    if (d === ref || (d + 2) % 4 === ref || turns.length >= 2) return;
    turns.push(d);
  }

  function start() {
    acc = 0;
    setState('play');
  }

  /** One cell forward. */
  function step(now: number) {
    if (turns.length) dir = turns.shift()!;
    lastDir = dir;
    const head = snake[0];
    const next = { x: head.x + DX[dir], y: head.y + DY[dir] };
    const eating = next.x === apple.x && next.y === apple.y;
    // The tail moves away this step (unless the snake grows), so the head may follow it in
    const body = grow > 0 || eating ? snake : snake.slice(0, -1);
    const out = next.x < 0 || next.y < 0 || next.x >= cols || next.y >= rows;
    if (out || body.some((c) => c.x === next.x && c.y === next.y)) {
      setState('dying');
      return;
    }
    snake.unshift(next);
    if (eating) grow++;
    if (grow > 0) {
      grow--;
      tailFrom = snake[snake.length - 1];
    } else {
      tailFrom = snake.pop()!;
    }
    if (eating) eat(now);
  }

  function eat(now: number) {
    score++;
    if (score > best) {
      best = score;
      newBest = true;
      writeBest(best);
    }
    pops.push({ x: apple.x, y: apple.y, at: now });
    if (!o.reducedMotion) {
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = 60 + Math.random() * 160;
        pieces.push({
          x: bx + (apple.x + 0.5) * cell,
          y: by + (apple.y + 0.5) * cell,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 60,
          size: 2 + Math.random() * 4,
          color: i % 3 ? APPLE : i % 2 ? '#ffa300' : INK,
          born: now,
        });
      }
    }
    if (!placeApple()) {
      won = true;
      setState('over');
    }
  }

  /* ---- update ------------------------------------------------------------------------------ */

  function update(dt: number, now: number) {
    if (state === 'play') {
      acc += dt * 1000;
      while (acc >= STEP_MS && state === 'play') {
        acc -= STEP_MS;
        step(now);
      }
    }
    if (state === 'dying' && now - stateAt > 900) setState('over');
    for (const p of pieces) {
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    pieces = pieces.filter((p) => now - p.born < 900);
    pops = pops.filter((p) => now - p.at < 600);
  }

  /* ---- drawing ----------------------------------------------------------------------------- */

  function draw(now: number) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grow-in: the board comes out of the card
    const g = o.reducedMotion || !o.from ? 1 : Math.min(1, (now - bornAt) / GROW_MS);
    const e = 1 - Math.pow(1 - g, 3);
    ctx.save();
    if (g < 1 && o.from) {
      const f = o.from;
      const bw = cols * cell;
      const bh = rows * cell;
      const sx = f.width / bw + (1 - f.width / bw) * e;
      const sy = f.height / bh + (1 - f.height / bh) * e;
      const cx = f.left + f.width / 2 + (bx + bw / 2 - (f.left + f.width / 2)) * e;
      const cy = f.top + f.height / 2 + (by + bh / 2 - (f.top + f.height / 2)) * e;
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);
      ctx.translate(-(bx + bw / 2), -(by + bh / 2));
    }
    // A shake when the snake hits something
    if (state === 'dying' && !o.reducedMotion) {
      const t = (now - stateAt) / 300;
      if (t < 1) ctx.translate(Math.sin(t * 40) * 6 * (1 - t), 0);
    }
    drawBoard();
    drawApple(now);
    drawSnake(now);
    ctx.restore();

    for (const p of pieces) {
      ctx.globalAlpha = Math.max(0, 1 - (now - p.born) / 900);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of pops) {
      const t = (now - p.at) / 600;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = INK;
      ctx.font = `700 ${Math.max(14, cell * 0.7)}px ${fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+1', bx + (p.x + 0.5) * cell, by + (p.y + 0.5) * cell - t * cell * 1.2);
    }
    ctx.globalAlpha = 1;

    if (g >= 1) drawHud();
    drawMessage(now);
  }

  function drawBoard() {
    const w = cols * cell;
    const h = rows * cell;
    const r = Math.max(6, cell * 0.4);
    // Hard shadow like the rest of the site
    roundRect(ctx, bx + 6, by + 6, w, h, r);
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.save();
    roundRect(ctx, bx, by, w, h, r);
    ctx.clip();
    ctx.fillStyle = TILE_A;
    ctx.fillRect(bx, by, w, h);
    ctx.fillStyle = TILE_B;
    for (let y = 0; y < rows; y++) for (let x = (y % 2) ^ 1; x < cols; x += 2) ctx.fillRect(bx + x * cell, by + y * cell, cell, cell);
    ctx.restore();
    roundRect(ctx, bx, by, w, h, r);
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function drawApple(now: number) {
    if (won) return;
    const t = Math.min(1, (now - appleAt) / 250);
    const pulse = o.reducedMotion ? 1 : 1 + Math.sin(now / 260) * 0.04;
    const s = (o.reducedMotion ? 1 : 0.4 + 0.6 * easeBack(t)) * pulse;
    const cx = bx + (apple.x + 0.5) * cell;
    const cy = by + (apple.y + 0.55) * cell;
    const r = cell * 0.36 * s;
    ctx.lineWidth = Math.max(1.5, cell * 0.08);
    ctx.strokeStyle = INK;
    // Stalk and leaf
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.7);
    ctx.lineTo(cx + r * 0.15, cy - r * 1.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.55, cy - r * 1.15, r * 0.42, r * 0.22, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = SNAKE;
    ctx.fill();
    ctx.stroke();
    // The apple: two round halves
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy, r * 0.82, 0, Math.PI * 2);
    ctx.arc(cx + r * 0.32, cy, r * 0.82, 0, Math.PI * 2);
    ctx.fillStyle = APPLE;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy, r * 0.82, Math.PI * 0.5, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + r * 0.32, cy, r * 0.82, -Math.PI * 0.75, Math.PI * 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.32, cy + r * 0.82);
    ctx.lineTo(cx + r * 0.32, cy + r * 0.82);
    ctx.stroke();
    // Shine
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.55, cy - r * 0.3, r * 0.14, r * 0.26, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The snake as one thick round line through the cell centres, gliding between steps. */
  function drawSnake(now: number) {
    if (!snake.length) return;
    const moving = state === 'play' || state === 'paused';
    const t = moving ? Math.min(1, acc / STEP_MS) : 1;
    const c = (p: Cell) => ({ x: bx + (p.x + 0.5) * cell, y: by + (p.y + 0.5) * cell });
    const lerp = (a: Cell, b: Cell, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    const pts: Cell[] = [];
    // Head: from where it was to where it is now
    pts.push(snake.length > 1 && moving ? c(lerp(snake[1], snake[0], t)) : c(snake[0]));
    for (let i = 1; i < snake.length; i++) pts.push(c(snake[i]));
    // Tail end: gliding out of the cell it just left
    const tail = snake[snake.length - 1];
    if (moving && (tailFrom.x !== tail.x || tailFrom.y !== tail.y)) {
      pts[pts.length - 1] = c(tail);
      pts.push(c(lerp(tailFrom, tail, t)));
    }
    const width = cell * 0.72;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const line = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    };
    line();
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 5;
    ctx.stroke();
    line();
    ctx.strokeStyle = state === 'dying' || (state === 'over' && !won) ? '#9fb8a8' : SNAKE;
    ctx.lineWidth = width;
    ctx.stroke();
    // A darker stripe down the back
    line();
    ctx.strokeStyle = state === 'dying' || (state === 'over' && !won) ? '#86a091' : SNAKE_DARK;
    ctx.lineWidth = width * 0.22;
    ctx.stroke();

    // Head: eyes looking where it goes, crosses when it crashed
    const h = pts[0];
    const d = state === 'ready' ? dir : lastDir;
    const fx = DX[d];
    const fy = DY[d];
    const ex = -fy;
    const ey = fx;
    const dead = state === 'dying' || (state === 'over' && !won);
    for (const side of [-1, 1]) {
      const x = h.x + fx * cell * 0.12 + ex * side * cell * 0.2;
      const y = h.y + fy * cell * 0.12 + ey * side * cell * 0.2;
      const r = cell * 0.13;
      if (dead) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1.5, cell * 0.07);
        ctx.beginPath();
        ctx.moveTo(x - r, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.moveTo(x + r, y - r);
        ctx.lineTo(x - r, y + r);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = Math.max(1, cell * 0.05);
        ctx.stroke();
        // Blink now and then
        const blink = !o.reducedMotion && now % 3200 < 120;
        ctx.fillStyle = INK;
        if (blink) ctx.fillRect(x - r, y - 0.8, r * 2, 1.6);
        else {
          ctx.beginPath();
          ctx.arc(x + fx * r * 0.35, y + fy * r * 0.35, r * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawHud() {
    const small = W < 560;
    const y = by - (small ? 30 : 38);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `${small ? 20 : 26}px ${fontDisplay}`;
    ctx.fillStyle = INK;
    // Little apple, then the score
    const ax = bx + 12;
    ctx.beginPath();
    ctx.arc(ax, y + 1, small ? 8 : 10, 0, Math.PI * 2);
    ctx.fillStyle = APPLE;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    const sx = ax + (small ? 16 : 20);
    ctx.fillText(String(score), sx, y + 2);
    // Best right after it (the × of the game sits in the top right corner)
    const after = sx + ctx.measureText(String(score)).width + (small ? 18 : 26);
    ctx.font = `700 ${small ? 12 : 14}px ${fontMono}`;
    ctx.fillStyle = 'rgba(17, 17, 17, 0.65)';
    ctx.fillText(`${S.best.toUpperCase()} ${best}`, after, y + 2);
  }

  function drawMessage(now: number) {
    let title = '';
    let sub = '';
    if (state === 'ready' && now - bornAt > GROW_MS) sub = S.start;
    else if (state === 'paused') title = S.paused;
    else if (state === 'over') {
      title = won ? S.won : S.over;
      sub = newBest ? `${S.record} · ${S.again}` : S.again;
    }
    if (!title && !sub) return;
    const cx = bx + (cols * cell) / 2;
    // The start hint sits low, out of the snake's way
    const cy = by + rows * cell * (state === 'ready' ? 0.78 : 0.5);
    const small = W < 560;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const titleFont = `${small ? 26 : 40}px ${fontDisplay}`;
    const subFont = `700 ${small ? 12 : 15}px ${fontMono}`;
    ctx.font = titleFont;
    const tw = title ? ctx.measureText(title).width : 0;
    ctx.font = subFont;
    const sw = sub ? ctx.measureText(sub).width : 0;
    const pw = Math.min(cols * cell - 16, Math.max(tw, sw) + 40);
    const ph = (title ? (small ? 40 : 56) : 0) + (sub ? (small ? 30 : 34) : 0) + 16;
    roundRect(ctx, cx - pw / 2 + 4, cy - ph / 2 + 4, pw, ph, 12);
    ctx.fillStyle = INK;
    ctx.fill();
    roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, 12);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    let ty = cy - ph / 2 + 8;
    if (title) {
      ctx.font = titleFont;
      ty += small ? 20 : 28;
      ctx.fillText(title, cx, ty + 2, pw - 16);
      ty += small ? 20 : 28;
    }
    if (sub) {
      ctx.font = subFont;
      ty += small ? 15 : 17;
      ctx.fillText(sub, cx, ty, pw - 16);
    }
  }

  /* ---- loop and input ------------------------------------------------------------------------ */

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state !== 'paused') update(dt, now);
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  const ac = new AbortController();
  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void, target: Window | HTMLElement = window) =>
    target.addEventListener(type, fn as EventListener, { signal: ac.signal });

  const KEYS: Record<string, Dir> = {
    ArrowRight: 0, d: 0, D: 0,
    ArrowDown: 1, s: 1, S: 1,
    ArrowLeft: 2, a: 2, A: 2,
    ArrowUp: 3, w: 3, W: 3,
  };

  on('resize', resize);
  on('keydown', (e: KeyboardEvent) => {
    if (e.key in KEYS) {
      if (state === 'over') act();
      else steer(KEYS[e.key]);
    } else if (e.key === ' ' || e.key === 'Enter') act();
    else if (e.key === 'p' || e.key === 'P') togglePause();
    else if (e.key === 'Escape') o.onExit();
    else return;
    e.preventDefault();
  });

  // Swipe anywhere: every 24 px in one direction is a turn, so one long swipe can turn twice
  let swipe: { x: number; y: number; id: number; moved: boolean } | null = null;
  on(
    'pointerdown',
    (e: PointerEvent) => {
      swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone */
      }
    },
    canvas,
  );
  on(
    'pointermove',
    (e: PointerEvent) => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3);
      swipe.x = e.clientX;
      swipe.y = e.clientY;
      swipe.moved = true;
    },
    canvas,
  );
  on(
    'pointerup',
    (e: PointerEvent) => {
      if (swipe && e.pointerId === swipe.id && !swipe.moved) act();
      swipe = null;
    },
    canvas,
  );
  on(
    'pointercancel',
    () => {
      swipe = null;
    },
    canvas,
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden && state === 'play') togglePause();
    },
    { signal: ac.signal },
  );

  /** Click, tap, space: start, go on, or play again. */
  function act() {
    if (state === 'ready' && performance.now() - bornAt > GROW_MS * 0.6) start();
    else if (state === 'paused') togglePause();
    else if (state === 'over' && performance.now() - stateAt > 500) newGame();
  }

  function togglePause() {
    if (state === 'paused') {
      setState('play');
      last = performance.now();
    } else if (state === 'play') setState('paused');
  }

  // Local development only: lets tests look inside and set up a run
  if (import.meta.env.DEV) {
    (window as unknown as { cardSnake: unknown }).cardSnake = {
      info: () => ({ state, score, best, length: snake.length, head: snake[0], apple, dir, cols, rows, cell }),
      steer,
      step: () => step(performance.now()),
      apple: (x: number, y: number) => {
        apple = { x, y };
        appleAt = performance.now();
      },
      grow: (n: number) => {
        grow += n;
      },
    };
  }

  resize();
  newGame();
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

function easeBack(t: number) {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

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
