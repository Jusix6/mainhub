/**
 * What the visitor knows in the Flags book, kept in localStorage. A small
 * Leitner system: every flag sits in a box 0–6. "Knew it" moves it up a box
 * and it comes back after that box's interval, "didn't know" drops it to box 0
 * (due again right away). Quiz answers feed into the same boxes.
 */
const KEY = 'jxsi_lib_flags_v1';
const MAX_BOX = 6;
/** Days until a card in that box is due again. Box 0 = now. */
const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35, 90];
/** From this box on a flag counts as known. */
export const KNOWN_BOX = 3;

/** [box, due (ms epoch), right, wrong] */
type Card = [number, number, number, number];

export interface Settings {
  scope?: string;
  quizDir?: 'flag' | 'name';
  quizLen?: number;
  typeLen?: number;
}

interface Store {
  v: 1;
  cards: Record<string, Card>;
  settings: Settings;
}

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  let store: Store = { v: 1, cards: {}, settings: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && raw.v === 1 && typeof raw.cards === 'object') {
      const cards: Record<string, Card> = {};
      for (const [code, c] of Object.entries(raw.cards as Record<string, unknown>)) {
        if (/^[a-z]{2}(-[a-z]{3})?$/.test(code) && Array.isArray(c) && c.length === 4 && c.every((n) => Number.isFinite(n))) {
          cards[code] = [Math.max(0, Math.min(MAX_BOX, c[0] | 0)), c[1], c[2] | 0, c[3] | 0];
        }
      }
      store = { v: 1, cards, settings: typeof raw.settings === 'object' && raw.settings ? raw.settings : {} };
    }
  } catch {
    // Private mode or broken data: start fresh
  }
  cache = store;
  return store;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    // Storage full or blocked: progress lives for this visit only
  }
}

const DAY = 86_400_000;

export const isSeen = (code: string) => code in load().cards;
export const boxOf = (code: string) => load().cards[code]?.[0] ?? -1;
export const statsOf = (code: string) => {
  const c = load().cards[code];
  return c ? { right: c[2], wrong: c[3] } : { right: 0, wrong: 0 };
};
export const isDue = (code: string, now = Date.now()) => {
  const c = load().cards[code];
  return Boolean(c) && c[1] <= now;
};

/** Known / learning / not seen yet among these codes. */
export function summary(codes: readonly string[]) {
  let known = 0;
  let learning = 0;
  for (const code of codes) {
    const b = boxOf(code);
    if (b >= KNOWN_BOX) known++;
    else if (b >= 0) learning++;
  }
  return { known, learning, fresh: codes.length - known - learning, total: codes.length };
}

/** "Knew it" on a flashcard. A flag known on first sight counts as known right away. */
export function knew(code: string, now = Date.now()) {
  const s = load();
  const c = s.cards[code];
  const box = c ? Math.min(MAX_BOX, c[0] + 1) : KNOWN_BOX;
  s.cards[code] = [box, now + INTERVAL_DAYS[box] * DAY, (c?.[2] ?? 0) + 1, c?.[3] ?? 0];
  save();
}

/** "Didn't know", or a wrong quiz answer: back to box 0, due now. */
export function missed(code: string, now = Date.now()) {
  const s = load();
  const c = s.cards[code];
  s.cards[code] = [0, now, c?.[2] ?? 0, (c?.[3] ?? 0) + 1];
  save();
}

/** Right quiz answer: counts, and a never-seen flag starts out as fairly known. Does not move due dates. */
export function quizRight(code: string, now = Date.now()) {
  const s = load();
  const c = s.cards[code];
  s.cards[code] = c ? [Math.max(c[0], 1), c[1], c[2] + 1, c[3]] : [2, now + INTERVAL_DAYS[2] * DAY, 1, 0];
  save();
}

export function settings(): Settings {
  return load().settings;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  load().settings[key] = value;
  save();
}

/**
 * Cards for a flashcard round among `codes`: due ones first (lowest box first),
 * then up to `fresh` never-seen ones. Empty when nothing is due and all are seen.
 */
export function roundOf(codes: readonly string[], size = 20, fresh = 10, now = Date.now()): string[] {
  const s = load();
  const due = codes
    .filter((c) => s.cards[c] && s.cards[c][1] <= now)
    .sort((a, b) => s.cards[a][0] - s.cards[b][0] || s.cards[a][1] - s.cards[b][1]);
  const unseen = codes.filter((c) => !s.cards[c]);
  const pickedFresh = unseen.sort(() => Math.random() - 0.5).slice(0, Math.max(0, Math.min(fresh, size - due.length)));
  return [...due.slice(0, size), ...pickedFresh].slice(0, size);
}

/** Any cards among `codes`, those that are due soonest first. For "review anyway". */
export function reviewAnyway(codes: readonly string[], size = 20): string[] {
  const s = load();
  return [...codes].filter((c) => s.cards[c]).sort((a, b) => s.cards[a][1] - s.cards[b][1]).slice(0, size);
}
