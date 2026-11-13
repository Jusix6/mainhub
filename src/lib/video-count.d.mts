/** Types for video-count.mjs (plain JS so worker.js can share it). */
export function parseVideoCount(html: string, handle: string): number | null;
export function fetchVideoSum(channels: readonly string[], options?: { timeoutMs?: number }): Promise<number | null>;
