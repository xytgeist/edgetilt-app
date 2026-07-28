# chat-call-transcribe

Deepgram STT for Edge Chat:

1. **Video call recordings** — pre-recorded listen + diarization → `call_recording.link_preview.transcript`
2. **Voice calls (live)** — mint short-lived Deepgram JWTs for browser listen; merge per-participant finals into `chat_calls.live_transcript` → copied onto `call_summary` at hangup

## Secrets (test / prod)

| Secret | Required | Notes |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | yes | Deepgram project API key (used for `/v1/listen` and `/v1/auth/grant`) |
| `CHAT_CALL_TRANSCRIBE_PUBLIC_URL` | optional | Full function URL for Deepgram async callback (recording path only) |
| `CHAT_CALL_TRANSCRIBE_CALLBACK_SECRET` | optional | Shared secret query `token=` on Deepgram callback |

Without the callback pair, recording transcription runs **synchronously** (fine for short clips; long 10m files may hit Edge wall-clock limits... open **View transcript** from the client to retry).

## Actions

| Action | Auth | Body | Notes |
| --- | --- | --- | --- |
| `transcribe` | user JWT or service role | `{ message_id, force?, async? }` | `call_recording` + `video_url` only |
| `remap_speakers` | user JWT | `{ message_id, speaker_map }` | `call_recording` **or** `call_summary` |
| `deepgram_callback` | callback secret | Deepgram POST | Recording async completion |
| `mint_live_stt_grant` | user JWT | `{ call_id }` | Voice calls only; returns `{ access_token, expires_in }` (30s TTL; WS may outlive token) |
| `append_live_transcript` | user JWT | `{ call_id, utterances[] }` | Stamps `user_id` from JWT; merges into `chat_calls.live_transcript`; patches summary if present |

## SQL

- `supabase/migrations/20260728110000_chat_calls_live_transcript.sql` — `chat_calls.live_transcript jsonb`

## Deploy

```bash
npx supabase functions deploy chat-call-transcribe --project-ref kcosfvmreeiosdjdzycb
npx supabase functions deploy chat-calls --project-ref kcosfvmreeiosdjdzycb
# also redeploy livekit-egress-webhook when changing recording finalize enqueue
```
