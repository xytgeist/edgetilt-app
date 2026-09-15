# delete-own-account

Deletes the **currently signed-in** Auth user (`auth.users` row) using the **service role**. The JWT in `Authorization` must match that user; callers cannot delete someone else’s account.

**Effect:** Removes the user from Auth. Tables that reference `auth.users(id)` with `ON DELETE CASCADE` (e.g. `public.profiles`, `community_feed_posts`, push subscription tables) are cleaned up by Postgres.

## Deploy (Supabase CLI)

From repo root:

```bash
supabase functions deploy delete-own-account --project-ref <YOUR_PROJECT_REF>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically in hosted Edge Functions.

## Client

`App.jsx` invokes `delete-own-account` after a strong in-app confirm, then `signOut()` and redirects to `/`.
