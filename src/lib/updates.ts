import { getCollection, type CollectionEntry } from 'astro:content';

export type UpdateEntry = CollectionEntry<'updates'>;

/**
 * URL slug for an update: the file name without the leading YYYY-MM-DD- prefix.
 * "2026-09-11-building-the-mainhub" → "building-the-mainhub"
 */
export function updateSlug(entry: UpdateEntry): string {
  return entry.id.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

/**
 * The first paragraph of an update as plain text (no headings, images or
 * Markdown marks), cut at a word boundary. For lists and the meta description.
 */
export function updateExcerpt(entry: UpdateEntry, max = 160): string {
  const para = (entry.body ?? '')
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('<') && !p.startsWith('-'));
  if (!para) return '';
  const text = para
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(' ', max - 1)).replace(/[,;:.]$/, '') + ' …';
}

export function updateUrl(entry: UpdateEntry): string {
  return `/updates/${updateSlug(entry)}`;
}

/**
 * All updates that should be visible, newest first.
 * Drafts are shown in `astro dev` only, never in the production build.
 */
export async function getPublishedUpdates(): Promise<UpdateEntry[]> {
  const entries = await getCollection('updates', ({ data }) => import.meta.env.DEV || !data.draft);
  const sorted = entries.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  const seen = new Map<string, string>();
  for (const e of sorted) {
    const slug = updateSlug(e);
    const other = seen.get(slug);
    if (other) throw new Error(`Duplicate update slug "${slug}" in ${e.id} and ${other}. Rename one file.`);
    seen.set(slug, e.id);
  }
  return sorted;
}

export async function getUpdatesForProject(projectId: string): Promise<UpdateEntry[]> {
  const all = await getPublishedUpdates();
  return all.filter((u) => u.data.project?.id === projectId);
}
