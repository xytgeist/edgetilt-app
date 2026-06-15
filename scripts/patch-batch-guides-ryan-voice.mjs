/**
 * Tighten alien-heroes + angel-blade-sword-of-destiny per Ryan edit pass on 5-coin-frenzy.
 * Usage: node scripts/patch-batch-guides-ryan-voice.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, readSupabaseCredentials } from "./lib/supabaseEnv.mjs";

/** @type {Record<string, { when_to_stop: string, where_to_find: string }>} */
const PATCHES = {
  "alien-heroes": {
    when_to_stop: "Stop after you **trigger the free games**.",
    where_to_find: `### Where to Find Alien Heroes

**In Las Vegas / physical casinos:**
- **Very rare.** Small **2023** install push; distribution was always thin nationally.
- Do not expect consistent placement on Strip, locals, or most regional markets.

**Online / free play:**
- None that mirror live persistent star state.

---

### Top cities / regions (outside Las Vegas)

1. **Commercial / tribal (general)** - Low - Spotty launch installs; most regions never widely carried it

**Summary:** **Rare.** Was never a common floor title.`,
  },
  "angel-blade-sword-of-destiny": {
    when_to_stop: "After **spin 10** resolves.",
    where_to_find: `### Where to Find Angel Blade / Sword of Destiny (Kingdom of Ice & Fire Warrior)

**In Las Vegas / physical casinos:**
- **Uncommon**, not extinct. Modest **2021-era** L&W push; many properties never carried these subtitles or have since rotated them out.

**Online / free play:**
- Limited demos; spin-cycle persistence will not match live floors.

---

### Top cities / regions (outside Las Vegas)

1. **Pennsylvania / Midwest commercial** - Low-Medium - Hit-or-miss even where L&W catalog depth is good
2. **Tribal markets** - Low-Medium - Occasional Super Ten cycle installs; verify live

**Summary:** **Uncommon nationally.** Not worth a dedicated trip.`,
  },
};

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

for (const [slug, patch] of Object.entries(PATCHES)) {
  const { data, error } = await sb
    .from("guides")
    .select("id, content_markdown")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`${slug} not found`);

  let md = data.content_markdown || "";
  md = replaceSection(md, "🛑 When to stop", patch.when_to_stop);
  md = replaceSection(md, "📍 Where to find", patch.where_to_find);

  const { error: upErr } = await sb
    .from("guides")
    .update({ content_markdown: md, updated_at: new Date().toISOString() })
    .eq("id", data.id);
  if (upErr) throw new Error(upErr.message);
  console.log(`Patched ${slug}`);
}
