/**
 * 2 Many Notes, Update 2 phase B: the things on the desk, built properly.
 * Before, most of them were boxes and plain cylinders; here they get real
 * shapes (turned profiles for the mug, can and bottle, bent strips for the
 * banana peel, extruded side views for the stapler, phone and sandwich),
 * small parts and printing you can read. Each builder fills the group the
 * game already knows (same id, place and size, same animated parts), so the
 * little games keep working.
 *
 * Printing with words (the mug, the can, the bottle, the report) carries
 * userData.label: look.ts draws those sharp on top of the pixel room.
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

/** A turned shape from (radius, height) points, bottom to top. */
const lathe = (pts: [number, number][], seg = 28) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );

function tex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, crisp = false) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (crisp) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
  }
  return t;
}

/** A side view (x, y) extruded along z, centred in z. */
function sideView(shape: THREE.Shape, depth: number, bevel = 0.002) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

const label = <T extends THREE.Mesh>(m: T) => {
  m.userData.label = true;
  return m;
};

/* ---- mug ---------------------------------------------------------------------------------------- */

/** WORLD'S OKAYEST EMPLOYEE, open at the top, coffee inside (userData.coffee moves down as you drink). */
export function buildMug(g: THREE.Group) {
  const white = lam('#f3f0e8', { side: THREE.DoubleSide });
  // Outside down, the rim, inside down to the bottom of the cup
  add(
    g,
    lathe([
      [0.0, -0.05],
      [0.039, -0.05],
      [0.0415, -0.047],
      [0.042, -0.04],
      [0.042, 0.046],
      [0.0412, 0.0495],
      [0.039, 0.0505],
      [0.0365, 0.049],
      [0.036, 0.04],
      [0.036, -0.04],
      [0.0, -0.042],
    ]),
    white,
  );
  // A darker inside (stained by years of coffee)
  add(
    g,
    lathe([
      [0.0, -0.0415],
      [0.0358, -0.0395],
      [0.0358, 0.03],
    ]),
    lam('#cdb9a0', { side: THREE.DoubleSide }),
  );
  // The unglazed ring underneath (what you see when you drink)
  const foot = add(g, new THREE.RingGeometry(0.026, 0.037, 24), lam('#c9b89a'), 0, -0.0505, 0);
  foot.rotation.x = Math.PI / 2;
  const coffee = add(g, new THREE.CircleGeometry(0.0358, 24), lam('#3b2416'), 0, 0.046, 0);
  coffee.rotation.x = -Math.PI / 2;
  coffee.userData.coffee = true;
  // A little foam ring
  const foam = add(coffee, new THREE.RingGeometry(0.03, 0.0358, 24), lam('#7a5236'), 0, 0, 0.0004);
  foam.rotation.z = 0.3;
  // The handle: an open ring on the right, its ends in the wall
  const handle = add(g, new THREE.TorusGeometry(0.023, 0.0065, 8, 18, Math.PI * 1.25), lam('#f3f0e8'), 0.045, 0.002, 0);
  handle.rotation.z = -Math.PI * 0.625;
  // The print, only on the front (towards the chair), big enough to read
  const print = tex(512, 256, (c) => {
    c.clearRect(0, 0, 512, 256);
    c.fillStyle = '#2b4f8a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '900 58px "Arial Black", Arial, sans-serif';
    c.fillText("WORLD'S", 256, 52);
    c.fillStyle = '#d0462f';
    c.font = 'italic 900 70px "Arial Black", Arial, sans-serif';
    c.fillText('OKAYEST', 256, 130);
    c.fillStyle = '#2b4f8a';
    c.font = '900 50px "Arial Black", Arial, sans-serif';
    c.fillText('EMPLOYEE', 256, 206);
  });
  const front = -0.46;
  const span = 1.9;
  label(
    add(
      g,
      new THREE.CylinderGeometry(0.0424, 0.0424, 0.062, 32, 1, true, front - span / 2, span),
      new THREE.MeshLambertMaterial({
        map: print,
        transparent: true,
        depthWrite: false,
      }),
      0,
      -0.002,
      0,
    ),
  );
}

/* ---- stapler ------------------------------------------------------------------------------------ */

/** Black base with a metal anvil, red arm on a hinge at the back. The arm is part 'staplerArm' (rotation.z presses it). */
export function buildStapler(g: THREE.Group, parts: Map<string, THREE.Object3D>) {
  const black = lam('#26272b');
  const red = lam('#c22a2e');
  const metal = lam('#b9bdc3');
  // Base: a long flat foot, rounded at the front
  const foot = new THREE.Shape();
  foot.moveTo(-0.075, -0.025);
  foot.lineTo(0.066, -0.025);
  foot.quadraticCurveTo(0.077, -0.025, 0.077, -0.019);
  foot.quadraticCurveTo(0.077, -0.014, 0.068, -0.014);
  foot.lineTo(-0.06, -0.014);
  foot.lineTo(-0.075, -0.016);
  foot.closePath();
  add(g, sideView(foot, 0.04, 0.0015), black);
  // The anvil plate where the staple bends
  add(g, new THREE.BoxGeometry(0.032, 0.0018, 0.022), metal, 0.054, -0.0125, 0);
  add(g, new THREE.BoxGeometry(0.008, 0.0012, 0.006), lam('#7d8188'), 0.054, -0.0114, 0);
  // Hinge block at the back with a pin
  add(g, new RoundedBoxGeometry(0.022, 0.022, 0.036, 2, 0.004), black, -0.064, -0.004, 0);
  const pin = add(g, new THREE.CylinderGeometry(0.0035, 0.0035, 0.042, 10), metal, -0.066, 0.005, 0);
  pin.rotation.x = Math.PI / 2;
  // The arm turns on the pin
  const arm = new THREE.Group();
  arm.position.set(-0.066, 0.005, 0);
  g.add(arm);
  const top = new THREE.Shape();
  top.moveTo(-0.006, -0.004);
  top.lineTo(0.136, -0.004);
  top.quadraticCurveTo(0.146, -0.003, 0.145, 0.004);
  top.quadraticCurveTo(0.142, 0.014, 0.125, 0.017);
  top.quadraticCurveTo(0.06, 0.03, 0.012, 0.024);
  top.quadraticCurveTo(-0.006, 0.021, -0.008, 0.008);
  top.closePath();
  add(arm, sideView(top, 0.036, 0.003), red);
  // The magazine under the arm and a metal nose
  add(arm, new THREE.BoxGeometry(0.11, 0.007, 0.026), metal, 0.07, -0.007, 0);
  add(arm, new RoundedBoxGeometry(0.014, 0.01, 0.03, 2, 0.003), metal, 0.137, -0.006, 0);
  // A grip groove on top
  for (let i = 0; i < 4; i++) {
    const groove = add(arm, new THREE.BoxGeometry(0.003, 0.0015, 0.03), lam('#8f1d21'), 0.05 + i * 0.012, 0.025 - i * 0.0012, 0);
    groove.rotation.z = -0.12;
  }
  parts.set('staplerArm', arm);
}

