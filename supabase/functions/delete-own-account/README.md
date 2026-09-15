# delete-own-account

Deletes the **currently signed-in** Auth user (`auth.users` row) using the **service role**. The JWT in `Authorization` must match that user; callers cannot delete someone else’s account.

**Effect:** Removes the user’s Lounge comments/posts first (feed delete triggers can abort a cascaded Auth delete), then the Auth user. Tables that reference `auth.users(id)` with `ON DELETE CASCADE` (e.g. `public.profiles`, push rows) are cleaned up by Postgres.

**Contract:** the function always returns **HTTP 200** with `{ ok: true }` or `{ ok: false, error }`. Gateway `verify_jwt` is **off** (`config.toml`); the handler checks the bearer via `auth.getUser`. Non-2xx from the gateway used to show as `{}` / a generic toast in the IPA.

## Deploy (Supabase CLI)

From repo root:

```bash
supabase functions deploy delete-own-account --project-ref <YOUR_PROJECT_REF> --no-verify-jwt
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically in hosted Edge Functions.

## Client

`App.jsx` refreshes the session, then `fetch`es this function with the user JWT + anon `apikey` (not `functions.invoke`, whose non-2xx body is often empty in WKWebView). Then `signOut()` and redirect to `/`.
