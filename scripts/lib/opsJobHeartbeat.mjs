/** Record external scheduled-job heartbeats for Edge Monitor (production only). */

export const POKER_CATALOG_SYNC_JOB_ID = 'poker_catalog_sync_production'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordOpsJobHeartbeat(supabase, status, detail = null) {
  if (!supabase) return
  const { error } = await supabase.rpc('admin_ops_record_job_heartbeat', {
    p_job_id: POKER_CATALOG_SYNC_JOB_ID,
    p_status: status,
    p_detail: detail,
  })
  if (error) {
    console.warn('[ops heartbeat]', error.message)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {'test' | 'production'} target
 * @param {'ok' | 'failed'} status
 * @param {Record<string, unknown> | null} [detail]
 */
export async function recordOpsJobHeartbeatForTarget(supabase, target, status, detail = null) {
  if (target !== 'production') return
  await recordOpsJobHeartbeat(supabase, status, detail)
}
