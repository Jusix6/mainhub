/**
 * 2 Many Notes: the sticky notes. Each note is a slightly curled square
 * (7.6 cm) with its to-do handwritten on a canvas texture (Caveat), stuck
 * somewhere in the office. When it is done it is crumpled into a paper ball.
 *
 * Phase 3: 65 notes in two layers (1 = the desk and the room, 40 notes;
 * 2 = the computer, 25 notes). Phase 5 adds layer 3 (drawers and puzzles,
 * 20 notes; since Update 1 they stick in the room from the start, spread over
 * walls, cabinets, door and floor like everything else), layer 4
 * (14 hidden notes: under things, behind things, under other notes) and the
 * last note, "Go home." — 100 in all. `kind` says how one is done:
 *   instant: read it and click it (it is a joke, or you just did it)
 *   action:  something has to happen in the office or on the computer (game.ts knows what)
 * `after`: the note only shows up once these notes are done (or an event like
 * "@boss" happened: the boss's mail was read); it still counts from the start.
 * `with`: a clue note that goes together with the note it is a clue for.
 * Colours as in the plan: yellow = do something in the office, pink = needs
 * the computer, blue = a clue for another note.
 */
import * as THREE from 'three';
import { MONITOR, SCREEN } from './world';

export type NoteColor = 'yellow' | 'pink' | 'blue';

export interface NoteDef {
  id: string;
  color: NoteColor;
  kind: 'instant' | 'action';
  layer: 1 | 2 | 3 | 4;
  /** Where it sticks and which way it faces (rotation in radians). */
  pos: [number, number, number];
  rot: [number, number, number];
  /** Cell on the monitor's screen (column, row), if it sticks there. */
  screen?: [number, number];
  /** Shows up only once all of these are done (note ids, or events starting with @). */
  after?: string[];
  /** A clue: done together with this note. */
  with?: string;
  /** Pinned on the cork board (gets a pin). */
  pin?: boolean;
  /** Something on the back (the note can be turned over while reading it). */
  back?: boolean;
  /** Never in the room (the counter at the top is this note). */
  virtual?: boolean;
}

export const COLORS: Record<NoteColor, string> = { yellow: '#ffe76a', pink: '#ff9fc6', blue: '#8fd0ff' };

type V3 = [number, number, number];
const flat = (turn: number): V3 => [-Math.PI / 2, 0, turn];
const DESK = 0.762;
const WALL = -1.4965;
const BOARD = -1.4775;

/**
 * The screen is covered by a 4 × 3 grid of notes (one per cell, a little crooked, slightly
 * overlapping): what DeskOS shows can only be clicked where the notes are gone.
 */
const SCREEN_GRID: string[][] = [
  ['coffee', 'ignore', 'power', 'sandwich'],
  ['blink', 'stretch', 'count', 'todo'],
  ['staple', 'breathe', 'callIt', 'keyboard'],
];
const INSTANT = new Set([
  'stretch',
  'stop',
  'blink',
  'breathe',
  'ignore',
  'count',
  'smile',
  'great',
  'touch',
  'posture',
  // Layer 4: finding them is the job
  'underKb',
  'monBack',
  'ceiling',
  'under1',
  'under2',
  'under3',
  'under4',
  'inMug',
  'inDrawer',
  'behindPic',
  'underPot',
  'binDive',
  'underStapler',
  'home',
]);
const kind = (id: string) => (INSTANT.has(id) ? ('instant' as const) : ('action' as const));
const onScreen: NoteDef[] = SCREEN_GRID.flatMap((row, r) =>
  row.map((id, c) => {
    const i = r * 4 + c;
    const jx = Math.sin(i * 12.9) * 0.005;
    const jy = Math.cos(i * 7.3) * 0.005;
    return {
      id,
      color: 'yellow' as const,
      kind: kind(id),
      layer: 1 as const,
      pos: [SCREEN.x + (c - 1.5) * (SCREEN.w / 4) + jx, SCREEN.y + (1 - r) * (SCREEN.h / 3) + jy, SCREEN.z + 0.001 + i * 0.0007] as V3,
      rot: [0, 0, Math.sin(i * 3.7) * 0.07] as V3,
      screen: [c, r] as [number, number],
    };
  }),
);
const BEZEL = MONITOR.z + 0.026;

