/**
 * 2 Many Notes: all sound is made with Web Audio (no files): tearing a note
 * off, crumpling, the swish of the throw, the phone, DeskOS … Started by the
 * first click (Start).
 *
 * Phase 4: three buses (effects, ambience, music) with on/off switches in the
 * settings. Ambience: the office hum, the air conditioning, keyboards
 * somewhere else, rain from about half way (louder with the window open).
 * Music is the radio on the desk: muzak that gets a little faster as the
 * desk empties; turned off, it stays off, until the last ten notes, when it
 * switches itself back on with an ironically epic synth track.
 */

type Bus = 'sfx' | 'amb' | 'music';
let ctx: AudioContext | null = null;
let buses: Record<Bus, GainNode> | null = null;
let noiseBuf: AudioBuffer | null = null;
const settings = { sound: true, music: true };

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  if (!buses) {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const bus = (v: number) => {
      const g = ctx!.createGain();
      g.gain.value = v;
      g.connect(master);
      return g;
    };
    buses = { sfx: bus(1), amb: bus(1), music: bus(1) };
    applySettings();
  }
  return ctx;
}

function applySettings() {
  if (!buses || !ctx) return;
  const t = ctx.currentTime;
  buses.sfx.gain.setTargetAtTime(settings.sound ? 1 : 0, t, 0.05);
  buses.amb.gain.setTargetAtTime(settings.sound ? 1 : 0, t, 0.05);
  buses.music.gain.setTargetAtTime(settings.sound && settings.music ? 1 : 0, t, 0.05);
}

export function setSound(on: boolean) {
  settings.sound = on;
  applySettings();
}

export function setMusic(on: boolean) {
  settings.music = on;
  applySettings();
}

