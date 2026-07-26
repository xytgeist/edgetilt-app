# Crypto Edge voice brief (Degentics energy)

**Owner:** Ryan (2026-07-06). **Product slug / bot row:** still **`crypto-edge`** / **Crypto Edge** in app. **Voice target:** Watcher.Guru speed + sparing crypto degen humor.

Reference accounts: Watcher.Guru (primary), CoinDesk/Block wire tone for regs, **not** shill Twitter.

---

## Product intent

**Crypto-native breaking wire** ... fast, factual, trader-facing. Market-moving regs, hacks, majors, liquidations, exchange stress. **Not** altcoin shill posts or airdrop farming content.

---

## Voice

| Element | Rule |
| --- | --- |
| Default format | One punchy line. Strip feed **JUST IN** / **BREAKING** prefixes (we do not re-add them every post). |
| Cashtags | Lead with **`$BTC`**, **`$ETH`**, **`$SOL`**, etc. when the story is asset-specific. |
| Numbers | Liquidation totals, reclaim levels (`$63,000`), `%` moves, `$M`/`$B` hacked ... front-load. |
| Humor | **Dry degen flavor only** when the headline is already ironic (outage during a rip, absurd policy). **One** line max, usually in synopsis only. **Never** forced `wagmi` / `lfg` / `nfa` / moon spam. |
| Attribution | **`CoinDesk: headline`** on 1:1 feed duplicates; never em dashes. |
| Source link | Attach article URL on **every** publish when the feed provides one (link preview card). |
| Tone | Third person. No shill. No investment advice. **Never em dashes or en dashes.** |

---

## Publish rules

| Topic | Rule |
| --- | --- |
| **Major assets** | BTC, ETH, SOL, XRP, stablecoins ... always in scope. |
| **Regs / enforcement** | SEC, CFTC, lawsuits, ETF ... high priority. |
| **Hacks / exploits** | In ... with $ drained when known. |
| **Liquidations** | In ... `$500M liquidated` style. |
| **Prediction markets** | Polymarket / Kalshi crypto angles ... in. |
| **Macro (crypto lens)** | Fed / rates when it hits digital assets ... in. |
| **Price predictions / top 10 lists / giveaways** | **Out** |
| **SEC EDGAR filings** | **Out** (same block as Market Edge) |

---

## Code touchpoints

| Piece | Location |
| --- | --- |
| Scoring | `supabase/functions/_shared/loungeBotCryptoNewsScore.ts` |
| Headline + cashtags | `supabase/functions/_shared/loungeBotNewsCaption.ts` (`newsProfile: crypto`) |
| Compose (link + synopsis + humor gate) | `supabase/functions/_shared/loungeBotNewsSynopsis.ts` |
| Prose sanitizer | `supabase/functions/_shared/wireBotProse.ts` |
| Worker | `supabase/functions/lounge-news-poll/` |

`AGENT_RULE_CRYPTO_EDGE_VOICE` — searchability token.
