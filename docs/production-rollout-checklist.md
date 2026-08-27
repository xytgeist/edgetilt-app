# Production rollout checklist (mirror from **test**)

**Post cutover (2026-06-30):** **Production** Supabase = **`jtjgtucumuoswnbauxry`** (`edgetilt.com`). **Test** = **`kcosfvmreeiosdjdzycb`** (`lvslotpro.com`). One-time cutover steps: **`docs/edgetilt-production-cutover.md`**.

**Workflow:** Ship the **full feature set on test first** (`kcosfvmreeiosdjdzycb` + `lvslotpro.com`), then **replay** on **production** (`jtjgtucumuoswnbauxry` + `edgetilt.com`) so prod never drifts behind what you validated on test.

**Doc routing for agents:** Root **`AGENTS.md`** explains when to edit this file vs `docs/test-buildout-backlog.md` vs roadmap after infra or smoke changes.

**Do not paste secrets into this file.** Rotate secrets independently via dashboards/Vercel.

---

## 1. Prerequisites before flipping prod traffic

- [ ] Confirm **`origin/main`** (or whichever Git/Vercel branch fronts **`edgetilt.com`**) carries exactly what should ship.
- [ ] Confirm **production** Supabase project ref **`jtjgtucumuoswnbauxry`** is intentional CLI/UI link (`supabase link --project-ref jtjgtucumuoswnbauxry`).
- [ ] Confirm **Vercel** production env has **`VITE_SUPABASE_URL`** / **`VITE_SUPABASE_ANON_KEY`** (and any other `VITE_*`) pointed at **production** (`jtjgtucumuoswnbauxry`).
- [ ] **AP Guide ingest API** (if prod hosts **`/api/slot-guide-ingest`** or editors use prod target): **`SUPABASE_URL_PRODUCTION`** + **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`** (or plain **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** when only one project). **Preview / test deploy** (e.g. **tx18**): **`SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** for **test** project — **service_role**, not anon. No repo **`.env.supabase.*`** on Vercel; **`scripts/lib/supabaseEnv.mjs`** reads dashboard vars @ **`24d0412`**.
- [ ] Prefer a **no-op or tagged deploy** after env changes if clients cache aggressively.

---

## 2. Database — SQL to run in production (order matters)

> **Two gotchas learned applying `20260826120000_apple_iap_voip.sql` to test (2026-08-26):**
>
> 1. **`npm run db:query:* -- -f <file>` cannot run multi-statement files.** It goes through `supabase db query`, which uses a prepared statement, so anything with more than one statement dies on `cannot insert multiple commands into a prepared statement`. Use the **Dashboard SQL Editor** for multi-statement migrations, or split into one statement per file.
> 2. **`supabase db push` is NOT usable on this repo.** Many migrations were applied out-of-band and are missing from `supabase_migrations.schema_migrations`, so push tries to replay old ones (it attempted `20260520120000` and failed on a `create or replace function` return-type change). If you apply a migration by hand, **record it** afterward:
>
> ```sql
> insert into supabase_migrations.schema_migrations (version, name)
> values ('20260826120000','apple_iap_voip') on conflict (version) do nothing;
> ```

Apply in the **Supabase Dashboard → SQL Editor** for **production**, or via CLI from this repo after linking production:

```bash
supabase link --project-ref jtjgtucumuoswnbauxry --yes
npm run db:query:production -- -f supabase/community_feed_posts.sql
npm run db:query:production -- -f supabase/feed_phase_a_profiles_public_read.sql
```

Set **`SUPABASE_DB_PASSWORD`** in **`.env.supabase.production`** (copy **`.env.supabase.example`**) so CLI SQL avoids pooler **`cli_login_postgres`** auth failures.

Track **everything else** already used on test that production must also have applied (reconcile against test SQL history / migrations folder). Common project shapes include (verify test actually has these before copying blindly):

