# Entitlements matrix ... multi-product paywalls (source of truth)

**Purpose:** One place for **what each product unlocks**, separate from **how we sell it** (Stripe) and **who sees which Subscribe button** in UI. Use this before RLS, webhooks, and new checkout flows.

**Status:** **Planned / partial.** Rows marked **shipped** match `docs/access-tiers.md` today. Rows marked **planned** capture Ryan decisions from **2026-07-18** (creator fan subs, Edge Pro platform tier, add-ons). Implementation order: **§6**.

**Related:** `docs/access-tiers.md` (anonymous / free / Slots Edge / staff today), `docs/affiliates.md` (curated affiliate commission on **EdgeTilt** plans, not fan subs), `docs/social-feed-roadmap.md` (Freemium), `supabase/chat_phase1.sql` (chat + upgrade path notes).

**Not legal advice:** Creator fan rooms, paid groups, and gambling-adjacent UGC still need ToS, reporting, and payment-processor review regardless of encryption plans.

---

## 1. Product catalog

| Product ID | Customer-facing name | Billed to | Revenue split | Status |
| --- | --- | --- | --- | --- |
| _(none)_ | Free account | n/a | n/a | **Shipped** |
| `slots-edge-starter` | Slots Edge | EdgeTilt | 100% platform | **Shipped** |
| `slots-edge` | Slots Edge Pro | EdgeTilt | 100% platform | **Shipped** |
| `slots-edge-lifetime` | Slots Edge Lifetime | EdgeTilt | 100% platform | **Shipped** |
| `edge-pro` | Edge Pro | EdgeTilt | 100% platform | **Shipped ($9.99/mo)** ... platform social tier (badge, reply controls, pro-only stream & comments filter, Stripe checkout) |
| `creator-fan:{creator_user_id}` | Support @{handle} (working title) | Creator (via Connect) | **80% creator / 20% EdgeTilt** | **Shipped** |
| `addon:*` | Niche tool packs (e.g. future sports/crypto vertical tools) | EdgeTilt | 100% platform (TBD) | **Planned** |
| `affiliate` | _(not a buyer product)_ | n/a | Commission on EdgeTilt subs | **Shipped** ... see `docs/affiliates.md` |

**Naming rule:** Every checkout surface must show **product name + one-line benefit**. Never reuse the generic word "Subscribe" without context.

---

## 2. Capability matrix

Legend: **Y** = yes · **N** = no · **Own** = only on content you author · **Gate** = paywall modal · **TBD** = product decision open

### 2.1 Lounge ... read & social (viewer)

| Capability | Anon | Free | Edge Pro | Slots Edge* | Creator fan† | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| Read public Lounge feed | Y | Y | Y | Y | Y | Y |
| Open post detail | Gate → account | Y | Y | Y | Y | Y |
| Like / repost / quote repost | Gate → account | Y | Y | Y | Y | Y |
| Comment / reply on public posts | Gate → account | Y | Y | Y | Y | Y |
| **No ads** in Lounge | N | N | **Y** | N‡ | N‡ | Y |
| **Filter out** posts from non‑Edge‑Pro authors | N | N | **Y** | N | N | Y |
| Read **creator fan-only** posts | N | N | N | N | **Y** (if sub to that creator) | Y |
| Read **platform** `subscriber_only` bot posts (Scott Share) | N | N | N | **Y** | N | Y |

\* Any active Slots Edge Starter, Pro, or Lifetime (`has_active_subscription` / entitlements RPC today).

† Per-creator grant: `creator_subscriptions` (planned) where `subscriber_user_id = me` and `creator_user_id = author`.

‡ Unless also subscribed to Edge Pro; products stack independently.

Pro-only stream / comment filter uses **`profiles.has_edge_pro`** (`edge-pro`, Slots Edge Lifetime, or staff). The cyan Verified Subscriber checkmark still uses **`has_active_subscription`** (Slots Pro counts).

### 2.2 Lounge ... author controls (your posts)

| Capability | Free | Edge Pro | Slots Edge* | Creator (monetized) | Staff |
| --- | --- | --- | --- | --- | --- |
| Post / thread (500 chars) | Y | Y (10000 chars) | Y (10000 chars) | Y | Y |
| Mark post **creator fan-only** | N | N | N | **Y** | Y |
| **Replies on my posts** limited to Edge Pro subscribers only | N | **Y** (author setting) | N | N | Y |
| Non‑subscribers may view/like/repost but **not reply** on gated threads | N | **Y** (when setting on) | N | N | Y |

