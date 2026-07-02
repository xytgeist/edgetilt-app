# Access tiers — product spec (source of truth)

**Purpose:** Define **no account**, **free (verified) account**, **paid subscriber**, and **staff** behavior before entitlements, RLS, and UI gates are implemented.

**Related:** `docs/social-feed-roadmap.md` (Freemium & subscriptions), `docs/frontend-architecture.md` (Access model), `AGENTS.md`.

---

## 1. Tier summary

| Tier | Internal label | One-line intent |
| --- | --- | --- |
| **No account** | `anonymous` | Lounge only: **read-only** feed (no post cap — same feed depth as public RLS + app pagination allow). No search/filter/post detail/navigation; **create account** modal on forbidden actions. |
| **Free (verified user)** | `free` | Full **Lounge** (post, lounge search, filter, comment, like, repost, bookmark, etc.). **Verified user** badge by display name. Rest of app reachable from menu; **subscribe** gates on bankroll, offer alerts/OCR, locked calcs/guides. |
| **Paid — Slots Edge** | `starter` / `slots-edge-starter` | **Verified** + **subscriber** badges. **AP guide cards** are the primary product: fixed **starter pack** on subscribe + **one random premium guide drop per week** (engagement + upgrade funnel). Tools mostly gated. See **§5**. |
| **Paid — Slots Edge Pro** | `full` / `slots-edge` | **Verified** + **subscriber** badges. **Instant full AP guide library** + all calculators + unlimited bankroll/logbook + calendar alerts/OCR. **New** game packs may add **subscriber-only** add-on paywalls. See **§5**. |
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

### 5.1 Pricing catalog (MSRP + founding member 25% off — locked 2026-07-02)

| Plan | Internal slug | MSRP (anchor) | Founding member (25% off) |
| --- | --- | --- | --- |
| **Slots Edge** | `slots-edge-starter` | **$19.99/mo** | **$14.99/mo** (× 12 billing months) |
| **Slots Edge — annual** | `slots-edge-starter` (annual Price) | **$219.99/yr** (~$18.33/mo; one month free vs $19.99×12) | **$164.99/yr** (~$13.75/mo effective; once at checkout) |
| **Slots Edge Pro — monthly** | `slots-edge` | **$59.99/mo** | **$44.99/mo** (× 12 billing months) |
| **Slots Edge Pro — annual** | `slots-edge` (annual Price) | **$660/yr** (~$55/mo; one month free vs $59.99×12) | **$495/yr** (~$41.25/mo effective; once at checkout) |
| **Slots Edge Lifetime** | `slots-edge-lifetime` | **$1,699** one-time | **$1,274.25** (once at checkout) |

**Founding member offer:** **25% off** via Stripe Coupons — **`STRIPE_COUPON_FOUNDING_MONTHLY`** (or legacy **`STRIPE_COUPON_EARLY_BIRD`**) on **monthly** Slots Edge and Slots Edge Pro: `percent_off: 25`, `duration: repeating`, `duration_in_months: 12`. **`STRIPE_COUPON_FOUNDING_ONCE`**: `percent_off: 25`, `duration: once` on **annual Slots Edge**, **annual Slots Edge Pro** subscription checkout, and **Slots Edge Lifetime** one-time payment.

**Competitive positioning:** Founding Slots Edge Pro at **~$45/mo** sits at the top of typical AP sites (**$35–49/mo**) while MSRP **$60** anchors premium vs competitors. Slots Edge founding **~$15/mo** keeps a clear **~3×** gap to Pro.

### 5.3.1 Slots Edge Lifetime (`slots-edge-lifetime`)

**Guides + tools**

- **Same as Slots Edge Pro today:** entire published AP guide library, all calculators, unlimited bankroll/logbook, calendar OCR/alerts.
- **Future Slots vertical:** all **new Slots Edge guides, calculators, and tools** we ship are included **without add-on paywalls** (see §5.3 add-ons ... Lifetime is the exception within **Slots** only).
- **Not included:** separate verticals when they ship (**`sports-edge`**, **`crypto-edge`**) ... those remain their own products.

**Billing**

- **One-time** Stripe Checkout (`mode: payment`), not a subscription.
- Entitlement row in **`user_subscriptions`** with **`product_slug = slots-edge-lifetime`**, **`status = active`**, no renewal.
- **`profiles.has_active_subscription`** mirrors Lifetime the same as active **`slots-edge`** (Slots Edge Pro; legacy hamburger/chat gates).

**Removed from v1 note:** Lifetime was TBD; now catalogued above. MSRP **$1,699** · founding **$1,274.25** at 25% off.

### 5.2 Slots Edge (`slots-edge-starter`)

**Guides (hero)**

- **Starter pack** on subscribe: **all guides with `machines.release_year` ≤ 2019**, except **`SLOTS_EDGE_PRO_ONLY_GUIDE_SLUGS`** (today: **Buffalo Diamond** → Pro only). Guides without a release year are **not** in the starter pack unless also granted via weekly drop.
- **Weekly Guide Drop:** once per UTC week, **each Starter subscriber** gets **one independent random roll** from their **remaining** pool:
  - **Eligible pool:** published guides with **`machines.release_year` ≥ 2020** (`GUIDE_WEEKLY_DROP_MIN_RELEASE_YEAR`), excluding **`FREE_GUIDE_SLUGS`** (already free for everyone).
  - **Remaining pool (per user):** eligible slugs minus slugs that user **already earned** via prior weekly drops (starter pack ≤ 2019 is implicit and never in the pool).
  - **No duplicates** for that user; when the pool is exhausted, the job skips until new 2020+ guides ship.
  - **Persistence:** `starter_weekly_guide_unlocks` + **`get_my_starter_weekly_guide_slugs()`**; cron calls **`grant_starter_weekly_guide_drop(user_id)`** (service role).
