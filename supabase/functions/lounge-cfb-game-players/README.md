# lounge-cfb-game-players

Logged-in Lounge **CFB game hub Players** tab. Reads **`cfb_players`** for the two team abbrevs. No Fantasy / Sleeper / Kalshi.

```bash
supabase functions deploy lounge-cfb-game-players --project-ref kcosfvmreeiosdjdzycb
```

**Body (user JWT):** `{ "event_id", "away_abbrev", "home_abbrev" }`

**Populate:** `npm run cfb:players:sync` (migration **`20260925200000_cfb_players`**).

Client: `loungeCfbGamePlayers` in `src/utils/loungeSportsApi.js`.
