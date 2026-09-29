# Sportsbook states refresh (weekly)

The game hub's **Only books in my state** filter reads `src/features/lounge/gameHub/sportsbookStates.json`: which US states (plus DC) each odds-feed sportsbook runs a **licensed online/mobile** sportsbook in. A weekly agent keeps it current. This doc is its runbook. The agent is the Cursor Automation **Sportsbook state list refresh** (Mondays 6:00 am PT, repo `xytgeist/edgetilt-app`, branch `test`), saved 2026-09-29.

## Scope

- **In the file:** DraftKings, FanDuel, BetMGM, Caesars (William Hill), Fanatics, BetRivers, theScore Bet (was ESPN BET), Hard Rock Bet, bet365, Bally Bet, Circa Sports.
- **Never in the file:** offshore books (Bovada, BetOnline, MyBookie, BetUS, LowVig, BookMaker), Pinnacle, sweepstakes/social apps (Fliff, ReBet). They hold no US state sportsbook license.
- **Online/mobile only.** A retail-only presence (e.g. an in-casino book) does not count. Mississippi on-property apps do not count.
- **Live only.** A state counts once real-money mobile betting is open to the public there, not at license approval or "coming soon".

## Weekly procedure

1. For each book, find its **current** state list. Best sources, in order:
   - The state gaming regulator's licensed online sportsbook list (NJ DGE, PA PGCB, NY Gaming Commission, etc.).
   - The operator's own "where are we legal" / state selector page.
   - Recent reputable news for launches and exits (Legal Sports Report, Sports Business Journal, operator press releases).
2. Compare against `states` in the JSON. For each change, require **two agreeing sources** or one regulator source.
3. Update the book's `states` (two-letter codes, sorted like the rest), set `verified_at` to today (`YYYY-MM-DD`), and put the URLs you relied on in `sources` (max 4).
4. Anything you couldn't confirm goes in that book's `uncertain` list (state codes, or `"ALL"` for the whole book). Do **not** remove a state on weak evidence; flag it instead. Clear an entry from `uncertain` once confirmed.
5. Brand changes: if a book rebrands (e.g. ESPN BET to theScore Bet), keep the key stable, update `name`, and add the old/new odds-feed names to `aliases` (lowercase, letters and digits only, same as `bookKey` in `sportsbookLinks.js`). If the odds feed introduces a new licensed book, add it.
6. Bump top-level `updated_at` to today.
7. Only if the JSON changed: bump the web PATCH version (`package.json` + `src/utils/appBuildInfo.js`), add one line to the **Update log** in `docs/test-buildout-backlog.md` listing each change (book, state, added/removed, source), commit, and push to **`test`**. Never push `main`.
8. If nothing changed, commit nothing.

## Guardrails

- Do not edit any other code.
- Do not touch production Supabase or `main`.
- Keep the JSON valid (run `node -e "JSON.parse(require('fs').readFileSync('src/features/lounge/gameHub/sportsbookStates.json','utf8'))"`) and run `npm run build` before committing.
