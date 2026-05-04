/**
 * Reads Slots/<slug>/card.meta.json + guide.md and upserts `machines` + `guides` in Supabase.
 *
 * Requires service role (machines/guides are not publicly writable under normal RLS):
 *   SUPABASE_URL=https://xxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * Two Supabase projects (test vs production), without mixing keys:
 *   --target=test         → loads `.env` then overrides from `.env.supabase.test`
 *   --target=production   → loads `.env` then overrides from `.env.supabase.production`
 *   (no --target)         → only `.env` (same as before)
 *
 * Dry run (no writes):
 *   node scripts/sync-slot-forms-to-supabase.mjs --target=test --dry-run
 *   Add --dry-run-quiet to skip printing every manifest JSON (banner + summary only).
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

function parseEnvLine(line) {
  let s = line.trim();
  if (!s || s.startsWith("#")) return null;
  if (s.startsWith("export ")) s = s.slice(7).trim();
  const eq = s.indexOf("=");
  if (eq <= 0) return null;
  const key = s.slice(0, eq).trim();
  let val = s.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

/** Apply KEY=VAL pairs from a file. `fillEmptyOnly`: only set env when missing or empty (for base `.env`). */
function applyEnvFile(envPath, { fillEmptyOnly }) {
  if (!fs.existsSync(envPath)) return false;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const { key, val } = parsed;
    if (fillEmptyOnly) {
      if (process.env[key] === undefined || process.env[key] === "") {
        process.env[key] = val;
      }
    } else {
      process.env[key] = val;
    }
  }
  return true;
}

const TARGET_ENV_FILES = {
  test: ".env.supabase.test",
  production: ".env.supabase.production",
};

function targetHuman(t) {
  if (t === "test") return "test";
  if (t === "production") return "production";
  return "default (.env only)";
}

function loadSupabaseEnv(target) {
  applyEnvFile(path.join(repoRoot, ".env"), { fillEmptyOnly: true });
  if (target == null) return;
  const file = TARGET_ENV_FILES[target];
  if (!file) return;
  const full = path.join(repoRoot, file);
  if (!applyEnvFile(full, { fillEmptyOnly: false })) {
    console.error(
      `Missing ${file} for --target=${target}.\n` +
        `  Create it in the repo root with:\n` +
        `    SUPABASE_URL=https://<ref>.supabase.co\n` +
        `    SUPABASE_SERVICE_ROLE_KEY=<service_role secret>\n` +
        `  (VITE_SUPABASE_URL works too instead of SUPABASE_URL.)`
    );
    process.exit(1);
  }
}

function parseArgs() {
  const argv = process.argv.slice(2).filter((a) => !["--dry-run", "--dry-run-quiet"].includes(a));
  const dry = process.argv.includes("--dry-run");
  const dryQuiet = process.argv.includes("--dry-run-quiet");
  let slug = null;
  let target = null;
  for (const a of argv) {
    if (a.startsWith("--slug=")) slug = a.slice("--slug=".length);
    if (a.startsWith("--target=")) {
      const t = a.slice("--target=".length).trim().toLowerCase();
      if (t === "test" || t === "staging") target = "test";
      else if (t === "prod" || t === "production") target = "production";
      else {
        console.error(`Unknown --target value "${a.slice("--target=".length)}". Use test or production.`);
        process.exit(1);
      }
    }
  }
  return { dry, dryQuiet, slug, target };
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
  const { dry, dryQuiet, slug: filterSlug, target } = parseArgs();
  loadSupabaseEnv(target);
  const urlRaw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const url = urlRaw?.trim()?.replace(/\/+$/, "") || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  const manifests = await loadManifests(filterSlug);
  if (manifests.length === 0) {
    console.error("No card.meta.json found under Slots/ (check --slug filter).");
    process.exit(1);
  }

  let dryRunHost = url || "(no URL)";
  try {
    if (url) dryRunHost = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  if (dry) {
    const quietHint = dryQuiet ? " (--dry-run-quiet: no manifest JSON dumped)" : "";
    console.log(`Slots sync (dry-run) → ${targetHuman(target)} → ${dryRunHost}${quietHint}\n`);
  }

  if (dry || !key || !url) {
    if (!dry && (!key || !url)) {
      console.error(
        "Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY. Use --dry-run to preview payloads."
      );
    }
    if (dry && dryQuiet) {
      console.log(
        `Would sync ${manifests.length} manifest(s). Re-run without --dry-run-quiet to print each machine + guide_seed JSON.`
      );
    } else {
      for (const { dir, json } of manifests) {
        console.log("---", dir, "---");
        console.log(JSON.stringify({ machine: json.machine, guide_seed: json.guide_seed }, null, 2));
      }
    }
    if (!dry) process.exit(1);
    console.log(`\nDry run: ${manifests.length} manifest(s). No database writes.`);
    console.log(`► Target: ${targetHuman(target)} @ ${dryRunHost}`);
    return;
  }

  if (!/^https:\/\//i.test(url)) {
    console.error(
      "SUPABASE_URL (or VITE_SUPABASE_URL) must start with https:// — check `.env` and that this script can read it (PowerShell `$env:` overrides file)."
    );
    process.exit(1);
  }

  if (
    /your_project_ref/i.test(url) ||
    /YOUR_PROJECT_REF/i.test(url) ||
    /xxx\.supabase\.co/i.test(url) ||
    /<project.?ref>/i.test(url)
  ) {
    console.error(
      `SUPABASE_URL is still a placeholder (${url}), not your real hostname.\n` +
        `  Open Supabase → Project Settings → API → copy Project URL.\n` +
        `  It looks like https://abcdefghijklmnopqrst.supabase.co (random ref, not literal "your_project_ref").`
    );
    process.exit(1);
  }

  if (
    /^eyJ[A-Za-z0-9_-]{10}\.YOUR_/i.test(key || "") ||
    /your.?service.?role/i.test(key || "")
  ) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY looks like documentation placeholder text.\n" +
        "  Use the anon key for browser apps — for slots:sync you need the secret service_role key from the same API page."
    );
    process.exit(1);
  }

  let supabaseHost = "";
  try {
    supabaseHost = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  console.log(`Slots sync → ${targetHuman(target)} → ${supabaseHost || url}\n`);

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
      const nested = me.cause ?? me.details;
      if (nested != null) {
        console.error(
          "Underlying:",
          nested instanceof Error ? nested.message || String(nested) : nested
        );
      }
      if (String(me.message).includes("fetch failed")) {
        console.error(`Network hint: connecting to ${supabaseHost || url}
  • Confirm project is not paused and URL matches Supabase Dashboard → Settings → API
  • Try: curl -I "${url}/rest/v1/"
  • Corporate VPN/proxy/antivirus sometimes blocks outbound HTTPS — try another network or allowlist *.supabase.co
  • Node/npm uses its own TLS; outdated OS trust store can cause TLS failures`);
      }
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
