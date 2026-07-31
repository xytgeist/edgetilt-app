#!/usr/bin/env node
/**
 * Send ap_guide_released to a single user (bypasses mass-broadcast system-actor skip).
 *
 * Usage:
 *   node scripts/send-ap-guide-released-to-user.mjs --target=production --handle=edgelord --slug=ocean-magic-treasure-box
 */
import pg from 'pg';
import fs from 'fs';
import { loadSupabaseEnv } from './lib/supabaseEnv.mjs';
import { poolerUrlWithPassword } from './lib/supabaseDbCli.mjs';

const args = process.argv.slice(2);
const target =
  args.find((a) => a.startsWith('--target='))?.slice('--target='.length) ||
  (args.includes('--target') ? args[args.indexOf('--target') + 1] : 'production');
const handle =
  args.find((a) => a.startsWith('--handle='))?.slice('--handle='.length) ||
  (args.includes('--handle') ? args[args.indexOf('--handle') + 1] : '');
const slug =
  args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length) ||
  (args.includes('--slug') ? args[args.indexOf('--slug') + 1] : 'ocean-magic-treasure-box');
const titleArg =
  args.find((a) => a.startsWith('--title='))?.slice('--title='.length) ||
  (args.includes('--title') ? args[args.indexOf('--title') + 1] : null);

if (!handle || (target !== 'test' && target !== 'production')) {
  console.error(
    'Usage: node scripts/send-ap-guide-released-to-user.mjs --target=production --handle=edgelord [--slug=guide-slug] [--title="Title"]',
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
  const profile = await client.query(
    `select user_id, handle, display_name from public.profiles where lower(trim(handle)) = lower(trim($1)) limit 1`,
    [handle],
  );
  if (!profile.rows.length) {
    throw new Error(`No profile for handle ${handle}`);
  }
  const recipient = profile.rows[0];

  const guide = await client.query(
    `select title from public.guides where slug = $1 and published = true limit 1`,
    [slug],
  );
  if (!guide.rows.length) {
    throw new Error(`Published guide not found: ${slug}`);
  }

  const actor = await client.query(
    `select user_id, handle, display_name from public.profiles
     where lower(trim(handle)) = 'selena' limit 1`,
  );
  const actorId = actor.rows[0]?.user_id;
  const actorHandle = actor.rows[0]?.handle;
  if (!actorId) throw new Error('Fallback actor @selena missing');

  const title = titleArg || guide.rows[0].title;

  const existing = await client.query(
    `select id from public.activity_events
     where recipient_user_id = $1 and event_type = 'ap_guide_released' and guide_slug = $2
     limit 1`,
    [recipient.user_id, slug],
  );

  if (existing.rows.length) {
    console.log(
      JSON.stringify(
        {
          skipped: true,
          reason: 'already_has_event',
          event_id: existing.rows[0].id,
          recipient: { handle: recipient.handle, display_name: recipient.display_name },
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }

  const inserted = await client.query(
    `insert into public.activity_events (
       recipient_user_id, actor_user_id, event_type, guide_slug, detail_text
     ) values ($1, $2, 'ap_guide_released', $3, $4)
     returning id, created_at`,
    [recipient.user_id, actorId, slug, title],
  );

  const push = await client.query(
    `select count(*)::int as devices from public.push_subscriptions where user_id = $1`,
    [recipient.user_id],
  );

  console.log(
    JSON.stringify(
      {
        sent: true,
        event_id: inserted.rows[0].id,
        created_at: inserted.rows[0].created_at,
        guide_slug: slug,
        title,
        recipient: {
          user_id: recipient.user_id,
          handle: recipient.handle,
          display_name: recipient.display_name,
        },
        push_devices: push.rows[0]?.devices ?? 0,
        note: 'pg_net trigger should invoke lounge-send-activity-push for each insert',
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
