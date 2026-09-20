/**
 * Every user-facing UI string lives here (not project/update content).
 * Kept in one place so a German version with a language switch can be added
 * later without touching components.
 */
export const UI = {
  nav: {
    home: 'Home',
    projects: 'Projects',
    updates: 'Updates',
    schedule: 'Schedule',
    links: 'Links',
  },
  schedule: {
    intro: 'When the next stream, video, post or release is coming.',
    upcoming: 'Coming up',
    recent: 'Recently',
    empty: 'No dates yet. Follow on Twitch or YouTube to get notified.',
    subscribe: 'Add to calendar',
    followTwitch: 'Follow on Twitch',
    tentative: 'maybe',
    live: 'Live now',
    nextStream: 'Next stream',
    timezone: 'All times are Swiss time (Europe/Zurich).',
    seeAll: 'Full schedule',
  },
  actions: {
    tapToFlip: 'tap to flip',
    saveContact: 'Save contact',
    seeMyWork: 'See my work',
    allProjects: 'All projects',
    readMore: 'Read more',
    backToProjects: 'Back to projects',
    skipToContent: 'Skip to content',
  },
  sections: {
    featured: 'Highlights',
    latestUpdates: 'Latest updates',
    latestVideo: 'Latest video',
    live: 'Live on Twitch',
    liveText: 'I stream on Twitch every now and then. Follow to get notified.',
    allUpdates: 'All updates',
    projects: 'Projects',
    relatedUpdates: 'Updates on this project',
  },
  filters: {
    all: 'All',
    category: 'Category',
    status: 'Status',
    project: 'Project',
    noResults: 'Nothing here yet. Try another filter.',
  },
  meta: {
    platforms: 'Platforms',
    tech: 'Built with',
    released: 'Released',
    started: 'Started',
    updated: 'Updated',
  },
  card: {
    flip: 'Flip the card',
    flipBack: 'Flip back',
    whatIMake: 'What I make',
    visit: 'Explore the site',
    scanned: 'You scanned my card. Nice.',
    /** Easter egg: after this many flips the card gets tired. Stages in flip order; the last one resets. */
    tired: [
      { at: 10, text: 'why are you doing this?' },
      { at: 13, text: 'seriously?' },
      { at: 16, text: 'fine. here you go.', reset: true },
    ],
  },
  footer: {
    madeIn: 'Made in Switzerland',
    card: 'Business card',
  },
  legal: {
    updated: 'Last updated',
    privacy: 'Privacy policy',
    heading: 'Legal',
  },
  notFound: {
    title: 'Nothing on this floor.',
    text: 'The page you are looking for does not exist.',
    cta: 'Take the stairs home',
  },
} as const;
