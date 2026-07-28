# chat-call-transcribe

Deepgram diarization for Edge Chat **call recordings**. Maps speaker clusters onto `link_preview.participants` (avatar + name) and stores the transcript on `chat_messages.link_preview`.

## Secrets (test / prod)

| Secret | Required | Notes |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | yes | Deepgram project API key |
| `CHAT_CALL_TRANSCRIBE_PUBLIC_URL` | optional | Full function URL for Deepgram async callback, e.g. `https://kcosfvmreeiosdjdzycb.supabase.co/functions/v1/chat-call-transcribe` |
| `CHAT_CALL_TRANSCRIBE_CALLBACK_SECRET` | optional | Shared secret query `token=` on Deepgram callback |

Without the callback pair, transcription runs **synchronously** (fine for short clips; long 10m files may hit Edge wall-clock limits... open **View transcript** from the client to retry).

## Actions

- `transcribe` — `{ message_id, force?, async? }` (user JWT or service role)
- `remap_speakers` — `{ message_id, speaker_map: { "0": "<user_id>", ... } }` (room member)
- `deepgram_callback` — Deepgram POST (+ `token` + `message_id` query)

## Deploy

```bash
npx supabase functions deploy chat-call-transcribe --project-ref kcosfvmreeiosdjdzycb
# also redeploy livekit-egress-webhook + chat-calls (shared finalize enqueue)
```
