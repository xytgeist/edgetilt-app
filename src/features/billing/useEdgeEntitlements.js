import { useCallback, useEffect, useState } from 'react'
import { fetchMyEntitlements } from './stripeBillingApi.js'
import {
  entitlementPriceInterval,
  hasEntitlement,
  hasSlotsEdge,
  hasSlotsEdgeLifetime,
  hasSlotsEdgePro,
  hasSlotsEdgeStarter,
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_STARTER,
} from './edgeProducts.js'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {string | null | undefined} userId
 */
export function useEdgeEntitlements(supabaseClient, userId) {
  const [entitlements, setEntitlements] = useState({})
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabaseClient || !userId) {
      setEntitlements({})
      return
    }
    setLoading(true)
    try {
      const next = await fetchMyEntitlements(supabaseClient)
      setEntitlements(next)
    } catch {
      setEntitlements({})
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const checkEntitlement = useCallback(
    (productSlug) => hasEntitlement(entitlements, productSlug),
    [entitlements],
  )

  return {
    entitlements,
    loading,
    refresh,
    hasEntitlement: checkEntitlement,
    hasSlotsEdge: hasSlotsEdge(entitlements),
    hasSlotsEdgeLifetime: hasSlotsEdgeLifetime(entitlements),
    hasSlotsEdgeStarter: hasSlotsEdgeStarter(entitlements),
    hasSlotsEdgePro: hasSlotsEdgePro(entitlements),
    starterPriceInterval: entitlementPriceInterval(entitlements, PRODUCT_SLOTS_EDGE_STARTER),
    fullPriceInterval: entitlementPriceInterval(entitlements, PRODUCT_SLOTS_EDGE),
    slotsEdgeSlug: PRODUCT_SLOTS_EDGE,
  }
}
