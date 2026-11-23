/**
 * 2 Many Notes, Update 1 (phase A): a nicer, lived-in office. An office chair
 * (its armrests show when you look down), a wall shelf with binders and
 * books, a coat rack with a jacket by the door, a big plant in the corner, a
 * water cooler, blinds in the window, a desk mat, a family photo, a poster,
 * outlets and a power strip; decorative pads of sticky notes and a few missed
 * paper balls on the floor (none of them count); soft contact shadows under
 * everything so nothing floats.
 *
 * Shadows of things that can be picked up are children of those things
 * (userData.shadow), so the game can hide them while they are held.
 */
import * as THREE from 'three';
import { hiPaint, pixPaint, skin } from './textures';
import { bookSpine, buildChair, buildCoatRack, buildCooler, buildFicus, buildSucculent } from './room';

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cyl(r: number, h: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D, seg = 12, rTop = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), lambert(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* ---- soft contact shadows ---- */

let shadowTex: THREE.Texture | null = null;
function shadowMap() {
  shadowTex ??= pixPaint(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 4, 32, 32, 31);
    r.addColorStop(0, 'rgba(0,0,0,0.75)');
    r.addColorStop(0.55, 'rgba(0,0,0,0.38)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  });
  return shadowTex;
}

/** A soft dark patch, lying flat (w × d metres, strength 0–1). */
function shadow(w: number, d: number, strength = 0.6) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowMap(), transparent: true, opacity: strength, depthWrite: false, color: '#000000' }));
  m.rotation.x = -Math.PI / 2;
  m.userData.shadow = true;
  m.renderOrder = -1;
  return m;
}

const DESK = 0.7604;

/** Shadows under the things on the desk (children, so they move with them). */
function deskShadows(objects: Map<string, THREE.Object3D>) {
  const under: [string, number, number, number?][] = [
    ['mug', 0.13, 0.13],
    ['bottle', 0.11, 0.11],
    ['plant', 0.22, 0.22, 0.7],
    ['phone', 0.26, 0.22],
    ['lamp', 0.2, 0.2],
    ['radio', 0.24, 0.12],
    ['monitor', 0.34, 0.3, 0.7],
    ['stapler', 0.2, 0.08, 0.5],
    ['report', 0.28, 0.34, 0.4],
    ['globe', 0.13, 0.13],
    ['duck', 0.11, 0.12],
    ['tissues', 0.16, 0.2],
    ['ball', 0.08, 0.08],
    ['can', 0.09, 0.09],
    ['sandwich', 0.22, 0.22, 0.35],
    ['card', 0.14, 0.12, 0.45],
  ];
  for (const [id, w, d, s] of under) {
    const o = objects.get(id);
    if (!o) continue;
    o.updateMatrixWorld(true);
    const at = new THREE.Vector3();
    o.getWorldPosition(at);
    const sh = shadow(w, d, s ?? 0.55);
    sh.position.y = DESK - at.y;
    // Undo the object's own turn around x/z (the shadow stays flat on the desk)
    sh.rotation.set(-Math.PI / 2 - o.rotation.x, 0, 0);
    o.add(sh);
  }
}

/* ---- the props ---- */

/** An invisible, bigger area to press on (small things are hard to hit, above all with a finger). */
function grabArea(o: THREE.Object3D | undefined, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) {
  if (!o) return;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
  m.position.set(x, y, z);
  o.add(m);
}

