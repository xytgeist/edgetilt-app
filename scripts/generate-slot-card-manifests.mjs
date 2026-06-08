/**
 * Generates Slots/<slug>/card.meta.json + guide.md for every row in
 * supabase/machines_guides_schema.sql (machines INSERT).
 *
 * Run: node scripts/generate-slot-card-manifests.mjs
 * Re-run after editing the SQL seed — or edit JSON in place and use sync script.
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { defaultCardEvThresholdForSlug, defaultReleaseYearForSlug } from "../src/constants/slotCardEvThreshold.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sqlPath = path.join(repoRoot, "supabase", "machines_guides_schema.sql");
const slotsRoot = path.join(repoRoot, "Slots");

/** Optional: old asset folders under Slots/ (different naming) — copy hints only, not auto-moved */
const LEGACY_ASSET_FOLDERS = {
  "rich-little-piggies": "rich-little-hens",
};

/** App has calculators even when seed `has_calculator` is false — keep manifest aligned with UI. */
const CALCULATOR_OVERRIDES = {
  "buffalo-link": { has_calculator: true, calculator_slug: "buffalo-link" },
  "phoenix-link": { has_calculator: true, calculator_slug: "phoenix" },
  "stack-up-pays": { has_calculator: true, calculator_slug: "stack-up-pays" },
};

function unescapeSqlString(s) {
  return s.replace(/''/g, "'");
}

/** Parse `('a', 'b', ... true, null),` lines from machines INSERT block */
function parseMachineInsert(sql) {
  const idx = sql.indexOf("INSERT INTO machines");
  if (idx === -1) throw new Error("INSERT INTO machines not found in schema SQL");
  const slice = sql.slice(idx);
  const semi = slice.indexOf(";\n");
  const block = semi === -1 ? slice : slice.slice(0, semi + 1);
  const rows = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("('")) continue;
    const tuple = parseTupleLine(line);
    if (!tuple) continue;
    const [
      slug,
      name,
      manufacturer,
      type,
      difficulty,
      vegas_availability,
      nerf_risk,
      has_calculator,
      calculator_slug,
    ] = tuple;
    rows.push({
      slug: unescapeSqlString(slug),
      name: unescapeSqlString(name),
      manufacturer: unescapeSqlString(manufacturer),
      type: unescapeSqlString(type),
      difficulty: unescapeSqlString(difficulty),
      popularity: unescapeSqlString(vegas_availability),
      nerf_risk: unescapeSqlString(nerf_risk),
      has_calculator: has_calculator === "true",
      calculator_slug:
        calculator_slug === "null" ? null : unescapeSqlString(calculator_slug.replace(/^'|'$/g, "")),
    });
  }
  return rows;
}

function parseTupleLine(line) {
  let s = line.trim();
  if (s.endsWith(",")) s = s.slice(0, -1);
  if (s.endsWith(");")) s = s.slice(0, -2);
  else if (s.endsWith(")")) s = s.slice(0, -1);
  if (!s.startsWith("(")) return null;
  s = s.slice(1);
  const fields = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === "'") {
      let buf = "";
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        if (s[i] === "'") {
          i++;
          break;
        }
        buf += s[i++];
      }
      fields.push(buf);
    } else if (s.slice(i, i + 4) === "true") {
      fields.push("true");
      i += 4;
    } else if (s.slice(i, i + 5) === "false") {
      fields.push("false");
      i += 5;
    } else if (s.slice(i, i + 4) === "null") {
      fields.push("null");
      i += 4;
    } else {
      return null;
    }
    while (i < s.length && (s[i] === " " || s[i] === ",")) i++;
  }
  if (fields.length !== 9) return null;
  return fields;
}

