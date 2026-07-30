import fs from 'fs';
import pg from 'pg';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const RECORD_ONLY = [
  {
    version: '20260728000000',
    name: '20260728000000_chat_calls',
    reason: 'Objects already on prod; function sections skipped (28030000 has newer return types).',
  },
  {
    version: '20260728020000',
    name: '20260728020000_chat_call_missed_activity',
    reason: 'Constraint + functions already on prod from out-of-order deploy.',
  },
];

loadSupabaseEnv('production');
const url = poolerUrlWithPassword(
  fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
  process.env.SUPABASE_DB_PASSWORD.trim(),
);
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

for (const m of RECORD_ONLY) {
  const { rows } = await c.query(
    'select 1 from supabase_migrations.schema_migrations where version = $1 limit 1',
    [m.version],
  );
  if (rows.length) {
    console.log(`SKIP (already tracked): ${m.name}`);
    continue;
  }
  await c.query(
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values ($1, $2, ARRAY[]::text[])`,
    [m.version, m.name],
  );
  console.log(`RECORDED: ${m.name} — ${m.reason}`);
}

const latest = await c.query(
  `select version, name from supabase_migrations.schema_migrations
   order by version desc limit 5`,
);
console.log('\nLatest tracked:');
for (const r of latest.rows) console.log(`  ${r.version}  ${r.name}`);

await c.end();