/** The stapler's arm pressed down (0 = open, 1 = shut on the paper). */
export function pressStapler(parts: Map<string, THREE.Object3D>, k: number) {
  parts.get('staplerArm')!.rotation.z = -0.075 * k;
}

/* ---- banana peel -------------------------------------------------------------------------------- */

/** A peel lying on the floor: the stalk end up, three or four flaps spread out, brown spots. */
export function buildBanana(g: THREE.Group) {
  const skinTex = tex(
    64,
    128,
    (c) => {
      const grad = c.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#e9cf3c');
      grad.addColorStop(0.75, '#e2c234');
      grad.addColorStop(1, '#6b4a1f');
      c.fillStyle = grad;
      c.fillRect(0, 0, 64, 128);
      c.fillStyle = 'rgba(110,70,25,0.75)';
      for (let i = 0; i < 26; i++) {
        c.beginPath();
        c.ellipse((i * 37) % 64, (i * 53) % 110, 1.5 + (i % 3), 1 + (i % 2), 0, 0, Math.PI * 2);
        c.fill();
      }
    },
    true,
  );
  const outer = new THREE.MeshLambertMaterial({ map: skinTex, side: THREE.BackSide });
  // The pale inside: cream in the middle, yellow towards the edges, brown at the tip
  const innerTex = tex(32, 64, (c) => {
    const across = c.createLinearGradient(0, 0, 32, 0);
    across.addColorStop(0, '#e2c234');
    across.addColorStop(0.3, '#f0e2a6');
    across.addColorStop(0.7, '#f0e2a6');
    across.addColorStop(1, '#e2c234');
    c.fillStyle = across;
    c.fillRect(0, 0, 32, 64);
    const tip = c.createLinearGradient(0, 0, 0, 64);
    tip.addColorStop(0, 'rgba(90,60,20,0.85)');
    tip.addColorStop(0.15, 'rgba(90,60,20,0)');
    c.fillStyle = tip;
    c.fillRect(0, 0, 32, 64);
  }, true);
  const inner = new THREE.MeshLambertMaterial({ map: innerTex, side: THREE.FrontSide });
  // The stalk end of the banana lies on its side (slightly angular, like a real banana), the flaps spread from it
  const end = add(
    g,
    lathe(
      [
        [0.0, -0.065],
        [0.004, -0.064],
        [0.006, -0.05],
        [0.011, -0.035],
        [0.016, -0.012],
        [0.017, 0.0],
        [0.0, 0.0],
      ],
      6,
    ),
    new THREE.MeshLambertMaterial({ map: skinTex }),
    0,
    0.016,
    0,
  );
  end.rotation.z = -Math.PI / 2;
  add(end, new THREE.CylinderGeometry(0.0045, 0.0045, 0.008, 6), lam('#4a3318'), 0, -0.068, 0);
  // One flap: lies face up (the pale inside), cupped, curling up at the tip
  const flap = (angle: number, len: number, curl: number) => {
    const geo = new THREE.PlaneGeometry(1, 1, 4, 14);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i); // −0.5 … 0.5 across
      const t = p.getY(i) + 0.5; // 0 at the banana end, 1 at the tip
      const w = 0.034 * (1 - t * 0.72);
      const x = t * len;
      const drop = 0.016 * Math.max(0, 1 - t / 0.35) ** 2;
      const y = 0.002 + drop + curl * THREE.MathUtils.smoothstep(t, 0.7, 1) * 0.016 + (u * 2) ** 2 * w * 0.9;
      p.setXYZ(i, x, y, u * w * 2);
    }
    geo.computeVertexNormals();
    const piv = new THREE.Group();
    piv.rotation.y = angle;
    piv.add(new THREE.Mesh(geo, inner), new THREE.Mesh(geo, outer));
    g.add(piv);
  };
  flap(-0.7, 0.095, 0.7);
  flap(0.08, 0.105, 1.2);
  flap(0.8, 0.09, 0.4);
}

/* ---- sandwich ----------------------------------------------------------------------------------- */

