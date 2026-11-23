/**
 * 2 Many Notes, phase 3: the rest of the office, for the 65 notes of layers 1
 * and 2. On the back wall a cork board (the computer notes), a crooked
 * picture, a slow clock and an old calendar; on the desk a rubber duck, a
 * stress ball, a snow globe, a radio, tissues, a coffee ring, an empty can,
 * Dave's birthday card and receipts; under the desk a cable knot and a banana
 * peel; on the right a printer on a cabinet, its paper on the floor.
 *
 * Clickable things carry userData.id (in `objects`); the parts the game
 * animates are in `parts` by name.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { skin } from './textures';
import { buildBanana, buildCan, buildMouse, buildRadio, buildReceipts, buildTissues } from './desk';

type Parts = Map<string, THREE.Object3D>;

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function mesh(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, parent: THREE.Object3D, extra: THREE.MeshLambertMaterialParameters = {}) {
  const m = new THREE.Mesh(geo, lambert(color, extra));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D) =>
  mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);

const sphere = (r: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D, seg = 12) =>
  mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), color, x, y, z, parent);

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, k = 3) {
  const c = document.createElement('canvas');
  c.width = w * k;
  c.height = h * k;
  const g = c.getContext('2d')!;
  g.scale(k, k);
  paint(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A calendar page for a month (0–11), sharp enough to read. */
export function calendarPage(month: number) {
  const name = new Date(2026, month, 1).toLocaleString('en', { month: 'long' }).toUpperCase();
  return canvasTex(140, 200, (g) => {
    g.fillStyle = '#faf7ef';
    g.fillRect(0, 0, 140, 200);
    g.fillStyle = '#b23a3a';
    g.fillRect(0, 0, 140, 40);
    g.fillStyle = '#fff';
    g.font = 'bold 20px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(name, 70, 22);
    g.fillStyle = '#333';
    g.font = '12px Arial, sans-serif';
    for (let i = 0; i < 31; i++) g.fillText(String(i + 1), 14 + (i % 7) * 19, 60 + Math.floor(i / 7) * 26);
  });
}

/** Clock hands for a time in minutes since midnight. */
export function setClock(parts: Parts, minutes: number) {
  parts.get('clockMin')!.rotation.z = -(minutes / 60) * Math.PI * 2;
  parts.get('clockHour')!.rotation.z = -((minutes / 60) % 12 / 12) * Math.PI * 2;
}

