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

- [x] Default threshold config (`opsMonitorAlerts.js` ... webhook 24h = 0, rate-limit spike, CF pending uploads, starter pool exhausted, Sentry unresolved)
- [ ] Email or push to admin when threshold breached (deferred ... reuse `send-test-push` pattern later)
- [x] Inline runbook links per section (`opsMonitorRunbooks.js` ... prod checklist, Stripe handoff, Stream purge README)

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
- **Alerts banner:** drift + critical job issues surface as red/critical alerts without searching subscriber roster

**Deferred:** GitHub Actions heartbeat for poker catalog sync; ops email on drift (reuse **`BILLING_ADMIN_ALERT_EMAILS`**).

**Offer reminders cron (40600):** pg_cron **`send_due_offer_reminders_minute`** every minute → **`send-due-offer-reminders`** Edge fn (`lookaheadMinutes: 1`).

---

_Update log: 2026-07-03 — v1 scaffold (RPC + EdgeMonitorScreen + AppShell tab)._
_Update log: 2026-07-03 — Phases 2–5 (extended RPC, external-health Edge fn, alerts/runbooks, live pulse poll)._
_Update log: 2026-07-23 — Phase 6 subscriber roster (`admin_ops_subscriber_roster` + Monitor panel)._
_Update log: 2026-07-30 — Phase 7 system health (cron registry + billing drift + copy diagnostic)._
_Update log: 2026-07-30 — **40500** billing drift focus: drop orphan Stripe customer noise; add profile-paid-no-row + past_due rules; critical vs warn overall._
