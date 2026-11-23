/**
 * 2 Many Notes, Update 2 phase C: plants and the room, built properly. The
 * big ficus gets a braided trunk, branches and some 400 pointed leaves (one
 * instanced mesh), Gerald becomes a real snake plant with banded sword leaves,
 * the chair a proper office chair, the bin a wire basket; the coat rack, the
 * jacket, the water cooler, the door, the shelf's books and binders, the
 * printer and the filing cabinet get their small parts.
 *
 * Meshes that are meant to go into others (a trunk into the soil, a cable
 * into a plug) carry userData.joins, so the overlap check (overlaps.ts)
 * leaves them alone.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const lam = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

function add<T extends THREE.BufferGeometry>(parent: THREE.Object3D, geo: T, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

const lathe = (pts: [number, number][], seg = 28) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

function tex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, crisp = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (crisp) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  return t;
}

const joins = <T extends THREE.Object3D>(o: T) => {
  o.userData.joins = true;
  return o;
};

function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A tube along points. */
function tube(parent: THREE.Object3D, pts: THREE.Vector3[], r: number, mat: THREE.Material, seg = 24) {
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6), mat);
}

/* ---- plants ------------------------------------------------------------------------------------- */

/** A pointed leaf, 1 long (along +y), folded a little along its middle. */
function leafGeometry() {
  const geo = new THREE.PlaneGeometry(1, 1, 2, 6);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const t = p.getY(i) + 0.5;
    const w = 0.44 * Math.sin(Math.PI * t ** 0.8);
    p.setXYZ(i, u * w, t, Math.abs(u) * w * 0.4 - 0.12 * t * t);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The big ficus in the corner: terracotta pot, braided trunk, branches, a few hundred leaves. */
export function buildFicus(g: THREE.Group) {
  const rnd = rng(11);
  add(g, lathe([
    [0, 0],
    [0.16, 0],
    [0.17, 0.02],
    [0.2, 0.32],
    [0.215, 0.325],
    [0.215, 0.365],
    [0.2, 0.368],
    [0.192, 0.345],
    [0, 0.345],
  ], 28), lam('#b0623d'));
  // A darker band below the rim
  add(g, new THREE.CylinderGeometry(0.2, 0.198, 0.012, 28, 1, true), lam('#8f4b2c'), 0, 0.31, 0);
  const soil = add(g, new THREE.CircleGeometry(0.192, 24), lam('#3b2a1e'), 0, 0.346, 0);
  soil.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.05 + rnd() * 0.12;
    add(g, new THREE.IcosahedronGeometry(0.008 + rnd() * 0.006, 0), lam(i % 2 ? '#8a7a68' : '#a39582', { flatShading: true }), Math.cos(a) * r, 0.348, Math.sin(a) * r);
  }
  // Three thin trunks twisted around each other
  const bark = lam('#7a5a3c');
  for (let k = 0; k < 3; k++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 24; i++) {
      const y = 0.32 + (i / 24) * 0.66;
      const a = (k * Math.PI * 2) / 3 + y * 13;
      const r = 0.016 * (1 - i / 40);
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    joins(tube(g, pts, 0.0105, bark, 60));
  }
  // Branches from the top of the trunk, leaves along them
  const branches: THREE.CatmullRomCurve3[] = [];
  const twig = lam('#6b4a2e');
  for (let b = 0; b < 14; b++) {
    const a = b * 2.4 + rnd() * 0.5;
    const len = 0.24 + rnd() * 0.3;
    const s = new THREE.Vector3(0, 0.84 + rnd() * 0.14, 0);
    const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const m = s.clone().addScaledVector(out, len * 0.45).add(new THREE.Vector3(0, len * 0.5, 0));
    const e = s.clone().addScaledVector(out, len).add(new THREE.Vector3(0, len * (0.45 + rnd() * 0.45), 0));
    const c = new THREE.CatmullRomCurve3([s, m, e]);
    branches.push(c);
    joins(add(g, new THREE.TubeGeometry(c, 12, 0.0055, 5), twig));
  }
  const PER = 46;
  const leaves = new THREE.InstancedMesh(leafGeometry(), lam('#ffffff', { side: THREE.DoubleSide }), branches.length * PER);
  const greens = ['#3f7a34', '#4f8f3e', '#356b2c', '#5a9a46', '#46823a'].map((c) => new THREE.Color(c));
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  let n = 0;
  for (const c of branches) {
    for (let i = 0; i < PER; i++) {
      const t = 0.22 + (i / PER) * 0.78;
      const at = c.getPoint(t);
      const tan = c.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      if (i % 2) side.negate();
      // Out to the side, a bit forward along the branch, hanging down
      const dir = side.multiplyScalar(0.8).addScaledVector(tan, 0.35).add(new THREE.Vector3(0, -0.25 - rnd() * 0.45, 0)).normalize();
      const y = dir;
      const z = up.clone().addScaledVector(y, -up.dot(y)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      const roll = (rnd() - 0.5) * 0.8;
      const xr = x.clone().multiplyScalar(Math.cos(roll)).addScaledVector(z, Math.sin(roll));
      const zr = new THREE.Vector3().crossVectors(xr, y);
      const s = 0.065 + rnd() * 0.04;
      m.makeBasis(xr.multiplyScalar(s), y.clone().multiplyScalar(s * 1.05), zr.multiplyScalar(s));
      m.setPosition(at.x + (rnd() - 0.5) * 0.02, at.y + (rnd() - 0.5) * 0.02, at.z + (rnd() - 0.5) * 0.02);
      leaves.setMatrixAt(n, m);
      leaves.setColorAt(n, greens[(n * 7) % greens.length].clone().multiplyScalar(0.85 + rnd() * 0.3));
      n++;
    }
  }
  g.add(leaves);
}

/** Gerald's sword leaf (snake plant), 22 cm, base at y 0. */
let swordGeo: THREE.BufferGeometry | null = null;
let swordMat: THREE.Material | null = null;
export function snakeLeaf() {
  if (!swordGeo) {
    const geo = new THREE.PlaneGeometry(1, 1, 2, 10);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i);
      const t = p.getY(i) + 0.5;
      const w = 0.036 * Math.min(1, (1 - t) * 4) * (0.75 + 0.25 * Math.min(1, t * 6));
      p.setXYZ(i, u * w, t * 0.22, Math.abs(u) * w * 0.5);
    }
    geo.computeVertexNormals();
    swordGeo = geo;
    swordMat = new THREE.MeshLambertMaterial({
      side: THREE.DoubleSide,
      map: tex(32, 96, (c) => {
        c.fillStyle = '#2f5f2c';
        c.fillRect(0, 0, 32, 96);
        // Light wavy bands across, yellow edges
        c.fillStyle = '#5c8f4a';
        for (let y = 4; y < 96; y += 9) {
          c.beginPath();
          c.moveTo(4, y);
          for (let x = 4; x <= 28; x += 4) c.lineTo(x, y + Math.sin(x * 0.6 + y) * 2);
          c.lineTo(28, y + 3);
          c.lineTo(4, y + 3);
          c.fill();
        }
        c.fillStyle = '#d6c24a';
        c.fillRect(0, 0, 4, 96);
        c.fillRect(28, 0, 4, 96);
      }),
    });
  }
  return new THREE.Mesh(swordGeo, swordMat!);
}

