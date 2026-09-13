/**
 * External link types used in project frontmatter (`links[].type`) and in
 * site.ts socials. Adding a store or platform = adding one entry here.
 * `icon` is a key resolved by the Icon component (added in phase 2).
 */
export const LINK_TYPE_SLUGS = [
  'appstore',
  'playstore',
  'steam',
  'itch',
  'gumroad',
  'spotify',
  'applemusic',
  'bandcamp',
  'youtube',
  'twitch',
  'instagram',
  'tiktok',
  'github',
  'website',
  'other',
] as const;

export type LinkTypeSlug = (typeof LINK_TYPE_SLUGS)[number];

export interface LinkType {
  slug: LinkTypeSlug;
  /** Default button label, can be overridden per link via `label`. */
  label: string;
  color: `--c-${string}` | '--surface';
  icon: string;
}

export const LINK_TYPES: readonly LinkType[] = [
  { slug: 'appstore', label: 'App Store', color: '--c-blue', icon: 'apple' },
  { slug: 'playstore', label: 'Google Play', color: '--c-green', icon: 'playstore' },
  { slug: 'steam', label: 'Steam', color: '--c-blue', icon: 'steam' },
  { slug: 'itch', label: 'itch.io', color: '--c-pink', icon: 'itch' },
  { slug: 'gumroad', label: 'Gumroad', color: '--c-pink', icon: 'gumroad' },
  { slug: 'spotify', label: 'Spotify', color: '--c-green', icon: 'spotify' },
  { slug: 'applemusic', label: 'Apple Music', color: '--c-pink', icon: 'apple' },
  { slug: 'bandcamp', label: 'Bandcamp', color: '--c-blue', icon: 'bandcamp' },
  { slug: 'youtube', label: 'YouTube', color: '--c-orange', icon: 'youtube' },
  { slug: 'twitch', label: 'Twitch', color: '--c-purple', icon: 'twitch' },
  { slug: 'instagram', label: 'Instagram', color: '--c-pink', icon: 'instagram' },
  { slug: 'tiktok', label: 'TikTok', color: '--surface', icon: 'tiktok' },
  { slug: 'github', label: 'GitHub', color: '--surface', icon: 'github' },
  { slug: 'website', label: 'Website', color: '--c-yellow', icon: 'link' },
  { slug: 'other', label: 'Link', color: '--surface', icon: 'link' },
];

export function getLinkType(slug: LinkTypeSlug): LinkType {
  const found = LINK_TYPES.find((l) => l.slug === slug);
  if (!found) throw new Error(`Unknown link type: ${slug}`);
  return found;
}
