/**
 * 2 Many Notes (graybox): the office from simple shapes. One desk with an
 * old beige CRT monitor (phase 2: its screen shows DeskOS, power button bottom
 * right, the plant's name on a label on its pot), keyboard, mug, water bottle, plant, phone, desk lamp,
 * stapler and a stack of paper, a pen cup with five pens, a notepad, an old
 * sandwich, a window on the left and a waste bin on the right. Units are
 * metres; the player sits at (0, 1.18, 0.32) looking at the desk (−z).
 *
 * Everything that can be clicked carries userData.id; build() returns those
 * objects and the few parts the game animates (lamp light, window, leaves …).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildProps } from './props';
import { buildProps3 } from './props3';
import { buildProps4 } from './props4';
import { buildBin, buildGeraldPot, snakeLeaf } from './room';
import { buildBottle, buildCup, buildKeyboard, buildLamp, buildMug, buildNotepad, buildPen, buildPhone, buildReport, buildSandwich, buildStapler, detailMonitor } from './desk';
import { skin } from './textures';

export interface World {
  scene: THREE.Scene;
  /** Clickable objects by id (the root of each object). */
  objects: Map<string, THREE.Object3D>;
  lampLight: THREE.PointLight;
  lampShade: THREE.Mesh;
  windowPane: THREE.Object3D;
  /** The window's handle (rotation.z: π/2 = open, 0 = locked). */
  windowHandle: THREE.Object3D;
  leaves: THREE.Object3D[];
  pens: THREE.Object3D[];
  scribble: THREE.Mesh;
  todoLines: THREE.Mesh[];
  handset: THREE.Object3D;
  /** The monitor's screen (the game puts DeskOS on it), its power LED and glow. */
  screen: THREE.Mesh;
  powerLed: THREE.Mesh;
  monitorLight: THREE.PointLight;
  keyboard: THREE.Object3D;
  /** Daylight (phase 4: moves with the progress, see look.ts) and the view out of the window. */
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  sky: THREE.Mesh;
  lampBulb: THREE.Mesh;
  cord: THREE.Object3D;
  /** Animated parts of the phase 3 props (props.ts), by name. */
  parts: Map<string, THREE.Object3D>;
  /** The bin's opening (where paper balls go) and its floor. */
  bin: { top: THREE.Vector3; floor: number; radius: number };
}

/** The monitor (centre of its bezel) and its screen (4:3, world units); notes.ts sticks notes on it. */
export const MONITOR = { x: 0, y: 0.96, z: -0.74 };
/** How far the window stands open (radians). */
export const WINDOW_OPEN = 0.45;
export const SCREEN = { x: 0, y: 0.975, z: MONITOR.z + 0.027, w: 0.3, h: 0.225 };

/** Small printed label (black on white). */
function labelTexture(text: string) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 54;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f1e8';
  g.fillRect(0, 0, 128, 54);
  g.strokeStyle = '#2a2a2a';
  g.lineWidth = 3;
  g.strokeRect(4, 4, 120, 46);
  g.fillStyle = '#1d1d1d';
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 29);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cyl(r: number, h: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D, seg = 16, rTop = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), lambert(color));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A group that counts as one clickable object. */
function thing(id: string, scene: THREE.Scene, objects: Map<string, THREE.Object3D>, x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.userData.id = id;
  scene.add(g);
  objects.set(id, g);
  return g;
}

