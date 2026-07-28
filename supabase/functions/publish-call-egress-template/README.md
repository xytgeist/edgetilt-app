# publish-call-egress-template

Copies the Vercel-built call egress page onto Lounge R2 so LiveKit headless Chrome can load it (avoids Vercel bot challenges).

## Deploy + run (test)

```bash
npx supabase functions deploy publish-call-egress-template --project-ref kcosfvmreeiosdjdzycb

# then (service role from .env.supabase.test):
node -e "
import 'dotenv/config'
" # or:
curl -X POST "$SUPABASE_URL/functions/v1/publish-call-egress-template" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source_origin":"https://lvslotpro.com"}'
```

Then set secrets on the same project:

- `CHAT_CALL_EGRESS_TEMPLATE_BASE_URL` = returned `template_url`
- `CHAT_CALL_EGRESS_USE_CUSTOM` = `1`

Redeploy `chat-calls`.
