/**
 * Demo / fallback for **Ainsworth** must-hit-by (“mystery”) progressives until a `guides` + `machines` row exists in Supabase.
 * Conceptual math aligns with `MHBCalculator.jsx`; full target-point tables and photos live on Wizard of Odds.
 */

export const AINSWORTH_MUST_HIT_BY_DEMO_SLUG = 'ainsworth-must-hit-by'

/** Lowercased substring search in AP Guides (space-separated names + family terms). */
export const AINSWORTH_MHB_SEARCH_KEYWORDS =
  'Mustang Money Winning Wolf Dollar Action Glitter Gems Ming Warrior Thunder Cash Ainsworth must hit by mystery progressive MHB minor major'

/** Single-line label for the card “Known titles” row. */
export const AINSWORTH_MHB_KNOWN_TITLES_LINE =
  'Mustang Money · Winning Wolf · Dollar Action · Glitter Gems · Ming Warrior · Thunder Cash'

export const ainsworthMustHitByCardBullets = [
  '**Ainsworth-style** mystery MHBs: a **secret hit value** (uniform between **reset** and **cap**), **meter rise** as a **% of coin-in**, then award when the meter crosses that point ([Wizard of Odds](https://wizardofodds.com/games/slots/mystery-jackpot-ainsworth/)).',
  '**Cabinet titles:** Use the search bar for **Mustang Money**, **Winning Wolf**, **Dollar Action**, **Glitter Gems**, **Ming Warrior**, or **Thunder Cash** - not every install runs the same meter bands.',
  '**Example (Red Rock, 2013 on WOO):** Minor **$20 → $50** @ **~0.45%** of bet; Major **$350 → $400** @ **~0.20%** - **re-verify on the glass** for your bank.',
  '**Do not** model **AGS** must-hit-by the same way - WOO warns those can **rarely trigger until very near the cap**.',
]

export const ainsworthMustHitByGuideMarkdown = `## What you are looking at

**Ainsworth** cabinets often ship **paired mystery progressives** (commonly labeled **Minor** and **Major**): visible meters that **must award before a published ceiling**, with a **random trigger threshold** hidden inside the band. The public write-up with photos, rules, and **target-point tables** is **[Must Hit By Progressives on Ainsworth Slots](https://wizardofodds.com/games/slots/mystery-jackpot-ainsworth/)** (Michael Shackleford, Wizard of Odds).

Hero art for this card is sourced from **Slots/ainsworth-must-hit-by/hero.webp** (bundled fallback: **/guides/ainsworth-must-hit-by/hero.webp** in the app **public** folder).

## Games you may see with this mystery MHB package

Cabinet marketing changes by region and year, but advantage players often associate **Ainsworth** dual mystery MHB meters with titles such as:

- **Mustang Money**
- **Winning Wolf**
- **Dollar Action**
- **Glitter Gems**
- **Ming Warrior**
- **Thunder Cash**

Treat this as a **search / family hint**, not a guarantee that every bank of these games uses the same reset, cap, or meter-rise schedule-always confirm **PAR sheet and meter glass** on the exact machine you are scouting.

## How Ainsworth-style mystery MHBs work (summary)

1. **Floor / reset** - Jackpot starts at a defined **minimum** (reset).
2. **Secret target** - A win value is chosen **uniformly at random** between that minimum and the **must-hit-by maximum** (this “flat” model is what makes the classic **target-point** math line up).
3. **Meter rise** - A stated **fraction of each qualifying bet** feeds the visible meter until it crosses the predestined point; that player wins the progressive.
4. **Two meters** - **Minor** and **Major** interact: the **target point** for one depends on the **reading of the other** and your assumed **house edge** on the base game.

## Example specs (historical sample only)

The WOO page documents one **Red Rock** install **observed May 9, 2013** - **not** a guarantee for every Ainsworth title today:

| Jackpot | Starting (reset) | Must hit by | Rate of increase (of bet) |
|--------|------------------|---------------|---------------------------|
| Minor  | $20              | $50           | 0.45%                     |
| Major  | $350             | $400          | 0.20%                     |

Other properties, denoms, and revisions will **change numbers**. Use the **glass / PAR** for the bank you are on.

## Target-point formula (from WOO)

For a **uniform** mystery between reset and cap, a useful **breakeven-style target** (where progressive exposure starts to dominate) can be written as:

**t = m × (h + r) / (h + 2r)**

Where **t** = target meter value, **m** = must-hit maximum, **r** = meter rise rate (as a decimal fraction of each bet), **h** = house edge on the **whole game** including the **average progressive contribution** you assume.

You will not get **h** from the casino; WOO suggests **rough 8%–12%** bands for Las Vegas video slots as a planning range and links Nevada **win%** reports for context. Use the in-app **Must Hit By Jackpot** tool with **your** RTP / rise assumptions when you model a single meter; for **two coupled meters**, use WOO’s **cross tables** (Major vs Minor position) on the page above.

**Worked example (from WOO):** If **Major** reads **$370** and you assume **10%** house edge on the game, the **Minor** target point in their table is about **$48.13** - illustrating how **one meter’s reading** shifts the **other meter’s** playable threshold.

## AGS warning (critical)

The same WOO article stresses that **AGS** must-hit-by behavior is **not** modeled well by a **uniform** trigger through the band (community reporting: large awards **rarely** hit until very **near the cap**). **Do not** apply Ainsworth / uniform assumptions to AGS without separate research.

## Bankroll and scouting

Two-meter games mean you are often solving **two correlated** “how much base tax to move each ladder” problems. Size sessions so **variance on the base game** does not force you off a +EV state before the mystery resolves.

## Using the Edge calculator

Open **Must Hit By Jackpot** from this card to stress-test **one meter** with **current**, **cap**, **meter rise per penny**, **reset**, **RTP**, and **midpoint vs full run**. For **Ainsworth dual-meter target points**, keep **[Wizard of Odds - Ainsworth mystery MHB](https://wizardofodds.com/games/slots/mystery-jackpot-ainsworth/)** open for the **tabular** Major/Minor targets; merge those assumptions with your floor-verified **rise %** and **RTP**.

---

*Replace or extend by publishing a \`guides\` row for this machine family in Supabase when you have floor-verified copy.*
`
