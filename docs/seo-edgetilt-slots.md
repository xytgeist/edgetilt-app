# SEO — ranking for “edge tilt slots”

**Goal:** `edgetilt.com` ranks when someone searches **edge tilt slots** (and related brand queries).

---

## Shipped crawlable pages

| URL | Role |
| --- | --- |
| `https://edgetilt.com/` | Homepage title/description include **EdgeTilt** + **slots** |
| `https://edgetilt.com/slots` | Dedicated landing for the query (static `public/slots.html`) |
| `https://edgetilt.com/guides` | Public AP guides **index** (titles/blurbs only… no paywalled markdown) |
| `https://edgetilt.com/sitemap.xml` | Lists the URLs above |
| `https://edgetilt.com/robots.txt` | Allows crawl; points at sitemap |
| `public/googleae022787114e4d27.html` | Google Search Console HTML-file verification |

Vercel rewrites `/slots` → `slots.html` and `/guides` → `guides.html` **before** the SPA catch-all.

---

## Paywalled guide text… crawlable without exposing it?

**Short answer:** You can make Google understand the *topic* without publishing full guide bodies. You cannot safely let Googlebot read the **full** paywalled markdown without that text being fetchable by someone who spoofs or scripts access.

| Approach | What Google sees | What public/scrapers see | Notes |
| --- | --- | --- | --- |
| **Public teaser pages** (titles, one-line blurbs, cards) | Indexable titles + intent | Same teasers | What `/guides` does today. Safe. |
| **JSON-LD paywalled content** (`isAccessibleForFree: false` + free `cssSelector`) | Teaser + structured “rest is paid” | Same teaser | Good for future per-guide public pages. |
| **Googlebot-only full text** (cloaking) | Full article | Paywall for users | **Don’t.** Against Google guidelines; brittle. |
| **Full markdown in HTML for everyone** | Full article | Full article | Defeats anti-scrape / paywall. |

Keep **`content_markdown`** behind `get_guide_content` / entitlements (see `docs/security-anti-scrape-roadmap.md`). SEO pages stay teaser-only.

---

## Google Search Console (Ryan)

1. Open [Google Search Console](https://search.google.com/search-console) for **`edgetilt.com`** (HTML file `googleae022787114e4d27.html` is already in `public/`).
2. Confirm the property is **Verified**.
3. **Sitemaps** → submit `https://edgetilt.com/sitemap.xml`.
4. **URL inspection** → `https://edgetilt.com/slots` → **Request indexing** (also homepage + `/guides` after deploy).
5. Watch Performance for query **`edge tilt slots`** over the next days/weeks.

---

## Brand mentions (ongoing)

Say **EdgeTilt** and **slots** in the same breath on X/Discord/Lounge bios and posts. Brand search + exact-match landing pages is how a new domain climbs a low-competition phrase.

---

## Later (not required for this query)

- Per-guide public teaser URLs with JSON-LD paywall schema
- Expanding `/guides` list from a build-time free-slug export (still no markdown)
