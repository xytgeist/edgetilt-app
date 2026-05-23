# Access tiers — product spec (source of truth)

**Purpose:** Define **no account**, **free (verified) account**, **paid subscriber**, and **staff** behavior before entitlements, RLS, and UI gates are implemented.

**Related:** `docs/social-feed-roadmap.md` (Freemium & subscriptions), `docs/frontend-architecture.md` (Access model), `AGENTS.md`.

---

## 1. Tier summary

| Tier | Internal label | One-line intent |
| --- | --- | --- |
| **No account** | `anonymous` | Lounge only: **read-only** feed (no post cap — same feed depth as public RLS + app pagination allow). No search/filter/post detail/navigation; **create account** modal on forbidden actions. |
| **Free (verified user)** | `free` | Full **Lounge** (post, lounge search, filter, comment, like, repost, bookmark, etc.). **Verified user** badge by display name. Rest of app reachable from menu; **subscribe** gates on bankroll, offer alerts/OCR, locked calcs/guides. |
| **Paid subscriber** | `subscriber` | **Verified user** + **subscriber** badges on Lounge posts. Full access to current shipped features. **New** games/calcs/guides may ship with an **extra paywall** purchasable **only by subscribers** (optional add-on). |
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
- **Hamburger UI:** Menu rows that are **subscriber-only at the product level** show a **lock icon** next to the label for free (non-subscriber) users; **staff** and **active subscribers** do not see those locks. (**Calendar** stays **unlocked** in the menu because the calendar is free; **alerts** and **OCR** stay subscribe-gated **inside** Calendar.)

**Per-feature subscribe requirements**

| Area | Free tier |
| --- | --- |
| **Bankroll manager** | **Subscribe** to use (gate + subscribe CTA). |
| **Calendar** | May use calendar **without** subscribe. **Subscribe** for **alerts** and for **image upload AI OCR** on offers. |
| **Calculators** | **Subset unlocked**; **majority locked**. Locked rows: **lock icon** on calculator button; tap → **subscribe** popup with path to purchase. Unlocked calcs behave normally. |
| **AP Guides** | **Some guides unlocked**, **many locked**; same pattern as calcs — lock affordance + tap → **subscribe** popup. |

Copy for modals: distinguish **create account** (anon) vs **subscribe** (free user hitting paid feature).

---

## 5. Paid subscriber

- **Verified** + **subscriber** badges on **posts in Lounge** (display rules as designed in UI).
- **Full access** to all features that are generally available in the app at that time.
- **New content paywall:** When **new games** launch with **new calculators and/or guides**, those assets may have an **additional paywall**. **Only subscribers** are offered the **option to purchase** that add-on (free users do not get that purchase path).
- Staff (§6) bypass normal gates including add-ons.

---

## 6. Moderator and admin

- **Full access** to the entire app, including **any new calculators and guides** (no lockout from general or add-on content).
- **Special badges** (distinct from verified / subscriber).
- Implemented via existing / planned **`profiles.role`** (`moderator`, `admin`) plus RLS that mirrors these rules.

---

## 7. Engineering / policy TBD (fill when decided)

| Topic | Status |
| --- | --- |
| **Which calcs/guides are free vs locked** | Curated list or metadata per slug — **TBD** (product + content). |
| **Signup / verification** | Supabase auth + email verification policy for “free” tier — **TBD** (no `allowed_emails` gate in the client). |
| **Stripe products** | Base subscription vs add-on SKUs for new-game packs — **TBD**. |

---

## 8. Per-surface matrix (condensed)

| Surface | No account | Free | Paid | Staff |
| --- | --- | --- | --- | --- |
| **Lounge** | Read-only full feed (no search/filter/post tap); forbidden actions → create account modal | Full + verified badge | Full + verified + subscriber on posts | Full + staff badges |
| **Hamburger / other tabs** | Create account modal | Allowed; gated features show subscribe modal | Full | Full |
| **Bankroll** | Create account modal | Subscribe | Full | Full |
| **Calendar** | Create account modal | Calendar yes; **alerts + OCR** subscribe | Full | Full |
| **Calculators** | Create account modal | Some unlocked; locks → subscribe | Full; add-on paywalls **offered to subscribers only** | Full |
| **AP Guides** | Create account modal | Some unlocked; locks → subscribe | Full; new-game add-ons **offered to subscribers only** | Full |

---

## 9. UX — modal types

| Modal | When |
| --- | --- |
| **Create account** | Anonymous user: navigation, post tap, search (when present), or any disallowed action. Dismiss → can still read the Lounge feed; modal returns on next violation. |
| **Subscribe** | Free user hits a subscriber-only feature (bankroll, alerts, OCR, locked calc/guide, etc.). Include clear **Subscribe** action. |

---

## 10. Revision log

| Date | Change |
| --- | --- |
| 2026-05-10 | Initial template; filled anon/create-account gating; free verified + subscribe gates; paid + add-on paywalls; staff; TBD + modal UX. |
| 2026-05-10 | Removed **50 posts per day** cap; anon Lounge read-only is uncapped aside from normal pagination/RLS. |
| 2026-05-18 | Hamburger **Offers** row renamed **Calendar** (tab id `offers` unchanged; deep links `?tab=offers` unchanged). |
| 2026-05-10 | Hamburger: lock icons on **Calcs**, **AP Guides**, **Bankroll** for free non-subscribers; staff/subscribers see no locks; Calendar menu row unlocked (gates in-feature). |
| 2026-05-10 | **Signup:** no client **`allowed_emails`** whitelist; free tier = signed-in user until billing flags ship. |
| 2026-05-10 | DB: **`profiles.has_active_subscription`** + testing doc **`docs/test-user-roles.md`** for tier checks. |
