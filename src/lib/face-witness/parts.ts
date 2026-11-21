/**
 * Face Witness: the parts library. Every part is drawn as vector shapes on
 * three layers (s = soft shading, c = crisp lines, h = highlights that take
 * dots away), which render.ts turns into the dotted print look. Names and the
 * witness phrases are in UI.fun.faceWitness.parts (same order as here).
 */

type Ctx = CanvasRenderingContext2D;
export type Rand = () => number;
/** Draws one variant: soft layer, crisp layer, highlight layer, seeded random. */
export type DrawFn = (s: Ctx, c: Ctx, h: Ctx, R: Rand) => void;

export type PartId = 'head' | 'hair' | 'brows' | 'eyes' | 'nose' | 'mouth' | 'moustache' | 'glasses';

export interface PartDef {
  /** Box the variants are drawn in (part units), and the blur of the soft layer. */
  w: number;
  h: number;
  blur: number;
  /** Extra scale for the whole part. */
  k?: number;
  /** Drawn twice, mirrored (eyes, brows), `sp` apart from the middle. */
  pair?: boolean;
  /** The part can be left out (no moustache, no glasses). */
  optional?: boolean;
  /** Where it sits on the 500 × 600 picture by default. */
  def: { x: number; y: number; sp?: number };
  variants: DrawFn[];
}

const P = (d: string) => new Path2D(d);

function ell(x: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0) {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  x.fill();
}

interface HairOpts {
  len: number;
  a?: number;
  w?: number;
  j?: number;
  soft?: number;
  ang: (x: number, y: number) => number;
}

/** Many short strokes inside `path`, each pointing the way `ang` says (hair, beards). */
function hairs(c: Ctx, R: Rand, path: Path2D, bb: number[], n: number, o: HairOpts) {
  c.save();
  c.clip(path);
  c.lineCap = 'round';
  c.lineWidth = o.w || 1;
  c.strokeStyle = `rgba(0,0,0,${o.a || 0.6})`;
  for (let i = 0; i < n; i += 40) {
    c.beginPath();
    for (let j = 0; j < 40; j++) {
      const x = bb[0] + R() * (bb[2] - bb[0]);
      const y = bb[1] + R() * (bb[3] - bb[1]);
      const a = o.ang(x, y) + (R() - 0.5) * (o.j == null ? 0.5 : o.j);
      const L = o.len * (0.6 + R() * 0.8);
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    }
    c.stroke();
  }
  c.restore();
}

/** Draws with `fn`, then once more mirrored around the middle of a box `W` wide. */
function mir(W: number, x: Ctx, fn: (x: Ctx) => void) {
  fn(x);
  x.save();
  x.translate(W, 0);
  x.scale(-1, 1);
  fn(x);
  x.restore();
}

/* ---- head, hair, brows, eyes, nose, mouth ---------------------------------------------------- */

const jaw =
  (d: string, cy: number): DrawFn =>
  (s, c) => {
    const p = P(d);
    const g = s.createLinearGradient(0, 110, 0, 330);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.42)');
    s.strokeStyle = g;
    s.lineWidth = 16;
    s.stroke(p);
    const g2 = c.createLinearGradient(0, 150, 0, 360);
    g2.addColorStop(0, 'rgba(0,0,0,0)');
    g2.addColorStop(1, 'rgba(0,0,0,.4)');
    c.strokeStyle = g2;
    c.lineWidth = 2;
    c.stroke(p);
    s.fillStyle = 'rgba(0,0,0,.2)';
    ell(s, 200, cy - 16, 58, 14);
  };

const hairV =
  (d: string, bb: number[], n: number, o: HairOpts, extra?: (s: Ctx, c: Ctx, h: Ctx, R: Rand, p: Path2D) => void): DrawFn =>
  (s, c, h, R) => {
    const p = P(d);
    s.fillStyle = `rgba(0,0,0,${o.soft || 0.2})`;
    s.fill(p);
    hairs(c, R, p, bb, n, o);
    if (extra) extra(s, c, h, R, p);
  };

