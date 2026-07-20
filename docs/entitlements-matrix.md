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
| `edge-pro` | Edge Pro | EdgeTilt | 100% platform | **Planned** ... platform social tier (ads, filters, reply controls) |
| `creator-fan:{creator_user_id}` | Support @{handle} (working title) | Creator (via Connect) | **70% creator / 30% EdgeTilt** | **Planned** |
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

### 2.2 Lounge ... author controls (your posts)

| Capability | Free | Edge Pro | Slots Edge* | Creator (monetized) | Staff |
| --- | --- | --- | --- | --- | --- |
| Post / thread (500 chars) | Y | Y | Y (2000 chars) | Y | Y |
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

**Webhooks:** `stripe-webhook` routes by `product_slug` / metadata to the correct grant writer. Fan subs use **Connect** + `application_fee_percent: 30` (or equivalent).

---

## 5. Creator fan sub ... v1 scope (locked for design)

| Item | v1 choice |
| --- | --- |
| Who can enable | **Verified** users + completed Connect onboarding |
| Pricing | **Preset monthly tiers only** (no custom amount). Creators pick **one** tier at enable time; change tier later via settings (new subscribers at new price; existing subs follow Stripe price-change rules). |
| Tier MSRP (monthly) | **$4.99**, **$9.99**, **$19.99**, **$49.99**, **$99.99** ... locked **2026-07-20** (Ryan) |
| Tier keys (Stripe / DB) | `fan-tier-499`, `fan-tier-999`, `fan-tier-1999`, `fan-tier-4999`, `fan-tier-9999` ... one shared Connect Price per key platform-wide |
| Benefits | Fan-only posts + one fan group chat room |
| Chat | **Not E2EE**; creator-owned moderation; searchable room metadata; message access members-only |
| Cancel | Access through **paid period end**, then remove room membership |
| Platform fee | **30%** EdgeTilt / **70%** creator |

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

Track implementation in `docs/test-buildout-backlog.md` when Phase 1 work starts.

---

## 7. Revision log

| Date | Change |
| --- | --- |
| 2026-07-18 | Initial matrix: multi-product catalog, capability table, creator fan sub v1, Edge Pro platform tier, stacking rules, engineering target, rollout phases (Ryan spec). |
| 2026-07-20 | Creator fan sub preset tiers locked to **five** monthly MSRPs: $4.99 / $9.99 / $19.99 / $49.99 / $99.99 + tier keys `fan-tier-*`. |
