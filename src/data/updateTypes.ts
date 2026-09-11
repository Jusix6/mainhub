/** Update/devlog entry types with label and color. */
export const UPDATE_TYPE_SLUGS = ['devlog', 'release', 'news'] as const;

export type UpdateTypeSlug = (typeof UPDATE_TYPE_SLUGS)[number];

export interface UpdateType {
  slug: UpdateTypeSlug;
  label: string;
  color: `--c-${string}`;
}

export const UPDATE_TYPES: readonly UpdateType[] = [
  { slug: 'devlog', label: 'Devlog', color: '--c-blue' },
  { slug: 'release', label: 'Release', color: '--c-green' },
  { slug: 'news', label: 'News', color: '--c-yellow' },
];

export function getUpdateType(slug: UpdateTypeSlug): UpdateType {
  const found = UPDATE_TYPES.find((t) => t.slug === slug);
  if (!found) throw new Error(`Unknown update type: ${slug}`);
  return found;
}
