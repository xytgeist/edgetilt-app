/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH9_PAYLOADS = [
  {
    machine: {
      slug: 'frankenstein',
      name: 'Frankenstein',
      manufacturer: 'Light & Wonder',
      type: 'Prize Board Multipliers',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'L&W prize board; multiplier EV scout.',
      release_year: null,
    },
    guide: {
      title: 'Frankenstein',
      published: true,
      card_ev_threshold: 'Prize-board multipliers **+EV** · spread on blue credits',
      when_to_play: `**Primary play:** sit when the **prize-board multiplier layout** clears your EV bar ... most APs model the orange jackpots + blue credit grid before coin-in.

**Lower-variance read:** multipliers **spread across smaller blue prizes** beat the same total stacked on one orange jackpot.

**Power Up** (R1) ticks a random prize **+1× to +5×** (cap **10×** per prize). **It's Alive** (R1 + heads R2–R5) shoots prizes you've built.

Grand (**$3+** bet only) never takes multipliers and never hits in free games.`,
      when_to_stop: `Stop after **It's Alive** or **free games** finish and the board **resets** multipliers on your bet level.`,
      how_to_check: `1. Read **multiplier tags** on every orange jackpot + blue credit above the reels.
2. Cycle **all six denoms** ... boards are per bet.
3. After a big expand, **flip bet levels** to see which multiplier tags are truly persistent.`,
      risk_bankroll: `**50–100 units** ... long-run +EV but not a win-every-session grind.`,
      risk_summary: `Free games (**8 spins**, taller reel set) keep built multipliers and fire **It's Alive** more often ... feast or famine.

Hit frequency is fine; edge lives in **which** prizes are multiplied before the feature.`,
      risk_bullets: [],
      skins_markdown: `[Frankenstein Returns](guide:frankenstein-returns)`,
      gameplay_mechanics: `**Frankenstein** (Light & Wonder) parks **fixed + progressive prizes** above **5×4** reels. **Power Up** adds multipliers; **It's Alive** collects them via head symbols.

Flame heads can award orange jackpots. Production cabinets differ from early demo builds (eight free spins, flame-head jackpots, reset multipliers).`,
    },
  },
  {
    machine: {
      slug: 'frankenstein-returns',
      name: 'Frankenstein Returns',
      manufacturer: 'Light & Wonder',
      type: 'Prize Board Multipliers (Wheel)',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Sequel board; tentative multiplier line.',
      release_year: null,
    },
    guide: {
      title: 'Frankenstein Returns',
      published: true,
      card_ev_threshold: '**10–12+** combined multipliers (tentative)',
      when_to_play: `**Primary play (early field line):** **10–12+ combined multipliers** on the persistence meter.

**Honest take:** rules are still settling ... **20+ combined** should be rare. Green **monster heads** now jump the multiplier meter; **wheel bonus** replaced straight free spins vs the original.

Treat as **experimental** until your floor proves the threshold.`,
      when_to_stop: `Stop after the **wheel bonus** or feature sequence you chased resolves and multipliers reset.`,
      how_to_check: `1. Sum **combined multipliers** on the prize board / meter.
2. Note **colored monster symbols** that can dump instant prizes or meter jumps.
3. Cycle **bet levels** ... separate boards per denom.`,
      risk_bankroll: `**50–100 units** minimum while the line is still tentative.`,
      risk_summary: `Faster base game + wheel volatility than original **Frankenstein**. Same family idea, different feature cadence.

Do not assume original **Frankenstein** math transfers 1:1.`,
      risk_bullets: [],
      skins_markdown: `[Frankenstein](guide:frankenstein)`,
      gameplay_mechanics: `**Frankenstein Returns** (Light & Wonder) keeps the **prize board + multiplier** loop but adds **multi-color monster symbols** (2–5 instant hits, jackpot nudges, meter spikes) and a **wheel bonus** tied to the same board.

**Power Up** moved to **R5** in marketing copy ... verify reel behavior on your cabinet.`,
    },
  },
  {
    machine: {
      slug: 'freedom-luck',
      name: 'Freedom Luck',
      manufacturer: 'Aristocrat',
      type: 'Progressive Free Game Meters',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Dual-game color meters; re-trigger free games.',
      release_year: 2022,
    },
    guide: {
      title: 'Freedom Luck',
      published: true,
      card_ev_threshold: 'G1: Blue **15+** · Red **19+** · Yellow **30+**',
      when_to_play: `**Game 1 (single color):**

- **Blue meter ≥ 15**
- **Red meter ≥ 19**
- **Yellow meter ≥ 30**

**Game 2 (color pairs):**

- **Blue + Red combined ≥ 29**
- **Red + Yellow combined ≥ 40**

Patriotic **Progressive Free Games** cabinet ... confirm which side (**Game 1 vs Game 2**) your bank is running.`,
      when_to_stop: `Stop after the **progressive free games** feature you chased finishes (re-triggers can extend).`,
      how_to_check: `1. Read **Blue / Red / Yellow** progressive counters on the glass.
2. Identify **Game 1 vs Game 2** layout on the dual-game panel.
3. Cycle **denoms** if meters are per bet.`,
      risk_bankroll: `**30–60 units** ... medium volatility with multiplier growth during free games.`,
      risk_summary: `Meters climb during base play and can **re-trigger** in the bonus. Wrong game panel = wrong threshold table.

Scout is counting color totals, not line hits.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Freedom Luck** (Aristocrat, **2022**) runs **Progressive Free Games** with **Blue / Red / Yellow** tracks that can combine on dual-game configs.

Free spins can grow **multipliers** while the feature runs ... edge is meter depth before you sit.`,
    },
  },
  {
    machine: {
      slug: 'fu-dai-lian-lian-boost-peacock-boost-tiger',
      name: 'Fu Dai Lian Lian Boost: Peacock / Boost Tiger',
      manufacturer: 'Aristocrat',
      type: 'Persistent Bag Jewels',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Boost bags on bet pad; jeweled pair hunt.',
      release_year: null,
    },
    guide: {
      title: 'Fu Dai Lian Lian Boost: Peacock / Boost Tiger',
      published: true,
      card_ev_threshold: '**2/3** bags jeweled · **3/3** best · never **1**',
      when_to_play: `**Primary play:** **two bags showing jewels** on the bet pad (**Boost Peacock** or **Boost Tiger** only).

**Excellent:** all **three** bags jeweled.

**Never sit one jeweled bag** ... even **two** is a thin edge per field reports.

Jewels mean **boosted bonus** when that bag eventually fires ... **bag size ≠ closer to trigger**.`,
      when_to_stop: `Stop after **one bag bonus** fires if only one was jeweled. If **two+ jeweled bags** still show after a partial trigger, you can keep going for the paired hit.`,
      how_to_check: `1. Confirm **Boost** skin with **bags on the bet pad** (not panda/dragon non-Boost or bingo-pad installs).
2. Check **jewels** on each bag color ... ignore size alone.
3. Cycle **all denoms** on the bank.`,
      risk_bankroll: `**100 units** minimum on bigger bets ... bonus can take a long time to drop.`,
      risk_summary: `Extreme variance ... most sessions lose until a **dual-bag** boost pays.

Skip **one jeweled + level-4 non-jewel** combo plays ... adds volatility without much edge.`,
      risk_bullets: [],
      skins_markdown: `**Boost Peacock**, **Boost Tiger** ... same AP. Non-Boost panda/dragon = pass.`,
      gameplay_mechanics: `**Fu Dai Lian Lian Boost** (Aristocrat) fills **three persistent bags** with coins until **jewels** appear and the bag glows. Triggering with jewels active upgrades that bag's bonus.

Goal is **both jeweled bags in one bonus event** ... happens often enough to chase, not guaranteed.`,
    },
  },
  {
    machine: {
      slug: 'fu-ru-dong-hai',
      name: 'Fu Ru Dong Hai',
      manufacturer: 'IGT',
      type: 'Ascending Wild Bubbles',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Ocean Magic Asian skin; sunrise bubbles.',
      release_year: null,
    },
    guide: {
      title: 'Fu Ru Dong Hai',
      published: true,
      card_ev_threshold: 'Wild bubbles in window · **sunrise** below reels',
      when_to_play: `**Primary play:** **persistent wild bubbles** in qualifying reel positions, including **sunrise bubbles** queued **below the bottom row**.

Same hunt as **Ocean Magic** ... regular and **Bubble Boost** mode share the bubble map.

**R2–R3** bubbles beat edge columns for expansion value. **Sunrise** bubbles are the most overlooked walk-by gold.

**Ignore** one-spin **expanded wilds** ... only **bubbles** persist.`,
      when_to_stop: `Stop after bubbles **exit the top row** without a paying expand, or after your bubble expansion sequence finishes.`,
      how_to_check: `1. Count **wild bubbles** vs fake expanded wilds ... **bet-flip** clears ghosts.
2. Check **below the reel window** for sunrise bubbles rising next spin.
3. Cycle **every bet + denom** ... bubble fields are per bet.`,
      risk_bankroll: `**15–30 units** per walk-up bubble board.`,
      risk_summary: `Less common than **Ocean Magic** but identical math. Bubbles arrive in **spurts** ... foghorn / Bubble Boost streaks drive spikes.

Treasure-chest scatters can **hide** bubbles ... look for the glow behind symbols.`,
      risk_bullets: [],
      skins_markdown: `Asian skin clone of **Ocean Magic** (same AP).`,
      gameplay_mechanics: `**Fu Ru Dong Hai** (IGT) is an **Ocean Magic** theme clone: **wild bubbles** step **up one row** each spin and **expand** when they cover an Ocean Magic symbol.

Bubble Boost doubles bet for extra bubble drops ... field treats it as same positional edge when bubbles already present.`,
    },
  },
  {
    machine: {
      slug: 'fu-stacks-jade-crimson',
      name: 'Fu Stacks: Jade / Crimson',
      manufacturer: 'Everi',
      type: 'Coin Stack Reveal',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Coin holders above reels; matching stacks.',
      release_year: null,
    },
    guide: {
      title: 'Fu Stacks: Jade / Crimson',
      published: true,
      card_ev_threshold: 'G1: **2 coins × R1–R3** · G2: **6+ coins in R1–R4**',
      when_to_play: `**Game 1:**

- **Two coins** in **each of the first three reels** (holders above columns).
- **Any active stack** in R1–R3 (glowing reel border).

**Game 2:**

- **Six or more coins** total across the **first four columns**.

Stacks **match symbols** revealed by coin slides ... you want **R1–R3 active together** for guaranteed line coverage.`,
      when_to_stop: `Stop after the **three-spin guaranteed stack** window on a chased reel finishes and holders empty.`,
      how_to_check: `1. Count **coins in holders** above each column.
2. Look for **glowing borders** = active stack reels.
3. Cycle **bet levels** ... holders are per bet.`,
      risk_bankroll: `**25–50 units** ... single active stacks can whiff without R3 match.`,
      risk_summary: `Not **Golden Egypt** wild reels ... matching stacks need symbol alignment on line hits.

Premium **5 of a kind** spikes exist when multiple stacks sync.`,
      risk_bullets: [],
      skins_markdown: `**Fu Stacks Jade**, **Fu Stacks Crimson**.`,
      gameplay_mechanics: `**Fu Stacks** (Everi, **243 ways**) slides coins to reveal **like symbols**. **Three coins** in a holder guarantees **full stacks** on that reel for the **next three spins**.

**Gold box** collection can feed holders ... watch partial vs full stack states.`,
    },
  },
  {
    machine: {
      slug: 'fuse-blast-caifu-zhi-wu',
      name: 'Fuse Blast / Caifu Zhi Wu',
      manufacturer: 'Everi',
      type: 'Lit Fuse Firecracker',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'Locked firecracker + lit fuse; quick hit.',
      release_year: null,
    },
    guide: {
      title: 'Fuse Blast / Caifu Zhi Wu',
      published: true,
      card_ev_threshold: '**Lit fuse** on locked firecracker',
      when_to_play: `**Primary play:** any **firecracker with a lit fuse** locked on the reels.

**Never** sit **unlit** firecrackers ... candle + firecracker same spin lights the fuse and locks the cracker.

Longer starting fuse → more **Fuse Blast** fireballs when it pops (**6+** fireballs can trigger hold-and-spin; fewer still pay credit prizes).`,
      when_to_stop: `Stop after the **fuse burns out** and the **Fuse Blast** / hold-and-spin sequence completes.`,
      how_to_check: `1. Look for **lit fuse** on a **locked firecracker** (candle gone, cracker stays).
2. Note **fuse length** ... longer = bigger blast potential.
3. Cycle **all denoms** on the bank.`,
      risk_bankroll: `**10–20 units** ... lit fuse plays are usually **few spins** to profit.`,
      risk_summary: `Near-guaranteed profit once fuse is lit ... variance is how many fireballs/jackpots drop.

Natural fireballs on the **final fuse spin** count toward the **six** for hold-and-spin.`,
      risk_bullets: [],
      skins_markdown: `**Fuse Blast**, **Caifu Zhi Wu**.`,
      gameplay_mechanics: `**Fuse Blast / Caifu Zhi Wu** (Everi): **candle + firecracker** same spin lights a fuse and **locks** the cracker. Each spin burns the fuse **one position or all the way** until explosion triggers **Fuse Blast** fireballs with credits/jackpots.`,
    },
  },
  {
    machine: {
      slug: 'genie-unleashed',
      name: 'Genie Unleashed',
      manufacturer: 'AGS',
      type: 'Dual Lamp Meters',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Wheel Frenzy lamps; 5+5 ideal.',
      release_year: 2024,
    },
    guide: {
      title: 'Genie Unleashed',
      published: true,
      card_ev_threshold: '**5** red or **5** blue lamps · **8+** total min',
      when_to_play: `**Ideal:** **five red** or **five blue magic lamps** on their side meters.

**Minimum:** **eight lamps combined** across **both** sides.

Separate from the factory **six coins** wheel fill on R2–R4 ... this hunt reads the **flanking lamp meters**.`,
      when_to_stop: `Stop after the **Wheel Frenzy** or **Pick Bonus** sequence you chased finishes and lamp counts drop.`,
      how_to_check: `1. Count **red vs blue lamp meters** beside the reels.
2. Confirm **40-line / 75-credit** cover bet on your install.
3. Cycle **bet levels** if meters are per denom.`,
      risk_bankroll: `**25–40 units** ... pick bonus + wheel layers add variance.`,
      risk_summary: `**2024** **Wheel Frenzy** family title ... coins on R2–R4 still feed jackpots, but AP line is **lamp totals**.

Wheel Boost / expanded free-game reel set can spike ... scout lamps, not coin clutter alone.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Genie Unleashed** (AGS, **2024**) runs **4×5**, **40 lines**, **75 credits** to cover. **Pick Bonus** (R1/3/5), **Wheel Frenzy** (six coins), and **free spins** (5×6) share lamp/coin meters.

AP focus is **persistent lamp counts** on each side of the reels.`,
    },
  },
]
