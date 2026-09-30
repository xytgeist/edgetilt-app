# account-connect-discard

Deletes the caller's **brand-new, empty** auth user so its sign-in identity (Apple / Google / phone) can be linked to an older account. Called by `src/features/auth/AccountConnectSheet.jsx` when someone taps **Connect** on "Connect account?".

Refuses with 409 unless the user was created under 60 minutes ago (`too_old`) and has no posts, comments, chat messages, follows, or subscriptions (`has_activity`).

- `verify_jwt = true` (`supabase/config.toml`)
- Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (platform defaults)
- Requires Auth **manual linking** enabled on the project for the follow-up `linkIdentity` step.
