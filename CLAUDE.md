# MAINHUB – Justins persönliche Website

Persönlicher Hub für Justin, Kreativer aus der Schweiz (Apps, Games, Musik, Videos,
digitale Produkte, Experimente). Die Seite ist Portfolio, Verkaufs-Einstieg
(App Store, Gumroad, Streaming) und Content-Hub (YouTube, Twitch, Devlog) in einem.

Sprache der Website: **Englisch**. Sprache der Zusammenarbeit im Chat: Deutsch.
Kommentare und Code auf Englisch.

## Stack und feste Entscheidungen

- **Astro 5**, statischer Output (`output: 'static'`), TypeScript strict.
- **Content Layer**: Projekte und Updates sind Markdown-Dateien in Content
  Collections, Schema in `src/content.config.ts` mit Zod. Der Build muss bei
  fehlerhaftem Frontmatter scheitern.
- **Kein UI-Framework** (kein React/Vue/Svelte). Interaktives (Filter, Menü,
  Kartendrehung) sind kleine Vanilla-Scripts in `<script>`-Tags der Komponenten.
- **Eigenes CSS mit Design-Tokens** in `src/styles/tokens.css`. Kein Tailwind,
  keine CSS-Frameworks. Scoped Styles in `.astro`-Dateien, globale Regeln nur in
  `src/styles/global.css`.
- **Fonts selbst gehostet** über `@fontsource`-Pakete. Keine Google-Fonts-Requests.
- **Bilder** liegen in `src/assets/` und laufen durch Astros `<Image>` bzw. den
  `image()`-Schema-Helper. Nichts Grosses in `public/`.
- **View Transitions** über Astros `<ClientRouter />` für Seitenwechsel.
- **Keine externen Requests zur Laufzeit**, ausser eingebettete YouTube-Player
  (nur über `youtube-nocookie.com`). Der YouTube-Feed wird beim Build gelesen.
- **Kein Tracking-Script.** Falls Statistik gewünscht: Cloudflare Web Analytics,
  sonst nichts.
- **Deployment**: Cloudflare Pages, Build-Command `npm run build`, Output `dist/`.
- Paketmanager: **npm**. Lockfile committen.

## Befehle

```bash
npm install          # Abhängigkeiten
npm run dev          # Dev-Server auf http://localhost:4321
npm run build        # Produktions-Build nach dist/ (führt astro check mit aus)
npm run preview      # dist/ lokal ansehen
npx astro check      # Typen und Content-Schemas prüfen
```

Vor jedem "fertig" muss `npm run build` ohne Fehler und ohne Warnungen laufen.

Node wird über **fnm** verwaltet (installiert per winget, Node 24 LTS, siehe
`.node-version`). In neuen PowerShell-Fenstern lädt das Profil fnm automatisch.
Falls `node` in einer Shell fehlt: `fnm env --use-on-cd | Out-String | Invoke-Expression`.
Absoluter Pfad als Notnagel: `%APPDATA%\fnm\node-versions\v24.21.0\installation`.

npm blockiert Install-Skripte neuer Pakete standardmässig. Nach `npm install`
die Warnung prüfen und mit `npm install-scripts approve <paket>` freigeben,
dann `npm rebuild <paket>` (bereits freigegeben: sharp, esbuild).

## Ordnerstruktur

