# auth-send-sms

Supabase Auth **Send SMS** hook. Phone login (`signInWithOtp` / `verifyOtp` type `sms`) generates the code. This function only texts it from the approved 2FA number **`+1 480 393 4143`** (campaign **`CKAVJP0`**). Not Telnyx Verify, and not the guest swap number.

`verify_jwt` is false. The hook secret signs the body.

## Secrets

| Name | Purpose |
| --- | --- |
| `SEND_SMS_HOOK_SECRET` | Same `v1,whsec_...` value as the Auth hook. |
| `TELNYX_API_KEY` | Mission Control key that can send from the 2FA number. |
| `TELNYX_2FA_FROM` | Optional. Defaults to `+14803934143`. |
| `TELNYX_MESSAGING_PROFILE_ID` | Optional. Set if Telnyx requires a profile id on send. |

## Dashboard (test, then prod when Ryan asks)

Authentication → Providers → Phone: on. Authentication → Hooks → Send SMS:

- URL `https://<project-ref>.supabase.co/functions/v1/auth-send-sms`
- Secret matches `SEND_SMS_HOOK_SECRET`

```bash
supabase functions deploy auth-send-sms --project-ref kcosfvmreeiosdjdzycb
```

Production ref is `jtjgtucumuoswnbauxry`. Do not point the hook at the guest number `725`.
