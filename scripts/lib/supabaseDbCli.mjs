import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSupabaseEnv, repoRoot } from "./supabaseEnv.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {Record<"test" | "production", string>} */
export const PROJECT_REFS = {
  test: "kcosfvmreeiosdjdzycb",
  production: "jtjgtucumuoswnbauxry",
};

const RETRY_DELAYS_MS = [0, 15_000, 45_000, 90_000];
const LOCK_PATH = path.join(repoRoot, "supabase", ".temp", "db-query.lock");
const POOLER_URL_PATH = path.join(repoRoot, "supabase", ".temp", "pooler-url");
const PROJECT_REF_PATH = path.join(repoRoot, "supabase", ".temp", "project-ref");

const AUTH_FAILURE_RE =
  /SASL auth|cli_login_postgres|ECIRCUITBREAKER|circuit breaker|authentication failures|password authentication failed|LegacyDbConfigConnectTempRoleError/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readProjectRefFromDisk() {
  try {
    return fs.readFileSync(PROJECT_REF_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

function readPoolerUrlFromDisk() {
  try {
    return fs.readFileSync(POOLER_URL_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

/** @param {string} poolerUrl @param {string} password */
export function poolerUrlWithPassword(poolerUrl, password) {
  const trimmed = poolerUrl.trim();
  if (!trimmed) {
    throw new Error("Missing pooler URL. Run ensureLinked() first.");
  }
  const u = new URL(trimmed);
  u.password = password;
  return u.toString();
}

/**
 * Resolve a runnable Supabase CLI invocation.
 * Bare `spawnSync("supabase")` is ENOENT on Windows (needs .cmd / PATH shell resolve).
 * Prefer `npx supabase` so local and CI behave the same.
 */
function supabaseCliInvocation(args) {
  if (process.platform === "win32") {
    return {
      command: "npx.cmd",
      argv: ["--yes", "supabase", ...args],
      shell: true,
    };
  }
  return {
    command: "npx",
    argv: ["--yes", "supabase", ...args],
    shell: false,
  };
}

function runSupabaseCli(args, { env = process.env } = {}) {
  const { command, argv, shell } = supabaseCliInvocation(args);
  const result = spawnSync(command, argv, {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const combined = `${stdout}\n${stderr}`.trim();
  if (result.error) {
    const err = new Error(
      `${result.error.message}\n(command: ${command} ${argv.join(" ")})`,
    );
    err.exitCode = 1;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
  if (result.status !== 0) {
    const err = new Error(combined || `supabase ${args.join(" ")} failed`);
    err.exitCode = result.status ?? 1;
    err.stdout = stdout;
    err.stderr = stderr;
    throw err;
  }
  return { stdout, stderr, combined };
}

/** @param {"test" | "production"} target */
export function ensureLinked(target) {
  const ref = PROJECT_REFS[target];
  const currentRef = readProjectRefFromDisk();
  const poolerUrl = readPoolerUrlFromDisk();
  const password = process.env.SUPABASE_DB_PASSWORD?.trim() || "";
  const poolerMatchesRef =
    Boolean(poolerUrl) && poolerUrl.includes(`postgres.${ref}@`);

  if (currentRef === ref && poolerMatchesRef) {
    return ref;
  }

  const linkArgs = ["link", "--project-ref", ref, "--yes"];
  if (password) {
    linkArgs.push("--password", password);
  }

  const env = { ...process.env };
  if (password) {
    env.SUPABASE_DB_PASSWORD = password;
  }

  try {
    runSupabaseCli(linkArgs, { env });
  } catch (err) {
    // Windows/OneDrive can fail `supabase link` with AlreadyExists on .temp.
    // Fall back to writing the link metadata ourselves so --target cannot drift.
    fs.mkdirSync(path.dirname(PROJECT_REF_PATH), { recursive: true });
    fs.writeFileSync(PROJECT_REF_PATH, ref, "utf8");
    const regionGuess =
      poolerUrl?.match(/@(aws-\d+-[a-z0-9-]+)\.pooler\.supabase\.com/)?.[1] ||
      "aws-1-us-east-1";
    fs.writeFileSync(
      POOLER_URL_PATH,
      `postgresql://postgres.${ref}@${regionGuess}.pooler.supabase.com:5432/postgres`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(path.dirname(PROJECT_REF_PATH), "linked-project.json"),
      JSON.stringify({ ref, name: `linked-${target}`, organization_id: "", organization_slug: "" }),
      "utf8",
    );
    process.stderr.write(
      `[supabase-db-query] supabase link failed (${err?.message || err}); wrote project-ref=${ref} manually.\n`,
    );
  }

  const afterRef = readProjectRefFromDisk();
  if (afterRef !== ref) {
    throw new Error(
      `Failed to link Supabase CLI to ${ref} (still "${afterRef || "unset"}").`,
    );
  }
  return ref;
}

async function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true });
  const start = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(LOCK_PATH, "wx");
      fs.writeFileSync(
        fd,
        JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
      );
      fs.closeSync(fd);
      return;
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      if (Date.now() - start > 5 * 60_000) {
        throw new Error(
          `Timed out waiting for ${LOCK_PATH}. Another supabase-db-query is still running.`,
        );
      }
      await sleep(2000);
    }
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* ignore */
  }
}

function resolveDbUrl(target) {
  const explicit = process.env.SUPABASE_DB_URL?.trim();
  if (explicit) return explicit;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  if (!password) return null;

  ensureLinked(target);
  const poolerUrl = readPoolerUrlFromDisk();
  if (!poolerUrl) {
    throw new Error(
      `Linked ${PROJECT_REFS[target]} but ${POOLER_URL_PATH} is missing. Re-run: npm run db:query:${target === "production" ? "production" : "test"} -- "select 1"`,
    );
  }
  return poolerUrlWithPassword(poolerUrl, password);
}

function isAuthFailure(err) {
  const text = `${err?.message ?? ""}\n${err?.stdout ?? ""}\n${err?.stderr ?? ""}`;
  return AUTH_FAILURE_RE.test(text);
}

/**
 * Run SQL against test or production with serialized access and retries.
 * Prefers --db-url + postgres password when SUPABASE_DB_PASSWORD is set (avoids cli_login_postgres pooler bugs).
 *
 * @param {{
 *   target: "test" | "production";
 *   sql?: string;
 *   file?: string;
 *   output?: "table" | "json" | "csv";
 * }} opts
 */
export async function runSupabaseDbQuery(opts) {
  const { target, sql, file, output = "json" } = opts;
  if (!sql && !file) {
    throw new Error("Provide sql or file.");
  }
  if (sql && file) {
    throw new Error("Provide only one of sql or file.");
  }

  loadSupabaseEnv(target);
  await acquireLock();

  try {
    // Always re-link before --linked so --target=test cannot silently hit a stale
    // project-ref (e.g. production). Prefer --db-url when SUPABASE_DB_PASSWORD is set.
    ensureLinked(target);
    const dbUrl = resolveDbUrl(target);
    const linkedRef = readProjectRefFromDisk();
    const expectedRef = PROJECT_REFS[target];
    if (!dbUrl && linkedRef && linkedRef !== expectedRef) {
      throw new Error(
        `Refusing --linked query for target=${target}: supabase/.temp/project-ref is "${linkedRef}" but expected "${expectedRef}". Re-run supabase link --project-ref ${expectedRef}, or set SUPABASE_DB_PASSWORD in .env.supabase.${target}.`,
      );
    }
    process.stderr.write(
      `[supabase-db-query] target=${target} project=${expectedRef} via=${dbUrl ? "db-url" : "linked"}\n`,
    );
    let lastErr;

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay > 0) {
        process.stderr.write(
          `[supabase-db-query] auth/pooler retry ${attempt}/${RETRY_DELAYS_MS.length - 1} in ${delay / 1000}s…\n`,
        );
        await sleep(delay);
      }

      try {
        if (!dbUrl) {
          ensureLinked(target);
        }

        const args = ["db", "query", "-o", output];
        if (dbUrl) {
          // Pass the URL literally... encodeURIComponent breaks userinfo / breaks auth.
          args.push("--db-url", dbUrl);
        } else {
          args.push("--linked");
        }
        if (file) {
          args.push("-f", file);
        } else {
          args.push(sql);
        }

        return runSupabaseCli(args);
      } catch (err) {
        lastErr = err;
        if (!isAuthFailure(err) || attempt === RETRY_DELAYS_MS.length - 1) {
          throw enrichAuthHelp(err, target, Boolean(dbUrl));
        }
      }
    }

    throw enrichAuthHelp(lastErr, target, Boolean(dbUrl));
  } finally {
    releaseLock();
  }
}

/** @param {Error} err @param {"test" | "production"} target @param {boolean} usedPassword */
function enrichAuthHelp(err, target, usedPassword) {
  if (!isAuthFailure(err)) return err;

  const envFile =
    target === "production" ? ".env.supabase.production" : ".env.supabase.test";
  const hint = usedPassword
    ? `Pooler auth still failed for ${PROJECT_REFS[target]}. Check Database Settings → unblock your IP, confirm SUPABASE_DB_PASSWORD in ${envFile}, wait ~2 min if circuit breaker tripped, then retry.`
    : `Pooler auth failed for ${PROJECT_REFS[target]} (cli_login_postgres / circuit breaker). Add SUPABASE_DB_PASSWORD to repo-root ${envFile} (Dashboard → Settings → Database → password). Copy .env.supabase.example. Then rerun — script uses postgres role via --db-url and skips the flaky temp login role.`;

  const wrapped = new Error(`${err.message}\n\n${hint}`);
  wrapped.exitCode = err.exitCode;
  wrapped.stdout = err.stdout;
  wrapped.stderr = err.stderr;
  return wrapped;
}

/** Quick health check for agents — throws with actionable hint on failure. */
export async function probeSupabaseDb(target) {
  const { stdout } = await runSupabaseDbQuery({
    target,
    sql: "select 1 as ok;",
    output: "json",
  });
  return stdout;
}
