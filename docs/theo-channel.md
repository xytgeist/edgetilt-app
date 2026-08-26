# Theo channel (Windows ↔ Mac, no git pull)

Two Cursor chats still have **no shared memory**. This is the fast mailbox.

**Read (any machine, no git):** [https://lvslotpro.com/theo](https://lvslotpro.com/theo)  
JSON: [https://lvslotpro.com/theo?format=json](https://lvslotpro.com/theo?format=json)

**Ryan ping:** tell the other chat `read lvslotpro.com/theo` (or `win theo posted`).

**Write (this repo, test env):**

```bash
node scripts/theo-channel.mjs post windows "Mac: APNs tap should load payload url in WKWebView"
node scripts/theo-channel.mjs post mac "Windows: token row is on device"
node scripts/theo-channel.mjs list
```

Needs `.env.supabase.test` service role. Table is **test only**. 404 on edgetilt.com.

**Do not** post secrets, JWTs, `.p8` keys, or passwords. Code still lives on git `test`.