```
F:\MAINHUB\
├─ public/                    # favicon, robots.txt, sonst nichts
├─ src/
│  ├─ content.config.ts       # Collections: projects, updates
│  ├─ content/
│  │  ├─ projects/            # eine .md pro Projekt, Dateiname = slug
│  │  └─ updates/             # eine .md pro Devlog-Eintrag, YYYY-MM-DD-slug.md
│  ├─ assets/
│  │  ├─ projects/<slug>/     # cover.png + Galeriebilder je Projekt
│  │  └─ updates/             # optionale Cover für Devlog-Einträge
│  ├─ data/
│  │  ├─ site.ts              # Name, Bio, Kontakt, Socials, YouTube-Channel-ID
│  │  ├─ categories.ts        # Kategorien: slug, label, Farbe, Icon
│  │  ├─ statuses.ts          # Status: slug, label, Farbe
│  │  ├─ linkTypes.ts         # Link-Typen: slug, label, Icon, Farbe
│  │  └─ ui.ts                # alle UI-Strings (vorbereitet für spätere DE-Version)
│  ├─ components/             # ProjectCard, FilterBar, LinkButton, StatusBadge,
│  │                          # BusinessCard, Sticker, Nav, Footer ...
│  ├─ layouts/
│  │  ├─ Base.astro           # <head>, Nav, Footer, Skip-Link
│  │  └─ Bare.astro           # ohne Nav/Footer, für /card
│  ├─ pages/
│  │  ├─ index.astro          # Startseite
│  │  ├─ projects/index.astro # Übersicht mit Filter
│  │  ├─ projects/[slug].astro
│  │  ├─ updates/index.astro
│  │  ├─ updates/[slug].astro
│  │  ├─ links.astro          # Linktree-Ersatz + Kontakt
│  │  ├─ card.astro           # Visitenkarte im Vollbild (QR-Ziel)
│  │  ├─ contact.vcf.ts       # vCard aus site.ts
│  │  ├─ rss.xml.ts
│  │  └─ 404.astro
│  ├─ lib/                    # youtube.ts (Feed beim Build), helpers
│  └─ styles/
│     ├─ tokens.css           # Design-Tokens (siehe unten)
│     └─ global.css           # Reset, Basis-Typo, Utilities
├─ astro.config.mjs
├─ CLAUDE.md
└─ package.json
```

**Grundregel:** Neues Projekt = neue Markdown-Datei + Bilderordner. Neue Kategorie,
neuer Status oder neuer Link-Typ = ein Eintrag in `src/data/`. Layout- und
Komponenten-Code wird dafür nie angefasst.

## Routen

| Route              | Inhalt |
|--------------------|--------|
| `/`                | Hero = 3D-Visitenkarte, dann Featured-Projekte, letzte 2 Updates, Content-Block (neuestes YouTube-Video, Twitch-Link), Social-Links |
| `/projects`        | alle Projekte, Filter nach Kategorie und Status, Zustand in der URL (`?cat=games&status=released`) |
| `/projects/[slug]` | Cover, Tagline, Status, Body, Galerie, Link-Buttons, zugehörige Updates |
| `/updates`         | Devlog chronologisch, optional `?project=slug` |
| `/updates/[slug]`  | Einzelner Eintrag |
| `/links`           | alle Social- und Shop-Links + Kontakt |
| `/card`            | nur die Visitenkarte, ohne Nav. Gedruckter QR zeigt auf `/card?src=print` |
| `/contact.vcf`     | vCard-Download |
| `/rss.xml`         | Feed der Updates |

Alle Routen auf Englisch, kleingeschrieben, keine Trailing-Slashes.

## Datenmodell

### Kategorien (`src/data/categories.ts`)

| slug          | label            | Token-Farbe  |
|---------------|------------------|--------------|
| `apps`        | Apps             | `--c-blue`   |
| `games`       | Games            | `--c-pink`   |
| `music`       | Music            | `--c-purple` |
| `videos`      | Videos           | `--c-orange` |
| `products`    | Digital Products | `--c-yellow` |
| `experiments` | Experiments      | `--c-green`  |

### Status (`src/data/statuses.ts`)

`idea` · `in-progress` · `released` · `paused` · `archived`

### Link-Typen (`src/data/linkTypes.ts`)

`appstore` · `playstore` · `steam` · `itch` · `gumroad` · `spotify` · `applemusic`
· `bandcamp` · `youtube` · `twitch` · `github` · `website` · `other`

Jeder Typ hat Standard-Label, Icon (inline SVG) und Farbe. Neue Typen hier ergänzen.

### Projekt (`src/content/projects/<slug>.md`)

