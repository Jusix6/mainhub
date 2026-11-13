/**
 * Shared helpers for the daily fun games (Paint the Flag, Color Hunter): the
 * day changes at midnight in Zurich for everyone, and picks are made with a
 * seeded shuffle so all players get the same puzzle without a server.
 */

const zurichDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
const zurichTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Today's date in Zurich as UTC midnight milliseconds. */
function zurichDayUtc(now: Date): number {
  const [y, m, d] = zurichDate.format(now).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Puzzle number for a game that launched on `launchUtc` (Date.UTC of day 1). */
export function dayIndex(launchUtc: number, now = new Date()): number {
  return Math.max(1, Math.round((zurichDayUtc(now) - launchUtc) / 86_400_000) + 1);
}

/** 0 = Sunday … 6 = Saturday, in Zurich. */
export function zurichWeekday(now = new Date()): number {
  return new Date(zurichDayUtc(now)).getUTCDay();
}

/** Seconds until midnight in Zurich. */
export function secondsToNextDay(now = new Date()): number {
  const [h, m, s] = zurichTime.format(now).split(':').map(Number);
  return 86_400 - (h * 3600 + m * 60 + s);
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * The item for `day` from `pool`: each cycle through the pool uses its own
 * shuffled order, so nothing repeats before everything had a turn. The pool
 * must be in a stable order; adding items reshuffles future days.
 */
export function dailyPick<T>(pool: readonly T[], day: number, salt: number): T {
  const cycle = Math.floor((day - 1) / pool.length);
  const order = pool.map((_, i) => i);
  const rnd = mulberry32(salt + cycle * 7919 + 20261108);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return pool[order[(day - 1) % pool.length]];
}
