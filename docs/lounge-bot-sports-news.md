# Lounge bot … NFL news (Jordan Pike)

**Status:** code shipped to **test** 2026-10-22 (bot created, `run_state = stopped`). Prod needs migration + Edge deploy + `node scripts/create-sports-news-bot.mjs --target=production --i-mean-it` on Ryan's ask.

**Persona:** **Jordan Pike** (`@dreknowsball`, slug `jordan-pike`, pipeline `sports_news`, category pill `sports`). Bio: "NFL news that moves lineups and lines."

**Why:** few users post, so a news bot shows off Lounge features (game pills) without flooding the feed. Pace target is Market Edge (~5/day). Sharpe Signal / Syndicate are betting bots and do not count toward the sports share.

## Pool and scoring

Pool is the **same batch the Fantasy news tab shows**: `fantasy_insider_news` rows with `status = show` (written by `fantasy-insider-poll`). Every row qualifies; the score decides which fill the day's slots.

`score = 100 × news weight × player tier × source × game proximity`

| Factor | Values |
| --- | --- |
| News weight | Out / IR 1.0 · starting-QB news or a QB role change 1.0 · in-game injury 0.9 · Doubtful 0.85 · transaction 0.75 · cleared 0.7 · Questionable 0.65 · anything else 0.55 |
| Player tier (Sleeper `search_rank`) | best-ranked QB per team, top-12 RB/WR, top-6 TE = 1.0 · RB/WR 13-24, TE 7-12 = 0.75 · everyone else 0.45 |
| Source | `status_trusted` or core national insider 1.0 · others 0.85 |
| Game proximity | live or kickoff within 48h 1.0 · within 4 days 0.85 · later 0.7 (transactions skip this) |

Publish threshold: `lounge_bot_accounts.publish_score_threshold` (55). Caps: `max_posts_per_day` 10, `max_posts_per_hour` 2, nothing 12-8am ET. One post per player per status / kind per game (`lounge_sports_news_posts.dedupe_key`), so five Lamar practice notes in a day post once.

Insider `kind` (new column, LLM-tagged): `status`, `transaction`, `in_game`, `role`, `other`. Added to the prompt without touching `statuses`; regression set 172/172 on test after the change.

## Extra lanes

- **Key absences roundup:** one post per kickoff window, 55-85 min before kick, listing ranked players ESPN has Out / IR (`nfl_player_status`), up to 6 names.
- **Line move:** a status / QB post stores the home spread at post time. Within 3h, if the board spread moves 1+ pt before kickoff, one follow-up posts ("Line move: LAR at SF is now SF -6.5, from -3 when the ... news broke.").

## Game pills (~20%)

- Always: key absences roundup, line move.
- Status / QB / in-game posts: only when the game is live or within 24h, and only while the day's pill budget lasts (`round(0.2 × max_posts_per_day)`).
- Transactions: never.

Uses `publishLoungeBotPost({ sportsGameEventIds })` → `community_feed_posts.sports_game` (same shape the composer writes).

## Captions

Insider headline, Fantasy Impact line, `Per {reporter}.` No X links … `publishLoungeBotPost` strips X URLs from bot posts by design.

## Ops

- Edge: `lounge-sports-news-poll` (`verify_jwt = false`, cron `lounge_sports_news_poll` every 5 min via the `lounge_odds_poll_*` Vault secrets). Returns early unless the bot is `running`.
- Dry run: POST `{ "dryRun": true, "lookbackHours": 48 }` with a service / admin key → `plan` (what would post, score, pill) + `below_threshold` (top misses) for tuning.
- Every publish also logs to `lounge_bot_publish_log` (`post_kind = sports_news_<lane>`), so Bot ops and caps see it.
- Migration: `20261022010000_lounge_sports_news_bot.sql` (pipeline `sports_news`, insider `kind`, `lounge_sports_news_posts`, cron).

## Not in v1

NBA / CFB (no insider feed), image cards, avatar (set in `/?tab=bots`).
