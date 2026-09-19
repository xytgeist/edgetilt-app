# auth-send-sms

Supabase Auth **Send SMS** hook. Phone login (`signInWithOtp` / `verifyOtp` type `sms`) generates the code. US and Canada texts come from the approved 2FA number **`+1 480 393 4143`** (campaign **`CKAVJP0`**). Other countries use the sender name **`EdgeTilt`** on messaging profile **`4001a088-0495-4e4d-9981-a9dc5f928a73`**. Not Telnyx Verify, and not the guest swap number.

`verify_jwt` is false. The hook secret signs the body.

## Secrets

| Name | Purpose |
| --- | --- |
| `SEND_SMS_HOOK_SECRET` | Same `v1,whsec_...` value as the Auth hook. |
| `TELNYX_API_KEY` | Mission Control key that can send from the 2FA number. |
| `TELNYX_2FA_FROM` | Optional. Defaults to `+14803934143`. US and Canada only. |
| `TELNYX_MESSAGING_PROFILE_ID` | OTP profile. Required for countries other than the US and Canada. Test value `4001a088-0495-4e4d-9981-a9dc5f928a73`. |

## Dashboard (test, then prod when Ryan asks)

Authentication → Providers → Phone: on. Authentication → Hooks → Send SMS:

- URL `https://<project-ref>.supabase.co/functions/v1/auth-send-sms`
- Secret matches `SEND_SMS_HOOK_SECRET`

```bash
supabase functions deploy auth-send-sms --project-ref kcosfvmreeiosdjdzycb
```

Production ref is `jtjgtucumuoswnbauxry`. Do not point the hook at the guest number `725`.
