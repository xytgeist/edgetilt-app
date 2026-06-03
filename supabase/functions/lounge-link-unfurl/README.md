# lounge-link-unfurl

Server-side link preview (Open Graph + lounge `/lounge/p/:id` permalinks). Used by chat and Lounge feed/comments.

## Actions (POST + user JWT)

| Action | Body | Response |
| --- | --- | --- |
| `unfurl` | `url` or `text` (first URL extracted) | `{ preview }` |
| `attach` | `entity_type`, `entity_id`, `text` or `url` | `{ preview }` — writes `link_preview` jsonb on the row |

`entity_type`: `chat_message` | `feed_post` | `feed_comment`

## Deploy

```bash
supabase functions deploy lounge-link-unfurl
```

Apply migration `20260604180000_link_previews_chat_and_lounge.sql` on test/prod.
