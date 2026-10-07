# lounge-live-activity-token

Signed-in IPA registers the ActivityKit **Live Activity push token** so Island / Lock Screen can update after WKWebView suspends.

`POST` user JWT. Body:

```json
{ "token": "<hex>", "gameId": "<event id>", "environment": "production", "watching": true }
```

`watching: false` deletes the row for that `gameId` (or every row for the user if `gameId` is omitted).

# lounge-live-activity-push

pg_cron (`live_activity_island_push`, every minute) + service-role bearer. **Armed only while `live_activity_push_tokens` has rows** (insert/delete trigger). This is not a second odds poll. Hub/JS already paints the Island in the foreground; iOS kills that JS after ~30s in the background, so this job reads the shared `cachedLoungeSportsScoreboard` and sends APNs `liveactivity`. Unscheduled when nobody is watching. SQL: `20261007150000`.

Uses existing `APNS_KEY_ID` / `APNS_P8`. Topic: `com.edgetilt.app.push-type.liveactivity`.

```bash
supabase functions deploy lounge-live-activity-token --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy lounge-live-activity-push --project-ref kcosfvmreeiosdjdzycb
```

SQL: `supabase/migrations/20261005040000_live_activity_push_tokens.sql` + `20261007150000_live_activity_cron_arm_pg_net_prune.sql`.
