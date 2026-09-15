# delete-own-account

Deletes the **currently signed-in** Auth user (`auth.users` row). The JWT in `Authorization` must match that user; callers cannot delete someone else’s account.

**Effect:** Edge verifies the session, nulls `chat_rooms.creator_user_id` (do not wipe other people’s groups), then GoTrue `deleteUser`. If that returns `Database error deleting user` (app triggers aborting the cascade), it falls back to SQL **`public.delete_own_account_user()`** (`auth.uid()`, replica role). FKs still apply. `chat_rooms.creator_user_id` is `ON DELETE SET NULL` (`20260915120000`).

**Contract:** the function always returns **HTTP 200** with `{ ok: true }` or `{ ok: false, error }`. Gateway `verify_jwt` is **off**.

## Deploy

Apply **`20260915120000_delete_own_account_user.sql`** on the project, then:

```bash
supabase functions deploy delete-own-account --project-ref <YOUR_PROJECT_REF> --no-verify-jwt
```

## Client

`App.jsx` refreshes the session, then `fetch`es this function with the user JWT + anon `apikey`. Then `signOut()` and redirect to `/`.
