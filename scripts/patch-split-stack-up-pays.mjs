/**
 * Split Stack Up Pays from Ascending Fortunes: patch AF guide + ingest stack-up-pays.
 * Usage: node scripts/patch-split-stack-up-pays.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, readSupabaseCredentials } from "./lib/supabaseEnv.mjs";
import { runSlotGuideIngest } from "./lib/runSlotGuideIngest.mjs";

function replaceSection(md, sectionEmojiTitle, newBody) {
  const header = `## ${sectionEmojiTitle}`;
  const start = md.indexOf(header);
  if (start < 0) throw new Error(`Missing ${header}`);
  const bodyStart = md.indexOf("\n", start) + 1;
  const rest = md.slice(bodyStart);
  const nextMatch = rest.match(/\n## /);
  const end = nextMatch ? bodyStart + nextMatch.index : md.length;
  return md.slice(0, bodyStart) + `${newBody.trim()}\n\n` + md.slice(end).replace(/^\n+/, "");
}

loadSupabaseEnv("test");
const { url, key } = readSupabaseCredentials();
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: af, error: afErr } = await sb
  .from("guides")
  .select("id, content_markdown")
  .eq("slug", "ascending-fortunes")
  .single();
if (afErr) throw new Error(afErr.message);

let md = af.content_markdown || "";
md = md.replace(/^# Ascending Fortunes \/ Stack Up Pays/m, "# Ascending Fortunes");

md = replaceSection(
  md,
  "🔍 How to check (quick/easy)",
  `**Five colored MHB meters** (Mini blue through Mega red) on the main screen. **Ascending Fortunes** usually shows meter progress on a **visual track** rather than exact expansion counts on the bet pad ... open each bet level and read the track carefully.

Each meter is current expansions vs its **must-hit-by** cap. Scan **all denoms** before you commit.`
);

md = replaceSection(
  md,
  "🎭 Skins (same game different theme/art)",
  `**Ascending Fortunes** is the Asian dragon skin on IT's five-meter expansion engine.

Same AP math as **Stack Up Pays** (Island Riches, Sakura Riches, Jewel Oasis, Pagoda Fortune, etc.) ... see the **Stack Up Pays** guide for those themes and bet-pad scouting.
![image](https://media-test.lvslotpro.com/guides/ascending-fortunes/content-1781066716550.webp)`
);

md = replaceSection(
  md,
  "📍 Where to find",
  `### Where to Find Ascending Fortunes

**In Las Vegas / physical casinos:**
- **Very common** on Prism Element banks in markets that carry IT catalog depth; **2024-era** title still spreading.

**Online / free play:**
- Demos exist; MHB expansion persistence will not match live.

### Top cities / regions (outside Las Vegas)

1. **Midwest / regional commercial** - Medium-High - Strong IT footprint
2. **Tribal markets** - Medium - Common where IT persistents get floor time

**Summary:** **Very common** where IT is stocked. Not worth a dedicated trip from a dead market.`
);

md = md.replace(
  /\*\*Ascending Fortunes\*\* vs \*\*Stack Up Pays\*\* is the same AP math \.\.\. only theme and how clearly the meters display\.\n\n/,
  ""
);

const { error: upAf } = await sb
  .from("guides")
  .update({
    title: "Ascending Fortunes",
    content_markdown: md,
    updated_at: new Date().toISOString(),
  })
  .eq("slug", "ascending-fortunes");
if (upAf) throw new Error(upAf.message);

const { error: upMachine } = await sb
  .from("machines")
  .update({
    popularity_summary:
      "2024 IT Prism title; visual meter track (not bet-pad counts). Twin engine: Stack Up Pays.",
    updated_at: new Date().toISOString(),
  })
  .eq("slug", "ascending-fortunes");
if (upMachine) throw new Error(upMachine.message);

const stackPayload = {
  machine: {
    slug: "stack-up-pays",
    name: "Stack Up Pays",
    manufacturer: "Incredible Technologies",
    type: "Must-Hit-By",
    difficulty: "Intermediate",
    popularity: "Very Common",
    nerf_risk: "Medium",
    has_calculator: true,
    calculator_slug: "stack-up-pays",
    volatility_index: "High",
    popularity_summary:
      "2023 IT Prism family (Island Riches, Sakura Riches, etc.); bet pad shows meter counts. Twin: Ascending Fortunes.",
    release_year: 2023,
  },
  guide: {
    title: "Stack Up Pays",
    published: true,
    card_ev_threshold: "Meters near MHB caps · combo plays · use in-app calculator",
    card_summary_bullets: [
      "Five MHB expansion meters (Mini through Mega)",
      "Exact counts on the bet pad per denom",
      "In-app calculator for combo EV",
    ],
    when_to_play: `Five separate **must-hit-by** meters (Mini → Mega) each bank **reel expansions** instead of a coin jackpot. When a meter hits its cap, you get **10 free spins** that spend every expansion stacked on that meter ... reels grow up to **100,000 ways** for the bonus.

**Single-meter plays** (meter at or above rough entry vs its MHB cap):
- **Mini (blue):** **124** (MHB **125**)
- **Minor (green):** **146+** (MHB **150**)
- **Major (purple):** **192+** (MHB **200**)
- **Grand (orange):** **238+** (MHB **250**)
- **Mega (red):** **330+** (MHB **350**)

**Combo plays** (best edge): multiple meters elevated at once ... e.g. high **Major** plus rising **Grand/Minor**. Value depends on **all five** counts together, not just the biggest meter. Use the **Stack Up Pays calculator** when several meters are live.

*Don't waste your time on a Mini*. Despite what you'll hear from other APs, **Minis are *not*** a play at 118-120. **123 is roughly break-even**. The value in a Mini is so low, it barely affects your return during a chase of other meters.

Jewel/surfboard/dragon scatters (theme-dependent) can add **1–5 expansions** per hit to the matching meter. Ignore on-screen "about to hit" animations ... they are cosmetic.`,
    when_to_stop: "After the **10-spin bonus** from the triggered meter finishes and meters reset.",
    how_to_check: `**Five colored MHB meters** with exact **expansion counts on the bet pad** for every denom ... the main scouting advantage of Stack Up Pays over Ascending Fortunes.

Scan all bet levels without inserting. Each pad shows current count vs **must-hit-by** cap (Mini **125**, Minor **150**, Major **200**, Grand **250**, Mega **350**).`,
    risk_bankroll:
      "**100-500 units** depending on the target meter. A playable Minor could take you 20 bets while a playable Mega could take you deeper than you imagin",
    risk_summary: `Extreme bonus variance. A near-cap **Minor** can pay like a **Mega** or fizzle. Frequent small losses between big hits are normal.

Combo states are where the in-app calculator pays for itself ... single-meter gut checks are not enough when three or four ladders are elevated.`,
    risk_bullets: [
      "Animation teases are not predictive ... meter math only",
      "Meters can jump up to **5 expansions** on one scatter land",
    ],
    where_to_find: `### Where to Find Stack Up Pays

**In Las Vegas / physical casinos:**
- **Very common** where IT Prism Element banks run Island / Asian skins; **2023-era** family with multiple themes still on many floors.

**Online / free play:**
- Demos exist; MHB expansion persistence will not match live.

### Top cities / regions (outside Las Vegas)

1. **Midwest / regional commercial** - Medium-High - Island Riches and Sakura Riches installs
2. **Tribal markets** - Medium - Common IT persistent footprint

**Summary:** **Very common** in IT markets. Easier to scout than Ascending Fortunes thanks to bet-pad counts.`,
    skins_markdown: `**Stack Up Pays** ships as multiple themes on the same engine, including **Island Riches**, **Sakura Riches**, **Jewel Oasis**, and **Pagoda Fortune**.

**Ascending Fortunes** is the Asian dragon twin ... same five-meter math, but meters display on a **visual track** instead of bet-pad numbers. See the **Ascending Fortunes** guide.`,
    gameplay_mechanics: `243-way base game. Theme scatters feed one of five MHB meters with **reel expansions** (not free-spin counters). Caps: Mini **125**, Minor **150**, Major **200**, Grand **250**, Mega **350** (resets lower on each hit).

Bonus = **10 free games** spending that meter's expansion pool across the set. Reels dynamically grow/shrink during the feature. Side pick bonuses are separate from AP ... the meters are the play.`,
  },
};

const out = await runSlotGuideIngest({
  payload: stackPayload,
  target: "test",
  writeRepo: false,
  syncSupabase: true,
});

if (!out.ok) {
  console.error("stack-up-pays ingest failed:", out.errors);
  process.exit(1);
}

console.log("✓ Patched ascending-fortunes (title, how to check, skins, WtF)");
console.log(`✓ Ingested stack-up-pays → ${out.result.supabaseHost || "test"}`);
