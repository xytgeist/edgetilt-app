# Frontend architecture

How the React app is organized after the **feature-module split** (2026). Use this when onboarding, finding code, or planning refactors.

## Entry and bootstrap

- **`src/main.jsx`** — mounts the root component (unchanged pattern).
- **`src/App.jsx`** — **auth and session only**: Supabase client, login / signup / forgot password / reset password, OAuth callback handling, routing between auth panel vs the app shell, and **`browseMode`** (anonymous vs member). It imports **`AppShell`** when `currentView === 'app'`. **No client-side email whitelist** — any successful Supabase session is treated as a member for shell access (freemium / subscribe gates are separate).
- **`src/features/shell/AppShell.jsx`** — **logged-in application**: bottom navigation, tab state, Lounge feed wiring, Offers / Guides / Intel / Bankroll / Calculators / Team surfaces, global confirm modal, URL query handling for offers deep links, and iOS PWA notification prompt coordination.

Keeping auth in **`App.jsx`** and product chrome in **`AppShell`** avoids a circular dependency story and keeps the entry file small (~hundreds of lines instead of thousands).

## Access model (public browse + member)

- **Anonymous:** No Supabase session → user lands in **`AppShell`** immediately (Supabase **anon** key; public-read RLS paths work). A sticky strip invites **Log in**; Lounge and other surfaces follow **anon** policies (today: read-only patterns in Lounge where writes require auth).
- **Member:** Any authenticated Supabase session → **`browseMode === 'member'`** (log out, posting, offers sync, etc. as implemented). **`hasActiveSubscription`** = **`profiles.has_active_subscription`** OR env **`VITE_HAS_ACTIVE_SUBSCRIPTION`**; **`isStaff`** = **`profiles.role`** in `moderator` / `admin`. Those drive **hamburger lock icons** in `AppShell.jsx`. Testing: **`docs/test-user-roles.md`**, SQL **`supabase/profiles_tier_testing.sql`**.
- **Auth UI:** Log in / sign up / forgot password render as a **full-screen panel** when the user opens auth from the strip, **Continue without signing in**, or when a feature calls **`onRequireAuth`** (no full-app reload). Whitelist rejection sets a dismissible **`accessNotice`** in the shell after sign-out.

### Planned: freemium + subscription tiers

Roadmap detail: **`docs/social-feed-roadmap.md`** (section **Freemium & subscriptions**); **tier matrix:** **`docs/access-tiers.md`**. In short: **anonymous** stays read-heavy (e.g. Lounge view-only); **free accounts** unlock more non-premium actions; **subscribers** get subscribe-gated areas. When built, add a small **entitlements** layer (DB + optional RPC) and extend **`browseMode`** or pass **`entitlements`** into **`AppShell`** — **RLS/webhooks** remain the source of truth, not UI alone.

## Feature folders (`src/features/`)

