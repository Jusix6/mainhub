/**
 * Project categories. Adding a category = adding one entry here.
 * `color` is a CSS custom property defined in src/styles/tokens.css.
 * `icon` is a key resolved by the Icon component (added in phase 2).
 */
export const CATEGORY_SLUGS = [
  'apps',
  'games',
  'music',
  'videos',
  'products',
  'experiments',
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export interface Category {
  slug: CategorySlug;
  label: string;
  /** Short description shown on filter chips and the business card back. */
  blurb: string;
  color: `--c-${string}`;
  icon: string;
}

export const CATEGORIES: readonly Category[] = [
  { slug: 'apps', label: 'Apps', blurb: 'iOS and beyond', color: '--c-blue', icon: 'apps' },
  { slug: 'games', label: 'Games', blurb: 'Made with Godot', color: '--c-pink', icon: 'games' },
  { slug: 'music', label: 'Music', blurb: 'Tracks and releases', color: '--c-purple', icon: 'music' },
  { slug: 'videos', label: 'Videos', blurb: 'YouTube and streams', color: '--c-orange', icon: 'videos' },
  { slug: 'products', label: 'Digital Products', blurb: 'Templates, packs, tools', color: '--c-yellow', icon: 'products' },
  { slug: 'experiments', label: 'Experiments', blurb: 'Prototypes and weird stuff', color: '--c-green', icon: 'experiments' },
];

export function getCategory(slug: CategorySlug): Category {
  const found = CATEGORIES.find((c) => c.slug === slug);
  if (!found) throw new Error(`Unknown category: ${slug}`);
  return found;
}
