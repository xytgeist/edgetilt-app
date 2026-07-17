# `affiliate-tax-email`

Emails the creator a copy of their stored affiliate tax attestation PDF (from private Storage `affiliate-tax-docs`) via **Resend**.

## Request

`POST` with user JWT:

```json
{ "tax_email": "creator@example.com", "document_path": "<path from tax profile>" }
```

## Secrets (test / prod)

| Secret | Required | Notes |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Same Resend account as auth SMTP is fine |
| `AFFILIATE_TAX_EMAIL_FROM` | optional | Defaults to `RESEND_FROM`, then `EdgeTilt <noreply@auth.edgetilt.com>` |

## Deploy (test)

```bash
supabase functions deploy affiliate-tax-email --project-ref kcosfvmreeiosdjdzycb
supabase secrets set RESEND_API_KEY=re_xxx --project-ref kcosfvmreeiosdjdzycb
```
