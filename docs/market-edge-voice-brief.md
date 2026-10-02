# Market Edge voice brief

**Owner:** Ryan (2026-07-06). Reference accounts: Financial Juice, DeItaone (Walter Bloomberg), unusual_whales, Watcher.Guru (crypto urgency only).

---

## Product intent

**General market wire** ... fast, factual, terminal-style. **Not** an SEC filing ticker or company filing bot.

---

## Voice

| Element | Rule |
| --- | --- |
| Default format | One tight line (Financial Juice). No forced "JUST IN" prefix. |
| Extra context | DeItaone-style: headline + 0-2 sentences only when needed (compose step decides). |
| Tickers | `$AAPL`, `$MU` when company-specific. |
| Numbers | Lead with `$`, `%`, PMI, bps, auction yields when present. |
| Attribution | **`CoinDesk: headline`** when post repeats the feed headline 1:1; `, per Source.` only when reframing publisher voice |
| Tone | Third person. No publisher "we/our". No investment advice. **Never em dashes or en dashes** ... commas or ` ... ` only. |

---

## Publish rules (Ryan sign-off 2026-07-06)

| Topic | Rule |
| --- | --- |
| **SEC EDGAR filings** | **Never** (8-K, 10-Q, 10-K, any filing notice). |
| **Crypto** | **Sometimes** on Market Edge ... **major stories only** (ETF/regulation, large liquidations, milestone prices, custody/policy). Finnhub crypto firehose + routine wire → **Crypto Edge / Degentics**. Near-dupe skips stories Degentics already posted. |
| **Trump / political quotes** | **Only when market-linked** (tariffs, stocks, Fed, trade, oil, semis, etc.). Generic political quotes → skip. |
| **Data prints** | **In** ... CPI, ISM, bill/ note auctions, CFTC positioning, SPR inventory, etc. |
| **Sports + prediction markets** | **In** ... Polymarket, Kalshi, odds tied to macro/market angles. |

---

## Skip list (examples from reference curation)

- IPO underwriter laundry lists
- Local party politics
- Live stream schedules ("WATCH LIVE")
- Routine SEC filing headlines
- Engagement listicles (unless explicitly wanted later)

---

## Code touchpoints

| Piece | Location |
| --- | --- |
| Scoring / blocks | `supabase/functions/_shared/loungeBotNewsScore.ts` |
| Compose (link + synopsis) | `supabase/functions/_shared/loungeBotNewsSynopsis.ts` |
| Caption / headline | `supabase/functions/_shared/loungeBotNewsCaption.ts` |
| Source allowlist | `supabase/functions/_shared/loungeBotMarketNewsDefaults.ts` |
| EDGAR disabled | `20260706120000` (8-K), `20260706130000` (all edgar) |

`AGENT_RULE_MARKET_EDGE_VOICE` — searchability token.
