/**
 * How one tile looks: terrain colours and 8 x 8 pixel sprites (trees, peaks,
 * bushes, foam, snow), painted into a 32-bit pixel buffer of the whole map
 * (world width × 8 pixels wide, RGBA in memory). Pure code without a canvas, so the renderer
 * and the preview-image script (scripts/tiny-island-art.mjs) share it.
 */
import { tileHash } from './rng';
import { DEPOSIT, T, TILE, type World } from './world';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  // ImageData is RGBA in memory; as a little-endian Uint32 that is ABGR
  return (255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16);
};

export const COLORS = {
  deep: '#2c5fbf',
  deepLight: '#3a70d0',
  shallow: '#4c9ae6',
  shallowLight: '#66afef',
  foam: '#d5ecff',
  sand: '#f1d68a',
  sandDark: '#dcbd68',
  grass: '#72c655',
  grassDark: '#5cb046',
  grassLight: '#8ad66b',
  flowerPink: '#ff8fc0',
  flowerYellow: '#ffe066',
  leaf: '#2f8a3a',
  leafLight: '#4aa94e',
  leafDark: '#226d2c',
  trunk: '#6b4325',
  rock: '#7d8292',
  rockLight: '#a8adba',
  rockDark: '#626777',
  snow: '#f5f7fc',
  soil: '#9a6b3c',
  soilDark: '#86592f',
  sprout: '#7fd35c',
  wheatGreen: '#b9cf52',
  wheat: '#e8c34a',
  wheatTop: '#f6dd7a',
  bush: '#2f7d36',
  bushLight: '#47a54d',
  berry: '#e8344a',
  gold: '#ffcf33',
  glint: '#ffffff',
  spice: '#e0461f',
  spiceLeaf: '#2d7a2f',
};

const C = Object.fromEntries(Object.entries(COLORS).map(([k, v]) => [k, rgb(v)])) as Record<keyof typeof COLORS, number>;

// 8 × 8 sprites, one character per pixel ('.' = keep the ground below)
const TREE_ROUND = ['..LLLL..', '.LLHHLL.', 'LLHHLLLL', 'LLLLLLDL', '.LLLLDD.', '..DDDD..', '...TT...', '...TT...'];
const TREE_PINE = ['...LL...', '..LHLL..', '..LLLL..', '.LHLLLL.', '.LLLLDL.', 'LLLLLDDL', '...TT...', '...TT...'];
const PEAK = ['...ll...', '..llld..', '..lldd..', '.llldd..', '.llddd..', 'llldddd.', 'lldddddd', 'rrrrrrrr'];
const BUSH = ['........', '...bb...', '..bBBb..', '.bBBBBb.', '.BBBBBB.', '..BBBB..', '........', '........'];
const BERRIES = [
  [3, 2],
  [5, 3],
  [2, 4],
];
const SPRITE_COLORS: Record<string, number> = {
  B: C.bush,
  b: C.bushLight,
  L: C.leaf,
  H: C.leafLight,
  D: C.leafDark,
  T: C.trunk,
  l: C.rockLight,
  d: C.rockDark,
  r: C.rock,
};


