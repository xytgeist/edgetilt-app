# Lounge bot editorial queue — X-tracker bots only (planned)

**Status:** **Code shipped (Jul 2026)** ... X ingest, editorial inbox, LLM rewrite via per-bot `config.voice_prompt` (portal **Settings** / create wizard). Cron for X ingest still TBD.

**Decision (2026-07-03):** The **morning editorial inbox** is **only** for **X-tracker bots** ... human-imitating Edge accounts that follow configured `@handles`, rewrite tweets in persona voice, and need Ryan's review before publish.

**Not in this workflow:** sports odds bot and financial news bot are **self-contained** (automated ingest → caption → publish). See **`docs/lounge-bot-sports-odds.md`** and **`docs/lounge-bot-market-news.md`**.

**Related:** `docs/social-feed-roadmap.md`, `docs/test-buildout-backlog.md`, Offers AI review pattern in `supabase/offer_ai_import.sql`.

---

## Two automation modes (Ryan 2026-07-03)

| Mode | Bot types | Ryan's daily role |
| --- | --- | --- |
| **Editorial (this doc)** | X-tracker niche accounts (crypto, smart money, poker, slots/AP, ...) | Morning inbox: edit, skip, schedule |
| **Self-contained** | Sports odds (Odds API), financial wire (RSS/API/EDGAR) | None required ... tune config, audit log, kill switch only |

Both modes use **one Edge profile per niche** and **`lounge_bot_accounts`** registry. Only **X** pipelines use **`lounge_bot_queue`** with `pending_review`.

---

## Product intent (X bots)

- **Many unique Edge profiles**, each a **specialist** ... not one generic bot posting everything.
- **One primary niche per X account:** crypto bot → crypto handles only; poker bot → poker handles only; etc.
- **Human-imitating:** LLM rewrite in that account's voice ... not verbatim syndication; optional link preview to source tweet.
- **No auto-publish** for X bots until that persona's pipeline is trusted for weeks (then product decision ... still editorial by default).

---

## Bot account model

Each bot = **one** `auth.users` + **`profiles`** row + **one ingest pipeline** + **hard topic scope**.

| Edge account (example) | Pipeline | Review mode | Posts only about |
| --- | --- | --- | --- |
| **Sports lines** bot | The Odds API | **Self-contained** | Sports betting ... see sports odds doc |
| **Financial wire** bot | RSS/API/EDGAR | **Self-contained** | Timely market news ... see market news doc |
| **Crypto pulse** bot | X timelines | **Editorial** | Crypto influencers you configure |
| **Smart money** bot | X timelines | **Editorial** | Intelligent investing accounts you configure |
| **Poker room** bot | X timelines | **Editorial** | Poker accounts you configure |
| **Slots / AP floor** bot | X timelines | **Editorial** | Slot/AP educators, manufacturers, floor intel |
| *(add more X bots)* | X | **Editorial** | One niche per new profile |

**Rules (X bots):**

- **`bot_user_id` on queue row is fixed at ingest** ... do not reassign a draft to a different persona in normal flow.
- Many `@handles` can feed **one** X-niche bot, but **one X-niche bot does not follow unrelated handles**.
- **Cross-posting the same story on two bots** ... avoid unless intentionally different angle.

**Schema sketch: `lounge_bot_accounts`**

| Column | Purpose |
| --- | --- |
| `user_id` | PK → `profiles` |
| `slug` | `sports-odds`, `financial-wire`, `x-crypto`, ... |
| `pipeline` | `odds_api` \| `market_news` \| `x` \| `manual` |
| `review_mode` | `automatic` \| `editorial` ... **`editorial` only when `pipeline = x`** |
| `display_name`, `bio`, `avatar` | Public persona |
| `voice_prompt_id` | LLM system prompt key (X bots; optional for self-contained templates) |
| `config.voice_prompt` | **Shipped:** full LLM instruction for X ingest rewrite (portal **Settings** on X bots) |
| `category_pills_default` | Per-account defaults |
| `max_posts_per_day` | Per-account cap |
| `enabled` | Kill switch |

X sources: **`lounge_bot_x_sources`** with **`bot_account_id`** (FK) ... each handle maps to exactly one niche X bot.

**Recommended:** `profiles.is_bot` for staff filters ... public "syndicated" badge TBD.

**Rate limits today:** 5 posts / 10 min / user (`community_feed_posts_enforce_rate_limit`). Service-role publish skips limiter when `auth.uid()` is null; still cap daily volume **per bot account**.

---

