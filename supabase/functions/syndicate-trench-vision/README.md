# syndicate-trench-vision

Admin-only. Reads an ESPN Analytics **team** win-rate screenshot (PRWR / RSWR / PBWR / RBWR) via OpenAI vision. Same door as `syndicate-splits-vision`. No scrape.

## Secrets

- `OPENAI_API_KEY` (already on test + prod for splits / offers)
- Optional `OPENAI_VISION_MODEL` (default `gpt-4o-mini`)

## Deploy

```bash
supabase functions deploy syndicate-trench-vision --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy syndicate-trench-vision --project-ref jtjgtucumuoswnbauxry
```

## Body

```json
{ "imageBase64": "<raw or data-url>", "mimeType": "image/png" }
```

Returns `{ ok, teams: [{ team_abbr, team_name, prwr, rswr, pbwr, rbwr }], unmatched, through, confidence }`.

Client: Ops **NFL Trenches** tab (`BotTrenchScreenshotIngest`). Writes only those four columns on `nfl_team_metrics`. Skips `is_custom_override`. Does not set override. Scott + Rocco read these on the next poll.
