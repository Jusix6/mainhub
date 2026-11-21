/**
 * Face Witness cutscene: the art. One SVG (1600 × 900, 16:9) of a police
 * station at night, seen from the detective's chair: rain and a flashing
 * police light in the window, a hanging lamp with dust in its light, a cork
 * board with red string, a wall clock, a filing cabinet, a coat rack; across
 * the desk one of four witnesses, in front the detective's hands holding the
 * player's sketch.
 *
 * Everything is drawn in world coordinates (no SVG transform attributes), so
 * the CSS transforms of scene.ts can use plain view-box origins in px. The
 * witness is written around her head (0, 0) and shifted with `w()`.
 * Faces have every expression drawn at once; CSS shows one (data-st).
 */

const HX = 880;
const HY = 335;

/** Shifts the absolute coordinates of a path (M L Q C S T H V Z only) by the witness's head position. */
function w(d: string): string {
  const out: string[] = [];
  let cmd = '';
  let i = 0;
  for (const tok of d.match(/[MLQCSTHVZ]|-?\d*\.?\d+/gi) ?? []) {
    if (/[A-Z]/i.test(tok)) {
      cmd = tok.toUpperCase();
      i = 0;
      out.push(tok);
      continue;
    }
    const n = Number(tok);
    if (cmd === 'H') out.push(String(n + HX));
    else if (cmd === 'V') out.push(String(n + HY));
    else out.push(String(n + (i % 2 === 0 ? HX : HY)));
    i++;
  }
  return out.join(' ');
}
const ex = (x: number) => x + HX;
const ey = (y: number) => y + HY;

/** A fixed random sequence for the decoration (same picture every time). */
function seq(seed: number) {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

export interface Witness {
  skin: string;
  shade: string;
  hair: string;
  hairShade: string;
  brow: string;
  browW: number;
  iris: string;
  lips: string;
  cloth: string;
  clothShade: string;
  shirt: string;
  /** Extra parts: behind the head, on the head, on the body. */
  hairBack: string;
  hairFront: string;
  face: string;
  body: string;
}

const glassesRound = (c: string) =>
  `<g fill="rgba(255,255,255,.12)" stroke="${c}" stroke-width="3.5"><circle cx="${ex(-30)}" cy="${ey(-9)}" r="22"/><circle cx="${ex(30)}" cy="${ey(-9)}" r="22"/></g>` +
  `<path d="${w('M -8 -10 Q 0 -16 8 -10')}" fill="none" stroke="${c}" stroke-width="3.5"/>` +
  `<path d="${w('M -52 -12 L -74 -6 M 52 -12 L 74 -6')}" stroke="${c}" stroke-width="3"/>`;

/** The four witnesses; the case number picks one. */
export const WITNESSES: Witness[] = [
  // Edna Pike: grey bun, round glasses, purple cardigan, pearls
  {
    skin: '#f2c9ab',
    shade: '#d9a586',
    hair: '#d3d4d6',
    hairShade: '#a8aaae',
    brow: '#9fa1a5',
    browW: 5,
    iris: '#5d86b0',
    lips: '#b24f5b',
    cloth: '#6d4a8c',
    clothShade: '#4f3469',
    shirt: '#f4f0e6',
    hairBack: `<circle cx="${ex(0)}" cy="${ey(-112)}" r="36" fill="#c9cacc"/><path d="${w('M -24 -124 Q 0 -140 24 -124 M -30 -106 Q 0 -120 30 -106')}" fill="none" stroke="#a8aaae" stroke-width="3"/>`,
    hairFront:
      `<path d="${w('M -80 -6 C -86 -82 -42 -106 0 -104 C 42 -106 86 -82 80 -6 C 70 -50 34 -66 0 -62 C -34 -66 -70 -50 -80 -6 Z')}" fill="#d3d4d6"/>` +
      `<path d="${w('M -60 -50 Q -30 -70 0 -62 M 60 -50 Q 30 -70 0 -62 M -72 -30 Q -60 -52 -40 -60 M 72 -30 Q 60 -52 40 -60')}" fill="none" stroke="#a8aaae" stroke-width="2.5"/>`,
    face:
      `<path d="${w('M -54 -2 L -46 2 M -54 6 L -46 6 M 54 -2 L 46 2 M 54 6 L 46 6 M -18 70 Q 0 76 18 70')}" stroke="#c48f72" stroke-width="2" fill="none" opacity=".7"/>` +
      glassesRound('#7a5b33') +
      `<circle cx="${ex(-76)}" cy="${ey(30)}" r="6" fill="#f7f3ea" stroke="#cfc7b4" stroke-width="1.5"/><circle cx="${ex(76)}" cy="${ey(30)}" r="6" fill="#f7f3ea" stroke="#cfc7b4" stroke-width="1.5"/>`,
    body:
      `<path d="${w('M -40 106 L -14 150 L 0 120 L 14 150 L 40 106 Q 0 126 -40 106 Z')}" fill="#f4f0e6"/>` +
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        const x = -44 + 88 * t;
        const y = 112 + Math.sin(t * Math.PI) * 30;
        return `<circle cx="${ex(x)}" cy="${ey(y)}" r="5" fill="#fbf7ee" stroke="#d6ccb8" stroke-width="1.2"/>`;
      }).join('') +
      `<path d="${w('M -6 160 L -6 330 M 6 160 L 6 330')}" stroke="#4f3469" stroke-width="3"/>` +
      `<circle cx="${ex(-18)}" cy="${ey(200)}" r="4" fill="#4f3469"/><circle cx="${ex(-18)}" cy="${ey(250)}" r="4" fill="#4f3469"/>`,
  },
  // Mia Larsen: dark bob, freckles, yellow raincoat
  {
    skin: '#e3ae88',
    shade: '#c48b66',
    hair: '#2a1c15',
    hairShade: '#140c08',
    brow: '#2a1c15',
    browW: 6,
    iris: '#4f6b39',
    lips: '#c0525e',
    cloth: '#e9b824',
    clothShade: '#c18f10',
    shirt: '#2e3138',
    hairBack: `<path d="${w('M -94 -20 C -98 -102 -42 -124 0 -122 C 42 -124 98 -102 94 -20 L 98 74 Q 74 92 54 66 L -54 66 Q -74 92 -98 74 Z')}" fill="#2a1c15"/>`,
    hairFront:
      `<path d="${w('M -84 -24 C -82 -98 -32 -114 0 -112 C 34 -114 82 -98 84 -24 C 64 -40 54 -60 42 -62 C 22 -40 -8 -58 -20 -48 C -42 -34 -62 -40 -84 -24 Z')}" fill="#2a1c15"/>` +
      `<path d="${w('M -60 -84 Q -20 -104 30 -96')}" fill="none" stroke="#5a3b2a" stroke-width="5" stroke-linecap="round" opacity=".6"/>`,
    face: [[-50, 18], [-42, 26], [-56, 28], [-46, 34], [50, 18], [42, 26], [56, 28], [46, 34], [-6, 14], [6, 14]]
      .map(([x, y]) => `<circle cx="${ex(x)}" cy="${ey(y)}" r="2.2" fill="#a86a48" opacity=".7"/>`)
      .join(''),
    body:
      `<path d="${w('M -40 106 L 0 150 L 40 106 Q 0 124 -40 106 Z')}" fill="#2e3138"/>` +
      `<path d="${w('M -100 118 L -40 104 L -6 170 L -54 186 Z M 100 118 L 40 104 L 6 170 L 54 186 Z')}" fill="#f2c93a" stroke="#c18f10" stroke-width="3"/>` +
      `<path d="${w('M 0 170 L 0 330')}" stroke="#c18f10" stroke-width="4"/>` +
      `<circle cx="${ex(14)}" cy="${ey(210)}" r="6" fill="#2e3138"/><circle cx="${ex(14)}" cy="${ey(262)}" r="6" fill="#2e3138"/>`,
  },
  // Tom Becker: red cap, stubble, green bomber jacket
  {
    skin: '#c68a62',
    shade: '#a36a45',
    hair: '#1d1714',
    hairShade: '#0e0a08',
    brow: '#1d1714',
    browW: 7,
    iris: '#5a3a22',
    lips: '#8f4a3c',
    cloth: '#3e5b3c',
    clothShade: '#2c432c',
    shirt: '#efefef',
    hairBack: `<path d="${w('M -80 10 C -86 -40 -70 -80 -40 -90 L 40 -90 C 70 -80 86 -40 80 10 L 70 10 L 70 -40 L -70 -40 L -70 10 Z')}" fill="#1d1714"/>`,
    hairFront:
      `<path d="${w('M -84 -54 C -84 -126 84 -126 84 -54 Z')}" fill="#c0392b"/>` +
      `<path d="${w('M -84 -54 C -84 -126 84 -126 84 -54')}" fill="none" stroke="#962a1f" stroke-width="3"/>` +
      `<path d="${w('M 0 -120 L 0 -56 M -44 -108 Q -30 -80 -34 -56 M 44 -108 Q 30 -80 34 -56')}" stroke="#962a1f" stroke-width="2.5" fill="none"/>` +
      `<path d="${w('M -92 -58 Q 0 -42 100 -60 Q 106 -50 96 -44 Q 0 -30 -96 -44 Z')}" fill="#a83224"/>` +
      `<circle cx="${ex(0)}" cy="${ey(-122)}" r="6" fill="#962a1f"/>`,
    face:
      `<path d="${w('M -66 40 Q -60 84 0 92 Q 60 84 66 40 Q 50 70 0 74 Q -50 70 -66 40 Z')}" fill="#2a1c15" opacity=".22"/>` +
      `<path d="${w('M -16 74 Q 0 80 16 74')}" stroke="#2a1c15" stroke-width="2" opacity=".25" fill="none"/>`,
    body:
      `<path d="${w('M -34 106 Q 0 132 34 106 L 30 118 Q 0 142 -30 118 Z')}" fill="#efefef"/>` +
      `<path d="${w('M -46 104 Q 0 140 46 104 L 50 116 Q 0 154 -50 116 Z')}" fill="#9a8a5c"/>` +
      `<path d="${w('M 0 150 L 0 330')}" stroke="#2c432c" stroke-width="4"/>` +
      `<rect x="${ex(-8)}" y="${ey(150)}" width="16" height="22" rx="3" fill="#b9b9b9"/>`,
  },
  // Arthur Hale: bald with white sides, big white brows, half-moon glasses, tweed and a bow tie
  {
    skin: '#f0c3a1',
    shade: '#d3a07c',
    hair: '#f1f1ee',
    hairShade: '#cfcfc8',
    brow: '#ecece6',
    browW: 9,
    iris: '#5b7a8f',
    lips: '#9a5a52',
    cloth: '#7b6a4c',
    clothShade: '#5c4f37',
    shirt: '#f5f2ea',
    hairBack: `<path d="${w('M -82 30 C -92 -10 -86 -46 -70 -58 L -60 -40 C -66 -20 -68 0 -66 30 Z M 82 30 C 92 -10 86 -46 70 -58 L 60 -40 C 66 -20 68 0 66 30 Z')}" fill="#f1f1ee"/>`,
    hairFront: `<ellipse cx="${ex(-20)}" cy="${ey(-74)}" rx="26" ry="10" fill="#fff" opacity=".35" transform="rotate(-18 ${ex(-20)} ${ey(-74)})"/>`,
    face:
      `<path d="${w('M -56 -2 L -46 2 M -56 6 L -46 6 M 56 -2 L 46 2 M 56 6 L 46 6 M -40 -58 Q 0 -66 40 -58 M -30 -48 Q 0 -54 30 -48')}" stroke="#c48f72" stroke-width="2" fill="none" opacity=".6"/>` +
      `<path d="${w('M -50 4 Q -30 22 -10 4 Z M 50 4 Q 30 22 10 4 Z')}" fill="rgba(255,255,255,.18)" stroke="#2b2b2b" stroke-width="3"/>` +
      `<path d="${w('M -10 6 Q 0 0 10 6')}" stroke="#2b2b2b" stroke-width="3" fill="none"/>`,
    body:
      `<path d="${w('M -34 106 L 0 160 L 34 106 Q 0 124 -34 106 Z')}" fill="#f5f2ea"/>` +
      `<path d="${w('M -24 122 L -2 132 L -24 144 Z M 24 122 L 2 132 L 24 144 Z')}" fill="#b3262e"/><circle cx="${ex(0)}" cy="${ey(133)}" r="6" fill="#8d1c23"/>` +
      `<path d="${w('M -40 106 L -10 190 L -60 200 L -96 124 Z M 40 106 L 10 190 L 60 200 L 96 124 Z')}" fill="#6b5c41"/>` +
      `<path d="${w('M -130 200 L 130 200 M -140 260 L 140 260 M -60 140 L -60 330 M 60 140 L 60 330')}" stroke="#8b7a58" stroke-width="2" opacity=".5"/>`,
  },
];