/** An old triangle sandwich with a bite out of it on a paper plate: bread, cheese, lettuce, tomato, mould. */
export function buildSandwich(g: THREE.Group) {
  // Paper plate with a rim
  add(
    g,
    lathe(
      [
        [0, -0.007],
        [0.07, -0.007],
        [0.085, -0.002],
        [0.088, 0.0],
        [0.086, 0.0005],
        [0.07, -0.0045],
        [0, -0.0045],
      ],
      32,
    ),
    lam('#f4f3ee', { side: THREE.DoubleSide }),
  );
  // A triangle with a bite out of the long edge
  const tri = (s: number) => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.05 * s, -0.045 * s);
    sh.lineTo(0.055 * s, -0.045 * s);
    sh.lineTo(0.0 * s, 0.002 * s);
    sh.absarc(-0.012 * s, 0.012 * s, 0.016 * s, -0.2, Math.PI * 0.9, true);
    sh.lineTo(-0.05 * s, 0.055 * s);
    sh.closePath();
    return sh;
  };
  const slice = (y: number, s: number, thick: number, faces: THREE.Material, sides: THREE.Material, rot = 0) => {
    const geo = new THREE.ExtrudeGeometry(tri(s), {
      depth: thick,
      bevelEnabled: true,
      bevelThickness: 0.0015,
      bevelSize: 0.002,
      bevelSegments: 2,
      curveSegments: 12,
    });
    const m = add(g, geo, [faces, sides], 0, y, 0);
    m.rotation.set(-Math.PI / 2, 0, rot);
    return m;
  };
  const bread = lam('#ecd3a0');
  const crust = lam('#a8723a');
  slice(-0.003, 1, 0.007, bread, crust);
  slice(0.0055, 1.04, 0.002, lam('#7fae45'), lam('#5f8f33'), 0.05);
  slice(0.0085, 0.99, 0.0015, lam('#f0c544'), lam('#d9a92e'), -0.04);
  for (const [x, z] of [
    [0.012, 0.012],
    [-0.022, 0.008],
  ]) {
    const tom = add(g, new THREE.CylinderGeometry(0.014, 0.014, 0.003, 14), lam('#d4473a'), x, 0.0115, z);
    tom.scale.z = 0.9;
  }
  slice(0.0135, 1, 0.007, bread, crust);
  // Mould: grey-green spots on the top slice
  for (const [x, z, r] of [
    [0.01, 0.02, 0.008],
    [-0.02, -0.01, 0.006],
    [0.02, -0.025, 0.005],
    [-0.008, 0.03, 0.004],
  ]) {
    const spot = add(g, new THREE.CircleGeometry(r, 9), lam('#7f8f5c'), x, 0.0226, z);
    spot.rotation.x = -Math.PI / 2;
    const fuzz = add(g, new THREE.CircleGeometry(r * 0.5, 7), lam('#b9c49a'), x + r * 0.2, 0.0228, z - r * 0.1);
    fuzz.rotation.x = -Math.PI / 2;
  }
}

/* ---- can ---------------------------------------------------------------------------------------- */

/** An empty can of FIZZ cola, a little dented. */
export function buildCan(g: THREE.Group) {
  const metal = lam('#c9cdd2', { side: THREE.DoubleSide });
  add(
    g,
    lathe([
      [0, -0.056],
      [0.022, -0.058],
      [0.03, -0.06],
      [0.033, -0.053],
      [0.033, -0.05],
    ]),
    metal,
  );
  add(
    g,
    lathe([
      [0.033, 0.048],
      [0.033, 0.05],
      [0.027, 0.058],
      [0.026, 0.06],
      [0.0262, 0.061],
      [0.024, 0.0605],
      [0.0, 0.058],
    ]),
    metal,
  );
  const art = tex(512, 160, (c) => {
    c.fillStyle = '#c4282c';
    c.fillRect(0, 0, 512, 160);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(0, 104);
    for (let x = 0; x <= 512; x += 8) c.lineTo(x, 104 + Math.sin(x / 40) * 10);
    c.lineTo(512, 120);
    for (let x = 512; x >= 0; x -= 8) c.lineTo(x, 120 + Math.sin(x / 40) * 10);
    c.fill();
    c.font = 'italic 900 68px "Arial Black", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of [128, 384]) c.fillText('FIZZ', x, 58);
    c.font = 'bold 18px Arial, sans-serif';
    for (const x of [128, 384]) c.fillText('ZERO REGRETS', x, 145);
  });
  const body = add(g, new THREE.CylinderGeometry(0.033, 0.033, 0.098, 28, 6, true), new THREE.MeshLambertMaterial({ map: art }), 0, -0.001, 0);
  // A dent on the side
  const p = body.geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const d = Math.hypot(v.x - 0.024, v.y - 0.005, v.z - 0.023);
    if (d < 0.025)
      v.multiplyScalar(1)
        .setX(v.x * (1 - 0.1 * (1 - d / 0.025)))
        .setZ(v.z * (1 - 0.1 * (1 - d / 0.025)));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  body.geometry.computeVertexNormals();
  label(body);
  // The opening and the ring pull
  const hole = add(g, new THREE.CircleGeometry(0.007, 10), lam('#1d1d1f'), 0.008, 0.0592, 0);
  hole.rotation.x = -Math.PI / 2;
  hole.scale.x = 1.4;
  const tab = add(g, new THREE.TorusGeometry(0.006, 0.0016, 6, 12), lam('#aeb3b9'), -0.008, 0.0598, 0);
  tab.rotation.x = -Math.PI / 2;
  tab.scale.set(1.4, 1, 1);
}

/* ---- water bottle ------------------------------------------------------------------------------- */

