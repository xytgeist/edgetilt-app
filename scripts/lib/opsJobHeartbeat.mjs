/** Record external scheduled-job heartbeats for Edge Monitor (production only). */

export const POKER_CATALOG_SYNC_JOB_ID = 'poker_catalog_sync_production'
export const SYNDICATE_FOOTBALL_METRICS_SYNC_JOB_ID = 'syndicate_football_metrics_sync_production'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordOpsJobHeartbeat(supabase, jobId, status, detail = null) {
  if (!supabase || !jobId) return
  const { error } = await supabase.rpc('admin_ops_record_job_heartbeat', {
    p_job_id: jobId,
    p_status: status,
    p_detail: detail,
  })
  if (error) {
    console.warn('[ops heartbeat]', error.message)
  }
}

/**
 * Poker catalog helper (production only).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordPokerCatalogHeartbeat(supabase, status, detail = null) {
  await recordOpsJobHeartbeat(supabase, POKER_CATALOG_SYNC_JOB_ID, status, detail)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'test' | 'production'} target
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordOpsJobHeartbeatForTarget(supabase, target, status, detail = null) {
  if (target !== 'production') return
  await recordPokerCatalogHeartbeat(supabase, status, detail)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'test' | 'production'} target
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordSyndicateMetricsHeartbeatForTarget(supabase, target, status, detail = null) {
  if (target !== 'production') return
  await recordOpsJobHeartbeat(supabase, SYNDICATE_FOOTBALL_METRICS_SYNC_JOB_ID, status, detail)
}
