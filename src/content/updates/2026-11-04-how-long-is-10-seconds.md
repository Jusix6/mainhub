---
title: "How long is 10 seconds?"
date: 2026-11-04
type: release
cover: ../../assets/updates/10s.webp
---

Game number two on [fun.jxsi.ch](https://fun.jxsi.ch/10s): press start, press
stop when you think ten seconds have passed. No clock, no ticking, just your
gut.

## What's new

- You get your time, how far off you were, a comment and roughly how many
  players you beat.
- Your best try stays in the browser.
- One button to share your result, as a picture where the platform supports
  it.
- A short link: **jxsi.ch/10s**.
- Also on the site this week: **FrogType**, a typing game I made in seven
  days, now has its own project page.

## What was hard

The idea started as a single standalone page with everything inline. Moving
it into the site meant rebuilding it in the site's look, moving every text
into one place and turning the script into a bundled file, because inline
code is blocked since last week's security update.

To be honest about the "better than X % of players": there is no
leaderboard behind it. The percentage comes from a normal distribution
around ten seconds. It feels about right, but it is an estimate, not real
player data.

## Bugs fixed

- YouTube's RSS feeds suddenly answered with a 404, and the "latest video"
  box on the hub simply disappeared. It now falls back to the last video it
  knew instead of hiding.
