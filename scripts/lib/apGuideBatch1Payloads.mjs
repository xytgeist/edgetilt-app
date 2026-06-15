/**
 * Batch 1 guide payloads — Ryan voice, synthesized from ap-guide-workspace sources.
 */
import {
  wtf,
  WTF_VEGAS_AGS,
  WTF_VEGAS_ARISTOCRAT_BUFFALO,
  WTF_VEGAS_LNW_COMMON,
  WTF_REGIONS_AGS,
  WTF_REGIONS_AINSWORTH_COMMON,
  WTF_REGIONS_ARISTOCRAT_HEAVY,
  WTF_REGIONS_LNW_HEAVY,
} from './apGuideBatchWtf.mjs'

/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH1_PAYLOADS = [
  {
    machine: {
      slug: 'blooming-penzai',
      name: 'Blooming Penzai',
      manufacturer: 'Velvix',
      type: 'Persistent Credit Trees',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Med-High',
      popularity_summary: 'Uncommon nationally; multi-denom tree chase.',
      release_year: null,
    },
    guide: {
      title: 'Blooming Penzai',
      published: true,
      card_ev_threshold: '≥100× bet total prizes · prefer ≥3 fully gold trees',
      when_to_play: `**Primary play:** total prizes across all five reels **≥100× your bet**, with prizes **spread** across **≥3 fully gold trees**. **Four gold trees** is almost always worth a look.

The game plays similar to **Wheel of Fortune 4D Collector's Edition** ... strategy is nearly the same, but instead of **70–75×** bets across, you want a minimum of **100×**. Each reel has a **credit prize** and a **penzai tree** above it. Coins grow the prize and turn the tree gold (~**20× bet** at full gold). **Gold tree symbols** pay the prize above during **Blooming Gold** free games.

**Do not** chase one reel with **100×+** while the rest are minimal ... spread equity kills variance. You can still play with heavily weighted columns, but increase the total to **140× with only 2 gold trees** and **200× with only one.**

**Aggressive / card-building:** some APs play thinner spreads with a bigger bankroll ... higher gamble, not where the clean edge usually lives.`,
      when_to_stop: `Stop when **collective bets falls under 100×.**`,
      how_to_check: `1. Read **credit prizes + tree color** above each of the **five reels**.
2. Cycle through **every bet** at **every denom** ... persistent state is bet-specific.
3. Count **fully gold trees** vs partial growth.
4. Add the five prize values in **× bet**.`,
      risk_bankroll: `**300–500 units** for standard **3–4 gold tree** hunts. Less-spread setups want **500+ units**.`,
      risk_summary: `**High variance** if you overweight one column. Trees **reset to 1×** after a gold-tree award.`,
      risk_bullets: [],
      where_to_find: `### Where to Find Blooming Penzai

**Strongest presence:** California tribal casinos (e.g., **Morongo Casino Resort & Spa**, **Fantasy Springs**, **Rolling Hills**, and others in Southern California where Velvix has active placements).

**Other regions:** Oklahoma (e.g., early placements at **Comanche Nation**), Arizona tribal properties, Philippines (via Max Fair Group distribution), and some other **APAC/US tribal markets.**

**Las Vegas / Nevada:** Limited or spotty. Not a mass-market title like Lightning Link or 88 Fortunes variants. Isolated units possible at off-Strip or locals-oriented spots ... no widespread confirmed placements on major Strip properties (**MGM**, **Caesars**, etc.) in recent reports.`,
      skins_markdown: '',
      gameplay_mechanics: `**Blooming Penzai** (Velvix) puts a **prize ladder + penzai tree** above each reel. Base spins feed credits into those prizes and grow trees toward gold.

**Blooming Gold:** triggered feature (often **8+ spins**) where **gold tree symbols** collect the prize above their reel. Vase scatters extend the feature.`,
    },
  },
  {
    machine: {
      slug: 'bonus-builder-emerald-spins',
      name: 'Bonus Builder: Emerald Spins',
      manufacturer: 'Incredible Technologies',
      type: 'Triple Bonus Builder',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high (weak base, fat bonuses)',
      popularity_summary: 'Uncommon; Emerald Spins Irish skin of Bonus Builder.',
      release_year: 2024,
    },
    guide: {
      title: 'Bonus Builder: Emerald Spins',
      published: true,
      card_ev_threshold: 'Combined spin meters on all three bonuses **45+**',
      when_to_play: `**Primary play:** combined **spin counts on all three bonuses are 45+**.

Three color bonuses (**red / blue / purple**). **Clover scatters** either **trigger** that bonus or add **Ways**, **Spins**, or **On-Reels** upgrades. All three pots matter ... equal trigger chances, and upgrades stack (extra spins multiply ways + removed symbols value).

**Weak base game** ... you're paying for the buildup. If only one color is fat and the other two are empty, run the math before you commit.`,
      when_to_stop: `Stop after whichever **color bonus** you triggered finishes. The triggered pot resets to **243 ways / 8 spins / 0 removed**; the other two keep their buildup.`,
      how_to_check: `1. Open the **bet pad** ... tap each bet to see **Ways / Spins / On-Reels** per color.
2. Add **spin meters** on red + blue + purple before you spin.
3. Note **RTP band** if posted (**~86–94%** installs reported).`,
      risk_bankroll: `**300 units** is usually enough. **500 units** if you want cushion on a long buildup chase.`,
      risk_summary: `**Feast or famine.** Dead base game is normal; the session lives or dies on the trigger.

After a hit, two colors may still be juicy ... don't auto-walk without re-reading all three meters.`,
      risk_bullets: [],
      where_to_find: wtf('Bonus Builder: Emerald Spins'),
      skins_markdown: `**Bonus Builder** (Emerald Spins is the Irish / emerald skin).`,
      gameplay_mechanics: `**Bonus Builder: Emerald Spins** is the **Emerald / Irish** skin on IT's **Bonus Builder** engine (**243 ways** base).

**Three persistent bonuses** build independently. **Clovers** upgrade **ways count**, **spin count**, or **symbols removed on reels** for that color.

**Trigger:** landing the feature fires that color's bonus at its current build; **only that color resets**, others retain state.`,
    },
  },
  {
    machine: {
      slug: 'brave-firefighter',
      name: 'Brave Firefighter',
      manufacturer: 'Ainsworth',
      type: 'Extra Row Prize Chase',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high',
      popularity_summary: 'Uncommon; Elephant King / Wolf Ridge style extra row.',
      release_year: 2023,
    },
    guide: {
      title: 'Brave Firefighter',
      published: true,
      card_ev_threshold: 'Firefighter(s) positioned above reels · two FF = also play outside-left (not last reel)',
      when_to_play: `**Primary play:** firefighters positioned above the reels you want chased. With **two firefighters** out, also play **outside-left positions** ... **not** the last reel.

**50-line** game with an **extra row above** the **4×5** array. Firefighters **move one column right** each spin.

**Extra Prize row:** a firefighter in the top row collects **Prize Balls** (**2–300× total bet**) as it moves.`,
      when_to_stop: `Stop after **Free Spins Wheel** resolves (**5–25 games** at **100 lines**).`,
      how_to_check: `1. Count **firefighter positions** in the extra top row.
2. Watch **Prize Ball** values on the main grid.
3. **Three+ badges** spin the **Free Spins Wheel**.`,
      risk_bankroll: `**100–200 units.** Movement + collection spins add up before the wheel hits.`,
      risk_summary: `Same family feel as **Elephant King** / **Wolf Ridge** ... extra-row movement AP with a thin data set. Scout the row every spin; a misread column burns coin-in fast.`,
      risk_bullets: [],
      where_to_find: wtf('Brave Firefighter', { regions: WTF_REGIONS_AINSWORTH_COMMON }),
      skins_markdown: '',
      gameplay_mechanics: `**Brave Firefighter** (Ainsworth **A640**) adds a **top-row firefighter** that steps right each spin. **Prize Balls** on the grid pay when collected.

**Free Spins Wheel:** **3+ badges** → **5–25 free games** on a **100-line** array.`,
    },
  },
  {
    machine: {
      slug: 'brian-christophers-world-cruise',
      name: "Brian Christopher's World Cruise",
      manufacturer: 'Gaming Arts',
      type: 'Triple Duck Persistent',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'High',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: '2025 BC Ventures title; scout ducks via menu.',
      release_year: 2025,
    },
    guide: {
      title: "Brian Christopher's World Cruise",
      published: true,
      card_ev_threshold: 'Combined ducks **15–18+** · or single duck **10+** (higher variance)',
      when_to_play: `**Primary play:** **combined ducks 15–18+**.

**Aggressive:** one duck **10+** with the others low ... higher gamble.

Three **rubber duck meters** above the reels (**Wheel of the World**, **Dance Till You Drop**, **Stuff Your Face**). **Duck scatters** fatten meters on a **non-linear** curve ... **1→4** climbs fast, **5→8** crawls. A **10-1-10** setup can beat **7-7-7**.

**Three matching ducks** guarantees that feature. Each duck **caps at 16**, resets to **1** after trigger.`,
      when_to_stop: `Stop after the **duck feature** you triggered finishes (wheel, dance spins, or pick bonus).`,
      how_to_check: `1. Read all **three duck counts** on the marquee.
2. Use **menu arrows** to scout without coin-in when the cabinet allows.
3. Remember **non-linear equity** ... don't sum duck numbers like they're linear coin-in.`,
      risk_bankroll: `**300 units** minimum. Long duck chases can swing harder than that.`,
      risk_summary: `**Wheel of the World** is the volatile one (boosted credits × duck #, jackpots in play). **Dance Till You Drop** = persistent wilds, no jackpots. **Stuff Your Face** = pick credits × duck # with a guaranteed jackpot.

Misreading the curve is how you donate.`,
      risk_bullets: [],
      where_to_find: wtf("Brian Christopher's World Cruise"),
      skins_markdown: '',
      gameplay_mechanics: `**Brian Christopher's World Cruise** (Gaming Arts **VertX Grand**, **2025**) runs three persistent **duck bonuses** plus **two progressives** and **two fixed jackpots**.

**Wheel of the World:** **3 wheel spins**; credits scale with duck count × bet.

**Dance Till You Drop:** **9 + duck #** spins with **persistent wilds**.

**Stuff Your Face:** pick bonus with credits × duck #.`,
    },
  },
  {
    machine: {
      slug: 'bubble-blast',
      name: 'Bubble Blast',
      manufacturer: 'IGT',
      type: 'Persistent Bubble Grid',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Uncommon IGT persistent bubble title.',
      release_year: 2021,
    },
    guide: {
      title: 'Bubble Blast',
      published: true,
      card_ev_threshold: '**2+ bubbles** at **≥5× bet** · ignore row 1',
      when_to_play: `**Primary play:** **2+ bubbles** worth **≥5× your bet**. **Ignore row 1.**

**Bubbles** rise one row per spin. When a **bubble prize** aligns with a **coin symbol**, you collect that prize.`,
      when_to_stop: `Stop after a **bubble+coin collect** on your playable rows, or when bubbles drop below your threshold.`,
      how_to_check: `1. Mark **bubble row height** each column.
2. Read **prize values** on bubbles in **rows 2+**.
3. Watch for **coin symbols** lining up under playable bubbles.`,
      risk_bankroll: `**30–50 units** ... short orb ladder, not an open-ended grind.`,
      risk_summary: `Persistent bubble games look sleepy until a **fat bubble** climbs high ... then whiffing the coin alignment stings. Don't chase **row 1** junk.`,
      risk_bullets: [],
      where_to_find: wtf('Bubble Blast'),
      skins_markdown: '',
      gameplay_mechanics: `**Bubble Blast** (IGT) uses **rising bubble prizes** on a standard reel layout. **Coins** under a bubble pay the bubble value.`,
    },
  },
  {
    machine: {
      slug: 'bubble-mania',
      name: 'Bubble Mania',
      manufacturer: 'AGS',
      type: 'Persistent Bubble Pop',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Uncommon AGS bubble title; not IGT Bubble Blast.',
      release_year: null,
    },
    guide: {
      title: 'Bubble Mania',
      published: true,
      card_ev_threshold: 'Playable bubbles **≥4× bet** · ignore row 1',
      when_to_play: `**Primary play:** bubbles on the field **≥4× your bet**. **Ignore row 1.**

**AGS bubble-pop** game ... floating bubbles hold **instant cash**, **multipliers**, or **bonus entry**. Free spins bump bubble frequency ... same row rule applies.`,
      when_to_stop: `Stop after a **pop** that clears your target bubbles, or when values fall below **4× bet**.`,
      how_to_check: `1. Scan **bubble values** (ignore bottom row).
2. Note whether you're in **base** or **free spins** (more bubbles in feature).
3. Don't confuse with **IGT Bubble Blast** ... different manufacturer, different threshold (**4×** vs **5×**).`,
      risk_bankroll: `**40–80 units** typical for a short bubble chase at common bets.`,
      risk_summary: `Looks like a kid's game ... still a **persistent pop** hunt. Thin bubbles in row 1 are noise.`,
      risk_bullets: [],
      where_to_find: wtf('Bubble Mania', { vegas: WTF_VEGAS_AGS, regions: WTF_REGIONS_AGS }),
      skins_markdown: '',
      gameplay_mechanics: `**Bubble Mania** (AGS) awards prizes when you **pop bubbles** holding credits or feature entry. **Free spins** increase bubble density.

**Separate from IGT Bubble Blast** ... lower **× bet** floor here (**4×**).`,
    },
  },
  {
    machine: {
      slug: 'buffalo-cash',
      name: 'Buffalo Cash',
      manufacturer: 'Aristocrat',
      type: 'Buffalo Collect MHB',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'Common where Aristocrat Buffalo banks live.',
      release_year: 2022,
    },
    guide: {
      title: 'Buffalo Cash',
      published: true,
      card_ev_threshold: '**1,300–1,450** buffalos on Buffalo Collect meter',
      when_to_play: `**Primary play:** **1,300–1,450 buffalos** on the **Buffalo Collect Must-Hit-By** meter (feature guaranteed before **1,800**). Same take band as **Buffalo Link**.

**Buffalo Cash** is the successor ... same AP shape, different bet/jackpot packaging.

**Hold & Spin**, **Free Games** (**2×/3×** wild reel 5), and **Grand** for a full **20-buffalo** screen still matter ... but the **collect meter** is the hunt.`,
      when_to_stop: `Stop when the **collect feature** fires and resolves ... meter resets for the next chase.`,
      how_to_check: `1. Read the **Buffalo Collect** meter front and center.
2. Cycle **denoms** ... persistence is per bet level (same pain as Buffalo Link).
3. Confirm you're on **Buffalo Cash**, not legacy **Buffalo Link** art-only swap.`,
      risk_bankroll: `**500 units** minimum for a collect chase (Buffalo Link-grade variance).`,
      risk_summary: `**Massively volatile.** Misidentifying the title or bet level wastes hours. Progressives in **Hold & Spin** can distract from the collect chase.`,
      risk_bullets: [],
      where_to_find: wtf('Buffalo Cash', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: `Successor to **Buffalo Link** (same chase, new bets/jackpots).`,
      gameplay_mechanics: `**Buffalo Cash** (Aristocrat **2022**) keeps the **Buffalo ways** core with **Hold & Spin** cash-on-reel, **Free Games**, and a visible **Buffalo Collect MHB** to **1,800**.

**Grand:** full **20-buffalo** screen (top progressive tier varies by install).`,
    },
  },
  {
    machine: {
      slug: 'buffalo-diamond',
      name: 'Buffalo Diamond',
      manufacturer: 'Aristocrat',
      type: 'Progressive Free Games Meters',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: 'Common nationally on Aristocrat floors.',
      release_year: 2018,
    },
    guide: {
      title: 'Buffalo Diamond',
      published: true,
      card_ev_threshold: 'Green **2× 20+** · blue/purple **50–60+** free games on bet pad',
      when_to_play: `**Primary play (smaller bankroll):** **2× green at 20+** games (**25+** on small bets).

**Bigger bankroll:** **blue/purple at 50–60+** ... can run **100+** games stacked.

Three **uncapped free-games meters** per bet (**2× green**, **3× blue**, **4× purple**). **Diamonds on reel 5** feed the meters. Bonus pays **accumulated spins × that multiplier**, then resets to **7** ... **not** must-hit-by (high count doesn't force a trigger).

Some APs still quote **30 / 90 / 150** on the old scale ... the cleaner edge usually starts at **green 2× 20+**.`,
      when_to_stop: `Stop once the **free games bonus** at your target multiplier finishes.`,
      how_to_check: `1. **Bet pad** shows **green / blue / purple** counts for **each bet level**.
2. Cycle **all denoms** ... this is a pain-in-the-ass scout game.
3. **Reel 5 diamonds** are what inflate the meter during the chase.`,
      risk_bankroll: `**750 units** if you're chasing blue/purple. Easy to drop **100×+** without the feature paying like you hoped.`,
      risk_summary: `**Extreme volatility** (**2,400 ways**, **4-5-6-5-4** reels). High meter only means **bigger bonus IF it hits** ... not higher trigger chance.

Without a big bankroll, **stick to green 2×**.`,
      risk_bullets: [],
      where_to_find: wtf('Buffalo Diamond', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: '',
      gameplay_mechanics: `**Buffalo Diamond** runs **three progressive free-spin counters** per bet. Trigger awards all accumulated spins at **2×, 3×, or 4×** depending which meter fired.

**Not must-hit-by:** a high meter count does not force a trigger.`,
    },
  },
  {
    machine: {
      slug: 'buffalo-diamond-extreme',
      name: 'Buffalo Diamond Extreme',
      manufacturer: 'Aristocrat',
      type: 'Progressive Free Games + Extreme Column',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: 'Common where Buffalo Diamond banks upgraded.',
      release_year: 2022,
    },
    guide: {
      title: 'Buffalo Diamond Extreme',
      published: true,
      card_ev_threshold: 'Same meters as Buffalo Diamond · **Extreme** symbol col 3 +2 coins = forced multiplier FG',
      when_to_play: `**Primary play:** same **2× / 3× / 4×** diamond meters as **Buffalo Diamond** ... **green 20+**, **blue/purple 50–60+**.

**Premium spot:** **Extreme symbol in column 3** with **+2 coins** showing ... guarantees **multiplier free games** on that hit.

Without bankroll for blue/purple, **green 2× only** ... Extreme column hits are gravy, not required.`,
      when_to_stop: `Stop after your **multiplier free games** session ends.`,
      how_to_check: `1. Same **bet-pad meter read** as Buffalo Diamond.
2. Watch **column 3** for **Extreme** symbol + coin count.
3. **Gold scatters** still feed the **Extreme Bonus Wheel**.`,
      risk_bankroll: `**750 units** for blue/purple. **200–300 units** if you stay on **2× green** only.`,
      risk_summary: `**Buffalo Diamond** volatility with an extra **forced-hit lane** in col 3. Can be generous ... can also eat **100×+** while you wait for Extreme alignment.`,
      risk_bullets: [],
      where_to_find: wtf('Buffalo Diamond Extreme', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: `**Buffalo Diamond Extreme**`,
      gameplay_mechanics: `**Buffalo Diamond Extreme** adds an **Extreme symbol** in **column 3**. **+2 coins** with Extreme showing forces **multiplier free games**.

Otherwise identical **diamond-on-reel-5** meter buildup and **2×/3×/4×** payout structure as **Buffalo Diamond**.`,
    },
  },
  {
    machine: {
      slug: 'buffalo-instant-hit',
      name: 'Buffalo Instant Hit',
      manufacturer: 'Aristocrat',
      type: 'Grid Instant Hit + Wheel',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Very high',
      popularity_summary: 'Uncommon; strong points play when grid is set.',
      release_year: 2022,
    },
    guide: {
      title: 'Buffalo Instant Hit',
      published: true,
      card_ev_threshold: '**Two wheel bonuses** in column **4** grid (primary)',
      when_to_play: `**Primary play:** **two wheel bonuses in column 4**.

**Premium:** wheel in **column 3**. Single col-4 wheel can work on strong RTP/points floors ... higher variance.

**Prize grid** above the reels mirrors reel positions. **Instant-hit symbols** (including **2×/3× wilds**) on **cols 1–2+** pay matching grid prizes. **Wheel bonuses** only in **columns 4–5** (always one in **col 5**).

**Buffalo/wild line** reaching **col 4+** triggers the wheel. A **credit hit in col 4** kills the play (column resets).`,
      when_to_stop: `Stop after the **wheel bonus** resolves or a **grid instant hit** clears your setup.`,
      how_to_check: `1. Read **grid prizes** above **cols 3–5** (ladder gets meaner left-to-right).
2. Count **wheel symbols** in **col 4** vs **col 5**.
3. Scout **without coin-in** (bet-down **4×**) when the cabinet allows.
4. **Wild multipliers** count as instant hits and multiply wheel credits.`,
      risk_bankroll: `**100–150 units** for a wheel chase at common bets.`,
      risk_summary: `Volatile grid game that's **excellent for points** when the ladder is stacked. **Col 4 credit hits** are how good setups die ... watch the column reset rule.`,
      risk_bullets: [],
      where_to_find: wtf('Buffalo Instant Hit', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: '',
      gameplay_mechanics: `**Buffalo Instant Hit** (Aristocrat **RELM**, **2022**) pairs a **Buffalo ways** base with a **grid instant-hit** layer and **wheel bonuses** in the right columns.

**Bets:** **60–300 credits**, denom **1¢–10¢**. Grid prizes **reset per column** after a hit there.`,
    },
  },
]
