/**
 * RSS feed of all published updates.
 */
import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '@/data/site';
import { getPublishedUpdates, updateUrl } from '@/lib/updates';

export async function GET(context: APIContext) {
  const updates = await getPublishedUpdates();
  return rss({
    title: `${SITE.title} · Updates`,
    description: `Devlog, releases and news from ${SITE.name}.`,
    site: context.site ?? SITE.url,
    trailingSlash: false,
    items: updates.map((u) => ({
      title: u.data.title,
      pubDate: u.data.date,
      link: updateUrl(u),
      description: u.body?.replace(/<!--[\s\S]*?-->/g, '').trim(),
      categories: [u.data.type, ...(u.data.project ? [u.data.project.id] : [])],
    })),
    customData: '<language>en</language>',
  });
}
