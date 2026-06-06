# Lounge market chart data (Finnhub proxy)

Server-side market search, embed build, and rolling batch quotes for Lounge feed chart cards.

## Secrets (Supabase Edge)

- **`FINNHUB_API_KEY`** — [Finnhub](https://finnhub.io/) API token (quotes + search; **US stock candles often blocked on free tier**). Non-USD listings are converted to **USD** via Finnhub **`/forex/rates`** (with **Yahoo FX** fallback when Finnhub forex is forbidden).
- Stock sparklines, quotes, profiles, and **modal news** fall back to **Yahoo Finance** (no key) when Finnhub returns empty or **403**.
- **`COINGECKO_API_KEY`** — [CoinGecko Demo API](https://docs.coingecko.com/reference/setting-up-your-api-key) key for crypto logos, **USD market cap**, and search. Works without a key at low volume; set a demo key on test/prod to avoid rate limits.
- Optional **`LOUNGE_PUBLIC_ORIGIN`** — e.g. `https://lvslotpro.com` for OG image URLs on embed attach.

## Deploy (test)

```bash
supabase functions deploy lounge-market-data --project-ref jtjgtucumuoswnbauxry
```

## Actions (POST + user JWT)

| action | body | response |
| --- | --- | --- |
| `search` | `{ query }` | `{ results[] }` — Finnhub stocks + CoinGecko crypto; **picker enrichment** via Yahoo (price/mcap/exchange) + CoinGecko batch (crypto), 45s Edge cache |
| `preview` | `{ symbol, asset_class }` | `{ preview }` picker info row |
| `attach` | `{ post_id, caption, symbols[]? }` | `{ embeds[], warnings?[] }` — merges caption `$` cashtags (auto) with picker rows; picker wins per ticker; **skips failed tickers** instead of failing the whole post |
| `batch_rolling` | `{ symbols[] }` | `{ quotes }` keyed by cache key |
| `modal_series` | `{ symbol, asset_class, kind?, window_key? }` | `{ quote, bars, window_label }` |
| `modal_news` | `{ symbol, asset_class }` | `{ news }` — Finnhub company-news (30d) or crypto feed; **Yahoo search news** when Finnhub empty/forbidden |

Client: `src/utils/loungeMarketApi.js`.

Apply migration **`20260609120000_lounge_market_embeds.sql`** before use.
