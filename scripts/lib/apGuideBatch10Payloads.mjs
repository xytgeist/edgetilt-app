/** @type {Array<{ machine: Record<string, unknown>, guide: Record<string, unknown>, diagrams?: unknown[] }>} */
export const BATCH10_PAYLOADS = [
  {
    machine: {
      slug: 'god-of-winning-great-hammer-super-spear',
      name: 'God of Winning: Great Hammer / Super Spear',
      manufacturer: 'Light & Wonder',
      type: 'Locked Frame Wilds',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Locked frames + Wild Zone; weak line pays.',
      release_year: null,
    },
    guide: {
      title: 'God of Winning: Great Hammer / Super Spear',
      published: true,
      card_ev_threshold: '5–10 locked frames · Wild Zone golden border',
      when_to_play: `**Primary play:**

- **5–10 locked frames** (ignore frames labeled **Wild** ... they vanish next spin).
- **5 frames** only when they **connect for a line hit**; aim for **~10** when frames sit **R4–R5** heavy.
- **Wild Zone / Wild Bonus** anytime ... **golden border** around the reelset (Wild Bonus sprays **8+** frames per spin, up to **5** paid spins).

Skip disconnected five-frame boards and **R4–R5-only** clusters.`,
      when_to_stop: `Stop after locked frames clear from a wild smash or when Wild Zone / Wild Bonus mode ends without paying.`,
      how_to_check: `1. Count **locked frames** ... skip **Wild**-labeled frames.
2. Check **payline shape** if you only have five frames.
3. **Golden border** = Wild Zone active.
4. Cycle **bet levels** if frames are per denom.`,
      risk_bankroll: `30–50 units`,
      risk_summary: `Line hits are **weak** vs Star Goddess / Wu Dragon ... you need **more frames** for the same payout.

Locked frames **carry into free games** as wilds for the bonus ... extra value beyond base-game smashes.`,
      risk_bullets: [],
      skins_markdown: `**Great Hammer**, **Super Spear**.`,
      gameplay_mechanics: `**God of Winning** (Light & Wonder) locks **frames** on the reels. Thor can smash all locked frames **wild**, then they clear.

**Wild Zone** runs **3–5** paid spins with a golden reel border; **Wild Bonus** can stack **8+** frames per spin.`,
    },
  },
  {
    machine: {
      slug: 'golden-beasts-golden-elements-brilliant-fortunes',
      name: 'Golden Beasts / Golden Elements',
      manufacturer: 'Sega Sammy',
      type: 'Brilliant Fortunes MHB Super Spin',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Brilliant Fortunes pots; 135 super-spin scout.',
      release_year: null,
    },
    guide: {
      title: 'Golden Beasts / Golden Elements',
      published: true,
      card_ev_threshold: '135 super spin counter · MHB 180 · active feature',
      when_to_play: `**Primary play:** **135+** symbols on the **super spin meter** above the pots (**Golden Beasts** coins / **Golden Elements** bottles ... same AP).

**Also sit:** super spin **already triggered** (pulsating pots + on-screen **Super spin feature** text).

Field alternates cite **125+**; counter **never** nears **180** cap in practice ... probability bumps at **100** and **150** matter.

After a feature, counter often resets to **10**, **20**, or **50**.`,
      when_to_stop: `Stop after the **super spin / pot feature** you chased completes.`,
      how_to_check: `1. Read the **super spin counter** above reels/pots.
2. Confirm **pulsating pots** + feature text when live.
3. Cycle **denoms** on multi-game banks.`,
      risk_bankroll: `100 units`,
      risk_summary: `Buffalo Link–style variance ... frequent small misses, occasional **100×–200×+** spikes.

Each pot color that triggers adds **5 free games**; retriggers inside the feature are common.`,
      risk_bullets: [],
      skins_markdown: `**Golden Beasts**, **Golden Elements** (Brilliant Fortunes engine).`,
      gameplay_mechanics: `**Golden Beasts / Golden Elements** (Sega Sammy **Brilliant Fortunes**) accrues symbols toward a **must-hit-by super spin** before **180**. Pot hits launch free games with matched-color upgrades to premium symbols.`,
    },
  },
  {
    machine: {
      slug: 'golden-dragon',
      name: 'Golden Dragon',
      manufacturer: 'AGS',
      type: 'Column Pot Free Games',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'AGS pot columns; 16+ FG scout.',
      release_year: null,
    },
    guide: {
      title: 'Golden Dragon',
      published: true,
      card_ev_threshold: '4/5 pots with 16+ free games',
      when_to_play: `**Primary play:** **four of five** column pots showing **16 or more** free games on the label.

**Not** the Light & Wonder **Golden Dragon** skin on the **Golden Guardian** pot game ... this is the **AGS** persistent-pot title.`,
      when_to_stop: `Stop after any **pot triggers** and resets the column state.`,
      how_to_check: `1. Read **free-game count** on each of the **five** pot labels.
2. Cycle **bet levels** ... pots are per bet.`,
      risk_bankroll: `100 units`,
      risk_summary: `Extreme free-game variance ... you are buying the right to sit until a loaded pot fires.

Do not confuse with **golden-guardian** MP skins.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Golden Dragon** (AGS) stores a **persistent free-game count** in **five column pots**. Landing the feature on a column pays that pot's count and resets the board.`,
    },
  },
  {
    machine: {
      slug: 'golden-egypt-grand',
      name: 'Golden Egypt Grand',
      manufacturer: 'IGT',
      type: 'Coin Holder Wild Reels (Grand)',
      difficulty: 'Intermediate',
      popularity: 'Common',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Grand coin holders 2/3/4/3/2; longer wild runs.',
      release_year: 2018,
    },
    guide: {
      title: 'Golden Egypt Grand',
      published: true,
      card_ev_threshold: '2 of R1–R3 one away · 6 coins R1–R4 · active wild R1–R3',
      when_to_play: `**Primary play (coin notation R1–R5):**

- **Two of the first three reels** one coin from full (e.g. **1-2-0-0-0**, **0-2-3-0-0**).
- **Six coins** across **R1–R4** (e.g. **1-1-2-2-0**).
- **Any active wild** in **R1–R3** (glowing border + coins above reel).
- **R4 active wild** while **R1–R3** one coin away ... **1–2 spins** hunting a second wild, then bail if it whiffs.
- **Active wilds on both R4 and R5** together.

**Grand** holders run **2/3/4/3/2** ... **R3** fill can wild **four spins** (base Golden Egypt is shorter).`,
      when_to_stop: `Stop when **wild sequences** expire on the reels you entered, or after **free games** finish.`,
      how_to_check: `1. Count **coins in holders** on the bet pad ... cycle all bets/denoms.
2. **Glowing gold border** = active wild reel.
3. Compare to batch **Golden Egypt** rules for the same two-away / dual-R4+R5 lines.`,
      risk_bankroll: `100 units`,
      risk_summary: `Same family as **[Golden Egypt](guide:golden-egypt)** but **longer wild windows** on filled reels ... still heavily vultured on many floors.

**Five wild reels** can spike toward **300×**; two **pharaoh heads** still count for line hits.`,
      risk_bullets: [],
      skins_markdown: `[Golden Egypt](guide:golden-egypt)`,
      gameplay_mechanics: `**Golden Egypt Grand** (IGT, **2018**) extends the **coin-holder wild reel** engine with **variable-length** wild runs (**2/3/4/3/2** holder pattern).

Free-game choice (**30/15/5** spins with **1/2/3** random wild reels) matches base **Golden Egypt** EV ... pick variance, not edge.`,
    },
  },
  {
    machine: {
      slug: 'golden-gecko',
      name: 'Golden Gecko',
      manufacturer: 'Light & Wonder',
      type: 'Jewel Queue Wilds',
      difficulty: 'Intermediate',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'Red jewel queue; ignore gold/blue/green.',
      release_year: null,
    },
    guide: {
      title: 'Golden Gecko',
      published: true,
      card_ev_threshold: '3 active red · 5 total red · 7 total red',
      when_to_play: `**Primary play (red jewels only):**

- **3** active red jewels (row above reels).
- **5** red total (active + queue row 1).
- **7** red total (active + queue rows 1–2).

**Ignore gold** multiplier jewels (**2×–5×**) for AP ... blue/green/purple are not the chase line.`,
      when_to_stop: `Stop after the **red progressive / wild stack** sequence you sat for resolves.`,
      how_to_check: `1. Count **red** jewels in the **active row + queue** above each reel.
2. Ignore non-red colors for entry.
3. Cycle **bet levels**.`,
      risk_bankroll: `50 units`,
      risk_summary: `Screen **rumble** often precedes a full wild stack ... high variance progressive hunt.

Full reel of wilds covering a **red jewel** pays the red tier.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Golden Gecko** (Light & Wonder) queues **colored jewels** per reel. Wild drops feed the queue; only **red** jewels drive the posted AP thresholds.`,
    },
  },
  {
    machine: {
      slug: 'golden-guardian',
      name: 'Golden Dragon / Golden Guardian',
      manufacturer: 'Light & Wonder',
      type: 'Column Pot Wheel / Free Games',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: 'MP pot game; 4/5 wheel or 16/20/24 FG.',
      release_year: null,
    },
    guide: {
      title: 'Golden Dragon / Golden Guardian',
      published: true,
      card_ev_threshold: '4/5 pots: wheel or 16/20/24 FG',
      when_to_play: `**Primary play:** **four of five** pots show either the **jackpot wheel** OR **16 / 20 / 24** free games (green/red pot labels).

**Pass** boards heavy on **8 free game** pots (**40%** hit risk on those labels).

**Pass** setups that are **only red-24** without enough other premium pots (**~20%** hit on that label alone).

**Not** the **AGS** slug **golden-dragon** ... different manufacturer and math.`,
      when_to_stop: `Stop after **any pot triggers** ... all five pots **reset randomly**.`,
      how_to_check: `1. Read **pot prize text** under each reel column.
2. Tally **wheel vs FG count** labels across five pots.
3. Cycle **denoms**.`,
      risk_bankroll: `100 units`,
      risk_summary: `Tall **dragon symbol** fully in a reel can award the pot prize ... extremely swingy.

Wheel awards **50×–200×** credits or progressive tiers when it hits.`,
      risk_bullets: [],
      skins_markdown: `**Golden Dragon**, **Golden Guardian** (this pot game).`,
      gameplay_mechanics: `**Golden Dragon / Golden Guardian** (Light & Wonder) runs **five persistent pots** with FG counts or a **jackpot wheel**. One trigger resets the whole board.`,
    },
  },
  {
    machine: {
      slug: 'golden-jungle',
      name: 'Golden Jungle',
      manufacturer: 'IGT',
      type: 'Wild Stays 4 Plays (Letters)',
      difficulty: 'Beginner',
      popularity: 'Uncommon',
      nerf_risk: 'Low',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'Medium',
      popularity_summary: 'Aladdin Fortune 3D clone; 6+ lit letters.',
      release_year: null,
    },
    guide: {
      title: 'Golden Jungle',
      published: true,
      card_ev_threshold: '6+ lit W-I-L-D letters on R1–R3',
      when_to_play: `**Primary play:** **six or more lit letters** spelling **W-I-L-D** across **reels 1–3** (threshold varies by bet ... cycle **every bet + denom**).

**Four lamps** on one reel → **wild reel for four spins** (Wild Stays 4 Plays).

Ignore letter setups that only cover **R4–R5** ... pays are left-to-right.`,
      when_to_stop: `Stop after **wild reel sequences** you entered finish (four-spin windows expire).`,
      how_to_check: `1. Count **lit letters** above **R1–R3**.
2. Cycle **all bet options** before you sit.
3. Confirm cabinet is **letter/lamp** Wild Stays 4 Plays ... not the unrelated buddha **Grand** variant.`,
      risk_bankroll: `20 units`,
      risk_summary: `Clone of **Aladdin's Fortune 3D** engine ... overlapping wild reels can stack.

MP comments mention a different **four wild symbols above reel** variant ... verify your cabinet art before you hunt.`,
      risk_bullets: [],
      skins_markdown: `Same engine family as **Aladdin's Fortune 3D**.`,
      gameplay_mechanics: `**Golden Jungle** (IGT) lights **W-I-L-D** letters above the reels; **four lamps** on a column locks that reel **wild for four spins**. **60-line** left-to-right pays.`,
    },
  },
  {
    machine: {
      slug: 'golden-jungle-grand',
      name: 'Golden Jungle Grand',
      manufacturer: 'IGT',
      type: '10-Spin Buddha Cycle',
      difficulty: 'Advanced',
      popularity: 'Uncommon',
      nerf_risk: 'Medium',
      has_calculator: false,
      calculator_slug: null,
      volatility_index: 'High',
      popularity_summary: '10-spin buddha cycle; never 10/10.',
      release_year: 2019,
    },
    guide: {
      title: 'Golden Jungle Grand',
      published: true,
      card_ev_threshold: '2 full R1–R3 (not 10/10) · cycle table',
      when_to_play: `**10-spin buddha cycle** (counter lower-right, e.g. **9 of 10**). **Never sit 10/10.**

**Always (except 10/10):** two of **R1–R3 full** (**2-2-0-0-0**, **2-0-2-0-0**, **0-2-2-0-0**).

**Position shortcuts:**

- **9/10:** one full **R1–R3** OR **3** buddhas **R1–R4**
- **8/10:** one full **R1–R3** + extra in another **R1–R3** OR **3** in **R1–R4**
- **3–7/10:** one full **R1–R3** + buddhas in the other two **R1–R3** OR **3** in **R1–R4**
- **2/10:** one full **R1–R3** OR **2** buddhas **R1–R4**
- **1/10:** **2** buddhas in **R1–R3**

Spin **10** wilds every reel that hit **2** buddhas during the cycle. Profit usually needs **3+ wild reels** on spin 10.`,
      when_to_stop: `Stop after **spin 10** resolves ... **never** chase **10/10**. Bail if mid-cycle state breaks your entry (e.g. spin-2 board invalidated on spin 3).`,
      how_to_check: `1. Read **buddha counts** per reel + **cycle counter**.
2. Map to the **position table** above ... floor shortcut: "a bunch of locked buddhas" on **R1–R3**.
3. Cycle **bets**.`,
      risk_bankroll: `75 units`,
      risk_summary: `All-or-nothing on **spin 10** ... full-screen wilds can pay **133×+** but dead cycles are common.

One buddha max per reel per spin.`,
      risk_bullets: [],
      skins_markdown: '',
      gameplay_mechanics: `**Golden Jungle Grand** (IGT, **2019**) collects **buddha symbols** above reels through a **10-spin** cycle, then wilds filled columns on the final spin. Scarab-cycle cousin ... memorize counter position, not just buddha art.`,
    },
  },
]
