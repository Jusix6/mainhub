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

Die Domain `jxsi.ch` liegt bei hosttech, die Nameserver zeigen auf Cloudflare
(`kristin.ns.cloudflare.com`, `skip.ns.cloudflare.com`). Alles Weitere steht im
Repo, nichts muss im Dashboard geklickt werden:

- `wrangler.jsonc` führt `www.jxsi.ch` und `jxsi.ch` als Custom Domains
  (`routes` mit `custom_domain: true`). Beim Deploy legt Wrangler die
  DNS-Einträge und Zertifikate an, sobald die Zone auf Cloudflare aktiv ist.
- `worker.js` leitet `jxsi.ch` per 301 auf `www.jxsi.ch` um und reicht alles
  andere an die statischen Assets weiter.

Schlägt der Deploy mit einem Hinweis auf die Zone fehl, ist `jxsi.ch` im
Dashboard noch "Pending": Site öffnen → **Check nameservers**, dann im Worker
**Retry deployment**.

**DNSSEC:** Bei hosttech muss DNSSEC ausgeschaltet bleiben, solange kein
DS-Eintrag von Cloudflare hinterlegt ist. Ein fremder DS-Eintrag macht die
Zone für prüfende Resolver ungültig und verhindert die Aktivierung bei
Cloudflare (so geschehen im September 2026). Wieder einschalten nur so:
Cloudflare → `jxsi.ch` → DNS → Settings → DNSSEC aktivieren → den dort
angezeigten DS-Eintrag bei hosttech unter "DNSSEC Einstellungen" eintragen.

`_redirects` kann den Apex-Redirect nicht: Bei Workers sind dort nur relative
Ziele erlaubt.

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
- [ ] `/contact.vcf` auf dem iPhone öffnen: Kontakte-App mit "Jusi".
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
