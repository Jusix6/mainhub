import type { LinkTypeSlug } from './linkTypes';

/**
 * Single source of truth for everything about the person behind the site.
 * Used by the business card, the vCard, the footer and the /links page.
 */
export interface SocialLink {
  type: LinkTypeSlug;
  url: string;
  /** Display handle, e.g. "@justin". */
  handle: string;
}

export const SITE = {
  name: 'Justin',
  // TODO: full name for the vCard, if different from `name`
  fullName: 'Justin',
  title: 'MAINHUB',
  tagline: 'Creative from Switzerland',
  description:
    'Apps, games, music, videos and digital products by Justin, a creative from Switzerland.',
  bio: 'I make apps, games, music, videos and digital products. This is where all of it lands.',
  location: 'Switzerland',
  email: 'contactjxsi@gmail.com',
  // Keep in sync with `site` in astro.config.mjs
  url: 'https://www.jxsi.ch',
  socials: [
    { type: 'youtube', url: 'https://www.youtube.com/@jusidroppop69', handle: '@jusidroppop69' },
    { type: 'youtube', url: 'https://www.youtube.com/@jusix69', handle: '@jusix69 · Gaming' },
    { type: 'twitch', url: 'https://www.twitch.tv/jusidroppop', handle: 'jusidroppop' },
    { type: 'github', url: 'https://github.com/Jusix6', handle: 'Jusix6' },
  ] satisfies SocialLink[],
  youtube: {
    // Main channel @jusidroppop69 (JusiDroppop). Gaming channel @jusix69 is UC8vN5zk8Ge_b6B5goaNX14g.
    channelId: 'UCWHDPzJa99zS3XHaetPjdig',
  },
  twitch: {
    url: 'https://www.twitch.tv/jusidroppop',
    // Free text shown next to the Twitch link, leave empty to hide
    schedule: '',
  },
} as const;
