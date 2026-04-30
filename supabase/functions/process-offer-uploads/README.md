# process-offer-uploads

Supabase Edge Function that processes queued image uploads, uses OpenAI vision to extract event data, and then:

- auto-creates `offer_events` when confidence is high enough
- creates `offer_ai_review_items` with partial draft data otherwise
- updates `offer_uploads.status` and `offer_import_batches.status`

## Required secrets

Set these in your Supabase project before deploying:

- `OPENAI_API_KEY`
- `SUPABASE_URL` (provided by Supabase)
- `SUPABASE_SERVICE_ROLE_KEY` (provided by Supabase)

Optional tuning:

- `OPENAI_VISION_MODEL` (default: `gpt-4o-mini`)
- `AI_AUTO_CREATE_CONFIDENCE` (default: `0.78`)
- `AI_PROCESS_BATCH_SIZE` (default: `20`)

## Deploy

```bash
supabase functions deploy process-offer-uploads
```

## Invoke from app

The app already calls:

```ts
supabaseClient.functions.invoke('process-offer-uploads', { body: { batchId } })
```

If the function is not deployed yet, uploads stay safely queued and can be processed later.
