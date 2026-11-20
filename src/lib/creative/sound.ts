/**
 * Creative mode sounds, made on the fly with Web Audio (no files): short
 * blips for placing, removing, moving, picking a slot, the inventory, undo,
 * and a low buzz when something does not fit. Quiet on purpose. On by
 * default, M (or the menu) switches them off, remembered in localStorage
 * (`jxsi_creative_sound`). The audio context starts with the first sound,
 * which always follows a click or key press.
 */

const KEY = 'jxsi_creative_sound';

export type SoundKind = 'place' | 'remove' | 'move' | 'pick' | 'open' | 'close' | 'undo' | 'bad' | 'clear';

export interface Sound {
  play(kind: SoundKind): void;
  isOn(): boolean;
  toggle(): boolean;
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null;
  let on = read();

  function audio() {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  }

  /** A tone gliding from `from` to `to` Hz. */
  function tone(from: number, to: number, dur: number, type: OscillatorType = 'triangle', vol = 0.06, delay = 0) {
    const a = audio();
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** A short burst of filtered noise (crunch). */
  function noise(dur: number, vol: number, freq: number) {
    const a = audio();
    const t = a.currentTime;
    const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    const gain = a.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t);
  }

  const SOUNDS: Record<SoundKind, () => void> = {
    place: () => tone(380, 720, 0.09, 'triangle', 0.07),
    remove: () => {
      noise(0.14, 0.35, 1400);
      tone(260, 90, 0.12, 'square', 0.02);
    },
    move: () => tone(520, 660, 0.07, 'triangle', 0.05),
    pick: () => tone(1100, 1100, 0.025, 'square', 0.015),
    open: () => tone(320, 560, 0.12, 'sine', 0.05),
    close: () => tone(560, 320, 0.1, 'sine', 0.04),
    undo: () => tone(640, 380, 0.08, 'triangle', 0.05),
    bad: () => tone(150, 120, 0.14, 'sawtooth', 0.03),
    clear: () => {
      noise(0.3, 0.4, 900);
      tone(300, 60, 0.3, 'square', 0.02);
    },
  };

  return {
    play(kind) {
      if (!on) return;
      try {
        SOUNDS[kind]();
      } catch {
        /* no audio here: silence is fine */
      }
    },
    isOn: () => on,
    toggle() {
      on = !on;
      try {
        localStorage.setItem(KEY, on ? '1' : '0');
      } catch {
        /* not remembered */
      }
      return on;
    },
  };
}

function read() {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
