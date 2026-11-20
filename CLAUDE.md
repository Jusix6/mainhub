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
  (nur über `youtube-nocookie.com`) und dem Thumbnail eines nach dem Build
  hochgeladenen Videos (`i.ytimg.com`). Den YouTube-Feed liest der Build und
  der Worker-Cron, nie der Browser.
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
npm run build        # astro check, astro build, dann scripts/csp.mjs (CSP-Hashes in dist/_headers)
npm run preview      # dist/ lokal ansehen
npm run og           # Standard-OG-Bild neu erzeugen (nach Änderung von Name/Tagline)
npm run deploy       # Build + direkter Upload in den Cloudflare Worker (braucht `npx wrangler login`)
npm run fun          # Worker + Durable Object lokal (wrangler dev) als fun.jxsi.ch auf http://localhost:8787, braucht vorher `npm run build`
npm run fun:www      # dasselbe als www.jxsi.ch (zum Prüfen der /fun- und /library-Weiterleitung)
npm run library      # dasselbe als library.jxsi.ch
npx astro check      # Typen und Content-Schemas prüfen
```

`npm run dev` und `npm run preview` kennen weder den Worker noch die API: die
Fun-Spiele zeigen dort "counter unreachable". Alles mit `/api/*` oder dem
Fun-Host wird mit `npm run fun` geprüft (Daten liegen lokal in `.wrangler/state`).
Wrangler läuft als `node.exe` weiter und startet `workerd` neu: zum Stoppen die
`node`-Prozesse mit `wrangler` in der Kommandozeile beenden, nicht nur `workerd`.

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
dann `npm rebuild <paket>` (bereits freigegeben: sharp, esbuild, workerd).
Nach jedem Update: `npm audit` muss sauber sein.

## Ordnerstruktur

```
F:\MAINHUB\
├─ public/                    # favicon.svg (Logo als SVG nachgebaut), apple-touch-icon.png, _headers (Cloudflare), sonst nichts
├─ wrangler.jsonc             # Cloudflare Worker: Assets aus dist/, Custom Domains
├─ worker.js                  # Apex-Redirect jxsi.ch → www, sonst Assets
├─ DEPLOY.md                  # Deploy-Anleitung und Checkliste
├─ scripts/og-default.mjs     # erzeugt src/assets/og-default.png
├─ scripts/logo-icons.mjs     # erzeugt src/assets/logo.png (Nav-Logo) und public/apple-touch-icon.png aus der Logo-Masterdatei
├─ scripts/cover-from-icon.mjs # 16:10-Cover aus einem quadratischen App-Icon
├─ scripts/fun-thumbs.mjs     # zeichnet die 16:9-Thumbnails der Spieleliste auf fun.jxsi.ch
├─ scripts/library-og.mjs     # Vorschaubilder der Bibliothek (Regal, Flaggen-Buch) in src/assets/library/
├─ scripts/tiny-island-art.mjs   # Vorschaubild + Thumbnail von Tiny Island aus dem echten Spielcode
├─ scripts/import-world-flags.mjs # 203 Flaggen nach src/assets/flags/ plus world-flags.json und library/flags.json
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
| `/hub`             | Der Hub: Karte als Hero, Kategorien, Featured-Projekte, drei Fun-Karten (Color Hunter, Paint the Flag, The Button → fun.jxsi.ch), Coming up, letzte 2 Updates, YouTube-Video, Twitch. "Home" in der Nav zeigt hierhin |
| `/projects`        | alle Projekte, Filter nach Kategorie und Status, Zustand in der URL (`?cat=games&status=released`) |
| `/projects/[slug]` | Cover, Tagline, Status, Body, Galerie, Link-Buttons, zugehörige Updates |
| `/updates`         | Devlog chronologisch, optional `?project=slug` |
| `/updates/[slug]`  | Einzelner Eintrag |
| `/links`           | alle Social- und Shop-Links + Kontakt |
| `/schedule`        | Zeitplan: kommende Streams/Videos/Posts/Releases, zuletzt vergangene |
| `/schedule.ics`    | iCalendar-Feed des Zeitplans zum Abonnieren |
| `/privacy/[slug]`  | Rechtstexte aus der `legal`-Collection, z. B. `/privacy/forgot` |
| `/card`            | Alias der Startseite (gleiche `CardScreen`-Komponente, Canonical → `/`), damit gedruckte QR-Codes auf `/card?src=print` weiter funktionieren |
| `/fun`, `/fun/*`   | Nur im Build: Quelle für `fun.jxsi.ch` (siehe unten). Auf www leitet der Worker nach `fun.jxsi.ch/*` um |
| `/library`, `/library/*` | Nur im Build: Quelle für `library.jxsi.ch` (siehe unten). Auf www leitet der Worker nach `library.jxsi.ch/*` um |
| `/contact.vcf`     | vCard-Download |
| `/rss.xml`         | Feed der Updates |
| `/robots.txt`      | generiert, Sitemap-Link aus `site` |

**SEO/Social:** Jede Seite hat Canonical, OG- und Twitter-Tags (`Head.astro`).
OG-Bild: Projekt-Cover auf Detailseiten, Update-Cover falls vorhanden, sonst
`src/assets/og-default.png`. Startseite trägt JSON-LD `Person`. Cover-Bilder
morphen per `transition:name="cover-<slug>"` von der Karte zur Detailseite.

Alle Routen auf Englisch, kleingeschrieben, keine Trailing-Slashes.

### Fun-Subdomain `fun.jxsi.ch`

Browser-Spiele ohne Account. Die Seiten liegen unter `src/pages/fun/` (Layout
`src/layouts/Fun.astro`, eigener kleiner Header, kein Hauptmenü) und landen im
Build unter `dist/fun*`. `worker.js` bedient den Host `fun.jxsi.ch` aus genau
diesen Dateien: `fun.jxsi.ch/` → `dist/fun.html`, `fun.jxsi.ch/the-button` →
`dist/fun/the-button.html`; `/_astro/*`, `favicon.svg` und `apple-touch-icon.png` sind geteilt.
`www.jxsi.ch/fun/*` leitet nach `fun.jxsi.ch/*` um, die Sitemap lässt `/fun`
aus (Filter in `astro.config.mjs`), Canonical ist die Fun-URL (`SITE.fun.url`).
Erreichbar von der Hauptseite über den Nav-Punkt "Fun" (absolute URL) und die
Teaser-Karten auf `/hub` (Color Hunter, Paint the Flag, The Button). Links zwischen Fun-Seiten sind **relativ** (`the-button`, `./`), damit sie auf
beiden Hosts stimmen; zurück zur Hauptseite absolut (`SITE.url`).

| Route (fun-Host)  | Inhalt |
|-------------------|--------|
| `/`               | Liste der Spiele (`src/pages/fun/index.astro`) im Stil eines Video-Feeds: Filter-Chips (All/Daily/Everyone together/Quick, per `data-tags`), 2 Spalten ab 760px, grosse 16:9-Thumbnails mit Eck-Badge (Daily/Live/0:10, «New» für das neueste Spiel), darunter Logo-Avatar, Titel, Tagline, Meta-Zeile ("JXSI · … · 5 days ago", relatives Datum clientseitig aus `added`). The Button zeigt die Live-Klickzahl aus `/api/the-button`. Thumbnails `src/assets/fun/thumbs/*.png` (1280×720) zeichnet `scripts/fun-thumbs.mjs` (SVG → PNG mit sharp, Systemschrift Arial Black); neues Spiel = Eintrag in `games` plus Thumbnail im Skript, Ecke unten rechts und oben rechts frei lassen (Badges) |
| `/colors`         | Color Hunter (alle 4 Phasen, Plan im Doc "Color Hunter – Umsetzungsplan"): Vollbild-Layout (Fun-Layout mit `bare`: ohne Kopf/Fuss, eigene kompakte Leiste mit FUN-Link, Fortschritt, Modus und Main-Site-Link; Seite genau 100dvh, nur die Farbliste scrollt; Knopf für Browser-Vollbild, wo `document.fullscreenEnabled`), Spielfläche im Stil von Infinite Craft, Farben aus der Seitenliste auf das Brett ziehen (oder antippen), einen Tropfen auf einen anderen fallen lassen, beide verschmelzen; Doppelklick kopiert, zurück in die Liste ziehen entfernt, Brett wird gespeichert. Gemischt wird wie Malfarbe (`spectral.js`, MIT, Kubelka-Munk). Die Mischung zählt für die nächste benannte Farbe, wenn sie innerhalb deren Toleranz `tol` liegt (OKLab-ΔE), sonst landet sie in der Palette (8 Plätze, älteste fliegt raus). Seltenheit aus den Mindest-Mischschritten ab den 5 Startfarben (Common 1–2, Uncommon 3–4, Rare 5–7, Legendary 8+), Toleranz nach Stufe 0.06/0.04/0.025/0.015, vom Build-Skript nur so weit gelockert, dass jede Farbe mit allen Freischaltungen treffbar ist. Sammelbuch mit Familien, «???»-Feldern (Rahmenfarbe = Seltenheit), Detailansicht und Hinweisen (alle 10 gemischten Funde einer, deckt eine verschwommene Vorschau auf). Meilensteine: 25 +4 Plätze, 75 Mischverhältnis 1:1/1:2/1:3, 150 Magenta, 250 Cyan, 400 Heiss/Kalt-Thermometer, 600 +8 Plätze. Farbliste `src/data/colors.json` aus `scripts/build-colors.mjs` (Quelle `scripts/data/xkcd-colors.txt`, CC0; Fäkal-Namen gefiltert; 7 Neontöne fliegen raus, weil keine Pigmentmischung sie trifft; 927 Farben). Abweichung vom Plan: keine 45-%-Nachbarregel, weil die xkcd-Farben im Median nur ΔE 0.015 auseinanderliegen; stattdessen gewinnt immer die nächste Farbe. **Daily** (Umschalter Collect/Daily, `?mode=daily`): eine Zielfarbe für alle (`dailyPick` aus `src/lib/daily.ts`, Tag 1 = 2026-11-13, Wechsel Mitternacht Zürich), Common/Uncommon, montags eine Rare; nur Farben, die das Build-Skript in höchstens drei Mischebenen aus den Startfarben trifft (`daily` in colors.json, 589 + 80 Montags-Kandidaten). Start nur mit den 5 Grundfarben, alle Verhältnisse, eigene Tagesmischungen; Anzeige «87 % match» (97 % = Toleranz der Zielfarbe), Emoji-Reihe pro Mischung, beim Treffer Name, Eintrag ins Sammelbuch, Teilen-Text, Streak und Bestwert. Kleine synthetische Sounds per Web Audio (Mischen, Fund, Meilenstein), Stummschalter. Export/Import des Spielstands als Code `CH1:…` (Base64-JSON, beim Import gefiltert). Vorschaubild `src/assets/fun/colors-og.png`. Verlinkt in der Spieleliste und als Karte auf `/hub`. Spielstand in `localStorage` (`jxsi_colors_v1`, `jxsi_colors_daily`, `jxsi_colors_daily_stats`, `jxsi_colors_sound`). Paint the Flag nutzt dieselben Tages-Helfer aus `src/lib/daily.ts`. Kurzlink `jxsi.ch/colors` |
| `/flag`           | Paint the Flag, ein Daily-Game: jeden Tag vier Flaggen, eine pro Stufe, für alle gleich (`dailyFlag` in `src/data/flags.ts`, Tageswechsel Mitternacht Zürich, Tag 1 = 2026-11-08, jede Stufe läuft eine gemischte Reihenfolge ohne Wiederholung durch). Pro Stufe und Tag ein gewerteter Versuch, Ergebnis samt Bild in `localStorage` (`jxsi_flag_daily`), Serie in `jxsi_flag_streak`. Practice-Modus unbegrenzt, `?f=<code>` öffnet eine Flagge dort. Stufen richten sich zuerst danach, wie bekannt eine Flagge ist, erst dann nach dem Malaufwand: **Easy** kennt jeder, Streifen und Kreuze (Japan, Schweiz, Frankreich, Deutschland); **Medium** bekannt, aber mehr zu malen oder etwas weniger berühmt (Norwegen, Griechenland, Chile, Vietnam); **Hard** komplizierte Flaggen (UK, USA, China) und solche, die man wirklich kennen muss (Mali, Gabun, Katar, Seychellen); diese drei von Hand als Formen, nur Palettenfarben, exakte Kopie = 100 %. **Impossible** = alle 197 Länder (UN + Vatikan, Palästina, Taiwan, Kosovo) als echte SVGs in `src/assets/flags`, importiert mit `scripts/import-world-flags.mjs` (gemeinfrei, Quelle npm `svg-country-flags`, nur zum Import mit `--no-save` installieren); exakte Kopie ≥ 95 %, weil echte Farben ausserhalb der Palette liegen; nicht rechteckige Flaggen (Nepal) bekommen ihren echten Umriss. Bewertung `scorePainting`: pro Farbfläche der echten Flagge der Anteil in dieser Farbe (ähnliche Farben Teilpunkte, Ungemaltes falsch), Flächen gleich gewichtet; bei SVG-Flaggen zählen Palettenfarben ab 1,5 % Fläche. Teilen: 1200×630-Bild "Mine vs. echt", Text mit Daily-Nummer und Stufe, Kurzlink `jxsi.ch/flag`. Neue Flaggen in einer Stufe mischen deren künftige Tage neu |
| `/tiny-island`    | Tiny Island (alle 6 Phasen, Plan im Doc "Tiny Island – Umsetzungsplan"; in der Spieleliste als neuestes Spiel ohne Badge, das Fun-Layout kann mit `noIndex` Seiten im Bau verstecken): Insel-Simulation zum Zuschauen im Stil von WorldBox (eigene Umsetzung). Vollbild-Canvas (Fun-Layout `bare`), Code in `src/lib/tiny-island/` (TypeScript statt Vanilla JS wie im Plan): `rng.ts` (Seed → Zufall, FNV-1a + `mulberry32` aus `daily.ts`), `noise.ts` (eigenes Simplex-Rauschen), `world.ts` (160×100 Kacheln à 8 px: tiefes/seichtes Wasser, Sand, Gras, Wald, Berg; Inselgenerator mit Abfall zum Rand, Pinsel, Wald breitet sich auf Gras mit ≥ 2 Waldnachbarn aus), `sim.ts` (feste Ticks 10/s × Tempo 0/1/3/10, 1 Tag = 10 s, 1 Jahr = 30 s, Dunkelheit für die Nacht), `camera.ts` (Ziehen, Mausrad/Pinch, Zoom 1–6×, auf kleinen Schirmen auch darunter), `render.ts` (Karte als Pixelpuffer im Offscreen-Canvas, nur geänderte Kacheln neu, Bäume/Berge als 8×8-Sprites, Schaum an Küsten, Schnee innen in Gebirgen, Nacht-Overlay), `ui.ts` (seit dem UI-Update eine Leiste unten wie in Sandbox-Spielen: Build/Rules/World/Chronicle öffnen je ein Fenster, nur eines zugleich, nochmal klicken, × oder Esc schliesst, Tasten B/R/W/C; Build mit Reitern Shape/Life/Characters, Rules nur noch Regler, World als grosses Fenster mit Reitern Relations/Kingdoms/Leagues/Wonders/Inventions/Culture/Population (Diagramm + Todesursachen), die Chronik ist nur noch die Liste rechts; alles, was unten als «Rules-Reiter» oder «Chronik-Leiste» steht, liegt jetzt im World-Fenster; Reiter wirken nur innerhalb ihres `[data-tabset]`, ist Build zu, zeigt die Leiste den Pinsel in der Hand (Klick legt ihn weg); auf dem Handy schliesst ein Fenster Chronik und Profil und umgekehrt; Pinsel S/M/L, Tempo, Tasten Leertaste = Pause bzw. gedrückt verschieben, 1/2/3, +/−), `main.ts` (Frame-Schleife), `path.ts` (A* mit 8 Richtungen, Menschen waten durch seichtes Wasser, Tiere nur an Land, Cache pro `world.version`), `agents.ts` (Menschen, Schafe, Hühner, Wölfe, Grabsteine, Staubwölkchen; Bewegung entlang des Pfads), `ai.ts` (Utility AI der Bewohner: alle 0,5 s Punkte pro Aktion aus der Tabelle `SCORES`, Gefahr zuerst: zurückschlagen oder fliehen; Aktionen essen, Nahrung holen = Beeren/Fischen/Jagen je nach Nähe, schlafen, plaudern, schlendern), `animals.ts` (Schafe/Hühner grasen, fliehen, vermehren sich bis `CAPS`; Wölfe jagen ab Hunger < 45, sehr hungrig auch einzelne Menschen, fliehen vor 3+ Menschen; die letzten 3 einer Art werden nicht gejagt), `names.ts`, `social.ts` (Charakterzüge je 2, Punkte-Boni in `TRAIT_MODS`, Kinder erben mit 50 % je einen Zug pro Elternteil; Beziehungen −100…+100 pro bekannter Person, Plaudern erhöht, Streit senkt, ab +50 Freund, ab −50 Rivale, Rivalen prügeln sich (nie tödlich, stoppt bei 40 LP); Anziehung pro Person (meist anderes Geschlecht, einige gleiches oder beide), Paar ab +70 gegenseitig, bekommt ein Zuhause; Mann + Frau bekommen Kinder (Mutter 18–45, satt, Abstand 1,2 Jahre, max. 5, weniger je voller die Insel), andere Paare adoptieren Waisen; Witwen trauern 1 Jahr), `chronicle.ts` (max. 200 Einträge als Daten: Paar, Geburt bei Lieblingen, Adoption, Tod, Prügelei; Sätze kommen aus `UI.fun.tinyIsland.chronicle`), `panels.ts` (Steckbrief links: Klick mit Move-Werkzeug auf eine Person; Züge, Bedürfnisse, Partner, Eltern, Kinder, Freunde, Rivalen, Lebensgeschichte, Folgen, Stern = Liebling; Chronik rechts, Klick springt hin; auf dem Handy nur eines offen). Gedankenblasen: Herz, Schwert, Träne (Trauer), Essen (hungrig), z (schlafen). `villages.ts` (Phase 4): 4 Leute desselben Volks ohne Dorf in der Nähe gründen ein Dorf (Name aus `names.ts` passend zum Volk, Dorfplatz mit Feuer, Lager Nahrung/Holz/Stein); Dorflose desselben Volks in 12 Kacheln treten bei; Paare leben im selben Dorf. Jede Sekunde: Mitglieder, Anführer (ältester Erwachsener mit wise/brave, Nachfolge in der Chronik), Bedarf (Nahrung = Mitglieder × 2,5, Holz/Stein für das nächste Haus), Bauplan (Zelt 2 Holz → Holzhaus 6 Holz → Steinhaus 2 Holz + 6 Stein, Berg 30 % weniger Stein), fertige Häuser gehen an Paare, dann an Singles; über 20 Leute zieht eine Gruppe junger Erwachsener (16–32, mit Partnern) mindestens 22 Kacheln weg und gründet ein neues Dorf; ohne Bewohner wird das Dorf zur Ruine, Neugründungen in der Nähe ziehen hinein. Neue Aktionen in `ai.ts`: work (je nach Bedarf zufällig gewichtet Beeren/Fische, Holz – 30 % der Bäume fallen dabei – oder Stein am Bergfuss holen und zum Platz tragen), build (auf der Baustelle arbeiten), Essen aus dem Lager (ab 2 Vorrat). Völker-Vorteile in `PERKS` (agents.ts): Coast fischt doppelt so schnell, Forest fällt doppelt so schnell, Mountain 130 LP und Stein schneller, Steppe läuft 20 % schneller und schlägt 40 % härter. Zeichnung: Zelte/Häuser in der Volksfarbe, Baustelle mit Gerüst, Ruinen grau, Lagerhaufen, Fahne, Namensschild über dem Platz (in Bildschirm-Pixeln), Krone über dem Anführer, Last auf dem Rücken, nachts leuchten Fenster und Feuer. `war.ts` (Phase 5): Stimmung pro Völkerpaar −100…+100 (`sim.mood`, Schlüssel "a|b"); pro Sekunde −(0,05 + Grenzdruck) × Aggression (Grenzdruck = Summe über Dorfpaare von (1 − Abstand/60) × 0,2) und +0,04 Frieden, +0,3 bei gemeinsamem Feind; Streit −4, Prügelei −6, Sammeln/Jagen/Arbeiten in 16 Kacheln um ein fremdes Dorf −0,6 (alle Senkungen × Aggression), Paar über Völkergrenzen +15. Unter −60 erklärt der Anführer des nächstgelegenen Dorfs den Krieg (`sim.wars`). Krieger = erwachsen, brave/warlike oder Dorfanführer, nicht cowardly: Aktion raid (70 Punkte) zum nächsten Feinddorf, schlafen unterwegs; Erwachsene kämpfen gegen feindliche Krieger in 8 Kacheln (tödlich, `task.lethal`), Feige, Kinder und Alte fliehen, unter 35 % LP geht es heim. Dorf mit Angreifern auf dem Platz und ohne Verteidiger in 12 Kacheln wird erobert: Volksfarbe und Volk der Bewohner wechseln. Frieden nach 10 Jahren, wenn eine Seite mehr als die Hälfte ihrer Krieger verloren hat oder ein Volk keine Dörfer mehr hat; danach Stimmung −10. Reiter Rules: Regler Aggression 0–2 (`sim.rules`), Beziehungen pro Völkerpaar mit Balken und Kriegsanzeige. Zeichnung: rote Kriegsflagge mit gekreuzten Schwertern neben dem Dorfbanner, kleines Schwert bei Kriegern, Schwerthiebe als weisse Striche plus Staubwölkchen (kein Blut). Bei Aggression 1 in Tests Kriege nach rund 100–140 Jahren, bei 2 ab rund 30 Jahren, bei 0 nie. Phase 6: Regeln Births/Lifespan/Food (0,3–2 / 0,6–1,4 / 0,4–2, wirken auf Geburtschance, Lebensdauer und Nachwachsen von Beeren/Fischen); `stats.ts` Einwohner pro Volk pro Jahr (`sim.history`, max. 240 Punkte) als SVG-Linien oben in der Chronik-Leiste, Völkerfarben plus Strichmuster und Namen am Linienende (die Farben allein sind für Rot-Grün-Schwäche zu ähnlich, laut Validator), Legende nur mit vorhandenen Völkern, Tooltip beim Überfahren; Effekte: Kaminrauch an Holz-/Steinhäusern, Konfetti bei Paaren, Fussspuren im Sand (8 s); `save.ts` speichert alles in `localStorage` (`jxsi_tiny_island_v1`, rund 100 KB bei 30 Jahren) alle 60 s, bei `pagehide` und beim Verstecken der Seite, ohne Aufgaben/Pfade; Startbildschirm über der laufenden Insel: Continue (Jahr, Anzahl), Random island, Empty island (`world.generateEmpty`, Seed `empty`), bei `?world=<seed>` zusätzlich "Play shared world" (der Parameter verschwindet danach); "Share world" kopiert `fun.jxsi.ch/tiny-island?world=<seed>` (die Startinsel, nicht der Spielstand); Seed steht nicht mehr dauernd in der URL. `tiles.ts` = Kachel-Zeichnung ohne Canvas (Renderer und Bildskript teilen sie). Leistung gemessen: 500 Wesen ≈ 0,7 ms pro Tick, bei 10× ≈ 1,2 ms Simulation + 3,7 ms Zeichnen pro Bild. Vorschaubild und Thumbnail per `node scripts/tiny-island-art.mjs [seed]` (bündelt world.ts + tiles.ts mit esbuild, zeichnet die echte Insel, Standard-Seed `jusi`). Nur lokal (`import.meta.env.DEV`) hängt `window.tinyIsland` für Tests am Fenster (Simulation vorspulen). Bedürfnisse Hunger/Energie/Gesellschaft 0–100, Beerenbüsche auf Gras (`world.bush`, wachsen nach) und Fische pro Wasserkachel (`world.fish`). 1 Jahr = 30 s; Kind 0–15, erwachsen bis 60, alt danach, Tod durch Alter (ab 70 zufällig), Hunger oder Angriff, Grabstein bleibt 2 Jahre. Reiter Life: Person (Volk Coast/Forest/Mountain/Steppe), Schaf, Huhn, Wolf per Klick setzen; Zähler oben, Info-Schild beim Überfahren (Name, Volk, Alter, Tätigkeit). Startinsel: 2 Völker à 2 Männer + 2 Frauen, 10 Schafe, 8 Hühner, 3 Wölfe (geseedet). Leistung: 424 Wesen ≈ 0,5 ms pro Tick. Seed in der URL (`?seed=…`), gleicher Link = gleiche Startinsel. Entscheidungen: niedliche Kämpfe (Staub, Sternchen), keine neuen Pakete. Kurzlink `jxsi.ch/tiny-island`. Phase 7 (Erweiterung, Plan im Doc-Reiter "Erweiterung (Phase 7–12)"): `jobs.ts` verteilt alle 5 s Berufe nach Bedarf und Umgebung (Wasser/Wald/Berg im Umkreis 16): Baumeister, Bauer (~30 %), Fischer, Holzfäller, Steinmetz, Bergmann, Schmied (ab 8 Erwachsenen), Künstler (ab 10), Soldat (1 pro 8); Wahl nach Volk und Charakterzügen, wer seinen Beruf hat, behält ihn eher; ohne Beruf hilft man wie bisher nach Bedarf. Arbeitslust pro Beruf in `jobUrge` (Grundwert unter freier Zeit, steigt mit dem Bedarf, damit Singles noch losziehen). Neuer Boden `T.FIELD` mit `world.crop` 0–4: Bauern pflügen (Gras, sonst Wald roden, +2 Holz) bis etwa ein Feld pro zwei Leute, säen, Getreide wächst über drei Stufen (×Nahrungsregel), Ernte 6 Nahrung. Neue Ressource Erz (Bergmann am Bergfuss, langsamer als Stein) und Werkzeug (Schmied macht 1 aus 1 Erz, Holz für den Griff wenn vorhanden; mit Werkzeug geht Arbeit 25 % schneller, 1,5 % Verschleiss pro Ladung). Künstler musizieren auf dem Platz (Noten-Blase, Gesellschaft der Umstehenden +4), Soldaten halten Wache und zählen im Krieg als Krieger. Im Krieg eilen Erwachsene in 30 Kacheln heim, wenn feindliche Krieger in 14 Kacheln ums eigene Dorf stehen; Eroberung braucht 2 Angreifer; Gebietsverletzung nur noch in 12 Kacheln und −0,3. Werkzeug je Beruf in der Hand, Beruf im Info-Schild und Steckbrief, Überfahren des Dorfplatzes zeigt Lager und Felder. Alte Spielstände laden (fehlende Felder/Erz = 0). Phase 8: `town.ts` – Stufen Dorf → Kleinstadt (13 Leute und 5 Häuser) → Stadt (30 Leute mit Rathaus, Markt und Tempel), Chronik "grew into a town"/"became a city". Sondergebäude über die normale Baustelle (`Site.kind`), nach den nötigen Häusern und vor den Ausbauten: Kornspeicher (ab Dorf mit 6 Leuten; Vorräte über 10 verderben ohne ihn, Ernte +2), Markt (jährlicher Handel mit dem nächsten nicht verfeindeten Markt, gleicht grosse Unterschiede zu einem Viertel aus, Stimmung +3 zwischen Völkern), Schmiede (Werkzeug in 2,5 statt 4 s, halber Verschleiss), Tempel (Gesellschaft sinkt langsamer, halb so viele Prügeleien), Rathaus (Auswandern erst ab 40 statt 30), Stadtmauer (Stadt; Eroberung braucht 4 Angreifer, Verteidiger in 12 Kacheln schlagen 30 % härter). Ohne Berge in der Nähe werden Gebäude mit fehlendem Stein übersprungen. Stadthäuser (Stufe 3, zweistöckig) nur in Städten; Auswandern ab 22 (Dorf), 30/40 (Kleinstadt ohne/mit Rathaus), 70 (Stadt). Angefangene Arbeit hat Vorrang (`commitment` in ai.ts: +45 beim Sammeln/Tragen, +25 unterwegs), unterbrochene Lasten kommen beim nächsten Arbeitsgang zuerst ins Lager – ohne das kam praktisch kein Holz an. Zeichnung: Sprites für alle Gebäude, Mauer als Steinring mit vier Toren (nur auf Land), Trampelpfade vom Platz zu allen Gebäuden, drei Holz- und Steintöne für Häuser, grösserer Platz und grösseres Schild mit Stufe in Städten, nachts leuchten Rathaus, Tempel, Schmiede. Tests: in 150 Jahren 2 bis 4 Städte, bis 190 Bewohner. Phase 9: `inventions.ts` – jedes Volk erforscht dieselbe Kette (`sim.tech`): Werkzeug 60 → Landwirtschaft 100 → Rad 160 → Mauerbau 240 → Bronze 340 → Schrift 460 → Eisen 620 → Boote 800 Punkte. Punkte pro Sekunde: 0,03 pro Erwachsenem im Dorf, +0,15 wenn weise, +0,4 pro Schmiede, +0,3 pro Rathaus, +0,5 pro Stadt, mit Schrift ×1,5. Wirkungen: Schmied erst mit Werkzeug; neue Felder pflügen erst mit Landwirtschaft (vorher nur sammeln); Rad = Holz/Stein/Erz doppelt pro Gang auf einem Karren; Steinhäuser, Stadthäuser und Stadtmauer erst mit Mauerbau; Bronze = Kriegsschwerter ×1,2 und Werkzeug 25 % schneller; Eisen = ×1,4 und halber Werkzeugverschleiss; Boote = Fischer sitzen im Boot, +1 Fang, Fischen zählt nicht mehr als weiter. Erfinder = ältester weiser Erwachsener (sonst ältester), Chronik "invented …" und Lebensgeschichte. Reiter Rules: pro Volk Symbole der Erfindungen, Balken zur nächsten und Knopf "🎁 Gift" (Götter-Gabe, sofort die nächste). Schwertklinge Feuerstein/Bronze/Eisen gefärbt. Alte Spielstände ohne `tech` bekommen die Kette bis zum Benutzten (Werkzeug, Felder, Steinhäuser/Mauer). Tests: Werkzeug um Jahr 5–17, Landwirtschaft 13–31, Mauerbau 33–53, ganze Kette um Jahr 73–93; Bevölkerung wie ohne Sperren. Phase 10: `war.ts` neu – Kriege haben Seiten (`sideOf`): zwischen Völkern (Schlüssel "a|b") oder als Fehde zwischen zwei Orten desselben Volks (Schlüssel "v1|v2", `va`/`vb`); `atWar`, `isEnemy`, `isWarrior` arbeiten pro Person/Ort. Fehden: Stimmung pro Ortspaar (`sim.vmood`) im Umkreis 35, sinkt bei zwei Orten ab 8 Leuten um (0,05 + Nähe × 0,1) × Aggression pro s, +0,02 Erholung, rivalisierende Anführer −0,15, Prügelei zwischen den Orten −3, Handel +1; unter −60 Fehde (5 Jahre). Wer eine Fehde gewinnt, nimmt dem Verlierer die Hälfte der Vorräte, dessen Anführer muss gehen. Bündnisse (`sim.alliances`) ab Stimmung +60, Ende unter +20; Verbündete treten Kriegen bei (Chronik "joined their allies"). Kriegsende → Friedensvertrag 15 Jahre (`sim.treaties`, Stimmung bleibt über −40), geschlagene Seite zahlt ein Fünftel der Vorräte an den grössten Ort der Sieger. Armeen (`sim.armies`): Ort im Krieg mit ≥ 3 bereiten Kriegern sammelt sie 12 s auf dem Platz, General (Anführer, sonst Mutigster) geht mit Banner voran (langsamer), die anderen folgen; vor einer intakten Stadtmauer Belagerung (jeder Krieger 7–14 Kacheln vom Platz −0,4 Mauer-LP/s, `WALL_HP` 100, Mauer mit Lücken gezeichnet), danach Bruch (Mauer weg, Chronik) und Sturm; ummauerte Städte fallen nur nach dem Bruch. 20 s Pause bis zur nächsten Armee. Krieger ohne Armee verteidigen zu Hause. Waffen: Schmied (jetzt auch ohne Berge) macht nach Werkzeug-Notstand Waffen für Soldaten (im Krieg für alle Krieger): Keule (2 Holz), mit Bronze/Eisen Bronze-/Eisenschwert (1 Erz), ab Bronze Rüstung (1 Erz), dann bessere Waffen, dann Werkzeug (`smithTask` in jobs.ts); Lager `v.arms`, Soldaten rüsten sich bei der Berufsverteilung aus, Krieger beim Aufbruch der Armee. Schlagkraft ×1 / 1,15 / 1,35 / 1,6, Rüstung ×0,7 Schaden (`WEAPON_POWER`, `ARMOR`); das Wissen allein macht nicht mehr stärker. Zeichnung: Keule, Bronze- und Eisenklinge, Helm, Banner. Steckbrief zeigt Waffe/Rüstung, Dorfschild das Waffenlager, Rules zeigt 🤝/📜 und Fehden. Tests (4 Inseln): bei Aggression 1 in 150 Jahren 1–2 Kriege und 0–2 Fehden pro Insel, Armeen bis 11 Krieger, bei Aggression 2 auch Belagerungen und Mauerbrüche; 255 Wesen ≈ 0,9 ms pro Tick. Phase 11: `kingdoms.ts` – ein Königreich pro Volk (`sim.kingdoms`), sobald es eine Stadt hat (oder eine Kleinstadt und mindestens 3 Orte): gekrönt wird der Anführer der Stadt, sonst ein weiser/mutiger Ältester; dessen Ort ist die Hauptstadt (immer der Ort des Königs, Schild mit ♛), alle anderen Orte des Volks sind Vasallen und zahlen jährlich ein Zehntel der Vorräte an die Hauptstadt (gieriger König ein Fünftel). Thronfolge: ältestes Kind des Königs ab 10 Jahren (Haus "House of <Gründer>" bleibt), sonst wird jemand aus der Hauptstadt gekrönt und gründet ein neues Haus; Auslöser: Tod, Volkswechsel durch Eroberung, Sturz. Treue pro Vasall (`v.loyalty`, ohne Wert 60) driftet höchstens 0,1/s gegen 45 + Königswert (Charakterzüge, Kind −20, über 65 −10, verlorene Kriege −20, langsam abklingend) + Laune des Orts (−10…+10 aus der Id) + Tempel 10 − 10 über 40 Kacheln Abstand − 3 pro Vasall über 3. Unter 25 (ab 6 Leuten, 2 %/s) Aufstand: Ort wird `free` und führt eine Fehde gegen die Hauptstadt (`startFeud` in war.ts); erobern die Rebellen die Hauptstadt, stürzt der König und ihr Anführer wird König (neues Haus, ihr Ort Hauptstadt), verlieren sie, kehren sie zurück; freie Orte mit Treue ≥ 60 kehren von selbst zurück. Eroberte Orte werden Vasallen mit Treue 35. Kriege erklärt der König aus der Hauptstadt. Götter-Gaben im Steckbrief: "👑 Crown" (jeder Erwachsene mit Ort; ohne Königreich wird eines gegründet; Kind des alten Königs behält das Haus) und "Depose" beim König (das Haus fällt, Kinder sind ausgeschlossen). Zeichnung: grosse Krone mit Rubin für Könige, Steckbrief mit Titel und Haus, Dorfschild mit capital/loyalty/risen up, Rules-Übersicht pro Königreich (Herrscher, Haus, Hauptstadt, Vasallen mit mittlerer Treue, Aufständische). Steckbrief wird nur noch bei Änderungen neu gezeichnet und nie, während eine Taste darauf gedrückt ist (höchstens 1 s) – vorher konnten Klicks auf Follow/Favorite verloren gehen. Tests (5 Inseln, 150 Jahre, Aggression 1): Königreiche ab etwa Jahr 50–100, mehrere Thronfolgen und neue Häuser, Aufstände auf etwa der Hälfte der Inseln. Phase 12: `culture.ts` – Künstler sammeln pro Sekunde Musizieren Inspiration (am Fest doppelt, nur tagsüber, angefangene Kunst hat Vorrang wie Arbeit), nach 24 s entsteht ein Werk (`sim.works`, max. 300, alte Lieder werden zuerst vergessen): Lied, Wandbild an einem Holz-/Steinhaus (bunte Pixel an der Wand) oder Statue neben dem Platz (3 Stein, Mauerbau, max. 3 pro Ort, `v.art`). Titel aus Bausteinen (Vorlage + Held/Ort + Adjektiv/Nomen des Volks), alle Wörter in `UI.fun.tinyIsland.culture`; die Chronik speichert eine Kopie des Werks. Werke heben die Treue zum König (+2 pro Werk, max. +10). Legenden (`sim.legends`): wer stirbt und Grosses tat, wird Legende: König ≥ 15 Jahre (the Great), ≥ 6 / ≥ 3 besiegte Feinde (the Fearless / the Brave, `h.kills`), ≥ 2 Erfindungen (the Wise), ≥ 2 Wölfe (the Wolf-Slayer, `h.wolves`); Künstler singen Balladen und meisseln Statuen über sie. Feste: jeder Ort ab 6 Leuten alle ~8 Jahre (mit Tempel ~4) im Frieden (Ernte- oder Mittsommerfest), dazu Siegesfest der Gewinner und Krönungsfest; 12 s lang tanzen alle auf dem Platz (Choice `festival`, 62 Punkte, kleiner Hüpfer), Konfetti, Wimpel rund um den Platz, Gesellschaft +8/s, Treue +5. Götter-Gaben im Rules-Reiter (Abschnitt Culture, pro Volk): "🎉 Festival" und "🏛️ Donate" (für die Hauptstadt bzw. den grössten Ort: laufende Baustelle fertig, sonst nächstes Sondergebäude, sonst eines das fehlt, sonst eine Statue). Culture zeigt Werke pro Art, die letzten Legenden und die neuesten Werke; Dorfschild 🎨 Anzahl und 🎉; Lebensgeschichte "Made “…”". Tests (6 Inseln, 150 Jahre): 5–13 Werke und 2–8 Legenden pro Insel, Feste alle paar Jahre. Stand: Phase 12 – Erweiterung abgeschlossen. Eigener Look (nicht der der Website): Holz & Pergament, im Seiten-CSS werden die Site-Tokens (`--ink`, `--surface`, `--font-display` …) auf `.ti` umgebogen (`--ti-parch`, `--ti-wood`, `--ti-gold` …), Panels sind Pergament im Holzrahmen, Knöpfe Holz (aktiv golden), Reiter wie Lesezeichen; Schrift Pixelify Sans (`@fontsource-variable/pixelify-sans`, nur auf dieser Seite geladen) für Titel, Knöpfe und Zahlen, eine Buchschrift aus dem System (Palatino/Georgia) für Text; die globale Lesebreite `p, li { max-width: 65ch }` ist in `.ti` aufgehoben. Ortsschilder auf der Karte sind Pergamentschilder mit Holzrand und Volkspunkt (Canvas, Pixelify). Dorf-Steckbrief (`village-panel.ts`): Klick auf ein Ortsschild (`renderer.villageAt`, Mauszeiger wird zur Hand), auf den Dorfplatz oder auf einen Ortsnamen in Chronik, Steckbrief oder Rules öffnet links das Profil des Orts (Schild golden): Volk, Stufe, Gründungsjahr, Königreich (Hauptstadt / Vasall mit Treuebalken / aufständisch), Anführer, Einwohner nach Alter, Häuser nach Stufe, Nahrung mit Ampel (Vorrat gegen 2,5 pro Kopf), Hungrige, Felder, Lager inkl. Waffen/Rüstung, Berufe, laufende Erfindung, Gebäude und Mauerzustand, Krieg (gegen welches Volk / Fehde mit welchem Ort seit wann, eigene und anrückende Armeen, Belagerung, Bündnisse, Friedensverträge), Kultur (Werke, Fest jetzt oder nächstes), die letzten Ereignisse des Orts, Knöpfe Show / 🎉 Festival / 🏛️ Donate für genau diesen Ort. Update 2 (Plan im Doc "Tiny Island – Update 2", Phasen A–H, Entscheidungen: Smite-Gabe, Zeitalter bis Industrie, alte Welten bleiben klein, Götter-Gaben Peace/Ally): Balance-Zahlen zentral in `balance.ts`; Spielstand hat jetzt eine Versionsnummer (`VERSION` in save.ts, `migrate` Schritt für Schritt, aktuell v2). Phase A: Bäume haben ein Lebensende (`world.treeEnd`, 60–120 Jahre, Startwälder 1–120), wachsen nur bis 30 % der Landfläche (`world.forestShare`), nie im Umkreis 6 um Dorfplätze (Ruinen 4) und neben Häusern/Gebäuden/Baustellen (`world.noTree`, jede Sekunde von der Sim gesetzt); Ausbreitung 0,09 statt 0,12 (die im Plan genannten 5× langsamer liessen den Wald mit sterbenden Bäumen auf 2 % fallen, gemessen); Holzfäller holen Bäume im Dorfgebiet zuerst und roden sie ganz. Hunger (`hunger.ts`): `foodYears` = Vorrat / (Leute × 2,1 pro Jahr); unter 2 Jahren 1,5× Bauern und Fischer, unter 1 Jahr gibt das Lager nur 1 Portion aus, Geburten stoppen nur bei echter Not (`famished`: unter 1 Jahr, ab 6 Leuten, ein Viertel hungrig – reine Lager-Regel bremste junge Dörfer zu stark), Essen ab Hunger 50 (+15 Punkte), Proviant ab 12 Kacheln Weg, Hilfslieferungen von Orten desselben Volks oder Verbündeten mit über 3 Jahren Vorrat (alle 3 Jahre, Chronik ab 10), Auswandern bei Hungersnot (unter 0,3 Jahren, ≥ 3 Hungernde, alle 5 Jahre) an einen Ort mit vielen Beeren/Fischen. Todesursachen (`sim.deaths`, gesamt und letzte 50 Jahre) als Balken in der Chronik-Leiste. Storyteller (`storyteller.ts`): 15 Jahre ohne grosses Ereignis → Kind des Schicksals (brave + wise, Favorit), Fremder am Strand (manchmal neues Volk), Thronanwärter (Aufstand per Fehde), reicher Erzfund (+30). Ruinen-Schilder erst ab Zoom 3. Tests (4 Inseln, 300 Jahre): Bevölkerung wächst stetig auf 207–239, Wald 17–30 %, Hungertote 5–12 % (letzte 50 Jahre 4–9 %), Alter 61–75 %, Kämpfe 17–27 %. Phase B: alle Bewohner haben 5 Werte 1–10 (`stats`: strength, intelligence, charisma, courage, health; `rollStats` in agents.ts, halb von den Eltern, Züge schieben einzelne Werte; v3-Migration würfelt sie für alte Stände aus dem Seed). Wirkung: Stärke = Schlagkraft 0,8 + 0,04/Punkt und schnelleres Holz/Stein/Erz, Intelligenz = Forschung pro Kopf, Schmied- und Bautempo, Charisma = schnellere Freundschaften und Anführerwahl, Mut = kämpfen statt fliehen (ab 3), Krieger ab 8, Soldatenwahl, General = Mut + Intelligenz, Gesundheit = 4 % LP und 2 Jahre Leben pro Punkt (`sim.applyHealth`). 15 neue Charakterzüge (smart, dumb, charismatic, shy, ambitious, loyal, scheming, jealous, vengeful, kind, cruel, curious, pious, artistic, lucky; Gegensätze in `OPPOSITE`), Punkte in `TRAIT_MODS`, kind/cruel ändern Prügeleien, artistic musizieren auch ohne Künstlerberuf. Charakter-Editor (`editor.ts`, `characters.ts`): Reiter Life → "✦ Create Character" öffnet einen Dialog mit Live-Vorschau (`paintPreview` in render.ts, gleiche Sprite- und Look-Funktionen wie im Spiel: `personSprite`, `drawLook`): Name, Geschlecht, Alter (Knöpfe oder Regler 0–90), Volk, Anziehung, Haut, Haarfarbe, Frisur, Bart, Kopfbedeckung, Kleidungsfarbe, Werte, beliebig viele Züge, Beruf (fest, `fixedJob`) und Spezialkräfte (immortal, invincible, eternalYouth, giantStrength = Stärke 20 und 1,5× LP, genius = Volk forscht 3×, magnetic, fertile, wolfWhisperer, lucky = 50 % Überleben tödlicher Treffer). "Place on the map" → nächster Klick auf Land setzt ihn (`placeCharacter`), danach fest; ✦ über dem Kopf, automatisch Favorit, Chronik-Zeilen mit ✦ hellblau. "My Characters" (localStorage `jxsi_tiny_island_chars`, max. 24): Klick setzt erneut, ✎ öffnet im Editor, × löscht. Steckbrief zeigt die 5 Werte als Balken, Kräfte und "⚡ Smite" (Götter-Gabe, tötet jeden, auch Invincible; Todesursache "The gods"). Tests (4 Inseln, 300 Jahre): Bevölkerung 191–247, Hunger 5–7 %, Kämpfe 13–28 %, Werte im Mittel stabil um 5–6; Kräfte einzeln geprüft (Invincible überlebt 20 tödliche Treffer, Immortal 208 Jahre hungernd, Genius ×3,00). Phase C (`drama.ts`): Familiennamen (`surname`, `familyName` in names.ts; Kinder vom Vater, sonst von der Mutter; ein Paar aus einer Familie ab 10 Lebenden gründet mit 40 % einen Zweig mit neuem Namen, sonst gäbe es nach 300 Jahren nur 2–4 Familien). Erinnerungen (`memories`, max. 20, Stärke −100…+100, verblassen jährlich um 4 %, starke ab |70| nur 0,5 %, verschieben die Beziehung um die Hälfte): killedKin (Verwandte eines Getöteten, mit "father/sister …"), savedMe (wer den Angreifer tötet), beatMe (Prügelei verloren), leftMe, jealous, teacher/student, avenged; der Steckbrief zeigt die 5 stärksten (Groll rot, Dank grün). Ein Mord lässt die ganze Familie des Täters nicht mehr gemocht werden; vengeful (und cruel) Bewohner jagen den Täter tödlich (`revengeTarget`, auch Jahre später), eine Rache zwischen zwei Familien startet eine Blutfehde (`sim.bloodFeuds`), danach dürfen sie jedes erwachsene Mitglied angreifen; Ende wenn eine Familie ausstirbt oder ein kind/pious Mitglied vergibt (8 %/Jahr). Eifersucht (jealous gegen sehr enge Freunde des Partners, evtl. Prügelei), Trennung (Beziehung unter 15/40), Mentor (alter wise/smart ab Intelligenz 7 nimmt Jugendlichen 12–22: +1/+2 Intelligenz, evtl. ein Zug; in der Chronik nur bei Favoriten, eigenen Charakteren, Königsblut), verbotene Liebe nur bei echtem Krieg: Königskinder/Anführer oder 35 % beenden den Krieg (`makePeace` in war.ts), sonst fliehen beide ohne Dorf. Heiratsdiplomatie: alle 4 Jahre, pro Königreich höchstens alle 8 Jahre, verheiratet ein Herrscher ein lediges Kind (16–40) mit einem passenden Kind eines anderen Herrschers (im Krieg erst ab 3 Jahren Dauer): das Kind des kleineren Reichs zieht um mit Mitgift (ein Zehntel der Vorräte), Stimmung +40, Bündnis ab 60, Krieg endet; liebt eines jemand anderen, flieht es zu 50 % mit dieser Person. Königsblut (`royal`) erbt sich; fehlt einem Thron der Erbe und regiert anderswo jemand mit diesem Blut, gibt es bei Stimmung ≥ 40 eine Personalunion (`k.union`, Hauptstadt bleibt), sonst einen Erbfolgekrieg (`declareWar`). Spielstand v4. Tests (4 Inseln, 300 Jahre): 35–41 Familien, Bevölkerung 193–248, Hunger 5–8 %, Kämpfe 11–25 %, 4–15 Blutfehden mit Vergebungen, 1–2 Königshochzeiten pro Insel; verbotene Liebe, Personalunion (15 Jahre stabil) und Erbfolgekrieg gezielt ausgelöst. Phase D: `leagues.ts` – Kleinstädte/Städte gründen Bünde (`sim.leagues`, einmal pro Jahr): Zuneigung (`affinity`: gleiches Volk 50 + Ortsstimmung/2, sonst Volksstimmung, Krieg/Fehde 0) ab 60 und höchstens 45 Kacheln Abstand gründet, ab 50 im Mittel tritt bei, unter 20 tritt aus, unter 2 Mitgliedern Ende. Name "League of the Coast/Woods/Mountains/Plains" (gleiches Volk, sonst nach der ersten Stadt), Bannerfarbe als Wimpel unter der Dorffahne, Rat = Anführer der Mitglieder. Mitglieder: nie Krieg/Fehde untereinander (`sharedLeague`), +2 Stimmung pro Jahr, Handel bevorzugt und zu einem Drittel statt einem Viertel, Kriegserklärung erst nach Ratsabstimmung (`councilVote`: gleiches Volk ja, andere nur bei Stimmung unter −30 zum Feind; Mehrheit nötig, sonst Veto, bei Ja ziehen die anderen Völker mit), Verteidigung (`defenders`). Paare aus zwei Orten eines Volks +5 Ortsstimmung. Fusion: zwei Orte eines Volks höchstens 26 Kacheln auseinander mit Ortsstimmung ≥ 40 über 10 Jahre verschmelzen (`fuse`, kleinerer in grösseren, Name aus beiden via `fuseNames`), der alte Ort ist `merged` (unsichtbar). `plots.ts`: schemende/ehrgeizige Erwachsene ab Intelligenz 6 schmieden mit 1,5 % pro Jahr eine Intrige (Spionage nur im Krieg: +40 Forschung; Sabotage: Vorräte halbiert, Baustelle zurück; Putsch gegen Anführer oder König (`usurp`); Bündnisbruch eines Herrschers, dessen Verbündeter im Krieg ist; Bestechung eines Vasallen eines anderen Königreichs: Treue 10). Nach 2–5 Jahren: Erfolg 30 % + 7 %/Intelligenzpunkt über 6 (+10 % scheming), sonst meist aufgeflogen (Verbannung, Familie in Ungnade, Fehde, Krieg), selten fallengelassen; erst dann Chronik. Rules: Abschnitt Leagues (Bünde mit Mitgliedern als Links, darunter aufgeflogene/gelungene Intrigen), in Relations die Götter-Gaben "🕊️ Peace" (Krieg mit Vertrag beenden) und "🤝 Ally" (Bündnis, Stimmung mindestens 60); Ortssteckbrief zeigt die Bundesmitgliedschaft. Tests (4 Inseln, 300 Jahre): 1–3 Bünde, 3–9 Fusionen, 10–20 Intrigen pro Insel (vorher bei 6 %/Jahr bis 55 Spionagefälle), Bevölkerung 153–258; Bündnisbruch, Bestechung, Ratsveto und Peace/Ally gezielt geprüft. Phase E: sechs Zeitalter (`AGES` in inventions.ts: stone, bronze, iron, medieval, renaissance, industry; `ageIndex` = Zeitalter der neuesten Erfindung), neun neue Erfindungen mit sichtbarer Folge: windmill (Gebäude mit drehenden Flügeln, Ernte +2), castle (Mauer mit vier Türmen, doppelte Mauer-LP via `wallMax`), chainmail (graue Ringe auf der Brust, Rüstung 0,55 statt 0,7), navigation (Boot mit Mast und Segel, +1 Fisch), printing (Gebäude library, +1,5 Forschung), gunpowder (Muskete als Waffe 1,9, vom Schmied; Kanonen = Mauerschaden ×2), banking (Goldmünzen am Markt, Handel ein Viertel mehr), steam (Gebäude factory mit Rauch: Schmied ×0,5 Zeit, Bergleute +1 Erz), railway (Schienen zur nächsten Stadt desselben Volks bis 60 Kacheln, Handel zweimal pro Jahr). Neue Gebäude kommen über `WANTED` nur mit ihrer Erfindung (`NEEDS`, `nextBuilding(v, sim)`). Zeitalterwechsel: Chronik "✨ The … people entered the …" und Fest in der Hauptstadt (Festart newAge); Auswandern erst bei 15 % mehr Leuten pro Zeitalter (`crowdedAt(v, sim)`). Nach der letzten Erfindung endlose Progress-Stufen (`progressCost`: 15000 + 4000 pro Stufe, `t.level`, je 2 % schnellere Arbeit bis 30 %, Chronik). Rules zeigt das Zeitalter pro Volk und den Balken zur nächsten Erfindung bzw. Progress-Stufe. Kosten gemessen (Forschung ab Jahr 100 etwa 100–800 Punkte pro Jahr): führendes Volk Mittelalter um Jahr 95–105, Renaissance 160–200, Industrie 210–240, dann alle 20–30 Jahre eine Stufe; langsame Völker ein Zeitalter oder mehr zurück. Phase F (grössere Armeen, `armies.ts`): Aufgebot `muster` (Krieger plus Erwachsene mit Mut ≥ 4, nicht feige, bis 55 Jahre, bis 35 % der Erwachsenen, max. 150; im Krieg zwischen Völkern auch aus Nachbarorten desselben Volks bis 35 Kacheln, die dann 40 s kein eigenes Heer stellen; grösste Orte zuerst), zehn Einheiten `UNIT` (club, spear ×2 gegen Reiter, archer/crossbow (durch Rüstung)/musketeer schiessen auf 5–6 Kacheln, sword, rider/knight beritten, catapult/cannon Reichweite 8–9 und Mauerschaden 5/10) je nach Zeitalter, Reiter nur mit Pferden im Stall (`v.horses`, höchstens 20 % des Heers); Nahkampf = Waffe × Einheit, Schüsse fliegen sichtbar (`sim.shots`, 0,45 s, Pfeil/Bolzen/Stein im Bogen/Kugel/Musketenfeuer mit Rauch). Formation (`h.slot` f/r relativ zum General, `army.dir` zum Ziel bzw. gegnerischen General): Nahkämpfer vorn, Schützen dahinter, Reiter an den Flanken, Belagerungsgerät hinten; Nachzügler laufen 30 % schneller; tagsüber hat Marschieren Vorrang (raid 90, nachts 55), Marschierende lassen sich nicht in Gespräche ziehen. Heere haben Namen (`army.name` → "Iron Host of Bram", Tag `army:Zeitalter:Grösse:General` in der Chronik) und Moral (Verluste kosten anteilig ×150, Tod des Generals −30, erholt sich 0,5/s); Schlacht (`findBattles`), wenn zwei Generäle einer Kriegspartei ≤ 12 Kacheln: "Battle of <nächster Ort>", Generäle rücken bis 5 Kacheln vor; unter 25 % Moral flieht das Heer (Chronik rout, `h.fleeHome` 20 s); Überlebende werden Veteranen (+1 Mut, Profilzeile, Lebenslauf, unter 60 % LP "the Scarred"). Kriegsziele (`war.goal`): Rache, wenn der Erklärende den letzten Krieg verlor (`sim.grudges`, gespeichert), Eroberung des nächsten Orts bei 1,2× Grösse, sonst Tribut; Frieden, wenn erreicht (Ort erobert / 2 gewonnene Schlachten oder 30 % bzw. 25 % Verluste beim Gegner) oder nach 3 verlorenen Schlachten des Angreifers. Kaserne (barracks, braucht Bronze, in Städten nach dem Rathaus): Soldaten = Erwachsene/5 statt /8, gedrillt ×1,15. Pferde als neues Tier (`CAPS` 16, Life-Werkzeug 🐎, Zähler), Orte zähmen jedes Jahr eins in 15 Kacheln und züchten bis Einwohner/4, Herden kommen nach, wenn weniger als 4 wild sind. Rules zeigt unter Relations die Heere mit Moralbalken, Grösse und Tätigkeit sowie das Kriegsziel. Tests (4 Inseln, 300 Jahre): 21–32 Heere, im Schnitt 7–14, grösste 20–29, 3–7 Schlachten, 1–4 Fluchten, Ziele gemischt, Bevölkerung 158–277, keine Fehler. Phase G (Seefahrt): Weltgrösse pro Welt (`world.w/h`, `resize`; W/H = 160×100 für alte Spielstände und Empty island, neue Random islands `BIG_W/BIG_H` 320×200), alle Module rechnen mit `world.w` (Pfad-Puffer, Sim-Raster, Kartenpuffer, Kamera `setWorld`, `frame(focus)` auf die Hauptinsel). `generate`: Hauptinsel in Grösse der alten Insel plus 3–6 Nebeninseln mit Namen (`world.islands`, `islandName`) und tiefem Wasser dazwischen; Nebel `world.fog` (alles ausser Hauptinsel), `reveal`, `seen`; Landmassen `landAt`/`sameLand`/`landSize` (Land + seichtes Wasser, neu bei Terrainänderung); Gold/Gewürze `world.deposit` auf Nebeninseln (Kachelmalerei in tiles.ts). Menschen (nicht Islanders) lüften den Nebel im Umkreis 5, Schiffe 6–9; Inseln gelten als entdeckt, sobald Land darauf sichtbar ist (Chronik mit Kapitän). Unter Nebel wird nichts gezeichnet, Chronik-Einträge dort bleiben verborgen. Fünftes Volk `islanders` (orange, in `PEOPLES`; Auswahllisten nutzen `PLAYABLE`), manchmal 7 auf einer Nebeninsel; segeln nicht aus (nur Handel), schliessen sich einem Volk an, das auf ihrer Insel lebt (Stimmung > −20) oder per Schiff befreundet ist (≥ 40), 4 Jahre ohne Krieg (`colonies.ts`), sonst Krieg/Eroberung. Hafen (`harbor`, braucht Bootsbau, nur mit Küstenplatz `coastSpot` + tiefem Wasser, sonst `v.coast = false`; Steg zur Anlegestelle `dockOf`). `ships.ts`: Schiffe fahren mit Mover 'ship' (nur Wasser), an Bord (`h.aboard`) ist man von der Karte, wird versorgt; ab Mittelalter Entdecker (Kapitän, Ziel nächste unentdeckte Insel), Siedlerschiff (6 junge Leute samt kleinen Kindern, Kolonie `foundColony` auf entdeckter Insel ohne Ort im Umkreis 16), Handelsschiff (zwischen Häfen verschiedener Inseln, Nahrung, Stimmung, Kolonietreue +4); ab Renaissance Kriegsschiffe: Patrouille gegen feindliche Häfen und Truppentransport (`shipArmy`, 20 pro Schiff, max. 4; Heer im Zustand `sail`, `army.sea/landed`, Heimfahrt `ferryHome`); Seeschlacht bis 7 Kacheln (Pfeile 9 bzw. Kanonen 18 Schaden), Wrack 3 Jahre, Tote Ursache 'sea'. Spielstand lädt Kurse neu (`ship.goal`). Kolonien (`colonies.ts`, jährlich): Tribut ein Zehntel der Vorräte und halbes Gold/Gewürz an den Mutterort, Treue −1/Jahr (−1 über 25 Leute, −1 im Krieg), unter 25 bei 15+ Leuten Unabhängigkeitserklärung = Fehde (`rebelOf`; gewinnt der Mutterort, wieder Kolonie, sonst frei). Gold (+15 Forschung), Gewürze (+4 Nahrung) je Vorkommen im Umkreis 9 jährlich, Schatz im Ortsprofil. Völker ohne Kontakt (keine gemeinsame Insel, kein Hafen bei sichtbaren Orten) haben keine Stimmungsdrift und keine Kriege; Heere suchen Ziele auf derselben Landmasse, über See nur mit Kriegsschiffen; Markthandel nur über Land; Abspaltungen, Fusionen und Anschlüsse nur auf derselben Insel; wer von seinem Ort getrennt ist (`strays`), schliesst sich einem Ort seines Volks auf seiner Insel an oder wird heimatlos. Geburtenbremse auf grossen Welten pro Landmasse (Landkacheln × 0,06 statt 350 gesamt). Rules zeigt gefundene Inseln und Schiffe auf See; Ortsprofil zeigt Insel, Kolonie mit Treue, Rebellion, Schiffe auf See, Gold/Gewürze; Profil zeigt «On board the …». Spielstand v5 (Grösse, Nebel, Vorkommen, Inseln, Schiffe, Wracks; v4 → v5 = alte 160×100-Insel ohne Nebel). scripts/tiny-island-art.mjs malt den Ausschnitt um die Hauptinsel. Tests (4 Welten, 300 Jahre): alle Inseln entdeckt, 6–26 Kolonien, 1–4 Unabhängigkeitskriege, bis 16 Flotten, bis 14 Truppentransporte, bis 5 versenkte Schiffe, Islanders 1× friedlich angeschlossen, Bevölkerung 135–212, keine Fehler; gefundene Fehler unterwegs: Passagiere verhungerten auf langen Fahrten, Kinder von Siedlern blieben zurück, Inselvolk wuchs ohne Grenze. Phase H (Weltwunder, `wonders.ts`, Zeichnung `wonder-art.ts`): acht Wunder je einmal pro Welt (`WONDERS`, ab Zeitalter `WONDER_AGE`): gardens (Bronze; Nahrung beim Abliefern ×1,3, Leben ×1,1), library (Bronze; Forschung ×1,5), colosseum (Eisen; jährliche Spiele = Fest 'games', halb so viele Raufereien, Soldaten/Einheiten ×1,15), lighthouse (Mittelalter, nur mit Hafen; Schiffe ×1,3 schneller, +4 Sicht, beim Fertigstellen Nebel im Umkreis 45 weg), cathedral (Mittelalter; keine Aufstände, Vasallen +3 Treue/Jahr), wall (Mittelalter; Orte fallen nur, wenn Katapulte/Kanonen dabei sind, `wallHolds`), observatory (Renaissance; Forschung ×1,35), colossus (Industrie; Bronzestatue des grössten Helden, +3 Stimmung/Jahr bei allen Völkern). Baubeschluss jährlich 15 % in Städten oder Towns ab 30 Einwohnern (mindestens 20) mit Nahrung für 2 Jahre, ein Projekt pro Volk, neueste Wunder bevorzugt; Baustelle 4×4 (`siteFor`, 5–13 Kacheln vom Platz, Bäume weg, `onWonder` hält Häuser fern). Arbeit 1500 + 250 × Zeitalter Personensekunden: jede Sekunde ein halber Punkt je wachem Bauarbeiter im Umkreis 25 (`wonderWork`) plus Hände an der Baustelle (Bauarbeiter laufen mit Stein/Holz auf der Schulter hin, Bau-Punkte 70 tagsüber), mehr Bauarbeiter (Erwachsene/6); jährlich 3 Holz (+3 Stein bei Fels), sonst halbes Tempo, die Leute sammeln dann gezielt Holz/Stein. Sichtbar in fünf Stufen mit Gerüst und Kran; wer zuerst fertig ist, gewinnt, die anderen behalten eine graue Ruine und −20 Stimmung zum Sieger; aufgegeben unter 10 Einwohnern oder nach 80 Jahren. Fertig: Fest 'wonder', Name nach König/Königin oder Ortsleiter (Koloss: Held einer Legende), Tag `wonder:<kind>:<rank>:<name>` in der Chronik; bei Eroberung geht es an den Sieger (Chronik wonderTaken). Rules-Tab «World wonders» mit Stand jedes Wunders, Ortsprofil zeigt das Wunder. Feinschliff: Wege-Cache mit `world.uid` im Schlüssel (mehrere Welten in einer Seite teilten Wege), Siedlerschiffe nur aus vollen Orten bzw. zu zwei Dritteln besiedelten Inseln (sonst bluteten kleine Völker aus). Tests (4 Welten, 500 Jahre): alle 8 Wunder in drei Welten (Jahr 84–414), Bauzeit 23–67 Jahre, Wettrennen mit Ruinen, Übernahme durch Eroberung, Bevölkerung 129–291 (eine Welt mit wenig Paaren bei ~20), keine Fehler. Update 3 (Plan im Doc «Tiny Island – Update 3», Phasen A–G, je mit 300-Jahre-Lauf bei 10× getestet): Phase A = keine Nacht mehr (`sim.darkness`/`isNight` entfernt, nur noch die Jahreszahl in der Uhr, Fenster und Feuer flackern leicht, der Leuchtturm blinkt ab und zu), Energie sinkt 4× langsamer (`BALANCE.sleep`), Müde machen ein Nickerchen von 2–3 s zuhause oder am Dorffeuer, wenn das ≤ 5 Kacheln weg ist, sonst am Ort bzw. im Feldlager, ein begonnenes Nickerchen wird fertig geschlafen; Beerenbüsche (`BALANCE.bushes`) nur noch an Waldrändern ausserhalb von `noTree`, höchstens 3 % des Grases, leben 10–20 Jahre (`world.bushEnd`, nicht gespeichert), Völker mit Landwirtschaft zählen Beeren als doppelt so weit weg; Holzfäller und Bauleute fällen nichts mehr ab 250 Holz im Lager (`BALANCE.trees.woodStock`, sonst holzten die fleissigeren Bewohner den Wald für Lager von 2000 ab); Speicherformat v6: alte Stände räumen beim Laden einmal überzählige Büsche (> 3 %) und Wald (> 30 %) weg (`world.trimNature`). Phase B = Landbesitz (`territory.ts`): `world.owner` (Int32 pro Kachel = Orts-ID, −1 frei, gespeichert ab v7, `ownerVersion` für die Karte), jede Sekunde `claimLand` (Umkreis nach Grösse aus `BALANCE.land.radius`, Dorf 8/Stadt 12/City 16 + `v.landBonus` für Burgen in Phase C, nur gleiche Landmasse; freies Land an den nächsten Ort, Land desselben Volks an den näheren, fremdes nie; Ruinen verlieren Land nach 20 Jahren via `v.ruinYear`), einmal im Jahr `territoryTick`: Landhunger pro Königreich (`k.landHunger`, Dichte gegenüber `crowded`, leere Lager, ambitious/greedy König), Anspruch erst wenn Siedler keinen freien Bauplatz mehr finden (`roomToSettle`, gleiche Suche wie `farSpot`), Ziel = fremder Ort mit der längsten gemeinsamen Grenze, Kreis-Gebiet (`sim.claims`, Schraffur), −30 Stimmung, nach 5 Jahren Krieg mit Ziel `land` (`declareLandWar`), ausser Bündnis oder Personalunion; gewonnen mit 2 Schlachten, 30 % Verlusten, Einnahme des Orts oder 45 s Halten des Gebiets (`war.held`), dann `handOver` (Chronik `landWon`). Landnahme: `split` findet keinen freien Platz → mit 35 % auf fremdem Land (`farSpot(…, true)`, `landGrab`): −50 Stimmung, Ultimatum 3 Jahre, dann Abzug (Ruine, `withdrew`) oder Krieg `expel`; verlieren die Siedler, werden sie vertrieben. Karte: `Renderer.drawLand` (Tönung als 1-px-pro-Kachel-Canvas, Grenzen als Path2D in Volksfarbe auf dunklem Rand, dunkle dicke Linie zwischen Völkern, Grenzsteine ab Zoom 1,6, Schraffur), nur neu gebaut bei Änderung; Knopf «Borders» unten und Taste G schalten normal → stark → aus (localStorage `jxsi_tiny_island_borders`). World-Fenster: Reiter Territory (Landanteil, Landhunger, freies Land, Ansprüche und Ultimaten). `TENSION` in `chronicle.ts` = Spannungswert pro neuem Chronik-Typ für den Kinomodus. Phase C = Ortsbau: `roads.ts` (Strassenraster alle 4 Kacheln um den Platz, `gridSpot` setzt neue Häuser/Gebäude neben eine Strasse, `layStreet` legt beim Fertigbau die Gasse zur Tür bis zum Platz; Ringe: Kern ≤ 4,5 (Markt, Rathaus, Tempel, Palast, Kathedrale, Totem, Altar, Brunnen), Wohnring bis `livingRadius` (Dorf 6/Stadt 8/City 11, Mauer bei +1), Felder/Höfe/Gehege/Burg draussen; `world.road` 1 Pfad/2 Schotter (Rad)/3 Pflaster (Mauerbau), auf seichtem Wasser Brücke (nur mit Mauerbau), `world.cost` teilt durch `BALANCE.roads.speed`, Strassen werden jährlich mit dem Wissen besser; Fernstrassen per A* zum nächsten Ort desselben Volks ≤ 70 Kacheln, Kachel für Kachel gebaut (`sim.highways`); Eisenbahn zwischen den nächsten Städten mit Bahnhof (`sim.railways`, `world.rail`), danach fährt ein Zug (`sim.trains`, beim Laden aus den fertigen Linien neu), Chronik `railway`; Strassen, Brücken und Schienen sind Teil der Karte in `tiles.ts`). Felder in eingezäunten Parzellen 4 × 3 (`v.plots`, `jobs.ts` `planPlot`) ausserhalb des Wohnrings mit einem Bauernhof (`farm`) für bis zu 3 Parzellen, ohne Platz wie früher Einzelfelder am Platz; Feldziel nach Grösse (`BALANCE.fields.max`). Neue Gebäude (`town.ts`, `AGE_NEEDED`/`NEEDS`/`allowed`, `COMFORT` gegen Einsamkeit): Totem, Räucherhütte (Lager verdirbt halb so schnell), Brunnen (+10 % Grösse), Altar, Lagerhaus (nichts verdirbt, doppeltes Holzlager), Taverne, Burg (5 × 5 auf einem Hügel nahe Berg/Grenze, nur Hauptstadt oder Grenzort, max. 3 pro Volk, +6 Landreichweite, Mauer ×1,5, Kriegsziel; Platz wird erst gesucht, wenn Holz/Stein da sind, sonst neuer Versuch in 20 Jahren `v.castleAt`), Kathedrale, Marktstände ab Mittelalter, Palast (nur Hauptstadt, Vasallen +8 Loyalität), Universität/Sternwarte (Forschung), Theater, Museum, Bahnhof, Leuchtturm (an der Küste), Park; `SPECIAL` werden nicht von Göttern geschenkt; `HALF_SIZE` für 5 × 5 in `taken`/`occupied`. Mauern nach Zeitalter: Palisade (Steppe immer), Stein mit Türmen (Eisenzeit), Burgmauer mit Zinnen und Torhäusern (Burgenbau), Ring bei Wohnradius + 1 mit Toren an den Hauptstrassen, Belagerung im Ring ±3, jährliche Reparatur. Baustil: Steppe Jurten, Wald Moosdächer und Holz, Berg Stein, Küste Pfahlbauten am Wasser. Gehege (`pens.ts`): ab Landwirtschaft und 8 Leuten, 5 × 5 ausserhalb, je eine Art (Schaf, Huhn, Kuh, Pferd), Beruf Hirte (`herdWork`: Wolf am Holzzaun verjagen, wilde Tiere einfangen ohne die letzten 3, sonst hüten, Task `herd`), jährlich Junge bis 8, Rest geschlachtet, Eier/Milch/Wolle als Nahrung, Pferde in den Stall, mit Mauerbau Steinmauer gegen Wölfe; neues Gehege erst wenn alle bestehenden belegt sind; eingesperrte Tiere (`animal.pen`) bleiben drin und werden nicht gejagt. Neue Tierart Kuh (wild, jagbar, Life-Werkzeug, Zähler oben). Neue Orte aus einer Hungerflucht haben 5 Jahre Schonfrist (sonst Ketten von Gründungen). Speicherformat v8: alte Stände legen beim Laden einmal alle Gassen (`layAllStreets`). Phase D = Religionen (`religion.ts`, Zahlen in `BALANCE.religion`): Propheten selten (pious, Charisma ≥ 8, Intelligenz ≥ 6, < 60 Jahre, 4 %/Jahr pro Kandidat, mehr nach Kriegsjahren, mind. 12 Jahre Abstand, max. 6 Glauben) oder sofort mit der neuen Kraft Prophet; `foundReligion`: erfundener Name (Formen × Nomen, eindeutig), Symbol (Textzeichen ☀ ☾ ≈ ♨ ♣ ✦ ◉ ▲, auch auf dem Ortsschild), Farbe, 2 Lehren aus peace/holyWar/nature/ancestors/knowledge/sea/fertility/poverty, Ort der Vision heilig, Familie + 30 % des Orts folgen; Prophet mit Heiligenschein predigt (Choice/Task `preach`, Lichtblase `light`), Grab wird heiliger Ort (Schrein), Legende «the Prophet». Pro Mensch `faith`/`devotion`/`prophet`/`pilgrimAt`; jährlich `religionTick`: Glaube verblasst 3/Jahr, Tempel/Altar/Kathedrale +3, Priester +10, Glaubenslose übernehmen den Ortsglauben, Kinder den der Mutter; Ortsglaube = ≥ 40 % (bleibt bis < 30 %, Chronik `converted`), Volksglaube ≥ 35 % (`sim.peopleFaith`), Staatsreligion = Glaube des Königs (`k.stateFaith`, Vasallen anderen Glaubens −10 Loyalität); Berufe Priester (Ort mit Tempel/Altar/Kathedrale) und Missionar (Städte mit fremdgläubigen Orten in 45 Kacheln), früh in `wanted` vergeben; Pilger mit Hingabe ≥ 70 etwa alle 25 Jahre zu einem heiligen Ort; Spaltung bei ≥ 60 Gläubigen und ≥ 40 Jahren (4 %/Jahr, «Reformed/True/New/Free …», eindeutig); Stimmung pro Sekunde gleicher Glaube +0,08, Zweige −0,08, fremd −0,03; heiliger Krieg (Kriegsziel `faith`, auch übers Meer mit Hafen) 4 %/Jahr × Aggression, Sieger bekehrt 40 % der Verlierer; Lehren: Frieden (Krieg erst 15 Stimmung später), heiliger Krieg (Moral sinkt langsamer), Natur (halb so viele Holzfäller, keine Jagd), Ahnen (Alte ≥ 70 Jahre werden «the Revered»), Wissen (Forschung ×1,25), Meer (+1 Fisch), Fruchtbarkeit (Geburten ×1,2), Armut (Raufereien halb, Arbeit ×1,05). World-Reiter Religions mit Glaubenskarte (`renderer.faithView`, Knopf `data-faith-map` in main.ts), Profile und Ortsprofil zeigen den Glauben. World-Fenster jetzt 920 px breit (9 Reiter). Phase E = Kultur und Laune (`society.ts`, Zahlen in `BALANCE.culture`): viertes Bedürfnis `h.culture` (verblasst 0,25/s, Kunst im Ort bremst, Feste füllen), Laune `h.mood` = gewichtete Bedürfnisse (geglättet, `moodTick` jede Sekunde), Gesicht über dem Kopf bei ≥ 90 oder ≤ 25, Balken Culture/Mood im Profil. Rollen (`h.role`, jährlich neben dem Beruf): Philosoph (wise + Intelligenz ≥ 8, Universität bildet max. 2 pro Ort aus) schreibt Bücher (`sim.books`, max. 1 pro Ort in 6 Jahren; «On Tolerance» halbiert 30 Jahre lang Glaubensstreit und heilige Kriege, `sim.tolerance`), Musiker (artistic, nicht Künstler), Dorftrottel (1 pro Ort ab 8 Leuten: dumm+freundlich, sonst dumm, sonst einfach+freundlich; Narrenkappe; Streiche in der Chronik `fool` mit Ursache, «etwas Weises» schreibt ein Philosoph als «The Sayings of …» auf; in der Hauptstadt Hofnarr `jester`; stirbt er, trauert der Ort ab 12 Leuten `foolDied`), Schauspieler (Renaissance + Theater, 2 pro Theater, Stücke über echte Chronik-Ereignisse `play`). Auftritte (Choice/Task `perform` an Taverne/Theater/Bibliothek/Platz) und Besuche (`visit` bei Kultur < 30) nur satt und mit vollem Lager (`need.food < 0,4`). Kulturpunkte pro Ort (Gebäude, Rollen, Künstler, Werke, Bücher) → Stufen 0–4 Primitive/Simple/Educated/Cultured/Enlightened bei 0/5/11/18/26 Punkten (Sterne auf dem Schild ab Stufe 2, Chronik `cultureLevel` ab Cultured): Simple −20 % Raufereien, Educated +0,5 Forschung, Cultured +2 Landreichweite und zieht 2 Junge pro Jahr aus armen unzufriedenen Orten an, Enlightened +15 Loyalität und Bewunderung (+0,05 Stimmung/s). 5 Jahre Laune < 35 → Abwanderung (`discontent`) und −10 Loyalität. Bibliothek schon ab Schrift (+0,6 Forschung, mit Buchdruck +1,5, +0,1 pro Buch), Museum zeigt Werke und Kriegstrophäen (`v.trophies`, nach gewonnenen Kriegen). Felder (Fix): Bauern pflügen bei zu wenig Feldern zu 35 % zuerst (sonst kamen sie vor lauter Ernten nie dazu), Parzellen, Gehege und Burgen dürfen auch auf Land anderer Orte desselben Volks liegen. Phase F = Katastrophen (`disasters.ts`, Zahlen in `BALANCE.disasters`): Regel `sim.rules.disasters` 0–3 (Off/Rare/Normal/Chaos, Faktor `often`, Regler in Stufen mit Wort `data-rule-out`/`data-words`), Knopf 🌋 Disasters (Taste D) mit Werkzeugen Blitz/Vulkan/Hurrikan/Regen (Klick auf die Karte, `onDisaster` in main.ts) und Hitzewelle-Knopf. Blitz (`strike`): Gewitter 0,25/Jahr nahe einem Ort, entzündet Wald/Holzhaus, trifft Menschen (15 % tödlich, Chronik `struck`). Feuer (`sim.fires` Kachel → Sekunden, nicht gespeichert): brennt 8 s, springt auf Wald/Holzhäuser/Felder (in Hitzewellen auch Gras) über, verbrannte Holzhäuser fallen weg, Brandnarben (`sim.scorched`), Bewohner löschen (Choice/Task `douse`, Wert 85, mit Brunnen doppelt so schnell), ab 6 Kacheln benannt (`fire`, ab 25 «The Great Fire of Year N»), nach 30 Löschungen «the Firebreaker» (Chronik + Legende). Vulkan (`wakeVolcano`, nur Berg): 2 Jahre Rauch (`volcanoWakes`, von Göttern 6 s), dann 18 s Ausbruch (`eruption`) mit 3–5 Lavaströmen (2–3 breit, töten, zerstören Häuser, entzünden), Lava kühlt nach 40 s zu Fels, nach 12 Jahren fruchtbares Gras (`world.fertile`, Ernte ×1,6). Hurrikan (`hurricane`, «Hurricane Ada»): vom Meer quer übers Land, Radius 6, deckt Dächer ab, entwurzelt Bäume, versenkt Schiffe, Leuchtturm im Umkreis 40 halbiert den Schaden. Hitzewelle (`heatwave`, «The Long Summer of Year N»): 1–3 Jahre, Wachstum halbiert, Orte ohne Kornspeicher verlieren 10 % Vorrat pro Jahr, warmer Bildschirmton. Regen (Götterkraft, `godRain`): löscht alles im Umkreis 10, verkürzt Hitzewelle. Treibhaus: `sim.temperature` jährlich +0,003 pro Fabrik +0,002 pro Zug −0,008 bei Wald > 22 % −0,004 pro Volk mit Naturglauben −0,02 bei Bewegung (Philosoph ab 1°, `movement`, 50 Jahre), Kurve `sim.tempHistory` im Population-Reiter (`data-temp`), mehr Hitzewellen/Hurrikane, ab 1,5° Schnee weg (`world.melted`), ab 2° (nur Normal/Chaos) Meer steigt (`seaRises`, Sand zuerst, Häuser/Gebäude gehen verloren). Nach Katastrophen: Hingabe +15 (10 % verlieren Glauben), Propheten 10 Jahre doppelt so wahrscheinlich (`sim.disasterYear`). Neue Todesursachen fire/lava/storm/lightning. Phase G = Kinomodus (`cinema.ts`, Knopf 🎬 Cinema in der Leiste, Taste K, Esc/Klick beendet): Klasse `is-cinema` blendet die Oberfläche aus, Overlay `[data-cinema-view]` mit schwarzen Balken (11vh), Vignette, Untertitel (Serif kursiv), Kapitelkarte, «Clean screen» (`data-cine-clean`, ohne Balken/Untertitel). Regisseur: Kandidaten aus neuen Chronik-Einträgen (Spannung aus `TENSION` bzw. `BASE` für ältere Typen, +20 für Favoriten/eigene Figuren, ≤ 20 ignoriert, 25 s gültig) und Live-Szenen (Schlacht 90, Belagerung 90, Ausbruch 95/Rauch 55, Hurrikan 95, grosses Feuer 80, Fest 60), sonst ruhige Szene (Spannung 10, folgt einer Person, Zeit läuft 3×); Szene 6–20 s, nie dieselbe zweimal nacheinander, besserer Kandidat (+5) schneidet nach 6 s; Kamera gleitet (weit bei Schlachten/Katastrophen 1,7, nah bei Hochzeit/Krönung/Personen 4, sonst 2,8) und folgt Bewegtem; Zeitlupe 2 s auf 0,3× bei breach/eruption/fall/overthrown/conquest (`cinema.update` liefert den Zeitfaktor für `sim.advance`); Kapitelkarte «Chapter {n} – {Zeitalter}» bei einem neuen höchsten Zeitalter; Untertitel aus `T.cinema.lines[kind]` (3 Varianten pro Typ, `live_*` für Live-Szenen, `calm`/`calmWild`), sonst die Chronikzeile als Klartext. Musik (`music.ts`): Web Audio, 5 Stimmungen peace/war/festival/grief/disaster (Akkorde, Bass, wandernde Melodie, Rauschtrommel; Vorausplanung 0,4 s), 2 s Überblendung; Stimmung im Kino nach Szenentyp (`MOOD_OF`), sonst nach Weltlage (`Cinema.worldMood`); Rules-Fenster «Cinema & music»: Musik an/aus (`data-music`, wird beim ersten Kino automatisch an), Lautstärke (`data-volume`); Leiste unter 420 px nur Symbole. Dev-Hook `window.tinyIsland` hat jetzt auch `cinema` und `music`; Achtung: das Test-Browserfenster ohne Fokus läuft nur mit ~3 fps (kein Fehler des Spiels). Nebel (Wunsch des Nutzers 2026-11-20): nicht mehr gezeichnet, Orte/Figuren/Schilder/Chronik werden nie mehr wegen Nebel versteckt, der Spieler sieht immer die ganze Welt; `world.fog` bleibt nur als unsichtbares Wissen der Völker (Entdecker, «discovered», Kolonien nur auf gefundenen Inseln, Kontakt übers Meer). Kleine Verbesserungen danach: Life-Reiter ohne Völkerwahl, `sim.place(kind, x, y)` nimmt `sim.peopleAt(x, y)` (Volk des Landbesitzers → nächster Ort auf derselben Landmasse → nächster Mensch → zufällig). Mauern (`render.ts` `wall()`): ein Block wird nur gezeichnet, wenn alle vier Ecken auf eigenem/freiem Land ohne Berg liegen, die Kachel darunter kein Berg ist und er nicht im Ring (`livingRadius + 1.5`) eines anderen Ortes liegt, so kreuzen sich Mauern nie. Gebäude-Profile (`building-panel.ts`): `buildingAt(sim, x, y)` (Mauern ausgenommen, `HALF_SIZE` für Burg/Gehege, Wunder 4×4) und `buildingHtml()` für Haus (Bewohner, Kinder, Ausbau), Gebäude (Text aus `T.building.does` plus Details je Art), Baustelle, Wunder; Klick in `main.ts` nach dem Menschen-Treffer, `panels.selectBuilding`, goldener Rahmen `renderer.drawSelectedBuilding`. |
| `/10s`            | How long is 10 seconds? Start drücken, bei gefühlt 10 s stoppen, keine Uhr. Ergebnis, Abweichung, geschätzter Prozentrang (Normalverteilung, keine echten Spielerdaten), Kommentar, Teilen (Web Share / Zwischenablage), Bestwert in `localStorage` (`jxsi_10s_best`). Rein clientseitig. Kurzlink `jxsi.ch/10s` (auch `www.`), Worker leitet per `FUN_SHORT_LINKS` weiter. Vorschaubild `src/assets/fun/10s-og.png` |
| `/the-button`     | The Button: roter Knopf, globaler Zähler aller Klicks aller Menschen, nie zurückgesetzt. Stats: eigene Klicks, Anzahl Klicker, Klicks heute, längste Serie (global, mit Name), eigene beste Serie, eigener Rang, Top 5, optionaler Name |

**API und Speicher:** `/api/the-button` (GET Stats, `?player=<uuid>`) und
`/api/the-button/click` (POST `{player, n, name?}`, `n` ≤ 50 pro Request, `n`
= 0 setzt nur den Namen) laufen in `worker.js` auf jedem Host und landen in
**einem** Durable Object `TheButton` (SQLite, Binding `THE_BUTTON`, Migration
`v1` in `wrangler.jsonc`; im Free-Plan enthalten). Tabellen `players`
(id, name, clicks, streak, best_streak, first_seen, last_seen) und `daily`.
Serie = Klicks mit höchstens 2,5 s Abstand. Autoclicker-Bremse: pro Spieler
höchstens ein Klick je 40 ms plus 5 Burst, Überschuss wird still verworfen.
Spieler-ID = `crypto.randomUUID()` in `localStorage` (`fun.player`), Name in
`fun.name`, maximal 16 Zeichen, serverseitig auf Buchstaben/Ziffern/`_ .-`
reduziert. Der Client zählt sofort lokal, sendet alle 350 ms gebündelt, pollt
alle 6 s wenn nicht geklickt wird, schickt beim Verlassen per `sendBeacon` nach
und hält Klicks bei Netzfehlern zurück (max. 500).

Neue Spiele: Seite unter `src/pages/fun/`, Eintrag in der `games`-Liste von
`fun/index.astro`, Strings in `UI.fun`. Braucht ein Spiel Speicher, bekommt es
eine eigene DO-Klasse in `worker.js` plus Binding und neue Migration (`v2`, …).

### Bibliothek `library.jxsi.ch`

Eine Wissens-Bibliothek, getrennt vom Game-Hub: ein Bücherregal, jedes Buch ist
ein Thema zum Lernen und Testen. Gleicher Mechanismus wie die Fun-Subdomain:
Seiten unter `src/pages/library/` (Layout `src/layouts/Library.astro`), Build
unter `dist/library*`, `worker.js` bildet den Host über `SUBSITES` auf diesen
Ordner ab, `www.jxsi.ch/library/*` leitet um, Sitemap lässt `/library` aus,
Custom Domain in `wrangler.jsonc`. Links innerhalb relativ (`flags`, `./`).
Verlinkt im Footer und als Karte auf `/hub` (nicht in der Nav, die Handy-Leiste
hat keinen Platz mehr). Strings in `UI.library`.

**Look: alte Bibliothek** (bewusst anders als der Rest der Seite). Das Layout
lädt nur hier die Serifenschrift Playfair Display (`@fontsource-variable/playfair-display`,
OFL, selbst gehostet) als `--font-display`, hat Kopf und Fuss in dunklem
Walnuss mit Messinglinie und überschreibt auf `html.library` die Tokens:
Pergament statt Weiss (`--bg`, `--surface`), Braun statt Schwarz (`--ink`),
gedämpfte Signalfarben, `--line` 2px, weichere Schatten. Die Komponenten
funktionieren unverändert, sehen nur älter aus. `room` (Layout-Prop) macht die
ganze Seite zum dunklen Lesesaal (nur das Regal). Das Regal: Walnussschrank aus
CSS-Verläufen (Maserung, Krone, Sockel, Bretter mit Messing-Schildhaltern),
Bände mit Lederrücken, erhabenen Bünden und Goldlinien; echte Bücher mit
Titelfeld in Goldprägung, Globus-Emblem, Signatur-Etikett und rotem
Lesezeichenband, ziehen sich beim Hover heraus; alte Bände ohne Thema,
Buchstütze, liegender Stapel, Sanduhr und Globus sind Deko (`SHELVES` in
`src/data/library.ts`). Darunter pro Buch eine Karteikarte (Signatur, Regal,
Inhalt, roter Stempel-Link). Die Lernkarten-Rückseite im Flaggen-Buch ist der
blaue Ledereinband mit Goldschrift.

| Route (library-Host) | Inhalt |
|----------------------|--------|
| `/`                  | Das Regal (`src/pages/library/index.astro`): Bücher aus `src/data/library.ts` (`BOOKS`, `SHELVES`; `null` = leerer "coming soon"-Platz), echtes Buch zieht sich beim Hover heraus, darunter eine Karte pro Buch. Vorschaubild `src/assets/library/library-og.png` |
| `/flags`             | Flags of the World: 203 Flaggen (die 197 Länder plus England, Schottland, Wales, Grönland, Hongkong, Puerto Rico; die übrigen Gebiete bewusst weggelassen, weil sie meist die Flagge des Mutterlandes oder fast identische Varianten tragen und kaum jemand sie kennt). Vier Modi (`?mode=`): **Browse** (Raster, Suche nach Name/Hauptstadt, Detail-Dialog mit Hauptstadt, Kontinent, Status, gleichen und ähnlichen Flaggen), **Learn** (Lernkarten, Leitner-Boxen 0–6 mit 0/1/3/7/16/35/90 Tagen, beim ersten Mal gewusst = sofort "known", nicht gewusst kommt in der Runde nach 3 Karten wieder; Runde = fällige Karten + bis 10 neue, max. 20), **Quiz** (Multiple Choice, Flagge → Name oder Name → Flagge, 10/25/alle, falsche Optionen bevorzugt Look-alikes, gleicher Kontinent, ähnliche Farben), **Type it** (Name eintippen, Vorschläge ab 2 Zeichen, Tippfehler 1 Zeichen ab 5, 2 ab 10 Buchstaben, Alternativnamen gelten). Auswahl für alle Modi: alle, Länder, ein Kontinent, andere Flaggen (die sechs Extras). Tests fragen verpasste und fällige Flaggen zuerst, falsche Antworten setzen die Karte auf Box 0. Fortschritt in `localStorage` (`jxsi_lib_flags_v1`). Logik in `src/lib/library/` (`flags.ts` Daten/Abgleich/Optionen, `progress.ts` Boxen, `flags-page.ts` Browser). Vorschaubild `src/assets/library/flags-og.png` |

**Flaggen-Daten:** `scripts/import-world-flags.mjs` (Quellen: npm
`svg-country-flags`, gemeinfrei; npm `countries-list`, MIT; beide nur zum
Import mit `--no-save`) schreibt die bereinigten SVGs nach `src/assets/flags/`
(alle mit Eigenhöhe 600 px), `src/data/world-flags.json` (die 197 Länder für
Paint the Flag) und `src/data/library/flags.json` (die 203 mit Name,
Alternativnamen, Hauptstadt, Kontinent, Typ, Zugehörigkeit, Hauptfarben). Aus
einem 30×20-Render: `same` = identische Flagge (seit dem Ausmisten keine mehr;
beide Antworten würden gelten, nie gegeneinander), `like` = praktisch
gleich (Indonesien/Monaco; nie gegeneinander), `near` = ähnlich
(Rumänien/Tschad; bevorzugte falsche Option). Namen und Ausnahmen (`NAMES`,
`ALIASES`, `PARENT`, `CAPITALS`) und welche Nicht-Länder ins Buch kommen
(`KEEP`) stehen im Skript.

Neues Buch: Seite unter `src/pages/library/<slug>.astro`, Eintrag in `BOOKS`
und auf einem Platz in `SHELVES` (`src/data/library.ts`), Strings in
`UI.library`.

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
- `sky-justin` – Sky & Justin, Minecraft-Minigame-Kanal mit Sky auf YouTube und TikTok (Kategorie `videos`)
- `beats` – prod. by JXSI, Beats in FL Studio, Musikkanal @prodbyJXSI (Kategorie `music`)
- `judgeitall` – JudgeItAll, kurzlebiger Bewertungs-Blog plus YouTube-Kanal aus 2025, pausiert (Kategorie `experiments`)
- `frogtype` – FrogType, Typing-Game in 7 Tagen gebaut (Godot), auf itch.io, mit Video (Kategorie `games`)

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
  --c-yellow:  #FFA300;  /* Logo-Farbe */
  --c-pink:    #FF5DA2;
  --c-blue:    #4D8DFF;   /* heller als klassisches Elektroblau, damit Ink-Text AA schafft */
  --c-purple:  #9B5DE5;
  --c-orange:  #FF5A1F;  /* rötlich, hebt sich vom Gelb ab */
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

