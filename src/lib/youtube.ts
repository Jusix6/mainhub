/**
 * Reads the latest video from a channel's public RSS feed at build time.
 * No API key. Never throws: on any problem it logs a warning and falls back to
 * src/data/latest-video.json, the last video a successful build has seen (that
 * file is refreshed whenever the feed works, so commit it along). Only when
 * there is no fallback either does the page hide the video block.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { SITE } from '@/data/site';
import fallback from '@/data/latest-video.json';

export interface LatestVideo {
  id: string;
  title: string;
  published: Date;
  url: string;
  thumbnail: string;
}

const FEED_TIMEOUT_MS = 6000;

function pick(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m?.[1]?.trim();
}

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Exported for tests: parses the first <entry> of a YouTube feed. */
export function parseLatestVideo(xml: string): LatestVideo | null {
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entry) return null;

  const id = pick(entry, 'yt:videoId');
  const title = pick(entry, 'title');
  const published = pick(entry, 'published');
  if (!id || !title || !published) return null;

  return {
    id,
    title: decode(title),
    published: new Date(published),
    url: `https://www.youtube.com/watch?v=${id}`,
    // The feed points at iN.ytimg.com hosts that redirect; the canonical host does not,
    // which keeps Astro's remote image cache revalidation warning-free.
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

let cached: Promise<LatestVideo | null> | undefined;

export function getLatestVideo(): Promise<LatestVideo | null> {
  cached ??= fetchLatestVideo();
  return cached;
}

async function fetchLatestVideo(): Promise<LatestVideo | null> {
  const channelId = SITE.youtube.channelId;
  if (!channelId) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const video = parseLatestVideo(await res.text());
    if (!video) throw new Error('feed had no entries');
    await rememberVideo(video);
    return video;
  } catch (err) {
    console.warn(`[youtube] could not read channel feed (${(err as Error).message}), using src/data/latest-video.json`);
    return fallbackVideo();
  } finally {
    clearTimeout(timer);
  }
}

const FALLBACK_PATH = new URL('../data/latest-video.json', import.meta.url);

function fallbackVideo(): LatestVideo | null {
  if (!fallback?.id) return null;
  return {
    id: fallback.id,
    title: fallback.title,
    published: new Date(fallback.published),
    url: `https://www.youtube.com/watch?v=${fallback.id}`,
    thumbnail: `https://i.ytimg.com/vi/${fallback.id}/hqdefault.jpg`,
  };
}

/** Best effort: keep the fallback file current so a later feed outage still shows the newest video. */
async function rememberVideo(video: LatestVideo) {
  try {
    const current = JSON.parse(await readFile(FALLBACK_PATH, 'utf8'));
    if (current.id === video.id) return;
    const data = { id: video.id, title: video.title, published: video.published.toISOString() };
    await writeFile(FALLBACK_PATH, JSON.stringify(data, null, 2) + '\n');
    console.log(`[youtube] fallback updated to ${video.id}, commit src/data/latest-video.json`);
  } catch {
    /* read-only or missing: nothing to do */
  }
}