/** One arm (sleeve + cuff + hand) around the hand at (0, 0); scene.ts moves it with CSS. */
function arm(cls: string, cloth: string, shade: string, skin: string, left: boolean) {
  const thumb = left ? 22 : -22;
  return (
    `<g class="w-arm ${cls}"><g class="w-armin">` +
    `<rect x="-27" y="6" width="54" height="330" rx="24" fill="${cloth}"/>` +
    `<rect x="${left ? 8 : -27}" y="30" width="19" height="300" rx="9" fill="${shade}" opacity=".55"/>` +
    `<rect x="-29" y="4" width="58" height="22" rx="10" fill="${shade}"/>` +
    `<path d="M -24 -4 Q -26 -26 -8 -28 L 10 -28 Q 26 -26 26 -6 L 24 10 Q 20 20 0 20 Q -20 20 -24 10 Z" fill="${skin}"/>` +
    `<ellipse cx="${thumb}" cy="0" rx="9" ry="13" fill="${skin}" transform="rotate(${left ? -20 : 20} ${thumb} 0)"/>` +
    `<path d="M -10 -26 L -10 -14 M 2 -27 L 2 -14 M 14 -25 L 14 -13" stroke="rgba(0,0,0,.18)" stroke-width="2.5" stroke-linecap="round"/>` +
    `</g></g>`
  );
}