/** A plastic bottle with ridges, water in it, a label and a blue cap. The mouth is at y 0.13. */
export function buildBottle(g: THREE.Group) {
  const pts: [number, number][] = [
    [0, -0.11],
    [0.03, -0.11],
    [0.035, -0.104],
  ];
  for (let i = 0; i < 4; i++) {
    const y = -0.095 + i * 0.012;
    pts.push([0.035, y], [0.0325, y + 0.004], [0.035, y + 0.008]);
  }
  pts.push([0.035, 0.05], [0.033, 0.07], [0.026, 0.088], [0.017, 0.1], [0.016, 0.112], [0.0175, 0.113], [0.0175, 0.116]);
  add(
    g,
    lathe(pts, 24),
    lam('#a9d4f2', {
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  // The water inside (a little lower than full)
  add(
    g,
    lathe(
      [
        [0, -0.106],
        [0.032, -0.106],
        [0.032, 0.03],
        [0, 0.03],
      ],
      20,
    ),
    lam('#5fa6dc', { transparent: true, opacity: 0.55 }),
  );
  const art = tex(512, 128, (c) => {
    c.fillStyle = '#f4f8fb';
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = '#2f7fc1';
    c.fillRect(0, 0, 512, 22);
    c.fillRect(0, 106, 512, 22);
    c.font = 'italic 900 52px "Arial Black", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const x of [128, 384]) c.fillText('AQUA', x, 64);
    c.fillStyle = '#7ab6e0';
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.arc(30 + i * 64, 64, 6, 0, Math.PI * 2);
      c.fill();
    }
  });
  label(add(g, new THREE.CylinderGeometry(0.0356, 0.0356, 0.05, 28, 1, true), new THREE.MeshLambertMaterial({ map: art }), 0, -0.01, 0));
  // Cap with grip ridges
  add(g, new THREE.CylinderGeometry(0.0185, 0.0185, 0.022, 20), lam('#2b5fa8'), 0, 0.127, 0);
  add(g, new THREE.CylinderGeometry(0.0192, 0.0192, 0.014, 20, 1, true), lam('#244f8c'), 0, 0.127, 0);
  add(g, new THREE.CylinderGeometry(0.02, 0.02, 0.003, 20), lam('#2b5fa8'), 0, 0.116, 0);
}

/* ---- tissues ------------------------------------------------------------------------------------ */

/** A box with a flowery print, an oval opening and a tissue sticking out. */
export function buildTissues(g: THREE.Group) {
  const print = tex(
    128,
    128,
    (c) => {
      c.fillStyle = '#8cc4e2';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#d8eef8';
      for (let i = 0; i < 9; i++) {
        const x = (i % 3) * 44 + 18;
        const y = Math.floor(i / 3) * 44 + 18 + (i % 2) * 10;
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.arc(x + Math.cos((k / 5) * Math.PI * 2) * 5, y + Math.sin((k / 5) * Math.PI * 2) * 5, 4, 0, Math.PI * 2);
          c.fill();
        }
        c.fillStyle = '#f2c94c';
        c.beginPath();
        c.arc(x, y, 3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#d8eef8';
      }
    },
    true,
  );
  add(g, new RoundedBoxGeometry(0.1, 0.08, 0.13, 2, 0.006), new THREE.MeshLambertMaterial({ map: print }));
  // The opening: a white rim and a dark slot
  const rim = add(g, new THREE.CircleGeometry(0.03, 20), lam('#f4f4f0'), 0, 0.0405, 0);
  rim.rotation.x = -Math.PI / 2;
  rim.scale.set(0.75, 1.6, 1);
  const slot = add(g, new THREE.CircleGeometry(0.026, 20), lam('#2c3a44'), 0, 0.041, 0);
  slot.rotation.x = -Math.PI / 2;
  slot.scale.set(0.6, 1.5, 1);
  // The tissue: a soft sheet pulled up into a peak
  const geo = new THREE.PlaneGeometry(0.06, 0.07, 8, 8);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const h = Math.max(0, 1 - Math.hypot(x / 0.03, y / 0.035)) ** 0.7;
    p.setXYZ(i, x * (1 - h * 0.6) + Math.sin(y * 140) * 0.002, h * 0.045, y * (1 - h * 0.5));
  }
  geo.computeVertexNormals();
  const t = add(g, geo, lam('#ffffff', { side: THREE.DoubleSide }), 0, 0.04, 0);
  t.userData.top = true;
}

/* ---- notepad ------------------------------------------------------------------------------------ */

/** A pad of yellow pages, glued at the top, on a cardboard back. Its top is at y 0.005 (the ink sits there). */
export function buildNotepad(g: THREE.Group) {
  const edge = tex(
    16,
    64,
    (c) => {
      c.fillStyle = '#f2df86';
      c.fillRect(0, 0, 16, 64);
      c.fillStyle = '#d9c26a';
      for (let y = 1; y < 64; y += 3) c.fillRect(0, y, 16, 1);
    },
    true,
  );
  edge.wrapS = edge.wrapT = THREE.RepeatWrapping;
  const sides = new THREE.MeshLambertMaterial({ map: edge });
  const top = lam('#f6e48e');
  // Box faces: +x, −x, +y, −y, +z, −z
  add(g, new THREE.BoxGeometry(0.15, 0.008, 0.2), [sides, sides, top, top, sides, sides], 0, 0.001, 0);
  // Cardboard back, a bit bigger
  add(g, new THREE.BoxGeometry(0.152, 0.002, 0.202), lam('#a6865a'), 0, -0.004, 0);
  // The glued strip at the top
  add(g, new RoundedBoxGeometry(0.153, 0.01, 0.014, 2, 0.002), lam('#c7a84c'), 0, 0.001, -0.094);
  // Faint ruled lines and a red margin on the top sheet
  const lines = tex(150, 200, (c) => {
    c.clearRect(0, 0, 150, 200);
    c.fillStyle = 'rgba(120,150,190,0.35)';
    for (let y = 30; y < 200; y += 11) c.fillRect(0, y, 150, 1);
    c.fillStyle = 'rgba(200,80,80,0.4)';
    c.fillRect(20, 14, 1, 186);
  });
  const ruled = add(
    g,
    new THREE.PlaneGeometry(0.15, 0.186),
    new THREE.MeshLambertMaterial({
      map: lines,
      transparent: true,
      depthWrite: false,
    }),
    0,
    0.0052,
    0.007,
  );
  ruled.rotation.x = -Math.PI / 2;
}

/* ---- pens ---------------------------------------------------------------------------------------- */

/** A ballpoint pen, 15 cm, tip down at y −0.075: barrel, grip, cone and metal point, cap end and clip. */
export function buildPen(pen: THREE.Group, color: string) {
  const c = lam(color);
  const g = new THREE.Group();
  g.position.y = 0.006;
  pen.add(g);
  add(g, new THREE.CylinderGeometry(0.0058, 0.0058, 0.1, 10), c, 0, 0.015, 0);
  add(g, new THREE.CylinderGeometry(0.0062, 0.0058, 0.03, 10), lam('#2a2b2e'), 0, -0.05, 0);
  add(g, new THREE.CylinderGeometry(0.0058, 0.0022, 0.012, 10), lam('#e8e6df'), 0, -0.071, 0);
  add(g, new THREE.CylinderGeometry(0.0022, 0.0006, 0.004, 6), lam('#9aa0a6'), 0, -0.079, 0);
  // Cap end with a clip
  add(g, new THREE.CylinderGeometry(0.0064, 0.0064, 0.016, 10), c, 0, 0.072, 0);
  add(g, new THREE.SphereGeometry(0.0064, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, 0.08, 0);
  add(g, new THREE.BoxGeometry(0.002, 0.03, 0.0035), lam('#c8ccd2'), 0.0068, 0.062, 0);
}

/** The metal pen cup: a mesh pattern, a rolled rim. */
export function buildCup(g: THREE.Object3D) {
  const mesh = tex(
    64,
    32,
    (c) => {
      c.fillStyle = '#4d5660';
      c.fillRect(0, 0, 64, 32);
      c.fillStyle = '#1e2429';
      for (let y = 0; y < 32; y += 4) for (let x = (y / 4) % 2 ? 2 : 0; x < 64; x += 4) c.fillRect(x, y, 2, 2);
    },
    true,
  );
  mesh.wrapS = mesh.wrapT = THREE.RepeatWrapping;
  mesh.repeat.set(3, 2);
  add(g, new THREE.CylinderGeometry(0.045, 0.042, 0.1, 18, 1, true), new THREE.MeshLambertMaterial({ map: mesh, side: THREE.DoubleSide }));
  const rim = add(g, new THREE.TorusGeometry(0.045, 0.003, 6, 24), lam('#8d969f'), 0, 0.05, 0);
  rim.rotation.x = Math.PI / 2;
  add(g, new THREE.CylinderGeometry(0.042, 0.042, 0.004, 18), lam('#4d5660'), 0, -0.048, 0);
}

/* ---- desk lamp ---------------------------------------------------------------------------------- */

/** Base, two round arms with springs and joints, a bell shade. Returns the shade and the bulb (the game lights them). */
export function buildLamp(g: THREE.Group) {
  const green = lam('#2f5a3e');
  const dark = lam('#24302a');
  const brass = lam('#c9a64a');
  add(
    g,
    lathe(
      [
        [0, -0.01],
        [0.07, -0.01],
        [0.07, -0.004],
        [0.055, 0.008],
        [0.02, 0.014],
        [0.012, 0.02],
        [0, 0.02],
      ],
      24,
    ),
    green,
  );
  // A round arm from a to b, with a spring beside it
  const arm = (a: THREE.Vector3, b: THREE.Vector3) => {
    const d = b.clone().sub(a);
    const m = add(g, new THREE.CylinderGeometry(0.0055, 0.0055, d.length(), 8), dark);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const coil: THREE.Vector3[] = [];
    const side = new THREE.Vector3(0, 0, 0.012);
    for (let i = 0; i <= 60; i++) {
      const k = 0.2 + (i / 60) * 0.5;
      const t = i * 0.9;
      coil.push(
        a
          .clone()
          .addScaledVector(d, k)
          .add(side)
          .add(new THREE.Vector3(Math.cos(t) * 0.004, 0, Math.sin(t) * 0.004)),
      );
    }
    add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 120, 0.0009, 4), lam('#9aa0a6'));
  };
  const p0 = new THREE.Vector3(0, 0.02, 0);
  const p1 = new THREE.Vector3(0.05, 0.24, -0.02);
  const p2 = new THREE.Vector3(0.108, 0.322, -0.045);
  arm(p0, p1);
  arm(p1, p2);
  for (const p of [p0, p1]) add(g, new THREE.SphereGeometry(0.011, 10, 8), brass, p.x, p.y, p.z);
  const knob = add(g, new THREE.CylinderGeometry(0.008, 0.008, 0.012, 10), brass, p1.x, p1.y, p1.z + 0.012);
  knob.rotation.x = Math.PI / 2;
  // The bell shade (open at the bottom), lighter inside
  const shade = new THREE.Mesh(
    lathe(
      [
        [0.012, 0.06],
        [0.022, 0.055],
        [0.03, 0.04],
        [0.045, 0.0],
        [0.07, -0.05],
        [0.078, -0.058],
        [0.08, -0.062],
      ],
      24,
    ),
    new THREE.MeshLambertMaterial({
      color: '#2f5a3e',
      side: THREE.DoubleSide,
      emissive: '#000000',
    }),
  );
  shade.position.set(0.12, 0.34, -0.05);
  shade.rotation.z = 0.5;
  g.add(shade);
  const inside = add(
    shade,
    lathe(
      [
        [0.03, 0.039],
        [0.045, -0.001],
        [0.069, -0.051],
      ],
      24,
    ),
    lam('#e9e1c8', { side: THREE.BackSide }),
  );
  inside.scale.setScalar(0.985);
  add(shade, new THREE.CylinderGeometry(0.008, 0.012, 0.014, 10), brass, 0, 0.066, 0);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshLambertMaterial({ color: '#e8e2d0', emissive: '#000000' }));
  bulb.position.set(0.105, 0.31, -0.05);
  g.add(bulb);
  return { shade, bulb };
}

