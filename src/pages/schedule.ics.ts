/**
 * iCalendar feed of the schedule. Subscribe in Apple/Google Calendar to get new dates automatically.
 */
import type { APIContext } from 'astro';
import { SITE } from '@/data/site';
import { getSchedule, eventEnd } from '@/lib/schedule';

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

/** RFC 5545: lines longer than 75 octets are folded with CRLF + space. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, 'utf8') > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), 'utf8') > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = ' ' + rest.slice(cut);
  }
  out.push(rest);
  return out.join('\r\n');
}

export async function GET(context: APIContext) {
  const events = await getSchedule();
  const host = (context.site ?? new URL(SITE.url)).host;
  const stamp = icsDate(new Date());

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${SITE.title}//Schedule//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(`${SITE.name} · Schedule`)}`,
    'X-WR-TIMEZONE:Europe/Zurich',
  ];

  for (const e of events) {
    const description = [e.data.note, e.data.url].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.data.id}@${host}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(e.data.start)}`,
      `DTEND:${icsDate(eventEnd(e))}`,
      `SUMMARY:${escapeText(e.data.title)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      ...(e.data.url ? [`URL:${e.data.url}`] : []),
      `STATUS:${e.data.tentative ? 'TENTATIVE' : 'CONFIRMED'}`,
      `CATEGORIES:${escapeText(e.data.type)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="schedule.ics"',
    },
  });
}
