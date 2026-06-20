/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH11_PAYLOADS = [
  {
    machine: {
      slug: 'golden-messenger',
      name: 'Golden Messenger',
      manufacturer: 'Konami',
      type: 'Coin Pick Wild Reel',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Konami 3-coin pick; volatile choices.',
      release_year: null,
    },
    guide: {
      title: 'Golden Messenger',
      published: true,
      card_ev_threshold: '3 reels × 2 coins · 5 coins R1–R3 · 7 total',
      when_to_play: `**Primary play:**

- **Three reels with two coins each** above the column.
- **Five coins** in the **first three reels**.
- **Seven coins** anywhere on the board.

**Do not count** reels already at **three coins** ... pick fires next spin and coins clear.

Full reel goes **wild one spin** when the third coin lands ... coins in **R1–R3** are worth more.`,
      when_to_stop: `Stop after the **three-coin pick** resolves and coin meters reset.`,
      how_to_check: `Count **coins above each reel** on the bet pad. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Pick bonus is **one good prize, two bad** ... bad picks happen often enough to sting if you are not logging volume.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Golden Messenger** (Konami) collects **persistent coins** above reels. At **three coins**, the column wilds **one spin** and you **pick** from three face-down prizes.`,
    },
  },
  {
    machine: {
      slug: 'grand-buddha-link-grand-cat-link',
      name: 'Grand Buddha Link / Grand Cat Link',
      manufacturer: 'IGT',
      type: 'Locked Line Multipliers',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Successor to Lucky Buddha / Wealth Cat.',
      release_year: null,
    },
    guide: {
      title: 'Grand Buddha Link / Grand Cat Link',
      published: true,
      card_ev_threshold: '8x + 6x or 5x active · agg: lone 8x · 6x+5x + two 3x',
      when_to_play: `**Basic:** **8×** multiplier active **plus** **6× or 5×** active (**Games Remaining > 0** on the panel).

**Aggressive (higher RTP installs):** any **8×** active alone; OR **both 6× and 5×** with **two 3×** active.

**Never sit 0 Games Remaining** ... multipliers are dead.

Ignore **coin bowls** on many cabinets (no AP effect).`,
      when_to_stop: `Stop when tracked multipliers **expire** or after you finish the active **8-spin** multiplier window.`,
      how_to_check: `Read **upper-left multiplier panel** (8× / 6× / 5× / 3×) and **Games Remaining**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**30 units**`,
      risk_summary: `**Coin bowls** on many cabinets look important ... they do not change the multiplier hunt.`,
      risk_bullets: [],
      skins_markdown: `**Grand Buddha Link**, **Grand Cat Link** (cat vs buddha premium). Successor to **Lucky Buddha / Lucky Wealth Cat**.`,
      gameplay_mechanics: `**Grand Buddha Link / Grand Cat Link** (IGT) runs **4×5**, **38 lines**, **88 credits** to cover. Locked multipliers persist for **eight paid spins** after qualifying line hits.`,
    },
  },
  {
    machine: {
      slug: 'green-machine-bingo',
      name: 'Green Machine Bingo',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Bingo Balls',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: '5×5 bingo board; green one-away lines.',
      release_year: null,
    },
    guide: {
      title: 'Green Machine Bingo',
      published: true,
      card_ev_threshold: '2+ green highlights · 1 (star/8× line) · agg: 40× two-away',
      when_to_play: `**Primary:** **two or more glowing green** one-away bingo highlights.

**OR one highlight** if the line uses the **center star** OR line credits are **≥ 8× bet**.

**Aggressive:** two lines **two-away** with **≥ 40× bet** combined on those lines (**star lines count 2×** shown credits); OR **≥ 80× bet** total board credits; OR **11+ locked balls** regardless of credits.

Only count **gold-lock (2 spins)** or **silver-lock (1 spin)** balls.`,
      when_to_stop: `Stop after completing **bingo line(s)** or when balls expire to gray.`,
      how_to_check: `Scan **5×5 board** for **glowing green** one-away cells. **Lock color** = spins remaining (**gold = 2**, **silver = 1**).`,
      risk_bankroll: `**10 units**`,
      risk_summary: `A new ball on a line **resets that line to 2 spins** ... multi-line boards can expire faster than you expect.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Green Machine Bingo** (Light & Wonder) locks bingo balls for **1–2 spins** depending on lock tier. **Five balls** through the center star completes a line.`,
    },
  },
  {
    machine: {
      slug: 'guardians-of-the-aztec-guardians-of-giza',
      name: 'Guardians of the Aztec / Guardians of Giza',
      manufacturer: 'Konami',
      type: 'Symbol Collect Pick Bonus',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '7/10 symbol collect; true-pick bonus.',
      release_year: null,
    },
    guide: {
      title: 'Guardians of the Aztec / Guardians of Giza',
      published: true,
      card_ev_threshold: '7/10 symbols collected · buy bonus at 7',
      when_to_play: `**Primary play:** **seven or more symbols** in the holder above the reels (**ten** triggers the bonus).

**Buy bonus** option often appears at **7+** on many configs.

Bet-pad **pyramid / sphinx fill** should roughly match the holder count. **Strike Zone** borders vary by bet but **do not** change the posted threshold.`,
      when_to_stop: `Stop after the **pick bonus** you chased resolves (symbols may carry back into base).`,
      how_to_check: `Count **symbols in the holder** above the reels. Cycle through all **bets/denoms** and compare bet-pad **pyramid steps** to the holder.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Weak pick outcomes (**5 free games**) happen ... do not confuse a fat holder with a guaranteed spike.`,
      risk_bullets: [],
      skins_markdown: `**Guardians of the Aztec**, **Guardians of Giza**.`,
      gameplay_mechanics: `**Guardians of the Aztec / Giza** (Konami) collects **ten** pyramid/sphinx symbols into a visible holder, then awards a **pick bonus** (free games, credits, or wild multipliers).`,
    },
  },
  {
    machine: {
      slug: 'happy-8s-jolly-8s',
      name: "Happy 8's / Jolly 8's",
      manufacturer: 'Incredible Technologies',
      type: '8-Spin Wild Cycle',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '8-spin wild cycle; never 8/8.',
      release_year: null,
    },
    guide: {
      title: "Happy 8's / Jolly 8's",
      published: true,
      card_ev_threshold: 'Spin wild count 6–9 · or 2 bonus / jackpot 1-away',
      when_to_play: `**8-spin cycle** (**never sit 8/8**).

**Minimum wilds collected by spin position:**

- **1/8 & 7/8:** **6** wilds
- **2/8 & 6/8:** **7** wilds
- **3/8 & 5/8:** **8** wilds
- **4/8:** **9** wilds

Shortcut: wilds **≥ 9 − |4 − spin#|**.

**Also play:** **two bonus symbols** OR any jackpot **one away** (mini/minor @ **4**, major/grand @ **5**).`,
      when_to_stop: `Stop after **spin 8/8** wild blast and the cycle resets.`,
      how_to_check: `Read **wild count** and **cycle position** on the bet pad. Check **bonus / jackpot** accumulator distance.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**8/8** is never the sit ... you are finishing a cycle, not starting a fresh +EV board.`,
      risk_bullets: [],
      skins_markdown: `**Happy 8's**, **Jolly 8's**.`,
      gameplay_mechanics: `**Happy 8's / Jolly 8's** (Incredible Technologies) accrues **wild symbols** on spins **1–7**, then randomly places them on **spin 8**. Bonus at **three** scatter symbols; progressives at **4/5** hits.`,
    },
  },
  {
    machine: {
      slug: 'happy-blessings-happy-blossoms',
      name: 'Happy Blessings / Happy Blossoms',
      manufacturer: 'AGS',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '2024 Platinum Choice; R2–R3 coin sums.',
      release_year: 2024,
    },
    guide: {
      title: 'Happy Blessings / Happy Blossoms',
      published: true,
      card_ev_threshold: 'R2–R3 mult sum ≥10x · active wilds R2–R3 · R4 wild + 2x/3x',
      when_to_play: `**Primary play:**

- **Reels 2–3 coin multipliers sum ≥ 10×** (plain coin = **1×**).
- **Any active wilds** on **reels 2–3**.
- **Reel 4 wild active** with **2× or 3×** coins above.

**Pass** two-coin-only boards **without multipliers** ... common and −EV.`,
      when_to_stop: `Stop after **three-spin wild reel** windows expire on the columns you entered.`,
      how_to_check: `Sum **multipliers** in coin holders above **R2–R4**. Cycle through all **bets/denoms** without coin-in if your floor allows.`,
      risk_bankroll: `**30 units**`,
      risk_summary: `**Pot fills** and fake pick teases look like the hunt ... AP is the **coin holders** only.`,
      risk_bullets: [],
      skins_markdown: `**Happy Blessings**, **Happy Blossoms**.`,
      gameplay_mechanics: `**Happy Blessings / Happy Blossoms** (AGS, **2024**) uses persistent **coin holders** above **R2–R4** to lock wild reels for **three spins** when filled.`,
    },
  },
  {
    machine: {
      slug: 'hexbreak3r',
      name: 'Hexbreak3r',
      manufacturer: 'IGT',
      type: 'Expanding Ways / Luck Zone',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Center col 7+ high · paths 4000–5000+.',
      release_year: null,
    },
    guide: {
      title: 'Hexbreak3r',
      published: true,
      card_ev_threshold: 'Paths 4000+ or 5000+ · col 3 height 7+ · bonus 1-away cols 1/5',
      when_to_play: `**Game 1:** left **ways/paths meter ≥ 4000** (low RTP) or **≥ 5000** (typical).

**Game 2:** **column 3 height ≥ 7** in the luck zone (**6+** only on strong RTP or big progressive).

**Game 3:** bonus **one field away** on **columns 1 and 5**.

**Game 4:** bonus **two fields away** on **columns 2 and 4**.

Ride **column 3** edge plays until that column hits the **top** even if outer cols bottomed out.`,
      when_to_stop: `Stop when **column 3** reaches the **luck-zone top** or state resets after progressive/bonus.`,
      how_to_check: `Read **ways counter** (left side), **per-column luck-zone height**, and **horseshoe / bonus** positions on cols **1–5**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Outer luck-zone columns can bottom out while you grind **column 3** ... that is normal, not a misread.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Hexbreak3r** (IGT) expands reel heights through the **luck zone**; **horseshoes** climb columns toward unlimited free games. Center **column 3** is the progressive driver.`,
    },
  },
  {
    machine: {
      slug: 'hold-n-gold-acorn-falls-hot-spell',
      name: 'Hold N Gold / Acorn Falls / Hot Spell',
      manufacturer: 'Incredible Technologies',
      type: 'Persistent Gold Scatters',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Ultra Rush Gold family; 2 gold scatters.',
      release_year: null,
    },
    guide: {
      title: 'Hold N Gold / Acorn Falls / Hot Spell',
      published: true,
      card_ev_threshold: '2 gold scatters · 1 gold (wheel or ≥15× prize)',
      when_to_play: `**Primary play:**

- **Two gold scatters** on the bet pad.
- **One gold scatter** if a **wheel symbol** is present OR credit value is **≥ 15× bet**.

Need **six total scatters** (gold, credits, wheels) to trigger hold-and-spin ... **gold locks three spins** and resets when new gold lands.`,
      when_to_stop: `Stop after the **hold-and-spin bonus** completes and the tray resets.`,
      how_to_check: `Read **scatter tray** on the bet pad. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Random **+3 spins** when a gold timer hits zero can extend a chase you thought was almost done.`,
      risk_bullets: [],
      skins_markdown: `**Hold N Gold**, **Acorn Falls**, **Hot Spell**.`,
      gameplay_mechanics: `**Hold N Gold / Acorn Falls / Hot Spell** (Incredible Technologies) stores **persistent scatters** per bet until **six** fill the tray and launch hold-and-spin.`,
    },
  },
  {
    machine: {
      slug: 'honey-bucks',
      name: 'Honey Bucks',
      manufacturer: 'IGT',
      type: 'Honeycomb Persistent Wilds',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Connected honeycomb wilds; quick hits.',
      release_year: null,
    },
    guide: {
      title: 'Honey Bucks',
      published: true,
      card_ev_threshold: '2 wilds R1–R3 connected · 3 anywhere · 4 in R1–R3',
      when_to_play: `**Primary play:**

- **Two active wilds** in **R1–R3**, horizontally connected or **one-gap** aligned.
- **Three connected active wilds** anywhere.
- **Four active wilds** in **R1–R3**.

**Skip cracked wilds** ... they expire next spin.

**Active** = empty honeycomb (**2 spins**) or yellow **WILD** label (**1 spin**).`,
      when_to_stop: `Stop after **persistent wilds expire** and bees stop extending the honeycomb.`,
      how_to_check: `Map **honeycomb wild positions** and lock state (**2-spin vs 1-spin vs cracked**). Cycle through all **bets/denoms**.`,
      risk_bankroll: `**15 units**`,
      risk_summary: `**Cracked** honeycomb slots look live but expire next spin ... do not count them as active wilds.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Honey Bucks** (IGT) leaves **honeycomb wild slots** that lock for **1–2 spins** when bees fill gaps. Jackpot symbols typically land **R1 / R3 / R5**.`,
    },
  },
]