**Display-Schrift nie unter 20px.** Archivo Black setzt den Punkt des kleinen
"i" sehr nah an den Strich; bei 18px und darunter verschmelzen beide durch das
Hinting in Chrome/Windows zu einem grossen "I" ("MusIc", "VIdeos"). Deshalb
für Labels in der Display-Schrift mindestens `var(--text-xl)` (20px) nehmen,
nie `--text-lg`.

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
  Burger-Menü oben rechts. Die Hauptnavigation (7 Einträge inkl. Fun und
  Library) bleibt bis 959px unten fixiert und wechselt erst ab `960px` in die
  Kopfzeile (Nav.astro, Footer.astro und retro.css nutzen denselben Wert).
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
  überschreibbar; **Videos** zählt automatisch: `offset` + Summe der
  öffentlichen Videos aller Kanäle aus `src/data/video-count.json`, gelesen
  aus dem Kanal-Header "34 videos" in `src/lib/video-count.mjs`, beim Build
  und alle 30 min vom Worker-Cron, der die Zahl auf `/`, `/card` und `/hub`
  über `data-stat="videos"` einsetzt. Offset 92 verankert am 2026-11-13:
  Kanäle 93 = Karte 185. Neuer Kanal: in `channels` eintragen und `offset` um
  dessen aktuelle Anzahl senken), Issue/Class/Restr/Endorse,
  Barcode, Jusis echte
  Unterschrift (`src/assets/signature.png`, aus einem Foto freigestellt mit
  `scripts/signature-from-photo.mjs <foto> [schwelle]`), Name und "Adresse".
  Alle Werte in `SITE.license` (`site.ts`).

