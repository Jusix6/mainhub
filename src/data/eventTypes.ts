/** Schedule entry types with label and color. */
export const EVENT_TYPE_SLUGS = ['stream', 'video', 'post', 'release', 'event'] as const;

export type EventTypeSlug = (typeof EVENT_TYPE_SLUGS)[number];

export interface EventType {
  slug: EventTypeSlug;
  label: string;
  color: `--c-${string}`;
  icon: string;
  /** Assumed duration in minutes when `end` is not given (used for the live state). */
  defaultMinutes: number;
}

export const EVENT_TYPES: readonly EventType[] = [
  { slug: 'stream', label: 'Stream', color: '--c-purple', icon: 'twitch', defaultMinutes: 120 },
  { slug: 'video', label: 'Video', color: '--c-orange', icon: 'videos', defaultMinutes: 30 },
  { slug: 'post', label: 'Post', color: '--c-blue', icon: 'sparkle', defaultMinutes: 30 },
  { slug: 'release', label: 'Release', color: '--c-green', icon: 'star', defaultMinutes: 60 },
  { slug: 'event', label: 'Event', color: '--c-yellow', icon: 'calendar', defaultMinutes: 120 },
];

export function getEventType(slug: EventTypeSlug): EventType {
  const found = EVENT_TYPES.find((t) => t.slug === slug);
  if (!found) throw new Error(`Unknown event type: ${slug}`);
  return found;
}
