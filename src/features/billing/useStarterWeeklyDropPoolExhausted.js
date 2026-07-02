import { useEffect, useState } from 'react'
import { fetchStarterWeeklyDropPoolExhausted } from '../billing/starterWeeklyDropApi.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean }} [opts]
 */
export function useStarterWeeklyDropPoolExhausted(supabaseClient, opts = {}) {
  const { enabled = false } = opts
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    if (!enabled || !supabaseClient) {
      setExhausted(false)
      return undefined
    }

    let cancelled = false
    void (async () => {
      const { exhausted: value } = await fetchStarterWeeklyDropPoolExhausted(supabaseClient)
      if (!cancelled) setExhausted(value)
    })()

    return () => {
      cancelled = true
    }
  }, [enabled, supabaseClient])

  return exhausted
}
