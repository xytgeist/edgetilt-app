import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cfStreamManifestUrl, cfStreamPosterUrl } from '../../utils/loungeVideoUpload'
import { useLoungeFeedVideoAutoplay } from './LoungeFeedVideoAutoplayContext.jsx'
import { mergeLightboxDismissOnQuoteRepost } from './loungeLightboxFooterDismissQuote.js'
import { releaseLoungeStreamSessionPoster } from './loungeStreamSessionPoster.js'
import { notifyLoungeStreamLightboxOpen } from './loungeStreamLightboxRegistry.js'
import { useLoungeLightboxSwipeDismiss } from './loungeLightboxSwipeDismiss.js'

/** Keep in sync with `imgClassByVariant` in `LoungePostFeedMedia.jsx` (same caps; media sets frame width via w-auto). */
const videoClassByVariant = {
  feed: 'block max-h-[312px] w-auto max-w-full h-auto object-contain',
  detail: 'block max-h-[min(70vh,520px)] w-auto max-w-full h-auto object-contain',
  commentInline: 'block max-h-36 w-auto max-w-full h-auto object-contain sm:max-h-40',
  embed: 'block max-h-40 w-auto max-w-full h-auto object-contain sm:max-h-44',
  composer: 'block max-h-40 w-auto max-w-full h-auto object-contain',
}

/** Max width cap only; outer wrapper is `inline-flex w-fit` so the frame hugs the video/poster aspect. */
const slideMaxWByVariant = {
  feed: 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]',
  detail: 'max-w-full',
  commentInline: 'max-w-full',
  embed: 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]',
  composer: 'max-w-[min(78vw,18rem)]',
}

const roundingByVariant = {
  feed: 'rounded-xl',
  detail: 'rounded-xl',
  commentInline: 'rounded-xl',
  embed: 'rounded-lg',
  composer: 'rounded-xl',
}

const borderByVariant = {
  feed: 'border-zinc-700/60',
  detail: 'border-zinc-700/60',
  commentInline: 'border-zinc-700/50',
  embed: 'border-zinc-600/40',
  composer: 'border-zinc-700/60',
}

/** Poster `<img>` can be 0×0 before decode; keep a floor so the tile (and absolute `<video>`) never collapses. */
const posterFrameMinHByVariant = {
  feed: 'min-h-[min(48vw,19.5rem)] sm:min-h-[19.5rem]',
  embed: 'min-h-[min(36vw,12rem)] sm:min-h-[13rem]',
  detail: 'min-h-[min(32vw,11rem)] sm:min-h-[15rem]',
  commentInline: 'min-h-[min(24vw,7rem)] sm:min-h-[8rem]',
  composer: 'min-h-[8rem]',
}

/**
 * When CF thumbnail never loads: flex box caps height/width so the inline `<video>` can size to intrinsic
 * aspect (avoids a forced 16:9 “letterbox” that looks like a broken poster for portrait clips).
 */
const posterFallbackFrameClassByVariant = {
  feed: 'relative flex max-h-[312px] w-fit max-w-[min(88vw,20rem)] items-center justify-center bg-black sm:max-w-[min(72vw,17rem)]',
  embed: 'relative flex max-h-44 w-fit max-w-[min(88vw,20rem)] items-center justify-center bg-black sm:max-h-44 sm:max-w-[min(72vw,17rem)]',
  detail: 'relative flex max-h-[min(70vh,520px)] w-fit max-w-full items-center justify-center bg-black',
  commentInline:
    'relative flex max-h-36 w-fit max-w-full items-center justify-center bg-black sm:max-h-40',
  composer: 'relative flex max-h-40 w-fit max-w-[min(78vw,18rem)] items-center justify-center bg-black',
}

/** CF `thumbnail.jpg` is often 404 until processing finishes — retry with cache-bust before giving up. */
const CF_POSTER_RETRY_MAX = 32

/** Feed/embed: attach HLS when a small fraction is visible (was 0.32 — felt slow). */
const LAZY_ATTACH_IO_THRESHOLD = 0.04
/** Prefetch into the scroll root so the winner can start loading before fully on screen. */
const LAZY_ATTACH_ROOT_MARGIN = '180px 0px 240px 0px'

