import { useCallback, useEffect, useState } from 'react'
import { fetchOpsMonitorAppSectionMemberUsage } from './opsMonitorApi.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean, topLimit?: number }} [opts]
 */
export function useEdgeMonitorAppSectionMemberUsage(supabaseClient, opts = {}) {
  const { enabled = true, topLimit = 25 } = opts
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const load = useCallback(
    async ({ isRefresh = false, handle = '' } = {}) => {
      if (!enabled || !supabaseClient) return
      if (!isRefresh) setLoading(true)
      setError('')
      const { data: next, error: rpcError } = await fetchOpsMonitorAppSectionMemberUsage(supabaseClient, {
        handle: String(handle || '').trim(),
        topLimit,
      })
      if (rpcError) {
        setError(rpcError.message || 'Failed to load member activity.')
        setData(null)
      } else {
        setData(next || null)
      }
      setLoading(false)
    },
    [enabled, supabaseClient, topLimit],
  )

  useEffect(() => {
    if (!enabled) return
    void load({ isRefresh: false, handle: '' })
  }, [enabled, load])

  const runSearch = useCallback(
    (handle) => {
      const next = String(handle ?? searchInput ?? '').trim()
      setSearchInput(next)
      void load({ isRefresh: true, handle: next })
    },
    [load, searchInput],
  )

  const clearSearch = useCallback(() => {
    setSearchInput('')
    void load({ isRefresh: true, handle: '' })
  }, [load])

  return {
    data,
    loading,
    error,
    searchInput,
    setSearchInput,
    runSearch,
    clearSearch,
    reload: () => load({ isRefresh: true, handle: searchInput }),
  }
}
