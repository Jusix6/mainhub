/**
 * 2 Many Notes, phase 5: what layers 3 and 4 and the finale need. The three
 * desk drawers become real drawers (top: 4-digit combination lock, a stamp
 * inside; middle: locked with a key, the invoice and an emergency cookie;
 * bottom: the tax form and an ink pad). A filing cabinet in the back left
 * corner (A–F, G–M, N–Z) with an in-tray and a bag of snacks on top, a little
 * key under the plant pot, an upside-down photo on the board, the lunch menu
 * on the floor, and on the right wall the door with an EXIT sign, a bright
 * hallway behind it.
 *
 * Clickable things carry userData.id (in `objects`); animated parts are
 * returned by name.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { hiPaint, pixPaint, skin } from './textures';
import { detailDoor } from './room';

type Parts = Map<string, THREE.Object3D>;

const lambert = (color: string) => new THREE.MeshLambertMaterial({ color });

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A sheet of paper with a title and lines (lying flat). */
function paper(w: number, d: number, title: string, color: string, ink: string) {
  const tex = hiPaint(64, 90, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 64, 90);
    g.fillStyle = ink;
    g.font = 'bold 10px monospace';
    g.textAlign = 'center';
    g.fillText(title, 32, 14);
    g.fillStyle = '#8d8a82';
    for (let i = 0; i < 8; i++) g.fillRect(8, 24 + i * 7, 40 + ((i * 13) % 9), 2);
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, d), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.0011;
  top.userData.label = true;
  m.add(top);
  return m;
}