**Logo:** Das JXSI-Logo (oranges abgerundetes Quadrat, schwarzes X; Master
`F:\JXSI LOGO.png`, nicht im Repo) ist das Markenzeichen in der Nav
(`src/assets/logo.png`, mit Drop-Shadow, leicht gedreht, Hover-Animation) und
das Favicon (`public/favicon.svg`, als Vektor nachgebaut). Neue Masterdatei:
`npm run logo -- <pfad>`, dann `favicon.svg` von Hand anpassen.
  Bewusst kein echtes Amtsdokument nachgebaut: Land statt US-Staat, "Creative
  License" statt "Driver License". Hinweis unten rechts: "tap to flip" im Hub, "grab a corner" mit Dreh-Icon auf `/` und `/card`.
  Bekannte Ausnahme von der 12-px-Regel: Die Ausweisfelder skalieren mit der
  Kartenbreite und liegen auf dem Handy bei 8–9 px, wie auf einem echten
  Ausweis. Lighthouse Best Practices auf `/` deshalb 96 statt 100, akzeptiert.
- **Rückseite**: Was ich mache (die sechs Kategorien als Mini-Chips), E-Mail,
  Socials als Pills mit Icon und Kurzlabel (`socials[].label` in `site.ts`, z. B.
  "Main"/"Gaming" für die zwei YouTube-Kanäle; auf Karten unter 420px Breite
  per Container-Query kompakter: Label nur bei doppelt vorkommenden Netzwerken,
  kleinere Chips und Buttons, damit die Karte auf dem Handy etwa 4:3 bleibt
  statt zu einem hohen Blatt zu wachsen), Button "Save contact" → `/contact.vcf`. Zweiter Button je
  nach Kontext: auf `/` und `/card` (Prop `standalone`) "Explore the site" →
  `/hub`, im Hub-Hero "See my work" → `/projects`. Unter der Karte steht auf der
  Startseite kein weiterer Button.
