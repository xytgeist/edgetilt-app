/**
 * Admin-only Edge Monitor snapshot from Supabase RPC + Phase 3/5 helpers.
 */

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchOpsMonitorSnapshot(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_ops_monitor_snapshot')
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchOpsMonitorSubscriberRoster(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_ops_subscriber_roster')
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: Error | null }>}
 */
export async function fetchOpsMonitorExternalHealth(supabaseClient) {
  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client unavailable.') }
  }

  const { data, error } = await supabaseClient.functions.invoke('admin-ops-external-health', {
    method: 'GET',
  })

  if (error) {
    return { data: null, error: new Error(error.message || 'External health probe failed.') }
  }

  if (data?.error) {
    return { data: null, error: new Error(String(data.error)) }
  }

  return { data: data || null, error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchOpsMonitorLivePulse(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_ops_monitor_live_pulse')
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ data: object | null, error: import('@supabase/supabase-js').PostgrestError | null }>}
 */
export async function fetchLoungeBotOpsSnapshot(supabaseClient) {
  const { data, error } = await supabaseClient.rpc('admin_lounge_bot_ops_snapshot')
  return { data, error }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ slug?: string, dryRun?: boolean, force?: boolean }} [opts]
 * @returns {Promise<{ data: object | null, error: Error | null }>}
 */
export async function invokeLoungeNewsPoll(supabaseClient, opts = {}) {
  if (!supabaseClient) {
    return { data: null, error: new Error('Supabase client unavailable.') }
  }
  const { data, error } = await supabaseClient.functions.invoke('lounge-news-poll', {
    body: {
      slug: opts.slug || 'market-edge',
      dryRun: opts.dryRun === true,
      force: opts.force === true,
    },
  })
  if (error) {
    return { data: null, error: new Error(error.message || 'lounge-news-poll failed.') }
  }
  if (data?.error) {
    return { data: null, error: new Error(String(data.error)) }
  }
  return { data: data || null, error: null }
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
    const raw = String(import.meta.env.VITE_SUPABASE_URL || '').trim()
    if (!raw) return 'unknown'
    const host = new URL(raw).hostname.toLowerCase()
    const refMatch = host.match(/([a-z0-9]{15,30})\.supabase\.co$/)
    if (refMatch) return refMatch[1]
    const embedded = host.match(/([a-z0-9]{15,30})/)
    if (embedded) return embedded[1]
    const first = host.split('.')[0]
    if (first && first !== 'auth' && first !== 'www') return first
    return host || 'unknown'
  } catch {
    return 'unknown'
  }
}

/**
 * @param {Array<{ query?: string, count?: number }> | null | undefined} rows
 * @param {number} [limit]
 */
export function formatOpsMonitorTopQueries(rows, limit = 8) {
  if (!Array.isArray(rows) || rows.length === 0) return '—'
  return rows
    .slice(0, limit)
    .map((row, i) => `${i + 1}. ${row.query || '?'} (${formatOpsMonitorCount(row.count)})`)
    .join('\n')
}
