/**
 * Books on the shelf of library.jxsi.ch. A book = one page under
 * src/pages/library/<slug>.astro plus one entry in BOOKS and a spot in SHELVES.
 */
import { UI } from './ui';

export interface Book {
  slug: string;
  title: string;
  /** Title on the spine (gold lettering). */
  spine: string;
  tagline: string;
  /** Number on the spine label, e.g. "203". */
  count: string;
  /** Leather colour of the binding. */
  leather: string;
  /** Library call number on the catalogue card. */
  callNumber: string;
  /** What is inside, listed on the catalogue card. */
  contents: string[];
  /** Flag codes shown on the catalogue card. */
  stamps?: string[];
}

export const BOOKS: Record<string, Book> = {
  flags: {
    slug: 'flags',
    title: UI.library.flags.title,
    spine: UI.library.flags.title,
    tagline: UI.library.flags.tagline,
    count: '203',
    leather: '#1d3d6b',
    callNumber: 'GEO 203',
    contents: Object.values(UI.library.flags.modes),
    stamps: ['ch', 'jp', 'br', 'ca', 'kr', 'za'],
  },
};

/**
 * What stands on each shelf, left to right:
 *  - a book slug: a real, clickable book
 *  - `null`: an old volume without a topic yet (decoration, not clickable)
 *  - `'stack'`, `'globe'`, `'bookend'`, `'hourglass'`: decoration
 */
export type ShelfItem = string | null;

export const SHELVES: { label: string; items: ShelfItem[] }[] = [
  { label: UI.library.shelfNames[0], items: ['flags', null, null, null, null, null, null, 'bookend', 'stack', null, null, null, null, null, null] },
  { label: UI.library.shelfNames[1], items: [null, null, null, null, 'hourglass', null, null, null, null, null, null, 'globe', null, null, null] },
];

/** Bindings for the volumes without a topic: deep leathers and cloths. */
export const LEATHERS = ['#6d1f1f', '#234d33', '#3a2a5e', '#7a5a1c', '#5b3a1e', '#1f4a4a', '#4a2340', '#2e3b1f', '#7a2e12'];