- **Interaktion**: Im Hub-Hero dreht Klick/Tipp die Karte (`rotateY(180deg)`,
  `--t-slow`, `--ease-pop`, `perspective`, `backface-visibility: hidden`),
  Desktop zusätzlich leichtes Kippen mit der Mausposition (max. ±8°).
  Auf `/` und `/card` (Prop `standalone`) ist sie eine Karte in der Hand
  (`freeCard()` in `BusinessCard.astro`): Nahe einer Ecke (Radius 40 px Maus /
  56 px Touch, auch knapp ausserhalb) erscheint ein gelbes Dreh-Symbol (hängt am
  `body`, weil die Perspektive `fixed` sonst an die Karte bindet); Ziehen dreht
  frei in 3D (seitlich um die senkrechte Achse = Rückseite, hoch/runter kippt,
  0,5° pro px, Nachschwung max. 18°/Frame). Die Ecken kommen von vier
  unsichtbaren Punkten `[data-mark]` in den Kartenecken, deren Bildschirmposition
  auch gedreht stimmt; die Mitte (innerhalb der vier Punkte) verschiebt die
  Karte (`translate` auf `[data-card-move]` bzw. die Szene, Mitte bleibt 24 px im
  Bild). Doppelklick: zurück an den Platz. Kein Klick-Drehen, keine «Flip back»-
  Pille (nur per Tastatur sichtbar); Enter auf der Karte dreht sie um. Welche
  Seite vorne ist (inert): cos(rx)·cos(ry) < 0 = Rückseite.
  Klicks ohne Bewegung erreichen Links und Buttons, ein Zug schluckt den Klick.
  Passt die Seite in Ruhe ins Fenster, gibt `html.card-free` ihr `overflow: clip`.
  Reduced motion: seitlicher Zug an der Ecke überblendet zur anderen Seite.
