#!/usr/bin/env node
/** Seed prod poker catalog heartbeat after 40800 (recent GH sync). */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

loadSupabaseEnv('production');
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) throw new Error('SUPABASE_DB_PASSWORD missing');

const pooler = fs.readFileSync(path.join('supabase', '.temp', 'pooler-url'), 'utf8').trim();
const connectionString = process.env.SUPABASE_DB_URL?.trim() || poolerUrlWithPassword(pooler, password);
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(
  `select public.admin_ops_record_job_heartbeat($1, $2, $3::jsonb)`,
  [
    'poker_catalog_sync_production',
    'ok',
    JSON.stringify({ note: 'seed after 40800 — recent GitHub Actions sync' }),
  ],
);

const { rows } = await client.query(
  `select job_id, last_success_at, last_status, last_detail
   from public.admin_ops_job_heartbeats
   where job_id = 'poker_catalog_sync_production'`,
);
console.log(JSON.stringify(rows[0], null, 2));
await client.end();