function apBlock(m) {
  const type = m.type;
  const nerf = m.nerf_risk;
  const diff = m.difficulty;
  const pop = m.popularity ?? m.vegas_availability;

  const volatility_summary = `${diff} play profile; nerf risk rated **${nerf}** for marketing/paytable drift.`;
  const popularity_summary = pop ? `Popularity (from seed): **${pop}**. Treat as marketing signal, not proof of edge.` : null;

  const edge_vectors = [];
  const verification_checklist = [];
  const common_pitfalls = [];
  const bankroll_angle =
    "Size sessions for worst-case drawdown before the persistent / bonus state pays you back; confirm denom and max-bet rules the same visit you scout.";

  const typeStr = typeof type === "string" ? type : "";
  if (
    typeStr === "Must Hit By" ||
    typeStr === "Must-Hit-By" ||
    typeStr.includes("Must-Hit-By") ||
    /\bmust\s+hit\s+by\b/i.test(typeStr)
  ) {
    edge_vectors.push(
      "Counter / must-hit distance vs cost-per-increment is the primary +EV lens; verify increment and reset on the glass.",
      "Average bonus / must-hit pay assumptions dominate — stale assumptions lie.",
      "Walk-away discipline: volatility around the hit window can erase paper EV."
    );
    verification_checklist.push(
      "Photo: must-hit ceiling, current counter, denom set, max-bet if tied to eligibility.",
      "Confirm marketing progressive vs machine-level caps for this bank."
    );
    common_pitfalls.push(
      "Chasing a 'close' counter with wrong denom or ineligible bet.",
      "Using last month's paytable photo for today's session."
    );
  } else if (type === "Persistent State") {
    edge_vectors.push(
      "Persistent meters / signatures on the glass — weak state vs strong state is the whole game.",
      "Cross-meter correlation: one 'good' meter can be negated by bad neighbors.",
      "Base-game RTP tax while you move state — count the dollars to clear, not only the top line."
    );
    verification_checklist.push(
      "Photo: each persistent ladder or meter family that matters for this title family.",
      "Denom, line count, and any 'must bet' for progressive eligibility."
    );
    common_pitfalls.push(
      "Eyeballing one meter in isolation.",
      "Assuming strip vs locals marketing matches this cabinet revision."
    );
  } else if (type === "Lock Game") {
    edge_vectors.push(
      "Lock cycles and reset economics — know what you buy when you enter the lock path.",
      "Completion vs abandon math once partial progress is sunk."
    );
    verification_checklist.push("Photo: lock rules summary on help screen if available; denom.");
    common_pitfalls.push("Ignoring partial-lock trap scenarios on high-volatility themes.");
  } else if (type === "Accumulator") {
    edge_vectors.push(
      "Stamp / book / collector completion paths — total cost to finish vs implied value.",
      "Rare titles: liquidity and nerf risk often dominate EV."
    );
    verification_checklist.push("Photo: collection rules, reset behavior, denom.");
    common_pitfalls.push("Starting a deep accumulator without a clear finish budget.");
  } else if (type === "Hybrid") {
    edge_vectors.push(
      "Hybrid = combine MHB / persistent heuristics: which axis actually carries the equity on this cabinet?"
    );
    verification_checklist.push("Photo both progressive-style readouts and any persistent meters.");
    common_pitfalls.push("Modeling only one half of the hybrid and ignoring the other.");
  } else {
    edge_vectors.push("Classify the visible persistence / must-hit / lock signature before sizing play.");
    verification_checklist.push("Photo paytable / help where material.");
    common_pitfalls.push("Playing from memory of a different revision of the same title.");
  }

  return {
    volatility_summary,
    popularity_summary,
    edge_vectors,
    bankroll_angle,
    verification_checklist,
    common_pitfalls,
    nerf_angle: `Nerf risk **${nerf}**: assume paytables, caps, and marketing can move without notice.`,
  };
}

function cardSummaryBullets(m) {
  const ap = apBlock(m);
  return [
    `${m.type}: ${ap.edge_vectors[0]}`,
    `Popularity: ${m.popularity ?? m.vegas_availability} — re-verify same visit.`,
    `Nerf: ${m.nerf_risk} — ${m.manufacturer} / jurisdictional packaging changes outcomes.`,
  ];
}

function guideMarkdownStub(m) {
  const ap = apBlock(m);
  return `# ${m.name} — advantage play notes (stub)

_Generated seed — edit freely. Sync to Supabase with \`npm run slots:sync\` when ready._

## What you are hunting

${m.name} is catalogued as **${m.type}** (${m.manufacturer}). Edge lives where **state on the glass** lines up with **correct denom / bet qualification** and **fresh paytable truth** for this bank.

## +EV checklist

${ap.edge_vectors.map((x) => `- ${x}`).join("\n")}

## Bankroll

${ap.bankroll_angle}

## Verify on the floor

${ap.verification_checklist.map((x) => `- ${x}`).join("\n")}

## Pitfalls

${ap.common_pitfalls.map((x) => `- ${x}`).join("\n")}

## Nerf / marketing

${ap.nerf_angle}
`;
}

function buildManifest(m) {
  const ap = apBlock(m);
  const legacy = LEGACY_ASSET_FOLDERS[m.slug];
  const legacyPath = legacy ? path.join(slotsRoot, legacy) : null;
  const legacyExists = legacyPath && fs.existsSync(legacyPath);

  return {
    schema_version: 1,
    source: "LVSlotPro repo Slots/<slug>/ — edit and run npm run slots:sync",
    machine: {
      slug: m.slug,
      name: m.name,
      manufacturer: m.manufacturer,
      type: m.type,
      difficulty: m.difficulty,
      popularity: m.popularity ?? m.vegas_availability,
      nerf_risk: m.nerf_risk,
      has_calculator: m.has_calculator,
      calculator_slug: m.calculator_slug,
      volatility_index: null,
      popularity_summary: null,
      release_year: defaultReleaseYearForSlug(m.slug),
    },
    guide_seed: {
      slug: m.slug,
      title: m.name,
      published: true,
      card_summary_bullets: cardSummaryBullets(m),
      card_ev_threshold: defaultCardEvThresholdForSlug(m.slug, m.type),
      content_markdown_file: "guide.md",
      last_updated: null,
    },
    ap,
    assets: {
      hero_relative: "hero.webp",
      thumbnails_relative: [],
      diagrams_relative: [],
      legacy_slots_subfolder: legacyExists ? legacy : null,
    },
  };
}

async function main() {
  const sql = await fsp.readFile(sqlPath, "utf8");
  const machines = parseMachineInsert(sql);
  if (machines.length === 0) throw new Error("No machine rows parsed");

  for (let m of machines) {
    const ovr = CALCULATOR_OVERRIDES[m.slug];
    if (ovr) m = { ...m, ...ovr };
    const dir = path.join(slotsRoot, m.slug);
    await fsp.mkdir(dir, { recursive: true });
    const manifest = buildManifest(m);
    await fsp.writeFile(
      path.join(dir, "card.meta.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    await fsp.writeFile(path.join(dir, "guide.md"), guideMarkdownStub(m), "utf8");
  }

  console.log(`Wrote ${machines.length} slot folders under Slots/<slug>/ with card.meta.json + guide.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
