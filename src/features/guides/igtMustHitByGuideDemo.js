/**
 * Demo / fallback for **IGT** (incl. legacy **WMS-style**) mystery must-hit-by progressives until a `guides` + `machines` row exists in Supabase.
 * Pairs with `MHBCalculator.jsx` when you treat the meter as a **uniform** mystery; verify on the glass for your revision.
 */

export const IGT_MUST_HIT_BY_DEMO_SLUG = 'igt-must-hit-by'

export const IGT_MHB_SEARCH_KEYWORDS =
  'IGT WMS must hit by mystery progressive MHB incremental jackpot Coyote Moon Money Storm Lobstermania Lucky Larry'

export const IGT_MHB_KNOWN_TITLES_LINE =
  'Coyote Moon · Money Storm · Lucky Larry’s Lobstermania (family names - confirm MHB on your cabinet)'

export const igtMustHitByCardBullets = [
  '**IGT / legacy WMS** “mystery” must-hit-by meters are often modeled as **uniform** draw between **reset** and **cap** plus a **% meter rise** - see **[Wizard of Odds - Must Hit By / WMS mystery jackpots](https://wizardofodds.com/games/slots/mystery-jackpot/)** for the classic target-point framing.',
  '**Search:** **Coyote Moon**, **Money Storm**, **Lucky Larry’s Lobstermania** - many hits are **theme names**; only some installs carry **must-hit-by** packages; confirm **meters and glass**.',
  'Use **Must Hit By Jackpot** in-app for **meter rise**, **RTP**, **midpoint vs cap** stops - then sanity-check against **WOO tables** and your **floor** paytable.',
]

export const igtMustHitByGuideMarkdown = `## What you are looking at

**IGT** (and **legacy WMS** content often found on IGT-managed floors) has a long line of **mystery / must-hit-by** style progressives: a **published ceiling**, a **meter that climbs with qualifying coin-in**, and a **hidden trigger threshold** chosen inside the band. Public **target-point** math is laid out on **[Must Hit By Progressives (WMS mystery jackpots)](https://wizardofodds.com/games/slots/mystery-jackpot/)** (Michael Shackleford, Wizard of Odds). That page assumes a **uniform** distribution between seed and cap-**do not** paste those conclusions onto **AGS** meters without a separate model.

Hero art for this card is sourced from **Slots/igt-must-hit-by/hero.webp** (bundled **/guides/igt-must-hit-by/hero.webp** in the app **public** folder). A reference strip JPG in **Slots/igt-must-hit-by/** (Coyote Moon / Money Storm / Lobstermania) is useful for **visual ID**, not for PAR.

## Titles players often type into search

These are **common IGT / WMS brands** that sometimes appear with **incremental or mystery MHB** style meters (always **verify on the machine**):

- **Coyote Moon**
- **Money Storm**
- **Lucky Larry’s Lobstermania**

## How the +EV framing differs from Ainsworth-only notes

Where **uniform** mystery math is appropriate, the same **t = m × (h + r) / (h + 2r)** style thinking (see WOO) applies: you need **m** (cap), **r** (rise as a fraction of bet), and a defensible **h** (whole-game house edge including progressive contribution assumptions). **IGT revisions**, **link size**, and **denom** can all move **r** and **h** without changing the marquee art.

## Using the Edge calculator

Open **Must Hit By Jackpot** from this card. Enter **current meter**, **must-hit cap**, **meter rise per penny**, **reset**, **overall RTP**, and compare **midpoint vs full run**. Cross-check breakeven / exposure against **[Wizard of Odds - mystery jackpot / must-hit-by](https://wizardofodds.com/games/slots/mystery-jackpot/)** for **table-based** target-point habits you use in scouting.

---

*Publish a Supabase \`guides\` row when you have floor-verified IGT / WMS copy for a specific title.*
`
