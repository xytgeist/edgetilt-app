# account-connect-attach

Step 2 of "Connect account?". After the person signs in to the account they chose, deletes the fresh account named in the hand-off (re-checking it has no activity), then attaches the phone / email that the discarded fresh account had **already verified**, so no second code is needed.

- Input: `{ transfer_token }` from `account-connect-prepare` (HMAC-signed with the service role key via `_shared/accountConnectToken.ts`, bound to the target user id, 30-minute expiry).
- Caller JWT must be the target user. Uses `auth.admin.updateUserById(..., { phone, phone_confirm: true })` (email likewise, only if the account has no email).
- Never overwrites a different phone already on the account (409 `phone_differs`).
- `verify_jwt = true` (`supabase/config.toml`).
