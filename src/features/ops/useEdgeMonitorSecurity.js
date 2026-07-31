import { useCallback, useEffect, useState } from 'react'
import { fetchOpsMonitorSecuritySnapshot } from './opsMonitorApi.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean, autoRefreshMs?: number }} [opts]
 */
export function useEdgeMonitorSecurity(supabaseClient, opts = {}) {
  const { enabled = true, autoRefreshMs = 0 } = opts
  const [security, setSecurity] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled || !supabaseClient) {
        setLoading(false)
        return
      }
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError('')

      const { data, error: rpcError } = await fetchOpsMonitorSecuritySnapshot(supabaseClient)

      if (rpcError) {
        setError(rpcError.message || 'Security snapshot failed.')
        setSecurity(null)
      } else {
        setSecurity(data || null)
      }

      if (isRefresh) setRefreshing(false)
      else setLoading(false)
    },
    [enabled, supabaseClient],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    if (!autoRefreshMs || !enabled) return undefined
    const id = window.setInterval(() => {
      void load(true)
    }, autoRefreshMs)
    return () => window.clearInterval(id)
  }, [autoRefreshMs, enabled, load])

  return { security, loading, error, refreshing, load }
}
