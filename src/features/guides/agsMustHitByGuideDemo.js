/**
 * Demo / fallback for **AGS** must-hit-by mystery progressives until a `guides` + `machines` row exists in Supabase.
 * Pairs with `MHBCalculator.jsx` only as a **rough** single-meter model - distribution is often **not** uniform through the band.
 */

export const AGS_MUST_HIT_BY_DEMO_SLUG = 'ags-must-hit-by'

export const AGS_MHB_SEARCH_KEYWORDS =
  'AGS Orion must hit by mystery progressive MHB Emerald Princess Dragons Jackpots Gold Inferno Fa Cai Shu Colossal near cap River Dragons 5000'

export const AGS_MHB_KNOWN_TITLES_LINE =
  'River Dragons · Emerald Princess · Dragon’s Jackpots · Gold Inferno · Orion family (verify your bank)'

export const agsMustHitByCardBullets = [
  '**AGS mystery MHBs** are **not** the same math story as **uniform** Ainsworth-style meters - community and **[Wizard of Odds](https://wizardofodds.com/games/slots/mystery-jackpot-ainsworth/)** warn hits often **cluster just below the cap**, so midpoint-style targets can **overstate** edge.',
  '**Search:** **River Dragons** (5k MHB preset in calc), **Emerald Princess**, **Dragon’s Jackpots**, **Gold Inferno**, **Orion** - meter bands and rise **differ by install**; always read the **glass**.',
  'Use **Must Hit By Jackpot** in-app as a **single-meter sensitivity** tool only - if your model assumes uniform draw through the band, **discount** conclusions for AGS until you have **floor-specific** behavior notes.',
]

export const agsMustHitByGuideMarkdown = `## What you are looking at

**AGS** ships multiple **must-hit-by** and **mystery progressive** packages (often on **Orion** and related cabinets). The meters look similar to other makers-**reset**, **must-hit ceiling**, **visible climb**-but **advantage players widely report** that the **random trigger is not “flat”** across the whole range: **large awards may rarely fire far below the cap**, which breaks the **uniform target-point** shortcuts used for some other manufacturers.

The **AGS caveat** is spelled out in context on **[Must Hit By Progressives on Ainsworth Slots](https://wizardofodds.com/games/slots/mystery-jackpot-ainsworth/)** (Michael Shackleford, Wizard of Odds), because that page contrasts **Ainsworth-style uniform** behavior with **AGS-style** behavior.

Hero art for this card is sourced from **Slots/ags-must-hit-by/hero.webp** in your repo (bundled fallback: **/guides/ags-must-hit-by/hero.webp** in the app **public** folder).

## Games and cabinets you may hear in the same conversation

Marketing and links change by casino, but AP discussions often mention **AGS Orion** titles and progressives such as:

- **River Dragons** (example **$5k** must-hit band in-app under **AGS → 5000** preset-cap can read **4995** on some glass)
- **Emerald Princess** (Fa Cai Shu family / linked progressives on some installs)
- **Dragon’s Jackpots**
- **Gold Inferno**

Treat these as **search anchors**, not a promise that every bank uses the same **reset, cap, or meter-rise** schedule.

## Scouting and modeling discipline

1. **Assume “late-band” risk** - If the true hit distribution is **front-loaded near the cap**, your **effective cost** to realize the jackpot is **higher** than a uniform model implies until the meter is **very close** to must-hit.
2. **Verify rise and eligibility** - **Qualifying bet**, **denom**, and **link vs stand-alone** still dominate realized RTP; do not extrapolate from a **different property’s** PAR.
3. **Log your own samples** - Small **private hit logs** (counter at hit, denom, bet) beat forum lore when you are deciding whether a **uniform** approximation is “good enough” on a specific bank.

## Using the Edge calculator

Open **Must Hit By Jackpot** from this card for **what-if** math on **current**, **cap**, **meter rise**, **reset**, and **RTP**. Read outputs as **upper-bound optimism** unless you have evidence the bank behaves **uniformly** through the band.

---

*Publish a Supabase \`guides\` row when you have floor-verified AGS copy for a specific title.*
`
