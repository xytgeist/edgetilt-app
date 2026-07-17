import { useCallback, useEffect, useState } from 'react'
import { affiliateErrorMessage, fetchAdminAffiliateSnapshot } from './affiliatePortalApi.js'

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
      setError(affiliateErrorMessage(e, 'Could not load affiliates.'))
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
