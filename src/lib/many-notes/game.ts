/**
 * 2 Many Notes (graybox, phases 1–3). You sit at the desk and look around
 * (mouse at the screen edge, or drag; swipe on phones), click a note to read
 * it up close, and do what it says. A finished note is torn off, crumpled and
 * thrown into the bin; the counter counts down to "All clear!".
 *
 * Holding: some things can be picked up (one at a time) and used on
 * something; right-click or Esc puts them back. The phone rings now and then;
 * answer it while it rings, or call someone when it does not.
 *
 * The computer: click the monitor and the camera moves up close (mode
 * "zoom"); the screen is DeskOS (deskos.ts), a canvas texture, clicked through
 * the raycast's texture coordinates. Notes stuck on the screen are in front of
 * it, so they have to go before what is under them can be used. Typing goes
 * through a hidden input, so phones get a keyboard.
 *
 * Phase 3: 65 notes in two layers; some only show up once others are done
 * (notes.ts `after`), all count from the start. Progress is saved in
 * localStorage after every note (done notes, events, play time, DeskOS); the
 * world is rebuilt from the done notes (`settle`). At the end: the share card
 * (share.ts) with the desk before and after, the time and a rank.
 *
 * Phase 4: the look (look.ts: the day passes with the progress, rain, bloom,
 * grading, grain; pixel textures in textures.ts), ambience and music
 * (audio.ts), the screen flickers when a note comes off it, the camera shakes
 * a little in hectic moments, and a settings panel (sound, music, effects,
 * PS1 wobble; kept in localStorage).
 *
 * Phase 5: layer 3 (once layers 1 and 2 are done: drawers with a combination
 * lock and a key, the filing cabinet, stamp and ink, the board, a call-back
 * with a countdown), layer 4 (hidden notes, found by lifting, opening,
 * digging; hints when only hidden ones are left) and the finale: the last
 * note "Go home." — lights off, stand up, out of the door, credits, one note
 * for tomorrow that goes on the share card.
 *
 * Update 1, phase B: gestures. Pressing on many things starts a little game
 * instead of a click: drag the calendar page up and over, turn the picture
 * until the bubble is level, turn the clock's minute hand, push the window
 * shut and turn its handle, rub the coffee ring away, tip the bottle over
 * Gerald and stop in the green, press the stapler down, pull drawers open …
 * (gestureFor). A guide next to the thing says what to do and shows progress.
 * Phase C: drawing (try pens on the pad, the to-do list, signatures: real
 * ink on canvas textures), stamping, throwing rubbish at the bin (a flick; a
 * miss lands on the floor), filing, pinning the menu, turning the photo and
 * the radio's knob, the lamp's switch on its cable, the printer's paper
 * drawer, the lock's wheels by swiping; a tip after three tries that went
 * nowhere.
 *
 * Phase 6 (polish): the list of notes in sight (Tab or the top bar; pauses
 * the game; "Show me" turns the camera to a note), and the design rule from
 * the plan: a note you read 20 seconds ago and have not done yet makes the
 * thing it needs pulse softly.
 */
import * as THREE from 'three';
import type { UI } from '@/data/ui';
import { buildWorld, WINDOW_OPEN, type World } from './world';
import { NOTES, noteMesh, paperBall, type NoteDef } from './notes';
import { ambience, radio, setMusic, setSound, sfx } from './audio';
import { createLook, LOOKS, type LookName } from './look';
import { noteTexture } from './notes';
import { createDeskOS, type DeskSnapshot } from './deskos';
import { calendarPage, setClock } from './props';
import { pressStapler } from './desk';
import { makeCard } from './share';

export type ManyNotesStrings = (typeof UI)['fun']['manyNotes'];

const EYE = new THREE.Vector3(0, 1.22, 0.42);
const YAW_MAX = 1.4; // about 160° in all
const PITCH_MIN = -1.0;
// High enough to see the note on the ceiling (0.4 was not: it stayed above the top edge)
const PITCH_MAX = 0.9;
const PITCH_REST = -0.36;
const GLOW = new THREE.Color('#3b3112');
/** Where a held object sits in view, and where a note is read (camera space). */
const HOLD_POS = new THREE.Vector3(0.17, -0.13, -0.34);
const READ_POS = new THREE.Vector3(0, -0.005, -0.27);
const READ_SCALE = 2.7;
/** Up close at the monitor: the screen fills this much of the view. */
const ZOOM_FILL = 0.74;
const SAVE_KEY = 'jxsi_2manynotes_v1';
const BEFORE_KEY = 'jxsi_2manynotes_before';
const AFTER_KEY = 'jxsi_2manynotes_after';
const SETTINGS_KEY = 'jxsi_2manynotes_settings';
/** The radio switches itself back on for the last this many notes. */
const EPIC_AT = 10;
const URL = 'https://fun.jxsi.ch/2-many-notes';
/** Things that can be picked up (pens: only the one that works, once found). */
const ITEMS = new Set(['bottle', 'stapler', 'sandwich', 'banana', 'can', 'tissue', 'ream', 'stamp', 'invoice', 'taxform', 'snacks', 'menu', 'pen0', 'pen1', 'pen2', 'pen3', 'pen4']);
/** Things you press and drag (Update 1): the cursor shows a hand over them. */
const GRAB = new Set(['calendar', 'picture', 'clock', 'keyboard', 'window', 'mouse', 'globe', 'ball', 'mug', 'cables', 'phone', 'drawer0', 'drawer1', 'drawer2', 'photo', 'radio', 'lampSwitch']);
/** Rubbish you throw at the bin. */
const TRASH = new Set(['sandwich', 'banana', 'can']);
/** Seconds to call back before you are "fired". */
const CALLBACK_SECS = 30;
/** How often a hint comes when only hidden notes are left. */
const HINT_EVERY = 25;
/** After this many seconds a read but undone note shows what it needs. */
const STALE_AFTER = 20;
/** Note → the thing to click first (the pulse when stuck). Computer notes point at the monitor. */
const TARGET: Record<string, string> = {
  coffee: 'mug',
  plant: 'bottle',
  phone: 'phone',
  lamp: 'lampSwitch',
  staple: 'stapler',
  window: 'window',
  sandwich: 'sandwich',
  keyboard: 'keyboard',
  todo: 'notepad',
  callIt: 'phone',
  power: 'power',
  mouse: 'mouse',
  clock: 'clock',
  picture: 'picture',
  calendar: 'calendar',
  duck: 'duck',
  ball: 'ball',
  globe: 'globe',
  ring: 'tissues',
  banana: 'banana',
  can: 'can',
  mum: 'phone',
  pizza: 'phone',
  signReport: 'report',
  card: 'card',
  receipts: 'receipts',
  gerald: 'plant',
  cables: 'cables',
  radio: 'radio',
  paper: 'ream',
  fetch: 'printer',
  stapleOut: 'stapler',
  drawer: 'drawer0',
  middle: 'drawer1',
  key: 'plant',
  stamp: 'stamp',
  ink: 'ink',
  fileInvoice: 'invoice',
  tax: 'taxform',
  cookie: 'cookie',
  snacks: 'snacks',
  photo: 'photo',
  menu: 'menu',
  callback: 'phone',
  dave: 'card',
  cabinetJam: 'cab1',
};
/** Who you call when the phone is not ringing, in this order. */
const CALLS: [string, 'callIt' | 'callMum' | 'callPizza'][] = [
  ['callIt', 'callIt'],
  ['mum', 'callMum'],
  ['pizza', 'callPizza'],
];
/** Where the printout goes once fetched: the free corner left of the desk. */
const PRINTOUT_DESK = { pos: new THREE.Vector3(-0.68, 0.766, -0.585), rotY: 1.67 };
/** Where the lunch menu hangs once pinned back on the board (upright, facing the room). */
const MENU_PINNED = { pos: new THREE.Vector3(-0.57, 1.45, -1.4783), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0.06)) };

type Ease = (k: number) => number;
const easeInOut: Ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut: Ease = (k) => 1 - (1 - k) ** 3;
const linear: Ease = (k) => k;
const back: Ease = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

interface NoteState {
  def: NoteDef;
  mesh: THREE.Mesh;
  done: boolean;
  /** In the scene (it may still wait for `after`). */
  shown: boolean;
}

interface Save {
  v: 1;
  done: string[];
  events: string[];
  time: number;
  os: DeskSnapshot;
  workingPen: number;
  finished?: boolean;
  /** Phase 5: the drawer code, the note for tomorrow. */
  code?: string;
  tomorrow?: string;
}

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* full or blocked: the game still works, just without saving */
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* fine */
    }
  },
};

