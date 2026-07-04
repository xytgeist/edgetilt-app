# Lounge bot — sports odds / +EV plays

**Status:** **Shipped on test (code, Jul 2026)** — migrations through **`20260704170000`**, Edge fns **`lounge-odds-ingest`** + **`lounge-odds-poll`**, admin portal **`/?tab=bots`**. **Ryan smoke pending** on **`kcosfvmreeiosdjdzycb`**.

**Live bot (test):** **Scott Share** — `@sharpesignal`, pipeline **`odds_api`**, category pill **`sports`**.

**Self-contained** — no morning editorial inbox. Roster context: **`docs/lounge-bot-editorial-queue.md`**.

---

## Workflow (v1 shipped)

```text
Calendar sport pick (portal)  →  lounge-odds-ingest (manual) or lounge-odds-poll (cron)
  →  +EV engine (h2h devig)  →  ⚡ edge alert OR slate check-in  →  feed
```

| Post kind | When | Example tone |
| --- | --- | --- |
| **Edge** | Best h2h line clears **`min_edge_pct`** | `⚡ Wimbledon: Mochizuki +1700 at Bovada looks like the play. Fair closer to +1520 across 6 books, roughly +11% edge on the ML. Mochizuki vs Sinner, Sun Jul 5 at 3am PT.` |
| **Slate** | No edge clears (or **`daily_slates`** poll) | `Wimbledon: Ran 12 matches in the next 48h... books look aligned, nothing +EV enough to fire today. Next up: Sinner vs Mochizuki, Sun Jul 5 at 3am PT.` |

**Caption punctuation:** plain keyboard characters only (periods, commas, colons, `...`). No middle dots, em dashes, or en dashes in published copy.

**`review_mode`:** `automatic`. Target volume: **~2 posts/day** + optional edge alerts when lines misprice (caps below).

---

## Admin portal (`/?tab=bots`)

| Control | Behavior |
| --- | --- |
| **Today's major sport** | Dropdown from **`lounge_sports_betting_calendar`** (PT day) |
| **Fetch odds** | One sport: try edge, else slate (`postMode: auto`) |
| **Scan all · edge** | All calendar sports today → edge alerts only |
| **Post all slates** | One slate per sport/day (dedupe) |
| **Min +EV %** | Settings field **0.5–15** → **`lounge_bot_odds_config.min_edge_pct`** via **`admin_lounge_bot_save_settings`** |

---

## +EV engine (h2h only)

Shared logic: **`supabase/functions/_shared/loungeBotOddsCaption.ts`**

1. Filter events: **48h** window, **3+ books**, in-season sport keys from The Odds API **`active`**
2. **h2h only** for alerts (spreads fetched for cache/context, not +EV v1)
3. Per book: devig both sides → fair implied prob per outcome
4. **Consensus:** average fair probs across books
5. **EV on $1** at best available American price vs consensus
6. Publish if **`evPct >= min_edge_pct`** and **`evPct <= 15`** (stale-data filter)

**`min_edge_pct`:** minimum **+EV percent on $1 stake** (default **2**). Column default + new bots use **2**; existing rows may still be **4** until saved in portal.

---

## Edge Functions

| Function | Role |
| --- | --- |
| **`lounge-odds-ingest`** | Manual single-sport fetch (`sportKey`, `calendarSlug`, `postMode`) |
| **`lounge-odds-poll`** | Background: **`poll_edges`** \| **`daily_slates`** |
| **`lounge-bot-admin`** | Create bot + seed **`lounge_bot_odds_config`** |

Shared run/publish: **`supabase/functions/_shared/loungeBotOddsRun.ts`**

Deploy:

```bash
supabase functions deploy lounge-odds-ingest --project-ref kcosfvmreeiosdjdzycb
supabase functions deploy lounge-odds-poll --project-ref kcosfvmreeiosdjdzycb
```

**Secret:** **`THE_ODDS_API_KEY`** on Edge only.

---

## API credits (The Odds API)

Each `GET /v4/sports/{sport}/odds` costs **credits = (# markets) × (# regions)**.

Current fetch: **`h2h` + `spreads`**, region **`us`** → **~2 credits/call**.

| Usage | Rough monthly credits |
| --- | --- |
| 2 manual posts/day | ~120 |
| 30-min poll, ~4 calendar sports, 12h/day | ~11k |

**Plan:** Ryan on **$30 / 20k credits**. Monitor `x-requests-remaining` header.

---

## Config: `lounge_bot_odds_config`

| Column | Notes |
| --- | --- |
| `min_edge_pct` | Min +EV % on $1 (default **2**); editable in portal |
| `max_edge_alerts_per_day` | Default **6** |
| `max_slate_posts_per_day` | Default **10** |
| `daily_slate_enabled` | Default **true** |
| `sports_keys` | Fallback list; calendar drives manual picks |
| `regions` | `['us']` |
| `markets` | `['h2h','spreads']` |

Publish log: **`post_kind`** (`edge` \| `slate`), **`dedupe_key`** — migration **`20260704150000`**.

---

## Sports calendar

Table **`lounge_sports_betting_calendar`** — seeded for 2026 major events.

RPC **`admin_lounge_sports_betting_calendar_today()`** → portal dropdown.

Captions prefix category label from calendar row (e.g. `Wimbledon · …`).

**No portal calendar editor yet** — extend rows via SQL.

---

## Migrations (apply order on test)

| Migration | What |
| --- | --- |
| **`20260703140000`**–**`20260703160000`** | Bot accounts, odds config, editorial queue |
| **`20260704120000`** | **`sports`** category pill |
| **`20260704130000`** | Bot profile admin edit |
| **`20260704140000`** | Sports betting calendar |
| **`20260704150000`** | Slate/edge post kinds + caps |
| **`20260704160000`** | `min_edge_pct` semantics + default 2 |
| **`20260704170000`** | Portal save **`min_edge_pct`** |

---

## Phased rollout

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Manual fetch + devig +EV + slate check-ins + portal | **Code shipped** |
| **2** | **`lounge-odds-poll`** cron (30-min edge scan, morning slates) | **Fn shipped; cron not wired** |
| **3** | Line movement vs snapshot ("moved from -2.5 to -3.5") | Not started |
| **4** | Spreads/totals +EV, props, rich cards | Not started |

**Legal/compliance (before prod):** Nevada/gambling content policy, no guaranteed-profit claims, disclaimer on profile or posts — counsel review.

---

## Repo touchpoints

| Piece | Location |
| --- | --- |
| Spec (this file) | **`docs/lounge-bot-sports-odds.md`** |
| Portal UI | **`src/features/bots/BotManagementPortal.jsx`**, **`botPortalApi.js`** |
| +EV math | **`supabase/functions/_shared/loungeBotOddsCaption.ts`** |
| Ingest / poll | **`lounge-odds-ingest/`**, **`lounge-odds-poll/`** |
| Poll README | **`supabase/functions/lounge-odds-poll/README.md`** |
| Backlog smoke | **`docs/test-buildout-backlog.md`** → Planned (Lounge bots) |

---

## Open questions

- [ ] Supabase cron schedule for **`poll_edges`** / **`daily_slates`**
- [ ] Feed UI badge for +EV posts (caption prefix only today)
- [ ] Affiliate / sportsbook deep links allowed?
- [ ] Responsible gaming disclaimer on every post vs profile-only?

---

_Updated 2026-07-04: Scott Share session — calendar picker, devig +EV, slate check-ins, portal Min +EV field._