| Folder | Role |
| --- | --- |
| **`shell/`** | `AppShell.jsx`, `shellClasses.js` (shared Tailwind class strings for layout/buttons where reused), `index.js` barrel. |
| **`auth/`** | OAuth UI bits and URL callback helpers used by **`App.jsx`**. |
| **`lounge/`** | Lounge social feed: **`SocialFeed.jsx`**, **`LoungePostArticle.jsx`**, **`LoungePostFeedMedia.jsx`**, **`LoungePostStreamVideo.jsx`** + **`LoungeFeedVideoAutoplayContext.jsx`** (feed/embed: **one autoplay winner** by scroll position; **shared** Tap for sound / Tap to mute across tiles; HLS via `hls.js` lazy chunk when needed), **`LoungeProfileFullScreen.jsx`**, **`LoungeOgBadge.jsx`**, **`src/utils/loungeVideoUpload.js`**, caption helpers, storage keys, `index.js`. Rate-limit errors render **above** the composer. **Repost** uses an **anchored popover** under the control (not a bottom sheet). Feed **media carousels** reset to the first slide when the post row re-enters the viewport. **Video:** up to **60s**, Cloudflare Stream; inline feed autoplay is **coordinated** (winner-only attach) with poster→first-frame **crossfade**; **no inline controls** on the frame — **single tap** opens full-screen portal; **compact bottom-left** control: **small label pill** (same look as before) inside a **transparent** `min-h-[44px] min-w-[44px]` tap target so the rest of the tile still opens full screen (global when inside autoplay provider). Frame **`data-lounge-video-zoom`** excludes row-open on tap. **Opened post detail** is **`z-[98]`** (above **`LoungeProfileFullScreen`** at **`z-[97]`**); **quote repost** and **media lightboxes** sit **above** it (`z-[100]`+). Deleting the post invokes Edge **`lounge-cf-stream-delete-video`** before removing the row, then removes a stored **`stream_poster_url`** object from **`lounge-feed`** when present. **Same-tab video post:** composer JPEG `blob:` poster is pinned in **`loungeStreamSessionPoster.js`** by Stream uid for immediate feed tile sizing, then swapped to CF `thumbnail.jpg` when ready. **Cross-device:** DB **`stream_poster_url`** + **`stream_video_width`** / **`stream_video_height`** (set in **`loungePostSubmitJob.js`** from session blob or capture + **`probeVideoFileDisplaySize`**) give every client a stable poster and aspect before CF thumb. **Own profile:** **Likes** / **Bookmarks** tabs (`post_likes` / `post_bookmarks`, same card layout as Posts). **`LoungeOgBadge`** reads **`profiles.is_og`** (one-time backfill: **`supabase/profiles_is_og.sql`**). |
| **`guides/`** | AP guides: `GuidesScreen.jsx` (uses **`ScrollLinkedEdgeTitleBarShell`** — same fixed EDGE title bar + scroll-hide as Lounge), demo data, `index.js`. |
| **`offers/`** | Offers calendar: `OffersCalendar.jsx`, `offerStorageKeys.js`, `utils.js`, `hooks/`, `components/`, `index.js` (re-exports `OffersCalendar`). |
| **`intel/`** | Local Intel (cities / casinos / posts): `LocalIntel.jsx`, `index.js`. |
| **`bankroll/`** | Bankroll tracker UI scaffold: `BankrollTracker.jsx`, `index.js`. |
| **`calculators/`** | **`CalculatorsTab.jsx`** (picker + lazy games); **`ScrollLinkedEdgeTitleBarShell`** for the same fixed EDGE bar + scroll-hide as Lounge/Guides. Game UIs in **`calculators/games/`**. |
| **`profiles/`** | Shared profile gate helpers for Lounge + Guides (`profileGate.js`, etc.). Profile saves and **`handle_changed_at`** / cooldown-aware selects for the Lounge profile editor. |

Shared non-feature code stays in **`src/utils/`**, **`src/components/`** (e.g. `CalculatorDisclaimer`), and **`src/constants/`** as before.

## Imports and barrels

Several features expose **`index.js`** so callers can import from `'./features/<name>'` instead of deep paths. Examples: `'./features/shell'`, `'./features/guides'`, `'./features/lounge'`, `'./features/offers'`.

## Performance note (bundling)

Splitting files **does not** automatically reduce the initial JavaScript download: Vite still follows **static** `import` edges from `App` → `AppShell` → feature screens.

**Implemented in-repo:**

- **`AppShell.jsx`** — Heavy tabs load with **`React.lazy`** + **`Suspense`** (`SocialFeed`, `OffersCalendar`, `GuidesScreen`, `BankrollTracker`, `LocalIntel`, `CalculatorsTab`). The initial chunk after login avoids parsing those modules until the user switches to that tab (each becomes its own async chunk).
- **`CalculatorsTab.jsx`** — Each game screen (`PhoenixLink`, `BuffaloLink`, `StackUpPays`, `MHBCalculator`) is **`lazy()`-loaded** so **Chart.js** and other game-only deps load only when that calculator is opened.
- **`SocialFeed.jsx`** — Lounge post rows use **`content-visibility: auto`** and **`containIntrinsicSize`** so the browser can skip much of the layout/paint work for off-screen cards (complements infinite scroll; not a full virtual list).

Further wins (if needed later): true list virtualization (`@tanstack/react-virtual` or similar) if the feed DOM grows very large.

## Docs that reference old paths

If you see **`src/calculators/`** in older notes or chat exports, that directory was removed; calculator components now live under **`src/features/calculators/games/`**. Lounge work that used to cite **`SocialFeed` inside `App.jsx`** now refers to **`src/features/lounge/SocialFeed.jsx`**.

## Maintaining documentation

Structural or bundling changes here should land in the **same PR** as the code. For **what else to update** (roadmap, backlog, prod checklist, chat vs repo as source of truth), follow the repo playbook **`AGENTS.md`** at the project root.

---

_Last aligned with the modular `App` + `AppShell` + `features/*` layout; Lounge row expanded 2026-05-09 for Stream feed autoplay, shared inline sound, quote-repost stacking, and post-detail UX._
