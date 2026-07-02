import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_LIFETIME,
  PRODUCT_SLOTS_EDGE_STARTER,
  productDisplayName,
} from './edgeProducts.js'
import {
  SLOTS_EDGE_FOUNDING,
  SLOTS_EDGE_FOUNDING_PERCENT_OFF,
  SLOTS_EDGE_FULL_ANNUAL_USD,
  SLOTS_EDGE_FULL_MONTHLY_USD,
  SLOTS_EDGE_LIFETIME_USD,
  SLOTS_EDGE_STARTER_MONTHLY_USD,
  SLOTS_EDGE_STARTER_ANNUAL_USD,
  formatUsdAnnual,
  formatUsdMonthly,
  formatUsdOneTime,
} from './edgePricing.js'
import { startEdgeCheckout } from './stripeBillingApi.js'

const PLAN_SLUGS = [PRODUCT_SLOTS_EDGE_STARTER, PRODUCT_SLOTS_EDGE, PRODUCT_SLOTS_EDGE_LIFETIME]
const PLAN_LABELS = {
  [PRODUCT_SLOTS_EDGE_STARTER]: productDisplayName(PRODUCT_SLOTS_EDGE_STARTER),
  [PRODUCT_SLOTS_EDGE]: productDisplayName(PRODUCT_SLOTS_EDGE),
  [PRODUCT_SLOTS_EDGE_LIFETIME]: productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME),
}

/** @param {number} index @param {number} activeIndex */
function getSlideOffset(index, activeIndex) {
  let offset = index - activeIndex
  if (offset > 1) offset -= PLAN_SLUGS.length
  if (offset < -1) offset += PLAN_SLUGS.length
  return offset
}

/** @param {number} offset */
function getSlide3DStyle(offset) {
  const base = 'translate(-50%, -50%)'
  if (offset === 0) {
    return {
      transform: `${base} translate3d(0, 0, 120px) rotateY(0deg) scale(1)`,
      zIndex: 30,
    }
  }
  if (offset === -1) {
    return {
      transform: `${base} translate3d(-52%, 0, -140px) rotateY(0deg) scale(0.86)`,
      zIndex: 12,
    }
  }
  return {
    transform: `${base} translate3d(52%, 0, -140px) rotateY(0deg) scale(0.86)`,
    zIndex: 12,
  }
}

const STARTER_FEATURES = [
  'Instant starter guide pack (80+ AP guides)',
  'One random premium guide drop every week',
  'Calculators paired with guides you unlock',
  'Subscriber badge and Lounge perks',
]

const FULL_FEATURES = [
  'Full AP guide library unlocked now (over 300 AP guides)',
  'Every calculator, bankroll, and logbook',
  'Calendar OCR and offer alerts',
  'Best path if you want everything today',
]

const LIFETIME_FEATURES = [
  'Everything in Slots Edge Pro today',
  'All future Slots Edge guides and calculators we ship',
  'No add-on paywalls within the Slots vertical',
  'One-time payment ... yours for life',
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
    <li className="flex items-start gap-2 text-xs leading-snug text-zinc-300">
      <CheckIcon />
      <span>{children}</span>
    </li>
  )
}