/** The witness, every expression at once. */
function witness(v: Witness): string {
  const eye = (x: number) =>
    `<g class="w-eye"><ellipse cx="${ex(x)}" cy="${ey(-8)}" rx="15" ry="11" fill="#fff"/>` +
    `<g class="w-pupil"><circle cx="${ex(x)}" cy="${ey(-7)}" r="7.5" fill="${v.iris}"/><circle cx="${ex(x)}" cy="${ey(-7)}" r="3.8" fill="#111"/><circle cx="${ex(x + 2.6)}" cy="${ey(-9.6)}" r="2" fill="#fff"/></g>` +
    `<path d="${w(`M ${x - 16} -11 Q ${x} -22 ${x + 16} -11`)}" fill="none" stroke="#2a1d17" stroke-width="3" stroke-linecap="round"/></g>`;
  const happyEye = (x: number) => `<path d="${w(`M ${x - 13} -6 Q ${x} -20 ${x + 13} -6`)}" fill="none" stroke="#2a1d17" stroke-width="4.5" stroke-linecap="round"/>`;
  const brow = (side: 'l' | 'r') => {
    const d = side === 'l' ? 'M -48 -34 Q -32 -44 -14 -37' : 'M 14 -37 Q 32 -44 48 -34';
    return `<path class="w-brow w-brow-${side}" d="${w(d)}" fill="none" stroke="${v.brow}" stroke-width="${v.browW}" stroke-linecap="round"/>`;
  };
  const m = (cls: string, svg: string) => `<g class="w-m ${cls}">${svg}</g>`;
  const stroke = (d: string, width = 4.5) => `<path d="${w(d)}" fill="none" stroke="${v.lips}" stroke-width="${width}" stroke-linecap="round"/>`;
  return (
    `<g class="w-all"><g class="w-lean"><g class="w-bob">` +
    // Body
    `<path d="${w('M -172 340 L -160 172 Q -152 128 -98 116 L -34 106 Q 0 134 34 106 L 98 116 Q 152 128 160 172 L 172 340 Z')}" fill="${v.cloth}"/>` +
    `<path d="${w('M -172 340 L -160 172 Q -152 128 -98 116 L -110 180 L -120 340 Z M 172 340 L 160 172 Q 152 128 98 116 L 110 180 L 120 340 Z')}" fill="${v.clothShade}" opacity=".7"/>` +
    `<path d="${w('M -28 64 L -28 116 Q 0 134 28 116 L 28 64 Z')}" fill="${v.shade}"/>` +
    v.body +
    // Head
    `<g class="w-head"><g class="w-hanim">` +
    v.hairBack +
    `<ellipse cx="${ex(-75)}" cy="${ey(8)}" rx="13" ry="19" fill="${v.skin}"/><ellipse cx="${ex(75)}" cy="${ey(8)}" rx="13" ry="19" fill="${v.skin}"/>` +
    `<ellipse cx="${ex(-75)}" cy="${ey(8)}" rx="6" ry="10" fill="${v.shade}"/><ellipse cx="${ex(75)}" cy="${ey(8)}" rx="6" ry="10" fill="${v.shade}"/>` +
    `<ellipse cx="${ex(0)}" cy="${ey(0)}" rx="76" ry="90" fill="${v.skin}"/>` +
    `<path d="${w('M -70 30 Q -56 82 0 90 Q 56 82 70 30 Q 60 70 0 78 Q -60 70 -70 30 Z')}" fill="${v.shade}" opacity=".55"/>` +
    `<ellipse class="w-red" cx="${ex(0)}" cy="${ey(6)}" rx="74" ry="86" fill="#ff3b30"/>` +
    `<ellipse class="w-blush" cx="${ex(-46)}" cy="${ey(28)}" rx="16" ry="9" fill="#ff7f8a"/><ellipse class="w-blush" cx="${ex(46)}" cy="${ey(28)}" rx="16" ry="9" fill="#ff7f8a"/>` +
    `<g class="w-eyes-open">${eye(-30)}${eye(30)}</g>` +
    `<g class="w-eyes-happy">${happyEye(-30)}${happyEye(30)}</g>` +
    `<path d="${w('M -2 0 Q -6 20 -12 26 Q -2 33 10 26')}" fill="none" stroke="${v.shade}" stroke-width="3.5" stroke-linecap="round"/>` +
    `<g class="w-mouth">` +
    m('m-neutral', stroke('M -20 50 Q 0 55 20 50')) +
    m('m-think', stroke('M -6 52 Q 6 47 18 53')) +
    m('m-smile', stroke('M -26 46 Q 0 66 26 46', 5)) +
    m(
      'm-grin',
      `<path d="${w('M -32 44 Q 0 84 32 44 Q 0 54 -32 44 Z')}" fill="#5b1f22"/>` +
        `<path d="${w('M -26 47 Q 0 54 26 47 L 24 54 Q 0 60 -24 54 Z')}" fill="#fff"/>` +
        `<ellipse cx="${ex(0)}" cy="${ey(66)}" rx="13" ry="6" fill="#d2646c"/>` +
        `<path d="${w('M -32 44 Q 0 84 32 44')}" fill="none" stroke="${v.lips}" stroke-width="4"/>`,
    ) +
    m('m-wavy', stroke('M -22 52 Q -11 45 0 52 Q 11 59 22 51')) +
    m('m-frown', stroke('M -22 58 Q 0 42 22 58', 5)) +
    m(
      'm-shout',
      `<ellipse cx="${ex(0)}" cy="${ey(56)}" rx="19" ry="16" fill="#5b1f22" stroke="${v.lips}" stroke-width="4"/>` +
        `<path d="${w('M -14 46 Q 0 42 14 46 L 13 50 Q 0 47 -13 50 Z')}" fill="#fff"/><ellipse cx="${ex(0)}" cy="${ey(65)}" rx="10" ry="5" fill="#d2646c"/>`,
    ) +
    `</g>` +
    v.face +
    v.hairFront +
    // Brows last: they stay readable over fringes and under caps
    brow('l') +
    brow('r') +
    `</g></g>` +
    // Arms (in front of the body, behind the desk)
    arm('w-arm-l', v.cloth, v.clothShade, v.skin, true) +
    arm('w-arm-r', v.cloth, v.clothShade, v.skin, false) +
    `</g></g></g>`
  );
}

/** A five-pointed star. */
function star(cx: number, cy: number, r: number) {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    p.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `<polygon points="${p.join(' ')}"/>`;
}

export interface SceneArt {
  witness: number;
  /** data: URL of the player's sketch (500 × 600). */
  sketch: string;
  paperTitle: string;
  stamp: string;
  /** Clock time (hours, minutes, seconds). */
  time: [number, number, number];
}

