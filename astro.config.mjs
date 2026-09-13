// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Canonical origin (sitemap, RSS, OG URLs, robots.txt). Apex jxsi.ch should redirect here.
const SITE = 'https://www.jxsi.ch';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  integrations: [sitemap()],
  build: {
    format: 'file',
  },
  image: {
    // YouTube thumbnails are fetched and optimized at build time, no runtime request
    domains: ['i.ytimg.com'],
  },
});