export function buildProps(scene: THREE.Scene, objects: Map<string, THREE.Object3D>) {
  const parts: Parts = new Map();
  const thing = (id: string, x: number, y: number, z: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.userData.id = id;
    scene.add(g);
    objects.set(id, g);
    return g;
  };
  const WALL = -1.49;

  // Cork board for the computer notes (not clickable itself)
  skin(box(1.34, 0.69, 0.02, '#6b5038', 0, 1.525, WALL - 0.002, scene), 'wood', 3, 1.5);
  skin(box(1.3, 0.65, 0.022, '#c99a68', 0, 1.525, WALL, scene), 'cork', 4, 2);

  // Clock, five times slower than it should be (set by the game)
  const clock = thing('clock', 0, 2.15, WALL + 0.012);
  const face = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 28), '#f4f2ea', 0, 0, 0, clock);
  face.rotation.x = Math.PI / 2;
  const rim = mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 28), '#2d2f33', 0, 0, 0.012, clock);
  rim.userData.rim = true;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    box(0.008, i % 3 ? 0.014 : 0.024, 0.002, '#2d2f33', Math.sin(a) * 0.105, Math.cos(a) * 0.105, 0.014, clock).rotation.z = -a;
  }
  const hand = (name: string, len: number, w: number) => {
    const pivot = new THREE.Group();
    pivot.position.z = 0.016 + (name === 'clockMin' ? 0.002 : 0);
    clock.add(pivot);
    box(w, len, 0.002, '#1d1e21', 0, len / 2 - 0.01, 0, pivot);
    parts.set(name, pivot);
  };
  hand('clockHour', 0.07, 0.01);
  hand('clockMin', 0.1, 0.006);

  // A crooked picture: hills and a sun
  const pic = thing('picture', -1.05, 1.6, WALL + 0.012);
  box(0.42, 0.32, 0.02, '#5e4630', 0, 0, 0, pic);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.26),
    new THREE.MeshLambertMaterial({
      map: canvasTex(180, 130, (g) => {
        const sky = g.createLinearGradient(0, 0, 0, 130);
        sky.addColorStop(0, '#8ec5e8');
        sky.addColorStop(1, '#f3d9a6');
        g.fillStyle = sky;
        g.fillRect(0, 0, 180, 130);
        g.fillStyle = '#f2b33d';
        g.beginPath();
        g.arc(130, 45, 16, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#6f9f4a';
        g.beginPath();
        g.moveTo(0, 130);
        g.quadraticCurveTo(50, 50, 110, 110);
        g.quadraticCurveTo(150, 80, 180, 95);
        g.lineTo(180, 130);
        g.fill();
        g.fillStyle = '#557f37';
        g.beginPath();
        g.moveTo(0, 130);
        g.quadraticCurveTo(90, 85, 180, 130);
        g.fill();
      }),
    }),
  );
  art.position.z = 0.011;
  pic.add(art);
  pic.rotation.z = 0.16;

  // Calendar, three months behind (page set by the game)
  const cal = thing('calendar', 1.12, 1.45, WALL + 0.006);
  box(0.29, 0.03, 0.02, '#3a3c40', 0, 0.215, 0.005, cal);
  // The page hangs from a pivot at its top edge, so it can be lifted and flipped over
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.2, 0.002);
  cal.add(pivot);
  const page = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.4), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
  page.position.y = -0.2;
  page.userData.label = true;
  pivot.add(page);
  parts.set('calendarPage', page);
  parts.set('calendarPivot', pivot);
  // The pad of pages behind the top one (Update 2: pages are torn off)
  const pad = box(0.276, 0.396, 0.006, '#e9e4d6', 0, 0.002, -0.0035, cal);
  pad.userData.joins = true;
  for (let i = 0; i < 4; i++) box(0.276, 0.0012, 0.0062, '#cfc8b6', 0, -0.19 + i * 0.002, -0.0035, cal).userData.joins = true;
  // What stays at the top when a page is torn off: a jagged strip
  const stub = new THREE.Mesh(
    new THREE.PlaneGeometry(0.28, 0.014),
    new THREE.MeshLambertMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      map: canvasTex(140, 8, (g) => {
        g.fillStyle = '#faf7ef';
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(140, 0);
        for (let x = 140; x >= 0; x -= 5) g.lineTo(x, x % 10 ? 8 : 4);
        g.fill();
      }),
    }),
  );
  stub.position.set(0, 0.193, 0.0012);
  stub.visible = false;
  cal.add(stub);
  parts.set('calendarStub', stub);

  // Rubber duck, looking at you
  const duck = thing('duck', -0.25, 0.762, -0.6);
  const body = sphere(0.036, '#ffd23f', 0, 0.03, 0, duck);
  body.scale.set(1.15, 0.8, 1.25);
  sphere(0.024, '#ffd23f', 0, 0.068, 0.018, duck);
  const beak = mesh(new THREE.ConeGeometry(0.01, 0.024, 8), '#f08a24', 0, 0.064, 0.048, duck);
  beak.rotation.x = Math.PI / 2;
  sphere(0.004, '#111', -0.01, 0.074, 0.038, duck, 6);
  sphere(0.004, '#111', 0.01, 0.074, 0.038, duck, 6);
  duck.rotation.y = 0.4;

  // Stress ball
  const ball = thing('ball', 0.25, 0.79, -0.18);
  sphere(0.028, '#e0453a', 0, 0, 0, ball, 16);

  // Snow globe with a tiny tree; the snow lies at the bottom until shaken
  const globe = thing('globe', 0.78, 0.762, -0.5);
  mesh(new THREE.CylinderGeometry(0.038, 0.045, 0.03, 16), '#6b4a2e', 0, 0.015, 0, globe);
  mesh(new THREE.ConeGeometry(0.016, 0.04, 8), '#2f6b3a', 0, 0.06, 0, globe);
  const glass = mesh(new THREE.SphereGeometry(0.045, 16, 12), '#dff1ff', 0, 0.072, 0, globe, { transparent: true, opacity: 0.28, depthWrite: false });
  glass.renderOrder = 2;
  const snow = new THREE.Group();
  snow.position.y = 0.072;
  globe.add(snow);
  for (let i = 0; i < 16; i++) {
    const f = sphere(0.003, '#ffffff', (Math.random() - 0.5) * 0.06, -0.035, (Math.random() - 0.5) * 0.06, snow, 4);
    f.userData.rest = f.position.clone();
  }
  parts.set('snow', snow);

  // Radio, playing muzak (the game starts and stops the sound)
  const radio = thing('radio', 0.38, 0.807, -0.88);
  buildRadio(radio, parts);

  // Tissues; a tissue to hold (hidden until taken)
  const tissues = thing('tissues', -0.74, 0.8, -0.17);
  buildTissues(tissues);
  const tissue = thing('tissue', -0.74, 0.86, -0.17);
  // A soft, slightly crumpled sheet (lying flat, bumps up and down)
  const sheet = new THREE.PlaneGeometry(0.085, 0.085, 8, 8);
  sheet.rotateX(-Math.PI / 2);
  const sp = sheet.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z)) / 0.0425;
    sp.setY(i, Math.sin(x * 120 + z * 40) * 0.003 + Math.cos(z * 150) * 0.002 + edge * edge * 0.008);
  }
  sheet.computeVertexNormals();
  mesh(sheet, '#ffffff', 0, 0, 0, tissue, { side: THREE.DoubleSide });
  tissue.visible = false;

  // Coffee ring on the desk (a thin disc is easier to click than a ring)
  const ring = thing('ring', 0.5, 0.7615, -0.18);
  const stain = mesh(new THREE.RingGeometry(0.028, 0.038, 24), '#5a3a22', 0, 0, 0, ring, { transparent: true, opacity: 0.55 });
  stain.rotation.x = -Math.PI / 2;
  parts.set('stain', stain);
  const ringHit = new THREE.Mesh(new THREE.CircleGeometry(0.04, 12), new THREE.MeshBasicMaterial({ visible: false }));
  ringHit.rotation.x = -Math.PI / 2;
  ring.add(ringHit);

  // Banana peel on the floor
  const banana = thing('banana', -0.3, 0.012, -0.02);
  buildBanana(banana);
  banana.position.y = 0.002;
  banana.rotation.y = 0.6;

  // Empty can
  const can = thing('can', 0.75, 0.822, -0.9);
  buildCan(can);
  can.rotation.z = 0.05;

  // Dave's birthday card, standing like a tent
  const card = thing('card', -0.25, 0.762, -0.86);
  const cardTex = canvasTex(120, 150, (g) => {
    g.fillStyle = '#7ad1c8';
    g.fillRect(0, 0, 120, 150);
    g.fillStyle = '#fff';
    g.font = 'bold 22px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('HAPPY', 60, 50);
    g.fillText('BDAY', 60, 78);
    g.fillText('DAVE', 60, 106);
    g.fillStyle = '#ffe76a';
    for (let i = 0; i < 8; i++) g.fillRect(10 + i * 14, 124, 6, 6);
  });
  for (const s of [1, -1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.002), new THREE.MeshLambertMaterial({ map: s > 0 ? cardTex : null, color: s > 0 ? '#ffffff' : '#7ad1c8' }));
    leaf.position.set(0, 0.062, s * 0.022);
    leaf.rotation.x = -s * 0.34;
    if (s > 0) parts.set('cardFront', leaf);
    card.add(leaf);
  }
  const sign = box(0.05, 0.003, 0.0025, '#1f3b78', 0.01, 0.03, 0.035, card);
  sign.rotation.x = -0.34;
  sign.visible = false;
  parts.set('cardSign', sign);

  // Receipts to staple
  const receipts = thing('receipts', 0.13, 0.762, -0.63);
  buildReceipts(receipts);
  // An invisible flat box makes the stack easy to hit
  receipts.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.13), new THREE.MeshBasicMaterial({ visible: false })));
  const rs = box(0.014, 0.002, 0.004, '#9aa0a6', 0, 0.012, -0.045, receipts);
  rs.visible = false;
  parts.set('receiptsStaple', rs);

  // The signature on the report (the report itself is in world.ts)
  const reportSign = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.008), new THREE.MeshBasicMaterial({ color: '#1f3b78' }));
  reportSign.rotation.x = -Math.PI / 2;
  reportSign.position.set(0.04, 0.0165, 0.1);
  reportSign.visible = false;
  parts.set('reportSign', reportSign);

  // Cable knot under the desk; tidy coil once untangled
  const cables = thing('cables', -0.5, 0.07, -0.5);
  const knot = mesh(new THREE.TorusKnotGeometry(0.07, 0.008, 80, 6, 2, 3), '#25272b', 0, 0, 0, cables);
  parts.set('knot', knot);
  const coil = mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 24), '#25272b', 0, -0.055, 0, cables);
  coil.rotation.x = -Math.PI / 2;
  coil.visible = false;
  parts.set('coil', coil);

  // Printer on a cabinet to the right; its paper on the floor
  skin(box(0.5, 0.7, 0.5, '#a8a396', 1.3, 0.35, -0.6, scene), 'plastic', 2, 3);
  box(0.46, 0.012, 0.01, '#6e6a60', 1.3, 0.45, -0.346, scene);
  const printer = thing('printer', 1.3, 0.78, -0.6);
  const pbody = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.16, 0.34, 3, 0.02), lambert('#d6d1c3'));
  printer.add(skin(pbody, 'plastic', 2, 1));
  // Control panel: a little green display and three buttons
  mesh(new THREE.BoxGeometry(0.08, 0.004, 0.022), '#9fb08a', 0.12, 0.081, 0.13, printer);
  for (let i = 0; i < 3; i++) mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), ['#3a3d42', '#3a3d42', '#2f7a3a'][i], 0.06 + i * 0.02, 0.082, 0.155, printer);
  box(0.3, 0.01, 0.12, '#3a3a3a', 0, 0.081, 0.05, printer);
  box(0.26, 0.012, 0.1, '#bdb7a7', 0, 0.02, 0.2, printer);
  const tray = box(0.24, 0.03, 0.18, '#ffffff', 0, 0.1, -0.12, printer);
  tray.visible = false;
  parts.set('printTray', tray);
  const pled = box(0.012, 0.008, 0.004, '#3a4a3a', 0.16, 0.03, 0.171, printer);
  parts.set('printerLed', pled);
  // The paper drawer at the bottom front (pulled out to put paper in)
  const pdrawer = new THREE.Group();
  pdrawer.position.set(0, -0.058, 0.171);
  printer.add(pdrawer);
  box(0.3, 0.035, 0.012, '#c9c4b6', 0, 0, 0, pdrawer);
  box(0.08, 0.008, 0.012, '#8d887a', 0, 0.004, 0.008, pdrawer);
  const pfill = box(0.22, 0.02, 0.2, '#fbfbf6', 0, 0, -0.11, pdrawer);
  pfill.visible = false;
  parts.set('printerDrawer', pdrawer);
  parts.set('printerPaper', pfill);
  const printout = thing('printout', 1.3, 0.815, -0.38);
  box(0.21, 0.004, 0.28, '#fdfdf8', 0, 0, 0, printout);
  for (let i = 0; i < 7; i++) box(0.15, 0.001, 0.006, '#8d8a82', 0, 0.0025, -0.09 + i * 0.028, printout);
  const ps = box(0.016, 0.003, 0.005, '#9aa0a6', -0.08, 0.004, -0.12, printout);
  ps.visible = false;
  parts.set('printoutStaple', ps);
  printout.visible = false;
  const ream = thing('ream', 1.12, 0.026, -0.14);
  box(0.21, 0.05, 0.3, '#fbfbf6', 0, 0, 0, ream);
  box(0.215, 0.052, 0.06, '#3c6fb0', 0, 0, 0, ream);
  ream.rotation.y = 0.3;

  // The mouse, upside down (red light underneath)
  const mouse = thing('mouse', 0.32, 0.773, -0.4);
  buildMouse(mouse);
  mouse.rotation.z = Math.PI;

  return parts;
}