/** The whole scene as SVG markup. */
export function sceneSvg(o: SceneArt): string {
  const R = seq(20261121);
  const v = WITNESSES[o.witness % WITNESSES.length];

  // Window: skyline with lit windows, rain, the flashing police light
  let city = '';
  for (let x = 138; x < 462; ) {
    const bw = 30 + R() * 46;
    const top = 290 + R() * 120;
    city += `<rect x="${x.toFixed(0)}" y="${top.toFixed(0)}" width="${bw.toFixed(0)}" height="${(470 - top).toFixed(0)}" fill="${R() < 0.5 ? '#14223a' : '#1a2b45'}"/>`;
    for (let wy = top + 10; wy < 450; wy += 16)
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) if (R() < 0.33) city += `<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="5" height="7" fill="#ffd27a" opacity="${(0.45 + R() * 0.5).toFixed(2)}"/>`;
    x += bw + 2;
  }
  let rain = '';
  for (let i = 0; i < 70; i++) {
    const x = 140 + R() * 360;
    const y = -150 + R() * 620;
    rain += `<path d="M ${x.toFixed(0)} ${y.toFixed(0)} l -9 26"/>`;
  }
  let slats = '';
  for (let y = 158; y < 238; y += 10) slats += `<rect x="132" y="${y}" width="336" height="8" rx="1" fill="#cfc7a9"/><rect x="132" y="${y + 6}" width="336" height="2" fill="#9d9478"/>`;

  // Cork board speckles
  let cork = '';
  for (let i = 0; i < 160; i++) cork += `<circle cx="${(1132 + R() * 316).toFixed(0)}" cy="${(180 + R() * 226).toFixed(0)}" r="${(0.8 + R() * 1.6).toFixed(1)}" fill="#8e6537" opacity=".5"/>`;

  // Wallpaper stripes
  let stripes = '';
  for (let x = 20; x < 1600; x += 46) stripes += `<rect x="${x}" y="40" width="2" height="520" fill="#fff" opacity=".025"/>`;

  // Dust in the lamp light
  let motes = '';
  for (let i = 0; i < 16; i++) {
    const y = 220 + R() * 480;
    const spread = ((y - 140) / 760) * 420;
    const x = 860 + (R() - 0.5) * spread * 1.6;
    motes += `<circle class="sc-mote" cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(1.2 + R() * 2).toFixed(1)}" style="--dx:${((R() - 0.5) * 40).toFixed(0)}px;--dy:${(-20 - R() * 40).toFixed(0)}px;--t:${(5 + R() * 6).toFixed(1)}s;--dl:-${(R() * 6).toFixed(1)}s"/>`;
  }

  const [hh, mm, ss] = o.time;
  const hourA = ((hh % 12) + mm / 60) * 30;
  const minA = mm * 6;

  return `<svg class="sc" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" data-st="idle" data-paper="down" aria-hidden="true">
<defs>
  <linearGradient id="scWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141c25"/><stop offset=".55" stop-color="#2a3846"/><stop offset="1" stop-color="#1e2833"/></linearGradient>
  <linearGradient id="scSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07101b"/><stop offset="1" stop-color="#1b2f48"/></linearGradient>
  <linearGradient id="scDesk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5532"/><stop offset="1" stop-color="#4f2e19"/></linearGradient>
  <linearGradient id="scCone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe6a8" stop-opacity=".42"/><stop offset=".7" stop-color="#ffd98a" stop-opacity=".08"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></linearGradient>
  <radialGradient id="scGlow"><stop offset="0" stop-color="#fff6d2"/><stop offset=".4" stop-color="#ffe29a" stop-opacity=".6"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
  <radialGradient id="scPool" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd890" stop-opacity=".38"/><stop offset="1" stop-color="#ffd890" stop-opacity="0"/></radialGradient>
  <radialGradient id="scVig" cx=".55" cy=".42" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".62"/></radialGradient>
  <linearGradient id="scPaper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset="1" stop-color="#e7e0cf"/></linearGradient>
  <clipPath id="scGlass"><rect x="138" y="158" width="324" height="304"/></clipPath>
</defs>

<!-- Room -->
<rect width="1600" height="900" fill="url(#scWall)"/>
${stripes}
<rect width="1600" height="42" fill="#0d1218"/><rect y="42" width="1600" height="6" fill="#33414f"/>
<rect y="556" width="1600" height="344" fill="#1b242e"/><rect y="552" width="1600" height="10" fill="#3a4856"/>

<!-- Coat rack -->
<g>
  <rect x="58" y="150" width="9" height="520" fill="#2b2017"/>
  <path d="M 40 200 Q 62 184 86 200" fill="none" stroke="#2b2017" stroke-width="6"/>
  <path d="M 34 212 Q 30 180 62 176 Q 94 180 90 212 L 96 470 Q 62 488 28 470 Z" fill="#6b5a45"/>
  <path d="M 62 180 L 54 300 M 62 180 L 72 300" stroke="#53452f" stroke-width="3"/>
  <ellipse cx="62" cy="172" rx="40" ry="9" fill="#1f1a15"/><path d="M 40 172 Q 44 140 62 138 Q 80 140 84 172 Z" fill="#2a231c"/><rect x="40" y="160" width="44" height="6" fill="#5b2f2a"/>
</g>

<!-- Window -->
<g>
  <rect x="122" y="142" width="356" height="336" rx="4" fill="#0f151d"/>
  <rect x="138" y="158" width="324" height="304" fill="url(#scSky)"/>
  <g clip-path="url(#scGlass)">
    <circle cx="410" cy="210" r="46" fill="#f4eed2" opacity=".08"/><circle cx="410" cy="210" r="18" fill="#f4eed2" opacity=".85"/>
    ${city}
    <rect class="sc-red" x="138" y="158" width="324" height="304" fill="#ff2a3a"/>
    <rect class="sc-blue" x="138" y="158" width="324" height="304" fill="#2a6bff"/>
    <g class="sc-rain" stroke="#a9cbec" stroke-width="1.6" opacity=".42" stroke-linecap="round">${rain}</g>
    <polygon points="160,158 230,158 150,462 138,462 138,250" fill="#fff" opacity=".04"/>
  </g>
  <rect x="296" y="158" width="8" height="304" fill="#0f151d"/><rect x="138" y="306" width="324" height="8" fill="#0f151d"/>
  ${slats}
  <path d="M 452 160 L 452 252" stroke="#9d9478" stroke-width="2"/><circle cx="452" cy="256" r="4" fill="#9d9478"/>
  <rect x="112" y="474" width="376" height="14" fill="#3a4756"/><rect x="112" y="488" width="376" height="8" fill="#000" opacity=".25"/>
</g>

<!-- Poster -->
<g>
  <rect x="556" y="186" width="126" height="166" fill="#000" opacity=".25" transform="rotate(-2 619 269)"/>
  <g transform="rotate(-2 619 269)">
    <rect x="552" y="180" width="126" height="166" fill="#ece2c6"/>
    <text x="615" y="210" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="22" fill="#3b2f25">WANTED</text>
    <circle cx="615" cy="252" r="22" fill="#4a4038"/><path d="M 575 316 Q 578 278 615 276 Q 652 278 655 316 Z" fill="#4a4038"/>
    <text x="615" y="336" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="11" fill="#3b2f25">REWARD $500</text>
    <circle cx="615" cy="186" r="4" fill="#c0392b"/>
  </g>
</g>

<!-- Clock -->
<g>
  <circle cx="1000" cy="132" r="56" fill="#0e0e0e"/><circle cx="1000" cy="132" r="49" fill="#f3efe4"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const r1 = i % 3 ? 42 : 38;
    return `<line x1="${(1000 + Math.sin(a) * r1).toFixed(1)}" y1="${(132 - Math.cos(a) * r1).toFixed(1)}" x2="${(1000 + Math.sin(a) * 46).toFixed(1)}" y2="${(132 - Math.cos(a) * 46).toFixed(1)}" stroke="#111" stroke-width="${i % 3 ? 2 : 4}"/>`;
  }).join('')}
  <line x1="1000" y1="132" x2="1000" y2="104" stroke="#111" stroke-width="6" stroke-linecap="round" transform="rotate(${hourA.toFixed(1)} 1000 132)"/>
  <line x1="1000" y1="132" x2="1000" y2="94" stroke="#111" stroke-width="4" stroke-linecap="round" transform="rotate(${minA.toFixed(1)} 1000 132)"/>
  <g class="sc-sec" style="--s:${ss}"><circle cx="1000" cy="132" r="46" fill="none"/><line x1="1000" y1="144" x2="1000" y2="90" stroke="#c0392b" stroke-width="2"/></g>
  <circle cx="1000" cy="132" r="4" fill="#c0392b"/>
</g>

<!-- Plaque and cork board -->
<rect x="1196" y="118" width="190" height="34" rx="3" fill="#b08a3e"/><rect x="1200" y="122" width="182" height="26" rx="2" fill="none" stroke="#7b5e25" stroke-width="2"/>
<text x="1291" y="141" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="17" fill="#3d2c10" letter-spacing="2">PRECINCT 9</text>
<g>
  <rect x="1118" y="166" width="344" height="254" rx="6" fill="#5b3a22"/>
  <rect x="1130" y="178" width="320" height="230" fill="#b98b58"/>
  ${cork}
  <g transform="rotate(-4 1185 245)"><rect x="1142" y="192" width="88" height="108" fill="#f6f2e6"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="1150" y="${210 + i * 13}" width="${70 - (i % 2) * 18}" height="3" fill="#9a9384"/>`).join('')}</g>
  <g transform="rotate(5 1290 232)"><rect x="1250" y="186" width="80" height="94" fill="#fdfdfb"/><rect x="1258" y="194" width="64" height="62" fill="#3d4a57"/><circle cx="1290" cy="218" r="12" fill="#22303c"/><path d="M 1268 256 Q 1270 236 1290 234 Q 1310 236 1312 256 Z" fill="#22303c"/></g>
  <g transform="rotate(-2 1395 240)"><rect x="1352" y="200" width="88" height="78" fill="#cfe0b8"/><path d="M 1358 220 Q 1390 210 1434 232 M 1362 252 L 1430 246 M 1380 204 L 1392 276" stroke="#7d9a62" stroke-width="2" fill="none"/><circle cx="1402" cy="238" r="6" fill="none" stroke="#c0392b" stroke-width="2.5"/></g>
  <g transform="rotate(3 1215 360)"><rect x="1162" y="322" width="108" height="76" fill="#f7e07a"/>${[0, 1, 2].map((i) => `<rect x="1172" y="${338 + i * 14}" width="${80 - i * 16}" height="3" fill="#a79540"/>`).join('')}</g>
  <g transform="rotate(-6 1338 346)"><rect x="1300" y="302" width="76" height="88" fill="#fdfdfb"/><rect x="1307" y="309" width="62" height="58" fill="#5a4a3f"/><circle cx="1338" cy="330" r="11" fill="#3b2f27"/><path d="M 1318 367 Q 1320 348 1338 346 Q 1356 348 1358 367 Z" fill="#3b2f27"/></g>
  <polyline points="1186,196 1292,190 1396,204 1338,306 1216,326 1186,196" fill="none" stroke="#d0262e" stroke-width="2.2"/>
  ${[
    [1186, 196, '#c0392b'],
    [1292, 190, '#2a6bff'],
    [1396, 204, '#e8b923'],
    [1338, 306, '#c0392b'],
    [1216, 326, '#3ddc84'],
  ]
    .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="6" fill="${c}"/><circle cx="${Number(x) - 2}" cy="${Number(y) - 2}" r="2" fill="#fff" opacity=".6"/>`)
    .join('')}
</g>

<!-- Filing cabinet and plant -->
<g>
  <rect x="1486" y="380" width="150" height="560" fill="#56645d"/><rect x="1486" y="380" width="150" height="10" fill="#6e7d75"/>
  ${[0, 1, 2].map((i) => `<rect x="1498" y="${404 + i * 150}" width="126" height="136" rx="3" fill="#4d5a53"/><rect x="1536" y="${450 + i * 150}" width="50" height="10" rx="4" fill="#b9c1bc"/><rect x="1548" y="${420 + i * 150}" width="26" height="16" fill="#e9e5d6"/>`).join('')}
  <path d="M 1512 330 L 1590 330 L 1580 384 L 1522 384 Z" fill="#b4573a"/><rect x="1506" y="324" width="90" height="12" rx="3" fill="#c96a4a"/>
  ${[
    'M 1540 326 Q 1520 250 1532 196',
    'M 1550 326 Q 1552 240 1576 186',
    'M 1560 326 Q 1590 260 1600 224',
    'M 1530 326 Q 1500 280 1494 240',
    'M 1556 326 Q 1546 260 1556 206',
  ]
    .map((d, i) => `<path d="${d}" fill="none" stroke="${i % 2 ? '#3f8a4a' : '#2f6f3a'}" stroke-width="14" stroke-linecap="round"/>`)
    .join('')}
</g>

<!-- Lamp, its light and the dust in it -->
<g class="sc-lamp">
  <polygon points="814,140 906,140 1320,900 400,900" fill="url(#scCone)"/>
  <rect x="858" y="0" width="4" height="100" fill="#111"/>
  <path d="M 846 92 L 874 92 L 878 104 L 842 104 Z" fill="#162a20"/>
  <path d="M 808 140 L 834 100 L 886 100 L 912 140 Z" fill="#244634"/><path d="M 834 100 L 886 100 L 892 110 L 828 110 Z" fill="#30593f"/>
  <ellipse cx="860" cy="140" rx="52" ry="8" fill="#fff1c4"/>
  <circle cx="860" cy="146" r="46" fill="url(#scGlow)"/>
  <g fill="#fff2c8" opacity=".75">${motes}</g>
</g>

<!-- Chair -->
<rect x="738" y="352" width="284" height="390" rx="50" fill="#3b2824"/><rect x="752" y="364" width="256" height="40" rx="20" fill="#4c342e"/>

<!-- Witness -->
${witness(v)}

<!-- Desk -->
<polygon points="296,618 1504,618 1780,900 -180,900" fill="url(#scDesk)"/>
<ellipse cx="860" cy="760" rx="470" ry="130" fill="url(#scPool)"/>
<path d="M 300 690 Q 800 676 1560 700 M 220 780 Q 820 760 1650 790 M 120 860 Q 820 846 1720 876" fill="none" stroke="#3b220f" stroke-width="2" opacity=".25"/>
<rect x="296" y="606" width="1208" height="16" rx="3" fill="#9a6440"/><rect x="296" y="622" width="1208" height="7" fill="#000" opacity=".28"/>

<!-- Files, notepad, mug -->
<g>
  <polygon points="1078,676 1252,668 1264,694 1086,704" fill="#000" opacity=".22"/>
  <polygon points="1074,664 1248,656 1258,682 1082,690" fill="#c79f48"/>
  <polygon points="1078,652 1244,646 1252,668 1084,676" fill="#e9e2cf"/>
  <polygon points="1072,642 1246,634 1256,660 1080,668" fill="#d8b45d"/>
  <polygon points="1090,634 1150,631 1152,638 1092,641" fill="#c79f48"/>
  <text x="1150" y="660" text-anchor="middle" font-family="Courier New, monospace" font-weight="700" font-size="13" fill="#6b5320" transform="rotate(-2 1150 660)">CASE FILE</text>
</g>
<g>
  <polygon points="590,700 744,694 760,768 584,778" fill="#000" opacity=".22"/>
  <polygon points="584,692 738,686 752,758 576,768" fill="#f7eaa2"/>
  ${[0, 1, 2, 3, 4].map((i) => `<path d="M ${590 - i * 2} ${706 + i * 12} L ${740 + i * 2} ${700 + i * 12}" stroke="#c9b866" stroke-width="2"/>`).join('')}
  <polygon points="584,692 738,686 740,696 586,702" fill="#c94e44"/>
  <path d="M 700 760 L 812 716" stroke="#1f3b78" stroke-width="9" stroke-linecap="round"/><path d="M 806 718 L 816 714" stroke="#d6c08a" stroke-width="9" stroke-linecap="round"/>
</g>
<g class="sc-mug">
  <ellipse cx="1334" cy="770" rx="44" ry="10" fill="#000" opacity=".3"/>
  <path d="M 1362 712 Q 1396 714 1394 738 Q 1392 760 1362 758" fill="none" stroke="#e4ddca" stroke-width="10"/>
  <path d="M 1300 700 L 1300 760 Q 1300 774 1331 774 Q 1362 774 1362 760 L 1362 700 Z" fill="#ebe5d4"/>
  <path d="M 1300 700 L 1300 760 Q 1300 774 1314 772 L 1314 702 Z" fill="#d4ccb7"/>
  <ellipse cx="1331" cy="700" rx="31" ry="9" fill="#d8d0bd"/><ellipse cx="1331" cy="702" rx="26" ry="6" fill="#4a2c1c"/>
  <rect x="1316" y="726" width="30" height="20" rx="3" fill="#2a6bff"/><text x="1331" y="741" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="13" fill="#fff">P9</text>
</g>
<g class="sc-steam" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round">
  <path d="M 1320 690 Q 1310 670 1322 652 Q 1334 634 1322 614"/>
  <path d="M 1336 690 Q 1346 668 1334 650 Q 1322 632 1336 612"/>
  <path d="M 1350 690 Q 1342 672 1352 656 Q 1362 640 1350 622"/>
</g>

<!-- What the witness feels -->
<g class="sc-fx">
  <g class="fx fx-spark" fill="#ffd84a" stroke="#7a5a00" stroke-width="2">
    <g style="--d:0s">${star(764, 250, 22)}</g><g style="--d:.12s">${star(1004, 236, 26)}</g><g style="--d:.24s">${star(1022, 356, 16)}</g><g style="--d:.36s">${star(744, 362, 14)}</g>
  </g>
  <text class="fx fx-bang" x="1000" y="300" font-family="Arial Black, Arial, sans-serif" font-size="78" fill="#ffd84a" stroke="#111" stroke-width="5" paint-order="stroke">!</text>
  <text class="fx fx-q" x="985" y="306" font-family="Arial Black, Arial, sans-serif" font-size="72" fill="#fff" stroke="#111" stroke-width="5" paint-order="stroke">?</text>
  <path class="fx fx-sweat" d="M 962 270 Q 950 292 956 302 Q 964 312 974 302 Q 980 292 962 270 Z" fill="#9fdcff" stroke="#3a7fb0" stroke-width="2"/>
  <g class="fx fx-vein" fill="none" stroke="#e3262f" stroke-width="7" stroke-linecap="round"><path d="M 930 248 Q 944 258 940 272"/><path d="M 962 248 Q 952 260 958 272"/><path d="M 928 290 Q 942 282 952 290"/><path d="M 954 230 Q 948 244 958 250"/></g>
  <g class="fx fx-puff" fill="#f3f3f3" opacity=".9"><circle cx="790" cy="320" r="14"/><circle cx="772" cy="306" r="10"/><circle cx="970" cy="320" r="14"/><circle cx="988" cy="306" r="10"/></g>
</g>

<!-- The detective's hands with the sketch -->
<g class="sc-paper"><g class="sc-paperin">
  <rect x="160" y="482" width="330" height="420" rx="4" fill="#000" opacity=".35" transform="rotate(-4 315 690)"/>
  <g transform="rotate(-5 315 690)">
    <rect x="150" y="470" width="330" height="420" rx="3" fill="url(#scPaper)"/>
    <text x="172" y="500" font-family="Courier New, monospace" font-weight="700" font-size="15" fill="#3b3a36">${o.paperTitle}</text>
    <rect x="172" y="508" width="286" height="2" fill="#9a958a"/>
    <rect x="182" y="520" width="266" height="319" fill="#f1f0ed"/>
    <image href="${o.sketch}" x="182" y="520" width="266" height="319" preserveAspectRatio="xMidYMid slice"/>
    <g transform="rotate(-12 396 836)" opacity=".82"><rect x="330" y="816" width="134" height="38" rx="4" fill="none" stroke="#c0262e" stroke-width="4"/><text x="397" y="843" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-size="20" fill="#c0262e">${o.stamp}</text></g>
  </g>
  <path d="M 112 900 L 150 760 Q 168 730 196 744 L 214 760 L 190 900 Z" fill="#2f2a25"/>
  <path d="M 150 742 Q 140 712 168 704 Q 196 700 206 722 L 208 760 Q 186 778 160 768 Z" fill="#d6a07a"/>
  <path d="M 176 708 Q 196 694 210 712 Q 214 726 198 730" fill="#e3b08b"/>
  <path d="M 420 900 L 452 790 Q 470 760 500 774 L 520 900 Z" fill="#2f2a25"/>
  <path d="M 446 782 Q 438 748 466 740 Q 494 738 504 760 L 506 796 Q 484 812 458 804 Z" fill="#d6a07a"/>
  <path d="M 450 752 Q 432 742 440 726 Q 452 716 466 728" fill="#e3b08b"/>
</g></g>

<rect width="1600" height="900" fill="url(#scVig)" pointer-events="none"/>
</svg>`;
}

