/**
 * Draws the island. The map lives in an offscreen canvas (one pixel buffer of
 * 1280 × 800); only dirty tiles are redrawn into it. Every frame the visible
 * part is copied to the screen with nearest-neighbour scaling (pixel look),
 * then people, animals, graves and puffs, the brush outline and the night
 * darkening go on top. Figures are tiny pixel sprites drawn from strings.
 */
import { GREY_HAIR, hasPower, PEOPLE_COLORS, stage, type Agent, type Human, type Look, type People, type Power, type Thought } from './agents';
import type { Camera } from './camera';
import { COLORS, paintTile } from './tiles';
import type { Sim } from './sim';
import { atWar, isWarrior, wallMax } from './war';
import { kingIds } from './kingdoms';
import { CONFETTI, festiveAt } from './culture';
import { knows } from './inventions';
import { SHOT_TIME, UNIT, type Unit } from './armies';
import { T, TILE, type Terrain, type World } from './world';
import { tileHash } from './rng';
import { dockOf, type Ship, type ShipKind } from './ships';

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
/** Horses (phase F): wild on the grass, or carrying a rider. */
const HORSE = ['......h.', '.....hhk', 'mhhhhhh.', '.hhhhhh.', '.h.h.h.h', '.d.d.d.d'];
const HORSE_RUN = ['......h.', '.....hhk', 'mhhhhhh.', '.hhhhhh.', 'h..hh..h', 'd..dd..d'];
const HORSE_COLORS = { h: '#9a6a3e', m: '#3a2a20', k: '#3a2a20', d: '#3a2a20' };
/** Ships and wrecks (phase G), bow to the right. f flag and c sails in the colour of the people. */
const SHIPS: Record<ShipKind, string[]> = {
  explorer: ['....f.....', '....ms....', '....mss...', '....msss..', '....mssss.', 'hhhhhhhhhh', '.HHHHHHHH.'],
  settler: ['...f....f...', '...ms...ms..', '...mss..mss.', '...msss.msss', '.pp.pp..pp..', 'hhhhhhhhhhhh', '.HHHHHHHHHH.'],
  trader: ['.....f......', '.....ms.....', '.....mss....', '.cc..msss...', '.ccC.mssss..', 'hhhhhhhhhhhh', '.HHHHHHHHHH.'],
  warship: ['....f.....f...', '....mc....mc..', '....mcc...mcc.', '....mccc..mccc', '....mcccc.mccc', 'hhhhhhhhhhhhhh', 'hkhkhkhkhkhkhh', '.HHHHHHHHHHHH.'],
};
const SHIP_COLORS = { h: '#8a5a2b', H: '#5a3a1e', m: '#5a3a1e', s: '#f4f1e8', p: '#e2b48c', C: '#8a5a2b', k: '#241a14' };
const WRECK = ['..m.......', '...m......', 'hh.hhh.hh.', '.HH.HHH...'];
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
/** Buildings of later ages (phase E): the windmill's sails are drawn turning on top. */
const WINDMILL = ['...k...', '..www..', '..wyw..', '..www..', '.wwwww.', '.wwDww.', '.WWDWW.'];
const LIBRARY = ['....rr....', '...rrrr...', '..rrrrrr..', '.rrrrrrrr.', 'TTTTTTTTTT', '.p.p..p.p.', '.p.pccp.p.', '.p.pffp.p.', '.p.pDDp.p.', 'TTTTDDTTTT'];
/** A barracks (phase F): a long hall with a red flag. */
const BARRACKS = ['........cc', '........kc', '........k.', '.RRRRRRRk.', 'RRRRRRRRRR', '.gwwwwwwg.', '.gyw..wyg.', '.gwwDDwwg.', '.GWWDDWWG.'];
/** A harbor (phase G): a boat shed with a crane; the pier is drawn on the water next to it. */
const HARBOR = ['.......kkk', '.......k.y', '..RRRR.k..', '.RRRRRRk..', 'RRRRRRRRk.', '.wwwwwww..', '.wDwwyww..', 'WWDWWWWWW.'];
const FACTORY = ['........k.', '........k.', 'nnnnnnn.k.', 'nNnnNnnnkn', 'nnnnnnnnnn', 'nyynyynyyn', 'nnnnnnnnnn', 'nyynDDnyyn', 'NNNNDDNNNN'];
const BUILDING_SPRITES: Record<string, string[]> = {
  granary: GRANARY,
  smithy: SMITHY,
  market: MARKET,
  temple: TEMPLE,
  townhall: TOWNHALL,
  windmill: WINDMILL,
  library: LIBRARY,
  factory: FACTORY,
  barracks: BARRACKS,
  harbor: HARBOR,
};
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
  n: '#a0442c',
  N: '#7a3020',
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
/** Units that carry something else than a sword or club (phase F). */
const GEAR = new Set<Unit>(['spear', 'archer', 'crossbow', 'musketeer', 'catapult', 'cannon']);
const BOAT = ['w......w', 'wwwwwwww', '.WWWWWW.'];
/** A statue of marble on a stone base (Phase 12). */
const STATUE = ['..m..', '.mmm.', 'm.m.m', '..m..', '.mmm.', '.m.m.', 'ppppp', '.PPP.'];
const STATUE_COLORS = { m: '#e8e4d8', p: '#9aa0aa', P: '#7a808a' };
const BOAT_COLORS = { w: '#b07a45', W: '#8a5a2b' };
const GRAVE = ['.GGG.', 'GGgGG', 'GgggG', 'GGgGG', 'GGGGG', 'ddddd'];
const GRAVE_COLORS = { G: '#a3a9b4', g: '#6c727d', d: '#7a5c3c' };