- **Kartenspiel 01: Card Breaker** (nur `/` und `/card`): Die "01" am Ende
  der Nummer JXSI-CH-01 ist ein Button (`[data-game="1"]`, die Vorderseite ist
  dort deshalb ein `div` mit `tabindex`/`role="group"`, Enter/Space dreht um);
  ein Klick ohne Ziehen schickt `card:game` an `CardGames.astro`, das das Spiel
  im Vollbild über der Seite startet (Code erst dann per dynamischem Import aus
  `src/lib/card-games/breakout.ts`). Eigener Brick-Breaker: die Blöcke sind
  kleine Visitenkarten (auf Canvas gezeichnet: Foto als 96-px-WebP über
  `getImage`, Barcode, blauer Titel, rote Nummer, Unterschrift; Reihen in den
  Seitenfarben pastell), sie fliegen zu Beginn aus der grossen Karte heraus.
  5–10 Spalten je nach Breite, 5 Reihen ab Level 1, pro Level eine mehr (max 8)
  und 8 % schneller; Schläger mit Maus/Finger überall oder ← → (A D), Start mit
  Klick/Tipp/Leertaste/Enter, P Pause, Esc oder × beendet (Fokus zurück auf die
  01). 3 Leben (Leben weg erst, wenn der letzte Ball raus ist), höhere Reihen
  mehr Punkte, Bestwert in `localStorage` `jxsi_cardbreaker_best`. Ab der
  zweiten Wand lässt jede zerbrochene Karte zu 14 % ein Item fallen (Kapsel mit
  Symbol, mit dem Schläger fangen; Gewichte in `ITEMS`): +2 Bälle, breiter
  Schläger 15 s, TNT (nächste getroffene Karte sprengt ihre 8 Nachbarn), +1
  Leben (max. 5), langsame Bälle 8 s, alle Bälle verdoppeln (max. 12), starker
  Ball fliegt 7 s durch Karten, grosser Ball 8 s. Laufende Effekte als Chips mit
  Restzeit unter der Punktzeile; beim Fangen blendet der Name kurz ein. Unter
  560 px Breite zweizeilige Anzeige. Ändert sich die Fenstergrösse, behält die
  Wand ihre Spaltenzahl. Lokal: `window.cardBreaker` (level, take, info,
  clear) zum Testen. Reduced motion: ohne Einflug und Splitter. Texte in
  `UI.card.games`. Weitere Spiele können an andere Nummern gehängt werden.
