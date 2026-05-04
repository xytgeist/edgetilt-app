/**
 * Merge `machine.release_year` and `guide_seed.card_gist` into each Slots/<slug>/card.meta.json
 * when missing, using defaults from src/constants/slotCardGists.js .
 *
 *   node scripts/backfill-slot-card-fields.mjs
 */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { defaultCardGistForSlug, defaultReleaseYearForSlug } from "../src/constants/slotCardGists.js";

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
    const gist = json.guide_seed.card_gist;
    if (gist === undefined || gist === null || String(gist).trim() === "") {
      json.guide_seed.card_gist = defaultCardGistForSlug(slug, json.machine.type);
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
