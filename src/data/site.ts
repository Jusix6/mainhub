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
  // TODO: real contact e-mail
  email: 'hello@example.com',
  // TODO: real domain (also update `site` in astro.config.mjs)
  url: 'https://example.com',
  socials: [
    // TODO: replace placeholder URLs and handles
    { type: 'youtube', url: 'https://www.youtube.com/@justin', handle: '@justin' },
    { type: 'twitch', url: 'https://www.twitch.tv/justin', handle: 'justin' },
    { type: 'github', url: 'https://github.com/justin', handle: 'justin' },
  ] satisfies SocialLink[],
  youtube: {
    // TODO: channel ID (starts with "UC..."), used to read the public RSS feed at build time
    channelId: '',
  },
  twitch: {
    url: 'https://www.twitch.tv/justin',
    // Free text shown next to the Twitch link, leave empty to hide
    schedule: '',
  },
} as const;
