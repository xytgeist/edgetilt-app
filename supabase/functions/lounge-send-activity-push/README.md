# lounge-send-activity-push

Supabase Edge Function invoked from Postgres (`pg_net`) when a row is inserted into **`activity_events`**. Sends a web push to all **`push_subscriptions`** for the **recipient** user.

## Required secrets

Set in Supabase Dashboard → Edge Functions → Secrets (same VAPID keys as Offers push):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` (e.g. `mailto:support@lvslotpro.com`)
- **`LOUNGE_ACTIVITY_PUSH_SECRET`** — shared with Vault **`lounge_activity_push_http_secret`** (see migration)

## Deploy

```bash
supabase functions deploy lounge-send-activity-push
```

`supabase/config.toml` sets **`verify_jwt = false`**; auth is the **`x-lounge-activity-push-secret`** header from the DB trigger.

## Database (test)

Apply migrations in order:

- **`20260523160000_lounge_activity_events_push.sql`** — immediate push trigger
- **`20260523170000_lounge_activity_push_h3.sql`** — batched like/bookmark (10s debounce), `notification_preferences`, cron flush
- **`20260602200000_chat_dm_push_debounce.sql`** — batched `chat_dm` per room (**60s** debounce)
- **`20260602210000_chat_dm_push_invoke_edge.sql`** — after scheduling DM batch, invoke Edge immediately (Edge waits for debounce; pg_cron flush is backup)
- **`20260602220000_chat_dm_first_message_immediate.sql`** — first DM after quiet period pushes immediately; follow-ups within 60s batch
- **`20260523180000_lounge_activity_mark_push_opened.sql`** — RPC **`lounge_activity_mark_push_opened`** (tap marks single event or whole batch read)

Then create Vault secrets (SQL Editor, once per project):

```sql
select vault.create_secret('YOUR_PUSH_SECRET', 'lounge_activity_push_http_secret');
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'lounge_activity_push_project_url');
select vault.create_secret('YOUR_LEGACY_ANON_JWT', 'lounge_activity_push_supabase_anon_key');
```

- **`YOUR_PUSH_SECRET`** must match Edge **`LOUNGE_ACTIVITY_PUSH_SECRET`**.
- **`lounge_activity_push_project_url`** — project base URL (no trailing slash).
- **`lounge_activity_push_supabase_anon_key`** — legacy JWT **anon** `public` key (`eyJ…`), not `sb_publishable_…`.

## Client

Lounge **Settings → Notifications**:

- **Push notifications** — device master toggle (`push_subscriptions` + localStorage)
- **Notify me about** — per-category prefs in `notification_preferences` (account-wide)

Like/bookmark pushes are **debounced 10 seconds** and **grouped** (`@a and 4 others liked your post`). **DM messages:** the **first message** after a quiet period pushes **immediately**; **follow-ups within 60 seconds** collapse to one batched notification (`@a sent you 3 messages`) after 60s idle from the last message. Replies, mentions, follows, and reposts stay **immediate**.

Tap targets (URL + push JSON fields):

- **Follow** → `/?tab=home&u=<handle>` (+ optional **`activityEventId`**)
- **Post activity** → `/?tab=home&post=<uuid>` (+ **`activityEventId`** or batched **`activityBatchId`**)
- **DM (batched)** → `/?tab=chat&room=<uuid>` (+ **`activityBatchId`**)
- Fallback → `/?tab=home&lounge=notifications`

Push JSON also includes **`activityEventId`** / **`activityBatchId`** so **`push-sw.js`** can mark read on tap without waiting for the Alerts panel. Client: **`lounge_activity_mark_push_opened`** RPC + **`refreshLoungeNotificationsUnread`** in **`SocialFeed.jsx`** (via **`lounge-push-opened`** custom event from **`AppShell.jsx`** or cold-start URL params). **Redeploy Edge** after payload changes; old notifications without IDs still need Alerts open or the 60s poll to clear badges.

## Smoke

1. Apply SQL + deploy function + set secrets.
2. Signed in on test: Settings → enable push (allow browser permission).
3. From another account, like/comment/follow the test user.
4. Confirm OS notification; tap opens Lounge post/profile/notifications; **FAB/Alerts badge drops immediately** (new pushes only — requires **`20260523180000`** + Edge redeploy).

Optional: invoke manually (replace ids/secrets):

```bash
curl -X POST "$SUPABASE_URL/functions/v1/lounge-send-activity-push" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "x-lounge-activity-push-secret: $PUSH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"activityEventId":"UUID"}'
```

Verify **`net._http_response`** if the trigger fires but no push arrives.
