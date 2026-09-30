# account-connect-discard

**Legacy (web ≤ 1.4.922).** Newer clients use `account-connect-prepare` + `account-connect-attach`, which delete the fresh account only after the old-account sign-in succeeds. Remove once no client calls this.

Deletes the caller's **brand-new, empty** auth user so its sign-in identity (Apple / Google / phone) can be linked to an older account. Called by `src/features/auth/AccountConnectSheet.jsx` when someone taps **Connect** on "Connect account?".

Refuses with 409 unless the user was created under 60 minutes ago (`too_old`) and has no posts, comments, chat messages, follows, or subscriptions (`has_activity`).

- `verify_jwt = true` (`supabase/config.toml`)
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (platform defaults)
- Requires Auth **manual linking** enabled on the project for the follow-up `linkIdentity` step.
