/**
 * Structured data (schema.org JSON-LD) for search engines: who made the site,
 * breadcrumbs, articles (update posts) and browser games. Head.astro puts it
 * into the page; the layouts and pages build it with these helpers.
 */
import { SITE } from '@/data/site';

export type JsonLd = Record<string, unknown>;

/** The author of everything here. */
export const person = (): JsonLd => ({ '@type': 'Person', name: SITE.fullName, url: SITE.url });

/** A trail of [name, absolute URL] pairs, from the top down to this page. */
export function breadcrumbs(items: [string, string][]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

/** An update post. */
export function article(o: { title: string; description?: string; url: string; date: Date; image?: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: o.title,
    description: o.description,
    url: o.url,
    mainEntityOfPage: o.url,
    datePublished: o.date.toISOString(),
    image: o.image,
    author: person(),
    publisher: { '@type': 'Person', name: SITE.fullName, url: SITE.url },
  };
}

/** A game that runs in the browser, free, no account. */
export function game(o: { name: string; description: string; url: string; image?: string }): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: o.name,
    description: o.description,
    url: o.url,
    image: o.image,
    author: person(),
    gamePlatform: 'Web browser',
    applicationCategory: 'Game',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'CHF' },
  };
}