```yaml
---
title: "Forgot?"
tagline: "Routines that actually stick."      # max ~60 Zeichen
category: apps                                 # einer der Kategorie-Slugs
status: released                               # einer der Status-Slugs
date: 2026-03-01                               # Release oder Projektstart
updated: 2026-08-15                            # optional
featured: true                                 # optional, default false
cover: ../../assets/projects/forgot/cover.png  # Pflicht, 1600x1000 (16:10)
gallery:                                       # optional
  - ../../assets/projects/forgot/shot-1.png
platforms: [iOS]                               # optional
tech: [Swift, SwiftUI]                         # optional
tags: [productivity, habits]                   # optional
links:                                         # optional
  - type: appstore
    url: https://apps.apple.com/...
  - type: website
    url: https://forgot.app
    label: "Landing page"                      # optional, sonst Typ-Label
---
Markdown-Body: ausführliche Beschreibung, Bilder, Überschriften ab H2.
```

Der `slug` ist der Dateiname. Sortierung in Listen: `featured` zuerst, dann `date`
absteigend. Musik-Releases und Videos sind ebenfalls Projekte (Kategorie `music`
bzw. `videos`) mit passenden Links.

### Update (`src/content/updates/YYYY-MM-DD-<slug>.md`)

```yaml
---
title: "One More Floor: first playable alpha"
date: 2026-09-11
type: devlog                    # devlog | release | news
project: one-more-floor         # optional, Referenz auf projects-Collection
cover: ../../assets/updates/omf-alpha.png   # optional
---
```

### Erste Projekte

- `forgot` – Forgot?, iOS-App für Routinen (Kategorie `apps`)
- `one-more-floor` – One More Floor, Godot-Game (Kategorie `games`)

## Design-System: Neo-Brutalist Playground

Charakter: Werkstatt, Sticker, mutig, verspielt. Dicke Outlines, harte versetzte
Schatten, knallige Flächen auf cremeweissem Grund. Kein Template-Look.

### Tokens (`src/styles/tokens.css`)

```css
:root {
  /* Grund */
  --bg:        #FFF8E7;   /* Creme */
  --surface:   #FFFFFF;
  --ink:       #111111;   /* Text, Outlines, Schatten */
  --muted:     #5A5A5A;

  /* Signalfarben */
  --c-yellow:  #FFD23F;
  --c-pink:    #FF5DA2;
  --c-blue:    #2F6BFF;
  --c-purple:  #9B5DE5;
  --c-orange:  #FF7A1A;
  --c-green:   #3DDC84;
  --c-grey:    #E2DDD0;   /* neutrale Fläche für "Idea"/"Archived" */

  /* Typo */
  --font-display: 'Archivo Black', 'Arial Black', sans-serif;
  --font-body:    'Space Grotesk', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Linien, Schatten, Rundungen */
  --line:      3px;
  --shadow:    4px 4px 0 var(--ink);
  --shadow-lg: 8px 8px 0 var(--ink);
  --radius:    8px;
  --radius-lg: 16px;

  /* Bewegung */
  --ease-pop:  cubic-bezier(.2, .9, .3, 1.2);   /* leichtes Überschwingen */
  --t-fast:    150ms;
  --t-base:    250ms;
  --t-slow:    600ms;                            /* Kartendrehung */

  /* Raster */
  --space-1: 4px;  --space-2: 8px;  --space-3: 16px;
  --space-4: 24px; --space-5: 40px; --space-6: 64px;
  --container: 1100px;
}
```

Textfarbe auf Signalflächen ist immer `--ink`, nie weiss. Kontrast auf allen
Kombinationen mindestens AA prüfen.

### Komponenten-Regeln

- **Karten, Buttons, Chips**: `border: var(--line) solid var(--ink)`,
  `box-shadow: var(--shadow)`, `border-radius: var(--radius)`.
  Hover: Schatten wächst auf `--shadow-lg` und Element rückt `-2px, -2px`.
  Active: Schatten auf `2px 2px 0`, Element rückt `+2px, +2px` (fühlt sich wie
  Drücken an).
- **ProjectCard**: Cover oben, darunter Titel in `--font-display`, Tagline,
  Kategorie-Chip in der Kategoriefarbe. Status als schräg geklebter Sticker
  (`rotate(-6deg)`) auf der Cover-Ecke, nur für `in-progress`, `idea`, `paused`.
