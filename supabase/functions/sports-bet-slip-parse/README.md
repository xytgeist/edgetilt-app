# sports-bet-slip-parse

JWT Edge Function. When on-device OCR + heuristic slip parse fails (or looks weak), the Bet Tracker client can send OCR **text** and/or the slip **image** for an OpenAI extract into a `sports_bets`-shaped draft.

**Secrets:** `OPENAI_API_KEY` (same as `w2g-vision-extract`). Optional `OPENAI_VISION_MODEL` / `OPENAI_CHAT_MODEL` (default `gpt-6-luna`).

```bash
npx supabase functions deploy sports-bet-slip-parse --project-ref kcosfvmreeiosdjdzycb
# npx supabase functions deploy sports-bet-slip-parse --project-ref jtjgtucumuoswnbauxry
```
