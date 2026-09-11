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
    links: 'Links',
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
    projects: 'Projects',
    relatedUpdates: 'Updates on this project',
  },
  filters: {
    all: 'All',
    category: 'Category',
    status: 'Status',
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
  },
  footer: {
    madeIn: 'Made in Switzerland',
  },
  notFound: {
    title: 'Nothing on this floor.',
    text: 'The page you are looking for does not exist.',
    cta: 'Take the stairs home',
  },
} as const;
