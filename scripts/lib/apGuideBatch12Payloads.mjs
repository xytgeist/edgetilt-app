/** Batch 12 synth payloads. `igt-classic-hits-*` omitted — duplicate of **`igt-must-hit-by`** (Ryan deleted post-ingest). */
/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH12_PAYLOADS = [
  {
    machine: {
      slug: 'hyper-orbs-king-of-the-seas-dragon-sense',
      name: 'Hyper Orbs: King of the Seas / Dragon Sense',
      manufacturer: 'Incredible Technologies',
      type: 'Orb Meter Free Spins',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '15-orb meter; sticky R2/R4 scatters.',
      release_year: 2021,
    },
    guide: {
      title: 'Hyper Orbs: King of the Seas / Dragon Sense',
      published: true,
      card_ev_threshold: '12+ orbs · sticky numbered scatter R2 or R4 · agg: 11 high RTP',
      when_to_play: `**Primary play:**

- **12+ orbs** on the bet pad (**15** triggers bonus).
- **OR** a **numbered free-spins scatter** stuck on **reel 2 or reel 4** (wild while sticky; two scatters trigger bonus).

**Aggressive:** **11 orbs** only on installs you know run **higher RTP** ... default scout is **12+**.

Bonus awards **12 free spins**; stored orbs expand reels up to **+3 rows** each.`,
      when_to_stop: `Stop after the **free spins bonus** completes and the **orb meter resets**.`,
      how_to_check: `Read **orb count on the bet pad** for each bet level. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**250 units**`,
      risk_summary: `**11 orbs** is install-dependent ... if you do not know the floor, stay at **12+**.`,
      risk_bullets: [],
      skins_markdown: `**King of the Seas**, **Dragon Sense**.`,
      gameplay_mechanics: `**Hyper Orbs** (Incredible Technologies) fills a **15-orb** persistent meter or triggers via **two sticky scatters on R2+R4**. Bonus expands reels with stored orbs for more ways.`,
    },
  },
  {
    machine: {
      slug: 'icy-wilds-icy-wilds-deluxe-fa-cai-long',
      name: 'Icy Wilds / Icy Wilds Deluxe',
      manufacturer: 'IGT',
      type: 'Next-Spin Wild Reels',
      difficulty: 'Beginner',
      popularity: 'Common',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Low',
      popularity_summary: 'One-spin wild reel; princess/dragon 2OAK.',
      release_year: 2016,
    },
    guide: {
      title: 'Icy Wilds / Icy Wilds Deluxe',
      published: true,
      card_ev_threshold: 'Any glowing wild reel · R4–R5 OK · premium stacks only',
      when_to_play: `**Primary play:**

- **Any reel** with an active **glowing border** (wild **next spin**).
- **Reel 4 and reel 5** count ... **ice princess / blue dragon** pays **two-of-a-kind** adjacent.

**Premium symbol stacks only** turn the reel wild ... not poker symbols.`,
      when_to_stop: `Stop after the **wild reel spin** resolves (usually **one spin**).`,
      how_to_check: `Scan each reel for **glowing icy border**. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**5 units**`,
      risk_summary: `Easy to keep scrolling after the wild already fired ... most plays are **one spin**.`,
      risk_bullets: [],
      skins_markdown: `[Fa Cai Long](guide:fa-cai-long)`,
      gameplay_mechanics: `**Icy Wilds** family (IGT) marks reels wild **one spin** after a **premium stack** lands.`,
    },
  },
  {
    machine: {
      slug: 'imperial-fortunes-penguin-palace',
      name: 'Imperial Fortunes / Penguin Palace',
      manufacturer: 'AGS',
      type: 'Coin Holder Wild Reels',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '2-coin wild reels + 2× coins.',
      release_year: null,
    },
    guide: {
      title: 'Imperial Fortunes / Penguin Palace',
      published: true,
      card_ev_threshold: '2× coin R1–3 setup · gold wild R1–3 · agg: 1 coin each R1–4',
      when_to_play: `**Primary play:**

- **Two coins** above **R1–R3** with **at least one 2× coin**.
- **Active gold wilds** in **R1–R3** (**1 or 2 coins** in holder = spins left).
- **Active R4 wild** if **2× coin(s)** above that reel.

**Aggressive:** **one coin** above **each of R1–R4** (needs a **2×** to profit).

Ignore **pot / prize stack** above reels (cosmetic).`,
      when_to_stop: `Stop when **wild reel timers expire**.`,
      how_to_check: `Tap **bet level** on the main screen to scout without coin-in. Read **coin holders** above each reel. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**Pot rumble** randomly fills holders ... do not confuse animation with a logged +EV state.`,
      risk_bullets: [],
      skins_markdown: `**Imperial Fortunes**, **Penguin Palace**.`,
      gameplay_mechanics: `**Imperial Fortunes / Penguin Palace** (AGS) uses **coin holders** above reels; **two coins** wilds the reel **two spins**. **2× coins** on **R2–R4** lift edge vs **Red Silk / Aztec Chief**.`,
    },
  },
  {
    machine: {
      slug: 'indian-motorcycle',
      name: 'Indian Motorcycle',
      manufacturer: 'Spielo',
      type: 'Trophy Meter Wheel Bonus',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Min-bet trophy ladder; replica bike jackpot.',
      release_year: null,
    },
    guide: {
      title: 'Indian Motorcycle',
      published: true,
      card_ev_threshold: '7 trophies · 6@2000+ · 5@3000+ · min bet only',
      when_to_play: `**Minimum bet only** ... trophy **award credits** are global; higher bets only multiply what others built.

- **7** gold trophies (**of 8**).
- **6** trophies if **bonus award ≥ 2000** credits (center screen).
- **5** trophies if award **≥ 3000**.
- **4** trophies if award **≥ 4000**.
- **3** trophies if award **≥ 5000**.

Trophies land **only on reel 5**.`,
      when_to_stop: `Stop after the **8th trophy wheel** resolves (resets to **2** trophies).`,
      how_to_check: `Count **gold trophies** on the meter and read **bonus award** above the reels. Play **minimum bet** only.`,
      risk_bankroll: `**50 units**`,
      risk_summary: `**Min-bet-only** is the edge ... playing up multiplies someone else's trophy bank without building your own.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Indian Motorcycle** (Spielo) collects **8 gold trophies** for a **wheel** (award, **2×/3×/5×**, or garage jackpot). Award ticks **1×–5× bet** per trophy land on **R5**.`,
    },
  },
  {
    machine: {
      slug: 'inferno-wheel-aztec-awards-polynesian-pays',
      name: 'Inferno Wheel: Aztec Awards / Polynesian Pays',
      manufacturer: 'Gaming Arts',
      type: 'Persistent Wheel Wedges',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Under-the-radar wedge equity.',
      release_year: null,
    },
    guide: {
      title: 'Inferno Wheel: Aztec Awards / Polynesian Pays',
      published: true,
      card_ev_threshold: 'Min wedge ≥15x bet · agg: median 30x+ · ≤2 wedges <10x',
      when_to_play: `**Primary:** smallest **credit wedge ≥ 15×** your bet.

**Aggressive:** **~400×+ total** wedge sum (excl. jackpots), **median wedge ~30×+**, **≤2 wedges under 10×**, many **30×–60×** mid wedges.

**Inferno Wheel symbol** on **R2–R4** expands reel wild, then **boosts a wedge** or triggers spin (~**1/8** when symbol lands).`,
      when_to_stop: `Stop after **wheel spin pays** and wedges reset.`,
      how_to_check: `Read **credit wedges** on the wheel above the reels. Use menu **up/down arrows** to scout each bet level without coin-in. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**75 units**`,
      risk_summary: `**Wheel color ≠ wedge value** ... yellow can beat white. Read credits, not hue.`,
      risk_bullets: [],
      skins_markdown: `**Aztec Awards**, **Polynesian Pays**.`,
      gameplay_mechanics: `**Inferno Wheel** (Gaming Arts) persists **wedge credits** per bet; boosts add **one bet** per hit. Jackpots on wheel do not boost.`,
    },
  },
  {
    machine: {
      slug: 'jackpot-catcher-sun-moon',
      name: 'Jackpot Catcher: Sun / Moon',
      manufacturer: 'Aristocrat',
      type: 'Glowing Ring Credits',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: '5+ ring points; walk-ups post-jackpot.',
      release_year: 2012,
    },
    guide: {
      title: 'Jackpot Catcher: Sun / Moon',
      published: true,
      card_ev_threshold: '5+ ring points · green=2 pink=3 · sun/moon refills ring',
      when_to_play: `**Five or more active glowing rings** (segment **dots** = spins left).

**Green 2×** rings = **two** points; **pink 3×** = **three** (e.g. green + pink = five).

Credit symbols inside a ring pay that amount. **Second sun/moon** in a ring refills segments and upgrades multiplier (**green → pink → red 5×**).`,
      when_to_stop: `Stop when **rings expire** or **three-spin** windows finish.`,
      how_to_check: `Count **active glowing rings** and **segment dots** per ring on the reel grid. Cycle through all **bets/denoms**.`,
      risk_bankroll: `**30 units**`,
      risk_summary: `**Jackpot Catcher Spin** blackout boards still need **credit symbols inside rings** to collect.`,
      risk_bullets: [],
      skins_markdown: `**Sun** and **Moon** themes; standard and **premium** bet (same strategy).`,
      gameplay_mechanics: `**Jackpot Catcher** (Aristocrat) locks **glowing rings** for **three spins**; credits in rings pay. Free games keep rings persistent.`,
    },
  },
]