- **Easter Egg: DVD-Bildschirmschoner** (nur `/` und `/card`): Wird die Karte
  so in eine Fensterecke gezogen, dass ihre sichtbaren Ecken (die vier
  `[data-mark]`) bis auf 14 px (Touch 22 px) in einer Ecke des Fensters sitzen,
  legt sie sich flach mit der Vorderseite nach vorn und gleitet diagonal durchs
  Fenster (Tempo 22 % der kürzeren Fensterseite pro Sekunde, mindestens 110 px/s).
  An jedem Fensterrand prallt sie ab und nimmt eine andere Seitenfarbe an
  (`--dvd`, als Pastell `color-mix` 45 % mit Weiss, damit Blau/Rot lesbar
  bleiben); trifft sie eine Ecke exakt (±4 px), dreht sie sich einmal und
  leuchtet gelb. Anfassen stoppt sie (Farbe bleibt), Doppelklick bringt sie
  heim und wieder weiss. Nicht mit reduced motion.
- **Ohne JS / reduced motion**: Beide Seiten stehen als Text im HTML; ohne JS
  wird die Rückseite unter der Vorderseite angezeigt, mit reduced motion wird
  überblendet statt gedreht.
- **Daten** kommen ausschliesslich aus `src/data/site.ts`. vCard wird daraus
  in `contact.vcf.ts` generiert (`FN`, `EMAIL`, `URL`, `NOTE`, `X-SOCIALPROFILE`).
