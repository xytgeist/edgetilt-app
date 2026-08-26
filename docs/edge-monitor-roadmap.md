# Edge Monitor roadmap

Admin-only in-app ops dashboard for EdgeTilt. **v1 shipped:** DB snapshot via RPC **`admin_ops_monitor_snapshot()`**, UI at **`?tab=monitor`** (hamburger **Monitor** when **`profiles.role = admin`**).

## Access

| Who | Route | Gate |
| --- | --- | --- |
| Admin | **`/monitor`** | Desktop full-width page (`EdgeMonitorDesktopPage` in **`App.jsx`**) |
| Admin | `/?tab=monitor` | In-app mobile tab (`AppShell` → **`EdgeMonitorScreen`**) |
| Admin | Hamburger **Monitor** | Same as `?tab=monitor` |
| Moderator | — | No access (metrics are product-wide, not moderation queue) |
| Everyone else | — | Access denied panel if tab/route forced |

**Prod vs test:** Same UI; metrics reflect whichever Supabase project **`VITE_SUPABASE_URL`** points at. Badge shows project ref (first segment of host).

## v1 (current)

**Migrations:** `supabase/migrations/20260703100000_admin_ops_monitor_snapshot.sql`, **`20260703110000_admin_ops_monitor_trends.sql`** (7-day UTC chart buckets)

**Code:** `src/features/ops/` (`EdgeMonitorScreen.jsx`, `OpsMonitorCharts.jsx`, `opsMonitorTheme.js`, `opsMonitorApi.js`)

**UI:** Gradient hero + KPI strip, 7-day pulse line chart, 24h vs 7d velocity bars, doughnuts (roles, subs, status), section accent colors (lv palette), engagement bar charts. Chart.js via lazy ops chunk (same lib as Bankroll).

- Users & roles (`profiles`)
- Subscriptions (`user_subscriptions`, `stripe_webhook_events`)
- Lounge (posts, comments, likes, bookmarks, follows, Stream rows)
- Search & rate limits (`lounge_search_analytics`, `rate_limit_events`)
- Chat (rooms, messages, members)
- Guides & tools (guides, machines, bankroll, play log)
- Offers, push, Starter weekly drops, activity events

Manual **Refresh** re-runs the RPC. Optional **Auto 90s** snapshot poll.

## Phase 2 — trends & charts (shipped)

**Migration:** **`20260703120000_admin_ops_monitor_phase2_5.sql`**

- [x] Time-series RPCs: **`trends_30d`** (daily) + **`trends_90d`** (weekly) on snapshot
- [x] Top search queries (**`top_queries_7d`** / **`top_queries_30d`** from `lounge_search_analytics`)
- [x] Freemium funnel: users at 8/9/10 bankroll or play-log cap (`freemium_funnel` key)
- [x] Starter drop pool stats: **`pool_size`**, **`exhausted_starter_subs`**, **`active_starter_subs`**

## Phase 3 — external health (shipped)

Keep secrets off the client. Dashboard deep links + server probes via Edge Function **`admin-ops-external-health`**.

| Source | Metrics | Integration |
| --- | --- | --- |
| **Sentry** | Unresolved issue count (optional API) | Dashboard link + **`SENTRY_AUTH_TOKEN`** probe |
| **Stripe** | Active / past_due subscription sample counts | Dashboard link; **`STRIPE_SECRET_KEY`** probe |
| **Cloudflare Stream** | Pending uploads count | **`CLOUDFLARE_*`** probe + dashboard link |
| **Cloudflare R2** | — | Dashboard link only |
| **Supabase** | Project ref | Dashboard + Functions links |
| **Vercel** | Deploy SHA (client header) | Dashboard link (**`OPS_MONITOR_VERCEL_PROJECT_URL`** override) |

Deploy: **`supabase/functions/admin-ops-external-health/README.md`**

## Phase 4 — alerts & runbooks (shipped)

- [x] Default threshold config (`opsMonitorAlerts.js` ... rate-limit spike, CF pending uploads, starter pool exhausted, Sentry unresolved). **Stripe:** `admin_ops_monitor_stripe_webhook_health()` — **critical** when last failure is newer than last success; **warn** when active billing subs exist but no success in 96h (replaces naive "24h = 0").
- [ ] Email or push to admin when threshold breached (deferred ... reuse `send-test-push` pattern later)
- [x] Inline runbook links per section (`opsMonitorRunbooks.js` ... GitHub blob URLs to repo docs; prod checklist, Stripe handoff, Stream purge README)

