# Lounge bot — Crypto Edge (crypto wire)

**Status:** **Code shipped (Jul 2026)** — migration `20260705050000`, reuses Edge **`lounge-news-poll`** + same pg_cron as Market Edge. **Persona:** **Crypto Edge** (`@cryptoedge`, slug `crypto-edge`). **Ryan smoke pending** on test sandbox.

**Live bot (test):** not yet created — use Bot Portal wizard (**Crypto Edge** preset) or `supabase/seed/lounge_crypto_edge_bot.sql`.

---

## Self-contained workflow

Same pipeline as Market Edge (`market_news`), different profile:

```text
config.news_profile = crypto  →  crypto allowlist  →  crypto topic scoring  →  auto-publish
```

Cron **`invoke_lounge_news_poll()`** already loops **every** running `market_news` bot by slug ... Crypto Edge is a second row, same worker.

---

## Default allowlist (tier 1 + tier 2)

Migration **`20260705050000`**. Headline rewrite + source link on every publish; rich preview only when og:image loads; first-person publisher headlines reframed (e.g. CNBC "we're watching" → attributed third person).

### Tier 1

| Source | Kind | Poll interval | Role |
| --- | --- | --- | --- |
| Finnhub crypto | `finnhub_category` | 3 min | Broad crypto headlines |
| CoinDesk | `rss` | 3 min | Industry wire |
| The Block | `rss` | 4 min | Research / institutional |
| Decrypt | `rss` | 5 min | Consumer + policy |
| CFTC press releases | `rss` | 7 min | Derivatives / enforcement |
| SEC press releases | `rss` | 5 min | Digital asset enforcement |

### Tier 2

| Source | Kind | Poll interval | Role |
| --- | --- | --- | --- |
| Bitcoin Magazine | `rss` | 10 min | BTC-focused |
| CryptoSlate | `rss` | 7 min | Alt coverage |
| CoinTelegraph | `rss` | 7 min | Global wire |
| Federal Reserve press | `rss` | 7 min | Macro overlap (rates, liquidity) |

**Not included:** Market Edge EDGAR, BBC/NPR, Treasury, EIA ... crypto bot stays crypto-specific.

**Secrets:** **`FINNHUB_API_KEY`** (required). SEC RSS uses same User-Agent as EDGAR when hitting `sec.gov` URLs.

---

## Scoring (`loungeBotCryptoNewsScore.ts`)

Topic tiers (first match per tier):

| Tier | Weight | Examples |
| --- | --- | --- |
| Regulatory / enforcement | 16 | SEC, CFTC, lawsuit, settlement |
| ETF approval | 15 | spot BTC/ETH ETF, BlackRock, Grayscale |
| Exchange / custody | 14 | Coinbase, Binance, withdrawals frozen |
| Hack / exploit | 14 | bridge exploit, drained, rug pull |
| Major assets | 13 | Bitcoin, ETH, SOL, XRP |
| DeFi / protocol | 12 | TVL, liquidations, funding rate |
| Stablecoin | 11 | USDT, USDC, depeg |
| Mining / halving | 10 | hashrate, halving |
| Macro (crypto lens) | 10 | Fed, rates, liquidity |
| Funding / market | 8 | raises, token sale |

Default publish threshold: **55** (same as Market Edge). Drops list filters giveaways, price predictions, sponsored fluff.

---

## Portal setup

1. **`/?tab=bots`** → Create bot → **Crypto Edge (crypto wire)**
2. Starts **Stopped** — dry-run **Poll now** with `force: true`
3. Set **Running** on test only; keep prod **Stopped** until sign-off

`config` shape:

```json
{
  "news_profile": "crypto",
  "watchlist_tickers": []
}
```

Optional watchlist adds Finnhub company feeds + small score nudge (e.g. `COIN`, `MSTR`).

---

## SQL helpers

```sql
select public.lounge_bot_seed_crypto_news_sources('<BOT_USER_UUID>'::uuid);
-- or profile-aware:
select public.lounge_bot_seed_market_news_sources('<BOT_USER_UUID>'::uuid);
```

Edge poll (admin JWT or service role):

```json
{ "slug": "crypto-edge", "dryRun": true, "force": true }
```

---

## Related docs

- Market Edge (financial wire): **`docs/lounge-bot-market-news.md`**
- Bot portal: **`docs/frontend-architecture.md`** → bots row
- Test smoke: **`docs/test-buildout-backlog.md`** → Lounge bots / Market Edge section