- Der QR-Code selbst ist nicht Teil der Website (wird extern für den Druck erzeugt).

## Easter Egg: XP-Modus

Dreimal schnell (innerhalb 1,5 s) aufs Logo oben links klicken: schwarzer
Boot-Screen mit Ladebalken, dann "welcome", danach trägt die ganze Seite einen
Luna-Skin (Windows-XP-Gefühl ohne Markenzeichen): Tahoma/Trebuchet, Bliss-artiger
Verlauf als Desktop, Boxen als Fenster mit blauer Titelleiste und den drei
Knöpfen (als Hintergrund-Layer in den Rahmen gemalt, kein Markup-Eingriff),
Header als Taskleiste mit grünem Start-Knopf, Tray mit Uhr und "Exit XP mode".
Dreimal Logo oder der Tray-Knopf loggt wieder aus. Der Zustand liegt in
`localStorage` (`theme=xp`), `Head.astro` setzt `data-theme="xp"` vor dem ersten
Paint und nach jedem View-Transition-Swap. Alles dazu: `src/styles/retro.css`
(nur unter `html[data-theme='xp']` aktiv), Script in `Nav.astro`, Strings in
`UI.retro`. Die ersten zwei Klicks navigieren normal zu `/hub`, nur der dritte
wird abgefangen.