- [ ] `community_feed_posts.sql` — base home feed table + baseline trigger
- [ ] `feed_phase_a_profiles_public_read.sql` — **`profiles`**, moderation columns, **public anon read** RLS, staff policies, guards
- [ ] `profiles_tier_testing.sql` — **`has_active_subscription`** + guard trigger (subscriber UI + testing; run after phase A file)
- [ ] **`profiles_is_og.sql`** — **`profiles.is_og`** boolean + one-time backfill (first 1000 profiles by **`created_at`**, tie-break **`user_id`**); Lounge **`LoungeOgBadge`** reads it (run after phase A **`profiles`** exists)
- [ ] **`profiles_is_og_assign_on_insert.sql`** — trigger: new **`profiles`** rows get **`is_og = true`** while total profile count < 1000 (re-run **`profiles_is_og.sql`** backfill after deploy to fix existing accounts in the cohort)
- [ ] **`profile_follow_edgelord_on_insert.sql`** — AFTER INSERT on **`profiles`**: mutual **`profile_follows`** with handle **`edgelord`** (requires that account to exist; optional backfill block at file bottom for pre-trigger accounts)
- [ ] **`lounge_feed_post_stream_video.sql`** — **`community_feed_posts.stream_video_uid`** plus optional **`stream_poster_url`**, **`stream_video_width`**, **`stream_video_height`** (stored tile poster on **R2** when configured, else legacy **`lounge-feed`**) for Lounge **Cloudflare Stream** video posts (required before current client inserts video)
- [ ] **`supabase/migrations/20260515180000_feed_comments_body_max_280.sql`** — `feed_comments.body` max **280** (matches captions); truncates existing long rows then replaces **`feed_comments_body_len`** check (**run test before prod**; optional no-op if table empty).
- [ ] **`supabase/migrations/20260515183000_feed_comments_author_update.sql`** — **`feed_comments_update_own`** RLS + **`grant update`** + **`feed_comments_guard_identity_fields`** trigger so authors can **edit** replies from Lounge post detail ⋯ menu (**run after `feed_comments` exists**).
- [ ] **`supabase/migrations/20260515190000_feed_comment_interactions.sql`** — per-comment **`like_count` / `repost_count` / `bookmark_count`** + **`feed_comment_likes` / `feed_comment_reposts` / `feed_comment_bookmarks`** (RLS + triggers). Required for post-detail comment interaction bar counts and toggles (**run after `feed_comments` exists**).
- [ ] **`supabase/migrations/20260518103000_fix_rate_limit_profiles_user_id.sql`** — rate-limit guard uses **`profiles.user_id`** (not stale column name); required for Lounge post rate limiting on current schema.
- [ ] **`supabase/migrations/20260518150000_restore_profile_handle_change_cooldown.sql`** — restore **7-day** handle change cooldown trigger + **`handle_changed_at`** guard after any interim removal migration.
- [ ] **`supabase/migrations/20260518160000_lounge_search_phase_g.sql`** — Phase G **`pg_trgm`** indexes + auth-gated **`lounge_search_posts`** / **`lounge_search_profiles`** (requires **`pg_trgm`** extension; run before dock search smoke).
- [ ] **`supabase/migrations/20260519120000_lounge_search_comments.sql`** — **`lounge_search_comments`** RPC + trgm index on **`feed_comments.body`** (comment search in unified post+comment feed).
- [ ] **`supabase/migrations/20260520120000_lounge_search_profiles_about_me.sql`** — **`lounge_search_profiles`** returns **`about_me`** for dock profile result rows.
- [ ] **`supabase/migrations/20260520150000_lounge_search_ranking_rate_limit.sql`** — **`pg_trgm` `similarity()` ranking**, **`@handle`** profile/post bias, **`p_sort`** (`engagement` / `recent`), shared **`lounge_search`** rate limit (~30 searches / 5 min).
- [ ] **`supabase/migrations/20260520160000_lounge_search_hardening.sql`** — 128-char query cap, **`strpos`/`starts_with`** (no LIKE wildcards), **5s `statement_timeout`** per search RPC.
- [ ] **`supabase/migrations/20260520170000_lounge_search_bundled.sql`** — **`lounge_search()`** bundled RPC (posts + profiles + comments + pagination meta), **`lounge_search_text_matches`** (escaped LIKE + trgm), profile **`about_me`** search, **`lounge_search_analytics`**, rate limit **30 / 5 min** per call; revoke split RPC **`authenticated`** execute.
- [ ] **`supabase/migrations/20260520180000_lounge_search_handle_keyword.sql`** — **`@handle keyword`** compound queries (e.g. **`@selena buffalo`**).
- [ ] Any earlier schema you rely on: **`offers`** / **`offer_events`**, **`push_subscriptions`**, notification SQL, etc. — mirror **test** `supabase/` files that are not yet on prod
- [ ] **Chat Phase 2** — apply **`supabase/migrations/20260601120000_chat_phase2.sql`** (adds read receipts, reactions, soft delete, reply columns, `chat_message_reactions` + trigger). Apply **after** `chat_phase1.sql` (base chat tables). Redeploy `lounge-chat` Edge (§4) after this migration.
- [ ] **Chat link previews** — **`20260604180000_link_previews_chat_and_lounge.sql`**, **`20260604180100_chat_messages_rpc_link_preview.sql`** (after Phase 2 + group migrations you ship). Deploy **`lounge-link-unfurl`** (§4). Do **not** re-run **`20260601160000_chat_messages_page_catchup.sql`** after `041801`.
- [ ] **Chat group delete** — **`20260605120000_chat_group_delete.sql`** (empty-group trigger + **`chat_delete_group`** RPC). No Edge redeploy required for trigger path; client uses RPC only.
- [ ] **`supabase/migrations/20260701130000_starter_weekly_guide_unlocks.sql`** — Starter weekly drop table + **`grant_starter_weekly_guide_drop`** (included in Stripe billing chain through **`20260701160000`** if that promote already ran).
- [ ] **`supabase/migrations/20260702120000_starter_weekly_drop_reveal_cron.sql`** — scratch reveal column, **`starter_weekly_guide_drop`** activity type, weekly pg_cron (**Mon 00:10 UTC**), reveal RPCs. **Prereqs:** **`pg_cron`** enabled; **`@edgelord`** profile exists (system actor for notifications). Redeploy **`lounge-send-activity-push`** (§4) after apply.
- [x] **Chat archive inbox** — apply in order: **`20260702150000_chat_room_member_archive.sql`** (`archived_at`, **`chat_archive_room`**, inbox/unread exclude archived), **`20260702160000_chat_archived_rooms_list.sql`** (**`chat_unarchive_room`**, archived list RPCs), **`20260702170000_chat_unarchive_notifications_comment.sql`** (comments only; safe re-run). Redeploy **`lounge-chat`** (§4) after apply.
- [x] **Lounge strict hashtag search** — **`20260702210000_lounge_search_strict_hashtag.sql`** (**`lounge_search_hashtag_posts`**; Ryan sign-off **2026-07-02**, client **`a496a97`**).
- [ ] **Lounge caption cap 500** — **`20260703130000_lounge_caption_500.sql`** (posts, comments, drafts, thread draft validator; client **`LOUNGE_CAPTION_MAX`** = 500, feed collapse **`LOUNGE_CAPTION_DISPLAY_MAX`** = 320).
- [ ] **Creator fan subs (2026-07-21 promote, `main` @ `c95c6109`):** apply in order on **`jtjgtucumuoswnbauxry`** — use **`npm run db:query:production -- -f …`** (npm treats bare **`-f`** as **`--force`**, not the SQL file flag):
  - **`20260720180000_creator_fan_subs_foundation.sql`**
  - **`20260720190000_creator_fan_offer_copy.sql`**
  - **`20260720195000_profile_feed_mutes.sql`**
  - **`20260721210000_creator_fan_portal_subscribers.sql`** (Fan hub stats/list RPCs, **`creator_fan_sub`** activity + **`creator_fan_notify_new_subscriber`**; redeploy **`stripe-webhook`** + **`lounge-send-activity-push`** after apply — **`main`** @ **`89103efc`**, Ryan promote **2026-07-21**)
  - **`20260722210000_creator_fan_reconcile_cron.sql`** (daily **`invoke_creator_fan_reconcile_stripe`** → **`creator-fan-reconcile-stripe`**; redeploy that Edge + **`stripe-webhook`** for ops failure emails)
  Live **`STRIPE_PRICE_FAN_TIER_*`** Edge secrets (five tiers) + Connect-capable Prices; redeploy **`creator-fan-connect`**, **`creator-fan-checkout`**, **`creator-fan-resume-subscription`**, **`stripe-create-portal-session`**, **`stripe-webhook`** (§4). Smoke: Settings **Subscriptions**, profile **SUB** / subscribe modal, cancel + resume, **Creators I support** → profile; own-profile **Fan hub**, new-sub **Alerts**.