function planCardClass(selected, extra = '') {
  return [
    'subscribe-plan-card subscribe-plan-card--starter group relative flex h-full min-h-[22rem] w-full flex-col rounded-[1.25rem] border bg-zinc-950 px-3.5 pb-4 pt-10 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
    selected
      ? 'subscribe-plan-card--selected border-emerald-400/60 ring-1 ring-emerald-400/35 shadow-[0_0_40px_rgba(16,185,129,0.12)]'
      : 'border-zinc-800/90 hover:border-emerald-700/45',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

function FoundingMemberBadge() {
  return (
    <div className="subscribe-plan-founding-badge pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="subscribe-plan-founding-badge-inner flex items-center gap-2.5 rounded-full border border-yellow-400/45 bg-zinc-900 px-4 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-yellow-400/30">
        <span className="subscribe-plan-founding-badge-label text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-100">Founding member</span>
        <span className="subscribe-plan-founding-badge-divider h-3 w-px shrink-0 bg-yellow-400/40" aria-hidden />
        <span className="subscribe-plan-founding-badge-value text-[11px] font-semibold text-yellow-50">{SLOTS_EDGE_FOUNDING_PERCENT_OFF}% off</span>
      </div>
    </div>
  )
}

/**
 * @param {{
 *   open: boolean,
 *   initialProductSlug?: string,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onCheckoutStarted?: () => void,
 *   hasSlotsEdge?: boolean,
 *   hasSlotsEdgeLifetime?: boolean,
 *   hasSlotsEdgeStarter?: boolean,
 * }} props
 */
export default function SubscribeModal({
  open,
  initialProductSlug = PRODUCT_SLOTS_EDGE,
  onClose,
  supabaseClient,
  onCheckoutStarted,
  hasSlotsEdge = false,
  hasSlotsEdgeLifetime = false,
  hasSlotsEdgeStarter = false,
}) {
  const defaultPlan = useMemo(() => {
    if (initialProductSlug === PRODUCT_SLOTS_EDGE_LIFETIME) return PRODUCT_SLOTS_EDGE_LIFETIME
    if (initialProductSlug === PRODUCT_SLOTS_EDGE_STARTER) return PRODUCT_SLOTS_EDGE_STARTER
    if (hasSlotsEdgeStarter && !hasSlotsEdge) return PRODUCT_SLOTS_EDGE
    return PRODUCT_SLOTS_EDGE
  }, [hasSlotsEdge, hasSlotsEdgeStarter, initialProductSlug])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedPlan, setSelectedPlan] = useState(defaultPlan)
  const [fullInterval, setFullInterval] = useState(/** @type {'monthly' | 'annual'} */ ('monthly'))
  const [starterInterval, setStarterInterval] = useState(/** @type {'monthly' | 'annual'} */ ('monthly'))
  const [activeSlide, setActiveSlide] = useState(1)
  const touchStartX = useRef(0)

  useEffect(() => {
    if (!open) return
    setSelectedPlan(defaultPlan)
    setFullInterval('monthly')
    setStarterInterval('monthly')
    setError('')
    setBusy(false)
    const idx = Math.max(0, PLAN_SLUGS.indexOf(defaultPlan))
    setActiveSlide(idx >= 0 ? idx : 1)
  }, [open, defaultPlan])

  const selectPlan = useCallback((slug, slideIndex) => {
    setSelectedPlan(slug)
    setActiveSlide(slideIndex)
  }, [])

  const shiftFocus = useCallback(
    (delta) => {
      const next = (activeSlide + delta + PLAN_SLUGS.length) % PLAN_SLUGS.length
      selectPlan(PLAN_SLUGS[next], next)
    },
    [activeSlide, selectPlan],
  )

  const handleCarouselTouchStart = useCallback((event) => {
    touchStartX.current = event.changedTouches[0]?.clientX ?? 0
  }, [])

  const handleCarouselTouchEnd = useCallback(
    (event) => {
      const endX = event.changedTouches[0]?.clientX ?? 0
      const delta = endX - touchStartX.current
      if (Math.abs(delta) < 40) return
      shiftFocus(delta < 0 ? 1 : -1)
    },
    [shiftFocus],
  )

  if (!open || typeof document === 'undefined') return null

  const starterList = formatUsdMonthly(SLOTS_EDGE_STARTER_MONTHLY_USD)
  const starterEarly = formatUsdMonthly(SLOTS_EDGE_FOUNDING.starterMonthlyUsd)
  const starterAnnualList = formatUsdAnnual(SLOTS_EDGE_STARTER_ANNUAL_USD)
  const starterAnnualEarly = formatUsdAnnual(SLOTS_EDGE_FOUNDING.starterAnnualUsd)
  const starterAnnualEffective = formatUsdMonthly(
    Math.round((SLOTS_EDGE_FOUNDING.starterAnnualUsd / 12) * 100) / 100,
  )
  const fullMonthlyList = formatUsdMonthly(SLOTS_EDGE_FULL_MONTHLY_USD)
  const fullMonthlyEarly = formatUsdMonthly(SLOTS_EDGE_FOUNDING.fullMonthlyUsd)
  const fullAnnualList = formatUsdAnnual(SLOTS_EDGE_FULL_ANNUAL_USD)
  const fullAnnualEarly = formatUsdAnnual(SLOTS_EDGE_FOUNDING.fullAnnualUsd)
  const fullAnnualEffective = formatUsdMonthly(Math.round((SLOTS_EDGE_FOUNDING.fullAnnualUsd / 12) * 100) / 100)
  const lifetimeList = formatUsdOneTime(SLOTS_EDGE_LIFETIME_USD)
  const lifetimeEarly = formatUsdOneTime(SLOTS_EDGE_FOUNDING.lifetimeUsd)

  const lifetimeSelected = selectedPlan === PRODUCT_SLOTS_EDGE_LIFETIME
  const starterSelected = selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
  const fullSelected = selectedPlan === PRODUCT_SLOTS_EDGE

  const checkoutLabel =
    lifetimeSelected
      ? `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME)}`
      : hasSlotsEdgeStarter && selectedPlan === PRODUCT_SLOTS_EDGE
        ? `Upgrade to ${productDisplayName(PRODUCT_SLOTS_EDGE)}`
        : selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
          ? starterInterval === 'annual'
            ? `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)} Annual`
            : `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)}`
          : fullInterval === 'annual'
            ? `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE)} Annual`
            : `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE)}`

  const handleCheckout = async () => {
    setError('')
    setBusy(true)
    try {
      onCheckoutStarted?.()
      await startEdgeCheckout(supabaseClient, selectedPlan, {
        priceInterval:
          selectedPlan === PRODUCT_SLOTS_EDGE
            ? fullInterval
            : selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
              ? starterInterval
              : 'monthly',
        applyEarlyBird: true,
      })
    } catch (e) {
      setBusy(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

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
        className="subscribe-modal-shell relative z-10 flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:max-h-[88dvh] sm:max-w-2xl sm:rounded-[1.75rem]"
      >
        <div className="subscribe-modal-hero relative z-30 shrink-0 bg-zinc-950 px-6 pb-6 pt-6 sm:px-7 sm:pb-7 sm:pt-7">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(6,182,212,0.2),transparent_60%)]"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 inline-flex h-5 items-center">
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
              <h2 id="subscribe-modal-title" className="text-lg font-bold tracking-tight text-white sm:text-xl">
                {hasSlotsEdgeLifetime ? 'You have Slots Edge Lifetime' : 'Choose your Edge AP Slots plan'}
              </h2>
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          {hasSlotsEdgeLifetime ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
              <p className="text-sm leading-relaxed text-zinc-300">
                Lifetime Founding Pass active ... full AP library, all calculators, unlimited tools, and future Slots
                Edge releases without add-on paywalls.
              </p>
            </div>
          ) : (
            <>
              <div className="relative z-10 mx-auto w-full min-h-[25rem] overflow-visible px-1 py-4 sm:min-h-[27rem] sm:py-5">
                <button
                  type="button"
                  aria-label="Previous plan"
                  disabled={busy}
                  onClick={() => shiftFocus(-1)}
                  className="subscribe-plan-carousel-nav subscribe-plan-carousel-nav--prev absolute left-0 top-1/2 z-40 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900 text-zinc-300 touch-manipulation disabled:opacity-30 sm:flex"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next plan"
                  disabled={busy}
                  onClick={() => shiftFocus(1)}
                  className="subscribe-plan-carousel-nav subscribe-plan-carousel-nav--next absolute right-0 top-1/2 z-40 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900 text-zinc-300 touch-manipulation disabled:opacity-30 sm:flex"
                >
                  ›
                </button>

                <div
                  className="subscribe-plan-carousel-3d h-full w-full touch-pan-y"
                  aria-label="Subscription plan options"
                  onTouchStart={handleCarouselTouchStart}
                  onTouchEnd={handleCarouselTouchEnd}
                >
                  <div className="subscribe-plan-carousel-stage">
                    <div className="subscribe-plan-carousel-floor" aria-hidden />

                    <div
                      className={[
                        'subscribe-plan-slide-3d',
                        getSlideOffset(0, activeSlide) === 0 ? 'subscribe-plan-slide-3d--active' : 'subscribe-plan-slide-3d--side',
                      ].join(' ')}
                      style={getSlide3DStyle(getSlideOffset(0, activeSlide))}
                    >
                    <div
                      role="button"
                      tabIndex={busy || hasSlotsEdgeStarter ? -1 : 0}
                      aria-pressed={starterSelected}
                      aria-disabled={busy || hasSlotsEdgeStarter}
                      onKeyDown={(event) => {
                        if (busy || hasSlotsEdgeStarter) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                        }
                      }}
                      onClick={() => {
                        if (busy || hasSlotsEdgeStarter) return
                        selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                      }}
                      className={planCardClass(
                        starterSelected,
                        hasSlotsEdgeStarter ? 'opacity-90 cursor-default' : 'cursor-pointer',
                      )}
                    >
                      <FoundingMemberBadge />
                      {hasSlotsEdgeStarter ? (
                        <span className="absolute right-3 top-10 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/30">
                          Current
                        </span>
                      ) : null}
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Guide-first</div>
                      <div className="mt-0.5 text-lg font-bold text-white">{productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)}</div>
                      <p className="mt-0.5 text-xs text-zinc-400">Build your library week by week.</p>
                      <div
                        className="mt-2 flex rounded-xl border border-zinc-700/80 bg-zinc-900 p-1"
                        role="tablist"
                        aria-label={`${productDisplayName(PRODUCT_SLOTS_EDGE_STARTER)} billing interval`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={starterInterval === 'monthly'}
                          disabled={busy || hasSlotsEdgeStarter}
                          onClick={() => {
                            selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                            setStarterInterval('monthly')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors',
                            starterInterval === 'monthly'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200',
                          ].join(' ')}
                        >
                          Monthly
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={starterInterval === 'annual'}
                          disabled={busy || hasSlotsEdgeStarter}
                          onClick={() => {
                            selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                            setStarterInterval('annual')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors',
                            starterInterval === 'annual'
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200',
                          ].join(' ')}
                        >
                          Annual
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-1.5">
                        {starterInterval === 'annual' ? (
                          <>
                            <span className="text-xl font-bold tracking-tight text-white">{starterAnnualEarly}</span>
                            <span className="pb-0.5 text-xs text-zinc-500 line-through">{starterAnnualList}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xl font-bold tracking-tight text-white">{starterEarly}</span>
                            <span className="pb-0.5 text-xs text-zinc-500 line-through">{starterList}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {starterInterval === 'annual'
                          ? `${starterAnnualEffective} effective · founding rate once at checkout`
                          : 'Founding rate on monthly checkout'}
                      </p>
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {STARTER_FEATURES.map((line) => (
                          <PlanFeature key={line}>{line}</PlanFeature>
                        ))}
                      </ul>
                    </div>
                    </div>

                    <div
                      className={[
                        'subscribe-plan-slide-3d',
                        getSlideOffset(1, activeSlide) === 0 ? 'subscribe-plan-slide-3d--active' : 'subscribe-plan-slide-3d--side',
                      ].join(' ')}
                      style={getSlide3DStyle(getSlideOffset(1, activeSlide))}
                    >
                    <div
                      role="button"
                      tabIndex={busy ? -1 : 0}
                      aria-pressed={fullSelected}
                      aria-disabled={busy}
                      onKeyDown={(event) => {
                        if (busy) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlan(PRODUCT_SLOTS_EDGE, 1)
                        }
                      }}
                      onClick={() => {
                        if (busy) return
                        selectPlan(PRODUCT_SLOTS_EDGE, 1)
                      }}
                      className={[
                        'subscribe-plan-card subscribe-plan-card--featured group relative flex h-full min-h-[22rem] w-full flex-col rounded-[1.25rem] border bg-zinc-950 px-3.5 pb-4 pt-10 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
                        fullSelected
                          ? 'subscribe-plan-card--selected border-cyan-400/70 ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(6,182,212,0.16)]'
                          : 'border-zinc-800/90 hover:border-zinc-700',
                        busy ? 'cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <FoundingMemberBadge />
                      <span className="absolute right-3 top-10 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200 ring-1 ring-cyan-500/30">
                        Most popular
                      </span>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300/80">Everything now</div>
                      <div className="mt-0.5 text-lg font-bold text-white">{productDisplayName(PRODUCT_SLOTS_EDGE)}</div>
                      <p className="mt-0.5 text-xs text-zinc-400">The complete AP slots toolkit.</p>
                      <div
                        className="mt-2 flex rounded-xl border border-zinc-700/80 bg-zinc-900 p-1"
                        role="tablist"
                        aria-label={`${productDisplayName(PRODUCT_SLOTS_EDGE)} billing interval`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={fullInterval === 'monthly'}
                          disabled={busy}
                          onClick={() => {
                            selectPlan(PRODUCT_SLOTS_EDGE, 1)
                            setFullInterval('monthly')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors',
                            fullInterval === 'monthly'
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200',
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
                            selectPlan(PRODUCT_SLOTS_EDGE, 1)
                            setFullInterval('annual')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors',
                            fullInterval === 'annual'
                              ? 'bg-cyan-600 text-white shadow-sm'
                              : 'text-zinc-400 hover:text-zinc-200',
                          ].join(' ')}
                        >
                          Annual
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap items-end gap-1.5">
                        {fullInterval === 'annual' ? (
                          <>
                            <span className="text-xl font-bold tracking-tight text-white">{fullAnnualEarly}</span>
                            <span className="pb-0.5 text-xs text-zinc-500 line-through">{fullAnnualList}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xl font-bold tracking-tight text-white">{fullMonthlyEarly}</span>
                            <span className="pb-0.5 text-xs text-zinc-500 line-through">{fullMonthlyList}</span>
                          </>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {fullInterval === 'annual'
                          ? `${fullAnnualEffective} effective · one month free`
                          : 'Founding rate on monthly checkout'}
                      </p>
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {FULL_FEATURES.map((line) => (
                          <PlanFeature key={line}>{line}</PlanFeature>
                        ))}
                      </ul>
                    </div>
                    </div>

                    <div
                      className={[
                        'subscribe-plan-slide-3d',
                        getSlideOffset(2, activeSlide) === 0 ? 'subscribe-plan-slide-3d--active' : 'subscribe-plan-slide-3d--side',
                      ].join(' ')}
                      style={getSlide3DStyle(getSlideOffset(2, activeSlide))}
                    >
                    <div
                      role="button"
                      tabIndex={busy ? -1 : 0}
                      aria-pressed={lifetimeSelected}
                      aria-disabled={busy}
                      onKeyDown={(event) => {
                        if (busy) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlan(PRODUCT_SLOTS_EDGE_LIFETIME, 2)
                        }
                      }}
                      onClick={() => {
                        if (busy) return
                        selectPlan(PRODUCT_SLOTS_EDGE_LIFETIME, 2)
                      }}
                      className={[
                        'subscribe-plan-card subscribe-plan-card--lifetime group relative flex h-full min-h-[22rem] w-full flex-col rounded-[1.25rem] border bg-zinc-950 px-3.5 pb-4 pt-10 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
                        lifetimeSelected
                          ? 'subscribe-plan-card--selected border-amber-400/60 ring-1 ring-amber-400/35 shadow-[0_0_40px_rgba(245,158,11,0.12)]'
                          : 'border-zinc-800/90 hover:border-amber-700/50',
                        busy ? 'cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <FoundingMemberBadge />
                      <span className="inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/30">
                        Founding lifetime pass
                      </span>
                      <div className="mt-1.5 text-lg font-bold text-white">{productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME)}</div>
                      <p className="mt-0.5 text-xs text-zinc-400">Pay once. Never worry about renewals or new-tool add-ons.</p>
                      <div className="mt-3 flex flex-wrap items-end gap-1.5">
                        <span className="text-xl font-bold tracking-tight text-white">{lifetimeEarly}</span>
                        <span className="pb-0.5 text-xs text-zinc-500 line-through">{lifetimeList}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">Founding rate · one-time checkout</p>
                      <ul className="mt-3 flex-1 space-y-1.5">
                        {LIFETIME_FEATURES.map((line) => (
                          <PlanFeature key={line}>{line}</PlanFeature>
                        ))}
                      </ul>
                    </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                className="mt-5 flex items-center justify-center gap-2"
                role="tablist"
                aria-label="Plan carousel pagination"
              >
                {PLAN_SLUGS.map((slug, index) => (
                  <button
                    key={slug}
                    type="button"
                    role="tab"
                    aria-selected={activeSlide === index}
                    aria-label={`Show ${PLAN_LABELS[slug]} plan`}
                    disabled={busy}
                    onClick={() => selectPlan(slug, index)}
                    className={[
                      'h-2.5 rounded-full touch-manipulation transition-all',
                      activeSlide === index ? 'w-7 bg-cyan-500' : 'w-2.5 bg-zinc-600 hover:bg-zinc-500',
                    ].join(' ')}
                  />
                ))}
              </div>

              <p className="mt-4 text-center text-xs leading-relaxed text-zinc-500">
                Secure checkout powered by Stripe.
              </p>

              {error ? <p className="mt-2 text-center text-sm text-red-400">{error}</p> : null}

              <button
                type="button"
                disabled={busy || (hasSlotsEdgeStarter && starterSelected)}
                onClick={() => void handleCheckout()}
                className="mt-4 w-full min-h-12 shrink-0 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 font-bold text-white touch-manipulation shadow-[0_8px_28px_rgba(6,182,212,0.28)]"
              >
                {busy ? 'Redirecting to Stripe…' : checkoutLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
