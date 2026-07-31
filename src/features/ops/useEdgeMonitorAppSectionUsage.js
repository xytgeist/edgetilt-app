import { useCallback, useEffect, useState } from 'react'
import { fetchOpsMonitorAppSectionUsage } from './opsMonitorApi.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean }} [opts]
 */
export function useEdgeMonitorAppSectionUsage(supabaseClient, opts = {}) {
  const { enabled = true } = opts
  const [usage, setUsage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled || !supabaseClient) return
      if (!isRefresh) setLoading(true)
      setError('')
      const { data, error: rpcError } = await fetchOpsMonitorAppSectionUsage(supabaseClient)
      if (rpcError) {
        setError(rpcError.message || 'Failed to load section usage.')
        setUsage(null)
      } else {
        setUsage(data || null)
      }
      setLoading(false)
    },
    [enabled, supabaseClient],
  )

  useEffect(() => {
    if (!enabled) return
    void load(false)
  }, [enabled, load])

  return { usage, loading, error, reload: () => load(true) }
}
