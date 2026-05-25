import { useCallback, useEffect, useState } from 'react'
import {
  contentAccessGatesMapFromRows,
  fetchContentAccessGates,
  upsertContentAccessGate,
} from './contentAccessGates.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {boolean} isAdmin
 */
export function useContentAccessGates(supabaseClient, isAdmin) {
  const [gatesMap, setGatesMap] = useState(() => new Map())
  const [dbReady, setDbReady] = useState(false)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabaseClient) {
      setGatesMap(new Map())
      setDbReady(false)
      return
    }
    setLoading(true)
    try {
      const { map, dbReady: ready } = await fetchContentAccessGates(supabaseClient)
      setGatesMap(map)
      setDbReady(ready)
    } catch {
      setGatesMap(new Map())
      setDbReady(false)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setContentGate = useCallback(
    async (contentKind, contentKey, requiresSlotsEdge) => {
      if (!supabaseClient || !isAdmin || !dbReady) return false
      const previous = new Map(gatesMap)
      const normalizedKey = String(contentKey || '').trim().toLowerCase()
      const next = new Map(gatesMap)
      next.set(`${contentKind}:${normalizedKey}`, requiresSlotsEdge)
      setGatesMap(next)
      try {
        await upsertContentAccessGate(supabaseClient, contentKind, contentKey, requiresSlotsEdge)
        return true
      } catch {
        setGatesMap(previous)
        return false
      }
    },
    [supabaseClient, isAdmin, dbReady, gatesMap],
  )

  return {
    gatesMap,
    gatesDbReady: dbReady,
    gatesLoading: loading,
    refreshGates: refresh,
    setContentGate,
  }
}

export { contentAccessGatesMapFromRows }
