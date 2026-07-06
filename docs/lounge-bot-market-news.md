# Lounge bot — market news (Walter Bloomberg / Financial Juice style) (planned)

**Status:** **Code shipped (Jul 2026)** — migration `20260703140000` + `20260705020000`, Edge **`lounge-news-poll`**, portal **`/?tab=bots`**. **Persona:** **Market Edge** (`@marketedge`, slug `market-edge`). **Ryan smoke pending** on test sandbox.

**Live bot (test):** not yet created — use Bot Portal wizard or `supabase/seed/lounge_market_edge_bot.sql`.

**Ryan context (2026-07-03):** Lifetime **Benzinga Pro user subscription** ... useful for **tuning** what the bot cares about, **not** for daily manual review of every post. **Not API access.** See § Benzinga below.

---

## Self-contained workflow (no morning inbox)

```text
Allowlist poll (cron)  →  dedupe + score  →  caption template  →  auto-publish  →  feed
```

**`review_mode`:** `automatic` on `lounge_bot_accounts`. Volume target: **~3–12 posts/day** driven by scoring thresholds, not Ryan's morning pass.

**Audit:** admin **Bot ops** panel (last posts, source health, kill switch). Optional low-score rows logged but not published.

---

## Benzinga Pro subscription vs API (important)

| | **Benzinga Pro** (Ryan has this) | **Benzinga APIs** (separate product) |
| --- | --- | --- |
| What it is | Web terminal: newsfeed, squawk, scanners, chat | Licensed data feed for apps/platforms |
| API key | **No** | Yes (`licensing@benzinga.com`) |
| Automate login / scrape Pro UI | **No** ... ToS + fragile + not shippable | N/A |
| Republish full wire stories in EdgeTilt | **No** without content license | Yes, with correct API tier + embed/redistribution terms |
| Ryan uses Pro to tune watchlists / keywords | **Yes** ... product config, not daily queue |

**Bottom line:** Your lifetime Pro sub is ideal for **you as editor**, not for a **headless bot** that pulls Pro in the background. Automated ingest from Pro without an API/content deal is off the table.

### What to do with Pro anyway

Use Pro to **inform config** (which tickers, keywords, and story types score high). The bot runs on **allowlisted RSS/API/EDGAR** ... not on Pro login automation.

If you want Benzinga-quality **automated** ingest, license **Benzinga API** separately (Phase 2+).

### If you want automated Benzinga later

- Email **`licensing@benzinga.com`** ... mention EdgeTilt, editorial review before publish, volume (~5–15 posts/day max), existing Pro customer.
- Ask about: **Stock News API**, **Why Is It Moving**, **Free Stock News RSS** tier (if any), trial key, redistribution/embed rights for Lounge captions + link to Benzinga URL (not full body copy).
- They price APIs separately; lifetime Pro may help relationship but does **not** unlock API by default (Benzinga support has stated this publicly on reviews/FAQ).

**Do not** build a scraper against `pro.benzinga.com` using your login.

---

## Default allowlist (shipped)

Migration **`20260705040000`**. Headline rewrite + source link only ... no full-body republish.

| Source | Kind | Poll interval | Role |
| --- | --- | --- | --- |
| Finnhub general | `finnhub_general` | 3 min | Broad market headlines |
| Finnhub M&A | `finnhub_category` | 5 min | Deals, takeovers |
| Finnhub forex | `finnhub_category` | 5 min | Macro / FX |
| Finnhub crypto | `finnhub_category` | 5 min | Digital assets, crypto regs |
| **SEC EDGAR 10-Q** | `edgar` | 10 min | Quarterly filings |
| **SEC EDGAR 10-K** | `edgar` | 15 min | Annual filings |
| **SEC press releases** | `rss` | 5 min | Enforcement, rule proposals |
| **Federal Reserve press** | `rss` | 5 min | FOMC, Fed speakers, policy |
| **US Treasury press** | `rss` | 7 min | Fiscal, debt ceiling, sanctions |
| **CFTC press releases** | `rss` | 7 min | Derivatives / crypto enforcement |
| **EIA Today in Energy** | `rss` | 10 min | Oil, gas, energy macro |
| **BBC Business** | `rss` | 5 min | Geopolitical / global business *(link out)* |
| **NPR Business** | `rss` | 7 min | US business / economy *(link out)* |

