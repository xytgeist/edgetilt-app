import {
  wtf,
  WTF_VEGAS_LNW_COMMON,
  WTF_REGIONS_LNW_HEAVY,
} from './apGuideBatchWtf.mjs'

/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH6_PAYLOADS = [
  {
    machine: {
      slug: 'dragon-rush-fei-jin-fei-nu',
      name: 'Dragon Rush: Fei Jin / Fei Nu',
      manufacturer: 'Incredible Technologies',
      type: 'Locking Scatter Collect',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IT lock-and-spin cousin to Ultra Rush Gold; bet-pad scout.',
      release_year: null,
    },
    guide: {
      title: 'Dragon Rush: Fei Jin / Fei Nu',
      published: true,
      card_ev_threshold:
        '**2** gold eggs on bet pad · **1** gold egg if wheel or **15×+** credit',
      when_to_play: `**Primary play:**

1. **Two gold egg** scatters collected ... read them on the **bet pad**.
2. **One gold egg** if it is the **wheel** scatter kind **or** a large credit value (**≥ 15×** bet).

**Six scatters total** trigger the bonus ... gold eggs, blue credit bubbles, and wheel scatters all count. Gold eggs **lock 3 spins** and reset the timer when another gold egg lands.

Bet-pad indicator only shows **five** slots ... you need **six** total, unlike Ultra Rush Gold.`,
      when_to_stop: `Stop after the **six-scatter hold & spin** finishes and the board clears.`,
      how_to_check: `1. Glance at the **bet pad** for locked gold eggs and credit scatters.
2. Tap **every bet/denom** on the bank ... state is per level.
3. Remember you need **six** scatters even when the pad looks full at five.`,
      risk_bankroll: `**20 units** ... short lock-and-spin chases, but dead features happen.`,
      risk_summary: `Gold eggs are **not blockers** ... symbols behind them still evaluate.

When a gold lock timer hits zero, the game may randomly grant **three** extra spins ... do not count on it.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Rush: Fei Jin / Fei Nu'),
      skins_markdown: `**Fei Jin** and **Fei Nu** skins ... same AP math, different RTP bands posted on the glass.`,
      gameplay_mechanics: `**Dragon Rush** (Incredible Technologies) collects scatters toward a **six-symbol** lock-and-spin. **Gold egg** scatters persist **3 spins**; new gold eggs reset the lock counter.

Filling all reel positions in the feature pays a flat credit kicker that scales with bet. Filling the pad indicator alone is **not** enough if you only have five scatters showing.`,
    },
  },
  {
    machine: {
      slug: 'dragon-spell',
      name: 'Dragon Spell',
      manufacturer: 'IGT',
      type: 'Gold Frame Countdown',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'IGT 8-spin frame cycle; confusing UI hides walk-ups.',
      release_year: null,
    },
    guide: {
      title: 'Dragon Spell',
      published: true,
      card_ev_threshold:
        'Blue countdown orb · or **8+** frames w/o removal warning',
      when_to_play: `**Primary:** **blue countdown orb** with a red spin number beside the bet level ... **any** gold-frame count is playable once the orb is live.

**No orb:** play with **≥ 8 gold frames** locked anywhere **if** the bet level does **not** read **"ALL FRAMES GET REMOVED IN THE NEXT SPIN."**

**Reject** bet levels showing that removal message ... the prior player just finished a cycle.`,
      when_to_stop: `Stop after the **countdown hits the final spin**, credits in gold frames pay, and the board **clears**.`,
      how_to_check: `1. Look bottom-right beside the bet level for the **blue orb** and countdown.
2. If no orb, count **gold frames** and confirm the **removal warning** is absent.
3. Cycle **every bet/denom** ... loud sizzle sound marks dead "next spin removal" levels (volume down while scouting).`,
      risk_bankroll: `**10 units** ... eight paid spins max once the blue orb appears.`,
      risk_summary: `High volatility ... you can whiff the **final spin** with zero credit symbols in the frames.

Some players over-filter on frame count during an active orb ... **any** frames plus the orb is the play.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Spell', `- **IGT** PeakSlant / CrystalCurve banks nationally.`),
      skins_markdown: '',
      gameplay_mechanics: `**Dragon Spell** (IGT) locks **gold frames** when dragon symbols land. A dragon with a **blue yin-yang** starts an **8-spin countdown**; frames keep accumulating until the last spin pays any **credit prizes or jackpots** sitting inside active frames.

Line hits are rare in base because green credit symbols block paths ... when they connect, they pay fat. Free games are rare but can spike hard.`,
    },
  },
  {
    machine: {
      slug: 'dragon-sphere',
      name: 'DragonSphere',
      manufacturer: 'IGT',
      type: 'Descending Wild Spheres',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'IGT Ocean Magic cousin; spheres fall instead of rise.',
      release_year: null,
    },
    guide: {
      title: 'DragonSphere',
      published: true,
      card_ev_threshold:
        'Wild spheres R2–3 · R1 high · R4 top/above · skip bottom row',
      when_to_play: `**Do not play wild spheres on the bottom row** ... they scroll off next spin.

**Play when any of these show:**
1. **Any wild spheres** on **reels 2 or 3**.
2. **Reel 1:** wild sphere **above the reel**, **top row**, or **second-from-top row**.
3. **Reel 4:** wild sphere **above the reel** or **top row only**.

Spheres **descend** one row per spin (opposite **Ocean Magic**). Landing on a **dragon symbol** expands wilds **3 up, 3 down, 1 each side** when room exists.`,
      when_to_stop: `Stop after the **sphere chain pays out** and persistent spheres **clear or leave the board**.`,
      how_to_check: `1. Scan **reels 2–3** first ... highest expansion value.
2. Watch for spheres **hovering above reel 4 or reel 1** ... they enter play next spin (often missed on walk-bys).
3. If expanded wilds confuse the read, **switch bet and back** to show only the true persistent spheres.`,
      risk_bankroll: `**10 units** ... low-volatility walk-up family.`,
      risk_summary: `Spheres arrive in **spurts** ... a lone sphere above reel 4 can be worth chasing for the follow-up dump.

Expanded wilds from a prior dragon hit **do not persist** like the sphere itself ... do not count them as locked state.`,
      risk_bullets: [],
      where_to_find: wtf('DragonSphere', `- Common on **IGT** multi-game cabinets nationally.`),
      skins_markdown: '',
      gameplay_mechanics: `**DragonSphere** (IGT) runs **descending wild spheres** on a **5×4-style** board. Spheres that land on **dragon symbols** blast wild coverage outward; **reels 2–3** have the most room to expand.

**Ocean Magic** players often mis-read this game because the motion is reversed.`,
    },
  },
  {
    machine: {
      slug: 'dragon-spin-crosslink-air-earth-fire-water',
      name: 'Dragon Spin CrossLink: Air / Earth / Fire / Water',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Gold Bags',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: '2025 L&W bag-total chase; Dragon Spin hold & spin.',
      release_year: 2025,
    },
    guide: {
      title: 'Dragon Spin CrossLink: Air / Earth / Fire / Water',
      published: true,
      card_ev_threshold: 'Five bag values sum **≥ 49**',
      when_to_play: `**Primary play:** the **numbered values under all five gold bags** add to **49 or higher**.

Six bag fill levels ... **level 6** bags **sparkle** (example total **57**: **11 + 7 + 11 + 21 + 7**). Five bags filled to level four only totals **35** (**5 × 7**) ... **not** a play.

**Gold medallion** hits upgrade bags or **randomly** trigger **Dragon Spin** ... fuller bags drop **larger credit prizes** into the hold & spin, but trigger timing is **not** must-hit-by.`,
      when_to_stop: `Stop when **Dragon Spin** finishes ... all five bags **reset to level 1** even if that feature whiffed.`,
      how_to_check: `1. Read the **five bag values** above the reels and **add them**.
2. Note which bags are **sparkling** (level six).
3. Cycle **bets/denoms** ... each level carries its own bag state.`,
      risk_bankroll: `**100 units** ... feature variance is brutal even on fat totals.`,
      risk_summary: `Random **row multipliers** (**1×–10×**) swing results hard ... a sparkling board can still pay poorly.

Dragon Spin is hold-and-spin with **+1 spin** per new credit symbol, not the usual **+3**. **Mini–mega** jackpots can land inside the feature.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Spin CrossLink: Air / Earth / Fire / Water', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Air**, **Earth**, **Fire**, **Water** theme skins ... same bag math on CrossLink.`,
      gameplay_mechanics: `**Dragon Spin CrossLink** (Light & Wonder) fills **five persistent gold bags** when **gold medallion** symbols land on matching columns. Bag **values** (not just fill height) drive EV ... sum before you sit.

**Dragon Spin** drops credit prizes sized to each bag's level, then applies **per-row multipliers**. Bags tend to fill **evenly** ... mixed empty/full setups are uncommon.

**Five+ credit orbs** in base can still trigger a separate **free games** path.`,
    },
  },
  {
    machine: {
      slug: 'dragon-unleashed-prosperity-packets-red-fleet-three-legends-treasured-happin',
      name: 'Dragon Unleashed',
      manufacturer: 'Light & Wonder',
      type: 'Descending Credit Orbs',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'L&W orb-stack family; multi-theme bank.',
      release_year: null,
    },
    guide: {
      title: 'Dragon Unleashed',
      published: true,
      card_ev_threshold:
        'Basic: **2+** top orbs · **1** top + **2+** mid · Aggressive: any top orb',
      when_to_play: `**Basic plays:**
1. **Two or more orbs** in the **top row**.
2. **One orb** top row **plus at least two orbs** in the **middle row**.

**Aggressive** (higher RTP configs only): **any orb** in the **top row**, unless a **four-orb stack** just lost its bottom orb off-screen ... no new orb will drop from above.

**Six orbs** trigger hold & spin. Orbs **shift down** each spin and often arrive in **stacks up to four** from above. Orbs only appear **reels 1–4**.`,
      when_to_stop: `Stop after **hold & spin** completes and orbs **clear or fall below play thresholds**.`,
      how_to_check: `1. Count **top and middle row** orbs first.
2. Watch **reel 5 respin** symbols ... they lock orb reels for a **free** extra chance (cannot be left behind).
3. Cycle **every denom** on multi-game banks.`,
      risk_bankroll: `**15 units** ... low coin-in before you know if six orbs hit.`,
      risk_summary: `Smaller credit orbs tend to arrive in **taller stacks** ... better for triggering than one fat orb alone.

Filling all **12** hold & spin positions spins the **Dragon Unleashed reel** for **mini–grand**, **20×–500×** credits, or **2×–5×** multipliers on all orb prizes.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Unleashed', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Prosperity Packets**, **Red Fleet**, **Three Legends**, **Treasured Happiness** ... same orb math.`,
      gameplay_mechanics: `**Dragon Unleashed** (Light & Wonder) persists **credit orbs** that **descend** one row per spin, often as **connected stacks**. **Respin** on **reel 5** locks orb columns and respins the rest at no cost.

Hold & spin awards orb values (**1×–100×** bet plus **mini / minor / major**). Full grid unlocks the **Dragon Unleashed reel** spin.`,
    },
  },
  {
    machine: {
      slug: 'dragons-orb-jackpots',
      name: "Dragon's Orb Jackpots",
      manufacturer: 'Konami',
      type: 'Persistent Orb Meters',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Konami 15-reel orb bank; persistent bonus-spin count.',
      release_year: 2017,
    },
    guide: {
      title: "Dragon's Orb Jackpots",
      published: true,
      card_ev_threshold: 'Orb count **10–13+** on the meter',
      when_to_play: `**Primary play:** persistent **orb count reads 10–13+** before you spin.

Orbs on the main game feed a **jackpot bonus spin bank** that carries across players. Higher orb totals mean **more spins** in the **3-reel, single-line** jackpot mini-game once the feature triggers.

Trigger timing is random ... fat orb counts only improve **what you get when it hits**, not **when** it hits.`,
      when_to_stop: `Stop after the **jackpot bonus spins** finish and the **orb meter resets** for that bet.`,
      how_to_check: `1. Read the **orb total** on the meter for your active bet.
2. Cycle **every bet/denom** on the bank ... meters are per level.
3. Confirm you are on **Dragon's Orb Jackpots**, not a plain Konami dragon title without persistent orbs.`,
      risk_bankroll: `**500 units** ... you may grind coin-in waiting for the random jackpot bonus trigger.`,
      risk_summary: `Integrated **progressive jackpots** display above the reels ... bonus spins can award credits or a progressive tier each pull.

Some skins add **expanding wild reels** in base/free games ... orb count remains the AP read.`,
      risk_bullets: [],
      where_to_find: wtf("Dragon's Orb Jackpots", `- **Konami** DIMENSION banks ... tribal and regional commercial.`),
      skins_markdown: `**Jade Riches**, **Coral Fortunes**, and related Konami dragon skins.`,
      gameplay_mechanics: `**Dragon's Orb Jackpots** (Konami, **~2017**) runs a **15-reel** main game where **orb symbols** fill persistent meters. When the jackpot feature fires, play moves to a **3-reel, one-line** bonus where each spin can pay credits or a **progressive jackpot**.

**Free games** on some skins strip low symbols for fatter line hits ... orb persistence is separate from that path.`,
    },
  },
  {
    machine: {
      slug: 'duo-fu-duo-cai-grand-dragons',
      name: 'Duo Fu Duo Cai Grand: Dragons',
      manufacturer: 'Light & Wonder',
      type: 'Ascending Persistent Wilds',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'DFDC Grand bank half; wilds climb R3–5.',
      release_year: null,
    },
    guide: {
      title: 'Duo Fu Duo Cai Grand: Dragons',
      published: true,
      card_ev_threshold:
        '**2×** R3 · **1×** R3 + **1×** R4 · **2×** each R4–5 (skip top row)',
      when_to_play: `**Do not count top-row wilds** ... they move off next spin.

**Play when any of these walk-ups show on reels 3–5:**
1. **Two wilds** on **reel 3** (middle).
2. **One wild** on **reel 3** plus **one wild** on **reel 4**.
3. **Two wilds each** on **reels 4 and 5**.

Wilds **climb one row per spin** until they exit. **Red** wilds feed the red jackpot pick ... **yellow** wilds feed the golden pick. Ignore the **gold coin bowls** ... cosmetic, not progress.`,
      when_to_stop: `Stop after a **jackpot pick feature** resolves or the persistent wild stack **scrolls off** without triggering.`,
      how_to_check: `1. Count wilds on **reels 3–5** only, excluding the **top row**.
2. Cycle **denoms, credit levels, and bet multipliers** ... Grand banks expose many bet pads.
3. Pair with the **Ingotcha** twin on the same four-pack ... different guide, different math.`,
      risk_bankroll: `**100 units** ... most sessions lose until a **5OAK premium** or jackpot pick spikes.`,
      risk_summary: `Base **line hits are weak** without **five-of-a-kind premiums** ... you are paying for wild density plus random jackpot picks.

Wilds shoot out frequently ... plays are common if you scan the whole bank.`,
      risk_bullets: [],
      where_to_find: wtf('Duo Fu Duo Cai Grand: Dragons', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Dragons** half of the **Duo Fu Duo Cai Grand** four-pack ... pairs with **Ingotcha** on the same bank.`,
      gameplay_mechanics: `**Duo Fu Duo Cai Grand: Dragons** (Light & Wonder) keeps **persistent wilds** on **reels 3–5** that **move up** each spin. Each new wild can randomly trigger a **jackpot pick** tied to wild color.

RTP band reported **~87–94%** by config. Same engine family as other **DFDC Grand** titles but **not** interchangeable with **Ingotcha** math.`,
    },
  },
  {
    machine: {
      slug: 'duo-fu-duo-cai-grand-ingotcha',
      name: 'Duo Fu Duo Cai Grand: Ingotcha',
      manufacturer: 'Light & Wonder',
      type: 'Two-Spin Locked Wilds',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'DFDC Grand bank half; six-symbol hold & spin chase.',
      release_year: null,
    },
    guide: {
      title: 'Duo Fu Duo Cai Grand: Ingotcha',
      published: true,
      card_ev_threshold:
        '**1** locked wild R1–3 · **2** locked anywhere · **6** wild+coin trigger',
      when_to_play: `Glass must read **"locked for 2 spins"** or **"locked for 1 spin"** above the reels.

**Play when:**
1. **One locked wild** anywhere on **reels 1–3**.
2. **Two locked wilds** anywhere on the board.

**Six** combined **wilds and/or coin symbols** trigger **hold & spin**. Wilds lock **two spins** and reset to **two** when another wild lands. Wilds only stick on **reels 2–4** ... coins can land anywhere.`,
      when_to_stop: `Stop after **hold & spin** finishes (including **multiplier column** passes) or locked wilds **expire** without a trigger.`,
      how_to_check: `1. Confirm the **lock timer text** above the reels before you coin in.
2. Count **wilds + coins** toward the **six-symbol** trigger.
3. Cycle the full **denom / bet matrix** on the Grand bank.`,
      risk_bankroll: `**300 units** ... hold & spin is hard to hit but can print huge on stacked multiplier columns.`,
      risk_summary: `Each filled **three-coin column** in hold & spin awards a **multiplier pass** (**2×–5×** on every coin in a random full column) ... repeats on the same column stack.

**All 15 positions filled** awards the **fortune jackpot**. Base line hits still need **5OAK premiums** to matter.`,
      risk_bullets: [],
      where_to_find: wtf('Duo Fu Duo Cai Grand: Ingotcha', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Ingotcha** half of the **Duo Fu Duo Cai Grand** four-pack ... pairs with **Dragons** on the same bank.`,
      gameplay_mechanics: `**Duo Fu Duo Cai Grand: Ingotcha** (Light & Wonder) locks **red/yellow wilds** for **two spins** on **reels 2–4**. Coins plus wilds persist toward a **six-symbol hold & spin**.

Multiplier spins during hold & spin can re-hit the same column for **gigantic** totals. Ignore **gold coin bowls** on the top screen ... not a meter.`,
    },
  },
]