type Pt = [number, number];

const brow =
  (p0: Pt, p1: Pt, p2: Pt, t0: number, t1: number, n: number): DrawFn =>
  (s, c, _h, R) => {
    const q = (t: number, i: 0 | 1) => (1 - t) * (1 - t) * p0[i] + 2 * (1 - t) * t * p1[i] + t * t * p2[i];
    s.strokeStyle = 'rgba(0,0,0,.22)';
    s.lineWidth = (t0 + t1) * 0.4;
    s.stroke(P(`M${p0} Q${p1} ${p2}`));
    c.lineCap = 'round';
    c.lineWidth = 0.8;
    c.strokeStyle = 'rgba(0,0,0,.5)';
    for (let i = 0; i < n; i += 30) {
      c.beginPath();
      for (let j = 0; j < 30; j++) {
        const t = R();
        const x = q(t, 0);
        const y = q(t, 1);
        const dx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0]);
        const dy = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1]);
        const L = Math.hypot(dx, dy);
        const th = (t0 + (t1 - t0) * t) * Math.min(1, t * 5 + 0.2, (1 - t) * 8 + 0.3);
        const u = (R() - 0.5) * th;
        const px = x - (dy / L) * u;
        const py = y + (dx / L) * u;
        const a = -1.6 - (1 - t) * 1.3 + (R() - 0.5) * 0.5;
        const len = 5 + R() * 4;
        c.moveTo(px, py);
        c.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
      }
      c.stroke();
    }
  };

interface EyeOpts {
  ow: number;
  up: number;
  lo: number;
  r: number;
  tilt?: number;
  iy?: number;
  cr?: number;
  bags?: boolean;
}

const eye =
  (o: EyeOpts): DrawFn =>
  (s, c, h, R) => {
    const cx = 70;
    const cy = 45;
    const { ow, up, lo, r } = o;
    const t = o.tilt || 0;
    const iy = cy + (o.iy || 1);
    const L: Pt = [cx - ow, cy + t];
    const Rr: Pt = [cx + ow, cy + 2];
    const upper = `M${L} Q${cx - 8},${cy - up * 2} ${Rr}`;
    const open = P(`${upper} Q${cx},${cy + lo * 2} ${L}Z`);
    s.fillStyle = 'rgba(0,0,0,.12)';
    ell(s, cx, cy - 8, ow + 16, 28);
    s.lineWidth = 5;
    s.strokeStyle = 'rgba(0,0,0,.4)';
    s.stroke(P(`M${cx - ow - 2},${cy - 4 + t} Q${cx - 6},${cy - up * 2 - (o.cr || 12)} ${cx + ow - 2},${cy - 4}`));
    s.fillStyle = 'rgba(0,0,0,.3)';
    ell(s, L[0] + 4, L[1], 7, 5);
    ell(s, Rr[0] - 4, Rr[1], 8, 6);
    c.save();
    c.clip(open);
    c.fillStyle = 'rgba(0,0,0,.5)';
    ell(c, cx + 2, iy, r, r);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0,0,0,.85)';
    c.beginPath();
    c.arc(cx + 2, iy, r, 0, 7);
    c.stroke();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 6.28;
      c.moveTo(cx + 2 + Math.cos(a) * r * 0.45, iy + Math.sin(a) * r * 0.45);
      c.lineTo(cx + 2 + Math.cos(a) * r * 0.95, iy + Math.sin(a) * r * 0.95);
    }
    c.stroke();
    c.fillStyle = 'rgba(0,0,0,.97)';
    ell(c, cx + 2, iy, r * 0.45, r * 0.45);
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,.35)';
    c.stroke(P(upper));
    c.restore();
    c.lineWidth = 3.4;
    c.strokeStyle = 'rgba(0,0,0,.95)';
    c.stroke(P(upper));
    // Lashes
    c.lineWidth = 1.2;
    c.strokeStyle = 'rgba(0,0,0,.7)';
    c.beginPath();
    for (let i = 0; i < 14; i++) {
      const tt = (i / 14) * 0.6;
      const x = (1 - tt) * (1 - tt) * L[0] + 2 * (1 - tt) * tt * (cx - 8) + tt * tt * Rr[0];
      const y = (1 - tt) * (1 - tt) * L[1] + 2 * (1 - tt) * tt * (cy - up * 2) + tt * tt * Rr[1];
      c.moveTo(x, y);
      c.lineTo(x - 4 - R() * 2, y - 3 - R() * 3);
    }
    c.stroke();
    c.lineWidth = 1.1;
    c.strokeStyle = 'rgba(0,0,0,.4)';
    c.stroke(P(`M${L} Q${cx},${cy + lo * 2} ${Rr}`));
    if (o.bags) {
      s.lineWidth = 5;
      s.strokeStyle = 'rgba(0,0,0,.35)';
      s.stroke(P(`M${cx - ow + 8},${cy + lo + 10} Q${cx},${cy + lo * 2 + 16} ${cx + ow - 6},${cy + lo + 8}`));
    }
    h.fillStyle = '#000';
    ell(h, cx + 8, iy - r * 0.4, 3.2, 3.2);
  };