/** Gerald's pot: terracotta with a rim, soil (the label is added by the world). */
export function buildGeraldPot(g: THREE.Group) {
  add(g, lathe([
    [0, -0.06],
    [0.068, -0.06],
    [0.07, -0.056],
    [0.076, 0.045],
    [0.084, 0.047],
    [0.085, 0.064],
    [0.078, 0.066],
    [0.074, 0.058],
    [0, 0.058],
  ], 24), lam('#b4643f'));
  const soil = add(g, new THREE.CircleGeometry(0.074, 20), lam('#3b2a1e'), 0, 0.059, 0);
  soil.rotation.x = -Math.PI / 2;
  for (let i = 0; i < 6; i++) add(g, new THREE.IcosahedronGeometry(0.005, 0), lam('#9a8b78', { flatShading: true }), Math.cos(i * 2.1) * 0.05, 0.06, Math.sin(i * 2.1) * 0.05);
}

/** A small succulent for the shelf. */
export function buildSucculent(g: THREE.Group) {
  add(g, lathe([
    [0, -0.035],
    [0.038, -0.035],
    [0.046, 0.03],
    [0.05, 0.035],
    [0.044, 0.037],
    [0, 0.03],
  ], 18), lam('#d9cdb8'));
  const leafMat = lam('#7aa86a');
  for (let ring = 0; ring < 3; ring++) {
    const count = 7 - ring * 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + ring * 0.5;
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), ring === 2 ? lam('#9cc48a') : leafMat);
      leaf.scale.set(0.011 - ring * 0.002, 0.006, 0.028 - ring * 0.006);
      const piv = new THREE.Group();
      piv.position.y = 0.036 + ring * 0.008;
      piv.rotation.y = a;
      leaf.position.z = 0.018 - ring * 0.005;
      leaf.rotation.x = -0.5 - ring * 0.35;
      piv.add(leaf);
      joins(leaf);
      g.add(piv);
    }
  }
}

