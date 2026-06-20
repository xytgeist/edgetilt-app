/** Batch 6 catch-up — skipped 2026-06-17 (E-letter deferral). */
export const CATCHUP_BATCH6_PAYLOADS = [
  {
    machine: {
      slug: 'easy-money-deluxe',
      name: 'Easy Money Deluxe',
      manufacturer: 'Light & Wonder',
      type: 'Money Roll Multipliers',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'L&W Top Dollar-style rolls; scout built multipliers.',
      release_year: null,
    },
    guide: {
      title: 'Easy Money Deluxe',
      published: true,
      card_ev_threshold: 'Roll multipliers **30×+** total · or purple/red/blue lines',
      when_to_play: `**Primary play:** hunt **built multipliers** on the **ten money rolls** above the reels (persistent **per bet level**).

**Sit when any of these clear:**

- **Total multiplier sum ≥ 30×** across all ten rolls.
- **Two Purple rolls (50-credit base):** combined multipliers **≥ 8×** (e.g. 4× + 4×).
- **Red roll (100-credit base):** **≥ 3×** with some support from other rolls.
- **Two Blue rolls (20-credit base):** combined **≥ 10×** with other multiplier support.

**Do not** chase the **Yellow 1000** roll alone ... it rarely drives the bonus. **Turquoise (5)** and **Green (10)** rolls only matter when multipliers are absurdly high, not as the main reason to sit.`,
      when_to_stop: `Stop after the **Top Dollar-style bonus** finishes (four offers max) and multipliers **reset** on your bet level.`,
      how_to_check: `1. Read **each money roll's multiplier** above the reels (turquoise/green/blue/purple/red/yellow values are fixed).
2. Sum totals and check **purple pair / red / blue pair** lines above.
3. Cycle **every bet level** ... multipliers are **stored per bet** until the bonus fires.`,
      risk_bankroll: `**500 units** ... you are paying to sit until **three Easy Money Deluxe symbols** hit a payline and the multiplied roll values pay out.`,
      risk_summary: `Classic **9-line** feel with a modern persistent layer. Multipliers **randomly tick up** during base play, then lock until the feature.

Bonus flow: multiplied roll values get summed into **offers** ... accept or try again up to **four** times (final offer is forced).`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Easy Money Deluxe** (Light & Wonder) places **ten persistent money rolls** above the reels with fixed base credits: two **5**, two **10**, two **20**, two **50**, one **100**, one **1000**.

Each roll carries its own **multiplier** that grows during base play. **Three Easy Money Deluxe symbols** on a line trigger the **Top Dollar-style** pick ... current multipliers apply to roll values before offers are built.`,
    },
  },
  {
    machine: {
      slug: 'egyptian-gems-rise-of-pharoah-rise-of-queen',
      name: 'Egyptian Gems: Rise of Pharaoh / Rise of Queen',
      manufacturer: 'Gaming Arts',
      type: 'Orb Queue + Sixth Reel',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Gaming Arts orb queue; yellow/red orb hunts.',
      release_year: null,
    },
    guide: {
      title: 'Egyptian Gems: Rise of Pharaoh / Rise of Queen',
      published: true,
      card_ev_threshold: 'Yellow orb on reels/queue · **2** yellow · **4** red · **6** any',
      when_to_play: `**Do not count orbs in reel 1** ... they exit next spin.

**Primary play:**

- **Any yellow orb** on the reels **or** bottom slot of the upcoming queue.
- **Two yellow orbs** anywhere in the upcoming queue.
- **Four red orbs** on the board.
- **Six orbs of any color** ... value is **free games lottery**, not credit prizes (blue credits are tiny).

**Pyramid symbols** drop the bottom queued orb into the **sixth reel** on that row. Orbs **shift left** each spin. Orb on pyramid = credit win + chance at **Inner Reel Feature** (multiplier, major/grand, or free games).`,
      when_to_stop: `Stop after **free games** or the **Inner Reel** sequence you chased finishes and the board clears.`,
      how_to_check: `1. Count **yellow / red / blue orbs** on reels plus the **queue** right of the character.
2. Ignore **reel 1 orbs** and unrevealed queue values until they drop.
3. **Menu → bet arrows** can cycle levels without coin-in on many Gaming Arts installs.
4. Cycle **all bet levels** otherwise.`,
      risk_bankroll: `**100 units** ... high variance; most sessions lose until a big Inner Reel or free games hit.`,
      risk_summary: `Orbs **persist after triggering** ... same orb can pay multiple times. Multiple pyramids in a row **multiply** the dropping orb value.

**Yellow > red > blue** for credit size ... blue still adds **feature lottery** when orb count is high.`,
      risk_bullets: [],
      skins_markdown: `**Rise of Pharaoh**, **Rise of Queen** ... same AP math, different theme.`,
      gameplay_mechanics: `**Egyptian Gems** (Gaming Arts) queues **credit orbs** beside the reels. **Pyramid symbols** feed the **sixth reel**; orbs slide **left** each spin and pay when they cover a pyramid.

**Inner Reel Feature** on trigger can add **2×–50×**, a **major/grand**, or **free games**. Two theme skins share one engine.`,
    },
  },
]
