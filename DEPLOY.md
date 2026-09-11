# Deploy auf Cloudflare Pages

Die Seite ist rein statisch (`dist/`). Zwei Wege, beide gratis. Weg A ist der
Standard: jeder Push auf `main` deployt automatisch. Weg B braucht kein
GitHub und eignet sich für einen schnellen ersten Test.

## Voraussetzungen (einmalig)

- Cloudflare-Account: https://dash.cloudflare.com
- Domain `jxsi.ch` bei Cloudflare registriert oder mit Nameservern auf
  Cloudflare gezeigt (nötig für Custom Domains und den Apex-Redirect).
- Vor dem ersten Deploy in `src/data/site.ts` die Platzhalter ersetzen:
  E-Mail, Social-URLs, YouTube-Channel-ID. Danach `npm run build` prüfen.

## Weg A: GitHub + Cloudflare Pages (empfohlen)

1. Leeres Repository auf GitHub anlegen, z. B. `mainhub`, ohne README.
2. Lokal verbinden und pushen:

   ```bash
   git remote add origin git@github.com:<dein-user>/mainhub.git
   git push -u origin main
   ```

3. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → Repository `mainhub` wählen.
4. Build-Einstellungen:

   | Feld                   | Wert            |
   |------------------------|-----------------|
   | Framework preset       | Astro           |
   | Build command          | `npm run build` |
   | Build output directory | `dist`          |
   | Root directory         | `/`             |

   Die Node-Version liest Cloudflare aus `.node-version` (24). Falls der
   Build trotzdem mit altem Node startet, Umgebungsvariable
   `NODE_VERSION = 24` setzen.
5. **Save and Deploy**. Erster Build dauert etwa eine Minute. Die Seite ist
   danach unter `https://mainhub-xxx.pages.dev` erreichbar.
6. **Custom domains** im Pages-Projekt: zuerst `www.jxsi.ch`, dann `jxsi.ch`
   hinzufügen. Cloudflare legt die DNS-Einträge selbst an.
7. Der Redirect von `jxsi.ch` auf `www.jxsi.ch` kommt aus `public/_redirects`
   und greift, sobald beide Domains am Projekt hängen.

Ab jetzt: `git push` = Deploy. Pull Requests bekommen automatisch eine
Vorschau-URL.

## Weg B: Direkter Upload mit Wrangler

Ohne GitHub, direkt vom Rechner:

```bash
npx wrangler@4 login
```

Öffnet den Browser für die Cloudflare-Anmeldung (einmalig). Danach:

```bash
npm run deploy
```

Das baut die Seite und lädt `dist/` ins Pages-Projekt `mainhub` hoch. Beim
ersten Mal fragt Wrangler, ob das Projekt angelegt werden soll: Ja,
Production branch `main`. Custom Domains wie in Weg A, Schritt 6.

## Nach dem ersten Deploy prüfen

- [ ] `https://www.jxsi.ch/` lädt, Karte dreht sich, Nav funktioniert.
- [ ] `https://jxsi.ch/projects` leitet auf `https://www.jxsi.ch/projects` um.
- [ ] `https://www.jxsi.ch/robots.txt` zeigt die Sitemap-URL,
      `https://www.jxsi.ch/sitemap-index.xml` listet alle Seiten.
- [ ] `https://www.jxsi.ch/contact.vcf` auf dem iPhone öffnen: muss die
      Kontakte-App mit "Justin" öffnen.
- [ ] `https://www.jxsi.ch/card?src=print` zeigt die Karte mit Gruss.
- [ ] Vorschau-Bild testen: Link in einen Chat (WhatsApp, Discord) einfügen
      oder https://www.opengraph.xyz mit der URL füttern. Es muss die gelbe
      Karte erscheinen, auf Projektseiten das Cover.
- [ ] Lighthouse auf der Live-URL, Mobile: alle Kategorien ≥ 95.

## QR-Code für die gedruckte Karte

Ziel-URL: `https://www.jxsi.ch/card?src=print`

Den QR-Code mit hoher Fehlerkorrektur (Level H) erzeugen, damit er auch auf
kleinen Karten und bei Verschmutzung lesbar bleibt. Vor dem Druck mit zwei
verschiedenen Handys scannen. Die URL kann später ohne Neudruck auf eine
andere Seite umgeleitet werden, weil sie auf der Website liegt.

## Später: Statistik

Falls gewünscht: im Pages-Projekt unter **Web Analytics** aktivieren. Das ist
Cloudflares cookiefreie Statistik und ergänzt automatisch ein kleines Script.
Die Seite selbst enthält bewusst kein Tracking.
