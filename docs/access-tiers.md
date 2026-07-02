# Access tiers — product spec (source of truth)

**Purpose:** Define **no account**, **free (verified) account**, **paid subscriber**, and **staff** behavior before entitlements, RLS, and UI gates are implemented.

**Related:** `docs/social-feed-roadmap.md` (Freemium & subscriptions), `docs/frontend-architecture.md` (Access model), `AGENTS.md`.

---

## 1. Tier summary

| Tier | Internal label | One-line intent |
| --- | --- | --- |
| **No account** | `anonymous` | Lounge only: **read-only** feed (no post cap — same feed depth as public RLS + app pagination allow). No search/filter/post detail/navigation; **create account** modal on forbidden actions. |
| **Free (verified user)** | `free` | Full **Lounge** (post, lounge search, filter, comment, like, repost, bookmark, etc.). **Verified user** badge by display name. Rest of app reachable from menu; **subscribe** gates on bankroll, offer alerts/OCR, locked calcs/guides. |
| **Paid — Starter** | `starter` | **Verified** + **subscriber** badges. **AP guide cards** are the primary product: fixed **starter pack** on subscribe + **one random premium guide drop per week** (engagement + upgrade funnel). Tools mostly gated. See **§5**. |
| **Paid — Full Edge** | `full` / `slots-edge` | **Verified** + **subscriber** badges. **Instant full AP guide library** + all calculators + unlimited bankroll/logbook + calendar alerts/OCR. **New** game packs may add **subscriber-only** add-on paywalls. See **§5**. |
| **Moderator / admin** | `staff` (`role` on profile) | **Full access** to everything, including new calcs/guides before/during any add-on rollout. **Special badges** distinct from verified/subscriber. |

---

## 2. Badges (Lounge and elsewhere as noted)

| Badge | Who |
| --- | --- |
| **Verified user** | Free and paid accounts (not anonymous). |
| **Subscriber** | Paid tier (in addition to verified), shown on **posts** in Lounge. |
| **Moderator / admin** | Staff roles; own badge treatment. |

---

## 3. No account (anonymous) — Lounge teaser

**Allowed**

- **Read-only** the Lounge feed for as many posts as the app loads under **public read** + **pagination** (no artificial daily or scroll cap).
- **No** Lounge **search** (feature may not exist yet; still blocked for anon).
- **No** feed **filtering** for anon.
- **No** opening a **post** (tap / drill-in): treat as a forbidden action → **create account** popup (same as other gates below).

**Forbidden actions → create account popup**

If the user attempts **any** of the following, show the **create account** popup (not subscribe):

- Tap **search** (when it exists).
- Open **any hamburger / nav menu item** (leave Lounge surface).
- **Tap a post** (detail / thread / sheet — any post open).
- Any other navigation or action outside the **allowed anon Lounge scroll** rules above.

**After dismiss**

- User may **continue viewing** the Lounge feed (read-only) as loaded.
- On **any** subsequent forbidden action, show the **create account** popup again (re-entrant).

---

## 4. Free account — verified user, subscribe gates elsewhere

**Lounge**

- **Verified user** badge next to display name.
- **Full access:** post, **Lounge search**, **filter**, comment, like, repost, bookmark, and other Lounge features as they ship.

**Navigation**

- May open **all** other app areas from the **hamburger menu** (no blanket “create account” wall).
- **Hamburger UI:** Top-level rows are **Lounge**, **Slots** (hub), and **Team**. **Slots** opens a hub that links to Calcs, Calendar, Bankroll, Logbook, and AP Guides (**Local Intel** removed from hub UI — route/code retained; Lounge covers field intel for now). Hub tiles that are **subscriber-only at the product level** show a **lock icon** next to the label for free (non-subscriber) users; **staff** and **active subscribers** do not see those locks. (**Calendar**, **Bankroll**, and **Logbook** hub tiles stay **unlocked** for free users; bankroll/logbook **create** actions cap at 10 free uses — see §4 table; calendar **alerts** and **OCR** stay subscribe-gated **inside** Calendar.)

