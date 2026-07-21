import { useCallback, useEffect, useState } from 'react'
import { fetchMyCreatorFanMonetization } from './creatorFanSubsApi.js'
import { isCreatorFanOfferComplete } from './fanSubOffer.js'

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   profileHandle?: string | null,
 *   onOpenFanSubscriptionSettings: () => void,
 * }} props
 */
export default function OwnProfileFanMonetizationCta({
  supabaseClient,
  profileHandle,
  onOpenFanSubscriptionSettings,
}) {
  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [connectComplete, setConnectComplete] = useState(false)
  const [offerComplete, setOfferComplete] = useState(false)

  const reload = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }
    try {
      const row = await fetchMyCreatorFanMonetization(supabaseClient)
      setEnabled(Boolean(row?.enabled))
      setConnectComplete(Boolean(row?.connect_onboarding_complete))
      setOfferComplete(row ? isCreatorFanOfferComplete(row) : false)
    } catch {
      setEnabled(false)
      setConnectComplete(false)
      setOfferComplete(false)
    } finally {
      setLoading(false)
    }
  }, [supabaseClient])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onReturn = () => void reload()
    window.addEventListener('edge:creator-fan-billing-return', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => {
      window.removeEventListener('edge:creator-fan-billing-return', onReturn)
      document.removeEventListener('visibilitychange', onReturn)
    }
  }, [reload])

  if (loading) return null

  const handle = String(profileHandle || '').trim()
  const live = enabled && connectComplete && offerComplete
  const label = live ? 'Manage fan subscriptions' : 'Enable fan subscriptions'
  const hint = !handle
    ? 'Set a handle first, then finish setup in Settings.'
    : live
      ? 'Fan posts and private fan chat are live for your subscribers.'
      : 'Offer paid fan access … preset monthly tiers and a private fan chat.'

  return (
    <div className="mt-4" data-own-profile-fan-monetization-cta>
      <button
        type="button"
        onClick={onOpenFanSubscriptionSettings}
        className="min-h-11 w-full rounded-xl border border-orange-500/40 bg-orange-950/25 px-4 text-[14px] font-semibold text-orange-100 touch-manipulation hover:bg-orange-950/40 [-webkit-tap-highlight-color:transparent]"
      >
        {label}
      </button>
      <p className="mt-2 text-[12px] leading-snug text-zinc-500">{hint}</p>
    </div>
  )
}
