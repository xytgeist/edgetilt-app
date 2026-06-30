/**
 * Demo / fallback for Stack Up Pays (IGT Ascending Fortunes family) until a `guides` row exists in Supabase.
 * Written to complement the in-app five-meter + dynamic +EV logic in `StackUpPays.jsx`.
 */

export const STACK_UP_PAYS_DEMO_SLUG = 'stack-up-pays'

export const stackUpPaysCardBullets = [
  '**Five persistent meters** (mega → mini): edge is about **where each meter sits vs its must-hit band**, **SPI**, and **how much base RTP you are funding** while you ladder them.',
  '**Ascending Fortunes** means you are often juggling **multiple incomplete ladders** - only play when the **combined state** clears your hurdle, not when one meter “looks close” in isolation.',
  'Run **Stack Up Pays** in-app to sync **overall RTP**, **meter readings**, and **calibrated state RTP** before you lock a session size.',
]

export const stackUpPaysGuideMarkdown = `## What you are looking at

Stack Up Pays on **IGT’s Ascending Fortunes** chassis is a **multi-meter persistent** game: coins or symbols increment **separate must-hit style ladders** that reset when hit. The commercial question is whether the **vector of all five meter positions** plus the **price per spin** implies a **favorable path** to completion versus the **base-game tax** you pay while moving them.

## The +EV picture (meter-first)

1. **Read every meter** - A “good” mega can be **cancelled** by four bad minors if you ignore cross-meter exposure. Build a **mental model of total dollars to clear** versus **expected payback** from the hit distribution you assume.
2. **SPI and must-hit bands** - **Spins per increment** and **reset vs must-hit span** control how expensive it is to move a meter one unit. Small errors in SPI assumptions **move the +EV threshold** a lot at tight margins.
3. **Calibration** - Use the calculator’s **cycle calibration** story: overall RTP splits into **base vs bonus share**, then meters scale with **position in band**. If your floor’s paytable or denom does not match your inputs, the tool is still **internally consistent** but not **floor-accurate**.

## How the game plays (floor-facing)

- **Base game:** Line pays and events that **feed meters**; you are almost always paying **negative base** to buy meter movement.
- **Features:** Meter hits pay from **configured average pay** bands; **marketing** and **link size** change realized distributions.
- **Denoms:** Confirm **qualifying bet** for each meter tier and whether **max bet** changes must-hit math on your cabinet revision.

## Bankroll and session hygiene

Multi-meter games **correlate bad runs**: several meters can stall in expensive territory at once. Size bets so a **single “bad cloud”** across meters does not wipe the session before the math can work.

## Using the Edge calculator

Open **Stack Up Pays** from the card. Enter **overall RTP**, **denom**, **per-meter counter / must-hit / reset / SPI** (defaults match common training setups-always verify on the glass), and read **+EV counter**, **calibrated RTP**, and **expected bets won** for the stopping rule you use.

---

*Replace or extend by editing the \`guides.content_markdown\` row for Stack Up Pays in Supabase.*
`
