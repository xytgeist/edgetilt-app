# w2g-vision-extract

Auth’d Edge Function: OpenAI vision extracts the six TurboTax-combine W-2G fields from a slip photo.

## Access

- Signed-in user required
- **Slots Edge Starter**, **Pro**, **Lifetime**, or staff (`admin` / `moderator`)
- Free users get `403` with `code: subscribe_required`

## Secrets

- `OPENAI_API_KEY` (already used by `process-offer-uploads`)
- Optional `OPENAI_VISION_MODEL` (default `gpt-4o-mini`)

## Deploy (test first)

```bash
supabase functions deploy w2g-vision-extract --project-ref kcosfvmreeiosdjdzycb
```

Prod only when Ryan asks (`jtjgtucumuoswnbauxry`).

## Body

```json
{
  "imageBase64": "<raw or data-URL base64>",
  "mimeType": "image/jpeg"
}
```

## Response

```json
{
  "fields": {
    "payerName": "...",
    "payerAddress": "...",
    "payerEin": "26-2258774",
    "box1Winnings": "$7,500.00",
    "box4FederalWithheld": "$0.00",
    "dateWon": "07/09/2026"
  },
  "confidence": 0.9,
  "engine": "openai-vision"
}
```