export function buildProps4(scene: THREE.Scene, objects: Map<string, THREE.Object3D>) {
  deskShadows(objects);
  grabArea(objects.get('clock'), new THREE.CircleGeometry(0.2, 16), 0, 0, 0.02);
  grabArea(objects.get('cables'), new THREE.SphereGeometry(0.14, 8, 6));
  grabArea(objects.get('globe'), new THREE.SphereGeometry(0.058, 8, 6), 0, 0.07, 0.01);
  grabArea(objects.get('mouse'), new THREE.BoxGeometry(0.1, 0.05, 0.14));
  grabArea(objects.get('ball'), new THREE.SphereGeometry(0.05, 8, 6));
  grabArea(objects.get('photo'), new THREE.CircleGeometry(0.075, 12), 0, 0, 0.001);
  grabArea(objects.get('ink'), new THREE.BoxGeometry(0.1, 0.05, 0.08));

  // Fixed shadows: pen cup and lamp foot on the desk; desk, cabinets, bin on the floor
  const fixed: [number, number, number, number, number, number][] = [
    [-0.44, DESK, -0.38, 0.12, 0.12, 0.55],
    [0, 0.0012, -0.55, 1.9, 1.1, 0.5],
    [-1.28, 0.0012, -1.22, 0.62, 0.66, 0.6],
    [1.3, 0.0012, -0.6, 0.66, 0.66, 0.6],
    [1.0, 0.0012, 0.2, 0.42, 0.42, 0.6],
    [0, 0.0012, 0.45, 0.75, 0.75, 0.5],
    [1.6, 0.0012, -1.35, 0.55, 0.55, 0.55],
    [-1.33, 0.0012, 0.32, 0.45, 0.45, 0.55],
    [-1.52, 0.0012, -0.55, 0.3, 1.0, 0.45],
  ];
  for (const [x, y, z, w, d, s] of fixed) {
    const sh = shadow(w, d, s);
    sh.position.set(x, y, z);
    scene.add(sh);
  }

  // The lamp's cable runs back to a switch on the desk (the lamp itself has none)
  const lampCable = new THREE.Mesh(
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.66, 0.765, -0.42),
        new THREE.Vector3(-0.74, 0.764, -0.47),
        new THREE.Vector3(-0.76, 0.764, -0.55),
        new THREE.Vector3(-0.8, 0.764, -0.7),
        new THREE.Vector3(-0.83, 0.764, -0.9),
        new THREE.Vector3(-0.84, 0.75, -0.985),
        new THREE.Vector3(-0.845, 0.6, -0.995),
        new THREE.Vector3(-0.85, 0.3, -1.0),
      ]),
      40,
      0.004,
      5,
    ),
    lambert('#1d1f23'),
  );
  lampCable.userData.joins = true;
  scene.add(lampCable);
  const sw = new THREE.Group();
  sw.position.set(-0.76, 0.772, -0.55);
  sw.rotation.y = 0.4;
  sw.userData.id = 'lampSwitch';
  scene.add(sw);
  objects.set('lampSwitch', sw);
  box(0.03, 0.016, 0.06, '#efece4', 0, 0, 0, sw);
  const slider = box(0.016, 0.008, 0.014, '#3a3d42', 0, 0.01, -0.012, sw);
  slider.userData.slider = true;
  grabArea(sw, new THREE.BoxGeometry(0.08, 0.05, 0.1));
  const swShadow = shadow(0.07, 0.1, 0.5);
  swShadow.position.y = -0.0076;
  sw.add(swShadow);

  // Desk mat under the keyboard
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.32), lambert('#34455a'));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.7606, -0.45);
  skin(mat, 'carpet', 3, 1.5);
  scene.add(mat);

  /* Office chair: you sit on it; the seat and armrests show when you look down */
  const chair = new THREE.Group();
  chair.position.set(0, 0, 0.45);
  scene.add(chair);
  buildChair(chair);
  // You sit in it: clicks go through it (the armrests would hide the bottom drawer)
  chair.traverse((c) => (c.userData.ghost = true));

  /* Wall shelf on the right, above the printer: binders below, books above */
  const SX = 1.675;
  for (const y of [1.5, 1.88]) {
    skin(box(0.25, 0.025, 0.86, '#8a6a48', SX, y, -1.02, scene), 'wood', 1, 3);
    for (const z of [-1.38, -0.66]) box(0.2, 0.03, 0.02, '#3a3d42', SX + 0.02, y - 0.03, z, scene);
  }
  const binderColors = ['#c62828', '#1f4fb0', '#2f7a3a', '#e8b234', '#6a2c70', '#1f4fb0', '#c62828'];
  binderColors.forEach((c, i) => {
    const b = box(0.22, 0.3, 0.06, c, SX - 0.005, 1.665, -1.38 + i * 0.075, scene);
    b.rotation.x = i === 6 ? 0.25 : 0;
    // A label on the spine (facing the room)
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.08), lambert('#f4f1e8'));
    lab.rotation.y = -Math.PI / 2;
    lab.position.set(-0.111, 0.05, 0);
    b.add(lab);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), lambert('#1d1d1f'));
    hole.rotation.y = -Math.PI / 2;
    hole.position.set(-0.111, -0.07, 0);
    b.add(hole);
  });
  const bookColors = ['#7a3b2e', '#2b4f8a', '#d8cfb8', '#3c6b4a', '#8a6a48', '#b84a3a', '#444a55', '#c9a64a', '#5a6e8a'];
  let bz = -1.4;
  bookColors.forEach((c, i) => {
    const h = 0.18 + ((i * 37) % 7) * 0.012;
    const w = 0.03 + ((i * 13) % 3) * 0.008;
    const b = box(0.17, h, w, c, SX, 1.8925 + h / 2, bz + w / 2, scene);
    const spine = new THREE.MeshLambertMaterial({ map: bookSpine(c, i) });
    const pages = lambert('#efe8d6');
    const cover = b.material as THREE.Material;
    (b as THREE.Mesh).material = [pages, spine, pages, pages, cover, cover];
    if (i === bookColors.length - 1) b.rotation.x = 0.35;
    bz += w + 0.004;
  });
  // A small plant and a pad of notes on the top shelf
  const succ = new THREE.Group();
  succ.position.set(SX, 1.9375, -0.75);
  scene.add(succ);
  buildSucculent(succ);

  /* Coat rack with a jacket, between the printer and the door */
  const rack = new THREE.Group();
  rack.position.set(1.6, 0, -0.2);
  scene.add(rack);
  buildCoatRack(rack);

  /* A big plant in the back right corner */
  const ficus = new THREE.Group();
  ficus.position.set(1.6, 0, -1.35);
  scene.add(ficus);
  buildFicus(ficus);

  /* Water cooler by the window */
  const cooler = new THREE.Group();
  cooler.position.set(-1.33, 0, 0.32);
  cooler.rotation.y = 0.9;
  scene.add(cooler);
  buildCooler(cooler);

  /* Blinds, half way down the window (window centre -1.58, 1.45, -0.55, facing +x) */
  const blinds = new THREE.Group();
  blinds.position.set(-1.575, 1.45, -0.55);
  blinds.rotation.y = Math.PI / 2;
  scene.add(blinds);
  box(0.97, 0.035, 0.03, '#e9e6de', 0, 0.375, 0, blinds);
  for (let i = 0; i < 9; i++) {
    const slat = box(0.95, 0.004, 0.04, '#f1eee6', 0, 0.345 - i * 0.028, 0, blinds);
    slat.rotation.x = 0.5;
  }
  box(0.95, 0.012, 0.045, '#e2ded4', 0, 0.345 - 9 * 0.028, 0, blinds);
  for (const x of [-0.3, 0.3]) box(0.003, 0.3, 0.003, '#d8d4c8', x, 0.24, 0.022, blinds);

  /* A radiator under the window */
  const rad = new THREE.Group();
  rad.position.set(-1.55, 0.12, -0.55);
  scene.add(rad);
  for (let i = 0; i < 20; i++) box(0.06, 0.5, 0.025, '#e8e4da', 0, 0.25, -0.43 + i * 0.045, rad);
  box(0.03, 0.03, 0.92, '#d8d4c8', 0, 0.02, 0, rad);
  box(0.03, 0.03, 0.92, '#d8d4c8', 0, 0.48, 0, rad);
  cyl(0.012, 0.12, '#cfcbc0', 0.01, -0.06, 0.44, rad, 6);
  const knob = cyl(0.022, 0.03, '#ffffff', 0.04, 0.42, 0.47, rad, 10);
  knob.rotation.z = Math.PI / 2;

  /* Family photo on the desk, facing you */
  const frame = new THREE.Group();
  frame.position.set(0.2, 0.762, -0.9);
  frame.rotation.set(-0.2, -0.15, 0);
  scene.add(frame);
  box(0.11, 0.14, 0.012, '#3a2c22', 0, 0.07, 0, frame);
  const pic = new THREE.Mesh(
    new THREE.PlaneGeometry(0.09, 0.115),
    new THREE.MeshLambertMaterial({
      map: pixPaint(36, 46, (g) => {
        g.fillStyle = '#9fd0ef';
        g.fillRect(0, 0, 36, 46);
        g.fillStyle = '#7fbf5f';
        g.fillRect(0, 30, 36, 16);
        const person = (x: number, h: number, c: string) => {
          g.fillStyle = '#f1c9a5';
          g.fillRect(x, 30 - h - 4, 4, 4);
          g.fillStyle = c;
          g.fillRect(x - 1, 30 - h, 6, h);
        };
        person(6, 14, '#c62828');
        person(15, 16, '#1f4fb0');
        person(25, 9, '#e8b234');
        g.fillStyle = '#8a6a48';
        g.fillRect(28, 34, 6, 4);
      }),
    }),
  );
  pic.position.set(0, 0.07, 0.007);
  frame.add(pic);
  const prop = box(0.02, 0.1, 0.01, '#3a2c22', 0, 0.05, -0.03, frame);
  prop.rotation.x = 0.5;

  /* Poster on the back wall: our own motif */
  const poster = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.55),
    new THREE.MeshLambertMaterial({
      map: hiPaint(80, 110, (g) => {
        const sky = g.createLinearGradient(0, 0, 0, 110);
        sky.addColorStop(0, '#2b3a6a');
        sky.addColorStop(1, '#f0a35a');
        g.fillStyle = sky;
        g.fillRect(0, 0, 80, 110);
        g.fillStyle = '#ffe76a';
        g.save();
        g.translate(40, 52);
        g.rotate(-0.12);
        g.fillRect(-16, -16, 32, 32);
        g.fillStyle = '#20232b';
        g.fillRect(-10, -6, 20, 2);
        g.fillRect(-10, 0, 14, 2);
        g.restore();
        g.fillStyle = '#1d2238';
        g.beginPath();
        g.moveTo(0, 110);
        g.lineTo(26, 78);
        g.lineTo(44, 94);
        g.lineTo(62, 72);
        g.lineTo(80, 92);
        g.lineTo(80, 110);
        g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 9px monospace';
        g.textAlign = 'center';
        g.fillText('ONE NOTE', 40, 14);
        g.fillText('AT A TIME', 40, 24);
      }),
    }),
  );
  poster.position.set(1.55, 1.58, -1.4955);
  poster.userData.label = true;
  scene.add(poster);

  /* Outlets and a power strip with cables under the desk */
  for (const [x, z, ry] of [
    [0.95, -1.497, 0],
    [-0.5, -1.497, 0],
    [-1.597, -0.2, Math.PI / 2],
  ])
    box(0.07, 0.1, 0.008, '#eeeae0', x, 0.3, z, scene).rotation.y = ry;
  box(0.3, 0.04, 0.06, '#e6e3dc', -0.15, 0.02, -0.95, scene);
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.05;
    const c = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, 0.03, -0.95),
          new THREE.Vector3(x, 0.06, -0.99),
          new THREE.Vector3(x + 0.01 * (i - 1), 0.4, -0.995),
          new THREE.Vector3(x, 0.74, -0.99),
          new THREE.Vector3(x, 0.766, -0.96),
          new THREE.Vector3(x, 0.765, -0.92),
        ]),
        30,
        0.004,
        5,
      ),
      lambert('#1d1f23'),
    );
    c.userData.joins = true;
    scene.add(c);
  }

  /* Ceiling lights: a grid under each panel */
  for (const x of [-0.6, 0.9]) {
    for (const d of [-0.14, 0.14]) {
      box(0.56, 0.01, 0.012, '#c9c5ba', x, 2.562, -0.5 + d, scene);
      box(0.012, 0.01, 0.56, '#c9c5ba', x + d, 2.562, -0.5, scene);
    }
  }

  /* Pads of sticky notes lying around (decoration, not to-dos) */
  const PAD = { yellow: '#ffe76a', pink: '#ff9fc6', blue: '#8fd0ff' };
  const pad = (x: number, y: number, z: number, turn: number, color: keyof typeof PAD, h = 0.02) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = turn;
    scene.add(g);
    const side = new THREE.Color(PAD[color]).multiplyScalar(0.82);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.076, h, 0.076), lambert(`#${side.getHexString()}`));
    b.position.y = h / 2;
    g.add(b);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.076), lambert(PAD[color], { emissive: PAD[color], emissiveIntensity: 0.25 }));
    top.rotation.x = -Math.PI / 2;
    top.position.y = h + 0.0005;
    g.add(top);
    // A sheet half peeled off
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.076, 0.076), lambert(PAD[color], { side: THREE.DoubleSide, emissive: PAD[color], emissiveIntensity: 0.2 }));
    sheet.position.set(0.01, h + 0.012, 0.01);
    sheet.rotation.set(-Math.PI / 2 + 0.35, 0, 0.3);
    g.add(sheet);
    const sh = shadow(0.12, 0.12, 0.45);
    sh.position.y = 0.0006;
    g.add(sh);
    return g;
  };
  pad(1.42, 0.861, -0.74, 0.4, 'pink');
  pad(-1.38, 1.302, -1.12, -0.3, 'yellow', 0.03);
  pad(-1.465, 1.012, -0.28, 0.2, 'blue');
  pad(0.56, 0.7605, -0.93, -0.5, 'yellow', 0.025);
  pad(SX, 1.513, -0.62, 0.2, 'pink');
  pad(0.5, 0.003, 0.25, 0.9, 'yellow', 0.015);
  pad(-0.12, 0.7605, -0.93, 0.25, 'blue', 0.03);
  pad(-0.82, 0.003, -0.05, -0.6, 'pink', 0.02);
  pad(1.48, 0.701, -0.31, 0.1, 'yellow', 0.02);
  pad(-1.52, 0.618, -0.3, 0.5, 'yellow', 0.025);

  /* Paper balls that missed the bin */
  const BALL = ['#ffe76a', '#ff9fc6', '#ffe76a', '#8fd0ff', '#ffe76a'];
  BALL.forEach((c, i) => {
    const geo = new THREE.IcosahedronGeometry(0.02, 1);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    const bump = new Map<string, number>();
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k);
      const key = `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
      if (!bump.has(key)) bump.set(key, 0.78 + ((k * 7919 + i * 104729) % 100) / 220);
      v.multiplyScalar(bump.get(key)!);
      p.setXYZ(k, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const ball = new THREE.Mesh(geo, lambert(c, { flatShading: true }));
    const a = 1.2 + i * 0.9;
    ball.position.set(1.0 + Math.cos(a) * (0.26 + (i % 2) * 0.08), 0.018, 0.2 + Math.sin(a) * (0.26 + (i % 3) * 0.05));
    // Not inside the ream of paper on the floor
    if (Math.hypot(ball.position.x - 1.12, ball.position.z + 0.14) < 0.2) ball.position.x -= 0.16;
    scene.add(ball);
  });
}
