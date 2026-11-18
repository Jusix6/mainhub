/**
 * Draws the island. The map lives in an offscreen canvas (one pixel buffer of
 * 1280 × 800); only dirty tiles are redrawn into it. Every frame the visible
 * part is copied to the screen with nearest-neighbour scaling (pixel look),
 * then people, animals, graves and puffs, the brush outline and the night
 * darkening go on top. Figures are tiny pixel sprites drawn from strings.
 */
import { GREY_HAIR, PEOPLE_COLORS, stage, type Agent, type Human, type Thought } from './agents';
import type { Camera } from './camera';
import { COLORS, paintTile } from './tiles';
import type { Sim } from './sim';
import { enemiesOf, isWarrior } from './war';
import { H, TILE, W, type Terrain, type World } from './world';

export { COLORS };

// People, 5 px wide (children 3 px), facing right. h hair, s skin, e eye,
// c clothes in the colour of their people, p darker clothes, d shoes.
const MAN = ['.hhh.', '.sse.', 'scccs', '.ccc.', '.ccc.', '.p.p.', '.p.p.'];
const MAN_WALK = ['.hhh.', '.sse.', 'scccs', '.ccc.', '.ccc.', '.p.p.', 'p...p'];
const WOMAN = ['.hhh.', 'hsseh', 'scccs', '.ccc.', 'ccccc', '.s.s.', '.d.d.'];
const WOMAN_WALK = ['.hhh.', 'hsseh', 'scccs', '.ccc.', 'ccccc', '.s.s.', 'd...d'];
const CHILD = ['hhh', 'sse', 'ccc', 'ccc', 'p.p'];
const CHILD_WALK = ['hhh', 'sse', 'ccc', 'ccc', '.p.'];
const SLEEP = ['hsccpp.', 'hsccppd'];
const SHEEP = ['.wwww..', 'wwwwwkk', 'wwwwwkk', '.wwwww.', '.k...k.'];
const SHEEP_COLORS = { w: '#f7f4ea', k: '#2b2b2b' };
const CHICKEN = ['..r.', '.wwy', 'www.', '.y..'];
const CHICKEN_COLORS = { r: '#e0362c', w: '#ffffff', y: '#f2b02a' };
const WOLF = ['.....g.g', 'g...gggg', 'gggggggk', '.gggggg.', '.d.d.d.d'];
const WOLF_RUN = ['.....g.g', '.g..gggg', 'gggggggk', '.gggggg.', 'd.d...d.'];
const WOLF_COLORS = { g: '#8b909c', k: '#1f1f1f', d: '#5d616b' };
// Buildings, bottom centre on the tile. r/R roof in the colour of the people,
// w/W wooden wall, g/G stone wall, y window, D door.
const TENT = ['....r....', '...rrr...', '..rrRrr..', '.rrrRrrr.', 'rrrrRrrrr', 'rrrRRRrrr', 'rrRRRRRrr'];
const HOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.wwwwwwww.', '.wywwwyww.', '.wwwDDwww.', '.wwwDDwww.', '.WWWDDWWW.'];
const STONE_HOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.gGgggGgg.', '.gyggggyg.', '.gggDDggG.', '.gGgDDggg.', '.GGGDDGGG.'];
const HOUSE_COLORS = { w: '#b07a45', W: '#8a5a2b', g: '#b4b9c2', G: '#8d929c', y: '#3a4a6a', D: '#5a3a1e' };
const RUIN = ['..........', '..........', '..........', '.w......w.', '.ww....ww.', '.www..www.', '.wwWW.www.'];
const RUIN_COLORS = { w: '#8d8a84', W: '#6d6a64' };
const SITE = ['.b......b.', '.bbbbbbbb.', '.b..b...b.', '.b..b...b.', '.bbbbbbbb.', '.b..b...b.', '.b......b.'];
const SITE_COLORS = { b: '#a0703c' };
const FIRE_A = ['..y..', '.yoy.', '.ooo.', 'lllll'];
const FIRE_B = ['.y...', '.oy..', '.ooo.', 'lllll'];
const FIRE_COLORS = { y: '#ffe066', o: '#ff8a1e', l: '#6b4325' };
const LOGS = ['.ll.', 'llll', 'llll'];
const STONES = ['.s.', 'sss'];
const BASKET = ['r.y', 'bbb', 'bbb'];
const STORE_COLORS = { l: '#8a5a2b', s: '#9aa0aa', r: '#e8344a', y: '#ffe066', b: '#c8a26a' };

