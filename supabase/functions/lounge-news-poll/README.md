# lounge-news-poll

Market Edge + Crypto Edge news worker: polls allowlisted Finnhub, SEC EDGAR, and RSS sources; scores headlines; auto-publishes to Lounge.

Uses `config.news_profile` (`market` | `crypto`) to pick source allowlist and scoring tiers.

## Auth

- **Cron:** `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`
- **Manual (Edge Monitor / Bot Portal):** admin user JWT

## Edge secrets

| Secret | Required | Purpose |
| --- | --- | --- |
| `FINNHUB_API_KEY` | Yes | Finnhub news categories |
| `OPENAI_API_KEY` | Yes | 1-2 sentence post synopsis (falls back to feed excerpt if unset) |
| `OPENAI_CHAT_MODEL` | Optional | Default `gpt-4o-mini` |
| `SEC_EDGAR_USER_AGENT` | Recommended | SEC fair-access policy (defaults to `EdgeTilt MarketEdge/1.0 (support@edgetilt.com)`) |

## Setup (test, then prod schema)

1. Apply migrations `20260703140000` through `20260705050000`.
2. Create bot via **Bot Portal** wizard or seed SQL (`lounge_market_edge_bot.sql` / `lounge_crypto_edge_bot.sql`).
3. `select public.lounge_bot_seed_market_news_sources('<BOT_USER_UUID>'::uuid);` (routes by `news_profile`).
4. Deploy `lounge-news-poll` + `lounge-bot-admin`.
5. Vault: `lounge_odds_poll_project_url` + `lounge_odds_poll_service_role_key` (cron).
6. Dry-run poll from portal → flip **Running** on **test** only until smoke passes.

## Default sources

- **Market Edge:** Finnhub (general, M&A, forex … **not** crypto category), gov RSS, BBC/NPR / Yahoo / MarketWatch — `docs/lounge-bot-market-news.md`. Crypto firehose + cross-bot near-dupe → Crypto Edge.
- **Crypto Edge:** Finnhub crypto + CoinDesk/Block/Decrypt + tier 2 publishers + SEC/CFTC/Fed — `docs/lounge-bot-crypto-news.md`

## Body

```json
{ "slug": "market-edge", "dryRun": false, "force": true }
```

```json
{ "slug": "crypto-edge", "dryRun": true, "force": true }
```

## Cron

`lounge_news_poll_market_edge` every 3 minutes via `invoke_lounge_news_poll()` (all running `market_news` bots by slug).