/* ---- people: sprite, looks and the editor preview (shared) ---------------------------- */

/** A darker shade of a colour (trousers under a shirt of that colour). */
function shade(hex: string, f = 0.7) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
}

interface PersonLook {
  female: boolean;
  hair: string;
  skin: string;
  people: People;
  look?: Look;
  powers?: Power[];
}

/**
 * Rows and colours of a person's sprite. Own characters may wear their own
 * clothing colour; eternal youth keeps an old body young and the hair dark.
 */
export function personSprite(p: PersonLook, age: 'child' | 'adult' | 'old', walking: boolean) {
  const shown = age === 'old' && hasPower(p, 'eternalYouth') ? 'adult' : age;
  const people = PEOPLE_COLORS[p.people];
  const cloth = p.look?.cloth ?? people.cloth;
  const colors: Record<string, string> = {
    h: shown === 'old' ? GREY_HAIR : p.hair,
    s: p.skin,
    e: '#241a14',
    c: cloth,
    p: p.look?.cloth ? shade(cloth) : people.dark,
    d: '#3a2a20',
  };
  const rows = shown === 'child' ? (walking ? CHILD_WALK : CHILD) : p.female ? (walking ? WOMAN_WALK : WOMAN) : walking ? MAN_WALK : MAN;
  return { rows, colors, shown };
}

/**
 * Hair style, beard and hat over a grown-up sprite (5 wide). `dot(x, y, c)`
 * paints one pixel, x 0…4 from the left of the sprite, y from its top row
 * (negative = above the head).
 */
export function drawLook(look: Look, colors: Record<string, string>, dot: (x: number, y: number, c: string) => void) {
  const hair = colors.h;
  if (look.hairStyle === 'bald') for (let x = 1; x <= 3; x++) dot(x, 0, colors.s);
  if (look.hairStyle === 'long') {
    dot(0, 1, hair);
    dot(4, 1, hair);
    dot(0, 2, hair);
    dot(4, 2, hair);
  }
  if (look.hairStyle === 'bun') dot(2, -1, hair);
  if (look.hairStyle === 'spiky') {
    dot(1, -1, hair);
    dot(3, -1, hair);
  }
  if (look.beard) for (let x = 1; x <= 3; x++) dot(x, 2, hair);
  if (look.hat === 'hat') {
    for (let x = 0; x <= 4; x++) dot(x, 0, '#5a3a1e');
    for (let x = 1; x <= 3; x++) dot(x, -1, '#7a4a24');
  } else if (look.hat === 'crown') {
    for (let x = 1; x <= 3; x++) dot(x, -1, '#ffc83d');
    dot(1, -2, '#ffc83d');
    dot(3, -2, '#ffc83d');
    dot(2, -1, '#e8344a');
  } else if (look.hat === 'hood') {
    for (let x = 0; x <= 4; x++) dot(x, 0, colors.c);
    for (let x = 1; x <= 3; x++) dot(x, -1, colors.c);
    dot(0, 1, colors.c);
    dot(4, 1, colors.c);
  } else if (look.hat === 'flower') {
    dot(4, 0, '#ff5da2');
    dot(4, -1, '#ffe066');
  }
}

