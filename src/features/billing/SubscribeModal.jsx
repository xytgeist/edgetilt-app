import { useMemo, useState } from 'react'
import {
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_STARTER,
} from './edgeProducts.js'
import {
  SLOTS_EDGE_EARLY_BIRD,
  SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF,
  SLOTS_EDGE_FULL_ANNUAL_USD,
  SLOTS_EDGE_FULL_MONTHLY_USD,
  SLOTS_EDGE_STARTER_MONTHLY_USD,
  formatUsdAnnual,
  formatUsdMonthly,
} from './edgePricing.js'
import { openBillingPortal, startEdgeCheckout } from './stripeBillingApi.js'

const panelClass =
  'relative z-10 w-full max-w-lg max-h-[min(92dvh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-zinc-600/80 bg-gray-900 p-6 shadow-2xl sm:p-8'

/**
 * @param {{
 *   open: boolean,
 *   initialProductSlug?: string,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onCheckoutStarted?: () => void,
 *   hasBillingAccount?: boolean,
 *   hasSlotsEdge?: boolean,
 *   hasSlotsEdgeStarter?: boolean,
 * }} props
 */
export default function SubscribeModal({
  open,
  initialProductSlug = PRODUCT_SLOTS_EDGE,
  onClose,
  supabaseClient,
  onCheckoutStarted,
  hasBillingAccount = false,
  hasSlotsEdge = false,
  hasSlotsEdgeStarter = false,
}) {
  const defaultPlan = useMemo(() => {
    if (initialProductSlug === PRODUCT_SLOTS_EDGE_STARTER) return PRODUCT_SLOTS_EDGE_STARTER
    if (hasSlotsEdgeStarter && !hasSlotsEdge) return PRODUCT_SLOTS_EDGE
    return PRODUCT_SLOTS_EDGE
  }, [hasSlotsEdge, hasSlotsEdgeStarter, initialProductSlug])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(defaultPlan)
  const [fullInterval, setFullInterval] = useState(/** @type {'monthly' | 'annual'} */ ('monthly'))

  if (!open) return null

  const starterList = formatUsdMonthly(SLOTS_EDGE_STARTER_MONTHLY_USD)
  const starterEarly = formatUsdMonthly(SLOTS_EDGE_EARLY_BIRD.starterMonthlyUsd)
  const fullMonthlyList = formatUsdMonthly(SLOTS_EDGE_FULL_MONTHLY_USD)
  const fullMonthlyEarly = formatUsdMonthly(SLOTS_EDGE_EARLY_BIRD.fullMonthlyUsd)
  const fullAnnualList = formatUsdAnnual(SLOTS_EDGE_FULL_ANNUAL_USD)

  const applyEarlyBirdAtCheckout =
    selectedPlan === PRODUCT_SLOTS_EDGE_STARTER || fullInterval === 'monthly'

  const selectedPriceLabel =
    selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
      ? `${starterEarly} (${starterList} list)`
      : fullInterval === 'annual'
        ? `${fullAnnualList} (yearly rate, no extra coupon)`
        : `${fullMonthlyEarly} (${fullMonthlyList} list)`

  const handleCheckout = async () => {
    setError('')
    setBusy(true)
    try {
      onCheckoutStarted?.()
      await startEdgeCheckout(supabaseClient, selectedPlan, {
        priceInterval: selectedPlan === PRODUCT_SLOTS_EDGE ? fullInterval : 'monthly',
        applyEarlyBird: applyEarlyBirdAtCheckout,
      })
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handlePortal = async () => {
    setError('')
    setBusy(true)
    try {
      await openBillingPortal(supabaseClient)
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const planCardClass = (slug) => {
    const selected = selectedPlan === slug
    return [
      'w-full rounded-2xl border p-4 text-left touch-manipulation transition-all',
      selected
        ? 'border-cyan-500/70 bg-cyan-950/30 ring-1 ring-cyan-500/40'
        : 'border-zinc-700/80 bg-zinc-900/60 hover:border-zinc-600',
    ].join(' ')
  }

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/70 [-webkit-tap-highlight-color:transparent]"
        aria-label="Close subscribe dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-modal-title"
        className={panelClass}
        data-subscribe-modal
      >
        <button
          type="button"
          onClick={onClose}
          className="mb-4 text-sm text-zinc-400 hover:text-zinc-200 touch-manipulation"
        >
          ← Not now
        </button>

        {hasSlotsEdge ? (
          <>
            <h2 id="subscribe-modal-title" className="text-2xl font-bold text-white">
              You&apos;re on Full Edge
            </h2>
            <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
              Your subscription includes the full AP guide library, all calculators, and unlimited tools.
            </p>
            {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            {hasBillingAccount ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePortal()}
                className="mt-6 w-full min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-bold text-white touch-manipulation"
              >
                {busy ? 'Opening…' : 'Manage billing'}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="subscribe-modal-title" className="text-2xl font-bold text-white">
                Choose your Edge plan
              </h2>
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/30">
                {SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF}% off first year (monthly plans)
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
              Lounge stays free. Pick Starter for the guide-first path or Full Edge for everything now.
            </p>

            <div className="mt-5 space-y-3">
              <button
                type="button"
                disabled={busy || hasSlotsEdgeStarter}
                onClick={() => setSelectedPlan(PRODUCT_SLOTS_EDGE_STARTER)}
                className={planCardClass(PRODUCT_SLOTS_EDGE_STARTER)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-white">Starter</div>
                    <div className="mt-0.5 text-sm text-zinc-400">Guide-first · {starterEarly}</div>
                  </div>
                  {hasSlotsEdgeStarter ? (
                    <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                      Current
                    </span>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1 text-sm text-zinc-300/90 list-disc pl-4">
                  <li>2019 and older guide pack on subscribe</li>
                  <li>One random premium guide drop each week</li>
                  <li>Calculators paired with guides you unlock</li>
                </ul>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => setSelectedPlan(PRODUCT_SLOTS_EDGE)}
                className={planCardClass(PRODUCT_SLOTS_EDGE)}
              >
                <div className="text-lg font-bold text-white">Full Edge</div>
                <div className="mt-0.5 text-sm text-zinc-400">
                  {fullInterval === 'annual' ? `${fullAnnualList} · yearly savings` : `${fullMonthlyEarly} · everything unlocked`}
                </div>
                <ul className="mt-3 space-y-1 text-sm text-zinc-300/90 list-disc pl-4">
                  <li>Full AP guide library instantly</li>
                  <li>All calculators, bankroll, logbook</li>
                  <li>Calendar OCR and offer alerts</li>
                </ul>
              </button>
            </div>

            {selectedPlan === PRODUCT_SLOTS_EDGE ? (
              <div className="mt-4 flex rounded-xl border border-zinc-700/80 p-1" role="tablist" aria-label="Full Edge billing interval">
                <button
                  type="button"
                  role="tab"
                  aria-selected={fullInterval === 'monthly'}
                  disabled={busy}
                  onClick={() => setFullInterval('monthly')}
                  className={[
                    'flex-1 min-h-10 rounded-lg text-sm font-semibold touch-manipulation transition-colors',
                    fullInterval === 'monthly' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
                  ].join(' ')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={fullInterval === 'annual'}
                  disabled={busy}
                  onClick={() => setFullInterval('annual')}
                  className={[
                    'flex-1 min-h-10 rounded-lg text-sm font-semibold touch-manipulation transition-colors',
                    fullInterval === 'annual' ? 'bg-cyan-600 text-white' : 'text-zinc-400 hover:text-zinc-200',
                  ].join(' ')}
                >
                  Annual
                </button>
              </div>
            ) : null}

            <p className="mt-4 text-xs text-zinc-500 leading-relaxed">
              {applyEarlyBirdAtCheckout
                ? `Early bird on monthly checkout (${selectedPriceLabel}). Stripe applies the discount when configured.`
                : `Annual checkout: ${selectedPriceLabel}.`}
            </p>

            {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

            <button
              type="button"
              disabled={busy || (hasSlotsEdgeStarter && selectedPlan === PRODUCT_SLOTS_EDGE_STARTER)}
              onClick={() => void handleCheckout()}
              className="mt-5 w-full min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-bold text-white touch-manipulation"
            >
              {busy
                ? 'Redirecting…'
                : hasSlotsEdgeStarter && selectedPlan === PRODUCT_SLOTS_EDGE
                  ? 'Upgrade to Full Edge'
                  : 'Continue to checkout'}
            </button>

            {hasBillingAccount ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handlePortal()}
                className="mt-3 w-full min-h-11 rounded-2xl border border-zinc-700 text-zinc-200 text-sm font-semibold touch-manipulation"
              >
                Manage billing
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
