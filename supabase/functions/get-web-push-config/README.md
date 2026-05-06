# get-web-push-config

Returns the VAPID **public** key at runtime so installed PWAs and production builds work without `VITE_WEB_PUSH_PUBLIC_KEY` in the hosting build environment.

## Required secret

- `WEB_PUSH_PUBLIC_KEY` (same value as used by `send-test-push`)

## Deploy

```bash
supabase functions deploy get-web-push-config --project-ref YOUR_PROJECT_REF
```

The app calls this via `supabase.functions.invoke('get-web-push-config')` when the Vite env variable is empty.
