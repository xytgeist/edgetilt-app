# Sportsbook states refresh (weekly)

The game hub's **Only books in my state** filter reads `src/features/lounge/gameHub/sportsbookStates.json`: which US states (plus DC) each odds-feed sportsbook runs a **licensed online/mobile** sportsbook in. A weekly agent keeps it current. This doc is its runbook. The agent is the Cursor Automation **Sportsbook state list refresh** (Mondays 6:00 am PT, repo `xytgeist/edgetilt-app`), saved 2026-09-29. Changes ship straight to production (see **Shipping**).

## Scope

- **In the file:** DraftKings, FanDuel, BetMGM, Caesars (William Hill), Fanatics, BetRivers, theScore Bet (was ESPN BET), Hard Rock Bet, bet365, Bally Bet, Circa Sports.
- **Never in the file:** offshore books (Bovada, BetOnline, MyBookie, BetUS, LowVig, BookMaker, Heritage, Bet105, Sportsbetting.ag, Betcris, YouWager, Matchbook, Everygame), Pinnacle, sweepstakes/social apps (Fliff, ReBet). They hold no US state sportsbook license.
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
6. Bump top-level `updated_at` to today and prepend one entry to the top-level `changelog` array: `{ "date": "YYYY-MM-DD", "changes": ["BetRivers +MO (source URL)", ...] }`. Keep the last 20 entries.
7. If nothing changed, commit nothing and stop.

## Shipping (straight to production)

Updates must reach **production**, so this file ships on `main` directly instead of waiting for a `test` promote. Ryan approved this exception for **this one file only** (2026-09-29). Everything else still follows the normal test-then-promote flow.

Do the edit **on `main`**, never by promoting `test` (that would ship unreleased test work):

```bash
git fetch origin
git checkout main && git pull --ff-only origin main
# edit src/features/lounge/gameHub/sportsbookStates.json (steps 1-6 above)
npm ci && npm run build
git add src/features/lounge/gameHub/sportsbookStates.json
git commit -m "Sportsbook states refresh YYYY-MM-DD: <short list of changes>"
git push origin main          # Vercel prod deploy
git checkout test && git pull --ff-only origin test
git merge --no-edit main      # keeps main an ancestor of test so promotes stay fast-forward
git push origin test
```

- Commit **only** `sportsbookStates.json`. No version bump, no backlog edit (both are touched on `test` all the time and would conflict when `main` merges back). The `changelog` array in the JSON is the record.
- If `git merge main` into `test` conflicts, abort (`git merge --abort`), leave `main` pushed, and say so in the run summary for Ryan.

## Guardrails

- Do not edit any other file.
- Do not touch production Supabase.
- Never force-push; never merge `test` into `main`.
- Keep the JSON valid (run `node -e "JSON.parse(require('fs').readFileSync('src/features/lounge/gameHub/sportsbookStates.json','utf8'))"`) and run `npm run build` before committing.
