// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Canonical origin (sitemap, RSS, OG URLs, robots.txt). Apex jxsi.ch should redirect here.
const SITE = 'https://www.jxsi.ch';

export default defineConfig({
  site: SITE,
  output: 'static',
  trailingSlash: 'never',
  integrations: [
    sitemap({
      // Pages under /fun/ and /library/ are served on fun.jxsi.ch and library.jxsi.ch
      // (see worker.js); www redirects there. /creative/tiles only holds templates.
      filter: (page) => !/\/(fun|library|creative)(\/|$)/.test(new URL(page).pathname),
    }),
  ],
  build: {
    format: 'file',
  },
  image: {
    // YouTube thumbnails are fetched and optimized at build time, no runtime request
    domains: ['i.ytimg.com'],
  },
  vite: {
    build: {
      // Never inline component scripts as <script> blocks: the CSP only allows
      // bundled files plus the hashed bootstrap in Head.astro (see scripts/csp.mjs).
      assetsInlineLimit: 0,
    },
  },
});