- **Reveal UX:** in-app drop moment + optional push; each reveal surfaces **upgrade to Slots Edge Pro** CTA.
- **On cancel:** user **keeps** guides already unlocked (earned library persists).

**Tools**

- Bankroll, logbook, calendar OCR/alerts remain **gated** (same free-tier limits).
- **Calculators:** Starter unlocks calculators **paired** with guides they can open (starter pack **`release_year` ≤ 2019** + weekly drops), except **`SLOTS_EDGE_PRO_ONLY_CALCULATOR_KEYS`** (today: **Buffalo Diamond** → Pro only). WoF 4D CE and other paired tools stay on Starter when the guide is unlocked. Implemented via **`buildStarterUnlockedCalculatorKeys`** / **`useStarterCalculatorUnlocks`**. Free tier uses **`FREE_CALCULATOR_KEYS`** only.

**Lounge**

- **Subscriber** badge on posts (any paid plan).

### 5.3 Slots Edge Pro (`slots-edge`)

**Guides**

- **Instant access to the entire published AP guide library** (no weekly drop; no randomness on this tier).

**Tools**

- **All** calculators unlocked.
- **Unlimited** bankroll sessions and play logbook entries.
- Calendar **alerts** + offer image **OCR**.

**Lounge**

- **Subscriber** badge on posts.

**Add-ons**

- When **new games** ship with new calculators and/or guides, those assets may have an **additional paywall** for **monthly/annual Slots Edge Pro** subscribers. **Slots Edge Lifetime** and **staff** get those Slots assets without add-on purchase; free and Slots Edge users see upgrade/subscribe flows instead.

### 5.4 Upgrades

- **Slots Edge → Slots Edge Pro:** same **Upgrade to Slots Edge Pro** button in **`SubscribeModal`**. Edge **`stripe-create-checkout-session`** detects active **`slots-edge-starter`** and **updates the existing Stripe subscription** to the Pro price with **`proration_behavior: always_invoice`** (unused Slots Edge time credits against the upgrade invoice). **`user_subscriptions`** Starter row is removed; Pro row is upserted on the same **`stripe_subscription_id`**. **Immediate** full library unlock.
- **Free → either plan:** standard subscribe modal with plan picker.

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
| **Which calcs/guides are free vs locked** | **Calcs (free):** **`FREE_CALCULATOR_KEYS`** (Buffalo Link + MHB). **Calcs (Pro only, not Starter pairing):** **`SLOTS_EDGE_PRO_ONLY_CALCULATOR_KEYS`** (Buffalo Diamond). **Calcs (always subscriber):** **`SUBSCRIBER_ONLY_CALCULATOR_KEYS`** (Phoenix Link + Stack Up Pays). **Guides (free):** **`FREE_GUIDE_SLUGS`**. **Guides (Pro only, not Starter pack):** **`SLOTS_EDGE_PRO_ONLY_GUIDE_SLUGS`** (Buffalo Diamond). **Guides (Starter):** **`release_year` ≤ 2019** + weekly **2020+** drops, minus Pro-only slugs. **Admins:** **`content_access_gates`** (except subscriber-only / Pro-only lists). |
| **Signup / verification** | Supabase auth + email verification policy for “free” tier — **TBD** (no `allowed_emails` gate in the client). |
| **Stripe products** | **Slots Edge:** `slots-edge-starter` ($19.99/mo MSRP), **`slots-edge`** Full ($59.99/mo + $660/yr MSRP), **`slots-edge-lifetime`** ($1,699 one-time) — see **§5.1**. **`sports-edge`**, **`crypto-edge`** later. Price IDs in Edge secrets; **25% founding coupons** (monthly ×12 + once for annual/lifetime). **`user_subscriptions`** + Starter guide unlocks. **`get_my_entitlements()`** RPC; legacy **`has_active_subscription`** mirrors **active Full `slots-edge`** or **Lifetime**. See **`supabase/functions/stripe-create-checkout-session/README.md`**. |
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
| 2026-07-01 | **Public tier names:** **Slots Edge** (`slots-edge-starter`), **Slots Edge Pro** (`slots-edge`), **Slots Edge Lifetime** (`slots-edge-lifetime`). Migration **`20260701150000_subscription_product_tier_display_names.sql`**. Subscribe modal + **`edgeProducts.js`** display names. |
| 2026-07-02 | **Buffalo Diamond → Pro only:** **`SLOTS_EDGE_PRO_ONLY_GUIDE_SLUGS`** + **`SLOTS_EDGE_PRO_ONLY_CALCULATOR_KEYS`** in **`guideAccess.js`** / **`calculatorAccess.js`**. Starter keeps WoF 4D CE guide + calc when guide is unlocked. |