/** The cork board: 5 × 3 computer notes (row 2 is for notes that come later). */
const BOARD_GRID: string[][] = [
  ['mail', 'spam', 'spamClue', 'unsub', 'boss'],
  ['mumMail', 'mute', 'wallpaper', 'trash', 'icons'],
  ['newpass', 'print', 'excel', 'meeting', 'meetingClue'],
];
const CLUES: Record<string, string> = { spamClue: 'spam', meetingClue: 'meeting', password: 'login' };
const LATER: Record<string, string[]> = {
  newpass: ['login'],
  print: ['@boss'],
  excel: ['@boss'],
  meeting: ['@boss'],
  meetingClue: ['@boss'],
};
const onBoard: NoteDef[] = BOARD_GRID.flatMap((row, r) =>
  row.map((id, c) => {
    const i = r * 5 + c;
    return {
      id,
      color: CLUES[id] ? ('blue' as const) : ('pink' as const),
      kind: 'action' as const,
      layer: 2 as const,
      pos: [-0.44 + c * 0.22 + Math.sin(i * 5.1) * 0.014, 1.73 - r * 0.2 + Math.cos(i * 3.3) * 0.012, BOARD] as V3,
      rot: [0, 0, Math.sin(i * 2.9) * 0.09] as V3,
      pin: true,
      with: CLUES[id],
      after: LATER[id],
    };
  }),
);

const n = (id: string, color: NoteColor, layer: 1 | 2 | 3 | 4, pos: V3, rot: V3, extra: Partial<NoteDef> = {}): NoteDef => ({
  id,
  color,
  kind: kind(id),
  layer,
  pos,
  rot,
  ...extra,
});

export const NOTES: NoteDef[] = [
  ...onScreen,
  // Layer 1: the desk and the room
  n('plant', 'yellow', 1, [-0.74, 0.9, -0.7], [0.05, 0.45, 0.1]),
  n('phone', 'yellow', 1, [0.6, 0.79, -0.628], [-0.35, 0, -0.08]),
  n('lamp', 'yellow', 1, [-0.6, DESK, -0.27], flat(0.3)),
  n('pen', 'yellow', 1, [-0.32, DESK, -0.52], flat(-0.25)),
  n('stop', 'yellow', 1, [-0.08, DESK, -0.2], flat(0.12)),
  n('window', 'yellow', 1, [-1.585, 1.32, 0.12], [0, Math.PI / 2, 0.06]),
  n('mouse', 'yellow', 1, [0.26, DESK, -0.36], flat(-0.2)),
  n('clock', 'yellow', 1, [0.25, 2.08, WALL], [0, 0, 0.06]),
  n('picture', 'yellow', 1, [-1.34, 1.4, WALL], [0, 0, -0.08]),
  n('calendar', 'yellow', 1, [1.1, 1.16, WALL], [0, 0, 0.1]),
  n('duck', 'yellow', 1, [-0.15, DESK, -0.52], flat(0.18)),
  n('ball', 'yellow', 1, [0.34, DESK, -0.15], flat(-0.1)),
  n('globe', 'yellow', 1, [0.8, DESK, -0.62], flat(0.25)),
  n('ring', 'yellow', 1, [0.66, DESK, -0.16], flat(0.08)),
  n('banana', 'yellow', 1, [-0.4, 0.002, -0.08], flat(0.4)),
  n('can', 'yellow', 1, [0.78, 0.95, WALL], [0, 0, -0.08]),
  n('mum', 'yellow', 1, [0.62, 0.9, WALL], [0, 0, 0.06]),
  n('pizza', 'yellow', 1, [0.62, 1.05, WALL], [0, 0, -0.07]),
  n('signReport', 'yellow', 1, [0.6, 0.793, -0.31], flat(-0.12)),
  n('card', 'yellow', 1, [-0.4, DESK, -0.84], flat(-0.3)),
  n('receipts', 'yellow', 1, [0.07, DESK, -0.6], flat(0.15)),
  n('gerald', 'yellow', 1, [-0.64, 1.05, WALL], [0, 0, 0.09]),
  n('cables', 'yellow', 1, [-0.62, 0.002, -0.3], flat(-0.5)),
  // On the chair's armrests (look down), on the bin
  n('posture', 'yellow', 1, [-0.29, 0.678, 0.3], flat(0.1)),
  n('great', 'yellow', 1, [0.29, 0.678, 0.32], flat(-0.12)),
  n('smile', 'yellow', 1, [0.831, 0.23, 0.237], [0, -1.354, 0.05]),
  n('touch', 'yellow', 1, [-0.85, 1.08, WALL], [0, 0, -0.12]),
  n('radio', 'yellow', 1, [0.38, 1.0, WALL], [0, 0, 0.05]),
  // Layer 2: the computer. Around the monitor (the password, of course, on the monitor)
  n('password', 'blue', 2, [-0.212, 1.0, BEZEL], [0, 0, 0.1], { with: 'login' }),
  n('login', 'pink', 2, [0.214, 0.95, BEZEL], [0, 0, -0.08]),
  n('karen', 'pink', 2, [0.06, 1.142, BEZEL], [0, 0, 0.04]),
  n('popups', 'pink', 2, [-0.1, 0.812, BEZEL], [0, 0, 0.06], { after: ['login'] }),
  n('update', 'pink', 2, [0.04, 0.812, BEZEL], [0, 0, -0.05], { after: ['login'] }),
  n('save', 'pink', 2, [-0.1, 1.142, BEZEL], [0, 0, -0.06], { after: ['excel'] }),
  ...onBoard,
  // The printer and what comes out of it
  n('paper', 'yellow', 2, [1.2, 0.861, -0.66], flat(0.2)),
  n('fetch', 'yellow', 2, [1.47, 0.79, -0.428], [0, 0, 0.05], { after: ['print'] }),
  n('stapleOut', 'yellow', 2, [1.797, 1.05, -0.6], [0, -Math.PI / 2, 0.05], { after: ['fetch'] }),
  n('rate', 'pink', 2, [0.85, 1.25, WALL], [0, 0, 0.08], { after: ['callIt'] }),
  // Layer 3: drawers, the filing cabinet, the board (once layers 1 and 2 are done)
  ...layer3(),
  // Layer 4: hidden. Under things, behind things, under other notes
  n('underKb', 'yellow', 4, [0.05, 0.7616, -0.42], flat(0.2), { after: ['@kb'] }),
  n('monBack', 'yellow', 4, [-0.12, 1.15, -0.865], [0, 0, -0.2]),
  n('ceiling', 'yellow', 4, [0.35, 2.596, -0.3], [Math.PI / 2, 0, 0.3]),
  n('under1', 'yellow', 4, [-0.6, DESK - 0.0003, -0.27], flat(0.12), { after: ['lamp'] }),
  n('under2', 'yellow', 4, [-0.32, DESK - 0.0003, -0.52], flat(-0.1), { after: ['pen'] }),
  n('under3', 'yellow', 4, [-0.08, DESK - 0.0003, -0.2], flat(0.3), { after: ['stop'] }),
  n('under4', 'yellow', 4, [0.26, DESK - 0.0003, -0.36], flat(0.05), { after: ['mouse'] }),
  n('inMug', 'yellow', 4, [0.36, 0.866, -0.3], [-0.5, 0, 0.1], { after: ['@mug'] }),
  n('inDrawer', 'yellow', 4, [0.6, 0.047, 0.065], flat(0.2), { after: ['@drawer2'] }),
  n('behindPic', 'yellow', 4, [-1.05, 1.6, WALL], [0, 0, 0.05], { after: ['@pic'] }),
  n('underPot', 'yellow', 4, [-0.66, DESK, -0.8], flat(-0.3), { after: ['@pot'] }),
  n('counter', 'yellow', 4, [0, -10, 0], [0, 0, 0], { virtual: true }),
  n('binDive', 'yellow', 4, [1.0, 0.366, 0.2], flat(0.3), { after: ['@bin'] }),
  n('underStapler', 'yellow', 4, [0.27, DESK, -0.6], flat(0.3), { after: ['@stapler'] }),
];