**SEC requirement:** set Edge secret **`SEC_EDGAR_USER_AGENT`** (e.g. `EdgeTilt MarketEdge/1.0 (support@edgetilt.com)`). Defaults if unset.

**Also required:** **`FINNHUB_API_KEY`** (same key as Lounge market charts).

Toggle any source off in **`/?tab=bots`** without removing the row.

---

## Automated ingest (self-contained)

| Source | Shipped? | Notes |
| --- | --- | --- |
| **Finnhub** categories | Yes | general, merger, forex, crypto |
| **SEC EDGAR** Atom | Yes | 10-Q, 10-K current filings (8-K disabled Jul 2026 — routine noise) |
| **Gov/reg RSS** | Yes | SEC, Fed, Treasury, CFTC, EIA |
| **Publisher RSS** | Yes | BBC Business, NPR Business (headline + link) |
| **Benzinga API** | No | Requires license |
| **Options flow** | No | Phase 2 vendor |

Reuse **`market_embeds`** / `$TICKER` in caption ... ties to existing Lounge market chart modal.

---

## Bot concept — Market Edge

**Style:** Clean, fast, neutral-to-sharp with dry humor **sparingly**. Walter Bloomberg + Financial Juice mix.

**Core focus (topic-tier scoring, not a ticker watchlist):**

| Tier | What publishes |
| --- | --- |
| **Economic data** | CPI, PPI, jobs, GDP, retail sales, PMI, claims, housing, sentiment |
| **Fed / central banks** | FOMC, Powell, ECB, BOJ, rate cuts/hikes, Treasury, yield curve |
| **Earnings & guidance** | Beats/misses, outlook cuts/raises, pre/after-market prints |
| **Geopolitical** | Sanctions, conflict headlines, trade war, supply disruption |
| **Regulatory** | SEC, DOJ, CFTC, antitrust, crypto regulation, tariffs, FDA market movers |
| **M&A / distress / activist** | Mergers, bankruptcies, Chapter 11, activist stakes, IPOs |
| **Commodities** | Oil/WTI/Brent, OPEC, gold, copper, nat gas, grain shocks |
| **Crypto / risk assets** | BTC, ETH, stablecoin, ETF flows, exchange/reg headlines |
| **Options flow** | Unusual activity, whale blocks *(when sourced — not in v1)* |
| **Macro risk** | Inflation, recession, VIX, credit spreads, fiscal/stimulus |

Stories **without** a topic-tier match stay **below** the default publish threshold (~55). Optional portal tickers add company feeds + a **small** nudge only.

**Ingest v1:** Finnhub + **SEC EDGAR** + **allowlisted RSS** (see table above). Topic-tier score gates publish volume.

---

## Bot persona (Market Edge)

**One Edge profile** for market/finance wire ... broad timely finance (equities, macro, earnings, rates, major `$TICKER` moves).

| Field | Value |
| --- | --- |
| **Handle** | `@marketedge` |
| **Display name** | Market Edge |
| **Bio** | 24/7 Breaking News headlines for professional day traders. |
| **Slug** | `market-edge` |
| **`pipeline`** | `market_news` |
| **`review_mode`** | `automatic` |
| **Audience** | Public (all feed posts) |
| **Category pills** | `stocks`, `trading` |

Volume: **~3–12 posts/day** when scoring thresholds fire ... tunable via config, not a daily Ryan review pass.

---

## Example captions (Market Edge voice)

**Macro:**  
`CPI hotter than expected. $SPY -0.6% on the print. Core sticky ... rate-cut bets pushed out.`

**Fed:**  
`Powell: inflation progress "uneven." $QQQ fades from highs; 2Y yield ticks up.`

**Geopolitical:**  
`Oil +3% on Middle East supply headlines. Energy leads S&P; airlines lag.`

**Earnings:**  
`$NVDA beats on data-center revenue. Guides Q3 above Street. Stock +8% after hours.`

**M&A / distress:**  
`$XYZ files Chapter 11. Creditors take equity; equity wiped at open.`

**Commodities:**  
`WTI breaks $85 on inventory draw. Refiners rally; airlines under pressure.`