- [x] **Fan-only Lounge feed UX + repost/quote (2026-07-22, `main` @ `970fc185`):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260722230000`**, **`20260722230100`**, **`20260722230200`**, **`20260722240000`**, **`20260722260000`** (masked feed RPCs, subs-only compose guard, comment SELECT for fan-only parents, post repost/quote allowed with comment-repost still blocked). **No Edge redeploy.** Frontend: Vercel **`edgetilt.com`**. Smoke: compose **Subs only**, locked blur + subscribe CTA, quote repost with locked embed inset, plain repost of subs-only source.
- [x] **Lounge staged video publish (2026-07-25, `main` @ `3f48b328`):** **`20260725210000_lounge_feed_visible_at.sql`** — **`feed_visible_at`** column + feed RPC author-only pending filter. Redeploy **`lounge-cf-stream-video-status`** (§4). No other Edge redeploy for this promote.
- [x] **Poker Bankroll Manager (2026-07-29 promote):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260729000000`**, **`20260729010000`**, **`20260729020000`**, **`20260729030000`**, **`20260730000000`** (Stable deals / On Stake bones; hub tile **Coming soon**), **`20260730010000`**, **`20260730020000`**, **`20260730030000`**. **No Edge redeploy.** Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Smoke: Poker hub → Bankroll set roll → log cash/tourney → Overview/Details/Trend/Locations/Charts; Stable tile not clickable.
- [x] **Poker Bankroll follow-up (2026-07-29, `main` @ `6c055e17`):** frontend-only **`test` → `main`** ... full PBT / Poker Income CSV field mapping + Overview **Purge all sessions**. **No new SQL / Edge.** Smoke: import sample PBT CSV; purge confirms then clears Personal or On Stake scope and reverses P/L.
- [x] **Casino LV geo gaps (2026-07-29):** **`20260730120000_casinos_lv_geo_gaps.sql`** applied on **`jtjgtucumuoswnbauxry`** ... Horseshoe Las Vegas + Harrah's / Sahara / Strat / Palazzo / Hard Rock / Rio / Palms / South Point lat/lng. **No Edge / frontend.** Smoke: at Horseshoe, Near you / GPS autofill ranks Horseshoe Las Vegas.
- [x] **Poker tournament swaps (2026-07-30 promote, feature tip `44ba6b13`, client tip `5bde2e48`):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260730140000`** (soft events + swaps + claim tokens/RPCs), **`20260730150000`** (`poker_tournament_swap` activity), **`20260730160000`** (`poker_tournament_swap_result` + `detail_text` / swap id on activity page), **`20260730170000`** (Realtime on swaps), **`20260730180100`** (`last_activity_at` soft-event window). Redeploy **`poker-tournament-swap-notify`** + **`lounge-send-activity-push`**. Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Secrets: confirm **`PUBLIC_APP_URL=https://edgetilt.com`**; guest SMS needs **`TWILIO_*`** (API key preferred) + From number when ready; Resend already used for email. Smoke: Start/Log tourney → add Edge/guest swap → Send swap on live session → Incoming Accept / claim link → end session syncs your result → Mark settled when IOU ≠ 0; session cards show **Swaps** + Settled `(+$x)` / `(-$x)`.
- [x] **Poker multi-flight series watermark (2026-08-14 promote):** applied **`20260814170000`** on **`jtjgtucumuoswnbauxry`**. **No Edge redeploy.** Frontend via **`test` → `main`**. Smoke: Day 1B then Day 1C same name/venue/buy-in shows prior bullets; new swap defaults this-bullet-forward; 1B swap still listed on 1C; Day 1 bust leaves swap open.
- [x] **Poker swap terms (2026-08-14 promote):** applied **`20260814140000`**, **`20260814150000`**, **`20260814160000`** on **`jtjgtucumuoswnbauxry`**. **No Edge redeploy.** Frontend via **`test` → `main`**. Smoke: default extras-at-face (3 bullets vs 1, both bust, 10% → $200); % is of prize not prize−buy-in; both-must-cash busts settle $0; final-bullet skips extras; final-table waits for finish place then voids if neither made 9 (or 6 if 6-max).
- [x] **Poker swap Minimum cash threshold term (2026-08-15 promote):** applied **`20260815120000`** on **`jtjgtucumuoswnbauxry`**. **No Edge redeploy.** Frontend via **`test` → `main`**. Smoke: threshold met by one side settles; neither hits → $0; exact threshold activates; label shows **Minimum cash threshold $…**.
- [x] **Poker swap independent books (promoted 2026-08-16):** applied **`20260816130000`** then **`20260816140000`** then **`20260816150000`** on **`jtjgtucumuoswnbauxry`**, redeployed **`poker-tournament-swap-notify`**, frontend on **`main`** @ **`e7427061`**. `140000`/`150000` supersede the mandatory re-accept model from `130000`: each Edge player edits, calculates, settles, and unsets only their own books / personal-bankroll entry (posted amount snapped so Unsettled reverses the same dollars); the other player receives an informational revision Alert with optional **Use their terms** / **Keep mine**. Smoke with two accounts: A edits 5% → 10%; B stays 5% and can settle; A settles only A bankroll; B chooses Keep mine and settles only B bankroll.
- [x] **Poker tournament catalog + currency (2026-07-30 promote):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260730210000`** (catalog `source` / `external_id`, upsert RPC), **`20260730220000`** (`starts_at`), **`20260730230000`** (fingerprint sibling upsert). Run **`supabase/seed/poker_catalog_casinos_patch.sql`** (safe re-run). **`npm run poker:catalog:sync:production`** (MTTDB live + online + regional JSON; geocodes new **`casinos`** rows). Prod pooler: **`aws-1-us-east-1`** — set **`SUPABASE_DB_URL`** in **`.env.supabase.production`** (see **`.env.supabase.example`**). Helper: **`node scripts/apply-prod-poker-catalog.mjs`**. **Scheduled sync:** Windows Task Scheduler on the home PC (daily 2:00 AM, `scripts/install-poker-catalog-windows-task.ps1`). GitHub Actions **`.github/workflows/poker-catalog-sync-production.yml`** is **manual dispatch only**. Repo secrets: **`SUPABASE_URL_PRODUCTION`**, **`SUPABASE_SERVICE_ROLE_KEY_PRODUCTION`**. Sync auto-maps unknown MTTDB online sites + geocodes live venues (satellites included). **No Edge redeploy.** Frontend: merge **`test` → `main`** for currency-from-venue UI + catalog picker. Smoke: GPS at Strip → Poker → Start session → Tournament dropdown shows today/tomorrow buy-ins + distance; online site picks EUR/CAD/SEK where mapped; **`select count(*) from poker_tournament_events where source='catalog'`** ≈ **2165** after first sync. **Note (2026-08-13):** Actions egress often gets MTTDB **HTTP 403** (Cloudflare); job correctly fails if online scrape is empty. Workaround: run **`npm run poker:catalog:sync:production`** from a residential IP (last manual refill **2382** upserted). Fetch hardening in **`mttdbCatalogFetch.mjs`** may not beat hard IP bans.
- [x] **Slots Pro Lounge + chat pinned inbox (2026-07-31 promote, `main` @ `749e5eb7`):** apply **`20260731000000_platform_slots_pro_lounge.sql`** on **`jtjgtucumuoswnbauxry`** via **`node scripts/apply-migration-once.mjs --target=production 20260731000000_platform_slots_pro_lounge.sql`** (multi-statement; do not use bare **`db:query:production -f`**). Redeploy **`stripe-webhook`** + **`lounge-chat`**. Frontend: Vercel **`edgetilt.com`**. Smoke: **Private Subs** → **Slots Pro Lounge** (Pro/Lifetime only); **Slots** hub tool; Starter subscribe gate; pinned inbox styling (also in this merge).
- [x] **Chat nav + lounge post embeds + FAB dock panels (2026-07-31 promote, `main` @ `2a61df56`):** frontend-only **`test` → `main`**. **No new SQL / Edge.** Ships: direct **Slots → Slots Pro Lounge** open (no Private Subs flash); keep-alive **Chat** + lounge post link preview → back to same room; quote-style lounge post insets in chat; carousel swipe vs timestamp reveal fix; **Private Subs** / **platform_sub** back returns to Private Subs tab; FAB **Settings** / Search / Notifications from Slots tools stays on current tab (portaled overlay, single close). Smoke: Slots hub lounge path; chat post preview round-trip; Logbook → FAB → Settings → close.
- [x] **AP guide anti-scrape + Monitor Security tab (2026-07-31 promote, `main` @ `a9dbba78`):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260731160000`** (revoke `content_markdown` SELECT, `get_guide_content`, audit), **`20260731170000`** (`admin_ops_security_snapshot`), **`20260731180000`** (emoji **`## 🎭 Skins`** backfill fix). Redeploy **`casino-places-search`** (JWT gate). Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Spec: **`docs/security-anti-scrape-roadmap.md`**. Smoke: free/Starter/Pro guide expand; skin search (**`dancing`** on 88 Fortunes); **`/slot-guide-form`** load/save; Monitor **Security** tab; direct PostgREST markdown select fails for anon.
- [x] **Edge Monitor app section analytics depth (2026-07-31 promote, `main` @ `dc28434c`):** apply in order on **`jtjgtucumuoswnbauxry`** via **`node scripts/apply-migration-once.mjs --target=production`** — **`20260731220000`** through **`20260731222200`** (sub-section drill-down, admin/staff/bot exclusions, intel section drop, member usage snapshot RPC). **No Edge redeploy.** Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Smoke: Monitor **Product** tab → section usage charts, collapsible all-sections table, member top 25 + `@handle` lookup; excluded staff accounts absent from aggregates.
- [x] **Edge Monitor member Lounge analytics + top contributors (2026-07-31 promote, `main` @ `567070d6`):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260731222300`**, **`22400`**, **`22500`**. **`22500`** fixes prod error when legacy **`post_reposts`** table is missing (feed-card reposts only). **No Edge redeploy.** Smoke: Monitor **Product** → **Top app activity** + **Top Lounge contributors** tables; expand row → Lounge posts/comments/interactions + app section breakdown; `@handle` search for off-list members.
- [x] **Poker Stable v2 + bankroll polish (2026-08-01 promote, `main` @ `54d865e1`):** apply in order on **`jtjgtucumuoswnbauxry`** via **`node scripts/apply-migration-once.mjs --target=production`** — **`20260801000000`** through **`20260802120000`** (12 migrations: v2 foundation, slices, terms, settle v2a, guest notify hooks, RLS fixes). Redeploy **`poker-stable-notify`** + **`poker-tournament-swap-notify`**. Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Secrets: confirm **`PUBLIC_APP_URL=https://edgetilt.com`**; guest stake/swap SMS needs **`TWILIO_*`** + From when ready. Smoke: Poker → Bankroll **+ Stake** → guest email/SMS on create; backer **Accept slice** in Stable; On Stake log session → End Session guest notify; swap claim link uses **edgetilt.com**; light mode money green on bankroll/session cards.
- [x] **Poker Stable block settle while pending Commit (2026-08-06 promote):** SQL **`20260806030000`** applied on **test + prod**. Frontend via `test` → `main`. **No Edge redeploy.** Smoke: counterparty with Needs attn settle → Periodic settlement / Close stake disabled + “Awaiting settlement · Commit the current settlement first.” → Commit → settle buttons re-enable; initiator can still settle again without waiting.
- [x] **Poker Stable backer hide Closed stake (2026-08-06 promote):** SQL **`20260806120000`** applied on **test + prod**. Frontend via `test` → `main`. **No Edge redeploy.** Smoke: Closed stakes → Delete → confirm → card gone from Closed stakes; player ARCHIVE unchanged.
- [x] **Poker Stable stakee hide archived stake (2026-08-16 promote):** applied **`20260816160000`** on **`jtjgtucumuoswnbauxry`**. Frontend via **`test` → `main`** @ **`e90a116b`**. **No Edge redeploy.** Smoke: Bankroll → Archive → Delete archived stake → **Keep sessions** leaves merged personal history/metrics; **Delete sessions** removes those personal rows/metrics; backer Closed history and settled bankroll balances remain unchanged.

