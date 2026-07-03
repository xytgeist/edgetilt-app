/**
 * Admin-only Edge Monitor snapshot from Supabase RPC.
 */

/**
 * @typedef {Object} OpsMonitorMetricPair
 * @property {string} label
 * @property {number | string} value
 * @property {string} [hint]
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchOpsMonitorSnapshot(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_ops_monitor_snapshot')
  return { data, error }
}

/** @param {unknown} value */
export function formatOpsMonitorCount(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/**
 * @param {Array<{ product_slug?: string, status?: string, kind?: string, count?: number }> | null | undefined} rows
 * @param {string} key
 */
export function formatOpsMonitorBreakdown(rows, key = 'count') {
  if (!Array.isArray(rows) || rows.length === 0) return '—'
  return rows
    .map((row) => {
      const label =
        row.product_slug || row.status || row.kind || '?'
      const count = formatOpsMonitorCount(row[key] ?? row.count)
      return `${label}: ${count}`
    })
    .join(' · ')
}

/** First segment of Supabase host for env badge (e.g. jtjgtucumuoswnbauxry). */
export function opsMonitorSupabaseProjectRef() {
  try {
    const host = new URL(import.meta.env.VITE_SUPABASE_URL || '').hostname
    return host.split('.')[0] || 'unknown'
  } catch {
    return 'unknown'
  }
}
