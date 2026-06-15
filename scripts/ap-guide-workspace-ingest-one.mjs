/**
 * Ingest one AP guide from ap-guide-workspace/<slug>/REWRITE.md → test Supabase.
 * Usage: node scripts/ap-guide-workspace-ingest-one.mjs <slug> [--repo]
 *
 * Parses section headers from REWRITE.md (metadata block + ## 🟢 … sections).
 * Skips the "Compiled markdown" appendix. No hero image unless you add one later in the form.
 */

import fs from "fs";
import path from "path";
import { runSlotGuideIngest } from "./lib/runSlotGuideIngest.mjs";
import { moveWorkspaceFolderToDone, DONE_DIR_NAME } from "./lib/apGuideWorkspaceBatch.mjs";
import { repoRoot } from "./lib/supabaseEnv.mjs";

const SECTION_MAP = [
  [/## 🟢 When to play/i, "when_to_play"],
  [/## 🛑 When to stop/i, "when_to_stop"],
  [/## 🔍 How to check/i, "how_to_check"],
  [/## 💰 Bankroll/i, "risk_bankroll"],
  [/## ⚠️ Risk/i, "risk_summary"],
  [/## 📍 Where to find/i, "where_to_find"],
  [/## 🎭 Skins/i, "skins_markdown"],
  [/## 🎰 Gameplay Mechanics/i, "gameplay_mechanics"],
];

/** @param {string} text */
function parseRewriteMeta(text) {
  /** @type {Record<string, string>} */
  const meta = {};
  const slugM = text.match(/Edge slug:\s*`([^`]+)`/i);
  if (slugM) meta.slug = slugM[1].trim();
  const nameM = text.match(/Machine name:\s*\*\*([^*]+)\*\*/i);
  if (nameM) meta.name = nameM[1].trim();
  const mfgM = text.match(/Manufacturer:\s*\*\*([^*]+)\*\*/i);
  if (mfgM) meta.manufacturer = mfgM[1].trim();
  const popM = text.match(/Suggested popularity:\s*\*\*([^*]+)\*\*/i);
  if (popM) meta.popularity = popM[1].trim();
  const diffM = text.match(/Suggested difficulty:\s*\*\*([^*]+)\*\*/i);
  if (diffM) meta.difficulty = diffM[1].trim();
  const nerfM = text.match(/Suggested nerf risk:\s*\*\*([^*]+)\*\*/i);
  if (nerfM) meta.nerf_risk = nerfM[1].trim();
  return meta;
}

/** @param {string} text */
function parseRewriteSections(text) {
  const bodyStart = text.indexOf("## 🟢 When to play");
  const compiledIdx = text.indexOf("# Compiled markdown");
  const slice = bodyStart >= 0 ? text.slice(bodyStart, compiledIdx >= 0 ? compiledIdx : undefined) : "";

  /** @type {Record<string, string>} */
  const sections = {};
  for (let i = 0; i < SECTION_MAP.length; i++) {
    const [headerRe, key] = SECTION_MAP[i];
    const nextHeader = SECTION_MAP[i + 1]?.[0];
    const startM = slice.match(headerRe);
    if (!startM || startM.index == null) continue;
    const afterHeader = slice.indexOf("\n", startM.index) + 1;
    let end = slice.length;
    if (nextHeader) {
      const nextM = slice.slice(afterHeader).match(nextHeader);
      if (nextM && nextM.index != null) end = afterHeader + nextM.index;
    }
    sections[key] = slice.slice(afterHeader, end).replace(/^---\s*$/gm, "").trim();
  }
  return sections;
}

/** @param {string} slugArg */
function loadRewrite(slugArg) {
  const rewritePath = path.join(repoRoot, "ap-guide-workspace", slugArg, "REWRITE.md");
  if (!fs.existsSync(rewritePath)) {
    throw new Error(`Missing ${rewritePath}`);
  }
  const text = fs.readFileSync(rewritePath, "utf8");
  const meta = parseRewriteMeta(text);
  const sections = parseRewriteSections(text);
  const slug = meta.slug || slugArg;
  if (!meta.name) throw new Error("REWRITE.md missing Machine name metadata.");
  return { slug, meta, sections };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const writeRepo = process.argv.includes("--repo");
  const slugArg = args[0];
  if (!slugArg) {
    console.error("Usage: node scripts/ap-guide-workspace-ingest-one.mjs <slug> [--repo]");
    process.exit(1);
  }

  const { slug, meta, sections } = loadRewrite(slugArg);

  const payload = {
    machine: {
      slug,
      name: meta.name,
      manufacturer: meta.manufacturer || "Light & Wonder",
      type: "Must Hit By",
      difficulty: meta.difficulty || "Intermediate",
      popularity: meta.popularity || "Uncommon",
      nerf_risk: meta.nerf_risk || "Medium",
      has_calculator: false,
      calculator_slug: null,
      volatility_index: "Med-High",
      popularity_summary: "Uncommon nationally vs base 88 Fortunes; Vegas + Florida are reasonable hunt markets.",
    },
    guide: {
      title: meta.name,
      published: true,
      card_ev_threshold: "15+ free games counter (14 break-even) · Minor ~95%+",
      when_to_play: sections.when_to_play || "",
      when_to_stop: sections.when_to_stop || "",
      how_to_check: sections.how_to_check || "",
      risk_bankroll: sections.risk_bankroll || "",
      risk_summary: sections.risk_summary || "",
      risk_bullets: [],
      where_to_find: sections.where_to_find || "",
      skins_markdown: sections.skins_markdown || "",
      gameplay_mechanics: sections.gameplay_mechanics || "",
    },
    diagrams: [],
  };

  const out = await runSlotGuideIngest({
    payload,
    target: "test",
    writeRepo,
    syncSupabase: true,
  });

  if (!out.ok) {
    console.error("Validation failed:", out.errors);
    process.exit(1);
  }

  console.log(JSON.stringify(out.result, null, 2));
  console.log(`\nIngested ${slug} → ${out.result.supabaseHost || "test Supabase"}`);
  console.log("Edit at /slot-guide-form → Fetch by slug → Load → Save.");

  const archived = await moveWorkspaceFolderToDone(slugArg);
  if (archived.moved) {
    console.log(`Archived workspace → ${DONE_DIR_NAME}/${slugArg}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