/** Two seconds of white noise, made once and reused. */
function noiseBuffer(a: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Filtered noise: rips, crackles, swishes. */
function noise(dur: number, vol: number, type: BiquadFilterType, f0: number, f1 = f0, delay = 0, bus: Bus = 'sfx') {
  const a = audio();
  const t = a.currentTime + delay;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(buses![bus]);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, to = freq, bus: Bus = 'sfx') {
  const a = audio();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(buses![bus]);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const safe = (fn: () => void) => () => {
  try {
    fn();
  } catch {
    /* no audio: fine */
  }
};

/* ---- the radio: muzak, later the epic track ---------------------------------------------------- */

let radioTimer = 0;
let radioSpeed = 1;
let epic = false;
/** The volume knob (0–1). */
let radioVol = 1;

function muzakBar(bar: number, len: number) {
  const chords = [
    [262, 330, 392],
    [220, 262, 330],
    [175, 220, 262],
    [196, 247, 294],
  ];
  const tune = [523, 587, 659, 587, 523, 494, 440, 494, 523, 659, 784, 659, 587, 523, 494, 523];
  const v = Math.max(0.0001, radioVol);
  chords[bar % 4].forEach((f) => tone(f, len * 0.95, 0.012 * v, 'triangle', 0, f, 'music'));
  for (let i = 0; i < 4; i++) {
    const f = tune[(bar % 4) * 4 + i];
    tone(f, len / 5, 0.014 * v, 'sine', (i * len) / 4, f, 'music');
  }
  noise(len, 0.005 * v, 'bandpass', 3000, 3000, 0, 'music');
}

/** Am – F – C – G, arpeggios, bass, drums: very serious office music. */
function epicBar(bar: number, len: number) {
  const roots = [220, 174.6, 261.6, 196];
  const r = roots[bar % 4];
  const third = bar % 4 === 0 ? 1.2 : 1.25;
  [1, 1.5, 2, 2 * third, 2, 1.5, 2, 3].forEach((m, i) => tone(r * m, len / 8, 0.018, 'square', (i * len) / 8, r * m, 'music'));
  tone(r / 2, len * 0.48, 0.035, 'sawtooth', 0, r / 2, 'music');
  tone(r / 2, len * 0.48, 0.035, 'sawtooth', len / 2, r / 2, 'music');
  for (let b = 0; b < 4; b++) {
    tone(110, 0.14, 0.09, 'sine', (b * len) / 4, 45, 'music');
    if (b % 2) noise(0.12, 0.05, 'bandpass', 1800, 1200, (b * len) / 4, 'music');
  }
  tone(r * 4, len * 0.9, 0.008, 'sawtooth', 0, r * 4, 'music');
}

export const radio = {
  start: safe(() => {
    if (radioTimer) return;
    audio();
    let bar = 0;
    const play = () => {
      const len = (epic ? 1.6 : 2) / radioSpeed;
      try {
        if (epic) epicBar(bar, len);
        else muzakBar(bar, len);
      } catch {
        /* no audio */
      }
      bar++;
      radioTimer = window.setTimeout(play, len * 1000);
    };
    play();
  }),
  stop() {
    clearTimeout(radioTimer);
    radioTimer = 0;
  },
  get on() {
    return radioTimer !== 0;
  },
  /** The knob: 0 (silent) to 1. */
  setVolume(v: number) {
    radioVol = Math.max(0, Math.min(1, v));
  },
  /** 1 = normal; a little faster with each layer. */
  setSpeed(s: number) {
    radioSpeed = s;
  },
  /** The last ten notes: the epic track (starts the radio if it was off). */
  epic() {
    epic = true;
    radio.stop();
    radio.start();
  },
};

/* ---- ambience ------------------------------------------------------------------------------- */

let amb: { rain: GainNode; timer: number; nodes: AudioScheduledSourceNode[] } | null = null;
let rainLevel = 0;

function filter(a: AudioContext, type: BiquadFilterType, f: number, q = 0.7) {
  const n = a.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}

function loopNoise(a: AudioContext, filters: BiquadFilterNode[], vol: number) {
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  src.loop = true;
  const g = a.createGain();
  g.gain.value = vol;
  let node: AudioNode = src;
  for (const f of filters) node = node.connect(f);
  node.connect(g).connect(buses!.amb);
  src.start();
  return { src, g };
}

export const ambience = {
  start: safe(() => {
    if (amb) return;
    const a = audio();
    const hum = loopNoise(a, [filter(a, 'lowpass', 160)], 0.05);
    const ac = loopNoise(a, [filter(a, 'bandpass', 650, 0.5)], 0.012);
    const rain = loopNoise(a, [filter(a, 'highpass', 500), filter(a, 'lowpass', 2600)], 0);
    const buzz = a.createOscillator();
    buzz.frequency.value = 100;
    const bg = a.createGain();
    bg.gain.value = 0.0025;
    buzz.connect(bg).connect(buses!.amb);
    buzz.start();
    // Keyboards somewhere in the office; drops on the window when it rains
    const tick = () => {
      try {
        const n = 4 + Math.floor(Math.random() * 12);
        for (let i = 0; i < n; i++) noise(0.025, 0.012, 'highpass', 2500 + Math.random() * 2000, 2500, i * (0.08 + Math.random() * 0.08), 'amb');
        if (rainLevel > 0.1) for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 2500, 0.03, 0.006 * rainLevel, 'sine', Math.random() * 2, 1500, 'amb');
      } catch {
        /* fine */
      }
      if (amb) amb.timer = window.setTimeout(tick, 2500 + Math.random() * 6000);
    };
    amb = { rain: rain.g, timer: 0, nodes: [hum.src, ac.src, rain.src, buzz] };
    tick();
  }),
  /** Rain 0–1; through an open window it is louder. */
  setRain(level: number, windowOpen: boolean) {
    rainLevel = level;
    if (!amb || !ctx) return;
    amb.rain.gain.setTargetAtTime(level * (windowOpen ? 0.07 : 0.028), ctx.currentTime, 0.6);
  },
  stop() {
    if (!amb) return;
    clearTimeout(amb.timer);
    amb.nodes.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    });
    amb = null;
  },
};

