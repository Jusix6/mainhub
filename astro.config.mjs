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
      // /creative/tiles only holds templates
      filter: (page) => !/\/creative(\/|$)/.test(new URL(page).pathname),
      // Pages under /fun/ and /library/ are served at the root of fun.jxsi.ch and
      // library.jxsi.ch (see worker.js): list them with those addresses. The
      // subdomains' robots.txt points at this sitemap, so that is allowed.
      serialize(item) {
        const url = new URL(item.url);
        for (const [prefix, host] of [
          ['/fun', 'https://fun.jxsi.ch'],
          ['/library', 'https://library.jxsi.ch'],
        ]) {
          if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) item.url = host + (url.pathname.slice(prefix.length) || '/');
        }
        return item;
      },
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