### 2.3 Chat

| Capability | Free | Edge Pro | Slots Edge* | Creator fan† | Fan room mod | Staff |
| --- | --- | --- | --- | --- | --- | --- |
| DM / existing groups | Y | Y | Y | Y | Y | Y |
| **Discover** creator fan room in search (metadata only) | Y | Y | Y | Y | Y | Y |
| **Enter** creator fan room | Gate → fan sub | Gate → fan sub | Gate → fan sub | **Y** | **Y** | Y |
| Denied UX copy | n/a | n/a | n/a | "Must be subscribed to @{handle}…" + **Support @{handle}** CTA | n/a | n/a |
| **Moderate** fan room (delete msg, kick, mute) | N | N | N | **Own** (owner) | **Assigned** by owner | Platform staff override TBD |
| E2EE message bodies | N | N | N | **Planned v2+** (not v1) | same | N |

Fan room lifecycle (planned): auto-create on monetization enable · webhook **add member** on subscribe · **remove** after period end (+ optional grace) · room roles: `owner` · `moderator` · `member`.

### 2.4 Slots vertical (tools & guides)

| Capability | Free | Slots Edge Starter | Slots Edge Pro / Lifetime | Add‑on (planned) | Staff |
| --- | --- | --- | --- | --- | --- |
| Free calc + guide slugs | Y | Y | Y | n/a | Y |
| Starter pack + weekly drops | Gate | Y | Y (full library) | n/a | Y |
| All calcs / unlimited bankroll & logbook | Gate | Partial | Y | n/a | Y |
| Calendar alerts + OCR | Gate | Gate | Y | n/a | Y |
| New game pack add-on | Gate | Gate | Gate or bundle TBD | **Y** when purchased | Y |

Detail for shipped rules: **`docs/access-tiers.md` §4–§5**.

### 2.5 Creator monetization (seller)

| Capability | Any verified user | Creator mode enabled | Staff |
| --- | --- | --- | --- |
| Set fan sub price (preset tiers v1) | N | **Y** | Y |
| Stripe Connect onboarding | N | **Required** before first payout | n/a |
| Receive 70% of fan sub net | N | **Y** | n/a |
| Fan room + fan-only posts | N | **Y** | Y |
| Assign fan room moderators | N | **Y** | Y |

---

## 3. How products combine (stacking rules)

