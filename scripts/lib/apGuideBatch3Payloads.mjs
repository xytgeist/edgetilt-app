/** Shared AP copy — Wolf Peak / Cat Peak / Fu Ren Wu (same delayed expanding-wild math). */
const WOLF_PEAK_FAMILY_GUIDE_CORE = {
  card_ev_threshold: 'Yellow wilds R1–3 active · R4 w/ 2×–3× · skip purple',
  when_to_play: `**Primary:** **yellow** sticky wilds active on **reels 1–3** (partial height OK ... chevron above/below means still expanding).

**Secondary:** active wild on **reel 4** with **2× or 3×** multiplier.

**Do not play purple wilds** ... they don't persist like the yellow ones.

**Skip reel 5** expanding wilds alone.

**Overlap edge case:** wilds already **4-high** but still show a yellow chevron ... **2 more spins** left.`,
  when_to_stop: `Stop when the yellow wild chain **finishes expanding and clears** (~**4 spins** per sticky wild).

Cash out after the chase window.`,
  how_to_check: `1. Insert **checker ticket**. Cycle through **all bets/denoms**.
2. Look for **yellow WILD** on yellow/orange background with a **chevron** arrow.
3. Chevron direction is expand direction, not final height ... all yellow wilds grow to **full 4-high** before they clear.
4. Reject **purple** wild variants.`,
  risk_bankroll: `**10 units** per walk-up chase.`,
  risk_summary: `Occasionally need a **checker ticket** (small balance, usually under $1) to cycle bets and read wild state.`,
  risk_bullets: [],
}

const WOLF_PEAK_WTF_NATIONWIDE = `### Nationwide

1. **Chinook Winds** (Lincoln City, OR) ... casino slot lineup lists **{progressive}**
2. **Pacific Northwest tribal** ... Medium ... KSG installs spreading
3. **California / Oklahoma tribal** ... Medium ... hit-or-miss by property
4. **Commercial Midwest / regional** ... Low-Medium ... newer KSG banks`

const WOLF_PEAK_GAMEPLAY_TAIL = `**Delayed expanding wilds:** yellow wild lands partial-height, locks, then adds one wild per spin until the reel is **4-high**, then clears next spin (~**4 spins** total).

**Multiplier wilds** on outer reels (**2× / 3×**) ... big spike potential when stacked with multiple active yellow wilds.

Also runs **free games** + **progressive jackpots** (skin/bank dependent).`

const WOLF_RUN_ECLIPSE_FAMILY_GUIDE_CORE = {
  card_ev_threshold: 'Mini **18+** · Minor **23+** · Major **31+** · combo **35+** · skip mega',
  when_to_play: `**Primary (per bet pad free-games count):**

| Tier | Play at |
| --- | --- |
| **Mini** (blue) | **18–22+** |
| **Minor** (purple) | **23–27+** |
| **Major** (orange) | **31–34+** |
| **Mini + Minor combo** | **35+** combined |

**Do not chase mega** (green) ... resets at **100** free games and is jackpot-grade variance.

Four **uncapped free-games meters** per bet. **Reel 4** bonus symbols tick the matching meter. **Not must-hit-by** ... a high count only means a bigger bonus **if** it hits.`,
  when_to_stop: `Stop once your tier's **free games** session finishes and that meter resets.`,
  how_to_check: `1. Cycle **all bets/denoms** ... each level has its **own** four meters.
2. Read **mini / minor / major / mega** counts on the **bet pad** (top screen mirrors the active bet).
3. Confirm which tier you are chasing before you coin in.`,
  risk_bankroll: `**500–1500 units** for mini/minor/major tier hunts.`,
  risk_summary: `Uncapped progressives can eat serious coin-in before the random trigger lands ... size the bankroll before you sit, then play through until it hits.`,
  risk_bullets: [],
}

const WOLF_RUN_WTF_VEGAS = `**In Las Vegas / physical casinos:**
Common on **Strip + locals** ... one of the most hunted IGT persistent FG families nationally.`

const WOLF_RUN_WTF_NATIONWIDE = `### Nationwide

1. **Spirit Mountain** (Grand Ronde, OR) ... casino slot lineup lists **Wolf Run Eclipse** + **Cats Wild Serengeti**
2. **Pacific Northwest tribal** ... Medium ... IGT PeakSlant49 banks
3. **Commercial / tribal nationally** ... Medium ... hit-or-miss by property`

