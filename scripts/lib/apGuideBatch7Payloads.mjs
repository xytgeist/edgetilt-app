/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH7_PAYLOADS = [
  {
    machine: {
      slug: 'egyptian-stars',
      name: 'Egyptian Stars',
      manufacturer: 'IGT',
      type: 'Ascending Star Frames',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IGT CrystalCore cousin to Ocean Magic; frames pay credits/jackpots.',
      release_year: 2020,
    },
    guide: {
      title: 'Egyptian Stars',
      published: true,
      card_ev_threshold: '**2+** blue star frames · not top row',
      when_to_play: `**Primary play:** **two or more** blue **star-shaped frames** anywhere on the reels **except the top row** (top-row frames scroll off next spin).

Unlike Ocean Magic / DragonSphere, **R4–R5 frames are fine** ... frames award **credit prizes and jackpots**, not wilds, so horizontal position matters less.

Frames can land on **mini / minor / maxi** symbols or **Jackpot Chance** wheel scatters ... those are playable too when a frame will cover them next spin.`,
      when_to_stop: `Stop after frames pay their credits/jackpots and clear, or after the **Star Feature** hold-and-respin finishes.`,
      how_to_check: `1. Count **blue star frames** ... ignore anything sitting in the **top row**.
2. Note credit values and jackpot labels under upcoming frame paths.
3. Cycle **all bet levels** if the bank has multiple denoms.`,
      risk_bankroll: `**10–20 units** ... short frame chases; six-star hold-and-respin can whiff.`,
      risk_summary: `The floating star can dump **up to 15 frames** at once ... good when you are already +EV, noisy when you are not.

Base game is medium-volatility line hits; most AP value is frame + **Star Feature** timing.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Egyptian Stars** (IGT, **2020**) is a **5×3**, **243 ways** Egyptian title on CrystalCore/Peak cabinets. Blue **star frames** move **up one row every spin**. When a frame covers a **credit prize** or **jackpot label**, you collect it.

**Six+ stars** trigger a **Star Feature** hold-and-respin (each star locks **3 respins**). Regular line wins use standard Egyptian symbols; stars carry the persistent-state edge.`,
    },
  },
  {
    machine: {
      slug: 'electro-max',
      name: 'Electro Max',
      manufacturer: 'IGT',
      type: 'Pure Charge Vials',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IGT 5×4 Pure Charge vials; per-bet fill scout.',
      release_year: null,
    },
    guide: {
      title: 'Electro Max',
      published: true,
      card_ev_threshold: 'Vials **4–5/5** filled · or bonus **7+** sections',
      when_to_play: `**Primary play (base Pure Charge vials):** **two or more** vials on your bet level showing **4 or 5** filled sections (out of five).

**Secondary play (bonus meter):** **seven or more** filled sections on the bonus track when that game is live.

Each **bet level** owns its own vial set ... a hot **$0.75** level can be dead at **$1.50**.`,
      when_to_stop: `Stop after the **Pure Charge bonus** or triggered feature completes and vials reset.`,
      how_to_check: `1. Tap **every bet level** on the bank ... vials are **per bet**, not shared.
2. Read fill ticks on the **Pure Charge vials** (0–5 sections).
3. Check the separate **bonus section meter** when that side game is available.`,
      risk_bankroll: `**30–60 units** ... vial bonuses can run cold before they pop.`,
      risk_summary: `Scout cost is mostly **bet cycling** ... insert a **checker ticket** if your casino requires balance to flip bet keys.

Fully charged vials can still disappoint ... you are paying for **near-trigger** state, not a guaranteed spike.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Electro Max** (IGT) runs **5×4** reels with **30 lines**. The **Pure Charge** feature gives each bet level its own **chargeable vials** that tick up during base spins. Full vials can launch enhanced bonuses.

Denoms and bet ladders vary by property ... always read **your** bet pad before you commit.`,
    },
  },
  {
    machine: {
      slug: 'elephant-king',
      name: 'Elephant King',
      manufacturer: 'IGT',
      type: 'Prize Disk Shift',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'IGT safari Prize Disk; one- to two-spin hunts.',
      release_year: 2017,
    },
    guide: {
      title: 'Elephant King',
      published: true,
      card_ev_threshold: 'Free games · blue credit · or **50×+** green in **R2/R4**',
      when_to_play: `**Primary play (usually one spin):** **free games**, **blue credit prizes**, or **large green credits** (**≥ 50×** your bet) sitting above **reel 2 or reel 4**.

**Two-spin play:** the same qualifiers above **both reel 3 and reel 5** at once ... you get two elephant-symbol chances before the disk shifts away.

**Ignore** prizes above **reel 1** ... they scroll off next spin. Most small green credits are **not** worth a sit.`,
      when_to_stop: `Stop after the **free games bonus** ends or the **Prize Disk** prize pays (usually **1–2 spins**).`,
      how_to_check: `1. Read the **Prize Disk** row above the reels ... it shifts **left every spin**.
2. Elephant symbols only award on **reels 1, 3, and 5** (bordered reels) ... prizes must be over **R2/R4** (or R3/R5 for the two-spin line) **before** you spin.
3. Cycle **all bets** ... disk state is **per bet level**.`,
      risk_bankroll: `**5–10 units** ... most plays are a single spin; two-spin lines need **2×** that.`,
      risk_summary: `You will **lose most sessions** ... the special elephant symbol is rare. Edge is **small investment, occasional big free-games hit** (~**50–200×** in field experience).

Audio cues: soft stampede before smaller wins, loud roar before big ones ... handy when you are walking the bank.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Elephant King** (IGT) uses a **5×3**, **40-line** safari layout with stacked animals. A **Prize Disk** above the reels shows **credit prizes or free games**; it moves **one reel left** each spin.

When an **elephant symbol** lands on **reels 1, 3, or 5**, you win whatever sits above that reel. Payback is weighted toward **free games**, which is why disk positions over **R2/R4** matter most.`,
    },
  },
  {
    machine: {
      slug: 'epic-fortunes-blast-chance-power-peach',
      name: 'Epic Fortunes: Blast Chance / Power Peach',
      manufacturer: 'AGS',
      type: 'Descending Red-Border Coins',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Under-the-radar AGS dual-theme; coins only R2+R4.',
      release_year: null,
    },
    guide: {
      title: 'Epic Fortunes: Blast Chance / Power Peach',
      published: true,
      card_ev_threshold: '**2+** red-border coins · not bottom row',
      when_to_play: `**Primary play:** **two or more** **red-border persistent coins** on the reels.

**Do not count** coins on the **bottom row** ... they fall off next spin.

Persistent coins **only appear in reels 2 and 4** and move **down one row** every spin. **Six coins** trigger the hold-style bonus (Blast Chance and Power Peach use different bonus games, same coin math).

Some banks require a **coin-in tap** to reveal other denoms ... scout every bet level you can without bleeding EV.`,
      when_to_stop: `Stop after the **six-coin bonus** completes and persistent coins reset.`,
      how_to_check: `1. Scan **reels 2 and 4** for **red-border** coins only.
2. Ignore bottom-row coins and non-bordered coin spam.
3. Same cabinet often runs **Blast Chance** and **Power Peach** themes plus multiple denoms ... check each.`,
      risk_bankroll: `**20–40 units** ... bonus is volatile but can spike hard when coins stack.`,
      risk_summary: `Still **under-the-radar** on many floors ... good walk-by if you know the red-border tell.

**Rocket and Lock It / Directional Multiplier** looks similar but has **no persistent state** ... do not confuse the cabinet family.`,
      risk_bullets: [],
      skins_markdown: `**Blast Chance**, **Power Peach** ... same persistent coin hunt, different bonus presentation.`,
      gameplay_mechanics: `**Epic Fortunes: Blast Chance / Power Peach** (AGS) shares one persistent coin engine across two selectable themes. **Red-bordered coins** in **R2/R4** persist and descend each spin until six total coins trigger a bonus.

Standard coins without the red border are not the AP hook. Bonus volatility is real ... stack depth before trigger drives upside.`,
    },
  },
  {
    machine: {
      slug: 'extreme-wild-lanterns',
      name: 'Extreme Wild Lanterns',
      manufacturer: 'Sega Sammy',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '2024 True Dice wild-reel family; feast/famine lines.',
      release_year: 2024,
    },
    guide: {
      title: 'Extreme Wild Lanterns',
      published: true,
      card_ev_threshold: 'Active wild reels **R2–R3** · glowing border + coin counter',
      when_to_play: `**Primary play:** **active wild reels** on **reels 2 or 3** ... glowing reel border with **1–2 coins** above (shows wild spins left).

**Reel 4 edge:** active wild on **R4** with **two wild spins remaining** **and** at least **one coin** collected above **R2 or R3** ... take **one probe spin** to try for a second wild reel, then stop if it whiffs.

**Aggressive (long-run):** **one coin** collected above **both R2 and R3** ... slightly +EV on ~**92%** RTP configs in field data; feels losing short term. Skip on sub-**90%** PAR if you know it.

**Conservative:** **one coin** above **R2, R3, and R4** all at once.

Built-up **lanterns above the reels are fake** ... ignore them for AP.`,
      when_to_stop: `Stop when **no active wild reels** remain on **R2–R4** (or after the one-spin **R4** probe misses).`,
      how_to_check: `1. Look for **glowing wild reel borders** on **R2–R4**.
2. Read **coin holders** above the middle three reels ... **two coins** fills the holder and starts **two wild spins**.
3. Cycle **all denoms** ... holders are per bet.`,
      risk_bankroll: `**40–80 units** ... dead spins between fat line hits are normal.`,
      risk_summary: `Much **more volatile** than Golden Egypt-style coin holders. Premium **golden ingot** symbols pay from **two of a kind** ... stacks + wild reel can print.

**Dice wilds** (R1+R5) and random free games/jackpot picks are **random** ... no AP filter.`,
      risk_bullets: [],
      skins_markdown: `**Extreme Wild Stars** ... same math, rockets/Liberty premium instead of dragons/ingots. [Extreme Wild Stars](guide:extreme-wild-stars)`,
      gameplay_mechanics: `**Extreme Wild Lanterns** (Sega Sammy, **2024**) is a **4×5**, **50-line** Asian festival slot on Genesis Crest cabinets. **Coin symbols** (dragons here) fill holders above **R2–R4**; **two coins** makes that reel **fully wild for two spins**.

Dice symbols on **R1+R5** can spray random wilds (stacking wilds become **up to 3×** multipliers). Dual progressives and random bonuses exist but do not change the coin-holder hunt.`,
    },
  },
  {
    machine: {
      slug: 'extreme-wild-stars',
      name: 'Extreme Wild Stars',
      manufacturer: 'Sega Sammy',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Lanterns twin; rockets + Liberty premium.',
      release_year: 2024,
    },
    guide: {
      title: 'Extreme Wild Stars',
      published: true,
      card_ev_threshold: 'Active wild reels **R2–R3** · glowing border + coin counter',
      when_to_play: `**Primary play:** **active wild reels** on **reels 2 or 3** ... glowing reel border with **1–2 coins** above (wild spins remaining).

**Reel 4 edge:** wild on **R4** with **two spins left** plus **one coin** on **R2 or R3** ... **one probe spin**, then stop if you miss the second wild reel.

**Aggressive:** **one coin** above **both R2 and R3** (long-run +EV on ~**92%** RTP floors).

**Conservative:** **one coin** above **R2, R3, and R4**.

Decorative **rockets/stars above the reels are fake** ... only the **coin holders** matter.`,
      when_to_stop: `Stop when **no active wild reels** remain on **R2–R4** (or after the **R4** probe spin).`,
      how_to_check: `1. Scan **R2–R4** for **glowing wild borders** and coin counts above holders.
2. **Two coins** in a holder = **two wild spins** on that reel.
3. Cycle **every bet/denom** on the bank.`,
      risk_bankroll: `**40–80 units** ... high variance between dead spins and monster line hits.`,
      risk_summary: `Same feast/famine profile as **Extreme Wild Lanterns**. **Statue of Liberty** premium pays from **two of a kind**.

Random dice wilds, free games, and jackpot picks are not hunt filters.`,
      risk_bullets: [],
      skins_markdown: `**Extreme Wild Lanterns** ... same AP math, dragon/ingot art. [Extreme Wild Lanterns](guide:extreme-wild-lanterns)`,
      gameplay_mechanics: `**Extreme Wild Stars** (Sega Sammy, **2024**) shares the **Extreme Wild** coin-holder engine with Lanterns. **Rocket** coins fill holders above **R2–R4**; filled holders turn reels wild for **two spins**.

**4×5**, **50 lines**, True Dice wild features on **R1+R5**, dual progressives. Theme swap only ... hunt rules match Lanterns.`,
    },
  },
  {
    machine: {
      slug: 'fairy-hollow',
      name: 'Fairy Hollow',
      manufacturer: 'IGT',
      type: 'Sticky Bookend Wilds',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Sticky butterflies + End2End row fills.',
      release_year: null,
    },
    guide: {
      title: 'Fairy Hollow',
      published: true,
      card_ev_threshold: '**2+** sticky wilds · counter **2–3** (not **1**)',
      when_to_play: `**Primary play:** **two active butterfly wilds** anywhere on the grid. Each wild shows a **counter of 2 or 3** in the lower-right ... **counter 1** expires next spin, so ignore those.

**End2End Bookending Wilds:** wilds on the **same row or reel** connect and everything between turns wild. That is why **R4–R5** wilds can still be +EV even though line pays are left-heavy.

**Butterfly Wilds mode** (higher bet) doubles cost for more wild frequency ... same thresholds, you just pay more per wild.`,
      when_to_stop: `Stop after connected wilds fade (counters hit zero) and no **2+** active wilds remain.`,
      how_to_check: `1. Count **butterfly wilds** with counters **2 or 3**.
2. Look for **bookended pairs** on the same row/reel that will bridge on the next spin.
3. Compare **standard vs Butterfly Wilds** bet if the cabinet offers both.`,
      risk_bankroll: `**15–30 units** ... you want **4–5 of a kind**, not thin **3 of a kind** pays.`,
      risk_summary: `Three of a kind pays weak ... the play is bridging into **full-row wilds** or stacked connections.

Sticky wilds without a partner can still whiff until a second wild lands.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Fairy Hollow** features **sticky butterfly wilds** that persist **three spins** (counter ticks down each spin). The **End2End Bookending Wilds** feature links two wilds on the same **row or reel** and wilds everything between them.

Higher-bet **Butterfly Wilds** mode increases wild frequency at **2×** coin-in. Line pays favor **4–5 of a kind** when rows fill.`,
    },
  },
  {
    machine: {
      slug: 'farmville',
      name: 'Farmville',
      manufacturer: 'Aristocrat',
      type: 'Tri-Bar Accumulators',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Licensed Aristocrat tri-meter bars; tight thresholds.',
      release_year: 2020,
    },
    guide: {
      title: 'Farmville',
      published: true,
      card_ev_threshold: 'Yellow **20+** · or paired bar combos (see below)',
      when_to_play: `**Primary play:**

- **Yellow bar 20+** on your bet level.

**Secondary lines:**

- **Green (3×) bar 45+** and/or **Blue (4×) bar 87+** ... but **only when the other two bars are reset** on that bet.
- **Yellow and Green both 40+** together.

Each colored bar is its own accumulator ... read all three before you coin in.`,
      when_to_stop: `Stop after the triggered **Farmville feature** (bar bonus / free games) completes and meters reset.`,
      how_to_check: `1. Open **each bet level** ... yellow/green/blue bars are **per bet**.
2. Note exact bar fill numbers on the HUD.
3. Confirm which **3× / 4×** multipliers attach to green vs blue on your skin.`,
      risk_bankroll: `**50–100 units** ... bar bonuses can grind before they pay.`,
      risk_summary: `Thresholds are tight ... half-filled bars look tempting but are usually -EV.

Licensed IP cabinets rotate often ... do not assume every Aristocrat bank is Farmville.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Farmville** (Aristocrat, **2020**) is a licensed **5-reel** slot with **three persistent color bars** (yellow/green/blue) that climb toward feature triggers. Bars are **bet-specific** and can interact ... green/blue high-threshold plays often require the other meters to be empty.

Features include pick bonuses and free-game style events tied to bar completion (exact presentation varies by config).`,
    },
  },
  {
    machine: {
      slug: 'farmville-golden-harvest',
      name: 'Farmville Golden Harvest',
      manufacturer: 'Aristocrat',
      type: 'Dual-Bar Accumulators',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Farmville sequel; simpler yellow 2× bar hunt.',
      release_year: 2019,
    },
    guide: {
      title: 'Farmville Golden Harvest',
      published: true,
      card_ev_threshold: 'Yellow bar **25+** on **2×** bet',
      when_to_play: `**Primary play:** **yellow bar 25+** on the **2× bet** level (field shorthand: **2× yellow 25+**).

Other bet keys use their own meters ... always scout the **2×** button specifically when that is the posted line.`,
      when_to_stop: `Stop after the **Golden Harvest feature** (Mighty Cash / egg / free-games event) finishes and the yellow meter resets.`,
      how_to_check: `1. Tap the **2× bet** (and cycle others if your casino maps differently).
2. Read the **yellow accumulator** count on the meter.
3. Confirm you are on **Golden Harvest**, not base **Farmville** ... bar math differs.`,
      risk_bankroll: `**40–80 units** ... Mighty Cash-style bonuses can run cold.`,
      risk_summary: `Simpler than base **Farmville** tri-bar math, but the **2× bet** requirement trips people who scout at 1×.

Egg-cracking and Mighty Cash layers add variance on top of the yellow meter.`,
      risk_bullets: [],
      skins_markdown: `Separate sequel from base **Farmville** ... different bar thresholds and features.`,
      gameplay_mechanics: `**Farmville Golden Harvest** (Aristocrat, **2019**) brings the social-farming brand to a **5-reel** slot with **Mighty Cash**-style hold features, free games, and egg-pick bonuses. The AP hook is the **yellow progress bar** on the **2×** bet ladder hitting **25+** before trigger.

Farm-themed symbols and interactive bonus picks are cosmetic noise for the meter chase.`,
    },
  },
  {
    machine: {
      slug: 'fat-fortunes-fat-cat-puffy-penguin-jelly-jams',
      name: 'Fat Fortunes: Fat Cat / Puffy Penguin / Jelly Jams',
      manufacturer: 'Light & Wonder',
      type: 'Descending Shiny Fish',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Under-the-radar L&W fish; gleam = persistent.',
      release_year: 2021,
    },
    guide: {
      title: 'Fat Fortunes: Fat Cat / Puffy Penguin / Jelly Jams',
      published: true,
      card_ev_threshold: '**2** fish above reels · or **3+** shiny persistent next spin',
      when_to_play: `**Primary play:**

- **Two fish above the reels** ... must be **two different columns** (max one fish above any reel).
- **Any setup where three persistent (shiny) fish** will be in play next spin.

**Persistent tell:** wait a few seconds ... persistent fish **gleam/shine**. Non-persistent fish on the **bottom row** or without the shine **do not count**.

**Orange prize/jackpot fish** can be persistent too ... same shine rule.

You still need **two fish to land on the reels** during the chase ... all six cannot drop from above (unlike Kraken Unleashed). Max **four persistent** on screen, max **two** queued above.`,
      when_to_stop: `Stop after the **six-fish bonus** completes and persistent fish clear.`,
      how_to_check: `1. Look **above the reel window** for queued fish (one per column max).
2. Watch for the **gleam animation** to separate persistent vs dead fish.
3. Cycle **all denoms** ... stacks above the reels are strong tells.
4. **Jelly Jams** uses strawberries ... same shiny persistent rule.`,
      risk_bankroll: `**25–50 units** ... bonus can handpay but also whiffs at 21×.`,
      risk_summary: `Genuinely **under-the-radar** ... hustle quietly so degens do not camp the bank without knowing the shine tell.

**Cat/penguin wild face** doubles wins (**2×**) ... line hits during chases can spike.

Bonus volatility is real ... budget for dead six-fish attempts.`,
      risk_bullets: [],
      skins_markdown: `**Fat Cat**, **Puffy Penguin**, **Jelly Jams** (strawberry symbols).`,
      gameplay_mechanics: `**Fat Fortunes** (Light & Wonder, **2021**) triggers a hold-style bonus when **six fish** (or theme equivalent) land. Fish appearing **above** the reels are **persistent** and step down each spin; fish landing **on** the reels without the shine vanish next spin.

Orange fish can carry **credit prizes or jackpots** toward the count of six. Wild mascot symbols apply **2×** to wins. Multiple denoms per bank ... scout each.`,
    },
  },
]
