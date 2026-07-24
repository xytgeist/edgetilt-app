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

Migration **`20260723280000_market_symbol_lookup_cron.sql`** — daily **09:00 UTC** via pg_cron.

Vault (reuse lounge odds cron secrets):

- `lounge_odds_poll_project_url`
- `lounge_odds_poll_service_role_key`

## Manual smoke

```sql
select public.invoke_lounge_market_symbol_sync();
```

Check `market_symbol_lookup_meta.row_count` and Edge logs. First run may take several minutes.
