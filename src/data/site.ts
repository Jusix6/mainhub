import type { LinkTypeSlug } from './linkTypes';

/**
 * Single source of truth for everything about the person behind the site.
 * Used by the business card, the vCard, the footer and the /links page.
 */
export interface SocialLink {
  type: LinkTypeSlug;
  url: string;
  /** Display handle, e.g. "@jusidroppop69". */
  handle: string;
}

export const SITE = {
  name: 'Jusi',
  // TODO: full name for the vCard, if different from `name`
  fullName: 'Jusi',
  title: 'MAINHUB',
  tagline: 'Creative from Switzerland',
  description:
    'Apps, games, music, videos and digital products by Jusi, a creative from Switzerland.',
  bio: 'I make apps, games, music, videos and digital products. This is where all of it lands.',
  location: 'Switzerland',
  email: 'contactjxsi@gmail.com',
  // Keep in sync with `site` in astro.config.mjs
  url: 'https://www.jxsi.ch',
  socials: [
    { type: 'youtube', url: 'https://www.youtube.com/@jusidroppop69', handle: '@jusidroppop69' },
    { type: 'youtube', url: 'https://www.youtube.com/@jusix69', handle: '@jusix69 · Gaming' },
    { type: 'twitch', url: 'https://www.twitch.tv/jusidroppop', handle: 'jusidroppop' },
    { type: 'instagram', url: 'https://www.instagram.com/jusidroppop', handle: '@jusidroppop' },
    { type: 'tiktok', url: 'https://www.tiktok.com/@jusidroppop6', handle: '@jusidroppop6' },
  ] satisfies SocialLink[],
  youtube: {
    // Main channel @jusidroppop69 (JusiDroppop). Gaming channel @jusix69 is UC8vN5zk8Ge_b6B5goaNX14g,
    // duo channel @Sky.Justin (with Sky) is UCHKiFOcnFfetf3E83uWW4tA.
    channelId: 'UCWHDPzJa99zS3XHaetPjdig',
  },
  /** Front of the business card: a "creative license" in the style of a certain fake Hawaiian ID. */
  license: {
    region: 'Switzerland',
    kind: 'Creative License',
    number: 'JXSI-CH-01',
    // Date of birth as DD/MM/YYYY, shown as DOB on the card
    dob: '10/03/2003',
    exp: 'NEVER',
    issued: '11/09/2026',
    cls: 'CREATIVE',
    restr: 'NONE',
    endorse: 'ALL',
    addressLines: ['MADE IN SWITZERLAND', 'WWW.JXSI.CH'],
    // Photo: src/assets/portrait.png (600x750), cropped 4:5 around the face.
    // The stats row shows project counts per category; override a value here when the real
    // number lives elsewhere (e.g. videos published on YouTube, not listed as projects).
    statOverrides: {
      videos: '184',
    } as Partial<Record<'apps' | 'games' | 'music' | 'videos', string>>,
  },
  twitch: {
    url: 'https://www.twitch.tv/jusidroppop',
    // Free text shown next to the Twitch link, leave empty to hide
    schedule: '',
  },
} as const;
