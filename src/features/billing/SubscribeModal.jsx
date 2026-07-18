import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  PRODUCT_SLOTS_EDGE,
  PRODUCT_SLOTS_EDGE_LIFETIME,
  PRODUCT_SLOTS_EDGE_STARTER,
  productDisplayName,
  resolvedEntitlementBillingInterval,
} from './edgeProducts.js'
import {
  SLOTS_EDGE_FOUNDING_PERCENT_OFF,
  SLOTS_EDGE_FULL_ANNUAL_USD,
  SLOTS_EDGE_FULL_MONTHLY_USD,
  SLOTS_EDGE_LIFETIME_USD,
  SLOTS_EDGE_STARTER_MONTHLY_USD,
  SLOTS_EDGE_STARTER_ANNUAL_USD,
  applyPercentOff,
  formatUsdAnnual,
  formatUsdMonthly,
  formatUsdOneTime,
} from './edgePricing.js'
import { startEdgeCheckout } from './stripeBillingApi.js'
import {
  getAffiliateCodeForCheckout,
  getAffiliateStampForSubscribeUi,
  refreshAffiliateStamp,
} from '../affiliates/affiliateRefApi.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../profiles/profileGate.js'

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

/** @param {number} prevActive @param {number} nextActive @param {number} slideIndex */
function isCarouselWrapJump(prevActive, nextActive, slideIndex) {
  const prevOffset = getSlideOffset(slideIndex, prevActive)
  const nextOffset = getSlideOffset(slideIndex, nextActive)
  return Math.abs(prevOffset - nextOffset) > 1
}

const SLIDE_POSES = {
  left: { tx: -56, tz: -110, ry: 16, scale: 0.88, opacity: 1, z: 14 },
  center: { tx: 0, tz: 96, ry: 0, scale: 1, opacity: 1, z: 30 },
  right: { tx: 56, tz: -110, ry: -16, scale: 0.88, opacity: 1, z: 14 },
}

/** @param {number} a @param {number} b @param {number} t */
function lerp(a, b, t) {
  return a + (b - a) * t
}

/** @param {typeof SLIDE_POSES.left} from @param {typeof SLIDE_POSES.center} to @param {number} t */
function lerpPose(from, to, t) {
  return {
    tx: lerp(from.tx, to.tx, t),
    tz: lerp(from.tz, to.tz, t),
    ry: lerp(from.ry, to.ry, t),
    scale: lerp(from.scale, to.scale, t),
    opacity: lerp(from.opacity, to.opacity, t),
    z: Math.round(lerp(from.z, to.z, t)),
  }
}

/** @param {number} offset */
function poseFromEffectiveOffset(offset) {
  const fade = Math.max(0, 1 - Math.max(0, Math.abs(offset) - 1) * 2.5)
  let pose
  if (offset <= -1) {
    pose = { ...SLIDE_POSES.left }
  } else if (offset >= 1) {
    pose = { ...SLIDE_POSES.right }
  } else if (offset <= 0) {
    pose = lerpPose(SLIDE_POSES.left, SLIDE_POSES.center, offset + 1)
  } else {
    pose = lerpPose(SLIDE_POSES.center, SLIDE_POSES.right, offset)
  }
  pose.opacity *= fade
  return pose
}

/** @param {typeof SLIDE_POSES.center} pose */
function poseToSlideStyle(pose) {
  const base = 'translate(-50%, -50%)'
  return {
    transform: `${base} translate3d(${pose.tx}%, 0, ${pose.tz}px) rotateY(${pose.ry}deg) scale(${pose.scale})`,
    zIndex: pose.z,
    opacity: pose.opacity,
  }
}

/**
 * @param {number} slideIndex
 * @param {number} activeIndex
 * @param {number} dragProgress Fraction of one slide (-1..1) from horizontal drag.
 */
function getSlide3DStyle(slideIndex, activeIndex, dragProgress = 0) {
  const baseOffset = getSlideOffset(slideIndex, activeIndex)
  const effectiveOffset = baseOffset - dragProgress
  return poseToSlideStyle(poseFromEffectiveOffset(effectiveOffset))
}

/** @param {number} widthPx */
function getCarouselStepPx(widthPx) {
  return Math.max(120, widthPx * 0.42)
}