| Rule | Decision |
| --- | --- |
| **Independent grants** | Edge Pro, Slots Edge, each creator fan sub, and each add-on are **separate entitlements**. Owning one does not imply owning another. |
| **UI** | Profile shows **Support @{handle}** for fan subs; Settings / Subscribe modal shows **Edge Pro** and **Slots Edge**; never one ambiguous button. |
| **RLS** | Server checks the **specific grant** for each action (e.g. fan post → `has_creator_sub(me, author)`; Edge Pro reply gate → author setting + viewer's `edge-pro` grant). |
| **Affiliate promos** | Creator **affiliate** codes apply to **EdgeTilt catalog** checkouts only, not fan subs (`docs/affiliates.md`). |
| **Founding coupons** | EdgeTilt platform catalog only; no stacking with affiliate codes (existing rule). |

---

## 4. Engineering model (target)

Single read path for clients and RLS helpers:

```text
get_my_entitlements(user_id) → {
  platform: { edge_pro: bool, slots_edge_tier: 'none'|'starter'|'pro'|'lifetime', addons: string[] },
  creator_fans: [ { creator_user_id, status, period_end } ],
  staff: { is_staff, is_admin }
}
```

**Planned tables (names TBD in migrations):**

| Store | Holds |
| --- | --- |
| `user_subscriptions` | **Shipped** ... EdgeTilt Stripe subs |
| `user_entitlements` or product-specific rows | **Planned** ... Edge Pro, add-ons |
| `creator_monetization_profiles` | **Planned** ... price tier, Connect account, fan room id |
| `creator_subscriptions` | **Planned** ... fan ↔ creator Stripe sub id, status |
| `chat_room_members.role` | **Shipped** base ... extend with `moderator` + room owner |

**Webhooks:** `stripe-webhook` routes by `product_slug` / metadata to the correct grant writer. Fan subs use **Connect** + `application_fee_percent: 20` (or equivalent).

---

## 5. Creator fan sub ... v1 scope (locked for design)

| Item | v1 choice |
| --- | --- |
| Who can enable | **Verified** users + completed Connect onboarding |
| Pricing | **Preset monthly tiers only** (no custom amount). Creators pick **one** tier at enable time; change tier later via settings (new subscribers at new price; existing subs follow Stripe price-change rules). |
| Tier MSRP (monthly) | **$4.99**, **$9.99**, **$19.99**, **$49.99**, **$99.99**, **$149.99**, **$249.99** ... locked **2026-07-21** (Ryan; added $149 / $249) |
| Tier keys (Stripe / DB) | `fan-tier-499`, `fan-tier-999`, `fan-tier-1999`, `fan-tier-4999`, `fan-tier-9999`, `fan-tier-14999`, `fan-tier-24999` ... one shared Connect Price per key platform-wide |
| Benefits | Fan-only posts + one **Private Subs** fan group chat (creator-named, description + topic keywords, editable avatar) |
| Chat | **Not E2EE**; creator-owned moderation (§5 UI after tab ships); **Private Subs** tab lists all live fan rooms with in-tab search (name, description, keywords); member rooms highlighted + top; **not** in Inbox; message access members-only |
| Cancel | Access through **paid period end**, then remove room membership |
| Platform fee | **20%** EdgeTilt / **80%** creator (locked **2026-09-03**; was 30/70) |
| Promo codes | **Shipped 2026-09-03** ... creator self-serve codes in Settings (`creator_fan_promo_codes` + Edge `creator-fan-promo`). Fans enter optional code at checkout. **Creator eats the discount**; `application_fee_percent: 20` applies to the **final paid** amount. |

---

## 6. Phased rollout (recommended)

| Phase | Deliverable | Depends on |
| --- | --- | --- |
| **0** | This doc + `get_my_entitlements()` shape agreed | n/a |
| **1** | Entitlement RPC + Stripe routing refactor (Edge Pro stub ok) | Phase 0 |
| **2** | **Creator fan sub MVP** (Connect, checkout, fan posts, fan room, search gate, mod roles) | Phase 1 |
| **3** | **Edge Pro** (ads off, feed filter, author reply restrictions) | Phase 1 |
| **4** | Add-on SKUs + Lifetime/Pro bundle rules | Slots vertical |
| **5** | Fan room E2EE (optional) | Phase 2 traction + crypto design |

Track implementation in `docs/test-buildout-backlog.md` when Phase 1 work starts. **Detailed task breakdown (2026-07-21):** **`docs/test-buildout-backlog.md` § Creator fan subs — product backlog** (Settings manage subs, composer audience, feed teaser, **Chat Private Subs tab §4**, room mod tools §5, **creator new-sub awareness §7**, audio hang out).

---

## 7. Revision log

| Date | Change |
| --- | --- |
| 2026-07-18 | Initial matrix: multi-product catalog, capability table, creator fan sub v1, Edge Pro platform tier, stacking rules, engineering target, rollout phases (Ryan spec). |
| 2026-07-22 | **Private Subs** chat tab spec locked (Ryan): creator-named fan rooms + description + topic keywords + editable avatar; full catalog with in-tab search; member rows highlighted and top; fan rooms excluded from Inbox; zero-sub rooms still listed; §5 mod UI may ship after tab. Backlog **`test-buildout-backlog.md` §4**. |
| 2026-07-21 | Creator fan sub tiers expanded to **seven** monthly MSRPs: added **$149.99** / **$249.99** (`fan-tier-14999`, `fan-tier-24999`); migration **`20260721180000`**. |
| 2026-07-20 | Creator fan sub preset tiers locked to **five** monthly MSRPs: $4.99 / $9.99 / $19.99 / $49.99 / $99.99 + tier keys `fan-tier-*`. |
| 2026-07-21 | Feed teaser model for fan-only posts (visible in main feed, partial line + subscribe CTA, auto-follow on sub) added to product backlog; supersedes “hide fan-only from non-subs” for **timeline** only — full post detail policy TBD in backlog §3. |
| 2026-08-28 | **Edge Pro Tier Phase 3 foundation landed:** `reply_gate_edge_pro` column + helper `has_edge_pro_entitlement()`, `feed_comments_insert_own` RLS reply-gate enforcement, composer reply gate picker, thread header indicator, comment footer gate message, `LoungeEdgeProBadge` on author headers & profile, expanded `get_my_entitlements()`. |
| 2026-08-28 | **Edge Pro VIP feed & comment filter:** Global Pro preference in Lounge settings (`readLoungeProFilterEnabled` / `writeLoungeProFilterEnabled`) filters timeline to Pro authors and collapses non-Pro replies; post detail provides a one-tap override pill to reveal all comments for that thread while preserving OP continuity and staff visibility. |
| 2026-09-03 | **Fan platform fee → 20%** EdgeTilt / **80%** creator (`CREATOR_FAN_PLATFORM_FEE_PERCENT`). Listed in Settings enable copy + go-live callout. New checkouts only … existing Stripe subs keep fee set at signup. |
| 2026-09-03 | **Creator fan promo codes shipped:** table `creator_fan_promo_codes`, Edge `creator-fan-promo` (list/create/deactivate) + checkout `promo_code` → Stripe `discounts.promotion_code`. Policy: creator eats discount; platform fee is % of final price. |
| 2026-09-05 | **IAP dual-path (code):** same `user_subscriptions` / `creator_subscriptions` rows for Stripe or Apple (`billing_provider`). Fan IAP is one StoreKit SKU per tier, bound to a creator via `apple_iap_intents`. IPA: web/Safari still offered. ASC products + ASSN still owed. |
| 2026-09-05 | **IAP dual-path + ASSN on prod:** SQL `20260905120000` + `20260905140000`, Edge `apple-iap-verify` + `apple-iap-notify` on `jtjgtucumuoswnbauxry`. Ryan pastes the Production ASSN URL. |
| 2026-09-05 | **IAP refund + ASSN (test):** `beginRefundRequest` + Edge `apple-iap-notify` revoke on REFUND/REVOKE/EXPIRED. SQL `20260905140000`. |
| 2026-09-05 | **Edge Pro Settings IPA unlock card:** IAP `$11.49` only. No web `$9.99` on that card. |
| 2026-09-05 | **Edge Pro Settings unlock card (US IPA):** App Store `$11.49` + web `$9.99`. CTAs side by side (iPhone outline, web filled). Copy: markdown, no ads, 10k posts. Badge dropped. |
| 2026-09-05 | **Edge Pro Settings always prints web `$9.99`.** Storefront gate had hidden it. |
| 2026-09-06 | **Pro-only stream is Edge Pro only.** `profiles.has_edge_pro` + migration **`20260906120000`**. Slots Edge Pro authors drop out of the filtered feed / comments. Verified Subscriber checkmark still uses `has_active_subscription`. Lifetime still counts as Edge Pro. **`1.4.94`.** |
| 2026-09-06 | **Slots Edge Pro does not grant Edge Pro.** Lounge Settings unlock card + viewer Pro gates (`isViewerEdgePro`, reply-gate composer) no longer treat `has_active_subscription` / Slots Pro as Edge Pro. Lifetime + staff still included via `hasEdgePro()`. Author badges still use the legacy profile flag. **`1.4.93`.** |
| 2026-09-05 | **`apple-iap-verify` deployed on test** after sandbox confirm 404. Client fails closed before StoreKit if begin cannot reach the function. **`1.4.92`.** |
| 2026-09-05 | **IPA Subscribe carousel hides Lifetime again** until Apple unlocks price points above `$1,000`. Web still shows the card. **`1.4.91`.** |
| 2026-09-05 | **IPA Subscribe carousel shows Lifetime again** (Starter + Pro + Lifetime, same as web). **Superseded same night** (`1.4.91`). |
| 2026-09-05 | **IPA Subscribe carousel hides Lifetime** until higher App Store price points. Web still shows the card. **Superseded same day** when Ryan put the card back. |
| 2026-09-05 | **Storefront gate:** IPA shows a cheaper web price next to IAP only when StoreKit storefront is `USA`. |
| 2026-09-05 | **US IPA SubscribeModal:** each card shows App Store `displayPrice` plus the Stripe/web amount. Both CTAs include a dollar. Confirmed non-US hides the web dollar. |
| 2026-09-05 | **US IPA paywall hierarchy:** web is the cyan CTA; App Store and web prices sit as peer tiles. Non-US still leads with IAP. |
| 2026-09-05 | **IAP introductory offers:** code reads StoreKit intro price. Ryan configures ASC pay-as-you-go offers (founding web × 1.15). Lifetime excluded. |
| 2026-08-30 | **Edge Pro $9.99/mo Stripe checkout & subscription tier live:** Added `edge-pro` to `subscription_products` (migration `20260830235000`), updated `sync_profile_has_active_subscription`, enabled direct Stripe Checkout routing via `STRIPE_PRICE_EDGE_PRO`, and wired in-app Upgrade to Edge Pro buttons in Settings and Membership management. |