/** Paints tile (x, y) of `world` into `buf` (the map buffer, world.w * TILE pixels wide). */
export function paintTile(world: World, buf: Uint32Array, x: number, y: number) {
  function fill(x: number, y: number, color: number) {
    const stride = world.w * TILE;
    let o = y * TILE * stride + x * TILE;
    for (let r = 0; r < TILE; r++, o += stride) buf.fill(color, o, o + TILE);
  }

  function dot(x: number, y: number, px: number, py: number, color: number) {
    buf[(y * TILE + py) * world.w * TILE + x * TILE + px] = color;
  }

  function sprite(x: number, y: number, rows: string[]) {
    for (let py = 0; py < TILE; py++)
      for (let px = 0; px < TILE; px++) {
        const c = SPRITE_COLORS[rows[py][px]];
        if (c !== undefined) dot(x, y, px, py, c);
      }
  }

  /** A few speckles at stable spots, so flat ground does not look flat. */
  function speckle(x: number, y: number, color: number, count: number, salt: number) {
    for (let k = 0; k < count; k++) {
      const h = tileHash(x, y, salt + k);
      dot(x, y, Math.floor(h * 8), Math.floor(tileHash(x, y, salt + k + 50) * 8), color);
    }
  }

  function tile(x: number, y: number) {
    const w = world;
    const t = w.get(x, y);
    switch (t) {
      case T.DEEP:
        fill(x, y, C.deep);
        if (tileHash(x, y, 1) < 0.35) speckle(x, y, C.deepLight, 2, 2);
        break;
      case T.SHALLOW:
        fill(x, y, C.shallow);
        speckle(x, y, C.shallowLight, 2, 3);
        foam(x, y);
        break;
      case T.SAND:
        fill(x, y, C.sand);
        speckle(x, y, C.sandDark, 3, 4);
        break;
      case T.GRASS:
        grass(x, y);
        break;
      case T.FOREST:
        grass(x, y, false);
        sprite(x, y, tileHash(x, y, 7) < 0.5 ? TREE_ROUND : TREE_PINE);
        break;
      case T.MOUNTAIN:
        mountain(x, y);
        break;
      case T.FIELD:
        field(x, y);
        break;
    }
  }

  function grass(x: number, y: number, flowers = true) {
    fill(x, y, C.grass);
    speckle(x, y, C.grassDark, 3, 5);
    speckle(x, y, C.grassLight, 1, 6);
    if (flowers && tileHash(x, y, 8) < 0.05) {
      speckle(x, y, tileHash(x, y, 9) < 0.5 ? C.flowerPink : C.flowerYellow, 1, 10);
    }
    const berries = flowers ? world.bush[y * world.w + x] : -1;
    if (berries >= 0) {
      sprite(x, y, BUSH);
      for (let k = 0; k < berries; k++) dot(x, y, BERRIES[k][0], BERRIES[k][1], C.berry);
    }
  }

  /** White foam along the edges that touch land. */
  function foam(x: number, y: number) {
    const w = world;
    const land = (dx: number, dy: number) => w.isLand(w.get(x + dx, y + dy));
    for (let i = 0; i < TILE; i++) {
      if (tileHash(x, y, 20 + i) < 0.3) continue;
      if (land(0, -1)) dot(x, y, i, 0, C.foam);
      if (land(0, 1)) dot(x, y, i, 7, C.foam);
      if (land(-1, 0)) dot(x, y, 0, i, C.foam);
      if (land(1, 0)) dot(x, y, 7, i, C.foam);
    }
  }

  /** Ploughed soil in furrows; the crop grows from sprouts to golden ears. */
  function field(x: number, y: number) {
    fill(x, y, C.soil);
    for (let py = 1; py < TILE; py += 2) for (let px = 0; px < TILE; px++) dot(x, y, px, py, C.soilDark);
    const c = world.crop[y * world.w + x];
    if (!c) return;
    const color = c >= 4 ? C.wheat : c === 3 ? C.wheatGreen : C.sprout;
    const tall = c >= 3 ? 3 : c;
    for (let px = 1; px < TILE; px += 2) {
      for (let h = 0; h < tall; h++) dot(x, y, px, 6 - h, color);
      if (c >= 4) dot(x, y, px, 6 - tall, C.wheatTop);
    }
  }

  /** Every mountain tile is a small peak; ones deep inside a range get snow. */
  function mountain(x: number, y: number) {
    const w = world;
    fill(x, y, C.rock);
    sprite(x, y, PEAK);
    let inner = true;
    for (let dy = -1; dy <= 1 && inner; dy++) for (let dx = -1; dx <= 1; dx++) if (w.get(x + dx, y + dy) !== T.MOUNTAIN) inner = false;
    if (inner) {
      for (let py = 0; py < 3; py++) for (let px = 0; px < TILE; px++) if (PEAK[py][px] !== '.') dot(x, y, px, py, C.snow);
    }
  }

  tile(x, y);
  // Phase G: gold glitters, spice plants grow red
  const dep = world.deposit[y * world.w + x];
  if (dep === DEPOSIT.GOLD) {
    for (const [px, py] of GOLD_DOTS) dot(x, y, px, py, C.gold);
    dot(x, y, 5, 2, C.glint);
  } else if (dep === DEPOSIT.SPICE) {
    for (const [px, py] of SPICE_LEAVES) dot(x, y, px, py, C.spiceLeaf);
    for (const [px, py] of SPICE_PODS) dot(x, y, px, py, C.spice);
  }
}

const GOLD_DOTS = [
  [2, 5],
  [3, 5],
  [3, 4],
  [5, 6],
  [6, 6],
  [5, 3],
];
const SPICE_LEAVES = [
  [3, 6],
  [3, 5],
  [2, 4],
  [4, 4],
  [3, 3],
];
const SPICE_PODS = [
  [2, 3],
  [4, 3],
  [3, 2],
];
