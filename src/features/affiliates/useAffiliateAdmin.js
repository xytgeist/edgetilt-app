import { useCallback, useEffect, useState } from 'react'
import { fetchAdminAffiliateSnapshot } from './affiliatePortalApi.js'

export function useAffiliateAdmin(supabaseClient) {
  const [snapshot, setSnapshot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!supabaseClient) return
    setError('')
    try {
      const data = await fetchAdminAffiliateSnapshot(supabaseClient)
      setSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    setLoading(true)
    void reload()
  }, [reload])

  return { snapshot, loading, error, reload }
}
