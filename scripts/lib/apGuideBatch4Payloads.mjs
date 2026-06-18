import {
  wtf,
  WTF_VEGAS_ARISTOCRAT_BUFFALO,
  WTF_VEGAS_LNW_COMMON,
  WTF_REGIONS_ARISTOCRAT_HEAVY,
  WTF_REGIONS_LNW_HEAVY,
} from './apGuideBatchWtf.mjs'

/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH4_PAYLOADS = [
  {
    machine: {
      slug: 'colossal-titans',
      name: 'Colossal Titans',
      manufacturer: 'IGT',
      type: 'Symbol Multiplier Meters',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'IGT lightning-meter line family; Lucky Buddha cousin.',
      release_year: null,
    },
    guide: {
      title: 'Colossal Titans',
      published: true,
      card_ev_threshold: 'Active mult sum **12×+** · ~75% full meters OK loose',
      when_to_play: `**Primary play:** sum **active** symbol multipliers above the reels to **12× or more**. Only count meters with **one or more spins remaining**.

**Looser edge:** if several meters sit **~75% full**, you can play slightly under **12×** ... those usually activate soon after the lightning bolt charges them.

**Do not** sit on thin active multipliers alone. Lightning lands often, so one or two active **3×** symbols is a trap.

Left-to-right multiplier caps when a meter fills: symbol **1** = **6×**, **2** = **5×**, **3** = **4×**, symbols **4–8** = **3×** each.`,
      when_to_stop: `Stop when your **active multiplier windows expire** (each filled meter runs **9 spins**, resetting to **9** if that symbol hits on a paying line).`,
      how_to_check: `1. Cycle **all bets/denoms** ... each level has its **own** eight meters.
2. Sum **only active** multipliers (spins remaining > 0).
3. Eye **~75% full** empty meters as near-term upside.
4. Confirm **reel 3** lightning sub-symbol is charging meters (not blocking line hits).`,
      risk_bankroll: `**300 units** ... feast-or-famine line-hit family like **Lucky Buddha** / **Lucky Wealth Cat**.`,
      risk_summary: `You will lose most sessions. Edge comes from occasional **fat line hits** with stacked active multipliers covering the grind.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- **Strip** and **locals** ... IGT video banks, hit-or-miss by property
- Not as common as older IGT meter cousins

**Not widely reported yet** on many properties ... still an early-rollout hunt title for some markets.

### Nationwide

1. **Commercial Midwest / regional** ... Medium ... IGT video footprint
2. **Oklahoma tribal** ... Medium ... hit-or-miss by property
3. **California tribal** ... Low-Medium ... hit-or-miss by property
4. **Atlantic City** ... Low-Medium ... hit-or-miss by property
5. **Florida tribal** ... Low ... hit-or-miss by property`,
      skins_markdown: `**No separate skins.**`,
      gameplay_mechanics: `**Colossal Titans** (IGT) runs **eight symbol meters** above the reels matching the eight reel symbols.

**Lightning bolt** on **reel 3** (sub-symbol, not a line blocker) randomly charges one or more meters. A **full meter** activates that symbol's multiplier on **all winning line hits** involving that symbol for the **next 9 spins**.

**Wheel bonus** can award **progressive jackpots**. Base game also runs **free spins** (infrequent trigger, usually pays well when it hits).`,
    },
  },
  {
    machine: {
      slug: 'congo-cash',
      name: 'Congo Cash',
      manufacturer: 'Sega Sammy-KGM',
      type: 'Multi-Game Persistent Columns',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '2022 KGM four-in-one persistent column family.',
      release_year: 2022,
    },
    guide: {
      title: 'Congo Cash',
      published: true,
      card_ev_threshold: 'Per-game column thresholds · read game # on glass',
      when_to_play: `**Four games on one cabinet** ... confirm which **game #** you are on before you coin in.

| Game | Play when |
| --- | --- |
| **Game 1** | **20+ free spins** above **columns 2 and 3** |
| **Game 2** | **70×+ cash values** above **columns 2 and 3** |
| **Game 3** | **50+ free spins** in **column 4** |
| **Game 4** | **100×+ cash values** in **column 4** |

Each game uses different persistent columns ... do not mix the rules across skins.`,
      when_to_stop: `Stop after the **free-games session** or **column feature** you entered resolves and meters reset.`,
      how_to_check: `1. Read **game number** on the glass / attract screen.
2. Cycle **every bet/denom** ... each level has its **own** column meters.
3. Match the column layout to the **Game 1–4** table above.
4. Insert **checker ticket** when the bet pad hides column values behind coin-in.`,
      risk_bankroll: `**300–500 units** ... column grinds vary by game variant and how fat the meters look.`,
      risk_summary: `Multi-game cabinet ... scouting the wrong game # is the expensive mistake. Field data on this family is thinner than classic persistent titles.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- **MGM Grand**, **New York-New York**, **Luxor** ... reported KGM / Sega Sammy installs
- Hit-or-miss outside those properties

### Nationwide

1. **Oklahoma tribal** ... Medium ... KGM footprint spreading
2. **California tribal** ... Medium ... hit-or-miss by property
3. **Florida tribal** ... Medium ... **Seminole Hard Rock Tampa**, **Hollywood** (reported)
4. **Pennsylvania / Midwest commercial** ... Low-Medium ... hit-or-miss by property
5. **Atlantic City** ... Low ... hit-or-miss by property`,
      skins_markdown: `**Four game variants** on one multi-game cabinet (numbered **Game 1–4** on glass).`,
      gameplay_mechanics: `**Congo Cash** (Sega Sammy-KGM, **2022**) is a **multi-game persistent-column** cabinet ... four distinct rule sets sharing one bank footprint.

Persistent **free-spin** and **cash-value** meters sit above specific **columns** (layout differs by game #). Features trigger when column thresholds hit during base play.

Scout **game #** first ... column positions and meter types are not interchangeable across the four games.`,
    },
  },
  {
    machine: {
      slug: 'crackin-cash-grand-venezia-rio-wonder',
      name: "Crackin' Cash: Grand Venezia / Rio Wonder",
      manufacturer: 'Light & Wonder',
      type: 'Balloon Stack + Rockets',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: 'L&W balloon-stack family; Grand Venezia / Rio Wonder skins.',
      release_year: null,
    },
    guide: {
      title: "Crackin' Cash: Grand Venezia / Rio Wonder",
      published: true,
      card_ev_threshold: 'Advanced **200×+** board · quick: **3+ JP** or **2 JP + 4 green**',
      when_to_play: `**Advanced (preferred):** total balloon value **≥ 200× bet** across all stacks.

- Value **jackpot balloons** at **70×** each.
- **Purple** shortcut: **0.5×** conservative · **1×** aggressive per purple balloon.
- **Green** balloons average **~15.33×** (range **4×–26.66×**). **Purple** averages **~0.8×**.

**Quick screen (time saver):**
- **3+ jackpot balloons** (read count on **bet pad**), **OR**
- **2 jackpot balloons** plus **≥ 4 green balloons**.

Skip bet levels showing **< 2 jackpot balloons** on the pad ... rarely worth the cycle time.

**Never** play greens-only boards without jackpot-balloon upside ... pretty stacks without JP exposure are usually -EV.`,
      when_to_stop: `Stop after **balloon awards** finish from rocket hits, or when **free games** on a loaded board completes (balloons **carry into FG** ... no new balloons land during the bonus).`,
      how_to_check: `1. Tap **bet pad** levels to scout without coin-in when allowed.
2. Count **jackpot / green / purple** balloons per reel stack.
3. Run the **200×** valuation (advanced) or **3+ JP / 2 JP + 4 green** shortcut.
4. Skip levels with **< 2 jackpot balloons** on the pad preview.`,
      risk_bankroll: `**100–200 units** ... stacks push up fast, so you usually do not grind hundreds of spins deep.`,
      risk_summary: `Lower-value balloons hit far more often than jackpots ... accept lots of small losses, then make it back on **JP balloons**, **triple rockets**, or a **loaded free-games** entry.

Balloons **persist after trigger** ... same balloon can pay multiple times.`,
      risk_bullets: [],
      where_to_find: wtf("Crackin' Cash: Grand Venezia / Rio Wonder", {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Grand Venezia**, **Rio Wonder**.`,
      gameplay_mechanics: `**Crackin' Cash** (Light & Wonder) stacks **three balloons per reel**: **purple** (small credits), **green** (larger credits), **jackpot** (random **mini / minor / maxi / major / grand**).

A landing **balloon** floats up, pushing the column up one slot (top balloon drops off).

**Single rocket** on a reel awards **one random** balloon above that reel. **Triple rocket** awards **all three** balloons above.

**Free games:** **3+ heart scatters** ... balloon setup **carries in**; **no new balloons** during FG; **triple rockets** hit more often inside the bonus.

RTP settings vary by denom (**1¢/2¢:** **86/88/90%** · **5¢/10¢:** **88/90/92%**).`,
    },
  },
  {
    machine: {
      slug: 'crush-conquest',
      name: 'Crush Conquest',
      manufacturer: 'Everi',
      type: 'Boulder Crush Instant-Win',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: '2021 Everi no-reel crush family; pink premium boulders.',
      release_year: 2021,
    },
    guide: {
      title: 'Crush Conquest',
      published: true,
      card_ev_threshold: 'Pink boulder front or **first 3** in either queue',
      when_to_play: `**Primary play:** **pink** (premium) boulder **in the crush position** or within the **first three slots** of the **left or right queue**.

**Do not** chase **silver / gold / green** boulders in the middle ... only **pink** carries large enough average prizes.

Cracks on a boulder **do not** mean it is closer to breaking ... cosmetic only.`,
      when_to_stop: `Stop when the **pink boulder breaks** and pays, or after a **Rampage** streak finishes.`,
      how_to_check: `1. Identify **pink** vs lower-tier boulders (Conquest order common → rare: **green → silver → gold → pink**).
2. Count queue position from the **front crush spot** on **left and right** chutes.
3. Play only when pink is **front** or **slots 1–3** in either queue.
4. Reject pink buried deeper than third in line.`,
      risk_bankroll: `**300 units** ... less when the pink boulder is already at the front.`,
      risk_summary: `You can burn coin-in as fast as you can tap spin. Only **premium pink** is worth the grind ... second-tier boulders in the center are not +EV even if they look "almost ready."`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- Rare on **Strip** ... more common on **locals** and **regional commercial** floors with Everi Empire Flex banks

### Nationwide

1. **Oklahoma tribal** ... Medium ... Everi video footprint
2. **California tribal** ... Medium ... hit-or-miss by property
3. **Pennsylvania / Midwest commercial** ... Medium ... hit-or-miss by property
4. **Florida tribal** ... Low-Medium ... hit-or-miss by property
5. **Atlantic City** ... Low-Medium ... hit-or-miss by property`,
      skins_markdown: `**Crush Dynasty** (white premium boulder ... same engine, different theme).`,
      gameplay_mechanics: `**Crush Conquest** (Everi, **2021**, **Empire Flex** portrait) has **no reels**. Each spin drops the stone head onto one boulder; after a random number of hits the boulder breaks and reveals **credits or a progressive**.

Fresh boulders roll in from **left or right** (**50/50**) into a **five-boulder queue** per side.

**Rampage:** random chain crushes up to **26** boulders in one burst.

**RTP range** on floor configs runs roughly **89%–97%** to offset the fast spin pace.`,
    },
  },
  {
    machine: {
      slug: 'crush-dynasty',
      name: 'Crush Dynasty',
      manufacturer: 'Everi',
      type: 'Boulder Crush Instant-Win',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: '2021 Everi no-reel crush family; white premium boulders.',
      release_year: 2021,
    },
    guide: {
      title: 'Crush Dynasty',
      published: true,
      card_ev_threshold: 'White boulder front or **first 3** in either queue',
      when_to_play: `**Primary play:** **white** (premium) boulder **in the crush position** or within the **first three slots** of the **left or right queue**.

**Do not** chase **purple / green / bluish-grey / brown** boulders in the middle ... only **white** carries large enough average prizes.

Cracks on a boulder **do not** mean it is closer to breaking ... cosmetic only.`,
      when_to_stop: `Stop when the **white boulder breaks** and pays, or after a **Rampage** streak finishes.`,
      how_to_check: `1. Identify **white** vs lower-tier boulders (Dynasty order common → rare: **brown → bluish grey → green → purple → white**).
2. Count queue position from the **front crush spot** on **left and right** chutes.
3. Play only when white is **front** or **slots 1–3** in either queue.
4. Reject white buried deeper than third in line.`,
      risk_bankroll: `**300 units** ... less when the white boulder is already at the front.`,
      risk_summary: `Same speed trap as **Crush Conquest** ... coin-in flies. Premium boulder only, and queue position matters more than crack graphics.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- Rare on **Strip** ... more common on **locals** and **regional commercial** floors with Everi Empire Flex banks

### Nationwide

1. **Oklahoma tribal** ... Medium ... Everi video footprint
2. **California tribal** ... Medium ... hit-or-miss by property
3. **Pennsylvania / Midwest commercial** ... Medium ... hit-or-miss by property
4. **Florida tribal** ... Low-Medium ... hit-or-miss by property
5. **Atlantic City** ... Low-Medium ... hit-or-miss by property`,
      skins_markdown: `**Crush Conquest** (pink premium boulder ... same engine, different theme).`,
      gameplay_mechanics: `**Crush Dynasty** (Everi, **2021**, **Empire Flex** portrait) shares the **Crush Conquest** engine: **no reels**, head-smash instant reveals, **five-boulder queues** per side, **Rampage** up to **26** hits, and **progressive** labels cycling on premium rocks.

Premium tier here is **white** instead of Conquest's **pink**.`,
    },
  },
  {
    machine: {
      slug: 'cyber-dragon',
      name: 'Cyber Dragon',
      manufacturer: 'Gaming Arts',
      type: 'Yin-Yang Segment Wheel',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: '2022 Gaming Arts bagua wheel family; brutal variance.',
      release_year: 2022,
    },
    guide: {
      title: 'Cyber Dragon',
      published: true,
      card_ev_threshold: '**7 / 8** yin-yang segments filled',
      when_to_play: `**Primary play:** **7 of 8** segments filled around the yin-yang meter above the reels.

**Do not** sit at **5–6 segments** ... some APs play early, but variance is extreme and the wheel usually disappoints until the meter is nearly full.

**Two yin-yang symbols** on specific reel positions (see rules screen) fill segments. **Flames** appear around the meter after **five** segments fill.`,
      when_to_stop: `Stop after the **bonus wheel spin** resolves (credits, free games, or jackpot).`,
      how_to_check: `1. Count filled segments on the **yin-yang ring** above the reels.
2. Open **rules screen** to verify yin-yang landing positions if unfamiliar.
3. Tap **menu → bet arrows** to cycle bets **without coin-in** on many Gaming Arts cabinets.
4. Reject **≤ 6 / 8** unless you accept degen variance.`,
      risk_bankroll: `**40–60 units** to close the **last segment** (~**20 units** average grind per segment in field use).`,
      risk_summary: `Extreme wheel variance ... **2–3×** bet wheel pays happen. Size for the **final segment** chase, not a guaranteed wheel monster.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- **MGM Grand**, **New York-New York**, **Luxor**, **Excalibur** ... Gaming Arts Phocus pods (hit-or-miss by bank)

### Nationwide

1. **Oklahoma tribal** ... Medium ... Gaming Arts footprint
2. **California tribal** ... Medium ... hit-or-miss by property
3. **Florida tribal** ... Medium ... hit-or-miss by property
4. **Pennsylvania / Midwest commercial** ... Low-Medium ... hit-or-miss by property
5. **Atlantic City** ... Low ... hit-or-miss by property`,
      skins_markdown: `**No separate skins.**`,
      gameplay_mechanics: `**Cyber Dragon** (Gaming Arts, **2022**, **Phocus S104**) fills **eight segments** around a yin-yang meter. **8 / 8** triggers a **bonus wheel** (credits, **10 free games**, jackpots).

**Free games** can upgrade into **Super Free Games** (beast symbols, **3 lives**, level-up pay tables up to **five beasts**).

Wheel outcomes swing from tiny credit hits to rare **500×+** style sessions on small bets.`,
    },
  },
  {
    machine: {
      slug: 'dancing-drums-golden-drums',
      name: 'Dancing Drums: Golden Drums',
      manufacturer: 'Light & Wonder',
      type: 'Persistent Multiplier + Golden Respin',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'L&W Golden Drums persistent-mult family; dual-game cabinet.',
      release_year: null,
    },
    guide: {
      title: 'Dancing Drums: Golden Drums',
      published: true,
      card_ev_threshold: 'Multiplier **5×+** · not faded · Golden Drums game only',
      when_to_play: `**Primary play:** persistent multiplier **5× or higher** above **reel 1** (also shown on **bet pad**).

**Reject faded multipliers** ... faded means the mult **just triggered** and will reset to **2×** next spin.

**Golden Drums only:** the cabinet also runs legacy **Dancing Drums** without persistent multipliers. Confirm the **Golden Drums** game is selected.

**+1 drum symbols** increment the multiplier (max **8×**). **Drums (or wilds) in reels 1 + 2** trigger **Golden Respin** ... equity is in **glowing green drum** credit prizes multiplied by the built-up mult, and **free games** when reel **3** also hits during the feature.`,
      when_to_stop: `Stop when **Golden Respin** finishes (credits collected) and the multiplier **resets**, or after **free games** entered from the feature completes.`,
      how_to_check: `1. Confirm **Golden Drums** (not legacy **Dancing Drums**) on the game select screen.
2. Read multiplier on **bet pad** for **every denom**.
3. Reject **faded** mult displays.
4. Ignore coins piling in the **bowl above the reels** ... cosmetic, not a trigger meter.`,
      risk_bankroll: `**300–500 units** at **5×+** ... base-game drain is brutal; edge lives in feature hits.`,
      risk_summary: `Trash without the feature path ... dead spins and partial Golden Respins that pay **1×** on a single green drum are normal. Choose **Golden Respin** when free games trigger (player choice should not change RTP).`,
      risk_bullets: [],
      where_to_find: wtf('Dancing Drums: Golden Drums', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `Legacy **Dancing Drums** on the same cabinet (no persistent multiplier ... not this hunt).`,
      gameplay_mechanics: `**Dancing Drums: Golden Drums** (Light & Wonder) adds a **persistent multiplier** (**2×–8×**) above **reel 1**.

**Golden Respin:** drums/wilds on **reels 1–2** expand **reels 3–5** up to **+3 rows**. **Glowing green drums** with credit values lock; empty reels respin. Credits on green drums multiply by the active mult at feature end. If **no green drums** land, the mult **persists** until the next feature (otherwise resets to **2×**).

**Free games** trigger with drums/wilds on **reels 1–3** ... mult **carries into FG**. **Mini/minor** can land on **reel 5** during Golden Respin.`,
    },
  },
  {
    machine: {
      slug: 'dancing-phoenix-soaring-dragon',
      name: 'Dancing Phoenix Soaring Dragon',
      manufacturer: 'IGT',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '2017 Golden Egypt engine; heavily vultured Asian skin.',
      release_year: 2017,
    },
    guide: {
      title: 'Dancing Phoenix Soaring Dragon',
      published: true,
      card_ev_threshold: '2 of first 3 one coin away · active wild R1–3 · R4 edge · dual R4+R5 wild',
      when_to_play: `**Primary play:**
- **Two of the first three reels** one coin away from filling the holder (two **pharaoh heads** count for a line hit).
- **Any active wild** in **reels 1–3** (gold border + **1–2 coins** above the reel).

**Reel 4 edge:** active wild on **reel 4** with **two spins left** while any of **reels 1–3** are one coin away ... take **one spin** hunting a second coin for dual wild reels; if it whiffs, stop.

**Both reels 4 and 5** actively wild at once ... always playable.

Less common skin than **Golden Egypt**, but the math is the same engine.`,
      when_to_stop: `Stop when **2-spin wild sequences** finish on the reels you entered, or after **free games** completes.`,
      how_to_check: `1. Count **coins in holders** above each reel on the **bet pad** (cycle all bets/denoms).
2. Active wilds show a **glowing gold border** and coin count above the reel.
3. Confirm **two-coin** vs **one-coin** away on **reels 1–3**.
4. On multipliers/lines bet pads, stick to the **same cost-to-cover** you are scouting ... different line packs at the same dollar bet are separate persistent states.`,
      risk_bankroll: `**100 units** for a standard wild-reel chase ... more if you are finishing multiple two-away setups.`,
      risk_summary: `One of the most vultured families on the floor ... expect competition. Bonus averages roughly **~60×** but is infrequent; most edge is the **coin-holder wild** chase.`,
      risk_bullets: [],
      skins_markdown: `**Golden Egypt**.`,
      gameplay_mechanics: `**Dancing Phoenix Soaring Dragon** (IGT, **2017**) is an Asian skin on the **Golden Egypt** engine: **coin holders** above each reel. **Two coins** fill a holder → that reel goes **wild for 2 spins**.

**Free games choice** (**30 FG / 1 wild reel**, **15 FG / 2 wild reels**, **5 FG / 3 wild reels**) pays the same on average ... **30 FG** lowers variance if you are not in a hurry.`,
    },
  },
  {
    machine: {
      slug: 'golden-egypt',
      name: 'Golden Egypt',
      manufacturer: 'IGT',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '2017 IGT coin-holder family; flagship skin, heavily vultured.',
      release_year: 2017,
    },
    guide: {
      title: 'Golden Egypt',
      published: true,
      card_ev_threshold: '2 of first 3 one coin away · active wild R1–3 · R4 edge · dual R4+R5 wild',
      when_to_play: `**Primary play:**
- **Two of the first three reels** one coin away from filling the holder (two **pharaoh heads** count for a line hit).
- **Any active wild** in **reels 1–3** (gold border + **1–2 coins** above the reel).

**Reel 4 edge:** active wild on **reel 4** with **two spins left** while any of **reels 1–3** are one coin away ... take **one spin** hunting a second coin for dual wild reels; if it whiffs, stop.

**Both reels 4 and 5** actively wild at once ... always playable.

Flagship skin ... same math as **Dancing Phoenix Soaring Dragon**.`,
      when_to_stop: `Stop when **2-spin wild sequences** finish on the reels you entered, or after **free games** completes.`,
      how_to_check: `1. Count **coins in holders** above each reel on the **bet pad** (cycle all bets/denoms).
2. Active wilds show a **glowing gold border** and coin count above the reel.
3. Confirm **two-coin** vs **one-coin** away on **reels 1–3**.
4. On multipliers/lines bet pads, stick to the **same cost-to-cover** you are scouting ... different line packs at the same dollar bet are separate persistent states.`,
      risk_bankroll: `**100 units** for a standard wild-reel chase ... more if you are finishing multiple two-away setups.`,
      risk_summary: `One of the most vultured families on the floor ... expect competition. Bonus averages roughly **~60×** but is infrequent; most edge is the **coin-holder wild** chase.`,
      risk_bullets: [],
      skins_markdown: `**Dancing Phoenix Soaring Dragon**.`,
      gameplay_mechanics: `**Golden Egypt** (IGT, **2017**) ... **coin holders** above each reel. **Two coins** fill a holder → that reel goes **wild for 2 spins**. Sister skin **Dancing Phoenix Soaring Dragon** runs identical math.

**Free games choice** (**30 FG / 1 wild reel**, **15 FG / 2 wild reels**, **5 FG / 3 wild reels**) pays the same on average ... **30 FG** lowers variance if you are not in a hurry.`,
    },
  },
  {
    machine: {
      slug: 'dawn-of-ra-sun-of-ra-wild-pyramid-respins',
      name: 'Dawn of Ra / Sun of Ra: Wild Pyramid Respins',
      manufacturer: 'Aristocrat',
      type: 'Persistent Pyramid Stacks',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '2023 Aristocrat Wild Pyramid Respins family.',
      release_year: 2023,
    },
    guide: {
      title: 'Dawn of Ra / Sun of Ra: Wild Pyramid Respins',
      published: true,
      card_ev_threshold: 'Active pyramid stack R3–5 · yellow indicator filled',
      when_to_play: `**Primary play:** any **active persistent pyramid stack** on **reels 3, 4, or 5**.

Look for **one or more yellow pyramids filled** in the indicator below those reels ... full **stacked pyramids** lock on the reel for **3 additional spins**.

**Sun + pyramid** symbols on **all five reels** award **credit prizes** (values on suns; pyramid values reveal after the spin). Persistent stacks boost both **trigger frequency** and **prize size**. Pyramids also act as **wilds**.`,
      when_to_stop: `Stop when the **3-spin persistent stack** expires and clears, or after the **credit-prize reveal** sequence finishes.`,
      how_to_check: `1. Check **reels 3–5** for filled **yellow pyramid indicators** below the reel.
2. Note which reel holds the stack ... **R3** can expose **mini/minor**, **R4** **major**, **R5** **grand** (plus larger credit pools on outer reels).
3. Cycle **bets/denoms** ... larger bets skew toward bigger credit prizes on some configs.
4. Watch for **Ra rumble** tease animations before big hits (cosmetic timing cue).`,
      risk_bankroll: `**50 units** per stack chase (~**3 spins** plus base-game attempts to trigger credit awards).`,
      risk_summary: `Suns land frequently, so a live stack gives real trigger equity ... but outer-reel stacks trade some wild value for jackpot/credit upside.`,
      risk_bullets: [],
      where_to_find: wtf('Dawn of Ra / Sun of Ra: Wild Pyramid Respins', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: `**Dawn of Ra**, **Sun of Ra**.`,
      gameplay_mechanics: `**Dawn of Ra / Sun of Ra: Wild Pyramid Respins** (Aristocrat, **2023**) awards credit prizes when **sun and pyramid symbols** cover **all five reels**.

A **full pyramid stack** landing on **reels 3–5** persists **3 spins**. Triggering a full stack starts a **prize-reveal** animation stacking credit values.

**Jackpot ladder by reel:** **R3** mini/minor · **R4** major · **R5** grand, with **R4–R5** holding larger credit pools than **R3**.`,
    },
  },
  {
    machine: {
      slug: 'diamond-blast',
      name: 'Diamond Blast',
      manufacturer: 'IGT',
      type: 'Expanding Ways + Diamond Respin',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'IGT pickaxe-expand ways family; 1600+ ways hunt.',
      release_year: null,
    },
    guide: {
      title: 'Diamond Blast',
      published: true,
      card_ev_threshold: '**1600+ ways** on bet pad',
      when_to_play: `**Primary play:** **ways count above 1600** on the level you are scouting.

Grid expands from **3×5** toward **6×5** (**243–7776 ways**) as **pickaxe** symbols unlock spaces on **reels 2–4**. Persistent expanded ways carry until **TNT** blasts the grid back (TNT pays a reset bonus based on unlocked spaces).

Play the **expanded ways state**, not the collapsed base grid.`,
      when_to_stop: `Stop after **Diamond Respin** completes, or when a **TNT reset** pays and ways collapse below threshold.`,
      how_to_check: `1. Cycle **every bet/denom** and read the **ways counter** on the bet pad / main screen.
2. Confirm **1600+ ways** before coin-in.
3. Note unlocked rows from pickaxes ... more open rows = higher ways and stronger **Diamond Respin** setup.
4. Insert **checker ticket** if ways counts hide behind coin-in on your config.`,
      risk_bankroll: `**300–500 units** ... ways grinds can run long between **Diamond Respin** hits.`,
      risk_summary: `TNT resets are part of the loop (pay reset bonus, shrink grid) ... do not confuse a blast with losing the hunt if ways are still fat on another bet level.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
- **Strip** and **locals** ... IGT video banks, hit-or-miss by property
- Early rollout ... not on every IGT pod yet

### Nationwide

1. **Oklahoma tribal** ... Medium ... IGT footprint
2. **California tribal** ... Medium ... hit-or-miss by property
3. **Pennsylvania / Midwest commercial** ... Medium ... hit-or-miss by property
4. **Florida tribal** ... Low-Medium ... hit-or-miss by property
5. **Atlantic City** ... Low-Medium ... hit-or-miss by property`,
      skins_markdown: `**No separate skins.**`,
      gameplay_mechanics: `**Diamond Blast** (IGT) grows a **3×5 → 6×5** matrix via **pickaxe** unlocks on **reels 2–4**, scaling **243 up to 7776 ways**.

**TNT** collapses the grid but awards a **bonus based on spaces unlocked** before the blast.

**Diamond Respin:** **6+ diamonds** on exposed **R2–R4** spaces trigger a lock-and-respin collect. Milestones: **10** mini (+ row unlock), **15** minor, **20** major, **30** grand-style top award (config dependent).`,
    },
  },
]
