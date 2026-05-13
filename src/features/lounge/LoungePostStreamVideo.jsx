import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cfStreamManifestUrl, cfStreamPosterUrl } from '../../utils/loungeVideoUpload'
import { useLoungeFeedVideoAutoplay } from './LoungeFeedVideoAutoplayContext.jsx'

/** Keep in sync with `imgClassByVariant` in `LoungePostFeedMedia.jsx` (same caps; frame hugs aspect). */
const videoClassByVariant = {
  feed: 'block max-h-48 w-auto max-w-full h-auto object-contain sm:max-h-52',
  detail: 'block max-h-[min(70vh,520px)] w-auto max-w-full h-auto object-contain',
  embed: 'block max-h-40 w-auto max-w-full h-auto object-contain sm:max-h-44',
  composer: 'block max-h-40 w-auto max-w-full h-auto object-contain',
}

/** Match carousel slide width caps so video does not span the full row width like a banner. */
const slideMaxWByVariant = {
  feed: 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]',
  detail: 'max-w-full',
  embed: 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]',
  composer: 'max-w-[min(78vw,18rem)]',
}

const roundingByVariant = {
  feed: 'rounded-xl',
  detail: 'rounded-xl',
  embed: 'rounded-lg',
  composer: 'rounded-xl',
}

const borderByVariant = {
  feed: 'border-zinc-700/60',
  detail: 'border-zinc-700/60',
  embed: 'border-zinc-600/40',
  composer: 'border-zinc-700/60',
}

/** Feed/embed: attach HLS when a small fraction is visible (was 0.32 — felt slow). */
const LAZY_ATTACH_IO_THRESHOLD = 0.04
/** Prefetch into the scroll root so the winner can start loading before fully on screen. */
const LAZY_ATTACH_ROOT_MARGIN = '180px 0px 240px 0px'

/**
 * @param {React.RefObject<HTMLVideoElement | null>} videoRef
 * @param {string} src manifest URL
 * @param {number} [attachKey] bump to force re-attach after a recoverable failure
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true] when false, detach (feed: off-screen)
 * @param {boolean} [opts.feedStyleAbr=false] conservative ABR for small tiles / composer
 * @param {React.MutableRefObject<number> | null} [opts.recoveryBurstRef] auto-reattach budget (shared with `<video onError>`)
 * @param {(() => void) | null} [opts.onAutoReattach] bump attachKey after built-in Hls recovery fails
 */
function useStreamHlsAttachment(videoRef, src, attachKey = 0, opts = {}) {
  const {
    enabled = true,
    feedStyleAbr = false,
    recoveryBurstRef = null,
    onAutoReattach = null,
  } = opts

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return undefined

    const cleanupVideo = () => {
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        // ignore
      }
    }

    if (!enabled) {
      cleanupVideo()
      return undefined
    }

    let cancelled = false
    let hlsInstance = null
    /** @type {((event: string, data: unknown) => void) | null} */
    let hlsErrorHandler = null

    const onRecovered = () => {
      if (recoveryBurstRef) recoveryBurstRef.current = 0
    }
    video.addEventListener('canplay', onRecovered, { once: true })

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return () => {
        cancelled = true
        video.removeEventListener('canplay', onRecovered)
        cleanupVideo()
      }
    }

    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled || !videoRef.current || videoRef.current !== video) return
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: feedStyleAbr ? 28 : 45,
            maxMaxBufferLength: feedStyleAbr ? 90 : 120,
            lowLatencyMode: false,
            ...(feedStyleAbr ? { startLevel: 0, capLevelToPlayerSize: true } : {}),
          })
          hlsInstance = hls
          let didMediaRecover = false
          let didNetRestart = false
          hlsErrorHandler = (_event, data) => {
            if (!data?.fatal || cancelled) return
            try {
              if (data.type === 'networkError' && !didNetRestart) {
                didNetRestart = true
                hls.startLoad()
                return
              }
              if (data.type === 'mediaError' && !didMediaRecover) {
                didMediaRecover = true
                hls.recoverMediaError()
                return
              }
              const ref = recoveryBurstRef
              if (ref && ref.current < 2 && onAutoReattach) {
                ref.current += 1
                queueMicrotask(() => onAutoReattach())
                return
              }
            } catch {
              // ignore
            }
          }
          hls.on(Hls.Events.ERROR, hlsErrorHandler)
          if (feedStyleAbr) {
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (cancelled || !hls.levels?.length) return
              let cap = hls.levels.length - 1
              for (let i = hls.levels.length - 1; i >= 0; i -= 1) {
                const h = hls.levels[i]?.height
                if (h && h <= 720) {
                  cap = i
                  break
                }
              }
              try {
                hls.autoLevelCapping = cap
              } catch {
                // ignore
              }
            })
          }
          hls.loadSource(src)
          hls.attachMedia(video)
        } else {
          video.src = src
        }
      })
      .catch(() => {
        if (!cancelled && videoRef.current === video) {
          video.src = src
        }
      })

    return () => {
      cancelled = true
      video.removeEventListener('canplay', onRecovered)
      if (hlsInstance) {
        try {
          hlsInstance.destroy()
        } catch {
          // ignore
        }
        hlsInstance = null
      }
      cleanupVideo()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit videoRef; opts refs stable
  }, [src, attachKey, enabled, feedStyleAbr, onAutoReattach, recoveryBurstRef])
}