/** The scene's styles (added to the page once). Times and states are set by scene.ts. */
export const SCENE_CSS = `
.fwsc{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:#000;color:#f3ead7;font:16px/1.4 Arial,Helvetica,sans-serif}
.fwsc-stage{position:relative;width:min(100vw,calc(100dvh * 16 / 9));aspect-ratio:16/9;overflow:hidden;container-type:inline-size;background:#0b1016}
.fwsc-shake,.fwsc-cam{position:absolute;inset:0}
.fwsc-cam{transform-origin:55% 38%;transform:scale(1.14);transition:transform 1.1s cubic-bezier(.65,0,.35,1)}
.fwsc-cam[data-shot=wide]{transform:scale(1);transition-duration:3.4s;transition-timing-function:cubic-bezier(.2,.75,.25,1)}
.fwsc-cam[data-shot=push]{transform:scale(1.07)}
.fwsc-cam[data-shot=close]{transform:scale(1.62)}
.fwsc-cam[data-shot=closer]{transform:scale(1.8);transition-duration:.35s}
.fwsc svg.sc{display:block;width:100%;height:100%}
.fwsc-shake.is-shake{animation:fwsc-shake .42s cubic-bezier(.36,.07,.19,.97)}
@keyframes fwsc-shake{10%,90%{transform:translate(-3px,1px)}20%,80%{transform:translate(6px,-2px)}30%,50%,70%{transform:translate(-10px,3px)}40%,60%{transform:translate(10px,-3px)}}
.fwsc-bar{position:absolute;left:0;right:0;height:7.5%;background:#000;transition:transform .7s cubic-bezier(.2,.8,.2,1);z-index:2}
.fwsc-bar--top{top:0;transform:translateY(-100%)}.fwsc-bar--bot{bottom:0;transform:translateY(100%)}
.fwsc.is-film .fwsc-bar{transform:none}
.fwsc-fade{position:absolute;inset:0;background:#000;z-index:4;opacity:1;transition:opacity .6s ease;pointer-events:none}
.fwsc.is-open .fwsc-fade{opacity:0}
.fwsc.is-closing .fwsc-fade{opacity:1;transition-duration:.45s}
.fwsc-box{position:absolute;left:33%;right:4%;bottom:10.5%;z-index:3;min-height:4.6em;padding:1.4cqw 2cqw 1.2cqw;background:rgba(7,10,15,.9);border:2px solid #c9a45c;border-radius:6px;box-shadow:0 10px 30px rgba(0,0,0,.5);font:700 clamp(14px,2cqw,26px)/1.35 'Courier New',Courier,monospace;color:#f3ead7;cursor:pointer;transform:translateY(12px);opacity:0;transition:opacity .25s,transform .35s cubic-bezier(.2,.8,.2,1)}
.fwsc-box.is-on{opacity:1;transform:none}
.fwsc-name{position:absolute;left:1.6cqw;top:0;transform:translateY(-60%);padding:.25em .7em;background:#c9a45c;color:#111;border-radius:3px;font:900 clamp(10px,1.15cqw,15px)/1 Arial,Helvetica,sans-serif;letter-spacing:.1em}
.fwsc-text{margin:0;min-height:2.7em}
.fwsc-caret{display:inline-block;width:.55em;height:1em;margin-left:2px;vertical-align:-.12em;background:#c9a45c;animation:fwsc-caret .9s steps(1) infinite}
@keyframes fwsc-caret{50%{opacity:0}}
.fwsc button.fwsc-next{float:right;margin-top:.3em;padding:.35em .9em;background:#c9a45c;color:#111;border:0;border-radius:3px;font:900 clamp(12px,1.35cqw,17px)/1.2 Arial,Helvetica,sans-serif;cursor:pointer}
.fwsc button.fwsc-next:hover,.fwsc button.fwsc-next:focus-visible{background:#ffd27a;outline:2px solid #fff;outline-offset:2px}
.fwsc button.fwsc-next[hidden]{display:none}
.fwsc button.fwsc-skip{position:absolute;top:1.6%;right:1.6%;z-index:5;padding:.35em .8em;background:rgba(0,0,0,.4);color:#cfc6b2;border:1px solid #6b6354;border-radius:3px;font:700 clamp(11px,1.1cqw,14px)/1 Arial,Helvetica,sans-serif;letter-spacing:.06em;cursor:pointer}
.fwsc button.fwsc-skip:hover,.fwsc button.fwsc-skip:focus-visible{color:#fff;border-color:#c9a45c}
@media (orientation:portrait){
  .fwsc-stage{width:100vw;aspect-ratio:1/1}
  .fwsc-box{position:fixed;left:12px;right:12px;bottom:16px;padding:14px 16px 12px;font-size:15px}
  .fwsc-name{font-size:11px;left:14px}
  .fwsc button.fwsc-next{font-size:14px}
  .fwsc button.fwsc-skip{position:fixed;top:12px;right:12px;font-size:12px}
}

/* ---- the room: rain, police light, clock, lamp, dust, steam ---- */
.fwsc .sc *{transform-box:view-box}
.fwsc .sc-rain{animation:sc-rain .55s linear infinite}
@keyframes sc-rain{from{transform:translate(0,-150px)}to{transform:translate(-52px,0)}}
.fwsc .sc-red,.fwsc .sc-blue{opacity:0;animation:sc-siren 1.6s ease-in-out infinite}
.fwsc .sc-blue{animation-delay:-.8s}
@keyframes sc-siren{0%,40%,100%{opacity:0}12%{opacity:.26}22%{opacity:.08}30%{opacity:.2}}
.fwsc .sc-sec{transform-origin:1000px 132px;animation:sc-tick 60s steps(60) infinite;animation-delay:calc(var(--s) * -1s)}
@keyframes sc-tick{to{transform:rotate(360deg)}}
.fwsc .sc-lamp{transform-origin:860px 0;animation:sc-sway 6.5s ease-in-out infinite alternate}
@keyframes sc-sway{from{transform:rotate(-1.1deg)}to{transform:rotate(1.1deg)}}
.fwsc .sc-mote{animation:sc-mote var(--t) ease-in-out infinite alternate;animation-delay:var(--dl)}
@keyframes sc-mote{from{transform:translate(0,0);opacity:.2}50%{opacity:.9}to{transform:translate(var(--dx),var(--dy));opacity:.3}}
.fwsc .sc-steam path{opacity:0;transform-box:fill-box;transform-origin:50% 100%;animation:sc-steam 3.2s ease-in infinite}
.fwsc .sc-steam path:nth-child(2){animation-delay:-1.1s}.fwsc .sc-steam path:nth-child(3){animation-delay:-2.2s}
@keyframes sc-steam{0%{opacity:0;transform:translateY(16px) scaleX(.8)}30%{opacity:.45}100%{opacity:0;transform:translateY(-40px) scaleX(1.5)}}
.fwsc .sc-mug{transform-origin:1331px 774px}
.fwsc .sc-mug.is-jump{animation:sc-jump .42s cubic-bezier(.3,1.6,.5,1)}
@keyframes sc-jump{30%{transform:translateY(-22px) rotate(-6deg)}60%{transform:translateY(0) rotate(3deg)}80%{transform:translateY(-6px)}}

/* ---- the paper ---- */
.fwsc .sc-paper{transform-origin:315px 900px;transform:translate(0,600px) rotate(-6deg);transition:transform 1s cubic-bezier(.2,.85,.25,1)}
.fwsc .sc[data-paper=up] .sc-paper{transform:none}
.fwsc .sc[data-paper=show] .sc-paper{transform:translate(70px,-34px) rotate(4deg)}
.fwsc .sc-paperin{transform-origin:315px 900px;animation:sc-hold 3.6s ease-in-out infinite alternate}
@keyframes sc-hold{from{transform:rotate(-.8deg) translateY(0)}to{transform:rotate(.8deg) translateY(-5px)}}

/* ---- the witness: idle ---- */
.fwsc .w-all{animation:sc-breathe 3.6s ease-in-out infinite alternate}
@keyframes sc-breathe{to{transform:translateY(3px)}}
.fwsc .w-lean{transform-origin:880px 720px;transition:transform .7s cubic-bezier(.34,1.3,.64,1)}
.fwsc .w-head{transform-origin:880px 440px;transition:transform .55s cubic-bezier(.34,1.45,.64,1)}
.fwsc .w-hanim{transform-origin:880px 440px}
.fwsc .w-eye{transform-box:fill-box;transform-origin:center;animation:sc-blink 5.2s infinite}
.fwsc .w-eye:last-child{animation-delay:.02s}
@keyframes sc-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.08)}}
.fwsc .w-pupil{transition:transform .4s cubic-bezier(.4,0,.2,1)}
.fwsc .w-brow{transform-box:fill-box;transform-origin:center;transition:transform .4s cubic-bezier(.34,1.5,.64,1)}
.fwsc .w-m{opacity:0;transition:opacity .16s}
.fwsc .sc[data-st=idle] .m-neutral{opacity:1}
.fwsc .w-eyes-happy{opacity:0;transition:opacity .15s}
.fwsc .w-eyes-open{transition:opacity .15s}
.fwsc .w-blush{opacity:0;transition:opacity .6s}
.fwsc .w-red{opacity:0;transition:opacity .5s}
.fwsc .w-arm{transform-origin:0 0;transition:transform .6s cubic-bezier(.34,1.3,.64,1)}
.fwsc .w-arm-l{transform:translate(768px,606px) rotate(10deg)}
.fwsc .w-arm-r{transform:translate(992px,606px) rotate(-10deg)}
.fwsc .w-armin{transform-origin:0 0}
.fwsc .fx{opacity:0}

/* studying the sketch */
.fwsc .sc[data-st=look] .w-lean{transform:translateY(8px) scale(1.02)}
.fwsc .sc[data-st=look] .w-head{transform:rotate(-4deg) translateY(6px)}
.fwsc .sc[data-st=look] .w-pupil{transform:translate(-7px,7px)}
.fwsc .sc[data-st=look] .w-brow-l{transform:translateY(-4px) rotate(-5deg)}
.fwsc .sc[data-st=look] .w-brow-r{transform:translateY(-4px) rotate(5deg)}
.fwsc .sc[data-st=look] .m-think{opacity:1}
.fwsc .sc[data-st=look] .w-arm-l{transform:translate(780px,600px) rotate(14deg)}
.fwsc .sc[data-st=look] .w-arm-r{transform:translate(980px,600px) rotate(-14deg)}

/* delighted */
.fwsc .sc[data-st=delighted] .w-eyes-open{opacity:0}
.fwsc .sc[data-st=delighted] .w-eyes-happy{opacity:1}
.fwsc .sc[data-st=delighted] .w-brow{transform:translateY(-10px)}
.fwsc .sc[data-st=delighted] .m-grin{opacity:1}
.fwsc .sc[data-st=delighted] .w-blush{opacity:.75}
.fwsc .sc[data-st=delighted] .w-head{transform:rotate(5deg)}
.fwsc .sc[data-st=delighted] .w-bob{animation:sc-bounce .42s ease-in-out infinite alternate}
.fwsc .sc[data-st=delighted] .w-arm-l{transform:translate(856px,520px) rotate(30deg)}
.fwsc .sc[data-st=delighted] .w-arm-r{transform:translate(904px,520px) rotate(-30deg)}
.fwsc .sc[data-st=delighted] .w-arm-l .w-armin{animation:sc-clap-l .3s ease-in-out infinite alternate}
.fwsc .sc[data-st=delighted] .w-arm-r .w-armin{animation:sc-clap-r .3s ease-in-out infinite alternate}
.fwsc .sc[data-st=delighted] .fx-spark g{animation:sc-twinkle 1s ease-in-out infinite;animation-delay:var(--d)}
.fwsc .sc[data-st=delighted] .fx-spark{opacity:1}
.fwsc .sc[data-st=delighted] .fx-bang{animation:sc-pop .5s cubic-bezier(.3,1.8,.5,1) .1s both}
@keyframes sc-bounce{to{transform:translateY(-9px)}}
@keyframes sc-clap-l{from{transform:translateX(-10px)}to{transform:translateX(2px)}}
@keyframes sc-clap-r{from{transform:translateX(10px)}to{transform:translateX(-2px)}}
@keyframes sc-twinkle{0%,100%{opacity:0;transform:scale(.4)}40%{opacity:1;transform:scale(1.1)}}
.fwsc .fx-spark g{transform-box:fill-box;transform-origin:center;opacity:0}
@keyframes sc-pop{0%{opacity:0;transform:scale(.2) translateY(20px)}100%{opacity:1;transform:none}}
.fwsc .fx-bang,.fwsc .fx-q{transform-box:fill-box;transform-origin:50% 100%}

/* happy */
.fwsc .sc[data-st=happy] .w-brow{transform:translateY(-6px)}
.fwsc .sc[data-st=happy] .m-smile{opacity:1}
.fwsc .sc[data-st=happy] .w-blush{opacity:.45}
.fwsc .sc[data-st=happy] .w-head{transform:rotate(3deg)}
.fwsc .sc[data-st=happy] .w-hanim{animation:sc-nod .55s ease-in-out 3 alternate}
.fwsc .sc[data-st=happy] .w-arm-l{transform:translate(858px,560px) rotate(24deg)}
.fwsc .sc[data-st=happy] .w-arm-r{transform:translate(902px,560px) rotate(-24deg)}
.fwsc .sc[data-st=happy] .fx-spark{opacity:1}
.fwsc .sc[data-st=happy] .fx-spark g:nth-child(odd){animation:sc-twinkle 1.4s ease-in-out infinite;animation-delay:var(--d)}
@keyframes sc-nod{to{transform:rotate(-3deg) translateY(6px)}}

/* unsure */
.fwsc .sc[data-st=unsure] .w-head{transform:rotate(-9deg)}
.fwsc .sc[data-st=unsure] .w-brow-l{transform:translateY(-9px) rotate(-12deg)}
.fwsc .sc[data-st=unsure] .w-brow-r{transform:translateY(2px) rotate(8deg)}
.fwsc .sc[data-st=unsure] .w-pupil{transform:translate(7px,-6px)}
.fwsc .sc[data-st=unsure] .m-wavy{opacity:1}
.fwsc .sc[data-st=unsure] .w-arm-l{transform:translate(846px,454px) rotate(38deg)}
.fwsc .sc[data-st=unsure] .w-arm-l .w-armin{animation:sc-tap 1.1s ease-in-out .6s infinite}
.fwsc .sc[data-st=unsure] .fx-q{animation:sc-pop .5s cubic-bezier(.3,1.8,.5,1) .2s both,sc-float 2.4s ease-in-out .7s infinite alternate}
.fwsc .sc[data-st=unsure] .fx-sweat{animation:sc-drip 2.2s ease-in .5s infinite}
@keyframes sc-tap{0%,100%{transform:none}50%{transform:translate(2px,-4px)}}
@keyframes sc-float{to{transform:translateY(-12px) rotate(8deg)}}
@keyframes sc-drip{0%{opacity:0;transform:translateY(-6px)}20%{opacity:1}100%{opacity:0;transform:translateY(26px)}}

/* annoyed */
.fwsc .sc[data-st=annoyed] .w-lean{transform:translateY(-8px)}
.fwsc .sc[data-st=annoyed] .w-brow-l{transform:translateY(4px) rotate(14deg)}
.fwsc .sc[data-st=annoyed] .w-brow-r{transform:translateY(4px) rotate(-14deg)}
.fwsc .sc[data-st=annoyed] .m-frown{opacity:1}
.fwsc .sc[data-st=annoyed] .w-hanim{animation:sc-shakehead .38s ease-in-out 4 alternate}
.fwsc .sc[data-st=annoyed] .w-arm-l{transform:translate(734px,606px) rotate(18deg)}
.fwsc .sc[data-st=annoyed] .w-arm-r{transform:translate(1026px,606px) rotate(-18deg)}
.fwsc .sc[data-st=annoyed] .fx-puff{animation:sc-sigh 1.4s ease-out .4s both}
@keyframes sc-shakehead{from{transform:rotate(-5deg)}to{transform:rotate(5deg)}}
@keyframes sc-sigh{0%{opacity:0;transform:scale(.4)}30%{opacity:.9}100%{opacity:0;transform:scale(1.5) translateY(-20px)}}
.fwsc .fx-puff{transform-box:fill-box;transform-origin:center}

/* furious */
.fwsc .sc[data-st=furious] .w-brow-l{transform:translateY(6px) rotate(24deg)}
.fwsc .sc[data-st=furious] .w-brow-r{transform:translateY(6px) rotate(-24deg)}
.fwsc .sc[data-st=furious] .m-shout{opacity:1}
.fwsc .sc[data-st=furious] .w-red{opacity:.42}
.fwsc .sc[data-st=furious] .w-head{transform:translateY(6px)}
.fwsc .sc[data-st=furious] .w-hanim{animation:sc-tremble .09s linear infinite}
.fwsc .sc[data-st=furious] .w-arm-l{transform:translate(752px,612px) rotate(12deg)}
.fwsc .sc[data-st=furious] .w-arm-r{transform:translate(1008px,612px) rotate(-12deg)}
.fwsc .sc[data-st=furious] .w-armin{animation:sc-slam .62s cubic-bezier(.55,0,1,.45) 2}
.fwsc .sc[data-st=furious] .fx-vein{animation:sc-throb .5s ease-in-out .2s infinite alternate}
.fwsc .sc[data-st=furious] .fx-puff{animation:sc-sigh 1.1s ease-out .5s 2}
@keyframes sc-tremble{50%{transform:translateX(2.5px)}}
@keyframes sc-slam{0%{transform:translateY(-110px)}62%{transform:translateY(0)}75%{transform:translateY(-10px)}100%{transform:translateY(0)}}
@keyframes sc-throb{from{opacity:.65;transform:scale(.92)}to{opacity:1;transform:scale(1.08)}}
.fwsc .fx-vein{transform-box:fill-box;transform-origin:center}

@media (prefers-reduced-motion:reduce){
  .fwsc *,.fwsc *::before{animation:none!important;transition-duration:0s!important}
  .fwsc .fx{opacity:0!important}
  .fwsc .sc[data-st=delighted] .fx-bang,.fwsc .sc[data-st=unsure] .fx-q,.fwsc .sc[data-st=furious] .fx-vein{opacity:1!important}
}
`;