/* ---- furniture ---------------------------------------------------------------------------------- */

/** The office chair you sit on: five-star base with casters, gas lift, cushioned seat and back, armrests. */
export function buildChair(chair: THREE.Group) {
  const black = lam('#24262a');
  const chrome = lam('#a9afb6');
  const fabric = tex(32, 32, (c) => {
    c.fillStyle = '#2e3440';
    c.fillRect(0, 0, 32, 32);
    c.fillStyle = '#363d4b';
    for (let y = 0; y < 32; y += 2) for (let x = (y / 2) % 2; x < 32; x += 2) c.fillRect(x, y, 1, 1);
  });
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(3, 3);
  const cloth = new THREE.MeshLambertMaterial({ map: fabric });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = new THREE.Group();
    leg.rotation.y = -a;
    chair.add(leg);
    const arm = add(leg, new RoundedBoxGeometry(0.3, 0.035, 0.045, 2, 0.012), black, 0.15, 0.075, 0);
    arm.rotation.z = -0.1;
    joins(arm);
    // Caster: a fork and two wheels
    add(leg, new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), chrome, 0.29, 0.05, 0);
    for (const s of [-1, 1]) {
      const w = add(leg, new THREE.CylinderGeometry(0.022, 0.022, 0.012, 12), black, 0.29, 0.022, s * 0.009);
      w.rotation.x = Math.PI / 2;
    }
  }
  joins(add(chair, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), black, 0, 0.09, 0));
  joins(add(chair, new THREE.CylinderGeometry(0.025, 0.025, 0.3, 12), chrome, 0, 0.25, 0));
  joins(add(chair, new THREE.CylinderGeometry(0.035, 0.035, 0.1, 12), black, 0, 0.33, 0));
  joins(add(chair, new RoundedBoxGeometry(0.3, 0.03, 0.3, 2, 0.01), black, 0, 0.415, -0.03));
  joins(add(chair, new RoundedBoxGeometry(0.5, 0.08, 0.46, 3, 0.035), cloth, 0, 0.47, -0.03));
  // Back on a stem
  joins(add(chair, new RoundedBoxGeometry(0.06, 0.32, 0.03, 2, 0.01), black, 0, 0.6, 0.22)).rotation.x = -0.12;
  const back = joins(add(chair, new RoundedBoxGeometry(0.46, 0.5, 0.07, 3, 0.03), cloth, 0, 0.88, 0.25));
  back.rotation.x = -0.12;
  for (const s of [-1, 1]) {
    joins(add(chair, new THREE.CylinderGeometry(0.014, 0.014, 0.17, 8), black, s * 0.27, 0.58, -0.12));
    joins(add(chair, new RoundedBoxGeometry(0.07, 0.03, 0.27, 2, 0.012), lam('#1f2328'), s * 0.29, 0.665, -0.13));
  }
}

/**
 * The bin: an office waste bin of ribbed metal with a black bin bag folded over
 * its rim (dark inside). Radius 0.17 at the top, 0.14 at the bottom, 0.36 high.
 */