## Phase 5 — real-time (shipped)

- [x] **`admin_ops_monitor_live_pulse()`** RPC polled every ~15s (activity rate, posts/chat 1m counters)
- [ ] Optional “live users” approximation (presence table ... TBD)

## Phase 6 — subscriber roster (shipped)

**Migration:** **`20260723220000_admin_ops_subscriber_roster.sql`**

Admin-only RPC **`admin_ops_subscriber_roster()`** + **`EdgeMonitorSubscriberRosterPanel`** in **`EdgeMonitorDashboard.jsx`**.

- New users: 24h / 7d / 30d counts + last 100 signups (handle, email, role, Stripe link)
- Platform subs: per-product active counts, full active roster (who + product + status + cancel flag)
- Creator fan subs: monetization profiles, active fan roster (fan → creator), per-creator subscriber counts
- Cancellations: pending cancel (platform + fan) + churn rows updated in last 30d
- Tab filter + CSV export (platform / fan / signups / pending cancel)
- Stripe Dashboard links: **Customer ↗**, **Sub ↗**, **Connect ↗** (migration **`20260723230000`** adds fan/cancel stripe ids)

**Blast radius:** Admin Monitor only (`/?tab=monitor`, **`/monitor`**). Reads **`auth.users.email`** via security definer; no member-facing change.

## Related docs

- **`docs/access-tiers.md`** — admin vs moderator
- **`docs/test-user-roles.md`** — SQL to grant admin on test
- **`docs/production-rollout-checklist.md`** — apply migration on prod after test sign-off
- **`docs/test-buildout-backlog.md`** — Edge Monitor section + smoke steps

## Smoke (test)

1. Apply **`20260703100000`**, **`20260703110000`**, **`20260703120000`**, **`20260723220000`** on test Supabase.
2. Deploy Edge fn **`admin-ops-external-health`** on test.
3. Set your test profile to **`role = admin`**.
4. Open app → hamburger → **Monitor** (or `/?tab=monitor`).
5. Confirm sections load; **Refresh** updates timestamp; **Live pulse** tiles update ~15s.
6. **External health** cards show dashboard links; Stripe/CF probes if Edge secrets set.
7. Non-admin account: tab shows “admin-only” (no RPC call required for gate test).
8. **Desktop:** open **`/monitor`** ... 30/90d sparklines, alerts banner, auto-refresh toggle.
9. **Subscriber roster:** panel below hero KPIs ... new-user buckets, platform/fan tabs, creator monetization table, cancels tab, CSV export.
10. **System health:** panel below alerts ... scheduled job table, billing drift cards (names users stuck on incomplete), **Copy diagnostic** button.

## Phase 7 — system health (shipped)

**Migration:** **`20260730240000_admin_ops_system_health.sql`**

Admin RPC **`admin_ops_system_health_snapshot()`** + **`EdgeMonitorSystemHealthPanel`** at top of Edge Monitor (below alerts banner).

- **Scheduled jobs:** pg_cron registry with last run, health (`ok` / `failed` / `stale` / `disabled` / `external` / `unscheduled`), runbook links
- **Billing drift:** proactive cases naming users stuck **`incomplete`**, active sub + Free profile flag, profile paid flag with no active row, **`past_due`** lockout (warn), fan sub incomplete
- **Dropped (40500):** orphan **`stripe_customer_id`** with no sub row (checkout noise)
- **Copy diagnostic:** plain-text bundle for chat triage (project, user ids, Stripe ids, job failures)
- **Four screens:** Overview · Health · People · Product (`?section=` on `/monitor` and `/?tab=monitor`)
- **Alerts banner:** drift + critical job issues surface as red/critical alerts without searching subscriber roster

**Deferred:** ops email on drift (reuse **`BILLING_ADMIN_ALERT_EMAILS`**).

**Offer reminders cron (40600):** pg_cron **`send_due_offer_reminders_minute`** every minute → **`send-due-offer-reminders`** Edge fn (`lookaheadMinutes: 1`).

**Poker catalog heartbeat (40800):** GitHub Actions sync writes **`admin_ops_job_heartbeats`**; Monitor stale if last success >4 days. Health tab **Poker catalog sync** panel (`20260812120000`) shows upserted / pruned plus **remaining** MTTDB online+live in the catalog. Cloudflare-blocked MTTDB scrapes heartbeat **ok** and keep last rows (amber note). Hard-fail only if online catalog is empty.

