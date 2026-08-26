# send-due-offer-reminders

Supabase Edge Function that sends push reminders for offer events that are due within a configurable lookahead window.

It:

- reads enabled rows from `offer_notification_rules`
- finds matching `offer_events` based on each rule's `lead_minutes`
- dedupes with `offer_notification_sends`
- sends push payloads to `push_subscriptions` and `apns_device_tokens`
- cleans stale endpoints (`404/410`)

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`
- **APNs (optional):** `APNS_KEY_ID`, `APNS_P8`, optional `APNS_TEAM_ID` / `APNS_BUNDLE_ID`

## Deploy

```bash
supabase functions deploy send-due-offer-reminders
```

## Invoke manually

```ts
supabaseClient.functions.invoke('send-due-offer-reminders', {
  body: { lookaheadMinutes: 1 }
})
```

## Recommended schedule

**Shipped (40600):** pg_cron job **`send_due_offer_reminders_minute`** every minute via **`public.invoke_send_due_offer_reminders()`** (`lookaheadMinutes: 1`). Vault: **`lounge_odds_poll_project_url`**, **`lounge_odds_poll_service_role_key`**.

Manual smoke:

```sql
select public.invoke_send_due_offer_reminders();
```

Offers UI **Run reminder check now** still works for ad-hoc runs with a wider lookahead.