const WOLF_RUN_GAMEPLAY_TAIL = `Four **progressive free-games meters** (**mini**, **minor**, **major**, **mega**) persist per bet. Matching **reel 4** bonus symbols add to that tier's count until a **2+3+4** trigger awards the accumulated free games.

**Not must-hit-by:** trigger timing is random.

**Free games awards:** **mini** = **1** full wild reel every spin · **minor** = **2** · **major / mega** = **3** stacked wild reels (**major/mega** stacks skew **right**).

**Resets after bonus:** **mini / minor / major** → **5** free games · **mega** → **100**.

Also runs **wheel bonus** and **grand jackpot** paths (config dependent).`

/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH3_PAYLOADS = [
  {
    machine: {
      slug: 'cash-wizard-magic-trio',
      name: 'Cash Wizard Magic Trio',
      manufacturer: 'Light & Wonder',
      type: 'Sticky Cash + Feature Timers',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: '2026 L&W sticky-cash; Boyd locals + early regional rollout.',
      release_year: 2026,
    },
    guide: {
      title: 'Cash Wizard Magic Trio',
      published: true,
      card_ev_threshold:
        'Any reel one-away + unit mins w/ spins remaining · Empty board: R1–4 clear',
      when_to_play: `**A) Filling reels (most common)**

- Any reel **one cash symbol from full**, with enough value on that column:

| Reel | Min sum of stuck cash |
| --- | --- |
| **R1 or R5** (4-high) | **> 7 units** |
| **R2 or R4** (6-high) | **> 10 units** |
| **R3** (8-high) | **> 20 units** |

- **OR** that reel holds a **jackpot feature symbol** (playable even below the cash sum).
- **Combo:** multiple one-away reels at once ... you can play **lower** cash sums than the table.
- **Sticky spins must remain** on the reel you are chasing (timer not expired). Full vs partial timer does **not** change whether the spot is +EV ... it only affects how many attempts you get before the column clears.

**B) Empty board (Cash Falls–style)**

- **R1–R4 completely empty** (no stuck cash). A lone sticky on **R5 only** is OK.
- Empty boards spike **line hits** and **free games** frequency (~**1 in 130** spins in field use).
- Cycle **every bet/denom** on the bank.`,
      when_to_stop: `**Fill hunt:** stop when your **target reel fills and pays**, or **sticky spins run out** and the column clears.

**Empty-board hunt:** stop **immediately** when a **cash value sticks on R1, R2, R3, or R4**. Move to the next empty bet level or machine.`,
      how_to_check: `1. Cycle **all bets/denoms**.
2. Check for **one-away reels**, **jackpot feature symbols**, and **empty boards**.
3. If one-away, **count units** on that reel against the table.
4. Verify **sticky spins remain**.`,
      risk_bankroll: `**10 units** (~10 spins max per chase). Usually far fewer.`,
      risk_summary: `Make sure **sticky spins remain** or you'll waste a unit.`,
      risk_bullets: [],
      where_to_find: `**Very new (2026)** ... **Boyd locals + independents first**, not Strip-wide yet.

**In Las Vegas / physical casinos:**
- **Cannery** (North Las Vegas) ... Boyd slot search (**1¢** video)
- **Suncoast** (Summerlin) ... Boyd slot search (new listing)
- **Aliante** (North Las Vegas) ... recent player reports
- **El Cortez** (Downtown Las Vegas) ... recent player reports
- **Likely Boyd siblings** (unconfirmed): **The Orleans**, **Sam's Town**

**Not widely reported yet.**

### Top cities / regions (outside Las Vegas)

1. **Louisiana / Boyd Gulf** — Medium — **Treasure Chest** (Kenner) ... Boyd slot search
2. **Delaware** — Medium — **Delaware Park** (Wilmington) ... recent player reports / new-floor installs
3. **Pacific Northwest tribal** — Medium — **Chinook Winds** (Lincoln City, OR) ... casino slot lineup
4. **Other Boyd regions** — Low-Medium — **IP Biloxi**, **Par-A-Dice**, **Blue Chip**, **Valley Forge** ... hit-or-miss by property
5. **Broader L&W commercial** — Low — still early rollout nationally`,
      skins_markdown: `**No separate skins.**`,
      gameplay_mechanics: `**Cash Wizard Magic Trio** (Light & Wonder, **2026**) uses a **4 / 6 / 8 / 6 / 4** reel grid.

**Sticky cash** locks in place with a **3-spin timer** under that reel. New cash on the same reel **resets** the timer to 3.

**Sticky feature symbols:** three **feature icon types** can also lock (including **jackpot feature** symbols) ... more feature action than vanilla **Cash Falls**.

**Reel cash-out:** fill **every position on one reel with cash** → collect the **sum** on that column → reel clears next spin.

**Timer expiration:** timer hits zero with no new cash on that reel → **all cash on that column removed**.

Base game runs **line pays** and **free games**.`,
    },
  },
  {
    machine: {
      slug: 'cashman-bingo',
      name: 'Cashman Bingo',
      manufacturer: 'Aristocrat',
      type: 'Persistent Bingo Board',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: '2021 Aristocrat bingo-board family; common Strip + tribal/commercial.',
      release_year: 2021,
    },
    guide: {
      title: 'Cashman Bingo',
      published: true,
      card_ev_threshold:
        'Loaded board + one-away lines · or prog on board · ~70× cased-line sum',
      when_to_play: `**Primary play:** finish a **loaded bingo board** ... high credit sums on the card and **multiple one-away lines** (one coin on the **5×5** matrix completes a bingo).

**Quick check:** play any board with **15+ coins**. Not precise, but a good heuristic for quick checking on busy nights.

- Prefer boards where **several different lines** could close on the next coin, not one thin line with junk values.
- **Jackpot on the board** (**2× maxi** / **major** / **grand** sitting in a square) ... play whenever that meter is in play on the card.
- **Value beats square count.** A nearly full board with weak totals is not the same as a hot **one-away** line with real money on it.
- **Rule-of-thumb filter:** add prizes on all **one-away** lines (count center **wheel** spot ~**8× bet** if it is in the line). Divide by bet size. Play when that ratio is roughly **> 70×** ... tune from field feel.
- **Major / grand** on the board ... play regardless of layout. **Maxi** ... usually needs more board juice unless it sits on a strong diagonal.`,
      when_to_stop: `Stop when you **hit bingo**, collect the line(s) + any **wheel** spin, then **cash out and move on**.`,
      how_to_check: `1. Cycle **every bet level** ... each denom has its **own** bingo board.
2. Read boards on the **bet pad preview**, **demo mode**, or tap each bet if the layout is hidden.
3. Look for **high totals**, **one-away lines**, and **jackpot symbols** on the card.
4. Sum **one-away line** prizes ÷ bet ... sanity-check against the **~70×** floor.`,
      risk_bankroll: `**100 units** on loaded one-away chases.`,
      risk_summary: `Coins **repeat on filled squares** ... a board one spot from bingo can still eat **many** spins before the finish lands.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- Common on **Strip** and **locals** ... most major properties
- **Mandalay Bay**, **The Orleans** ... recent player reports

### Top cities / regions (outside Las Vegas)

1. **Atlantic City** — Medium — **Resorts** ... casino slot lineup (**Hong Kong Jackpots** skin)
2. **Indiana / Midwest commercial** — Medium — **Bally's Evansville** ... field reports
3. **Northern California** — Medium — **Red Hawk** ... recent player reports
4. **Oklahoma / tribal** — Medium — hit-or-miss by property
5. **Other commercial / tribal** — Medium — hit-or-miss by property`,
      skins_markdown: `**Hong Kong Jackpots**, **Babylon Jackpots**.`,
      gameplay_mechanics: `**Cashman Bingo** (Aristocrat, **2021**) runs a **5×5** coin matrix below a **5×5** bingo board.

**Cash-on-reels:** coins with **credit values** or **progressive icons** land on the matrix and copy to the matching bingo square. Values **persist** until a line hits.

**Bingo win:** complete any **row, column, or diagonal** ... collect **all prizes** on that line.

**Center wheel:** the middle square is the **wheel** spot. A bingo through center awards a **wheel spin** for extra credits or a progressive tier.

**After bingo:** board **clears** ... Mr. Cashman drops **teaser progressive** spots on the fresh card.

Also includes **free games** (wild multipliers up to **10×**) and **Cashman Antics** random boosts on the board.`,
    },
  },
  {
    machine: {
      slug: 'cashman-double-bingo',
      name: 'Cashman Double Bingo',
      manufacturer: 'Aristocrat',
      type: 'Dual Persistent Bingo Boards',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: '2022 dual-board Cashman family; Sun & Moon most common on floor.',
      release_year: 2022,
    },
    guide: {
      title: 'Cashman Double Bingo',
      published: true,
      card_ev_threshold: 'Both boards 200× bet · each 3-away · maxi+ one-away',
      when_to_play: `**Primary play:** play when **any** of the following are true ...

- **Combined value:** total prize values on **both boards ≥ 200× bet**.
- **Dual 3-away:** **both** boards are each **three spaces from bingo**.
- **Maxi+ one-away:** any **maxi+** on a board that needs **one more space** to complete bingo.

**Major / grand** on the board ... play regardless of layout. **Maxi** ... needs board juice unless it sits on a strong line (same read as single-board **Cashman Bingo**).`,
      when_to_stop: `Stop when you **hit bingo** on the board you are chasing, collect any **Bingo Wheel** or **Super Wheel** payout, then **cash out and move on**.`,
      how_to_check: `1. Cycle **every bet level** ... each denom has its **own** Sun + Moon boards.
2. Read both boards on the **bet pad preview**, **demo mode**, or tap each bet if hidden.
3. Check **200× combined**, **dual 3-away**, and **maxi+ one-away** on either board.`,
      risk_bankroll: `**300 units** on loaded one-away chases.`,
      risk_summary: `Even one spot from bingo can eat **many** spins before the finish lands.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- Common on **Strip** and **locals** ... most major properties (same Aristocrat bingo footprint as **Cashman Bingo**)
- **Excalibur** ... recent player reports

### Top cities / regions (outside Las Vegas)

1. **Northern California** — Medium — **Thunder Valley** ... field reports (small bank of machines)
2. **Atlantic City / commercial** — Medium — hit-or-miss by property
3. **Oklahoma / tribal** — Medium — hit-or-miss by property
4. **Other commercial / tribal** — Medium — hit-or-miss by property`,
      skins_markdown: `**Sun & Moon.**`,
      gameplay_mechanics: `**Cashman Double Bingo** (Aristocrat, **2022**) runs **two** persistent bingo boards on the **Cashman** premium cabinet ... **Sun** (red) and **Moon** (blue).

**Matrix → boards:** bingo symbols on the **5×5** matrix copy to the matching board (**Sun-flagged** → red, **Moon-flagged** → blue). Prize values **persist** until a line hits.

**Bingo win:** complete any **row, column, or diagonal** on **either** board ... collect prizes on that line.

**Center wheel:** bingo through the **center** space on a board → **Bingo Wheel** spin for credits or jackpots.

**Super Wheel:** both boards complete a **center-space bingo on the same spin** → **Super Wheel** with multipliers on credits and jackpots.

Also includes **free games**, **Cashman Antics**, and the same persistent jackpot tiers (**mini** through **grand**) as the single-board family.`,
    },
  },
  {
    machine: {
      slug: 'wolf-peak-cat-peak-fu-ren-wu',
      name: 'Wolf Peak',
      manufacturer: 'King Show Games',
      type: 'Delayed Expanding Wilds',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'KSG expanding-wild family; common Vegas floors + tribal/commercial.',
      release_year: 2022,
    },
    guide: {
      title: 'Wolf Peak',
      published: true,
      ...WOLF_PEAK_FAMILY_GUIDE_CORE,
      where_to_find: `**In Las Vegas / physical casinos:**
Very widespread ... **nearly all Vegas casinos**.

${WOLF_PEAK_WTF_NATIONWIDE.replace('{progressive}', '**Wolf Peak Progressive**')}`,
      skins_markdown: `**Cat Peak**.`,
      gameplay_mechanics: `**Wolf Peak** (King Show Games, **~2022**) ... **5×4**, **40 lines**, **80-credit** bet structure.

${WOLF_PEAK_GAMEPLAY_TAIL}`,
    },
  },
  {
    machine: {
      slug: 'fu-ren-wu',
      name: 'Fu Ren Wu',
      manufacturer: 'King Show Games',
      type: 'Delayed Expanding Wilds',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary:
        'KSG expanding-wild family (Asian skin); common Vegas floors + tribal/commercial.',
      release_year: 2022,
    },
    guide: {
      title: 'Fu Ren Wu',
      published: true,
      ...WOLF_PEAK_FAMILY_GUIDE_CORE,
      where_to_find: `**In Las Vegas / physical casinos:**
Very widespread ... **nearly all Vegas casinos**.

${WOLF_PEAK_WTF_NATIONWIDE.replace('{progressive}', '**Fu Ren Wu Progressive**')}`,
      skins_markdown: `**Wolf Peak**, **Cat Peak**.`,
      gameplay_mechanics: `**Fu Ren Wu** (King Show Games, **~2022**) ... **5×4**, **40 lines**, **80-credit** bet structure.

${WOLF_PEAK_GAMEPLAY_TAIL}`,
    },
  },
  {
    machine: {
      slug: 'cats-wild-serengeti',
      name: 'Cats Wild Serengeti',
      manufacturer: 'IGT',
      type: 'Progressive Free Games Meters',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'High',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: '2024 IGT Wolf Run sister skin; top-tier AP footprint nationally.',
      release_year: 2024,
    },
    guide: {
      title: 'Cats Wild Serengeti',
      published: true,
      ...WOLF_RUN_ECLIPSE_FAMILY_GUIDE_CORE,
      where_to_find: `${WOLF_RUN_WTF_VEGAS}

${WOLF_RUN_WTF_NATIONWIDE}`,
      skins_markdown: `**Wolf Run Eclipse**.`,
      gameplay_mechanics: `**Cats Wild Serengeti** (IGT, **2024**) ... **5×3**, **30 / 40 / 80-credit** cost-to-cover on **PeakSlant49**. Sister skin to **Wolf Run Eclipse** ... same four-meter free-games math.

${WOLF_RUN_GAMEPLAY_TAIL}`,
    },
  },
  {
    machine: {
      slug: 'wolf-run-eclipse',
      name: 'Wolf Run Eclipse',
      manufacturer: 'IGT',
      type: 'Progressive Free Games Meters',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'High',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'IGT Wolf Run refresh; top-tier AP footprint nationally.',
      release_year: 2022,
    },
    guide: {
      title: 'Wolf Run Eclipse',
      published: true,
      ...WOLF_RUN_ECLIPSE_FAMILY_GUIDE_CORE,
      where_to_find: `${WOLF_RUN_WTF_VEGAS}

${WOLF_RUN_WTF_NATIONWIDE}`,
      skins_markdown: `**Cats Wild Serengeti**.`,
      gameplay_mechanics: `**Wolf Run Eclipse** (IGT, **~2022**) ... **5×3**, **30 / 40 / 80-credit** cost-to-cover on **PeakSlant49**. Stacked-wild **Wolf Run** family with four persistent free-games meters.

${WOLF_RUN_GAMEPLAY_TAIL}`,
    },
  },
  {
    machine: {
      slug: 'cherry-chance',
      name: 'Cherry Chance',
      manufacturer: 'Aruze',
      type: 'Abandoned Chance Feature',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'Legacy Aruze Innovator family; CA tribal footprint, rare Vegas.',
      release_year: 2012,
    },
    guide: {
      title: 'Cherry Chance',
      published: true,
      card_ev_threshold: 'Active **Chance** bar flashing · paid spins remaining',
      when_to_play: `**Walk-up only:** play when the **Chance feature is already active** ... **flashing Chance bar** above the reels with **paid spins left** in the up-to-**8** game window.

Someone triggered Chance and bailed (confused, broke, or hit nothing early). You are **not** hunting a base-game reel-3 trigger.

Bet is **locked** to whatever triggered Chance until the feature finishes.`,
      when_to_stop: `Stop when the **Chance feature ends** ... all paid spins complete, or a **grape** symbol kills it early.`,
      how_to_check: `1. Hunt for a **flashing Chance bar** (top-left on many cabinets).
2. On **Hot Seven** / **Royal Wild** the bar is **small and dim** ... look carefully.
3. Reject cabinets showing **Free Game Version** on the glass ... instant free games, not the AP path (**Jewel**, **Leopard**, **Zebra Seven**, **Sapphire Chance**).`,
      risk_bankroll: `**40 units** (8 paid spins max at the locked bet).`,
      risk_summary: `**Grape** ends the feature on one spin. Most edge is cheap walk-ups when ploppies abandon mid-Chance.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Rare ... occasional legacy **Aruze Innovator** banks, not a Strip staple.

### Nationwide

1. **Graton** (Rohnert Park, CA) ... field reports of **Royal Wild** installs
2. **Northern California tribal** ... Medium ... legacy Innovator cabinets
3. **Other California tribal** ... Medium ... hit-or-miss by property`,
      skins_markdown: `**Hot Seven**, **Royal Wild**, **Shining Seven**, **Brilliant Seven**, **Diamond Chance Hip Seven**.`,
      gameplay_mechanics: `**Cherry Chance** (Aruze **Innovator**, **~2012**) ... classic stepper-style **5-line** family.

**Chance trigger (base game):** **reel 3** Chance symbol starts the feature ... up to **8 paid spins** with improved top-symbol odds while the **Chance bar** flashes.

**During Chance:** bet **locks**. Cannot retrigger Chance inside the feature. **Grape** ends it immediately.

**Free Game Version** skins skip the abandoned-state edge ... Chance jumps straight into free games.`,
    },
  },
  {
    machine: {
      slug: 'clover-link-xtreme',
      name: 'Clover Link Xtreme',
      manufacturer: 'Apex',
      type: 'Double Clover Hold & Spin',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'Apex Xtreme double-clover family; FL tribal footprint, rare Vegas.',
      release_year: 2021,
    },
    guide: {
      title: 'Clover Link Xtreme',
      published: true,
      card_ev_threshold: '**5** double clovers (**NEXT CLOVER FEATURE X2**) · **4+** aggressive',
      when_to_play: `**Primary:** **5** double clovers in the meter ... glass reads **NEXT CLOVER FEATURE X2**. Next **hold & spin** pays **2×** on credits.

**Aggressive:** **4** double clovers ... sit and chase the **5th**, then play through the **2×** hold & spin.

Double clovers can land in **base game** or **during** hold & spin. If the **5th** hits mid-feature, **that** round doubles.`,
      when_to_stop: `Stop when the **2× hold & spin** finishes and the double-clover meter **resets**.`,
      how_to_check: `1. Cycle **every theme + denom** on the cabinet (meters are **per bet**).
2. Read the **double-clover meter** above **reel 1** (left side on most skins).
3. Confirm **Xtreme** double-clover UI ... plain **Clover Link** has **no** meter and is **not** playable.
4. Many machines have **multiple themes** to choose from ... **make sure to check each**.`,
      risk_bankroll: `**500 units**`,
      risk_summary: `Extreme hold & spin variance ... can print huge or pay almost nothing. **2×** does **not** apply to **major** or **grand** jackpots.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Rare ... occasional Apex/Novomatic banks, not Strip-heavy.

### Nationwide

1. **Seminole Classic** (Hollywood, FL) ... casino slot lineup lists **Red Hot Burning Clover Link Xtreme**
2. **Florida commercial / tribal** ... Medium ... Apex Clover Link family footprint
3. **Commercial / tribal nationally** ... Medium ... Novomatic/Apex rollout, often tucked on back banks`,
      skins_markdown: `**Xtreme** double-clover meter only ... not plain **Clover Link**. Theme names vary by install (**multi-theme** cabinet).`,
      gameplay_mechanics: `**Clover Link Xtreme** (Apex, **~2021**) ... link-style **hold & spin** with a persistent **double-clover meter** per bet above **reel 1**.

**5+** credit symbols trigger **Clover Link** hold & spin. Collect **5** double clovers → next feature **2×** credit wins. **Full grid** fill with **5** clovers banked → **4×** on the credit total.

**Jackpots in H&S:** **grand** needs **3** grand symbols · **mini / minor / major** need **1** each. **2×** multiplier does **not** boost **major** or **grand**.

Multi-game cabinets run **several themes × several denoms** on one bank.`,
    },
  },
  {
    machine: {
      slug: 'coin-catch',
      name: 'Coin Catch',
      manufacturer: 'Incredible Technologies',
      type: 'Locked Gold Frame Credits',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'IT gold-frame walk-up family; Midwest tribal footprint, rare Vegas.',
      release_year: 2020,
    },
    guide: {
      title: 'Coin Catch',
      published: true,
      card_ev_threshold: 'Locked **gold frames** + **blue gems** on bet pad',
      when_to_play: `**Walk-up:** play when **gold frames** are locked on one or more reels **and** **blue gems** on the **bet pad** show spins still remaining.

A coin landing inside a locked frame pays that coin's **credit prize** (jackpots can land in frames too).

**Do not** sit on gold frames with **no** blue gem for that reel ... the frame **drops next spin**.`,
      when_to_stop: `Stop when every locked frame finishes ... **no blue gems** left on the bet pad and the gold frames **clear**.`,
      how_to_check: `1. Read the **bet pad** ... **blue gems** = locked frame with spins left (fastest check on a walk-by).
2. Match **gold frames** on the reels to active gems.
3. **Reject** any gold frame missing its blue gem ... dead frame, disappears next spin.
4. Ignore coin piles and treasure chest animations ... **cosmetic**, not progress toward a feature.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Low volatility but you can whiff if no coins land in the frames. Locked frames **do not carry** into or out of **free spins**.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Rare ... occasional **IT** banks, not Strip-heavy.

### Nationwide

1. **Midwest / Oklahoma tribal** ... Medium ... **Incredible Technologies** footprint
2. **Commercial tribal nationally** ... Medium ... scattered IT installs, often back banks
3. **Kansas tribal** ... Medium ... **Coin Catch Cove** sequel footprint suggests original family lived here first`,
      skins_markdown: `**Coin Catch Cove** (separate guide ... IT sequel on **Prism Element**).`,
      gameplay_mechanics: `**Coin Catch** (**Incredible Technologies**) ... **5-reel** video slot built around persistent **gold frames** and **blue gem** counters on the **bet pad**.

**Blue gem** on a reel locks a **gold frame** around that reel for **3 spins**. **Coin** symbol in the frame pays the displayed **credit** (jackpots eligible). Another **blue gem** inside an active frame **resets** the counter to **3**.

**Free spins:** locked frames **reset** ... no carry-over in or out.

Decorative coin stacks / chests are **not** meters. Published RTP band **86.15%–94.15%** by config.`,
    },
  },
  {
    machine: {
      slug: 'coin-combo-hurricane-horse-perfect-peacock',
      name: 'Coin Combo: Hurricane Horse / Perfect Peacock',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Moving Wilds',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'LNW Coin Combo AP skins; common walk-up plays nationally.',
      release_year: 2022,
    },
    guide: {
      title: 'Coin Combo: Hurricane Horse / Perfect Peacock',
      published: true,
      card_ev_threshold: '**2×** reel 3 · **1×** R3 + **1×** R4 · **2×** each R4–5 (ignore top row)',
      when_to_play: `**Do not count top-row wilds** ... they scroll off next spin.

**Play when any of these walk-ups show on reels 3–5:**
1. **Two wilds on reel 3**
2. **One wild on reel 3 + one on reel 4**
3. **Two wilds on reel 4 and two on reel 5**

Persistent wilds **move up one row every spin** until they leave the window.

Many APs play any wild on reels 3–4 ... **tighter** thresholds above because base **line hits are weak** and most RTP feeds **bowls / jackpots / bonus**.

Higher denoms are fine if you're bankrolled ... upside can be huge for **1–2 spins** of coin-in.`,
      when_to_stop: `Stop when the **persistent wilds clear** reels **3–5** ... usually **1–2 spins** once you sit.`,
      how_to_check: `1. Count wilds on **reels 3–5 only** ... **ignore the top row**.
2. Cycle **every bet + denom** ... state is **per bet**; **5¢** often has extra bet levels others skip.
3. Confirm skin is **Hurricane Horse** or **Perfect Peacock** ... **not** **Carnival Cow**, **Marvelous Mouse**, or **Terrific Tiger** (no AP path).
4. Ignore **Fu-Pot / bowl fill level** ... presentation only per game rules.
5. **Reject** two wilds **only on reel 4** at a huge bet ... weak shape for the coin-in.`,
      risk_bankroll: `**50 units** at common bets (**100+** if you're hunting high-denom walk-ups)`,
      risk_summary: `Wilds show up often ... easy to talk yourself into **loose** plays that aren't +EV. Line hits are **thin**; bonus/jackpot bowls drive most of the math.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Common ... **South Point**, locals, scattered **LNW Coin Combo** banks (some Strip-adjacent).

### Nationwide

1. **Atlantic City** ... Medium-High ... **Golden Nugget** lists **Coin Combo Hurricane Horse**
2. **Pennsylvania / Midwest commercial** ... Medium-High ... **Parx**, **Rivers**, **Wind Creek**-style **LNW** footprint
3. **Florida tribal** ... Medium ... **Hard Rock**-style banks with **Coin Combo** themes`,
      skins_markdown: `**Hurricane Horse**, **Perfect Peacock** (AP skins).

**Carnival Cow**, **Marvelous Mouse**, **Terrific Tiger** ... same series, **not** playable for AP.`,
      gameplay_mechanics: `**Coin Combo** (**Light & Wonder**, **~2022–2023**) ... **243-way**, **5×3** on **Kascada**-style portrait banks.

**Base game:** persistent wilds land on **reels 3–5** and **climb one row per spin**. **Hurricane Horse** uses purple **Chinese-character** wilds; **Perfect Peacock** uses blue **WILD** peacocks (bonus can spread wilds to **reel 2**).

**Element coins** feed **green / blue / red bowls** for **free spins** (six variants) and **jackpot pick** ... bowl animation fill is **cosmetic**.

**RTP** ~**96%** on many configs.`,
    },
  },
  {
    machine: {
      slug: 'coin-kingdom-aztec-egyptian',
      name: 'Coin Kingdom: Aztec / Egyptian',
      manufacturer: 'Ainsworth',
      type: 'Dual Must Hit By',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'Ainsworth dual MHB family; East Coast + FL rollout, growing Vegas locals.',
      release_year: 2023,
    },
    guide: {
      title: 'Coin Kingdom: Aztec / Egyptian',
      published: true,
      card_ev_threshold: 'Grand ~**$9,919+** @ 88% RTP · Major ~**$968+** @ 88% RTP',
      when_to_play: `**Dual MHB:** **Grand** resets **$8,000** / hits by **$10,000** · **Major** resets **$800** / hits by **$1,000**.

**Major:** play at MHB calculator breakeven for your RTP (**~$968** @ **88%** config · **~$965** @ **90%**). For calculator base-game return, subtract **4%** from your RTP estimate.

**Grand:** play at breakeven for your RTP (**~$9,919** @ **88%** · **~$9,907** @ **90%**). Subtract **2%** from RTP for calculator base-game return. Factor **taxes** on a **$10k** hit before you sit.

**Advanced combo:** you can start **Grand** earlier when **Major** is high. Major runs **3.5×** the Grand accrual rate and usually pops **1–2×** during a Grand chase ... model that extra Major profit in your Grand entry.

**Hit behavior:** Major almost always runs to **$990** (or a few cents after). Grand field data points to **~$9,990**. Early Major hits are possible but rare.`,
      when_to_stop: `Stop when your **Major** or **Grand** objective hits.`,
      how_to_check: `1. Read **Grand** and **Major** meters on the shared ladder.
2. **Major display quirk:** can show **$3.00** when the true value is **$2.85**.
3. Need a card loss on Major? **Pull the spin before ~$990** ... it will almost always go there once playable.
4. Ignore the three **sliding discs** above the reels ... cosmetic, not feature progress.
5. Prefer **min bet on higher denom** when available ... **mini / minor** scale by denom, not bet size.
6. Use **~1700 spins/hour** in time math ... slower base game than most MHBs.
7. Cycle **every denom + bet** on multi-denom banks.`,
      risk_bankroll: `**500 units** for **Major**-focused sessions · **2000+ units** for **Grand** chase (tax-aware)`,
      risk_summary: `Base game is **extremely volatile** ... you can go deep fast, then recover on **100×–200×** bonus spikes.

**Min bet** smooths variance and avoids handpay waits. Max-bet MHB grinds can lose **thousands** on a bad run.

Jackpots pay only in **Mystery Match** (predetermined pick).`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Uncommon but growing ... **Palms**, **Aliante**, **South Point**, scattered locals (not Strip-wide yet).

### Nationwide

1. **Atlantic City** ... High ... **Borgata**, **Resorts**
2. **Pennsylvania** ... High ... **Parx**, **Rivers**
3. **Florida tribal** ... Medium-High ... **Seminole Hard Rock**, **Hollywood**
4. **Oklahoma tribal** ... Medium-High ... **Cherokee Nation**
5. **Mississippi Gulf Coast** ... Medium ... Biloxi installs`,
      skins_markdown: `**Coin Kingdom Aztec**, **Coin Kingdom Egyptian**.`,
      gameplay_mechanics: `**Coin Kingdom** (**Ainsworth**, **~2023**) ... **243-way** family with three sliding **feature discs** (**Royals Removed**, **Multiplier Wilds**, **Expanded Ways**).

Each feature starts **8 free games**; **2+ coin symbols** retrigger. Best pays stack **two or three** features at once. **Multiplier Wilds** is the wildest; **Royals Removed** is the steadiest.

**Mystery Match** (random after any spin) awards **Major / Grand** only ... picks are **predetermined**.

Wilds land on the **three middle reels** only. **Coin Kingdom** is the premium symbol (**2-of-a-kind** pays).`,
    },
  },
]