**Regulatory:**  
`SEC charges crypto exchange. $BTC -2% in 15 minutes; altcoins wider.`

Always **rewrite** ... do not paste licensed wire text verbatim unless API contract allows full embed.

---

## Phased rollout

| Phase | Ingest | Benzinga role |
| --- | --- | --- |
| **0** | Finnhub + EDGAR + gov/publisher RSS on **test** | Pro = tune keyword tiers |
| **1** | Title clustering + economic calendar hooks | Pro = tune thresholds |
| **2** | Benzinga API (if licensed) + options-flow source | Higher signal wire |

---

## Legal / product

- Informational not investment advice (profile + optional post footer during legal review).
- Redistribution: headline-only + link safer than full article body.
- **`profiles.is_bot`** for staff when persona goes live.

---

## Repo touchpoints (when building)

| Piece | Location |
| --- | --- |
| Schema | `supabase/migrations/20260703140000_lounge_bot_financial_wire.sql` |
| Poll fn | `supabase/functions/lounge-news-poll/` |
| Scoring | `supabase/functions/_shared/loungeBotNewsScore.ts` |
| Captions | `supabase/functions/_shared/loungeBotNewsCaption.ts` — wire voice; first-person headlines reframed with source attribution |
| Publish | `supabase/functions/_shared/loungeBotPublish.ts` — source link + preview on every post; rich card only when og:image loads |
| Admin UI | `src/features/ops/EdgeMonitorBotOpsPanel.jsx` |
| Finnhub (existing) | `supabase/functions/_shared/finnhubMarket.ts` |

---

## Open questions

- [ ] Contact Benzinga licensing worth it at current volume?
- [ ] Financial wire handle + avatar (one dedicated account)
- [ ] Ticker/keyword scoring weights for **general** finance vs niche sectors
- [ ] Link preview to Benzinga article URL vs Finnhub source URL?

---

## "All-internet scraper" vs mini-Benzinga (2026-07-03)

Ryan asked about scraping the open web to build a mini-Benzinga for near-real-time Lounge posts.

### Do not build a general web scraper

| Problem | Why it kills the project |
| --- | --- |
| **Copyright** | Headlines and ledes are protected; republishing in a feed is redistribution, not fair use at scale |
| **ToS** | Reuters, Bloomberg.com, WSJ, CNBC, etc. prohibit automated scraping in practice |
| **Robots / CF** | Blocks, CAPTCHAs, IP bans; breaks weekly |
| **Quality** | 95% SEO spam, duplicate syndication, old articles resurfacing |
| **Latency lie** | "Scrape everything" is slower and noisier than 5 good licensed/RSS sources |
| **Product risk** | EdgeTilt is a real business ... one DMCA or partner issue is not worth it |

**Walter Bloomberg / Financial Juice are not scraping the whole internet.** They (or their backends) use **curated inputs + fast human or licensed wire + rewrite**. Your equivalent is **allowlisted sources + normalize + dedupe + queue**, not `curl google.com`.

### What "mini-Benzinga" actually means in architecture

A **multi-source news aggregator** with:

```text
Allowlisted sources (RSS/API/EDGAR)
        ↓
Ingest workers (poll 1–3 min)
        ↓
Normalize → dedupe → score → map tickers
        ↓
Caption template (original wording)
        ↓
Auto-publish → community_feed_posts
```

Near-real-time = **poll interval + scoring**, not scraping 10,000 domains.

### Layer 1 — Source allowlist (only these, ever)

| Tier | Source type | Examples | Redistribution |
| --- | --- | --- | --- |
| **A — APIs you pay for** | REST/stream | Benzinga API (if licensed), Finnhub, Polygon/Alpaca news | Per contract; store `source_url` + headline rules |
| **B — Public official** | Structured feeds | **SEC EDGAR** (8-K, 10-Q), **FDA** calendar, company **IR RSS** | Public filings; still write your own caption |
| **C — Publisher RSS** | Atom/RSS where permitted | PR Newswire/Business Wire **if** RSS ToS allows app use (verify each) | Usually link + short summary only |
| **D — Manual override** | Human | Admin paste one-off post (rare) | Ryan's words |

**Never tier E:** arbitrary HTML scrape of news sites.

Start with **~15–30 allowlisted feeds**, not the whole internet. Expand only after legal review per source.

