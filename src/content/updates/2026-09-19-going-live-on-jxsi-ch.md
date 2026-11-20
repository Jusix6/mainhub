---
title: "Going live on jxsi.ch"
date: 2026-09-19
type: news
cover: ../../assets/updates/hub.webp
---

The MainHub has a real address now: **jxsi.ch**. Getting there took a lot
longer than writing the site itself.

## What changed

- The site runs as a Cloudflare Worker with static assets. Every page is
  built ahead of time, and the worker only steps in for redirects and a few
  small APIs.
- `jxsi.ch`, `www.jxsi.ch` and plain `http://` all end up at
  `https://www.jxsi.ch`, so there is exactly one address for every page.
- The hub got its final shape: the business card as the hero, the six
  categories, featured projects, the schedule, the latest video and Twitch.

## What was hard

**DNSSEC.** The domain was registered with DNSSEC switched on and an old key.
Cloudflare could not activate the zone because resolvers that check signatures
saw a key that no longer matched anything. For days the site just
was not there for some people. The fix was a single switch: turn DNSSEC
off at the registrar, wait an hour, done. It can come back later with
Cloudflare's own key.

**Redirects.** My first plan was a `_redirects` file. It turned out Workers
only allow relative targets there, so "send `jxsi.ch` to `www.jxsi.ch`" was
impossible. That job moved into the worker itself.

## Bugs fixed on the way

- Canonical URLs ended in `.html`. Search engines would have indexed every
  page twice.
- The JSON-LD block was an external script, which broke under the content
  security policy. It is inline now.

## Next

Turning the business card into the front door of the site.
