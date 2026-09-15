# delete-own-account

Deletes the **currently signed-in** Auth user (`auth.users` row) using the **service role**. The JWT in `Authorization` must match that user; callers cannot delete someone else’s account.

**Effect:** Removes the user from Auth. Tables that reference `auth.users(id)` with `ON DELETE CASCADE` (e.g. `public.profiles`, `community_feed_posts`, push subscription tables) are cleaned up by Postgres.

GoTrue runs that delete as **`supabase_auth_admin`**, which does not bypass RLS and needs table grants on `public.*`. Without **`20260915160000_auth_admin_delete_user_grants.sql`**, Auth returns **`Database error deleting user`**. Applied on **test** 2026-09-15. Prod still needs Ryan's OK.

GoTrue also hides the real SQL. On failure the function calls **`explain_auth_user_delete_block`** and returns that string as **`error`**. **`20260915170000`**: a claimed tournament-swap counterparty SET NULL was dying on **`poker_tournament_swaps_counterparty_present`**; the row now flips back to guest.

## Deploy (Supabase CLI)

From repo root:

```bash
supabase functions deploy delete-own-account --project-ref <YOUR_PROJECT_REF>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically in hosted Edge Functions.

## Client

`App.jsx` invokes `delete-own-account` after a strong in-app confirm, then `signOut()` and redirects to `/`.