export function buildBin(at: THREE.Vector3, scene: THREE.Scene) {
  const g = new THREE.Group();
  g.position.set(at.x, 0, at.z);
  scene.add(g);
  // Ribbed metal: light and dark stripes around it
  const ribs = tex(64, 8, (c) => {
    for (let x = 0; x < 64; x++) {
      c.fillStyle = x % 8 < 2 ? '#8a9ba8' : x % 8 < 4 ? '#c3ced6' : '#a7b5bf';
      c.fillRect(x, 0, 1, 8);
    }
  });
  ribs.wrapS = THREE.RepeatWrapping;
  ribs.repeat.set(10, 1);
  // The outside, the rolled rim and the foot ring (open: the bag makes the inside)
  joins(add(g, lathe([
    [0.14, 0.0],
    [0.144, 0.012],
    [0.141, 0.02],
    [0.168, 0.335],
    [0.172, 0.34],
    [0.176, 0.352],
    [0.172, 0.362],
    [0.166, 0.36],
  ], 32), new THREE.MeshLambertMaterial({ map: ribs, side: THREE.DoubleSide })));
  // The bag: down the inside to the bottom, and over the rim in soft folds
  const bagMat = lam('#3a3e46', { side: THREE.DoubleSide });
  joins(add(g, lathe([
    [0.0, 0.02],
    [0.13, 0.022],
    [0.138, 0.04],
    [0.162, 0.33],
    [0.165, 0.358],
  ], 28), bagMat));
  const skirt = new THREE.LatheGeometry(
    [
      [0.165, 0.358],
      [0.175, 0.368],
      [0.183, 0.362],
      [0.186, 0.33],
      [0.185, 0.3],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    48,
  );
  const p = skirt.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const ang = Math.atan2(z, x);
    // Folds: the bag bulges out in a few places and hangs lower there
    const fold = Math.sin(ang * 7) * 0.5 + Math.sin(ang * 3 + 1) * 0.5;
    const out = 1 + (y < 0.34 ? 0.02 * fold : 0.006 * fold);
    p.setXYZ(i, x * out, y < 0.31 ? y - 0.025 * (0.5 + 0.5 * fold) : y, z * out);
  }
  skirt.computeVertexNormals();
  joins(add(g, skirt, bagMat));
  // A tied knot sticking out at the back
  const knot = joins(add(g, new THREE.SphereGeometry(0.012, 8, 6), bagMat, -0.12, 0.35, -0.12));
  knot.scale.set(1, 1.6, 1);
  return g;
}

/** Coat rack with a jacket and a scarf (rack at its foot, y 0). */
export function buildCoatRack(rack: THREE.Group) {
  const wood = lam('#5e4630');
  for (let i = 0; i < 4; i++) {
    const foot = joins(add(rack, new RoundedBoxGeometry(0.3, 0.03, 0.04, 2, 0.01), wood, 0, 0.02, 0));
    foot.rotation.y = (i * Math.PI) / 2 + 0.4;
    foot.geometry.translate(0.15, 0, 0);
  }
  joins(add(rack, lathe([
    [0, 0],
    [0.022, 0],
    [0.018, 0.05],
    [0.016, 1.7],
    [0.02, 1.72],
    [0.03, 1.76],
    [0.02, 1.8],
    [0, 1.8],
  ], 12), wood));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const piv = new THREE.Group();
    piv.position.y = 1.62;
    piv.rotation.y = -a;
    rack.add(piv);
    const hook = joins(add(piv, new THREE.TorusGeometry(0.06, 0.007, 6, 12, Math.PI * 0.75), wood, 0.0, 0.0, 0));
    hook.rotation.z = -Math.PI * 0.25;
    hook.position.x = 0.06;
    add(piv, new THREE.SphereGeometry(0.012, 8, 6), wood, 0.11, 0.045, 0);
  }
  // The jacket on a hook
  const jacket = new THREE.Group();
  jacket.position.set(-0.07, 1.32, 0.02);
  jacket.rotation.set(0, 0.5, 0.06);
  rack.add(jacket);
  const navy = lam('#2b3a55');
  const dark = lam('#202c42');
  joins(add(jacket, new RoundedBoxGeometry(0.34, 0.56, 0.11, 3, 0.04), navy));
  const shoulders = joins(add(jacket, new THREE.CapsuleGeometry(0.055, 0.26, 4, 10), navy, 0, 0.25, 0));
  shoulders.rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const sleeve = joins(add(jacket, new THREE.CapsuleGeometry(0.045, 0.44, 4, 10), dark, s * 0.2, -0.0, 0.0));
    sleeve.rotation.z = s * 0.06;
    add(jacket, new THREE.CylinderGeometry(0.047, 0.047, 0.03, 10), lam('#1b2537'), s * 0.21, -0.23, 0);
    // Lapels and a pocket flap
    const lapel = add(jacket, new THREE.BoxGeometry(0.06, 0.18, 0.004), dark, s * 0.045, 0.16, 0.058);
    lapel.rotation.z = s * -0.35;
    add(jacket, new THREE.BoxGeometry(0.09, 0.025, 0.006), dark, s * 0.09, -0.12, 0.057);
  }
  for (let i = 0; i < 3; i++) add(jacket, new THREE.SphereGeometry(0.007, 6, 4), lam('#c9a64a'), 0.02, 0.05 - i * 0.1, 0.058);
  // A red scarf over it, with a fringe
  const scarf = joins(add(jacket, new RoundedBoxGeometry(0.08, 0.52, 0.025, 2, 0.008), lam('#b23a3a'), 0.06, -0.04, 0.08));
  scarf.rotation.z = 0.08;
  for (let i = 0; i < 5; i++) add(scarf, new THREE.BoxGeometry(0.006, 0.03, 0.004), lam('#9a2f2f'), -0.03 + i * 0.015, -0.27, 0);
}