**Per-feature subscribe requirements**

| Area | Free tier |
| --- | --- |
| **Bankroll manager** | **10 free sessions**; subscribe for unlimited. Hub tile unlocked; **Start Session** locks at limit. |
| **Play Logbook** | **10 free play logs**; subscribe for unlimited. Hub tile unlocked; **+ Log Play** and **Log play in Logbook** lock at limit. |
| **Calendar** | May use calendar **without** subscribe. **Subscribe** for **alerts** and for **image upload AI OCR** on offers. |
| **Calculators** | **Buffalo Link** + **Must Hit By (MHB)** free; **Phoenix Link** + **Stack Up Pays** + all other premium calcs locked → subscribe (**`FREE_CALCULATOR_KEYS`**, **`SUBSCRIBER_ONLY_CALCULATOR_KEYS`**). |
| **AP Guides** | **14 free guides** — see **`FREE_GUIDE_SLUGS`** in **`guideAccess.js`** (5 Coin Frenzy Jackpots, 88 Fortunes Emperor's Coins, AGS/Ainsworth/IGT Must Hit By, Brian Christopher's World Cruise, Buffalo Link/Cash, Lightning Buffalo Link, Cashman Bingo, Crush Conquest/Dynasty, Dancing Phoenix Soaring Dragon, Golden Egypt). All others locked → subscribe. |

Copy for modals: distinguish **create account** (anon) vs **subscribe** (free user hitting paid feature).

---

## 5. Paid plans — Slots Edge (guide-first product)

**Product thesis:** **AP guide cards** (which slots are +EV and how to play them) are the **primary value**. Calculators, bankroll, logbook, calendar, and Lounge are built around the guide library.

### 5.1 Pricing catalog (locked 2026-07-01)

| Plan | Internal slug (planned) | List price | Early bird (first 12 billing months) |
| --- | --- | --- | --- |
| **Starter** | `slots-edge-starter` | **$14/mo** | **$12.60/mo** (10% off) |
| **Full Edge — monthly** | `slots-edge` | **$42/mo** | **$37.80/mo** (10% off) |
| **Full Edge — annual** | `slots-edge` (annual Price) | **$420/yr** (~$35/mo effective) | **$420/yr** (built-in yearly savings; **no** founding-member coupon) |

**Early subscriber offer:** **10% off for the first 12 billing months** on **monthly** Starter and **monthly** Full Edge via Stripe **Coupon** (`percent_off: 10`, `duration: repeating`, `duration_in_months: 12`). **Not** applied to annual Full Edge (yearly price already discounted vs 12× monthly).

**Competitive positioning:** Full Edge at **$42/mo** undercuts typical AP sites (**$35–49/mo**) while staying **3× Starter** ($14) for clear tier separation.

**Not in v1 catalog:** Lifetime / founding membership — **TBD** (optional later offer).

### 5.2 Starter (`slots-edge-starter`)

**Guides (hero)**

- **Starter pack** on subscribe: **all guides with `machines.release_year` ≤ 2019** (**`GUIDE_STARTER_PACK_MAX_RELEASE_YEAR`** in **`guideAccess.js`**). Guides without a release year are **not** in the starter pack unless also granted via weekly drop.
- **Weekly Guide Drop:** once per UTC week, **each Starter subscriber** gets **one independent random roll** from their **remaining** pool:
  - **Eligible pool:** published guides with **`machines.release_year` ≥ 2020** (`GUIDE_WEEKLY_DROP_MIN_RELEASE_YEAR`), excluding **`FREE_GUIDE_SLUGS`** (already free for everyone).
  - **Remaining pool (per user):** eligible slugs minus slugs that user **already earned** via prior weekly drops (starter pack ≤ 2019 is implicit and never in the pool).
  - **No duplicates** for that user; when the pool is exhausted, the job skips until new 2020+ guides ship.
  - **Persistence:** `starter_weekly_guide_unlocks` + **`get_my_starter_weekly_guide_slugs()`**; cron calls **`grant_starter_weekly_guide_drop(user_id)`** (service role).