- **Sticker**: `--font-display`, uppercase, Signalfarbe, dicke Outline, leichte
  Rotation. Sparsam einsetzen, max. einer pro Karte.
- **Headlines**: `--font-display`, eng gesetzt, gerne mit farbigem Unterstrich
  (Marker-Effekt über `background: linear-gradient` unten).
- **Meta-Text** (Datum, Tech, Plattform): `--font-mono`, klein, uppercase.
- **Icons**: inline SVG über `<Icon name="…" />` (`src/components/Icon.astro`),
  `currentColor`, keine Icon-Fonts. UI- und Kategorie-Icons sind handgezeichnete
  Stroke-Pfade, Marken-Icons kommen aus `simple-icons`. Neuer Icon-Key = Eintrag
  in `STROKE` oder `BRAND` in Icon.astro; unbekannte Keys brechen den Build.
- **Filter-Chips** auf `/projects`: aktiver Chip gefüllt in Kategoriefarbe,
  inaktiv weiss. Zustand in der URL spiegeln, `history.replaceState`, Back-Button
  darf nicht durch Filterklicks vollgemüllt werden.

### Bewegung

- Kleine Animationen ja, Spielereien mit Zweck: Hover-Pop, Sticker-Wackeln beim
  Laden, Kartendrehung, sanftes Einblenden von Listen (staggered, max. 40ms Versatz).
- Alles muss unter `@media (prefers-reduced-motion: reduce)` auf Überblendung oder
  gar nichts zurückfallen. Keine Ausnahme.
- Keine Animation länger als `--t-slow`, keine Endlos-Animationen im Blickfeld
  (Ausnahme: dezenter Sticker-Wackler max. einmal beim Laden).
- Nur `transform` und `opacity` animieren.

### Mobile zuerst

- Layout wird zuerst für 360px Breite gebaut, dann hoch skaliert. Breakpoints:
  `640px`, `900px`, `1100px`.
- Touch-Ziele mindestens 44×44px. Schatten und Outlines auf Mobile nicht
  verkleinern, sie sind Teil des Looks.
- Nav auf Mobile: unten fixiert oder als Vollbild-Overlay, kein winziges
  Burger-Menü oben rechts.
- Ziel: Lighthouse Mobile ≥ 95 in allen vier Kategorien.

## Die 3D-Visitenkarte

Zentrales Element auf `/` (Hero) und alleine auf `/card`. Die physische
Visitenkarte trägt nur einen QR-Code, der auf `/card?src=print` zeigt; die
Website ist die eigentliche Karte.

- **Format**: Seitenverhältnis 85:55 (Schweizer Visitenkarte). Auf Mobile volle
  Breite abzüglich Rand, auf Desktop max. 560px breit.
- **Vorderseite**: Name gross in `--font-display`, "Creative from Switzerland",
  kleines Logo/Emoji, Hinweis "tap to flip". Look: Karte mit `--line`-Outline,
  `--shadow-lg`, Signalfarbe als Fläche oder Ecke.
- **Rückseite**: Was ich mache (die sechs Kategorien als Mini-Chips), E-Mail,
  Socials als Icons, Button "Save contact" → `/contact.vcf`, Button "See my work"
  → `/projects`.
- **Interaktion**: Klick/Tipp dreht die Karte (`rotateY(180deg)`, `--t-slow`,
  `--ease-pop`, `perspective: 1200px`, `backface-visibility: hidden`). Desktop
  zusätzlich: leichtes Kippen mit der Mausposition (max. ±8°), per Script.
  Tastatur: Karte ist ein `<button>`, Enter/Space dreht, Fokusring sichtbar.
- **Ohne JS / reduced motion**: Beide Seiten stehen als Text im HTML; ohne JS
  wird die Rückseite unter der Vorderseite angezeigt, mit reduced motion wird
  überblendet statt gedreht.
- **Daten** kommen ausschliesslich aus `src/data/site.ts`. vCard wird daraus
  in `contact.vcf.ts` generiert (`FN`, `EMAIL`, `URL`, `NOTE`, `X-SOCIALPROFILE`).
