/**
 * 2 Many Notes: DeskOS 98, the computer on the desk. Drawn on a 2D canvas
 * (512 × 384 logical px, drawn at 2× so text stays sharp up close) that the
 * game puts on the monitor's screen as a texture; clicks arrive as texture
 * coordinates (uv) from the raycast. Notes stuck on the screen sit in front of
 * it, so only the parts that are free can be clicked.
 *
 * States: off → boot (CRT line, logo, progress) → login (the password is the
 * plant's name) → desktop. Each finished job calls hooks.done(noteId); the
 * game tears off that note (or remembers it, if the note has not shown up yet).
 *
 * Apps (phase 3): Mail (reply to Karen / the boss / Mum, delete the spam,
 * unsubscribe, rate IT), Sheets (the coffee budget + Save), Printer (needs
 * paper in the real printer), Calendar (book the meeting room), Wallpaper,
 * Update (runs for a while, then restart), Change password, Trash, junk icons
 * on the desktop, pop-ups after logging in, a ding every now and then (mute
 * it in the taskbar). Our own look: beige windows, plum title bars, a logo of
 * three fanned sticky notes.
 *
 * snapshot()/restore() keep everything for the save game.
 */
import * as THREE from 'three';
import type { ManyNotesStrings } from './game';
import { sfx } from './audio';

type OS = ManyNotesStrings['os'];

export interface DeskOSHooks {
  /** A job is done: the note with this id. */
  done(id: string): void;
  /** Something happened that brings new notes ("@boss": the boss's mail was read). */
  event(name: string): void;
  /** The Print button: the real printer on the cabinet should print. */
  print(): void;
  /** Typing wanted (focus the hidden input, cleared) or not any more; numeric = digits keyboard. */
  wantKeys(on: boolean, numeric?: boolean): void;
  /** The login box just appeared (after starting up). */
  onLoginShown(): void;
}

export const OS_W = 512;
export const OS_H = 384;
const PR = 2;
const PASSWORD = 'gerald';
const UPDATE_SECS = 45;
const DING_EVERY = 24;
const FONT = 'Tahoma, Verdana, "Segoe UI", sans-serif';
const C = {
  face: '#d6d0c2',
  faceHot: '#e6e1d4',
  light: '#fbf8f0',
  shadow: '#8a8476',
  title1: '#7d2a55',
  title2: '#c0578a',
  text: '#1d1c1a',
  muted: '#7d786c',
  red: '#b3261e',
  green: '#2f7a3a',
  link: '#1f4fb0',
  busy: '#b9b2a2',
};
const NOTE_COLORS = ['#8fd0ff', '#ff9fc6', '#ffe76a'];
/** Wallpapers: Grey Mood (the depressing start), Sunset, Ocean, Meadow. */
const WALLS: [string, string][] = [
  ['#6f7276', '#5e6165'],
  ['#ffc785', '#d9607a'],
  ['#3d93bd', '#1b3b6f'],
  ['#8cbf6e', '#3d7a3a'],
];
/** Junk icons on the desktop (x, y). */
const JUNK_AT: [number, number][] = [
  [404, 22],
  [300, 112],
  [410, 196],
  [318, 262],
];
/** Pop-ups after logging in (x, y). */
const POPUP_AT: [number, number][] = [
  [150, 34],
  [286, 120],
  [64, 196],
  [262, 238],
];
/** Calendar: busy hours per day (Mon–Fri), hour → label index. Thursday afternoon has one free hour (15:00). */
const BUSY: Record<number, number>[] = [
  { 9: 0, 12: 1, 14: 3 },
  { 10: 4, 12: 1, 13: 0, 16: 3 },
  { 9: 2, 11: 0, 12: 1, 15: 4 },
  { 9: 0, 10: 3, 11: 4, 12: 1, 13: 0, 14: 2, 16: 3 },
  { 9: 3, 12: 1, 13: 2, 15: 0, 16: 0 },
];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

interface Btn {
  x: number;
  y: number;
  w: number;
  h: number;
  id: string;
  act: () => void;
}

export type DeskState = 'off' | 'boot' | 'login' | 'desktop';
type Win = 'mail' | 'sheets' | 'printer' | 'calendar' | 'wallpaper' | 'update' | 'newpass' | null;
type Field = 'pass' | 'newpass' | 'cell' | null;

export interface DeskSnapshot {
  on: boolean;
  loggedIn: boolean;
  replied: string[];
  deleted: string[];
  bossRead: boolean;
  unsub: boolean;
  muted: boolean;
  wallpaper: number;
  trashEmpty: boolean;
  junk: number[];
  popups: number[];
  update: 'none' | 'ready' | 'running' | 'restart' | 'done';
  updateP: number;
  cell: string;
  sheetsOk: boolean;
  saved: boolean;
  paper: boolean;
  printed: boolean;
  booked: boolean;
  newpass: boolean;
  rated: boolean;
  survey: boolean;
  mailSeen: boolean;
  /** Phase 5: the boss's second mail (where the spare key is). */
  boss2?: boolean;
}

