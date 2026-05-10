# Frontend architecture

How the React app is organized after the **feature-module split** (2026). Use this when onboarding, finding code, or planning refactors.

## Entry and bootstrap

- **`src/main.jsx`** — mounts the root component (unchanged pattern).
- **`src/App.jsx`** — **auth and session only**: Supabase client, whitelist gate, login / signup / forgot password / reset password, OAuth callback handling, routing between auth panel vs the app shell, and **`browseMode`** (anonymous vs member). It imports **`AppShell`** when `currentView === 'app'`.
- **`src/features/shell/AppShell.jsx`** — **logged-in application**: bottom navigation, tab state, Lounge feed wiring, Offers / Guides / Intel / Bankroll / Calculators / Team surfaces, global confirm modal, URL query handling for offers deep links, and iOS PWA notification prompt coordination.

Keeping auth in **`App.jsx`** and product chrome in **`AppShell`** avoids a circular dependency story and keeps the entry file small (~hundreds of lines instead of thousands).

## Access model (public browse + member)

- **Anonymous:** No Supabase session → user lands in **`AppShell`** immediately (Supabase **anon** key; public-read RLS paths work). A sticky strip invites **Log in**; Lounge and other surfaces follow **anon** policies (today: read-only patterns in Lounge where writes require auth).
- **Member:** Session exists **and** email is on **`allowed_emails`** → same shell with **`browseMode === 'member'`** (log out, posting, offers sync, etc. as implemented). **`hasActiveSubscription`** (today: env **`VITE_HAS_ACTIVE_SUBSCRIPTION`**, later: billing/profile) plus **`isStaff`** from **`profiles.role`** control **hamburger lock icons** for subscriber-gated tabs (`AppShell.jsx`).
- **Auth UI:** Log in / sign up / forgot password render as a **full-screen panel** when the user opens auth from the strip, **Continue without signing in**, or when a feature calls **`onRequireAuth`** (no full-app reload). Whitelist rejection sets a dismissible **`accessNotice`** in the shell after sign-out.

### Planned: freemium + subscription tiers

Roadmap detail: **`docs/social-feed-roadmap.md`** (section **Freemium & subscriptions**); **tier matrix:** **`docs/access-tiers.md`**. In short: **anonymous** stays read-heavy (e.g. Lounge view-only); **free accounts** unlock more non-premium actions; **subscribers** get subscribe-gated areas. When built, add a small **entitlements** layer (DB + optional RPC) and extend **`browseMode`** or pass **`entitlements`** into **`AppShell`** — **RLS/webhooks** remain the source of truth, not UI alone.

## Feature folders (`src/features/`)

| Folder | Role |
| --- | --- |
| **`shell/`** | `AppShell.jsx`, `shellClasses.js` (shared Tailwind class strings for layout/buttons where reused), `index.js` barrel. |
| **`auth/`** | OAuth UI bits and URL callback helpers used by **`App.jsx`**. |
| **`lounge/`** | Lounge social feed: `SocialFeed.jsx`, caption helpers, storage keys, `index.js`. |
| **`guides/`** | AP guides: `GuidesScreen.jsx`, demo data, `index.js`. |
| **`offers/`** | Offers calendar: `OffersCalendar.jsx`, `offerStorageKeys.js`, `utils.js`, `hooks/`, `components/`, `index.js` (re-exports `OffersCalendar`). |
| **`intel/`** | Local Intel (cities / casinos / posts): `LocalIntel.jsx`, `index.js`. |
| **`bankroll/`** | Bankroll tracker UI scaffold: `BankrollTracker.jsx`, `index.js`. |
| **`calculators/`** | **`CalculatorsTab.jsx`** (calculator picker + active game routing). Game implementations live under **`calculators/games/`** (`PhoenixLink`, `BuffaloLink`, `StackUpPays`, `MHBCalculator`). |
| **`profiles/`** | Shared profile gate helpers for Lounge + Guides. |

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

_Last aligned with the modular `App` + `AppShell` + `features/*` layout._
