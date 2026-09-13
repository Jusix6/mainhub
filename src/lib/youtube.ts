/**
 * Reads the latest video from a channel's public RSS feed at build time.
 * No API key. Never throws: on any problem it logs a warning and returns null,
 * and the page simply hides the video block.
 */
import { SITE } from '@/data/site';

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
    if (!video) console.warn('[youtube] feed had no entries');
    return video;
  } catch (err) {
    console.warn(`[youtube] could not read channel feed, hiding video block: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
