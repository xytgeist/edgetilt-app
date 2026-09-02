# lounge-x-video

Public GET proxy for **`video.twimg.com`** MP4s embedded in Lounge X tweet cards.

X rejects browser playback when **`Referer`** is EdgeTilt/LVSlotPro (`403`). This function re-fetches with **`Referer: https://x.com/`** and forwards **`Range`** for seeking.

## Deploy (test)

```bash
supabase functions deploy lounge-x-video --project-ref kcosfvmreeiosdjdzycb
```

`supabase/config.toml` sets **`verify_jwt = false`** (video `<src>` cannot send session JWT).

## Usage

```
GET /functions/v1/lounge-x-video?u=<encoded https://video.twimg.com/...mp4>&apikey=<anon>
```

Only **`https://video.twimg.com/`** URLs are allowed.
