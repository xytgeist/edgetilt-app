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
export const BATCH2_PAYLOADS = [
  {
    machine: {
      slug: 'buffalo-power-pay',
      name: 'Buffalo Power Pay',
      manufacturer: 'Aristocrat',
      type: 'Progressive Free Games + Power Pay',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'High',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: '2024 King Max title; multi-denom meter chase.',
      release_year: 2024,
    },
    guide: {
      title: 'Buffalo Power Pay',
      published: true,
      card_ev_threshold: 'Major / mega FG counts via your math · resets major 30 / mega 50',
      when_to_play: `**Primary play:** run **major/mega FG equity** before you sit ... no single count works on every bank.

**Progressive free-game meters** on **major** and **mega** only ... **mini/minor** sit at fixed **20/25** FG and do not increment.

**Resets:** major **30**, mega **50** (cap **2,000**).

**Instant-feature buys** (not on all configs) can tick meters **+1/+2/+3/+5/+10** FG ... know if your cabinet has them.

Some installs split **grand-eligible** vs **non-eligible** bet tiers ... can swing EV a few points.`,
      when_to_stop: `Stop after your **wheel / free games** chase resolves at the tier you entered.`,
      how_to_check: `1. Read **major + mega FG counts** on the bet pad for **every denom**.
2. Note whether **instant buy** buttons exist.
3. Confirm **grand eligibility** on your bet level if the glass splits tiers.`,
      risk_bankroll: `**1500–2500 units** ... major/mega FG grinds are advanced-only brutal variance.`,
      risk_summary: `**Power Pay** expanding windows and **$1M link** noise can distract from the FG meter grind.

Configs **without instant buy** can sit high for a long time ... do not assume meters move like Buffalo Link.`,
      risk_bullets: [],
      where_to_find: wtf('Buffalo Power Pay', {
        vegas: WTF_VEGAS_ARISTOCRAT_BUFFALO,
        regions: WTF_REGIONS_ARISTOCRAT_HEAVY,
      }),
      skins_markdown: '',
      gameplay_mechanics: `**Buffalo Power Pay** (Aristocrat **2024**) stacks **progressive mega/major free-game meters**, **Power Pay** reel expansion, wheel prizes (**mini–power grand**), and link jackpots.

**Mini/minor** meters sit at fixed **20/25** free games and do not increment.`,
    },
  },
  {
    machine: {
      slug: 'bustin-money',
      name: "Bustin' Money",
      manufacturer: 'Ainsworth',
      type: 'Triple Safe Persistent',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: 'Under-played Ainsworth TOP-style title.',
      release_year: 2024,
    },
    guide: {
      title: "Bustin' Money",
      published: true,
      card_ev_threshold: 'Combo **12+ pts** · or solo red FG **22+** / blue mult **10×+**',
      when_to_play: `**Primary play:** **combo 12+ points** on the three safes.

**Solo shortcuts:** **red 22+ FG**, **blue 10×+** ... **green ways alone** is not a play.

Three persistent **safes**: **red** (free games), **green** (ways up to **3,087**), **blue** (mult up to **10×**). **Bustin' Money** symbols feed them.

**Combo scoring:**
- **Red FG** above **10** ... **17 FG = 7 pts**
- **Green ways:** **576 / 1125 / 1944 / 3087** = **0 / 2 / 4 / 6 pts**
- **Blue mult 2×–10×** = **0–12 pts**

**All three maxed** → **jackpot coin-collect** feature (repeatable **mini–grand**).`,
      when_to_stop: `Stop after the **coin-collect jackpot feature** or your target safe combo triggers and finishes.`,
      how_to_check: `1. Score **all three safes** on the bet pad before you spin.
2. Cycle **every bet/denom** ... fat safes on big bets still have the same trigger odds.
3. Resets: red **10 FG**, green **576 ways**, blue **2×**.`,
      risk_bankroll: `**750 units** ... extreme variance even on good-looking safes.`,
      risk_summary: `Safes can look **fatter on large bets** without improving hit rate ... classic trap.

**RLP-adjacent** grind ... long droughts between coin-collect hits are normal.`,
      risk_bullets: [],
      where_to_find: wtf("Bustin' Money", { regions: WTF_REGIONS_AINSWORTH_COMMON }),
      skins_markdown: '',
      gameplay_mechanics: `**Bustin' Money** (Ainsworth) runs three linked safes that persist across spins until features fire.

**Jackpot coin-collect** when all three safes are topped ... separate from the **12-point** combo entry math.`,
    },
  },
  {
    machine: {
      slug: 'cai-fu-long',
      name: 'Cai Fu Long',
      manufacturer: 'Light & Wonder',
      type: 'Locking Coin Timer',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Aztec Adventures cousin; Bonus Boost bet variants.',
      release_year: null,
    },
    guide: {
      title: 'Cai Fu Long',
      published: true,
      card_ev_threshold: '**1 spin left** on coin lock · coin-count rules by Boost vs non-Boost',
      when_to_play: `**Primary play:** **last spin** on the coin lock when coin count + reel placement clears your rules.

Coins **lock for 3 spins** (timer resets when a new coin lands). **6 coins** → **Hold & Spin** ... otherwise locked coins go **wild on the final spin** unless H&S triggers first.

**Bonus Boost bets** (labeled on bet pad):
- **1 coin:** never
- **2 coins:** coin in **reels 1–3**
- **3–5 coins:** always

**Non-Boost:**
- **1:** never
- **2:** two coins in **reels 1–3** on **different reels**
- **3:** one coin in **reels 1–3**
- **4–5:** always

Boost bets get **2× free-spin frequency** and different reel sets ... same coin-count rules, slightly more playable density.`,
      when_to_stop: `Stop after **Hold & Spin** or the **final-spin wild** resolves.`,
      how_to_check: `1. Count **locked coins** and **spins remaining** on the timer.
2. Note **Bonus Boost** label above qualifying bets.
3. Dragon dumps can add up to **15 base coins** or **1–2 in H&S**.`,
      risk_bankroll: `**100–200 units** ... timer locks eat spins fast when the last spin whiffs.`,
      risk_summary: `Cousin to **Aztec Adventures** but coins **always wild on final spin** here ... different density rules by lock count.

Misreading **Boost vs standard** bet rules is the expensive mistake.`,
      risk_bullets: [],
      where_to_find: wtf('Cai Fu Long', { vegas: WTF_VEGAS_LNW_COMMON, regions: WTF_REGIONS_LNW_HEAVY }),
      skins_markdown: '',
      gameplay_mechanics: `**Cai Fu Long** uses **locking coins**, a **3-spin countdown**, and **Hold & Spin** at **6 coins**.

**Final spin:** unlocked coins turn wild if H&S did not fire.`,
    },
  },
  {
    machine: {
      slug: 'captain-riches-tiki-fortune',
      name: 'Captain Riches / Tiki Fortune',
      manufacturer: 'AGS',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'AGS 2021 coin-holder family; fake 2-coin trap.',
      release_year: 2021,
    },
    guide: {
      title: 'Captain Riches / Tiki Fortune',
      published: true,
      card_ev_threshold: 'Mult coins on reels **2+3 ≥10×** · active wild reel 2/3 · never play triple 2-coin fake',
      when_to_play: `**Primary play:**
- **Reels 2 + 3** multiplier sum **≥10×**
- **Active wild** on **reel 2 or 3** (gold border + spin countdown)
- **Reel 4 wild** only if **2×/3× mult coins** sit above it

**Never** play just because **two coins show in all three holders** ... the third coin is much harder than it looks.

**Coin holders** above **reels 2–4**. Plain coin = **1×**, multiplier coins add up. **Three coins** = full **wild reel for 3 spins**.`,
      when_to_stop: `Stop after the **3-spin wild reel** sequence ends.`,
      how_to_check: `1. Tap **bet pad** to scout without coin-in when allowed.
2. Add **mult values** on reels **2 and 3** only for the primary rule.
3. Jackpot pick exists ... chest/tiki **reveal count is cosmetic**.`,
      risk_bankroll: `**50 units** for a short wild-reel chase at common bets.`,
      risk_summary: `**Borderline trap game.** The **2-coin on every reel** look is everywhere and usually garbage.

Harder than **Golden Egypt** to stack multiple wild reels at once.`,
      risk_bullets: [],
      where_to_find: wtf('Captain Riches / Tiki Fortune', {
        vegas: WTF_VEGAS_AGS,
        regions: WTF_REGIONS_AGS,
      }),
      skins_markdown: `**Captain Riches**, **Tiki Fortune**, **Mine Blast**.`,
      gameplay_mechanics: `**Captain Riches / Tiki Fortune / Mine Blast** (AGS) share one engine: **coin holders**, **mult coins**, **3-spin full wild reels**.

**RTP band** roughly **85–96%** depending on install.`,
    },
  },
  {
    machine: {
      slug: 'cash-burst-orb-of-atlantis-force-of-babylon',
      name: 'Cash Burst: Orb of Atlantis / Force of Babylon',
      manufacturer: 'Light & Wonder',
      type: 'Rising Orb Credits',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium-high (short chase)',
      popularity_summary: '2020 L&W orb family; multi-denom.',
      release_year: 2020,
    },
    guide: {
      title: 'Cash Burst: Orb of Atlantis / Force of Babylon',
      published: true,
      card_ev_threshold: 'Orb credits sum **≥10× bet** (ignore top row) · or **3+ orbs each ≥5×**',
      when_to_play: `**Primary play:** sum of orb values **≥10× bet** (ignore top row).

**Alternate:** **3+ orbs** each worth **≥5× bet**.

**Credit orbs** float **up one row per spin**. Pay when an orb aligns with a **Cash Burst symbol on reel 3**. **Ignore the top row.**

Orbs can **re-hit** after a collect ... reel position does not matter.`,
      when_to_stop: `Stop after a **Burst collect** clears your orb setup (or values fall below threshold).`,
      how_to_check: `1. Add orb **× bet** values excluding the top row.
2. Cycle **all denoms** without coin-in when the cabinet allows.
3. Orbs often arrive in **spurts** ... do not chase one lonely small orb.`,
      risk_bankroll: `**20–40 units** ... orbs usually clear in a few spins once Burst hits or misses.`,
      risk_summary: `Frustrating hit rate on reel 3 alignment ... big when it connects.

Multi-denom scouting is mandatory.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Burst: Orb of Atlantis / Force of Babylon', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Orb of Atlantis**, **Force of Babylon**.`,
      gameplay_mechanics: `**Cash Burst** family (**2020**): rising **credit orbs** + **reel 3 Burst symbol** alignment for the collect.`,
    },
  },
  {
    machine: {
      slug: 'cash-cano-roman-riches-tiki',
      name: 'Cash Cano: Roman Riches / Tiki',
      manufacturer: 'Light & Wonder',
      type: 'Gem Row Hold & Spin',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Four gem rows + volcano boosts.',
      release_year: null,
    },
    guide: {
      title: 'Cash Cano: Roman Riches / Tiki',
      published: true,
      card_ev_threshold: 'Two rows with **3 gems** · or one row **3 gems** + minor/maxi/major sum **≥45× bet**',
      when_to_play: `**Primary play (one row):** **3 gems** in a row when **minor + maxi + major** gem credits sum **≥45× bet**.

**Safe (rare):** any **two rows** with **3 gems** collected.

**Never** play with only **2 gems in every row** ... that state is everywhere and it is a trap.

Four **gem rows** (**minor / maxi / major / grand**) with credit prizes + linked jackpots.

**Cash Cano** triggers from gems on **all three middle reels** → **hold & spin** (**3-spin reset**).`,
      when_to_stop: `Stop after **Cash Cano** (and any cascade unlocks) finishes.`,
      how_to_check: `1. Count gems **per row** ... need **3 in a row** for the one-row math.
2. Sum **minor/maxi/major credits** in × bet terms.
3. **Volcano** can boost gem values mid-chase.`,
      risk_bankroll: `**300–500 units** ... long droughts between Cano triggers are normal.`,
      risk_summary: `Post-feature: rows clear, **2+ random gems** respawn ... cascade unlocks feel great but eat coin-in.

**Free spins** can chain into Cano ... know which mode you are buying.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Cano: Roman Riches / Tiki', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Roman Riches**, **Tiki**.`,
      gameplay_mechanics: `**Cash Cano** unlocks rows at **9 / 12 / 15 / 18** gems (**minor → grand**). **Hold & spin** resets **3 spins** on new gems.`,
    },
  },
  {
    machine: {
      slug: 'cash-eruption',
      name: 'Cash Eruption',
      manufacturer: 'Spielo',
      type: 'Multi-Game Progressive Bank',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Legacy Spielo bank; cycling edge.',
      release_year: null,
    },
    guide: {
      title: 'Cash Eruption',
      published: true,
      card_ev_threshold: 'Hot / Hotter / Hottest at playable numbers · cycle trick when meters dead',
      when_to_play: `**Primary play:** **Hot / Hotter / Hottest** show **playable counts** for your RTP target.

**Four selectable game skins** share one **Hot / Hotter / Hottest** progressive ladder. Base bonuses (**Rumble, Boulder, Lava Spins, Volcano**) are noise ... AP is the **prog ladder** only.

**Cycle trick:** one **min bet spin** on **each of the 4 games** (**$2 total** on common penny setup) can force a **lower progressive tier** ... use when meters look dead, after a long session with no prog hit, or while nursing a hot meter (cycle periodically).`,
      when_to_stop: `Stop after a **Hot/Hotter/Hottest** hit or when cycling no longer improves your ladder read.`,
      how_to_check: `1. Read **prog counts** on the shared ladder.
2. Note **fast meter rise** (~**$0.60 / $1.00** per penny tick on Hot/Hotter on many installs).
3. **Multiplier bonus** up to **5×** on prog wins ... factor that in.`,
      risk_bankroll: `**500 units** for a prog ladder chase. Cycling four skins costs **$2** per pass on top.`,
      risk_summary: `Not a persistent coin game ... the **skin-switch cycle** is the quirky edge.

Random base features will eat coin-in if you forget what you are chasing.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Eruption', `- Older commercial and tribal floors; limited Vegas footprint.`),
      skins_markdown: `Four selectable **Cash Eruption** game skins on one progressive bank.`,
      gameplay_mechanics: `**Cash Eruption** (Spielo) bundles **four themes** on shared **Hot / Hotter / Hottest** progressives with fast meter movement.`,
    },
  },
  {
    machine: {
      slug: 'cash-falls-huo-zhu-pirate-s-trove-island-bounty-outback-bounty',
      name: 'Cash Falls',
      manufacturer: 'Light & Wonder',
      type: 'Sticky Coin Timers',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Popular 2020 L&W family; online empty-board edge.',
      release_year: 2020,
    },
    guide: {
      title: 'Cash Falls',
      published: true,
      card_ev_threshold: 'One-away reels **3–5** · or **1+2** both one-away · empty **R1–4** board',
      when_to_play: `**Primary play (heuristic):**
- **Reels 3–5** one coin from full, **OR**
- **Reels 1 + 2** both one away

**Advanced sums:** one-away reels total **≥6× bet**; two-away reels **≥25× bet**.

**Empty-board premium:** **R1–4 completely empty** (R5 ok) ... stop the moment cash sticks on **R1–4**. Highest EV band when you catch it.

**Sticky coins** + **3-spin reel timers**. Fill a reel = collect all credits on that column. **Bet pad blue glow** = one-away levels.`,
      when_to_stop: `Stop when your **target reel fills** or an empty-board play gets **broken** by an early stick on **R1–4**.`,
      how_to_check: `1. Cycle **all denoms** ... timers are per bet.
2. Read **one-away vs two-away** per reel.
3. Watch **major/mega ball** caveats on **$20+** stakes.`,
      risk_bankroll: `**500 units** if you are running fill strategy chases.`,
      risk_summary: `Not hugely lucrative on average ... but **bounded loss** per chase vs open-ended grinds.

Works on some **online** clones for empty-board cycling ... live floor still needs bet-pad discipline.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Falls', {
        vegas: WTF_VEGAS_LNW_COMMON,
        regions: WTF_REGIONS_LNW_HEAVY,
      }),
      skins_markdown: `**Huo Zhu**, **Pirate's Trove**, **Island Bounty**, **Outback Bounty**.`,
      gameplay_mechanics: `**Cash Falls** (**2020**, Light & Wonder) uses **sticky coins**, **per-reel 3-spin timers**, and collect-on-fill when a reel fills.`,
    },
  },
  {
    machine: {
      slug: 'cash-quest',
      name: 'Cash Quest',
      manufacturer: 'Gaming Arts',
      type: '243-Ways Adventure',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'No persistent-state AP hunt documented.',
      release_year: null,
    },
    guide: {
      title: 'Cash Quest',
      published: true,
      card_ev_threshold: 'No persistent AP method · skip for meter hunts',
      when_to_play: `**Skip for AP** unless you are just clocking entertainment.

**Cash Quest** is **243 ways** adventure fluff ... collect **sword/key** items, battle enemies for credits/wilds, **8 free games** with **1–7 guaranteed wilds** per spin (~**40%** hit rate). No documented **persistent-state** edge in field use today.

Optional **Rocket Rollup MHB** progressive on some installs ... that is a **separate prog hunt**, not a coin-persistence play on this write-up.`,
      when_to_stop: `No AP stop rule.`,
      how_to_check: `1. Confirm you are not confusing this with a **persistent coin** title.
2. If chasing **Rocket Rollup**, read that progressive like any other MHB ladder.`,
      risk_bankroll: `**0 units — skip.** Not an AP hunt.`,
      risk_summary: `Publishing this so you do not waste time scouting a **non-AP** cabinet thinking it is another **Cash Falls** clone.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Quest', `- Sparse installs nationally.`),
      skins_markdown: '',
      gameplay_mechanics: `**Cash Quest** (Gaming Arts) uses **item collection**, **battle bonuses**, and **free games** with guaranteed wilds per spin.`,
    },
  },
  {
    machine: {
      slug: 'cash-up-jackpots',
      name: 'Cash Up Jackpots',
      manufacturer: 'IGT',
      type: 'Banked Cash Up Symbols',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low (found money)',
      popularity_summary: 'Rare abandoned-symbol finds; 2024 IGT.',
      release_year: 2024,
    },
    guide: {
      title: 'Cash Up Jackpots',
      published: true,
      card_ev_threshold: 'Any banked **Cash Up** symbols on max-bet line · spend, never spin to build',
      when_to_play: `**Primary play:** if you see banked **Cash Up** symbols on the max-bet row, **play immediately**. Do **not** spin to accumulate.

**3-reel Cash Up** ... symbols **only bank at max bet** (up to **16** stored on the line).

**5+ symbols:** always buy the **5-symbol tier** (not five **1-symbol** buys).

**4 symbols:** buy **3-tier + 1-tier** ... do not grind for a fifth.

Leftover symbols survive cash-out ... casuals abandon them constantly.`,
      when_to_stop: `Stop after you **spend the banked symbols** through the bonus tiers.`,
      how_to_check: `1. Quick **bet-pad scan** across **denoms** and line counts (**5 vs 9 line** variants).
2. Confirm **max bet** row shows stored symbols.
3. Bonuses mix **credit picks**, **2× mult**, and **Cash Again** retriggers ... **2×** can hit jackpots.`,
      risk_bankroll: `**1–10 units max** ... you are spending banked symbols, not grinding coin-in.`,
      risk_summary: `Quiet edge because most players do not scan max-bet rows.

Rare finds ... extremely profitable when present.`,
      risk_bullets: [],
      where_to_find: wtf('Cash Up Jackpots', `- Rare **IGT** 3-reel installs.`),
      skins_markdown: '',
      gameplay_mechanics: `**Cash Up Jackpots** (IGT **2024**) banks **Cash Up symbols** at **max bet only**, then spends **1 / 3 / 5** symbols for three bonus tiers.`,
    },
  },
]
