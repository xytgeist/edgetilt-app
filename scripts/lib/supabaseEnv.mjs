import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..", "..");

const TARGET_ENV_FILES = {
  test: ".env.supabase.test",
  production: ".env.supabase.production",
};

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

export function targetHuman(t) {
  if (t === "test") return "test";
  if (t === "production") return "production";
  return "default (.env only)";
}

/** Apply target-specific env vars when set (e.g. Vercel preview vs production). */
function applyTargetEnvFromProcess(target) {
  const suffix = target === "production" ? "_PRODUCTION" : "_TEST";
  const url =
    process.env[`SUPABASE_URL${suffix}`]?.trim() ||
    (target === "production"
      ? process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim()
      : process.env.SUPABASE_URL?.trim()) ||
    "";
  const key =
    process.env[`SUPABASE_SERVICE_ROLE_KEY${suffix}`]?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  if (url) process.env.SUPABASE_URL = url.replace(/\/+$/, "");
  if (key) process.env.SUPABASE_SERVICE_ROLE_KEY = key;
}

/** @param {"test" | "production" | null | undefined} target */
export function loadSupabaseEnv(target) {
  applyEnvFile(path.join(repoRoot, ".env"), { fillEmptyOnly: true });
  if (target == null) return;
  const file = TARGET_ENV_FILES[target];
  if (!file) return;
  const full = path.join(repoRoot, file);
  if (applyEnvFile(full, { fillEmptyOnly: false })) return;

  // Vercel / CI: no gitignored file — use dashboard env (SUPABASE_* or SUPABASE_*_TEST / *_PRODUCTION)
  applyTargetEnvFromProcess(target);
  const { url, key } = readSupabaseCredentials();
  if (url && key) return;

  throw new Error(
    `Missing ${file} for target=${target} (local dev), and no Supabase credentials in process.env. ` +
      `Local: create repo-root ${file} with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. ` +
      `Vercel: set those vars (or SUPABASE_URL_${target === "production" ? "PRODUCTION" : "TEST"} + matching service role key) on the deployment.`
  );
}

export function readSupabaseCredentials() {
  const urlRaw = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const url = urlRaw?.trim()?.replace(/\/+$/, "") || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  return { url, key };
}

export function createSupabaseServiceClient(createClient) {
  const { url, key } = readSupabaseCredentials();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
