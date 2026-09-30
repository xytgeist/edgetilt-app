#!/usr/bin/env node
/**
 * Materialize the split env files the repo already reads from one `.env.master`.
 *
 *   npm run env:sync
 *
 * Copy `.env.master` between machines, then run this. Do not hand-edit the
 * generated files … change `.env.master` and re-run.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { firstNonEmpty, parseEnvText } from "./lib/envMaster.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const masterPath = path.join(root, ".env.master");

if (!fs.existsSync(masterPath)) {
  console.error("Missing .env.master. Copy it from another machine, or copy .env.master.example → .env.master and fill values.");
  process.exit(1);
}

const env = parseEnvText(fs.readFileSync(masterPath, "utf8"));
const backupStamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(root, ".env-backups", backupStamp);

function backupExisting(relPath, nextKeys) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return;
  const prev = fs.readFileSync(abs, "utf8");
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, relPath), prev);
  const prevKeys = Object.entries(parseEnvText(prev))
    .filter(([, v]) => String(v ?? "").trim() !== "")
    .map(([k]) => k);
  const dropped = prevKeys.filter((k) => !nextKeys.has(k));
  if (dropped.length) {
    console.warn(`warn  ${relPath} drops: ${dropped.join(", ")} (old copy in .env-backups/${backupStamp}/)`);
  }
}

function formatVal(val) {
  const s = String(val ?? "");
  if (!s) return "";
  if (s.includes("\n")) return `"${s.replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`;
  return s;
}

function writeGenerated(relPath, pairs, extraComments = []) {
  const lines = [
    "# Generated from .env.master. Do not edit.",
    "# Change .env.master, then: npm run env:sync",
    ...extraComments,
    "",
  ];
  const header = lines.length;
  const nextKeys = new Set();
  for (const [key, val] of pairs) {
    if (val == null || String(val).trim() === "") continue;
    lines.push(`${key}=${formatVal(val)}`);
    nextKeys.add(key);
  }
  if (lines.length <= header) {
    if (fs.existsSync(path.join(root, relPath))) {
      console.log(`skip  ${relPath} (no values in .env.master)`);
    }
    return false;
  }
  backupExisting(relPath, nextKeys);
  fs.writeFileSync(path.join(root, relPath), `${lines.join("\n")}\n`);
  console.log(`wrote ${relPath}`);
  return true;
}

writeGenerated(".env.local", [
  ["VITE_SUPABASE_URL", firstNonEmpty(env, "TEST_VITE_SUPABASE_URL", "TEST_SUPABASE_URL")],
  ["VITE_SUPABASE_ANON_KEY", firstNonEmpty(env, "TEST_VITE_SUPABASE_ANON_KEY")],
  ["VITE_WEB_PUSH_PUBLIC_KEY", firstNonEmpty(env, "TEST_VITE_WEB_PUSH_PUBLIC_KEY")],
  ["THEO_TEST_EMAIL", firstNonEmpty(env, "THEO_TEST_EMAIL")],
  ["THEO_TEST_PASSWORD", firstNonEmpty(env, "THEO_TEST_PASSWORD")],
  ["THEO_PROD_EMAIL", firstNonEmpty(env, "THEO_PROD_EMAIL")],
  ["THEO_PROD_PASSWORD", firstNonEmpty(env, "THEO_PROD_PASSWORD")],
  ["THEO_PROD_ANON_KEY", firstNonEmpty(env, "THEO_PROD_ANON_KEY")],
  ["STRIPE_SUPPORT_KEY_LIVE", firstNonEmpty(env, "STRIPE_SUPPORT_KEY_LIVE")],
  ["ODDSPAPI_API_KEY", firstNonEmpty(env, "ODDSPAPI_API_KEY")],
  ["KAGGLE_API_TOKEN", firstNonEmpty(env, "KAGGLE_API_TOKEN")],
]);

writeGenerated(
  ".env.supabase.test",
  [
    ["SUPABASE_URL", firstNonEmpty(env, "TEST_SUPABASE_URL")],
    ["SUPABASE_SERVICE_ROLE_KEY", firstNonEmpty(env, "TEST_SUPABASE_SERVICE_ROLE_KEY")],
    ["SUPABASE_DB_PASSWORD", firstNonEmpty(env, "TEST_SUPABASE_DB_PASSWORD")],
    ["SUPABASE_DB_URL", firstNonEmpty(env, "TEST_SUPABASE_DB_URL")],
    ["CLOUDFLARE_ACCOUNT_ID", firstNonEmpty(env, "TEST_CLOUDFLARE_ACCOUNT_ID")],
    ["CLOUDFLARE_STREAM_API_TOKEN", firstNonEmpty(env, "TEST_CLOUDFLARE_STREAM_API_TOKEN")],
    ["THE_ODDS_API_KEY", firstNonEmpty(env, "THE_ODDS_API_KEY")],
    ["THERUNDOWN_API_KEY", firstNonEmpty(env, "THERUNDOWN_API_KEY")],
    ["CFBD_API_KEY", firstNonEmpty(env, "CFBD_API_KEY")],
    ["FANTASYPROS_API_KEY", firstNonEmpty(env, "FANTASYPROS_API_KEY")],
    ["KALSHI_API_KEY_ID", firstNonEmpty(env, "KALSHI_API_KEY_ID")],
    ["KALSHI_PRIVATE_KEY", firstNonEmpty(env, "KALSHI_PRIVATE_KEY")],
  ],
  ["# Test: kcosfvmreeiosdjdzycb (lvslotpro.com sandbox)"],
);

writeGenerated(
  ".env.supabase.production",
  [
    ["SUPABASE_URL", firstNonEmpty(env, "PROD_SUPABASE_URL")],
    ["SUPABASE_SERVICE_ROLE_KEY", firstNonEmpty(env, "PROD_SUPABASE_SERVICE_ROLE_KEY")],
    ["SUPABASE_DB_PASSWORD", firstNonEmpty(env, "PROD_SUPABASE_DB_PASSWORD")],
    ["SUPABASE_DB_URL", firstNonEmpty(env, "PROD_SUPABASE_DB_URL")],
    ["SUPABASE_ACCESS_TOKEN", firstNonEmpty(env, "SUPABASE_ACCESS_TOKEN")],
    ["APNS_KEY_ID", firstNonEmpty(env, "APNS_KEY_ID")],
    ["APNS_P8", firstNonEmpty(env, "APNS_P8")],
    ["APNS_TEAM_ID", firstNonEmpty(env, "APNS_TEAM_ID")],
    ["THE_ODDS_API_KEY", firstNonEmpty(env, "THE_ODDS_API_KEY")],
    ["THERUNDOWN_API_KEY", firstNonEmpty(env, "THERUNDOWN_API_KEY")],
    ["CFBD_API_KEY", firstNonEmpty(env, "CFBD_API_KEY")],
  ],
  ["# Production: jtjgtucumuoswnbauxry (edgetilt.com)"],
);

if (firstNonEmpty(env, "CF_OPS_API_TOKEN")) {
  writeGenerated(
    ".env.cloudflare.operations",
    [
      ["CLOUDFLARE_ACCOUNT_ID", firstNonEmpty(env, "CF_OPS_ACCOUNT_ID", "TEST_CLOUDFLARE_ACCOUNT_ID")],
      ["CLOUDFLARE_API_TOKEN", firstNonEmpty(env, "CF_OPS_API_TOKEN")],
    ],
    ["# Operations@lvslotpro.com … lvslotpro.com, sharpesyndicate.com"],
  );
} else {
  console.log("skip  .env.cloudflare.operations (no CF_OPS_API_TOKEN)");
}

if (firstNonEmpty(env, "CF_INV_API_TOKEN")) {
  writeGenerated(
    ".env.cloudflare.investigence",
    [
      ["CLOUDFLARE_ACCOUNT_ID", firstNonEmpty(env, "CF_INV_ACCOUNT_ID")],
      ["CLOUDFLARE_API_TOKEN", firstNonEmpty(env, "CF_INV_API_TOKEN")],
    ],
    ["# Investigence@gmail.com … edgetilt.com, digiverse.ventures, edgepro.live"],
  );
} else {
  console.log("skip  .env.cloudflare.investigence (no CF_INV_API_TOKEN)");
}