- **Reveal UX:** in-app drop moment + optional push; each reveal surfaces **upgrade to Full Edge** CTA.
- **On cancel:** user **keeps** guides already unlocked (earned library persists).

**Tools**

- Bankroll, logbook, calendar OCR/alerts remain **gated** (same free-tier limits).
- **Calculators:** Starter unlocks any calculator **paired** with a guide they can open (starter pack **`release_year` ≤ 2019** + weekly drops). Implemented via **`buildStarterUnlockedCalculatorKeys`** / **`useStarterCalculatorUnlocks`** + **`starterUnlockedCalculatorKeys`** in **`calculatorAccess.js`**. Free tier still uses **`FREE_CALCULATOR_KEYS`** only (not auto-paired from free guides).

**Lounge**

- **Subscriber** badge on posts (any paid plan).

### 5.3 Full Edge (`slots-edge`)

**Guides**

- **Instant access to the entire published AP guide library** (no weekly drop; no randomness on this tier).

**Tools**

- **All** calculators unlocked.
- **Unlimited** bankroll sessions and play logbook entries.
- Calendar **alerts** + offer image **OCR**.

**Lounge**

- **Subscriber** badge on posts.

**Add-ons**

- When **new games** ship with new calculators and/or guides, those assets may have an **additional paywall**. **Only Full Edge subscribers** (and staff) get the purchase path; free and Starter users see upgrade/subscribe flows instead.

### 5.4 Upgrades

- **Starter → Full Edge:** one checkout path; Stripe proration; **immediate** full library unlock.
- **Free → either plan:** standard subscribe modal with plan picker (**engineering TBD**).

### 5.5 Future verticals

- **`sports-edge`**, **`crypto-edge`** remain separate product slugs when those verticals ship (not part of Slots Edge Starter/Full pricing above).

---

## 6. Moderator and admin

- **Full access** to the entire app, including **any new calculators and guides** (no lockout from general or add-on content).
- **Special badges** (distinct from verified / subscriber).
- **`isStaff`** (`moderator` or `admin`): full app access, staff badges, hamburger lock bypass.
- **`isAdmin`** (`admin` only): content lock toggles (Calcs / AP Guides), guide **Delete**, Play Logbook system-template admin, Lounge promote/demote — **not** shown to moderators. (`App.jsx`: `isAdminRole = r === 'admin'`.)
- RLS for destructive / content-policy writes (e.g. **`content_access_gates`**, guide delete, play log system templates) remains **admin-only**.

---

## 7. Engineering / policy TBD (fill when decided)

| Topic | Status |
| --- | --- |
| **Which calcs/guides are free vs locked** | **Calcs (free):** **`FREE_CALCULATOR_KEYS`** (Buffalo Link + MHB). **Calcs (always subscriber):** **`SUBSCRIBER_ONLY_CALCULATOR_KEYS`** (Phoenix Link + Stack Up Pays; admin gates cannot unlock for free). **Guides (free):** **`FREE_GUIDE_SLUGS`** only. **Guides (Starter $14):** **`machines.release_year` ≤ 2019** + weekly **2020+** drops (**`GUIDE_STARTER_PACK_MAX_RELEASE_YEAR`**). **Admins:** **`content_access_gates`** (except subscriber-only calcs). |
| **Signup / verification** | Supabase auth + email verification policy for “free” tier — **TBD** (no `allowed_emails` gate in the client). |
| **Stripe products** | **Slots Edge:** `slots-edge-starter` ($14/mo), **`slots-edge`** Full ($42/mo + $420/yr) — see **§5.1**. **`sports-edge`**, **`crypto-edge`** later. Price IDs in Edge secrets; **10% early-bird coupon** (12-month repeating). **`user_subscriptions`** + per-user **guide unlocks** (Starter pack + weekly drops — schema **TBD**). **`get_my_entitlements()`** RPC; legacy **`has_active_subscription`** mirrors **active Full `slots-edge`** (Starter **TBD**). See **`supabase/functions/stripe-create-checkout-session/README.md`**. |
| **Starter pack slugs** | **Release year ≤ 2019** on **`machines.release_year`**. Weekly drop pool = published guides **2020+** only (minus **`FREE_GUIDE_SLUGS`**). |
| **Weekly drop job** | **`grant_starter_weekly_guide_drop(user_id)`** — uniform random from **that user's remaining** 2020+ slugs; idempotent per UTC week. Cron/Edge scheduler **TBD**; reveal UX **TBD**. |

