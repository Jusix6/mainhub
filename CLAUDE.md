# MAINHUB – Jusis persönliche Website

Persönlicher Hub für Jusi (Justin), Kreativer aus der Schweiz (Apps, Games, Musik, Videos,
digitale Produkte, Experimente). Die Seite ist Portfolio, Verkaufs-Einstieg
(App Store, Gumroad, Streaming) und Content-Hub (YouTube, Twitch, Devlog) in einem.

Auf der Website heisst er überall **Jusi**, nie Justin (Name, vCard, OG-Bild,
Dateinamen). Der Name kommt aus `src/data/site.ts` und `scripts/og-default.mjs`.

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
- **Deployment**: Cloudflare Workers mit Static Assets, kein Adapter. Der
  einzige Server-Code ist `worker.js` (Apex-Redirect, sonst Durchreichen an
  die Assets). Git-Integration mit `Jusix6/mainhub`, Push auf `main` = Deploy.
  Build `npm run build`, Deploy `npx wrangler deploy`, Konfig in `wrangler.jsonc`.
  Details und Checkliste in `DEPLOY.md`. **Nie `astro add cloudflare`
  ausführen**, die Seite bleibt statisch.
- **Domain**: `https://www.jxsi.ch` (kanonisch, in `astro.config.mjs`,
  `src/data/site.ts` und `worker.js`). Beide Hosts stehen als `routes` mit
  `custom_domain: true` in `wrangler.jsonc`; Wrangler legt DNS und Zertifikat
  beim Deploy an. Apex `jxsi.ch` → www macht `worker.js` per 301. `_redirects`
  kann das nicht (Workers erlauben dort nur relative Ziele).
- Paketmanager: **npm**. Lockfile committen.

## Befehle

```bash
npm install          # Abhängigkeiten
npm run dev          # Dev-Server auf http://localhost:4321
npm run build        # Produktions-Build nach dist/ (führt astro check mit aus)
npm run preview      # dist/ lokal ansehen
npm run og           # Standard-OG-Bild neu erzeugen (nach Änderung von Name/Tagline)
npm run deploy       # Build + direkter Upload in den Cloudflare Worker (braucht `npx wrangler login`)
npx astro check      # Typen und Content-Schemas prüfen
```

Vor jedem "fertig" muss `npm run build` ohne Fehler und ohne Warnungen laufen.
Einzige bekannte Ausnahme: `[WARN] Failed to revalidate cached remote image
https://i.ytimg.com/... The request was redirected.` bei wiederholten lokalen
Builds. Astro 5.18 wertet die 304-Antwort von YouTube fälschlich als Redirect
(`astro/dist/assets/build/remote.js`), nutzt dann den Cache und baut korrekt
weiter. Auf Cloudflare tritt sie nie auf (kein Cache). Verschwindet lokal mit
`rm -rf node_modules/.astro`.

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
├─ public/                    # favicon.svg, _headers (Cloudflare), sonst nichts
├─ wrangler.jsonc             # Cloudflare Worker: Assets aus dist/, Custom Domains
├─ worker.js                  # Apex-Redirect jxsi.ch → www, sonst Assets
├─ DEPLOY.md                  # Deploy-Anleitung und Checkliste
├─ scripts/og-default.mjs     # erzeugt src/assets/og-default.png
├─ scripts/cover-from-icon.mjs # 16:10-Cover aus einem quadratischen App-Icon
├─ src/
│  ├─ content.config.ts       # Collections: projects, updates
│  ├─ content/
│  │  ├─ projects/            # eine .md pro Projekt, Dateiname = slug
│  │  ├─ updates/             # eine .md pro Devlog-Eintrag, YYYY-MM-DD-slug.md
│  │  ├─ legal/               # Rechtstexte je App, Dateiname = slug unter /privacy/
│  │  └─ schedule.yaml        # Zeitplan, eine Liste mit allen Terminen
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
│  │  ├─ index.astro          # Startseite = Visitenkarte (CardScreen)
│  │  ├─ hub.astro            # Der Hub (ehemalige Startseite)
│  │  ├─ projects/index.astro # Übersicht mit Filter
│  │  ├─ projects/[slug].astro
│  │  ├─ updates/index.astro
│  │  ├─ updates/[slug].astro
│  │  ├─ links.astro          # Linktree-Ersatz + Kontakt
│  │  ├─ card.astro           # Alias von / für gedruckte QR-Codes
│  │  ├─ contact.vcf.ts       # vCard aus site.ts
│  │  ├─ rss.xml.ts
│  │  ├─ robots.txt.ts       # Sitemap-URL aus `site` in astro.config
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
| `/`                | Startseite = die Visitenkarte im Vollbild (Bare-Layout, JSON-LD Person), "Explore the site" → `/hub` auf der Kartenrückseite. Gruss bei `?src=print` |
| `/hub`             | Der Hub: Karte als Hero, Kategorien, Featured-Projekte, Coming up, letzte 2 Updates, YouTube-Video, Twitch. "Home" in der Nav zeigt hierhin |
| `/projects`        | alle Projekte, Filter nach Kategorie und Status, Zustand in der URL (`?cat=games&status=released`) |
| `/projects/[slug]` | Cover, Tagline, Status, Body, Galerie, Link-Buttons, zugehörige Updates |
| `/updates`         | Devlog chronologisch, optional `?project=slug` |
| `/updates/[slug]`  | Einzelner Eintrag |
| `/links`           | alle Social- und Shop-Links + Kontakt |
| `/schedule`        | Zeitplan: kommende Streams/Videos/Posts/Releases, zuletzt vergangene |
| `/schedule.ics`    | iCalendar-Feed des Zeitplans zum Abonnieren |
| `/privacy/[slug]`  | Rechtstexte aus der `legal`-Collection, z. B. `/privacy/forgot` |
| `/card`            | Alias der Startseite (gleiche `CardScreen`-Komponente, Canonical → `/`), damit gedruckte QR-Codes auf `/card?src=print` weiter funktionieren |
| `/contact.vcf`     | vCard-Download |
| `/rss.xml`         | Feed der Updates |
| `/robots.txt`      | generiert, Sitemap-Link aus `site` |

