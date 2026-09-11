/** Date helpers shared by pages and components. */

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const monthFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
});

/** "11 Sept 2026" */
export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** "September 2026" – for project dates, where the exact day rarely matters. */
export function formatMonth(date: Date): string {
  return monthFormatter.format(date);
}

/** ISO date for <time datetime> attributes. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
