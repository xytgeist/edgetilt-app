/**
 * Merge `machine.release_year` and `guide_seed.card_ev_threshold` into each Slots/<slug>/card.meta.json
 * when missing, using defaults from src/constants/slotCardEvThreshold.js .
 *
 *   node scripts/backfill-slot-card-fields.mjs
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { defaultCardEvThresholdForSlug, defaultReleaseYearForSlug } from "../src/constants/slotCardEvThreshold.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const slotsRoot = path.join(repoRoot, "Slots");

async function main() {
  const entries = await fsp.readdir(slotsRoot, { withFileTypes: true });
  let updated = 0;
  for (const e of entries) {
    if (!e.isDirectory() || !/^[a-z0-9-]+$/.test(e.name)) continue;
    const metaPath = path.join(slotsRoot, e.name, "card.meta.json");
    if (!fs.existsSync(metaPath)) continue;
    const raw = await fsp.readFile(metaPath, "utf8");
    const json = JSON.parse(raw);
    const slug = json.machine?.slug ?? e.name;
    if (!json.machine || json.machine.slug !== e.name) continue;

    let changed = false;
    if (json.machine.release_year === undefined) {
      json.machine.release_year = defaultReleaseYearForSlug(slug);
      changed = true;
    }
    json.guide_seed = json.guide_seed || {};
    const legacy = json.guide_seed.card_gist;
    if (legacy !== undefined && legacy !== null && String(legacy).trim() !== "") {
      const cur = json.guide_seed.card_ev_threshold;
      if (cur === undefined || cur === null || String(cur).trim() === "") {
        json.guide_seed.card_ev_threshold = String(legacy).trim();
      }
      delete json.guide_seed.card_gist;
      changed = true;
    }
    const ev = json.guide_seed.card_ev_threshold;
    if (ev === undefined || ev === null || String(ev).trim() === "") {
      json.guide_seed.card_ev_threshold = defaultCardEvThresholdForSlug(slug, json.machine.type);
      if (json.guide_seed.card_gist !== undefined) delete json.guide_seed.card_gist;
      changed = true;
    }

    if (changed) {
      await fsp.writeFile(metaPath, JSON.stringify(json, null, 2) + "\n", "utf8");
      updated++;
      console.log("updated", slug);
    }
  }
  console.log(`Done. Patched ${updated} manifest(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
