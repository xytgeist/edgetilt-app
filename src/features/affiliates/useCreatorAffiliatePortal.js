import { useCallback, useEffect, useState } from 'react'
import { fetchMyAffiliatePortal } from './affiliatePortalApi.js'

export function useCreatorAffiliatePortal(supabaseClient) {
  const [portal, setPortal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!supabaseClient) return
    setError('')
    try {
      const data = await fetchMyAffiliatePortal(supabaseClient)
      setPortal(data)
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

  return { portal, loading, error, reload }
}