### Layer 2 — Ingest (Supabase Edge + cron)

**Table: `lounge_news_sources`**

- `id`, `name`, `kind` (`rss` | `api` | `edgar` | `manual`)
- `poll_url` or `api_config` jsonb
- `poll_interval_sec` (60–180)
- `enabled`, `last_polled_at`, `last_cursor` (etag, `updatedSince`, filing accession)

**Table: `lounge_news_raw_items`**

- `source_id`, `external_id`, `fetched_at`, `published_at`
- `title`, `summary`, `url`, `tickers[]`, `raw jsonb`
- `content_hash` (dedupe)
- Unique `(source_id, external_id)`

**Edge fn: `lounge-news-poll`** (every 1–3 min via cron or external scheduler)

1. For each enabled source, fetch with cursor.
2. Parse RSS/API/EDGAR → normalized row.
3. Skip if hash/URL seen in last 7 days.
4. Extract tickers (regex `$TICKER`, NLP, or API fields).
5. Score (see below); if above **`publish_threshold`** → generate caption → **insert `community_feed_posts`** (or schedule + publish worker within seconds).

Reuse Finnhub paths in `finnhubMarket.ts` for tier-A stock news before adding new vendors.

### Layer 3 — Dedupe and "one story" clustering

Same story hits 8 outlets in 10 minutes. Mini-Benzinga shows **one** item.

- Normalize title (lowercase, strip punctuation, remove "BREAKING")
- **SimHash** or embedding distance on title + tickers
- Cluster within 30–60 min window; keep highest-tier source as canonical
- Queue one draft per cluster

### Layer 4 — Scoring (what gets published)

| Signal | Weight |
| --- | --- |
| Ticker in broad market watchlist (`$SPY`, mega-cap, hot movers) | High |
| Keywords: earnings, CPI, Fed, M&A, guidance | High |
| Casino-only tickers (`$LVS`) | Medium ... include when newsworthy, not the bot's sole focus |
| Source tier A/B | Medium |
| Duplicate cluster | Penalize |
| Opinion/blog domains | Drop |

Output: **~3–12 published posts/day** at default thresholds ... tune in admin config.

### Layer 5 — Caption generation (not copy-paste)

Template or LLM with **hard rules**:

- Max 500 chars; **original wording**
- Lead with `$TICKER` + fact; optional "via {source}" link in preview
- **Never** paste full wire body unless API license explicitly allows embed

### Layer 6 — Near-real-time publish

Poll every **1–3 min**. Stories above threshold publish within the same worker run (or next **`lounge-bot-publish-due`** tick). Admin can set **max posts/hour** and **quiet hours** without reintroducing a morning inbox.

### Cost ballpark (legitimate stack)

| Piece | Rough cost |
| --- | --- |
| Finnhub news (existing) | Free tier → paid at scale |
| Benzinga API | Sales quote; separate from Pro |
| Polygon/Alpaca news | ~$29–199/mo tiers |
| SEC EDGAR | Free |
| RSS-only v1 | $0 + eng time |
| LLM rewrite batch | Few dollars/day at your volume |

Cheaper and safer than fighting Cloudflare on WSJ.

### Practical build order

1. **Allowlist + RSS/EDGAR poll** → raw table → dedupe → auto-publish on test.
2. **Finnhub** watchlist tickers → same pipeline (reuse `lounge-market-data`).
3. **Scoring + clustering** → tune thresholds in admin.
4. **Edge Monitor Bot ops** ... health, last post, config (not editorial inbox).
5. **License one wire** (Benzinga or Polygon) if RSS is too slow/noisy.
6. **Never** add generic HTML scraper.

**Roster note:** Casino stock headlines (`$MGM`, `$DKNG`) can appear on this **financial wire** account when market-relevant. **Poker**, **crypto**, and **slots/AP** content belongs on **separate X-tracker Edge accounts**, not here.

### If you still want "more coverage"

Add **more allowlisted RSS/API endpoints**, not a scraper. Benzinga itself aggregates **licensed** relationships, not random blogs.

---

_Ryan clarification 2026-07-03: Benzinga Pro = user sub, not API. Financial wire bot is self-contained; Benzinga Pro helps tune config. X bots use editorial queue only._
