/**
 * Ingest one AP guide from a JSON payload file → test Supabase.
 * Usage: node scripts/ap-guide-ingest-payload.mjs <path-to.json>
 */
import fs from "fs";
import path from "path";
import { runSlotGuideIngest } from "./lib/runSlotGuideIngest.mjs";

const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("Usage: node scripts/ap-guide-ingest-payload.mjs <payload.json>");
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(path.resolve(payloadPath), "utf8"));
const out = await runSlotGuideIngest({
  payload: payload.payload ?? payload,
  target: payload.target ?? "test",
  writeRepo: Boolean(payload.writeRepo),
  syncSupabase: payload.syncSupabase !== false,
});

if (!out.ok) {
  console.error("Validation failed:", out.errors);
  process.exit(1);
}

console.log(JSON.stringify(out.result, null, 2));
console.log(`\nIngested ${out.result.slug} → ${out.result.supabaseHost || "test"}`);
