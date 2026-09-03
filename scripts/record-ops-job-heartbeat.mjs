#!/usr/bin/env node
/**
 * Record an Edge Monitor ops job heartbeat (production only).
 *
 * Usage:
 *   node scripts/record-ops-job-heartbeat.mjs --target=production --job-id=syndicate_football_metrics_sync_production --status=ok
 *   node scripts/record-ops-job-heartbeat.mjs --target=production --job-id=... --status=failed --message="NFL sync failed"
 */

import { createClient } from '@supabase/supabase-js'
import { loadSupabaseEnv, createSupabaseServiceClient } from './lib/supabaseEnv.mjs'
import { recordOpsJobHeartbeat } from './lib/opsJobHeartbeat.mjs'

function parseArgs(argv) {
  let target = 'production'
  let jobId = ''
  let status = 'ok'
  let message = ''
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--target=')) target = arg.slice('--target='.length)
    else if (arg.startsWith('--job-id=')) jobId = arg.slice('--job-id='.length)
    else if (arg.startsWith('--status=')) status = arg.slice('--status='.length)
    else if (arg.startsWith('--message=')) message = arg.slice('--message='.length)
  }
  if (target !== 'test' && target !== 'production') {
    throw new Error('--target must be test or production')
  }
  if (!jobId) throw new Error('--job-id is required')
  if (status !== 'ok' && status !== 'failed') {
    throw new Error('--status must be ok or failed')
  }
  return { target, jobId, status, message }
}

async function main() {
  const { target, jobId, status, message } = parseArgs(process.argv)
  if (target !== 'production') {
    console.log(`[ops heartbeat] skip (target=${target}; heartbeats are production-only)`)
    return
  }
  loadSupabaseEnv(target)
  const supabase = createSupabaseServiceClient(createClient)
  const detail = {
    source: 'github_actions',
    recorded_at: new Date().toISOString(),
    ...(message ? { message } : {}),
  }
  await recordOpsJobHeartbeat(supabase, jobId, status, detail)
  console.log(`[ops heartbeat] ${jobId} → ${status}`)
}

main().catch((err) => {
  console.error('[ops heartbeat] FAILED:', err.message || err)
  process.exit(1)
})
