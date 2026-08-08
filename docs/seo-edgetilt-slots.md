# SEO — EdgeTilt brand landings (slots + poker)

**Goals:** rank for **edge tilt slots**, **edge tilt poker**, and related tool queries (bankroll, calculators, logbook, calendar, stable).

---

## Shipped crawlable pages

| URL | Role |
| --- | --- |
| `https://edgetilt.com/` | Homepage title/description: **EdgeTilt** + **slots** + **poker** |
| `https://edgetilt.com/slots` | Slots hub (cards linking to each tool) |
| `https://edgetilt.com/guides` | Full AP guide **title catalog** (no paywalled markdown). Regenerate: `npm run seo:guides-index` |
| `https://edgetilt.com/slots/bankroll` | Slots Bankroll Manager |
| `https://edgetilt.com/slots/calculators` | Slot EV calculators |
| `https://edgetilt.com/slots/calendar` | Offers / mailers calendar (`?tab=offers`) |
| `https://edgetilt.com/slots/logbook` | Play Logbook |
| `https://edgetilt.com/poker` | Poker tools hub |
| `https://edgetilt.com/poker/bankroll` | Poker Bankroll Manager |
| `https://edgetilt.com/poker/stable` | Poker Stable Manager |
| `https://edgetilt.com/sitemap.xml` | Lists the URLs above |
| `https://edgetilt.com/robots.txt` | Allows crawl; points at sitemap |
| `public/googleae022787114e4d27.html` | Google Search Console HTML-file verification |

Vercel rewrites (before SPA catch-all):

- `/slots` → `slots.html`
- `/slots/bankroll` → `slots-bankroll.html`
- `/slots/calculators` → `slots-calculators.html`
- `/slots/calendar` → `slots-calendar.html`
- `/slots/logbook` → `slots-logbook.html`
- `/guides` → `guides.html`
- `/poker` → `poker.html`
- `/poker/bankroll` → `poker-bankroll.html`
- `/poker/stable` → `poker-stable.html`

App deep links from CTAs: `/?tab=slots`, `/?tab=guides`, `/?tab=bankroll`, `/?tab=calculators`, `/?tab=offers`, `/?tab=logbook`, `/?tab=poker`, `/?tab=poker-bankroll`, `/?tab=poker-stable`.

Hub pages cross-link the cluster (slots ↔ guides ↔ each tool ↔ poker).

**Skipped for SEO landings:** Slots Pro Lounge (private subscriber chat).

---

## Paywalled guide text… crawlable without exposing it?

**Short answer:** Teasers yes. Full bodies no (not safely).

| Approach | Notes |
| --- | --- |
| **Public title catalog** on `/guides` | All published titles + links into `/?tab=guides&guide=:slug`. Safe. Refresh with **`npm run seo:guides-index`** after big catalog changes. |
| **Public teaser pages** (per-slug blurbs / JSON-LD) | Next step for ranking individual machine queries harder. |
| **JSON-LD paywalled content** | Future per-guide teasers with `isAccessibleForFree: false`. |
| **Googlebot-only full text** | **Don’t** (cloaking). |
| **Full markdown in public HTML** | Defeats anti-scrape / paywall. |

Keep **`content_markdown`** behind entitlements (`docs/security-anti-scrape-roadmap.md`).

---

## Google Search Console (Ryan)

1. [Search Console](https://search.google.com/search-console) → **edgetilt.com** (verified via HTML file).
2. **Sitemaps** → `https://edgetilt.com/sitemap.xml` (already submitted is fine; Google re-fetches).
3. **URL inspection** → live test + **Request indexing** for new URLs:
   - `/slots/bankroll`
   - `/slots/calculators`
   - `/slots/calendar`
   - `/slots/logbook`
   - (poker + hub URLs if not already requested)

---

## Brand mentions (ongoing)

Say **EdgeTilt** with **slots** and/or **poker** in bios and posts when natural.
