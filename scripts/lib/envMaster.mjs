import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");

export const MASTER_FILE = ".env.master";

/** Parse KEY=VAL lines. Supports `export `, quotes, and `\n` escapes. */
export function parseEnvText(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    let s = raw.trim();
    if (!s || s.startsWith("#")) continue;
    if (s.startsWith("export ")) s = s.slice(7).trim();
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export function readEnvFile(relPath) {
  const full = path.isAbsolute(relPath) ? relPath : path.join(repoRoot, relPath);
  if (!fs.existsSync(full)) return {};
  return parseEnvText(fs.readFileSync(full, "utf8"));
}

export function readMasterEnv() {
  return readEnvFile(MASTER_FILE);
}

export function firstNonEmpty(env, ...keys) {
  for (const key of keys) {
    const val = env?.[key];
    if (val != null && String(val).trim() !== "") return String(val);
  }
  return "";
}

/**
 * Map TEST_* / PROD_* master keys onto the unprefixed names scripts already
 * expect (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, …).
 */
export function applyMasterTarget(env, target) {
  const prefix = target === "production" ? "PROD_" : "TEST_";
  const mapped = {
    SUPABASE_URL: firstNonEmpty(env, `${prefix}SUPABASE_URL`),
    SUPABASE_SERVICE_ROLE_KEY: firstNonEmpty(env, `${prefix}SUPABASE_SERVICE_ROLE_KEY`),
    SUPABASE_DB_PASSWORD: firstNonEmpty(env, `${prefix}SUPABASE_DB_PASSWORD`),
    SUPABASE_DB_URL: firstNonEmpty(env, `${prefix}SUPABASE_DB_URL`),
    CLOUDFLARE_ACCOUNT_ID: firstNonEmpty(env, `${prefix}CLOUDFLARE_ACCOUNT_ID`),
    CLOUDFLARE_STREAM_API_TOKEN: firstNonEmpty(env, `${prefix}CLOUDFLARE_STREAM_API_TOKEN`),
  };
  for (const [key, val] of Object.entries(mapped)) {
    if (val) env[key] = val;
  }
  return env;
}
