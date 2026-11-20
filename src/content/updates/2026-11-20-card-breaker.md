---
title: "A card you can hold, and a game inside it"
date: 2026-11-20T12:00:00
type: release
cover: ../../assets/updates/breaker.webp
---

The business card on the start page got a lot more physical, and it hides
a game now.

## Hold it like a card

On [jxsi.ch](https://www.jxsi.ch) the card is no longer something you click.
It is a card in your hand:

- **Grab a corner** (a turn symbol shows up) and drag to turn it freely in 3D.
- **Grab the middle** to move it anywhere on the screen.
- **Double-click** to put it back.
- Links and buttons on the back still work with a normal click, and Enter
  still turns it over.

## Card Breaker

Look closely at the number on the front: **JXSI-CH-01**. The *01* is a
button. Click it and the card breaks into a wall of tiny business cards. A
ball, a paddle, and you know the rest.

- Three lives, and each level gets one more row and a faster ball.
- From the second wall on, broken cards drop items: more balls, a wider
  paddle, TNT, an extra life, slow motion, double balls, a ball that goes
  straight through cards, and a giant ball.
- Your best score stays in the browser.

Every brick is a real little copy of the card, drawn on the fly: photo,
barcode, title, number and signature, in pastel colours, flying out of the
big card at the start.

## And one more secret

Push the card exactly into a corner of the window and see what happens. If
you grew up with DVD players, you will know.

## What was hard

The card's front used to be one big button (click to flip). A button cannot
contain another button, so the *01* could not be one. The front became a
plain element that still listens to Enter and Space, so it works with the
keyboard like before.

The game code only loads when you start it, so the start page stays as light
as it was.

## Removed

The old easter egg where the card got "tired" after too many flips is gone.
With free turning it did not make sense anymore.
