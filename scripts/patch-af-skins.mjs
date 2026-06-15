/**
 * Pagoda Rising + Jewel Oases → Ascending Fortunes skins (not Stack Up Pays).
 * Usage: node scripts/patch-af-skins.mjs
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

const PATCHES = {
  "ascending-fortunes": `**Ascending Fortunes** (Asian dragon), **Pagoda Rising**, and **Jewel Oases** ... the three skins on IT's five-meter expansion engine. All use the same visual-track meter display.

Same AP math as **Stack Up Pays** (Island Riches, Sakura Riches, etc.) ... see the **Stack Up Pays** guide for those themes and bet-pad scouting.
![image](https://media-test.lvslotpro.com/guides/ascending-fortunes/content-1781066716550.webp)`,

  "stack-up-pays": `**Stack Up Pays** ships as multiple themes on the same engine, including **Island Riches** and **Sakura Riches**.

**Ascending Fortunes**, **Pagoda Rising**, and **Jewel Oases** are the twin family on the same math ... visual-track meters instead of bet-pad counts. See the **Ascending Fortunes** guide.`,
};

loadSupabaseEnv("test");
const { url, key } = readSupabaseCredentials();
const sb = createClient(url, key, { auth: { persistSession: false } });

for (const [slug, skins] of Object.entries(PATCHES)) {
  const { data, error } = await sb
    .from("guides")
    .select("content_markdown")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(error.message);

  const md = replaceSection(data.content_markdown, "🎭 Skins (same game different theme/art)", skins);
  const { error: upErr } = await sb
    .from("guides")
    .update({ content_markdown: md, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (upErr) throw new Error(upErr.message);
  console.log(`✓ ${slug}`);
}
