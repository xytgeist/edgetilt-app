import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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

const STARTER_FEATURES = [
  'Instant starter guide pack (2019 and older)',
  'One random premium guide drop every week',
  'Calculators paired with guides you unlock',
  'Subscriber badge in the Lounge',
]

const FULL_FEATURES = [
  'Full AP guide library unlocked now',
  'Every calculator, bankroll, and logbook',
  'Calendar OCR and offer alerts',
  'Best path if you want everything today',
]

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden>
      <path
        fill="currentColor"
        d="M6.2 11.3 3.4 8.5l-.9.9 3.7 3.7 7.4-7.4-.9-.9z"
      />
    </svg>
  )
}

function PlanFeature({ children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-snug text-zinc-300">
      <CheckIcon />
      <span>{children}</span>
    </li>
  )
}

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

  useEffect(() => {
    if (!open) return
    setSelectedPlan(defaultPlan)
    setFullInterval('monthly')
    setError('')
    setBusy(false)
  }, [open, defaultPlan])

  if (!open || typeof document === 'undefined') return null

  const starterList = formatUsdMonthly(SLOTS_EDGE_STARTER_MONTHLY_USD)
  const starterEarly = formatUsdMonthly(SLOTS_EDGE_EARLY_BIRD.starterMonthlyUsd)
  const fullMonthlyList = formatUsdMonthly(SLOTS_EDGE_FULL_MONTHLY_USD)
  const fullMonthlyEarly = formatUsdMonthly(SLOTS_EDGE_EARLY_BIRD.fullMonthlyUsd)
  const fullAnnualList = formatUsdAnnual(SLOTS_EDGE_FULL_ANNUAL_USD)
  const fullAnnualEffective = formatUsdMonthly(Math.round((SLOTS_EDGE_FULL_ANNUAL_USD / 12) * 100) / 100)

  const applyEarlyBirdAtCheckout =
    selectedPlan === PRODUCT_SLOTS_EDGE_STARTER || fullInterval === 'monthly'

  const checkoutLabel =
    hasSlotsEdgeStarter && selectedPlan === PRODUCT_SLOTS_EDGE
      ? 'Upgrade to Full Edge'
      : selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
        ? 'Continue with Starter'
        : fullInterval === 'annual'
          ? 'Continue with Full Edge Annual'
          : 'Continue with Full Edge'

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

  const starterSelected = selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
  const fullSelected = selectedPlan === PRODUCT_SLOTS_EDGE

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[3px] [-webkit-tap-highlight-color:transparent]"
        aria-label="Close subscribe dialog"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscribe-modal-title"
        data-subscribe-modal
        className="subscribe-modal-shell relative z-10 flex max-h-[min(96dvh,calc(100dvh-0.5rem))] w-full max-w-4xl flex-col overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-h-[min(92dvh,calc(100dvh-2rem))] sm:rounded-[1.75rem]"
      >
        <div className="subscribe-modal-hero relative shrink-0 overflow-hidden border-b border-zinc-800/80 px-5 pb-5 pt-5 sm:px-8 sm:pb-6 sm:pt-7">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.22),transparent_55%),radial-gradient(ellipse_50%_40%_at_100%_0%,rgba(245,158,11,0.12),transparent_50%)]"
            aria-hidden
          />
          <button
            type="button"
            onClick={onClose}
            className="relative mb-4 text-sm font-medium text-zinc-400 hover:text-zinc-200 touch-manipulation"
          >
            ← Not now
          </button>

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="mb-3 inline-flex h-5 items-center">
                <img
                  src="/edge-lounge-logo-transparent.png"
                  alt="EDGE"
                  className="edge-logo--dark h-5 w-auto max-w-none object-contain object-left"
                  draggable={false}
                />
                <img
                  src="/edge-lounge-logo-light.png"
                  alt="EDGE"
                  className="edge-logo--light h-5 w-auto max-w-none object-contain object-left"
                  draggable={false}
                />
              </div>
              <h2 id="subscribe-modal-title" className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {hasSlotsEdge ? 'Your Edge membership' : 'Choose your Slots Edge plan'}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
                {hasSlotsEdge
                  ? 'You already have Full Edge. Manage billing anytime in Stripe.'
                  : 'Lounge stays free. Pick the guide path that fits you, then finish payment on Stripe.'}
              </p>
            </div>

            {!hasSlotsEdge ? (
              <div className="shrink-0 self-start rounded-2xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-left sm:text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-300">
                  Founding member
                </div>
                <div className="mt-0.5 text-sm font-semibold text-amber-100">
                  {SLOTS_EDGE_EARLY_BIRD_PERCENT_OFF}% off monthly plans
                </div>
                <div className="mt-0.5 text-xs text-amber-200/75">First 12 billing months</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6">
          {hasSlotsEdge ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-5">
              <p className="text-sm leading-relaxed text-zinc-300">
                Full AP guide library, all calculators, unlimited bankroll and logbook, calendar OCR, and subscriber
                perks are active on your account.
              </p>
              {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
              {hasBillingAccount ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handlePortal()}
                  className="mt-5 w-full min-h-12 rounded-2xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-bold text-white touch-manipulation"
                >
                  {busy ? 'Opening…' : 'Manage billing'}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  role="button"
                  tabIndex={busy || hasSlotsEdgeStarter ? -1 : 0}
                  aria-pressed={starterSelected}
                  aria-disabled={busy || hasSlotsEdgeStarter}
                  onKeyDown={(event) => {
                    if (busy || hasSlotsEdgeStarter) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedPlan(PRODUCT_SLOTS_EDGE_STARTER)
                    }
                  }}
                  onClick={() => {
                    if (busy || hasSlotsEdgeStarter) return
                    setSelectedPlan(PRODUCT_SLOTS_EDGE_STARTER)
                  }}
                  className={[
                    'subscribe-plan-card group relative w-full rounded-[1.35rem] border p-5 text-left touch-manipulation transition-all sm:p-6',
                    starterSelected
                      ? 'subscribe-plan-card--selected border-cyan-500/60 bg-gradient-to-b from-cyan-950/35 to-zinc-950 ring-1 ring-cyan-500/35 shadow-[0_0_32px_rgba(6,182,212,0.12)]'
                      : 'border-zinc-800/90 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80',
                    hasSlotsEdgeStarter ? 'opacity-90 cursor-default' : 'cursor-pointer',
                  ].join(' ')}
                >
                  {hasSlotsEdgeStarter ? (
                    <span className="absolute right-4 top-4 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/30">
                      Current
                    </span>
                  ) : null}

                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500">Guide-first</div>
                  <div className="mt-1 text-xl font-bold text-white sm:text-2xl">Starter</div>
                  <p className="mt-1 text-sm text-zinc-400">Build your library week by week.</p>

                  <div className="mt-5 flex flex-wrap items-end gap-2">
                    <span className="text-3xl font-bold tracking-tight text-white">{starterEarly}</span>
                    <span className="pb-1 text-sm text-zinc-500 line-through">{starterList}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Founding rate on monthly checkout</p>

                  <ul className="mt-5 space-y-2.5">
                    {STARTER_FEATURES.map((line) => (
                      <PlanFeature key={line}>{line}</PlanFeature>
                    ))}
                  </ul>
                </div>

                <div
                  role="button"
                  tabIndex={busy ? -1 : 0}
                  aria-pressed={fullSelected}
                  aria-disabled={busy}
                  onKeyDown={(event) => {
                    if (busy) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedPlan(PRODUCT_SLOTS_EDGE)
                    }
                  }}
                  onClick={() => {
                    if (busy) return
                    setSelectedPlan(PRODUCT_SLOTS_EDGE)
                  }}
                  className={[
                    'subscribe-plan-card subscribe-plan-card--featured group relative w-full rounded-[1.35rem] border p-5 text-left touch-manipulation transition-all sm:p-6',
                    fullSelected
                      ? 'subscribe-plan-card--selected border-cyan-400/70 bg-gradient-to-b from-cyan-900/30 via-zinc-950 to-amber-950/20 ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(6,182,212,0.16)]'
                      : 'border-zinc-800/90 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80',
                    busy ? 'cursor-default' : 'cursor-pointer',
                  ].join(' ')}
                >
                  <span className="absolute right-4 top-4 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cyan-200 ring-1 ring-cyan-500/30">
                    Most popular
                  </span>

                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Everything now</div>
                  <div className="mt-1 text-xl font-bold text-white sm:text-2xl">Full Edge</div>
                  <p className="mt-1 text-sm text-zinc-400">The complete AP slots toolkit.</p>

                  <div
                    className="mt-4 flex rounded-xl border border-zinc-700/80 bg-zinc-950/70 p-1"
                    role="tablist"
                    aria-label="Full Edge billing interval"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fullInterval === 'monthly'}
                      disabled={busy}
                      onClick={() => {
                        setSelectedPlan(PRODUCT_SLOTS_EDGE)
                        setFullInterval('monthly')
                      }}
                      className={[
                        'flex-1 min-h-10 rounded-lg text-sm font-semibold touch-manipulation transition-colors',
                        fullInterval === 'monthly' ? 'bg-cyan-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200',
                      ].join(' ')}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={fullInterval === 'annual'}
                      disabled={busy}
                      onClick={() => {
                        setSelectedPlan(PRODUCT_SLOTS_EDGE)
                        setFullInterval('annual')
                      }}
                      className={[
                        'flex-1 min-h-10 rounded-lg text-sm font-semibold touch-manipulation transition-colors',
                        fullInterval === 'annual' ? 'bg-cyan-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200',
                      ].join(' ')}
                    >
                      Annual
                    </button>
                  </div>

                  <div className="mt-5 flex flex-wrap items-end gap-2">
                    {fullInterval === 'annual' ? (
                      <>
                        <span className="text-3xl font-bold tracking-tight text-white">{fullAnnualList}</span>
                        <span className="pb-1 text-sm text-zinc-400">{fullAnnualEffective} effective</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-bold tracking-tight text-white">{fullMonthlyEarly}</span>
                        <span className="pb-1 text-sm text-zinc-500 line-through">{fullMonthlyList}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {fullInterval === 'annual'
                      ? 'Built-in yearly savings. No extra founding coupon on annual.'
                      : 'Founding rate on monthly checkout'}
                  </p>

                  <ul className="mt-5 space-y-2.5">
                    {FULL_FEATURES.map((line) => (
                      <PlanFeature key={line}>{line}</PlanFeature>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-5 text-center text-xs leading-relaxed text-zinc-500">
                Stripe handles payment securely. Cancel anytime from Manage billing.
              </p>

              {error ? <p className="mt-4 text-center text-sm text-red-400">{error}</p> : null}
            </>
          )}
        </div>

        {!hasSlotsEdge ? (
          <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/95 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 sm:pb-4">
            <button
              type="button"
              disabled={busy || (hasSlotsEdgeStarter && starterSelected)}
              onClick={() => void handleCheckout()}
              className="w-full min-h-12 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 font-bold text-white touch-manipulation shadow-[0_8px_28px_rgba(6,182,212,0.28)]"
            >
              {busy ? 'Redirecting to Stripe…' : checkoutLabel}
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
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