**SEO/Social:** Jede Seite hat Canonical, OG- und Twitter-Tags (`Head.astro`).
OG-Bild: Projekt-Cover auf Detailseiten, Update-Cover falls vorhanden, sonst
`src/assets/og-default.png`. Startseite trägt JSON-LD `Person`. Cover-Bilder
morphen per `transition:name="cover-<slug>"` von der Karte zur Detailseite.

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
· `bandcamp` · `youtube` · `twitch` · `instagram` · `tiktok` · `github` · `website` · `other`

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
cover: ../../assets/projects/forgot/cover.png  # Pflicht, 1600x1000 (16:10); für Apps aus icon.png per scripts/cover-from-icon.mjs
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
draft: false                    # optional; true = nur in `npm run dev` sichtbar
---
```

Die URL ist der Dateiname ohne Datums-Präfix (`/updates/omf-alpha`). Zwei Dateien
mit gleichem Rest-Namen brechen den Build. Typen und Farben in
`src/data/updateTypes.ts`.

### Zeitplan (`src/content/schedule.yaml`)

Eine YAML-Datei mit einer Liste, ein Eintrag pro Termin (Stream, Video, Post,
Release, Event). Loader `file()`, Schema in `content.config.ts`, Typen und
Farben in `src/data/eventTypes.ts`.

```yaml
- id: 2026-09-20-stream         # eindeutig, klein, Bindestriche
  title: "One More Floor dev stream"
  start: 2026-09-20T20:00:00+02:00   # Schweizer Zeit mit Offset (+02:00 Sommer, +01:00 Winter)
  end: 2026-09-20T22:00:00+02:00     # optional, sonst Standarddauer je Typ
  type: stream                       # stream | video | post | release | event
  platform: twitch                   # optional, Link-Typ → Button
  url: https://www.twitch.tv/jusidroppop
  project: one-more-floor            # optional
  note: "Eine Zeile"                 # optional
  tentative: true                    # optional, Sticker "maybe"
  draft: true                        # optional, nur im Dev-Server
