// Counts the public videos on Jusi's YouTube channels, for the "Videos" stat on
// the business card. Shared by the build (src/lib/youtube.ts) and the worker
// cron (worker.js), so it is plain JavaScript without imports.
//
// The number shown is `offset + sum of all channels` (src/data/video-count.json).
// The offset keeps videos that are not on these channels (TikTok and older
// uploads) in the total: anchored on 2026-11-13, when the channels showed 93
// and the card said 185. Every new upload on any channel then adds one.
//
// No API key: the count is read from the channel header on the public channel
// page ("34 videos"). If YouTube changes that markup, the parse fails, nothing
// is updated and the last known number stays.

const HEADERS = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'accept-language': 'en-US,en;q=0.8',
  // Skips the EU cookie consent interstitial, which has no channel data
  cookie: 'CONSENT=YES+cb; SOCS=CAI',
};

/** Video count from a channel page's header, or null if it cannot be found. */
export function parseVideoCount(html, handle) {
  const at = html.indexOf(`"content":"${handle}"`);
  if (at < 0) return null;
  const header = html.slice(at, at + 1200);
  if (/"content":"No videos"/.test(header)) return 0;
  const m = header.match(/"content":"([\d,.]+) videos?"/);
  if (!m) return null;
  const n = Number(m[1].replace(/[,.]/g, ''));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/** Sum over all channels; null unless every channel could be read. */
export async function fetchVideoSum(channels, { timeoutMs = 8000 } = {}) {
  const counts = await Promise.all(
    channels.map(async (handle) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`https://www.youtube.com/${handle}`, { headers: HEADERS, signal: controller.signal });
        if (!res.ok) return null;
        return parseVideoCount(await res.text(), handle);
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return counts.every((c) => c !== null) ? counts.reduce((a, b) => a + b, 0) : null;
}