- Der QR-Code selbst ist nicht Teil der Website (wird extern für den Druck erzeugt).

## Content-Hub

- **YouTube**: `src/lib/youtube.ts` liest beim Build den öffentlichen RSS-Feed
  `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` (kein API-Key).
  Neuestes Video auf `/` mit Thumbnail und Link, Embed nur nach Klick
  (Facade-Pattern, `youtube-nocookie.com`). Schlägt der Fetch fehl, darf der Build
  nicht brechen: Block wird ausgeblendet und eine Warnung geloggt.
- **Twitch**: nur Link + optionaler Sendeplan-Text aus `site.ts`. Kein Live-Status
  (bräuchte API-Token).
- **Devlog**: Updates-Collection, RSS-Feed, Verknüpfung zu Projekten.

## Arbeitsregeln für Claude

1. **Inhalte nie in Komponenten hartcodieren.** Texte in `src/data/ui.ts`,
   Personendaten in `src/data/site.ts`, Projekte und Updates als Markdown.
2. **Schema zuerst.** Neue Felder erst in `content.config.ts`, dann in den
   Komponenten nutzen. Optionale Felder haben Defaults im Schema.
3. **Keine neuen Abhängigkeiten ohne Grund.** Bevor ein Paket installiert wird:
   kurz begründen. Erlaubt ohne Nachfrage: `@astrojs/sitemap`, `@astrojs/rss`,
   `@fontsource/*`, `sharp`, `simple-icons` (Marken-Icons, nur zur Build-Zeit).
4. **Jede Seite mobil prüfen** (360px) bevor sie als fertig gilt. Bei
   UI-Änderungen Screenshot in Mobile und Desktop machen.
5. **Barrierefreiheit ist Pflicht**: semantisches HTML, Skip-Link, sichtbarer
   Fokus, `alt`-Texte (Cover-Alt = Projekttitel), Kontrast AA, reduced motion.
6. **Build muss grün sein** (`npm run build`) bevor eine Aufgabe als erledigt
   gemeldet wird. Warnungen werden behoben, nicht ignoriert.
7. **Kleine, nachvollziehbare Änderungen.** Keine Umbauten "bei der Gelegenheit".
   Wenn etwas Grösseres sinnvoll wäre: vorschlagen, nicht einfach machen.
8. **Platzhalter kennzeichnen.** Fehlende Bilder, Links oder Texte als `TODO:`
   im Frontmatter bzw. Kommentar markieren, nie stillschweigend erfinden.
9. **Git**: Repo wird bei Phase 1 initialisiert. Commits klein, Präfixe
   `feat:`, `fix:`, `content:`, `style:`, `chore:`. Commit nur auf Anfrage.

## Roadmap

- [x] **Phase 1 – Fundament** (2026-09-11): Astro-Setup, Tokens, Base-Layout,
      Content-Schemas, Daten-Dateien, die zwei Beispielprojekte mit
      Platzhalter-Covers, Git init. Die Startseite ist eine Übergangsversion.
- [x] **Phase 2 – Komponenten** (2026-09-11): Icon, Sticker, StatusBadge,
      CategoryChip, Button, LinkButton, ProjectCard, ProjectGrid, FilterBar, Nav,
      Footer. `/projects` mit Filter ist bereits live, weil FilterBar ohne Seite
      nicht prüfbar war.
- [ ] **Phase 3 – Seiten**: `/`, `/projects`, `/projects/[slug]`, `/links`, `404`.
- [ ] **Phase 4 – Visitenkarte**: BusinessCard-Komponente, `/card`, `contact.vcf`.
- [ ] **Phase 5 – Content-Hub**: Updates-Collection, `/updates`, RSS, YouTube-Feed.
- [ ] **Phase 6 – Politur**: View Transitions, OG-Bilder, Sitemap, SEO-Meta,
      Lighthouse-Mobile-Runde.
- [ ] **Phase 7 – Deploy**: Cloudflare Pages, Domain, QR-Ziel `/card?src=print`
      testen.
- [ ] **Später / offen**: deutsche Sprachversion mit Umschalter, Twitch-Live-Status,
      Cloudflare Web Analytics.