## Phase 8 — app section visits + member activity (shipped, prod 2026-07-31)

**Apply order (test + prod):** use **`node scripts/apply-migration-once.mjs --target=test|production <file.sql>`** for each file below (multi-statement RPCs; do not fan out bare **`db:query:* -f`**).

| Range | What |
| --- | --- |
| **`20260731210000`**–**`10701`** | **`app_section_visits`**, **`record_app_section_visit()`**, **`admin_ops_app_section_usage_snapshot()`** |
| **`20260731220000`**–**`20600`** | **`sub_section_id`**, **`event_kind`** (`visit` \| `session_recorded`), drill-down RPC v2 |
| **`20260731220700`**–**`21500`** | Exclusion blocklists + **`app_product_analytics_user_excluded()`**; seed staff emails |
| **`20260731221600`**–**`21900`** | Drop **Intel** from section catalog + constraint |
| **`20260731222000`**–**`22100`** | **`admin_ops_app_section_member_usage_snapshot()`** (grants) |
| **`20260731222200`** | Blocklist **`chunky.unc@gmail.com`** + purge duplicate test account visits |
| **`20260731222300`** | Per-member breakdown embedded in top-N rows (**`app_product_analytics_member_breakdown`**) |
| **`20260731222400`** | Lounge posts + interactions on member expand (**`app_product_analytics_member_lounge_activity`**) |
| **`20260731222500`** | **Top Lounge contributors** list + **prod fix:** skip legacy **`post_reposts`** when table absent (prod uses feed-card reposts only; see **`feed_repost_quote_posts.sql`**) |

**Client tracking**

- **`src/constants/appProductSections.js`** — canonical section ids (no **`intel`**).
- **`src/utils/appSectionVisitTracking.js`** — 45s debounce per section tab visit; immediate **`session_recorded`**.
- **`AppShell.jsx`** — tab visits (members only; **skips when `isAdmin`**); calculator opens via **`activeCalculator`**.
- **`PlayLogbook.jsx`** / **`PokerBankrollTracker.jsx`** — **`session_recorded`** on new session insert.

**Exclusions:** all **`profiles.role = admin`**; optional handles/emails tables; all **`@bots.edgetilt.local`**. Moderators count unless blocklisted. Recipes: **`docs/test-user-roles.md`** §5.

**Monitor — Product tab (`?section=product`)**

- **`EdgeMonitorAppSectionUsagePanel`** — aggregate section usage, calculator/session drill-down, collapsible **All sections** table (collapsed by default).
- **`EdgeMonitorAppSectionMemberUsagePanel`** — two ranked tables:
  1. **Top app activity (7d)** — ranked by **`app_section_visits`** events.
  2. **Top Lounge contributors (7d)** — posts + comments + likes/bookmarks/reposts given ( **`top_lounge_members`** ).
- Expand any row → full breakdown: Lounge created/interactions/received, app sections, calculator opens, logbook/poker sessions (24h + 7d).
- **`@handle` search** — any member (even if not in either top-25 list).

**RPCs:** **`admin_ops_app_section_usage_snapshot()`**, **`admin_ops_app_section_member_usage_snapshot(p_lookup_handle, p_top_limit)`**.

**Prod promote:** **`main`** @ **`567070d6`** (2026-07-31). **No Edge redeploy.**

---

_Update log: 2026-07-03 — v1 scaffold (RPC + EdgeMonitorScreen + AppShell tab)._
_Update log: 2026-07-03 — Phases 2–5 (extended RPC, external-health Edge fn, alerts/runbooks, live pulse poll)._
_Update log: 2026-07-23 — Phase 6 subscriber roster (`admin_ops_subscriber_roster` + Monitor panel)._
_Update log: 2026-07-30 — Phase 7 system health (cron registry + billing drift + copy diagnostic)._
_Update log: 2026-07-30 — Monitor split into four screens (Overview · Health · People · Product) with URL `?section=`._
_Update log: 2026-07-31 — Phase 8 app section visits + member activity through **`20260731222500`** (aggregate panel, dual top-25 tables, Lounge contributor ranking, exclusions, prod **`post_reposts`** guard). Prod **`567070d6`**._