interface NoseOpts {
  ww: number;
  ty: number;
  nos: number;
  bulb: number;
  hook?: boolean;
  up?: boolean;
}

const nose =
  (o: NoseOpts): DrawFn =>
  (s, c, h) => {
    const cx = 80;
    const { ty, ww, nos: nb } = o;
    s.lineWidth = 8;
    s.strokeStyle = 'rgba(0,0,0,.3)';
    mir(160, s, (x) => x.stroke(P(`M${cx - 14},6 C${cx - 16},60 ${cx - ww * 0.5 - 6},${ty - 70} ${cx - ww + 12},${ty - 28}`)));
    if (o.hook) {
      s.fillStyle = 'rgba(0,0,0,.25)';
      ell(s, cx, ty * 0.52, 11, 24);
    }
    s.lineWidth = 9;
    s.strokeStyle = 'rgba(0,0,0,.35)';
    s.beginPath();
    s.arc(cx, ty - 4, o.bulb, 0.12 * Math.PI, 0.88 * Math.PI);
    s.stroke();
    const wing = `M${cx - ww + 14},${ty - 30} C${cx - ww - 6},${ty - 8} ${cx - ww - 2},${ty + 16} ${cx - ww + 16},${ty + 20}`;
    s.lineWidth = 9;
    s.strokeStyle = 'rgba(0,0,0,.35)';
    mir(160, s, (x) => x.stroke(P(wing)));
    c.lineWidth = 2.4;
    c.strokeStyle = 'rgba(0,0,0,.6)';
    mir(160, c, (x) => x.stroke(P(wing)));
    c.fillStyle = 'rgba(0,0,0,.93)';
    mir(160, c, (x) => ell(x, cx - ww * 0.42, ty + 14 - (o.up ? 2 : 0), nb * 1.4, nb * (o.up ? 0.95 : 0.65), -0.35));
    s.fillStyle = 'rgba(0,0,0,.28)';
    ell(s, cx, ty + 26, ww * 0.75, 7);
    h.fillStyle = '#000';
    ell(h, cx + 3, ty - 10, o.bulb * 0.45, o.bulb * 0.4);
    h.lineWidth = 6;
    h.strokeStyle = 'rgba(0,0,0,.45)';
    h.stroke(P(`M${cx},30 L${cx},${ty - 30}`));
  };

interface MouthOpts {
  hw: number;
  uh: number;
  lh: number;
  /** Corners: negative = up (grin), positive = down (grumpy). */
  k?: number;
}