function layer3(): NoteDef[] {
  const RIGHT = 1.797;
  const right: V3 = [0, -Math.PI / 2, 0];
  const onRight = (tilt: number): V3 => [right[0], right[1], tilt];
  const LEFT: V3 = [0, Math.PI / 2, 0.07];
  const CAB = -0.986;
  return [
    // On the drawers
    n('drawer', 'yellow', 3, [0.52, 0.6, -0.1425], [0, 0, 0.06]),
    n('middle', 'yellow', 3, [0.52, 0.38, -0.1425], [0, 0, -0.05]),
    n('key', 'yellow', 3, [0.52, 0.16, -0.1425], [0, 0, 0.08]),
    // The code, all over the room: the door, the left wall, the printer, the floor
    n('code1', 'blue', 3, [1.748, 1.42, 0.2], [0, -Math.PI / 2, 0.08], { with: 'drawer', back: true }),
    n('code2', 'blue', 3, [-1.597, 1.35, -1.25], LEFT, { with: 'drawer', back: true }),
    n('code3', 'blue', 3, [1.15, 0.79, -0.428], [0, 0, -0.06], { with: 'drawer', back: true }),
    n('code4', 'blue', 3, [0.3, 0.002, -0.05], flat(0.35), { with: 'drawer', back: true }),
    // Around the room
    n('keyClue', 'blue', 3, [0.85, 1.05, WALL], [0, 0, -0.05], { with: 'key' }),
    n('boss2', 'pink', 3, [-0.27, 1.1, WALL], [0, 0, 0.06]),
    n('photo', 'yellow', 3, [0.58, 1.48, BOARD], [0, 0, -0.07], { pin: true }),
    n('menu', 'yellow', 3, [-0.57, 1.74, BOARD], [0, 0, 0.09], { pin: true }),
    // The printer cabinet
    n('stamp', 'yellow', 3, [1.2, 0.645, -0.348], [0, 0, 0.05]),
    n('ink', 'yellow', 3, [1.44, 0.8625, -0.52], flat(0.2)),
    // The right wall, under the shelf
    n('cookie', 'yellow', 3, [RIGHT, 1.22, -0.95], onRight(0.06)),
    n('snacks', 'yellow', 3, [RIGHT, 0.98, -0.72], onRight(-0.09)),
    // The filing cabinet
    n('fileInvoice', 'yellow', 3, [-1.37, 1.12, CAB], [0, 0, -0.06]),
    n('cabinetJam', 'yellow', 3, [-1.2, 0.74, CAB], [0, 0, 0.05]),
    n('tax', 'yellow', 3, [-1.36, 0.6, CAB], [0, 0, 0.07]),
    // Only when something happens
    n('callback', 'pink', 3, [0.66, 0.79, -0.62], [-0.35, 0, 0.1], { after: ['@callback'] }),
    n('dave', 'yellow', 3, [0.06, 1.0, SCREEN.z + 0.009], [0, 0, 0.08], { after: ['@dave'] }),
  ];
}

