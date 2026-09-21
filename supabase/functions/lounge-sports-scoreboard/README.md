# lounge-sports-scoreboard

Logged-in Lounge in-post **game pill** + **game hub**. TheRundown day slates (scores, period lines, status) with Odds API `/scores` fallback when NFL is empty.

**Secrets (project-level, already on odds bots):** `THERUNDOWN_API_KEY`, `THE_ODDS_API_KEY`.

```bash
supabase functions deploy lounge-sports-scoreboard --project-ref kcosfvmreeiosdjdzycb
```

Client: `src/utils/loungeSportsApi.js` → `supabase.functions.invoke('lounge-sports-scoreboard')`.
