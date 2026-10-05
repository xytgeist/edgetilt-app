# lounge-live-activity-token

Signed-in IPA registers the ActivityKit **Live Activity push token** so Island / Lock Screen can update after WKWebView suspends.

`POST` user JWT. Body:

```json
{ "token": "<hex>", "gameId": "<event id>", "environment": "production", "watching": true }
```

`watching: false` deletes the row for that `gameId` (or every row for the user if `gameId` is omitted).

# lounge-live-activity-push

pg_cron (`live_activity_island_push`, every minute) + service-role bearer. Reads `live_activity_push_tokens`, builds `LiveSportsAttributes.ContentState` from `cachedLoungeSportsScoreboard`, sends APNs `liveactivity` updates. No-ops when nobody is watching.

Uses existing `APNS_KEY_ID` / `APNS_P8`. Topic: `com.edgetilt.app.push-type.liveactivity`.

```bash
supabase functions deploy lounge-live-activity-token --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy lounge-live-activity-push --project-ref kcosfvmreeiosdjdzycb
```

SQL: `supabase/migrations/20261005040000_live_activity_push_tokens.sql`.