const mouth =
  (o: MouthOpts): DrawFn =>
  (s, c, h, R) => {
    const cx = 115;
    const cy = 65;
    const { hw, uh, lh } = o;
    const k = o.k || 0;
    const Lc: Pt = [cx - hw, cy + k];
    const Rc: Pt = [cx + hw, cy + k];
    const my = cy + 2 - k * 0.6;
    const top =
      `M${Lc} C${cx - hw * 0.6},${cy - uh * 0.6} ${cx - hw * 0.4},${cy - uh} ${cx - hw * 0.22},${cy - uh} Q${cx - hw * 0.08},${cy - uh} ${cx},${cy - uh * 0.72}` +
      ` Q${cx + hw * 0.08},${cy - uh} ${cx + hw * 0.22},${cy - uh} C${cx + hw * 0.4},${cy - uh} ${cx + hw * 0.6},${cy - uh * 0.6} ${Rc}`;
    const up = P(`${top} Q${cx},${my} ${Lc}Z`);
    const lw = P(`M${Lc} Q${cx},${my} ${Rc} C${cx + hw * 0.6},${cy + lh * 1.5 - k * 0.3} ${cx - hw * 0.6},${cy + lh * 1.5 - k * 0.3} ${Lc}Z`);
    s.fillStyle = 'rgba(0,0,0,.5)';
    s.fill(up);
    s.fillStyle = 'rgba(0,0,0,.3)';
    s.fill(lw);
    c.fillStyle = 'rgba(0,0,0,.22)';
    c.fill(up);
    s.fillStyle = 'rgba(0,0,0,.3)';
    ell(s, cx, cy + lh * 1.15 + 10, hw * 0.45, 7);
    s.lineWidth = 3;
    s.strokeStyle = 'rgba(0,0,0,.18)';
    s.stroke(P(`M${cx - 7},${cy - uh - 2} L${cx - 9},${cy - uh - 24} M${cx + 7},${cy - uh - 2} L${cx + 9},${cy - uh - 24}`));
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.95)';
    c.stroke(P(`M${Lc} Q${cx},${my} ${Rc}`));
    c.fillStyle = 'rgba(0,0,0,.9)';
    ell(c, Lc[0] + 2, Lc[1], 3, 2.4);
    ell(c, Rc[0] - 2, Rc[1], 3, 2.4);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(0,0,0,.14)';
    c.save();
    c.clip(lw);
    c.beginPath();
    for (let i = 0; i < 26; i++) {
      const x = cx - hw + R() * hw * 2;
      c.moveTo(x, cy + 2);
      c.lineTo(x + (R() - 0.5) * 3, cy + lh * 1.2);
    }
    c.stroke();
    c.restore();
    h.fillStyle = '#000';
    ell(h, cx, cy + lh * 0.55, hw * 0.32, lh * 0.22);
    h.fillStyle = 'rgba(0,0,0,.6)';
    ell(h, cx, cy - uh * 0.45, hw * 0.12, uh * 0.18);
  };

/** Moustache hair direction: downwards, fanning out from the middle. */
const MD = (x: number) => Math.PI / 2 + ((120 - x) / 80) * 0.55;

const lensSun = 'M18,46 C40,26 150,32 182,52 C178,82 150,100 100,98 C55,96 24,80 18,46 Z';
const lensPil = 'M40,38 C80,28 166,30 178,44 C180,82 150,108 110,106 C70,104 36,80 40,38 Z';
const horn = 'M76,30 H148 Q162,30 162,44 V78 Q162,92 148,92 H76 Q62,92 62,78 V44 Q62,30 76,30 Z';

/* ---- the library ------------------------------------------------------------------------------ */

