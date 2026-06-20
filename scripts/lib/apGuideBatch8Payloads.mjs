/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH8_PAYLOADS = [
  {
    machine: {
      slug: 'firecano-freeze-firecano-glory',
      name: 'Firecano Freeze / Firecano Glory',
      manufacturer: 'Aristocrat',
      type: 'Ascending Persistent Wilds',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Ocean Magic cousin; wilds rise, tighter filter.',
      release_year: null,
    },
    guide: {
      title: 'Firecano Freeze / Firecano Glory',
      published: true,
      card_ev_threshold: 'Wilds **R2–R3** · or **R1+R4** pair · not top row',
      when_to_play: `**Primary play:**

- **Any wilds in reels 2 and 3.**
- **One wild in both reels 1 and 4** at the same time.

**Also count** wilds **below the bottom row** ... they step up into play next spin. **Ignore top-row wilds** (gone next spin).

**Tighter than Ocean Magic:** wilds show more often, so do not sit marginal setups.

**Frenzy:** screen rumble then **5–10** wilds can spray in ... up to **three** wilds can drop on a normal spin, including below the window.`,
      when_to_stop: `Stop after wild expansion plays finish and no qualifying persistent wilds remain.`,
      how_to_check: `1. Scan **R1–R4** for persistent wilds ... skip **top row**.
2. Check **below the reel window** for wilds queued to rise.
3. Cycle **all denoms** ... multiple bet keys per bank.`,
      risk_bankroll: `**15–30 units** ... Frenzy can whiff; free games are volatile when they hit.`,
      risk_summary: `Wilds on **R2–R3** beat **R1** for expansion value when wild-on-wild hits.

Free games retrigger often (**30+** spins happens) ... feast or famine.`,
      risk_bullets: [],
      skins_markdown: `**Firecano Freeze**, **Firecano Glory**.`,
      gameplay_mechanics: `**Firecano** (Aristocrat) uses **persistent wilds** that move **up one row** each spin. Wilds can **shoot down** onto the reels; wild-on-wild turns **adjacent symbols wild**.

Companion skins share the same hunt. Free games bonus is high-variance when it lands.`,
    },
  },
  {
    machine: {
      slug: 'firelight-eruption',
      name: 'Firelight Eruption',
      manufacturer: 'Aristocrat',
      type: 'Meter Chase (Non-MHB)',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '99-cap meters; field skeptical on true +EV.',
      release_year: 2023,
    },
    guide: {
      title: 'Firelight Eruption',
      published: true,
      card_ev_threshold: 'Blue/green meters **~99** (cap, not must-hit)',
      when_to_play: `**Field read:** play when **blue or green** progress meters are **close to 99** (display cap).

**Honest take:** this is **not** a must-hit-by ... meters can sit at **99** and still not pay for a long time. Many APs do **not** consider this a reliable edge game even at high counts. Treat as **experienced / large bankroll only** if you take it at all.`,
      when_to_stop: `Stop after the **meter feature** you chased resolves, or when the cap breaks without a payout you were hunting.`,
      how_to_check: `1. Read **blue and green** meter values on the glass (cap **99**).
2. Confirm which meter actually drives the bonus you think you are chasing.
3. Cycle **bet levels** if meters are per-denom.`,
      risk_bankroll: `**100 units** minimum if you play ... cap-chase grinds can run much longer.`,
      risk_summary: `High volatility, **no guaranteed hit at 99**. Do not confuse "near cap" with +EV unless you have floor-specific data.

Most walk-by checks should **pass** unless you know your casino's PAR band.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Firelight Eruption** (Aristocrat, **2023**) runs dual **progress meters** (blue/green) that cap at **99** but are **not** must-hit-by progressives. Features trigger from meter events tied to the volcano theme.

Mechanics are readable on the glass ... the AP debate is whether high meter values ever clear costs.`,
    },
  },
  {
    machine: {
      slug: 'fortune-disc',
      name: 'Fortune Disc',
      manufacturer: 'IGT',
      type: 'Disc Ring Meter',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IGT Disc family; ring count scout.',
      release_year: null,
    },
    guide: {
      title: 'Fortune Disc',
      published: true,
      card_ev_threshold: '**5 rings** on meter · **4** @ **$0.75** bet',
      when_to_play: `**Primary play:** **five rings** collected on the disc meter.

**At $0.75 bet:** **four rings** can be enough (field shortcut for that denom).

Feature spins the center disc, picks a symbol, and turns **all instances wild** for that evaluation ... same family idea as Solar/Lunar Disc.`,
      when_to_stop: `Stop after the **disc feature** completes and the ring meter resets.`,
      how_to_check: `1. Read the **ring / disc meter** count on the cabinet.
2. Note **bet level** ... the **4-ring** line is tied to **$0.75** on many installs.
3. Cycle **all denoms** on the bank.`,
      risk_bankroll: `**10–20 units** ... one spin from trigger can still brick.`,
      risk_summary: `Clean scout ... ring count is obvious. Variance lives in which symbol the disc selects.

Free games layer exists on many configs ... disc feature during free spins is where spikes come from.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Fortune Disc** (IGT) collects **disc symbols** into a visible meter (**six** triggers the standard feature on many configs; AP plays posted above use **5 rings** / **4 @ $0.75**).

Center disc picks one symbol type and converts matching symbols **wild**. Related to **Solar Disc** / **Lunar Disc** mechanics.`,
    },
  },
  {
    machine: {
      slug: 'fortune-finders-mermaid-s-pearl-hidden-riches',
      name: "Fortune Finders: Mermaid's Pearl / Hidden Riches",
      manufacturer: 'Gaming Arts',
      type: 'Descending Persistent Scatters',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Gaming Arts pearl/crystal scatters; menu bet cycle.',
      release_year: null,
    },
    guide: {
      title: "Fortune Finders: Mermaid's Pearl / Hidden Riches",
      published: true,
      card_ev_threshold: '**2** persistent scatters · not bottom row',
      when_to_play: `**Primary play:** **two scatter symbols** anywhere **except the bottom row**.

**Mermaid's Pearl:** white **pearls**. **Hidden Riches:** red **crystals**.

**Three scatters** trigger free games ... persistent scatters move **down one row** every spin.`,
      when_to_stop: `Stop after the **free games bonus** finishes and scatters reset.`,
      how_to_check: `1. Count **persistent scatters** ... ignore **bottom row**.
2. On Gaming Arts cabinets, open the **menu (lower left)** and use **up/down arrows** to cycle bet levels **without coin-in** when the UI allows.
3. Otherwise cycle bets normally and check **every denom**.`,
      risk_bankroll: `**15–30 units** ... two-from-trigger can still miss.`,
      risk_summary: `Same persistent-scatter math across both themes on the cabinet.

Bet cycling via menu saves checker tickets on friendly installs.`,
      risk_bullets: [],
      skins_markdown: `**Mermaid's Pearl**, **Hidden Riches**.`,
      gameplay_mechanics: `**Fortune Finders** (Gaming Arts) shares one engine across **Mermaid's Pearl** and **Hidden Riches**. Bonus scatters persist and **descend each spin** until **three** land the free games feature.

Multiple denominations are common ... scout each bet pad.`,
    },
  },
  {
    machine: {
      slug: 'fortune-garden-fu-blossom',
      name: 'Fortune Garden / Fu Blossom',
      manufacturer: 'Incredible Technologies',
      type: 'Flower Credit Accumulators',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Triple-flower credits + cookie mode; spread equity.',
      release_year: null,
    },
    guide: {
      title: 'Fortune Garden / Fu Blossom',
      published: true,
      card_ev_threshold: '**60×** total on 3 flowers · or **cookie mode**',
      when_to_play: `**Primary play:**

- Combined credit value on **all three flowers (R2–R4)** totals **60×** your bet or more.
- **Any time cookie mode is active** (multiplier above flowers + fortune cookie on the bet pad). **Abandoned cookie mode** is always worth a look even on weak flower values.

**Cookie mode / fortune spins:** starts **2×** on all wins ... random picks can extend to **3×–5×**.

**Do not** chase one giant flower alone ... spread equity across **R2–R4** cuts variance hard.`,
      when_to_stop: `Stop after **gold-triggered flower pays** clear and cookie mode ends (if you were playing cookie).`,
      how_to_check: `1. Read **credit totals** on flowers above **R2, R3, R4**.
2. Watch **pearl counters** (8→0) ... landing pearl symbols refill credits and reset to **8**.
3. Check bet pad for **cookie / fortune spins** indicator.
4. Cycle **every bet level**.`,
      risk_bankroll: `**50–100 units** ... single-flower chases can drain; cookie mode still costs full spins.`,
      risk_summary: `Flowers get **harder to trigger** as values climb ... the game fights back.

RTP spans **85%–97%** by config. **Fu Blossom** calls cookie mode **fortune spins** ... same rules.

Skins (**Gold/Pearl**, **Blessings/Prosperity**) play the same for AP.`,
      risk_bullets: [],
      skins_markdown: `**Fortune Garden** (Gold, Pearl), **Fu Blossom** (Blessings, Prosperity).`,
      gameplay_mechanics: `**Fortune Garden / Fu Blossom** (Incredible Technologies) stacks **credit values** on three flowers above the middle reels. Each flower has an **8-pearl counter** ticking down every spin; pearl symbols on the reel below add credits and reset the counter.

**Gold symbols** under a flower pay its bank. **Cookie mode** multiplies line hits and flower triggers.`,
    },
  },
  {
    machine: {
      slug: 'fortune-lanterns',
      name: 'Fortune Lanterns',
      manufacturer: 'IGT',
      type: 'Lantern Pick Accumulators',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IGT lantern picks; value 35× bonus lanterns.',
      release_year: null,
    },
    guide: {
      title: 'Fortune Lanterns',
      published: true,
      card_ev_threshold: '**3** lanterns **100×+** on a reel · multi-reel combos',
      when_to_play: `**Value bonus lanterns at ~35× bet** when doing math (some APs use **50×** aggressive).

**Primary lines:**

- **3 lanterns** on one reel totaling **≥ 100×** bet.
- **2 reels** with **3 lanterns** each (**6** total) **≥ 100×** combined.
- **3 / 4 / 5 reels** with **3 lanterns** each at **≥ 100×** (escalating combos).
- **5 reels** each with **3 lanterns** ... play **regardless of values**.
- **2 lanterns** on one reel **≥ 185×** combined.

**Skip** solo lanterns unless it is a **Grand** ... ~**180 spins** to fill three more then **1-in-4** pick.

**Color read:** blue weak, purple average, green/yellow good, red best ... spread colors beats stacked red/blue variance.`,
      when_to_stop: `Stop after the **four-lantern pick** resolves and lanterns reset on the reels you played.`,
      how_to_check: `1. Sum **lantern credit values** above each reel (bonus lanterns ≈ **35×** in your head).
2. Count lanterns per reel toward the **3-lantern pick** trigger.
3. Cycle **all bet levels**.`,
      risk_bankroll: `**40–80 units** ... pick feature is true odds but setup grind is real.`,
      risk_summary: `Pick is **fair** (not rigged) ... variance comes from chasing the wrong reel alone.

Lanterns landing on reels turn **wild**. Only **one Grand** can sit above a reel.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Fortune Lanterns** (IGT) collects **prize lanterns** above **five reels**. **Four lanterns** on a reel triggers a **pick-one-of-four** bonus (true random pick).

Minor ≈ **20×**, Major ≈ **100×** at common configs. Lantern symbols on reels become **wilds** when they land.`,
    },
  },
  {
    machine: {
      slug: 'fortune-magnet',
      name: 'Fortune Magnet',
      manufacturer: 'IGT',
      type: 'Persistent Magnet Prizes',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IGT 2023 magnet persistence; blink = dying coins.',
      release_year: 2023,
    },
    guide: {
      title: 'Fortune Magnet',
      published: true,
      card_ev_threshold: 'Minor+ coin · all free-spin coins · RTP color totals',
      when_to_play: `**Primary play:**

- **Any coin showing Minor jackpot or higher.**
- **All visible coins are free-spin prizes** (when that layout is +EV on your RTP).

**RTP-dependent totals (verify PAR on your floor):**

- **One color** of coins totaling about **15–20×** bet.
- **Both colors** totaling about **25–30×** bet.

**Blinking coins** die in **1–2 spins** ... do not count fading magnets as persistent.`,
      when_to_stop: `Stop after magnet drops pay and stored prizes clear on your bet level.`,
      how_to_check: `1. Read **red/blue magnet zones** and stored prize amounts per bet.
2. Watch for **blink animation** ... those prizes are expiring.
3. Cycle **every bet level** ... persistence is **per bet**.`,
      risk_bankroll: `**30–60 units** ... magnet grinds can eat balance before the drop.`,
      risk_summary: `True persistence tied to bet level ... walking away with a loaded magnet hurts.

Skins like **Blue Lotus** and **Golden Gathering** share the magnet engine.`,
      risk_bullets: [],
      skins_markdown: `**Fortune Magnet Blue Lotus**, **Golden Gathering**, and related IGT magnet themes.`,
      gameplay_mechanics: `**Fortune Magnet** (IGT, **2023**) stores **credit prizes** in magnet zones above the reels. Magnets can **pull down** accumulated values on qualifying hits; stored prizes persist for a limited time per bet level.

Dual-color magnet layouts drive the one-color vs both-colors AP thresholds.`,
    },
  },
  {
    machine: {
      slug: 'fortune-owl',
      name: 'Fortune Owl',
      manufacturer: 'Aristocrat',
      type: 'Free Games Meter Chase',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'R4 FG meters; random hit, large bankroll game.',
      release_year: null,
    },
    guide: {
      title: 'Fortune Owl',
      published: true,
      card_ev_threshold: 'Mini **24+** · Minor **32+** · Major **52+**',
      when_to_play: `**Primary play (free games counters on reel 4):**

- **Mini (blue meter): 24+**
- **Minor (purple meter): 32+**
- **Major (orange meter): 52+**

**Not must-hit-by** ... meters climb when matching symbols land in **reel 4**, but the actual free games hit is **random**. Only sit if you accept long dry spells.

Some field sheets post lower floors (**16 / 30 / 50**) ... treat those as aggressive / coin-in grinds, not clean edge.`,
      when_to_stop: `Stop after the **free games set** you chased finishes and meters reset.`,
      how_to_check: `1. Read **mini / minor / major** free games meters beside **reel 4**.
2. Confirm which meter you are hunting before you coin in.
3. Cycle **all bet levels**.`,
      risk_bankroll: `**200 units** ... large-bankroll game; meters can stall at high counts.`,
      risk_summary: `Feast or famine ... meters can sit high forever. Do not confuse a big number with a guaranteed imminent hit.

Comparable volatility to other **Aristocrat meter-chase** titles.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Fortune Owl** tracks **three free games meters** (mini/minor/major). **Reel 4** symbol hits advance the matching meter, but triggers are **random**, not must-hit-by.

High session variance ... edge is in knowing when counts justify the grind.`,
    },
  },
  {
    machine: {
      slug: 'fortune-rooster',
      name: 'Fortune Rooster',
      manufacturer: 'Aristocrat',
      type: 'Wild Queue Above Reels',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '8-wild queue drops; need 2 wild reels.',
      release_year: null,
    },
    guide: {
      title: 'Fortune Rooster',
      published: true,
      card_ev_threshold: '**6+** wilds above **2 of R1–R3** · active glowing wilds',
      when_to_play: `**Primary play:**

- **Two of the first three reels** each have **≥ 6 wilds** queued above.
- **Three of the first four reels** each have **≥ 5 wilds** above.
- **Active wild reels in R1–R3** ... **four glowing, tilting wilds** above a reel means that column goes wild next spin (walk-up friendly).

**Eight wilds** above a reel drops **4 wilds** now and **4** next spin ... **one wild reel alone is not enough**; you want **two wild reels** overlapping.`,
      when_to_stop: `Stop after queued wilds finish dropping and no **two-reel wild** setup remains.`,
      how_to_check: `1. Count **wilds above each reel** ... active reels show **glowing white tilting** wilds.
2. Map which reels go wild **this spin vs next spin**.
3. Cycle **all bet levels**.`,
      risk_bankroll: `**40–80 units** ... lots of small losses between big line hits.`,
      risk_summary: `Highly volatile ... **seven wilds on one reel** is still **not** a sit if no second reel is close.

**Firecracker** symbols add **1–8** wilds above a reel. **Golden rooster** on the middle reel can dump wilds on **two random reels**.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Fortune Rooster** (Aristocrat) queues **wild symbols above each reel**. At **8 wilds**, half drop immediately to wild the reel, then the rest drop on the **next spin** for a second wild reel.

The AP angle is overlapping **two wild reels**, not a single-column chase.`,
    },
  },
]
