import { wtf } from './apGuideBatchWtf.mjs'

/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH5_PAYLOADS = [
  {
    machine: {
      slug: 'diamond-collector-wolfpack-elite-7s',
      name: 'Diamond Collector: Wolfpack / Elite 7s',
      manufacturer: 'Incredible Technologies',
      type: 'Persistent Diamond Collector',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'IT diamond-meter FG family; two skins, bet-pad read.',
      release_year: 2021,
    },
    guide: {
      title: 'Diamond Collector: Wolfpack / Elite 7s',
      published: true,
      card_ev_threshold: '**12+** diamonds on bet pad · triggers at **15**',
      when_to_play: `**Primary play:** **12+** collected diamonds on the **bet pad** for your active bet (bonus triggers at **15**).

Diamonds land in blank slots **above** the reels ... fewer empty slots as the board fills, so late-meter grinds can drag.

**Bonus:** starts at **6** free games ... most diamonds reveal **+1 FG** (cap **13** +1 symbols) or stronger modifiers (multipliers, etc.). More collected diamonds = better modifier reveal when the bonus fires.

**RTP** spans **85.28%–94.26%** by config ... stick with **12** unless you know the cabinet is on a higher setting (some APs play **10–11** on hot RTP only).

Cycle **every bet + denom** ... diamond counts are **per bet**.`,
      when_to_stop: `Stop after the **free games bonus** finishes and diamonds reset.`,
      how_to_check: `1. Read diamond counts on the **bet pad** ... cycle **all bets/denoms**.
2. Confirm skin is **Wolfpack** or **Elite 7s** (same math).
3. Bonus can also trigger on **2+3+4 scatter** ... diamond count still drives modifier quality.`,
      risk_bankroll: `**50–100 units** ... one diamond from trigger can still whiff on a weak bonus.`,
      risk_summary: `Feels low-variance until you sit a huge bet and eat **70–80 units** for a **~50-unit** bonus ... field reports exist at **$10+** bets.

Late-meter diamond accumulation slows as upper slots fill (max **5** diamonds per spin).`,
      risk_bullets: [],
      where_to_find: wtf('Diamond Collector: Wolfpack / Elite 7s', `- Uncommon nationally ... **IT** wildlife banks on tribal + regional commercial floors.`),
      skins_markdown: `**Wolfpack**, **Elite 7s**.`,
      gameplay_mechanics: `**Diamond Collector** (Incredible Technologies, **2021**) ... **5×4**, **40 lines**, persistent diamonds above the reel window.

Collected diamonds reveal modifiers when **15** diamonds or **reels 2+4 scatters** trigger free games. Diamonds persist per bet until the bonus clears them.`,
    },
  },
  {
    machine: {
      slug: 'diamond-mania',
      name: 'Diamond Mania',
      manufacturer: 'IGT',
      type: '10-Spin Frame Cycle',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'IGT Scarab clone; frame-to-wild 10-spin cycle.',
      release_year: 2019,
    },
    guide: {
      title: 'Diamond Mania',
      published: true,
      card_ev_threshold: 'Left-heavy frames by spin # · **never spin 10**',
      when_to_play: `**Primary play:** mid-cycle machines with **left-heavy gold frames** ... horizontal alignment beats vertical stacks (you want **4 or 5 of a kind** on spin **10**, not thin **3 of a kind**).

| Spin # | Play when |
| --- | --- |
| **9** | **1+** frame in **R1–R3** |
| **7–8** | **2+** frames in **R1–R3**, **same row** |
| **5–6** | **3+** frames in **R1–R4** same row **or** **5+** in **R1–R3** |
| **3–4** | **5+** in **R1–R3** **or** **4+** same row |
| **1–2** | **6+** in **R1–R3** **or** **4+** same row |

**Shortcuts some APs use:** any **guaranteed 4 of a kind** regardless of spin count · on **spin 8+**, any setup that guarantees **3 of a kind** when frames flip wild.

**Never play spin 10** ... cycle is done and frames have no value.

Multi-denom banks ... check every denom.`,
      when_to_stop: `Stop after **spin 10** resolves (frames clear and counter resets to **1**).`,
      how_to_check: `1. Read the **spin counter** (1–10) on the game screen.
2. Count **locked gold frames** ... focus **R1–R3** (and **R4** on mid-cycle rules).
3. Prefer frames on the **same row** over scattered vertical stacks.
4. Cycle **all denoms** on multi-denom installs.`,
      risk_bankroll: `**10 units** per walk-up chase.`,
      risk_summary: `Easy to talk yourself into pretty frame patterns that are not +EV ... **3 of a kind** pays are weak; you need **4 of a kind or better** when wilds fire.

Scarab-family intuition helps, but frame **placement** matters more than raw frame count.`,
      risk_bullets: [],
      where_to_find: wtf('Diamond Mania', `- Spotted on **Strip** installs (e.g. **Cosmopolitan** historically) plus scattered **IGT** banks nationally.`),
      skins_markdown: `**Diamond Mania** only (Scarab-engine clone).`,
      gameplay_mechanics: `**Diamond Mania** (IGT, **2019**) ... **5×4**, **75 lines**, **Wild Stays, Charges, Then Pays** / Scarab-style **10-spin** cycle.

Gold-frame symbols lock through spins **1–9**; on spin **10** all framed positions become **wild**, then the board clears.`,
    },
  },
  {
    machine: {
      slug: 'diamond-tide-jungle',
      name: 'Diamond Tide Jungle',
      manufacturer: 'AGS',
      type: 'Shifting Persistent Wilds',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'AGS yellow-wild shift-left cousin; feast-or-famine blue shots.',
      release_year: 2019,
    },
    guide: {
      title: 'Diamond Tide Jungle',
      published: true,
      card_ev_threshold: '**2** yellow wilds same row (adjacent or 1-gap) · **or 6+** yellow anywhere',
      when_to_play: `**Primary play (any of these):**

1. **Two yellow wilds** on the **same row**, **adjacent** or with **one gap** between them (**R2–R5** or upcoming queue right of **R5**).
2. **Six yellow wilds** anywhere you count them (wilds clump ... upcoming **W** symbols right of **R5** count).

**Do not count:**
- **Yellow wilds on R1** ... they shift off next spin.
- **Blue wilds** ... non-persistent, gone next spin (they can rain from the top diamond).

**Upcoming wilds:** symbols with **W** showing **right of R5** are in play ... chase clumps when yellow density is high.

**Reject** scattered blue arrays where **R1** wild walks off and remaining wilds do not line up.`,
      when_to_stop: `Stop when **yellow wilds clear** the window ... usually **1–2 spins** once positioned wilds finish shifting left.`,
      how_to_check: `1. Count **yellow** wilds only ... ignore **blue**.
2. Include **upcoming** wilds right of **R5** (chevron / **W** visible).
3. Ignore **R1** yellow for play math.
4. Cycle **every bet + denom** if the bank is multi-denom.`,
      risk_bankroll: `**10–25 units** per walk-up chase.`,
      risk_summary: `**Feast or famine** ... more yellow wilds increase blue-diamond shots, but blue wilds are not persistent equity.

**3oak** line hits are terrible ... you need **4oak+** for real money.`,
      risk_bullets: [],
      where_to_find: wtf('Diamond Tide Jungle', `- Sparse **AGS** installs ... hit-or-miss outside tribal/regional footprints.`),
      skins_markdown: '',
      gameplay_mechanics: `**Diamond Tide Jungle** (AGS, **~2019**) ... persistent **yellow wilds** shift **one column left** each spin. **Blue wilds** from the overhead diamond are **one-spin only**.

Upcoming yellow wilds can queue off the right edge of **R5** before entering the active window.`,
    },
  },
  {
    machine: {
      slug: 'dice-seeker-flappers-dappers-heroes-villains-viking-invasion',
      name: 'Dice Seeker: Flappers & Dappers / Heroes & Villains / Viking Invasion',
      manufacturer: 'Gaming Arts',
      type: 'Hit-Point Block Break',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'Gaming Arts Phocus pods; large-block prize picks.',
      release_year: null,
    },
    guide: {
      title: 'Dice Seeker: Flappers & Dappers / Heroes & Villains / Viking Invasion',
      published: true,
      card_ev_threshold: 'Large **2×3** block **≤3 HP** · or **2** large blocks **≤5 HP** each',
      when_to_play: `**Primary play:**

1. Any **large character block** (**2 reels wide × 3 tall**) with **≤3 hit points** remaining.
2. **Two** large blocks each at **≤5 HP** (large blocks start at **16 HP**).

**Skip** skinny **1×1** credit blocks ... even big credit prizes (**7×+** bet) are twice as hard to hit with dice.

**Prize pick:** clearing a large block awards a **3-pick** bonus (one big credit + two small, sometimes **4 or 8 free games** ... FG is the jackpot outcome).

Dice land on reels, roll **1–6**, and shave HP from the block above that reel (**one die per reel max**). Excess hits can cascade upward to the next block.`,
      when_to_stop: `Stop after your target **large block(s)** pop and the **prize pick** (or credit award) finishes.`,
      how_to_check: `1. Open the **menu** (lower-left) and use **up/down arrows** to cycle bets **without coin-in** on most installs.
2. Read HP counters on **large 2×3** blocks only.
3. Cycle **all denoms** ... usually multi-denom up to **25¢** max.
4. Ignore **must-hit-by** ladder noise ... block HP is the AP read.`,
      risk_bankroll: `**25–50 units** ... bad prize picks happen; you need volume to average out.`,
      risk_summary: `Low priority vs stronger hunts on a typical route ... line hits are weak and most RTP is in the dice feature.

Frustrating when you pick the **smallest** credit in the **3-pick** and lose the session.`,
      risk_bullets: [],
      where_to_find: wtf('Dice Seeker', `- **Gaming Arts** circular / pod banks ... uncommon outside properties that carry the Phocus lineup.`),
      skins_markdown: `**Flappers & Dappers**, **Heroes & Villains**, **Viking Invasion**.`,
      gameplay_mechanics: `**Dice Seeker** (Gaming Arts) ... **5-reel**, **243-way** family with overhead **HP blocks** (characters, credits, chests). Base-game dice strikes feed blocks; **2+3+5** can trigger volatile **free games** with boss rounds.

Also runs **three-tier must-hit-by** progressives ... not the primary AP path.`,
    },
  },
  {
    machine: {
      slug: 'double-dragon-jin-long-jin-bao',
      name: 'Double Dragon: Jin Long Jin Bao',
      manufacturer: 'Light & Wonder',
      type: 'Dual-Board Water Rings',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'LNW dual-screen Dragon sequel; summed ring equity.',
      release_year: 2014,
    },
    guide: {
      title: 'Double Dragon: Jin Long Jin Bao',
      published: true,
      card_ev_threshold: 'Combined ring score **≥8** both boards · plain ring = **1**, mult ring = face value',
      when_to_play: `**Primary play:** total **water-ring equity ≥8** counting **both** top and bottom boards.

**Scoring:** plain ring = **1** · **2×–10×** multiplier ring = that multiplier value (e.g. **5×** ring counts as **5**).

**Timer:** rings persist **3 spins**; a new ring landing resets the counter to **3** (read spins remaining below the middle reel).

**Variance note:** equity spread across **multiple** rings is steadier than one **10×** ring carrying the whole play.

Coin stacks can run **30** high ... landing a coin in a ring pays that coin **plus every coin above it** on the reel.`,
      when_to_stop: `Stop when **water rings expire** and no coin catch fires (timer hits **0** without a reset).`,
      how_to_check: `1. Sum ring equity on **both** boards before you coin in.
2. Read **spins remaining** under the center reel.
3. Cycle **every bet + denom** on multi-denom banks.
4. **Wheel scatter ×3** triggers free games ... separate chase, rings stick entire bonus.`,
      risk_bankroll: `**25–75 units** ... rings land more often than original **Dragon**, but coin values are smaller.`,
      risk_summary: `Dual boards tempt you into marginal totals ... do the **≥8** math on combined equity, not gut feel on one flashy **10×** ring.

Same reel can pay **multiple** rings if a coin stack threads more than one catcher.`,
      risk_bullets: [],
      where_to_find: wtf('Double Dragon: Jin Long Jin Bao', {
        vegas: `- **MGM Grand**, **Aria**, locals, and high-traffic **LNW** Mural / Cosmic banks.`,
        regions: [
          '1. **Oklahoma tribal** - Medium-High - Hit-or-miss by property',
          '2. **California tribal** - Medium - Hit-or-miss by property',
          '3. **Pennsylvania / Midwest commercial** - Medium-High - **Parx**, **Rivers**, **Wind Creek**',
          '4. **Florida tribal** - Medium - **Hard Rock**-style **LNW** installs',
          '5. **Mississippi Gulf Coast** - Medium - Biloxi banks',
        ],
      }),
      skins_markdown: '',
      gameplay_mechanics: `**Double Dragon: Jin Long Jin Bao** (Light & Wonder, **2014**) ... dual **5×3** boards (up to **6-high** in bonus) on **Mural / Cosmic** cabinets. **Water rings** catch cascading coin strings; multiplier rings up to **10×**.

**Wheel bonus:** up to **50** free games with sticky rings for the full feature.`,
    },
  },
  {
    machine: {
      slug: 'double-jackpot-blazing-7s-with-quick-hit-feature-high-limit-edition',
      name: 'Double Jackpot Blazing 7s With Quick Hit Feature: High Limit Edition',
      manufacturer: 'Light & Wonder',
      type: 'Orphan High-Limit Spins',
      difficulty: 'Beginner',
      popularity: 'Rare',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low (found money)',
      popularity_summary: 'Abandoned high-limit spin wheel; lottery-grade orphan finds.',
      release_year: null,
    },
    guide: {
      title: 'Double Jackpot Blazing 7s With Quick Hit Feature: High Limit Edition',
      published: true,
      card_ev_threshold: 'High-limit wheel covering screen · spin counter visible',
      when_to_play: `**Primary play:** whenever the cabinet is stuck in **high-limit spin mode** ... full-screen **wheel** with a **spin counter** (bottom-right).

Someone cashed out mid-feature and left **prepaid high-limit spins** behind. Each spin still takes a wager (tiny lose chance), so abandoned sessions happen.

**Payout mix per high-limit spin:** **$1,000**, **$900**, **$100**, **+1 spin**, or **$0** (**~1 in 999**).

Awarded spin packages (**2 / 5 / 10 / 25**) depend on bet level + denom when the feature triggered.`,
      when_to_stop: `Stop after the **high-limit spin counter** hits **0** and the wheel clears.`,
      how_to_check: `1. Walk high-limit **Quick Hit / Blazing 7s** banks ... look for the **full-screen wheel** (not normal reels).
2. Cycle **denoms** if needed ... feature state can be denom-specific.
3. You can usually scout **without coin-in**, but verify on glass if unsure.`,
      risk_bankroll: `**1–5 units** to clear spins ... you are finishing prepaid equity, not grinding.`,
      risk_summary: `You will probably never see one ... but it is the best orphan find on the floor when it happens (thousands in leftover spins).

Worth a **10-second** check whenever you pass high-limit **Quick Hit** installs.`,
      risk_bullets: [],
      where_to_find: wtf('Double Jackpot Blazing 7s High Limit Edition', `- High-limit **Quick Hit** pockets only ... **Vegas** high-limit rooms, regional commercial high-limit nooks.`),
      skins_markdown: '',
      gameplay_mechanics: `**Double Jackpot Blazing 7s With Quick Hit Feature: High Limit Edition** (Light & Wonder) ... **Quick Hit** high-limit mode awards batches of independent spins averaging **~$1,000** each while circumventing standard jackpot-tax framing.

Normal **Quick Hit** jackpots still exist ... this guide is only for the abandoned **high-limit spin wheel** state.`,
    },
  },
  {
    machine: {
      slug: 'dragon-flame',
      name: 'Dragon Flame',
      manufacturer: 'Everi',
      type: 'Descending Queue Wilds',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Everi Empire MPX queue-wild family; Gift of the Nile twin.',
      release_year: null,
    },
    guide: {
      title: 'Dragon Flame',
      published: true,
      card_ev_threshold: 'R1–R3 wilds in window or queue · depth rules below',
      when_to_play: `**Simple read:** wilds in **R1–R3** in the active window **or** directly above in the upcoming queue. Deeper queue wilds need **more** stacked equity before you sit.

**Detailed thresholds (R1–R3 only):**

1. Single wild in **top/middle** active rows **or** directly above the window.
2. **Two** wilds in the **front three** queue positions above **R1–R3**.
3. **Two** wilds **same row** in the **middle** queue band.
4. **Three** wilds **same row** in the **back** queue band.
5. **Stacks of 3+** wilds toward the **back** of the queue on **R1–R3**.

**Do not chase** persistent-looking **bonus scatters** ... only **wilds** persist.

Premium **3oak** line hits pay decently here (not a **4oak-only** grind).`,
      when_to_stop: `Stop when queue wilds **exit the active window** without paying (wilds march **down one row per spin**).`,
      how_to_check: `1. Map the **upcoming queue** above the reels ... wild stacks show before they enter play.
2. Count wild coverage on **R1–R3** only for threshold rules.
3. Cycle **every bet + denom** ... wild queues are **per bet**.
4. Confirm skin is **Dragon Flame** or **Gift of the Nile** (same AP).`,
      risk_bankroll: `**25–50 units** per walk-up chase.`,
      risk_summary: `Queue depth math is easy to misread ... two wilds far back on **different rows** is a common non-play trap.

Free-game wilds do **not** transfer back to base after the bonus ends.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Flame', `- Scattered **Everi Empire MPX** banks ... tribal + regional commercial, not Strip-dense.`),
      skins_markdown: `**Dragon Flame**, **Gift of the Nile**.`,
      gameplay_mechanics: `**Dragon Flame / Gift of the Nile** (Everi) ... **5-reel**, **30-line** persistent wild queues on **Empire MPX**. Wild stacks sit above the active area and **drop one row per spin** until they clear.

**Free games** land extra wilds but do not persist after the feature ends.`,
    },
  },
  {
    machine: {
      slug: 'dragon-jin-long-jin-bao',
      name: 'Dragon: Jin Long Jin Bao',
      manufacturer: 'Light & Wonder',
      type: 'Fire Ring Coin Catch',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Tall-cabinet LNW coin-string classic; quick ring hunts.',
      release_year: 2022,
    },
    guide: {
      title: 'Dragon: Jin Long Jin Bao',
      published: true,
      card_ev_threshold: '**2+** active fire rings · timer showing spins left',
      when_to_play: `**Primary play:** **two or more fire rings** anywhere on the reels **with spins remaining** on the timer (below the middle reel).

**Timer:** each ring locks **3 spins**; new rings reset the counter to **3**.

**Coin catch:** a credit coin landing fully inside a ring pays that coin **plus the entire stack above it** (stacks up to **~30**). Multiple rings on one reel can pay the same stack more than once.

**Wheel bonus** (three scatters) is upside ... not required for the walk-up ring play.`,
      when_to_stop: `Stop when **fire rings expire** without a catch (timer **0**, no fresh ring reset).`,
      how_to_check: `1. Count **active** rings with time left on the **spins-remaining** indicator.
2. Rings with **no** timer left are dead equity ... skip.
3. Cycle **every bet + denom** on multi-denom banks.
4. Tall **Mural** cabinet is easy to spot from across the floor.`,
      risk_bankroll: `**10–25 units** per walk-up chase (scale up on huge bets).`,
      risk_summary: `Field grumbles at **2-ring** plays on bad runs ... math still says play, but variance spikes on higher bets.

Low-volatility reputation holds on common bets ... one of the fastest coin-string checks on a route.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon: Jin Long Jin Bao', {
        vegas: `- **MGM Grand**, **Aria**, **Cosmopolitan**, locals ... tall **LNW** Mural banks are hard to miss.`,
        regions: [
          '1. **Oklahoma tribal** - Medium-High - Hit-or-miss by property',
          '2. **California tribal** - Medium-High - Hit-or-miss by property',
          '3. **Pennsylvania / Midwest commercial** - Medium-High - **Parx**, **Rivers**, **Wind Creek**',
          '4. **Florida tribal** - Medium - **Hard Rock**-style installs',
          '5. **Mississippi Gulf Coast** - Medium - Biloxi banks',
        ],
      }),
      skins_markdown: '',
      gameplay_mechanics: `**Dragon: Jin Long Jin Bao** (Light & Wonder, **~2022**) ... single **5×3** board (up to **10-high** in bonus) with **fire rings** catching coin strings. **Wheel** awards up to **50** free games; rings persist for the full bonus.

Sister sequel **Double Dragon** runs dual boards with **water rings** and multiplier scoring ... tighter threshold.`,
    },
  },
  {
    machine: {
      slug: 'dragon-lanterns',
      name: 'Dragon Lanterns',
      manufacturer: 'Gimmie Games',
      type: 'Rising Lantern Wilds',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Ocean Magic-style lanterns; progressives + retriggers.',
      release_year: 2018,
    },
    guide: {
      title: 'Dragon Lanterns',
      published: true,
      card_ev_threshold: 'Lantern on **R1–R4** · **R5** only w/ progressive attached',
      when_to_play: `**Primary play:** any **floating lantern** on **reels 1–4**.

**Reel 5:** skip unless the lantern carries a **progressive** tag (can pay again as it rises).

Lanterns **rise one row per spin** until they leave the window ... overlap with **logo symbols** can trigger **free games** or **progressive** picks (retriggerable as lanterns climb).

**Ante / premium bet** configs show more lanterns ... same play rules, just more walk-ups.

Ocean Magic veterans already know the rhythm; this skin adds **progressive lanterns** and a **much** easier bonus hit rate.`,
      when_to_stop: `Stop when your **lantern wilds clear** the active window (usually **1–3 spins**).`,
      how_to_check: `1. Insert a **checker ticket** ... most installs require balance to cycle bets/denoms.
2. Scan **R1–R4** lanterns first; note **progressive** tags before playing **R5**.
3. Cycle through **nickel** (and lower) denoms on multi-denom banks.
4. Confirm title is **Dragon Lanterns** (not generic Ocean Magic unless you know the skin).`,
      risk_bankroll: `**25–50 units** per walk-up chase.`,
      risk_summary: `Checker-ticket tax on every scout ... annoying but standard for this family.

**R5** lanterns without a progressive are trap plays ... too far right with weak line geometry.`,
      risk_bullets: [],
      where_to_find: wtf('Dragon Lanterns', `- **Ocean Magic**-adjacent footprint ... tribal + regional commercial, hit-or-miss in Vegas.`),
      skins_markdown: '',
      gameplay_mechanics: `**Dragon Lanterns** (Gimmie Games, **2018**) ... floating lantern wilds rise **one row per spin**. Lantern-on-logo overlaps trigger **free games** (frequent vs Ocean Magic) and **three-tier progressives** that can hit multiple times as lanterns climb.

Standard and **ante** bet levels change lantern frequency, not the core play test.`,
    },
  },
  {
    machine: {
      slug: 'dragon-lights-fortune-skies-mystical-falls-secret-fortress',
      name: 'Dragon Lights: Fortune Skies / Mystical Falls / Secret Fortress',
      manufacturer: 'IGT',
      type: 'Progressive Free Games Meters',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'High',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'IGT four-meter FG family; flames-before-EV trap.',
      release_year: 2020,
    },
    guide: {
      title: 'Dragon Lights: Fortune Skies / Mystical Falls / Secret Fortress',
      published: true,
      card_ev_threshold: 'Mini **25+** · Minor **37+** · Major **56+** · skip direct mega chase',
      when_to_play: `**Primary (per bet pad free-games count):**

| Tier | Play at | Max mult |
| --- | --- | --- |
| **Mini** (purple) | **25+** | **3×** |
| **Minor** (blue) | **37+** | **5×** |
| **Major** (yellow) | **56+** | **8×** |
| **Mega** (red) | **86+** exists ... **do not chase mega directly** |

Four **uncapped** FG meters per bet. Matching icons on **R5** tick the meter ... trigger timing is **random** (not must-hit-by).

**Flames** appear around average hit points ... **ignore flames** as a play signal (they show way before +EV).

**Mega strategy:** hunt **mini/minor/major** at thresholds and treat **mega** as a lottery kicker if it pops mid-chase.

Meters cap at **200** games (stop growing, not auto-award).`,
      when_to_stop: `Stop once your tier's **free games** session finishes and that meter resets.`,
      how_to_check: `1. Cycle **all bets/denoms** ... four independent meters per level.
2. Read **mini / minor / major / mega** on the **bet pad** (top screen mirrors active bet).
3. Confirm which tier you are chasing before you coin in.
4. **RTP** spans **~85.9%–95%** ... tighten mini entry on low settings if you know the config.`,
      risk_bankroll: `**500 units** mini/minor hunts · **1000+** major · **2000+** if you let mega variance stack in`,
      risk_summary: `Uncapped progressives can eat **hours** of coin-in before the random trigger lands ... most common way APs blow up a session.

**All four on fire** is **not** a play rule ... flames are marketing, not math.

Combo hits (major/mega while chasing mini) happen ... still does not guarantee the hunt ends green.`,
      risk_bullets: [],
      where_to_find: `**In Las Vegas / physical casinos:**
Common on **Strip + locals** ... one of the most hunted **IGT** persistent FG families nationally.

### Nationwide

1. **Spirit Mountain** (Grand Ronde, OR) ... casino slot lineup lists **Dragon Lights** skins
2. **Pacific Northwest tribal** ... Medium ... **IGT PeakSlant49** banks
3. **Commercial / tribal nationally** ... Medium ... hit-or-miss by property`,
      skins_markdown: `**Fortune Skies**, **Mystical Falls**, **Secret Fortress**.`,
      gameplay_mechanics: `**Dragon Lights** (IGT, **2020**) ... **5×4**, **30 lines**, **50-credit** cost-to-cover on **PeakSlant49 / CrystalCurve**. Four progressive **free-games** meters persist per bet; **R5** icons increment counts until **R1+R3 bonus + R5 progressive** triggers the stored games.

**Wheel bonus** and **$10,000** reset jackpot exist ... meter hunts are the AP path. Sister refresh **Dragon Lights Gold** uses similar thresholds (separate skin).`,
    },
  },
]