## Content-Hub

- **YouTube**: `src/lib/youtube.ts` liest beim Build den öffentlichen RSS-Feed
  `https://www.youtube.com/feeds/videos.xml?channel_id=<ID>` (kein API-Key).
  Neuestes Video auf `/hub` mit Thumbnail und Link, Embed nur nach Klick
  (Facade-Pattern, `youtube-nocookie.com`). Schlägt der Fetch fehl, darf der Build
  nicht brechen: dann kommt das Video aus `src/data/latest-video.json`, dem
  letzten Stand, den ein erfolgreicher Feed-Abruf dort gespeichert hat (Datei
  mitcommitten, wenn sie sich nach einem Build ändert). Erst ohne Fallback
  wird der Block ausgeblendet.
- **Neue Uploads ohne Rebuild**: Ein Cron-Trigger im Worker (`*/30 * * * *`,
  `scheduled()` in `worker.js`) liest denselben Feed in das Durable Object
  `VideoFeed` (Migration `v2`). Beim Ausliefern von `/hub` ersetzt der Worker
  per `HTMLRewriter` den Video-Block, wenn das gespeicherte Video neuer ist als
  das beim Build eingebackene (`data-video-published` in `LatestVideo.astro`).
  Ausgetauschte Thumbnails kommen direkt von `i.ytimg.com` (in der CSP
  erlaubt). Ist der Stand älter als 2 h, stösst auch ein Seitenaufruf einen
  Abruf an (höchstens einer pro 10 min). Kanal-ID steht doppelt: `site.ts`
  und `YOUTUBE_CHANNEL_ID` in `worker.js`. Derselbe Lauf aktualisiert die
  Videos-Zahl der Karte (siehe Visitenkarte). Lokal testen: `npm run fun:www`,
  dann `http://localhost:8787/__scheduled` aufrufen und `/hub` laden.
- **Twitch**: nur Link + optionaler Sendeplan-Text aus `site.ts`. Kein Live-Status
  (bräuchte API-Token).
- **Devlog**: Updates-Collection, RSS-Feed, Verknüpfung zu Projekten.

## Sicherheit

Die Seite ist statisch, die einzige Angriffsfläche ist die Button-API im
Worker. Stand nach dem Audit vom 2026-11-02:

- **Header** (`public/_headers`, gilt für alle Assets auf www und fun):
  strikte Content-Security-Policy (`script-src 'self'` plus die Hashes der
  Inline-Scripts, die `scripts/csp.mjs` nach jedem Build aus `dist/` berechnet
  und einsetzt; `style-src 'unsafe-inline'` wegen der `style`-Attribute;
  `frame-src` nur youtube-nocookie; `frame-ancestors 'none'`), HSTS mit
  includeSubDomains, nosniff, COOP, Permissions-Policy. Astro darf keine
  Komponenten-Scripts mehr inline schreiben (`assetsInlineLimit: 0`); taucht ein
  unerwartetes Inline-Script auf, bricht `scripts/csp.mjs` den Build ab, dann
  dessen `EXPECTED`-Liste bewusst erweitern.
- **API** (`worker.js`): POST nur mit `Origin` von www/fun (lokal localhost),
  nur `application/json`, Body maximal 512 Bytes, pro IP 240 Requests/Minute
  (429), Spieler-ID als UUID validiert, Name serverseitig auf 16 druckbare
  Zeichen reduziert, Klicks pro Request auf 50 und pro Spieler auf ~25/s
  begrenzt. Antworten `no-store`, `nosniff`, `noindex`. Keine CORS-Header:
  andere Origins können die API im Browser weder lesen noch beschreiben.
- **Durable Object**: alle SQL-Statements parametrisiert, maximal 100 000
  Spieler-Zeilen (danach werden unbekannte IDs ignoriert).
- **Client**: Alles Fremde (Namen aus der Rangliste) landet nur über
  `textContent` im DOM, nie über `innerHTML`. `localStorage` hält nur
  Theme, Spieler-ID und Namen.
- **Worker-Kontingent**: `run_worker_first: ["/*", "!/_astro/*"]`, damit die
  gehashten Assets den Worker nicht aufrufen (Free-Plan-Limit pro Tag).
- **Abhängigkeiten**: `npm audit` muss 0 Schwachstellen melden; bei Astro
  bleiben wir auf dem aktuellen Major (seit dem Audit Astro 7, Zod kommt aus
  `astro/zod`, URLs im Schema per `z.url()`).

Nicht abgedeckt, bewusst: Namen auf der Rangliste sind unmoderiert (nur
Zeichen-Whitelist); wer das braucht, hängt eine Wortliste in `cleanName` an.

## Arbeitsregeln für Claude

1. **Inhalte nie in Komponenten hartcodieren.** Texte in `src/data/ui.ts`,
   Personendaten in `src/data/site.ts`, Projekte und Updates als Markdown.
2. **Schema zuerst.** Neue Felder erst in `content.config.ts`, dann in den
   Komponenten nutzen. Optionale Felder haben Defaults im Schema.
3. **Keine neuen Abhängigkeiten ohne Grund.** Bevor ein Paket installiert wird:
   kurz begründen. Erlaubt ohne Nachfrage: `@astrojs/sitemap`, `@astrojs/rss`,
   `@fontsource/*`, `sharp`, `simple-icons` (Marken-Icons, nur zur Build-Zeit),
   `wrangler` (Dev-Dependency für `npm run fun` und `npm run deploy`),
   `spectral.js` (MIT, realistisches Farbmischen für Color Hunter).
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