```

Anzeige: `/schedule` (Coming up + Recently), "Coming up" auf `/` (max. 3),
"Next stream" in der Twitch-Karte, Kalender-Abo `/schedule.ics`. Die Trennung
in kommend/vergangen passiert beim Build; ein Client-Script blendet zur
Laufzeit abgelaufene Einträge aus und markiert laufende mit "Live now".
Alle Zeiten werden in Europe/Zurich angezeigt.

### Rechtliches (`src/content/legal/<slug>.md`)

Datenschutzerklärungen und ähnliche Dokumente je App, ausgeliefert unter
`/privacy/<slug>`. Frontmatter: `title`, `description`, `project` (Referenz,
zeigt den Link "Privacy policy" in der Fakten-Box der Projektseite), `updated`,
`languages` (Liste aus `code`, `label`, `anchor` für die Sprach-Sprungmarken;
die Anker stehen als `{#anchor}` an den H2-Überschriften im Markdown).
Rechtstexte bleiben wörtlich wie im Original, inklusive des dort genannten
Verantwortlichen; hier gilt die Jusi-Regel nicht.

- `forgot` → `/privacy/forgot`, DE + EN, Kontakt jxsisupport@gmail.com.
  Diese URL gehört ins App-Store-Listing als Privacy Policy.

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
  --c-blue:    #4D8DFF;   /* heller als klassisches Elektroblau, damit Ink-Text AA schafft */
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
- **Cover-Platzhalter**: Karten und Detail-Cover tragen einen unscharfen
  24-px-Platzhalter des Covers als inline `background-image` (Data-URI, ~150
  Bytes, erzeugt beim Build in `src/lib/lqip.ts`). So flackert beim
  Cover-Morph und beim Lazy-Loading nie die Kategoriefarbe durch. Karte und
  Detailseite nutzen dieselben Breiten (400/800/1200), damit das Handy die
  Datei aus dem Cache wiederverwendet.
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
- Ziel: Lighthouse Mobile ≥ 95 in allen vier Kategorien. Prüfen mit
  `npm run build && npm run preview` und dann
  `npx lighthouse@12 http://127.0.0.1:4321/ --form-factor=mobile --chrome-flags="--headless=new"`
  (`CHROME_PATH` auf Chrome oder Edge setzen). Kleinste Schriftgrösse 12px.
- Fallbacks, die nur ohne JS gelten, hängen an `html:not(.js)`; die Klasse
  `js` wird inline im `<head>` gesetzt, damit nichts vor dem ersten Paint springt.
  **Achtung View Transitions:** Der ClientRouter ersetzt beim Seitenwechsel die
  Attribute von `<html>`, die Klasse geht dabei verloren. Deshalb setzt dasselbe
  Inline-Script sie bei `astro:after-swap` erneut. Ohne das zeigte die
  Visitenkarte nach einem Klick-Wechsel beide Seiten untereinander.

## Die 3D-Visitenkarte

Die Startseite `/` ist die Karte alleine im Vollbild (`CardScreen.astro`),
`/card` ist ihr Alias; auf `/hub` ist sie der Hero. Die physische Visitenkarte
trägt nur einen QR-Code, der auf `/card?src=print` (oder `/?src=print`) zeigt;
die Website ist die eigentliche Karte.

- **Format**: Seitenverhältnis 85:55 (Schweizer Visitenkarte). Auf Mobile volle
  Breite abzüglich Rand, auf Desktop max. 560px breit.
- **Vorderseite**: Parodie des McLovin-Ausweises aus Superbad als
  "SWITZERLAND · CREATIVE LICENSE" (ohne den Regenbogen des Originals): Foto links
  (`src/assets/portrait.png`, 600x750, Platzhalter per
  `scripts/portrait-placeholder.mjs`, durch echtes Foto ersetzen), rote
  Nummer, Zeilen DOB/EXP, Projektzahlen je Kategorie statt HT/WT/HAIR/EYES
  (live aus der Collection, einzelne Werte über `license.statOverrides`
  überschreibbar, z. B. Videos = Anzahl auf YouTube), Issue/Class/Restr/Endorse,
  Barcode, Jusis echte
  Unterschrift (`src/assets/signature.png`, aus einem Foto freigestellt mit
  `scripts/signature-from-photo.mjs <foto> [schwelle]`), Name und "Adresse".
  Alle Werte in `SITE.license` (`site.ts`).
  Bewusst kein echtes Amtsdokument nachgebaut: Land statt US-Staat, "Creative
  License" statt "Driver License". Hinweis "tap to flip" unten rechts.
  Bekannte Ausnahme von der 12-px-Regel: Die Ausweisfelder skalieren mit der
  Kartenbreite und liegen auf dem Handy bei 8–9 px, wie auf einem echten
  Ausweis. Lighthouse Best Practices auf `/` deshalb 96 statt 100, akzeptiert.
- **Rückseite**: Was ich mache (die sechs Kategorien als Mini-Chips), E-Mail,
  Socials als Icons, Button "Save contact" → `/contact.vcf`. Zweiter Button je
  nach Kontext: auf `/` und `/card` (Prop `standalone`) "Explore the site" →
  `/hub`, im Hub-Hero "See my work" → `/projects`. Unter der Karte steht auf der
  Startseite kein weiterer Button.
- **Interaktion**: Klick/Tipp dreht die Karte (`rotateY(180deg)`, `--t-slow`,
  `--ease-pop`, `perspective: 1200px`, `backface-visibility: hidden`). Desktop
  zusätzlich: leichtes Kippen mit der Mausposition (max. ±8°), per Script.
  Tastatur: Karte ist ein `<button>`, Enter/Space dreht, Fokusring sichtbar.
- **Ohne JS / reduced motion**: Beide Seiten stehen als Text im HTML; ohne JS
  wird die Rückseite unter der Vorderseite angezeigt, mit reduced motion wird
  überblendet statt gedreht.
- **Easter Egg**: Wer die Karte zu oft dreht, bekommt statt der Daten nur noch
  einen Satz zu sehen (Stufen in `UI.card.tired`: 10 → "why are you doing
  this?", 13 → "seriously?", 16 → "fine. here you go." und Reset). Zählt pro
  Seitenaufruf. Der Dreh-Hinweis vorne und die "flip back"-Pille hinten sitzen
  beide unten rechts, liegen über der Überlagerung und bleiben immer sichtbar.
  Texte in `src/data/ui.ts`.
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
- [x] **Phase 3 – Seiten** (2026-09-11): `/projects/[slug]` mit Fakten-Box,
      Link-Buttons, Galerie, OG-Bild aus dem Cover und "More projects";
      `/links` mit Kontakt, Socials und allen Store-Links; `404`; Startseite mit
      Kategorie-Kacheln (CategoryStrip). Offen bis Phase 5: Updates-Sektion auf
      der Startseite und zugehörige Updates auf der Detailseite.
- [x] **Phase 4 – Visitenkarte** (2026-09-11): BusinessCard-Komponente (Flip,
      Tilt am Desktop, inert für die verdeckte Seite, No-JS- und
      Reduced-Motion-Fallback), Hero auf `/`, `/card` mit Gruss bei `?src=print`,
      `contact.vcf` als vCard 3.0.
- [x] **Phase 5 – Content-Hub** (2026-09-11): `/updates` mit Projekt-Filter,
      `/updates/[slug]` mit Älter/Neuer-Navigation, `/rss.xml`, YouTube-Block als
      Click-to-play-Facade (Thumbnail beim Build optimiert), Twitch-Karte,
      "Latest updates" auf `/`, zugehörige Updates auf der Projekt-Detailseite.
- [x] **Phase 6 – Politur** (2026-09-11): Standard-OG-Bild + `npm run og`,
      Cover-Morph per View Transition, JSON-LD Person, generierte robots.txt,
      Cloudflare `_headers`, Twitter-Tags. Lighthouse Mobile auf allen Seiten
      99–100 in allen Kategorien. Fixes dabei: `html.js` wird inline im Head
      gesetzt (kein Layout-Sprung der Karte), Blau aufgehellt für AA-Kontrast,
      Karten-Überschriften per `heading`-Prop auf h2 unter Seiten-h1, Mindest-
      Schriftgrösse 12px auf der Kartenrückseite.
- [x] **Phase 7 – Deploy** (2026-09-11 bis 2026-09-19): Repo auf GitHub
      (`Jusix6/mainhub`), Cloudflare Worker `mainhub` per Git-Integration,
      Custom Domains über `wrangler.jsonc`, Apex- und HTTP-Redirect in
      `worker.js`. **Live unter `https://www.jxsi.ch`.** Die Domain-Aktivierung
      hing tagelang, weil bei hosttech DNSSEC mit dem alten Schlüssel aktiv
      war; nach dem Ausschalten (DS-Eintrag bei der Registry weg) wurde die
      Zone innerhalb einer Stunde aktiv. DNSSEC kann später in Cloudflare
      (DNS → Settings → DNSSEC) mit Cloudflares eigenem DS-Eintrag bei
      hosttech wieder eingeschaltet werden.
- [ ] **Später / offen**: deutsche Sprachversion mit Umschalter, Twitch-Live-Status,
      Cloudflare Web Analytics.