export const sfx = {
  unlock: safe(() => void audio()),
  rip: safe(() => noise(0.18, 0.35, 'highpass', 1800, 3500)),
  crumple: safe(() => {
    for (let i = 0; i < 6; i++) noise(0.05, 0.25, 'bandpass', 1500 + Math.random() * 2500, 1200, i * 0.035);
  }),
  swish: safe(() => noise(0.35, 0.18, 'bandpass', 600, 2400)),
  land: safe(() => {
    tone(120, 0.12, 0.25, 'sine', 0, 70);
    noise(0.08, 0.15, 'lowpass', 900, 300);
  }),
  pick: safe(() => tone(520, 0.06, 0.08, 'triangle')),
  nope: safe(() => tone(180, 0.15, 0.08, 'square', 0, 140)),
  click: safe(() => noise(0.03, 0.2, 'highpass', 3000)),
  ring: safe(() => {
    for (let i = 0; i < 2; i++) {
      tone(880, 0.35, 0.06, 'square', i * 0.45);
      tone(1100, 0.35, 0.05, 'square', i * 0.45);
    }
  }),
  chunk: safe(() => {
    tone(90, 0.1, 0.3, 'square', 0, 60);
    noise(0.05, 0.25, 'highpass', 2500, 2500, 0.02);
  }),
  pour: safe(() => noise(0.9, 0.12, 'bandpass', 900, 1400)),
  sip: safe(() => noise(0.4, 0.08, 'lowpass', 500, 300)),
  lamp: safe(() => tone(1400, 0.03, 0.12, 'square')),
  scribble: safe(() => {
    for (let i = 0; i < 5; i++) noise(0.07, 0.12, 'highpass', 2500, 4000, i * 0.08);
  }),
  /** The old monitor switching on: a thump and the high CRT whine. */
  power: safe(() => {
    tone(70, 0.25, 0.3, 'sine', 0, 45);
    noise(0.12, 0.2, 'lowpass', 600, 200);
    tone(15600, 1.6, 0.012, 'sine', 0.05);
  }),
  /** DeskOS start-up chime (our own four notes). */
  boot: safe(() => {
    [392, 523, 659, 988].forEach((f, i) => tone(f, 0.9 - i * 0.1, 0.05, 'triangle', i * 0.16));
    tone(196, 1.2, 0.04, 'sine', 0);
  }),
  error: safe(() => {
    tone(330, 0.12, 0.07, 'square');
    tone(247, 0.2, 0.07, 'square', 0.12);
  }),
  osClick: safe(() => noise(0.02, 0.12, 'highpass', 4000)),
  sent: safe(() => {
    noise(0.3, 0.1, 'bandpass', 500, 3000);
    tone(880, 0.12, 0.05, 'triangle', 0.25);
    tone(1320, 0.18, 0.05, 'triangle', 0.35);
  }),
  /** DeskOS notification. */
  ding: safe(() => {
    tone(1318, 0.5, 0.04, 'sine');
    tone(1760, 0.6, 0.03, 'sine', 0.08);
  }),
  squeak: safe(() => {
    tone(900, 0.12, 0.08, 'square', 0, 1500);
    tone(1500, 0.15, 0.06, 'square', 0.12, 1100);
  }),
  squish: safe(() => noise(0.25, 0.15, 'lowpass', 700, 200)),
  jingle: safe(() => {
    for (let i = 0; i < 7; i++) tone(2400 + Math.random() * 1600, 0.12, 0.025, 'sine', i * 0.06);
  }),
  flip: safe(() => noise(0.15, 0.2, 'bandpass', 2500, 900)),
  wipe: safe(() => {
    for (let i = 0; i < 3; i++) noise(0.14, 0.12, 'bandpass', 1200, 2600, i * 0.15);
  }),
  whirr: safe(() => {
    for (let i = 0; i < 14; i++) tone(2000, 0.02, 0.05, 'square', i * 0.05);
  }),
  printer: safe(() => {
    for (let i = 0; i < 10; i++) noise(0.09, 0.14, 'bandpass', 700 + (i % 2) * 500, 900, i * 0.12);
    tone(160, 1.3, 0.04, 'sawtooth', 0, 150);
  }),
  /** Phase 5: drawers, locks, the cabinet, the finale. */
  drawer: safe(() => {
    noise(0.35, 0.12, 'lowpass', 900, 300);
    tone(140, 0.08, 0.05, 'square', 0.3, 90);
  }),
  unlatch: safe(() => {
    tone(2200, 0.03, 0.06, 'square');
    tone(1500, 0.05, 0.06, 'square', 0.08);
  }),
  bang: safe(() => {
    tone(70, 0.4, 0.35, 'sine', 0, 35);
    noise(0.3, 0.3, 'lowpass', 1200, 200);
    for (let i = 0; i < 4; i++) tone(900 + i * 300, 0.25, 0.02, 'triangle', 0.05 + i * 0.03);
  }),
  stampThud: safe(() => {
    tone(110, 0.12, 0.25, 'sine', 0, 60);
    noise(0.06, 0.15, 'lowpass', 800, 300);
  }),
  crunch: safe(() => {
    for (let i = 0; i < 4; i++) noise(0.07, 0.25, 'bandpass', 1200 + Math.random() * 1500, 700, i * 0.12);
  }),
  lightOff: safe(() => {
    tone(1200, 0.025, 0.12, 'square');
    noise(0.05, 0.1, 'highpass', 3000, 3000, 0.01);
  }),
  creak: safe(() => {
    tone(180, 1.2, 0.04, 'sawtooth', 0, 260);
    tone(240, 1.0, 0.025, 'sawtooth', 0.2, 170);
  }),
  steps: safe(() => {
    for (let i = 0; i < 4; i++) {
      tone(90, 0.12, 0.18, 'sine', i * 0.45, 55);
      noise(0.05, 0.06, 'lowpass', 600, 200, i * 0.45);
    }
  }),
  /** The screen flickers when a note comes off it. */
  blip: safe(() => {
    tone(1900, 0.05, 0.03, 'square');
    noise(0.08, 0.05, 'highpass', 5000, 5000, 0.02);
  }),
  pop: safe(() => {
    tone(600, 0.08, 0.08, 'triangle', 0, 900);
    noise(0.05, 0.12, 'highpass', 2500, 2500, 0.03);
  }),
  done: safe(() => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.08, 'triangle', i * 0.1));
  }),
};