export function createDeskOS(T: OS, hooks: DeskOSHooks) {
  const canvas = document.createElement('canvas');
  canvas.width = OS_W * PR;
  canvas.height = OS_H * PR;
  const g = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const lines = patternOf(3, (p) => {
    p.fillStyle = 'rgba(0,0,0,0.07)';
    p.fillRect(0, 0, 3, 1);
  });
  const dots = patternOf(4, (p) => {
    p.fillStyle = 'rgba(0,0,0,0.1)';
    p.fillRect(0, 0, 1, 1);
    p.fillRect(2, 2, 1, 1);
  });

  // Everything that is saved
  const s: DeskSnapshot = {
    on: false,
    loggedIn: false,
    replied: [],
    deleted: [],
    bossRead: false,
    unsub: false,
    muted: false,
    wallpaper: 0,
    trashEmpty: false,
    junk: [0, 1, 2, 3],
    popups: [],
    update: 'none',
    updateP: 0,
    cell: '',
    sheetsOk: false,
    saved: false,
    paper: false,
    printed: false,
    booked: false,
    newpass: false,
    rated: false,
    survey: false,
    mailSeen: false,
  };

  // What is on screen right now
  let state: DeskState = 'off';
  let t = 0;
  let pass = '';
  let newpass = '';
  let field: Field = null;
  let loginMsg = '';
  let loginBad = false;
  let shake = -1;
  let win: Win = null;
  let menu = false;
  let dialog: { text: string; yes?: () => void } | null = null;
  let mail: string | null = null;
  let replying = false;
  let msg = '';
  let msgBad = false;
  let hoverId: string | null = null;
  let buttons: Btn[] = [];
  let dirty = true;
  let lastBlink = -1;
  let lastMinute = -1;
  let dingClock = DING_EVERY;
  let afterBoot: DeskState = 'login';

  /* ---- drawing helpers ------------------------------------------------------------------------ */

  function patternOf(size: number, paint: (p: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    paint(c.getContext('2d')!);
    return g.createPattern(c, 'repeat')!;
  }

  const font = (size: number, bold = false) => (g.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`);

  function text(str: string, x: number, y: number, size = 12, bold = false, color = C.text, align: CanvasTextAlign = 'left') {
    font(size, bold);
    g.fillStyle = color;
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(str, x, y);
    g.textAlign = 'left';
  }

  function bevel(x: number, y: number, w: number, h: number, raised = true, fill = C.face) {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    g.fillStyle = raised ? C.light : C.shadow;
    g.fillRect(x, y, w, 1.5);
    g.fillRect(x, y, 1.5, h);
    g.fillStyle = raised ? C.shadow : C.light;
    g.fillRect(x, y + h - 1.5, w, 1.5);
    g.fillRect(x + w - 1.5, y, 1.5, h);
  }

  /** Wrapped text (\n = new paragraph), top-aligned; returns the y below it. */
  function wrap(str: string, x: number, y: number, maxW: number, lh: number, size = 12, bold = false, color = C.text) {
    font(size, bold);
    g.fillStyle = color;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    let yy = y;
    for (const para of str.split('\n')) {
      if (!para) {
        yy += lh * 0.6;
        continue;
      }
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > maxW && line) {
          g.fillText(line, x, yy);
          yy += lh;
          line = word;
        } else line = next;
      }
      if (line) {
        g.fillText(line, x, yy);
        yy += lh;
      }
    }
    return yy;
  }

  function fit(str: string, maxW: number) {
    if (g.measureText(str).width <= maxW) return str;
    let r = str;
    while (r.length > 1 && g.measureText(`${r}…`).width > maxW) r = r.slice(0, -1);
    return `${r}…`;
  }

  const hit = (x: number, y: number, w: number, h: number, id: string, act: () => void) => buttons.push({ x, y, w, h, id, act });
  /** Takes clicks so they do not fall through a window onto what is under it. */
  const block = (x: number, y: number, w: number, h: number) => hit(x, y, w, h, 'block', () => {});

  function button(x: number, y: number, w: number, h: number, label: string, id: string, act: () => void, size = 12) {
    bevel(x, y, w, h, true, hoverId === id ? C.faceHot : C.face);
    text(label, x + w / 2, y + h / 2 + 0.5, size, true, C.text, 'center');
    hit(x, y, w, h, id, act);
  }

  /** The logo: three sticky notes fanned out, each with a scribble. */
  function logo(x: number, y: number, s: number) {
    const n = s * 0.62;
    NOTE_COLORS.forEach((c, i) => {
      g.save();
      g.translate(x + s * (0.36 + i * 0.14), y + s * (0.38 + i * 0.12));
      g.rotate(-0.32 + i * 0.3);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(-n / 2 + s * 0.03, -n / 2 + s * 0.04, n, n);
      g.fillStyle = c;
      g.fillRect(-n / 2, -n / 2, n, n);
      if (s >= 30) {
        g.fillStyle = 'rgba(40,40,60,0.55)';
        g.fillRect(-n * 0.32, -n * 0.08, n * 0.6, Math.max(1, s * 0.035));
        g.fillRect(-n * 0.32, n * 0.12, n * 0.42, Math.max(1, s * 0.035));
      }
      g.restore();
    });
  }

  function windowFrame(x: number, y: number, w: number, h: number, title: string, onClose?: () => void, id = 'win') {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x + 4, y + 4, w, h);
    bevel(x, y, w, h);
    block(x, y, w, h);
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, C.title1);
    grad.addColorStop(1, C.title2);
    g.fillStyle = grad;
    g.fillRect(x + 3, y + 3, w - 6, 20);
    logo(x + 6, y + 5, 16);
    font(12, true);
    text(fit(title, w - 56), x + 27, y + 13.5, 12, true, '#fff');
    if (onClose) button(x + w - 21, y + 5, 16, 16, '×', `${id}-close`, onClose, 14);
  }

  function setMsg(m: string, bad = false) {
    msg = m;
    msgBad = bad;
    if (bad) sfx.error();
  }

  /* ---- icons ---------------------------------------------------------------------------------- */

  function icon(id: string, x: number, y: number) {
    g.save();
    g.translate(x, y);
    g.lineWidth = 1.5;
    g.strokeStyle = '#1d1c1a';
    if (id === 'mail') {
      g.fillStyle = '#f7f3e6';
      g.fillRect(2, 8, 32, 22);
      g.strokeRect(2, 8, 32, 22);
      g.beginPath();
      g.moveTo(2, 8);
      g.lineTo(18, 21);
      g.lineTo(34, 8);
      g.stroke();
    } else if (id === 'sheets') {
      g.fillStyle = '#f4f8ef';
      g.fillRect(5, 3, 26, 30);
      g.strokeRect(5, 3, 26, 30);
      g.fillStyle = '#2f7a3a';
      g.fillRect(5, 3, 26, 6);
      g.strokeStyle = '#86a98a';
      g.lineWidth = 1;
      for (let i = 1; i < 4; i++) {
        g.beginPath();
        g.moveTo(5, 9 + i * 6);
        g.lineTo(31, 9 + i * 6);
        g.moveTo(5 + i * 6.5, 9);
        g.lineTo(5 + i * 6.5, 33);
        g.stroke();
      }
    } else if (id === 'printer') {
      g.fillStyle = '#fff';
      g.fillRect(10, 2, 16, 12);
      g.strokeRect(10, 2, 16, 12);
      g.fillStyle = '#9b968a';
      g.fillRect(3, 13, 30, 14);
      g.strokeRect(3, 13, 30, 14);
      g.fillStyle = s.paper ? '#5ac35a' : '#e0453a';
      g.fillRect(27, 17, 3, 3);
      g.fillStyle = '#fff';
      g.fillRect(9, 25, 18, 8);
      g.strokeRect(9, 25, 18, 8);
    } else if (id === 'trash') {
      g.fillStyle = '#9aa5ae';
      g.beginPath();
      g.moveTo(6, 10);
      g.lineTo(30, 10);
      g.lineTo(27, 34);
      g.lineTo(9, 34);
      g.closePath();
      g.fill();
      g.stroke();
      if (!s.trashEmpty)
        (
          [
            [12, 8, '#ffe76a'],
            [20, 5, '#ff9fc6'],
            [26, 9, '#8fd0ff'],
            [17, 2, '#ffe76a'],
          ] as [number, number, string][]
        ).forEach(([cx, cy, c]) => {
          g.fillStyle = c;
          g.beginPath();
          g.arc(cx, cy, 4, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        });
    } else if (id === 'folder') {
      g.fillStyle = '#f1c94a';
      g.fillRect(3, 8, 30, 22);
      g.fillRect(3, 5, 12, 5);
      g.strokeRect(3, 8, 30, 22);
    } else {
      // A file with a folded corner
      g.fillStyle = '#fff';
      g.beginPath();
      g.moveTo(7, 2);
      g.lineTo(23, 2);
      g.lineTo(30, 9);
      g.lineTo(30, 34);
      g.lineTo(7, 34);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#c9c2b0';
      for (let i = 0; i < 4; i++) g.fillRect(11, 14 + i * 5, 14, 1.5);
    }
    g.restore();
  }

  function desktopIcon(id: string, kind: string, label: string, x: number, y: number, act: () => void, badge = '') {
    const w = 100;
    const h = 66;
    if (hoverId === id) {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(x, y, w, h);
    }
    icon(kind, x + w / 2 - 18, y + 4);
    font(11, true);
    const l = fit(label, w - 4);
    text(l, x + w / 2 + 1, y + 55, 11, true, 'rgba(0,0,0,0.6)', 'center');
    text(l, x + w / 2, y + 54, 11, true, '#fff', 'center');
    if (badge) {
      g.fillStyle = C.red;
      g.beginPath();
      g.arc(x + w / 2 + 18, y + 8, 8, 0, Math.PI * 2);
      g.fill();
      text(badge, x + w / 2 + 18, y + 8.5, 10, true, '#fff', 'center');
    }
    hit(x, y, w, h, id, act);
  }

  /* ---- screens ---------------------------------------------------------------------------------- */

  function drawOff() {
    g.fillStyle = '#0c0e0f';
    g.fillRect(0, 0, OS_W, OS_H);
    const r = g.createLinearGradient(0, 0, OS_W * 0.7, OS_H);
    r.addColorStop(0, 'rgba(255,255,255,0.08)');
    r.addColorStop(0.4, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, OS_W, OS_H);
  }

  function drawBoot() {
    g.fillStyle = '#000';
    g.fillRect(0, 0, OS_W, OS_H);
    if (t < 0.35) {
      // The tube warms up: a bright line that opens into the picture
      const k = t / 0.35;
      const h = Math.max(2, k * k * OS_H);
      g.fillStyle = `rgba(235,245,255,${1 - k * 0.7})`;
      g.fillRect(0, OS_H / 2 - h / 2, OS_W, h);
      return;
    }
    logo(OS_W / 2 - 30, 92, 60);
    text(T.name, OS_W / 2, 196, 30, true, '#fff', 'center');
    text(T.starting, OS_W / 2, 224, 13, false, '#b9b4a8', 'center');
    g.strokeStyle = '#6d695f';
    g.lineWidth = 1;
    g.strokeRect(OS_W / 2 - 90.5, 244.5, 181, 15);
    const n = Math.floor(Math.min(1, (t - 0.35) / 1.9) * 15);
    g.fillStyle = C.title2;
    for (let i = 0; i < n; i++) g.fillRect(OS_W / 2 - 88 + i * 12, 247, 10, 10);
  }

  function drawBackground() {
    const [a, b] = WALLS[s.wallpaper];
    const grad = g.createLinearGradient(0, 0, 0, OS_H);
    grad.addColorStop(0, a);
    grad.addColorStop(1, b);
    g.fillStyle = grad;
    g.fillRect(0, 0, OS_W, OS_H);
    g.fillStyle = dots;
    g.fillRect(0, 0, OS_W, OS_H);
    g.globalAlpha = 0.16;
    logo(OS_W / 2 - 44, OS_H / 2 - 64, 88);
    g.globalAlpha = 1;
  }

  /** A text field; the caret blinks while it is the one being typed into. */
  function inputField(x: number, y: number, w: number, value: string, f: Field, secret = false) {
    const on = field === f;
    bevel(x, y, w, 20, false, hoverId === `field-${f}` && !on ? '#fffdf4' : '#ffffff');
    let cw = 0;
    if (value) {
      const shown = secret ? '•'.repeat(value.length) : value;
      text(shown, x + 6, y + 10.5, secret ? 15 : 13, secret, C.text);
      font(secret ? 15 : 13, secret);
      cw = g.measureText(shown).width;
    } else if (!on) text(T.typeHere, x + 6, y + 10.5, 11, false, C.muted);
    if (on && Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = C.text;
      g.fillRect(x + 7 + cw, y + 3, 1.5, 14);
    }
    hit(x, y, w, 20, `field-${f}`, () => setField(f));
  }

  function drawLogin() {
    const dx = shake >= 0 ? Math.sin(shake * 70) * 5 * (1 - shake / 0.35) : 0;
    const x = 136 + dx;
    const y = 104;
    const w = 240;
    const h = 166;
    windowFrame(x, y, w, h, T.loginTitle);
    text(T.user, x + 14, y + 47, 13);
    bevel(x + 98, y + 37, 128, 20, false, '#e9e5da');
    text(T.userName, x + 104, y + 47.5, 13, false, '#55524a');
    text(T.password, x + 14, y + 77, 13);
    inputField(x + 98, y + 67, 128, pass, 'pass', true);
    if (loginMsg) wrap(loginMsg, x + 14, y + 98, w - 28, 13, 11, loginBad, loginBad ? C.red : C.text);
    button(x + w - 150, y + h - 34, 64, 24, T.ok, 'ok', submitLogin);
    button(x + w - 78, y + h - 34, 64, 24, T.help, 'help', () => {
      loginMsg = T.helpText;
      loginBad = false;
    });
  }

  function drawDesktop() {
    // Junk icons first (windows go over them)
    s.junk.forEach((i) => {
      const [x, y] = JUNK_AT[i];
      desktopIcon(`junk${i}`, i === 0 ? 'folder' : 'file', T.junk[i], x, y, () => {
        s.junk = s.junk.filter((j) => j !== i);
        sfx.crumple();
        if (!s.junk.length) hooks.done('icons');
      });
    });
    const unread = !s.replied.includes('karen') || (s.survey && !s.rated);
    desktopIcon('mail', 'mail', T.mail, 14, 14, () => openWin('mail'), unread ? '!' : '');
    desktopIcon('sheets', 'sheets', T.sheets, 14, 94, () => openWin('sheets'));
    desktopIcon('printer', 'printer', T.printer, 14, 174, () => openWin('printer'));
    desktopIcon('trash', 'trash', T.trash, 14, 254, () => {
      if (s.trashEmpty) dialog = { text: T.trashEmpty };
      else
        dialog = {
          text: T.trashAsk,
          yes: () => {
            s.trashEmpty = true;
            sfx.crumple();
            hooks.done('trash');
          },
        };
    });
    drawTaskbar();
    // The update balloon only when no window is open (it would sit on their buttons)
    if ((s.update === 'ready' || s.update === 'restart') && !win) drawBalloon();
    if (win === 'mail') drawMail();
    else if (win === 'sheets') drawSheets();
    else if (win === 'printer') drawPrinter();
    else if (win === 'calendar') drawCalendar();
    else if (win === 'wallpaper') drawWallpaper();
    else if (win === 'update') drawUpdate();
    else if (win === 'newpass') drawNewpass();
    drawPopups();
    if (dialog) drawDialog();
    if (menu) drawMenu();
  }

  function drawTaskbar() {
    const y = OS_H - 26;
    bevel(0, y, OS_W, 26);
    block(0, y, OS_W, 26);
    bevel(3, y + 3, 64, 20, !menu, hoverId === 'start' ? C.faceHot : C.face);
    logo(7, y + 5, 16);
    text(T.start, 27, y + 13.5, 13, true);
    hit(3, y + 3, 64, 20, 'start', () => (menu = !menu));
    if (win) {
      const names: Record<string, string> = {
        mail: T.mail,
        sheets: T.sheets,
        printer: T.printer,
        calendar: T.menu.calendar,
        wallpaper: T.wallpaperTitle,
        update: T.updateTitle,
        newpass: T.newPassTitle,
      };
      bevel(72, y + 3, 120, 20, false, '#e9e5da');
      font(11, true);
      text(fit(names[win], 108), 79, y + 13.5, 11, true);
    }
    if (s.update === 'running') {
      font(10);
      text(T.updating.replace('{p}', String(Math.floor(s.updateP * 100))), 200, y + 13.5, 10, false, C.muted);
    }
    // Tray: speaker (mute) and clock
    const sx = OS_W - 86;
    bevel(sx, y + 3, 22, 20, false, hoverId === 'speaker' ? '#f3efe4' : C.face);
    g.fillStyle = C.text;
    g.beginPath();
    g.moveTo(sx + 5, y + 10);
    g.lineTo(sx + 8, y + 10);
    g.lineTo(sx + 12, y + 6);
    g.lineTo(sx + 12, y + 20);
    g.lineTo(sx + 8, y + 16);
    g.lineTo(sx + 5, y + 16);
    g.closePath();
    g.fill();
    g.strokeStyle = s.muted ? C.red : C.text;
    g.lineWidth = 1.3;
    g.beginPath();
    if (s.muted) {
      g.moveTo(sx + 14, y + 9);
      g.lineTo(sx + 19, y + 17);
      g.moveTo(sx + 19, y + 9);
      g.lineTo(sx + 14, y + 17);
    } else {
      g.arc(sx + 12, y + 13, 4, -0.8, 0.8);
      g.moveTo(sx + 18, y + 7);
      g.arc(sx + 12, y + 13, 7, -0.8, 0.8);
    }
    g.stroke();
    hit(sx, y + 3, 22, 20, 'speaker', () => {
      s.muted = !s.muted;
      if (s.muted) hooks.done('mute');
    });
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    bevel(OS_W - 60, y + 3, 57, 20, false);
    text(clock, OS_W - 31.5, y + 13.5, 12, false, C.text, 'center');
  }

  function drawMenu() {
    const items: [string, string, () => void][] = [
      ['m-wall', T.menu.wallpaper, () => openWin('wallpaper')],
      ['m-cal', T.menu.calendar, () => openWin('calendar')],
      ['m-upd', T.menu.update, () => openWin('update')],
      ['m-pass', T.menu.password, () => openWin('newpass')],
      ['m-off', T.menu.shutdown, () => (dialog = { text: T.shutdownMsg })],
    ];
    const w = 170;
    const h = items.length * 26 + 8;
    const x = 3;
    const y = OS_H - 26 - h;
    bevel(x, y, w, h);
    block(x, y, w, h);
    g.fillStyle = C.title1;
    g.fillRect(x + 3, y + 3, 18, h - 6);
    items.forEach(([id, label, act], i) => {
      const iy = y + 4 + i * 26;
      if (hoverId === id) {
        g.fillStyle = C.title2;
        g.fillRect(x + 23, iy, w - 26, 26);
      }
      text(label, x + 30, iy + 13, 12, false, hoverId === id ? '#fff' : C.text);
      hit(x + 23, iy, w - 26, 26, id, () => {
        menu = false;
        act();
      });
    });
  }

  function drawDialog() {
    const d = dialog!;
    const x = 116;
    const y = 128;
    const w = 280;
    const h = 124;
    windowFrame(x, y, w, h, T.name, () => (dialog = null), 'dlg');
    g.fillStyle = '#2d5f9a';
    g.beginPath();
    g.arc(x + 30, y + 52, 13, 0, Math.PI * 2);
    g.fill();
    text(d.yes ? '?' : 'i', x + 30, y + 53, 16, true, '#fff', 'center');
    wrap(d.text, x + 56, y + 38, w - 72, 16, 13);
    if (d.yes) {
      const yes = d.yes;
      button(x + w / 2 - 74, y + h - 32, 68, 24, T.yes, 'dlg-yes', () => {
        dialog = null;
        yes();
      });
      button(x + w / 2 + 6, y + h - 32, 68, 24, T.no, 'dlg-no', () => (dialog = null));
    } else button(x + w / 2 - 34, y + h - 32, 68, 24, T.ok, 'dlg-ok', () => (dialog = null));
  }

  function drawPopups() {
    s.popups.forEach((i) => {
      const [x, y] = POPUP_AT[i];
      const w = 196;
      const h = 82;
      windowFrame(x, y, w, h, T.name, () => {
        s.popups = s.popups.filter((j) => j !== i);
        if (!s.popups.length) hooks.done('popups');
      }, `pop${i}`);
      g.fillStyle = '#e0a526';
      g.beginPath();
      g.moveTo(x + 22, y + 34);
      g.lineTo(x + 34, y + 56);
      g.lineTo(x + 10, y + 56);
      g.closePath();
      g.fill();
      text('!', x + 22, y + 49, 13, true, '#fff', 'center');
      wrap(T.popups[i], x + 44, y + 32, w - 54, 14, 11);
    });
  }

  function drawBalloon() {
    const x = OS_W - 196;
    const y = OS_H - 26 - 52;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 3, y + 3, 180, 44);
    g.fillStyle = '#fffbe2';
    g.fillRect(x, y, 180, 44);
    g.strokeStyle = '#6d695f';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, 179, 43);
    const restart = s.update === 'restart';
    text(restart ? T.updated : T.updateReady, x + 10, y + 15, 12, true);
    text(`${restart ? T.updateRestart : T.updateStart} →`, x + 10, y + 32, 11, false, C.link);
    hit(x, y, 180, 44, 'balloon', () => openWin('update'));
  }

  /* ---- apps ------------------------------------------------------------------------------------ */

  const visibleMails = () => T.mails.filter((m) => !s.deleted.includes(m.id) && (m.id !== 'survey' || s.survey) && (m.id !== 'boss2' || s.boss2));
  const NAMES: Record<string, string> = { karen: 'Karen', boss: 'The Boss', mum: 'Mum', boss2: 'The Boss' };
  const DONE_ID: Record<string, string> = { karen: 'karen', boss: 'boss', mum: 'mumMail', boss2: 'boss2' };

  function drawMail() {
    const x = 132;
    const y = 10;
    const w = 372;
    const h = 340;
    windowFrame(x, y, w, h, `${T.mail} – ${T.inbox}`, closeWin);
    const lx = x + 6;
    const ly = y + 28;
    const lw = 128;
    bevel(lx, ly, lw, h - 34, false, '#fff');
    visibleMails().forEach((m, i) => {
      const iy = ly + 3 + i * 30;
      const sel = mail === m.id;
      if (sel) {
        g.fillStyle = C.title1;
        g.fillRect(lx + 3, iy, lw - 6, 29);
      } else if (hoverId === `mail:${m.id}`) {
        g.fillStyle = '#f1ece0';
        g.fillRect(lx + 3, iy, lw - 6, 29);
      }
      const unread = (NAMES[m.id] && !s.replied.includes(m.id)) || (m.id === 'survey' && !s.rated);
      font(11, true);
      text(fit(m.from, lw - 22), lx + 8, iy + 9, 11, true, sel ? '#fff' : C.text);
      if (unread) {
        g.fillStyle = sel ? '#fff' : C.red;
        g.beginPath();
        g.arc(lx + lw - 12, iy + 9, 3, 0, Math.PI * 2);
        g.fill();
      }
      font(10);
      const sub = NAMES[m.id] && s.replied.includes(m.id) ? `✓ ${T.replied}` : m.subject;
      text(fit(sub, lw - 16), lx + 8, iy + 21, 10, false, sel ? '#f3dce8' : C.muted);
      hit(lx + 3, iy, lw - 6, 29, `mail:${m.id}`, () => pickMail(m.id));
    });
    const px = x + 140;
    const py = y + 28;
    const pw = w - 146;
    const ph = h - 34;
    bevel(px, py, pw, ph, false, '#fff');
    const m = T.mails.find((v) => v.id === mail);
    if (!m) text(T.pick, px + pw / 2, py + ph / 2, 12, false, C.muted, 'center');
    else if (replying) {
      text(T.replyTo.replace('{name}', NAMES[m.id]), px + 10, py + 16, 12, true);
      T.replies[m.id as keyof typeof T.replies].forEach((r, i) => {
        const bx = px + 8;
        const by = py + 30 + i * 62;
        const bw = pw - 16;
        const id = `reply:${i}`;
        bevel(bx, by, bw, 54, true, hoverId === id ? C.faceHot : C.face);
        wrap(`“${r.text}”`, bx + 10, by + 9, bw - 20, 15, 12);
        hit(bx, by, bw, 54, id, () => chooseReply(m.id, r.ok));
      });
    } else {
      text('From:', px + 10, py + 14, 11, false, C.muted);
      text('Subject:', px + 10, py + 31, 11, false, C.muted);
      font(12, true);
      text(fit(m.from, pw - 70), px + 60, py + 14, 12, true);
      font(12, true);
      text(fit(m.subject, pw - 70), px + 60, py + 31, 12, true);
      g.fillStyle = '#d9d4c8';
      g.fillRect(px + 8, py + 42, pw - 16, 1);
      const end = wrap(m.body, px + 10, py + 52, pw - 20, 16, 12);
      if (m.id === 'cheese' && !s.unsub) {
        font(11);
        text(T.unsubscribe, px + 10, end + 10, 11, false, C.link);
        const uw = g.measureText(T.unsubscribe).width;
        g.fillStyle = C.link;
        g.fillRect(px + 10, end + 16, uw, 1);
        hit(px + 6, end + 2, uw + 8, 18, 'unsub', () => {
          s.unsub = true;
          setMsg(T.unsubscribed);
          hooks.done('unsub');
        });
      }
      if (m.id === 'survey' && !s.rated) {
        text(T.stars, px + 10, end + 12, 11, true);
        for (let i = 0; i < 5; i++) {
          const id = `star${i}`;
          const sx = px + 12 + i * 34;
          const sy = end + 24;
          star(sx + 14, sy + 14, 12, hoverId?.startsWith('star') && Number(hoverId.slice(4)) >= i ? '#f5b82e' : '#d9d4c8');
          hit(sx, sy, 30, 30, id, () => {
            if (i === 4) {
              s.rated = true;
              setMsg(T.starsHappy);
              hooks.done('rate');
            } else setMsg(T.starsSad, true);
          });
        }
      }
      // Buttons: Delete for all, Reply for people who wait for an answer
      button(px + 8, py + ph - 32, 66, 24, T.delete, 'delete', () => deleteMail(m.id, m.spam));
      if (NAMES[m.id]) {
        if (!s.replied.includes(m.id)) button(px + pw - 78, py + ph - 32, 70, 24, T.reply, 'reply', () => (replying = true));
        else text(`✓ ${T.replied}`, px + pw - 80, py + ph - 20, 12, true, C.green);
      }
    }
    if (msg) wrap(msg, px + 10, py + ph - (replying ? 30 : 64), pw - 20, 13, 11, msgBad, msgBad ? C.red : C.green);
  }

  function star(cx: number, cy: number, r: number, color: string) {
    g.fillStyle = color;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
  }

  function pickMail(id: string) {
    mail = id;
    replying = false;
    msg = '';
    if (id === 'boss' && !s.bossRead) {
      s.bossRead = true;
      hooks.event('@boss');
    }
  }

  function chooseReply(id: string, ok: boolean) {
    if (!ok) return setMsg(T.tooRude, true);
    s.replied.push(id);
    replying = false;
    setMsg(T.sent);
    sfx.sent();
    hooks.done(DONE_ID[id]);
  }

  function deleteMail(id: string, spam: boolean) {
    if (!spam) return setMsg(T.important, true);
    s.deleted.push(id);
    mail = null;
    setMsg(T.deleted);
    sfx.crumple();
    if (T.mails.every((m) => !m.spam || s.deleted.includes(m.id))) hooks.done('spam');
  }

  function drawSheets() {
    const x = 116;
    const y = 24;
    const w = 300;
    const h = 290;
    windowFrame(x, y, w, h, T.sheetsTitle, closeWin);
    button(x + 8, y + 28, 60, 22, T.save, 'save', () => {
      if (!s.sheetsOk) return setMsg(T.sheetsHint, true);
      s.saved = true;
      setMsg(T.saved);
      hooks.done('save');
    });
    const gx = x + 10;
    const gy = y + 58;
    const cw = [140, 130];
    const rh = 26;
    const rows = T.sheetsRows.map((r) => [r[0], r[1]]);
    const sum = rows.reduce((a, r, i) => a + (Number(i === 2 ? s.cell : r[1]) || 0), 0);
    bevel(gx - 2, gy - 2, cw[0] + cw[1] + 4, rh * 6 + 4, false, '#fff');
    // Header
    g.fillStyle = '#e9e5da';
    g.fillRect(gx, gy, cw[0] + cw[1], rh);
    text('Item', gx + 8, gy + rh / 2, 12, true);
    text('Cost', gx + cw[0] + 8, gy + rh / 2, 12, true);
    rows.forEach((r, i) => {
      const ry = gy + rh * (i + 1);
      text(r[0], gx + 8, ry + rh / 2, 12);
      if (i === 2) {
        const on = field === 'cell';
        g.fillStyle = s.sheetsOk ? '#dff1d8' : on ? '#fff9d6' : hoverId === 'field-cell' ? '#fffdf0' : '#fff';
        g.fillRect(gx + cw[0] + 1, ry + 1, cw[1] - 2, rh - 2);
        g.strokeStyle = on ? C.title1 : '#2f7a3a';
        g.lineWidth = 2;
        g.strokeRect(gx + cw[0] + 2, ry + 2, cw[1] - 4, rh - 4);
        text(s.cell, gx + cw[0] + 8, ry + rh / 2, 12, true);
        if (on && Math.floor(t * 2) % 2 === 0) {
          font(12, true);
          g.fillStyle = C.text;
          g.fillRect(gx + cw[0] + 9 + g.measureText(s.cell).width, ry + 6, 1.5, 14);
        }
        if (!s.sheetsOk) hit(gx + cw[0], ry, cw[1], rh, 'field-cell', () => setField('cell'));
      } else text(r[1], gx + cw[0] + 8, ry + rh / 2, 12);
    });
    const ty = gy + rh * 5;
    g.fillStyle = '#e9e5da';
    g.fillRect(gx, ty, cw[0] + cw[1], rh);
    text(T.sheetsTotal, gx + 8, ty + rh / 2, 12, true);
    text(`${sum} / ${T.sheetsSum}`, gx + cw[0] + 8, ty + rh / 2, 12, true, sum === Number(T.sheetsSum) ? C.green : C.red);
    g.strokeStyle = '#d0cabd';
    g.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(gx, gy + rh * i + 0.5);
      g.lineTo(gx + cw[0] + cw[1], gy + rh * i + 0.5);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(gx + cw[0] + 0.5, gy);
    g.lineTo(gx + cw[0] + 0.5, gy + rh * 6);
    g.stroke();
    wrap(msg || T.sheetsHint, x + 10, y + h - 46, w - 20, 13, 11, msgBad, msg ? (msgBad ? C.red : C.green) : C.muted);
  }

  function checkCell() {
    if (s.cell.trim() === T.sheetsAnswer) {
      s.sheetsOk = true;
      setField(null);
      setMsg(T.sheetsRight);
      sfx.pick();
      hooks.done('excel');
    } else setMsg(T.sheetsWrong, true);
  }

  function drawPrinter() {
    const x = 130;
    const y = 70;
    const w = 260;
    const h = 170;
    windowFrame(x, y, w, h, T.printTitle, closeWin);
    bevel(x + 10, y + 32, w - 20, 26, false, '#fff');
    icon('file', x + 12, y + 31);
    text(T.printQueue, x + 46, y + 45, 12);
    text(s.paper ? '● Ready' : '● Out of paper', x + 12, y + 74, 11, true, s.paper ? C.green : C.red);
    if (msg) wrap(msg, x + 12, y + 90, w - 24, 13, 11, msgBad, msgBad ? C.red : C.green);
    button(x + w - 92, y + h - 34, 80, 24, T.print, 'print', () => {
      if (!s.paper) return setMsg(T.printNoPaper, true);
      if (s.printed) return setMsg(T.printDone);
      s.printed = true;
      setMsg(T.printDone);
      hooks.print();
      hooks.done('print');
    });
  }

  function drawCalendar() {
    const x = 60;
    const y = 12;
    const w = 400;
    const h = 330;
    windowFrame(x, y, w, h, T.calendarTitle, closeWin);
    const gx = x + 50;
    const gy = y + 30;
    const cw = 68;
    const rh = 30;
    bevel(gx - 44, gy - 2, cw * 5 + 48, rh * 8 + 26, false, '#fff');
    T.days.forEach((d, i) => text(d, gx + i * cw + cw / 2, gy + 10, 12, true, C.text, 'center'));
    HOURS.forEach((hr, r) => {
      const ry = gy + 22 + r * rh;
      text(`${hr}:00`, gx - 38, ry + rh / 2, 11, false, C.muted);
      for (let d = 0; d < 5; d++) {
        const cx = gx + d * cw;
        const busy = BUSY[d][hr];
        const booked = s.booked && d === 3 && hr === 15;
        const id = `cal${d}-${hr}`;
        if (booked) {
          g.fillStyle = C.title2;
          g.fillRect(cx + 2, ry + 2, cw - 4, rh - 4);
          text('Boss ✓', cx + cw / 2, ry + rh / 2, 11, true, '#fff', 'center');
        } else if (busy !== undefined) {
          g.fillStyle = C.busy;
          g.fillRect(cx + 2, ry + 2, cw - 4, rh - 4);
          text(T.busy[busy], cx + cw / 2, ry + rh / 2, 10, false, '#4a463e', 'center');
        } else if (hoverId === id) {
          g.fillStyle = '#f6eef2';
          g.fillRect(cx + 2, ry + 2, cw - 4, rh - 4);
        }
        hit(cx, ry, cw, rh, id, () => {
          if (s.booked) return;
          if (busy !== undefined) return setMsg(T.calendarTaken, true);
          if (d !== 3 || hr < 13) return setMsg(T.calendarNope, true);
          s.booked = true;
          setMsg(T.calendarBooked);
          sfx.sent();
          hooks.done('meeting');
        });
      }
    });
    wrap(msg || T.calendarHint, x + 12, y + h - 24, w - 24, 13, 11, msgBad, msg ? (msgBad ? C.red : C.green) : C.muted);
  }

  function drawWallpaper() {
    const x = 126;
    const y = 90;
    const w = 260;
    const h = 170;
    windowFrame(x, y, w, h, T.wallpaperTitle, closeWin);
    T.wallpapers.forEach((name, i) => {
      const sx = x + 14 + i * 60;
      const sy = y + 40;
      const [a, b] = WALLS[i];
      const grad = g.createLinearGradient(0, sy, 0, sy + 50);
      grad.addColorStop(0, a);
      grad.addColorStop(1, b);
      g.fillStyle = grad;
      g.fillRect(sx, sy, 52, 50);
      g.strokeStyle = s.wallpaper === i ? C.title1 : hoverId === `wp${i}` ? '#999' : '#6d695f';
      g.lineWidth = s.wallpaper === i ? 3 : 1;
      g.strokeRect(sx, sy, 52, 50);
      font(10);
      text(fit(name, 58), sx + 26, sy + 62, 10, s.wallpaper === i, C.text, 'center');
      hit(sx, sy, 52, 70, `wp${i}`, () => {
        s.wallpaper = i;
        if (i !== 0) hooks.done('wallpaper');
      });
    });
    button(x + w - 80, y + h - 34, 68, 24, T.ok, 'wp-ok', closeWin);
  }

  function drawUpdate() {
    const x = 136;
    const y = 110;
    const w = 240;
    const h = 140;
    windowFrame(x, y, w, h, T.updateTitle, closeWin);
    if (s.update === 'done') {
      wrap(T.updated, x + 14, y + 40, w - 28, 15, 12);
      button(x + w - 80, y + h - 34, 68, 24, T.ok, 'upd-ok', closeWin);
    } else if (s.update === 'running') {
      text(T.updating.replace('{p}', String(Math.floor(s.updateP * 100))), x + 14, y + 42, 12, true);
      bevel(x + 14, y + 56, w - 28, 18, false, '#fff');
      g.fillStyle = C.title2;
      const n = Math.floor(s.updateP * 20);
      for (let i = 0; i < n; i++) g.fillRect(x + 17 + i * ((w - 34) / 20), y + 59, (w - 34) / 20 - 2, 12);
      wrap(T.updateWait, x + 14, y + 84, w - 28, 13, 11, false, C.muted);
    } else if (s.update === 'restart') {
      wrap(T.updated, x + 14, y + 40, w - 28, 15, 12);
      button(x + w - 120, y + h - 34, 108, 24, T.updateRestart, 'upd-restart', restartForUpdate);
    } else {
      wrap(T.updateReady, x + 14, y + 40, w - 28, 15, 12, true);
      button(x + w - 92, y + h - 34, 80, 24, T.updateStart, 'upd-go', () => {
        s.update = 'running';
        s.updateP = 0;
      });
    }
  }

  function restartForUpdate() {
    win = null;
    s.update = 'done';
    afterBoot = 'desktop';
    state = 'boot';
    t = 0;
    sfx.power();
    hooks.done('update');
  }

  function drawNewpass() {
    const x = 136;
    const y = 110;
    const w = 240;
    const h = 150;
    windowFrame(x, y, w, h, T.newPassTitle, closeWin);
    if (s.newpass) {
      wrap(T.newPassDone, x + 14, y + 40, w - 28, 15, 12, false, C.green);
      button(x + w - 80, y + h - 34, 68, 24, T.ok, 'np-ok', closeWin);
      return;
    }
    text(T.newPassLabel, x + 14, y + 46, 12);
    inputField(x + 110, y + 36, 116, newpass, 'newpass', true);
    if (msg) wrap(msg, x + 14, y + 66, w - 28, 13, 11, msgBad, msgBad ? C.red : C.green);
    button(x + w - 80, y + h - 34, 68, 24, T.ok, 'np-go', submitNewpass);
  }

  function submitNewpass() {
    const p = newpass.trim().toLowerCase();
    if (p.includes(PASSWORD)) return setMsg(T.newPassGerald, true);
    if (p.length < 4) return setMsg(T.newPassShort, true);
    s.newpass = true;
    setField(null);
    setMsg(T.newPassDone);
    hooks.done('newpass');
  }

  /* ---- actions -------------------------------------------------------------------------------- */

  function openWin(w: Win) {
    win = w;
    replying = false;
    msg = '';
    mail = null;
    setField(null);
    if (w === 'mail' && !s.mailSeen) {
      s.mailSeen = true;
      hooks.done('mail');
    }
  }

  function closeWin() {
    win = null;
    replying = false;
    msg = '';
    setField(null);
  }

  function setField(f: Field) {
    if (field === f) return;
    field = f;
    if (f === 'newpass') newpass = '';
    hooks.wantKeys(f !== null, f === 'cell');
    dirty = true;
  }

  function submitLogin() {
    if (state !== 'login') return;
    if (pass.trim().toLowerCase() === PASSWORD) {
      s.loggedIn = true;
      state = 'desktop';
      t = 0;
      setField(null);
      sfx.boot();
      hooks.done('login');
      // Logging in brings pop-ups and an update
      s.popups = [0, 1, 2, 3];
      if (s.update === 'none') s.update = 'ready';
      setTimeout(() => {
        if (!s.muted) sfx.ding();
      }, 900);
    } else {
      loginMsg = T.wrong;
      loginBad = true;
      pass = '';
      shake = 0;
      sfx.error();
      if (field) hooks.wantKeys(true);
    }
    dirty = true;
  }

  function at(uv: THREE.Vector2) {
    const x = uv.x * OS_W;
    const y = (1 - uv.y) * OS_H;
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  function draw() {
    buttons = [];
    g.setTransform(PR, 0, 0, PR, 0, 0);
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.lineWidth = 1;
    if (state === 'off') drawOff();
    else if (state === 'boot') drawBoot();
    else {
      drawBackground();
      if (state === 'login') drawLogin();
      else drawDesktop();
    }
    if (state !== 'off') {
      g.fillStyle = lines;
      g.fillRect(0, 0, OS_W, OS_H);
    }
    // A little curve of the old tube: darker corners
    const v = g.createRadialGradient(OS_W / 2, OS_H / 2, OS_H * 0.45, OS_W / 2, OS_H / 2, OS_W * 0.68);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = v;
    g.fillRect(0, 0, OS_W, OS_H);
    texture.needsUpdate = true;
  }

  return {
    texture,
    get state() {
      return state;
    },
    get typing() {
      return field !== null;
    },
    /** The power button: starts the computer (false if it is already on). */
    power() {
      if (state !== 'off') return false;
      s.on = true;
      afterBoot = s.loggedIn ? 'desktop' : 'login';
      state = 'boot';
      t = 0;
      sfx.power();
      dirty = true;
      return true;
    },
    /** A click on the screen; true if it hit something. */
    click(uv: THREE.Vector2) {
      const b = at(uv);
      if (menu && b?.id !== 'start' && !b?.id.startsWith('m-')) menu = false;
      if (b) {
        sfx.osClick();
        b.act();
        dirty = true;
        return true;
      }
      dirty = true;
      if (field && field !== 'pass') setField(null);
      return false;
    },
    /** The pointer over the screen (null = elsewhere); true if over something clickable. */
    hover(uv: THREE.Vector2 | null) {
      const b = uv ? at(uv) : null;
      const id = b && b.id !== 'block' ? b.id : null;
      if (id !== hoverId) {
        hoverId = id;
        dirty = true;
      }
      return id !== null;
    },
    /** Text typed into the hidden input goes to the field being typed into. */
    setText(value: string) {
      const v = value.slice(0, 16);
      if (field === 'pass') {
        pass = v;
        if (loginBad && pass) loginMsg = '';
      } else if (field === 'newpass') newpass = v;
      else if (field === 'cell') s.cell = v.replace(/[^0-9]/g, '').slice(0, 4);
      dirty = true;
    },
    /** Enter. */
    submit() {
      if (field === 'pass') submitLogin();
      else if (field === 'newpass') submitNewpass();
      else if (field === 'cell') checkCell();
      dirty = true;
    },
    /** Start typing into the password field, if the login is showing. */
    type() {
      if (state === 'login') setField('pass');
    },
    /** Typing stopped from outside (the input lost focus). */
    blur() {
      if (!field) return;
      field = null;
      dirty = true;
    },
    /** The real printer got paper. */
    setPaper() {
      s.paper = true;
      dirty = true;
    },
    /** IT's survey arrives (after calling IT). */
    addSurvey() {
      if (s.survey) return;
      s.survey = true;
      if (state === 'desktop' && !s.muted) sfx.ding();
      dirty = true;
    },
    /** The boss's second mail arrives (layer 3). */
    addBoss2() {
      if (s.boss2) return;
      s.boss2 = true;
      if (state === 'desktop' && !s.muted) sfx.ding();
      dirty = true;
    },
    /** The finale: the screen goes dark. */
    off() {
      state = 'off';
      dirty = true;
    },
    snapshot(): DeskSnapshot {
      return JSON.parse(JSON.stringify(s)) as DeskSnapshot;
    },
    restore(snap: Partial<DeskSnapshot>) {
      Object.assign(s, snap);
      if (s.update === 'restart') s.update = 'restart';
      state = s.on ? (s.loggedIn ? 'desktop' : 'login') : 'off';
      dirty = true;
    },
    tick(dt: number) {
      t += dt;
      if (state === 'boot') {
        dirty = true;
        if (t > 2.4) {
          state = afterBoot;
          t = 0;
          sfx.boot();
          if (state === 'login') hooks.onLoginShown();
        }
      }
      if (shake >= 0) {
        shake += dt;
        if (shake > 0.35) shake = -1;
        dirty = true;
      }
      if (field) {
        const b = Math.floor(t * 2);
        if (b !== lastBlink) {
          lastBlink = b;
          dirty = true;
        }
      }
      if (s.on && s.update === 'running') {
        const before = Math.floor(s.updateP * 100);
        s.updateP = Math.min(1, s.updateP + dt / UPDATE_SECS);
        if (s.updateP >= 1) {
          s.update = 'restart';
          if (!s.muted) sfx.ding();
        }
        if (Math.floor(s.updateP * 100) !== before) dirty = true;
      }
      if (state === 'desktop') {
        const m = new Date().getMinutes();
        if (m !== lastMinute) {
          lastMinute = m;
          dirty = true;
        }
        // It keeps dinging
        dingClock -= dt;
        if (dingClock <= 0) {
          dingClock = DING_EVERY;
          if (!s.muted) sfx.ding();
        }
      }
      if (dirty) {
        dirty = false;
        draw();
      }
    },
  };
}

export type DeskOS = ReturnType<typeof createDeskOS>;
