/** Batch 24 synth payloads. `tiki-fortune` omitted - shipped as **`captain-riches-tiki-fortune`** (batch 2). */
/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH24_PAYLOADS = [
  {
    machine: {
      slug: 'temple-falls-boost-blast-jungle-adventure',
      name: 'Temple Falls / Boost Blast / Jungle Adventure',
      manufacturer: 'Incredible Technologies',
      type: 'Persistent 5×7 Coin Grid',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Bottom 2 rows ≥65× · any 200× red coin',
      release_year: null,
    },
    guide: {
      title: 'Temple Falls / Boost Blast / Jungle Adventure',
      published: true,
      card_ev_threshold: 'Bottom 2 rows ≥65× bet (wheels 35×) · any 200× red coin',
      when_to_play: `**Primary play:**

- **Any 200× red coin** anywhere on the **5×7 grid**
- **Bottom two rows** total **≥65× bet** (count **wheel coins as 35×**)

Coins are **0.625×–200×**; **12.5×+** show a **red background**. **Coin Collect** drops bottom-row coins when a collect lands on the reels.`,
      when_to_stop: `Stop after the **coin collect / wheel** chase clears your grid setup or values fall below threshold.`,
      how_to_check: `Persistent coin grid is above the reels. Add bottom-row values (wheels at **35×**). Cycle through all bets/denoms.`,
      risk_bankroll: `**250 units**`,
      risk_summary: `**Symbol Upgrade** can pay huge but is **not** the coin-grid AP ... do not chase bowls / pile imagery alone.`,
      risk_bullets: [],
      skins_markdown: `**Temple Falls**, **Boost Blast**, **Jungle Adventure**.`,
      gameplay_mechanics: `**Temple Falls / Boost Blast / Jungle Adventure** (Incredible Technologies) keeps a **5×7 persistent coin grid** above the reels. **3/4/5 waterfall scatters** launch **Coin Collect** feature spins; awarded bottom-row coins drop and stacks shift down. **Wheel coins** spin for Mini/Minor/Major/Grand jackpots.`,
    },
  },
  {
    machine: {
      slug: 'the-brave-spirit-the-great-tiki',
      name: 'The Brave Spirit / The Great Tiki',
      manufacturer: 'Aruze Gaming',
      type: 'Progressive Free Games Meters',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Brave Spirit Mini 50+ · Great Tiki Mini+Minor 130+',
      release_year: null,
    },
    guide: {
      title: 'The Brave Spirit / The Great Tiki',
      published: true,
      card_ev_threshold: 'Brave Spirit Mini 50+ · Great Tiki Mini+Minor 130+',
      when_to_play: `**Primary play:**

### The Brave Spirit
- **Mini (green) at 50+**
- **Minor (blue) at 80+**

### The Great Tiki
- **Mini + Minor combined at 130–140+**
- **Mini alone at 65–75+** · **Minor alone at 85–95+**
- **Major at 120–130+** · **Grand at 170–180+** (caps at **199**)

**1024 ways**, **5×4**. Optional **wild-multiplier side bet** (**2×–7×**) raises bonus volatility if you chase it.`,
      when_to_stop: `Stop after the **progressive free-games tier** you chased awards.`,
      how_to_check: `Mini / Minor / Major / Grand meter counts are on the top screen. Cycle through all bets/denoms.`,
      risk_bankroll: `**100 units**`,
      risk_summary: `Raising the **wild-multiplier bet** mid-chase changes bonus math ... pick your side-bet level before you commit.`,
      risk_bullets: [],
      skins_markdown: `**The Brave Spirit**, **The Great Tiki**.`,
      gameplay_mechanics: `**The Brave Spirit / The Great Tiki** (Aruze) run **four progressive free-games meters** (Mini–Grand). Symbol hits while a tier is active add to that meter; trigger pays accumulated spins (up to **999**) with enhanced wild multipliers when the side bet is raised.`,
    },
  },
  {
    machine: {
      slug: 'thors-thunder',
      name: "Thor's Thunder",
      manufacturer: 'Unknown',
      type: 'Storm Mode Persistent State',
      difficulty: 'Intermediate',
      popularity: 'Rare',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Storm Mode active on bet pad',
      release_year: null,
    },
    guide: {
      title: "Thor's Thunder",
      published: true,
      card_ev_threshold: 'Storm Mode active (red text on bet pad)',
      when_to_play: `**Primary play:**

- **Storm Mode active** on your bet level ... **"Storm Mode"** above the reels and **red highlighted text** on the **bet pad**

Keep playing paid spins until **Storm Mode** ends. **Thor in center** pays all credit prizes / jackpots / free-game symbols on other positions; **Hyper Spin** dumps extra credits more often during the mode.`,
      when_to_stop: `Stop when **Storm Mode** ends (lasts up to **10** spins but can end early with no counter).`,
      how_to_check: `Glance at the **bet pad** for **red text** on the active bet. Tap **2¢ / 5¢** on the main screen to scout other denoms, then recheck the pad.`,
      risk_bankroll: `**20 units**`,
      risk_summary: `**No spin counter** during Storm Mode ... the feature can end after one paid spin or run the full window.`,
      risk_bullets: [],
      skins_markdown: `**Thor's Thunder**.`,
      gameplay_mechanics: `**Thor's Thunder** awards credit prizes when **Thor lands center** and collects values on surrounding positions. Random **Hyper Spin** hammer dumps credit symbols. **Storm** symbol with center Thor enters **Storm Mode** (boosted Hyper Spin + Thor frequency).`,
    },
  },
  {
    machine: {
      slug: 'thunder-cash',
      name: 'Thunder Cash',
      manufacturer: 'Ainsworth',
      type: 'Must-Hit-By Minor Progressive',
      difficulty: 'Beginner',
      popularity: 'Very Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Minor MHB ≥475 (95%)',
      release_year: 2013,
    },
    guide: {
      title: 'Thunder Cash',
      published: true,
      card_ev_threshold: 'Minor progressive ≥475 (95% of cap)',
      when_to_play: `**Primary play:**

- **Minor mystery progressive at 475+** (**95%** of ceiling)

Classic **5×3** with configurable **5/10/20** lines. **Sticky wilds** during scatters are gravy ... the AP is the **must-hit minor**.`,
      when_to_stop: `Stop after the **minor progressive** you chased awards.`,
      how_to_check: `Minor progressive meter is on the cabinet. Cycle through all bets/denoms.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `Ploppy competition picks up near **475** on busy floors ... do not wander mid-chase.`,
      risk_bullets: [],
      skins_markdown: `**Thunder Cash**.`,
      gameplay_mechanics: `**Thunder Cash** (Ainsworth, **2013**) runs optional **Major / Minor must-hit-by** jackpots plus **8** sticky-wild free games on **3+ Thunder Cash scatters** with **+5** on retrigger.`,
    },
  },
  {
    machine: {
      slug: 'tian-ci-jin-lu-emperor-phoenix',
      name: 'Tian Ci Jin Lu: Emperor / Phoenix',
      manufacturer: 'Aristocrat',
      type: 'Must-Hit-By $300 Progressive',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Extreme',
      popularity_summary: 'Center MHB ≥285 · $273.85+ at 85% RTP',
      release_year: 2021,
    },
    guide: {
      title: 'Tian Ci Jin Lu: Emperor / Phoenix',
      published: true,
      card_ev_threshold: 'Center MHB ≥285 · breakeven $273.85+ at 85% RTP',
      when_to_play: `**Primary play:**

- **Center must-hit-by at $285+** (resets **$100**, cap **$300**)

If floor RTP is unknown, assume **85%** and wait for **$273.85+**. Wait higher when you know RTP is above **85%**.

**Only the center MHB** is AP ... ignore Grand/Major/Minor/Mini ladders. Spin **minimum qualifying bet**.`,
      when_to_stop: `Stop after the **center MHB** hits or the meter falls below your entry.`,
      how_to_check: `Center-top **MHB meter** only. **Stair / stack coins** beside the reels are **cosmetic**. Cycle through all bets/denoms.`,
      risk_bankroll: `**1500 units**`,
      risk_summary: `**Stair coin stacks** look like progress but do **not** move the MHB ... scout the center meter only.`,
      risk_bullets: [],
      skins_markdown: `**Tian Ci Jin Lu: Emperor**, **Phoenix**.`,
      gameplay_mechanics: `**Tian Ci Jin Lu: Emperor / Phoenix** (Aristocrat, **2021**) is **243 ways** with a fair **$100–$300 must-hit-by** progressive fed by **coin symbol values** (not a fixed per-spin tick). Hold & Spin and pick bonuses are volatile side features.`,
    },
  },
  {
    machine: {
      slug: 'tic-tac-go',
      name: 'Tic Tac Go',
      manufacturer: 'Gaming Arts',
      type: 'Persistent Tic-Tac-Toe Board',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Board total ≥27× bet',
      release_year: null,
    },
    guide: {
      title: 'Tic Tac Go',
      published: true,
      card_ev_threshold: 'Board total ≥27× bet (pad bet if Rocket Rollup)',
      when_to_play: `**Primary play:**

- **Total board value ≥27× bet** (all **X** and **O** credits + jackpots on the board)

**Rocket Rollup** installs: multiply using the **bet pad** amount, not the main-screen total (extra progressive ante is not part of the **27×** math).

**Never play:** **9/9 full board** or **3-in-a-row already won** ... the board clears next spin.

**Go symbol in center** pays the **entire board** immediately.`,
      when_to_stop: `Stop after the **winning color pays** and the board resets, or equity falls below threshold.`,
      how_to_check: `Sum **X/O** values (**1×–10×** each) plus jackpots on the board. Menu icon → up/down arrows cycle bets without a ticket. Cycle through all bets/denoms.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `When one color **cannot win** (blocked spots), a fat jackpot on that color is **worthless** ... tighten entry or skip.`,
      risk_bullets: [],
      skins_markdown: `Optional **Rocket Rollup MHB** top-box variant.`,
      gameplay_mechanics: `**Tic Tac Go** (Gaming Arts) lands **X** and **O** symbols onto a **3×3 board** with credit prizes or Minor/Major/Mega jackpots. A win pays **all prizes on that color**; ties go to the color with more symbols. Board resets after a win.`,
    },
  },
  {
    machine: {
      slug: 'tigers-throne',
      name: "Tiger's Throne",
      manufacturer: 'Ainsworth',
      type: 'Persistent Frame Wilds',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '5+ frames on reels 1-3',
      release_year: 2021,
    },
    guide: {
      title: "Tiger's Throne",
      published: true,
      card_ev_threshold: '5+ golden frames on reels 1-3',
      when_to_play: `**Primary play:**

- **5+ golden-bordered frames** on **reels 1–3**

**Tiger in a framed spot** turns that reel wild. Enough frames can flip **all bordered spots wild** at once. Frames **persist across players** with no fixed spin timer.`,
      when_to_stop: `Stop after the **frame-to-wild climax** pays or frames drop below threshold.`,
      how_to_check: `Count golden frame spots on **reels 1–3**. Cycle through all bets/denoms.`,
      risk_bankroll: `**100 units**`,
      risk_summary: `**40-credit minimum** spins add up fast ... and another player can finish a hot frame board you scouted.`,
      risk_bullets: [],
      skins_markdown: `**Panther's Throne** (same math).`,
      gameplay_mechanics: `**Tiger's Throne / Panther's Throne** (Ainsworth, **2021**) is a **40-line Sweet Zone-style** frame game on the **A-STAR Curve** cabinet. Random spots get golden frames; the tiger converts framed reels wild and can mass-convert at critical mass. Bonus uses double-height reels with sticky framed wilds.`,
    },
  },
  {
    machine: {
      slug: 'timberwolf-diamond',
      name: 'Timberwolf Diamond',
      manufacturer: 'Aristocrat',
      type: 'Progressive Free Games + Extreme Column',
      difficulty: 'Advanced',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: true,
      calculator_slug: 'buffalo-diamond',
      volatility_index: 'Extreme',
      popularity_summary: 'Common where Buffalo Diamond / Timberwolf Diamond banks upgraded.',
      release_year: 2020,
    },
    guide: {
      title: 'Timberwolf Diamond',
      published: true,
      card_ev_threshold: '$1.00 @ 68/150/170 · $2.25 @ 51/115/127 · $3.75 @ 30/57/90',
      when_to_play: `Timberwolf Diamond has different take points due to the addition of the **Extreme 4×** bonus which vamps overall RTP.

**1¢ Denomination take points (based on 87% RTP):**

| 1¢ Bet | 2× Green | 3× Blue | 4× Purple |
| :--- | :---: | :---: | :---: |
| **$1.00** | 68 | 150 | 170 |
| **$2.25** | 51 | 115 | 127 |
| **$3.75** | 30 | 57 | 90 |
| **$5.00** | 24 | 40 | 76 |
| **$7.00** | 19 | 32 | 66 |

**5¢ Denomination take points (based on 90% RTP):**

| 5¢ Bet | 2× Green | 3× Blue | 4× Purple |
| :--- | :---: | :---: | :---: |
| **$5.00** ($1.00 × 5) | 57 | 123 | 140 |
| **$11.25** ($2.25 × 5) | 43 | 95 | 107 |
| **$18.75** ($3.75 × 5) | 26 | 49 | 77 |
| **$25.00** ($5.00 × 5) | 21 | 35 | 66 |
| **$35.00** ($7.00 × 5) | 17 | 29 | 59 |

**Extreme 4× vampire effect:** The **Extreme 4×** bonus captures ~3% of overall RTP, shifting standard meter take points higher than original Buffalo Diamond.

**RTP adjustment & combinations:** 1¢ tables are based on **87% RTP** and 5¢ tables on **90% RTP**. Use the built-in **Buffalo Diamond Calculator** (Extreme mode) to adjust for known casino RTPs and evaluate multi-tier combinations.`,
      when_to_stop: `Stop after your **multiplier free games** session ends.`,
      how_to_check: `1. Check the **bet pad** for **green / blue / purple** counts across each bet level.
2. Cycle through nickel denoms ($0.05) where available.`,
      risk_bankroll: '750 units',
      risk_summary: `High volatility with the added Extreme column feature. High variance ... plan bankroll accordingly.`,
      risk_bullets: [],
      where_to_find: `### Where to Find Timberwolf Diamond

**Las Vegas Availability**
- **South Point Casino** - One of the most reliable spots for Timberwolf Diamond.
- Scattered placements at other locals casinos (Orleans, Rampart, Station Casinos properties).
- Occasional sightings at mid-tier Strip casinos with strong Aristocrat floors.

**Broader US Availability**
- Fairly widespread, especially in casinos with good Aristocrat placements.
- Popular in **California** tribal casinos (Pechanga, Yaamava', etc.).
- Also found in Midwest, tribal, and regional casinos across the country.`,
      skins_markdown: `**Buffalo Diamond Extreme** (same math family).`,
      gameplay_mechanics: `**Timberwolf Diamond** (Aristocrat) runs **three uncapped free-games meters** per bet (**2× green**, **3× blue**, **4× purple**). Trigger awards accumulated spins at that multiplier, then resets.

Same progressive free-spin meter engine and payout structure as **Buffalo Diamond Extreme**.`,
    },
  },
  {
    machine: {
      slug: 'top-up-fortunes-flame-ocean',
      name: 'Top Up Fortunes: Flame / Ocean',
      manufacturer: 'Sega Sammy Creation',
      type: 'Expanding Reel Height Persistent',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '8 yellow squares · 6 on R1-3 · 3 stacked Add Wild',
      release_year: null,
    },
    guide: {
      title: 'Top Up Fortunes: Flame / Ocean',
      published: true,
      card_ev_threshold: '8 yellow squares · 6 on R1-3 · 3 stacked on one reel',
      when_to_play: `**Primary play:**

- **8 yellow squares** anywhere (with **spins remaining**)
- **6 yellow squares on reels 1–3** (line-hit focus)
- **3 vertical yellow squares above one reel** (cheap **Add Wild** upside)

Reels start **3** high and expand to **6** for **3** spins per **volcano / trident** hit, then drop one level. Count only squares with **spins remaining** (green corner squares on each reel).`,
      when_to_stop: `Stop after reel heights collapse below your play or the **hold & spin / free games** chase you took pays.`,
      how_to_check: `Yellow squares show on the **bet pad** (tap **Paytable** on the pad if hidden). Green squares in each reel corner = spins left at that height. Cycle through all bets/denoms.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**Add Wild** on a **max-height re-hit** drops extra wilds on **R2–R5** ... many APs only count squares and miss that lane.`,
      risk_bullets: [],
      skins_markdown: `**Top Up Fortunes: Flame** (volcano), **Ocean** (trident).`,
      gameplay_mechanics: `**Top Up Fortunes: Flame / Ocean** (Sega Sammy) expands individual reel heights up to **6** symbols for **3** spins per feature symbol hit. Taller reels improve line hits, free-game triggers, and **6-scatter hold & spin** entries; heights carry into the feature.`,
    },
  },
]
