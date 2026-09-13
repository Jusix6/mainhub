import { getCollection, type CollectionEntry } from 'astro:content';
import { getEventType } from '@/data/eventTypes';

export type ScheduleEntry = CollectionEntry<'schedule'>;

const TZ = 'Europe/Zurich';

/** Effective end: explicit `end` or start + the type's default duration. */
export function eventEnd(e: ScheduleEntry): Date {
  if (e.data.end) return e.data.end;
  return new Date(e.data.start.getTime() + getEventType(e.data.type).defaultMinutes * 60_000);
}

/** All visible entries sorted by start (drafts in dev only). */
export async function getSchedule(): Promise<ScheduleEntry[]> {
  const entries = await getCollection('schedule', ({ data }) => import.meta.env.DEV || !data.draft);
  return entries.sort((a, b) => a.data.start.valueOf() - b.data.start.valueOf());
}

/**
 * Split at build time. "Upcoming" includes anything that has not ended yet,
 * so a stream that is live while the site builds still shows up.
 * The client script refines this at view time.
 */
export async function getUpcomingAndPast(now = new Date()) {
  const all = await getSchedule();
  const upcoming = all.filter((e) => eventEnd(e) >= now);
  const past = all.filter((e) => eventEnd(e) < now).reverse();
  return { upcoming, past };
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const dayNumFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric' });
const monthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const zoneFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, timeZoneName: 'short' });
const fullFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "Sat 20 Sept" */
export const formatDay = (d: Date) => dayFmt.format(d);
/** "20" */
export const formatDayNumber = (d: Date) => dayNumFmt.format(d);
/** "Sept" */
export const formatMonthShort = (d: Date) => monthFmt.format(d);
/** "Sat" */
export const formatWeekday = (d: Date) => weekdayFmt.format(d);
/** "20:00" */
export const formatTime = (d: Date) => timeFmt.format(d);
/** "CEST" */
export const formatZone = (d: Date) => zoneFmt.formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'CET';
/** "Sat 20 Sept, 20:00" */
export const formatFull = (d: Date) => fullFmt.format(d);

/** Time range for one entry: "20:00–22:00 CEST" */
export function formatRange(e: ScheduleEntry): string {
  const start = formatTime(e.data.start);
  const end = e.data.end ? `–${formatTime(e.data.end)}` : '';
  return `${start}${end} ${formatZone(e.data.start)}`;
}
