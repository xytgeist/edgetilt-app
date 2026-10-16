# lounge-report-triage

Silent first-pass on `lounge_reports`. **Not** a Lounge bot persona.

- New reports start `needs_human=false`, `triage_status=pending`.
- Auto-dismiss only when the reporter picked **spam**, the model agrees **spam + dismiss**, and confidence ≥ 0.85.
- Never auto-hide.
- Sexual / illegal / impersonation / other / harassment / hate are elevated to `needs_human`.
- OpenAI failure elevates (`triage_status=failed`, `needs_human=true`).

## Auth

User JWT or service role. Writes use the service role.

## Body

```json
{ "reportId": "optional-uuid", "limit": 8 }
```

## Secrets

Same `OPENAI_API_KEY` as `process-offer-uploads` / `w2g-vision-extract`. Optional `OPENAI_CHAT_MODEL` (default `gpt-6-luna`).

## Deploy (test)

```bash
npx supabase functions deploy lounge-report-triage --project-ref kcosfvmreeiosdjdzycb
```

Do not deploy to prod until Ryan asks.
