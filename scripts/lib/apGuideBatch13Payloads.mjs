/** Batch 13 synth payloads. `ji-ji-fu` omitted — AP stub. `jade-monkey-diamond-devils` split → `jade-monkey-deluxe` + `diamonds-devils-deluxe`. */
/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH13_PAYLOADS = [
  {
    machine: {
      slug: 'jade-monkey-deluxe',
      name: 'Jade Monkey Deluxe',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Diamond Prizes',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'FG + diamond meters above reels.',
      release_year: 2019,
    },
    guide: {
      title: 'Jade Monkey Deluxe',
      published: true,
      card_ev_threshold: '8+ FG + 2 diamonds · 16+ FG + 1 · 24+ FG · 10x + 2 diamonds',
      when_to_play: `**Primary play:**

- **8+ free games and 2 diamonds** above a reel.
- **16+ free games and 1 diamond**.
- **24+ free games** (even **0 diamonds**).
- **Credit prize ≥ 10× bet with 2 diamonds**.

Reels **1–2** can play slightly looser; reel **5** tighter.`,
      when_to_stop: `Stop after a reel prize is **won or reset** and the board is no longer +EV.`,
      how_to_check: `Read **free-game count and diamond meter** above each reel (**silver** = reset credit, **yellow** = built up). Cycle through all **bets/denoms**.`,
      risk_bankroll: `**200 units**`,
      risk_summary: `Devil/monkey on a **zero-diamond reel wipes the whole prize** ... ploppies chase silver reset credits thinking they are still +EV.`,
      risk_bullets: [],
      skins_markdown: `[Diamonds & Devils Deluxe](guide:diamonds-devils-deluxe)`,
      gameplay_mechanics: `**Jade Monkey Deluxe** (Light & Wonder) parks persistent prizes above reels; **3 diamonds** awards the prize. Devil/monkey removes a diamond or resets the reel.`,
    },
  },
  {
    machine: {
      slug: 'jewel-collection-dragon-vault',
      name: 'Jewel Collection: Dragon / Vault',
      manufacturer: 'Sega Sammy',
      type: 'Jewel Wild Meters / Mystery Free Games',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Scatter 480+ or wild meters 610+.',
      release_year: null,
    },
    guide: {
      title: 'Jewel Collection: Dragon / Vault',
      published: true,
      card_ev_threshold: 'Scatter meter 480+ · combined wild meters 610+',
      when_to_play: `**Primary play:**

- **Free-games scatter meter ≥ 480** (above **R2**).
- **OR** combined total of all four **jewel wild meters** (amethyst + sapphire + emerald + ruby) **≥ 610**.`,
      when_to_stop: `Stop after **mystery free games** or the triggered jewel feature completes and meters reset.`,
      how_to_check: `Read **scatter meter above R2** and **four jewel wild counts** on the bet pad (amethyst may show on main screen). Cycle through all **bets/denoms**.`,
      risk_bankroll: `**100 units**`,
      risk_summary: `Scatter chase bonuses can **brick hard** ... extra wilds are strip-added, not guaranteed to land.`,
      risk_bullets: [],
      skins_markdown: `**Jewel Collection: Dragon**, **Jewel Collection: Vault**.`,
      gameplay_mechanics: `**Jewel Collection** (Sega Sammy) runs four capped jewel wild meters plus a **777-cap scatter meter** for mystery free games.`,
    },
  },
  {
    machine: {
      slug: 'jie-jie-gao-sheng',
      name: 'Jie Jie Gao Sheng',
      manufacturer: 'Ainsworth',
      type: 'Ingot Multiplier Free Spins',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Ingot meters; 2x/3x/4x FS thresholds.',
      release_year: 2022,
    },
    guide: {
      title: 'Jie Jie Gao Sheng',
      published: true,
      card_ev_threshold: '2x 55+ · 3x 85+ · 4x 100+ · 2x+3x 110+ · 3x+4x 160+',
      when_to_play: `**Primary play by active multiplier tier:**

- **2× = 55+ free spins**
- **3× = 85+**
- **4× = 100+**
- **2× + 3× = 110+**
- **3× + 4× = 160+**`,
      when_to_stop: `Stop after the **multiplier free-games bonus** completes and ingot meters reset.`,
      how_to_check: `Read **free-spin counts on each multiplier meter** on the paytable display. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**100 units**`,
      risk_summary: `Bonus pick **randomizes toward 2×** ... a fat 3×/4× meter does not guarantee that multiplier in the pick.`,
      risk_bullets: [],
      skins_markdown: `**Lucky Lion**, **Fortunes** (same ingot engine).`,
      gameplay_mechanics: `**Jie Jie Gao Sheng** (Ainsworth, **243-way**) uses golden ingots that boost line pays until a win resets them. Progressive meters feed a **2×/3×/4×** free-games bonus.`,
    },
  },
  {
    machine: {
      slug: 'jin-ji-bao-xi-grand-phoenix-tiger',
      name: 'Jin Ji Bao Xi Grand: Phoenix / Tiger',
      manufacturer: 'Light & Wonder',
      type: 'Sticky Bat Wilds',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Locked bats R2–R4; Grand skins only.',
      release_year: null,
    },
    guide: {
      title: 'Jin Ji Bao Xi Grand: Phoenix / Tiger',
      published: true,
      card_ev_threshold: '1 locked bat R2–R4 in R1–3 · OR 2 locked bats anywhere',
      when_to_play: `**Primary play:**

- **One locked bat in R2–R4 within the first three reels**.
- **OR two locked bats anywhere**.

Only count bats showing **"locked for 2 spins"** or **"locked for 1 spin"** upper-left ... **pass 1-coin bats** about to expire.

Ignore the **gold-coin bowl** (not AP state).`,
      when_to_stop: `Stop after locked bats clear or the **6 bat/coin bonus** resolves.`,
      how_to_check: `Confirm **"locked for X spins"** text upper-left and bat positions on **R2–R4**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**Coin stack on the bat lies** ... trust the **locked for X spins** banner, not the coin graphic.`,
      risk_bullets: [],
      skins_markdown: `**Jin Ji Bao Xi Grand: Phoenix**, **Tiger** (Grand skins only ... other JJBX titles are not AP).`,
      gameplay_mechanics: `**Jin Ji Bao Xi Grand** (Light & Wonder) locks wild bats **2 spins** on **R2–R4**; new bats reset all locks. **Six** bats/coins trigger bonus.`,
    },
  },
  {
    machine: {
      slug: 'joe-blow-diamonds-joe-blow-gold',
      name: 'Joe Blow Diamonds / Joe Blow Gold',
      manufacturer: 'Aristocrat',
      type: 'TNT Wild Reels / Dynamite Collect',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'TNT wild columns + dynamite count.',
      release_year: 2018,
    },
    guide: {
      title: 'Joe Blow Diamonds / Joe Blow Gold',
      published: true,
      card_ev_threshold: 'G1: wild spins R1–R3 · G2: 6+ dyn R1–4 · G3: 7+ dyn · G4: 2 wild-spin reels R1–4',
      when_to_play: `**Game 1:** All active **wild-spin columns in R1–R3** (**3 TNT sticks** above a column = wild next **3 spins**).

**Game 2:** **6+ dynamite** on **R1–R4**.

**Game 3:** **7+ dynamite** anywhere.

**Game 4:** **Two reels** with active wild spins within **R1–R4**.`,
      when_to_stop: `Stop after **wild-spin counters** expire or the **dynamite feature** you chased completes.`,
      how_to_check: `Count **TNT sticks above each column** and **dynamite symbols on the reels**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Full-board wilds can still pay **modest** ... do not over-chase a hot dynamite count expecting a handpay.`,
      risk_bullets: [],
      skins_markdown: `**Joe Blow Diamonds**, **Joe Blow Gold**.`,
      gameplay_mechanics: `**Joe Blow** (Aristocrat) collects **3 TNT** above a column for **3 wild spins** on that reel. Dynamite symbols stack toward bonus triggers.`,
    },
  },
  {
    machine: {
      slug: 'jurassic-park-trilogy',
      name: 'Jurassic Park Trilogy',
      manufacturer: 'IGT',
      type: 'Dual-Reel Bonus Chase',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Bonus stuck R2 + counter above R4.',
      release_year: null,
    },
    guide: {
      title: 'Jurassic Park Trilogy',
      published: true,
      card_ev_threshold: 'Bonus symbol on R2 · spin counter above R4',
      when_to_play: `**Primary play:** **Bonus symbol already on reel 2** with a **spin counter above reel 4**.

Do **not** play needing a symbol on **R2** when only **R4** is set.`,
      when_to_stop: `Stop after the **Jackpot Bonus pick board** completes or counters expire without triggering.`,
      how_to_check: `Look for **bonus symbols above columns 2 and 4** and the **spins-remaining number** opposite each. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**30 units**`,
      risk_summary: `Most walk-ups chase **any** counter on either reel ... needing the symbol on **R2** with five spins left is still a long shot.`,
      risk_bullets: [],
      skins_markdown: `**Jurassic Park**, **The Lost World**, **Jurassic Park III**.`,
      gameplay_mechanics: `**Jurassic Park Trilogy** (IGT) needs bonus symbols on **R2 and R4** for the honeycomb **Jackpot Bonus** pick. One symbol grants **5 spins** to land the other.`,
    },
  },
  {
    machine: {
      slug: 'knock-knock-guardians-queen-raider',
      name: 'Knock Knock Guardians: Queen / Raider',
      manufacturer: 'AGS',
      type: 'Dual-Cat Bonus Meters',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Purple FS 12+; both cats MAX.',
      release_year: 2024,
    },
    guide: {
      title: 'Knock Knock Guardians: Queen / Raider',
      published: true,
      card_ev_threshold: 'Purple FS 12+ · both cats MAX · agg: purple 10+ · one MAX + one L2',
      when_to_play: `**Primary play:** **Purple free-spins meter ≥ 12** and **both cats at level 3** (MAX under feet).

**Aggressive:** **Purple ≥ 10** with **one cat MAX** and the **other at level 2**.

Never chase cats or non-purple meters alone. **Statue cracks** are cosmetic ... read cat levels only.`,
      when_to_stop: `Stop after the **wheel-triggered free-spins bonus** completes and triggered cat(s) reset to level 1.`,
      how_to_check: `Read **purple FS meter** and **left/right cat levels** on the bet pad. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**200 units**`,
      risk_summary: `**MAX cat with only 5 purple spins** will not cover trigger cost ... upgraded cats without a high purple meter bleed.`,
      risk_bullets: [],
      skins_markdown: `**Knock Knock Guardians: Queen**, **Raider**.`,
      gameplay_mechanics: `**Knock Knock Guardians** (AGS, **2024**) upgrades **Symbol Change** (left cat) and **Reel Grow** (right cat) bonuses via orbs. Wheel awards progressive FS meters; **purple** is the primary AP meter.`,
    },
  },
  {
    machine: {
      slug: 'kraken-unleashed-lobster-bay-wild-vikings-dive-for-five',
      name: 'Kraken Unleashed: Lobster Bay / Wild Vikings / Dive for Five',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Wood Panel Hold & Spin',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'Top-row wood panels; 6 triggers H&S.',
      release_year: 2023,
    },
    guide: {
      title: 'Kraken Unleashed: Lobster Bay / Wild Vikings / Dive for Five',
      published: true,
      card_ev_threshold: '2+ top-row panels · 1 top + 2 middle · agg: any top-row panel',
      when_to_play: `**Primary play:**

- **Two or more wood panels in the top row**.
- **OR one top-row panel plus at least two in the middle row**.

**Aggressive (higher RTP):** **Any top-row panel** unless a **4-high stack** just shed its bottom tile.

Panels on **R1–R4** only.`,
      when_to_stop: `Stop when **no qualifying wood panels remain in the top row**.`,
      how_to_check: `Scan **rows 1–2 for wood panels** on reels **1–4**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**10 units**`,
      risk_summary: `Do not confuse a **tall stack in row 2** with a row-1 play ... panels shift down every spin.`,
      risk_bullets: [],
      skins_markdown: `**Kraken Unleashed: Lobster Bay**, **Wild Vikings**, **Dive for Five**.`,
      gameplay_mechanics: `**Kraken Unleashed** family (Light & Wonder) persists wood panels that shift **down one row per spin**; **six** panels trigger hold-and-spin.`,
    },
  },
  {
    machine: {
      slug: 'legends-of-fire-and-water',
      name: 'Legends of Fire and Water',
      manufacturer: 'IGT',
      type: 'Dragon Wild Stack Meters',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'R1+R3 wild-stack meters; ignore R5 for sit.',
      release_year: null,
    },
    guide: {
      title: 'Legends of Fire and Water',
      published: true,
      card_ev_threshold: 'R1+R3 high teens · OR either R1/R3 over 20 wilds',
      when_to_play: `**Primary play:** Focus **columns 1 and 3**.

- **Both in the high teens**, **OR either column over 20** added wilds.

**Column 5** does not gate the sit decision.`,
      when_to_stop: `Stop when a **busted yin-yang** drops meters **below** AP thresholds.`,
      how_to_check: `Read **dragon wild-stack meters above columns 1, 3, and 5**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**Busted yin-yangs** can slash a meter **10–100%** in one hit ... streaky losses between big runs are normal.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Legends of Fire and Water** (IGT) adds **+5** to a reel's wild stack when a full dragon lands on **R1/R3/R5**. Gold yin-yang adds **1–3**. Phoenix on **R2/R4** duplicates to its counterpart.`,
    },
  },
]
