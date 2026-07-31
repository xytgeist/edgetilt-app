#!/usr/bin/env node
/**
 * Broadcast AP Guide release notification (in-app Alerts + web push).
 *
 * Usage:
 *   node scripts/broadcast-ap-guide-released.mjs --target=production --slug=ocean-magic-treasure-box
 *   node scripts/broadcast-ap-guide-released.mjs --target=production --slug=ocean-magic-treasure-box --dry-run
 */
import pg from 'pg';
import fs from 'fs';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const args = process.argv.slice(2);
const target =
  args.find((a) => a.startsWith('--target='))?.slice('--target='.length) ||
  (args.includes('--target') ? args[args.indexOf('--target') + 1] : 'production');
const slug =
  args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length) ||
  (args.includes('--slug') ? args[args.indexOf('--slug') + 1] : '');
const titleArg =
  args.find((a) => a.startsWith('--title='))?.slice('--title='.length) ||
  (args.includes('--title') ? args[args.indexOf('--title') + 1] : null);
const dryRun = args.includes('--dry-run');

if (!slug || (target !== 'test' && target !== 'production')) {
  console.error(
    'Usage: node scripts/broadcast-ap-guide-released.mjs --target=production --slug=guide-slug [--title="Display Title"] [--dry-run]',
  );
  process.exit(1);
}

loadSupabaseEnv(target);
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) throw new Error(`SUPABASE_DB_PASSWORD missing for ${target}`);

const url =
  process.env.SUPABASE_DB_URL?.trim() ||
  poolerUrlWithPassword(fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim(), password);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  const { rows } = await client.query(
    `select public.admin_broadcast_ap_guide_released($1, $2, $3) as result`,
    [slug, titleArg, dryRun],
  );
  console.log(JSON.stringify(rows[0]?.result, null, 2));
} finally {
  await client.end();
}
