# send-due-offer-reminders

Supabase Edge Function that sends push reminders for offer events that are due within a configurable lookahead window.

It:

- reads enabled rows from `offer_notification_rules`
- finds matching `offer_events` based on each rule's `lead_minutes`
- dedupes with `offer_notification_sends`
- sends push payloads to `push_subscriptions`
- cleans stale endpoints (`404/410`)

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

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

Run every minute using a scheduler (Supabase scheduled functions, GitHub Action, or external cron) with:

- `lookaheadMinutes: 1`

This catches reminders due in the next minute while avoiding duplicate sends via the dedupe table.
