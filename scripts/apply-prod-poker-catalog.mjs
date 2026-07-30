#!/usr/bin/env node
/**
 * Apply poker tournament catalog migrations + casino GPS patch on production.
 * Usage: node scripts/apply-prod-poker-catalog.mjs
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const POOLER_PATH = path.join('supabase', '.temp', 'pooler-url');
const MIGRATIONS = [
  '20260730210000_poker_tournament_catalog_source.sql',
  '20260730220000_poker_tournament_catalog_starts_at.sql',
  '20260730230000_poker_tournament_catalog_upsert_siblings.sql',
];
const CASINO_PATCH = path.join('supabase', 'seed', 'poker_catalog_casinos_patch.sql');

function migrationVersion(file) {
  return file.replace(/\.sql$/, '').split('_')[0];
}

function migrationName(file) {
  return file.replace(/\.sql$/, '');
}

loadSupabaseEnv('production');
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env.supabase.production');

const explicit = process.env.SUPABASE_DB_URL?.trim();
const pooler = fs.readFileSync(POOLER_PATH, 'utf8').trim();
const connectionString = explicit || poolerUrlWithPassword(pooler, password);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

async function applySql(label, sqlText, trackVersion = null, trackName = null) {
  process.stdout.write(`${label} ... `);
  try {
    await client.query('BEGIN');
    await client.query(sqlText);
    if (trackVersion) {
      await client.query(
        `insert into supabase_migrations.schema_migrations (version, name, statements)
         values ($1, $2, ARRAY[]::text[])
         on conflict (version) do nothing`,
        [trackVersion, trackName || trackVersion],
      );
    }
    await client.query('COMMIT');
    console.log('OK');
    return true;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log('FAIL');
    console.error(`  ${msg.split('\n')[0]}`);
    return false;
  }
}

let failed = 0;

for (const file of MIGRATIONS) {
  const version = migrationVersion(file);
  const { rows } = await client.query(
    'select 1 from supabase_migrations.schema_migrations where version = $1 limit 1',
    [version],
  );
  if (rows.length) {
    console.log(`SKIP (tracked): ${file}`);
    continue;
  }

  const sqlText = fs.readFileSync(path.join('supabase', 'migrations', file), 'utf8');
  const ok = await applySql(`APPLY ${file}`, sqlText, version, migrationName(file));
  if (!ok) failed += 1;
}

if (fs.existsSync(CASINO_PATCH)) {
  const patchSql = fs.readFileSync(CASINO_PATCH, 'utf8');
  const ok = await applySql('APPLY poker_catalog_casinos_patch.sql', patchSql);
  if (!ok) failed += 1;
}

const verify = await client.query(
  "select to_regprocedure('public.upsert_poker_tournament_catalog(jsonb,boolean)') is not null as ok",
);
console.log('verify upsert_rpc:', verify.rows[0]?.ok);

await client.end();
process.exit(failed ? 1 : 0);
