import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_LIFETIME,
  PRODUCT_SLOTS_EDGE_STARTER,
  productDisplayName,
  resolvedEntitlementBillingInterval,
} from './edgeProducts.js'
import { openBillingPortal, startEdgeCheckout } from './stripeBillingApi.js'

/** @param {'monthly' | 'annual'} interval */
function billingIntervalLabel(interval) {
  return interval === 'annual' ? 'Annual' : 'Monthly'
}

/** @param {'monthly' | 'annual'} interval */
function billingSwitchTargetInterval(interval) {
  return interval === 'monthly' ? 'annual' : 'monthly'
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onCheckoutStarted?: () => void,
 *   onOpenSubscribe?: (productSlug?: string) => void,
 *   hasSlotsEdgeStarter?: boolean,
 *   hasSlotsEdgePro?: boolean,
 *   hasSlotsEdgeLifetime?: boolean,
 *   starterPriceInterval?: 'monthly' | 'annual' | null,
 *   fullPriceInterval?: 'monthly' | 'annual' | null,
 *   entitlements?: Record<string, { cancel_at_period_end?: boolean, current_period_end?: string | null }>,
 * }} props
 */
export default function BillingManageModal({
  open,
  onClose,
  supabaseClient,
  onCheckoutStarted,
  onOpenSubscribe,
  hasSlotsEdgeStarter = false,
  hasSlotsEdgePro = false,
  hasSlotsEdgeLifetime = false,
  starterPriceInterval = null,
  fullPriceInterval = null,
  entitlements = {},
}) {
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')

  const starterCurrentInterval = resolvedEntitlementBillingInterval(
    starterPriceInterval,
    hasSlotsEdgeStarter,
  )
  const fullCurrentInterval = resolvedEntitlementBillingInterval(
    fullPriceInterval,
    hasSlotsEdgePro && !hasSlotsEdgeLifetime,
  )
  const hasPaidPlan = hasSlotsEdgeLifetime || hasSlotsEdgePro || hasSlotsEdgeStarter

  const activeEntitlement = useMemo(() => {
    if (hasSlotsEdgeLifetime) return entitlements[PRODUCT_SLOTS_EDGE_LIFETIME]
    if (hasSlotsEdgePro) return entitlements[PRODUCT_SLOTS_EDGE]
    if (hasSlotsEdgeStarter) return entitlements[PRODUCT_SLOTS_EDGE_STARTER]
    return null
  }, [entitlements, hasSlotsEdgeLifetime, hasSlotsEdgePro, hasSlotsEdgeStarter])

  const renewalLabel = useMemo(() => {
    if (hasSlotsEdgeLifetime) return 'One-time founding pass ... no renewals.'
    const end = activeEntitlement?.current_period_end
    if (!end) return null
    const date = new Date(end)
    if (Number.isNaN(date.getTime())) return null
    const formatted = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    if (activeEntitlement?.cancel_at_period_end) {
      return `Access until ${formatted} (canceled)`
    }
    return `Renews ${formatted}`
  }, [activeEntitlement, hasSlotsEdgeLifetime])

  useEffect(() => {
    if (!open) return
    setBusyKey('')
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return undefined

    const clearBusy = () => setBusyKey('')

    const onPageShow = (event) => {
      if (event.persisted) clearBusy()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') clearBusy()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open])

  const runCheckout = useCallback(
    async (productSlug, priceInterval) => {
      setError('')
      setBusyKey(`${productSlug}:${priceInterval}`)
      try {
        onCheckoutStarted?.()
        await startEdgeCheckout(supabaseClient, productSlug, {
          priceInterval,
          applyEarlyBird: true,
        })
      } catch (e) {
        setBusyKey('')
        setError(e instanceof Error ? e.message : String(e))
      }
    },
    [onCheckoutStarted, supabaseClient],
  )

  const runPortal = useCallback(async () => {
    setError('')
    setBusyKey('portal')
    try {
      await openBillingPortal(supabaseClient)
    } catch (e) {
      setBusyKey('')
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [supabaseClient])

  if (!open || typeof document === 'undefined') return null

  const currentPlanName = hasSlotsEdgeLifetime
    ? productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME)
    : hasSlotsEdgePro
      ? productDisplayName(PRODUCT_SLOTS_EDGE)
      : hasSlotsEdgeStarter
        ? productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)
        : 'Free'

  const currentIntervalLabel = hasSlotsEdgeLifetime
    ? null
    : hasSlotsEdgePro
      ? billingIntervalLabel(fullCurrentInterval || 'monthly')
      : hasSlotsEdgeStarter
        ? billingIntervalLabel(starterCurrentInterval || 'monthly')
        : null

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[3px] [-webkit-tap-highlight-color:transparent]"
        aria-label="Close billing dialog"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-manage-title"
        data-billing-manage-modal
        className="relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-w-md sm:rounded-[1.75rem]"
      >
        <div className="shrink-0 border-b border-zinc-800/80 px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="billing-manage-title" className="text-lg font-bold tracking-tight text-white">
                Manage membership
              </h2>
              <p className="mt-1 text-sm text-zinc-400">Upgrade, change billing, or cancel in Stripe.</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-lg leading-none text-zinc-400 touch-manipulation hover:border-zinc-600 hover:text-zinc-200"
            >
              <span aria-hidden>×</span>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          <div className="rounded-2xl border border-zinc-700/70 bg-zinc-900/50 p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Current plan</div>
            <div className="mt-1 text-lg font-bold text-white">{currentPlanName}</div>
            {currentIntervalLabel ? (
              <div className="mt-1 text-sm text-zinc-400">{currentIntervalLabel} billing</div>
            ) : null}
            {renewalLabel ? <div className="mt-2 text-xs text-zinc-500">{renewalLabel}</div> : null}
          </div>

          <div className="mt-4 space-y-2">
            {!hasPaidPlan ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => {
                  onClose()
                  onOpenSubscribe?.(PRODUCT_SLOTS_EDGE)
                }}
                className="billing-manage-action-btn w-full min-h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 text-sm font-bold text-white touch-manipulation disabled:opacity-50"
              >
                View Edge AP Slots plans
              </button>
            ) : null}

            {hasSlotsEdgeStarter && !hasSlotsEdgePro && !hasSlotsEdgeLifetime && starterCurrentInterval ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() =>
                  void runCheckout(
                    PRODUCT_SLOTS_EDGE_STARTER,
                    billingSwitchTargetInterval(starterCurrentInterval),
                  )
                }
                className="billing-manage-action-btn w-full min-h-11 rounded-xl border border-emerald-500/35 bg-emerald-950/30 px-4 text-sm font-semibold text-emerald-100 touch-manipulation disabled:opacity-50"
              >
                {busyKey === `${PRODUCT_SLOTS_EDGE_STARTER}:${billingSwitchTargetInterval(starterCurrentInterval)}`
                  ? 'Updating billing…'
                  : `Switch ${productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)} to ${billingIntervalLabel(billingSwitchTargetInterval(starterCurrentInterval)).toLowerCase()}`}
              </button>
            ) : null}

            {hasSlotsEdgeStarter && !hasSlotsEdgePro && !hasSlotsEdgeLifetime ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => {
                  onClose()
                  onOpenSubscribe?.(PRODUCT_SLOTS_EDGE)
                }}
                className="billing-manage-action-btn w-full min-h-11 rounded-xl border border-cyan-500/35 bg-cyan-950/25 px-4 text-sm font-semibold text-cyan-100 touch-manipulation disabled:opacity-50"
              >
                Upgrade to {productDisplayName(PRODUCT_SLOTS_EDGE)}
              </button>
            ) : null}

            {hasSlotsEdgePro && !hasSlotsEdgeLifetime && fullCurrentInterval ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() =>
                  void runCheckout(PRODUCT_SLOTS_EDGE, billingSwitchTargetInterval(fullCurrentInterval))
                }
                className="billing-manage-action-btn w-full min-h-11 rounded-xl border border-cyan-500/35 bg-cyan-950/25 px-4 text-sm font-semibold text-cyan-100 touch-manipulation disabled:opacity-50"
              >
                {busyKey === `${PRODUCT_SLOTS_EDGE}:${billingSwitchTargetInterval(fullCurrentInterval)}`
                  ? 'Updating billing…'
                  : `Switch ${productDisplayName(PRODUCT_SLOTS_EDGE)} to ${billingIntervalLabel(billingSwitchTargetInterval(fullCurrentInterval)).toLowerCase()}`}
              </button>
            ) : null}

            {hasPaidPlan && !hasSlotsEdgeLifetime ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => void runPortal()}
                className="billing-manage-action-btn w-full min-h-11 rounded-xl border border-zinc-700/80 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 touch-manipulation disabled:opacity-50"
              >
                {busyKey === 'portal' ? 'Opening Stripe…' : 'Cancel or update payment in Stripe'}
              </button>
            ) : null}

            {hasPaidPlan ? (
              <button
                type="button"
                disabled={Boolean(busyKey)}
                onClick={() => {
                  onClose()
                  onOpenSubscribe?.(
                    hasSlotsEdgeLifetime
                      ? PRODUCT_SLOTS_EDGE_LIFETIME
                      : hasSlotsEdgePro
                        ? PRODUCT_SLOTS_EDGE
                        : PRODUCT_SLOTS_EDGE_STARTER,
                  )
                }}
                className="billing-manage-action-btn w-full min-h-11 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 text-sm font-semibold text-zinc-300 touch-manipulation disabled:opacity-50"
              >
                Compare all plans
              </button>
            ) : null}
          </div>

          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
