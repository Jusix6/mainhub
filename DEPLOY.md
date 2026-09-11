# Deploy auf Cloudflare Workers (statische Assets)

Die Seite ist rein statisch (`dist/`) und läuft als Cloudflare Worker mit
Static Assets. Das ist Cloudflares aktueller Standardweg (Pages geht darin
auf). Es gibt keinen Server-Code, `wrangler.jsonc` beschreibt nur das
Asset-Verzeichnis.

Das Projekt ist per Git-Integration mit `Jusix6/mainhub` verbunden:
**jeder Push auf `main` deployt automatisch.**

## Einstellungen im Cloudflare-Dashboard

Workers & Pages → Worker `mainhub` → **Settings** → **Build**:

| Feld             | Wert                 |
|------------------|----------------------|
| Build command    | `npm run build`      |
| Deploy command   | `npx wrangler deploy`|
| Root directory   | `/`                  |

Die Node-Version liest Cloudflare aus `.node-version` (24). Der Worker-Name
in `wrangler.jsonc` (`mainhub`) muss mit dem Namen im Dashboard übereinstimmen.

## Domain

1. `jxsi.ch` bei Cloudflare registrieren oder die Nameserver auf Cloudflare
   zeigen lassen.
2. Worker `mainhub` → **Settings** → **Domains & Routes** → **Add** →
   **Custom domain** → `www.jxsi.ch`. Cloudflare legt den DNS-Eintrag an.
3. Apex-Redirect `jxsi.ch` → `www.jxsi.ch`: In der Zone `jxsi.ch` unter
   **Rules** → **Redirect Rules** → **Create rule**:
   - Wenn: Hostname equals `jxsi.ch`
   - Dann: Dynamic redirect, Ausdruck
     `concat("https://www.jxsi.ch", http.request.uri.path)`, Status 301,
     "Preserve query string" an.
   Damit der Apex überhaupt antwortet, braucht `jxsi.ch` einen DNS-Eintrag mit
   Proxy (orange Wolke), z. B. `A jxsi.ch 192.0.2.1` als Platzhalter.

   `_redirects` kann das nicht: Bei Workers sind dort nur relative Ziele erlaubt.

## Ohne Git deployen (Notfall oder Test)

```bash
npx wrangler@4 login
npm run deploy
```

Baut lokal und lädt `dist/` in denselben Worker hoch.

## Vor dem ersten "richtigen" Deploy

In `src/data/site.ts` die Platzhalter ersetzen: E-Mail, Social-URLs,
YouTube-Channel-ID. Danach `npm run build` lokal prüfen und pushen.

## Nach dem Deploy prüfen

- [ ] Worker-URL (`mainhub.<subdomain>.workers.dev`) lädt, Karte dreht sich,
      Nav funktioniert, `/card.html` leitet auf `/card` um.
- [ ] `/robots.txt` zeigt die Sitemap-URL, `/sitemap-index.xml` listet alle Seiten.
- [ ] `/contact.vcf` auf dem iPhone öffnen: Kontakte-App mit "Justin".
- [ ] `/card?src=print` zeigt die Karte mit Gruss.
- [ ] Unbekannte URL liefert die 404-Seite mit Status 404.
- [ ] Nach Domain-Setup: `https://jxsi.ch/projects` → `https://www.jxsi.ch/projects`.
- [ ] Vorschau-Bild: Link in WhatsApp oder Discord einfügen oder
      https://www.opengraph.xyz nutzen. Gelbe Karte, auf Projektseiten das Cover.
- [ ] Lighthouse auf der Live-URL, Mobile: alle Kategorien ≥ 95.

## QR-Code für die gedruckte Karte

Ziel-URL: `https://www.jxsi.ch/card?src=print`

Fehlerkorrektur Level H, vor dem Druck mit zwei Handys scannen. Die URL kann
später ohne Neudruck umgeleitet werden, weil sie auf der Website liegt.

## Später: Statistik

Worker → **Observability** oder Cloudflare Web Analytics für die Zone. Beides
cookiefrei. Die Seite selbst enthält bewusst kein Tracking.
