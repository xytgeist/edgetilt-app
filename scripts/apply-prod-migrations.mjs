#!/usr/bin/env node
/**
 * Apply pending prod migrations via pg (multi-statement SQL).
 * Usage: node scripts/apply-prod-migrations.mjs
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const POOLER_PATH = path.join('supabase', '.temp', 'pooler-url');
const MIGRATIONS = [
  '20260725230000_lounge_bot_alert_destinations.sql',
  '20260726000000_lounge_bot_alert_route_objects.sql',
  '20260726210000_admin_comp_slots_edge_lifetime.sql',
  '20260726220000_lounge_bot_max_posts_no_limit.sql',
  '20260726230000_lounge_feed_visible_at_backfill_non_stream.sql',
  '20260726240000_lounge_bot_live_pick_guards.sql',
  '20260726250000_lounge_bot_publish_log_sub_chat_message_id.sql',
  '20260726260000_lounge_bot_alert_thresholds_v1.sql',
  '20260727210000_profiles_phone_number.sql',
  '20260728000000_chat_calls.sql',
  '20260728010000_upsert_my_push_subscription.sql',
  '20260728020000_chat_call_missed_activity.sql',
  '20260728030000_chat_call_missed_in_lounge_notifications.sql',
  '20260728040000_chat_calls_replica_identity_full.sql',
  '20260728050000_chat_calls_group_video.sql',
  '20260728060000_chat_calls_recording.sql',
  '20260728070000_chat_call_recording_unique_video_url.sql',
  '20260728080000_chat_call_summary_unique_call_id.sql',
  '20260728090000_chat_calls_recording_featured_identity.sql',
  '20260728100000_chat_room_shared_calls.sql',
  '20260728110000_chat_calls_live_transcript.sql',
  '20260729000000_poker_bankroll_sessions.sql',
  '20260729010000_poker_bankroll_profiles.sql',
  '20260729020000_poker_custom_venues.sql',
  '20260729030000_poker_bankroll_ante_third_blind.sql',
  '20260730000000_poker_stable_deals.sql',
  '20260730010000_poker_bankroll_rebuy_addon.sql',
  '20260730020000_poker_bankroll_tables_count.sql',
  '20260730030000_poker_bankroll_club_currency.sql',
  '20260730120000_casinos_lv_geo_gaps.sql',
  '20260730140000_poker_tournament_swaps.sql',
  '20260730150000_poker_tournament_swap_activity.sql',
  '20260730160000_poker_tournament_swap_result_activity.sql',
  '20260730170000_poker_tournament_swaps_realtime.sql',
  '20260730180000_platform_billing_reconcile_cron.sql',
  '20260730180100_poker_tournament_events_last_activity.sql',
  '20260730190000_lounge_bot_queue_caption_2000.sql',
];

function migrationVersion(file) {
  return file.replace(/\.sql$/, '').split('_')[0];
}

function migrationName(file) {
  return file.replace(/\.sql$/, '');
}

/** Prod may already have chat_call_missed rows before base chat_calls migration runs. */
function patchSqlForProd(file, sqlText) {
  if (file !== '20260728000000_chat_calls.sql') return sqlText;
  if (!sqlText.includes("'chat_call_invite',")) return sqlText;
  if (sqlText.includes("'chat_call_missed',")) return sqlText;
  return sqlText.replace(
    "'chat_call_invite',",
    "'chat_call_invite',\n      'chat_call_missed',",
  );
}

loadSupabaseEnv('production');
const password = process.env.SUPABASE_DB_PASSWORD?.trim();
if (!password) throw new Error('SUPABASE_DB_PASSWORD missing in .env.supabase.production');

const explicit = process.env.SUPABASE_DB_URL?.trim();
const pooler = fs.readFileSync(POOLER_PATH, 'utf8').trim();
const connectionString = explicit || poolerUrlWithPassword(pooler, password);

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

const ok = [];
const failed = [];

for (const file of MIGRATIONS) {
  const version = migrationVersion(file);
  const { rows } = await client.query(
    'select 1 from supabase_migrations.schema_migrations where version = $1 limit 1',
    [version],
  );
  if (rows.length) {
    console.log(`SKIP (tracked): ${file}`);
    ok.push({ file, skipped: true });
    continue;
  }

  const sqlText = patchSqlForProd(file, fs.readFileSync(path.join('supabase', 'migrations', file), 'utf8'));
  process.stdout.write(`APPLY ${file} ... `);
  try {
    await client.query('BEGIN');
    await client.query(sqlText);
    await client.query(
      `insert into supabase_migrations.schema_migrations (version, name, statements)
       values ($1, $2, ARRAY[]::text[])
       on conflict (version) do nothing`,
      [version, migrationName(file)],
    );
    await client.query('COMMIT');
    console.log('OK');
    ok.push({ file });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback errors */
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.log('FAIL');
    console.error(`  ${msg.split('\n')[0]}`);
    failed.push({ file, error: msg });
  }
}

await client.end();

console.log('\n=== SUMMARY ===');
console.log(`OK/skipped: ${ok.length} / ${MIGRATIONS.length}`);
console.log(`Failed: ${failed.length}`);
for (const f of failed) console.log(` - ${f.file}`);

process.exit(failed.length ? 1 : 0);