/* ---- phone -------------------------------------------------------------------------------------- */

/** A grey office phone: sloped body, 12 keys with digits, a small display, the handset in its cradle. */
export function buildPhone(g: THREE.Group, handset: THREE.Group) {
  const body = lam('#3a3d44');
  const side = new THREE.Shape();
  side.moveTo(-0.07, -0.025);
  side.lineTo(0.07, -0.025);
  side.lineTo(0.07, 0.008);
  side.quadraticCurveTo(0.068, 0.014, 0.058, 0.016);
  side.lineTo(-0.045, 0.03);
  side.quadraticCurveTo(-0.07, 0.032, -0.07, 0.02);
  side.closePath();
  // The side view is along z (front = +z): extrude along x
  const b = add(g, sideView(side, 0.17, 0.004), body);
  b.rotation.y = -Math.PI / 2;
  // Cradle bumps for the handset at the back
  for (const x of [-0.07, 0.07]) add(g, new RoundedBoxGeometry(0.035, 0.016, 0.05, 2, 0.005), lam('#2c2f35'), x, 0.026, -0.045);
  // Keypad: one plate with printed digits, raised keys
  const pad = tex(192, 256, (c) => {
    c.fillStyle = '#3a3d44';
    c.fillRect(0, 0, 192, 256);
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    keys.forEach((k, i) => {
      const x = 32 + (i % 3) * 64;
      const y = 32 + Math.floor(i / 3) * 64;
      c.fillStyle = '#d7d9de';
      c.beginPath();
      c.roundRect(x - 26, y - 26, 52, 52, 10);
      c.fill();
      c.fillStyle = '#202226';
      c.font = 'bold 34px Arial, sans-serif';
      c.fillText(k, x, y + 2);
    });
  });
  const keys = add(g, new THREE.PlaneGeometry(0.07, 0.093), new THREE.MeshLambertMaterial({ map: pad }), 0.0, 0.0262, 0.022);
  keys.rotation.x = -Math.PI / 2 + Math.atan2(0.014, 0.103);
  label(keys);
  // A little display and the red message light
  const disp = add(g, new THREE.PlaneGeometry(0.036, 0.014), lam('#9fb08a'), -0.06, 0.0282, 0.004);
  disp.rotation.x = keys.rotation.x;
  add(g, new THREE.SphereGeometry(0.0035, 8, 6), lam('#d33', { emissive: '#601010' }), 0.06, 0.0245, 0.03);
  // The handset: earpiece and mouthpiece joined by a grip (side view along x, extruded across)
  const hs = new THREE.Shape();
  hs.moveTo(-0.105, -0.012);
  hs.quadraticCurveTo(-0.11, 0.012, -0.08, 0.016);
  hs.lineTo(0.08, 0.016);
  hs.quadraticCurveTo(0.11, 0.012, 0.105, -0.012);
  hs.lineTo(0.06, -0.012);
  hs.quadraticCurveTo(0.055, 0.0, 0.04, 0.002);
  hs.lineTo(-0.04, 0.002);
  hs.quadraticCurveTo(-0.055, 0.0, -0.06, -0.012);
  hs.closePath();
  add(handset, sideView(hs, 0.045, 0.004), lam('#2b2e34'));
  // Speaker and microphone holes
  for (const x of [-0.083, 0.083]) {
    const cap = add(handset, new THREE.CylinderGeometry(0.018, 0.018, 0.004, 14), lam('#24262b'), x, -0.0155, 0);
    for (let i = 0; i < 5; i++) add(cap, new THREE.CylinderGeometry(0.0018, 0.0018, 0.005, 6), lam('#111215'), Math.cos(i * 1.256) * 0.008 * (i ? 1 : 0), 0, Math.sin(i * 1.256) * 0.008 * (i ? 1 : 0));
  }
}