const STARTER_FEATURES = [
  'Starter guide pack (80+ AP guides)',
  'One mystery premium guide drop every week (fully randomized)',
  'Full access to Bankroll manager, Logbook & Calendar',
  'New Calculator unlocks',
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
    'subscribe-plan-card subscribe-plan-card--starter group relative flex h-full min-h-[19rem] w-full flex-col rounded-[1.25rem] border px-3.5 pb-3.5 pt-9 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
    selected ? 'subscribe-plan-card--selected ring-1 ring-emerald-400/35 shadow-[0_0_40px_rgba(16,185,129,0.12)]' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * @param {{
 *   affiliate?: {
 *     displayName?: string | null,
 *     handle?: string | null,
 *     avatarUrl?: string | null,
 *     buyerDiscountPct?: number | null,
 *     code?: string,
 *   } | null,
 * }} props
 */
function affiliateHandleLabel(affiliate) {
  if (!affiliate) return null
  if (affiliate.handle) return `@${String(affiliate.handle).replace(/^@+/, '')}`
  if (affiliate.displayName) return String(affiliate.displayName)
  if (affiliate.code) return String(affiliate.code)
  return null
}

function PlanPromoBadge({ affiliate = null }) {
  if (affiliate?.buyerDiscountPct) {
    const promoLabel = affiliate.promoCode
      ? String(affiliate.promoCode).trim()
      : affiliate.code
        ? String(affiliate.code).toUpperCase()
        : null
    const handleLabel = affiliateHandleLabel(affiliate)
    const initials = profileAvatarInitials(affiliate.displayName, affiliate.handle || affiliate.code)
    const tone = profileAvatarToneClass(affiliate.handle || affiliate.code || promoLabel || 'creator')
    return (
      <div className="subscribe-plan-founding-badge subscribe-plan-affiliate-badge pointer-events-none absolute left-1/2 top-0 z-30 w-max max-w-[90%] -translate-x-1/2 -translate-y-1/2">
        <div
          className="subscribe-plan-affiliate-badge-inner flex min-w-0 max-w-full items-center gap-2.5 rounded-full border border-cyan-400/40 bg-zinc-900 py-1 pl-1 pr-3.5 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-cyan-400/25"
          aria-label={
            promoLabel
              ? `${promoLabel} · ${affiliate.buyerDiscountPct}% off`
              : handleLabel
                ? `${handleLabel} · ${affiliate.buyerDiscountPct}% off`
                : `${affiliate.buyerDiscountPct}% off`
          }
        >
          {affiliate.avatarUrl ? (
            <img
              src={affiliate.avatarUrl}
              alt=""
              className="subscribe-plan-affiliate-avatar h-7 w-7 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              className={`subscribe-plan-affiliate-avatar flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${tone}`}
              aria-hidden
            >
              {initials}
            </span>
          )}
          {promoLabel ? (
            <>
              <span className="subscribe-plan-affiliate-badge-label min-w-0 truncate text-[11px] font-semibold tracking-wide text-cyan-50">
                {promoLabel}
              </span>
              <span className="subscribe-plan-affiliate-badge-divider h-3 w-px shrink-0 bg-cyan-400/35" aria-hidden />
            </>
          ) : null}
          <span className="subscribe-plan-affiliate-badge-value shrink-0 text-[11px] font-semibold text-cyan-50">
            {affiliate.buyerDiscountPct}% off
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="subscribe-plan-founding-badge pointer-events-none absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="subscribe-plan-founding-badge-inner flex items-center gap-2.5 rounded-full border border-yellow-400/45 bg-zinc-900 px-4 py-1 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-1 ring-yellow-400/30">
        <span className="subscribe-plan-founding-badge-label text-[10px] font-bold uppercase tracking-[0.12em] text-yellow-100">
          Founding member
        </span>
        <span className="subscribe-plan-founding-badge-divider h-3 w-px shrink-0 bg-yellow-400/40" aria-hidden />
        <span className="subscribe-plan-founding-badge-value text-[11px] font-semibold text-yellow-50">
          {SLOTS_EDGE_FOUNDING_PERCENT_OFF}% off
        </span>
      </div>
    </div>
  )
}

/** @param {'monthly' | 'annual'} interval */
function billingSwitchTargetInterval(interval) {
  return interval === 'monthly' ? 'annual' : 'monthly'
}

/**
 * @param {{
 *   open: boolean,
 *   initialProductSlug?: string,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onCheckoutStarted?: () => void,
 *   hasSlotsEdgePro?: boolean,
 *   hasSlotsEdgeLifetime?: boolean,
 *   hasSlotsEdgeStarter?: boolean,
 *   starterPriceInterval?: 'monthly' | 'annual' | null,
 *   fullPriceInterval?: 'monthly' | 'annual' | null,
 * }} props
 */
export default function SubscribeModal({
  open,
  initialProductSlug = PRODUCT_SLOTS_EDGE,
  onClose,
  supabaseClient,
  onCheckoutStarted,
  hasSlotsEdgePro = false,
  hasSlotsEdgeLifetime = false,
  hasSlotsEdgeStarter = false,
  starterPriceInterval = null,
  fullPriceInterval = null,
}) {
  const defaultPlan = useMemo(() => {
    if (initialProductSlug === PRODUCT_SLOTS_EDGE_LIFETIME) return PRODUCT_SLOTS_EDGE_LIFETIME
    if (initialProductSlug === PRODUCT_SLOTS_EDGE_STARTER) return PRODUCT_SLOTS_EDGE_STARTER
    if (initialProductSlug === PRODUCT_SLOTS_EDGE) return PRODUCT_SLOTS_EDGE
    if (hasSlotsEdgeStarter && !hasSlotsEdgePro && !hasSlotsEdgeLifetime) return PRODUCT_SLOTS_EDGE_STARTER
    if (hasSlotsEdgePro && !hasSlotsEdgeLifetime) return PRODUCT_SLOTS_EDGE
    return PRODUCT_SLOTS_EDGE
  }, [hasSlotsEdgeLifetime, hasSlotsEdgePro, hasSlotsEdgeStarter, initialProductSlug])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [affiliatePromo, setAffiliatePromo] = useState(() => getAffiliateStampForSubscribeUi())
  const [selectedPlan, setSelectedPlan] = useState(defaultPlan)
  const [fullInterval, setFullInterval] = useState(/** @type {'monthly' | 'annual'} */ ('monthly'))
  const [starterInterval, setStarterInterval] = useState(/** @type {'monthly' | 'annual'} */ ('monthly'))
  const [activeSlide, setActiveSlide] = useState(1)
  /** Slides that reposition instantly on wrap (avoids flying across the deck). */
  const [instantSlideIndexes, setInstantSlideIndexes] = useState(() => new Set())
  const [dragPx, setDragPx] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const carouselRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const pointerStartX = useRef(0)
  const pointerStartY = useRef(0)
  const dragArmedRef = useRef(false)
  const isDraggingRef = useRef(false)
  const suppressCarouselClickRef = useRef(false)
  const instantSlideResetRef = useRef(0)

  const starterCurrentInterval = resolvedEntitlementBillingInterval(
    starterPriceInterval,
    hasSlotsEdgeStarter,
  )
  const fullCurrentInterval = resolvedEntitlementBillingInterval(
    fullPriceInterval,
    hasSlotsEdgePro && !hasSlotsEdgeLifetime,
  )

  useEffect(() => {
    if (!open) return
    setSelectedPlan(defaultPlan)
    setStarterInterval(
      starterCurrentInterval ? billingSwitchTargetInterval(starterCurrentInterval) : 'monthly',
    )
    setFullInterval(fullCurrentInterval ? billingSwitchTargetInterval(fullCurrentInterval) : 'monthly')
    setAffiliatePromo(getAffiliateStampForSubscribeUi())
    setError('')
    setBusy(false)
    setInstantSlideIndexes(new Set())
    setDragPx(0)
    setIsDragging(false)
    dragArmedRef.current = false
    isDraggingRef.current = false
    const idx = Math.max(0, PLAN_SLUGS.indexOf(defaultPlan))
    setActiveSlide(idx >= 0 ? idx : 1)

    let cancelled = false
    void (async () => {
      const refreshed = await refreshAffiliateStamp(supabaseClient)
      if (cancelled) return
      setAffiliatePromo(
        refreshed?.buyerDiscountPct ? refreshed : getAffiliateStampForSubscribeUi(),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [open, defaultPlan, fullCurrentInterval, starterCurrentInterval, supabaseClient])

  useEffect(() => {
    return () => {
      if (instantSlideResetRef.current) {
        window.clearTimeout(instantSlideResetRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const clearCheckoutBusy = () => {
      setBusy(false)
    }

    const onPageShow = (event) => {
      if (event.persisted) clearCheckoutBusy()
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') clearCheckoutBusy()
    }

    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open])

  const selectPlan = useCallback((slug, slideIndex) => {
    const instant = new Set()
    for (let i = 0; i < PLAN_SLUGS.length; i += 1) {
      if (isCarouselWrapJump(activeSlide, slideIndex, i)) instant.add(i)
    }

    if (instantSlideResetRef.current) {
      window.clearTimeout(instantSlideResetRef.current)
      instantSlideResetRef.current = 0
    }

    if (instant.size > 0) {
      setInstantSlideIndexes(instant)
      instantSlideResetRef.current = window.setTimeout(() => {
        setInstantSlideIndexes(new Set())
        instantSlideResetRef.current = 0
      }, 32)
    } else {
      setInstantSlideIndexes(new Set())
    }

    setSelectedPlan(slug)
    setActiveSlide(slideIndex)
  }, [activeSlide])

  const shiftFocus = useCallback(
    (delta) => {
      const next = (activeSlide + delta + PLAN_SLUGS.length) % PLAN_SLUGS.length
      selectPlan(PLAN_SLUGS[next], next)
    },
    [activeSlide, selectPlan],
  )

  const dragProgress = useMemo(() => {
    const width = carouselRef.current?.clientWidth ?? 320
    return -dragPx / getCarouselStepPx(width)
  }, [dragPx])

  const finishCarouselDrag = useCallback(
    (clientX) => {
      const width = carouselRef.current?.clientWidth ?? 320
      const stepPx = getCarouselStepPx(width)
      const progress = -(clientX - pointerStartX.current) / stepPx

      dragArmedRef.current = false
      isDraggingRef.current = false
      setIsDragging(false)
      setDragPx(0)

      if (Math.abs(clientX - pointerStartX.current) < 8) return

      suppressCarouselClickRef.current = true
      window.setTimeout(() => {
        suppressCarouselClickRef.current = false
      }, 0)

      if (progress > 0.22) {
        shiftFocus(1)
      } else if (progress < -0.22) {
        shiftFocus(-1)
      }
    },
    [shiftFocus],
  )

  const handleCarouselPointerDown = useCallback(
    (event) => {
      if (busy) return
      if (event.pointerType === 'mouse' && event.button !== 0) return

      pointerStartX.current = event.clientX
      pointerStartY.current = event.clientY
      dragArmedRef.current = true
      isDraggingRef.current = false
      setIsDragging(false)
      setDragPx(0)
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [busy],
  )

  const handleCarouselPointerMove = useCallback((event) => {
    if (!dragArmedRef.current && !isDraggingRef.current) return

    const deltaX = event.clientX - pointerStartX.current
    const deltaY = event.clientY - pointerStartY.current

    if (!isDraggingRef.current) {
      if (Math.abs(deltaX) < 8) return
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        dragArmedRef.current = false
        return
      }
      isDraggingRef.current = true
      setIsDragging(true)
    }

    event.preventDefault()
    setDragPx(deltaX)
  }, [])

  const handleCarouselPointerUp = useCallback(
    (event) => {
      if (!dragArmedRef.current && !isDraggingRef.current) return

      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore if capture was already released
      }

      finishCarouselDrag(event.clientX)
    },
    [finishCarouselDrag],
  )

  const handleCarouselClickCapture = useCallback((event) => {
    if (!suppressCarouselClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressCarouselClickRef.current = false
  }, [])

  const handleCarouselPointerCancel = useCallback((event) => {
    dragArmedRef.current = false
    isDraggingRef.current = false
    setIsDragging(false)
    setDragPx(0)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }, [])

  if (!open || typeof document === 'undefined') return null

  const promoPercentOff = affiliatePromo?.buyerDiscountPct || SLOTS_EDGE_FOUNDING_PERCENT_OFF
  const isAffiliatePromo = Boolean(affiliatePromo?.buyerDiscountPct)
  const affiliateVia = affiliateHandleLabel(affiliatePromo)
  const discounted = {
    starterMonthlyUsd: applyPercentOff(SLOTS_EDGE_STARTER_MONTHLY_USD, promoPercentOff),
    starterAnnualUsd: applyPercentOff(SLOTS_EDGE_STARTER_ANNUAL_USD, promoPercentOff),
    fullMonthlyUsd: applyPercentOff(SLOTS_EDGE_FULL_MONTHLY_USD, promoPercentOff),
    fullAnnualUsd: applyPercentOff(SLOTS_EDGE_FULL_ANNUAL_USD, promoPercentOff),
    lifetimeUsd: applyPercentOff(SLOTS_EDGE_LIFETIME_USD, promoPercentOff),
  }
  const affiliateRateCaption = affiliateVia
    ? `${promoPercentOff}% off via ${affiliateVia}`
    : `${promoPercentOff}% off`

  const starterList = formatUsdMonthly(SLOTS_EDGE_STARTER_MONTHLY_USD)
  const starterEarly = formatUsdMonthly(discounted.starterMonthlyUsd)
  const starterAnnualList = formatUsdAnnual(SLOTS_EDGE_STARTER_ANNUAL_USD)
  const starterAnnualEarly = formatUsdAnnual(discounted.starterAnnualUsd)
  const starterAnnualEffective = formatUsdMonthly(
    Math.round((discounted.starterAnnualUsd / 12) * 100) / 100,
  )
  const fullMonthlyList = formatUsdMonthly(SLOTS_EDGE_FULL_MONTHLY_USD)
  const fullMonthlyEarly = formatUsdMonthly(discounted.fullMonthlyUsd)
  const fullAnnualList = formatUsdAnnual(SLOTS_EDGE_FULL_ANNUAL_USD)
  const fullAnnualEarly = formatUsdAnnual(discounted.fullAnnualUsd)
  const fullAnnualEffective = formatUsdMonthly(Math.round((discounted.fullAnnualUsd / 12) * 100) / 100)
  const lifetimeList = formatUsdOneTime(SLOTS_EDGE_LIFETIME_USD)
  const lifetimeEarly = formatUsdOneTime(discounted.lifetimeUsd)

  const lifetimeSelected = selectedPlan === PRODUCT_SLOTS_EDGE_LIFETIME
  const starterSelected = selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
  const fullSelected = selectedPlan === PRODUCT_SLOTS_EDGE
  const starterOnlySubscriber = hasSlotsEdgeStarter && !hasSlotsEdgePro && !hasSlotsEdgeLifetime
  const fullSubscriber = hasSlotsEdgePro && !hasSlotsEdgeLifetime
  const starterMonthlyLocked = starterCurrentInterval === 'monthly'
  const starterAnnualLocked = starterCurrentInterval === 'annual'
  const fullMonthlyLocked = fullCurrentInterval === 'monthly'
  const fullAnnualLocked = fullCurrentInterval === 'annual'
  const selectedInterval =
    selectedPlan === PRODUCT_SLOTS_EDGE_STARTER
      ? starterInterval
      : selectedPlan === PRODUCT_SLOTS_EDGE
        ? fullInterval
        : 'monthly'
  const switchingBillingInterval =
    (starterOnlySubscriber && starterSelected) || (fullSubscriber && fullSelected)
  const checkoutDisabled =
    busy ||
    (switchingBillingInterval &&
      ((starterSelected && starterInterval === starterCurrentInterval) ||
        (fullSelected && fullInterval === fullCurrentInterval)))

  const checkoutLabel =
    lifetimeSelected
      ? `Continue with ${productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME)}`
      : starterOnlySubscriber && fullSelected
        ? `Upgrade to ${productDisplayName(PRODUCT_SLOTS_EDGE)}`
        : switchingBillingInterval
          ? selectedInterval === 'annual'
            ? 'Switch to annual billing'
            : 'Switch to monthly billing'
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
        affiliateCode: getAffiliateCodeForCheckout(),
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
        className="subscribe-modal-shell relative z-10 flex h-[96dvh] max-h-[96dvh] min-h-[96dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:h-[94dvh] sm:max-h-[94dvh] sm:min-h-[94dvh] sm:max-w-2xl sm:rounded-[1.75rem]"
      >
        <div className="subscribe-modal-hero relative z-20 shrink-0 bg-zinc-950 px-6 pb-3 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
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
              {!hasSlotsEdgeLifetime ? (
                <p className="subscribe-modal-tagline mt-1.5 text-[12px] leading-snug text-zinc-400 sm:mt-2 sm:text-sm sm:leading-relaxed">
                  Yes, you can beat slots. Edge is the most comprehensive AP slots program on the market. Learn the
                  secrets that have made us millions.
                </p>
              ) : null}
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-7 sm:pb-6">
          {hasSlotsEdgeLifetime ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5">
              <p className="text-sm leading-relaxed text-zinc-300">
                Lifetime Founding Pass active ... full AP library, all calculators, unlimited tools, and future Slots
                Edge releases without add-on paywalls.
              </p>
            </div>
          ) : (
            <>
              <div className="relative z-10 flex min-h-0 flex-1 items-start justify-center overflow-visible px-1 pb-1 pt-8 sm:items-center sm:pt-10 sm:pb-2">
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
                  ref={carouselRef}
                  className={[
                    'subscribe-plan-carousel-3d h-full w-full touch-pan-y select-none',
                    isDragging ? 'subscribe-plan-carousel-3d--dragging' : '',
                  ].join(' ')}
                  aria-label="Subscription plan options"
                  onPointerDown={handleCarouselPointerDown}
                  onPointerMove={handleCarouselPointerMove}
                  onPointerUp={handleCarouselPointerUp}
                  onPointerCancel={handleCarouselPointerCancel}
                  onClickCapture={handleCarouselClickCapture}
                >
                  <div className="subscribe-plan-carousel-stage">
                    <div className="subscribe-plan-carousel-floor" aria-hidden />

                    <div
                      className={[
                        'subscribe-plan-slide-3d',
                        getSlideOffset(0, activeSlide) === 0 ? 'subscribe-plan-slide-3d--active' : 'subscribe-plan-slide-3d--side',
                        instantSlideIndexes.has(0) ? 'subscribe-plan-slide-3d--instant' : '',
                        isDragging ? 'subscribe-plan-slide-3d--dragging' : '',
                      ].join(' ')}
                      style={getSlide3DStyle(0, activeSlide, dragProgress)}
                    >
                    <div
                      role="button"
                      tabIndex={busy ? -1 : 0}
                      aria-pressed={starterSelected}
                      aria-disabled={busy}
                      onKeyDown={(event) => {
                        if (busy) return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                        }
                      }}
                      onClick={() => {
                        if (busy) return
                        selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                      }}
                      className={planCardClass(starterSelected, busy ? 'cursor-default' : 'cursor-pointer')}
                    >
                      <PlanPromoBadge affiliate={affiliatePromo} />
                      {hasSlotsEdgeStarter ? (
                        <span className="absolute right-3 top-10 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300 ring-1 ring-emerald-500/30">
                          Current
                        </span>
                      ) : null}
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/80">Starter Pack</div>
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
                          disabled={busy || starterMonthlyLocked}
                          onClick={() => {
                            if (starterMonthlyLocked) return
                            selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                            setStarterInterval('monthly')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
                          disabled={busy || starterAnnualLocked}
                          onClick={() => {
                            if (starterAnnualLocked) return
                            selectPlan(PRODUCT_SLOTS_EDGE_STARTER, 0)
                            setStarterInterval('annual')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
                          ? isAffiliatePromo
                            ? `${starterAnnualEffective} effective · ${affiliateRateCaption}`
                            : `${starterAnnualEffective} effective · founding rate`
                          : isAffiliatePromo
                            ? affiliateRateCaption
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
                        instantSlideIndexes.has(1) ? 'subscribe-plan-slide-3d--instant' : '',
                        isDragging ? 'subscribe-plan-slide-3d--dragging' : '',
                      ].join(' ')}
                      style={getSlide3DStyle(1, activeSlide, dragProgress)}
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
                        'subscribe-plan-card subscribe-plan-card--featured group relative flex h-full min-h-[19rem] w-full flex-col rounded-[1.25rem] border px-3.5 pb-3.5 pt-9 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
                        fullSelected ? 'subscribe-plan-card--selected ring-1 ring-cyan-400/40 shadow-[0_0_40px_rgba(6,182,212,0.16)]' : '',
                        busy ? 'cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <PlanPromoBadge affiliate={affiliatePromo} />
                      {fullSubscriber ? (
                        <span className="absolute right-3 top-10 rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-cyan-200 ring-1 ring-cyan-500/30">
                          Current
                        </span>
                      ) : (
                        <span className="absolute right-3 top-10 rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200 ring-1 ring-cyan-500/30">
                          Most popular
                        </span>
                      )}
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
                          disabled={busy || fullMonthlyLocked}
                          onClick={() => {
                            if (fullMonthlyLocked) return
                            selectPlan(PRODUCT_SLOTS_EDGE, 1)
                            setFullInterval('monthly')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
                          disabled={busy || fullAnnualLocked}
                          onClick={() => {
                            if (fullAnnualLocked) return
                            selectPlan(PRODUCT_SLOTS_EDGE, 1)
                            setFullInterval('annual')
                          }}
                          className={[
                            'flex-1 min-h-8 rounded-lg text-xs font-semibold touch-manipulation transition-colors disabled:cursor-not-allowed disabled:opacity-40',
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
                          ? isAffiliatePromo
                            ? `${fullAnnualEffective} effective · ${affiliateRateCaption}`
                            : `${fullAnnualEffective} effective · one month free`
                          : isAffiliatePromo
                            ? affiliateRateCaption
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
                        instantSlideIndexes.has(2) ? 'subscribe-plan-slide-3d--instant' : '',
                        isDragging ? 'subscribe-plan-slide-3d--dragging' : '',
                      ].join(' ')}
                      style={getSlide3DStyle(2, activeSlide, dragProgress)}
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
                        'subscribe-plan-card subscribe-plan-card--lifetime group relative flex h-full min-h-[19rem] w-full flex-col rounded-[1.25rem] border px-3.5 pb-3.5 pt-9 text-left touch-manipulation transition-[border-color,box-shadow,filter] sm:min-h-[23.5rem] sm:rounded-[1.35rem] sm:px-4 sm:pb-4 sm:pt-10',
                        lifetimeSelected ? 'subscribe-plan-card--selected ring-1 ring-amber-400/35 shadow-[0_0_40px_rgba(245,158,11,0.12)]' : '',
                        busy ? 'cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      <PlanPromoBadge affiliate={affiliatePromo} />
                      <span className="inline-flex w-fit rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200 ring-1 ring-amber-500/30">
                        {isAffiliatePromo ? 'Partner lifetime pass' : 'Founding lifetime pass'}
                      </span>
                      <div className="mt-1.5 text-lg font-bold text-white">{productDisplayName(PRODUCT_SLOTS_EDGE_LIFETIME)}</div>
                      <p className="mt-0.5 text-xs text-zinc-400">Pay once. Never worry about renewals or new-tool add-ons.</p>
                      <div className="mt-3 flex flex-wrap items-end gap-1.5">
                        <span className="text-xl font-bold tracking-tight text-white">{lifetimeEarly}</span>
                        <span className="pb-0.5 text-xs text-zinc-500 line-through">{lifetimeList}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {isAffiliatePromo
                          ? `${affiliateRateCaption} · one-time`
                          : 'Founding rate · one-time checkout'}
                      </p>
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

              <div className="subscribe-modal-footer shrink-0 pt-2">
              <div
                className="flex items-center justify-center gap-2"
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
                disabled={checkoutDisabled}
                onClick={() => void handleCheckout()}
                className="subscribe-modal-checkout-btn mt-4 w-full min-h-12 shrink-0 rounded-2xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-50 font-bold text-white touch-manipulation shadow-[0_8px_28px_rgba(6,182,212,0.28)]"
              >
                {busy ? 'Redirecting to Stripe…' : checkoutLabel}
              </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
