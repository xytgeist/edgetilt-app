# send-test-push

Supabase Edge Function that sends a push notification to all subscriptions saved for the authenticated user.

## Required secrets

Set these in your Supabase project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WEB_PUSH_PUBLIC_KEY`
- `WEB_PUSH_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT` (recommended format: `mailto:you@example.com`)

## Deploy

```bash
supabase functions deploy send-test-push
```

## Invoke from app

The app invokes:

```ts
supabaseClient.functions.invoke('send-test-push', {
  body: {
    title: 'Edge Test Notification',
    body: 'If you can read this, web push is working.',
    url: '/?tab=offers'
  }
})
```