/* ---- radio -------------------------------------------------------------------------------------- */

/** A wooden kitchen radio: speaker grille, tuning window with a scale, carrying handle, antenna. */
export function buildRadio(g: THREE.Group, parts: Map<string, THREE.Object3D>) {
  const woodTex = tex(
    64,
    32,
    (c) => {
      c.fillStyle = '#9a4a38';
      c.fillRect(0, 0, 64, 32);
      c.fillStyle = 'rgba(70,30,20,0.35)';
      for (let i = 0; i < 9; i++) c.fillRect(0, i * 3.6 + (i % 2), 64, 1);
    },
    true,
  );
  add(g, new RoundedBoxGeometry(0.17, 0.09, 0.07, 3, 0.012), new THREE.MeshLambertMaterial({ map: woodTex }));
  // Front panel in cream with the grille holes
  const front = tex(256, 128, (c) => {
    c.fillStyle = '#e9dfc3';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#3a2420';
    for (let y = 22; y < 112; y += 10) for (let x = 14; x < 112; x += 10) if (Math.hypot(x - 62, y - 66) < 46) c.fillRect(x, y, 5, 5);
    // Tuning window
    c.fillStyle = '#f7efd5';
    c.fillRect(130, 22, 110, 40);
    c.strokeStyle = '#6b4a2e';
    c.lineWidth = 3;
    c.strokeRect(130, 22, 110, 40);
    c.fillStyle = '#3a2420';
    c.font = 'bold 11px Arial, sans-serif';
    c.textAlign = 'center';
    ['88', '94', '100', '106'].forEach((t, i) => c.fillText(t, 144 + i * 28, 36));
    for (let i = 0; i < 21; i++) c.fillRect(136 + i * 5, 44, 1, i % 5 ? 5 : 9);
    c.fillStyle = '#c4282c';
    c.fillRect(184, 26, 3, 32);
  });
  const panel = add(g, new THREE.PlaneGeometry(0.156, 0.078), new THREE.MeshLambertMaterial({ map: front }), 0, 0, 0.0352);
  label(panel);
  // The volume knob (part 'radioKnob', turned to the left to switch it off), a mark shows how far
  const knob = new THREE.Group();
  knob.position.set(0.045, -0.022, 0.038);
  g.add(knob);
  const kb = add(knob, new THREE.CylinderGeometry(0.011, 0.012, 0.012, 16), lam('#2a2421'));
  kb.rotation.x = Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const r = add(knob, new THREE.BoxGeometry(0.002, 0.003, 0.012), lam('#1a1614'), Math.cos((i / 12) * Math.PI * 2) * 0.0118, Math.sin((i / 12) * Math.PI * 2) * 0.0118, 0);
    r.rotation.z = (i / 12) * Math.PI * 2;
  }
  add(knob, new THREE.BoxGeometry(0.003, 0.009, 0.003), lam('#f4f1e8'), 0, 0.006, 0.007);
  parts.set('radioKnob', knob);
  knob.traverse((o) => (o.userData.label = true));
  // Tuning knob on the side
  const tune = add(g, new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16), lam('#2a2421'), 0.088, 0.01, 0);
  tune.rotation.z = Math.PI / 2;
  // Carrying handle
  const handle = add(g, new THREE.TorusGeometry(0.05, 0.004, 6, 20, Math.PI), lam('#3a2a20'), 0, 0.045, 0);
  handle.scale.set(1.2, 0.5, 1);
  // Antenna with a ball on top
  const ant = add(g, new THREE.CylinderGeometry(0.0016, 0.0024, 0.16, 6), lam('#b5bac0'), 0.06, 0.11, -0.02);
  ant.rotation.z = -0.5;
  add(ant, new THREE.SphereGeometry(0.004, 8, 6), lam('#b5bac0'), 0, 0.08, 0);
  const led = add(g, new THREE.BoxGeometry(0.008, 0.008, 0.004), lam('#ff5a3a'), 0.07, 0.012, 0.036);
  parts.set('radioLed', led);
}