export const PARTS: Record<PartId, PartDef> = {
  head: {
    w: 400,
    h: 480,
    blur: 9,
    def: { x: 250, y: 330 },
    variants: [
      jaw('M55,40 C52,300 125,452 200,456 C275,452 348,300 345,40', 456),
      jaw('M55,40 L60,320 Q72,418 145,446 L255,446 Q328,418 340,320 L345,40', 446),
      jaw('M58,40 C62,250 150,410 200,466 C250,410 338,250 342,40', 466),
      jaw('M38,40 C32,330 110,440 200,444 C290,440 368,330 362,40', 444),
      jaw('M78,40 C74,320 145,460 200,466 C255,460 326,320 322,40', 466),
    ],
  },
  hair: {
    w: 420,
    h: 420,
    blur: 6,
    def: { x: 250, y: 250 },
    variants: [
      hairV(
        'M50,300 C34,84 120,22 210,22 C300,22 386,84 370,300 L352,300 C350,215 330,170 290,162 Q240,152 210,195 Q180,152 130,162 C90,170 70,215 68,300 Z',
        [30, 15, 390, 305],
        5600,
        { len: 7, a: 0.6, ang: (x, y) => Math.atan2(y - 70, x - 210) },
        (_s, _c, h) => {
          h.fillStyle = 'rgba(0,0,0,.45)';
          ell(h, 210, 92, 70, 38);
        },
      ),
      hairV(
        'M46,300 C24,70 110,4 210,4 C310,4 396,70 374,300 L356,300 C352,205 332,158 300,150 C240,140 160,148 115,156 C84,164 66,212 64,300 Z',
        [20, 0, 400, 305],
        4200,
        { len: 18, a: 0.55, j: 0.3, ang: (x) => (x > 140 ? 0.18 : Math.PI - 0.5) },
        (_s, _c, h) => {
          h.lineWidth = 3;
          h.strokeStyle = 'rgba(0,0,0,.8)';
          h.stroke(P('M140,8 Q150,60 140,130'));
        },
      ),
      hairV(
        'M48,300 C38,210 44,150 72,112 L98,124 C82,170 76,230 72,300 Z M372,300 C382,210 376,150 348,112 L322,124 C338,170 344,230 348,300 Z',
        [36, 105, 385, 305],
        1500,
        { len: 7, a: 0.6, ang: (x) => Math.PI / 2 + (x < 210 ? 0.3 : -0.3) },
        (s, c, h) => {
          const p = P('M70,180 C70,40 350,40 350,180');
          s.lineWidth = 12;
          s.strokeStyle = 'rgba(0,0,0,.2)';
          s.stroke(p);
          c.lineWidth = 1.5;
          c.strokeStyle = 'rgba(0,0,0,.3)';
          c.stroke(p);
          h.fillStyle = 'rgba(0,0,0,.6)';
          ell(h, 210, 82, 80, 34);
        },
      ),
      hairV(
        'M32,312 C2,50 110,-4 210,0 C310,-4 418,50 388,312 L360,302 C352,205 322,162 282,160 C240,152 180,152 140,160 C98,164 68,205 60,302 Z',
        [0, 0, 420, 315],
        0,
        { soft: 0.35, len: 1, ang: () => 0 },
        (_s, c, _h, R, p) => {
          c.save();
          c.clip(p);
          c.lineWidth = 1.6;
          c.strokeStyle = 'rgba(0,0,0,.65)';
          for (let i = 0; i < 1100; i++) {
            const x = R() * 420;
            const y = R() * 315;
            const r = 3 + R() * 4;
            const a = R() * 6.3;
            c.beginPath();
            c.arc(x, y, r, a, a + 3.6);
            c.stroke();
          }
          c.restore();
        },
      ),
      hairV(
        'M42,420 C10,200 40,8 210,4 C380,8 410,200 378,420 L344,420 C352,300 350,192 312,150 C272,122 232,124 210,96 C188,124 148,122 108,150 C70,192 68,300 76,420 Z',
        [10, 0, 410, 420],
        3600,
        { len: 34, a: 0.5, j: 0.2, ang: (x, y) => (y < 150 ? (x < 210 ? Math.PI - 0.45 : 0.45) : Math.PI / 2 + (210 - x) / 700) },
        (_s, _c, h) => {
          h.lineWidth = 3;
          h.strokeStyle = 'rgba(0,0,0,.7)';
          h.stroke(P('M210,6 L210,95'));
        },
      ),
    ],
  },
  brows: {
    w: 140,
    h: 60,
    blur: 3,
    pair: true,
    def: { x: 250, y: 238, sp: 82 },
    variants: [
      brow([8, 36], [60, 10], [132, 30], 9, 17, 900),
      brow([8, 34], [60, 14], [132, 32], 3, 6, 420),
      brow([8, 44], [50, -2], [130, 34], 6, 11, 550),
      brow([8, 30], [70, 24], [132, 30], 7, 12, 600),
      brow([10, 18], [70, 22], [132, 44], 7, 14, 650),
    ],
  },
  eyes: {
    k: 1.28,
    w: 140,
    h: 90,
    blur: 4,
    pair: true,
    def: { x: 250, y: 288, sp: 80 },
    variants: [
      eye({ ow: 46, up: 15, lo: 9, r: 13 }),
      eye({ ow: 52, up: 11, lo: 6, r: 12, tilt: -6 }),
      eye({ ow: 46, up: 20, lo: 13, r: 15, cr: 16 }),
      eye({ ow: 46, up: 8, lo: 9, r: 14, iy: 3, bags: true, cr: 6 }),
      eye({ ow: 46, up: 13, lo: 9, r: 13, tilt: 8, bags: true }),
    ],
  },
  nose: {
    k: 1.08,
    w: 160,
    h: 210,
    blur: 6,
    def: { x: 250, y: 345 },
    variants: [
      nose({ ww: 26, ty: 165, nos: 6, bulb: 14 }),
      nose({ ww: 44, ty: 165, nos: 9, bulb: 20 }),
      nose({ ww: 30, ty: 178, nos: 6, bulb: 16, hook: true }),
      nose({ ww: 30, ty: 150, nos: 9, bulb: 14, up: true }),
      nose({ ww: 38, ty: 170, nos: 8, bulb: 28 }),
    ],
  },
  mouth: {
    w: 230,
    h: 130,
    blur: 5,
    def: { x: 250, y: 472 },
    variants: [
      mouth({ hw: 70, uh: 18, lh: 24 }),
      mouth({ hw: 62, uh: 7, lh: 10 }),
      mouth({ hw: 92, uh: 12, lh: 15 }),
      mouth({ hw: 74, uh: 11, lh: 16, k: -10 }),
      mouth({ hw: 66, uh: 10, lh: 14, k: 9 }),
    ],
  },
  moustache: {
    w: 240,
    h: 180,
    blur: 4,
    optional: true,
    def: { x: 250, y: 426 },
    variants: [
      hairV('M40,118 C50,92 85,80 120,88 C155,80 190,92 200,118 C170,112 150,108 120,112 C90,108 70,112 40,118 Z', [36, 78, 204, 120], 1100, { len: 12, a: 0.45, w: 0.9, ang: MD }),
      hairV('M62,101 Q120,88 178,101 L176,105 Q120,96 64,105 Z', [60, 86, 180, 106], 500, { len: 5, a: 0.7, j: 0.3, ang: (x) => (x < 120 ? Math.PI - 0.15 : 0.15) }),
      hairV('M30,135 C35,90 80,78 120,86 C160,78 205,90 210,135 C180,128 150,122 120,126 C90,122 60,128 30,135 Z', [28, 76, 212, 136], 1500, {
        len: 16,
        a: 0.45,
        w: 0.9,
        ang: (x) => Math.PI / 2 + ((120 - x) / 90) * 0.4,
      }),
      hairV(
        'M55,108 C70,90 100,84 120,90 C140,84 170,90 185,108 C160,104 140,102 120,104 C100,102 80,104 55,108 Z',
        [52, 82, 188, 110],
        800,
        { len: 10, a: 0.45, w: 0.9, ang: (x) => (x < 120 ? Math.PI - 0.3 : 0.3) },
        (_s, c, _h, R) => {
          c.lineWidth = 1.2;
          c.strokeStyle = 'rgba(0,0,0,.6)';
          for (let i = 0; i < 50; i++) {
            const o = (R() - 0.5) * 6;
            mir(240, c, (x) => x.stroke(P(`M62,${105 + o} Q32,${110 + o} ${30 + o * 0.5},86`)));
          }
        },
      ),
      hairV(
        'M48,100 C70,86 100,82 120,88 C140,82 170,86 192,100 L194,170 L182,172 L178,112 C160,104 140,102 120,106 C100,102 80,104 62,112 L58,172 L46,170 Z',
        [42, 80, 198, 174],
        1300,
        { len: 11, a: 0.45, w: 0.9, j: 0.3, ang: (x, y) => (y > 112 ? Math.PI / 2 : MD(x)) },
      ),
    ],
  },
  glasses: {
    w: 380,
    h: 120,
    blur: 3,
    optional: true,
    def: { x: 250, y: 288 },
    variants: [
      (_s, c, h) => {
        mir(380, c, (x) => {
          x.fillStyle = 'rgba(0,0,0,.97)';
          x.fill(P(lensSun));
          x.lineWidth = 4;
          x.strokeStyle = '#000';
          x.stroke(P('M18,46 L4,43'));
        });
        c.lineWidth = 5;
        c.strokeStyle = '#000';
        c.stroke(P('M180,52 Q190,44 200,52'));
        mir(380, h, (x) => {
          x.lineWidth = 2.5;
          x.strokeStyle = 'rgba(0,0,0,.6)';
          x.stroke(P('M40,47 C70,38 120,40 160,51'));
        });
      },
      (_s, c, h) => {
        mir(380, c, (x) => {
          const g = x.createLinearGradient(0, 30, 0, 108);
          g.addColorStop(0, 'rgba(0,0,0,.85)');
          g.addColorStop(1, 'rgba(0,0,0,.45)');
          x.fillStyle = g;
          x.fill(P(lensPil));
          x.lineWidth = 2.2;
          x.strokeStyle = '#000';
          x.stroke(P(lensPil));
        });
        c.lineWidth = 2;
        c.strokeStyle = '#000';
        c.stroke(P('M178,44 Q190,38 202,44 M176,36 Q190,30 204,36'));
        mir(380, h, (x) => {
          x.lineWidth = 3;
          x.strokeStyle = 'rgba(0,0,0,.5)';
          x.stroke(P('M60,44 C90,36 130,36 160,44'));
        });
      },
      (s, c) => {
        mir(380, c, (x) => {
          x.lineWidth = 2.6;
          x.strokeStyle = 'rgba(0,0,0,.9)';
          x.beginPath();
          x.arc(112, 60, 40, 0, 7);
          x.stroke();
          x.stroke(P('M72,56 L6,52'));
        });
        c.stroke(P('M152,56 Q190,44 228,56'));
        mir(380, s, (x) => {
          x.lineWidth = 6;
          x.strokeStyle = 'rgba(0,0,0,.1)';
          x.beginPath();
          x.arc(112, 62, 40, 0, 7);
          x.stroke();
        });
      },
      (_s, c, h) => {
        mir(380, c, (x) => {
          x.lineWidth = 8;
          x.strokeStyle = 'rgba(0,0,0,.95)';
          x.stroke(P(horn));
          x.lineWidth = 6;
          x.stroke(P('M64,34 H160 M62,40 L8,38'));
        });
        c.lineWidth = 6;
        c.stroke(P('M162,46 Q190,38 218,46'));
        mir(380, h, (x) => {
          x.lineWidth = 2;
          x.strokeStyle = 'rgba(0,0,0,.7)';
          x.stroke(P('M76,33 H122'));
        });
      },
    ],
  },
};

/** Drawing order on the picture (back to front). */
export const ORDER: PartId[] = ['head', 'hair', 'eyes', 'brows', 'nose', 'mouth', 'moustache', 'glasses'];
/** Order in the library tabs and the witness statement. */
export const LIB: PartId[] = ['head', 'hair', 'brows', 'eyes', 'nose', 'mouth', 'moustache', 'glasses'];
