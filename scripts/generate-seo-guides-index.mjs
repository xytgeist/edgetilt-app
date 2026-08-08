#!/usr/bin/env node
/**
 * Regenerate the public /guides SEO index (titles + slugs only… no markdown).
 *
 *   node scripts/generate-seo-guides-index.mjs --target=production
 *   node scripts/generate-seo-guides-index.mjs --from-json=.tmp-guides-seo-list.json
 *
 * Writes into public/guides.html between SEO_GUIDE_CATALOG markers.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const guidesHtmlPath = path.join(repoRoot, "public", "guides.html");
const START = "<!-- SEO_GUIDE_CATALOG_START -->";
const END = "<!-- SEO_GUIDE_CATALOG_END -->";

function parseArgs(argv) {
  let target = "production";
  let fromJson = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--target=")) target = a.slice("--target=".length);
    else if (a === "--target") target = argv[++i];
    else if (a.startsWith("--from-json=")) fromJson = a.slice("--from-json=".length);
    else if (a === "--from-json") fromJson = argv[++i];
  }
  if (target !== "test" && target !== "production") {
    throw new Error('--target must be "test" or "production"');
  }
  return { target, fromJson };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadRows({ target, fromJson }) {
  if (fromJson) {
    const raw = fs.readFileSync(path.resolve(repoRoot, fromJson), "utf8");
    const start = raw.indexOf("{");
    const j = JSON.parse(start >= 0 ? raw.slice(start) : raw);
    return j.rows || j;
  }

  const sqlPath = path.join(repoRoot, "scripts", ".tmp-seo-guides-list.sql");
  fs.writeFileSync(
    sqlPath,
    `select g.slug, g.title
from public.guides g
where g.published = true
  and coalesce(nullif(btrim(g.slug), ''), '') <> ''
  and coalesce(nullif(btrim(g.title), ''), '') <> ''
order by lower(g.title) asc;
`,
  );

  const r = spawnSync(
    "node",
    ["scripts/supabase-db-query.mjs", `--target=${target}`, "-f", sqlPath, "-o", "json"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 },
  );
  try {
    fs.unlinkSync(sqlPath);
  } catch {
    /* ignore */
  }
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || `db query failed (exit ${r.status})`);
  }
  const start = r.stdout.indexOf("{");
  if (start < 0) throw new Error("No JSON in db query output");
  const j = JSON.parse(r.stdout.slice(start));
  return j.rows || [];
}

function renderCatalog(rows) {
  const items = rows
    .map((row) => {
      const slug = String(row.slug || "").trim();
      const title = String(row.title || "").trim();
      if (!slug || !title) return "";
      const href = `/?tab=guides&guide=${encodeURIComponent(slug)}`;
      return `        <li><a href="${href}">${escapeHtml(title)}</a></li>`;
    })
    .filter(Boolean)
    .join("\n");

  const generatedAt = new Date().toISOString().slice(0, 10);
  return `${START}
      <h2>AP guides (${rows.length})</h2>
      <p class="catalog-note">
        Looking for a specific machine? Tap a title to open that guide card in EdgeTilt.
      </p>
      <!-- generated ${generatedAt} · titles + slugs only -->
      <ul class="guide-catalog">
${items}
      </ul>
      ${END}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rows = loadRows(opts);
  if (!Array.isArray(rows) || rows.length < 1) {
    throw new Error("No published guides returned");
  }

  const html = fs.readFileSync(guidesHtmlPath, "utf8");
  const i0 = html.indexOf(START);
  const i1 = html.indexOf(END);
  if (i0 < 0 || i1 < 0 || i1 < i0) {
    throw new Error(`Missing ${START} / ${END} markers in public/guides.html`);
  }

  const next =
    html.slice(0, i0) + renderCatalog(rows) + html.slice(i1 + END.length);
  fs.writeFileSync(guidesHtmlPath, next);
  console.log(`Updated ${path.relative(repoRoot, guidesHtmlPath)} with ${rows.length} titles (${opts.fromJson || opts.target}).`);
}

main();