/* ---- keyboard and mouse ------------------------------------------------------------------------- */

/** A beige keyboard with real keys (one instanced mesh) on a sloped case. */
export function buildKeyboard(g: THREE.Group) {
  add(g, new RoundedBoxGeometry(0.44, 0.022, 0.14, 2, 0.006), lam('#d4d1c9'));
  add(g, new THREE.BoxGeometry(0.42, 0.004, 0.12), lam('#7c7a74'), 0, 0.0105, 0.002);
  // Rows of keys: number row, three letter rows, the space row
  const rows: number[][] = [Array(14).fill(1), [1.4, ...Array(12).fill(1), 1.6], [1.7, ...Array(11).fill(1), 2.3], [2.2, ...Array(10).fill(1), 2.8], [1.3, 1.3, 1.3, 6.4, 1.3, 1.3, 1.3]];
  const unit = 0.0272;
  const count = rows.reduce((n, r) => n + r.length, 0);
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.12), lam('#efece4'), count);
  const m = new THREE.Matrix4();
  let i = 0;
  rows.forEach((row, r) => {
    const total = row.reduce((a, b) => a + b, 0) * unit;
    let x = -total / 2;
    for (const w of row) {
      const kw = w * unit - 0.004;
      m.compose(new THREE.Vector3(x + (w * unit) / 2, 0.0145 - r * 0.0006, -0.05 + r * 0.025), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, 0, 0)), new THREE.Vector3(kw, 0.008, 0.021));
      keys.setMatrixAt(i++, m);
      x += w * unit;
    }
  });
  g.add(keys);
  // Three little lights at the top right
  for (let k = 0; k < 3; k++) add(g, new THREE.BoxGeometry(0.004, 0.002, 0.003), lam(k === 1 ? '#6fd36f' : '#4a5a4a'), 0.17 + k * 0.01, 0.0115, -0.064);
}

/** The mouse: a rounded shell with two buttons, a wheel, a short tail of cable; underneath a grey plate and the red light. */
export function buildMouse(g: THREE.Group) {
  const shell = add(g, new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lam('#dedbd3'), 0, -0.011, 0);
  shell.scale.set(0.031, 0.022, 0.05);
  add(g, new THREE.CylinderGeometry(0.031, 0.031, 0.002, 20), lam('#6f6d66'), 0, -0.011, 0).scale.z = 50 / 31;
  // Button split and the wheel (on the front half)
  add(g, new THREE.BoxGeometry(0.0012, 0.004, 0.03), lam('#8f8c84'), 0, 0.009, 0.026);
  const wheel = add(g, new THREE.CylinderGeometry(0.005, 0.005, 0.004, 12), lam('#55534e'), 0, 0.0095, 0.026);
  wheel.rotation.z = Math.PI / 2;
  // Underneath: the red light and two glide pads
  add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.002, 10), lam('#ff3a2a', { emissive: '#a01810' }), 0, -0.0125, 0.008);
  for (const z of [-0.03, 0.035]) add(g, new THREE.BoxGeometry(0.03, 0.0012, 0.006), lam('#3a3936'), 0, -0.0125, z);
  // A short tail of cable from the front
  const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.004, 0.05), new THREE.Vector3(0, -0.006, 0.065), new THREE.Vector3(0.006, -0.009, 0.08)]);
  add(g, new THREE.TubeGeometry(tail, 10, 0.0018, 5), lam('#cfcbc2'));
}

