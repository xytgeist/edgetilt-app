/**
 * Big Ocean Jackpots — correct AP from Ryan's MP writeup.
 * Usage: node scripts/patch-big-ocean-jackpots.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, readSupabaseCredentials } from "./lib/supabaseEnv.mjs";

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

const { data, error } = await sb
  .from("guides")
  .select("content_markdown")
  .eq("slug", "big-ocean-jackpots")
  .single();
if (error) throw new Error(error.message);

let md = data.content_markdown;

md = replaceSection(
  md,
  "🟢 When to play",
  `**Wild bubbles** and **jackpot bubbles** (Mini / Minor / Maxi) float above the reels and move **up one row every spin** until they leave the top.

**Wild bubble on a coin:** all four **poker suit symbols** (spade, club, heart, diamond) turn **wild** for that hit. **Two** wild bubbles on coins at once adds **2×** to wild wins.

**Jackpot bubble on a coin:** pays that bubble's Mini, Minor, or Maxi prize.

**Always play:** **three wild bubbles** anywhere on the field **except the top row**. Column does not matter ... the edge is the **suit-symbol cascade** when wild bubbles hit coins, not line position.

**Never play for jackpot bubbles alone.** Mini / Minor / Maxi bubbles in the field are **common** and **not** +EV to chase. Same for **Maxi-only** chases ... hit rate is too thin to build a strategy around.`
);

md = replaceSection(md, "🛑 When to stop", "After your **wild bubbles clear off the top row**.");

md = replaceSection(
  md,
  "🔍 How to check (quick/easy)",
  `Count **wild bubbles** vs **jackpot bubbles** on the bubble field. You want **three wild bubbles** below the **top row**.

Jackpot bubbles show as **Mini / Minor / Maxi** (octopus / shark / pufferfish art on many installs). Ignore them for entry decisions.

**Scan every bet level and denom** ... bubble state is separate per bet on most cabinets.`
);

md = replaceSection(
  md,
  "💰 Bankroll on hand",
  "**10–20 units** for a typical three-wild-bubble board ... fixed bubble countdown, not an open-ended chase."
);

md = replaceSection(
  md,
  "⚠️ Risk & Warnings",
  `Wild-bubble AP is about **suit cascades**, not jackpot hunting. Jackpot bubbles look tempting and show up constantly ... they are noise.

**Major, Royal, Mega, and Grand** require **multiple jackpot bubbles on the same spin** (e.g. Grand = Minor + Maxi + Mini together). That path is not the day-to-day AP play.`
);

md = md.replace(
  /^- Bubble Boost[\s\S]*?face credits\n\n/m,
  `- Do not confuse **wild bubbles** (play) with **jackpot bubbles** (ignore for entry)\n- Top-row bubbles are dead ... they exit on the next spin\n\n`
);

md = replaceSection(
  md,
  "🎰 Gameplay Mechanics",
  `Bubbles advance **one row per spin**. Only **Mini, Minor, and Maxi** jackpots appear inside bubbles; larger tiers (**Major, Royal, Mega, Grand**) need **multiple jackpot bubbles triggering on the same spin**.

Wild bubbles on coins wild all suit symbols; two wild-on-coin hits in one spin doubles wild wins. Base game uses coin symbols on the reels to interact with bubble positions above.`
);

const { error: upErr } = await sb
  .from("guides")
  .update({
    content_markdown: md,
    card_ev_threshold: "3 wild bubbles below top row · ignore jackpot bubbles",
    updated_at: new Date().toISOString(),
  })
  .eq("slug", "big-ocean-jackpots");
if (upErr) throw new Error(upErr.message);

console.log("✓ big-ocean-jackpots updated");
