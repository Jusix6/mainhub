/**
 * The browser games on fun.jxsi.ch (list on the fun index, tiles in the
 * creative mode). `href` is relative to the fun host root.
 */
import { UI } from './ui';
import colorsThumb from '@/assets/fun/thumbs/colors.png';
import flagThumb from '@/assets/fun/thumbs/flag.png';
import tenThumb from '@/assets/fun/thumbs/10s.png';
import buttonThumb from '@/assets/fun/thumbs/the-button.png';
import islandThumb from '@/assets/fun/thumbs/tiny-island.png';

const L = UI.fun.list;

export type GameTag = 'daily' | 'multiplayer' | 'quick';
export type GameChip = 'daily' | 'live' | 'quick';

export interface Game {
  href: string;
  title: string;
  tagline: string;
  thumb: ImageMetadata;
  meta: string;
  /** Release day, shown as "x days ago" on the card. */
  added: string;
  tags: GameTag[];
  /** Badge on the thumbnail; games without one show only "New" while they are the newest. */
  chip?: GameChip;
  /** Live number filled in by the fun index script (The Button only). */
  live?: boolean;
}

export const GAMES: Game[] = [
  {
    href: 'tiny-island',
    title: UI.fun.tinyIsland.title,
    tagline: UI.fun.tinyIsland.tagline,
    thumb: islandThumb,
    meta: L.meta.tinyIsland,
    added: '2026-11-18',
    tags: [],
  },
  {
    href: 'colors',
    title: UI.fun.colors.title,
    tagline: UI.fun.colors.tagline,
    thumb: colorsThumb,
    meta: L.meta.colors,
    added: '2026-11-13',
    tags: ['daily'],
    chip: 'daily',
  },
  {
    href: 'flag',
    title: UI.fun.flag.title,
    tagline: UI.fun.flag.tagline,
    thumb: flagThumb,
    meta: L.meta.flag,
    added: '2026-11-08',
    tags: ['daily'],
    chip: 'daily',
  },
  {
    href: '10s',
    title: UI.fun.tenSeconds.title,
    tagline: UI.fun.tenSeconds.tagline,
    thumb: tenThumb,
    meta: L.meta.tenSeconds,
    added: '2026-11-04',
    tags: ['quick'],
    chip: 'quick',
  },
  {
    href: 'the-button',
    title: UI.fun.theButton.title,
    tagline: UI.fun.theButton.tagline,
    thumb: buttonThumb,
    meta: L.meta.theButton,
    added: '2026-10-02',
    tags: ['multiplayer', 'quick'],
    chip: 'live',
    live: true,
  },
];
