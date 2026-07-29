# chat-call-transcribe

Deepgram STT for **video call recordings** (not voice calls):

1. Pre-recorded listen + diarization → `call_recording.link_preview.transcript`
2. Long-press **View transcript** / Retry from the recording card
3. Speaker remap for room members

Voice calls do **not** use live STT (product cut). History is the `call_summary` card only.

## Secrets (test / prod)

| Secret | Required | Notes |
| --- | --- | --- |
| `DEEPGRAM_API_KEY` | yes | Deepgram project API key for `/v1/listen` |
| `CHAT_CALL_TRANSCRIBE_PUBLIC_URL` | optional | Full function URL for Deepgram async callback |
| `CHAT_CALL_TRANSCRIBE_CALLBACK_SECRET` | optional | Shared secret query `token=` on Deepgram callback |

Without the callback pair, recording transcription runs **synchronously** (fine for short clips; long 10m files may hit Edge wall-clock limits... open **View transcript** from the client to retry).

## Actions

| Action | Auth | Body | Notes |
| --- | --- | --- | --- |
| `transcribe` | user JWT or service role | `{ message_id, force?, async? }` | `call_recording` + `video_url` only |
| `remap_speakers` | user JWT | `{ message_id, speaker_map }` | `call_recording` (or legacy summary rows) |
| `deepgram_callback` | callback secret | Deepgram POST | Recording async completion |

## Deploy

```bash
npx supabase functions deploy chat-call-transcribe --project-ref kcosfvmreeiosdjdzycb
npx supabase functions deploy chat-call-transcribe --project-ref jtjgtucumuoswnbauxry
```