const THOUGHTS: Record<Thought, string[]> = {
  heart: ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'],
  sword: ['....g', '...g.', 'b.g..', '.b...', 'b.b..'],
  tear: ['..u..', '.uu..', '.uuu.', 'uuuuu', '.uuu.'],
  food: ['..l..', '.rrr.', 'rrrrr', 'rrrrr', '.rrr.'],
};
const THOUGHT_COLORS: Record<string, string> = { r: '#e8344a', g: '#8b93a3', b: '#8a5a2b', u: '#4d8dff', l: '#3aa64b' };
const GRAVE = ['.GGG.', 'GGgGG', 'GgggG', 'GGgGG', 'GGGGG', 'ddddd'];
const GRAVE_COLORS = { G: '#a3a9b4', g: '#6c727d', d: '#7a5c3c' };

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly map: HTMLCanvasElement;
  private readonly mapCtx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly px: Uint32Array;
  private dpr = 1;
  private selected: number | null = null;
  /** Window and fire spots (world px) that glow at night. */
  private readonly lights: [number, number][] = [];
  /** Text after a village name when it lies in ruins. */
  ruinsLabel = 'ruins';

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly world: World,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.map = document.createElement('canvas');
    this.map.width = W * TILE;
    this.map.height = H * TILE;
    this.mapCtx = this.map.getContext('2d')!;
    this.image = this.mapCtx.createImageData(W * TILE, H * TILE);
    this.px = new Uint32Array(this.image.data.buffer);
  }

  resize(cssW: number, cssH: number) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
  }

  /* ---- map buffer ---------------------------------------------------------- */

  /** Writes changed tiles into the offscreen map. */
  flush() {
    const world = this.world;
    if (world.all) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintTile(this.world, this.px, x, y);
      this.mapCtx.putImageData(this.image, 0, 0);
      world.all = false;
      world.dirty.clear();
      return;
    }
    if (!world.dirty.size) return;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    for (const i of world.dirty) {
      const x = i % W;
      const y = (i / W) | 0;
      paintTile(this.world, this.px, x, y);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    world.dirty.clear();
    this.mapCtx.putImageData(this.image, 0, 0, x0 * TILE, y0 * TILE, (x1 - x0 + 1) * TILE, (y1 - y0 + 1) * TILE);
  }

  /* ---- screen ---------------------------------------------------------------- */

  /** One frame: map, life, brush outline, night. */
  draw(cam: Camera, sim: Sim, brush: { x: number; y: number; r: number } | null, selected: number | null = null) {
    const darkness = sim.darkness;
    this.selected = selected;
    const { ctx, dpr } = this;
    const s = cam.zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.deep;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    const ox = (cam.vw / 2 - cam.x * cam.zoom) * dpr;
    const oy = (cam.vh / 2 - cam.y * cam.zoom) * dpr;
    ctx.setTransform(s, 0, 0, s, ox, oy);
    ctx.drawImage(this.map, 0, 0);
    this.drawLife(cam, sim);

    if (brush) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 1 / cam.zoom;
      const r2 = brush.r * brush.r + brush.r;
      for (let dy = -brush.r; dy <= brush.r; dy++)
        for (let dx = -brush.r; dx <= brush.r; dx++)
          if (dx * dx + dy * dy <= r2) ctx.strokeRect((brush.x + dx) * TILE + 0.5 / cam.zoom, (brush.y + dy) * TILE + 0.5 / cam.zoom, TILE - 1 / cam.zoom, TILE - 1 / cam.zoom);
    }

    if (darkness > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = `rgba(10, 18, 52, ${(darkness * 0.55).toFixed(3)})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      // Lit windows and fires shine through the dark
      ctx.setTransform(s, 0, 0, s, ox, oy);
      ctx.globalAlpha = darkness;
      for (const [lx, ly] of this.lights) {
        ctx.fillStyle = 'rgba(255, 196, 90, 0.25)';
        ctx.fillRect(lx - 2, ly - 2, 5, 5);
        ctx.fillStyle = '#ffd36b';
        ctx.fillRect(lx, ly, 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    this.drawLabels(cam, sim, this.ruinsLabel);
  }

  /* ---- villages ---------------------------------------------------------------- */

  /** Squares, storage, houses and building sites; window spots are kept for the night lights. */
  private drawVillages(sim: Sim, visible: (a: { x: number; y: number }) => boolean) {
    const ctx = this.ctx;
    this.lights.length = 0;
    for (const v of sim.villages) {
      if (!visible({ x: v.x + 0.5, y: v.y + 0.5 }) && !v.houses.some((h) => visible({ x: h.x + 0.5, y: h.y + 0.5 }))) continue;
      const cloth = PEOPLE_COLORS[v.people];
      const roof = { r: cloth.cloth, R: cloth.dark };
      const cx = v.x * TILE + 4;
      const cy = v.y * TILE + 4;

      // The square: a patch of trodden earth
      ctx.fillStyle = v.ruin ? 'rgba(150, 135, 110, 0.45)' : 'rgba(214, 186, 132, 0.75)';
      ctx.fillRect(cx - 9, cy - 5, 18, 11);
      ctx.fillRect(cx - 7, cy - 7, 14, 15);

      for (const h of v.houses) {
        const px = h.x * TILE + 4;
        const py = h.y * TILE + 8;
        if (v.ruin) {
          this.figure(RUIN, RUIN_COLORS, px, py, false);
          continue;
        }
        const rows = h.level === 0 ? TENT : h.level === 1 ? HOUSE : STONE_HOUSE;
        this.figure(rows, { ...HOUSE_COLORS, ...roof }, px, py, false);
        if (h.level > 0) {
          this.lights.push([px - 3, py - 4]);
          this.lights.push([px + 1, py - 4]);
          // Chimney with a thin wisp of smoke
          ctx.fillStyle = '#5a3a1e';
          ctx.fillRect(Math.round(px) + 2, py - 11, 2, 3);
          const seed = ((h.x * 7 + h.y * 13) % 10) / 10;
          for (let k = 0; k < 3; k++) {
            const t = (sim.time * 0.35 + k / 3 + seed) % 1;
            ctx.globalAlpha = 0.7 * (1 - t);
            ctx.fillStyle = '#e4e4e4';
            ctx.fillRect(Math.round(px + 3 + Math.sin((t + seed) * 6) * 1.5), Math.round(py - 12 - t * 10), 2, 2);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (v.ruin) continue;

      const s = v.site;
      if (s) this.figure(SITE, SITE_COLORS, s.x * TILE + 4, s.y * TILE + 8, false);

      // Fire in the middle
      const flicker = Math.floor(sim.time * 8) % 2;
      this.figure(flicker ? FIRE_A : FIRE_B, FIRE_COLORS, cx, cy + 3, false);
      this.lights.push([cx, cy]);

      // Storage next to the fire
      if (v.wood > 0) this.figure(LOGS, STORE_COLORS, cx + 7, cy + 4, false);
      if (v.stone > 0) this.figure(STONES, STORE_COLORS, cx + 7, cy - 1, false);
      if (v.food > 0) this.figure(BASKET, STORE_COLORS, cx - 7, cy + 4, false);

      // Banner in the colours of the people
      ctx.fillStyle = '#6b4325';
      ctx.fillRect(cx - 7, cy - 12, 1, 9);
      ctx.fillStyle = cloth.cloth;
      ctx.fillRect(cx - 6, cy - 12, 4, 3);
      // At war: a red war flag with crossed swords flies next to it
      if (enemiesOf(sim, v.people).length) {
        const wave = Math.floor(sim.time * 4) % 2;
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(cx + 6, cy - 14, 1, 11);
        ctx.fillStyle = '#c62828';
        ctx.fillRect(cx + 7, cy - 14, 5, 4);
        ctx.fillRect(cx + 7 + 5, cy - 14 + wave, 1, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 8, cy - 13, 1, 1);
        ctx.fillRect(cx + 10, cy - 13, 1, 1);
        ctx.fillRect(cx + 9, cy - 12, 1, 1);
        ctx.fillRect(cx + 8, cy - 11, 1, 1);
        ctx.fillRect(cx + 10, cy - 11, 1, 1);
      }
    }
  }

  /** Village names over the squares, in screen pixels so they stay readable. */
  private drawLabels(cam: Camera, sim: Sim, ruinsLabel: string) {
    if (cam.zoom < 0.5) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `700 ${Math.round(11 * dpr)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of sim.villages) {
      const sx = ((v.x + 0.5) * TILE - cam.x) * cam.zoom * dpr + (cam.vw / 2) * dpr;
      const sy = ((v.y + 0.5) * TILE - 14 - cam.y) * cam.zoom * dpr + (cam.vh / 2) * dpr - 10 * dpr;
      if (sx < -100 || sy < -30 || sx > this.canvas.width + 100 || sy > this.canvas.height + 30) continue;
      const text = v.ruin ? `${v.name} · ${ruinsLabel}` : v.name;
      const w = ctx.measureText(text).width + 12 * dpr;
      const h = 17 * dpr;
      ctx.globalAlpha = v.ruin ? 0.6 : 0.95;
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.roundRect(sx - w / 2 + 1.5 * dpr, sy - h / 2 + 1.5 * dpr, w, h, 8 * dpr);
      ctx.fill();
      ctx.fillStyle = v.ruin ? '#8b8f99' : PEOPLE_COLORS[v.people].cloth;
      ctx.beginPath();
      ctx.roundRect(sx - w / 2, sy - h / 2, w, h, 8 * dpr);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, sx, sy + dpr);
    }
    ctx.globalAlpha = 1;
  }

  /* ---- people and animals ------------------------------------------------------ */

  /** Draws a sprite (rows of colour keys) with its bottom centre at (px, py) in world pixels. */
  private figure(rows: readonly string[], colors: Record<string, string>, px: number, py: number, flip: boolean) {
    const ctx = this.ctx;
    const w = rows[0].length;
    const x0 = Math.round(px - w / 2);
    const y0 = Math.round(py - rows.length);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < w; c++) {
        const col = colors[row[flip ? w - 1 - c : c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + c, y0 + r, 1, 1);
      }
    }
  }

  private drawLife(cam: Camera, sim: Sim) {
    const ctx = this.ctx;
    // Only what is on screen (in tiles, with a margin)
    const x0 = cam.x / TILE - cam.vw / 2 / cam.zoom / TILE - 2;
    const x1 = cam.x / TILE + cam.vw / 2 / cam.zoom / TILE + 2;
    const y0 = cam.y / TILE - cam.vh / 2 / cam.zoom / TILE - 2;
    const y1 = cam.y / TILE + cam.vh / 2 / cam.zoom / TILE + 2;
    const visible = (a: { x: number; y: number }) => a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1;

    // Footprints in the sand, fading
    ctx.fillStyle = '#c4a258';
    for (const f of sim.footprints) {
      if (!visible(f)) continue;
      ctx.globalAlpha = Math.max(0, 1 - (sim.time - f.t) / 8) * 0.8;
      ctx.fillRect(Math.round(f.x * TILE) - 1, Math.round(f.y * TILE), 1, 1);
      ctx.fillRect(Math.round(f.x * TILE) + 1, Math.round(f.y * TILE) - 1, 1, 1);
    }
    ctx.globalAlpha = 1;
    this.drawVillages(sim, visible);
    for (const g of sim.graves) if (visible(g)) this.figure(GRAVE, GRAVE_COLORS, g.x * TILE, g.y * TILE + 3, false);

    const all: Agent[] = [];
    for (const h of sim.humans) if (visible(h)) all.push(h);
    for (const a of sim.animals) if (visible(a)) all.push(a);
    all.sort((a, b) => a.y - b.y);
    const step = Math.floor(sim.time * 6) % 2 === 0;
    for (const a of all) {
      const px = a.x * TILE;
      const py = a.y * TILE + 3;
      const flip = a.facing < 0;
      if (a.kind === 'human') this.human(a, sim, px, py, flip, step);
      else if (a.kind === 'sheep') this.figure(SHEEP, SHEEP_COLORS, px, py, flip);
      else if (a.kind === 'chicken') this.figure(CHICKEN, CHICKEN_COLORS, px, py, flip);
      else this.figure(a.moving && step ? WOLF_RUN : WOLF, WOLF_COLORS, px, py, flip);
    }

    // Sword swings: a short white stroke that fades
    for (const sl of sim.slashes) {
      const t = (sim.time - sl.born) / 0.25;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.fillStyle = '#ffffff';
      const sx = Math.round(sl.x * TILE);
      const sy = Math.round(sl.y * TILE);
      for (let k = -2; k <= 2; k++) ctx.fillRect(sx + k * sl.dir, sy + k, 1, 1);
    }
    ctx.globalAlpha = 1;

    for (const p of sim.puffs) {
      const t = sim.time - p.born;
      ctx.globalAlpha = Math.max(0, 1 - t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round((p.x + p.vx * t) * TILE), Math.round((p.y + p.vy * t + 0.6 * t * t) * TILE), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  private human(h: Human, sim: Sim, px: number, py: number, flip: boolean, step: boolean) {
    const age = stage(h, sim.time);
    const cloth = PEOPLE_COLORS[h.people];
    const colors = {
      h: age === 'old' ? GREY_HAIR : h.hair,
      s: h.skin,
      e: '#241a14',
      c: cloth.cloth,
      p: cloth.dark,
      d: '#3a2a20',
    };
    const ctx = this.ctx;
    if (h.asleep) {
      this.figure(SLEEP, colors, px, py, flip);
      // A little "z" floating up
      const t = (sim.time * 0.8) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      const zx = Math.round(px + 2);
      const zy = Math.round(py - 5 - t * 4);
      ctx.fillRect(zx, zy, 3, 1);
      ctx.fillRect(zx + 1, zy + 1, 1, 1);
      ctx.fillRect(zx, zy + 2, 3, 1);
      ctx.globalAlpha = 1;
      return;
    }
    const walking = h.moving && step;
    const rows = age === 'child' ? (walking ? CHILD_WALK : CHILD) : h.female ? (walking ? WOMAN_WALK : WOMAN) : walking ? MAN_WALK : MAN;
    this.figure(rows, colors, px, py, flip);
    const top = Math.round(py - rows.length);
    // Carrying a load for the village: on the back
    if (h.carry) {
      ctx.fillStyle = h.carry.res === 'wood' ? '#8a5a2b' : h.carry.res === 'stone' ? '#9aa0aa' : '#e8344a';
      ctx.fillRect(Math.round(px) - (flip ? -2 : 3), top + 2, 2, 2);
    }
    // Warriors carry a little sword
    if (isWarrior(h, sim)) {
      const sx = Math.round(px) + (flip ? -3 : 3);
      ctx.fillStyle = '#d7dbe3';
      ctx.fillRect(sx, top + 1, 1, 4);
      ctx.fillStyle = '#8a5a2b';
      ctx.fillRect(sx - 1, top + 4, 3, 1);
    }
    // The village leader wears a little crown
    if (sim.villages.some((v) => v.leader === h.id && !v.ruin)) {
      ctx.fillStyle = '#ffc83d';
      ctx.fillRect(Math.round(px) - 1, top - 2, 3, 1);
      ctx.fillRect(Math.round(px) - 1, top - 3, 1, 1);
      ctx.fillRect(Math.round(px) + 1, top - 3, 1, 1);
    }
    // Selected: a little arrow above; favourite: a star
    if (h.id === this.selected) {
      ctx.fillStyle = '#ffd23f';
      const bob = Math.floor(sim.time * 3) % 2;
      ctx.fillRect(Math.round(px) - 2, top - 5 - bob, 5, 1);
      ctx.fillRect(Math.round(px) - 1, top - 4 - bob, 3, 1);
      ctx.fillRect(Math.round(px), top - 3 - bob, 1, 1);
    } else if (sim.favorites.has(h.id)) {
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(Math.round(px), top - 4, 1, 3);
      ctx.fillRect(Math.round(px) - 1, top - 3, 3, 1);
    }
    if (h.chatUntil <= sim.time) {
      const icon = h.bubbleUntil > sim.time ? h.bubble : h.grief > sim.time && sim.time % 3 < 1.6 ? 'tear' : h.hunger < 25 && sim.time % 2 < 1.2 ? 'food' : null;
      if (icon) this.thought(icon, px, top);
    }
    if (h.chatUntil > sim.time) {
      // Speech bubble with dots
      const bx = Math.round(px - 2);
      const by = Math.round(py - rows.length - 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx, by, 5, 3);
      ctx.fillStyle = '#111111';
      const n = 1 + (Math.floor(sim.time * 4) % 3);
      for (let k = 0; k < n; k++) ctx.fillRect(bx + 1 + k, by + 1, 1, 1);
    }
  }

  /** A thought bubble: white bubble with a tiny icon, above the head. */
  private thought(icon: Thought, px: number, top: number) {
    const ctx = this.ctx;
    const x0 = Math.round(px) - 3;
    const y0 = top - 9;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x0 + 1, y0, 5, 7);
    ctx.fillRect(x0, y0 + 1, 7, 5);
    ctx.fillRect(x0 + 2, y0 + 7, 2, 1);
    const rows = THOUGHTS[icon];
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 5; c++) {
        const col = THOUGHT_COLORS[rows[r][c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(x0 + 1 + c, y0 + 1 + r, 1, 1);
      }
  }

  /** Colour of a terrain for the toolbar swatches. */
  static swatch(t: Terrain): string {
    return [COLORS.deep, COLORS.shallow, COLORS.sand, COLORS.grass, COLORS.leaf, COLORS.rock][t];
  }
}
