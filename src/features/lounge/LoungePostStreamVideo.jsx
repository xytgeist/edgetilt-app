import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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

/** Feed tile → hero full-screen grow (same `<video>`, no second HLS attach). */
const HERO_EXPAND_MS = 300
/** Shared easing for flyout geometry + scrim opacity. */
const HERO_MOTION_CURVE = 'cubic-bezier(0.22, 1, 0.36, 1)'
const HERO_MOTION_TRANSITION = `${HERO_EXPAND_MS}ms ${HERO_MOTION_CURVE}`
/** Lightbox chrome fades in only after the flyout lands. */
const HERO_CHROME_FADE_MS = 220

/** @returns {{ top: number, left: number, width: number, height: number }} */
function readElementViewportRect(el) {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** @returns {boolean} */
function heroRectUsableForShrinkBack(rect) {
  if (!rect) return false
  if (rect.width < 32 || rect.height < 32) return false
  if (typeof window === 'undefined') return false
  return rect.bottom > 0 && rect.top < window.innerHeight
}

/** Target hero frame: centered, object-contain aspect from source tile. */
function computeHeroTargetRect(fromRect) {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const topInset = 12
  const bottomInset = 12
  const headerH = 44
  const footerReserve = 56
  const side = 8
  const maxW = Math.max(120, vw - side * 2)
  const maxH = Math.max(120, vh - topInset - bottomInset - headerH - footerReserve)
  const aspect = fromRect.width / Math.max(fromRect.height, 1)
  let w = maxW
  let h = w / aspect
  if (h > maxH) {
    h = maxH
    w = h * aspect
  }
  const left = (vw - w) / 2
  const top = topInset + headerH + Math.max(0, (maxH - h) / 2)
  return { top, left, width: w, height: h }
}

/** Imperative snap before React paint — flyout on body at tile rect (no transition). */
function snapFlyoutToHeroRect(flyout, host, rect) {
  if (!flyout || !host || !rect) return
  if (flyout.parentElement !== host) host.appendChild(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${rect.top}px`
  flyout.style.left = `${rect.left}px`
  flyout.style.width = `${rect.width}px`
  flyout.style.height = `${rect.height}px`
  flyout.style.zIndex = '101'
  flyout.style.transition = 'none'
  flyout.style.borderRadius = '12px'
}

function clearFlyoutHeroInlineStyles(flyout) {
  if (!flyout) return
  flyout.style.position = ''
  flyout.style.top = ''
  flyout.style.left = ''
  flyout.style.width = ''
  flyout.style.height = ''
  flyout.style.zIndex = ''
  flyout.style.transition = ''
  flyout.style.borderRadius = ''
}

/** X-style: poster fills the in-card hole while the flyout grows on body (avoids black first frame). */
function revealInlinePosterForHero(slot) {
  if (!slot) return
  const img = slot.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  img.style.transition = 'none'
  img.style.opacity = '1'
}

function clearInlinePosterHeroStyles(slot) {
  if (!slot) return
  const img = slot.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  img.style.transition = ''
  img.style.opacity = ''
}

const HERO_FLYOUT_POSTER_SEL = '[data-lounge-hero-flyout-poster]'

/** Covers the flyout while `<video>` reparents — tile-sized fixed layer matches what the user sees on frame 1. */
function ensureFlyoutPosterCover(flyout, src) {
  if (!flyout || !src) return
  let img = flyout.querySelector(HERO_FLYOUT_POSTER_SEL)
  if (!img) {
    img = document.createElement('img')
    img.dataset.loungeHeroFlyoutPoster = '1'
    img.alt = ''
    img.draggable = false
    img.decoding = 'sync'
    img.className = 'pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain'
    flyout.insertBefore(img, flyout.firstChild)
  }
  if (img.getAttribute('src') !== src) img.setAttribute('src', src)
  img.style.transition = 'none'
  img.style.opacity = '1'
}

function clearFlyoutPosterCover(flyout) {
  if (!flyout) return
  flyout.querySelector(HERO_FLYOUT_POSTER_SEL)?.remove()
}

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
  const videoFlyoutRef = useRef(null)
  /** In-flow poster shell — idle flyout lives here; hero expand reparents flyout to `heroBodyHostRef`. */
  const heroInlineSlotRef = useRef(null)
  const heroBodyHostRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  /** Snapshot tile rect at open (before layout / portal updates). */
  const heroFromRectRef = useRef(
    /** @type {{ top: number, left: number, width: number, height: number } | null} */ (null),
  )
  const heroPhaseRef = useRef('idle')
  const inViewRef = useRef(false)
  const lightboxOpenRef = useRef(false)
  const isWinnerRef = useRef(false)
  const recoveryBurstRef = useRef(0)
  /** Feed sound snapshot when hero opens (restored on close; same `<video>` keeps time). */
  const inlineFeedSoundSnapshotRef = useRef(
    /** @type {{ unmuted: boolean, explicitlyMuted: boolean, coordinated: boolean } | null} */ (null),
  )
  const [lightboxOpen, setLightboxOpen] = useState(false)
  /** @type {'idle' | 'opening' | 'open' | 'closing'} */
  const [heroPhase, setHeroPhase] = useState('idle')
  const [heroLayout, setHeroLayout] = useState(
    /** @type {{ top: number, left: number, width: number, height: number } | null} */ (null),
  )
  const [heroChromeVisible, setHeroChromeVisible] = useState(false)
  /** After FLIP “from” paint, width/height/top/left may animate (not during initial opening snap). */
  const [heroTransitionArmed, setHeroTransitionArmed] = useState(false)
  /** Scrim opacity starts one frame after flyout motion on open (feed stays crisp on frame 1). */
  const [heroBackdropArmed, setHeroBackdropArmed] = useState(false)
  /** Poster over flyout `<video>` during opening — Safari can flash black when the node reparents to body. */
  const [heroFlyoutPosterVisible, setHeroFlyoutPosterVisible] = useState(false)
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
  const visiblePosterSrcRef = useRef(visiblePosterSrc)
  visiblePosterSrcRef.current = visiblePosterSrc

  const showOpen = enableLightbox && variant !== 'composer'
  const heroExpanded = lightboxOpen && heroPhase !== 'idle'
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
    feedAutoplayEnabled,
    scheduleRecompute,
    feedInlineSoundUnmuted,
    feedInlineSoundExplicitlyMuted,
    toggleFeedInlineSound,
    restoreFeedInlineSound,
  } = useLoungeFeedVideoAutoplay(feedAutoplayClientId, getVideoContainer)
  /** Inside `LoungeFeedVideoAutoplayProvider` with a client id: one shared “Tap for sound” for the scroll surface. */
  const coordinatedInlineSound = coordinatorActive
  const [localStripSoundUnmuted, setLocalStripSoundUnmuted] = useState(false)
  const [localStripSoundExplicitlyMuted, setLocalStripSoundExplicitlyMuted] = useState(false)
  const stripSoundUnmuted = coordinatedInlineSound ? feedInlineSoundUnmuted : localStripSoundUnmuted
  const inlineSoundScopeLabel =
    variant === 'feed' || variant === 'embed' ? 'the feed' : 'this screen'
  const feedStyleAbr =
    variant === 'feed' || variant === 'embed' || variant === 'composer' || variant === 'commentInline'
  const attachStream = heroExpanded
    ? Boolean(id)
    : lazyStream
      ? feedAutoplayEnabled && (coordinatorActive ? isWinner : streamInView)
      : true

  useEffect(() => {
    heroPhaseRef.current = heroPhase
  }, [heroPhase])

  /** Body mount for hero expand only — created lazily on open, removed on close (not one per feed tile). */
  const ensureHeroBodyHost = useCallback(() => {
    if (heroBodyHostRef.current) return heroBodyHostRef.current
    const host = document.createElement('div')
    host.dataset.loungeStreamFlyoutHost = id
    document.body.appendChild(host)
    heroBodyHostRef.current = host
    return host
  }, [id])

  const releaseHeroBodyHost = useCallback(() => {
    const host = heroBodyHostRef.current
    if (!host) return
    host.remove()
    heroBodyHostRef.current = null
  }, [])

  /** Reparent the same flyout DOM node — inline while idle, body while hero expanded (no remount). */
  useLayoutEffect(() => {
    const flyout = videoFlyoutRef.current
    const slot = heroInlineSlotRef.current
    if (!flyout || !slot) return
    if (heroExpanded) {
      const host = ensureHeroBodyHost()
      if (flyout.parentElement !== host) host.appendChild(flyout)
      return
    }
    if (flyout.parentElement !== slot) slot.appendChild(flyout)
    clearFlyoutHeroInlineStyles(flyout)
    clearInlinePosterHeroStyles(slot)
    releaseHeroBodyHost()
  }, [heroExpanded, ensureHeroBodyHost, releaseHeroBodyHost])

  useEffect(() => () => releaseHeroBodyHost(), [releaseHeroBodyHost])

  useEffect(() => {
    isWinnerRef.current = feedAutoplayEnabled && (!coordinatorActive || isWinner)
  }, [coordinatorActive, isWinner, feedAutoplayEnabled])

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

  useEffect(() => {
    if (feedAutoplayEnabled) return
    setLocalStripSoundUnmuted(false)
    setLocalStripSoundExplicitlyMuted(false)
    try {
      videoRef.current?.pause()
    } catch {
      // ignore
    }
  }, [feedAutoplayEnabled])

  const bumpStreamAttach = useCallback(() => {
    setStreamAttachKey((k) => k + 1)
  }, [])

  useStreamHlsAttachment(videoRef, src, streamAttachKey, {
    enabled: attachStream,
    feedStyleAbr: feedStyleAbr,
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

  const finalizeHeroClose = useCallback(() => {
    clearFlyoutPosterCover(videoFlyoutRef.current)
    setHeroFlyoutPosterVisible(false)
    setLightboxOpen(false)
    setHeroPhase('idle')
    setHeroLayout(null)
    setHeroChromeVisible(false)
    setHeroTransitionArmed(false)
    setHeroBackdropArmed(false)
    heroFromRectRef.current = null
  }, [])

  const closeLightbox = useCallback(() => {
    if (!lightboxOpenRef.current) return
    const slot = heroInlineSlotRef.current
    const back = slot ? readElementViewportRect(slot) : null
    if (heroRectUsableForShrinkBack(back)) {
      setHeroTransitionArmed(true)
      setHeroPhase('closing')
      setHeroChromeVisible(false)
      setHeroLayout(back)
      return
    }
    const snap = inlineFeedSoundSnapshotRef.current
    inlineFeedSoundSnapshotRef.current = null
    if (snap && feedAutoplayEnabled) {
      try {
        if (snap.coordinated) {
          restoreFeedInlineSound(snap.unmuted, snap.explicitlyMuted)
        } else {
          setLocalStripSoundUnmuted(snap.unmuted)
          setLocalStripSoundExplicitlyMuted(snap.explicitlyMuted)
        }
        const v = videoRef.current
        if (v) v.muted = !snap.unmuted
      } catch {
        // ignore
      }
    }
    finalizeHeroClose()
  }, [feedAutoplayEnabled, restoreFeedInlineSound, finalizeHeroClose])

  const { swipeSurfaceProps: heroSwipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose: closeLightbox,
    allowSwipeOnVideo: true,
    className: '',
  })
  const {
    onPointerDown: heroSwipePointerDown,
    onPointerMove: heroSwipePointerMove,
    onPointerUp: heroSwipePointerUp,
    onPointerCancel: heroSwipePointerCancel,
    style: heroSwipeDragStyle,
    className: heroSwipeTouchClass,
  } = heroSwipeSurfaceProps

  const mediaLightboxFooterMerged = useMemo(
    () => mergeLightboxDismissOnQuoteRepost(mediaLightboxFooter, closeLightbox),
    [mediaLightboxFooter, closeLightbox],
  )

  const openLightbox = useCallback(() => {
    const slot = heroInlineSlotRef.current
    const wrap = containerRef.current
    const v = videoRef.current
    if (!wrap) return
    const from = readElementViewportRect(slot || videoFlyoutRef.current || wrap)
    heroFromRectRef.current = from
    if (feedAutoplayEnabled && v) {
      const explicitlyMuted = coordinatedInlineSound
        ? feedInlineSoundExplicitlyMuted
        : localStripSoundExplicitlyMuted
      inlineFeedSoundSnapshotRef.current = {
        unmuted: stripSoundUnmuted,
        explicitlyMuted,
        coordinated: coordinatedInlineSound,
      }
      if (!explicitlyMuted) {
        try {
          if (coordinatedInlineSound) {
            if (!feedInlineSoundUnmuted) toggleFeedInlineSound()
          } else {
            setLocalStripSoundUnmuted(true)
            setLocalStripSoundExplicitlyMuted(false)
          }
          v.muted = false
          const p = v.play()
          if (p && typeof p.catch === 'function') {
            p.catch(() => {
              try {
                v.muted = true
              } catch {
                // ignore
              }
            })
          }
        } catch {
          // ignore
        }
      }
    } else {
      inlineFeedSoundSnapshotRef.current = null
      if (v && attachStream) {
        try {
          const p = v.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {
          // ignore
        }
      }
    }
    revealInlinePosterForHero(slot)
    const posterSrc = visiblePosterSrcRef.current || poster
    ensureFlyoutPosterCover(videoFlyoutRef.current, posterSrc)
    setHeroFlyoutPosterVisible(true)
    const host = ensureHeroBodyHost()
    const flyout = videoFlyoutRef.current
    snapFlyoutToHeroRect(flyout, host, from)
    setHeroLayout(from)
    setHeroPhase('opening')
    setHeroChromeVisible(false)
    setHeroTransitionArmed(false)
    setHeroBackdropArmed(false)
    setLightboxOpen(true)
  }, [
    feedAutoplayEnabled,
    attachStream,
    coordinatedInlineSound,
    feedInlineSoundExplicitlyMuted,
    localStripSoundExplicitlyMuted,
    stripSoundUnmuted,
    feedInlineSoundUnmuted,
    toggleFeedInlineSound,
    ensureHeroBodyHost,
    poster,
  ])

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
      setLocalStripSoundExplicitlyMuted(true)
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
          .then(() => {
            setLocalStripSoundUnmuted(true)
            setLocalStripSoundExplicitlyMuted(false)
          })
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
        setLocalStripSoundExplicitlyMuted(false)
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

  useEffect(() => {
    if (!lightboxOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [lightboxOpen, closeLightbox])

  /** Hero open: snap to tile rect (no transition), then grow to target on `document.body`. */
  useLayoutEffect(() => {
    if (!lightboxOpen || heroPhase === 'idle') {
      clearFlyoutPosterCover(videoFlyoutRef.current)
      return undefined
    }
    if (heroPhase === 'opening' || (heroPhase === 'open' && heroFlyoutPosterVisible)) {
      ensureFlyoutPosterCover(videoFlyoutRef.current, visiblePosterSrcRef.current || poster)
    } else {
      clearFlyoutPosterCover(videoFlyoutRef.current)
    }
    return undefined
  }, [lightboxOpen, heroPhase, heroFlyoutPosterVisible, poster])

  useLayoutEffect(() => {
    if (!lightboxOpen || heroPhase !== 'opening') return undefined
    const from = heroFromRectRef.current
    if (!from) return undefined
    setHeroTransitionArmed(false)
    setHeroBackdropArmed(false)
    setHeroLayout(from)
    let raf2 = 0
    let raf3 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (heroPhaseRef.current !== 'opening') return
        setHeroTransitionArmed(true)
        setHeroLayout(computeHeroTargetRect(from))
        raf3 = requestAnimationFrame(() => {
          if (heroPhaseRef.current !== 'opening') return
          setHeroBackdropArmed(true)
        })
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
      if (raf3) cancelAnimationFrame(raf3)
    }
  }, [lightboxOpen, heroPhase])

  /** Drop flyout poster once hero lands and the reparented `<video>` is painting again. */
  useEffect(() => {
    if (heroPhase !== 'open' || !heroFlyoutPosterVisible) return undefined
    const flyout = videoFlyoutRef.current
    const v = videoRef.current
    let tid = 0
    let cleaned = false
    const finish = () => {
      if (cleaned) return
      clearFlyoutPosterCover(flyout)
      setHeroFlyoutPosterVisible(false)
    }
    const fadeOut = () => {
      const img = flyout?.querySelector(HERO_FLYOUT_POSTER_SEL)
      if (!(img instanceof HTMLImageElement)) {
        finish()
        return
      }
      img.style.transition = 'opacity 120ms ease-out'
      img.style.opacity = '0'
      tid = window.setTimeout(finish, 160)
    }
    const run = () => {
      if (cleaned) return
      if (v && typeof v.requestVideoFrameCallback === 'function') {
        try {
          v.requestVideoFrameCallback(() => fadeOut())
          return
        } catch {
          // fall through
        }
      }
      fadeOut()
    }
    run()
    return () => {
      cleaned = true
      window.clearTimeout(tid)
    }
  }, [heroPhase, heroFlyoutPosterVisible])

  /** iOS sometimes skips `transitionend` on width — ensure chrome still appears after land. */
  useEffect(() => {
    if (heroPhase !== 'opening' || heroChromeVisible) return undefined
    const tid = window.setTimeout(() => {
      if (heroPhaseRef.current !== 'opening') return
      setHeroPhase('open')
      setHeroChromeVisible(true)
    }, HERO_EXPAND_MS + 96)
    return () => window.clearTimeout(tid)
  }, [heroPhase, heroChromeVisible])

  useEffect(() => {
    const flyout = videoFlyoutRef.current
    if (!flyout) return undefined
    const onTransitionEnd = (e) => {
      if (e.target !== flyout || e.propertyName !== 'width') return
      const phase = heroPhaseRef.current
      if (phase === 'opening') {
        setHeroPhase('open')
        requestAnimationFrame(() => setHeroChromeVisible(true))
      }
      if (phase === 'closing') {
        const snap = inlineFeedSoundSnapshotRef.current
        inlineFeedSoundSnapshotRef.current = null
        if (snap && feedAutoplayEnabled) {
          try {
            if (snap.coordinated) {
              restoreFeedInlineSound(snap.unmuted, snap.explicitlyMuted)
            } else {
              setLocalStripSoundUnmuted(snap.unmuted)
              setLocalStripSoundExplicitlyMuted(snap.explicitlyMuted)
            }
            const v = videoRef.current
            if (v) {
              v.muted = !snap.unmuted
              if (attachStream || lazyStream) {
                const p = v.play()
                if (p && typeof p.catch === 'function') p.catch(() => {})
              }
            }
          } catch {
            // ignore
          }
        }
        finalizeHeroClose()
      }
    }
    flyout.addEventListener('transitionend', onTransitionEnd)
    return () => flyout.removeEventListener('transitionend', onTransitionEnd)
  }, [
    feedAutoplayEnabled,
    attachStream,
    lazyStream,
    restoreFeedInlineSound,
    finalizeHeroClose,
  ])

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
      if (lazyStream && !coordinatorActive) setStreamInView(attachOk)
      const won = isWinnerRef.current
      if (lightboxOpenRef.current) {
        queueMicrotask(() => scheduleRecompute())
        return
      }
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
      /** Scroll root already schedules winner picks; IO per tile was redundant and costly on mobile. */
      if (!coordinatorActive) queueMicrotask(() => scheduleRecompute())
      if (!feedAutoplayEnabled) return
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
    feedAutoplayEnabled,
  ])

  /** After lazy HLS attach (feed/embed), start muted autoplay once media is ready. */
  useEffect(() => {
    if (!lazyStream || !attachStream) return undefined
    if (!showOpen) return undefined
    if (lightboxOpenRef.current) return undefined
    if (!inViewRef.current && !(coordinatorActive && isWinner)) return undefined
    if (coordinatorActive && !isWinner) return undefined
    const v = videoRef.current
    if (!v) return undefined
    let cleaned = false
    const go = () => {
      if (lightboxOpenRef.current) return
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

  /** Hero / lightbox open: ensure the same inline `<video>` keeps playing once HLS attaches (autoplay-off path). */
  useEffect(() => {
    if (!lightboxOpen || !attachStream) return undefined
    const v = videoRef.current
    if (!v) return undefined
    const tryPlay = () => {
      try {
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        // ignore
      }
    }
    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      tryPlay()
      return undefined
    }
    v.addEventListener('canplay', tryPlay, { once: true })
    return () => v.removeEventListener('canplay', tryPlay)
  }, [lightboxOpen, attachStream, streamAttachKey])

  /** After closing hero, resume inline autoplay if still in view (sound restored on shrink animation end). */
  useEffect(() => {
    if (lightboxOpen) return
    if (!feedAutoplayEnabled) return
    if (inlineFeedSoundSnapshotRef.current) return
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
    feedAutoplayEnabled,
  ])

  /** Coordinator handoff: pause immediately when another tile wins mid-scroll. */
  useEffect(() => {
    if (!coordinatorActive || !lazyStream) return
    if (lightboxOpenRef.current) return
    const v = videoRef.current
    if (!v) return
    if (!isWinner) {
      try {
        v.pause()
      } catch {
        // ignore
      }
    }
  }, [coordinatorActive, lazyStream, isWinner, lightboxOpen])

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
  const heroAnimating =
    heroTransitionArmed && (heroPhase === 'opening' || heroPhase === 'closing')
  const heroTransitionCss = heroAnimating
    ? `top ${HERO_MOTION_TRANSITION}, left ${HERO_MOTION_TRANSITION}, width ${HERO_MOTION_TRANSITION}, height ${HERO_MOTION_TRANSITION}, border-radius ${HERO_MOTION_TRANSITION}`
    : 'none'
  const heroFlyoutStyle =
    heroExpanded && heroLayout
      ? {
          position: 'fixed',
          top: heroLayout.top,
          left: heroLayout.left,
          width: heroLayout.width,
          height: heroLayout.height,
          zIndex: 101,
          transition: heroTransitionCss,
          borderRadius: heroPhase === 'open' ? 0 : 12,
          ...heroSwipeDragStyle,
        }
      : undefined
  const heroFlyoutShellClass = heroExpanded
    ? `overflow-hidden touch-manipulation ${heroPhase === 'opening' ? 'bg-transparent' : 'bg-black'} ${heroSwipeTouchClass || ''}`.trim()
    : 'absolute inset-0 z-[1] h-full w-full overflow-hidden bg-transparent'
  const heroFlyoutPointerProps = heroExpanded
    ? {
        onPointerDown: heroSwipePointerDown,
        onPointerMove: heroSwipePointerMove,
        onPointerUp: heroSwipePointerUp,
        onPointerCancel: heroSwipePointerCancel,
      }
    : {}
  const inlineVideoOpacityClass =
    heroExpanded || (attachStream && streamFadeShowVideo) ? 'opacity-100' : 'opacity-0'
  const inlinePosterOpacityClass =
    heroExpanded || !(attachStream && streamFadeShowVideo) ? 'opacity-100' : 'opacity-0'
  /** Poster stays above the flyout while HLS loads so a transparent/black video plane never flashes over it. */
  const inlinePosterZClass =
    heroExpanded || (attachStream && !streamFadeShowVideo) ? 'z-[2]' : 'relative z-0'
  const streamVideoClass = heroExpanded
    ? 'pointer-events-auto h-full w-full max-h-full max-w-full object-contain'
    : 'pointer-events-none h-full w-full object-contain'

  const heroBackdropAnimating =
    heroBackdropArmed && (heroPhase === 'opening' || heroPhase === 'closing')
  const heroBackdropTransitionCss = heroBackdropAnimating ? `opacity ${HERO_MOTION_TRANSITION}` : 'none'
  const heroBackdropOpacityClass =
    heroPhase === 'closing'
      ? 'opacity-0'
      : heroBackdropAnimating || heroPhase === 'open'
        ? 'opacity-100'
        : 'opacity-0'
  const heroBackdropInteractive = heroPhase === 'open' || heroPhase === 'closing'
  const heroChromeFadeStyle = {
    transition: `opacity ${HERO_CHROME_FADE_MS}ms ease-out`,
  }
  const streamVideoEl = (
    <video
      ref={videoRef}
      className={`${streamVideoClass} ${heroExpanded ? '' : 'transition-opacity ease-out'} ${inlineVideoOpacityClass}`}
      style={heroExpanded ? undefined : streamFadeTransitionStyle}
      controls={false}
      controlsList="nodownload"
      muted={!stripSoundUnmuted}
      loop
      playsInline
      preload={variant === 'composer' ? 'auto' : 'metadata'}
      poster={visiblePosterSrc || poster}
      aria-label={heroExpanded ? 'Post video (full screen)' : undefined}
      aria-hidden={!heroExpanded}
      onClick={(e) => {
        if (!heroExpanded) return
        e.stopPropagation()
        const v = videoRef.current
        if (!v) return
        try {
          if (v.paused) {
            const p = v.play()
            if (p && typeof p.catch === 'function') p.catch(() => {})
          } else {
            v.pause()
          }
        } catch {
          // ignore
        }
      }}
      onError={onInlineStreamError}
    />
  )

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
              ? !feedAutoplayEnabled
                ? 'Post video. Tap play for full screen.'
                : stripSoundUnmuted
                  ? `Post video, sound on in ${inlineSoundScopeLabel}. Tap the video for full screen. Use the bottom-left mute control.`
                  : `Post video, playing muted. Tap the video for full screen. Use the bottom-left control for sound in ${inlineSoundScopeLabel}.`
              : 'Post video'
          }
          title={
            showOpen
              ? !feedAutoplayEnabled
                ? 'Tap play for full screen'
                : stripSoundUnmuted
                  ? 'Tap video for full screen; bottom-left chip to mute'
                  : 'Tap video for full screen; bottom-left chip for sound'
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            if (showOpen && !heroExpanded) openLightbox()
          }}
          onKeyDown={(e) => {
            if (!showOpen || heroExpanded) return
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              openLightbox()
            }
          }}
        >
          <div
            ref={heroInlineSlotRef}
            className={
              usePosterFrame
                ? posterLayoutFailed
                  ? posterFallbackFrameClass
                  : `relative block w-fit max-w-full overflow-hidden bg-black ${posterShellMinHClass}`
                : 'relative block w-fit max-w-full'
            }
            style={posterFrameAspectStyle}
          >
            {usePosterFrame ? (
              posterLayoutFailed ? null : (
                <img
                  key={visiblePosterSrc}
                  src={visiblePosterSrc}
                  alt=""
                  decoding="async"
                  draggable={false}
                  loading="eager"
                  className={`pointer-events-none select-none ${heroExpanded ? '' : 'transition-opacity ease-out'} ${inlinePosterZClass} ${videoClass} ${inlinePosterOpacityClass}`}
                  style={heroExpanded ? { transition: 'none' } : streamFadeTransitionStyle}
                  aria-hidden
                  onLoad={() => setPosterDecodeOk(true)}
                  onError={onPosterImgError}
                />
              )
            ) : null}
            <div
              ref={videoFlyoutRef}
              style={heroFlyoutStyle}
              className={heroFlyoutShellClass}
              {...heroFlyoutPointerProps}
            >
              {streamVideoEl}
            </div>
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
          {showOpen && !showStreamRetry && !feedAutoplayEnabled && !heroExpanded ? (
            <button
              type="button"
              aria-label="Play video in full screen"
              className="absolute inset-0 z-[5] flex items-center justify-center touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
              onClick={(e) => {
                e.stopPropagation()
                openLightbox()
              }}
            >
              <span className="pointer-events-none flex h-14 w-14 items-center justify-center rounded-full border border-white/25 bg-black/55 shadow-[0_0_24px_rgba(0,0,0,0.55)] backdrop-blur-[2px] sm:h-16 sm:w-16">
                <svg
                  viewBox="0 0 24 24"
                  className="ml-0.5 h-7 w-7 text-white drop-shadow-sm sm:h-8 sm:w-8"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 5.14v13.72L19 12 8 5.14z" />
                </svg>
              </span>
            </button>
          ) : null}
          {showOpen && !showStreamRetry && feedAutoplayEnabled && !heroExpanded ? (
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
      {heroExpanded
        ? createPortal(
            <div
              className={`fixed inset-0 ${lightboxPortalClass}`}
              role="dialog"
              aria-modal="true"
              aria-label="Full screen video"
            >
              <div
                className={`absolute inset-0 bg-black ${heroBackdropOpacityClass} ${heroSwipeTouchClass || ''} ${
                  heroBackdropInteractive ? '' : 'pointer-events-none'
                }`.trim()}
                style={{ transition: heroBackdropTransitionCss }}
                onClick={heroBackdropInteractive ? closeLightbox : undefined}
                onPointerDown={heroBackdropInteractive ? heroSwipePointerDown : undefined}
                onPointerMove={heroBackdropInteractive ? heroSwipePointerMove : undefined}
                onPointerUp={heroBackdropInteractive ? heroSwipePointerUp : undefined}
                onPointerCancel={heroBackdropInteractive ? heroSwipePointerCancel : undefined}
                aria-hidden
              />
              <div className="pointer-events-none fixed inset-0 flex flex-col">
                <div
                  className={`flex shrink-0 justify-end p-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${
                    heroChromeVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                  style={heroChromeFadeStyle}
                  data-lounge-lightbox-no-swipe
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeLightbox()
                    }}
                    className="touch-manipulation rounded-lg border border-zinc-600/80 bg-zinc-900/80 px-3 py-1.5 text-[14px] font-semibold text-zinc-200 hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
                  >
                    Close
                  </button>
                </div>
                {mediaLightboxFooterMerged ? (
                  <div
                    className={`mt-auto shrink-0 border-t border-zinc-700/50 bg-black px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 ${
                      heroChromeVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
                    }`}
                    style={heroChromeFadeStyle}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {heroChromeVisible ? mediaLightboxFooterMerged : null}
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
