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
import { atWar, isWarrior, WALL_HP } from './war';
import { kingIds } from './kingdoms';
import { CONFETTI, festiveAt } from './culture';
import { knows } from './inventions';
import { H, T, TILE, W, type Terrain, type World } from './world';

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
// Town buildings (Phase 8), bottom centre on their tile. r/R roof (people colours
// where it makes sense), w/W wood, g/G stone, y window, D door, o forge glow,
// k chimney, b bell, c/f goods, p columns, T marble.
const GRANARY = ['...ssss...', '..ssssss..', '.ssssssss.', 'ssssssssss', '.wwwwwwww.', '.wWwwwwWw.', '.wwwDDwww.', '.wWwDDwWw.', '.wwwDDwww.', '.WWWWWWWW.'];
const SMITHY = ['.......kk.', '.......kk.', '..RRRRRRR.', '.RRRRRRRRR', 'RRRRRRRRRR', '.gGgggggg.', '.googggDg.', '.googggDg.', '.GGGGGGDG.'];
const MARKET = ['rwrwrwrwrwr', 'rwrwrwrwrwr', '.b...b...b.', '.bcyfbcfyb.', '.b...b...b.'];
const TEMPLE = ['.....r.....', '....rrr....', '...rrrrr...', '..rrrrrrr..', '.rrrrrrrrr.', 'TTTTTTTTTTT', '.p.p.p.p.p.', '.p.p.p.p.p.', '.p.p.p.p.p.', 'TTTTTTTTTTT'];
const TOWNHALL = ['.....RR.....', '....rrrr....', '....rbbr....', '....rrrr....', '..RRRRRRRR..', '.RRRRRRRRRR.', 'RRRRRRRRRRRR', '.gggggggggg.', '.gyyggggyyg.', '.gggggggggg.', '.gyygDDgyyg.', '.ggggDDggggg', '.GGGGDDGGGG.'];
const TOWNHOUSE = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'RRRRRRRRRR', '.gggggggg.', '.gyggggyg.', '.gggggggg.', '.gyggggyg.', '.gggDDggg.', '.GGGDDGGG.'];
const BUILDING_SPRITES: Record<string, string[]> = { granary: GRANARY, smithy: SMITHY, market: MARKET, temple: TEMPLE, townhall: TOWNHALL };
const BUILDING_COLORS = {
  s: '#a0522d',
  w: '#b07a45',
  W: '#8a5a2b',
  g: '#b4b9c2',
  G: '#8d929c',
  y: '#3a4a6a',
  D: '#5a3a1e',
  o: '#ff8a1e',
  k: '#5a3a1e',
  b: '#ffd23f',
  c: '#e8344a',
  f: '#ffe066',
  T: '#d8d4c8',
  p: '#f4f1e8',
};
/** A little variety: three wood tones and three stone tones for houses. */
const WOOD_TONES = ['#b07a45', '#a06a3a', '#c08a50'];
const STONE_TONES = ['#b4b9c2', '#c3c6cc', '#a6abb6'];

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
  note: ['..kk.', '..k.k', '..k..', 'kkk..', 'kkk..'],
};
/** A tiny tool in the hand for each job: [x, y, colour] pixels, relative to the hand. */
const TOOLS: Record<string, [number, number, string][]> = {
  farmer: [[0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#b4b9c2']],
  fisher: [[0, -4, '#8a5a2b'], [0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [1, -4, '#ffffff'], [1, -3, '#ffffff']],
  woodcutter: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [1, -2, '#b4b9c2'], [1, -3, '#b4b9c2']],
  stonemason: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#9aa0aa'], [0, -3, '#9aa0aa'], [1, -3, '#9aa0aa']],
  miner: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -3, '#6c727d'], [0, -3, '#6c727d'], [1, -3, '#6c727d'], [-1, -4, '#ffd36b']],
  smith: [[0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -2, '#4a4e57'], [0, -2, '#4a4e57'], [1, -2, '#4a4e57']],
  builder: [[0, -1, '#8a5a2b'], [0, 0, '#8a5a2b'], [-1, -2, '#c08a4a'], [0, -2, '#c08a4a']],
  artist: [[0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, -3, '#ff5da2']],
  soldier: [[0, -4, '#b4b9c2'], [0, -3, '#8a5a2b'], [0, -2, '#8a5a2b'], [0, -1, '#8a5a2b'], [0, 0, '#8a5a2b']],
};
const THOUGHT_COLORS: Record<string, string> = { r: '#e8344a', g: '#8b93a3', b: '#8a5a2b', u: '#4d8dff', l: '#3aa64b', k: '#111111' };
/** Blades: a flint knife without a weapon from the smith, then bronze and iron swords. */
const BLADE = { flint: '#a89a84', bronze: '#d08a3a', iron: '#d7dbe3' };
const BOAT = ['w......w', 'wwwwwwww', '.WWWWWW.'];
/** A statue of marble on a stone base (Phase 12). */
const STATUE = ['..m..', '.mmm.', 'm.m.m', '..m..', '.mmm.', '.m.m.', 'ppppp', '.PPP.'];
const STATUE_COLORS = { m: '#e8e4d8', p: '#9aa0aa', P: '#7a808a' };
const BOAT_COLORS = { w: '#b07a45', W: '#8a5a2b' };
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
  /** Generals of the armies on the move (they carry a banner), refreshed every frame. */
  private generals = new Set<number>();
  /** Ruling kings and queens (a big crown), refreshed every frame. */
  private kings = new Set<number>();
  /** Names of the tiers for the signs ("town", "city"). */
  tierLabels: Record<string, string> = { town: 'town', city: 'city' };

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

      // The square: a patch of trodden earth, bigger in towns and cities
      const tier = v.tier ?? 'village';
      const grow = tier === 'city' ? 4 : tier === 'town' ? 2 : 0;
      ctx.fillStyle = v.ruin ? 'rgba(150, 135, 110, 0.45)' : 'rgba(214, 186, 132, 0.75)';
      ctx.fillRect(cx - 9 - grow, cy - 5 - grow, 18 + grow * 2, 11 + grow * 2);
      ctx.fillRect(cx - 7 - grow, cy - 7 - grow, 14 + grow * 2, 15 + grow * 2);

      // Paths from the square to every house and building
      if (!v.ruin) {
        ctx.fillStyle = 'rgba(204, 174, 124, 0.55)';
        for (const p of [...v.houses, ...v.buildings]) this.path(cx, cy, p.x * TILE + 4, p.y * TILE + 6);
      }

      // City wall: a ring of stone with four gates
      if (!v.ruin && v.buildings.some((b) => b.kind === 'wall')) this.wall(sim, cx, cy, 11 * TILE, 1 - (v.wallHp ?? WALL_HP) / WALL_HP);

      for (const b of v.buildings) {
        const rows = BUILDING_SPRITES[b.kind];
        if (!rows) continue;
        const px = b.x * TILE + 4;
        const py = b.y * TILE + 8;
        this.figure(rows, { ...BUILDING_COLORS, r: v.ruin ? '#8d8a84' : b.kind === 'market' ? cloth.cloth : roof.r, R: v.ruin ? '#6d6a64' : roof.R }, px, py, false);
        if (b.kind === 'townhall' || b.kind === 'temple') this.lights.push([px - 3, py - 4]);
        if (b.kind === 'smithy') this.lights.push([px - 3, py - 3]);
      }

      for (const h of v.houses) {
        const px = h.x * TILE + 4;
        const py = h.y * TILE + 8;
        if (v.ruin) {
          this.figure(RUIN, RUIN_COLORS, px, py, false);
          continue;
        }
        const rows = h.level === 0 ? TENT : h.level === 1 ? HOUSE : h.level === 2 ? STONE_HOUSE : TOWNHOUSE;
        const tone = (h.x * 3 + h.y * 7) % 3;
        this.figure(rows, { ...HOUSE_COLORS, w: WOOD_TONES[tone], g: STONE_TONES[tone], ...roof }, px, py, false);
        if (h.level === 3) this.lights.push([px - 3, py - 7]);
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

      // Statues next to the square, murals (a few bright pixels) on house walls
      for (const p of v.art ?? []) {
        const px = p.x * TILE + 4;
        const py = p.y * TILE + 8;
        if (p.kind === 'statue') {
          this.figure(STATUE, STATUE_COLORS, px, py, false);
          continue;
        }
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = CONFETTI[(p.work + i) % 5];
          ctx.fillRect(px + 1 + (i % 3), py - 3 + Math.floor(i / 3), 1, 1);
        }
      }
      // Festival: bunting in all colours around the square
      if (festiveAt(v, sim)) {
        const n = 30;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.fillStyle = CONFETTI[i % 5];
          ctx.fillRect(Math.round(cx + Math.cos(a) * 18) - 1, Math.round(cy + Math.sin(a) * 12) - 1, 2, 2);
        }
      }

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
      if (atWar(sim, { people: v.people, village: v.id })) {
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

  /** A trodden path of 2 x 2 pixel steps from (x0, y0) to (x1, y1). */
  private path(x0: number, y0: number, x1: number, y1: number) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / Math.max(1, steps);
      this.ctx.fillRect(Math.round(x0 + (x1 - x0) * t) - 1, Math.round(y0 + (y1 - y0) * t) - 1, 2, 2);
    }
  }

  /** A round wall of stone blocks with gates north, east, south and west; only on land. Damage (0…1) knocks out blocks. */
  private wall(sim: Sim, cx: number, cy: number, r: number, damage = 0) {
    const ctx = this.ctx;
    const n = Math.round((2 * Math.PI * r) / 4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const gate = Math.abs(((a + Math.PI / 4) % (Math.PI / 2)) - Math.PI / 4) < 0.18;
      if (gate || ((i * 37) % 100) / 100 < damage) continue;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.8);
      if (!sim.world.isLand(sim.world.get(Math.floor(x / TILE), Math.floor(y / TILE)))) continue;
      ctx.fillStyle = '#8d929c';
      ctx.fillRect(x - 2, y - 2, 4, 4);
      ctx.fillStyle = '#b4b9c2';
      ctx.fillRect(x - 2, y - 3, 4, 2);
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
      const tier = v.tier ?? 'village';
      // Capitals get a crown sign in front of the name
      const name = !v.ruin && [...sim.kingdoms.values()].some((k) => k.capital === v.id) ? `♛ ${v.name}` : v.name;
      const text = v.ruin ? `${v.name} · ${ruinsLabel}` : tier === 'village' ? name : `${name} · ${this.tierLabels[tier] ?? tier}`;
      ctx.font = `700 ${Math.round((tier === 'city' ? 13 : tier === 'town' ? 12 : 11) * dpr)}px system-ui, sans-serif`;
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

    this.generals = new Set(sim.armies.map((a) => a.general));
    this.kings = kingIds(sim);
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

  /** A fisher who knows boats sits in one on the water next to the fishing spot. */
  private boatTile(h: Human, sim: Sim): { x: number; y: number } | null {
    const t = h.task;
    if (h.job !== 'fisher' || t?.kind !== 'work' || t.source !== 'fish' || t.phase !== 'gather' || !knows(sim, h.people, 'boats')) return null;
    const w = sim.world;
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const k = w.get(t.tx + dx, t.ty + dy);
      if (k === T.SHALLOW || k === T.DEEP) return { x: t.tx + dx, y: t.ty + dy };
    }
    return null;
  }

  private human(h: Human, sim: Sim, px: number, py: number, flip: boolean, step: boolean) {
    const boat = this.boatTile(h, sim);
    if (boat) {
      px = boat.x * TILE + 4;
      py = boat.y * TILE + 6;
    }
    // Dancing at a festival: a little hop
    if (h.task?.kind === 'festival' && h.task.arrived && Math.floor(sim.time * 4 + h.id) % 2 === 0) py -= 1;
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
    // In the boat: the hull hides the legs, a line goes into the water
    if (boat) {
      this.figure(BOAT, BOAT_COLORS, px, py + 1, flip);
      ctx.fillStyle = '#ffffff';
      const lx = Math.round(px) + (flip ? -5 : 5);
      ctx.fillRect(lx, top + 1, 1, 6);
    }
    // Carrying a load for the village: on the back, or on a cart once they know the wheel
    if (h.carry) {
      const load = h.carry.res === 'wood' ? '#8a5a2b' : h.carry.res === 'stone' ? '#9aa0aa' : h.carry.res === 'ore' ? '#6c727d' : '#e8344a';
      if (h.carry.res !== 'food' && knows(sim, h.people, 'wheel')) {
        const cx = Math.round(px) + (flip ? 3 : -7);
        const fy = Math.round(py);
        ctx.fillStyle = load;
        ctx.fillRect(cx, fy - 4, 4, 2);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(cx, fy - 2, 4, 1);
        ctx.fillRect(flip ? cx - 1 : cx + 4, fy - 3, 1, 1);
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(cx, fy - 1, 1, 1);
        ctx.fillRect(cx + 3, fy - 1, 1, 1);
      } else {
        ctx.fillStyle = load;
        ctx.fillRect(Math.round(px) - (flip ? -2 : 3), top + 2, 2, 2);
      }
    }
    // A tool in the free hand shows the job (warriors in a war hold a sword instead)
    const warrior = isWarrior(h, sim);
    const tool = h.job && !(warrior && h.job === 'soldier') ? TOOLS[h.job] : undefined;
    if (tool && !h.carry && !boat && !this.generals.has(h.id)) {
      const hx = Math.round(px) + (flip ? 3 : -3);
      for (const [dx, dy, col] of tool) {
        ctx.fillStyle = col;
        ctx.fillRect(hx + (flip ? -dx : dx), top + 3 + dy, 1, 1);
      }
    }
    // Warriors (and armed soldiers) carry their weapon: a club, a bronze or an iron sword
    if (warrior || (h.job === 'soldier' && h.weapon)) {
      const sx = Math.round(px) + (flip ? -3 : 3);
      if (h.weapon === 'club') {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 2, 1, 3);
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(flip ? sx - 1 : sx, top, 2, 2);
      } else {
        ctx.fillStyle = h.weapon ? BLADE[h.weapon] : BLADE.flint;
        ctx.fillRect(sx, top + 1, 1, 4);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx - 1, top + 4, 3, 1);
      }
    }
    // Armour: a helmet with a little crest
    if (h.armor && age !== 'child') {
      const x0 = Math.round(px - 2.5);
      ctx.fillStyle = '#9aa0aa';
      ctx.fillRect(x0 + 1, top, 3, 1);
      ctx.fillStyle = '#c3c6cc';
      ctx.fillRect(x0 + 2, top - 1, 1, 1);
    }
    // An army's general carries its banner
    if (this.generals.has(h.id)) {
      const hx = Math.round(px) + (flip ? 3 : -3);
      const wave = Math.floor(sim.time * 4) % 2;
      const fx = flip ? hx + 1 : hx - 5;
      ctx.fillStyle = '#6b4325';
      ctx.fillRect(hx, top - 7, 1, 12);
      // Dark edge so it stands out on any ground, people colour inside, a white sign in the middle
      ctx.fillStyle = '#241a14';
      ctx.fillRect(fx, top - 7, 5, 5);
      ctx.fillRect(flip ? fx + 5 : fx - 1, top - 6 + wave, 1, 3);
      ctx.fillStyle = cloth.cloth;
      ctx.fillRect(fx + 1, top - 6, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(fx + 2, top - 5, 1, 1);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(hx, top - 8, 1, 1);
    }
    // Kings and queens wear a big crown with a ruby, village leaders a little one
    if (this.kings.has(h.id)) {
      const x = Math.round(px);
      ctx.fillStyle = '#ffc83d';
      ctx.fillRect(x - 2, top - 2, 5, 1);
      ctx.fillRect(x - 2, top - 3, 1, 1);
      ctx.fillRect(x, top - 4, 1, 2);
      ctx.fillRect(x + 2, top - 3, 1, 1);
      ctx.fillStyle = '#e8344a';
      ctx.fillRect(x, top - 2, 1, 1);
    } else if (sim.villages.some((v) => v.leader === h.id && !v.ruin)) {
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
