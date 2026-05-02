# Session handoff log (for new chats)

_Last updated: 2026-04-30_

Use this file when reopening the project so the assistant can resume without prior thread memory.

---

## Product direction (PhoenixLinkCalc)

- **Vision:** Social-style feed (+EV / advantage gambling), eventually subscription-only for tools + feed.
- **Today:** Vite + React app with:
  - **Calculators** for slot states (+EV checks), e.g. Phoenix Link, Buffalo Link, MHB, Stack Up Pays, etc.
  - **Offers calendar** (built earlier): manual casino offers/events; uploads of mailer images / email screenshots → **OpenAI OCR** → draft events + review queue.
- **Planned:** AP slot **guides** catalog, **slot bankroll / income tracker**, collated how-to-play content, **Vercel + Supabase + Resend** (emails).

---

## Repo tech (quick)

- Frontend: React 19, Vite, Tailwind 4, Chart.js, Supabase JS client (`App.jsx` is large; offers live under `src/features/offers/`).
- Backend/data: Supabase (auth, RLS on user-owned tables like `offer_events`), Edge Function `supabase/functions/process-offer-uploads/`.
- SQL artifacts live in **`supabase/*.sql`**.

---

## Database: machines + guides

- User created Supabase tables **`machines`** (42 AP titles) and **`guides`** (markdown guides, FK to `machine_id`), with public read on machines and published guides only.
- **Source of truth in git:** `supabase/machines_guides_schema.sql` — full create + indexes + RLS + seed `INSERT` for all 42 machines.
- **Warning:** That file’s section 5 uses `TRUNCATE` + re-seed; do not re-run blindly in prod after real guide rows exist.

---

## Decisions / constraints discussed

- **machinepro.club:** Use **`https://www.machinepro.club/`** (non-www shows DreamHost “site not found”). Do not treat member-only lists/guides as something to bulk-scrape for the product; public marketing only for high-level pointers; own/original or licensed content for the app catalog.
- **Slots folder idea:** Prefer repo/CMS structure + user-approved sources over copying third-party guides wholesale.

---

## Where we left off

- No open coding task from this thread.
- **Guides work:** User is treating `machines` as the checklist; `guides` rows to be authored over time (SQL editor or future admin UI).
- **Likely next builds (from conversation, not started here):** bankroll/income tracker UI + Supabase tables; wire app to `machines` / `guides`; subscription gating later.

---

## If the assistant should continue something

1. Read this file + `package.json` + relevant `supabase/*.sql`.
2. For UI work, grep `App.jsx` for navigation / `supabase` usage patterns before adding large new sections (consider `src/features/...` split).

---

## Automated chat transcript exports

Cursor does not run on a wall clock; **a scheduled job** appends transcripts to **separate log files per machine** so Git sync does not merge-conflict one shared log.

- **Core script:** `scripts/cursor-chat-export.mjs` — reads the latest `agent-transcripts/**/*.jsonl` for this workspace path (per PC).
- **Laptop:** run `.\scripts\Register-CursorChatExportScheduledTask-Laptop.ps1` → task **LVSlotPro_CursorChatExport_Laptop** → **`session-chat-export-laptop.md`** (state: `.cursor/chat-export-state-laptop.json`, gitignored).
- **Desktop:** run `.\scripts\Register-CursorChatExportScheduledTask-Desktop.ps1` → task **LVSlotPro_CursorChatExport_Desktop** → **`session-chat-export-desktop.md`** (state: `.cursor/chat-export-state-desktop.json`, gitignored).
- **Manual test:** `.\scripts\Run-CursorChatExport-Laptop.ps1` or `Run-CursorChatExport-Desktop.ps1` once.
- **Remove old single task (if present):** `Unregister-ScheduledTask -TaskName 'LVSlotPro_CursorChatExport' -Confirm:$false`
- **Overrides:** `CURSOR_AGENT_TRANSCRIPTS`, `CHAT_EXPORT_HANDOFF`, `CHAT_EXPORT_STATE_ID` (see script header).

Transcripts may contain `[REDACTED]` placeholders where Cursor strips sensitive content.