function LoungeStreamVideoLightbox({ uid, onClose }) {
  const videoRef = useRef(null)
  const recoveryBurstRef = useRef(0)
  const [attachKey, setAttachKey] = useState(0)
  const [showLoadRetry, setShowLoadRetry] = useState(false)
  const id = String(uid || '').trim()
  const src = cfStreamManifestUrl(id)
  const poster = cfStreamPosterUrl(id, 720)
  const bumpAttach = useCallback(() => setAttachKey((k) => k + 1), [])
  useStreamHlsAttachment(videoRef, id ? src : '', attachKey, {
    enabled: Boolean(id),
    feedStyleAbr: false,
    recoveryBurstRef,
    onAutoReattach: bumpAttach,
  })

  useEffect(() => {
    if (!id) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [id, onClose])

  /** Prefer sound in full screen once media can play; fall back to muted if unmuted autoplay is blocked. */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return undefined
    const go = () => {
      try {
        v.muted = false
        const p = v.play()
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            try {
              v.muted = true
              void v.play()
            } catch {
              // ignore
            }
          })
        }
      } catch {
        // ignore
      }
    }
    if (v.readyState >= 2) {
      go()
      return undefined
    }
    v.addEventListener('canplay', go, { once: true })
    return () => v.removeEventListener('canplay', go)
  }, [id, attachKey])

  if (!id) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/75 backdrop-blur-[2px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="Full screen video"
      onClick={onClose}
    >
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="touch-manipulation rounded-lg border border-zinc-600/80 bg-zinc-900/80 px-3 py-1.5 text-[14px] font-semibold text-zinc-200 hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
        >
          Close
        </button>
      </div>
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <video
          ref={videoRef}
          className="max-h-full max-w-full object-contain"
          controls
          playsInline
          controlsList="nodownload"
          poster={poster}
          preload="auto"
          aria-label="Post video (full screen)"
          onError={() => {
            if (recoveryBurstRef.current < 2) {
              recoveryBurstRef.current += 1
              setShowLoadRetry(false)
              setAttachKey((k) => k + 1)
              return
            }
            setShowLoadRetry(true)
          }}
        />
      </div>
      {showLoadRetry ? (
        <div className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[1] flex -translate-x-1/2 flex-col items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/90 px-4 py-2 text-center text-[13px] text-zinc-200 shadow-lg">
          <span>Could not load this video.</span>
          <button
            type="button"
            className="touch-manipulation rounded-lg bg-cyan-600 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-cyan-500"
            onClick={() => {
              recoveryBurstRef.current = 0
              setShowLoadRetry(false)
              setAttachKey((k) => k + 1)
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

function MutedGlyph({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11 5L6 9H2v6h4l5 4V5zM19 9l-6 6M13 9l6 6"
      />
    </svg>
  )
}

/**
 * Cloudflare Stream playback (adaptive HLS). `uid` is the Stream asset id from `stream_video_uid`.
 *
 * Feed-style (when `enableLightbox` and not composer): muted autoplay while scrolled into view; no inline
 * controls. Tap the video for full screen; a wide bottom band unmutes in the feed (falls back to full screen if blocked).
 *
 * @param {import('react').RefObject<HTMLElement | null>} [visibilityResetRootRef] — Optional scroll root for in-view
 *   checks; when omitted, intersection uses the viewport (still correct when the feed scrolls inside the window).
 * @param {string} [feedAutoplayClientId] — When inside `LoungeFeedVideoAutoplayProvider`, only the mid-scroll winner attaches/plays.
 */
export default function LoungePostStreamVideo({
  uid,
  variant = 'feed',
  firstMarginTopClass = 'mt-2',
  enableLightbox = true,
  visibilityResetRootRef,
  feedAutoplayClientId,
}) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const inViewRef = useRef(false)
  const lightboxOpenRef = useRef(false)
  const isWinnerRef = useRef(false)
  const recoveryBurstRef = useRef(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [streamAttachKey, setStreamAttachKey] = useState(0)
  const [showStreamRetry, setShowStreamRetry] = useState(false)
  const [streamInView, setStreamInView] = useState(false)
  const id = String(uid || '').trim()
  const src = cfStreamManifestUrl(id)
  const poster = cfStreamPosterUrl(id, 720)
  const getVideoContainer = useCallback(() => containerRef.current, [])
  const { coordinatorActive, isWinner, scheduleRecompute } = useLoungeFeedVideoAutoplay(
    feedAutoplayClientId,
    getVideoContainer,
  )
  const showOpen = enableLightbox && variant !== 'composer'
  const lazyStream = showOpen && (variant === 'feed' || variant === 'embed')
  const feedStyleAbr = variant === 'feed' || variant === 'embed' || variant === 'composer'
  const attachStream = lazyStream ? streamInView && (!coordinatorActive || isWinner) : true

  useEffect(() => {
    isWinnerRef.current = !coordinatorActive || isWinner
  }, [coordinatorActive, isWinner])

  useEffect(() => {
    if (!streamInView && lazyStream) recoveryBurstRef.current = 0
  }, [streamInView, lazyStream])

  const bumpStreamAttach = useCallback(() => {
    setStreamAttachKey((k) => k + 1)
  }, [])

  useStreamHlsAttachment(videoRef, src, streamAttachKey, {
    enabled: attachStream,
    feedStyleAbr,
    recoveryBurstRef,
    onAutoReattach: bumpStreamAttach,
  })

  const openLightbox = useCallback(() => {
    try {
      videoRef.current?.pause()
    } catch {
      // ignore
    }
    setLightboxOpen(true)
  }, [])

  /** User gesture on a dedicated hit target; try sound in-feed before falling back to full screen. */
  const tryUnmuteInlineOrOpenLightbox = useCallback(() => {
    const v = videoRef.current
    if (!v) {
      openLightbox()
      return
    }
    try {
      v.muted = false
      const p = v.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          try {
            v.muted = true
          } catch {
            // ignore
          }
          openLightbox()
        })
      }
    } catch {
      openLightbox()
    }
  }, [openLightbox])

  useEffect(() => {
    lightboxOpenRef.current = lightboxOpen
  }, [lightboxOpen])

  /** Muted autoplay while sufficiently visible (X-style feed). Feed/embed: defer HLS until in view. */
  useEffect(() => {
    const wrap = containerRef.current
    const v = videoRef.current
    if (!wrap || !v || !showOpen || !id) return undefined

    const applyIo = (entries) => {
      const e = entries[0]
      const ratio = typeof e?.intersectionRatio === 'number' ? e.intersectionRatio : 0
      const attachOk = Boolean(e?.isIntersecting && (ratio >= LAZY_ATTACH_IO_THRESHOLD || ratio === 1))
      inViewRef.current = attachOk
      if (lazyStream) setStreamInView(attachOk)
      const won = isWinnerRef.current
      if (!attachOk || !won) {
        try {
          v.pause()
        } catch {
          // ignore
        }
      }
      queueMicrotask(() => scheduleRecompute())
      if (!attachOk || !won) return
      if (lightboxOpenRef.current) return
      if (lazyStream) return
      try {
        v.muted = true
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        // ignore
      }
    }

    const root = visibilityResetRootRef?.current ?? null
    let io
    try {
      io = new IntersectionObserver(applyIo, {
        root,
        rootMargin: lazyStream ? LAZY_ATTACH_ROOT_MARGIN : '0px',
        threshold: [0, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.65, 0.8, 1],
      })
    } catch {
      io = new IntersectionObserver(applyIo, {
        root: null,
        rootMargin: lazyStream ? LAZY_ATTACH_ROOT_MARGIN : '0px',
        threshold: [0, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.65, 0.8, 1],
      })
    }
    io.observe(wrap)
    return () => io.disconnect()
  }, [id, showOpen, lazyStream, visibilityResetRootRef, streamAttachKey, scheduleRecompute])

  /** After lazy HLS attach (feed/embed), start muted autoplay once media is ready. */
  useEffect(() => {
    if (!lazyStream || !attachStream) return undefined
    if (!showOpen) return undefined
    if (!inViewRef.current || lightboxOpenRef.current) return undefined
    if (coordinatorActive && !isWinner) return undefined
    const v = videoRef.current
    if (!v) return undefined
    let cleaned = false
    const go = () => {
      try {
        v.muted = true
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        // ignore
      }
    }
    if (v.readyState >= 2) {
      go()
      return undefined
    }
    const onEarly = () => {
      if (cleaned) return
      cleaned = true
      v.removeEventListener('loadeddata', onEarly)
      v.removeEventListener('canplay', onEarly)
      go()
    }
    v.addEventListener('loadeddata', onEarly)
    v.addEventListener('canplay', onEarly)
    return () => {
      cleaned = true
      v.removeEventListener('loadeddata', onEarly)
      v.removeEventListener('canplay', onEarly)
    }
  }, [lazyStream, attachStream, showOpen, streamAttachKey, lightboxOpen, coordinatorActive, isWinner])

  /** After closing lightbox, resume muted autoplay if still in view. */
  useEffect(() => {
    if (lightboxOpen) return
    const v = videoRef.current
    if (!v || !showOpen) return
    if (!inViewRef.current) return
    if (coordinatorActive && !isWinner) {
      try {
        v.pause()
      } catch {
        // ignore
      }
      return
    }
    try {
      v.muted = true
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      // ignore
    }
  }, [lightboxOpen, showOpen, coordinatorActive, isWinner])

  /** Coordinator handoff: pause immediately when another tile wins mid-scroll. */
  useEffect(() => {
    if (!coordinatorActive || !lazyStream) return
    const v = videoRef.current
    if (!v) return
    if (!isWinner) {
      try {
        v.pause()
      } catch {
        // ignore
      }
    }
  }, [coordinatorActive, lazyStream, isWinner])

  if (!id) return null

  const videoClass = videoClassByVariant[variant] || videoClassByVariant.feed
  const slideMaxW = slideMaxWByVariant[variant] || slideMaxWByVariant.feed
  const rounding = roundingByVariant[variant] || roundingByVariant.feed
  const border = borderByVariant[variant] || borderByVariant.feed

  return (
    <div className={`${firstMarginTopClass} w-full min-w-0`}>
      <div className={`inline-block max-w-full ${slideMaxW}`}>
        <div
          ref={containerRef}
          role="button"
          tabIndex={0}
          data-lounge-video-zoom
          className={`relative inline-block max-w-full cursor-pointer overflow-hidden ${rounding} border ${border} bg-black touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50`}
          aria-label={
            showOpen
              ? 'Post video, playing muted in feed. Tap the video for full screen. Use the bottom control for sound in the feed.'
              : 'Post video'
          }
          title={showOpen ? 'Tap video for full screen; bottom area for sound' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            if (showOpen) openLightbox()
          }}
          onKeyDown={(e) => {
            if (!showOpen) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              openLightbox()
            }
          }}
        >
          <video
            ref={videoRef}
            className={`pointer-events-none ${videoClass}`}
            muted
            loop
            playsInline
            preload={variant === 'composer' ? 'auto' : 'metadata'}
            poster={poster}
            aria-hidden
            onError={() => {
              if (recoveryBurstRef.current < 2) {
                recoveryBurstRef.current += 1
                setShowStreamRetry(false)
                setStreamAttachKey((k) => k + 1)
                return
              }
              setShowStreamRetry(true)
            }}
          />
          {showStreamRetry ? (
            <div
              className="pointer-events-auto absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-black/55 px-3 text-center text-[12px] font-medium text-zinc-100"
              onClick={(e) => e.stopPropagation()}
              role="presentation"
            >
              <span>Could not load video.</span>
              <button
                type="button"
                className="touch-manipulation rounded-lg bg-cyan-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-cyan-500"
                onClick={(e) => {
                  e.stopPropagation()
                  recoveryBurstRef.current = 0
                  setShowStreamRetry(false)
                  setStreamAttachKey((k) => k + 1)
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {showOpen && !showStreamRetry ? (
            <button
              type="button"
              aria-label="Play video with sound in the feed"
              className="absolute bottom-0 left-0 right-0 z-[1] flex min-h-[5.25rem] items-end justify-start bg-gradient-to-t from-black/75 via-black/30 to-transparent px-2 pb-2.5 pt-10 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
              onClick={(e) => {
                e.stopPropagation()
                tryUnmuteInlineOrOpenLightbox()
              }}
            >
              <span className="pointer-events-none flex max-w-full items-center gap-1.5 rounded-md bg-black/55 px-2 py-1.5 text-[11px] font-medium text-zinc-200 sm:px-2.5 sm:py-2 sm:text-[12px]">
                <MutedGlyph className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
                <span className="max-w-[min(12rem,72vw)] truncate">Tap for sound</span>
              </span>
            </button>
          ) : null}
        </div>
      </div>
      {lightboxOpen ? (
        <LoungeStreamVideoLightbox
          uid={id}
          onClose={() => {
            setLightboxOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