export function buildProps3(scene: THREE.Scene, objects: Map<string, THREE.Object3D>) {
  const parts: Parts = new Map();
  const thing = (id: string, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.userData.id = id;
    parent.add(g);
    objects.set(id, g);
    return g;
  };

  /* ---- desk drawers (right pedestal) ---- */
  [0.55, 0.33, 0.11].forEach((y, i) => {
    const d = thing(`drawer${i}`, 0.62, y, -0.155);
    skin(box(0.38, 0.19, 0.012, '#8a6a4a', 0, 0, 0.006, d), 'wood', 1, 0.6);
    box(0.1, 0.015, 0.02, '#b9b4a8', -0.04, 0.05, 0.018, d);
    // The tray behind the front
    box(0.34, 0.01, 0.56, '#7a5d40', 0, -0.07, -0.29, d);
    box(0.01, 0.12, 0.56, '#7a5d40', -0.165, -0.02, -0.29, d);
    box(0.01, 0.12, 0.56, '#7a5d40', 0.165, -0.02, -0.29, d);
    box(0.34, 0.12, 0.01, '#7a5d40', 0, -0.02, -0.57, d);
    parts.set(`drawer${i}`, d);
  });
  const [top, mid, bot] = [0, 1, 2].map((i) => objects.get(`drawer${i}`)!);
  // Top: a combination lock with four little wheels
  const lock = box(0.07, 0.03, 0.012, '#3a3d42', 0.12, 0, 0.018, top);
  for (let i = 0; i < 4; i++) box(0.012, 0.02, 0.004, '#d8d4c8', 0.097 + i * 0.016, 0, 0.026, top);
  parts.set('lock', lock);
  const stamp = thing('stamp', -0.07, -0.04, -0.15, top);
  box(0.05, 0.02, 0.035, '#5a2228', 0, 0, 0, stamp);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.013, 0.05, 8), lambert('#8a6a48'));
  sh.position.y = 0.035;
  stamp.add(sh);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), lambert('#8a6a48'));
  knob.position.y = 0.065;
  stamp.add(knob);
  // Middle: a keyhole; the invoice and the emergency cookie
  box(0.008, 0.016, 0.003, '#111', 0.12, 0, 0.0135, mid);
  const invoice = thing('invoice', -0.06, -0.062, -0.17, mid);
  invoice.add(paper(0.1, 0.14, 'INVOICE', '#fbfaf5', '#b3261e'));
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.03),
    new THREE.MeshLambertMaterial({
      transparent: true,
      map: hiPaint(70, 30, (g) => {
        g.strokeStyle = '#c62828';
        g.lineWidth = 3;
        g.strokeRect(3, 3, 64, 24);
        g.fillStyle = '#c62828';
        g.font = 'bold 13px monospace';
        g.textAlign = 'center';
        g.fillText('APPROVED', 35, 20);
      }),
    }),
  );
  mark.rotation.set(-Math.PI / 2, 0, 0.25);
  mark.position.set(0, 0.0025, 0.02);
  mark.visible = false;
  mark.userData.label = true;
  invoice.add(mark);
  parts.set('invoiceStamp', mark);
  const cookie = thing('cookie', 0.08, -0.06, -0.12, mid);
  const ck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.008, 12), lambert('#c8935a'));
  cookie.add(ck);
  for (let i = 0; i < 5; i++) box(0.006, 0.003, 0.006, '#3a2418', Math.cos(i * 1.3) * 0.016, 0.005, Math.sin(i * 1.3) * 0.016, cookie);
  // Bottom: the tax form and the ink pad
  const tax = thing('taxform', -0.06, -0.062, -0.17, bot);
  tax.add(paper(0.1, 0.14, 'TAX FORM', '#e8f0f7', '#1f4fb0'));
  const ink = thing('ink', 0.08, -0.058, -0.12, bot);
  box(0.065, 0.014, 0.045, '#2b2b2e', 0, 0, 0, ink);
  box(0.055, 0.002, 0.035, '#7a1f2a', 0, 0.008, 0, ink);

  /* ---- filing cabinet, back left ---- */
  const cab = new THREE.Group();
  cab.position.set(-1.28, 0, -1.25);
  scene.add(cab);
  // Hollow in real life: the drawers slide into it
  skin(box(0.45, 1.3, 0.5, '#8c939a', 0, 0.65, 0, cab), 'plastic', 1, 3).userData.joins = true;
  ['A – F', 'G – M', 'N – Z'].forEach((label, i) => {
    const dr = thing(`cab${i}`, -1.28, 0.22 + i * 0.43, -0.994);
    const front = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.38, 0.016, 2, 0.006), lambert('#9aa1a8'));
    dr.add(skin(front, 'plastic'));
    // A cup pull: half a cylinder, the flat side on the front
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 12, 1, false, -Math.PI / 2, Math.PI), lambert('#c9cdd2'));
    pull.rotation.set(0, 0, Math.PI / 2);
    pull.position.set(0, 0.075, 0.0085);
    dr.add(pull);
    // The drawer behind its front: sides, bottom, back (it moves with the front), hanging folders inside
    const inside = new THREE.Group();
    inside.userData.joins = true;
    dr.add(inside);
    for (const [w, h, d, x, y, z] of [
      [0.012, 0.3, 0.42, -0.185, -0.02, -0.22],
      [0.012, 0.3, 0.42, 0.185, -0.02, -0.22],
      [0.37, 0.012, 0.42, 0, -0.165, -0.22],
      [0.37, 0.3, 0.012, 0, -0.02, -0.425],
    ])
      box(w, h, d, '#7f868d', x, y, z, inside);
    for (const x of [-0.175, 0.175]) box(0.006, 0.006, 0.4, '#b9bdc3', x, 0.125, -0.22, inside);
    const FOLDERS = ['#4f86c6', '#e0b84a', '#6fae5a', '#d45b4c', '#4f86c6', '#9a7ac2', '#e0b84a', '#6fae5a'];
    FOLDERS.forEach((c, k) => {
      const f = box(0.34, 0.24, 0.006, c, 0, -0.03, -0.05 - k * 0.045, inside);
      f.rotation.x = ((k * 37) % 5) * 0.02 - 0.04;
      box(0.05, 0.022, 0.007, k % 2 ? '#f4f1e8' : c, -0.12 + ((k * 3) % 5) * 0.06, 0.1, -0.05 - k * 0.045, inside);
    });
    const tag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.1, 0.045),
      new THREE.MeshLambertMaterial({
        map: hiPaint(80, 36, (g) => {
          g.fillStyle = '#f4f1e8';
          g.fillRect(0, 0, 80, 36);
          g.strokeStyle = '#555';
          g.strokeRect(1, 1, 78, 34);
          g.fillStyle = '#1d1d1d';
          g.font = 'bold 18px monospace';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(label, 40, 19);
        }),
      }),
    );
    tag.position.set(0, 0.13, 0.009);
    tag.userData.label = true;
    dr.add(tag);
  });
  // In-tray and snacks on top
  const tray = thing('intray', -1.2, 1.31, -1.2);
  box(0.25, 0.008, 0.32, '#3a3d42', 0, 0, 0, tray);
  for (const [w, d, x, z] of [
    [0.25, 0.006, 0, 0.16],
    [0.25, 0.006, 0, -0.16],
    [0.006, 0.32, 0.125, 0],
    [0.006, 0.32, -0.125, 0],
  ])
    box(w, 0.04, d, '#3a3d42', x, 0.02, z, tray);
  const snacks = thing('snacks', -1.42, 1.38, -1.36);
  box(0.12, 0.16, 0.045, '#e8b234', 0, 0, 0, snacks);
  box(0.122, 0.04, 0.047, '#c62828', 0, 0.02, 0, snacks);
  snacks.rotation.set(0.05, 0.4, 0.08);
  snacks.position.y = 1.392;
  // Dave's card lands in the tray (hidden until then)
  const daveCard = box(0.1, 0.004, 0.13, '#7ad1c8', 0, 0.01, 0, tray);
  daveCard.visible = false;
  parts.set('trayCard', daveCard);

  /* ---- the key under the plant pot (hidden until the pot is lifted) ---- */
  const key = thing('key', -0.57, 0.766, -0.74);
  box(0.035, 0.004, 0.01, '#c9a64a', 0, 0, 0, key);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.003, 6, 10), lambert('#c9a64a'));
  ring.rotation.x = Math.PI / 2;
  ring.position.x = -0.022;
  key.add(ring);
  key.rotation.y = 0.6;
  key.visible = false;

  /* ---- the board: an upside-down photo, a hit area for pinning things ---- */
  const photo = thing('photo', 0.58, 1.3, -1.478);
  const ph = new THREE.Mesh(
    new THREE.PlaneGeometry(0.085, 0.065),
    new THREE.MeshLambertMaterial({
      map: hiPaint(68, 52, (g) => {
        g.fillStyle = '#fbfaf5';
        g.fillRect(0, 0, 68, 52);
        g.fillStyle = '#8ec5e8';
        g.fillRect(4, 4, 60, 34);
        g.fillStyle = '#6f9f4a';
        g.fillRect(4, 28, 60, 10);
        g.fillStyle = '#333';
        for (let i = 0; i < 4; i++) {
          g.fillRect(14 + i * 12, 16, 4, 4);
          g.fillRect(15 + i * 12, 20, 2, 9);
        }
        g.fillStyle = '#f2b33d';
        g.fillRect(52, 8, 6, 6);
        g.fillStyle = '#333';
        g.font = '8px monospace';
        g.fillText('TEAM DAY', 14, 48);
      }),
    }),
  );
  ph.userData.label = true;
  photo.add(ph);
  photo.rotation.z = Math.PI;
  const boardHit = thing('board', 0, 1.525, -1.4787);
  boardHit.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), new THREE.MeshBasicMaterial({ visible: false })));
  // The lunch menu fell on the floor
  const menu = thing('menu', -0.98, 0.004, -0.55);
  const mm = new THREE.Mesh(
    new THREE.PlaneGeometry(0.15, 0.21),
    new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      map: hiPaint(60, 84, (g) => {
        g.fillStyle = '#fff6e0';
        g.fillRect(0, 0, 60, 84);
        g.fillStyle = '#b3261e';
        g.font = 'bold 9px monospace';
        g.textAlign = 'center';
        g.fillText('LUNCH', 30, 12);
        g.fillText('MENU', 30, 22);
        g.fillStyle = '#555';
        for (let i = 0; i < 6; i++) g.fillRect(8, 32 + i * 8, 44 - (i % 3) * 6, 2);
      }),
    }),
  );
  mm.rotation.x = -Math.PI / 2;
  mm.userData.label = true;
  menu.add(mm);
  menu.rotation.y = 0.5;

  /* ---- the door (right wall), EXIT sign, hallway light behind it ---- */
  const DX = 1.795;
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 2.0), new THREE.MeshBasicMaterial({ color: '#fff3d6' }));
  hall.rotation.y = -Math.PI / 2;
  hall.position.set(DX - 0.004, 1.0, 0.35);
  scene.add(hall);
  for (const [w, h, d, y, z] of [
    [0.06, 2.06, 0.06, 1.03, -0.12],
    [0.06, 2.06, 0.06, 1.03, 0.82],
    [0.06, 0.06, 1.0, 2.03, 0.35],
  ])
    box(w, h, d, '#e9e6de', DX - 0.02, y, z, scene);
  const hinge = new THREE.Group();
  hinge.position.set(DX - 0.025, 1.0, -0.09);
  scene.add(hinge);
  skin(box(0.04, 1.98, 0.86, '#8a6a48', 0, 0, 0.43, hinge), 'wood', 1, 3);
  detailDoor(hinge);
  parts.set('door', hinge);
  const exit = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.12),
    new THREE.MeshBasicMaterial({
      map: hiPaint(60, 24, (g) => {
        g.fillStyle = '#1f8a3a';
        g.fillRect(0, 0, 60, 24);
        g.fillStyle = '#e8ffe8';
        g.font = 'bold 14px monospace';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('EXIT', 30, 13);
      }),
    }),
  );
  exit.rotation.y = -Math.PI / 2;
  exit.userData.label = true;
  exit.position.set(DX - 0.01, 2.22, 0.35);
  scene.add(exit);

  return parts;
}
