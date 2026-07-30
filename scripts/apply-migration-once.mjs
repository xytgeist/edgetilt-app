#!/usr/bin/env node
/** Apply one migration file to test or production via pg. Usage: node scripts/apply-migration-once.mjs --target=test 20260730240800_admin_ops_poker_catalog_heartbeat.sql */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const targetArg = process.argv.find((a) => a.startsWith('--target='))?.slice('--target='.length)
  || (process.argv.includes('--target') ? process.argv[process.argv.indexOf('--target') + 1] : null)
  || 'test';
const file = process.argv.filter((a) => !a.startsWith('--') && a.endsWith('.sql')).pop()
  || process.argv.filter((a) => !a.startsWith('--') && a !== targetArg).pop();

if (!file || (targetArg !== 'test' && targetArg !== 'production')) {
  console.error('Usage: node scripts/apply-migration-once.mjs --target=test|production <migration.sql>');
  process.exit(1);
}

const version = file.replace(/\.sql$/, '').split('_')[0];
const name = file.replace(/\.sql$/, '');

loadSupabaseEnv(targetArg);
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) throw new Error(`SUPABASE_DB_PASSWORD missing for ${targetArg}`);

const pooler = fs.readFileSync(path.join('supabase', '.temp', 'pooler-url'), 'utf8').trim();
const connectionString = process.env.SUPABASE_DB_URL?.trim() || poolerUrlWithPassword(pooler, password);
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const tracked = await client.query(
  'select 1 from supabase_migrations.schema_migrations where version = $1 limit 1',
  [version],
);
if (tracked.rows.length) {
  console.log(`${targetArg}: SKIP (tracked) ${file}`);
  await client.end();
  process.exit(0);
}

const sqlText = fs.readFileSync(path.join('supabase', 'migrations', file), 'utf8');
process.stdout.write(`${targetArg}: APPLY ${file} ... `);
try {
  await client.query('BEGIN');
  await client.query(sqlText);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, ARRAY[]::text[])
     on conflict (version) do nothing`,
    [version, name],
  );
  await client.query('COMMIT');
  console.log('OK');
} catch (err) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  console.log('FAIL');
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
