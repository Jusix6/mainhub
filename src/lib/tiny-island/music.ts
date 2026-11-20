/**
 * Music made on the spot with the Web Audio API (Update 3, phase G): no
 * files, nothing to load. Five moods, each a little piece that goes on as
 * long as it is wanted: peace, war, festival, grief, disaster. Changing the
 * mood fades one piece out and the next one in over two seconds.
 *
 * Every piece: a chord progression (a soft pad at the start of each bar), a
 * bass on the first and third beat, a melody that wanders over its scale in
 * eighth notes (some of them rests), and for some a drum made of noise.
 * Notes are scheduled a little ahead (a lookahead scheduler) so they stay in
 * time even when the frame rate drops.
 */
export type Mood = 'peace' | 'war' | 'festival' | 'grief' | 'disaster';

interface Song {
  bpm: number;
  /** Midi note of the key, scale steps (semitones), chords (semitones from the key) per bar. */
  root: number;
  scale: number[];
  chords: number[][];
  lead: OscillatorType;
  bass: OscillatorType;
  drum?: 'soft' | 'hard' | 'clap' | 'rumble';
  /** Chance an eighth note is played, and how loud the lead is. */
  density: number;
  leadGain: number;
}

const SONGS: Record<Mood, Song> = {
  peace: { bpm: 72, root: 60, scale: [0, 2, 4, 7, 9, 12], chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: 'triangle', bass: 'sine', drum: 'soft', density: 0.55, leadGain: 0.09 },
  war: { bpm: 112, root: 50, scale: [0, 2, 3, 5, 7, 8, 10, 12], chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7]], lead: 'sawtooth', bass: 'square', drum: 'hard', density: 0.7, leadGain: 0.05 },
  festival: { bpm: 128, root: 67, scale: [0, 2, 4, 5, 7, 9, 11, 12], chords: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'square', bass: 'triangle', drum: 'clap', density: 0.75, leadGain: 0.04 },
  grief: { bpm: 54, root: 57, scale: [0, 2, 3, 5, 7, 8, 12], chords: [[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-5, -1, 2]], lead: 'sine', bass: 'sine', density: 0.4, leadGain: 0.1 },
  disaster: { bpm: 92, root: 45, scale: [0, 1, 3, 6, 7, 10, 12], chords: [[0, 3, 6], [1, 4, 7], [0, 3, 6], [-1, 2, 5]], lead: 'sawtooth', bass: 'sawtooth', drum: 'rumble', density: 0.6, leadGain: 0.045 },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

interface Voice {
  gain: GainNode;
  next: number;
  step: number;
  degree: number;
  /** Stop scheduling once faded out (audio time). */
  until: number;
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<Mood, Voice>();
  private timer = 0;
  mood: Mood | null = null;
  private volume = 0.5;

  /** Creates the audio (it may only start after a click or a key). */
  start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * 0.5;
    // A gentle low-pass keeps the square and saw waves soft
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 2400;
    this.master.connect(this.filter).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.timer = window.setInterval(() => this.schedule(), 120);
    // A mood picked before the audio could start
    const wanted = this.mood;
    this.mood = null;
    this.setMood(wanted);
  }

  get playing() {
    return !!this.ctx && this.ctx.state === 'running' && this.mood !== null;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.1);
  }

  /** Fades over to another piece (null: silence). */
  setMood(mood: Mood | null) {
    if (mood === this.mood) return;
    if (!this.ctx || !this.master) {
      this.mood = mood;
      return;
    }
    const now = this.ctx.currentTime;
    for (const [m, v] of this.voices) {
      if (m === mood) continue;
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 2);
      v.until = now + 2.2;
    }
    this.mood = mood;
    if (!mood) return;
    let voice = this.voices.get(mood);
    if (!voice) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.master);
      voice = { gain, next: now + 0.1, step: 0, degree: 2, until: Infinity };
      this.voices.set(mood, voice);
    }
    voice.until = Infinity;
    voice.next = Math.max(voice.next, now + 0.05);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(1, now + 2);
  }

  /** Stops everything and frees the audio. */
  stop() {
    window.clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
    this.voices.clear();
    this.mood = null;
  }

  /** Every 120 ms: notes for the next 0.4 s of every piece still sounding. */
  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const ahead = ctx.currentTime + 0.4;
    for (const [mood, v] of this.voices) {
      if (ctx.currentTime > v.until) continue;
      const song = SONGS[mood];
      const eighth = 30 / song.bpm;
      while (v.next < ahead) {
        this.play(song, v, v.next, eighth);
        v.next += eighth;
        v.step++;
      }
    }
  }

  /** One eighth note of a piece: pad and bass on the beats, the melody, the drum. */
  private play(song: Song, v: Voice, t: number, eighth: number) {
    const bar = Math.floor(v.step / 8) % song.chords.length;
    const pos = v.step % 8;
    const chord = song.chords[bar];
    if (pos === 0) for (const c of chord) this.note(song.root + c, t, eighth * 7.5, 'sine', 0.035, v.gain, 0.4);
    if (pos === 0 || pos === 4) this.note(song.root + chord[0] - 12, t, eighth * 3, song.bass, 0.09, v.gain, 0.02);
    // The melody walks up and down the scale
    if (Math.random() < song.density) {
      const move = Math.floor(Math.random() * 3) - 1 + (Math.random() < 0.15 ? (Math.random() < 0.5 ? -2 : 2) : 0);
      v.degree = Math.max(0, Math.min(song.scale.length - 1, v.degree + move));
      const len = Math.random() < 0.25 ? eighth * 2 : eighth * 0.9;
      this.note(song.root + 12 + song.scale[v.degree], t, len, song.lead, song.leadGain, v.gain, 0.01);
    }
    if (song.drum) this.drum(song.drum, pos, t, v.gain);
  }

  private note(midi: number, t: number, dur: number, type: OscillatorType, gain: number, out: AudioNode, attack: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq(midi);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.3);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.5);
  }

  private drum(kind: NonNullable<Song['drum']>, pos: number, t: number, out: AudioNode) {
    const hit = kind === 'soft' ? pos === 0 : kind === 'hard' ? pos % 2 === 0 : kind === 'clap' ? pos === 2 || pos === 6 : pos % 4 === 0;
    if (!hit || !this.noise) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'clap' ? 'bandpass' : 'lowpass';
    f.frequency.value = kind === 'clap' ? 1500 : kind === 'rumble' ? 120 : 300;
    const g = ctx.createGain();
    const loud = kind === 'hard' ? 0.25 : kind === 'rumble' ? 0.35 : kind === 'clap' ? 0.12 : 0.1;
    const len = kind === 'rumble' ? 0.6 : 0.12;
    g.gain.setValueAtTime(loud, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t);
    src.stop(t + len + 0.05);
  }
}