- [x] **Anon-execute lockdown, stage 1 (2026-08-27):** applied **`20260827150000`** on **test then prod**, recorded on both. **No Edge redeploy, no frontend change.** Closes the audit the entry below asked for: prod had **400 of 424** `public` functions executable by **`anon`**, including **`poker_stable_backer_adjust_balance`** (writes a bankroll balance, zero caller check) and every **`invoke_*`** vault/Edge wrapper. Two `admin_ops_monitor_*` helpers were **confirmed returning live data to a logged-out anon key**. **⚠️ Revoke order is load-bearing:** `grant execute … to service_role` **first**, then `revoke … from public`, then `anon` / `authenticated` … some functions reached Edge and cron *through* the `PUBLIC` grant, so dropping `PUBLIC` without pinning `service_role` first is an outage. And `revoke … from anon` alone is a **no-op** against a `PUBLIC` grant (25 functions survived the first pass that way). **Do not** revoke read-only helpers … RLS policies and views evaluate some as the querying role. Verify with `has_function_privilege('anon', oid, 'execute')` = **false** plus a real anon-key HTTP probe, then check `cron.job_run_details` for an hour (was 220 ok / 0 failed).
- [x] **Drop stale `upsert_my_apns_device_token` overload (2026-08-27):** applied **`20260827140000`** on **test then prod**, recorded on both. Drops the 4-arg signature left behind by `20260826120000` (**`create or replace` with a different arg count adds an overload, it does not replace**), which made the RPC ambiguous (`PGRST203`) for any stale client sending four args. Also re-applied the grants the 5-arg never got. **⚠️ `revoke all … from public` does NOT remove anon on Supabase** … anon/authenticated are granted **by name** via `ALTER DEFAULT PRIVILEGES`, so `anon` must be revoked explicitly. Verify with `has_function_privilege('anon', oid, 'execute')` = **false**, not by reading the revoke statement. Final ACL both projects: `{postgres=X,authenticated=X,service_role=X}`.
- [x] **Apple IAP + VoIP push channel (2026-08-27 promote):** applied **`20260826120000_apple_iap_voip.sql`** on **`jtjgtucumuoswnbauxry`** as **8 single statements**, recorded the version, deployed **`apple-iap-verify`**, and **redeployed `lounge-send-activity-push` + `send-test-push`** … required, because shared **`_shared/apnsPush.ts`** now filters `push_channel` (`alert` for banners, `voip` for PushKit). Existing 15 `user_subscriptions` rows default to **`stripe`** (no subscriber affected). **`apns_device_tokens_token_key`** constraint replaced by unique **`(token, push_channel)`** … it is a *constraint*, so `drop index` alone cannot remove it. **⚠️ `_shared/` imports are part of a function's schema contract:** deploying a sender before its column exists is a latent outage; audit the whole import tree, not just `index.ts`. **🟡 Known:** `upsert_my_apns_device_token` now has **two** overloads (4-arg + 5-arg) on prod *and* test … current clients send all 5 named params so they resolve fine, but a stale client sending 4 hits `PGRST203`; drop the 4-arg signature on both projects when Ryan okays it. **Blocked on Apple, not us:** IAP cannot transact until App Store Connect has products matching `EdgeStoreKitManager` ids.
- [x] **Offer reminder duplicate sends (2026-08-27 promote … prod was sending 2-3× since 2026-05-07):** applied **`20260827130000_offer_sends_dedupe_by_fire_time.sql`** on **`jtjgtucumuoswnbauxry`** as **6 separate statements** (`db:query -f` cannot run multi-statement files), then **immediately** redeployed Edge **`send-due-offer-reminders`** … reverse order 500s every tick because the new function selects `alert_fire_at`. Also dropped cron job **`send-due-offer-reminders-5m`** (`*/5`, jobid 1) and recorded **`20260827130000`** in `schema_migrations`. **Never pause `send_due_offer_reminders_minute`** (jobid 50) … `lookaheadMinutes=1` makes it the load-bearing cadence, and the candidate window is only ~3 min wide, which is why the `*/5` job both double-fired and had a dead zone. **Verify with response bodies, not job status:** `net._http_response` must show **`logWriteErrors`** present (proves the new build) and **one** invocation per minute. `invoke_send_due_offer_reminders()` swallows errors into `raise warning`, so `cron.job_run_details` says `succeeded` even on a silent no-send. **Security:** the dropped `*/5` job had a prod **`sb_secret_…`** inline in its header; the surviving job reads vault secrets via `SECURITY DEFINER`. Never hardcode a bearer in `cron.job.command`. **Still owed:** web deep link (`2a82a5cb`) on `main` + iPhone PWA wake smoke (users must fully force-close the PWA for the new `push-sw.js`).
- [x] **EdgeiOS APNs (2026-08-26 promote):** applied **`20260825210000_apns_device_tokens.sql`** on **`jtjgtucumuoswnbauxry`** via **`apply-migration-once.mjs`**. Set Edge secrets **`APNS_KEY_ID`** + **`APNS_P8`** (full Auth Key PEM). Redeployed **`lounge-send-activity-push`**, **`send-test-push`**, **`send-due-offer-reminders`**. Optional **`APNS_TEAM_ID`** / **`APNS_BUNDLE_ID`** default to **`8932AKQW4W`** / **`com.edgetilt.app`**. Tap deep links already signed on test IPA. **Ryan prod smoke PASSED 2026-08-26** (EdgeTilt / edgetilt.com … like → banner). Dev-signed IPA still uses sandbox APNs tokens; host retry covers `BadEnvironmentKeyInToken` (`698749b1`).
- [x] **Poker Stable pending-play sessions (2026-08-06 promote):** SQL **`20260806020000`** applied on test + prod during session. Frontend via `test` → `main`. **No Edge redeploy.** Smoke: player-initiated pending stake → Start Session from stake card → sessions on player history; backer Stable blind until Accept → then sees history; delete session → ledger audit line with P/L; last backer decline → sessions move to personal; hero shows accepted vs pending backing $.
- [x] **Poker Stable close UX + tournament player-only close (2026-08-12 promote):** SQL **`20260812130000`** applied on **test + prod**. Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. **No Edge redeploy.** Ships: Close & Archive for closer; close-sheet copy trims; backer Overall P/L camelCase fix; tournament package close restricted to Edge player. Smoke: multi-backer tournament → backer horse has no Close; player Close & Archive; cash backer can still close cash stakes.
- [x] **Poker session piece stake + live pause (2026-08-14 promote):** applied **`20260814120000`** then **`20260814130000`** on **`jtjgtucumuoswnbauxry`**. **No Edge redeploy.** Frontend via **`test` → `main`**. Smoke: personal Start Session → Backers → guest 50% → start → End Session → stake gone from carousel; pause still works on the live card.
- [x] **W-2G tax archive + Poker Stable Aug 10–11 catch-up (2026-08-11 promote):** applied **`20260810120000`**–**`20260811420000`** (36 files) on **`jtjgtucumuoswnbauxry`** … includes Stable terms/close/ledger/swap bankroll chain + **`w2g_slips`** / private **`w2g-slips`** bucket / **`verified_at`** / **`attention_reason`**. First apply of **`20260810120000`** needed **`poker_stable_terms_edited`** kept in the activity check (prod had 5 historical rows). Deployed Edge **`w2g-vision-extract`** (uses existing **`OPENAI_API_KEY`**). Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Smoke: Slots → W-2G Scanner → scan/save → My W-2Gs Verify; Starter+ bulk + AI extract; Collate → casino card → per-slip Verify; ATTN corner fix + Rotate on toolbar.