## Daily workflow (X bots only)

```text
Overnight (cron)     Morning (Ryan)              Daytime (cron)
────────────────     ──────────────              ────────────────
X ingest + draft  →  Review / edit / skip    →   Publish due rows
                     Schedule times              → community_feed_posts
```

1. **`lounge-x-ingest`** (cron): poll configured timelines → filter on-topic → LLM draft in persona voice → `pending_review` with **`bot_user_id` set**.
   - **Single post:** `{ "slug": "…", "tweetUrl": "https://x.com/…/status/…" }` fetches that tweet (any age), LLM rewrite, editorial queue.
2. **Editorial UI** (admin): inbox filterable by X bot; edit caption, pills, schedule.
3. **`lounge-bot-publish-due`** (every ~5 min): due `scheduled` rows → post as that **`user_id`**.

Self-contained bots **bypass** steps 2–3 above ... they use their own ingest + publish path (see sibling docs).

---

## Queue item statuses (X editorial)

| Status | Meaning |
| --- | --- |
| `pending_review` | In Ryan's morning inbox |
| `scheduled` | Approved with `scheduled_at` set |
| `published` | Live; `published_post_id` set |
| `skipped` | Rejected; keep for audit |
| `failed` | Publish error; retry from admin |

Optional pipeline states: `drafting` / `ingesting` (visibility only).

---

## Scheduling UX (admin, X bots)

| Action | Behavior |
| --- | --- |
| **Next open slot** | Next free slot today for that bot persona |
| **Spread N today** | Even spacing between morning and evening (e.g. 8am–8pm local) |
| **Custom time** | Date + time picker |
| **Bulk schedule** | Multi-select → spread through day |

**Rules under the hood:**

- Min **45–90 min** between posts **per bot** (`bot_user_id`).
- Max **N posts/day/bot** (configurable).
- Optional jitter so two personas never post same minute.

---

## X.com integration (per niche bot)

Use **official X API v2**, not scraping. **Each X-tracker Edge account** has its **own** list of `@handles` in **`lounge_bot_x_sources`**.

### Setup