---

## 8. Per-surface matrix (condensed)

| Surface | No account | Free | Paid Starter | Paid Full | Staff |
| --- | --- | --- | --- | --- | --- |
| **Lounge** | Read-only feed; forbidden actions → create account modal | Full + verified badge | Full + subscriber badge | Full + subscriber badge | Full + staff badges |
| **Hamburger / other tabs** | Create account modal | Allowed; gated features → subscribe modal | Same as free for tools; guides per Starter rules | Full | Full |
| **Bankroll** | Create account modal | 10 sessions free | 10 sessions free (unless changed) | Unlimited | Full |
| **Play Logbook** | Create account modal | 10 logs free | 10 logs free (unless changed) | Unlimited | Full |
| **Calendar** | Create account modal | Calendar yes; **alerts + OCR** subscribe | Alerts + OCR gated | Full | Full |
| **Calculators** | Create account modal | Buffalo Link + MHB free; locks → subscribe | Gated | Full | Full |
| **AP Guides** | Create account modal | **`FREE_GUIDE_SLUGS`** (14 titles) | **Release year ≤ 2019** pack + weekly **2020+** drop | Full library instantly | Full |

---

## 9. UX — modal types

| Modal | When |
| --- | --- |
| **Create account** | Anonymous user: navigation, post tap, search (when present), or any disallowed action. Dismiss → can still read the Lounge feed; modal returns on next violation. |
| **Subscribe** | Free user hits a subscriber-only feature (locked calc/guide, calendar alerts/OCR, bankroll/logbook over free limits, etc.). Include clear **Subscribe** action. |

---

## 10. Revision log

| Date | Change |
| --- | --- |
| 2026-05-10 | Initial template; filled anon/create-account gating; free verified + subscribe gates; paid + add-on paywalls; staff; TBD + modal UX. |
| 2026-05-10 | Removed **50 posts per day** cap; anon Lounge read-only is uncapped aside from normal pagination/RLS. |
| 2026-05-18 | Hamburger **Offers** row renamed **Calendar** (tab id `offers` unchanged; deep links `?tab=offers` unchanged). |
| 2026-05-10 | Hamburger: lock icons on **Calcs**, **AP Guides**, **Bankroll** for free non-subscribers; staff/subscribers see no locks; Calendar menu row unlocked (gates in-feature). |
| 2026-05-10 | **Signup:** no client **`allowed_emails`** whitelist; free tier = signed-in user until billing flags ship. |
| 2026-06-27 | **Bankroll + Logbook:** free users get **10 bankroll sessions** and **10 play logs**; hub tiles unlocked; create buttons lock at limit → subscribe. Constants in **`freemiumToolLimits.js`**. |
| 2026-07-01 | **Free tier guide + calc list:** **`FREE_GUIDE_SLUGS`** (14 AP guides) and **`FREE_CALCULATOR_KEYS`** (Buffalo Link + MHB only). Starter pack remains release year ≤ 2019. |
| 2026-07-01 | **Starter weekly drop rules locked:** per-user uniform random from **remaining** published **2020+** slugs (excludes free list + prior grants). Migration **`20260701130000_starter_weekly_guide_unlocks.sql`**, pool helpers **`starterWeeklyDropPool.js`**, client **`useStarterWeeklyDropGuideSlugs`**. |
