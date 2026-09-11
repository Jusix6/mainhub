/**
 * Project statuses. `sticker: true` means the status is shown as a slanted
 * sticker on the project cover (only for non-released states).
 */
export const STATUS_SLUGS = ['idea', 'in-progress', 'released', 'paused', 'archived'] as const;

export type StatusSlug = (typeof STATUS_SLUGS)[number];

export interface Status {
  slug: StatusSlug;
  label: string;
  color: `--c-${string}`;
  sticker: boolean;
}

export const STATUSES: readonly Status[] = [
  { slug: 'idea', label: 'Idea', color: '--c-grey', sticker: true },
  { slug: 'in-progress', label: 'In progress', color: '--c-yellow', sticker: true },
  { slug: 'released', label: 'Released', color: '--c-green', sticker: false },
  { slug: 'paused', label: 'Paused', color: '--c-orange', sticker: true },
  { slug: 'archived', label: 'Archived', color: '--c-grey', sticker: false },
];

export function getStatus(slug: StatusSlug): Status {
  const found = STATUSES.find((s) => s.slug === slug);
  if (!found) throw new Error(`Unknown status: ${slug}`);
  return found;
}
