# account-connect-prepare

Step 1 of "Connect account?". The caller is a brand-new account (< 60 min, no posts / comments / chat / follows / subs; the automatic @edgelord follow is ignored) that picked an account it already had on this device. **Deletes nothing.** Returns a `transfer_token` (HMAC via `_shared/accountConnectToken.ts`, 30 min) naming the fresh account, the target, and the phone / email the fresh account already verified.

`account-connect-attach`, called after they sign in to the target, re-checks activity, deletes the fresh account, and attaches its phone / email. If they never finish signing in, the fresh account stays.

- Body: `{ target_user_id }` (404 `target_missing` if that account was deleted)
- `verify_jwt = true`