- [x] **Poker Stable backer closed horse + settle commit inline (2026-08-05 promote, `main` @ `4fb513ab`):** apply in order on **`jtjgtucumuoswnbauxry`** — **`20260805120000`** (slice **`stable_archived_at`** + **`poker_stable_backer_archive_stable_deal`**), **`20260805130000`** (archive declined slices on terminal deals), **`20260805140000`** (backer slice delete on revoked for re-offer). Applied **test + prod** during session. Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. **No Edge redeploy.** Smoke: player close settle → backer carousel **Review stake** → horse deal **Overview** inline **Commit** (not stacked modal) → **Archive stake** → Closed stakes; revoke → Create Stake same label → single deal row; archive revoked stake (was **"Stake cannot be archived yet"**). Ryan: archive ghost test deals if carousel still shows duplicates from pre-fix rows.
- [x] **Poker Stable backer bankroll + guest stakee claim (2026-08-03 promote, `main` @ `7c0a8094`):** apply in order on **`jtjgtucumuoswnbauxry`** via **`node scripts/apply-migration-once.mjs --target=production`** — **`20260802170000`** through **`20260803140000`** (17 migrations: activity events, settlement sync, stake reduction, smoke checklist, unilateral commit sync, backer bankroll pool + deposit/withdraw + guest stakee + claim tokens/RPCs, pending allocation hold-only debit, ledger reconcile). Redeploy **`poker-stable-notify`** + **`lounge-send-activity-push`**. Frontend: Vercel **`edgetilt.com`** via **`test` → `main`**. Auth: confirm **`https://edgetilt.com/poker-stake-claim`** on redirect allow list; prod auth email templates already branded. Smoke: Stable **Create Stake** → guest branded email with **`/poker-stake-claim`** link → signup/confirm → auto-link → Bankroll **Accept** or counter; hero **Backing bankroll** vs **(−$X pending)**; Create Stake **Available bankroll** subtracts pending holds.
- [ ] **Lounge bots (Scott Share / Market Edge / portal)** — apply in order (skip any already applied): **`20260703140000`** through **`20260703160000`** (bot accounts, portal snapshot, odds config), **`20260704120000`**–**`20260704220000`** (sports tribe through reply on any post), **`20260704230000`**–**`20260704240000`** (odds poll pg_cron + 6–8am Coffee / 15-min `poll_edges`), **`20260704250000`**–**`20260704330000`** (line movement through coverage scope), **`20260705020000`**–**`20260705050000`** (Market Edge / Crypto Edge), **`20260705060000`**–**`20260710160000`** (portal async queue, slug fix, pg_net result, invoke `force`, Yahoo/MW RSS, **`poll_live`**, bot Post as images, **per-alert `p_alert_kind` queue**). Vault per project: **`lounge_odds_poll_*`**, **`lounge_news_poll_*`** (see Edge READMEs). Redeploy **`lounge-odds-ingest`** + **`lounge-odds-poll`** + **`lounge-news-poll`** + **`lounge-x-ingest`** after relevant migrations; set **`THE_ODDS_API_KEY`** / **`FINNHUB_API_KEY`** / **`OPENAI_API_KEY`** on prod Edge. **Jul 2026 verified on prod:** cron **200**, **`poll_edges`** fixed **`1d5d8fca`**, **`poll_live`** **`20260706190000`**, Market Edge Yahoo/MW, X manual transform + bot images **`30fa305e`**. **`schema_migrations`** on test + prod through **`20260707000000`** (Jul 7 batch); earlier July rows may predate table entries — verify via source rows / function bodies.
- [ ] **Play Logbook (if prod ships Logbook):** apply test-validated chain through **`20260531540000_buffalo_calculator_slug_buffalo_link.sql`** — base **`20260529120000_play_logbook.sql`**, shared sessions **`20260531140000`**, manager/paid **`20260531190000`**, paid/unpaid notify repair order (**`20260531300000`** → **`20260531310000`**, repair **`20260531320000`** if needed), custom metrics **`20260531350000`**, admin primary templates **`20260531400000`**, MHB fields **`20260531500000`**, label migrations **`20260531330000`**–**`20260531360000`**, **`20260531510000`**–**`20260531530000`**, **`20260531540000`**. Redeploy **`lounge-send-activity-push`** after activity-event migrations.