export function startManyNotes(root: HTMLElement, S: ManyNotesStrings): () => void {
  const $ = <E extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<E>(sel)!;
  const canvas = $<HTMLCanvasElement>('[data-mn-cv]');
  const countEl = $('[data-mn-count]');
  const hintEl = $('[data-mn-hint]');
  const toastEl = $('[data-mn-toast]');
  const touch = window.matchMedia('(pointer: coarse)').matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  } catch {
    $('[data-mn-start]').querySelector('[data-mn-how]')!.textContent = S.noWebgl;
    $<HTMLButtonElement>('[data-mn-go]').hidden = true;
    return () => {};
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const world: World = buildWorld();
  const { scene, parts } = world;
  const part = (name: string) => parts.get(name)!;
  const obj = (id: string) => world.objects.get(id)!;
  const camera = new THREE.PerspectiveCamera(62, 1, 0.02, 30);
  const eye = EYE.clone();
  camera.position.copy(eye);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const look = createLook(renderer, scene, camera, world);

  /* ---- notes ------------------------------------------------------------------------------- */

  // The drawer code is new for every desk (and kept in the save); its digits are on the backs of four notes
  const pre = (() => {
    try {
      return JSON.parse(store.get(SAVE_KEY) ?? 'null') as Save | null;
    } catch {
      return null;
    }
  })();
  const code = pre?.code && /^\d{4}$/.test(pre.code) ? pre.code : String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const backOf = (def: NoteDef) => (def.back && def.id.startsWith('code') ? `#${def.id.slice(4)} = ${code[Number(def.id.slice(4)) - 1]}` : undefined);
  const notes = new Map<string, NoteState>();
  for (const def of NOTES) {
    const mesh = noteMesh(def, S.notes[def.id as keyof typeof S.notes] ?? def.id, aniso, backOf(def));
    // Notes are drawn sharp on top of the pixel room (Update 2)
    look.sharp(mesh);
    notes.set(def.id, { def, mesh, done: false, shown: false });
  }
  const isDone = (id: string) => notes.get(id)?.done ?? false;
  const events = new Set<string>();
  const met = (cond: string) => (cond.startsWith('@') ? events.has(cond) : isDone(cond));
  const left = () => [...notes.values()].filter((n) => !n.done).length;
  let thrown = 0;

  /** Puts notes whose time has come into the scene (with a pop, unless loading). */
  function appear(animate: boolean, quiet = false) {
    let any = false;
    for (const n of notes.values()) {
      if (n.shown || n.done || n.def.virtual || !(n.def.after ?? []).every(met)) continue;
      n.shown = true;
      if (n.def.id === 'inDrawer') {
        // Inside the bottom drawer: it moves with it
        obj('drawer2').add(n.mesh);
        n.mesh.position.set(-0.02, -0.063, -0.1);
      } else scene.add(n.mesh);
      if (animate) {
        any = true;
        n.mesh.scale.setScalar(0.01);
        void tween(0.45, (k) => n.mesh.scale.setScalar(Math.max(0.01, k)), back);
      }
    }
    if (any) {
      sfx.pop();
      if (!quiet) toast(S.newNote);
      shake(0.008);
    }
  }

  /* ---- the computer ------------------------------------------------------------------------- */

  const typeEl = $<HTMLInputElement>('[data-mn-type]');
  const backEl = $<HTMLButtonElement>('[data-mn-back]');
  const os = createDeskOS(S.os, {
    done: (id) => {
      void complete(id);
    },
    event: (name) => {
      events.add(name);
      shake(0.02);
      appear(true);
      save();
    },
    print: () => void printOut(),
    onLoginShown: () => {
      if (mode === 'zoom' && !touch) os.type();
    },
    wantKeys: (on, numeric) => {
      if (on) {
        typeEl.value = '';
        typeEl.inputMode = numeric ? 'numeric' : 'text';
        typeEl.focus({ preventScroll: true });
      } else typeEl.blur();
    },
  });
  const screenMat = world.screen.material as THREE.MeshBasicMaterial;
  screenMat.map = os.texture;
  screenMat.needsUpdate = true;

  /* ---- tweens ------------------------------------------------------------------------------- */

  interface Tween {
    t: number;
    dur: number;
    ease: Ease;
    step: (k: number) => void;
    done: () => void;
  }
  const tweens: Tween[] = [];
  const tween = (dur: number, step: (k: number) => void, ease: Ease = easeInOut) =>
    new Promise<void>((done) => tweens.push({ t: 0, dur, ease, step, done }));
  const wait = (s: number) => tween(s, () => {});

  /** Moves an object to a pose in its parent's space. */
  function moveTo(o: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, dur: number, ease: Ease = easeInOut) {
    const p0 = o.position.clone();
    const q0 = o.quaternion.clone();
    const s0 = o.scale.x;
    return tween(
      dur,
      (k) => {
        o.position.lerpVectors(p0, pos, k);
        o.quaternion.slerpQuaternions(q0, quat, k);
        o.scale.setScalar(s0 + (scale - s0) * k);
      },
      ease,
    );
  }

  /* ---- camera --------------------------------------------------------------------------------- */

  let yaw = 0;
  let pitch = PITCH_REST;
  let tYaw = 0;
  let tPitch = PITCH_REST;
  let mouse: { x: number; y: number } | null = null;
  let drag: { x: number; y: number; moved: number; id: number } | null = null;

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Tall screens see a little more
    camera.fov = w < h ? 78 : 62;
    camera.updateProjectionMatrix();
    look.resize(w, h);
    if (atMonitor() && !busy) camera.position.copy(zoomPos());
    if (focusId && (mode === 'focus' || mode === 'gesture' || mode === 'reading') && !busy && !gest) aimAt(focusPose(focusId), true);
  }

  /** Mouse near an edge turns the view (desktop): 0 in the middle 70 %, up to 1 at the edge. */
  const edge = (v: number) => Math.sign(v) * Math.max(0, (Math.abs(v) - 0.7) / 0.3);

  /* ---- hover and picking ----------------------------------------------------------------------- */

  const ray = new THREE.Raycaster();
  // Notes and the screen are on layer 1 (drawn sharp): clicks must find them too
  ray.layers.enableAll();
  const ndc = new THREE.Vector2();

  /** What is under a screen point: a note id, an object id, the screen, or nothing. */
  function pickAt(x: number, y: number, skipNotes = false): { note?: string; id?: string; screen?: THREE.Vector2 } | null {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const hit of ray.intersectObjects(scene.children, true)) {
      if (!visible(hit.object) || hit.object.userData.shadow || hit.object.userData.ghost) continue;
      // With something in hand, notes on the target are not in the way
      if (skipNotes && (hit.object.userData.note || hit.object.parent?.userData.note)) continue;
      let o: THREE.Object3D | null = hit.object;
      while (o) {
        if (o.userData.note && !notes.get(o.userData.note)?.done) return { note: o.userData.note };
        if (o.userData.screen && hit.uv) return { id: 'monitor', screen: hit.uv.clone() };
        if (o.userData.id) return { id: o.userData.id };
        o = o.parent;
      }
      // The first solid thing blocks what is behind it
      if (hit.object instanceof THREE.Mesh && (hit.object.material as THREE.Material).visible !== false) return null;
    }
    return null;
  }

  /** Hidden things (or things in hidden groups) cannot be clicked. The invisible hit shapes can. */
  function visible(o: THREE.Object3D) {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  }

  function glow(o: THREE.Object3D | undefined, on: boolean) {
    o?.traverse((c) => {
      if (!(c instanceof THREE.Mesh)) return;
      const m = c.material as THREE.MeshLambertMaterial;
      if (!m.emissive) return;
      m.userData.base ??= m.emissive.clone();
      m.emissive.copy(on ? GLOW : (m.userData.base as THREE.Color));
    });
  }

  let hovered: THREE.Object3D | undefined;
  function hover() {
    let target: THREE.Object3D | undefined;
    let onButton = false;
    if (mouse && (mode === 'free' || mode === 'zoom' || mode === 'focus') && !busy && !drag?.moved) {
      const p = pickAt(((mouse.x + 1) / 2) * window.innerWidth, ((mouse.y + 1) / 2) * window.innerHeight);
      // Up close, the screen is not one thing to click but what DeskOS shows
      if (mode === 'zoom' && p?.screen) onButton = os.hover(p.screen);
      else if (mode === 'zoom' && p?.id === 'monitor') target = undefined;
      else if (p?.id === 'board' && held !== 'menu') target = undefined;
      else target = p?.note ? notes.get(p.note)!.mesh : p?.id ? world.objects.get(p.id) : undefined;
      if (!p?.screen) os.hover(null);
    }
    if (mode !== 'gesture') canvas.style.cursor = target || onButton ? (target && !held && target.userData.id && GRAB.has(target.userData.id) ? 'grab' : 'pointer') : '';
    if (target !== hovered) {
      glow(hovered, false);
      hovered = target;
      glow(hovered, true);
    }
    pulseStuck();
  }

  /** What a stuck note needs pulses softly (not while hovered). */
  const pulsing = new Set<THREE.Object3D>();
  const PULSE = new THREE.Color('#6a5512');
  function pulseStuck() {
    const want = new Set<THREE.Object3D>();
    if (mode === 'free' || mode === 'zoom' || mode === 'focus') {
      for (const [id, at] of readAt) {
        const n = notes.get(id)!;
        if (n.done || playTime - at < STALE_AFTER) continue;
        const tid = n.def.color === 'pink' ? 'monitor' : TARGET[id];
        const o = tid ? world.objects.get(tid) : undefined;
        if (o && visible(o) && o !== hovered && !(mode === 'zoom' && tid === 'monitor')) want.add(o);
      }
    }
    for (const o of pulsing) if (!want.has(o)) glow(o, false);
    pulsing.clear();
    const k = 0.5 + 0.5 * Math.sin(playTime * 4);
    for (const o of want) {
      pulsing.add(o);
      o.traverse((c) => {
        if (!(c instanceof THREE.Mesh)) return;
        const m = c.material as THREE.MeshLambertMaterial;
        if (!m.emissive) return;
        m.userData.base ??= m.emissive.clone();
        m.emissive.copy(m.userData.base as THREE.Color).lerp(PULSE, k);
      });
    }
  }

  /* ---- up close at the monitor ------------------------------------------------------------------ */

  const SCREEN_AT = new THREE.Vector3();
  world.screen.getWorldPosition(SCREEN_AT);
  let savedLook = { yaw: 0, pitch: PITCH_REST };

  /** Camera position where the screen fills the view (depends on the window's shape). */
  function zoomPos() {
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dH = 0.225 / ZOOM_FILL / (2 * tan);
    // Phones held upright: the screen uses the whole width
    const dW = 0.3 / (camera.aspect < 1 ? 0.97 : ZOOM_FILL) / (2 * tan * camera.aspect);
    return SCREEN_AT.clone().add(new THREE.Vector3(0, 0, Math.max(dH, dW)));
  }
  const atMonitor = () => mode === 'zoom' || (mode === 'reading' && readFrom === 'zoom');

  async function enterZoom() {
    busy = true;
    savedLook = { yaw: tYaw, pitch: tPitch };
    mode = 'zoom';
    tYaw = 0;
    tPitch = 0;
    hint();
    backEl.hidden = false;
    const p0 = camera.position.clone();
    const p1 = zoomPos();
    await tween(0.6, (k) => camera.position.lerpVectors(p0, p1, k));
    busy = false;
    // With a keyboard, the password field is ready to type into
    if (!touch) os.type();
  }

  async function exitZoom() {
    if (mode !== 'zoom') return;
    busy = true;
    mode = 'free';
    typeEl.blur();
    os.hover(null);
    backEl.hidden = true;
    tYaw = savedLook.yaw;
    tPitch = savedLook.pitch;
    hint();
    const p0 = camera.position.clone();
    await tween(0.5, (k) => camera.position.lerpVectors(p0, eye, k));
    busy = false;
  }

  /* ---- messages ------------------------------------------------------------------------------- */

  let toastTimer = 0;
  function toast(text: string) {
    toastEl.textContent = text;
    toastEl.classList.remove('is-on');
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('is-on'), 2300);
  }

  const itemName = (id: string) => (id.startsWith('pen') ? (id === `pen${workingPen}` && isDone('pen') ? S.items.pen : S.items.anyPen) : (S.items[id as keyof typeof S.items] ?? id));

  function hint() {
    if (mode === 'reading' && reading) {
      const n = notes.get(reading)!;
      hintEl.textContent = `${n.def.kind === 'instant' ? S.readInstant : S.read} ${S.readBack}`;
    } else if (mode === 'zoom') {
      hintEl.textContent = touch ? S.zoomTouch : S.zoomDesk;
    } else if (mode === 'focus') {
      hintEl.textContent = touch ? S.focusTouch : S.focusDesk;
    } else if (held) {
      hintEl.textContent = (touch ? S.holdingTouch : S.holding).replace('{item}', itemName(held));
    } else hintEl.textContent = firstHint ? (touch ? S.howTouch : S.howDesk) : '';
  }
  let firstHint = true;

  /** Share of notes done: drives the time of day and the radio's tempo. */
  const progress = () => 1 - left() / NOTES.length;

  function count(pop = true) {
    const n = left();
    look.setProgress(progress(), !pop);
    radio.setSpeed(1 + 0.25 * progress());
    if (pop && n <= EPIC_AT && n > 0) startEpic(true);
    countEl.textContent = n === 1 ? S.leftOne : S.left.replace('{n}', String(n));
    countEl.classList.remove('is-pop');
    if (!pop) return;
    void countEl.offsetWidth;
    countEl.classList.add('is-pop');
  }

  /* ---- reading a note ------------------------------------------------------------------------- */

  type Mode = 'start' | 'free' | 'zoom' | 'focus' | 'reading' | 'lock' | 'list' | 'gesture' | 'done';
  let mode: Mode = 'start';
  /** Where reading a note returns to (free view, up close at the monitor or at a little game). */
  let readFrom: 'free' | 'zoom' | 'focus' = 'free';
  let busy = false;
  let reading: string | null = null;
  const homes = new Map<THREE.Object3D, { parent: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scale: number }>();

  function remember(o: THREE.Object3D) {
    if (!homes.has(o)) homes.set(o, { parent: o.parent!, pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.x });
  }

  async function goHome(o: THREE.Object3D, dur = 0.45) {
    const h = homes.get(o);
    if (!h) return;
    h.parent.attach(o);
    await moveTo(o, h.pos, h.quat, h.scale, dur);
  }

  const flipEl = $<HTMLButtonElement>('[data-mn-flip]');
  let flipped = false;
  async function flipNote() {
    if (!reading || busy) return;
    const n = notes.get(reading)!;
    flipped = !flipped;
    sfx.flip();
    busy = true;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, flipped ? Math.PI : 0, 0));
    await moveTo(n.mesh, READ_POS, q, READ_SCALE, 0.35);
    busy = false;
  }

  /** When each note was last read (play time), for the stuck pulse. */
  const readAt = new Map<string, number>();

  async function openNote(id: string) {
    const n = notes.get(id)!;
    readAt.set(id, playTime);
    flipped = false;
    flipEl.hidden = !n.def.back;
    busy = true;
    readFrom = mode === 'zoom' || mode === 'focus' ? mode : 'free';
    if (mode === 'focus') hideGuide();
    mode = 'reading';
    reading = id;
    glow(n.mesh, false);
    hovered = undefined;
    remember(n.mesh);
    sfx.rip();
    camera.attach(n.mesh);
    hint();
    await moveTo(n.mesh, READ_POS, new THREE.Quaternion(), READ_SCALE, 0.42, easeOut);
    busy = false;
  }

  async function closeNote() {
    if (!reading) return;
    const n = notes.get(reading)!;
    busy = true;
    reading = null;
    flipEl.hidden = true;
    mode = readFrom;
    hint();
    await goHome(n.mesh, 0.38);
    if (mode === 'focus' && focusId) {
      backEl.hidden = false;
      const info = focusInfo(focusId);
      if (info) showGuide({ ...info, at: obj(focusId) });
    }
    busy = false;
  }

  /**
   * The note is done: torn off, crumpled, thrown into the bin. A note that has
   * not shown up yet is just counted. Its clue notes go with it.
   */
  async function complete(id: string) {
    const n = notes.get(id);
    if (!n || n.done) return;
    n.done = true;
    save();
    for (const c of notes.values()) if (c.def.with === id && !c.done) setTimeout(() => void complete(c.def.id), 380);
    if (!n.shown) {
      count();
      layers();
      appear(true);
      if (left() === 0) void finish();
      return;
    }
    const wasRead = reading === id;
    if (wasRead) {
      reading = null;
      flipEl.hidden = true;
      mode = readFrom;
      hint();
    }
    const from = new THREE.Vector3();
    n.mesh.getWorldPosition(from);
    if (n.def.screen && os.state !== 'off') void flicker();
    // Tear and crumple: the note shrinks and twists, the ball grows in its place
    sfx.rip();
    const ball = paperBall(n.def.color);
    look.addWobble(ball);
    ball.position.copy(from);
    ball.scale.setScalar(0.3);
    scene.add(ball);
    const s0 = n.mesh.scale.x;
    const r0 = n.mesh.rotation.z;
    setTimeout(sfx.crumple, 90);
    await tween(0.24, (k) => {
      n.mesh.scale.setScalar(s0 * (1 - k * 0.85));
      n.mesh.rotation.z = r0 + k * 2.5;
      ball.scale.setScalar(0.3 + 0.7 * k);
    });
    n.mesh.parent?.remove(n.mesh);
    // Throw: an arc into the bin, spinning
    const end = world.bin.top.clone();
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * world.bin.radius * 0.5;
    const landing = new THREE.Vector3(end.x + Math.cos(a) * r, world.bin.floor + 0.02 + Math.min(thrown, 25) * 0.007, end.z + Math.sin(a) * r);
    thrown++;
    const dist = from.distanceTo(end);
    const h = 0.25 + dist * 0.25;
    sfx.swish();
    const spin = new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
    const r1 = ball.rotation.clone();
    await tween(
      0.55 + dist * 0.25,
      (k) => {
        ball.position.lerpVectors(from, end, k);
        ball.position.y += 4 * h * k * (1 - k);
        ball.rotation.set(r1.x + spin.x * k, r1.y + spin.y * k, r1.z + spin.z * k);
      },
      linear,
    );
    // Drop into the bin
    const top = ball.position.clone();
    await tween(0.18, (k) => ball.position.lerpVectors(top, landing, k), (k) => k * k);
    sfx.land();
    count();
    layers();
    appear(true);
    if (left() === 0) void finish();
  }

  /** After logging in, the boss writes again (where the spare key is). */
  function layers() {
    // Update 1: all layers are in the room from the start; the boss's second mail comes once you are logged in
    if (isDone('login')) os.addBoss2();
  }

  /** Something happened that may bring notes (once). */
  function happen(name: string, message?: string) {
    if (events.has(name)) return false;
    events.add(name);
    if (message) toast(message);
    appear(true, !!message);
    save();
    return true;
  }

  /* ---- holding things ------------------------------------------------------------------------- */

  let held: string | null = null;

  /** Contact shadows travel with their thing; hidden while it is in your hand. */
  const shadows = (o: THREE.Object3D, on: boolean) => o.traverse((c) => c.userData.shadow && (c.visible = on));

  /** How a thing sits in your hand: pens slanted like for writing, the tissue a little towards you, the rest turned a bit. */
  function holdQuat(o: THREE.Object3D) {
    const id = String(o.userData.id ?? '');
    const e = id.startsWith('pen') ? new THREE.Euler(1.05, 0, -0.45) : id === 'tissue' ? new THREE.Euler(0.7, 0, 0.25) : new THREE.Euler(0.25, -0.5, 0.1);
    return new THREE.Quaternion().setFromEuler(e);
  }

  async function pickUp(id: string) {
    const o = obj(id);
    shadows(o, false);
    if (id === 'stapler') happen('@stapler', S.toasts.staplerUnder);
    if (id === 'key') void complete('key');
    busy = true;
    remember(o);
    glow(o, false);
    hovered = undefined;
    sfx.pick();
    camera.attach(o);
    held = id;
    hint();
    const q = holdQuat(o);
    await moveTo(o, HOLD_POS, q, 1, 0.35, easeOut);
    busy = false;
  }

  async function putBack() {
    if (!held) return;
    const o = obj(held);
    held = null;
    hint();
    busy = true;
    await goHome(o, 0.4);
    shadows(o, true);
    if (o.userData.id === 'tissue') o.visible = false;
    busy = false;
  }

  async function nope(message: string = S.toasts.nope) {
    sfx.nope();
    toast(message);
    const o = held ? obj(held) : undefined;
    if (!o) return;
    const x0 = o.position.x;
    await tween(0.3, (k) => (o.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.01 * (1 - k)), linear);
  }

  /** Moves a held object to a point in the world (it stays in camera space while the camera is still). */
  const heldTarget = (at: THREE.Vector3) => camera.worldToLocal(at.clone());

  /** The held thing goes into the bin (and stays there). */
  /** Rubbish that went into the bin stays there, on top of what is already inside (no longer clickable). */
  function intoBin(o: THREE.Object3D) {
    scene.attach(o);
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * world.bin.radius * 0.4;
    o.position.set(world.bin.top.x + Math.cos(a) * r, world.bin.floor + 0.035 + Math.min(thrown, 25) * 0.007, world.bin.top.z + Math.sin(a) * r);
    o.rotation.set((Math.random() - 0.5) * 0.7, Math.random() * 6, (Math.random() - 0.5) * 0.7);
    o.scale.setScalar(0.85);
    o.visible = true;
    shadows(o, false);
    o.traverse((c) => (c.userData.ghost = true));
    thrown++;
  }

  async function throwHeld(noteId: string) {
    const o = obj(held!);
    busy = true;
    held = null;
    hint();
    scene.attach(o);
    const from = o.position.clone();
    const end = world.bin.top.clone();
    sfx.swish();
    await tween(
      0.7,
      (k) => {
        o.position.lerpVectors(from, end, k);
        o.position.y += 4 * 0.3 * k * (1 - k);
        o.rotation.x += 0.15;
      },
      linear,
    );
    await tween(0.15, (k) => (o.position.y = end.y - 0.25 * k));
    sfx.land();
    intoBin(o);
    busy = false;
    void complete(noteId);
  }

  /** Brings the held thing to a point, does something there, then puts it back. */
  async function useHeldAt(at: THREE.Vector3, euler: THREE.Euler, action: () => Promise<void> | void) {
    const o = obj(held!);
    busy = true;
    await moveTo(o, heldTarget(at), new THREE.Quaternion().setFromEuler(euler), 1, 0.4);
    await action();
    busy = false;
    await putBack();
  }

  /* ---- the office: what each click does ------------------------------------------------------- */

  let lampOn = false;
  let windowOpen = true;
  const pensTried = new Set<number>();
  let workingPen = Math.floor(Math.random() * 5);
  let ringing = 0;
  let nextRing = 18;
  let printing = false;

  // Starting state of the props
  const realMinutes = () => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  };
  let clockShows = realMinutes() - 47;
  setClock(parts, clockShows);
  const month = new Date().getMonth();
  /** The calendar shows a month (the material stays: it is drawn sharp). */
  function setCalendar(m: number) {
    const mat = (part('calendarPage') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    mat.map?.dispose();
    mat.map = calendarPage(m);
    mat.needsUpdate = true;
  }
  setCalendar((month + 9) % 12);
  /** Torn-off calendar pages on the floor in front of it. */
  const FLOOR_PAGES: [number, number, number][] = [
    [1.0, -1.3, 0.4],
    [1.15, -1.16, -0.5],
    [0.95, -1.12, 1.3],
  ];
  function dropPage(m: number, i: number, instant: boolean) {
    const page = part('calendarPage') as THREE.Mesh;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.4), new THREE.MeshLambertMaterial({ map: calendarPage(m), side: THREE.DoubleSide }));
    look.addWobble(sheet);
    page.updateWorldMatrix(true, false);
    page.matrixWorld.decompose(sheet.position, sheet.quaternion, sheet.scale);
    scene.add(sheet);
    const [x, z, yaw] = FLOOR_PAGES[i % FLOOR_PAGES.length];
    const p1 = new THREE.Vector3(x, 0.003 + i * 0.0008, z);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw));
    if (instant) {
      sheet.position.copy(p1);
      sheet.quaternion.copy(q1);
      return;
    }
    const p0 = sheet.position.clone();
    const q0 = sheet.quaternion.clone();
    // It flutters down: swings from side to side while it falls and turns flat
    void tween(
      1.3,
      (k) => {
        sheet.position.lerpVectors(p0, p1, k);
        sheet.position.x += Math.sin(k * Math.PI * 3) * 0.08 * (1 - k);
        sheet.position.y = p0.y + (p1.y - p0.y) * k * k * (2 - k);
        sheet.quaternion.slerpQuaternions(q0, q1, Math.min(1, k * 1.4));
        sheet.rotateZ(Math.sin(k * Math.PI * 4) * 0.25 * (1 - k));
      },
      linear,
    );
  }

  /** The end state of each done note, without animation (loading a save). */
  function settle(id: string) {
    const show = (name: string, on = true) => (part(name).visible = on);
    switch (id) {
      case 'plant':
        world.leaves.forEach((l) => (l.rotation.z = 0.4));
        break;
      case 'lamp':
        obj('lampSwitch').children.find((c) => c.userData.slider)!.position.z = 0.012;
        lampOn = true;
        lampLook();
        world.lampLight.intensity = 1.6;
        break;
      case 'window':
        windowOpen = false;
        windowShut = true;
        world.windowPane.rotation.y = 0;
        world.windowHandle.rotation.z = 0;
        break;
      case 'pen':
        world.scribble.visible = true;
        world.scribble.scale.x = 1;
        break;
      case 'todo':
        world.todoLines.forEach((l) => (l.visible = true));
        break;
      case 'keyboard':
        world.keyboard.rotation.y = 0;
        break;
      case 'power':
        powerLook();
        world.monitorLight.intensity = 0.35;
        break;
      case 'sandwich':
      case 'banana':
      case 'can':
        intoBin(obj(id));
        break;
      case 'mouse':
        obj('mouse').rotation.z = 0;
        break;
      case 'clock':
        clockShows = realMinutes();
        setClock(parts, clockShows);
        break;
      case 'picture':
        obj('picture').rotation.z = 0;
        break;
      case 'coffee': {
        drunk = 1;
        const cf = obj('mug').children.find((c) => c.userData.coffee);
        if (cf) cf.visible = false;
        break;
      }
      case 'calendar':
        calFlips = 3;
        setCalendar(month);
        for (let i = 0; i < 3; i++) dropPage((month + 9 + i) % 12, i, true);
        part('calendarStub').visible = true;
        break;
      case 'cables':
        show('knot', false);
        show('coil');
        break;
      case 'ring':
        show('stain', false);
        break;
      case 'card':
        show('cardSign');
        break;
      case 'receipts':
        show('receiptsStaple');
        break;
      case 'signReport':
        show('reportSign');
        break;
      case 'radio':
        radioOff();
        part('radioKnob').rotation.z = Math.PI * 1.5;
        break;
      case 'paper':
        show('printerPaper');
        show('printTray');
        obj('ream').visible = false;
        os.setPaper();
        break;
      case 'print':
        if (!isDone('fetch')) printoutInTray();
        break;
      case 'fetch':
        printoutOnDesk();
        break;
      case 'stapleOut':
        show('printoutStaple');
        break;
      case 'drawer':
        drawerOpen[0] = true;
        events.add('@unlock0');
        break;
      case 'middle':
        drawerOpen[1] = true;
        events.add('@unlock1');
        obj('key').visible = false;
        break;
      case 'stamp':
        part('invoiceStamp').visible = true;
        break;
      case 'fileInvoice':
        obj('invoice').visible = false;
        break;
      case 'tax':
        obj('taxform').visible = false;
        break;
      case 'cookie':
        obj('cookie').visible = false;
        break;
      case 'snacks':
        obj('snacks').visible = false;
        break;
      case 'photo':
        obj('photo').rotation.z = 0;
        break;
      case 'menu': {
        const m = obj('menu');
        m.position.copy(MENU_PINNED.pos);
        m.quaternion.copy(MENU_PINNED.quat);
        break;
      }
      case 'dave':
        obj('card').visible = false;
        part('trayCard').visible = true;
        break;
      case 'posture':
        eye.y = EYE.y + 0.035;
        camera.position.copy(eye);
        break;
    }
  }

  function lampLook() {
    const m = world.lampShade.material as THREE.MeshLambertMaterial;
    m.userData.base = new THREE.Color('#ffcf80');
    m.emissive.set('#ffcf80');
    const b = world.lampBulb.material as THREE.MeshLambertMaterial;
    b.userData.base = new THREE.Color('#fff1c0');
    b.emissive.set('#fff1c0');
  }

  /** The screen flickers when a part of it comes free (and blips). */
  async function flicker() {
    sfx.blip();
    await tween(0.35, (k) => screenMat.color.setScalar(1 + (1 - k) * (Math.random() < 0.5 ? 0.9 : -0.5)), linear);
    screenMat.color.setScalar(1);
  }

  /** The camera shakes a little (hectic moments); it fades by itself. */
  let shakeAmt = 0;
  function shake(amount: number) {
    shakeAmt = Math.max(shakeAmt, amount);
  }

  /** The last notes: the radio switches itself on with the epic track. */
  let epicOn = false;
  function startEpic(loud: boolean) {
    if (epicOn || mode === 'start' || mode === 'done') return;
    epicOn = true;
    radio.epic();
    radioLed(true);
    if (loud) {
      toast(S.toasts.radioBack);
      shake(0.02);
    }
  }

  function powerLook() {
    const led = world.powerLed.material as THREE.MeshLambertMaterial;
    led.color.set('#4dff6a');
    led.emissive.set('#2bd94a');
    led.userData.base = new THREE.Color('#2bd94a');
  }

  function radioOff() {
    radio.stop();
    radioLed(false);
  }

  function radioLed(on: boolean) {
    const led = (part('radioLed') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    led.color.set(on ? '#ff5a3a' : '#3a2420');
  }

  function printoutInTray() {
    const p = obj('printout');
    p.visible = true;
    p.position.set(1.3, 0.815, -0.38);
  }

  function printoutOnDesk() {
    const p = obj('printout');
    p.visible = true;
    p.position.copy(PRINTOUT_DESK.pos);
    p.rotation.set(0, PRINTOUT_DESK.rotY, 0);
  }

  /** DeskOS pressed Print: the page comes out of the real printer. */
  async function printOut() {
    printing = true;
    const p = obj('printout');
    p.visible = true;
    p.position.set(1.3, 0.83, -0.56);
    sfx.printer();
    const led = (part('printerLed') as THREE.Mesh).material as THREE.MeshLambertMaterial;
    led.color.set('#5ac35a');
    await tween(1.4, (k) => p.position.set(1.3, 0.83 - 0.015 * k, -0.56 + 0.18 * k), linear);
    led.color.set('#3a4a3a');
    printing = false;
  }

  /** Small animations that need no state. */
  async function wobble(o: THREE.Object3D, amount = 0.25, dur = 0.6) {
    const r0 = o.rotation.z;
    await tween(dur, (k) => (o.rotation.z = r0 + Math.sin(k * Math.PI * 5) * amount * (1 - k)), linear);
    o.rotation.z = r0;
  }

  async function use(id: string) {
    // Something in hand: use it on what was clicked
    if (held) {
      if (id === held) return putBack();
      if (id === 'monitor') {
        toast(S.toasts.handsFull);
        return;
      }
      const item = held;
      if (item === 'bottle' && id === 'plant') {
        return useHeldAt(new THREE.Vector3(-0.55, 1.05, -0.72), new THREE.Euler(0, 0, 1.9), async () => {
          sfx.pour();
          await tween(1.0, (k) => world.leaves.forEach((l, i) => (l.rotation.z = 1.25 - 0.85 * easeOut(Math.min(1, k * 1.3 - i * 0.05)))));
          void complete('plant');
        });
      }
      if (item === 'stapler' && (id === 'report' || id === 'receipts' || id === 'printout')) {
        const note = id === 'report' ? 'staple' : id === 'receipts' ? 'receipts' : 'stapleOut';
        if (isDone(note)) return nope();
        if (id === 'printout' && !isDone('fetch')) return nope();
        const at = new THREE.Vector3();
        obj(id).getWorldPosition(at);
        at.y += 0.045;
        const o = obj('stapler');
        return useHeldAt(at, new THREE.Euler(0, 0.2, 0), async () => {
          await tween(0.12, (k) => pressStapler(world.parts, k));
          sfx.chunk();
          if (id === 'receipts') part('receiptsStaple').visible = true;
          if (id === 'printout') part('printoutStaple').visible = true;
          await tween(0.15, (k) => pressStapler(world.parts, 1 - k));
          void complete(note);
        });
      }
      if (TRASH.has(item) && id === 'bin') return toast(G.throw);
      if (item === 'tissue' && id === 'ring') {
        const at = new THREE.Vector3(0.5, 0.79, -0.18);
        const o = obj('tissue');
        busy = true;
        // Flat on the desk (the inverse of the camera's turn)
        await moveTo(o, heldTarget(at), camera.quaternion.clone().invert(), 1, 0.4);
        sfx.wipe();
        const stain = part('stain') as THREE.Mesh;
        const sm = stain.material as THREE.MeshLambertMaterial;
        const p0 = o.position.clone();
        await tween(0.9, (k) => {
          o.position.set(p0.x + Math.sin(k * Math.PI * 6) * 0.03, p0.y, p0.z);
          sm.opacity = 0.55 * (1 - k);
        }, linear);
        stain.visible = false;
        busy = false;
        void complete('ring');
        // The used tissue goes into the bin
        return throwHeld('ring');
      }
      if (item.startsWith('pen') && (id === 'report' || id === 'card')) {
        const note = id === 'report' ? 'signReport' : 'card';
        if (isDone(note)) return nope();
        const at = new THREE.Vector3();
        obj(id).getWorldPosition(at);
        at.y += id === 'card' ? 0.08 : 0.04;
        at.z += id === 'card' ? 0.04 : 0.08;
        const o = obj(item);
        return useHeldAt(at, new THREE.Euler(0.5, 0, 0.4), async () => {
          sfx.scribble();
          const p0 = o.position.clone();
          await tween(0.5, (k) => (o.position.x = p0.x + Math.sin(k * Math.PI * 5) * 0.02), linear);
          part(id === 'card' ? 'cardSign' : 'reportSign').visible = true;
          void complete(note);
        });
      }
      if (item === 'ream' && id === 'printer') {
        if (isDone('paper')) return nope();
        const o = obj('ream');
        busy = true;
        await moveTo(o, heldTarget(new THREE.Vector3(1.3, 0.95, -0.72)), new THREE.Quaternion(), 1, 0.5);
        await tween(0.25, (k) => o.scale.setScalar(1 - 0.99 * k));
        o.visible = false;
        held = null;
        hint();
        part('printTray').visible = true;
        sfx.chunk();
        os.setPaper();
        busy = false;
        void complete('paper');
        return;
      }
      // Layer 3
      if (item === 'key' && id === 'drawer1') {
        const o = obj('key');
        busy = true;
        const at = new THREE.Vector3();
        obj('drawer1').getWorldPosition(at);
        at.x += 0.12;
        at.z += 0.03;
        await moveTo(o, heldTarget(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), 1, 0.4);
        sfx.unlatch();
        await tween(0.2, (k) => (o.rotation.z = (k * Math.PI) / 2));
        o.visible = false;
        held = null;
        hint();
        busy = false;
        toast(S.toasts.unlocked);
        happen('@unlock1');
        return;
      }
      if (item === 'snacks' && id === 'drawer2') {
        if (!drawerOut[2]) await openDrawer(2, true);
        const o = obj('snacks');
        busy = true;
        const at = new THREE.Vector3();
        obj('drawer2').getWorldPosition(at);
        at.z -= 0.15;
        at.y += 0.02;
        await moveTo(o, heldTarget(at), new THREE.Quaternion(), 0.8, 0.45);
        o.visible = false;
        held = null;
        hint();
        sfx.drawer();
        busy = false;
        void complete('snacks');
        return;
      }
      if (item === 'stamp' && (id === 'ink' || id === 'invoice')) {
        const at = new THREE.Vector3();
        obj(id).getWorldPosition(at);
        at.y += 0.06;
        const o = obj('stamp');
        if (id === 'invoice' && !isDone('ink')) {
          return nope(S.toasts.noInk);
        }
        if (id === 'invoice' && isDone('stamp')) return nope();
        return useHeldAt(at, new THREE.Euler(0, 0, 0), async () => {
          const y0 = o.position.y;
          await tween(0.12, (k) => (o.position.y = y0 - 0.04 * k));
          sfx.stampThud();
          if (id === 'invoice') part('invoiceStamp').visible = true;
          await tween(0.15, (k) => (o.position.y = y0 - 0.04 * (1 - k)));
          if (id === 'ink') {
            toast(S.toasts.inked);
            void complete('ink');
          } else void complete('stamp');
        });
      }
      if ((item === 'invoice' || item === 'taxform') && id.startsWith('cab')) {
        if (!isDone('cabinetJam')) {
          return nope(S.toasts.stuck);
        }
        if (item === 'invoice' && !isDone('stamp')) {
          return nope(S.toasts.stampFirst);
        }
        const want = item === 'invoice' ? 'cab1' : 'cab2';
        if (id !== want) {
          return nope(S.toasts.wrongDrawer);
        }
        return fileHeld(id, item === 'invoice' ? 'fileInvoice' : 'tax');
      }
      if (item === 'card' && id === 'intray') {
        const o = obj('card');
        busy = true;
        const at = new THREE.Vector3();
        obj('intray').getWorldPosition(at);
        at.y += 0.05;
        await moveTo(o, heldTarget(at), new THREE.Quaternion(), 0.9, 0.5);
        o.visible = false;
        held = null;
        hint();
        part('trayCard').visible = true;
        sfx.flip();
        toast(S.toasts.dave);
        busy = false;
        void complete('dave');
        return;
      }
      if (item === 'menu' && id === 'board') {
        const o = obj('menu');
        busy = true;
        held = null;
        hint();
        scene.attach(o);
        await moveTo(o, MENU_PINNED.pos, MENU_PINNED.quat, 1, 0.6);
        sfx.chunk();
        busy = false;
        void complete('menu');
        return;
      }
      return nope();
    }

    if (ITEMS.has(id)) return pickUp(id);
    if (id === 'key') return pickUp('key');
    if (id === 'card' && notes.get('dave')!.shown && !isDone('dave')) return pickUp('card');

    switch (id) {
      case 'monitor':
        return enterZoom();
      case 'power': {
        if (!os.power()) {
          toast(S.toasts.already);
          return;
        }
        powerLook();
        void tween(1.2, (k) => (world.monitorLight.intensity = 0.35 * k));
        void complete('power');
        return;
      }
      case 'mug': {
        if (isDone('coffee') && happen('@mug', S.toasts.mugLook)) return;
        busy = true;
        const o = obj('mug');
        remember(o);
        glow(o, false);
        shadows(o, false);
        camera.attach(o);
        await moveTo(o, new THREE.Vector3(0.02, -0.035, -0.21), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.1, 0)), 1, 0.3);
        await moveTo(o, new THREE.Vector3(0.0, -0.068, -0.105), new THREE.Quaternion().setFromEuler(new THREE.Euler(2.0, 0, 0.08)), 1, 0.3);
        sfx.sip();
        await wait(0.5);
        await goHome(o, 0.45);
        shadows(o, true);
        busy = false;
        void complete('coffee');
        return;
      }
      case 'keyboard': {
        if (isDone('keyboard') && !events.has('@kb')) {
          busy = true;
          sfx.click();
          await keyboardUp(true);
          busy = false;
          happen('@kb', S.toasts.kbLift);
          return;
        }
        if (isDone('keyboard')) {
          sfx.click();
          toast(S.toasts.keyboard);
          return;
        }
        busy = true;
        const k0 = world.keyboard.rotation.y;
        sfx.click();
        await tween(0.35, (v) => (world.keyboard.rotation.y = k0 * (1 - v)), easeOut);
        busy = false;
        void complete('keyboard');
        return;
      }
      case 'notepad': {
        if (isDone('todo')) return toast(S.toasts.already);
        if (!isDone('pen')) {
          sfx.nope();
          return toast(S.toasts.needPen);
        }
        busy = true;
        for (const line of world.todoLines) {
          line.visible = true;
          line.scale.x = 0.001;
          sfx.scribble();
          await tween(0.28, (v) => (line.scale.x = Math.max(0.001, v)), linear);
        }
        busy = false;
        void complete('todo');
        return;
      }
      case 'plant':
        sfx.click();
        if (!isDone('gerald')) {
          toast(`${S.toasts.plantLabel} · ${S.toasts.gerald}`);
          void wobble(obj('plant'), 0.08);
          void complete('gerald');
        } else if (!events.has('@pot')) {
          busy = true;
          await potAside(true);
          busy = false;
          happen('@pot', S.toasts.potLift);
        } else toast(S.toasts.plantLabel);
        return;
      case 'phone':
        return phoneAction();
      case 'lamp':
        if (lampOn) return toast(S.toasts.lampOff);
        sfx.click();
        return toast(G.lampWhere);
      case 'lamp-on': {
        if (lampOn) return toast(S.toasts.lampOff);
        lampOn = true;
        sfx.lamp();
        lampLook();
        void tween(0.25, (k) => (world.lampLight.intensity = 1.6 * k));
        void complete('lamp');
        return;
      }
      case 'window': {
        if (!windowOpen) return toast(S.toasts.already);
        windowOpen = false;
        busy = true;
        const h = world.windowPane;
        const r0 = h.rotation.y;
        await tween(0.6, (k) => (h.rotation.y = r0 * (1 - k)), easeInOut);
        sfx.chunk();
        busy = false;
        void complete('window');
        return;
      }
      case 'mouse': {
        if (isDone('mouse')) return sfx.click();
        busy = true;
        const o = obj('mouse');
        const y0 = o.position.y;
        sfx.click();
        await tween(0.45, (k) => {
          o.rotation.z = Math.PI * (1 - k);
          o.position.y = y0 + Math.sin(k * Math.PI) * 0.05;
        });
        busy = false;
        void complete('mouse');
        return;
      }
      case 'clock': {
        if (isDone('clock')) return toast(S.toasts.clock);
        busy = true;
        const from = clockShows;
        const to = realMinutes() + 720;
        sfx.whirr();
        await tween(0.8, (k) => setClock(parts, from + (to - from) * k));
        clockShows = to;
        busy = false;
        void complete('clock');
        return;
      }
      case 'picture': {
        if (isDone('picture') && !events.has('@pic')) {
          busy = true;
          sfx.click();
          await pictureAside(true);
          busy = false;
          happen('@pic', S.toasts.picLift);
          return;
        }
        if (isDone('picture')) return toast(S.toasts.picture);
        busy = true;
        const o = obj('picture');
        const r0 = o.rotation.z;
        sfx.click();
        await tween(0.5, (k) => (o.rotation.z = r0 * (1 - k) + Math.sin(k * Math.PI * 3) * 0.03 * (1 - k)), easeOut);
        busy = false;
        void complete('picture');
        return;
      }
      case 'calendar': {
        if (isDone('calendar')) return sfx.flip();
        busy = true;
        // Three pages torn off
        for (let i = calFlips; i < 3; i++) {
          sfx.rip();
          dropPage((month + 9 + i) % 12, i, false);
          setCalendar((month + 10 + i) % 12);
          part('calendarStub').visible = true;
          await wait(0.35);
        }
        calFlips = 3;
        busy = false;
        void complete('calendar');
        return;
      }
      case 'duck':
        sfx.squeak();
        toast(S.toasts.duck);
        void wobble(obj('duck'), 0.3);
        void complete('duck');
        return;
      case 'ball': {
        const o = obj('ball');
        sfx.squish();
        toast(S.toasts.ball);
        await tween(0.35, (k) => {
          const s = Math.sin(k * Math.PI);
          o.scale.set(1 + 0.3 * s, 1 - 0.45 * s, 1 + 0.3 * s);
        });
        void complete('ball');
        return;
      }
      case 'globe': {
        const o = obj('globe');
        const x0 = o.position.x;
        sfx.jingle();
        toast(S.toasts.globe);
        const flakes = part('snow').children;
        flakes.forEach((f) => {
          f.position.y = 0.02 + Math.random() * 0.02;
          f.position.x = (Math.random() - 0.5) * 0.06;
          f.position.z = (Math.random() - 0.5) * 0.06;
        });
        void tween(0.5, (k) => (o.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.012 * (1 - k)), linear);
        const starts = flakes.map((f) => f.position.y);
        void tween(
          3,
          (k) =>
            flakes.forEach((f, i) => {
              f.position.y = starts[i] + (-0.035 - starts[i]) * k;
              f.position.x += Math.sin(k * 20 + i) * 0.0002;
            }),
          linear,
        );
        void complete('globe');
        return;
      }
      case 'radio':
        if (isDone('radio')) {
          sfx.click();
          if (radio.on) {
            radioOff();
            toast(S.toasts.radioAgain);
          } else if (epicOn) {
            radio.start();
            radioLed(true);
          }
          return;
        }
        sfx.click();
        radioOff();
        toast(S.toasts.radioOff);
        void complete('radio');
        return;
      case 'tissues':
        if (isDone('ring')) return sfx.click();
        obj('tissue').visible = true;
        obj('tissue').position.set(-0.74, 0.86, -0.17);
        return pickUp('tissue');
      case 'cables': {
        if (isDone('cables')) return sfx.click();
        busy = true;
        const knot = part('knot');
        sfx.wipe();
        await tween(0.6, (k) => {
          knot.rotation.y = k * 8;
          knot.scale.setScalar(1 - 0.9 * k);
        });
        knot.visible = false;
        const coil = part('coil');
        coil.visible = true;
        coil.scale.setScalar(0.01);
        await tween(0.3, (k) => coil.scale.setScalar(Math.max(0.01, k)), back);
        busy = false;
        void complete('cables');
        return;
      }
      case 'printer':
        if (!isDone('paper')) return toast(S.toasts.noPaper);
        if (printing) return toast(S.toasts.printing);
        if (isDone('print') && !isDone('fetch')) {
          busy = true;
          const p = obj('printout');
          sfx.flip();
          const from = p.position.clone();
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, PRINTOUT_DESK.rotY, 0));
          const q0 = p.quaternion.clone();
          await tween(0.9, (k) => {
            p.position.lerpVectors(from, PRINTOUT_DESK.pos, k);
            p.position.y += Math.sin(k * Math.PI) * 0.25;
            p.quaternion.slerpQuaternions(q0, q, k);
          });
          busy = false;
          void complete('fetch');
          return;
        }
        if (!isDone('print')) return toast(S.toasts.nothingPrinted);
        return sfx.click();
      case 'printout':
        if (isDone('print') && !isDone('fetch')) return use('printer');
        return sfx.click();
      case 'bin':
        if (happen('@bin', S.toasts.binDig)) sfx.crumple();
        else sfx.click();
        return;
      case 'drawer0':
        if (drawerOut[0] || events.has('@unlock0')) return sfx.click();
        return openLock();
      case 'drawer1':
        if (drawerOpen[1] || events.has('@unlock1')) return sfx.click();
        sfx.nope();
        return toast(S.toasts.locked);
      case 'drawer2':
        if (drawerOut[2]) return sfx.click();
        await openDrawer(2);
        happen('@drawer2');
        return;
      case 'ink':
        return sfx.click();
      case 'cookie': {
        const o = obj('cookie');
        busy = true;
        sfx.crunch();
        await tween(0.5, (k) => o.scale.setScalar(Math.max(0.01, 1 - k)));
        o.visible = false;
        toast(S.toasts.cookie);
        busy = false;
        void complete('cookie');
        return;
      }
      case 'cab0':
      case 'cab1':
      case 'cab2':
        if (!isDone('cabinetJam')) {
          sfx.bang();
          shake(0.03);
          toast(S.toasts.kick);
          void complete('cabinetJam');
          return;
        }
        sfx.drawer();
        void slideCab(id);
        return;
      case 'photo': {
        if (isDone('photo')) return sfx.click();
        const o = obj('photo');
        busy = true;
        sfx.flip();
        await tween(0.5, (k) => (o.rotation.z = Math.PI * (1 - k)), back);
        busy = false;
        void complete('photo');
        return;
      }
      case 'board':
        return;
      default:
        break;
    }

    if (id.startsWith('pen-old')) {
      const i = Number(id.slice(3));
      if (isDone('pen')) {
        if (i === workingPen) return pickUp(id);
        sfx.click();
        return toast(S.toasts.dry);
      }
      const pen = world.pens[i];
      busy = true;
      remember(pen);
      glow(pen, false);
      const home = homes.get(pen)!;
      const up = home.pos.clone().add(new THREE.Vector3(0, 0.1, 0));
      await moveTo(pen, up, home.quat, 1, 0.2);
      const pad = new THREE.Vector3(-0.3, 0.86, -0.25);
      await moveTo(pen, pad, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0.4)), 1, 0.3);
      sfx.scribble();
      const p0 = pen.position.clone();
      await tween(0.45, (k) => (pen.position.x = p0.x + Math.sin(k * Math.PI * 5) * 0.025), linear);
      if (i === workingPen) {
        world.scribble.visible = true;
        void tween(0.3, (k) => (world.scribble.scale.x = Math.max(0.001, k)));
        await goHome(pen, 0.3);
        busy = false;
        void complete('pen');
      } else {
        pensTried.add(i);
        toast(S.toasts.dry);
        await goHome(pen, 0.3);
        busy = false;
      }
      return;
    }

    if (id === 'report' || id === 'bin' || id === 'receipts' || id === 'card' || id === 'ring') sfx.click();
  }

  /* ---- layer 3 and 4 helpers ------------------------------------------------------------------ */

  /** Opened at least once (unlocked) / pulled out right now (only one at a time: open drawers would hide each other). */
  const drawerOpen = [false, false, false];
  const drawerOut = [false, false, false];
  const DRAWER_Z = -0.155;
  async function openDrawer(i: number, quick = false) {
    if (drawerOut[i]) return;
    drawerOpen[i] = true;
    drawerOut[i] = true;
    for (let j = 0; j < 3; j++) {
      if (j === i || !drawerOut[j]) continue;
      drawerOut[j] = false;
      const dj = obj(`drawer${j}`);
      const zj = dj.position.z;
      void tween(0.35, (k) => (dj.position.z = zj + (DRAWER_Z - zj) * k), easeOut);
    }
    const d = obj(`drawer${i}`);
    sfx.drawer();
    const z0 = d.position.z;
    await tween(quick ? 0.3 : 0.55, (k) => (d.position.z = z0 + (DRAWER_Z + 0.32 - z0) * k), easeOut);
  }

  /** Where the cabinet drawers rest when shut (always this, so clicking fast can't make them creep forward). */
  const CAB_Z = -0.994;
  const CAB_OUT = 0.3;
  const sliding = new Set<string>();
  async function slideCab(id: string) {
    if (sliding.has(id) || cabOut === id) return;
    sliding.add(id);
    const d = obj(id);
    const z0 = d.position.z;
    await tween(0.25, (k) => (d.position.z = z0 + (CAB_Z + 0.12 - z0) * k), easeOut);
    await wait(0.15);
    await tween(0.25, (k) => (d.position.z = CAB_Z + 0.12 * (1 - k)));
    sliding.delete(id);
  }
  /** Shuts the cabinet drawer that is out (only one at a time). */
  function shutCab(except?: string) {
    if (!cabOut || cabOut === except) return;
    const d = obj(cabOut);
    const zs = d.position.z;
    cabOut = null;
    sfx.drawer();
    void tween(0.3, (k) => (d.position.z = zs + (CAB_Z - zs) * k), easeOut);
  }

  /** The held paper goes into a cabinet drawer. */
  async function fileHeld(drawerId: string, note: string) {
    const o = obj(held!);
    const d = obj(drawerId);
    busy = true;
    sfx.drawer();
    shutCab(drawerId);
    const z0 = CAB_Z;
    const zs = d.position.z;
    await tween(0.3, (k) => (d.position.z = zs + (z0 + 0.2 - zs) * k), easeOut);
    const at = new THREE.Vector3();
    d.getWorldPosition(at);
    at.y += 0.12;
    await moveTo(o, heldTarget(at), new THREE.Quaternion(), 0.8, 0.45);
    o.visible = false;
    held = null;
    hint();
    await tween(0.3, (k) => (d.position.z = z0 + 0.2 * (1 - k)));
    if (cabOut === drawerId) cabOut = null;
    sfx.chunk();
    busy = false;
    void complete(note);
  }

  async function keyboardUp(animate: boolean) {
    const k = world.keyboard;
    const dur = animate ? 0.45 : 0;
    const y0 = k.position.y;
    if (!dur) {
      k.rotation.x = -0.55;
      k.position.set(k.position.x, 0.79, -0.47);
      return;
    }
    await tween(dur, (v) => {
      k.rotation.x = -0.55 * v;
      k.position.y = y0 + (0.79 - y0) * v;
      k.position.z = -0.42 - 0.05 * v;
    }, back);
  }

  /** Gerald moves aside: the key (and a note) were under him. */
  const POT_SHIFT = new THREE.Vector3(-0.1, 0, 0.13);
  async function potAside(animate: boolean) {
    const pot = obj('plant');
    const from = pot.position.clone();
    const to = from.clone().add(POT_SHIFT);
    const keyNote = notes.get('key')!;
    const n0 = keyNote.mesh.position.clone();
    if (!animate) {
      pot.position.copy(to);
      if (!keyNote.done) keyNote.mesh.position.add(POT_SHIFT);
    } else {
      sfx.pick();
      await tween(0.6, (k) => {
        pot.position.lerpVectors(from, to, k);
        pot.position.y = from.y + Math.sin(k * Math.PI) * 0.08;
        if (!keyNote.done && keyNote.mesh.parent === scene) keyNote.mesh.position.copy(n0).addScaledVector(POT_SHIFT, k);
      });
    }
    if (!isDone('middle')) obj('key').visible = true;
  }

  async function pictureAside(animate: boolean) {
    const p = obj('picture');
    const x0 = p.position.x;
    if (!animate) {
      p.position.x = x0 + 0.36;
      p.rotation.z = -0.12;
      return;
    }
    await tween(0.6, (k) => {
      p.position.x = x0 + 0.36 * k;
      p.rotation.z = -0.12 * k;
    }, back);
  }

  /** The middle drawer opened: the phone rings, a note with a countdown. */
  let callbackT = -1;
  let callbackShown = -2;
  function startCallback() {
    if (!happen('@callback')) return;
    callbackT = CALLBACK_SECS;
    shake(0.02);
    sfx.ring();
  }

  /** Redraws the call-back note with the seconds left. */
  function callbackText() {
    const n = notes.get('callback')!;
    const s = Math.max(0, Math.ceil(callbackT));
    if (s === callbackShown) return;
    callbackShown = s;
    const text = callbackT > 0 ? S.notes.callback.replace('{s}', String(s)) : S.notes.callbackLate;
    const m = n.mesh.material as THREE.MeshLambertMaterial;
    m.map?.dispose();
    const tex = noteTexture(text, n.def.color, aniso);
    m.map = tex;
    m.emissiveMap = tex;
    m.needsUpdate = true;
  }

  /* ---- the combination lock (top drawer) ---- */

  const lockEl = $('[data-mn-lock]');
  const digits = [0, 0, 0, 0];
  function drawLock() {
    lockEl.querySelectorAll<HTMLElement>('[data-mn-digit]').forEach((el, i) => (el.textContent = String(digits[i])));
  }
  let lockFrom: Mode = 'free';
  function openLock() {
    lockFrom = mode === 'focus' ? 'focus' : 'free';
    mode = 'lock';
    lockEl.hidden = false;
    drawLock();
    lockEl.querySelector<HTMLButtonElement>('[data-mn-up]')?.focus();
  }
  function closeLock() {
    lockEl.hidden = true;
    if (mode === 'lock') mode = lockFrom;
  }
  async function tryLock() {
    if (digits.join('') === code) {
      sfx.unlatch();
      closeLock();
      toast(S.toasts.unlocked);
      happen('@unlock0');
      return;
    }
    sfx.error();
    toast(S.lock.wrong);
    lockEl.classList.remove('is-wrong');
    void lockEl.offsetWidth;
    lockEl.classList.add('is-wrong');
  }

  /** Somebody to talk to? (The handset gesture only starts if so.) */
  const phoneBusy = () => (notes.get('callback')!.shown && !isDone('callback')) || (ringing > 0 && !isDone('phone')) || CALLS.some(([note]) => !isDone(note));

  /** Answer or call: whoever is first in line. */
  async function phoneAction() {
    if (notes.get('callback')!.shown && !isDone('callback')) {
      const late = callbackT <= 0;
      callbackT = -1;
      await phoneCall(late ? S.toasts.callbackLate : S.toasts.callbackOk);
      void complete('callback');
      return;
    }
    if (ringing && !isDone('phone')) {
      ringing = 0;
      await phoneCall(null);
      void complete('phone');
      return;
    }
    const call = CALLS.find(([note]) => !isDone(note));
    if (!call) {
      sfx.click();
      toast(S.toasts.noCall);
      return;
    }
    await phoneCall(S.toasts[call[1]]);
    void complete(call[0]);
    if (call[0] === 'callIt') os.addSurvey();
  }

  /* ---- gestures (Update 1, phase B) ------------------------------------------------------------ */

  interface Gesture {
    icon: string;
    text: string;
    /** Where the guide sits. */
    at: THREE.Object3D;
    /** Progress bar: 0–1, a green zone, or a marker (spirit level). */
    bar?: () => { value: number; zone?: [number, number]; marker?: boolean };
    move?(dx: number, dy: number, x: number, y: number): void;
    tick?(dt: number): void;
    end?(): void | Promise<void>;
    /** Pressing and holding is the game (no tap hint). */
    hold?: boolean;
    /** The action happens above the thing: the guide goes below it. */
    below?: boolean;
    /** The note this game is for, and a tip after three tries that went nowhere. */
    note?: string;
    tip?: string;
  }

  const G = S.gestures;
  const guideEl = $('[data-mn-guide]');
  const gIcon = guideEl.querySelector<HTMLElement>('[data-g-icon]')!;
  const gText = guideEl.querySelector<HTMLElement>('[data-g-text]')!;
  const gBar = guideEl.querySelector<HTMLElement>('[data-g-bar]')!;
  const gZone = guideEl.querySelector<HTMLElement>('[data-g-zone]')!;
  const gFill = guideEl.querySelector<HTMLElement>('[data-g-fill]')!;
  let guideOf: Gesture | null = null;
  let guideTimer = 0;
  const gTmp = new THREE.Vector3();

  function showGuide(g: Gesture) {
    guideOf = g;
    clearTimeout(guideTimer);
    gIcon.textContent = g.icon;
    gText.textContent = g.text;
    guideEl.classList.toggle('is-below', !!g.below);
    guideEl.hidden = false;
    drawGuide();
  }
  function hideGuide(after = 0) {
    clearTimeout(guideTimer);
    const off = () => {
      guideEl.hidden = true;
      guideOf = null;
    };
    if (after) guideTimer = window.setTimeout(off, after);
    else off();
  }
  /** Follows the thing on screen; updates the bar. */
  function drawGuide() {
    const g = guideOf;
    if (!g || guideEl.hidden) return;
    // Up close the thing fills the view: the guide waits at the top instead of covering it
    const dock = !!focusId && (mode === 'focus' || (mode === 'gesture' && gestFrom === 'focus'));
    guideEl.classList.toggle('is-dock', dock);
    if (dock) {
      guideEl.style.left = `${window.innerWidth / 2}px`;
      guideEl.style.top = `${window.innerWidth < 560 ? 104 : 70}px`;
    } else {
      g.at.getWorldPosition(gTmp).project(camera);
      guideEl.style.left = `${Math.max(140, Math.min(window.innerWidth - 140, ((gTmp.x + 1) / 2) * window.innerWidth))}px`;
      guideEl.style.top = `${Math.max(90, ((1 - gTmp.y) / 2) * window.innerHeight)}px`;
    }
    gText.textContent = g.text;
    const b = g.bar?.();
    gBar.hidden = !b;
    if (!b) return;
    gBar.classList.toggle('is-marker', !!b.marker);
    gFill.style.width = b.marker ? '' : `${Math.round(Math.max(0, Math.min(1, b.value)) * 100)}%`;
    gFill.style.left = b.marker ? `${Math.max(0, Math.min(1, b.value)) * 100}%` : '0';
    gZone.style.left = b.zone ? `${b.zone[0] * 100}%` : '0';
    gZone.style.width = b.zone ? `${(b.zone[1] - b.zone[0]) * 100}%` : '0';
  }

  const H = () => window.innerHeight;
  const clamp = THREE.MathUtils.clamp;
  const screenOf = (o: THREE.Object3D) => {
    o.getWorldPosition(gTmp).project(camera);
    return { x: ((gTmp.x + 1) / 2) * window.innerWidth, y: ((1 - gTmp.y) / 2) * window.innerHeight };
  };
  /** Angle change of the pointer around a point on screen (for turning things). */
  function turner(at: THREE.Object3D) {
    let last: number | null = null;
    return (x: number, y: number) => {
      const c = screenOf(at);
      const a = Math.atan2(y - c.y, x - c.x);
      if (last === null) {
        last = a;
        return 0;
      }
      let d = a - last;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      last = a;
      return d;
    };
  }
  const hhmm = (m: number) => {
    const t = ((Math.round(m) % 1440) + 1440) % 1440;
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
  };

  let calFlips = 0;
  /** Looking up a little while drinking (added to the pitch). */
  let headTiltWant = 0;
  let windowShut = false;
  let squeezes = 0;
  let waterLevel = 0;
  let drunk = 0;

  /** The game for what was pressed (null = an ordinary click). */
  function gestureFor(id: string): (() => Gesture) | null {
    // Drawers open whatever you hold (the stamp is in the top one, its ink pad in the bottom one)
    if (id === 'drawer0' && events.has('@unlock0')) return () => drawerGesture(0);
    if (id === 'drawer1' && events.has('@unlock1')) return () => drawerGesture(1);
    if (id === 'drawer2' && held !== 'snacks') return () => drawerGesture(2);
    if (held === 'tissue' && id === 'ring' && !isDone('ring')) return () => rubGesture();
    if (held === 'bottle' && id === 'plant' && !isDone('plant')) return () => pourGesture();
    if (held?.startsWith('pen')) {
      if (id === 'notepad' && !(isDone('pen') && isDone('todo'))) return () => drawGesture('pad', held!);
      if (id === 'report' && !isDone('signReport')) return () => drawGesture('report', held!);
      if (id === 'card' && !isDone('card')) return () => drawGesture('card', held!);
      return null;
    }
    if (held === 'stamp') {
      if (id === 'ink' && !isDone('ink'))
        return () => pressGesture(
          'stamp',
          'ink',
          G.stampPress,
          () => {
            toast(S.toasts.inked);
            void complete('ink');
          },
          true,
        );
      if (id === 'invoice' && isDone('ink') && !isDone('stamp')) return () => pressGesture('stamp', 'invoice', G.stampPress, () => {
        part('invoiceStamp').visible = true;
        void complete('stamp');
      });
      return null;
    }
    if (/^cab\d$/.test(id)) {
      // Stuck: kick it first
      if (!isDone('cabinetJam')) return () => kickGesture(id);
      if (held === 'invoice' || held === 'taxform') {
        const want = held === 'invoice' ? 'cab1' : 'cab2';
        // Wrong drawer or not stamped yet: an ordinary click says why
        if (id !== want || (held === 'invoice' && !isDone('stamp'))) return null;
        return () => fileGesture(id, held === 'invoice' ? 'fileInvoice' : 'tax');
      }
      if (!held) return () => cabGesture(id);
      return null;
    }
    if (held === 'menu' && id === 'board' && !isDone('menu')) return () => pinGesture();
    if (held === 'ream' && id === 'printer' && !isDone('paper')) return () => trayGesture();
    if (held === 'stapler') {
      const note = id === 'report' ? 'staple' : id === 'receipts' ? 'receipts' : id === 'printout' ? 'stapleOut' : null;
      if (note && !isDone(note) && (id !== 'printout' || isDone('fetch'))) return () => stapleGesture(id, note);
      return null;
    }
    if (held) return null;
    switch (id) {
      case 'calendar':
        return isDone('calendar') ? null : () => calendarGesture();
      case 'picture':
        return isDone('picture') ? null : () => pictureGesture();
      case 'clock':
        return isDone('clock') ? null : () => clockGesture();
      case 'keyboard':
        return isDone('keyboard') ? null : () => keyboardGesture();
      case 'window':
        return isDone('window') ? null : () => windowGesture();
      case 'mouse':
        return isDone('mouse') ? null : () => mouseGesture();
      case 'globe':
        return () => shakeGesture();
      case 'ball':
        return () => squeezeGesture();
      case 'mug':
        return isDone('coffee') ? null : () => drinkGesture();
      case 'cables':
        return isDone('cables') ? null : () => cablesGesture();
      case 'phone':
        return phoneBusy() ? () => phoneGesture() : null;
      case 'drawer0':
        return events.has('@unlock0') ? () => drawerGesture(0) : null;
      case 'drawer1':
        return events.has('@unlock1') ? () => drawerGesture(1) : null;
      case 'drawer2':
        return () => drawerGesture(2);
      case 'printer':
        return events.has('@trayIn') && !isDone('paper') ? () => trayGesture() : null;
      case 'photo':
        return isDone('photo') ? null : () => photoGesture();
      case 'radio':
        return !isDone('radio') && radio.on ? () => knobGesture() : null;
      case 'lampSwitch':
        return lampOn ? null : () => switchGesture();
      default:
        return null;
    }
  }

  /* ---- phase C games ---- */

  /** A surface that takes ink (a canvas texture on a plane): the pad, the report's line, the card. */
  interface Ink {
    mesh: THREE.Mesh;
    g: CanvasRenderingContext2D;
    tex: THREE.CanvasTexture;
    mw: number;
    mh: number;
    last: THREE.Vector2 | null;
  }
  function makeInk(parent: THREE.Object3D, mw: number, mh: number, pos: [number, number, number], rot: [number, number, number], base?: (g: CanvasRenderingContext2D, w: number, h: number) => void): Ink {
    const w = Math.round(mw * 2400);
    const h = Math.round(mh * 2400);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    base?.(g, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    parent.add(mesh);
    return { mesh, g, tex, mw, mh, last: null };
  }
  const inks = {
    pad: makeInk(obj('notepad'), 0.14, 0.19, [0, 0.0056, 0], [-Math.PI / 2, 0, 0]),
    report: makeInk(obj('report'), 0.17, 0.07, [0, 0.0163, 0.095], [-Math.PI / 2, 0, 0], (g, w, h) => {
      g.fillStyle = '#8d8a82';
      g.font = `${Math.round(h * 0.22)}px Arial, sans-serif`;
      g.fillText('Signature:', w * 0.04, h * 0.45);
      g.fillRect(w * 0.04, h * 0.78, w * 0.9, 3);
    }),
    card: makeInk(part('cardFront'), 0.09, 0.045, [0, -0.038, 0.0013], [0, 0, 0]),
  };
  // On the report's title page (drawn sharp) the ink and the signature are drawn sharp as well
  look.sharp(inks.report.mesh);
  look.sharp(part('reportSign'));
  /** A stroke from the last point to uv; returns its length in metres. */
  function inkTo(ink: Ink, uv: THREE.Vector2) {
    const c = ink.g.canvas;
    const x = uv.x * c.width;
    const y = (1 - uv.y) * c.height;
    let len = 0;
    if (ink.last) {
      const lx = ink.last.x * c.width;
      const ly = (1 - ink.last.y) * c.height;
      ink.g.strokeStyle = '#1f3b78';
      ink.g.lineWidth = Math.max(2, c.width / 90);
      ink.g.lineCap = 'round';
      ink.g.beginPath();
      ink.g.moveTo(lx, ly);
      ink.g.lineTo(x, y);
      ink.g.stroke();
      ink.tex.needsUpdate = true;
      len = Math.hypot((uv.x - ink.last.x) * ink.mw, (uv.y - ink.last.y) * ink.mh);
    }
    ink.last = uv.clone();
    return len;
  }
  const rayTo = (x: number, y: number) => {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray;
  };

  /** Pens: scribble on the pad (only one pen writes), write the to-do list, sign the report or Dave's card. */
  function drawGesture(kind: 'pad' | 'report' | 'card', penId: string): Gesture {
    const ink = inks[kind];
    const pen = obj(penId);
    const working = penId === `pen${workingPen}`;
    const NEED = { pen: 0.1, todo: 0.65, signReport: 0.14, card: 0.09 };
    let note: keyof typeof NEED = kind === 'report' ? 'signReport' : kind === 'card' ? 'card' : isDone('pen') ? 'todo' : 'pen';
    let inked = 0;
    let moved = 0;
    let told = false;
    let noise = 0;
    ink.last = null;
    const text = () => (kind === 'pad' ? (note === 'pen' ? G.scribble : G.write) : G.sign);
    const g: Gesture = {
      icon: '✎',
      text: text(),
      at: kind === 'card' ? obj('card') : obj(kind === 'pad' ? 'notepad' : 'report'),
      note,
      tip: S.gestures.tips.pen,
      bar: () => ({ value: working ? inked / NEED[note] : 0 }),
      move(dx, dy, x, y) {
        const hit = rayTo(x, y).intersectObject(ink.mesh, false)[0];
        if (!hit?.uv) {
          ink.last = null;
          return;
        }
        // The pen's tip follows the pointer on the paper
        const tipAt = hit.point.clone().add(new THREE.Vector3(0, 0.075, 0.02));
        pen.position.copy(heldTarget(tipAt));
        pen.quaternion.setFromEuler(new THREE.Euler(0.35, 0, 0.3));
        moved += Math.abs(dx) + Math.abs(dy);
        noise += Math.abs(dx) + Math.abs(dy);
        if (noise > 0.12 * H()) {
          noise = 0;
          sfx.scribble();
        }
        if (!working) {
          if (!told && moved > 0.4 * H()) {
            told = true;
            pensTried.add(Number(penId.slice(3)));
            toast(S.toasts.dry);
          }
          return;
        }
        inked += inkTo(ink, hit.uv);
        if (inked < NEED[note] || isDone(note)) return;
        void complete(note);
        // A pen that signs has been found to work
        if (note !== 'pen' && !isDone('pen')) void complete('pen');
        if (note === 'pen') {
          note = 'todo';
          inked = 0;
          g.note = note;
          g.text = text();
        }
      },
      async end() {
        ink.last = null;
        await moveTo(pen, HOLD_POS, holdQuat(pen), 1, 0.25);
      },
    };
    return g;
  }

  /** Pressing something held down onto a thing (the stamp). */
  function pressGesture(itemId: string, targetId: string, text: string, onPress: () => void, keep = false): Gesture {
    const it = obj(itemId);
    const at = new THREE.Vector3();
    obj(targetId).getWorldPosition(at);
    at.y += 0.07;
    void moveTo(it, heldTarget(at), new THREE.Quaternion(), 1, 0.25);
    const base = heldTarget(at);
    let press = 0;
    let done = false;
    return {
      icon: '⤓',
      text,
      at: obj(targetId),
      bar: () => ({ value: press }),
      move(_dx, dy) {
        if (done) return;
        press = clamp(press + dy / (0.15 * H()), 0, 1);
        const down = heldTarget(at.clone().add(new THREE.Vector3(0, -0.045 * press, 0)));
        it.position.copy(down);
        if (press < 1) return;
        done = true;
        sfx.stampThud();
        onPress();
      },
      async end() {
        await moveTo(it, done && !keep ? base : HOLD_POS, done && !keep ? it.quaternion.clone() : holdQuat(it), 1, 0.2);
        if (done && !keep) await putBack();
      },
    };
  }

  /** Is the bin on screen (then a drag with rubbish in hand is a throw)? */
  function binOnScreen() {
    const v = world.bin.top.clone().project(camera);
    return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
  }

  /** Rubbish: flick it towards the bin. Where your finger would have gone is where it lands. */
  function throwGesture(item: string): Gesture {
    const o = obj(item);
    const samples: { t: number; x: number; y: number }[] = [];
    let last = { x: 0, y: 0 };
    return {
      icon: '➶',
      text: G.throw,
      at: o,
      note: item,
      tip: (S.gestures.tips as Record<string, string>)[item],
      move(_dx, _dy, x, y) {
        const t = performance.now();
        samples.push({ t, x, y });
        while (samples.length > 2 && t - samples[0].t > 140) samples.shift();
        last = { x, y };
      },
      async end() {
        if (samples.length < 2) return;
        const a = samples[0];
        const b = samples[samples.length - 1];
        const dt = Math.max(0.016, (b.t - a.t) / 1000);
        const vx = (b.x - a.x) / dt;
        const vy = (b.y - a.y) / dt;
        if (Math.hypot(vx, vy) < 250) return;
        // Where would the finger be a moment later? That point, down on the bin's rim height
        const r = rayTo(last.x + vx * 0.12, last.y + vy * 0.12).ray;
        const RIM = world.bin.top.y;
        let land: THREE.Vector3;
        if (r.direction.y < -0.01) land = r.origin.clone().addScaledVector(r.direction, (RIM - r.origin.y) / r.direction.y);
        else land = r.origin.clone().addScaledVector(r.direction, 3);
        land.x = clamp(land.x, -1.45, 1.65);
        land.z = clamp(land.z, -1.35, 0.9);
        // Anything over the bin's rim (0.17) counts, with a little to spare
        const inBin = Math.hypot(land.x - world.bin.top.x, land.z - world.bin.top.z) < world.bin.radius + 0.07;
        busy = true;
        held = null;
        hint();
        scene.attach(o);
        const from = o.position.clone();
        // A miss hits the bin's rim on the side it was aimed at (too far, too short, beside it)
        const bin = world.bin.top;
        const off = new THREE.Vector3(land.x - bin.x, 0, land.z - bin.z);
        if (off.lengthSq() < 1e-6) off.set(1, 0, 0);
        off.normalize();
        const end = inBin ? bin.clone() : new THREE.Vector3(bin.x + off.x * (world.bin.radius + 0.05), bin.y - 0.02, bin.z + off.z * (world.bin.radius + 0.05));
        const h = 0.25 + from.distanceTo(end) * 0.2;
        sfx.swish();
        const spin = Math.random() * 6 - 3;
        await tween(0.55 + from.distanceTo(end) * 0.15, (k) => {
          o.position.lerpVectors(from, end, k);
          o.position.y += 4 * h * k * (1 - k);
          o.rotation.x += 0.12;
          o.rotation.z = spin * k;
        }, linear);
        if (inBin) {
          await tween(0.15, (k) => (o.position.y = end.y - 0.25 * k));
          sfx.land();
          intoBin(o);
          toast(G.inBin);
          busy = false;
          void complete(item);
          return;
        }
        // Missed: it bounces off and comes to rest in front of the bin, on the side towards you,
        // where you can always see it and pick it up again (never behind the bin or under the desk)
        sfx.land();
        const toEye = new THREE.Vector3(eye.x - bin.x, 0, eye.z - bin.z).normalize();
        const rest = toEye.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35 + Math.random() * 0.6).multiplyScalar(0.27 + Math.random() * 0.06);
        const p1 = new THREE.Vector3(bin.x + rest.x, 0.02, bin.z + rest.z);
        const p0 = o.position.clone();
        const turn0 = o.rotation.y;
        const turn1 = Math.random() * 6;
        await tween(0.45, (k) => {
          o.position.lerpVectors(p0, p1, k);
          o.position.y = p0.y + (p1.y - p0.y) * k + Math.sin(k * Math.PI) * 0.08;
          o.rotation.set(o.rotation.x * (1 - k), turn0 + (turn1 - turn0) * k, o.rotation.z * (1 - k));
        }, linear);
        sfx.land();
        o.rotation.set(0, turn1, 0);
        o.position.copy(p1);
        homes.set(o, { parent: scene, pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.x });
        shadows(o, false);
        toast(G.missed);
        busy = false;
      },
    };
  }

  /** Filing: pull the right cabinet drawer open, then push the paper in. */
  let cabOut: string | null = null;
  function fileGesture(drawerId: string, note: string): Gesture {
    const d = obj(drawerId);
    const paper = obj(held!);
    shutCab(drawerId);
    const z0 = CAB_Z;
    let stage: 'open' | 'in' = cabOut === drawerId ? 'in' : 'open';
    let pull = stage === 'in' ? 1 : 0;
    let push = 0;
    const g: Gesture = {
      icon: '⤓',
      text: stage === 'in' ? G.fileIn : G.fileOpen,
      at: d,
      note,
      bar: () => ({ value: stage === 'open' ? pull : push }),
      move(_dx, dy) {
        if (stage === 'open') {
          pull = clamp(pull + dy / (0.3 * H()), 0, 1);
          d.position.z = z0 + CAB_OUT * pull;
          return;
        }
        push = clamp(push + dy / (0.25 * H()), 0, 1);
        const at = new THREE.Vector3();
        d.getWorldPosition(at);
        at.y += 0.2 - 0.18 * push;
        at.z -= 0.12;
        paper.position.copy(heldTarget(at));
        paper.quaternion.setFromEuler(new THREE.Euler(-0.2, 0, 0));
      },
      async end() {
        if (stage === 'open') {
          if (pull < 0.75) {
            const zs = d.position.z;
            await tween(0.25, (k) => (d.position.z = zs + (z0 - zs) * k));
            return;
          }
          sfx.drawer();
          await tween(0.15, (k) => (d.position.z = z0 + CAB_OUT * (pull + (1 - pull) * k)));
          stage = 'in';
          cabOut = drawerId;
          g.text = G.fileIn;
          const at = new THREE.Vector3();
          d.getWorldPosition(at);
          at.y += 0.2;
          at.z -= 0.12;
          await moveTo(paper, heldTarget(at), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)), 0.9, 0.3);
          showGuide(g);
          return;
        }
        if (push < 0.9) {
          // The drawer stays out; press it again to push the paper in
          push = 0;
          await moveTo(paper, HOLD_POS, holdQuat(paper), 1, 0.25);
          return;
        }
        cabOut = null;
        paper.visible = false;
        held = null;
        hint();
        const zs = d.position.z;
        await tween(0.3, (k) => (d.position.z = zs + (z0 - zs) * k));
        sfx.chunk();
        void complete(note);
      },
    };
    return g;
  }

  /** The stuck filing cabinet: a hard, fast swipe up is a kick. */
  function kickGesture(id: string): Gesture {
    const d = obj(id);
    let up = 0;
    let t0 = 0;
    let kicked = false;
    const g: Gesture = {
      icon: '⤒',
      text: G.kick,
      note: 'cabinetJam',
      at: d,
      bar: () => ({ value: up }),
      move(_dx, dy) {
        if (kicked) return;
        if (!t0) t0 = performance.now();
        up = clamp(up - dy / (0.3 * H()), 0, 1);
        if (up < 1) return;
        if (performance.now() - t0 > 450) {
          // Too slow: a push, not a kick
          g.text = G.kickHarder;
          sfx.click();
          up = 0;
          t0 = 0;
          return;
        }
        kicked = true;
        sfx.bang();
        shake(0.035);
        toast(S.toasts.kick);
        // All three drawers jump a little
        for (let i = 0; i < 3; i++) {
          const dr = obj(`cab${i}`);
          void tween(0.35, (k) => (dr.position.z = CAB_Z + Math.sin(k * Math.PI) * 0.03 * (1 - k * 0.5)), linear);
        }
        void complete('cabinetJam');
      },
      async end() {
        up = 0;
        t0 = 0;
      },
    };
    return g;
  }

  /** Cabinet drawers (once it works): pull one open to look in, push it shut again. */
  function cabGesture(id: string): Gesture {
    const d = obj(id);
    const shut = cabOut === id;
    if (!shut) shutCab(id);
    let pull = shut ? 1 : 0;
    return {
      icon: shut ? '⤒' : '⤓',
      text: shut ? G.drawerShut : G.drawer,
      at: d,
      bar: () => ({ value: pull }),
      move(_dx, dy) {
        pull = clamp(pull + dy / (0.3 * H()), 0, 1);
        d.position.z = CAB_Z + CAB_OUT * pull;
      },
      async end() {
        const open = pull > 0.6;
        const zs = d.position.z;
        if (open !== shut) sfx.drawer();
        cabOut = open ? id : cabOut === id ? null : cabOut;
        await tween(0.22, (k) => (d.position.z = zs + (CAB_Z + (open ? CAB_OUT : 0) - zs) * k), easeOut);
      },
    };
  }

  /** The lunch menu: drag it onto the cork board. */
  function pinGesture(): Gesture {
    const m = obj('menu');
    const board = obj('board');
    let on = false;
    const place = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -MENU_PINNED.pos.z);
    return {
      icon: '✥',
      text: G.pin,
      at: board,
      note: 'menu',
      tip: S.gestures.tips.menu,
      move(_dx, _dy, x, y) {
        const hit = rayTo(x, y).ray.intersectPlane(plane, place);
        if (!hit) return;
        on = Math.abs(place.x) < 0.58 && place.y > 1.28 && place.y < 1.78;
        const at = place.clone().add(new THREE.Vector3(0, 0, 0.12));
        m.position.copy(heldTarget(at));
        m.quaternion.copy(camera.quaternion.clone().invert().multiply(MENU_PINNED.quat));
      },
      async end() {
        if (!on) {
          await moveTo(m, HOLD_POS, holdQuat(m), 1, 0.25);
          return;
        }
        busy = true;
        held = null;
        hint();
        scene.attach(m);
        const to = place.clone();
        to.z = MENU_PINNED.pos.z;
        await moveTo(m, to, MENU_PINNED.quat, 1, 0.25);
        sfx.chunk();
        busy = false;
        void complete('menu');
      },
    };
  }

  /** Something turned round with the pointer (photo, radio knob). */
  function photoGesture(): Gesture {
    const o = obj('photo');
    const turn = turner(o);
    return {
      icon: '↻',
      text: G.photo,
      at: o,
      note: 'photo',
      tip: S.gestures.tips.photo,
      move(_dx, _dy, x, y) {
        o.rotation.z -= turn(x, y);
      },
      async end() {
        const r = Math.atan2(Math.sin(o.rotation.z), Math.cos(o.rotation.z));
        if (Math.abs(r) > 0.2) return;
        o.rotation.z = 0;
        sfx.flip();
        void complete('photo');
      },
    };
  }

  /** The radio: turn the volume knob to the left until it clicks off. */
  function knobGesture(): Gesture {
    const knob = part('radioKnob');
    const turn = turner(knob);
    let vol = 1;
    return {
      icon: '↺',
      text: G.radio,
      at: obj('radio'),
      note: 'radio',
      tip: S.gestures.tips.radio,
      bar: () => ({ value: vol }),
      move(_dx, _dy, x, y) {
        // On screen, clockwise is a positive angle; left (anticlockwise) turns it down
        vol = clamp(vol + turn(x, y) / (Math.PI * 1.5), 0, 1);
        knob.rotation.z = (1 - vol) * Math.PI * 1.5;
        radio.setVolume(vol);
      },
      async end() {
        if (vol > 0.04) return;
        sfx.click();
        radioOff();
        toast(S.toasts.radioOff);
        void complete('radio');
      },
    };
  }

  /** The lamp's switch, on its cable: slide it. */
  function switchGesture(): Gesture {
    const sw = obj('lampSwitch');
    const slider = sw.children.find((c) => c.userData.slider)!;
    let slide = 0;
    return {
      icon: '⇥',
      text: G.lampSwitch,
      at: sw,
      bar: () => ({ value: slide }),
      move(dx, dy) {
        // Right or down slides it on
        slide = clamp(slide + (dx + dy) / (0.1 * H()), 0, 1);
        slider.position.z = -0.012 + slide * 0.024;
      },
      async end() {
        if (slide < 0.85) {
          slide = 0;
          slider.position.z = -0.012;
          return;
        }
        slider.position.z = 0.012;
        lampOn = true;
        sfx.lamp();
        lampLook();
        void tween(0.25, (k) => (world.lampLight.intensity = 1.6 * k));
        void complete('lamp');
      },
    };
  }

  /** Printer paper: pull the paper drawer out, then push it back in (with the paper). */
  function trayGesture(): Gesture {
    const dr = part('printerDrawer');
    const fill = part('printerPaper');
    const ream = obj('ream');
    const z0 = events.has('@trayIn') ? dr.position.z - 0.2 : dr.position.z;
    let stage: 'out' | 'in' = events.has('@trayIn') ? 'in' : 'out';
    let pull = stage === 'in' ? 1 : 0;
    const g: Gesture = {
      icon: stage === 'in' ? '⤒' : '⤓',
      text: stage === 'in' ? G.trayIn : G.trayOpen,
      at: obj('printer'),
      bar: () => ({ value: stage === 'out' ? pull : 1 - pull }),
      move(_dx, dy) {
        pull = clamp(pull + dy / (0.25 * H()), 0, 1);
        dr.position.z = z0 + 0.2 * pull;
      },
      async end() {
        if (stage === 'out') {
          if (pull < 0.8) {
            pull = 0;
            dr.position.z = z0;
            return;
          }
          pull = 1;
          dr.position.z = z0 + 0.2;
          // The paper goes into the drawer
          busy = true;
          const at = new THREE.Vector3();
          dr.getWorldPosition(at);
          at.z -= 0.1;
          await moveTo(ream, heldTarget(at), new THREE.Quaternion(), 0.9, 0.35);
          ream.visible = false;
          held = null;
          hint();
          fill.visible = true;
          sfx.chunk();
          busy = false;
          stage = 'in';
          happen('@trayIn');
          g.text = G.trayIn;
          showGuide(g);
          return;
        }
        if (pull > 0.15) {
          dr.position.z = z0 + 0.2;
          pull = 1;
          return;
        }
        dr.position.z = z0;
        sfx.chunk();
        part('printTray').visible = true;
        os.setPaper();
        void complete('paper');
      },
    };
    return g;
  }

  /** Calendar: lift the page from the bottom, up and over; three months to go. */
  /** Calendar (Update 2): pull the page down until it tears off; it flutters to the floor, the next month shows. */
  function calendarGesture(): Gesture {
    const pivot = part('calendarPivot');
    let pull = 0;
    const text = () => G.calendar.replace('{n}', String(Math.max(0, 3 - calFlips)));
    const g: Gesture = {
      icon: '⤓',
      text: text(),
      note: 'calendar',
      at: obj('calendar'),
      bar: () => ({ value: pull }),
      move(_dx, dy) {
        if (calFlips >= 3) return;
        pull = clamp(pull + dy / (0.28 * H()), 0, 1);
        // The page bends away from the wall as it is pulled
        pivot.rotation.x = -pull * 0.45;
        if (pull < 1) return;
        sfx.rip();
        shake(0.006);
        dropPage((month + 9 + calFlips) % 12, calFlips, false);
        calFlips++;
        setCalendar((month + 9 + calFlips) % 12);
        part('calendarStub').visible = true;
        pivot.rotation.x = 0;
        pull = 0;
        g.text = text();
        if (calFlips >= 3) void complete('calendar');
      },
      async end() {
        if (pull <= 0) return;
        const p0 = pull;
        pull = 0;
        await tween(0.22, (k) => (pivot.rotation.x = -p0 * 0.45 * (1 - k)), easeOut);
      },
    };
    return g;
  }

  /** Picture: turn it (drag sideways) until the spirit level's bubble is in the middle. */
  function pictureGesture(): Gesture {
    const o = obj('picture');
    const RANGE = 0.4;
    const OK = 0.02;
    return {
      icon: '⟲',
      text: G.picture,
      note: 'picture',
      at: o,
      bar: () => ({ value: 0.5 + o.rotation.z / (2 * RANGE), zone: [0.5 - OK / (2 * RANGE), 0.5 + OK / (2 * RANGE)], marker: true }),
      move(dx) {
        o.rotation.z = clamp(o.rotation.z - (dx / (0.6 * H())) * 0.5, -RANGE, RANGE);
      },
      async end() {
        if (Math.abs(o.rotation.z) > OK) return;
        o.rotation.z = 0;
        sfx.click();
        toast(G.level);
        void complete('picture');
      },
    };
  }

  /** Clock: turn the minute hand round to the real time (±3 minutes). */
  function clockGesture(): Gesture {
    const o = obj('clock');
    const turn = turner(o);
    let tickAcc = 0;
    return {
      icon: '↻',
      text: G.clock.replace('{t}', hhmm(realMinutes())),
      note: 'clock',
      at: o,
      move(_dx, _dy, x, y) {
        const d = turn(x, y);
        clockShows += (d / (Math.PI * 2)) * 60;
        setClock(parts, clockShows);
        tickAcc += Math.abs(d);
        if (tickAcc > 0.3) {
          tickAcc = 0;
          sfx.click();
        }
      },
      async end() {
        const diff = (((clockShows - realMinutes()) % 720) + 720) % 720;
        if (diff > 3 && diff < 717) return;
        sfx.whirr();
        void complete('clock');
      },
    };
  }

  /** Keyboard: turn it (drag sideways) until it is parallel to the desk. */
  function keyboardGesture(): Gesture {
    const k = world.keyboard;
    const RANGE = 0.5;
    const OK = 0.035;
    return {
      icon: '⟲',
      text: G.keyboard,
      note: 'keyboard',
      at: k,
      bar: () => ({ value: 0.5 + k.rotation.y / (2 * RANGE), zone: [0.5 - OK / (2 * RANGE), 0.5 + OK / (2 * RANGE)], marker: true }),
      move(dx) {
        k.rotation.y = clamp(k.rotation.y - (dx / (0.6 * H())) * 0.7, -RANGE, RANGE);
      },
      async end() {
        if (Math.abs(k.rotation.y) > OK) return;
        k.rotation.y = 0;
        sfx.click();
        toast(G.straight);
        void complete('keyboard');
      },
    };
  }

  /** Window: push the pane shut (drag towards the wall), then turn the handle down. */
  function windowGesture(): Gesture {
    const h = world.windowPane;
    const handle = world.windowHandle;
    const g: Gesture = {
      note: 'window',
      icon: windowShut ? '⤓' : '⇤',
      text: windowShut ? G.handle : G.window,
      at: world.objects.get('window')!,
      bar: () => ({ value: windowShut ? 1 - handle.rotation.z / (Math.PI / 2) : 1 - h.rotation.y / WINDOW_OPEN }),
      move(dx, dy) {
        // Towards the wall (left on screen) shuts it; then the handle goes down
        if (!windowShut) h.rotation.y = clamp(h.rotation.y + (dx / (0.5 * H())) * 1.0, 0, WINDOW_OPEN + 0.1);
        else handle.rotation.z = clamp(handle.rotation.z - (dy / (0.25 * H())) * 1.6, 0, Math.PI / 2);
      },
      async end() {
        if (!windowShut) {
          if (h.rotation.y > 0.06) return;
          h.rotation.y = 0;
          windowShut = true;
          sfx.chunk();
          g.icon = '⤓';
          g.text = G.handle;
          showGuide(g);
          hideGuide(2500);
          return;
        }
        if (handle.rotation.z > 0.15) return;
        handle.rotation.z = 0;
        windowOpen = false;
        sfx.chunk();
        void complete('window');
      },
    };
    return g;
  }

  /** Mouse: flick it over with a quick swipe up. */
  function mouseGesture(): Gesture {
    const o = obj('mouse');
    let up = 0;
    let flipped = false;
    return {
      icon: '⤴',
      text: G.mouse,
      at: o,
      bar: () => ({ value: up }),
      move(_dx, dy) {
        if (flipped) return;
        up = clamp(up - dy / (0.15 * H()), 0, 1);
        o.rotation.z = Math.PI * (1 - up * 0.3);
        if (up < 1) return;
        flipped = true;
        sfx.click();
        const y0 = o.position.y;
        void tween(0.4, (k) => {
          o.rotation.z = Math.PI * 0.7 * (1 - k);
          o.position.y = y0 + Math.sin(k * Math.PI) * 0.05;
        }).then(() => void complete('mouse'));
      },
      async end() {
        if (flipped) return;
        const r0 = o.rotation.z;
        await tween(0.2, (k) => (o.rotation.z = r0 + (Math.PI - r0) * k));
        up = 0;
      },
    };
  }

  /** The coffee ring: rub it away with the tissue (back and forth). */
  function rubGesture(): Gesture {
    const t = obj('tissue');
    const stain = part('stain') as THREE.Mesh;
    const sm = stain.material as THREE.MeshLambertMaterial;
    let rub = 1 - sm.opacity / 0.55;
    let done = false;
    let noise = 0;
    const base = heldTarget(new THREE.Vector3(0.5, 0.785, -0.18));
    void moveTo(t, base, camera.quaternion.clone().invert(), 1, 0.2);
    return {
      icon: '⇆',
      text: G.rub,
      at: obj('ring'),
      bar: () => ({ value: rub }),
      move(dx, dy) {
        if (done) return;
        rub = clamp(rub + (Math.abs(dx) + Math.abs(dy)) / (3 * H()), 0, 1);
        sm.opacity = 0.55 * (1 - rub);
        t.position.x = base.x + clamp(t.position.x - base.x + dx * 0.0004, -0.04, 0.04);
        noise += Math.abs(dx) + Math.abs(dy);
        if (noise > 0.25 * H()) {
          noise = 0;
          sfx.wipe();
        }
        if (rub >= 1) {
          done = true;
          stain.visible = false;
        }
      },
      async end() {
        if (!done) {
          await moveTo(t, HOLD_POS, holdQuat(t), 1, 0.25);
          return;
        }
        void complete('ring');
        await throwHeld('ring');
      },
    };
  }

  /** Snow globe: shake it left and right. */
  function shakeGesture(): Gesture {
    const o = obj('globe');
    const x0 = o.position.x;
    let shook = 0;
    let lastDir = 0;
    let done = false;
    return {
      icon: '⇔',
      text: G.shake,
      at: o,
      bar: () => ({ value: shook }),
      move(dx) {
        o.position.x = clamp(o.position.x + dx * 0.0003, x0 - 0.04, x0 + 0.04);
        const dir = Math.sign(dx);
        if (dir && dir !== lastDir) {
          lastDir = dir;
          sfx.jingle();
        }
        if (done) return;
        shook = clamp(shook + Math.abs(dx) / (2.4 * H()), 0, 1);
        if (shook >= 1) {
          done = true;
          snowfall();
          toast(S.toasts.globe);
          if (!isDone('globe')) void complete('globe');
        }
      },
      async end() {
        const xs = o.position.x;
        await tween(0.25, (k) => (o.position.x = xs + (x0 - xs) * k), back);
      },
    };
  }

  function snowfall() {
    const flakes = part('snow').children;
    flakes.forEach((f) => {
      f.position.y = 0.02 + Math.random() * 0.02;
      f.position.x = (Math.random() - 0.5) * 0.06;
      f.position.z = (Math.random() - 0.5) * 0.06;
    });
    const starts = flakes.map((f) => f.position.y);
    void tween(
      3,
      (k) =>
        flakes.forEach((f, i) => {
          f.position.y = starts[i] + (-0.035 - starts[i]) * k;
          f.position.x += Math.sin(k * 20 + i) * 0.0002;
        }),
      linear,
    );
  }

  /** Stress ball: press and hold until it is squashed flat, three times. */
  function squeezeGesture(): Gesture {
    const o = obj('ball');
    let sq = 0;
    const text = () => G.squeeze.replace('{n}', String(Math.min(3, squeezes + 1)));
    const g: Gesture = {
      icon: '✊',
      text: text(),
      at: o,
      hold: true,
      bar: () => ({ value: sq }),
      tick(dt) {
        sq = Math.min(1, sq + dt * 2.2);
        o.scale.set(1 + 0.35 * sq, 1 - 0.5 * sq, 1 + 0.35 * sq);
      },
      async end() {
        const full = sq > 0.95;
        const s0 = sq;
        if (full) {
          sfx.squish();
          squeezes++;
        }
        await tween(0.3, (k) => {
          const v = s0 * (1 - k);
          o.scale.set(1 + 0.35 * v, 1 - 0.5 * v, 1 + 0.35 * v);
        }, back);
        if (squeezes >= 3 && !isDone('ball')) {
          toast(S.toasts.ball);
          void complete('ball');
        }
      },
    };
    return g;
  }

  /** Watering Gerald: tip the bottle (drag down), stop when the level is in the green. */
  function pourGesture(): Gesture {
    const b = obj('bottle');
    const ZONE: [number, number] = [0.6, 0.88];
    let tilt = 0;
    let splash = 0;
    let done = false;
    const over = heldTarget(new THREE.Vector3(-0.55, 1.07, -0.72));
    void moveTo(b, over, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.3)), 1, 0.3);
    const perk = () => world.leaves.forEach((l, i) => (l.rotation.z = 1.25 - 0.85 * easeOut(clamp(waterLevel / ZONE[0] - i * 0.04, 0, 1))));
    // The stream of water from the bottle's mouth into the pot
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#9fd4ff', transparent: true, opacity: 0.7 }));
    stream.visible = false;
    scene.add(stream);
    const soil = new THREE.Vector3();
    obj('plant').getWorldPosition(soil);
    soil.y += 0.06;
    const mouth = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const flow = (on: boolean) => {
      stream.visible = on;
      if (!on) return;
      b.localToWorld(mouth.set(0, 0.13, 0));
      const d = soil.clone().sub(mouth);
      stream.position.copy(mouth).addScaledVector(d, 0.5);
      stream.scale.set(1, d.length(), 1);
      stream.quaternion.setFromUnitVectors(up, d.normalize());
    };
    return {
      icon: '⤵',
      text: G.pour,
      note: 'plant',
      below: true,
      at: obj('plant'),
      bar: () => ({ value: waterLevel, zone: ZONE }),
      move(_dx, dy) {
        tilt = clamp(tilt + dy / (0.3 * H()), 0, 1);
        b.rotation.z = 0.3 + tilt * 1.7;
      },
      tick(dt) {
        if (!done) b.rotation.set(0, 0, 0.3 + tilt * 1.7);
        flow(!done && tilt >= 0.45);
        if (done || tilt < 0.45) return;
        waterLevel += (tilt - 0.45) * dt * 0.75;
        splash -= dt;
        if (splash <= 0) {
          splash = 0.5;
          sfx.pour();
        }
        perk();
        if (waterLevel > 1) {
          waterLevel = 0;
          tilt = 0;
          b.rotation.z = 0.3;
          sfx.nope();
          toast(G.tooMuch);
          perk();
        }
      },
      async end() {
        flow(false);
        scene.remove(stream);
        if (waterLevel >= ZONE[0] && waterLevel <= ZONE[1]) {
          done = true;
          await putBack();
          void complete('plant');
          return;
        }
        await moveTo(b, HOLD_POS, holdQuat(b), 1, 0.3);
      },
    };
  }

  /** Coffee: pull the mug up to your mouth (drag up) and keep it there until it is empty. */
  function drinkGesture(): Gesture {
    const m = obj('mug');
    const coffee = m.children.find((c) => c.userData.coffee)!;
    remember(m);
    glow(m, false);
    shadows(m, false);
    camera.attach(m);
    const p0 = m.position.clone();
    const q0 = m.quaternion.clone();
    // Lifted in front of the face first (upright, handle to the right), then tipped towards the mouth below the eyes
    const pUp = new THREE.Vector3(0.02, -0.035, -0.21);
    const qUp = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0.1, 0));
    const p1 = new THREE.Vector3(0.0, -0.068, -0.105);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.0, 0, 0.08));
    let lift = 0;
    let sip = 0;
    let done = false;
    let gulp = 0;
    const pose = () => {
      const a = Math.min(1, lift / 0.5);
      const b = Math.max(0, (lift - 0.5) / 0.5);
      m.position.lerpVectors(p0, pUp, easeInOut(a)).lerp(p1, easeInOut(b));
      m.quaternion.slerpQuaternions(q0, qUp, easeInOut(a)).slerp(q1, easeInOut(b));
      // Small sips: the mug tips a little further now and then
      if (b > 0.95) m.rotateX(Math.sin(gulp * 9) * 0.06);
      // The coffee goes down as you drink, and out of sight once the mug tips
      coffee.visible = b < 0.3;
      // The head goes back a little while drinking
      headTiltWant = b > 0.9 ? 0.09 : 0;
    };
    return {
      icon: '⤒',
      text: G.drink,
      note: 'coffee',
      below: true,
      at: m,
      bar: () => ({ value: drunk }),
      move(_dx, dy) {
        if (done) return;
        lift = clamp(lift - dy / (0.35 * H()), 0, 1);
        pose();
      },
      tick(dt) {
        if (done || lift < 0.95) return;
        drunk = Math.min(1, drunk + dt / 1.5);
        coffee.position.y = 0.046 - 0.085 * drunk;
        gulp += dt;
        pose();
        sip -= dt;
        if (sip <= 0) {
          sip = 0.6;
          sfx.sip();
        }
        if (drunk >= 1) done = true;
      },
      async end() {
        headTiltWant = 0;
        await goHome(m, 0.4);
        coffee.visible = drunk < 1;
        shadows(m, true);
        if (done) void complete('coffee');
      },
    };
  }

  /** Stapler: press it down on the paper. */
  function stapleGesture(id: string, note: string): Gesture {
    const st = obj('stapler');
    const at = new THREE.Vector3();
    obj(id).getWorldPosition(at);
    // The stapler's foot rests on the paper
    at.y += 0.04;
    const top = heldTarget(at);
    void moveTo(st, top, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.2, 0)), 1, 0.25);
    let press = 0;
    let done = false;
    return {
      icon: '⤓',
      text: G.staple,
      at: obj(id),
      bar: () => ({ value: press }),
      move(_dx, dy) {
        if (done) return;
        press = clamp(press + dy / (0.15 * H()), 0, 1);
        pressStapler(world.parts, press);
        if (press < 1) return;
        done = true;
        sfx.chunk();
        if (id === 'receipts') part('receiptsStaple').visible = true;
        if (id === 'printout') part('printoutStaple').visible = true;
      },
      async end() {
        const s0 = press;
        await tween(0.15, (k) => pressStapler(world.parts, s0 * (1 - k)));
        if (done) {
          await putBack();
          void complete(note);
          return;
        }
        await moveTo(st, HOLD_POS, holdQuat(st), 1, 0.25);
      },
    };
  }

  /** Drawers: pull them open (drag down, towards you). */
  function drawerGesture(i: number): Gesture {
    const d = obj(`drawer${i}`);
    let pull = (d.position.z - DRAWER_Z) / 0.32;
    let creak = 0;
    // An open drawer is pushed shut (it would hide the ones below it)
    const shut = drawerOut[i];
    return {
      icon: shut ? '⤒' : '⤓',
      text: shut ? G.drawerShut : G.drawer,
      note: shut ? undefined : i === 0 ? 'drawer' : i === 1 ? 'middle' : undefined,
      at: d,
      bar: () => ({ value: pull }),
      move(_dx, dy) {
        pull = clamp(pull + dy / (0.3 * H()), 0, 1);
        d.position.z = DRAWER_Z + 0.32 * pull;
        creak += Math.abs(dy);
        if (creak > 0.2 * H()) {
          creak = 0;
          sfx.drawer();
        }
      },
      async end() {
        if (shut) {
          const z0 = d.position.z;
          const to = pull < 0.6 ? DRAWER_Z : DRAWER_Z + 0.32;
          if (pull < 0.6) {
            drawerOut[i] = false;
            sfx.drawer();
          }
          await tween(0.25, (k) => (d.position.z = z0 + (to - z0) * k), easeOut);
          return;
        }
        if (pull < 0.7) {
          const z0 = d.position.z;
          await tween(0.25, (k) => (d.position.z = z0 + (DRAWER_Z - z0) * k), easeOut);
          return;
        }
        await openDrawer(i, true);
        if (i === 0) {
          void complete('drawer');
          happen('@dave');
        } else if (i === 1) {
          void complete('middle');
          startCallback();
        } else happen('@drawer2');
      },
    };
  }

  /** Phone: pull the handset up to answer or call. */
  function phoneGesture(): Gesture {
    const hs = world.handset;
    remember(hs);
    const home = hs.position.clone();
    let lift = 0;
    return {
      icon: '⤒',
      text: G.phone,
      below: true,
      at: obj('phone'),
      bar: () => ({ value: lift }),
      move(_dx, dy) {
        lift = clamp(lift - dy / (0.25 * H()), 0, 1);
        hs.position.y = home.y + lift * 0.1;
        hs.rotation.x = lift * 0.5;
      },
      async end() {
        if (lift >= 0.8) {
          await phoneAction();
          return;
        }
        const l0 = lift;
        await tween(0.2, (k) => {
          hs.position.y = home.y + l0 * 0.1 * (1 - k);
          hs.rotation.x = l0 * 0.5 * (1 - k);
        });
      },
    };
  }

  /** Cables: turn in circles around the knot until it comes undone. */
  function cablesGesture(): Gesture {
    const c = obj('cables');
    const knot = part('knot');
    const turn = turner(c);
    let total = 0;
    let done = false;
    return {
      icon: '↻',
      text: G.cables,
      note: 'cables',
      at: c,
      bar: () => ({ value: Math.abs(total) / (Math.PI * 4) }),
      move(_dx, _dy, x, y) {
        if (done) return;
        total += turn(x, y);
        knot.rotation.y = total;
        knot.scale.setScalar(1 - 0.5 * clamp(Math.abs(total) / (Math.PI * 4), 0, 1));
        if (Math.abs(total) < Math.PI * 4) return;
        done = true;
      },
      async end() {
        if (!done) return;
        knot.visible = false;
        const coil = part('coil');
        coil.visible = true;
        coil.scale.setScalar(0.01);
        sfx.wipe();
        await tween(0.3, (k) => coil.scale.setScalar(Math.max(0.01, k)), back);
        void complete('cables');
      },
    };
  }

  let gest: { g: Gesture; id: number; x: number; y: number; moved: number } | null = null;
  let gestFrom: 'free' | 'focus' = 'free';
  let gestNoteOpen = false;

  function startGesture(g: Gesture, e: PointerEvent) {
    gest = { g, id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    gestFrom = mode === 'focus' ? 'focus' : 'free';
    // Some games finish while you are still dragging (the calendar): remember how it was at the start
    gestNoteOpen = !!g.note && !isDone(g.note);
    mode = 'gesture';
    glow(hovered, false);
    hovered = undefined;
    canvas.style.cursor = 'grabbing';
    firstHint = false;
    hintEl.textContent = '';
    showGuide(g);
  }

  const fails = new Map<string, number>();
  async function finishGesture() {
    if (!gest) return;
    const { g, moved } = gest;
    gest = null;
    busy = true;
    try {
      await g.end?.();
    } finally {
      busy = false;
      if (mode === 'gesture') mode = gestFrom;
      canvas.style.cursor = '';
      hint();
    }
    // Done up close and nothing more to do here: the camera goes back by itself
    if (mode === 'focus' && focusId && gestNoteOpen && isDone(g.note!) && !gestureFor(focusId) && !FOCUS_STAY.has(focusId)) {
      const at = focusId;
      setTimeout(() => {
        if (mode === 'focus' && focusId === at && !busy) void exitFocus();
      }, 900);
    }
    // Three real tries that did not do it: a tip
    const key = g.note ?? g.text;
    const tip = g.tip ?? (g.note ? (S.gestures.tips as Record<string, string>)[g.note] : undefined);
    if (moved >= 6 && g.note && !isDone(g.note) && tip) {
      const n = (fails.get(key) ?? 0) + 1;
      fails.set(key, n);
      if (n >= 3) {
        fails.set(key, 0);
        setTimeout(() => toast(tip), 700);
      }
    }
    // A tap: keep the guide up for a moment so you know what to do
    if (moved < 6 && !g.hold) hideGuide(2200);
    else hideGuide(600);
  }

  /** Handset to the ear for a moment; a message while you listen. */
  async function phoneCall(message: string | null) {
    busy = true;
    world.cord.visible = false;
    const hs = world.handset;
    remember(hs);
    camera.attach(hs);
    await moveTo(hs, new THREE.Vector3(0.15, -0.03, -0.14), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.55, 1.3)), 1, 0.4);
    if (message) {
      sfx.ring();
      await wait(1.1);
      toast(message);
      await wait(1.6);
    } else await wait(0.9);
    await goHome(hs, 0.4);
    world.cord.visible = true;
    sfx.click();
    busy = false;
  }

  /* ---- up close at a little game ------------------------------------------------------------------ */

  /** Where to look and from where (world space). Big or awkward things have their own view. */
  const CABINET: { at: [number, number, number]; cam: [number, number, number] } = { at: [-1.28, 0.68, -1.0], cam: [-0.97, 1.12, 0.05] };
  const DESK_DRAWERS: { at: [number, number, number]; cam: [number, number, number] } = { at: [0.62, 0.24, 0.08], cam: [0.6, 1.1, 0.55] };
  const FOCUS_VIEW: Record<string, { at: [number, number, number]; r?: number; cam?: [number, number, number] }> = {
    window: { at: [-1.5, 1.42, -0.62], r: 0.5 },
    drawer0: DESK_DRAWERS,
    drawer1: DESK_DRAWERS,
    drawer2: DESK_DRAWERS,
    ink: DESK_DRAWERS,
    invoice: DESK_DRAWERS,
    cab0: CABINET,
    cab1: CABINET,
    cab2: CABINET,
    board: { at: [0, 1.53, -1.48], r: 0.5 },
    plant: { at: [-0.62, 1.0, -0.76], cam: [-0.2, 1.3, -0.64] },
    mouse: { at: [0.32, 0.79, -0.4], cam: [0.18, 1.02, -0.26] },
    receipts: { at: [0.15, 0.77, -0.57], cam: [0.12, 1.0, -0.35] },
    keyboard: { at: [0, 0.78, -0.42], r: 0.22 },
    bin: { at: [1.0, 0.2, 0.2], cam: [0.82, 0.78, -0.02] },
    photo: { at: [0.58, 1.3, -1.478], r: 0.07 },
  };
  /** How big a thing is (half its size): what should fill the view. */
  const FOCUS_R: Record<string, number> = {
    calendar: 0.2,
    picture: 0.2,
    clock: 0.15,
    globe: 0.09,
    ball: 0.08,
    mug: 0.1,
    cables: 0.14,
    phone: 0.14,
    printer: 0.2,
    radio: 0.12,
    lampSwitch: 0.07,
    ring: 0.1,
    notepad: 0.11,
    report: 0.14,
    card: 0.1,
    printout: 0.13,
  };
  /** Views where you stay after a game (more to do in the same place). */
  const FOCUS_STAY = new Set(['drawer0', 'drawer1', 'drawer2', 'ink', 'invoice', 'cab0', 'cab1', 'cab2']);
  let focusId: string | null = null;
  let focusLook = { yaw: 0, pitch: PITCH_REST };
  const fBox = new THREE.Box3();
  const fTmp = new THREE.Box3();

  /** Camera spot and angles that show the thing big in the middle. */
  function focusPose(id: string) {
    const v = FOCUS_VIEW[id];
    const at = new THREE.Vector3();
    let r = v?.r ?? FOCUS_R[id] ?? 0;
    if (v) at.set(...v.at);
    else {
      fBox.makeEmpty();
      obj(id).updateWorldMatrix(true, true);
      obj(id).traverse((c) => {
        if (!(c instanceof THREE.Mesh) || !visible(c) || c.userData.shadow || c.userData.note || c.parent?.userData.note) return;
        if ((c.material as THREE.Material).visible === false) return;
        c.geometry.computeBoundingBox();
        fBox.union(fTmp.copy(c.geometry.boundingBox!).applyMatrix4(c.matrixWorld));
      });
      fBox.getCenter(at);
      if (!r) r = fBox.getSize(fTmp.min).length() / 2;
    }
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const half = Math.min(tan, tan * camera.aspect);
    let pos: THREE.Vector3;
    if (v?.cam) pos = new THREE.Vector3(...v.cam);
    else {
      const dist = clamp(Math.max(0.06, r) / (0.8 * half), 0.16, at.distanceTo(EYE));
      pos = at.clone().addScaledVector(EYE.clone().sub(at).normalize(), dist);
    }
    const d = at.clone().sub(pos);
    return { pos, at, yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
  }
  function aimAt(f: { pos: THREE.Vector3; yaw: number; pitch: number }, now = false) {
    // The shortest way round
    let y = f.yaw;
    while (y - yaw > Math.PI) y -= Math.PI * 2;
    while (y - yaw < -Math.PI) y += Math.PI * 2;
    tYaw = y;
    tPitch = f.pitch;
    if (now) {
      camera.position.copy(f.pos);
      yaw = tYaw;
      pitch = tPitch;
    }
  }

  /** What to do up close, shown as soon as you get there. */
  function focusInfo(id: string): { icon: string; text: string } | null {
    if (id.startsWith('drawer')) return drawerOut[Number(id.slice(6))] ? { icon: '⤒', text: G.drawerShut } : { icon: '⤓', text: G.drawer };
    if (held === 'tissue') return { icon: '⇆', text: G.rub };
    if (held === 'bottle') return { icon: '⤵', text: G.pour };
    if (held?.startsWith('pen')) return { icon: '✎', text: id === 'notepad' ? (isDone('pen') ? G.write : G.scribble) : G.sign };
    if (held === 'stamp' || held === 'stapler') return { icon: '⤓', text: held === 'stamp' ? G.stampPress : G.staple };
    if (/^cab\d$/.test(id) && !isDone('cabinetJam')) return { icon: '⤒', text: G.kick };
    if (held === 'invoice' || held === 'taxform') return { icon: '⤓', text: cabOut === id ? G.fileIn : G.fileOpen };
    if (/^cab\d$/.test(id)) return cabOut === id ? { icon: '⤒', text: G.drawerShut } : { icon: '⤓', text: G.drawer };
    if (held === 'menu') return { icon: '✥', text: G.pin };
    if (held === 'ream' || id === 'printer') return events.has('@trayIn') ? { icon: '⤒', text: G.trayIn } : { icon: '⤓', text: G.trayOpen };
    const T: Record<string, [string, string]> = {
      calendar: ['⤓', G.calendar.replace('{n}', String(Math.max(0, 3 - calFlips)))],
      picture: ['⟲', G.picture],
      clock: ['↻', G.clock.replace('{t}', hhmm(realMinutes()))],
      keyboard: ['⟲', G.keyboard],
      window: windowShut ? ['⤓', G.handle] : ['⇤', G.window],
      mouse: ['⤴', G.mouse],
      globe: ['⇔', G.shake],
      ball: ['●', G.squeeze.replace('{n}', String(Math.min(3, squeezes + 1)))],
      mug: ['⤒', G.drink],
      cables: ['↻', G.cables],
      phone: ['⤒', G.phone],
      photo: ['↻', G.photo],
      radio: ['↺', G.radio],
      lampSwitch: ['⇥', G.lampSwitch],
    };
    const t = T[id];
    return t ? { icon: t[0], text: t[1] } : null;
  }

  async function enterFocus(id: string) {
    if (busy) return;
    busy = true;
    if (mode !== 'focus') focusLook = { yaw: tYaw, pitch: tPitch };
    focusId = id;
    mode = 'focus';
    glow(hovered, false);
    hovered = undefined;
    backEl.hidden = false;
    hint();
    const f = focusPose(id);
    aimAt(f);
    const p0 = camera.position.clone();
    const y0 = yaw;
    const x0 = pitch;
    const y1 = tYaw;
    await tween(0.6, (k) => {
      camera.position.lerpVectors(p0, f.pos, k);
      yaw = y0 + (y1 - y0) * k;
      pitch = x0 + (f.pitch - x0) * k;
    });
    busy = false;
    if (mode !== 'focus' || focusId !== id) return;
    const info = focusInfo(id);
    if (info) showGuide({ ...info, at: obj(id) });
  }

  async function exitFocus() {
    if (mode !== 'focus') return;
    busy = true;
    mode = 'free';
    focusId = null;
    backEl.hidden = true;
    hideGuide();
    hint();
    const p0 = camera.position.clone();
    const y0 = yaw;
    const x0 = pitch;
    let y1 = focusLook.yaw;
    while (y1 - y0 > Math.PI) y1 -= Math.PI * 2;
    while (y1 - y0 < -Math.PI) y1 += Math.PI * 2;
    tYaw = y1;
    tPitch = focusLook.pitch;
    await tween(0.5, (k) => {
      camera.position.lerpVectors(p0, eye, k);
      yaw = y0 + (y1 - y0) * k;
      pitch = x0 + (focusLook.pitch - x0) * k;
    });
    // Back in the chair: the view's angle is the normal one again
    yaw = tYaw = focusLook.yaw;
    busy = false;
  }

  /* ---- input ------------------------------------------------------------------------------------ */

  async function click(x: number, y: number) {
    if (busy || mode === 'start' || mode === 'done' || mode === 'lock') return;
    firstHint = false;
    const p = pickAt(x, y, held !== null && (mode === 'free' || mode === 'focus'));
    if (mode === 'reading') {
      const id = reading!;
      if (p?.note === id && notes.get(id)!.def.kind === 'instant') {
        if (id === 'stretch') stretch();
        if (id === 'posture') void tween(0.5, (k) => (eye.y = EYE.y + 0.035 * k), easeOut);
        const say = (S.says as Record<string, string>)[id];
        if (say) toast(say);
        await complete(id);
      } else await closeNote();
      return;
    }
    if (mode === 'zoom') {
      if (p?.note) return openNote(p.note);
      if (p?.screen) {
        if (os.state === 'off') toast(S.toasts.screenOff);
        else os.click(p.screen);
        return;
      }
      if (p?.id === 'power') return use('power');
      return exitZoom();
    }
    if (mode === 'focus') {
      if (p?.note && !held) return openNote(p.note);
      if (!p?.id) return exitFocus();
      // The computer has its own close-up
      if (p.id === 'monitor' || p.id === 'power') {
        await exitFocus();
        return use(p.id);
      }
      return use(p.id);
    }
    if (p?.note && !held) return openNote(p.note);
    // A little game: the camera comes close first
    if (p?.id && gestureFor(p.id)) return enterFocus(p.id);
    if (p?.id) return use(p.id);
    if (held) return putBack();
    hint();
  }

  /** "Stretch. Seriously." — the view stretches up and comes back. */
  function stretch() {
    tPitch = PITCH_MAX;
    setTimeout(() => (tPitch = PITCH_REST), 700);
  }

  const ac = new AbortController();
  const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window | Document, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions = {}) =>
    el.addEventListener(type, fn as EventListener, { ...opts, signal: ac.signal });

  const capture = (id: number) => {
    try {
      canvas.setPointerCapture(id);
    } catch {
      /* synthetic pointer (tests) */
    }
  };
  on(canvas, 'pointerdown', (e) => {
    if (e.button === 2 || gest) return;
    // Rubbish in hand and the bin in sight: a drag is a throw
    if (mode === 'free' && !busy && held && TRASH.has(held) && binOnScreen()) {
      startGesture(throwGesture(held), e);
      capture(e.pointerId);
      return;
    }
    // Up close, pressing on a thing with a little game starts it
    if (mode === 'focus' && !busy) {
      const p = pickAt(e.clientX, e.clientY, held !== null);
      const make = p?.id && !p.note ? gestureFor(p.id) : null;
      if (make) {
        startGesture(make(), e);
        capture(e.pointerId);
        return;
      }
    }
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    capture(e.pointerId);
  });
  on(canvas, 'pointermove', (e) => {
    if (e.pointerType === 'mouse') mouse = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    if (gest && e.pointerId === gest.id) {
      const dx = e.clientX - gest.x;
      const dy = e.clientY - gest.y;
      gest.x = e.clientX;
      gest.y = e.clientY;
      gest.moved += Math.abs(dx) + Math.abs(dy);
      gest.g.move?.(dx, dy, e.clientX, e.clientY);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (mode !== 'free' || drag.moved < 6) return;
    const k = touch ? 0.006 : 0.004;
    tYaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, tYaw + dx * k));
    tPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, tPitch + dy * k));
  });
  on(canvas, 'pointerup', (e) => {
    if (gest && e.pointerId === gest.id) {
      void finishGesture();
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved < 8) void click(e.clientX, e.clientY);
  });
  on(canvas, 'pointercancel', () => {
    drag = null;
    void finishGesture();
  });
  on(canvas, 'pointerleave', () => (mouse = null));
  on(canvas, 'contextmenu', (e) => {
    e.preventDefault();
    if (busy) return;
    if (mode === 'reading') void closeNote();
    else if (mode === 'zoom') void exitZoom();
    else if (held) void putBack();
    else if (mode === 'focus') void exitFocus();
  });
  on(window, 'keydown', (e) => {
    // Tab opens the list while playing (inside the list, Tab moves between the buttons as usual)
    const free = !document.activeElement || document.activeElement === document.body || document.activeElement === canvas;
    if (e.key === 'Tab' && (mode === 'free' || mode === 'zoom') && !busy && free) {
      e.preventDefault();
      openList();
      return;
    }
    if (mode === 'list') {
      if (e.key === 'Escape') closeList();
      return;
    }
    if (mode === 'lock') {
      if (e.key === 'Escape') closeLock();
      else if (/^[0-9]$/.test(e.key)) {
        digits.shift();
        digits.push(Number(e.key));
        drawLock();
      } else if (e.key === 'Enter') void tryLock();
      return;
    }
    if (e.key !== 'Escape' || busy) return;
    if (mode === 'reading') void closeNote();
    else if (mode === 'zoom') void exitZoom();
    else if (held) void putBack();
    else if (mode === 'focus') void exitFocus();
  });
  on(window, 'resize', resize);
  // Typing for DeskOS (a hidden input, so phones open their keyboard)
  on(typeEl, 'input', () => os.setText(typeEl.value));
  on(typeEl, 'keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      os.submit();
    }
  });
  on(typeEl, 'blur', () => os.blur());
  on(backEl, 'click', () => {
    if (busy) return;
    if (mode === 'reading') void closeNote();
    else if (mode === 'focus') void exitFocus();
    else void exitZoom();
  });

  /* ---- saving --------------------------------------------------------------------------------- */

  let playTime = 0;
  let finished = false;
  let tomorrow = pre?.tomorrow ?? '';
  /** Set while starting over: nothing may be saved any more (pagehide would write the old desk back). */
  let wiping = false;

  function save() {
    if (wiping) return;
    const data: Save = {
      v: 1,
      done: [...notes.values()].filter((n) => n.done).map((n) => n.def.id),
      events: [...events],
      time: Math.round(playTime),
      os: os.snapshot(),
      workingPen,
      finished,
      code,
      tomorrow,
    };
    store.set(SAVE_KEY, JSON.stringify(data));
  }

  function load(): Save | null {
    try {
      const raw = store.get(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as Save;
      return data.v === 1 && Array.isArray(data.done) ? data : null;
    } catch {
      return null;
    }
  }

  const saved = load();
  if (saved) {
    workingPen = saved.workingPen ?? workingPen;
    playTime = saved.time ?? 0;
    saved.events?.forEach((e) => events.add(e));
    os.restore(saved.os ?? {});
    if (events.has('@kb')) void keyboardUp(false);
    if (events.has('@pot')) void potAside(false);
    if (events.has('@pic')) void pictureAside(false);
    if (events.has('@drawer2')) drawerOpen[2] = true;
    if (events.has('@trayIn') && !saved.done.includes('paper')) {
      obj('ream').visible = false;
      part('printerPaper').visible = true;
      part('printerDrawer').position.z += 0.2;
    }
    if (events.has('@callback')) callbackT = 0;
    for (const id of saved.done) {
      const n = notes.get(id);
      if (!n) continue;
      n.done = true;
      settle(id);
    }
    finished = !!saved.finished && left() === 0;
  }
  appear(false);

  /** A small picture of the view (for the share card), as a JPEG data URL. */
  function snapshot() {
    look.render(0);
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = Math.round((640 * canvas.height) / canvas.width);
    c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.8);
  }

  /** The same view for "before" and "after": sitting, looking at the desk. */
  function restView() {
    camera.position.copy(eye);
    yaw = tYaw = 0;
    pitch = tPitch = PITCH_REST;
    camera.rotation.set(pitch, yaw, 0);
  }

  /* ---- start and end ---------------------------------------------------------------------------- */

  const goBtn = $<HTMLButtonElement>('[data-mn-go]');
  if (saved && !finished && saved.done.length) {
    goBtn.textContent = S.resume;
    root.dataset.resume = 'true';
  }
  on(goBtn, 'click', () => {
    sfx.unlock();
    $('[data-mn-start]').hidden = true;
    if (!store.get(BEFORE_KEY) && !(saved && saved.done.length)) {
      restView();
      store.set(BEFORE_KEY, snapshot());
    }
    mode = 'free';
    ambience.start();
    if (left() <= EPIC_AT) startEpic(false);
    else if (!isDone('radio')) radio.start();
    hint();
    save();
  });

  // Start over: a second click within 3 s, so a slip does not wipe the desk
  let sure = 0;
  const restartBtn = $<HTMLButtonElement>('[data-mn-restart]');
  const restartLbl = restartBtn.querySelector<HTMLElement>('[data-mn-restart-lbl]') ?? restartBtn;
  const restartLabel = restartLbl.textContent ?? S.restart;
  function restart(e: Event) {
    const btn = e.currentTarget as HTMLButtonElement;
    if (btn === restartBtn && left() > 0 && Date.now() - sure > 3000) {
      sure = Date.now();
      restartLbl.textContent = S.restartSure;
      restartBtn.setAttribute('aria-label', S.restartSure);
      restartBtn.classList.add('is-sure');
      setTimeout(() => {
        restartLbl.textContent = restartLabel;
        restartBtn.setAttribute('aria-label', restartLabel);
        restartBtn.classList.remove('is-sure');
      }, 3000);
      return;
    }
    wiping = true;
    store.del(SAVE_KEY);
    store.del(BEFORE_KEY);
    store.del(AFTER_KEY);
    location.reload();
  }
  on(restartBtn, 'click', restart);
  on($('[data-mn-again]'), 'click', restart);

  const fmt = (secs: number) => {
    const m = Math.floor(secs / 60);
    const h = Math.floor(m / 60);
    const ss = String(secs % 60).padStart(2, '0');
    return h ? `${h}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  };
  const rankOf = (secs: number) => S.ranks.find((r) => secs / 60 < r.under)?.name ?? S.ranks[S.ranks.length - 1].name;

  async function finish() {
    if (mode === 'done') return;
    mode = 'done';
    finished = true;
    save();
    await wait(0.6);
    restView();
    const after = snapshot();
    store.set(AFTER_KEY, after);
    await finale();
    sfx.done();
    restView();
    await showDone(after);
  }

  /** "Go home.": the lights go out, you get up and leave; credits; a note for tomorrow. */
  async function finale() {
    hintEl.textContent = '';
    backEl.hidden = true;
    radio.stop();
    radioLed(false);
    await wait(0.4);
    // The computer, the lamp, the ceiling
    sfx.lightOff();
    os.off();
    world.monitorLight.intensity = 0;
    (world.powerLed.material as THREE.MeshLambertMaterial).emissive.set('#000000');
    await wait(0.6);
    if (lampOn) {
      sfx.lightOff();
      world.lampLight.intensity = 0;
      (world.lampShade.material as THREE.MeshLambertMaterial).emissive.set('#000000');
      (world.lampBulb.material as THREE.MeshLambertMaterial).emissive.set('#000000');
      await wait(0.6);
    }
    sfx.lightOff();
    scene.traverse((o) => {
      if (o.userData.panel) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set('#3a3a44');
    });
    const h0 = world.hemi.intensity;
    void tween(0.8, (k) => (world.hemi.intensity = h0 * (1 - 0.7 * k)));
    await wait(1);
    // Stand up and turn to the door
    const p0 = camera.position.clone();
    const up = new THREE.Vector3(0.15, 1.62, 0.42);
    tYaw = -1.25;
    tPitch = -0.05;
    await tween(1.4, (k) => camera.position.lerpVectors(p0, up, k));
    sfx.creak();
    const door = part('door');
    await tween(1.3, (k) => (door.rotation.y = -1.35 * k), easeOut);
    sfx.steps();
    const fade = $('[data-mn-fade]');
    fade.hidden = false;
    void fade.offsetWidth;
    fade.classList.add('is-on');
    const out = new THREE.Vector3(1.25, 1.62, 0.36);
    await tween(1.8, (k) => camera.position.lerpVectors(up, out, k));
    await wait(0.6);
    await credits();
    tomorrow = await noteForTomorrow();
    save();
    fade.classList.remove('is-on');
    setTimeout(() => (fade.hidden = true), 1200);
  }

  function credits() {
    const box = $('[data-mn-credits]');
    box.hidden = false;
    return new Promise<void>((done) => {
      const end = () => {
        box.hidden = true;
        clearTimeout(timer);
        done();
      };
      const timer = window.setTimeout(end, 19000);
      box.querySelector('[data-mn-skip]')!.addEventListener('click', end, { once: true });
    });
  }

  function noteForTomorrow() {
    const box = $('[data-mn-tomorrow]');
    const input = box.querySelector<HTMLTextAreaElement>('textarea')!;
    box.hidden = false;
    input.focus();
    return new Promise<string>((done) => {
      const end = (text: string) => {
        box.hidden = true;
        done(text.trim().slice(0, 60));
      };
      box.querySelector('[data-mn-stick]')!.addEventListener('click', () => end(input.value), { once: true });
      box.querySelector('[data-mn-nonote]')!.addEventListener('click', () => end(''), { once: true });
    });
  }

  /** A data URL (the result card) as a file to share. */
  function dataUrlFile(url: string, name: string) {
    const [head, data] = url.split(',');
    const type = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/png';
    const bin = atob(data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], `${name}.${type.split('/')[1] ?? 'png'}`, { type });
  }

  async function showDone(after: string) {
    const secs = Math.round(playTime);
    const t = fmt(secs);
    const rank = rankOf(secs);
    const box = $('[data-mn-done]');
    box.querySelector('[data-mn-done-sub]')!.textContent = S.doneSub.replace('{t}', t);
    box.querySelector('[data-mn-done-rank]')!.textContent = S.doneRank.replace('{rank}', rank);
    box.hidden = false;
    hintEl.textContent = '';
    $('[data-mn-start]').hidden = true;
    const total = NOTES.length;
    const card = await makeCard({
      before: store.get(BEFORE_KEY),
      after,
      cleared: S.card.cleared.replace('{n}', String(total)).replace('{t}', t),
      rank: S.card.rank.replace('{rank}', rank),
      labels: { before: S.card.before, after: S.card.after },
      title: S.title,
      tomorrow: tomorrow ? { label: S.finale.tomorrowLabel, text: tomorrow } : undefined,
    });
    const img = box.querySelector<HTMLImageElement>('[data-mn-shot]')!;
    img.src = card;
    img.hidden = false;
    const saveLink = box.querySelector<HTMLAnchorElement>('[data-mn-save]')!;
    saveLink.href = card;
    const text = `${S.shareText.replace('{n}', String(total)).replace('{t}', t).replace('{rank}', rank)} ${URL}`;
    box.querySelector('[data-mn-share]')!.addEventListener(
      'click',
      async () => {
        // The picture as a file, made straight from its data URL: fetch() of a data: URL
        // is blocked by the site's CSP (connect-src 'self'), which broke sharing live
        const file = dataUrlFile(card, '2-many-notes');
        if (navigator.share) {
          try {
            if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text });
            else await navigator.share({ text, url: URL });
            return;
          } catch (e) {
            // Closed the share sheet: that was the answer, nothing to copy
            if ((e as Error).name === 'AbortError') return;
          }
        }
        try {
          await navigator.clipboard.writeText(text);
          toast(S.copied);
        } catch {
          toast(S.shareFailed);
        }
      },
      { signal: ac.signal },
    );
  }

  if (finished) {
    mode = 'done';
    const after = store.get(AFTER_KEY);
    if (after) void showDone(after);
  }

  // Save when leaving the page (and every few seconds while playing)
  window.addEventListener('pagehide', save, { signal: ac.signal });
  const saver = window.setInterval(() => {
    if (mode !== 'start' && mode !== 'done') save();
  }, 5000);

  /* ---- the list of notes (pause) ------------------------------------------------------------------- */

  const listBox = $('[data-mn-listbox]');
  const listBtn = $<HTMLButtonElement>('[data-mn-list]');
  let listFrom: Mode = 'free';
  const COLOR_HEX: Record<string, string> = { yellow: '#ffe76a', pink: '#ff9fc6', blue: '#8fd0ff' };
  function openList() {
    if (busy || !['free', 'zoom'].includes(mode)) return;
    listFrom = mode;
    mode = 'list';
    const items = listBox.querySelector('[data-mn-items]')!;
    items.textContent = '';
    const inSight = [...notes.values()].filter((n) => n.shown && !n.done);
    for (const n of inSight) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const chip = document.createElement('i');
      chip.style.background = COLOR_HEX[n.def.color];
      b.append(chip, document.createTextNode(S.notes[n.def.id as keyof typeof S.notes] ?? n.def.id));
      b.title = S.list.go;
      b.addEventListener('click', () => {
        closeList();
        void showNote(n.def.id);
      });
      li.append(b);
      items.append(li);
    }
    if (!inSight.length) {
      const li = document.createElement('li');
      li.textContent = S.list.empty;
      items.append(li);
    }
    const more = left() - inSight.length;
    listBox.querySelector('[data-mn-more]')!.textContent = more > 0 ? S.list.hidden.replace('{n}', String(more)) : '';
    listBox.hidden = false;
    listBtn.setAttribute('aria-expanded', 'true');
    listBox.querySelector<HTMLButtonElement>('[data-mn-list-close]')!.focus();
  }
  function closeList() {
    if (mode !== 'list') return;
    mode = listFrom;
    listBox.hidden = true;
    listBtn.setAttribute('aria-expanded', 'false');
  }

  /** Turns the camera towards a note and makes it pulse for a moment. */
  async function showNote(id: string) {
    const n = notes.get(id)!;
    if (mode === 'zoom' && !n.def.screen && n.def.color !== 'pink') await exitZoom();
    if (mode === 'zoom') return;
    const at = new THREE.Vector3();
    n.mesh.getWorldPosition(at);
    const d = at.sub(camera.position);
    tYaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, Math.atan2(-d.x, -d.z)));
    tPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, Math.atan2(d.y, Math.hypot(d.x, d.z))));
    readAt.set(id, playTime - STALE_AFTER);
    const m = n.mesh.material as THREE.MeshLambertMaterial;
    const base = m.emissive.clone();
    await tween(1.6, (k) => m.emissive.copy(base).lerp(new THREE.Color('#ffffff'), Math.abs(Math.sin(k * Math.PI * 3)) * 0.6), linear);
    m.emissive.copy(base);
  }

  on(listBtn, 'click', () => (mode === 'list' ? closeList() : openList()));
  on($('[data-mn-list-close]'), 'click', closeList);

  /* ---- phase 5 controls ---------------------------------------------------------------------------- */

  // The counter is a note too
  on(countEl, 'click', () => {
    if (mode === 'start' || mode === 'done' || isDone('counter')) return;
    sfx.rip();
    toast(S.toasts.counterNote);
    void complete('counter');
  });
  on(flipEl, 'click', () => void flipNote());
  // Swipe a wheel up or down to turn it
  lockEl.querySelectorAll<HTMLElement>('[data-mn-digit]').forEach((el, i) => {
    let sy: number | null = null;
    on(el, 'pointerdown', (e) => {
      sy = e.clientY;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* fine */
      }
    });
    on(el, 'pointermove', (e) => {
      if (sy === null) return;
      const steps = Math.trunc((sy - e.clientY) / 22);
      if (!steps) return;
      sy -= steps * 22;
      digits[i] = (((digits[i] + steps) % 10) + 10) % 10;
      sfx.click();
      drawLock();
    });
    on(el, 'pointerup', () => (sy = null));
    on(el, 'pointercancel', () => (sy = null));
  });
  lockEl.querySelectorAll<HTMLButtonElement>('[data-mn-up], [data-mn-down]').forEach((b) =>
    on(b, 'click', () => {
      const i = Number(b.dataset.i);
      digits[i] = (digits[i] + (b.dataset.mnUp !== undefined ? 1 : 9)) % 10;
      sfx.click();
      drawLock();
    }),
  );
  on($('[data-mn-lock-open]'), 'click', () => void tryLock());
  on($('[data-mn-lock-close]'), 'click', closeLock);

  /* ---- settings ------------------------------------------------------------------------------- */

  type Opt = 'sound' | 'music' | 'effects' | 'wobble';
  const opts: Record<Opt, boolean> = { sound: true, music: true, effects: look.effects, wobble: false };
  let lookPick: LookName = 'pixel';
  try {
    const got = JSON.parse(store.get(SETTINGS_KEY) ?? '{}') as Partial<Record<Opt, boolean>> & { look?: LookName };
    if (got.look && LOOKS.includes(got.look)) lookPick = got.look;
    delete got.look;
    Object.assign(opts, got);
  } catch {
    /* defaults */
  }
  const lookBtn = $<HTMLButtonElement>('[data-mn-look]');
  const saveOpts = () => store.set(SETTINGS_KEY, JSON.stringify({ ...opts, look: lookPick }));
  const panel = $('[data-mn-panel]');
  const setBtn = $<HTMLButtonElement>('[data-mn-set]');
  function applyOpts() {
    setSound(opts.sound);
    setMusic(opts.music);
    look.setEffects(opts.effects);
    look.setWobble(opts.wobble);
    look.setLook(lookPick);
    lookBtn.querySelector('[data-mn-val]')!.textContent = S.settings.looks[lookPick];
    panel.querySelectorAll<HTMLButtonElement>('[data-mn-opt]').forEach((b) => {
      const on = opts[b.dataset.mnOpt as Opt];
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('[data-mn-val]')!.textContent = on ? S.settings.on : S.settings.off;
    });
  }
  applyOpts();
  on(setBtn, 'click', () => {
    panel.hidden = !panel.hidden;
    setBtn.setAttribute('aria-expanded', String(!panel.hidden));
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-mn-opt]').forEach((b) =>
    on(b, 'click', () => {
      const k = b.dataset.mnOpt as Opt;
      opts[k] = !opts[k];
      saveOpts();
      applyOpts();
    }),
  );
  on(lookBtn, 'click', () => {
    lookPick = LOOKS[(LOOKS.indexOf(lookPick) + 1) % LOOKS.length];
    saveOpts();
    applyOpts();
  });

  /* ---- loop ---------------------------------------------------------------------------------- */

  let last = performance.now();
  let raf = 0;
  let ringClock = 0;
  let phoneClock = 0;
  let rainClock = 0;
  let hintClock = 0;
  let hintTurn = 0;
  let focusClock = 0;
  let headTilt = 0;
  const center = new THREE.Vector2();
  /** What the eye rests on: the thing up close, the note, the screen, or what is in the middle of the view. */
  function focusDistance() {
    if (mode === 'reading') return READ_POS.length();
    if (atMonitor()) return camera.position.distanceTo(SCREEN_AT);
    // A thing in your hand that you are using (the mug at your mouth): that is what the eye looks at
    if (gest && gest.g.at.parent === camera) return gest.g.at.position.length();
    if (focusId && (mode === 'focus' || mode === 'gesture')) return camera.position.distanceTo(focusPose(focusId).at);
    ray.setFromCamera(center.set(0, 0), camera);
    for (const h of ray.intersectObjects(scene.children, true)) {
      if (!visible(h.object) || h.object.userData.shadow || !(h.object instanceof THREE.Mesh)) continue;
      if ((h.object.material as THREE.Material).visible === false) continue;
      return h.distance;
    }
    return 3;
  }
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const playing = mode === 'free' || mode === 'zoom' || mode === 'focus' || mode === 'reading' || mode === 'gesture';
    if (playing && !document.hidden) playTime += dt;
    // Turning: edge of the screen (mouse), drag handled in the events
    if (mode === 'free' && mouse && !drag && !busy) {
      tYaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, tYaw - edge(mouse.x) * 1.3 * dt));
      tPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, tPitch - edge(mouse.y) * 1.0 * dt));
    }
    const s = Math.min(1, dt * 9);
    yaw += (tYaw - yaw) * s;
    pitch += (tPitch - pitch) * s;
    const jit = () => (Math.random() - 0.5) * 2 * shakeAmt;
    headTilt += (headTiltWant - headTilt) * Math.min(1, dt * 5);
    camera.rotation.set(pitch + headTilt + jit(), yaw + jit(), jit() * 0.5);
    shakeAmt *= Math.exp(-dt * 5);
    if (mode === 'free' && !busy) camera.position.y = eye.y;
    if (playing && callbackT > 0) {
      const before = Math.ceil(callbackT);
      callbackT -= dt;
      if (Math.ceil(callbackT) !== before && callbackT > CALLBACK_SECS - 6) sfx.ring();
      if (notes.get('callback')!.shown) callbackText();
    } else if (callbackT === 0 && notes.get('callback')!.shown && !isDone('callback')) callbackText();
    // Only hidden notes left: a hint now and then
    if (mode === 'free' && left() > 0) {
      hintClock += dt;
      if (hintClock > HINT_EVERY) {
        hintClock = 0;
        if (![...notes.values()].some((n) => n.shown && !n.done)) {
          const hidden = [...notes.values()].filter((n) => !n.done && !n.shown).map((n) => n.def.id);
          const id = hidden[hintTurn++ % hidden.length];
          toast((S.hints as Record<string, string>)[id] ?? S.hints.other);
        }
      }
    }
    rainClock -= dt;
    if (rainClock <= 0) {
      rainClock = 0.5;
      ambience.setRain(look.rain, windowOpen);
    }
    // The phone rings now and then until it is answered
    if (playing && !isDone('phone')) {
      phoneClock += dt;
      if (!ringing && phoneClock > nextRing) {
        shake(0.012);
        ringing = 6;
        ringClock = 0;
        nextRing = phoneClock + 26;
      }
      if (ringing > 0) {
        ringing = Math.max(0, ringing - dt);
        ringClock -= dt;
        if (ringClock <= 0) {
          sfx.ring();
          ringClock = 1.3;
        }
        if (world.handset.parent !== camera) world.handset.rotation.z = Math.sin(now / 25) * 0.08 * Math.min(1, ringing);
      } else if (world.handset.parent !== camera) world.handset.rotation.z = 0;
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.step(tw.ease(k));
      if (k >= 1) {
        tweens.splice(i, 1);
        tw.done();
      }
    }
    os.tick(dt);
    focusClock -= dt;
    if (focusClock <= 0) {
      focusClock = 0.12;
      // Sitting back only the far room goes a little soft; up close and reading, everything else does
      look.setFocus(focusDistance(), mode === 'free' ? 0.25 : 1);
    }
    if (gest) gest.g.tick?.(dt);
    drawGuide();
    hover();
    look.render(dt);
    raf = requestAnimationFrame(frame);
  }

  resize();
  count(false);
  raf = requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });

  // Local development only: lets tests do things without the mouse
  if (import.meta.env.DEV) {
    (window as unknown as { manyNotes: unknown }).manyNotes = {
      camera,
      notes,
      use,
      click,
      complete,
      left,
      state: () => ({ mode, held, reading, busy, ringing, lampOn, windowOpen, pensTried: [...pensTried], workingPen, events: [...events], playTime, radioOn: radio.on, drawerOut: [...drawerOut] }),
      look: (y: number, p: number) => {
        tYaw = y;
        tPitch = p;
      },
      ring: () => (nextRing = 0),
      os,
      lookFx: look,
      pick: pickAt,
      obj: (id: string) => world.objects.get(id),
      gesture: () => (gest ? { text: gest.g.text, moved: gest.moved } : null),
      hits: (x: number, y: number) => {
        ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        return ray.intersectObjects(scene.children, true).slice(0, 5).map((h) => {
          const names: string[] = [];
          for (let o: THREE.Object3D | null = h.object; o && names.length < 4; o = o.parent) names.push(o.userData.id ?? o.userData.note ?? (o as THREE.Mesh).geometry?.type ?? o.type);
          return `${h.distance.toFixed(2)} ${names.join('<')}`;
        });
      },
      screenLocal: (id: string, x: number, y: number, z: number) => {
        const v = world.objects.get(id)!.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
      },
      code,
      happen,
      zoom: () => (mode === 'zoom' ? exitZoom() : enterZoom()),
      focus: (id: string) => enterFocus(id),
      setLook: (name: LookName) => {
        lookPick = name;
        applyOpts();
      },
      unfocus: () => exitFocus(),
      focusId: () => focusId,
      /** Things that stick into each other (Update 2): pairs of owners and how many test points are inside. */
      overlaps: async () => {
        const { findOverlaps } = await import('./overlaps');
        return findOverlaps(scene, (o) => {
          for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p.userData.note || p.userData.shadow || p.userData.joins) return true;
          return false;
        });
      },
      pose: (id: string) => {
        const f = focusPose(id);
        return { pos: f.pos.toArray().map((v) => +v.toFixed(2)), yaw: +f.yaw.toFixed(2), pitch: +f.pitch.toFixed(2), cam: camera.position.toArray().map((v) => +v.toFixed(2)), y: +yaw.toFixed(2), p: +pitch.toFixed(2) };
      },
      event: (name: string) => {
        events.add(name);
        appear(true);
      },
      screen: (id: string) => {
        const o = world.objects.get(id) ?? notes.get(id)?.mesh;
        if (!o) return null;
        const v = new THREE.Vector3();
        o.getWorldPosition(v);
        v.project(camera);
        return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
      },
    };
  }

  return () => {
    save();
    ac.abort();
    cancelAnimationFrame(raf);
    clearInterval(saver);
    radio.stop();
    ambience.stop();
    renderer.dispose();
  };
}
