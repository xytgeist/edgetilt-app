import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { formatFanTierLabel } from './fanSubTiers.js'
import { creatorFanOfferHeadline } from './fanSubOffer.js'
import { startCreatorFanCheckout, openCreatorFanBillingPortal, resumeCreatorFanSubscription } from './creatorFanSubsApi.js'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import {
  canShowIapWebComparePrice,
  fetchAppleStorefront,
  fetchEdgeStoreProducts,
  iapProductIdForFanTier,
  indexStoreProductsById,
  openAppleSubscriptionManagement,
  requestAppleIapRefund,
  startCreatorFanIapPurchase,
} from '../../utils/edgeIapBilling.js'
import { formatFanSubAccessThrough } from './fanSubBillingDates.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   offer: Record<string, unknown> | null,
 *   alreadySubscribed?: boolean,
 *   fanCancelAtPeriodEnd?: boolean,
 *   fanCurrentPeriodEnd?: string | null,
 *   postAlertsEnabled?: boolean,
 *   onEnablePostAlerts?: () => void | Promise<void>,
 *   onDisablePostAlerts?: () => void | Promise<void>,
 *   onSubscribed?: () => void | Promise<void>,
 * }} props
 */
export default function CreatorFanSubscribeModal({
  open,
  onClose,
  supabaseClient,
  offer,
  alreadySubscribed = false,
  fanCancelAtPeriodEnd = false,
  fanCurrentPeriodEnd = null,
  postAlertsEnabled = false,
  onEnablePostAlerts,
  onDisablePostAlerts,
  onSubscribed,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [storePrice, setStorePrice] = useState('')
  const [canIap, setCanIap] = useState(false)
  const [showWebComparePrice, setShowWebComparePrice] = useState(true)
  const [billingProvider, setBillingProvider] = useState('stripe')

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError('')
    setStorePrice('')
    setCanIap(false)
    setShowWebComparePrice(!isEdgeiOSShell())
    setBillingProvider('stripe')
  }, [open])

  useEffect(() => {
    if (!open || !supabaseClient) return
    const creatorId = String(offer?.creator_user_id || '').trim()
    const tierKey = String(offer?.fan_tier_key || '').trim()
    let cancelled = false
    void (async () => {
      if (alreadySubscribed && creatorId) {
        try {
          const { data } = await supabaseClient.rpc('get_my_creator_fan_entitlements')
          const grant = data?.[`creator-fan:${creatorId}`]
          if (!cancelled && grant?.billing_provider === 'apple') setBillingProvider('apple')
        } catch {
          // keep stripe
        }
      }
      if (!isEdgeiOSShell() || !tierKey) return
      try {
        const storefront = await fetchAppleStorefront()
        if (!cancelled) setShowWebComparePrice(canShowIapWebComparePrice(storefront.isUnitedStates))
      } catch {
        if (!cancelled) setShowWebComparePrice(false)
      }
      const productId = iapProductIdForFanTier(tierKey)
      if (!productId) return
      try {
        const { products } = await fetchEdgeStoreProducts(supabaseClient, [productId])
        const row = indexStoreProductsById(products).get(productId)
        if (cancelled) return
        setCanIap(Boolean(row))
        setStorePrice(row?.displayPrice || '')
      } catch {
        if (!cancelled) {
          setCanIap(false)
          setStorePrice('')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, supabaseClient, offer?.creator_user_id, offer?.fan_tier_key, alreadySubscribed])

  useEffect(() => {
    if (!open) return undefined

    const onKey = (ev) => {
      if (ev.key === 'Escape' && !busy) onClose()
    }

    const clearBusy = () => setBusy(false)
    const onPageShow = (event) => {
      if (event.persisted) clearBusy()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') clearBusy()
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open, onClose, busy])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open || !offer || typeof document === 'undefined') return null

  const handle = String(offer.handle || '').trim()
  const handleAt = handle ? `@${handle.replace(/^@/, '')}` : '@creator'
  const displayName = String(offer.display_name || handle || 'Creator').trim() || 'Creator'
  const tierLabel = formatFanTierLabel(String(offer.fan_tier_key || ''))
  const headline = creatorFanOfferHeadline(offer, handle)
  const intro = String(offer.offer_intro || '').trim()
  const posts = String(offer.offer_private_posts || '').trim()
  const chat = String(offer.offer_fan_chat || '').trim()
  const creatorUserId = String(offer.creator_user_id || '')
  const fanAccessThroughLabel = formatFanSubAccessThrough(fanCurrentPeriodEnd)
  const fanPendingCancel = alreadySubscribed && fanCancelAtPeriodEnd

  const onSubscribe = async (via = 'web') => {
    if (!supabaseClient || !creatorUserId || busy || alreadySubscribed) return
    setBusy(true)
    setError('')
    try {
      if (via === 'iap') {
        const iapResult = await startCreatorFanIapPurchase(
          supabaseClient,
          creatorUserId,
          String(offer.fan_tier_key || ''),
        )
        if (iapResult?.cancelled) {
          setBusy(false)
          return
        }
        if (iapResult?.pending) {
          setError('Purchase is waiting for approval on this Apple ID.')
          setBusy(false)
          return
        }
        if (iapResult?.ok) {
          await onSubscribed?.()
          setBusy(false)
          onClose()
          return
        }
        setError('Purchase did not complete.')
        setBusy(false)
        return
      }
      await startCreatorFanCheckout(supabaseClient, creatorUserId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout could not start.')
      setBusy(false)
    }
  }

  const onAlertsAction = async () => {
    if (busy) return
    if (postAlertsEnabled) {
      if (!onDisablePostAlerts) return
      setBusy(true)
      setError('')
      try {
        await onDisablePostAlerts()
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not turn off alerts.')
      } finally {
        setBusy(false)
      }
      return
    }
    if (!onEnablePostAlerts) return
    setBusy(true)
    setError('')
    try {
      await onEnablePostAlerts()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not turn on alerts.')
    } finally {
      setBusy(false)
    }
  }

  const onUnsubscribe = async () => {
    if (!supabaseClient || busy || !creatorUserId) return
    setBusy(true)
    setError('')
    try {
      if (billingProvider === 'apple') {
        await openAppleSubscriptionManagement(supabaseClient)
      } else {
        await openCreatorFanBillingPortal(supabaseClient, creatorUserId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal.')
      setBusy(false)
    }
  }

  const onResumeSubscription = async () => {
    if (!supabaseClient || busy || !creatorUserId || !fanPendingCancel) return
    setBusy(true)
    setError('')
    try {
      if (billingProvider === 'apple') {
        await openAppleSubscriptionManagement(supabaseClient)
      } else {
        await resumeCreatorFanSubscription(supabaseClient, creatorUserId)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resume subscription.')
    } finally {
      setBusy(false)
    }
  }

  const onRequestRefund = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await requestAppleIapRefund({
        productId: iapProductIdForFanTier(String(offer.fan_tier_key || '')),
      })
      if (result?.cancelled) return
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the App Store refund sheet.')
    } finally {
      setBusy(false)
    }
  }

  const requestClose = () => {
    if (busy) return
    onClose()
  }

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] sm:pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
      style={{ zIndex: Z_APP_MODAL }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[3px] [-webkit-tap-highlight-color:transparent]"
        aria-label="Close subscribe dialog"
        disabled={busy}
        onClick={requestClose}
      />

      <div
        data-creator-fan-subscribe-modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-fan-subscribe-title"
        className="relative z-10 flex max-h-[min(90dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))-0.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-w-xl sm:rounded-[1.75rem]"
      >
        <header
          data-creator-fan-subscribe-header
          className="shrink-0 bg-orange-600 px-4 pb-4 pt-[max(0.75rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] text-white sm:pt-4"
        >
          <div className="grid h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center">
            <button
              type="button"
              aria-label="Close"
              disabled={busy}
              onClick={requestClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/95 touch-manipulation hover:bg-white/10 disabled:opacity-50"
            >
              <X className="h-6 w-6" strokeWidth={2} aria-hidden />
            </button>
            <h2 id="creator-fan-subscribe-title" className="text-center text-[17px] font-bold leading-tight">
              Subscribe
            </h2>
            <span className="h-11 w-11" aria-hidden />
          </div>

          <div className="flex flex-col items-center px-2 pb-1 pt-2 text-center">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-[3px] border-white/90 bg-zinc-800 shadow-md">
              {offer.avatar_url ? (
                <img src={String(offer.avatar_url)} alt="" className="h-full w-full object-cover" />
              ) : (
                <span
                  className={`grid h-full w-full place-items-center text-[20px] font-bold text-white ${profileAvatarToneClass(
                    offer.creator_user_id || handle,
                  )}`}
                >
                  {profileAvatarInitials(displayName, handle)}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[18px] font-bold leading-tight">{displayName}</p>
            <p className="mt-0.5 text-[14px] font-medium text-white/85">{handleAt}</p>
          </div>
        </header>

        <div
          data-creator-fan-subscribe-sheet
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-zinc-950 text-zinc-100"
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 pb-4 pt-5">
            {alreadySubscribed ? (
              <div data-creator-fan-subscribed-thanks className="space-y-2">
                {fanPendingCancel ? (
                  <>
                    <p className="text-[15px] font-semibold leading-relaxed text-zinc-100">
                      {fanAccessThroughLabel
                        ? `You are subscribed through ${fanAccessThroughLabel}.`
                        : 'Your subscription is set to cancel at the end of the current billing period.'}
                    </p>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Fan access and perks stay active until then. Thanks for supporting this creator.
                  </p>
                  <p className="text-[14px] leading-relaxed text-zinc-400">
                    Changed your mind? You can resume before access ends and billing will continue as usual.
                  </p>
                  </>
                ) : (
                  <p className="text-[15px] leading-relaxed text-emerald-300/95">
                    You are already supporting this creator. Thanks for being here.
                  </p>
                )}
              </div>
            ) : (
              <>
                <p className="text-[17px] font-bold text-zinc-100">{headline}</p>
                {storePrice || showWebComparePrice ? (
                  <p className="mt-1 text-[14px] font-semibold text-orange-400">
                    {storePrice || tierLabel}
                  </p>
                ) : null}

                {intro ? (
                  <p className="mt-4 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{intro}</p>
                ) : null}

                {posts ? (
                  <section className="mt-5">
                    <h3 className="text-[13px] font-bold text-zinc-100">Subscription perks</h3>
                    <p className="mt-2 flex items-start gap-2 text-[15px] leading-relaxed text-zinc-300">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-zinc-500" aria-hidden />
                      <span className="whitespace-pre-wrap">{posts}</span>
                    </p>
                  </section>
                ) : null}

                {chat ? (
                  <section className="mt-5">
                    <h3 className="text-[13px] font-bold text-zinc-100">Fan group chat</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-zinc-300 whitespace-pre-wrap">{chat}</p>
                  </section>
                ) : null}

                <p className="mt-6 text-[12px] leading-snug text-zinc-600">
                  {canIap
                    ? 'Web checkout uses Stripe. iPhone checkout uses your Apple ID. Alerts only is free.'
                    : 'Paid fan access is billed monthly through Stripe. Alerts only is free post notifications.'}
                </p>
                <p className="mt-2 text-[11px] leading-snug text-zinc-600">
                  <a href="/terms?from=settings" className="underline underline-offset-2 hover:text-zinc-400">
                    Terms
                  </a>
                  {' · '}
                  <a href="/privacy?from=settings" className="underline underline-offset-2 hover:text-zinc-400">
                    Privacy
                  </a>
                </p>
              </>
            )}

            {error ? <p className="mt-4 text-[13px] text-red-300/95">{error}</p> : null}
          </div>

          <div className="shrink-0 border-t border-zinc-800/90 bg-zinc-950 px-5 pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] pt-4">
            {!alreadySubscribed ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onSubscribe('web')}
                  className="flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-orange-500 px-5 text-[16px] font-bold text-zinc-950 touch-manipulation hover:bg-orange-400 disabled:opacity-50"
                >
                  {busy
                    ? '…'
                    : canIap
                      ? showWebComparePrice
                        ? `Subscribe on the web · ${tierLabel}`
                        : 'Subscribe on the web'
                      : `Subscribe · ${tierLabel}`}
                </button>
                {canIap ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onSubscribe('iap')}
                    className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
                  >
                    {busy ? '…' : `Subscribe on iPhone${storePrice ? ` · ${storePrice}` : ''}`}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onAlertsAction()}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
                >
                  {postAlertsEnabled ? 'Turn off alerts' : 'Alerts only'}
                </button>
              </>
            ) : (
              <>
                {postAlertsEnabled && onDisablePostAlerts ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onAlertsAction()}
                    className="mb-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
                  >
                    Turn off alerts
                  </button>
                ) : null}
                {!fanPendingCancel ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onUnsubscribe()}
                    className="mb-3 flex min-h-11 w-full items-center justify-center rounded-full border border-red-800/70 px-4 text-[15px] font-semibold text-red-300 touch-manipulation hover:bg-red-950/35 disabled:opacity-50"
                  >
                    {busy ? '…' : 'Cancel Subscription'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onResumeSubscription()}
                    className="mb-3 flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-orange-500 px-5 text-[16px] font-bold text-zinc-950 touch-manipulation hover:bg-orange-400 disabled:opacity-50"
                  >
                    {busy ? '…' : 'Resume subscription'}
                  </button>
                )}
                {isEdgeiOSShell() && billingProvider === 'apple' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onRequestRefund()}
                    className="mb-3 flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50"
                  >
                    {busy ? '…' : 'Request a refund'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={requestClose}
                  className={
                    fanPendingCancel
                      ? 'flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-700/90 px-4 text-[15px] font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-900/80 disabled:opacity-50'
                      : 'flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-orange-500 px-5 text-[16px] font-bold text-zinc-950 touch-manipulation hover:bg-orange-400 disabled:opacity-50'
                  }
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
