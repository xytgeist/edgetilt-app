import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { cfStreamManifestUrl, cfStreamPosterUrl } from '../../utils/loungeVideoUpload'
import { useLoungeFeedVideoAutoplay } from './LoungeFeedVideoAutoplayContext.jsx'
import { mergeLightboxDismissOnQuoteRepost } from './loungeLightboxFooterDismissQuote.js'
import { releaseLoungeStreamSessionPoster } from './loungeStreamSessionPoster.js'
import {
  getLoungeStreamLightboxOpen,
  notifyLoungeStreamLightboxOpen,
  subscribeLoungeStreamLightboxOpen,
} from './loungeStreamLightboxRegistry.js'
import { useLoungeLightboxSwipeDismiss } from './loungeLightboxSwipeDismiss.js'
import {
  readLoungeFeedVideoDebugEnabled,
  subscribeLoungeFeedVideoDebugEnabled,
} from '../../utils/loungeFeedVideoDebugPref.js'
import {
  readLoungeVideoElementDebug,
  registerLoungeVideoDebugTile,
  reportLoungeVideoDebugEvent,
} from './loungeFeedVideoDebugRegistry.js'

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
const HERO_EXPAND_MS = 380
/** GPU transform FLIP — gentler start than width/top tweens on mobile. */
const HERO_MOTION_CURVE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const HERO_MOTION_TRANSITION = `${HERO_EXPAND_MS}ms ${HERO_MOTION_CURVE}`
/** Lightbox chrome fades in only after the flyout lands. */
const HERO_CHROME_FADE_MS = 220
/** Hero stack (bottom → top): scrim 100, flyout 101, transparent gesture 102, chrome 103. */
const HERO_SCRIM_Z_INDEX = 100
const HERO_FLYOUT_Z_INDEX = 101
const HERO_OVERLAY_Z_INDEX = 102

