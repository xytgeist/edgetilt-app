/**
 * WtF Summary lines: geo/rarity only — no bet-pad / flame scouting phrasing.
 * Usage: node scripts/patch-wtf-summary-no-scout.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseEnv, readSupabaseCredentials } from "./lib/supabaseEnv.mjs";

/** @type {Record<string, string>} */
const SUMMARY_REPLACEMENTS = {
  "bier-bier-bier-mai-tai-money":
    "**Summary:** **Uncommon nationally.** Not worth a dedicated trip.",
  "stack-up-pays":
    "**Summary:** **Very common** in IT markets. Not worth a dedicated trip from a dead market.",
};

loadSupabaseEnv("test");
const { url, key } = readSupabaseCredentials();
const sb = createClient(url, key, { auth: { persistSession: false } });

for (const [slug, newSummary] of Object.entries(SUMMARY_REPLACEMENTS)) {
  const { data, error } = await sb
    .from("guides")
    .select("content_markdown")
    .eq("slug", slug)
    .single();
  if (error) throw new Error(error.message);

  const md = data.content_markdown.replace(/\*\*Summary:\*\*[^\n]*/, newSummary);
  if (md === data.content_markdown) throw new Error(`${slug}: Summary line not found`);

  const { error: upErr } = await sb
    .from("guides")
    .update({ content_markdown: md, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  if (upErr) throw new Error(upErr.message);
  console.log(`✓ ${slug}`);
}