/** The editor preview: the person drawn big on its own canvas (pixel look). */
export function paintPreview(canvas: HTMLCanvasElement, p: PersonLook & { age: number }) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const scale = Math.floor(Math.min(canvas.width / 9, canvas.height / 11));
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const age = p.age < 15 ? 'child' : p.age >= 60 ? 'old' : 'adult';
  const { rows, colors, shown } = personSprite(p, age, false);
  const w = rows[0].length;
  const x0 = Math.round((canvas.width - w * scale) / 2);
  const y0 = Math.round(canvas.height - (rows.length + 1) * scale);
  const dot = (x: number, y: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x0 + x * scale, y0 + y * scale, scale, scale);
  };
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < w; c++) if (colors[rows[r][c]]) dot(c, r, colors[rows[r][c]]);
  if (shown !== 'child' && p.look) drawLook(p.look, colors, dot);
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private map: HTMLCanvasElement;
  private mapCtx: CanvasRenderingContext2D;
  private image: ImageData;
  private px: Uint32Array;
  /** The fog (phase G): one pixel per tile, drawn scaled up and soft. */
  private readonly fogCanvas: HTMLCanvasElement;
  private fogShown = -1;
  private fogged = false;
  private dpr = 1;
  private selected: number | null = null;
  /** Window and fire spots (world px) that glow at night. */
  private readonly lights: [number, number][] = [];
  /** Text after a village name when it lies in ruins. */
  ruinsLabel = 'ruins';
  /** Generals of the armies on the move (they carry a banner), refreshed every frame. */
  private generals = new Set<number>();
  /** The place whose profile is open: its sign is golden. */
  selectedVillage: number | null = null;
  /** Where the signs were drawn last frame (CSS px), for clicks. */
  private signs: { id: number; x: number; y: number; w: number; h: number }[] = [];
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
    this.mapCtx = this.map.getContext('2d')!;
    this.image = this.mapCtx.createImageData(1, 1);
    this.px = new Uint32Array(this.image.data.buffer);
    this.fogCanvas = document.createElement('canvas');
    this.sizeMap();
  }

  /** The offscreen map as big as the world (old islands 1280 × 800, new worlds 2560 × 1600). */
  private sizeMap() {
    const w = this.world.w * TILE;
    const h = this.world.h * TILE;
    if (this.map.width === w && this.map.height === h && this.image.width === w) return;
    this.map.width = w;
    this.map.height = h;
    this.mapCtx = this.map.getContext('2d')!;
    this.image = this.mapCtx.createImageData(w, h);
    this.px = new Uint32Array(this.image.data.buffer);
    this.fogCanvas.width = this.world.w;
    this.fogCanvas.height = this.world.h;
    this.fogShown = -1;
    this.world.all = true;
  }

  /** The fog image, rebuilt when some of it lifted: misty grey-blue, a little cloudy. */
  private refreshFog() {
    const world = this.world;
    if (this.fogShown === world.fogVersion && this.fogCanvas.width === world.w) return;
    this.fogShown = world.fogVersion;
    const fctx = this.fogCanvas.getContext('2d')!;
    const img = fctx.createImageData(world.w, world.h);
    const d = img.data;
    let any = false;
    for (let i = 0; i < world.w * world.h; i++) {
      if (!world.fog[i]) continue;
      any = true;
      const x = i % world.w;
      const y = (i / world.w) | 0;
      // Big soft patches, a little finer grain on top: clouds rather than noise
      const t = tileHash(Math.floor(x / 6), Math.floor(y / 5), 77) * 0.6 + tileHash(Math.floor(x / 2), Math.floor(y / 2), 78) * 0.3 + tileHash(x, y, 79) * 0.1;
      d[i * 4] = 176 + t * 40;
      d[i * 4 + 1] = 188 + t * 36;
      d[i * 4 + 2] = 204 + t * 30;
      d[i * 4 + 3] = 255;
    }
    fctx.putImageData(img, 0, 0);
    this.fogged = any;
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
    this.sizeMap();
    const W = world.w;
    const H = world.h;
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
    // Only the part of the map on screen (a big world is 2560 × 1600 pixels)
    const vx0 = Math.max(0, Math.floor(cam.x - cam.vw / 2 / cam.zoom) - 1);
    const vy0 = Math.max(0, Math.floor(cam.y - cam.vh / 2 / cam.zoom) - 1);
    const vx1 = Math.min(this.map.width, Math.ceil(cam.x + cam.vw / 2 / cam.zoom) + 1);
    const vy1 = Math.min(this.map.height, Math.ceil(cam.y + cam.vh / 2 / cam.zoom) + 1);
    if (vx1 > vx0 && vy1 > vy0) ctx.drawImage(this.map, vx0, vy0, vx1 - vx0, vy1 - vy0, vx0, vy0, vx1 - vx0, vy1 - vy0);
    this.drawLife(cam, sim);
    // The fog over what nobody has seen yet (phase G), soft at the edges
    this.refreshFog();
    if (this.fogged) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.fogCanvas, 0, 0, this.world.w * TILE, this.world.h * TILE);
      ctx.imageSmoothingEnabled = false;
    }

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
    this.rails(sim);
    for (const v of sim.villages) {
      if (v.merged) continue;
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
      if (!v.ruin && v.buildings.some((b) => b.kind === 'wall')) {
        const full = wallMax(sim, v);
        this.wall(sim, cx, cy, 11 * TILE, 1 - (v.wallHp ?? full) / full, knows(sim, v.people, 'castle'));
      }

      for (const b of v.buildings) {
        const rows = BUILDING_SPRITES[b.kind];
        if (!rows) continue;
        const px = b.x * TILE + 4;
        const py = b.y * TILE + 8;
        this.figure(rows, { ...BUILDING_COLORS, r: v.ruin ? '#8d8a84' : b.kind === 'market' ? cloth.cloth : roof.r, R: v.ruin ? '#6d6a64' : roof.R }, px, py, false);
        if (b.kind === 'townhall' || b.kind === 'temple') this.lights.push([px - 3, py - 4]);
        if (b.kind === 'smithy') this.lights.push([px - 3, py - 3]);
        if (b.kind === 'windmill' && !v.ruin) this.sails(px, py - 6, sim.time);
        if (b.kind === 'factory' && !v.ruin) this.smoke(px + 3, py - 9, sim.time, b.x * 7 + b.y, '#8a8a8a');
        if (b.kind === 'library') this.lights.push([px - 2, py - 4]);
        if (b.kind === 'harbor') this.pier(b, px, py);
        // Banks: gold coins at the market
        if (b.kind === 'market' && !v.ruin && knows(sim, v.people, 'banking')) {
          ctx.fillStyle = '#ffc83d';
          ctx.fillRect(px - 3, py - 2, 2, 1);
          ctx.fillRect(px + 2, py - 2, 2, 1);
          ctx.fillRect(px - 2, py - 3, 1, 1);
        }
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
      // A league member: a pennant in the league's colour under it
      const league = sim.leagues.find((l) => l.members.includes(v.id));
      if (league) {
        ctx.fillStyle = league.color;
        ctx.fillRect(cx - 6, cy - 9, 3, 2);
        ctx.fillRect(cx - 6, cy - 7, 2, 1);
      }
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
  /** Windmill sails, slowly turning around their hub. */
  private sails(x: number, y: number, time: number) {
    const ctx = this.ctx;
    for (let i = 0; i < 4; i++) {
      const a = time * 1.5 + (i * Math.PI) / 2;
      for (let j = 1; j <= 4; j++) {
        ctx.fillStyle = j === 4 ? '#8a5a2b' : '#f4f1e8';
        ctx.fillRect(Math.round(x + Math.cos(a) * j), Math.round(y + Math.sin(a) * j * 0.9), 1, 1);
      }
    }
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  /** A rising wisp of smoke. */
  private smoke(x: number, y: number, time: number, seed: number, colour: string) {
    const ctx = this.ctx;
    for (let k = 0; k < 4; k++) {
      const t = (time * 0.4 + k / 4 + (seed % 10) / 10) % 1;
      ctx.globalAlpha = 0.75 * (1 - t);
      ctx.fillStyle = colour;
      ctx.fillRect(Math.round(x + Math.sin(t * 6) * 2), Math.round(y - t * 12), 3, 3);
    }
    ctx.globalAlpha = 1;
  }

  /** Railways: a track from every town of a railway people to its nearest town (phase E). */
  private rails(sim: Sim) {
    const ctx = this.ctx;
    const w = sim.world;
    const towns = sim.villages.filter((v) => !v.ruin && !v.merged && (v.tier === 'town' || v.tier === 'city') && knows(sim, v.people, 'railway'));
    const done = new Set<string>();
    for (const a of towns) {
      let best: (typeof towns)[number] | null = null;
      let bestD = 60;
      for (const b of towns) {
        if (b === a || b.people !== a.people) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bestD) {
          bestD = d;
          best = b;
        }
      }
      if (!best) continue;
      const key = a.id < best.id ? `${a.id}|${best.id}` : `${best.id}|${a.id}`;
      if (done.has(key)) continue;
      done.add(key);
      const x0 = a.x * TILE + 4;
      const y0 = a.y * TILE + 4;
      const x1 = best.x * TILE + 4;
      const y1 = best.y * TILE + 4;
      const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let i = 0; i <= steps; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / steps);
        const y = Math.round(y0 + ((y1 - y0) * i) / steps);
        if (!w.isLand(w.get(Math.floor(x / TILE), Math.floor(y / TILE)))) continue;
        ctx.fillStyle = i % 4 === 0 ? '#8a5a2b' : '#4a4e57';
        ctx.fillRect(x - (i % 4 === 0 ? 1 : 0), y, i % 4 === 0 ? 3 : 1, 1);
      }
    }
  }

  private wall(sim: Sim, cx: number, cy: number, r: number, damage = 0, towers = false) {
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
    // Castles: four towers between the gates
    if (!towers) return;
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.8);
      if (!sim.world.isLand(sim.world.get(Math.floor(x / TILE), Math.floor(y / TILE)))) continue;
      ctx.fillStyle = '#8d929c';
      ctx.fillRect(x - 3, y - 7, 6, 9);
      ctx.fillStyle = '#b4b9c2';
      ctx.fillRect(x - 3, y - 8, 2, 1);
      ctx.fillRect(x + 1, y - 8, 2, 1);
      ctx.fillStyle = '#3a4a6a';
      ctx.fillRect(x, y - 4, 1, 2);
    }
  }

  /** Village names over the squares, in screen pixels so they stay readable. */
  private drawLabels(cam: Camera, sim: Sim, ruinsLabel: string) {
    this.signs = [];
    if (cam.zoom < 0.5) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const v of sim.villages) {
      // Ruins pile up over the centuries: their signs only show up close; merged places are gone
      if (v.merged || (v.ruin && cam.zoom < 3) || !this.world.seen(v.x, v.y)) continue;
      const sx = ((v.x + 0.5) * TILE - cam.x) * cam.zoom * dpr + (cam.vw / 2) * dpr;
      const sy = ((v.y + 0.5) * TILE - 14 - cam.y) * cam.zoom * dpr + (cam.vh / 2) * dpr - 10 * dpr;
      if (sx < -100 || sy < -30 || sx > this.canvas.width + 100 || sy > this.canvas.height + 30) continue;
      const tier = v.tier ?? 'village';
      // Capitals get a crown sign in front of the name
      const name = !v.ruin && [...sim.kingdoms.values()].some((k) => k.capital === v.id) ? `♛ ${v.name}` : v.name;
      const text = v.ruin ? `${v.name} · ${ruinsLabel}` : tier === 'village' ? name : `${name} · ${this.tierLabels[tier] ?? tier}`;
      // A little wooden sign with a parchment plate and a dot in the colour of the people
      ctx.font = `600 ${Math.round((tier === 'city' ? 14 : tier === 'town' ? 13 : 12) * dpr)}px "Pixelify Sans Variable", system-ui, sans-serif`;
      const dot = 9 * dpr;
      const w = ctx.measureText(text).width + 14 * dpr + dot;
      const h = 19 * dpr;
      const x0 = sx - w / 2;
      const y0 = sy - h / 2;
      const selected = v.id === this.selectedVillage;
      ctx.globalAlpha = v.ruin ? 0.65 : 1;
      ctx.fillStyle = 'rgba(40, 22, 8, 0.45)';
      ctx.fillRect(x0 + 2 * dpr, y0 + 2 * dpr, w, h);
      ctx.fillStyle = '#4e2d14';
      ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = selected ? '#f2cf6b' : v.ruin ? '#d8cfbb' : '#f3e6c4';
      ctx.fillRect(x0 + 2 * dpr, y0 + 2 * dpr, w - 4 * dpr, h - 4 * dpr);
      ctx.fillStyle = 'rgba(122, 74, 36, 0.25)';
      ctx.fillRect(x0 + 2 * dpr, y0 + h - 4 * dpr, w - 4 * dpr, 2 * dpr);
      ctx.fillStyle = '#4e2d14';
      ctx.fillRect(x0 + 6 * dpr - dpr, sy - dot / 2 + 1.5 * dpr - dpr, dot - 3 * dpr + 2 * dpr, dot - 3 * dpr + 2 * dpr);
      ctx.fillStyle = v.ruin ? '#8b8f99' : PEOPLE_COLORS[v.people].cloth;
      ctx.fillRect(x0 + 6 * dpr, sy - dot / 2 + 1.5 * dpr, dot - 3 * dpr, dot - 3 * dpr);
      ctx.fillStyle = '#3b2a1a';
      ctx.fillText(text, sx + dot / 2 + 1 * dpr, sy + dpr);
      this.signs.push({ id: v.id, x: x0 / dpr, y: y0 / dpr, w: w / dpr, h: h / dpr });
    }
    ctx.globalAlpha = 1;
  }

  /** The place whose sign is under (x, y) in CSS px, or null. */
  villageAt(x: number, y: number): number | null {
    for (let i = this.signs.length - 1; i >= 0; i--) {
      const s = this.signs[i];
      if (x >= s.x - 4 && x <= s.x + s.w + 4 && y >= s.y - 4 && y <= s.y + s.h + 4) return s.id;
    }
    return null;
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
    const world = this.world;
    const visible = (a: { x: number; y: number }) => a.x > x0 && a.x < x1 && a.y > y0 && a.y < y1 && world.seen(Math.floor(a.x), Math.floor(a.y));

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
    // Wrecks fade over their three years; ships bob on the waves (phase G)
    for (const wr of sim.wrecks) {
      if (!visible(wr)) continue;
      ctx.globalAlpha = Math.max(0.25, Math.min(1, (wr.until - sim.time) / 30));
      this.figure(WRECK, SHIP_COLORS, wr.x * TILE, wr.y * TILE + 3, false);
    }
    ctx.globalAlpha = 1;
    for (const ship of sim.ships) if (visible(ship)) this.ship(ship, sim);

    this.generals = new Set(sim.armies.map((a) => a.general));
    this.kings = kingIds(sim);
    const all: Agent[] = [];
    for (const h of sim.humans) if (h.aboard === undefined && visible(h)) all.push(h);
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
      else if (a.kind === 'horse') this.figure(a.moving && step ? HORSE_RUN : HORSE, HORSE_COLORS, px, py, flip);
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

    // Shots in the air (phase F): arrows and bolts, stones in a high arc, cannon balls, musket fire
    for (const sh of sim.shots) {
      const t = (sim.time - sh.born) / SHOT_TIME;
      if (t > 1) continue;
      const arc = sh.kind === 'stone' ? 3 : sh.kind === 'arrow' ? 1 : sh.kind === 'ball' ? 0.6 : 0;
      const x = Math.round((sh.x0 + (sh.x1 - sh.x0) * t) * TILE);
      const y = Math.round((sh.y0 + (sh.y1 - sh.y0) * t - Math.sin(Math.PI * t) * arc) * TILE);
      const dir = sh.x1 >= sh.x0 ? 1 : -1;
      if (sh.kind === 'arrow' || sh.kind === 'bolt') {
        ctx.fillStyle = sh.kind === 'arrow' ? '#f4f1e8' : '#c3c6cc';
        ctx.fillRect(x - dir, y, 1, 1);
        ctx.fillRect(x, y, 1, 1);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(x - 2 * dir, y, 1, 1);
      } else if (sh.kind === 'bullet') {
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(x, y, 1, 1);
      } else {
        ctx.fillStyle = sh.kind === 'stone' ? '#8d929c' : '#2b2b2b';
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
    }

    for (const p of sim.puffs) {
      const t = sim.time - p.born;
      ctx.globalAlpha = Math.max(0, 1 - t / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round((p.x + p.vx * t) * TILE), Math.round((p.y + p.vy * t + 0.6 * t * t) * TILE), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** What a unit carries: spear, bow, crossbow or musket in the hand, or the engine it works. */
  private gear(unit: Unit, px: number, py: number, top: number, flip: boolean) {
    const ctx = this.ctx;
    const d = flip ? -1 : 1;
    const sx = Math.round(px) + 3 * d;
    const px1 = (x: number, y: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    };
    switch (unit) {
      case 'spear':
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top - 3, 1, 9);
        px1(sx, top - 4, '#c3c6cc');
        break;
      case 'archer':
        for (const [x, y] of [[0, 0], [1, 1], [1, 2], [1, 3], [0, 4]]) px1(sx + x * d, top + y, '#8a5a2b');
        ctx.fillStyle = '#f4f1e8';
        ctx.fillRect(sx, top + 1, 1, 3);
        break;
      case 'crossbow':
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(flip ? sx - 3 : sx, top + 3, 4, 1);
        ctx.fillStyle = '#9aa0aa';
        ctx.fillRect(sx + 3 * d, top + 2, 1, 3);
        break;
      case 'musketeer':
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(sx, top - 2, 1, 6);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 4, 1, 2);
        break;
      case 'catapult': {
        // A wooden frame on wheels, the arm leaning back with a stone in its cup
        const ex = Math.round(px) + (flip ? -10 : 4);
        const ey = Math.round(py);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(ex, ey - 2, 6, 1);
        ctx.fillRect(ex + 3, ey - 4, 1, 2);
        for (let k = 0; k < 4; k++) px1(ex + (flip ? 4 - k : 1 + k), ey - 3 - k, '#6b4325');
        px1(ex + (flip ? 0 : 5), ey - 7, '#8d929c');
        ctx.fillStyle = '#3a2a20';
        ctx.fillRect(ex, ey - 1, 2, 1);
        ctx.fillRect(ex + 4, ey - 1, 2, 1);
        break;
      }
      case 'cannon': {
        // A dark barrel on a wooden carriage
        const ex = Math.round(px) + (flip ? -9 : 4);
        const ey = Math.round(py);
        ctx.fillStyle = '#2b2b2b';
        ctx.fillRect(ex, ey - 4, 5, 2);
        px1(flip ? ex - 1 : ex + 5, ey - 4, '#2b2b2b');
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(ex + 1, ey - 2, 3, 1);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(ex + 1, ey - 1, 2, 1);
        break;
      }
    }
  }

  /** A wooden pier from the harbor out onto its dock tile. */
  private pier(b: { x: number; y: number }, px: number, py: number) {
    const dock = dockOf(this.world, b);
    if (!dock) return;
    const ctx = this.ctx;
    const tx = dock.x * TILE + 4;
    const ty = dock.y * TILE + 5;
    const steps = Math.max(1, Math.round(Math.hypot(tx - px, ty - (py - 2)) / 2));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(px + ((tx - px) * i) / steps);
      const y = Math.round(py - 2 + ((ty - py + 2) * i) / steps);
      ctx.fillStyle = i % 2 ? '#8a5a2b' : '#a8743f';
      ctx.fillRect(x - 2, y, 4, 2);
    }
    ctx.fillStyle = '#5a3a1e';
    ctx.fillRect(tx - 3, ty + 2, 1, 2);
    ctx.fillRect(tx + 2, ty + 2, 1, 2);
  }

  /** A ship: hull, sails in the colours of its people, a wake when it moves, damage as a little bar. */
  private ship(ship: Ship, sim: Sim) {
    const ctx = this.ctx;
    const cloth = PEOPLE_COLORS[ship.people];
    const bob = Math.round(Math.sin(sim.time * 2.2 + ship.id) * 0.6);
    const px = ship.x * TILE;
    const py = ship.y * TILE + 3 + bob;
    const rows = SHIPS[ship.kind];
    if (ship.moving) {
      ctx.fillStyle = '#d5ecff';
      const back = Math.round(px - ship.facing * (rows[0].length / 2 + 2));
      ctx.fillRect(back, Math.round(py) - 1, 2, 1);
      ctx.fillRect(back - ship.facing * 3, Math.round(py), 2, 1);
    }
    this.figure(rows, { ...SHIP_COLORS, f: cloth.cloth, c: ship.kind === 'trader' ? '#c0843c' : cloth.cloth }, px, py, ship.facing < 0);
    if (ship.hp < ship.maxHp) {
      const w = 10;
      const x = Math.round(px - w / 2);
      const y = Math.round(py - rows.length - 3);
      ctx.fillStyle = '#241a14';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = ship.hp / ship.maxHp > 0.4 ? '#3ddc84' : '#e8344a';
      ctx.fillRect(x, y, Math.max(1, Math.round((w * ship.hp) / ship.maxHp)), 2);
    }
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
    const walking = h.moving && step;
    const { rows, colors, shown } = personSprite(h, age, walking);
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
    // Riders and knights (phase F) sit on a horse
    if (h.unit && UNIT[h.unit].mounted) {
      this.figure(h.moving && step ? HORSE_RUN : HORSE, HORSE_COLORS, px, py, flip);
      py -= 3;
    }
    this.figure(rows, colors, px, py, flip);
    const top = Math.round(py - rows.length);
    // Own characters: hair style, beard and hat
    if (h.look && shown !== 'child') {
      const x0 = Math.round(px - 2.5);
      drawLook(h.look, colors, (x, y, c) => {
        ctx.fillStyle = c;
        ctx.fillRect(x0 + (flip ? 4 - x : x), top + y, 1, 1);
      });
    }
    // In the boat: the hull hides the legs, a line goes into the water
    if (boat) {
      this.figure(BOAT, BOAT_COLORS, px, py + 1, flip);
      ctx.fillStyle = '#ffffff';
      const lx = Math.round(px) + (flip ? -5 : 5);
      ctx.fillRect(lx, top + 1, 1, 6);
      // Navigation: a mast with a sail
      if (knows(sim, h.people, 'navigation')) {
        const mx = Math.round(px) + (flip ? 3 : -3);
        ctx.fillStyle = '#5a3a1e';
        ctx.fillRect(mx, top - 3, 1, 10);
        ctx.fillStyle = '#f4f1e8';
        for (let r = 0; r < 5; r++) ctx.fillRect(flip ? mx + 1 : mx - 1 - Math.floor(r / 2), top - 2 + r, 1 + Math.floor(r / 2), 1);
      }
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
    // Units with gear of their own (phase F): spears, bows, crossbows, muskets, siege engines
    if (warrior && h.unit && GEAR.has(h.unit)) this.gear(h.unit, px, py, top, flip);
    // Warriors (and armed soldiers) carry their weapon: a club, a bronze or an iron sword
    else if (warrior || (h.job === 'soldier' && h.weapon)) {
      const sx = Math.round(px) + (flip ? -3 : 3);
      if (h.weapon === 'club') {
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 2, 1, 3);
        ctx.fillStyle = '#6b4325';
        ctx.fillRect(flip ? sx - 1 : sx, top, 2, 2);
      } else if (h.weapon === 'musket') {
        // A long dark barrel on a wooden stock
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(sx, top - 2, 1, 6);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx, top + 4, 1, 2);
      } else {
        ctx.fillStyle = h.weapon ? BLADE[h.weapon] : BLADE.flint;
        ctx.fillRect(sx, top + 1, 1, 4);
        ctx.fillStyle = '#8a5a2b';
        ctx.fillRect(sx - 1, top + 4, 3, 1);
      }
    }
    // Chainmail (phase E): grey rings over the chest of the armoured
    if (h.armor && age !== 'child' && knows(sim, h.people, 'chainmail')) {
      const x0 = Math.round(px - 2.5);
      ctx.fillStyle = '#c3c6cc';
      ctx.fillRect(x0 + 1, top + 2, 1, 1);
      ctx.fillRect(x0 + 3, top + 2, 1, 1);
      ctx.fillRect(x0 + 2, top + 3, 1, 1);
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
    } else if (h.custom) {
      // Own characters: a light blue ✦ with a white heart
      const x = Math.round(px);
      const y = top - (h.look?.hat && h.look.hat !== 'none' ? 6 : 4);
      ctx.fillStyle = '#7fd6ff';
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, 1, 1);
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