export function buildWorld(): World {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2620');
  // A little depth: the far corners fade into a warm haze
  scene.fog = new THREE.Fog('#3a342c', 3.2, 9);
  const objects = new Map<string, THREE.Object3D>();

  // Light: soft room light, daylight from the window (both set by look.ts), the desk lamp (off at first)
  const hemi = new THREE.HemisphereLight('#e8e4da', '#4a3c30', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#cfe2ff', 1.1);
  sun.position.set(-3, 2.5, 0.5);
  scene.add(sun);

  // Room: carpet, plaster walls, ceiling tiles, two ceiling lights
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), lambert('#5a6068'));
  floor.rotation.x = -Math.PI / 2;
  skin(floor, 'carpet', 16, 16);
  scene.add(floor);
  const wall = (w: number, h: number, color: string, x: number, y: number, z: number, ry: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), lambert(color));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    skin(m, 'plaster', w * 1.5, h * 1.5);
    scene.add(m);
    return m;
  };
  wall(6, 3, '#d3ccbb', 0, 1.5, -1.5, 0);
  wall(6, 3, '#c9c2b1', -1.6, 1.5, 0, Math.PI / 2);
  wall(6, 3, '#c9c2b1', 1.8, 1.5, 0, -Math.PI / 2);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), lambert('#e2ddd1'));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 2.6;
  skin(ceil, 'ceiling', 13, 13);
  scene.add(ceil);
  for (const x of [-0.6, 0.9]) {
    box(0.62, 0.03, 0.62, '#b9b4a8', x, 2.585, -0.5, scene);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), new THREE.MeshBasicMaterial({ color: '#fffaf0' }));
    panel.rotation.x = Math.PI / 2;
    panel.position.set(x, 2.568, -0.5);
    panel.userData.panel = true;
    scene.add(panel);
  }
  box(6, 0.12, 0.02, '#9d9483', 0, 0.06, -1.49, scene);
  box(0.02, 0.12, 6, '#9d9483', -1.59, 0.06, 0, scene);
  // The right one leaves the doorway (z −0.12 … 0.82) free
  box(0.02, 0.12, 2.85, '#9d9483', 1.79, 0.06, -1.575, scene);
  box(0.02, 0.12, 2.15, '#9d9483', 1.79, 0.06, 1.925, scene);

  // Window on the left wall: frame, sky, a pane that stands open
  const win = new THREE.Group();
  win.position.set(-1.58, 1.45, -0.55);
  win.rotation.y = Math.PI / 2;
  scene.add(win);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  // Pressing anywhere on the window counts as pressing the window (the open pane is only a thin edge from the chair)
  sky.userData.id = 'window';
  // The view out sits behind the frame
  sky.userData.joins = true;
  win.add(sky);
  box(1.08, 0.05, 0.06, '#e9e6de', 0, 0.42, 0.02, win);
  box(1.08, 0.05, 0.06, '#e9e6de', 0, -0.42, 0.02, win);
  box(0.05, 0.84, 0.06, '#e9e6de', -0.52, 0, 0.02, win);
  box(0.05, 0.84, 0.06, '#e9e6de', 0.52, 0, 0.02, win);
  // The sill (it stops short of the filing cabinet on the left)
  box(1.01, 0.04, 0.16, '#e9e6de', -0.065, -0.46, 0.06, win);
  // The pane hinges on its left edge; open = turned into the room
  // Hinged at the back edge: open, the pane stands towards the front and hides nothing in the corner
  const hinge = new THREE.Group();
  hinge.position.set(0.5, 0, 0.04);
  win.add(hinge);
  const pane = new THREE.Group();
  pane.userData.id = 'window';
  hinge.add(pane);
  objects.set('window', pane);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.78), new THREE.MeshLambertMaterial({ color: '#dbeefc', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  glass.position.x = -0.5;
  glass.userData.joins = true;
  pane.add(glass);
  box(0.98, 0.03, 0.03, '#f2efe8', -0.5, 0.39, 0, pane).userData.joins = true;
  box(0.98, 0.03, 0.03, '#f2efe8', -0.5, -0.39, 0, pane).userData.joins = true;
  // The side on the hinge meets the window frame
  box(0.03, 0.8, 0.03, '#f2efe8', -0.01, 0, 0, pane).userData.joins = true;
  box(0.03, 0.8, 0.03, '#f2efe8', -0.99, 0, 0, pane);
  // The handle turns on a pivot: sideways = open, down = locked
  const windowHandle = new THREE.Group();
  windowHandle.position.set(-0.93, 0.02, 0.03);
  pane.add(windowHandle);
  box(0.035, 0.035, 0.03, '#8b8f96', 0, 0, 0, windowHandle);
  box(0.022, 0.12, 0.02, '#8b8f96', 0, -0.06, 0.012, windowHandle);
  windowHandle.rotation.z = Math.PI / 2;
  // Open = turned into the room
  // Not too far: wide open, the pane stood right in front of the filing cabinet's top drawer
  hinge.rotation.y = WINDOW_OPEN;

  // Desk: wooden top with a darker edge, two legs on the left, drawers on the right
  const deskTop = skin(box(1.7, 0.045, 0.85, '#9a7650', 0, 0.7375, -0.55, scene), 'wood', 3, 1.5);
  deskTop.userData.desk = true;
  skin(box(1.72, 0.02, 0.87, '#6e5236', 0, 0.712, -0.55, scene), 'wood', 3, 1);
  for (const [x, z] of [
    [-0.8, -0.92],
    [-0.8, -0.18],
  ])
    skin(box(0.05, 0.71, 0.05, '#5e4630', x, 0.355, z, scene), 'wood', 1, 4);
  skin(box(0.04, 0.05, 0.7, '#5e4630', -0.8, 0.08, -0.55, scene), 'wood', 4, 1);
  // The pedestal is hollow in real life (the drawers slide into it)
  skin(box(0.42, 0.7, 0.78, '#7a5d40', 0.62, 0.35, -0.55, scene), 'wood', 1, 2).userData.joins = true;
  scene.children.slice(-6).forEach((o) => (o.userData.joins = true));
  // (the drawers themselves are in props3.ts)

  // Monitor: an old beige CRT. The screen shows DeskOS (a canvas, set by the game); the power
  // button sits bottom right on the bezel
  const mon = thing('monitor', scene, objects, MONITOR.x, MONITOR.y, MONITOR.z);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.34, 0.05, 2, 0.014), lambert('#d2cbb6'));
  skin(bezel, 'plastic', 2, 2);
  mon.add(bezel);
  // The tube's housing narrows towards the back (a four-sided frustum)
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.215, 0.22, 4, 1), lambert('#c6bfaa'));
  tube.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  tube.position.set(0, 0.01, -0.135);
  skin(tube, 'plastic', 2, 2);
  mon.add(tube);
  for (let i = 0; i < 5; i++) box(0.012, 0.004, 0.1, '#8f8a7b', -0.05 + i * 0.025, 0.142, -0.14, mon);
  skin(box(0.22, 0.03, 0.2, '#bdb6a2', 0, -0.185, -0.07, mon), 'plastic');
  box(0.32, 0.245, 0.002, '#141617', 0, SCREEN.y - MONITOR.y, 0.0255, mon);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  screen.position.set(0, SCREEN.y - MONITOR.y, 0.027);
  screen.userData.screen = true;
  mon.add(screen);
  const power = new THREE.Group();
  power.position.set(0.15, -0.14, 0.027);
  power.userData.id = 'power';
  power.userData.joins = true;
  mon.add(power);
  objects.set('power', power);
  box(0.03, 0.02, 0.012, '#aaa38f', 0, 0, 0, power);
  const powerLed = box(0.008, 0.008, 0.004, '#2a3a2a', -0.035, 0, 0, power);
  detailMonitor(mon, SCREEN.y - MONITOR.y);
  /** Animated parts of the desk things (desk.ts), merged with the props' parts below. */
  const deskParts = new Map<string, THREE.Object3D>();
  const monitorLight = new THREE.PointLight('#9ec5ff', 0, 1.6, 1.5);
  monitorLight.position.set(0, SCREEN.y - 0.05, SCREEN.z + 0.55);
  scene.add(monitorLight);

  // Keyboard (crooked until a note says otherwise); the mouse is in props.ts
  const keyboard = thing('keyboard', scene, objects, 0, 0.771, -0.42);
  buildKeyboard(keyboard);
  keyboard.rotation.y = 0.28;

  // Mug
  const mug = thing('mug', scene, objects, 0.36, 0.81, -0.3);
  buildMug(mug);

  // Water bottle
  const bottle = thing('bottle', scene, objects, -0.42, 0.87, -0.62);
  buildBottle(bottle);

  // Plant, its leaves hang down (dying) until watered
  const plant = thing('plant', scene, objects, -0.64, 0.82, -0.78);
  buildGeraldPot(plant);
  // A label on the pot, turned towards the chair: the plant's name (the password)
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.026), new THREE.MeshLambertMaterial({ map: labelTexture('GERALD') }));
  label.position.set(Math.sin(0.49) * 0.077, -0.005, Math.cos(0.49) * 0.077);
  label.rotation.set(-0.08, 0.49, 0);
  label.userData.label = true;
  plant.add(label);
  const leaves: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.06, 0);
    pivot.rotation.y = (i / 6) * Math.PI * 2;
    plant.add(pivot);
    const leaf = snakeLeaf();
    leaf.userData.joins = true;
    leaf.scale.setScalar(0.85 + ((i * 37) % 5) * 0.06);
    const tilt = new THREE.Group();
    tilt.add(leaf);
    tilt.rotation.z = 1.25; // drooping
    pivot.add(tilt);
    leaves.push(tilt);
  }

  // Phone
  const phone = thing('phone', scene, objects, 0.6, 0.785, -0.7);
  const handset = new THREE.Group();
  handset.position.set(0, 0.04, -0.045);
  phone.add(handset);
  buildPhone(phone, handset);
  // The curly cord from the handset down to the phone (hidden while the handset is lifted)
  const coil: THREE.Vector3[] = [];
  for (let i = 0; i <= 160; i++) {
    const k = i / 160;
    const a = k * Math.PI * 2 * 16;
    const base = new THREE.Vector3(-0.11 - Math.sin(k * Math.PI) * 0.04, 0.035 - k * 0.06, -0.045 + k * 0.1);
    coil.push(base.add(new THREE.Vector3(Math.cos(a) * 0.006, Math.sin(a) * 0.006, 0)));
  }
  const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 320, 0.0018, 4), lambert('#1d1f23'));
  phone.add(cord);

  // Desk lamp, off
  const lamp = thing('lamp', scene, objects, -0.62, 0.77, -0.4);
  const { shade, bulb: lampBulb } = buildLamp(lamp);
  const lampLight = new THREE.PointLight('#ffd9a0', 0, 2.2, 1.6);
  lampLight.position.set(-0.48, 1.04, -0.45);
  scene.add(lampLight);

  // Stapler and the report
  const stapler = thing('stapler', scene, objects, 0.27, 0.785, -0.6);
  buildStapler(stapler, deskParts);
  stapler.rotation.y = 0.3;
  const report = thing('report', scene, objects, 0.62, 0.775, -0.34);
  buildReport(report);
  report.rotation.y = -0.2;

  // Pen cup with five pens, notepad
  const cup = new THREE.Group();
  cup.position.set(-0.44, 0.81, -0.38);
  cup.userData.cup = true;
  scene.add(cup);
  buildCup(cup);
  const pens: THREE.Object3D[] = [];
  const penColors = ['#1f3b78', '#b0262b', '#222', '#2f7a3a', '#1f3b78'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pen = new THREE.Group();
    pen.position.set(-0.44 + Math.cos(a) * 0.022, 0.87, -0.38 + Math.sin(a) * 0.022);
    pen.rotation.set(Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25);
    pen.userData.id = `pen${i}`;
    scene.add(pen);
    objects.set(`pen${i}`, pen);
    buildPen(pen, penColors[i]);
    pens.push(pen);
  }
  const pad = thing('notepad', scene, objects, -0.33, 0.765, -0.23);
  buildNotepad(pad);
  pad.rotation.y = 0.15;
  // The new to-do list, written once a pen works (hidden until then)
  const todoLines: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.06 + ((i * 37) % 3) * 0.012, 0.006), new THREE.MeshBasicMaterial({ color: '#1f3b78' }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(-0.01, 0.0055, 0.005 + i * 0.022);
    line.visible = false;
    pad.add(line);
    todoLines.push(line);
  }
  const scribble = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.012), new THREE.MeshBasicMaterial({ color: '#1f3b78' }));
  scribble.rotation.set(-Math.PI / 2, 0, 0.3);
  scribble.position.set(-0.33, 0.771, -0.26);
  scribble.scale.x = 0.001;
  scribble.visible = false;
  scene.add(scribble);

  // The old sandwich on a napkin
  const sandwich = thing('sandwich', scene, objects, 0.1, 0.77, -0.22);
  buildSandwich(sandwich);

  // Waste bin, right of the chair
  // Right of the chair, clear of the drawers (they slide out up to z 0.17)
  const binPos = new THREE.Vector3(1.0, 0, 0.2);
  buildBin(binPos, scene);
  const binObj = thing('bin', scene, objects, binPos.x, 0.18, binPos.z);
  const binHit = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.36, 12), new THREE.MeshBasicMaterial({ visible: false }));
  binObj.add(binHit);

  const parts = buildProps(scene, objects);
  for (const [k, v] of deskParts) parts.set(k, v);
  for (const [k, v] of buildProps3(scene, objects)) parts.set(k, v);
  buildProps4(scene, objects);
  objects.get('report')!.add(parts.get('reportSign')!);

  return {
    hemi,
    sun,
    sky,
    lampBulb,
    cord,
    parts,
    scene,
    objects,
    lampLight,
    lampShade: shade,
    windowPane: hinge,
    windowHandle,
    leaves,
    pens,
    scribble,
    todoLines,
    handset,
    screen,
    powerLed,
    monitorLight,
    keyboard,
    bin: { top: new THREE.Vector3(binPos.x, 0.36, binPos.z), floor: 0.02, radius: 0.12 },
  };
}