1. Developer account at [console.x.com](https://console.x.com) ... Project + App.
2. **Bearer Token** (OAuth 2.0 app-only) for public reads.
3. Supabase Edge secrets: `X_API_BEARER_TOKEN` (never in repo). **Required for timeline polling only** ... manual **Transform a post** can use pasted tweet text or public oEmbed/syndication without a bearer.
4. Billing: X **pay-per-use credits** (check console for current read pricing).

### Config table: `lounge_bot_x_sources`

| Column | Purpose |
| --- | --- |
| `bot_account_id` | FK → **`lounge_bot_accounts`** |
| `x_handle` | e.g. `@someCryptoAnalyst` |
| `x_user_id` | Resolved once via `GET /2/users/by/username/{handle}` |
| `enabled` | Kill switch |
| `since_id` | Last seen tweet id (poll cursor) |
| `exclude_replies` / `exclude_retweets` | Default true |
| `filters` | Optional JSON (keywords, min length) |

### Poll for new posts

```http
GET https://api.x.com/2/users/{x_user_id}/tweets
  ?max_results=10
  &exclude=replies,retweets
  &since_id={since_id}
  &tweet.fields=created_at,entities,referenced_tweets
Authorization: Bearer <token>
```

**Cron:** every 30–60 min overnight, or 2–4 fixed runs (11pm, 2am, 5am PT). Advance `since_id` after processing.

**Dedupe:** unique `external_key` (tweet id) on queue table.

### Manual transform (portal **Transform a post**)

Does **not** require `X_API_BEARER_TOKEN`. Body:

```json
{ "slug": "vitalik-meth", "tweetUrl": "https://x.com/VitalikButerin/status/123", "sourceText": "optional pasted tweet copy" }
```

Resolution order: pasted `sourceText` → X API v2 (if bearer set) → public oEmbed → syndication JSON. If all fail, portal shows an error asking for pasted tweet text.

Timeline polling still requires a valid bearer and paid X read access.

---

## Data model — `lounge_bot_queue` (X editorial)

Used for **`source_type = x`** (and optional **`manual`** paste for testing X voice). Self-contained bots may use a separate **`lounge_bot_auto_log`** table or the same table with `status = scheduled` on insert ... TBD at implementation.

| Column | Notes |
| --- | --- |
| `id` | uuid |
| `source_type` | `x` \| `manual` (editorial queue) |
| `source_id` | FK → `lounge_bot_x_sources` |
| `external_key` | Dedupe id (tweet id) |
| `source_payload` | jsonb ... tweet metadata for admin card |
| `bot_user_id` | persona |
| `source_text`, `source_url`, `source_posted_at` | read-only context in UI |
| `draft_caption` | editable; max 500 chars |
| `category_pills` | text[] |
| `attach_source_link` | bool |
| `status` | see statuses above |
| `scheduled_at` | timestamptz |
| `published_post_id` | FK → `community_feed_posts` |
| `reviewed_by`, `reviewed_at`, `skip_reason` | audit |
| `created_at` | when row entered queue |

RLS: **admin-only** read/write.

---

## Transform pipeline (per tweet)

1. **Filter:** drop replies, RTs, promo, off-topic (optional classifier).
2. **Rewrite:** LLM with **per-persona system prompt** (`scripts/lib/loungeBotPersonas.mjs`).
3. **Queue:** insert `pending_review` ... never write `community_feed_posts` here.

Do **not** copy-paste tweets verbatim (ToS + reads bot).

---

## Publish path (X scheduled rows)

Edge Function **`lounge-bot-publish-due`** (service role, cron):

1. Select due `scheduled` rows where `review_mode = editorial`.
2. Insert `community_feed_posts` (same fields as `communityFeedPostInsertPayload`).
3. Call **`lounge-link-unfurl`** when needed.
4. Set `published_post_id`, `status = published`.

Ingest: **`lounge-x-ingest`** only for this doc's scope.

Optional shared **`lounge-bot-draft`** for LLM polish pass.

---

## Admin UI

**In-app portal:** **`/?tab=bots`** (not Edge Monitor)

| Surface | Purpose |
| --- | --- |
| **Bot card** | Settings, **LLM voice instructions** (`config.voice_prompt`), X handles, **Transform a post** (URL + optional tweet text) |
| **Post as @handle** | Manual feed post with optional images (up to 6; migration **`20260707000000`**) |
| **Editorial inbox** tab | `pending_review` queue; filter by X bot; **Transform post** shortcut when bot filtered |
| **Feed posts** | Recent bot posts; edit caption; reply-as-bot threads |

Legacy doc name **Edge Monitor → Lounge editorial** referred to early planning; shipped UI is **`BotManagementPortal`** + **`BotEditorialInbox`**.

---

## Phased rollout (X editorial)

| Phase | Scope | X API? |
| --- | --- | --- |
| **0** | Manual transform (URL + optional pasted text) → queue → schedule → publish | **No** (oEmbed/syndication fallback) |
| **1** | X timeline poll → queue → morning workflow | Yes, 1–2 handles on test |
| **2** | Multiple X personas + sources; better filters + dedupe | Yes |
| **3** | Smarter drafts ... still **editorial** by default | Yes |

**Never v1:** auto-replies, auto-likes, auto-DMs, **auto-publish for X bots without explicit product decision**.

**Environment:** test first (`kcosfvmreeiosdjdzycb`). Prod **`jtjgtucumuoswnbauxry`** — manual transform + Post as images shipped **2026-07-07** (**`35942f61`** / **`30fa305e`**). Timeline poll still needs Ryan X Developer sign-off.

---

## Repo touchpoints (when building)

| Piece | Location |
| --- | --- |
| Schema | `supabase/migrations/` |
| X ingest | `supabase/functions/lounge-x-ingest/` + `_shared/loungeBotXTweetFetch.ts` |
| Publish due | `supabase/functions/lounge-bot-publish-due/` |
| Per-bot voice | `config.voice_prompt` via portal Settings; **`loungeBotXVoice.ts`** |
| Portal UI | `src/features/bots/BotManagementPortal.jsx`, `BotEditorialInbox.jsx`, `botPortalApi.js` |
| Manual Post as images | `BotComposeImagePicker.jsx`, `botComposeImages.js` |
| Insert payload | `src/utils/communityFeedPost.js` |

---

## Trust and legal (X bots)

- Do not impersonate real people without permission.
- Staff must always know which profiles are bots (`is_bot`).
- X Developer Policy: prefer **rewrite + link**, not verbatim copy.

---

## Open questions

- [ ] Public "syndicated" badge vs undisclosed bot accounts?
- [ ] Which X niche accounts ship in phase 1?
- [ ] LLM provider + cost cap for nightly X batch?
- [ ] Media from X (images) in v1 or text-only first?

---

_Last updated: 2026-07-03 ... editorial queue scoped to X-tracker bots only; sports + finance self-contained._