/** The water cooler by the window: body with a recess, red and blue taps, drip tray, upside-down bottle with ridges. */
export function buildCooler(cooler: THREE.Group) {
  const body = lam('#e6e3dc');
  add(cooler, new RoundedBoxGeometry(0.3, 0.95, 0.3, 3, 0.03), body, 0, 0.475, 0);
  add(cooler, new THREE.BoxGeometry(0.2, 0.22, 0.01), lam('#cfcbc2'), 0, 0.7, 0.148);
  for (const [x, c] of [
    [-0.05, '#c62828'],
    [0.05, '#1f4fb0'],
  ] as const) {
    const tap = joins(add(cooler, new THREE.CylinderGeometry(0.014, 0.014, 0.04, 10), lam(c), x, 0.76, 0.17));
    tap.rotation.x = Math.PI / 2;
    add(cooler, new RoundedBoxGeometry(0.02, 0.035, 0.012, 2, 0.004), lam(c), x, 0.785, 0.19);
  }
  joins(add(cooler, new RoundedBoxGeometry(0.18, 0.018, 0.09, 2, 0.006), lam('#9aa0a6'), 0, 0.615, 0.17));
  for (let i = 0; i < 5; i++) add(cooler, new THREE.BoxGeometry(0.16, 0.002, 0.004), lam('#6f757b'), 0, 0.6245, 0.135 + i * 0.016);
  // The bottle, neck down into the top
  const pts: [number, number][] = [[0, 0.95], [0.02, 0.95], [0.022, 0.99], [0.06, 1.0], [0.12, 1.02], [0.13, 1.05]];
  for (let i = 0; i < 4; i++) {
    const y = 1.08 + i * 0.07;
    pts.push([0.13, y], [0.125, y + 0.015], [0.13, y + 0.03]);
  }
  pts.push([0.13, 1.37], [0.11, 1.39], [0, 1.395]);
  add(cooler, lathe(pts, 24), lam('#8fc3ee', { transparent: true, opacity: 0.55, depthWrite: false }));
  joins(add(cooler, new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), lam('#f4f2ea'), 0.19, 0.6, 0));
}

/** Panels and a lever handle on the door (the hinge group; the door is 0.04 × 1.98 × 0.86, room side at x −0.02). */
export function detailDoor(hinge: THREE.Object3D) {
  const panel = lam('#7d5f40');
  for (const [y, h] of [
    [0.45, 0.7],
    [-0.45, 0.8],
  ])
    for (const z of [0.23, 0.63]) add(hinge, new THREE.BoxGeometry(0.006, h, 0.3), panel, -0.022, y, z);
  // Lever handle with a plate
  add(hinge, new RoundedBoxGeometry(0.008, 0.16, 0.045, 2, 0.003), lam('#b9bdc3'), -0.024, 0.0, 0.78);
  const lever = add(hinge, new RoundedBoxGeometry(0.014, 0.014, 0.12, 2, 0.005), lam('#c9cdd2'), -0.045, 0.03, 0.74);
  lever.rotation.y = 0.0;
  add(hinge, new THREE.CylinderGeometry(0.009, 0.009, 0.03, 10), lam('#c9cdd2'), -0.034, 0.03, 0.78).rotation.z = Math.PI / 2;
  add(hinge, new THREE.BoxGeometry(0.004, 0.018, 0.008), lam('#2a2a2a'), -0.029, -0.05, 0.78);
}

/** A spine texture for a book: its colour, two bands and a title block. */
export function bookSpine(color: string, i: number) {
  return tex(16, 64, (c) => {
    c.fillStyle = color;
    c.fillRect(0, 0, 16, 64);
    const light = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35).getStyle();
    c.fillStyle = light;
    c.fillRect(0, 6, 16, 2);
    c.fillRect(0, 56, 16, 2);
    c.fillStyle = i % 2 ? '#f4efe0' : '#1d1d1d';
    for (let k = 0; k < 4; k++) c.fillRect(5, 16 + k * 7, 6, 4);
  });
}