/* ---- paper ------------------------------------------------------------------------------------- */

/** The report: a stack of sheets with a title page (its top is at y 0.015; the signature ink lies on it). */
export function buildReport(g: THREE.Group) {
  const edge = tex(
    8,
    64,
    (c) => {
      c.fillStyle = '#f7f5ef';
      c.fillRect(0, 0, 8, 64);
      c.fillStyle = '#d6d2c6';
      for (let y = 0; y < 64; y += 2) c.fillRect(0, y, 8, 1);
    },
    true,
  );
  const sides = new THREE.MeshLambertMaterial({ map: edge });
  const page = tex(420, 560, (c) => {
    c.fillStyle = '#fbfaf5';
    c.fillRect(0, 0, 420, 560);
    c.fillStyle = '#1f3b78';
    c.fillRect(0, 0, 420, 14);
    c.fillStyle = '#222';
    c.textAlign = 'center';
    c.font = 'bold 40px Arial, sans-serif';
    c.fillText('QUARTERLY', 210, 80);
    c.fillText('REPORT', 210, 126);
    c.font = '22px Arial, sans-serif';
    c.fillStyle = '#555';
    c.fillText('Q3 · Sticky Note Division', 210, 164);
    c.fillStyle = '#b8b4a8';
    for (let i = 0; i < 9; i++) c.fillRect(50, 210 + i * 26, 320 - ((i * 53) % 90), 8);
    // A little bar chart
    c.fillStyle = '#7a9cc8';
    [40, 70, 55, 100].forEach((h, i) => c.fillRect(120 + i * 48, 470 - h * 0.6 - 20, 30, h * 0.6));
  });
  const top = new THREE.MeshLambertMaterial({ map: page });
  label(add(g, new THREE.BoxGeometry(0.21, 0.03, 0.28), [sides, sides, top, sides, sides, sides]));
  // Two sheets sticking out a little
  const s1 = add(g, new THREE.BoxGeometry(0.205, 0.002, 0.275), lam('#f1efe7'), 0.006, -0.006, 0.004);
  s1.rotation.y = 0.04;
  const s2 = add(g, new THREE.BoxGeometry(0.205, 0.002, 0.275), lam('#efece3'), -0.004, 0.004, -0.003);
  s2.rotation.y = -0.03;
}

/** Three curled shop receipts, printed. */
export function buildReceipts(g: THREE.Group) {
  const shops = ['COFFEE CORNER', 'OFFICE MAX-ISH', 'PIZZA PLANET'];
  shops.forEach((shop, i) => {
    const art = tex(
      96,
      192,
      (c) => {
        c.fillStyle = '#fbfaf5';
        c.fillRect(0, 0, 96, 192);
        c.fillStyle = '#333';
        c.textAlign = 'center';
        c.font = 'bold 10px monospace';
        c.fillText(shop, 48, 18);
        c.font = '9px monospace';
        c.textAlign = 'left';
        for (let k = 0; k < 7; k++) {
          c.fillText(['ITEM', 'ITEM', 'TAX'][k % 3], 8, 40 + k * 14);
          c.fillText(`${(3 + ((k * 7 + i * 3) % 9)).toFixed(2)}`, 62, 40 + k * 14);
        }
        c.font = 'bold 11px monospace';
        c.fillText('TOTAL', 8, 150);
        c.fillText(`${(21 + i * 7).toFixed(2)}`, 56, 150);
        c.fillRect(8, 162, 80, 1);
        for (let x = 10; x < 86; x += 3) c.fillRect(x, 170, (x * 7) % 3 ? 1 : 2, 14);
      },
      true,
    );
    const geo = new THREE.PlaneGeometry(0.06, 0.12, 1, 8);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k);
      // The ends curl up a little (thermal paper)
      p.setZ(k, Math.max(0, Math.abs(y) - 0.035) ** 2 * 6);
    }
    geo.computeVertexNormals();
    const r = add(g, geo, new THREE.MeshLambertMaterial({ map: art, side: THREE.DoubleSide }), (i - 1) * 0.008, 0.002 + i * 0.002, (i - 1) * 0.006);
    r.rotation.set(-Math.PI / 2, 0, (i - 1) * 0.14);
  });
}

/* ---- monitor details ----------------------------------------------------------------------------- */

/** A brand plate and a recessed frame around the screen, vents on the side. */
export function detailMonitor(mon: THREE.Object3D, screenY: number) {
  add(mon, new THREE.BoxGeometry(0.335, 0.26, 0.004), lam('#b9b29d'), 0, screenY, 0.0235);
  const logo = tex(128, 32, (c) => {
    c.fillStyle = '#d2cbb6';
    c.fillRect(0, 0, 128, 32);
    c.fillStyle = '#4a4636';
    c.font = 'italic bold 20px Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('DeskTron', 64, 17);
  });
  label(add(mon, new THREE.PlaneGeometry(0.06, 0.015), new THREE.MeshLambertMaterial({ map: logo }), -0.12, -0.143, 0.0262));
}
