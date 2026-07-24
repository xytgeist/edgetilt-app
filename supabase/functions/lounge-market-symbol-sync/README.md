# Lounge market symbol sync (cron)

Daily bulk sync for cashtag lookup: Finnhub US stock list + top crypto → `market_instruments` (+ diff logos for new stocks).

**Not user-facing.** Clients use bundled seed rows + debounced `resolve_symbol` on `lounge-market-data`.

## Secrets

Same as `lounge-market-data`:

- **`FINNHUB_API_KEY`**
- **`COINGECKO_API_KEY`** (recommended)

## Deploy

```bash
supabase functions deploy lounge-market-symbol-sync --project-ref <project-ref>
```

## Schedule

Migration **`20260723280000_market_symbol_lookup_cron.sql`** added daily **09:00 UTC** pg_cron; **`20260723290000`** **disabled** it. Stock universe is already in `market_instruments`; new tickers use **`resolve_symbol`**.

Optional manual one-shot (service role):

```sql
select public.invoke_lounge_market_symbol_sync();
```

Use sparingly — prefer targeted backfills over full sync.
