/**
 * The Flags book (library.jxsi.ch/flags): data, scopes, answer matching and
 * the pick of wrong options. Used by the page at build time and by its script
 * in the browser. Data from src/data/library/flags.json, written by
 * scripts/import-world-flags.mjs (see there for what same/like/near mean).
 */
import DATA from '@/data/library/flags.json';

const URLS = import.meta.glob('../../assets/flags/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

export interface LibFlag {
  code: string;
  name: string;
  aliases: string[];
  capital: string;
  continent: string;
  kind: 'country' | 'territory';
  parent?: string;
  colors: string[];
  w: number;
  h: number;
  /** Identical flags: either answer counts. */
  same?: string[];
  /** Practically identical: never offered against each other. */
  like?: string[];
  /** Look-alikes: good wrong options. */
  near?: string[];
  src: string;
}

export const FLAGS: readonly LibFlag[] = (DATA as Omit<LibFlag, 'src'>[]).map((f) => ({
  ...f,
  src: URLS[`../../assets/flags/${f.code}.svg`],
}));

export const BY_CODE = new Map(FLAGS.map((f) => [f.code, f]));

export const CONTINENTS = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const;

export const SCOPES = ['all', 'countries', ...CONTINENTS, 'territories'] as const;
export type Scope = (typeof SCOPES)[number];

export function inScope(f: LibFlag, scope: Scope): boolean {
  if (scope === 'all') return true;
  if (scope === 'countries') return f.kind === 'country';
  if (scope === 'territories') return f.kind === 'territory';
  return f.continent === scope;
}

export const scopeCount = (scope: Scope) => FLAGS.filter((f) => inScope(f, scope)).length;

/* ---- Answer matching ------------------------------------------------------ */

/** Lowercase, no accents, "&" → "and", "St." → "saint", letters and digits only. */
export function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Every name that counts as right for this flag: its own and those of identical flags. */
export function acceptedNames(f: LibFlag): string[] {
  const own = [f.name, ...f.aliases];
  const same = (f.same ?? []).flatMap((c) => {
    const o = BY_CODE.get(c);
    return o ? [o.name, ...o.aliases] : [];
  });
  return [...own, ...same];
}

export type Verdict = { ok: true; exact: boolean; name: string } | { ok: false };

/** Typed answer against a flag: exact, or a small typo (1 letter, 2 for long names). */
export function check(answer: string, f: LibFlag): Verdict {
  const a = normalise(answer);
  if (!a) return { ok: false };
  let best: { d: number; name: string } | null = null;
  for (const name of acceptedNames(f)) {
    const n = normalise(name);
    if (n === a) return { ok: true, exact: true, name };
    const d = levenshtein(a, n);
    if (!best || d < best.d) best = { d, name };
  }
  if (!best) return { ok: false };
  const target = normalise(best.name);
  const allowed = target.length >= 10 ? 2 : target.length >= 5 ? 1 : 0;
  // A typo must not turn the answer into another place (Niger / Nigeria, Guinea …)
  const other = FLAGS.some((o) => o !== f && !(f.same ?? []).includes(o.code) && normalise(o.name) === a);
  return best.d <= allowed && !other ? { ok: true, exact: false, name: best.name } : { ok: false };
}

/** Name suggestions while typing: names (and aliases) that start with the input, then contain it. */
export function suggest(input: string, pool: readonly LibFlag[], max = 5): string[] {
  const a = normalise(input);
  if (a.length < 2) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const f of pool) {
    const n = normalise(f.name);
    if (n.startsWith(a)) starts.push(f.name);
    else if (n.includes(a) || f.aliases.some((x) => normalise(x).startsWith(a))) contains.push(f.name);
  }
  return [...starts.sort(), ...contains.sort()].slice(0, max);
}

/* ---- Wrong options for the multiple-choice quiz --------------------------- */

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** How many main colours two flags share (roughly). */
function sharedColors(a: LibFlag, b: LibFlag): number {
  let n = 0;
  for (const x of a.colors) {
    const [r1, g1, b1] = rgb(x);
    if (b.colors.some((y) => {
      const [r2, g2, b2] = rgb(y);
      return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 120;
    })) n++;
  }
  return n;
}

/**
 * Three wrong options for `answer`: look-alikes first, then flags from the same
 * continent with similar colours, with some randomness so rounds differ.
 * Identical and practically identical flags are never offered.
 */
export function distractors(answer: LibFlag, pool: readonly LibFlag[], rand: () => number = Math.random): LibFlag[] {
  const banned = new Set([answer.code, ...(answer.same ?? []), ...(answer.like ?? [])]);
  const scored = (pool.length >= 8 ? pool : FLAGS)
    .filter((f) => !banned.has(f.code))
    .map((f) => {
      let s = rand() * 3;
      if (answer.near?.includes(f.code)) s += 5;
      if (f.continent === answer.continent) s += 2;
      s += sharedColors(answer, f) * 1.2;
      return { f, s };
    })
    .sort((a, b) => b.s - a.s);
  const picked: LibFlag[] = [];
  // Take from the best few at random, and keep identical flags out of the same set of options
  const top = scored.slice(0, 9).map((x) => x.f);
  while (picked.length < 3 && top.length) {
    const [f] = top.splice(Math.floor(rand() * top.length), 1);
    const clash = picked.some((p) => p.same?.includes(f.code) || p.like?.includes(f.code));
    if (!clash) picked.push(f);
  }
  return picked;
}

export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** "Territory of France", "Part of the United Kingdom" or "Country". */
export function statusLine(f: LibFlag, s: { country: string; territory: string; territoryOf: string; partOf: string }): string {
  if (f.kind === 'country') return s.country;
  const parent = f.parent ? BY_CODE.get(f.parent) : undefined;
  if (!parent) return s.territory;
  return `${f.code.startsWith('gb-') ? s.partOf : s.territoryOf} ${parent.code === 'gb' || parent.code === 'us' || parent.code === 'nl' ? 'the ' : ''}${parent.name}`;
}
