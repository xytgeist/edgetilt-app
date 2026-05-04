/**
 * Reads Slots/<slug>/card.meta.json + guide.md and upserts `machines` + `guides` in Supabase.
 *
 * Requires service role (machines/guides are not publicly writable under normal RLS):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Dry run (no writes):
 *   node scripts/sync-slot-forms-to-supabase.mjs --dry-run
 *
 * Optional: only one slug
 *   node scripts/sync-slot-forms-to-supabase.mjs --slug=buffalo-link
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const slotsRoot = path.join(repoRoot, "Slots");

function parseArgs() {
  const dry = process.argv.includes("--dry-run");
  let slug = null;
  for (const a of process.argv) {
    if (a.startsWith("--slug=")) slug = a.slice("--slug=".length);
  }
  return { dry, slug };
}

async function loadManifests(filterSlug) {
  const entries = await fsp.readdir(slotsRoot, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith(".")) continue;
    // Only machine slugs (matches DB); skip legacy asset dirs (spaces, mixed case) under Slots/
    if (!/^[a-z0-9-]+$/.test(e.name)) continue;
    const metaPath = path.join(slotsRoot, e.name, "card.meta.json");
    if (!fs.existsSync(metaPath)) continue;
    if (filterSlug && e.name !== filterSlug) continue;
    const raw = await fsp.readFile(metaPath, "utf8");
    const json = JSON.parse(raw);
    if (json.machine?.slug !== e.name) {
      console.warn(`Skip ${e.name}: folder name !== machine.slug in JSON`);
      continue;
    }
    const guidePath = path.join(slotsRoot, e.name, json.guide_seed?.content_markdown_file || "guide.md");
    let content_markdown = "";
    try {
      content_markdown = await fsp.readFile(guidePath, "utf8");
    } catch {
      console.warn(`Missing ${guidePath}, using empty markdown`);
    }
    out.push({ dir: e.name, json, content_markdown });
  }
  out.sort((a, b) => a.dir.localeCompare(b.dir));
  return out;
}

async function main() {
  const { dry, slug: filterSlug } = parseArgs();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const manifests = await loadManifests(filterSlug);
  if (manifests.length === 0) {
    console.error("No card.meta.json found under Slots/ (check --slug filter).");
    process.exit(1);
  }

  if (dry || !key || !url) {
    if (!dry && (!key || !url)) {
      console.error(
        "Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY. Use --dry-run to preview payloads."
      );
    }
    for (const { dir, json } of manifests) {
      console.log("---", dir, "---");
      console.log(JSON.stringify({ machine: json.machine, guide_seed: json.guide_seed }, null, 2));
    }
    if (!dry) process.exit(1);
    console.log(`\nDry run: ${manifests.length} manifest(s). No database writes.`);
    return;
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const { dir, json, content_markdown } of manifests) {
    const m = json.machine;
    const g = json.guide_seed;
    const machinePayload = {
      slug: m.slug,
      name: m.name,
      manufacturer: m.manufacturer,
      type: m.type,
      difficulty: m.difficulty,
      vegas_availability: m.vegas_availability,
      nerf_risk: m.nerf_risk,
      has_calculator: m.has_calculator,
      calculator_slug: m.calculator_slug,
      thumbnail_url: m.thumbnail_url ?? null,
    };
    if (m.volatility_index != null) machinePayload.volatility_index = m.volatility_index;
    if (m.popularity_summary != null) machinePayload.popularity_summary = m.popularity_summary;
    if (m.release_year != null) machinePayload.release_year = m.release_year;

    const { data: upserted, error: me } = await supabase
      .from("machines")
      .upsert(machinePayload, { onConflict: "slug" })
      .select("id")
      .single();

    if (me) {
      console.error(`machines upsert ${m.slug}:`, me.message);
      const missingExtras =
        me.message?.includes("volatility_index") ||
        me.message?.includes("popularity_summary") ||
        me.message?.includes("release_year");
      if (missingExtras) {
        console.error("Hint: run supabase/guides_machine_card_fields.sql if those columns are missing.");
      }
      process.exit(1);
    }

    const guidePayload = {
      machine_id: upserted.id,
      slug: g.slug,
      title: g.title,
      content_markdown: content_markdown,
      card_gist:
        typeof g.card_gist === "string" && String(g.card_gist).trim() !== ""
          ? String(g.card_gist).trim()
          : null,
      published: g.published !== false,
      difficulty: m.difficulty ?? null,
      thumbnail_url: g.thumbnail_url ?? null,
      diagram_urls: g.diagram_urls ?? null,
      related_machine_slugs: g.related_machine_slugs ?? null,
    };

    const { error: ge } = await supabase.from("guides").upsert(guidePayload, { onConflict: "slug" });
    if (ge) {
      console.error(`guides upsert ${g.slug}:`, ge.message);
      if (ge.message?.includes("card_gist")) {
        console.error("Hint: run supabase/guides_machine_card_fields.sql to add guides.card_gist.");
      }
      process.exit(1);
    }

    console.log(`OK ${m.slug} → machines + guides`);
  }

  console.log(`\nSynced ${manifests.length} slot(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
