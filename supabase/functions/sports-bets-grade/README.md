# sports-bets-grade

JWT Edge Function. Grades the caller's open **`sports_bets`** (spread / h2h / total) against ESPN completed scoreboards. Props / `other` stay manual.

Also runs for **all users** from **`lounge-odds-poll`** action **`grade_picks`** (existing cron).

## Invoke

```bash
# as signed-in user (client does this on Bet Tracker load/refresh)
supabase functions invoke sports-bets-grade --project-ref <ref>
```

## Deploy

```bash
npx supabase functions deploy sports-bets-grade --project-ref kcosfvmreeiosdjdzycb
# prod only when Ryan asks:
# npx supabase functions deploy sports-bets-grade --project-ref jtjgtucumuoswnbauxry
```

Redeploy **`lounge-odds-poll`** after `_shared/sportsBetsGrade.ts` changes.