**After deploy — quick smoke SQL (production):**

```sql
select to_regclass('public.profiles')       as profiles_tbl,
       to_regclass('public.community_feed_posts') as feed_posts_tbl;
```

Expect both non-null.

---

## 3. First admin & staff bootstrap (production)

`profiles.role` changes are **admin-only** via trigger. No row → no admin bypass from the app.

After your **production** user creates their first `profiles` row (from the future Account / gate flow, or a one-off authenticated insert from a trusted path):

```sql
-- Replace <YOUR_USER_UUID> with auth.users.id (production).
update public.profiles
set role = 'admin'
where user_id = '<YOUR_USER_UUID>';
```

Prefer running as **postgres / service role** in SQL editor if RLS interferes during bootstrap.

Moderators → `role = 'moderator'` same way, logged in as existing **admin**.

---

## 3.5 Cloudflare R2 — Lounge feed images (mirror **test**)

Before Edge deploy (§4), set up **production** media on a Cloudflare zone you control (e.g. **`lvslotpro.com`** or future prod domain):

- [ ] **R2 bucket** (e.g. `lounge-media`) in the same CF account as Stream.
- [ ] **Custom domain** on the bucket (e.g. **`media.lvslotpro.com`** for prod; test uses **`media-test.lvslotpro.com`**).
- [ ] **CORS** on bucket: **`AllowedHeaders`** includes **`Content-Type`** and **`Cache-Control`**; **`AllowedOrigins`** include prod app URL(s) + localhost dev.
- [ ] **R2 API token** (Object Read & Write, scoped to bucket) → Supabase Edge secrets (§4).
- [ ] Optional: **Image Resizing** on zone (Pro+) for **`/cdn-cgi/image/`**; else set **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** on Vercel (client-side WebP prep is sufficient for launch).

**One-time legacy migration** (if prod still has **`lounge-feed`** URLs in DB):

1. Deploy **`lounge-cf-r2-migrate-lounge-feed`** (§4).
2. `node scripts/migrate-lounge-feed-to-r2.mjs --target=production --dry-run` then without `--dry-run`.
3. Deploy **`lounge-cf-r2-backfill-cache-control`**; run `node scripts/backfill-r2-cache-control.mjs --target=production`.

Uploads set object metadata **`Cache-Control: public, max-age=31536000, immutable`** (content-addressed keys).

---

## 4. Supabase Edge Functions (parity with **test**)

After DB + env are correct, redeploy edge functions whose **logical code lives in repo** (`supabase/functions/…`) against **production** so versions don’t drift:

```bash
supabase link --project-ref jtjgtucumuoswnbauxry --yes
supabase functions deploy process-offer-uploads
supabase functions deploy get-web-push-config
supabase functions deploy send-test-push
supabase functions deploy send-due-offer-reminders
supabase functions deploy lounge-cf-stream-direct-upload
supabase functions deploy lounge-cf-stream-delete-video
supabase functions deploy lounge-cf-stream-delete-orphan
supabase functions deploy lounge-cf-stream-purge-pending-uploads
supabase functions deploy lounge-cf-stream-video-status
supabase functions deploy lounge-cf-r2-direct-upload
supabase functions deploy lounge-cf-r2-delete-object
supabase functions deploy lounge-cf-r2-delete-orphan
# Ops-only (service role bearer); deploy before one-off migrate/backfill, optional to leave deployed:
supabase functions deploy lounge-cf-r2-migrate-lounge-feed
supabase functions deploy lounge-cf-r2-backfill-cache-control
# Chat Phase 2 — extended actions (delete_message, reactions, read receipts, mute):
supabase functions deploy lounge-chat
# Chat + Lounge link previews (OG unfurl + attach):
supabase functions deploy lounge-link-unfurl
# Starter weekly drop push deep links (after migration 20260702120000):
supabase functions deploy lounge-send-activity-push
# Poker tournament swaps (after migrations 20260730140000–180000):
supabase functions deploy poker-tournament-swap-notify
# Poker Stable guest stake/session notify (after migrations 20260801000000–20260802120000):
supabase functions deploy poker-stable-notify
# W-2G vision extract (Starter+; after migrations 20260811400000–420000; needs OPENAI_API_KEY):
supabase functions deploy w2g-vision-extract
# Stripe billing (after migrations through 20260701160000 — full checklist docs/stripe-billing-test-to-prod-handoff.md):
supabase functions deploy stripe-create-checkout-session
supabase functions deploy stripe-create-portal-session
supabase functions deploy stripe-webhook
# Creator fan subs (after migrations 20260720180000–195000 + live fan tier price secrets):
supabase functions deploy creator-fan-connect
supabase functions deploy creator-fan-checkout
supabase functions deploy creator-fan-resume-subscription
supabase functions deploy creator-fan-reconcile-stripe
```

Deploy **`lounge-cf-stream-purge-pending-uploads`** from a repo copy that includes **`supabase/config.toml`** (`verify_jwt = false` for that function) so **`sb_*`** gateway keys work when used from Vault.

Set **production** Edge secrets for Stream (same **names** as test; rotate values independently):

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_API_TOKEN`
- `LOUNGE_CF_STREAM_PURGE_SECRET` (required for **`lounge-cf-stream-purge-pending-uploads`** only; must match Vault **`lounge_cf_stream_purge_http_secret`** if you use the pg_cron job). **`lounge-cf-stream-delete-orphan`** uses the **caller's Supabase JWT** (same pattern as **`lounge-cf-stream-direct-upload`**), not this secret.

**R2 image secrets** (feed images + Stream tile posters — see **`supabase/functions/lounge-cf-r2-direct-upload/README.md`**):

- `LOUNGE_CF_R2_ACCESS_KEY_ID`
- `LOUNGE_CF_R2_SECRET_ACCESS_KEY`
- `LOUNGE_CF_R2_BUCKET`
- `LOUNGE_CF_R2_PUBLIC_BASE_URL`

**Vercel / Vite client env:** `VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL` (same origin as **`LOUNGE_CF_R2_PUBLIC_BASE_URL`**); **`VITE_LOUNGE_CF_IMAGE_RESIZE=false`** unless zone Image Resizing is enabled; optional **`LOUNGE_CF_R2_PUBLIC_BASE_URL`** on Vercel for **`api/lounge-post-og.js`** resize.

Cross-check dashboards: **Production** function list versus **test** (names active, versions reasonable).

Secrets (secrets / env vault in Supabase) for push + web-push must exist on production — mirror **test** configuration.

**Stripe billing:** live **`STRIPE_*`** secrets + live webhook endpoint on prod; see **`docs/stripe-billing-test-to-prod-handoff.md`** (migrations, smoke, deploy order). **Ryan sign-off 2026-07-01:** prod migrations **`20260701120000`**–**`160000`**, Edge deploy, minimal live Checkout smoke **PASSED**; founding monthly coupon **`QnYlzKuK`**. **Ryan sign-off 2026-07-02:** prod migration **`20260702120000`**, **`lounge-send-activity-push`** redeploy, frontend **`main`** through **`66d6ed7`**. Broader prod billing matrix (upgrade, portal cancel, Lifetime) still optional follow-up smoke.

**Chat archive (2026-07-02):** **Ryan sign-off** — prod migrations **`20260702150000`**–**`170000`**, **`lounge-chat`** redeploy, frontend **`main`** **`f31d9a7`** on **`edgetilt.com`**; archive/restore/push-mute/reply-unarchive smoke **PASSED**.

**Lounge cashtag tap-to-search (2026-07-02):** **Ryan sign-off** — client-only **`efe255d`** on **`origin/main`** / **`edgetilt.com`**; tap **`$TICKER`** in feed caption → dock Search + cashtag post results smoke **PASSED**. No migration or Edge redeploy.

**Lounge strict hashtag search (2026-07-02):** **Ryan sign-off** — migration **`20260702210000`**, client **`a496a97`** on **`edgetilt.com`**; tap **`#tag`** → literal hashtag post results only (no fuzzy prose matches) smoke **PASSED**.

**Lightbox video scrubber (2026-07-03):** **Ryan sign-off** — client-only **`14372ac`** on **`origin/main`** / **`edgetilt.com`**; feed hero + chat lightbox seek/scrub controls (two-tone track, iOS pointer seek, Android MSE seeked-gated resume) smoke **PASSED** on test. No migration or Edge redeploy.

**Android chat video lightbox (2026-07-03):** **Ryan sign-off** — client-only **`ac9a948`** on **`origin/main`** / **`edgetilt.com`**; Android chat video → lounge-style lightbox (swipe dismiss, playback controls, audio stops on dismiss) smoke **PASSED**. No migration or Edge redeploy.

**Post detail reply composer iOS footer (2026-07-04):** client-only **`308ef6eb`** — **`SocialFeed.jsx`**; reply footer no longer floats mid-screen when opening long post detail without keyboard. No migration or Edge redeploy.

**Deploy update banner 20s (2026-07-04):** client-only **`843c5f32`** — **`appDeployVersion.js`**; refocus deploy detect auto-reloads after **20s** (was 3s). No migration or Edge redeploy.

**Deploy update banner close+reopen (2026-07-11):** client-only — banner copy asks full close + reopen (no Refresh / auto soft-reload). No migration or Edge redeploy.

**Advanced chart Add to post confirm (2026-07-04):** client-only **`014b3d4d`** — **`LoungeMarketChartModal`** confirm before inserting Advanced snapshot into composer. No migration or Edge redeploy.