/** Poster → first-frame crossfade when inline Stream attaches (iOS handoff). */
const STREAM_ATTACH_FADE_MS = 220
/** Hold poster visible briefly so the first decoded frame is not a black blend with fading video. */
const STREAM_POSTER_FADE_DELAY_MS = 72
/** If decode signals never fire, still unstick poster→video crossfade (rare HLS/Safari quirks). Intentionally long so we do not beat real decode and flash black. */
const STREAM_FADE_LAST_RESORT_MS = 6500

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

function LoungeStreamVideoLightbox({ uid, onClose, footer, lightboxPortalClass = 'z-[100]' }) {
  const { swipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose,
    allowSwipeOnVideo: true,
    className: 'relative flex min-h-0 flex-1 flex-col',
  })
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
      className={`fixed inset-0 ${lightboxPortalClass} flex flex-col bg-black p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
      role="dialog"
      aria-modal="true"
      aria-label="Full screen video"
      onClick={onClose}
    >
      <div className="flex shrink-0 justify-end" data-lounge-lightbox-no-swipe>
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
      <div onClick={(e) => e.stopPropagation()} {...swipeSurfaceProps}>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
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
      {footer ? (
        <div
          className="shrink-0 border-t border-zinc-700/50 bg-black px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
      </div>
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

/** Same speaker cone as `MutedGlyph`, with waves (pairs with “Tap to mute”). */
function SoundOnGlyph({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5L6 9H2v6h4l5 4V5z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 9.5c3 2 3 3 0 5M16.5 7c4.5 3.2 4.5 6.8 0 10" />
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
 * @param {string} [sessionPosterUrl] — Optional `blob:` JPEG from composer; shown until CF `thumbnail.jpg` loads (same-tab session pin).
 * @param {string} [persistedStreamPosterUrl] — Public `lounge-feed` poster URL from DB (cross-device stable tile).
 * @param {number} [streamVideoDisplayWidth] — Display width from DB for CSS `aspect-ratio` when set with height.
 * @param {number} [streamVideoDisplayHeight] — Display height from DB for CSS `aspect-ratio` when set with width.
 * @param {import('react').ReactNode} [mediaLightboxFooter] — Interaction bar etc. below full-screen video.
 */
export default function LoungePostStreamVideo({
  uid,
  variant = 'feed',
  firstMarginTopClass = 'mt-2',
  enableLightbox = true,
  visibilityResetRootRef,
  feedAutoplayClientId,
  sessionPosterUrl: sessionPosterUrlProp = '',
  persistedStreamPosterUrl: persistedStreamPosterUrlProp = '',
  streamVideoDisplayWidth: streamDisplayWProp,
  streamVideoDisplayHeight: streamDisplayHProp,
  mediaLightboxFooter,
  lightboxPortalClass = 'z-[100]',
}) {
  const sessionPosterUrl = String(sessionPosterUrlProp || '').trim()
  const persistedPosterTrim = useMemo(
    () => String(persistedStreamPosterUrlProp || '').trim(),
    [persistedStreamPosterUrlProp],
  )
  const hasPersistedPoster = /^https?:\/\//i.test(persistedPosterTrim)

  const displayW = Number(streamDisplayWProp)
  const displayH = Number(streamDisplayHProp)
  const hasDisplayDims =
    Number.isFinite(displayW) && Number.isFinite(displayH) && displayW >= 2 && displayH >= 2
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const inViewRef = useRef(false)
  const lightboxOpenRef = useRef(false)
  const isWinnerRef = useRef(false)
  const recoveryBurstRef = useRef(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const mediaLightboxFooterMerged = useMemo(
    () => mergeLightboxDismissOnQuoteRepost(mediaLightboxFooter, () => setLightboxOpen(false)),
    [mediaLightboxFooter, setLightboxOpen],
  )
  const [streamAttachKey, setStreamAttachKey] = useState(0)
  const [showStreamRetry, setShowStreamRetry] = useState(false)
  const [streamInView, setStreamInView] = useState(false)
  /** After `playing` (or timeout): fade video in over poster; poster stays in-flow for layout (avoids Safari default video width flash). */
  const [streamFadeShowVideo, setStreamFadeShowVideo] = useState(false)
  /** In-flow poster can collapse to a broken-icon size when CF thumbnail 404s or is not ready yet. */
  const [posterLayoutFailed, setPosterLayoutFailed] = useState(false)
  /** True after CF poster `<img>` fires `onLoad` — drop min-height floor so the frame hugs decoded pixels. */
  const [posterDecodeOk, setPosterDecodeOk] = useState(false)
  /** Bumped to bust CDN cache while CF thumbnail is still generating. */
  const [posterBust, setPosterBust] = useState(0)
  /** When false, in-flow `<img>` uses `sessionPosterUrl` (stable layout); CF loads off-DOM until true. */
  const [cfPosterActive, setCfPosterActive] = useState(() => {
    const p = String(persistedStreamPosterUrlProp || '').trim()
    if (/^https?:\/\//i.test(p)) return true
    return !String(sessionPosterUrlProp || '').trim()
  })
  const posterRetryTimerRef = useRef(0)
  const posterAttemptRef = useRef(0)
  const id = String(uid || '').trim()
  const src = cfStreamManifestUrl(id)
  const poster = cfStreamPosterUrl(id, 720)
  const posterDisplayUrl = useMemo(() => {
    if (!poster) return ''
    const sep = poster.includes('?') ? '&' : '?'
    return `${poster}${sep}_pv=${posterBust}`
  }, [poster, posterBust])

  const visiblePosterSrc = useMemo(() => {
    if (hasPersistedPoster) return persistedPosterTrim
    if (!cfPosterActive && sessionPosterUrl) return sessionPosterUrl
    return posterDisplayUrl
  }, [hasPersistedPoster, persistedPosterTrim, cfPosterActive, sessionPosterUrl, posterDisplayUrl])

  const showOpen = enableLightbox && variant !== 'composer'
  /** Mid-scroll winner + lazy HLS when registered with `LoungeFeedVideoAutoplayProvider` (feed, embed, post-detail comments). */
  const lazyStream = showOpen && Boolean(feedAutoplayClientId)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setPosterLayoutFailed(false)
      setPosterDecodeOk(false)
      setPosterBust(0)
      posterAttemptRef.current = 0
      window.clearTimeout(posterRetryTimerRef.current)
      posterRetryTimerRef.current = 0
      setCfPosterActive(hasPersistedPoster || !sessionPosterUrl)
    })
    return () => {
      cancelled = true
    }
  }, [id, sessionPosterUrl, hasPersistedPoster])

  /** Off-DOM CF thumbnail fetch while the visible `<img>` still shows the session `blob:` poster. */
  useEffect(() => {
    if (hasPersistedPoster || !sessionPosterUrl || !id || !poster) return undefined
    let cancelled = false
    let attempt = 0
    let bust = 0
    let timer = 0

    const bustUrl = () => {
      const base = cfStreamPosterUrl(id, 720)
      const sep = base.includes('?') ? '&' : '?'
      return `${base}${sep}_pv=${bust}`
    }

    const arm = () => {
      if (cancelled) return
      const im = new Image()
      im.onload = () => {
        if (cancelled) return
        setPosterBust(bust)
        setPosterDecodeOk(false)
        setPosterLayoutFailed(false)
        posterAttemptRef.current = 0
        setCfPosterActive(true)
        queueMicrotask(() => releaseLoungeStreamSessionPoster(id))
      }
      im.onerror = () => {
        if (cancelled) return
        attempt += 1
        if (attempt > CF_POSTER_RETRY_MAX) return
        bust += 1
        const delay = Math.min(2200, 140 + attempt * 95)
        timer = window.setTimeout(arm, delay)
      }
      im.src = bustUrl()
    }

    arm()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [id, poster, sessionPosterUrl, hasPersistedPoster])

  useEffect(() => {
    if (!hasPersistedPoster || !id) return undefined
    queueMicrotask(() => releaseLoungeStreamSessionPoster(id))
    return undefined
  }, [hasPersistedPoster, id])
  const onPosterImgError = useCallback(() => {
    if (!cfPosterActive) {
      setCfPosterActive(true)
      return
    }
    posterAttemptRef.current += 1
    if (posterAttemptRef.current > CF_POSTER_RETRY_MAX) {
      setPosterLayoutFailed(true)
      return
    }
    window.clearTimeout(posterRetryTimerRef.current)
    const delay = Math.min(2200, 140 + posterAttemptRef.current * 95)
    posterRetryTimerRef.current = window.setTimeout(() => {
      posterRetryTimerRef.current = 0
      setPosterBust((b) => b + 1)
    }, delay)
  }, [cfPosterActive])

  useEffect(
    () => () => {
      window.clearTimeout(posterRetryTimerRef.current)
      posterRetryTimerRef.current = 0
    },
    [],
  )

  const getVideoContainer = useCallback(() => containerRef.current, [])
  const {
    coordinatorActive,
    isWinner,
    scheduleRecompute,
    feedInlineSoundUnmuted,
    toggleFeedInlineSound,
  } = useLoungeFeedVideoAutoplay(feedAutoplayClientId, getVideoContainer)
  /** Inside `LoungeFeedVideoAutoplayProvider` with a client id: one shared “Tap for sound” for the scroll surface. */
  const coordinatedInlineSound = coordinatorActive
  const [localStripSoundUnmuted, setLocalStripSoundUnmuted] = useState(false)
  const stripSoundUnmuted = coordinatedInlineSound ? feedInlineSoundUnmuted : localStripSoundUnmuted
  const inlineSoundScopeLabel =
    variant === 'feed' || variant === 'embed' ? 'the feed' : 'this screen'
  const feedStyleAbr =
    variant === 'feed' || variant === 'embed' || variant === 'composer' || variant === 'commentInline'
  /** Coordinator can name a winner before IntersectionObserver fires; attach on winner alone (IO still gates pause for non-coordinator). */
  const attachStream = lazyStream ? (coordinatorActive ? isWinner : streamInView) : true

  useEffect(() => {
    isWinnerRef.current = !coordinatorActive || isWinner
  }, [coordinatorActive, isWinner])

  /** Keep inline `<video>` muted in sync with shared provider sound (all registered tiles; winner may be playing). */
  useEffect(() => {
    if (!coordinatedInlineSound) return
    const v = videoRef.current
    if (!v || lightboxOpenRef.current) return
    try {
      v.muted = !feedInlineSoundUnmuted
      if (feedInlineSoundUnmuted && attachStream) {
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      }
    } catch {
      // ignore
    }
  }, [coordinatedInlineSound, attachStream, feedInlineSoundUnmuted, streamAttachKey, isWinner])

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

  /** Fade HLS over CF thumbnail once playing (all variants with poster frame; when not `attachStream`, keep video hidden). */
  useEffect(() => {
    if (!poster) return undefined
    let cleaned = false
    let disarm = () => {}
    let rafId = 0

    queueMicrotask(() => {
      if (cleaned) return
      if (!attachStream) {
        setStreamFadeShowVideo(false)
        return
      }
      setStreamFadeShowVideo(false)

      const arm = () => {
        const v = videoRef.current
        if (!v) {
          const tid = window.setTimeout(() => {
            if (!cleaned) setStreamFadeShowVideo(true)
          }, 800)
          disarm = () => window.clearTimeout(tid)
          return
        }
        const reveal = () => {
          if (cleaned) return
          const el = videoRef.current
          if (!el) {
            queueMicrotask(() => setStreamFadeShowVideo(true))
            return
          }
          const run = () => {
            if (cleaned) return
            requestAnimationFrame(() => {
              if (cleaned) return
              requestAnimationFrame(() => {
                if (cleaned) return
                setStreamFadeShowVideo(true)
              })
            })
          }
          if (typeof el.requestVideoFrameCallback === 'function') {
            try {
              el.requestVideoFrameCallback(() => {
                if (cleaned) return
                run()
              })
            } catch {
              run()
            }
          } else {
            run()
          }
        }
        const onPlaying = () => reveal()
        const onTime = () => {
          if (cleaned || !videoRef.current || videoRef.current.currentTime <= 0) return
          videoRef.current.removeEventListener('timeupdate', onTime)
          reveal()
        }
        /** Only fade poster away once the stream can paint pixels; bare timeout was hiding poster over a black HLS layer. */
        const revealIfDecoded = () => {
          if (cleaned) return
          const el = videoRef.current
          if (
            el &&
            (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ||
              (el.readyState >= HTMLMediaElement.HAVE_METADATA && el.currentTime > 0))
          ) {
            reveal()
          }
        }
        if (!v.paused && v.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          reveal()
        } else {
          v.addEventListener('playing', onPlaying, { once: true })
          v.addEventListener('timeupdate', onTime)
        }
        const tid = window.setTimeout(revealIfDecoded, 900)
        const tid2 = window.setTimeout(revealIfDecoded, 2400)
        /** Original ~800ms timer also prevented a stuck fade (poster forever, video opacity-0) when events never ran. */
        const tidLastResort = window.setTimeout(() => {
          if (cleaned) return
          reveal()
        }, STREAM_FADE_LAST_RESORT_MS)
        disarm = () => {
          v.removeEventListener('playing', onPlaying)
          v.removeEventListener('timeupdate', onTime)
          window.clearTimeout(tid)
          window.clearTimeout(tid2)
          window.clearTimeout(tidLastResort)
        }
      }

      rafId = requestAnimationFrame(() => {
        if (cleaned) return
        arm()
      })
    })

    return () => {
      cleaned = true
      cancelAnimationFrame(rafId)
      disarm()
    }
  }, [attachStream, poster, id, streamAttachKey])

  const openLightbox = useCallback(() => {
    try {
      videoRef.current?.pause()
    } catch {
      // ignore
    }
    setLightboxOpen(true)
  }, [])

  /** Bottom strip: coordinated tiles share provider mute; others toggle this tile only. */
  const onSoundStripPress = useCallback(() => {
    if (coordinatedInlineSound) {
      const turningOn = !feedInlineSoundUnmuted
      toggleFeedInlineSound()
      if (turningOn && attachStream) {
        const v = videoRef.current
        if (!v) return
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
              toggleFeedInlineSound()
              openLightbox()
            })
          }
        } catch {
          toggleFeedInlineSound()
          openLightbox()
        }
      }
      return
    }
    const v = videoRef.current
    if (localStripSoundUnmuted) {
      try {
        if (v) v.muted = true
      } catch {
        // ignore
      }
      setLocalStripSoundUnmuted(false)
      return
    }
    if (!v) {
      openLightbox()
      return
    }
    try {
      v.muted = false
      const p = v.play()
      if (p && typeof p.then === 'function') {
        p
          .then(() => setLocalStripSoundUnmuted(true))
          .catch(() => {
            try {
              v.muted = true
            } catch {
              // ignore
            }
            openLightbox()
          })
      } else {
        setLocalStripSoundUnmuted(true)
      }
    } catch {
      openLightbox()
    }
  }, [
    coordinatedInlineSound,
    feedInlineSoundUnmuted,
    localStripSoundUnmuted,
    attachStream,
    openLightbox,
    toggleFeedInlineSound,
  ])

  useEffect(() => {
    lightboxOpenRef.current = lightboxOpen
  }, [lightboxOpen])

  useEffect(() => {
    if (!lightboxOpen || !enableLightbox) return undefined
    notifyLoungeStreamLightboxOpen(true)
    return () => notifyLoungeStreamLightboxOpen(false)
  }, [lightboxOpen, enableLightbox])

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
      if (!won) {
        try {
          v.pause()
        } catch {
          // ignore
        }
      } else if (!attachOk && !coordinatorActive) {
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
        v.muted = !localStripSoundUnmuted
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
  }, [
    id,
    showOpen,
    lazyStream,
    visibilityResetRootRef,
    streamAttachKey,
    scheduleRecompute,
    localStripSoundUnmuted,
    coordinatorActive,
  ])

  /** After lazy HLS attach (feed/embed), start muted autoplay once media is ready. */
  useEffect(() => {
    if (!lazyStream || !attachStream) return undefined
    if (!showOpen) return undefined
    if ((!inViewRef.current && !(coordinatorActive && isWinner)) || lightboxOpenRef.current)
      return undefined
    if (coordinatorActive && !isWinner) return undefined
    const v = videoRef.current
    if (!v) return undefined
    let cleaned = false
    const go = () => {
      try {
        v.muted = coordinatedInlineSound ? !feedInlineSoundUnmuted : true
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
  }, [
    lazyStream,
    attachStream,
    showOpen,
    streamAttachKey,
    lightboxOpen,
    coordinatorActive,
    isWinner,
    coordinatedInlineSound,
    feedInlineSoundUnmuted,
  ])

  /** After closing lightbox, resume muted autoplay if still in view. */
  useEffect(() => {
    if (lightboxOpen) return
    const v = videoRef.current
    if (!v || !showOpen) return
    if (!inViewRef.current && !(coordinatorActive && isWinner)) return
    if (coordinatorActive && !isWinner) {
      try {
        v.pause()
      } catch {
        // ignore
      }
      return
    }
    try {
      v.muted = coordinatedInlineSound ? !feedInlineSoundUnmuted : !localStripSoundUnmuted
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      // ignore
    }
  }, [
    lightboxOpen,
    showOpen,
    coordinatorActive,
    isWinner,
    coordinatedInlineSound,
    feedInlineSoundUnmuted,
    localStripSoundUnmuted,
  ])

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

  const onInlineStreamError = useCallback(() => {
    if (recoveryBurstRef.current < 2) {
      recoveryBurstRef.current += 1
      setShowStreamRetry(false)
      setStreamAttachKey((k) => k + 1)
      return
    }
    setShowStreamRetry(true)
  }, [])

  if (!id) return null

  const videoClass = videoClassByVariant[variant] || videoClassByVariant.feed
  const slideMaxW = slideMaxWByVariant[variant] || slideMaxWByVariant.feed
  const rounding = roundingByVariant[variant] || roundingByVariant.feed
  const border = borderByVariant[variant] || borderByVariant.feed
  /** iOS: in-flow poster `<img>` sizes the frame; `<video>` stays absolute until fade. Use whenever we have a CF thumbnail URL (feed, embed, and detail — not only lazy feed). */
  const usePosterFrame = Boolean(id && poster)
  const posterFrameMinH = posterFrameMinHByVariant[variant] || posterFrameMinHByVariant.feed
  const posterFallbackFrameClass =
    posterFallbackFrameClassByVariant[variant] || posterFallbackFrameClassByVariant.feed
  /** Until the in-flow poster decodes, optional aspect-ratio reserves footprint; after decode the `<img>` is the only size authority (avoids letterbox gap under object-contain). */
  const posterFrameAspectStyle =
    hasDisplayDims && !posterLayoutFailed && !posterDecodeOk
      ? { aspectRatio: `${Math.round(displayW)} / ${Math.round(displayH)}` }
      : undefined
  const posterShellMinHClass =
    posterDecodeOk ? 'min-h-0' : hasDisplayDims ? 'min-h-0' : posterFrameMinH
  /** Same delay on poster + video keeps poster visible through transparent video until fade starts (reduces black flash). */
  const streamFadeTransitionStyle = attachStream
    ? {
        transitionDuration: `${STREAM_ATTACH_FADE_MS}ms`,
        transitionDelay: streamFadeShowVideo ? `${STREAM_POSTER_FADE_DELAY_MS}ms` : '0ms',
      }
    : undefined

  return (
    <div className={`${firstMarginTopClass} inline-flex shrink-0 self-start ${slideMaxW}`}>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        data-lounge-video-zoom
        className={`relative block w-fit max-w-full cursor-pointer overflow-hidden ${rounding} border ${border} bg-black touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50`}
          aria-label={
            showOpen
              ? stripSoundUnmuted
                ? `Post video, sound on in ${inlineSoundScopeLabel}. Tap the video for full screen. Use the bottom-left mute control.`
                : `Post video, playing muted. Tap the video for full screen. Use the bottom-left control for sound in ${inlineSoundScopeLabel}.`
              : 'Post video'
          }
          title={
            showOpen
              ? stripSoundUnmuted
                ? 'Tap video for full screen; bottom-left chip to mute'
                : 'Tap video for full screen; bottom-left chip for sound'
              : undefined
          }
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
          <div
            className={
              usePosterFrame
                ? posterLayoutFailed
                  ? posterFallbackFrameClass
                  : `relative block w-fit max-w-full overflow-hidden bg-black ${posterShellMinHClass}`
                : 'relative'
            }
            style={posterFrameAspectStyle}
          >
            {usePosterFrame ? (
              posterLayoutFailed ? (
                <video
                  ref={videoRef}
                  className={`pointer-events-none z-[1] max-h-full w-auto max-w-full object-contain transition-opacity ease-out ${
                    attachStream && streamFadeShowVideo ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={streamFadeTransitionStyle}
                  muted={!stripSoundUnmuted}
                  loop
                  playsInline
                  preload={variant === 'composer' ? 'auto' : 'metadata'}
                  poster={visiblePosterSrc}
                  aria-hidden
                  onError={onInlineStreamError}
                />
              ) : (
                <>
                  <img
                    key={visiblePosterSrc}
                    src={visiblePosterSrc}
                    alt=""
                    decoding="async"
                    draggable={false}
                    loading="eager"
                    className={`pointer-events-none relative z-0 select-none transition-opacity ease-out ${videoClass} ${
                      attachStream && streamFadeShowVideo ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={streamFadeTransitionStyle}
                    aria-hidden
                    onLoad={() => setPosterDecodeOk(true)}
                    onError={onPosterImgError}
                  />
                  <video
                    ref={videoRef}
                    className={`pointer-events-none absolute inset-0 z-[1] h-full w-full object-contain transition-opacity ease-out ${
                      attachStream && streamFadeShowVideo ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={streamFadeTransitionStyle}
                    muted={!stripSoundUnmuted}
                    loop
                    playsInline
                    preload={variant === 'composer' ? 'auto' : 'metadata'}
                    poster={visiblePosterSrc}
                    aria-hidden
                    onError={onInlineStreamError}
                  />
                </>
              )
            ) : (
              <video
                ref={videoRef}
                className={`pointer-events-none ${videoClass}`}
                muted={!stripSoundUnmuted}
                loop
                playsInline
                preload={variant === 'composer' ? 'auto' : 'metadata'}
                poster={poster}
                aria-hidden
                onError={onInlineStreamError}
              />
            )}
          </div>
          {showStreamRetry ? (
            <div
              className="pointer-events-auto absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 bg-black/55 px-3 text-center text-[12px] font-medium text-zinc-100"
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
              aria-label={
                stripSoundUnmuted
                  ? `Mute video in ${inlineSoundScopeLabel}`
                  : `Play video with sound in ${inlineSoundScopeLabel}`
              }
              className="absolute bottom-2 left-2 z-[3] inline-flex min-h-[44px] min-w-[44px] max-w-[min(calc(100%-1rem),15rem)] items-center justify-center rounded-lg p-2 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50 sm:bottom-2.5 sm:left-2.5 sm:p-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onSoundStripPress()
              }}
            >
              <span className="pointer-events-none flex w-max max-w-full items-center gap-1.5 rounded-md bg-black/55 px-2 py-1.5 text-[11px] font-medium text-zinc-200 sm:gap-2 sm:px-2.5 sm:py-2 sm:text-[12px]">
                {stripSoundUnmuted ? (
                  <SoundOnGlyph className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
                ) : (
                  <MutedGlyph className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" />
                )}
                <span className="min-w-0 max-w-[min(11rem,70vw)] truncate">
                  {stripSoundUnmuted ? 'Tap to mute' : 'Tap for sound'}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      {lightboxOpen ? (
        <LoungeStreamVideoLightbox
          uid={id}
          footer={mediaLightboxFooterMerged}
          lightboxPortalClass={lightboxPortalClass}
          onClose={() => {
            setLightboxOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
