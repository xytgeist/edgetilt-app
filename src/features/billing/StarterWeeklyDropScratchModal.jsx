import { useCallback, useEffect, useRef, useState } from 'react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { btnPrimary } from '../shell/shellClasses.js'
import { countStarterProUpgradeGuides } from '../guides/starterProUpgradeGuideCount.js'
import {
  fetchStarterWeeklyDropReveal,
  markStarterWeeklyDropScratched,
  navigateToGuideSlug,
} from './starterWeeklyDropApi.js'
import { ScratchRevealAudio } from './scratchRevealAudio.js'

const SCRATCH_BRUSH_RADIUS = 20
const SCRATCH_REVEAL_RATIO = 0.62
const SCRATCH_MIN_MS = 2500

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 */
function paintScratchFoil(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#c8cdd4')
  gradient.addColorStop(0.45, '#eef1f5')
  gradient.addColorStop(0.55, '#b8bec8')
  gradient.addColorStop(1, '#dfe3ea')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  for (let i = 0; i < 18; i += 1) {
    const x = Math.random() * width
    const y = Math.random() * height
    ctx.fillRect(x, y, 2, 14)
  }
}

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
    if (!open || !unlockId || !supabaseClient) {
      setPayload(null)
      setRevealed(false)
      setError('')
      setLoading(false)
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

  useEffect(() => {
    if (!open || !payload || revealed) return undefined

    const canvas = canvasRef.current
    const wrap = heroWrapRef.current
    if (!canvas || !wrap) return undefined

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const w = Math.max(1, Math.floor(rect.width))
      const h = Math.max(1, Math.floor(rect.height))
      canvas.width = w
      canvas.height = h
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      paintScratchFoil(ctx, w, h)
    }

    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(wrap)
    window.addEventListener('resize', resize)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [open, payload, revealed])

  const finishReveal = useCallback(async () => {
    if (revealed || !unlockId || !supabaseClient) return
    audioRef.current?.stop()
    setRevealed(true)
    await markStarterWeeklyDropScratched(supabaseClient, unlockId)
    onRevealed?.(unlockId)

    try {
      const { data: guides } = await supabaseClient
        .from('guides')
        .select('slug, published, machines ( slug, release_year )')
        .eq('published', true)
      setProUpgradeCount(
        countStarterProUpgradeGuides(guides || [], {
          ...guideAccessContext,
          starterUnlockedGuideSlugs: guideAccessContext.starterUnlockedGuideSlugs,
        }),
      )
    } catch {
      setProUpgradeCount(0)
    }
  }, [guideAccessContext, onRevealed, revealed, supabaseClient, unlockId])

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
            scratchStartedAtRef.current = Date.now()
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

          const ratio = sampleClearedRatio(canvas)
          const elapsed = Date.now() - (scratchStartedAtRef.current || Date.now())
          if (ratio >= SCRATCH_REVEAL_RATIO && elapsed >= SCRATCH_MIN_MS) {
            void finishReveal()
          }
        }
      }

      lastPointRef.current = { x, y }
    },
    [finishReveal, revealed, sampleClearedRatio],
  )

  const onPointerDown = (event) => {
    if (revealed || loading) return
    scratchingRef.current = true
    lastPointRef.current = null
    movementConfirmedRef.current = false
    canvasRef.current?.setPointerCapture?.(event.pointerId)
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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      style={{ zIndex: Z_APP_MODAL + 5 }}
      data-starter-weekly-drop-modal
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/80"
        aria-label="Close weekly drop"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="starter-weekly-drop-title"
        className="starter-weekly-drop-dialog relative z-10 w-full max-w-sm rounded-3xl border border-zinc-600/80 bg-gray-900 p-5 shadow-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="starter-weekly-drop-title" className="text-center text-lg font-bold text-white">
          {revealed ? 'You unlocked' : 'Weekly guide drop'}
        </h2>
        {!revealed ? (
          <p className="mt-2 text-center text-sm text-zinc-300">Scratch to reveal</p>
        ) : null}

        {loading ? <p className="mt-8 text-center text-sm text-zinc-400">Loading…</p> : null}
        {error ? (
          <p className="mt-4 text-center text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {!loading && !error && payload ? (
          <>
            <div
              ref={heroWrapRef}
              className="relative mx-auto mt-4 aspect-[4/3] w-full max-w-[280px] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950"
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
              ) : null}
              {revealed ? (
                <div className="starter-weekly-drop-hero-caption absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent px-3 pb-3 pt-12">
                  <p className="starter-weekly-drop-hero-title text-center text-base font-semibold text-[#fff] drop-shadow-[0_1px_2px_rgba(0,0,0,0.95),0_2px_8px_rgba(0,0,0,0.75)]">
                    {title}
                  </p>
                </div>
              ) : null}
            </div>

            {!revealed ? (
              <button
                type="button"
                onClick={onTapReveal}
                className="mt-4 w-full text-center text-sm text-orange-400 underline underline-offset-2 hover:text-orange-300"
              >
                Tap to reveal
              </button>
            ) : null}

            {revealed ? (
              <div className="mt-5 space-y-4">
                <button
                  type="button"
                  onClick={onOpenGuide}
                  className={`starter-weekly-drop-open-guide ${btnPrimary} w-full rounded-2xl bg-orange-600 hover:bg-orange-500`}
                >
                  Open guide
                </button>
                {showProCta ? (
                  <div className="starter-weekly-drop-pro-cta rounded-xl border border-zinc-700/80 bg-zinc-950/50 px-3 py-3 text-center">
                    <p className="text-[13px] leading-snug text-zinc-300">
                      Get immediate access to all{' '}
                      <span className="font-semibold text-white">{proUpgradeCount}</span> additional guides by
                      upgrading to Pro.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRequireSubscribe?.('slots-edge')}
                      className="mt-2 text-sm font-semibold text-orange-400 underline underline-offset-2 hover:text-orange-300"
                    >
                      View plans
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
