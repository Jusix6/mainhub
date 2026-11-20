---
title: "Locking the doors"
date: 2026-11-02
type: news
---

Nothing to look at in this one, but a lot changed under the hood. Before
adding more games I wanted the site to be properly locked down.

## What changed

- **A strict content security policy.** The browser only runs scripts that
  are part of my build. Every inline script gets a hash at build time, and
  everything else must come from my own domain. Injected code simply does not
  run.
- **HSTS** and a few other headers: the site only speaks HTTPS and cannot be
  put inside someone else's frame.
- **The Button got armour.** Its API only accepts clicks from my own pages,
  only small JSON bodies (up to 512 bytes) and up to 240 requests a minute
  per visitor. The list of players has a hard limit, so nobody can fill the
  database with junk.
- **Astro 5 → 7** and fresh versions of everything else. `npm audit` is clean.
- Files with a hash in their name now skip the worker entirely. That saves
  requests and keeps the free quota free.

## What was hard

The policy and Astro had to learn to live together. Astro likes to put small
scripts straight into the page, and a strict policy blocks exactly that. Now
component scripts are always bundled into files, and a small script after
every build collects the hashes of the few inline scripts that are left and
writes them into the headers. If an inline script shows up that I did not
expect, the build stops, so nothing broken ever reaches visitors.
