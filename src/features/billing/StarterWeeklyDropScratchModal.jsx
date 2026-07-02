import { useCallback, useEffect, useRef, useState } from 'react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { countStarterProUpgradeGuides } from '../guides/starterProUpgradeGuideCount.js'
import {
  fetchStarterWeeklyDropReveal,
  markStarterWeeklyDropScratched,
  navigateToGuideSlug,
} from './starterWeeklyDropApi.js'
import { ScratchRevealAudio } from './scratchRevealAudio.js'
import { loadScratchFoilLogo, paintScratchFoil } from './scratchRevealFoil.js'

const SCRATCH_BRUSH_RADIUS = 20
const SCRATCH_REVEAL_RATIO = 0.75
const SCRATCH_MIN_MS = 2500

export default function StarterWeeklyDropScratchModal({
  open = false,
  unlockId = '',
  onClose,
  onRevealed,
  onRequireSubscribe,
  supabaseClient,
  guideAccessContext = {},
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [proUpgradeCount, setProUpgradeCount] = useState(0)
  const [proUpgradeCountLoading, setProUpgradeCountLoading] = useState(false)

  const canvasRef = useRef(null)
  const heroWrapRef = useRef(null)
  const scratchingRef = useRef(false)
  const lastPointRef = useRef(null)
  const audioRef = useRef(null)
  const movementConfirmedRef = useRef(false)
  const scratchStartedAtRef = useRef(null)

  const resetScratchState = useCallback(() => {
    scratchingRef.current = false
    lastPointRef.current = null
    movementConfirmedRef.current = false
    scratchStartedAtRef.current = null
    audioRef.current?.stop()
  }, [])

  useEffect(() => {
    audioRef.current = new ScratchRevealAudio()
    return () => {
      audioRef.current?.dispose()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) return
    audioRef.current?.preload()
  }, [open])

  useEffect(() => {
    if (!open || !unlockId || !supabaseClient) {
      setPayload(null)
      setRevealed(false)
      setError('')
      setLoading(false)
      setProUpgradeCount(0)
      setProUpgradeCountLoading(false)
      resetScratchState()
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setError('')
    setRevealed(false)
    resetScratchState()

    void (async () => {
      const { data, error: fetchErr } = await fetchStarterWeeklyDropReveal(supabaseClient, unlockId)
      if (cancelled) return
      if (fetchErr || !data) {
        setError('Could not load your weekly drop. Please try again.')
        setLoading(false)
        return
      }
      setPayload(data)
      if (data.scratch_revealed_at) {
        setRevealed(true)
      }
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [open, unlockId, supabaseClient, resetScratchState])

  const starterUnlockedSlugsKey = Array.from(guideAccessContext.starterUnlockedGuideSlugs || []).join('|')

  useEffect(() => {
    if (!open || !payload || !supabaseClient || guideAccessContext.hasSlotsEdge) {
      if (!guideAccessContext.hasSlotsEdge) {
        setProUpgradeCount(0)
        setProUpgradeCountLoading(false)
      }
      return undefined
    }

    let cancelled = false
    setProUpgradeCountLoading(true)
    void (async () => {
      try {
        const { data: guides } = await supabaseClient
          .from('guides')
          .select('slug, published, machines ( slug, release_year )')
          .eq('published', true)
        if (cancelled) return
        setProUpgradeCount(
          countStarterProUpgradeGuides(guides || [], {
            ...guideAccessContext,
            starterUnlockedGuideSlugs: guideAccessContext.starterUnlockedGuideSlugs,
          }),
        )
      } catch {
        if (!cancelled) setProUpgradeCount(0)
      } finally {
        if (!cancelled) setProUpgradeCountLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    payload,
    supabaseClient,
    guideAccessContext.hasSlotsEdge,
    guideAccessContext.starterWeeklyDropPoolExhausted,
    starterUnlockedSlugsKey,
  ])

  useEffect(() => {
    if (!open || !payload || revealed) return undefined

    let cancelled = false
    /** @type {HTMLImageElement | null} */
    let logoImage = null

    const repaintFoil = () => {
      const canvas = canvasRef.current
      const wrap = heroWrapRef.current
      if (!canvas || !wrap || cancelled) return
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      paintScratchFoil(ctx, w, h, logoImage)
    }

    void loadScratchFoilLogo().then((img) => {
      if (cancelled) return
      logoImage = img
      repaintFoil()
    })

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(repaintFoil) : null
    const wrap = heroWrapRef.current
    ro?.observe(wrap)
    window.addEventListener('resize', repaintFoil)
    return () => {
      cancelled = true
      ro?.disconnect()
      window.removeEventListener('resize', repaintFoil)
    }
  }, [open, payload, revealed])

  const finishReveal = useCallback(async () => {
    if (revealed || !unlockId || !supabaseClient) return
    audioRef.current?.stop()
    setRevealed(true)
    await markStarterWeeklyDropScratched(supabaseClient, unlockId)
    onRevealed?.(unlockId)
  }, [onRevealed, revealed, supabaseClient, unlockId])

  const sampleClearedRatio = useCallback((canvas) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return 0
    const { width, height } = canvas
    const step = 6
    let transparent = 0
    let total = 0
    const img = ctx.getImageData(0, 0, width, height).data
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const i = (y * width + x) * 4 + 3
        total += 1
        if (img[i] < 40) transparent += 1
      }
    }
    return total > 0 ? transparent / total : 0
  }, [])

  const tryFinishReveal = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || revealed || scratchStartedAtRef.current == null) return
    const ratio = sampleClearedRatio(canvas)
    const elapsed = Date.now() - scratchStartedAtRef.current
    if (ratio >= SCRATCH_REVEAL_RATIO && elapsed >= SCRATCH_MIN_MS) {
      void finishReveal()
    }
  }, [finishReveal, revealed, sampleClearedRatio])

  const scratchAt = useCallback(
    (clientX, clientY) => {
      const canvas = canvasRef.current
      if (!canvas || revealed) return
      const rect = canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const last = lastPointRef.current
      if (last) {
        const dx = x - last.x
        const dy = y - last.y
        const dist = Math.hypot(dx, dy)
        if (dist > 4) {
          if (!movementConfirmedRef.current) {
            movementConfirmedRef.current = true
            if (scratchStartedAtRef.current == null) {
              scratchStartedAtRef.current = Date.now()
            }
            audioRef.current?.start()
          }
          ctx.globalCompositeOperation = 'destination-out'
          ctx.lineWidth = SCRATCH_BRUSH_RADIUS * 2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(last.x, last.y)
          ctx.lineTo(x, y)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(x, y, SCRATCH_BRUSH_RADIUS, 0, Math.PI * 2)
          ctx.fill()

          tryFinishReveal()
        }
      }

      lastPointRef.current = { x, y }
    },
    [revealed, tryFinishReveal],
  )

  const onPointerDown = (event) => {
    if (revealed || loading) return
    scratchingRef.current = true
    lastPointRef.current = null
    movementConfirmedRef.current = false
    canvasRef.current?.setPointerCapture?.(event.pointerId)
    tryFinishReveal()
  }

  const onPointerMove = (event) => {
    if (!scratchingRef.current || revealed) return
    scratchAt(event.clientX, event.clientY)
  }

  const onPointerUp = () => {
    scratchingRef.current = false
    lastPointRef.current = null
    movementConfirmedRef.current = false
    audioRef.current?.stop()
    tryFinishReveal()
  }

  const onTapReveal = () => {
    audioRef.current?.stop()
    void finishReveal()
  }

  const onOpenGuide = () => {
    const slug = payload?.guide_slug
    onClose?.()
    if (slug) navigateToGuideSlug(slug)
  }

  if (!open) return null

  const title = payload?.guide_title || 'Weekly guide drop'
  const heroUrl = payload?.hero_url || ''
  const showProCta = revealed && proUpgradeCount > 0
  const guideCountLabel = proUpgradeCount.toLocaleString()
  const mayShowProCta = !guideAccessContext.hasSlotsEdge
  const showProUpsell = revealed && mayShowProCta && (showProCta || proUpgradeCountLoading)

  const proUpsellCard = (
    <div className="starter-weekly-drop-pro-cta overflow-hidden rounded-2xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/50 via-zinc-950 to-zinc-950 p-4 shadow-[0_8px_28px_rgba(6,182,212,0.12)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300/90">
        Upgrade to Slots Edge Pro
      </p>
      <p className="starter-weekly-drop-pro-copy mt-2 text-[15px] font-semibold leading-snug text-white">
        Get immediate access to all{' '}
        <span className="starter-weekly-drop-pro-count text-cyan-200">
          {proUpgradeCountLoading ? '…' : guideCountLabel}
        </span>{' '}
        additional guides
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
        Full AP library, every calculator, bankroll, logbook, and calendar OCR ... unlocked now.
      </p>
      <button
        type="button"
        onClick={() => onRequireSubscribe?.('slots-edge')}
        disabled={proUpgradeCountLoading}
        className="starter-weekly-drop-pro-btn mt-4 w-full min-h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_8px_28px_rgba(59,130,246,0.28)] touch-manipulation transition-transform hover:from-cyan-500 hover:to-blue-500 active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
      >
        View plans
      </button>
    </div>
  )

  return (
    <div
      className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,env(safe-area-inset-top))] sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ zIndex: Z_APP_MODAL + 5 }}
      data-starter-weekly-drop-modal
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[3px] [-webkit-tap-highlight-color:transparent]"
        aria-label="Close weekly drop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="starter-weekly-drop-title"
        className="starter-weekly-drop-dialog relative z-10 w-full max-w-md overflow-hidden rounded-t-[1.75rem] border border-zinc-700/70 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="starter-weekly-drop-header relative px-5 pb-4 pt-5 sm:px-6">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_-20%,rgba(249,115,22,0.22),transparent_62%)]"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
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
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="starter-weekly-drop-close flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700/80 bg-zinc-900/80 text-lg leading-none text-zinc-400 touch-manipulation hover:border-zinc-600 hover:text-zinc-200"
            >
              <span aria-hidden>×</span>
            </button>
          </div>

          <div className="relative min-h-[7rem]">
            <span className="starter-weekly-drop-kicker inline-flex items-center rounded-full border border-orange-500/35 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-200">
              Weekly drop
            </span>
            <h2
              id="starter-weekly-drop-title"
              className="mt-2.5 min-h-[3.25rem] text-xl font-bold leading-tight tracking-tight text-white sm:min-h-[2.75rem]"
            >
              {revealed ? 'You unlocked a guide' : 'Scratch your guide'}
            </h2>
            <p className="starter-weekly-drop-subtitle mt-1.5 min-h-[2.75rem] text-sm leading-snug text-zinc-400">
              {revealed ? 'Tap the card below to open your guide' : 'Rub the foil to reveal this week\u2019s premium pick'}
            </p>
          </div>
        </div>

        <div className="starter-weekly-drop-body px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
          {loading ? <p className="py-10 text-center text-sm text-zinc-400">Loading your drop…</p> : null}
          {error ? (
            <p className="py-6 text-center text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          {!loading && !error && payload ? (
            <>
              <div
                ref={heroWrapRef}
                className={`starter-weekly-drop-hero relative mx-auto aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-zinc-950 shadow-[0_12px_40px_rgba(0,0,0,0.35)] ${
                  revealed
                    ? 'starter-weekly-drop-hero-open border-orange-500/40 ring-2 ring-orange-500/30'
                    : 'border-zinc-700/80'
                }`}
              >
                {heroUrl ? (
                  <img src={heroUrl} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
                )}
                {!revealed ? (
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 touch-none cursor-pointer"
                    aria-label="Scratch to reveal your guide"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={onOpenGuide}
                    className="starter-weekly-drop-hero-open-btn absolute inset-0 z-10 cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400/70"
                    aria-label={`Open guide: ${title}`}
                  />
                )}
                {revealed ? (
                  <div className="starter-weekly-drop-hero-caption pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-3 pb-3 pt-12">
                    <p className="starter-weekly-drop-hero-title text-center text-base font-semibold text-[#fff] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95),0_2px_8px_rgba(0,0,0,0.75)]">
                      {title}
                    </p>
                  </div>
                ) : null}
              </div>

              <div
                className={`starter-weekly-drop-footer relative mt-4 shrink-0 ${
                  mayShowProCta ? 'h-[11.5rem]' : 'h-[3.25rem]'
                }`}
              >
                <button
                  type="button"
                  onClick={onTapReveal}
                  className={`starter-weekly-drop-skip absolute inset-x-0 top-0 w-full rounded-xl border border-zinc-700/80 bg-zinc-900/70 py-3 text-sm font-semibold text-zinc-200 touch-manipulation transition-colors hover:border-zinc-600 hover:bg-zinc-800/80 active:scale-[0.99] ${
                    revealed ? 'invisible pointer-events-none' : ''
                  }`}
                  tabIndex={revealed ? -1 : 0}
                  aria-hidden={revealed}
                >
                  Tap to reveal
                </button>

                {mayShowProCta ? (
                  <div
                    className={`absolute inset-x-0 top-0 ${
                      showProUpsell ? '' : 'invisible pointer-events-none'
                    }`}
                    aria-hidden={!showProUpsell}
                  >
                    {showProCta || proUpgradeCountLoading ? proUpsellCard : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