**Bot portal reply on any post (2026-07-04):** client **`48d739db`** + SQL **`20260704220000`**. **Ryan sign-off:** prod RPC verified **2026-07-04** on **`jtjgtucumuoswnbauxry`** (manual SQL editor; function comment + no bot-owner guard). Not recorded in **`schema_migrations`**. Residual portal errors → wrong env / UUID / stale tab.

**Lounge staged video publish (2026-07-25):** **`main`** @ **`3f48b328`** — migration **`20260725210000`** (**`feed_visible_at`** + feed RPC author-only pending filter); deploy **`lounge-cf-stream-video-status`** (§4, reuses **`CLOUDFLARE_*`**). Client-only within bundle: inline tile progress, pixel poster reveal, post-delete reply media cleanup, encode/trim ladder. Prod smoke still open.

---

## 5. Post-deploy smoke (application)

- [ ] Logged-out: **Home feed** renders (requires **anon** SELECT on visible posts — Phase A migration).
- [ ] Optional — **pinned announcement:** if you use one in prod, confirm it appears first (ordering only; there is still **no in-app staff pin UI** — parity with test seed/SQL or a future mod tool per `docs/test-buildout-backlog.md` Phase B).
- [ ] Signed-in: **Guides → Ask community** still inserts (`community_feed_posts`) when RLS permits.
- [ ] Profiles: until onboarding ships, authors may appear as **`Member`** with no profiles row — expected until Account/gate UX exists.
- [ ] **`get-web-push-config`**: authenticated `GET` → `200` with `publicKey` (mirror prior smoke checklist).
- [ ] **Lounge video (Cloudflare Stream):** post a short clip (composer, under **60 seconds**) from Lounge; it plays in feed/detail via HLS. Requires **`lounge_feed_post_stream_video.sql`** on the DB, **`lounge-cf-stream-direct-upload`** and **`lounge-cf-stream-delete-video`** deployed, and Edge secrets **`CLOUDFLARE_ACCOUNT_ID`** / **`CLOUDFLARE_STREAM_API_TOKEN`** on that Supabase project. Delete the post and confirm the asset disappears from Cloudflare Stream (or returns 404 if re-deleted). If you use **purge cron** on prod, mirror **§2** migrations + **§4** **`LOUNGE_CF_STREAM_PURGE_SECRET`** / Vault parity and spot-check **`cron.job`** + **`net._http_response`** after a manual invoke.
- [ ] **Lounge images (Cloudflare R2):** post a photo; URL should be on prod media subdomain (e.g. **`media.lvslotpro.com`**). Response headers include **`Cache-Control: public, max-age=31536000, immutable`**. Delete post removes R2 object. Legacy rows should already point at R2 if **§3.5** migrate ran.
- [ ] **Lounge search (Phase G):** signed-in dock **Search** — **2+ chars** returns posts/profiles; logged-out tap → account gate. Requires **`20260518160000_lounge_search_phase_g.sql`** on prod DB.
- [x] **Lounge image lightbox (2026-08-13, `main` @ `2ca2e9d1`):** FLIP + frost chrome + swipe dismiss + Android pill scale — **Ryan Android sign-off** on **edgetilt.com**. Still spot-check iOS pinch-zoom / Stream hero as needed (client-only).
- [ ] **AP Guide editor (`/slot-guide-form`):** admin login → **+ New guide** → **Save draft** (optional) → **Ingest guide** with Vercel **§1** Supabase service vars set → **Fetch guides** → **Load** → edit section → **Save changes**. Spot-check **Buffalo Link** calculator slug **`buffalo-link`** in app after **`20260531540000`** on prod DB.
- [ ] **Starter weekly guide drop:** on a **Slots Edge Starter** prod account, SQL grant + activity event per **`docs/test-user-roles.md`** → scratch modal, real rub audio, tap-to-open guide, Pro CTA; notification tap deep-links with **`starterDrop=`**. Cron **`starter_weekly_guide_drop_weekly`** scheduled (Mon **00:10 UTC**). Do **not** run bulk **`run_starter_weekly_guide_drop_job()`** on prod without intent.
- [x] **Lounge strict hashtag search:** tap **`#edgeai`** (or any hashtag) → dock **Search** returns only posts with that literal hashtag (case variants OK; no bare **`edge`** / **`edgeai`** prose); migration **`20260702210000`**, client **`a496a97`**.
- [x] **Lounge cashtag tap-to-search:** tap **`$AAPL`** (or any cashtag) in a feed caption → dock **Search** opens with **`$TICKER`** query and cashtag post results (client-only; **`efe255d`**).
- [x] **Chat archive inbox:** swipe left → archive (green); **Archived** tab → swipe left restore (blue) or reply from thread → returns to Inbox; inbound while archived → **no push**; restore or reply → push resumes.

---

## 6. Ongoing parity rule

Whenever you merge a feature touching **Supabase** on **`test`**, append a bullet under **§2 or §4** in this checklist (migration path + Edge deploy list) until you adopt formal versioned migrations (e.g. `supabase/migrations/*.sql`) for both environments.

Working file for day-to-day buildout tracking: `docs/test-buildout-backlog.md`. Keep that file current during test development, then execute this checklist at promotion time.

Suggested future tightening:

- [ ] Migrate ad-hoc `supabase/*.sql` into **numbered `supabase/migrations/`** and run `supabase db push`/CI on both environments.
- [ ] Store **project ref** alignment in README or Ops doc (still no secrets).

---

## 7. Legal / storefront (parallel track — not infra)

Already planned for Slot Pro backlog; prod cutover reminders:

- [x] Public legal URLs on **`edgetilt.com`** — **`/terms`**, **`/privacy`**, **`/guidelines`** (in-app routes; no separate static legal site required). Counsel-reviewed; entity **Digiverse Ventures, LLC, Wyoming** (Ryan sign-off **2026-07-01**; entity name updated in-app **2026-07-23**, **`LEGAL_POLICY_VERSION` `2026-07-23`**).
- [x] Signup acceptance + **`profiles`** legal timestamps (migration **`20260627200000_profiles_legal_acceptance.sql`**).

---

_Last updated: **2026-07-30** — Poker tournament catalog + currency promote (SQL **`20260730210000`–`230000`**, **`poker_catalog_casinos_patch.sql`**, **`npm run poker:catalog:sync:production`** → **2165** catalog rows). Handoff: root **`WAKEUP`**. Open ops: confirm prod **`PUBLIC_APP_URL`** + Twilio From for guest SMS; merge **`test` → `main`** for catalog picker + venue currency UI. Earlier **2026-07-30**: Poker tournament swaps promote. Earlier **2026-07-29**: Casino LV geo gaps **`20260730120000`**; Poker Bankroll Manager chain._
