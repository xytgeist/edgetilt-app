# account-phone-release

Removes the **signed-in** user's login phone after they enter the SMS code texted to that number.

The number is then free for another account. The Lounge check comes off. Continue with Phone no longer opens this account.

Requires a **confirmed email**. Phone-only accounts must add an email and confirm the code in Account info first. The function ignores any phone in the body and uses `auth.users.phone`.

SQL: **`20260919120000_release_account_phone.sql`**. Service role only.

## Deploy (test)

```bash
supabase functions deploy account-phone-release --project-ref kcosfvmreeiosdjdzycb
```

Do not deploy to production until Ryan asks. Prod Auth phone stays off.