/** The very last note: on the screen, once everything else is gone. */
NOTES.push(
  n('home', 'yellow', 4, [0, SCREEN.y, SCREEN.z + 0.012], [0, 0, 0.03], {
    after: NOTES.map((d) => d.id),
  }),
);

/** Note size in metres (a 76 mm sticky note). */
export const SIZE = 0.076;

/** Breaks a text into lines that fit `width` pixels. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The note's face: paper colour, a glue strip, the handwriting. */
export function noteTexture(text: string, color: NoteColor, maxAniso: number, maxSize = 52) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d')!;
  const base = COLORS[color];
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, base);
  grad.addColorStop(1, shade(base, -0.08));
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // Glue strip, a touch darker
  g.fillStyle = 'rgba(0,0,0,.05)';
  g.fillRect(0, 0, S, 34);
  // Handwriting, as big as fits
  g.fillStyle = '#20232b';
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  let size = maxSize;
  let lines: string[] = [];
  for (; size > 26; size -= 2) {
    g.font = `600 ${size}px Caveat, 'Comic Sans MS', cursive`;
    lines = wrap(g, text, S - 36);
    if (lines.length * size * 1.05 < S - 60) break;
  }
  const lh = size * 1.05;
  const top = S / 2 + 12 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => {
    g.save();
    g.translate(S / 2, top + i * lh);
    g.rotate((i % 2 ? 1 : -1) * 0.015);
    g.fillText(l, 0, 0);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

/** A note mesh: a square whose lower part curls away from what it sticks to. */
export function noteMesh(def: NoteDef, text: string, maxAniso: number, backText?: string) {
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 6, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = Math.max(0, (SIZE / 2 - 0.012 - y) / SIZE); // 0 at the glue strip, up to ~0.8 at the bottom
    p.setZ(i, t * t * 0.02 + 0.0015);
  }
  geo.computeVertexNormals();
  // The notes glow a little: they are the only clean, bright things in the room
  // (emissive through the same texture, so the handwriting stays dark)
  const map = noteTexture(text, def.color, maxAniso);
  const mat = new THREE.MeshLambertMaterial({ map, emissiveMap: map, emissive: '#9a9a9a', side: backText ? THREE.FrontSide : THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat);
  if (backText) {
    // The back: the same curled sheet seen from behind, its texture mirrored so it reads right
    const bmap = noteTexture(backText, def.color, maxAniso, 150);
    bmap.wrapS = THREE.RepeatWrapping;
    bmap.repeat.x = -1;
    const back = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: bmap, emissiveMap: bmap, emissive: '#9a9a9a', side: THREE.BackSide }));
    back.userData.note = def.id;
    m.add(back);
  }
  m.position.set(...def.pos);
  m.rotation.set(...def.rot);
  m.userData.note = def.id;
  if (def.pin) {
    const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshLambertMaterial({ color: '#d6332b' }));
    pin.position.set(0, SIZE / 2 - 0.01, 0.006);
    m.add(pin);
  }
  return m;
}

/** A crumpled paper ball in the note's colour. */
export function paperBall(color: NoteColor) {
  const geo = new THREE.IcosahedronGeometry(0.02, 1);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  // Corners shared by several faces appear more than once: they must move together, or the ball cracks
  const bump = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    if (!bump.has(key)) bump.set(key, 0.75 + Math.random() * 0.5);
    v.multiplyScalar(bump.get(key)!);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: COLORS[color], flatShading: true }));
}