/** @returns {{ top: number, left: number, width: number, height: number }} */
function readElementViewportRect(el) {
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/**
 * Visible media bounds for hero FLIP — not the full poster shell when portrait letterboxes.
 * Prefer decoded in-flow poster pixels; else object-contain fit from stream display dims.
 */
function readHeroMediaViewportRect(slot, flyout, wrap, displayW, displayH) {
  const shell = slot || flyout || wrap
  if (!shell) return { top: 0, left: 0, width: 0, height: 0 }

  const posterImg = slot?.querySelector('img')
  if (posterImg instanceof HTMLImageElement) {
    const ir = posterImg.getBoundingClientRect()
    if (ir.width >= 8 && ir.height >= 8) {
      return { top: ir.top, left: ir.left, width: ir.width, height: ir.height }
    }
  }

  const shellRect = readElementViewportRect(shell)
  const dw = Number(displayW)
  const dh = Number(displayH)
  if (Number.isFinite(dw) && Number.isFinite(dh) && dw >= 2 && dh >= 2) {
    const aspect = dw / dh
    let w = shellRect.width
    let h = w / aspect
    if (h > shellRect.height) {
      h = shellRect.height
      w = h * aspect
    }
    return {
      top: shellRect.top + (shellRect.height - h) / 2,
      left: shellRect.left + (shellRect.width - w) / 2,
      width: w,
      height: h,
    }
  }

  return shellRect
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

/** Closing FLIP invert: laid out at `toRect`, transform makes it match `fromRect`. */
function computeHeroShrinkTransform(fromRect, toRect) {
  const scaleX = fromRect.width / toRect.width
  const scaleY = fromRect.height / toRect.height
  const translateX = fromRect.left - toRect.left
  const translateY = fromRect.top - toRect.top
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
}

/** Opening FLIP: laid out at tile `fromRect`, transform grows toward hero `toRect`. */
function computeHeroExpandTransform(fromRect, toRect) {
  const scaleX = toRect.width / fromRect.width
  const scaleY = toRect.height / fromRect.height
  const translateX = toRect.left - fromRect.left
  const translateY = toRect.top - fromRect.top
  return `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
}

/** Imperative snap before React paint — flyout on body at feed tile size (transform identity). */
function snapFlyoutToHeroTile(flyout, host, fromRect) {
  if (!flyout || !host || !fromRect) return
  if (flyout.parentElement !== host) host.appendChild(flyout)
  flyout.style.position = 'fixed'
  flyout.style.top = `${fromRect.top}px`
  flyout.style.left = `${fromRect.left}px`
  flyout.style.width = `${fromRect.width}px`
  flyout.style.height = `${fromRect.height}px`
  flyout.style.zIndex = String(HERO_FLYOUT_Z_INDEX)
  flyout.style.transformOrigin = '0 0'
  flyout.style.transform = 'none'
  flyout.style.transition = 'none'
  flyout.style.borderRadius = '12px'
  flyout.style.willChange = 'transform'
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
  flyout.style.transform = ''
  flyout.style.transformOrigin = ''
  flyout.style.willChange = ''
}

/** X-style: in-card poster fills the feed hole while the flyout grows on body. */
function revealInlinePosterForHero(slot) {
  if (!slot) return
  const img = slot.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  img.style.transition = 'none'
  img.style.opacity = '1'
}

/** Keep poster under flyout (z-0) on hero tap — load-time z-[2] must not sit above the growing video. */
function pinInlinePosterBehindFlyout(slot) {
  if (!slot) return
  const img = slot.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  img.style.transition = 'none'
  img.style.zIndex = '0'
}

function clearInlinePosterHeroStyles(slot) {
  if (!slot) return
  const img = slot.querySelector('img')
  if (!(img instanceof HTMLImageElement)) return
  img.style.transition = ''
  img.style.opacity = ''
  img.style.zIndex = ''
}

/** object-contain draw for canvas frame shield (matches flyout `<video>`). */
function drawVideoContainOnCanvas(ctx, video, canvasW, canvasH) {
  const vw = video.videoWidth || canvasW
  const vh = video.videoHeight || canvasH
  let dw = canvasW
  let dh = (dw * vh) / Math.max(vw, 1)
  if (dh > canvasH) {
    dh = canvasH
    dw = (dh * vw) / Math.max(vh, 1)
  }
  const dx = (canvasW - dw) / 2
  const dy = (canvasH - dh) / 2
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, canvasW, canvasH)
  ctx.drawImage(video, dx, dy, dw, dh)
}

/** Frame 0 shield after reparent — removed once `<video>` paints post-move (rVFC). */
function mountHeroFrameShield(flyout, video, width, height) {
  if (!flyout || !video) return null
  clearHeroFrameShield(flyout)
  try {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    const canvas = document.createElement('canvas')
    canvas.dataset.loungeHeroFrameShield = '1'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText =
      'pointer-events:none;position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:contain'
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    drawVideoContainOnCanvas(ctx, video, w, h)
    flyout.appendChild(canvas)
    return canvas
  } catch {
    return null
  }
}

function clearHeroFrameShield(flyout) {
  if (!flyout) return
  flyout.querySelector('[data-lounge-hero-frame-shield]')?.remove()
}

/** Wait until flyout `<video>` (or shield removal) has painted before arming scrim. */
function afterHeroFlyoutPainted(video, onPainted) {
  const run = () => {
    try {
      onPainted()
    } catch {
      // ignore
    }
  }
  if (video && typeof video.requestVideoFrameCallback === 'function') {
    try {
      video.requestVideoFrameCallback(() => run())
      return
    } catch {
      // fall through
    }
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(run)
  })
}

/** Pause every feed Stream `<video>` except the one the user is engaging (hero or sound tap). */
function pauseOtherLoungeStreamVideos(exceptVideo) {
  try {
    document.querySelectorAll('[data-lounge-video-zoom] video').forEach((el) => {
      if (el === exceptVideo) return
      el.pause()
      el.muted = true
    })
  } catch {
    // ignore
  }
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
 * @param {((detail: string) => void) | null} [opts.onDebugHlsError] dev HUD: fatal HLS error detail
 */
function useStreamHlsAttachment(videoRef, src, attachKey = 0, opts = {}) {
  const {
    enabled = true,
    feedStyleAbr = false,
    ringWarmPrefetch = false,
    recoveryBurstRef = null,
    onAutoReattach = null,
    onDebugHlsError = null,
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
          const maxBufferLength = feedStyleAbr ? (ringWarmPrefetch ? 6 : 18) : 45
          const maxMaxBufferLength = feedStyleAbr ? (ringWarmPrefetch ? 12 : 36) : 120
          const hls = new Hls({
            maxBufferLength,
            maxMaxBufferLength,
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
              if (onDebugHlsError) {
                const detail = [data.type, data.details, data.response?.code]
                  .filter((x) => x != null && x !== '')
                  .join(' ')
                onDebugHlsError(detail || 'fatal')
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

/** Speaker with waves (unmuted state). */
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
 * controls. Tap the video for full screen; bottom-left icon unmutes this clip only (falls back to full screen if blocked).
 *
 * @param {import('react').RefObject<HTMLElement | null>} [visibilityResetRootRef] — Optional scroll root for in-view
 *   checks; when omitted, intersection uses the viewport (still correct when the feed scrolls inside the window).
 * @param {string} [feedAutoplayClientId] — When inside `LoungeFeedVideoAutoplayProvider`, ring/active coordinator id.
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
  /** Hero target rect at open — reused as FLIP “from” when shrinking back to the card. */
  const heroTargetRectRef = useRef(
    /** @type {{ top: number, left: number, width: number, height: number } | null} */ (null),
  )
  const heroPhaseRef = useRef('idle')
  const inViewRef = useRef(false)
  const lightboxOpenRef = useRef(false)
  const isActiveRef = useRef(false)
  /** Hero session wants audible playback (restored from inline snapshot on open). */
  const heroWantsSoundRef = useRef(true)
  const recoveryBurstRef = useRef(0)
  const lastPlayErrorRef = useRef('')
  /** Prevent stacked play() calls on iOS (AbortError / NotAllowedError storms). */
  const inlinePlayInFlightRef = useRef(false)
  const lastInlinePlayAttemptMsRef = useRef(0)
  /** After iOS NotAllowedError, back off before the next programmatic play(). */
  const inlinePlayBackoffUntilMsRef = useRef(0)
  const lastPlayErrorLogMsRef = useRef(0)
  /** Per-tile sound snapshot when hero opens (restored on close; same `<video>` keeps time). */
  const inlineFeedSoundSnapshotRef = useRef(
    /** @type {{ unmuted: boolean, explicitlyMuted: boolean } | null} */ (null),
  )
  /** Tile media state at hero tap — freeze poster/video fade for the expand. */
  const heroTapSnapshotRef = useRef(
    /** @type {{ showVideo: boolean, readyState: number, fromRect: { top: number, left: number, width: number, height: number } } | null} */ (
      null
    ),
  )
  const heroFrameShieldRef = useRef(/** @type {HTMLCanvasElement | null} */ (null))
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
    isActive,
    inRing,
    inDomBudget,
    softResetEpoch,
    tileRatio,
    flingerMode,
    heroLocked,
    feedAutoplayEnabled,
    scheduleRecompute,
    forceFeedAutoplayActive,
    enterFeedHeroLock,
    exitFeedHeroLock,
  } = useLoungeFeedVideoAutoplay(feedAutoplayClientId, getVideoContainer)
  const videoDebugEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoDebugEnabled,
    readLoungeFeedVideoDebugEnabled,
    () => false,
  )
  const anyStreamLightboxOpen = useSyncExternalStore(
    subscribeLoungeStreamLightboxOpen,
    getLoungeStreamLightboxOpen,
    () => false,
  )
  isActiveRef.current = feedAutoplayEnabled && (!coordinatorActive || isActive)
  const [localStripSoundUnmuted, setLocalStripSoundUnmuted] = useState(false)
  const [localStripSoundExplicitlyMuted, setLocalStripSoundExplicitlyMuted] = useState(false)
  const localStripSoundUnmutedRef = useRef(false)
  useEffect(() => {
    localStripSoundUnmutedRef.current = localStripSoundUnmuted
  }, [localStripSoundUnmuted])
  const stripSoundUnmuted = localStripSoundUnmuted
  const feedStyleAbr =
    variant === 'feed' || variant === 'embed' || variant === 'composer' || variant === 'commentInline'
  const heroOverlayZIndex = useMemo(() => {
    const m = String(lightboxPortalClass || '').match(/z-\[(\d+)\]/)
    const n = m ? Number(m[1]) : HERO_OVERLAY_Z_INDEX
    return Number.isFinite(n) ? Math.max(n, HERO_OVERLAY_Z_INDEX) : HERO_OVERLAY_Z_INDEX
  }, [lightboxPortalClass])
  const attachStream = heroExpanded
    ? Boolean(id)
    : lazyStream
      ? feedAutoplayEnabled && (coordinatorActive ? inRing : streamInView)
      : true
  /** iOS: ≤5 inline `<video>` nodes (ring + lookahead); HLS only on ring (≤3). */
  const mountStreamVideo = Boolean(id) && (
    (coordinatorActive && inDomBudget) ||
    heroExpanded ||
    lightboxOpen ||
    (!coordinatorActive && lazyStream && streamInView)
  )
  const ringWarmPrefetch = coordinatorActive && inRing && !isActive && attachStream

  /** Handoff away: next active clip starts muted unless user taps sound on that tile. */
  useEffect(() => {
    if (!coordinatorActive || isActive) return
    setLocalStripSoundUnmuted(false)
    setLocalStripSoundExplicitlyMuted(false)
  }, [coordinatorActive, isActive])

  const inlineVideoMuted = !stripSoundUnmuted
  const streamVideoMutedProps = { muted: inlineVideoMuted }

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
    clearHeroFrameShield(flyout)
    clearInlinePosterHeroStyles(slot)
    releaseHeroBodyHost()
  }, [heroExpanded, ensureHeroBodyHost, releaseHeroBodyHost])

  const tryCoordinatedInlinePlay = useCallback(() => {
    const v = videoRef.current
    if (!v || !showOpen || lightboxOpenRef.current) return false
    if (anyStreamLightboxOpen && !lightboxOpenRef.current) return false
    if (heroLocked && !lightboxOpenRef.current) return false
    if (coordinatorActive && !isActiveRef.current) return false
    if (coordinatorActive && tileRatio <= 0) return false
    if (lazyStream && v.readyState < HTMLMediaElement.HAVE_METADATA) return false
    if (inlinePlayInFlightRef.current) return false
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (nowMs < inlinePlayBackoffUntilMsRef.current) return false
    if (nowMs - lastInlinePlayAttemptMsRef.current < 380) return false
    lastInlinePlayAttemptMsRef.current = nowMs
    const reportPlayError = (err) => {
      const isAbort = err instanceof Error && err.name === 'AbortError'
      if (isAbort) return
      const msg =
        err instanceof Error
          ? `${err.name}: ${err.message || 'play failed'}`.trim()
          : String(err || 'play failed')
      lastPlayErrorRef.current = msg
      if (!videoDebugEnabled || !feedAutoplayClientId) return
      const isNotAllowed = msg.includes('NotAllowedError')
      if (isNotAllowed && nowMs - lastPlayErrorLogMsRef.current < 2500) return
      lastPlayErrorLogMsRef.current = nowMs
      reportLoungeVideoDebugEvent(feedAutoplayClientId, 'play', msg)
    }
    const applyAudibleAfterPlay = () => {
      if (!v || v.paused) return
      if (localStripSoundUnmutedRef.current && isActiveRef.current) {
        try {
          v.muted = false
        } catch {
          // ignore
        }
      }
    }
    try {
      // iOS blocks unmuted programmatic play(); start muted, unmute only after play resolves.
      v.muted = true
      inlinePlayInFlightRef.current = true
      const finishPlayAttempt = () => {
        inlinePlayInFlightRef.current = false
      }
      const p = v.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          finishPlayAttempt()
          inlinePlayBackoffUntilMsRef.current = 0
          lastPlayErrorRef.current = ''
          applyAudibleAfterPlay()
        }).catch((err) => {
          finishPlayAttempt()
          reportPlayError(err)
          if (err instanceof Error && err.name === 'NotAllowedError') {
            const backoffMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
            inlinePlayBackoffUntilMsRef.current = backoffMs + 900
            lastInlinePlayAttemptMsRef.current = backoffMs
          }
          scheduleRecompute()
        })
      } else {
        finishPlayAttempt()
        lastPlayErrorRef.current = ''
        if (!v.paused) applyAudibleAfterPlay()
      }
      return !v.paused
    } catch (err) {
      inlinePlayInFlightRef.current = false
      reportPlayError(err)
      scheduleRecompute()
      return false
    }
  }, [
    anyStreamLightboxOpen,
    coordinatorActive,
    feedAutoplayClientId,
    heroLocked,
    lazyStream,
    scheduleRecompute,
    showOpen,
    tileRatio,
    videoDebugEnabled,
  ])

  useEffect(() => () => releaseHeroBodyHost(), [releaseHeroBodyHost])

  /** Coordinator + hero resource budget: one `play()`, `{prev,active,next}` ring attach, hero lock collapses ring. */
  useLayoutEffect(() => {
    if (!showOpen) return
    const v = videoRef.current
    if (!v) return
    const isHeroTile = lightboxOpenRef.current

    if (isHeroTile) return

    if (anyStreamLightboxOpen) {
      try {
        v.pause()
        v.muted = true
      } catch {
        // ignore
      }
      return
    }

    if (!coordinatorActive || !lazyStream) return

    if (heroLocked) {
      try {
        v.pause()
        v.muted = true
      } catch {
        // ignore
      }
      return
    }

    if (flingerMode) {
      if (isActive && tileRatio > 0 && v.paused) {
        tryCoordinatedInlinePlay()
      } else if (!isActive || tileRatio <= 0) {
        try {
          v.pause()
          v.muted = true
        } catch {
          // ignore
        }
      }
      return
    }

    if (!isActive) {
      try {
        v.pause()
        v.muted = true
      } catch {
        // ignore
      }
      if (inRing) return
      if (tileRatio <= 0) {
        try {
          v.currentTime = 0
        } catch {
          // ignore
        }
      }
      return
    }

    if (isActive) {
      if (tileRatio > 0 && v.paused) {
        tryCoordinatedInlinePlay()
      } else if (tileRatio <= 0) {
        try {
          v.pause()
          v.currentTime = 0
          v.muted = true
        } catch {
          // ignore
        }
      }
      return
    }
  }, [
    anyStreamLightboxOpen,
    coordinatorActive,
    flingerMode,
    heroLocked,
    inRing,
    isActive,
    lazyStream,
    showOpen,
    tileRatio,
    lightboxOpen,
    tryCoordinatedInlinePlay,
  ])

  /** Active tile: retry muted play when HLS becomes ready or mobile silently rejects autoplay. */
  useEffect(() => {
    if (!coordinatorActive || !lazyStream || !feedAutoplayEnabled || !isActive || !attachStream) {
      return undefined
    }
    if (tileRatio <= 0 || lightboxOpen) return undefined

    let cancelled = false
    const nudge = () => {
      if (cancelled || lightboxOpenRef.current) return
      if (!isActiveRef.current) return
      const el = videoRef.current
      if (!el || !el.paused) return
      tryCoordinatedInlinePlay()
    }

    const bindNudge = (v) => {
      if (v.readyState >= HTMLMediaElement.HAVE_METADATA) {
        queueMicrotask(nudge)
      } else {
        v.addEventListener('loadeddata', nudge, { once: true })
        v.addEventListener('canplay', nudge, { once: true })
      }
      const tid = window.setTimeout(nudge, 500)
      return () => {
        window.clearTimeout(tid)
        v.removeEventListener('loadeddata', nudge)
        v.removeEventListener('canplay', nudge)
      }
    }

    const v = videoRef.current
    if (v) {
      const unbind = bindNudge(v)
      return () => {
        cancelled = true
        unbind()
      }
    }

    const mountTid = window.setTimeout(nudge, 64)
    return () => {
      cancelled = true
      window.clearTimeout(mountTid)
    }
  }, [
    attachStream,
    coordinatorActive,
    feedAutoplayEnabled,
    isActive,
    lazyStream,
    lightboxOpen,
    mountStreamVideo,
    streamAttachKey,
    tileRatio,
    tryCoordinatedInlinePlay,
  ])

  /** Active tile visible but paused — gentle retry (no releaseStalledActive cascade). */
  useEffect(() => {
    if (!coordinatorActive || !feedAutoplayEnabled || !lazyStream || !isActive || !attachStream) {
      return undefined
    }
    if (tileRatio <= 0 || lightboxOpen || heroLocked) return undefined

    let ticks = 0
    const tick = () => {
      const v = videoRef.current
      if (!isActiveRef.current || lightboxOpenRef.current) return
      if (!v || !v.paused) {
        ticks = 0
        return
      }
      if (inlinePlayInFlightRef.current) return
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (nowMs < inlinePlayBackoffUntilMsRef.current) return
      if (v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      ticks += 1
      if (ticks > 10) return
      tryCoordinatedInlinePlay()
      if (ticks === 4 && lastPlayErrorRef.current.includes('NotAllowedError')) {
        scheduleRecompute()
      }
    }

    const intervalId = window.setInterval(tick, 1200)
    return () => window.clearInterval(intervalId)
  }, [
    attachStream,
    coordinatorActive,
    feedAutoplayEnabled,
    heroLocked,
    isActive,
    lazyStream,
    lightboxOpen,
    scheduleRecompute,
    tileRatio,
    tryCoordinatedInlinePlay,
  ])

  useEffect(() => {
    if (isActive || inRing) recoveryBurstRef.current = 0
  }, [isActive, inRing])

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

  const lastSoftResetEpochRef = useRef(0)
  useEffect(() => {
    if (!coordinatorActive || !softResetEpoch) return
    if (softResetEpoch === lastSoftResetEpochRef.current) return
    lastSoftResetEpochRef.current = softResetEpoch
    if (!attachStream && !mountStreamVideo) return
    recoveryBurstRef.current = 0
    setStreamAttachKey((k) => k + 1)
  }, [softResetEpoch, coordinatorActive, attachStream, mountStreamVideo])

  useStreamHlsAttachment(videoRef, src, streamAttachKey, {
    enabled: attachStream,
    feedStyleAbr: feedStyleAbr,
    ringWarmPrefetch,
    recoveryBurstRef,
    onAutoReattach: bumpStreamAttach,
    onDebugHlsError:
      videoDebugEnabled && feedAutoplayClientId
        ? (detail) => reportLoungeVideoDebugEvent(feedAutoplayClientId, 'hls', detail)
        : null,
  })

  const getVideoDebugSnapshot = useCallback(
    () => ({
      streamUid: id,
      variant,
      isActive,
      inRing,
      inDomBudget,
      mountStreamVideo,
      tileRatio,
      attachStream,
      ringWarmPrefetch,
      flingerMode,
      heroLocked,
      coordinatorActive,
      feedAutoplayEnabled,
      streamAttachKey,
      showStreamRetry,
      recoveryBurst: recoveryBurstRef.current,
      lastPlayError: lastPlayErrorRef.current,
      video: readLoungeVideoElementDebug(videoRef.current),
    }),
    [
      attachStream,
      coordinatorActive,
      feedAutoplayEnabled,
      flingerMode,
      heroLocked,
      id,
      inDomBudget,
      inRing,
      isActive,
      mountStreamVideo,
      ringWarmPrefetch,
      showStreamRetry,
      streamAttachKey,
      tileRatio,
      variant,
    ],
  )

  useLayoutEffect(() => {
    if (!videoDebugEnabled || !feedAutoplayClientId) return undefined
    return registerLoungeVideoDebugTile(feedAutoplayClientId, getVideoDebugSnapshot)
  }, [videoDebugEnabled, feedAutoplayClientId, getVideoDebugSnapshot])

  /** Fade HLS over CF thumbnail once playing (all variants with poster frame; when not `attachStream`, keep video hidden). */
  useEffect(() => {
    if (!poster) return undefined
    let cleaned = false
    let disarm = () => {}
    let rafId = 0

    queueMicrotask(() => {
      if (cleaned) return
      if (lightboxOpenRef.current) return
      if (!attachStream) {
        setStreamFadeShowVideo(false)
        return
      }
      if (streamFadeShowVideo && attachStream) return
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
    clearHeroFrameShield(videoFlyoutRef.current)
    heroFrameShieldRef.current = null
    heroTapSnapshotRef.current = null
    heroWantsSoundRef.current = true
    lightboxOpenRef.current = false
    exitFeedHeroLock()
    setLightboxOpen(false)
    setHeroPhase('idle')
    setHeroLayout(null)
    setHeroChromeVisible(false)
    setHeroTransitionArmed(false)
    setHeroBackdropArmed(false)
    heroFromRectRef.current = null
    heroTargetRectRef.current = null
  }, [exitFeedHeroLock])

  const closeLightbox = useCallback(() => {
    if (!lightboxOpenRef.current) return
    const slot = heroInlineSlotRef.current
    const back = slot
      ? readHeroMediaViewportRect(
          slot,
          videoFlyoutRef.current,
          containerRef.current,
          displayW,
          displayH,
        )
      : null
    if (heroRectUsableForShrinkBack(back)) {
      setHeroTransitionArmed(false)
      setHeroPhase('closing')
      setHeroChromeVisible(false)
      setHeroLayout(back)
      return
    }
    const snap = inlineFeedSoundSnapshotRef.current
    inlineFeedSoundSnapshotRef.current = null
    if (snap && feedAutoplayEnabled) {
      try {
        setLocalStripSoundUnmuted(snap.unmuted)
        setLocalStripSoundExplicitlyMuted(snap.explicitlyMuted)
        const v = videoRef.current
        if (v) v.muted = !snap.unmuted
      } catch {
        // ignore
      }
    }
    finalizeHeroClose()
  }, [feedAutoplayEnabled, finalizeHeroClose, displayW, displayH])

  const toggleHeroVideoPlayPause = useCallback(() => {
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
  }, [])

  const onHeroGestureTap = useCallback(
    (e) => {
      if (heroPhaseRef.current !== 'open') return
      const layout = heroTargetRectRef.current || heroLayout
      const cx = e?.clientX
      const cy = e?.clientY
      if (layout && typeof cx === 'number' && typeof cy === 'number') {
        const inside =
          cx >= layout.left &&
          cx <= layout.left + layout.width &&
          cy >= layout.top &&
          cy <= layout.top + layout.height
        if (inside) {
          toggleHeroVideoPlayPause()
          return
        }
        closeLightbox()
        return
      }
      toggleHeroVideoPlayPause()
    },
    [closeLightbox, heroLayout, toggleHeroVideoPlayPause],
  )

  const { swipeSurfaceProps: heroSwipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose: closeLightbox,
    onTap: onHeroGestureTap,
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
    if (lightboxOpenRef.current) return
    const slot = heroInlineSlotRef.current
    const wrap = containerRef.current
    const flyout = videoFlyoutRef.current
    const v = videoRef.current
    if (!wrap) return

    lightboxOpenRef.current = true
    if (feedAutoplayClientId && coordinatorActive) {
      enterFeedHeroLock(feedAutoplayClientId)
      forceFeedAutoplayActive(feedAutoplayClientId)
    }
    notifyLoungeStreamLightboxOpen(true)
    flushSync(() => setLightboxOpen(true))
    pauseOtherLoungeStreamVideos(v)

    const from = readHeroMediaViewportRect(slot, flyout, wrap, displayW, displayH)
    const target = computeHeroTargetRect(from)
    heroFromRectRef.current = from
    heroTargetRectRef.current = target

    const hadDecodedVideo = Boolean(
      v &&
        (streamFadeShowVideo ||
          v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ||
          (v.readyState >= HTMLMediaElement.HAVE_METADATA && v.currentTime > 0)),
    )
    const tapShowVideo = streamFadeShowVideo || hadDecodedVideo
    heroTapSnapshotRef.current = {
      showVideo: tapShowVideo,
      readyState: v?.readyState ?? 0,
      fromRect: from,
    }
    if (tapShowVideo) setStreamFadeShowVideo(true)

    pinInlinePosterBehindFlyout(slot)
    /** Card-hole poster only when inline was still on poster — flyout grows immediately like X. */
    if (!tapShowVideo) revealInlinePosterForHero(slot)

    const host = ensureHeroBodyHost()
    snapFlyoutToHeroTile(flyout, host, from)

    heroFrameShieldRef.current = null
    if (tapShowVideo && v && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      heroFrameShieldRef.current = mountHeroFrameShield(flyout, v, from.width, from.height)
    }

    setHeroLayout(from)
    setHeroPhase('opening')
    setHeroChromeVisible(false)
    setHeroTransitionArmed(false)
    setHeroBackdropArmed(false)

    if (feedAutoplayEnabled && v) {
      heroWantsSoundRef.current = true
      inlineFeedSoundSnapshotRef.current = {
        unmuted: stripSoundUnmuted,
        explicitlyMuted: localStripSoundExplicitlyMuted,
      }
      try {
        setLocalStripSoundUnmuted(true)
        setLocalStripSoundExplicitlyMuted(false)
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
    } else {
      heroWantsSoundRef.current = false
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
  }, [
    feedAutoplayEnabled,
    attachStream,
    coordinatorActive,
    feedAutoplayClientId,
    localStripSoundExplicitlyMuted,
    stripSoundUnmuted,
    ensureHeroBodyHost,
    displayW,
    displayH,
    streamFadeShowVideo,
    forceFeedAutoplayActive,
    enterFeedHeroLock,
  ])

  /** Bottom strip: per-tile mute toggle (user gesture unmutes this clip only). */
  const onSoundStripPress = useCallback(() => {
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
    if (feedAutoplayClientId && coordinatorActive && !isActive) {
      forceFeedAutoplayActive(feedAutoplayClientId)
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
    localStripSoundUnmuted,
    coordinatorActive,
    openLightbox,
    feedAutoplayClientId,
    isActive,
    forceFeedAutoplayActive,
  ])

  useEffect(() => {
    lightboxOpenRef.current = lightboxOpen
  }, [lightboxOpen])

  useEffect(() => {
    if (!lightboxOpen || !enableLightbox) return undefined
    return () => {
      notifyLoungeStreamLightboxOpen(false)
      exitFeedHeroLock()
    }
  }, [lightboxOpen, enableLightbox, exitFeedHeroLock])

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

  /** Hero open/close: FLIP invert (no transition), then one rAF later animate transform to identity. */
  useLayoutEffect(() => {
    if (!lightboxOpen) return undefined
    if (heroPhase !== 'opening' && heroPhase !== 'closing') return undefined

    setHeroTransitionArmed(false)
    if (heroPhase === 'opening') setHeroBackdropArmed(false)

    let cancelled = false

    const armBackdrop = () => {
      if (!cancelled && heroPhaseRef.current === 'opening') setHeroBackdropArmed(true)
    }

    const armBackdropAfterFlyoutPaint = () => {
      if (cancelled || heroPhaseRef.current !== 'opening') return
      const v = videoRef.current
      const flyout = videoFlyoutRef.current
      const onPainted = () => {
        if (cancelled) return
        clearHeroFrameShield(flyout)
        heroFrameShieldRef.current = null
        armBackdrop()
      }
      afterHeroFlyoutPainted(v, onPainted)
    }

    const raf = requestAnimationFrame(() => {
      if (cancelled || (heroPhaseRef.current !== 'opening' && heroPhaseRef.current !== 'closing')) return
      setHeroTransitionArmed(true)
      if (heroPhaseRef.current === 'opening') {
        requestAnimationFrame(() => {
          if (!cancelled) armBackdropAfterFlyoutPaint()
        })
      }
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [lightboxOpen, heroPhase])

  /** iOS sometimes skips `transitionend` on transform — ensure chrome still appears after land. */
  useEffect(() => {
    if (heroPhase !== 'opening' || heroChromeVisible) return undefined
    const tid = window.setTimeout(() => {
      if (heroPhaseRef.current !== 'opening') return
      clearHeroFrameShield(videoFlyoutRef.current)
      heroFrameShieldRef.current = null
      if (heroTargetRectRef.current) setHeroLayout(heroTargetRectRef.current)
      setHeroPhase('open')
      setHeroChromeVisible(true)
    }, HERO_EXPAND_MS + 96)
    return () => window.clearTimeout(tid)
  }, [heroPhase, heroChromeVisible])

  useEffect(() => {
    const flyout = videoFlyoutRef.current
    if (!flyout) return undefined
    const onTransitionEnd = (e) => {
      if (e.target !== flyout || e.propertyName !== 'transform') return
      const phase = heroPhaseRef.current
      if (phase === 'opening') {
        clearHeroFrameShield(videoFlyoutRef.current)
        heroFrameShieldRef.current = null
        if (heroTargetRectRef.current) setHeroLayout(heroTargetRectRef.current)
        setHeroPhase('open')
        requestAnimationFrame(() => setHeroChromeVisible(true))
      }
      if (phase === 'closing') {
        const snap = inlineFeedSoundSnapshotRef.current
        inlineFeedSoundSnapshotRef.current = null
        if (snap && feedAutoplayEnabled) {
          try {
            setLocalStripSoundUnmuted(snap.unmuted)
            setLocalStripSoundExplicitlyMuted(snap.explicitlyMuted)
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
    finalizeHeroClose,
  ])

  /** Coordinated: track in-view locally. Scroll root drives coordinator recompute (avoid per-tile IO storms). */
  useEffect(() => {
    const wrap = containerRef.current
    const v = videoRef.current
    if (!wrap || !v || !showOpen || !id) return undefined

    const root = visibilityResetRootRef?.current ?? null
    const thresholds = [0, 0.02, 0.04, 0.08, 0.12, 0.18, 0.25, 0.35, 0.5, 0.65, 0.8, 1]

    if (coordinatorActive && lazyStream) {
      const applyIo = (entries) => {
        const e = entries[0]
        const ratio = typeof e?.intersectionRatio === 'number' ? e.intersectionRatio : 0
        inViewRef.current = Boolean(e?.isIntersecting && ratio > 0)
      }
      let io
      try {
        io = new IntersectionObserver(applyIo, { root, rootMargin: '0px', threshold: [0, 0.5, 1] })
      } catch {
        io = new IntersectionObserver(applyIo, { root: null, rootMargin: '0px', threshold: [0, 0.5, 1] })
      }
      io.observe(wrap)
      return () => io.disconnect()
    }

    const applyIo = (entries) => {
      const e = entries[0]
      const ratio = typeof e?.intersectionRatio === 'number' ? e.intersectionRatio : 0
      const attachOk = Boolean(e?.isIntersecting && (ratio >= LAZY_ATTACH_IO_THRESHOLD || ratio === 1))
      inViewRef.current = attachOk
      setStreamInView(attachOk)
      if (lightboxOpenRef.current) return
      if (!feedAutoplayEnabled) return
      if (!attachOk) {
        try {
          v.pause()
        } catch {
          // ignore
        }
        return
      }
      try {
        v.muted = !localStripSoundUnmuted
        const p = v.play()
        if (p && typeof p.catch === 'function') p.catch(() => {})
      } catch {
        // ignore
      }
    }

    let io
    try {
      io = new IntersectionObserver(applyIo, {
        root,
        rootMargin: '0px',
        threshold: thresholds,
      })
    } catch {
      io = new IntersectionObserver(applyIo, {
        root: null,
        rootMargin: '0px',
        threshold: thresholds,
      })
    }
    io.observe(wrap)
    return () => io.disconnect()
  }, [
    id,
    showOpen,
    lazyStream,
    coordinatorActive,
    visibilityResetRootRef,
    streamAttachKey,
    localStripSoundUnmuted,
    feedAutoplayEnabled,
  ])

  /** After lazy HLS attach, start playback once media is ready — active tile only (never prefetch ring). */
  useEffect(() => {
    if (!lazyStream || !attachStream) return undefined
    if (!showOpen) return undefined
    const heroTile = lightboxOpenRef.current
    if (coordinatorActive && !isActive && !heroTile) return undefined
    if (!coordinatorActive && !inViewRef.current && !heroTile) return undefined
    const v = videoRef.current
    if (!v) return undefined
    let cleaned = false
    const go = () => {
      if (cleaned) return
      if (anyStreamLightboxOpen && !lightboxOpenRef.current) return
      if (heroLocked && !lightboxOpenRef.current) return
      if (coordinatorActive && !isActiveRef.current && !lightboxOpenRef.current) return
      if (lightboxOpenRef.current) {
        try {
          if (heroWantsSoundRef.current) v.muted = false
          const p = v.play()
          if (p && typeof p.catch === 'function') p.catch(() => {})
        } catch {
          // ignore
        }
        return
      }
      if (coordinatorActive && isActiveRef.current) {
        tryCoordinatedInlinePlay()
        return
      }
      try {
        v.muted = !localStripSoundUnmutedRef.current
        const p = v.play()
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            scheduleRecompute()
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
    isActive,
    flingerMode,
    heroLocked,
    anyStreamLightboxOpen,
    tryCoordinatedInlinePlay,
    scheduleRecompute,
  ])

  /** Hero / lightbox open: ensure the same inline `<video>` keeps playing once HLS attaches (autoplay-off path). */
  useEffect(() => {
    if (!lightboxOpen || !attachStream) return undefined
    const v = videoRef.current
    if (!v) return undefined
    const tryPlay = () => {
      try {
        if (heroWantsSoundRef.current) v.muted = false
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
    if (coordinatorActive) {
      if (!isActive && !inRing) return
    } else if (!inViewRef.current) {
      return
    }
    if (coordinatorActive && !isActive) {
      try {
        v.pause()
      } catch {
        // ignore
      }
      return
    }
    if (coordinatorActive && isActive) {
      tryCoordinatedInlinePlay()
      return
    }
    try {
      v.muted = !localStripSoundUnmutedRef.current
      const p = v.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    } catch {
      // ignore
    }
  }, [
    lightboxOpen,
    showOpen,
    coordinatorActive,
    isActive,
    inRing,
    flingerMode,
    feedAutoplayEnabled,
    anyStreamLightboxOpen,
    tryCoordinatedInlinePlay,
  ])

  const onInlineStreamError = useCallback(() => {
    if (videoDebugEnabled && feedAutoplayClientId) {
      const v = videoRef.current
      const code = v?.error?.code
      reportLoungeVideoDebugEvent(
        feedAutoplayClientId,
        'video',
        code != null ? `media error code ${code}` : 'media element error',
      )
    }
    if (recoveryBurstRef.current < 2) {
      recoveryBurstRef.current += 1
      setShowStreamRetry(false)
      setStreamAttachKey((k) => k + 1)
      return
    }
    setShowStreamRetry(true)
  }, [feedAutoplayClientId, videoDebugEnabled])

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
  const heroTapShowVideo = heroTapSnapshotRef.current?.showVideo
  const effectiveStreamFadeShowVideo =
    heroExpanded && heroTapSnapshotRef.current ? heroTapShowVideo : streamFadeShowVideo
  /** Same delay on poster + video keeps poster visible through transparent video until fade starts (reduces black flash). */
  const streamFadeTransitionStyle =
    attachStream && !heroExpanded
      ? {
          transitionDuration: `${STREAM_ATTACH_FADE_MS}ms`,
          transitionDelay: streamFadeShowVideo ? `${STREAM_POSTER_FADE_DELAY_MS}ms` : '0ms',
        }
      : undefined
  const heroAnimating =
    heroTransitionArmed && (heroPhase === 'opening' || heroPhase === 'closing')
  const heroTransformTransition = heroAnimating
    ? `transform ${HERO_MOTION_TRANSITION}, border-radius ${HERO_MOTION_TRANSITION}`
    : 'none'
  let heroFlipTransform = 'none'
  if (heroExpanded && heroLayout && heroTransitionArmed) {
    if (heroPhase === 'opening' && heroFromRectRef.current && heroTargetRectRef.current) {
      heroFlipTransform = computeHeroExpandTransform(heroFromRectRef.current, heroTargetRectRef.current)
    }
  } else if (heroExpanded && heroLayout && !heroTransitionArmed && heroPhase === 'closing' && heroTargetRectRef.current) {
    heroFlipTransform = computeHeroShrinkTransform(heroTargetRectRef.current, heroLayout)
  }
  const heroFlyoutStyle =
    heroExpanded && heroLayout
      ? {
          position: 'fixed',
          top: heroLayout.top,
          left: heroLayout.left,
          width: heroLayout.width,
          height: heroLayout.height,
          zIndex: HERO_FLYOUT_Z_INDEX,
          transformOrigin: '0 0',
          transform: heroFlipTransform,
          transition: heroTransformTransition,
          borderRadius: heroPhase === 'open' ? 0 : 12,
          willChange: heroAnimating ? 'transform' : undefined,
          ...heroSwipeDragStyle,
        }
      : undefined
  const heroFlyoutShellClass = heroExpanded
    ? `overflow-hidden ${heroPhase === 'opening' ? 'bg-transparent' : 'bg-black'} touch-none`.trim()
    : 'absolute inset-0 z-[1] h-full w-full overflow-hidden bg-transparent'
  const heroFlyoutPointerProps = {}
  const inlineVideoOpacityClass =
    heroExpanded || (attachStream && effectiveStreamFadeShowVideo) ? 'opacity-100' : 'opacity-0'
  const inlinePosterOpacityClass =
    heroExpanded || !(attachStream && effectiveStreamFadeShowVideo) ? 'opacity-100' : 'opacity-0'
  /** During HLS load poster sits above the flyout; during hero it stays behind (fills the card hole only). */
  const inlinePosterZClass =
    !heroExpanded && attachStream && !effectiveStreamFadeShowVideo ? 'z-[2]' : 'relative z-0'
  /** Hero: touches on the flyout shell (swipe dismiss); video stays paint-only so iOS does not steal gestures. */
  const streamVideoClass = heroExpanded
    ? 'pointer-events-none h-full w-full max-h-full max-w-full object-contain'
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
  const streamVideoEl = mountStreamVideo ? (
    <video
      ref={videoRef}
      className={`${streamVideoClass} ${heroExpanded ? '' : 'transition-opacity ease-out'} ${inlineVideoOpacityClass}`}
      style={heroExpanded ? undefined : streamFadeTransitionStyle}
      controls={false}
      controlsList="nodownload"
      {...streamVideoMutedProps}
      loop
      playsInline
      preload={
        variant === 'composer'
          ? 'auto'
          : coordinatorActive && isActive && attachStream
            ? 'auto'
            : 'metadata'
      }
      poster={visiblePosterSrc || poster}
      aria-label={heroExpanded ? 'Post video (full screen)' : undefined}
      aria-hidden={!heroExpanded}
      onError={onInlineStreamError}
    />
  ) : null

  return (
    <div className={`${firstMarginTopClass} inline-flex shrink-0 self-start ${slideMaxW}`}>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        data-lounge-video-zoom
        {...(videoDebugEnabled && feedAutoplayClientId
          ? { 'data-lounge-autoplay-id': feedAutoplayClientId }
          : {})}
        className={`relative block w-fit max-w-full cursor-pointer overflow-hidden ${rounding} border ${border} bg-black touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50`}
          aria-label={
            showOpen
              ? !feedAutoplayEnabled
                ? 'Post video. Tap play for full screen.'
                : stripSoundUnmuted
                  ? 'Post video, sound on. Tap for full screen.'
                  : 'Post video, playing muted. Tap for full screen. Unmute with bottom-left icon.'
              : 'Post video'
          }
          title={
            showOpen
              ? !feedAutoplayEnabled
                ? 'Tap play for full screen'
                : stripSoundUnmuted
                  ? 'Tap video for full screen; bottom-left icon mutes'
                  : 'Tap video for full screen; bottom-left icon unmutes'
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
              aria-label={stripSoundUnmuted ? 'Mute video' : 'Unmute video'}
              className="absolute bottom-2 left-2 z-[3] inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-zinc-100 touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50 sm:bottom-2.5 sm:left-2.5"
              onClick={(e) => {
                e.stopPropagation()
                onSoundStripPress()
              }}
            >
              {stripSoundUnmuted ? (
                <SoundOnGlyph className="h-5 w-5 opacity-90" />
              ) : (
                <MutedGlyph className="h-5 w-5 opacity-90" />
              )}
            </button>
          ) : null}
        </div>
      {heroExpanded
        ? createPortal(
            <>
              <div
                className="pointer-events-none fixed inset-0"
                style={{ zIndex: HERO_SCRIM_Z_INDEX }}
                aria-hidden
              >
                <div
                  className={`absolute inset-0 bg-black ${heroBackdropOpacityClass}`}
                  style={{ transition: heroBackdropTransitionCss }}
                />
              </div>
              <div
                className="fixed inset-0"
                style={{ zIndex: heroOverlayZIndex }}
                role="dialog"
                aria-modal="true"
                aria-label="Full screen video"
              >
                {heroBackdropInteractive ? (
                  <div
                    className={`absolute inset-0 ${heroSwipeTouchClass || 'touch-none'}`.trim()}
                    aria-hidden
                    onPointerDown={heroSwipePointerDown}
                    onPointerMove={heroSwipePointerMove}
                    onPointerUp={heroSwipePointerUp}
                    onPointerCancel={heroSwipePointerCancel}
                  />
                ) : null}
                <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col">
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
                      data-lounge-lightbox-no-swipe
                      onClick={(e) => e.stopPropagation()}
                    >
                      {heroChromeVisible ? mediaLightboxFooterMerged : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
