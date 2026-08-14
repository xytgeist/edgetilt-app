import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD,
  LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS,
} from './LoungeStreamVideoLightboxChrome.jsx'
import { useLoungeLightboxImageZoom } from './loungeLightboxImageZoom.js'
import { useLoungeLightboxSwipeDismiss } from './loungeLightboxSwipeDismiss.js'
import { useLoungeLightboxCarouselSnap } from './useLoungeLightboxCarouselSnap.js'
import { notifyLoungeStreamLightboxOpen } from './loungeStreamLightboxRegistry.js'
import {
  clearFlyoutHeroInlineStyles,
  computeHeroTargetRect,
  HERO_CHROME_FADE_MS,
  HERO_EXPAND_MS,
  heroRectUsableForShrinkBack,
  isLoungeLightboxGifUrl,
  mediaFitsChromeBand,
  readContainedImageViewportRect,
  readElementViewportRect,
  resolveLoungeHeroStackZIndexes,
  runHeroExpandAnimation,
  runHeroShrinkAnimation,
  snapFlyoutToHeroOpen,
} from './loungeLightboxFlip.js'
import {
  loungeFeedImageDeliveryUrl,
  markLoungeCfImageResizeUnavailable,
} from '../../utils/loungeCfImageMedia.js'
import {
  loungeFeedAttachmentFrameClassName,
  loungeFeedAttachmentImgClassName,
  loungeFeedAttachmentOuterShellClassName,
  loungeFeedAttachmentTapTargetClassName,
  loungeFeedImageAttachmentTier,
} from './loungeFeedImageAttachment.js'
import MediaLightboxAmbientBackdrop from '../../components/MediaLightboxAmbientBackdrop.jsx'

function normalizeUrlList(urls) {
  if (!Array.isArray(urls)) return []
  return urls.map((u) => String(u ?? '').trim()).filter(Boolean)
}

/**
 * After a carousel snap, keep the ambient layer that already shows `index` visible.
 * Forcing layer A to opacity 1 while its src is still the previous slide flashes the
 * blur fill (and can look like the sharp image flashed) after the pager settles.
 */
function settleLoungeLightboxAmbient(index, pairRef, aWrap, bWrap, setPair) {
  const pair = pairRef.current
  const readOp = (el, fallback) => {
    if (!el) return fallback
    const v = Number.parseFloat(el.style.opacity)
    return Number.isFinite(v) ? v : fallback
  }
  const aOp = readOp(aWrap, 1)
  const bOp = readOp(bWrap, 0)
  const aHas = pair.a === index
  const bHas = pair.b === index
  // Prefer the layer that already paints this slide. If both do, keep whichever is on-screen
  // … flipping to A while it is still decoding the new src is the post-snap flash.
  const showB = bHas && (!aHas || bOp >= aOp)
  if (aWrap) aWrap.style.opacity = showB ? '0' : '1'
  if (bWrap) bWrap.style.opacity = showB ? '1' : '0'
  if (pair.a === index && pair.b === index) return
  pairRef.current = { a: index, b: index }
  setPair({ a: index, b: index })
}

/**
 * CF Image Resizing miss → disable resize for the session and retry this img once with the
 * stored R2 URL. Do not cascade every slide onto multi‑MB originals in the same tick.
 */
/**
 * Feed 960 stays mounted. Lightbox 2048 sits on top at opacity 0 until it can paint.
 * Never swap `src` on the visible img … that is the carousel-settle flash after CF resize.
 */
function LoungeLightboxStackedPhoto({
  storedUrl,
  loadSharp,
  className,
  imgRef,
  onAspect,
  fetchPriority,
}) {
  const feedSrc = loungeFeedImageDeliveryUrl(storedUrl, 'feed')
  const sharpSrc = loungeFeedImageDeliveryUrl(storedUrl, 'lightbox')
  const sharpIsSeparate = Boolean(loadSharp && sharpSrc && sharpSrc !== feedSrc)
  const [sharpOn, setSharpOn] = useState(false)
  const sharpElRef = useRef(/** @type {HTMLImageElement | null} */ (null))

  const revealSharp = useCallback(() => {
    setSharpOn(true)
  }, [])

  useLayoutEffect(() => {
    if (!sharpIsSeparate) {
      setSharpOn(false)
      return
    }
    const el = sharpElRef.current
    // Cached 2048: show before paint so swipe-back does not flash opacity 0→1.
    if (el && el.complete && el.naturalWidth > 0) setSharpOn(true)
  }, [sharpIsSeparate, sharpSrc])

  const setSharpNode = useCallback(
    (node) => {
      sharpElRef.current = node
      if (typeof imgRef === 'function') imgRef(node)
      else if (imgRef) imgRef.current = node
    },
    [imgRef],
  )

  return (
    <>
      <img
        ref={sharpIsSeparate ? undefined : imgRef}
        src={feedSrc}
        alt=""
        className={className}
        loading="eager"
        decoding="async"
        draggable={false}
        onLoad={(e) => onAspect?.(e.currentTarget)}
        onError={(e) => onLoungeLightboxImgError(e, storedUrl)}
      />
      {sharpIsSeparate ? (
        <img
          ref={setSharpNode}
          data-lounge-lightbox-sharp=""
          src={sharpSrc}
          alt=""
          className="pointer-events-none absolute inset-0 z-[1] h-full w-full select-none object-contain"
          style={{ opacity: sharpOn ? 1 : 0 }}
          loading="eager"
          fetchPriority={fetchPriority}
          decoding="async"
          draggable={false}
          onLoad={(e) => {
            onAspect?.(e.currentTarget)
            const el = e.currentTarget
            if (typeof el.decode === 'function') {
              el.decode().then(revealSharp).catch(revealSharp)
            } else {
              revealSharp()
            }
          }}
          onError={(e) => onLoungeLightboxImgError(e, storedUrl)}
        />
      ) : null}
    </>
  )
}

function onLoungeLightboxImgError(e, storedUrl) {
  const el = e?.currentTarget
  if (!(el instanceof HTMLImageElement)) return
  const raw = String(storedUrl || '').trim()
  if (!raw || el.dataset.loungeImgFallback === '1') return
  el.dataset.loungeImgFallback = '1'
  const failed = String(el.currentSrc || el.src || '')
  if (!failed.includes('/cdn-cgi/image/')) return
  markLoungeCfImageResizeUnavailable()
  el.src = raw
}

/**
 * @param {HTMLImageElement | null | undefined} img
 * @returns {number | null} width/height, or null if unknown
 */
function readImageAspectRatio(img) {
  if (!(img instanceof HTMLImageElement)) return null
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (!(w > 0 && h > 0)) return null
  return w / h
}

/**
 * Pad the media shell so flex-centering sits in the band between top chrome bottom
 * and the top of footer chrome (avatar row, or interaction pills when compact).
 * @param {HTMLElement | null | undefined} shell
 * @param {HTMLElement | null | undefined} topChrome
 * @param {HTMLElement | null | undefined} footerChrome
 * @returns {{ top: number, bottom: number }}
 */
function measureImageLightboxMediaBand(shell, topChrome, footerChrome) {
  if (!(shell instanceof HTMLElement) || !(topChrome instanceof HTMLElement)) {
    return { top: 0, bottom: 0 }
  }
  const shellRect = shell.getBoundingClientRect()
  if (!(shellRect.width > 0 && shellRect.height > 0)) return { top: 0, bottom: 0 }
  const topRect = topChrome.getBoundingClientRect()
  const top = Math.max(0, Math.round(topRect.bottom - shellRect.top))
  let bottom = 0
  if (footerChrome instanceof HTMLElement) {
    const footRect = footerChrome.getBoundingClientRect()
    bottom = Math.max(0, Math.round(shellRect.bottom - footRect.top))
  }
  // Keep a usable band if chrome measurement glitches (e.g. display:none mid-unmount).
  if (top + bottom >= shellRect.height - 8) return { top: 0, bottom: 0 }
  return { top, bottom }
}

/**
 * Full-screen image/GIF viewer with tile↔hero FLIP (same motion language as Stream video).
 * Pass `urls` + `initialIndex` for multi-image navigation; or legacy single `url`.
 * @param {{ top: number, left: number, width: number, height: number } | null} [fromRect]
 * @param {(index: number) => ({ top: number, left: number, width: number, height: number } | null | undefined)} [getOriginRect]
 */
export function LoungeImageLightbox({
  url,
  urls,
  initialIndex = 0,
  onClose,
  fromRect = null,
  getOriginRect = null,
  /** Stored `gif_url` when this lightbox includes a Klipy/external GIF (host may not say klipy). */
  gifUrl = '',
  /** Tailwind z-index on the portaled shell (default below profile sheet `z-[101]`). */
  lightboxPortalClass = 'z-[100]',
  /** `() => ReactNode` - top-right ⋯ menu (no autoplay toggle for images). */
  renderMediaLightboxMenu,
  /**
   * `(chromeOpts?: { showAuthorMeta?: boolean }) => ReactNode` - Follow left of ⋯.
   * Compact (opening slide taller than wide) passes `showAuthorMeta: false` so Follow stays available.
   */
  renderMediaLightboxTopBarExtra,
  /**
   * `(dismissLightbox, chromeOpts?: { showAuthorMeta?: boolean }) => ReactNode` - Stream hero chrome.
   * Opening-slide aspect locks chrome for the session (`natural height > width` → pills only).
   */
  renderMediaLightboxChrome,
  /** `(dismissLightbox) => ReactNode` - legacy pill row only (used if chrome is omitted). */
  renderMediaLightboxInteractionBar,
}) {
  const list = useMemo(() => {
    const fromArr = normalizeUrlList(urls)
    if (fromArr.length) return fromArr
    const one = url != null ? String(url).trim() : ''
    return one ? [one] : []
  }, [url, urls])

  const [idx, setIdx] = useState(0)
  /** Dual ambient layers crossfade on scroll (DOM opacity); pair indices update at slide boundaries. */
  const [ambientPair, setAmbientPair] = useState({ a: 0, b: 0 })
  const ambientAWrapRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const ambientBWrapRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const ambientPairRef = useRef({ a: 0, b: 0 })
  const listKey = list.join('\n')
  const [prevListKey, setPrevListKey] = useState(null)
  const [prevInitialIndex, setPrevInitialIndex] = useState(null)
  if (prevListKey !== listKey || prevInitialIndex !== initialIndex) {
    setPrevListKey(listKey)
    setPrevInitialIndex(initialIndex)
    const n = list.length
    const nextIdx = n === 0 ? 0 : Math.max(0, Math.min(initialIndex, n - 1))
    setIdx(nextIdx)
    setAmbientPair({ a: nextIdx, b: nextIdx })
    ambientPairRef.current = { a: nextIdx, b: nextIdx }
  }

  const current = list[idx] || ''
  /** Feed-tier for blur fill (same as the working swipe crossfade … not gated on CF resize). */
  const ambientDisplaySrc = loungeFeedImageDeliveryUrl(current, 'feed')
  const multi = list.length > 1

  const zStack = useMemo(
    () => resolveLoungeHeroStackZIndexes(lightboxPortalClass),
    [lightboxPortalClass],
  )

  const openFromRectRef = useRef(
    heroRectUsableForShrinkBack(fromRect) ? fromRect : null,
  )
  const targetRectRef = useRef(null)
  const closeHeroFrameRef = useRef(null)
  const flyoutRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const expandAnimRef = useRef(/** @type {Animation | null} */ (null))
  const shrinkAnimRef = useRef(/** @type {Animation | null} */ (null))
  const expandTimerRef = useRef(0)
  const shrinkTimerRef = useRef(0)
  const closingRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const getOriginRectRef = useRef(getOriginRect)
  getOriginRectRef.current = getOriginRect

  const wantsFlipOpen = Boolean(openFromRectRef.current)
  const [phase, setPhase] = useState(/** @type {'opening' | 'open' | 'closing'} */ (wantsFlipOpen ? 'opening' : 'open'))
  const [chromeVisible, setChromeVisible] = useState(!wantsFlipOpen)
  const [scrimOpacity, setScrimOpacity] = useState(wantsFlipOpen ? 0 : 1)
  const [dismissProgress, setDismissProgress] = useState(0)
  /** After land, wait before decoding ±1 neighbors (fat originals OOM if all fire on open). */
  const [neighborLoadReady, setNeighborLoadReady] = useState(false)

  const mediaContainerRef = useRef(null)
  const mediaImageRef = useRef(null)
  const carouselScrollRef = useRef(null)
  const topChromeRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const footerChromeRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const idxRef = useRef(idx)
  idxRef.current = idx
  /** Landed hero frame … open media shells match this so lifting the flyout is not a geometry pop. */
  const [landFrame, setLandFrame] = useState(
    /** @type {{ top: number, left: number, width: number, height: number } | null} */ (null),
  )
  const landSlideIndexRef = useRef(Math.max(0, Math.min(initialIndex, Math.max(list.length - 1, 0))))
  /** Opening slide locks chrome mode for the whole lightbox session (no per-slide flip). */
  const chromeLockIndexRef = useRef(landSlideIndexRef.current)
  /** Per-slide natural width/height. `>= 1` → square/landscape (full chrome). */
  const [aspectByIndex, setAspectByIndex] = useState(/** @type {Record<number, number>} */ ({}))
  const lockedAspect = aspectByIndex[chromeLockIndexRef.current] ?? null
  /**
   * Chrome-band pads cached per footer mode. Carousel slides all share the locked mode’s pad.
   */
  const [bandByMode, setBandByMode] = useState({
    full: { top: 0, bottom: 0 },
    compact: { top: 0, bottom: 0 },
  })
  // Opening slide: height <= width → full author chrome for the session. Taller → pills only.
  const showAuthorMeta = lockedAspect == null || lockedAspect >= 1
  const chromeOpts = useMemo(() => ({ showAuthorMeta }), [showAuthorMeta])

  const noteSlideAspectAt = useCallback((img, slideIndex) => {
    const next = readImageAspectRatio(img)
    if (next == null || !Number.isFinite(slideIndex)) return
    setAspectByIndex((prev) => {
      const prevA = prev[slideIndex]
      if (prevA != null && Math.abs(prevA - next) < 0.0001) return prev
      return { ...prev, [slideIndex]: next }
    })
  }, [])

  const bandPadForSlide = useCallback(() => {
    const primary = showAuthorMeta ? bandByMode.full : bandByMode.compact
    if (primary.top > 0 || primary.bottom > 0) return primary
    return showAuthorMeta ? bandByMode.compact : bandByMode.full
  }, [showAuthorMeta, bandByMode])

  /**
   * Chrome-band padding only when this slide is still short enough at full width.
   * Tall slides stay edge-to-edge (media may run under the pills).
   */
  const bandPadIfFits = useCallback(
    (slideIndex) => {
      const pad = bandPadForSlide()
      if (!(pad.top > 0 || pad.bottom > 0)) return null
      const aspect = aspectByIndex[slideIndex] ?? lockedAspect
      if (aspect == null) return null
      const vv = typeof window !== 'undefined' ? window.visualViewport : null
      const vw = vv?.width ?? (typeof window !== 'undefined' ? window.innerWidth : 0)
      const vh = vv?.height ?? (typeof window !== 'undefined' ? window.innerHeight : 0)
      if (!mediaFitsChromeBand(aspect, pad, vw, vh)) return null
      return pad
    },
    [aspectByIndex, lockedAspect, bandPadForSlide],
  )

  const syncMediaBandPad = useCallback(() => {
    const next = measureImageLightboxMediaBand(
      mediaContainerRef.current,
      topChromeRef.current,
      footerChromeRef.current,
    )
    const mode = showAuthorMeta ? 'full' : 'compact'
    setBandByMode((prev) => {
      const cur = prev[mode]
      if (cur.top === next.top && cur.bottom === next.bottom) return prev
      return { ...prev, [mode]: next }
    })
  }, [showAuthorMeta])

  useEffect(() => {
    if (phase !== 'open') {
      setNeighborLoadReady(false)
      return undefined
    }
    const t = window.setTimeout(() => setNeighborLoadReady(true), 450)
    return () => window.clearTimeout(t)
  }, [phase])

  // Warm neighbor lightbox decode + ambient (feed-tier) after open settle.
  useEffect(() => {
    if (phase !== 'open' || !neighborLoadReady || !list.length) return undefined
    let cancelled = false
    const n = list.length
    const center = Math.max(0, Math.min(idx, n - 1))
    const indexes = new Set([center - 1, center + 1].filter((i) => i >= 0 && i < n))
    indexes.forEach((i) => {
      const url = list[i]
      const img = new Image()
      img.decoding = 'async'
      img.src = loungeFeedImageDeliveryUrl(url, 'lightbox')
      img.onload = () => {
        if (!cancelled) noteSlideAspectAt(img, i)
      }
      img.onerror = () => {
        if (cancelled || img.dataset.loungeImgFallback === '1') return
        const failed = String(img.src || '')
        if (!failed.includes('/cdn-cgi/image/')) return
        img.dataset.loungeImgFallback = '1'
        markLoungeCfImageResizeUnavailable()
        img.src = url
      }
      const ambientImg = new Image()
      ambientImg.decoding = 'async'
      ambientImg.src = loungeFeedImageDeliveryUrl(url, 'feed')
    })
    return () => {
      cancelled = true
    }
  }, [phase, neighborLoadReady, list, listKey, idx, noteSlideAspectAt])

  const scrollToSlide = useCallback(
    (targetIdx, behavior = 'smooth') => {
      if (list.length <= 1) {
        setIdx(targetIdx)
        return
      }
      const el = carouselScrollRef.current
      if (!el) {
        setIdx(targetIdx)
        return
      }
      const w = el.clientWidth
      if (!w) {
        setIdx(targetIdx)
        return
      }
      const left = targetIdx * w
      try {
        el.scrollTo({ left, behavior })
      } catch {
        el.scrollLeft = left
      }
      setIdx(targetIdx)
    },
    [list.length],
  )

  const goPrev = useCallback(() => {
    if (list.length <= 1) return
    const next = idx <= 0 ? list.length - 1 : idx - 1
    scrollToSlide(next)
  }, [idx, list.length, scrollToSlide])

  const goNext = useCallback(() => {
    if (list.length <= 1) return
    const next = idx >= list.length - 1 ? 0 : idx + 1
    scrollToSlide(next)
  }, [idx, list.length, scrollToSlide])

  const { isZoomed, isPinching, zoomPointerHandlers, mediaTransformStyle } = useLoungeLightboxImageZoom({
    containerRef: mediaContainerRef,
    imageRef: mediaImageRef,
    resetKey: current,
  })

  // Mount carousel during `opening` too so land does not swap single-img → pager (that flash felt worse).
  const carouselMode = multi && !isZoomed && !isPinching && (phase === 'open' || phase === 'opening')
  const showMediaLayer = phase === 'opening' || phase === 'open'
  const mediaInteractive = phase === 'open'
  const chromeInteractive = phase === 'open' && chromeVisible

  const onCarouselIndexChange = useCallback((i) => {
    setIdx((prev) => (prev === i ? prev : i))
  }, [])

  useLoungeLightboxCarouselSnap(carouselScrollRef, carouselMode, list.length, onCarouselIndexChange)

  // Align once when the open carousel mounts (or re-enters after pinch). Never rewrite scrollLeft on every idx … that fights native swipe.
  useLayoutEffect(() => {
    if (!carouselMode) return
    const el = carouselScrollRef.current
    if (!el) return
    const alignIndex = Math.max(0, Math.min(idxRef.current, list.length - 1))
    const apply = () => {
      const w = el.clientWidth
      if (!w) return
      el.scrollLeft = alignIndex * w
    }
    apply()
    const id = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(id)
  }, [carouselMode, list.length])

  // Crossfade ambient with carousel scroll (opacity via DOM … no per-frame React). Pair srcs update at boundaries.
  useLayoutEffect(() => {
    if (!carouselMode || list.length <= 1) return
    if (ambientAWrapRef.current) ambientAWrapRef.current.style.opacity = '1'
    if (ambientBWrapRef.current) ambientBWrapRef.current.style.opacity = '0'
  }, [carouselMode, list.length])

  useEffect(() => {
    if (!carouselMode || list.length <= 1) return undefined
    const el = carouselScrollRef.current
    if (!el) return undefined
    let raf = 0
    const apply = () => {
      raf = 0
      const w = el.clientWidth
      if (!w) return
      const maxP = list.length - 1
      const p = Math.max(0, Math.min(maxP, el.scrollLeft / w))
      const i0 = Math.max(0, Math.min(maxP, Math.floor(p + 1e-4)))
      const i1 = Math.max(0, Math.min(maxP, Math.ceil(p - 1e-4)))
      if (i0 === i1) {
        settleLoungeLightboxAmbient(
          i0,
          ambientPairRef,
          ambientAWrapRef.current,
          ambientBWrapRef.current,
          setAmbientPair,
        )
        return
      }
      const t = Math.max(0, Math.min(1, p - i0))
      if (ambientPairRef.current.a !== i0 || ambientPairRef.current.b !== i1) {
        ambientPairRef.current = { a: i0, b: i1 }
        setAmbientPair({ a: i0, b: i1 })
      }
      if (ambientAWrapRef.current) ambientAWrapRef.current.style.opacity = String(1 - t)
      if (ambientBWrapRef.current) ambientBWrapRef.current.style.opacity = String(t)
    }
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(apply)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    apply()
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [carouselMode, listKey, list.length])

  // When scroll position already matches idx (snap settle / open), lock ambient to that slide.
  // Skip while chevrons set idx early mid-scroll … scroll listener owns the crossfade.
  useEffect(() => {
    if (!carouselMode) return
    const el = carouselScrollRef.current
    const w = el?.clientWidth || 0
    const scrollIdx = w && el ? Math.round(el.scrollLeft / w) : idx
    if (scrollIdx !== idx) return
    settleLoungeLightboxAmbient(
      idx,
      ambientPairRef,
      ambientAWrapRef.current,
      ambientBWrapRef.current,
      setAmbientPair,
    )
  }, [carouselMode, idx])

  const resolveCloseOrigin = useCallback(() => {
    const getter = getOriginRectRef.current
    if (typeof getter === 'function') {
      try {
        const live = getter(idx)
        if (heroRectUsableForShrinkBack(live)) return live
      } catch {
        // ignore
      }
    }
    if (heroRectUsableForShrinkBack(openFromRectRef.current)) return openFromRectRef.current
    return null
  }, [idx])

  const finishClose = useCallback(() => {
    closingRef.current = false
    onCloseRef.current?.()
  }, [])

  const requestClose = useCallback(() => {
    if (closingRef.current) return
    if (phaseRef.current === 'opening') {
      // Cut expand short and close without shrink if still flying in.
      expandAnimRef.current?.cancel()
      try {
        window.clearTimeout(expandTimerRef.current)
      } catch {
        // ignore
      }
      finishClose()
      return
    }
    if (phaseRef.current !== 'open') return

    const origin = resolveCloseOrigin()
    const mediaEl = mediaImageRef.current
    const heroFrame =
      mediaEl instanceof HTMLImageElement
        ? readContainedImageViewportRect(mediaEl) || readElementViewportRect(mediaEl)
        : mediaEl instanceof HTMLElement
          ? readElementViewportRect(mediaEl)
          : targetRectRef.current

    if (!heroRectUsableForShrinkBack(origin) || !heroRectUsableForShrinkBack(heroFrame)) {
      finishClose()
      return
    }

    closingRef.current = true
    closeHeroFrameRef.current = heroFrame
    // Keep scrim at full opacity for this paint, then fade with shrink (video hero pattern).
    // flushSync so the flyout style below is not wiped by a later closing render
    // (unsized `fixed` + `h-full` img = one full-screen flash, then shrink).
    flushSync(() => {
      setChromeVisible(false)
      setDismissProgress(0)
      setScrimOpacity(1)
      setPhase('closing')
    })

    const flyout = flyoutRef.current
    if (!flyout) {
      finishClose()
      return
    }

    // Paint flyout over the open hero frame, then WAAPI shrink to tile.
    flyout.style.visibility = 'visible'
    flyout.style.pointerEvents = 'none'
    flyout.style.position = 'fixed'
    flyout.style.top = `${heroFrame.top}px`
    flyout.style.left = `${heroFrame.left}px`
    flyout.style.width = `${heroFrame.width}px`
    flyout.style.height = `${heroFrame.height}px`
    flyout.style.zIndex = String(zStack.overlay + 1)
    flyout.style.borderRadius = '0px'
    flyout.style.transform = 'none'
    flyout.style.opacity = '1'
    flyout.style.backgroundColor = 'transparent'
    void flyout.offsetWidth

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (phaseRef.current !== 'closing') return
        runHeroShrinkAnimation(flyout, heroFrame, origin, {
          animRef: shrinkAnimRef,
          finishTimerRef: shrinkTimerRef,
          flyoutZIndex: zStack.overlay + 1,
          onDone: () => {
            finishClose()
          },
        })
        // Fade scrim with shrink so the feed shows through (shell is transparent in closing).
        setScrimOpacity(0)
      })
    })
  }, [finishClose, resolveCloseOrigin, zStack.overlay])

  const onDismissProgress = useCallback((detail) => {
    if (phaseRef.current !== 'open') return
    const p = Number(detail?.p) || 0
    setDismissProgress(detail?.active ? p : 0)
  }, [])

  const onMediaTap = useCallback(() => {
    if (phaseRef.current !== 'open') return
    setChromeVisible((v) => !v)
  }, [])

  const { swipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose: requestClose,
    onDismissProgress,
    onTap: onMediaTap,
    allowSwipeOnVideo: false,
    enabled: phase === 'open' && !isZoomed && !isPinching,
    verticalDismissOnly: multi,
    // Full shell (chrome + media) so caption-heavy posts still dismiss like Stream.
    className: 'absolute inset-0 flex flex-col bg-transparent',
  })

  const {
    onPointerDown: swipePointerDown,
    onPointerMove: swipePointerMove,
    onPointerUp: swipePointerUp,
    onPointerCancel: swipePointerCancel,
    className: swipeClassName,
  } = swipeSurfaceProps

  const {
    onPointerDown: zoomPointerDown,
    onPointerMove: zoomPointerMove,
    onPointerUp: zoomPointerUp,
    onPointerCancel: zoomPointerCancel,
  } = zoomPointerHandlers

  const lightboxMenuContent = useMemo(() => {
    if (typeof renderMediaLightboxMenu === 'function') return renderMediaLightboxMenu()
    return null
  }, [renderMediaLightboxMenu])

  const lightboxTopBarExtraContent = useMemo(() => {
    if (typeof renderMediaLightboxTopBarExtra === 'function') {
      return renderMediaLightboxTopBarExtra(chromeOpts)
    }
    return null
  }, [renderMediaLightboxTopBarExtra, chromeOpts])

  const lightboxChromeContent = useMemo(() => {
    if (typeof renderMediaLightboxChrome === 'function') {
      return renderMediaLightboxChrome(requestClose, chromeOpts)
    }
    if (typeof renderMediaLightboxInteractionBar === 'function') {
      return renderMediaLightboxInteractionBar(requestClose)
    }
    return null
  }, [renderMediaLightboxChrome, renderMediaLightboxInteractionBar, requestClose, chromeOpts])

  useLayoutEffect(() => {
    const img = mediaImageRef.current
    if (img?.complete) noteSlideAspectAt(img, idx)
  }, [idx, current, phase, noteSlideAspectAt])

  // Measure chrome band for the active footer mode (full vs compact).
  useLayoutEffect(() => {
    if (phase !== 'open' && phase !== 'opening') return undefined
    syncMediaBandPad()
    const shell = mediaContainerRef.current
    const topEl = topChromeRef.current
    const footEl = footerChromeRef.current
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncMediaBandPad)
      return () => window.removeEventListener('resize', syncMediaBandPad)
    }
    const ro = new ResizeObserver(() => {
      syncMediaBandPad()
    })
    if (shell) ro.observe(shell)
    if (topEl) ro.observe(topEl)
    if (footEl) ro.observe(footEl)
    window.addEventListener('resize', syncMediaBandPad)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', syncMediaBandPad)
    }
  }, [phase, showAuthorMeta, chromeVisible, lightboxChromeContent, syncMediaBandPad])

  useEffect(() => {
    notifyLoungeStreamLightboxOpen(true)
    return () => notifyLoungeStreamLightboxOpen(false)
  }, [])

  // Shrink-back: lift EDGE title bar above the portaled flyout so the tile tucks under the header.
  useEffect(() => {
    const bar = document.querySelector('[data-lounge-title-bar]')
    if (!(bar instanceof HTMLElement)) return undefined
    if (phase === 'closing') {
      bar.setAttribute('data-lounge-title-bar-over-lightbox-close', '')
    } else {
      bar.removeAttribute('data-lounge-title-bar-over-lightbox-close')
    }
    return () => {
      bar.removeAttribute('data-lounge-title-bar-over-lightbox-close')
    }
  }, [phase])

  // Unlock as soon as fly-home starts. The portal stays painted until WAAPI ends, but
  // body overflow:hidden (and the full-screen hit target) must not keep eating feed scroll
  // after the image already looks parked (ease-out lands visually before HERO_SHRINK_MS).
  const lockPageScroll = Boolean(current) && phase !== 'closing'
  useEffect(() => {
    if (!lockPageScroll) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [lockPageScroll])

  useEffect(() => {
    if (!current) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose()
      if (phaseRef.current === 'open' && list.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          goPrev()
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          goNext()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [current, requestClose, list.length, goPrev, goNext])

  // FLIP open from feed tile … land in the chrome band (not viewport center) to match open media.
  useLayoutEffect(() => {
    if (phase !== 'opening') return undefined
    const from = openFromRectRef.current
    const flyout = flyoutRef.current
    if (!heroRectUsableForShrinkBack(from) || !flyout) {
      setPhase('open')
      setChromeVisible(true)
      setScrimOpacity(1)
      return undefined
    }

    // Prefer the already-decoded feed bitmap's natural aspect (same photo as 2048).
    // Tile box is a fallback … a late 2048 onLoad used to flip chrome/pad at land.
    const tileAspect = from.width / Math.max(from.height, 1)
    const openIdx = Math.max(0, Math.min(initialIndex, Math.max(list.length - 1, 0)))
    const openUrl = list[openIdx] || ''
    const openingGif =
      isLoungeLightboxGifUrl(openUrl, gifUrl) ||
      (Boolean(gifUrl) && openIdx === list.length - 1)
    const feedProbe = new Image()
    feedProbe.src = loungeFeedImageDeliveryUrl(openUrl, 'feed')
    const feedAspect =
      feedProbe.complete && feedProbe.naturalWidth > 0 && feedProbe.naturalHeight > 0
        ? feedProbe.naturalWidth / feedProbe.naturalHeight
        : null
    const seedAspect =
      feedAspect && Number.isFinite(feedAspect) && feedAspect > 0 ? feedAspect : tileAspect
    // GIFs: never lock chrome/pad to the carousel cell aspect. That makes fly-in
    // go full-bleed, then the real frame contain-sizes after land.
    if (!openingGif && Number.isFinite(seedAspect) && seedAspect > 0) {
      setAspectByIndex((prev) => (prev[openIdx] == null ? { ...prev, [openIdx]: seedAspect } : prev))
    }

    // Cover the feed tile this layout pass … do not wait on rAF or the flyout
    // paints at the top of the screen (fixed, unsized) before expand starts.
    flyout.style.visibility = 'visible'
    flyout.style.position = 'fixed'
    flyout.style.top = `${from.top}px`
    flyout.style.left = `${from.left}px`
    flyout.style.width = `${from.width}px`
    flyout.style.height = `${from.height}px`
    flyout.style.zIndex = String(zStack.overlay + 1)
    flyout.style.transformOrigin = '0 0'
    flyout.style.transform = 'none'
    flyout.style.transition = 'none'
    flyout.style.borderRadius = '0px'
    flyout.style.opacity = '1'
    flyout.style.overflow = 'hidden'

    let cancelled = false
    const scrimRaf = requestAnimationFrame(() => {
      if (cancelled) return
      setScrimOpacity(1)
      setChromeVisible(true)
    })

    // Double rAF: let chrome (and optional aspect-seeded footer) commit, then measure band + expand.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        const scroller = carouselScrollRef.current
        if (scroller && list.length > 1) {
          const slideW = scroller.clientWidth
          if (slideW) scroller.scrollLeft = openIdx * slideW
        }
        const band = measureImageLightboxMediaBand(
          mediaContainerRef.current,
          topChromeRef.current,
          footerChromeRef.current,
        )
        const slideRoot = carouselScrollRef.current?.children?.[openIdx]
        const parkedImg =
          mediaImageRef.current instanceof HTMLImageElement
            ? mediaImageRef.current
            : slideRoot instanceof HTMLElement
              ? slideRoot.querySelector('img')
              : null
        const parkedNaturalW =
          parkedImg instanceof HTMLImageElement ? parkedImg.naturalWidth : 0
        const parkedNaturalH =
          parkedImg instanceof HTMLImageElement ? parkedImg.naturalHeight : 0
        const gifAspect =
          openingGif && parkedNaturalW > 0 && parkedNaturalH > 0
            ? parkedNaturalW / parkedNaturalH
            : openingGif
              ? seedAspect
              : tileAspect
        if (openingGif && Number.isFinite(gifAspect) && gifAspect > 0) {
          setAspectByIndex((prev) =>
            prev[openIdx] != null && Math.abs(prev[openIdx] - gifAspect) < 0.0001
              ? prev
              : { ...prev, [openIdx]: gifAspect },
          )
        }
        const modeAspect = openingGif ? gifAspect : tileAspect
        const mode = modeAspect >= 1 || !Number.isFinite(modeAspect) ? 'full' : 'compact'
        setBandByMode((prev) => ({ ...prev, [mode]: band }))

        const target = computeHeroTargetRect(from, {
          aspect: openingGif && gifAspect > 0 ? gifAspect : undefined,
          displayW: openingGif ? undefined : from.width,
          displayH: openingGif ? undefined : from.height,
          insetTop: band.top,
          insetBottom: band.bottom,
          forceBand: openingGif,
        })
        targetRectRef.current = target
        landSlideIndexRef.current = openIdx
        setLandFrame(target)

        void flyout.offsetWidth

        runHeroExpandAnimation(flyout, from, target, {
          animRef: expandAnimRef,
          finishTimerRef: expandTimerRef,
          // Cover the pre-mounted open media layer for the whole expand.
          flyoutZIndex: zStack.overlay + 1,
          borderRadiusPx: 0,
          onDone: () => {
            if (cancelled) return
            snapFlyoutToHeroOpen(flyout, target, zStack.overlay + 1)
            // Drop landFrame in this turn. setPhase('open') re-runs this effect and
            // sets cancelled … a later rAF then never clears the fixed shell, so
            // slide 0 stays position:fixed and the carousel scrolls over it.
            flushSync(() => {
              setPhase('open')
              setLandFrame(null)
              setChromeVisible(true)
              setScrimOpacity(1)
            })
            flyout.style.visibility = 'hidden'
            flyout.style.pointerEvents = 'none'
            clearFlyoutHeroInlineStyles(flyout)
          },
        })
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(scrimRaf)
      expandAnimRef.current?.cancel()
      try {
        window.clearTimeout(expandTimerRef.current)
      } catch {
        // ignore
      }
    }
  }, [phase, zStack.overlay, initialIndex, list.length, gifUrl])

  useEffect(
    () => () => {
      expandAnimRef.current?.cancel()
      shrinkAnimRef.current?.cancel()
      try {
        window.clearTimeout(expandTimerRef.current)
        window.clearTimeout(shrinkTimerRef.current)
      } catch {
        // ignore
      }
    },
    [],
  )

  if (!current) return null

  const motionActive = phase === 'opening' || phase === 'closing'
  const effectiveScrim = Math.max(0, Math.min(1, scrimOpacity * (1 - dismissProgress * 0.55)))
  /** Pixel-match the flyout land frame (incl. visualViewport offsets) … flex-center alone can sit a few px off. */
  const heroShellStyle =
    landFrame && landFrame.width > 0 && landFrame.height > 0
      ? {
          position: 'fixed',
          top: landFrame.top,
          left: landFrame.left,
          width: landFrame.width,
          height: landFrame.height,
        }
      : undefined

  return createPortal(
    <div
      data-lounge-media-lightbox
      data-lounge-image-lightbox
      data-lounge-image-lightbox-phase={phase}
      data-lounge-image-lightbox-chrome={showAuthorMeta ? 'full' : 'compact'}
      className={`fixed inset-0 ${lightboxPortalClass}${phase === 'closing' ? ' pointer-events-none' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={multi ? `Image ${idx + 1} of ${list.length}` : 'Full image'}
    >
      <div
        data-lounge-image-lightbox-scrim
        className="pointer-events-none absolute inset-0 bg-black"
        style={{
          zIndex: zStack.scrim,
          opacity: effectiveScrim,
          transition:
            phase === 'opening'
              ? `opacity ${HERO_EXPAND_MS}ms ease-out`
              : phase === 'closing'
                ? `opacity ${HERO_EXPAND_MS}ms ease-out`
                : dismissProgress > 0
                  ? 'none'
                  : undefined,
        }}
        aria-hidden
      />

      {/* FLIP flyout … only for open/close motion. Open media pre-mounts underneath during expand. */}
      <div
        ref={flyoutRef}
        data-lounge-image-lightbox-flyout
        className="overflow-hidden bg-transparent"
        style={{
          pointerEvents: 'none',
          zIndex: zStack.overlay + 1,
          position: 'fixed',
          transformOrigin: '0 0',
          // Opening: first paint already covers the feed tile. Unsized `fixed`
          // otherwise flashes the photo at the top of the screen for 1-2 frames.
          visibility: phase === 'opening' && !openFromRectRef.current ? 'hidden' : motionActive ? 'visible' : 'hidden',
          ...(phase === 'opening' && openFromRectRef.current
            ? {
                top: openFromRectRef.current.top,
                left: openFromRectRef.current.left,
                width: openFromRectRef.current.width,
                height: openFromRectRef.current.height,
              }
            : phase === 'opening'
              ? { top: 0, left: 0, width: 0, height: 0 }
              : phase === 'closing' && closeHeroFrameRef.current
                ? {
                    top: closeHeroFrameRef.current.top,
                    left: closeHeroFrameRef.current.left,
                    width: closeHeroFrameRef.current.width,
                    height: closeHeroFrameRef.current.height,
                  }
                : null),
        }}
      >
        {/* Feed-tier src … same file as the tile. Lightbox 2048 is a new URL after CF resize
            and was decoding mid-flight (blank / pop / aspect hitch). Sharp layer stays hidden until land. */}
        <img
          src={ambientDisplaySrc}
          alt=""
          className="h-full w-full select-none object-cover"
          draggable={false}
          decoding="async"
          onError={(e) => onLoungeLightboxImgError(e, current)}
        />
      </div>

      {showMediaLayer ? (
        <>
        {/* Ambient under the flyout during expand so letterbox color is already there. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            zIndex: zStack.overlay,
            opacity:
              phase === 'opening'
                ? scrimOpacity
                : Math.max(0, Math.min(1, 1 - dismissProgress * 0.55)),
            transition:
              phase === 'opening' || phase === 'closing'
                ? `opacity ${HERO_EXPAND_MS}ms ease-out`
                : undefined,
          }}
          aria-hidden
        >
          {carouselMode && multi ? (
            <>
              <div ref={ambientAWrapRef} className="absolute inset-0">
                <MediaLightboxAmbientBackdrop
                  src={loungeFeedImageDeliveryUrl(list[ambientPair.a] || current, 'feed')}
                />
              </div>
              <div ref={ambientBWrapRef} className="absolute inset-0">
                <MediaLightboxAmbientBackdrop
                  src={loungeFeedImageDeliveryUrl(list[ambientPair.b] || current, 'feed')}
                />
              </div>
            </>
          ) : (
            <MediaLightboxAmbientBackdrop src={ambientDisplaySrc} />
          )}
        </div>
        <div
          className={[swipeClassName, isZoomed || isPinching ? 'touch-none' : ''].filter(Boolean).join(' ')}
          style={{
            // Above the flyout while opening so viewport chrome fades in over the growing image
            // (X-style). Sharp media stays hidden until land so it does not double-paint.
            zIndex: phase === 'opening' ? zStack.overlay + 2 : zStack.overlay,
            pointerEvents: mediaInteractive ? undefined : 'none',
          }}
          aria-hidden={phase === 'opening' ? true : undefined}
          // Capture so caption/cashtag stopPropagation cannot block dismiss (Fat Cat-style posts).
          onPointerDownCapture={swipePointerDown}
          onPointerMove={swipePointerMove}
          onPointerUp={swipePointerUp}
          onPointerCancel={swipePointerCancel}
        >
          <div
            data-lounge-lightbox-chrome-layer
            {...(chromeVisible ? { 'data-lounge-lightbox-chrome-visible': '' } : {})}
            className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between"
            style={{
              opacity: chromeVisible ? 1 - dismissProgress : 0,
              transition: `opacity ${phase === 'opening' ? HERO_EXPAND_MS : HERO_CHROME_FADE_MS}ms ease-out`,
            }}
            aria-hidden={chromeVisible ? undefined : true}
          >
            <div className="media-lightbox-status-bar-blend" aria-hidden />
            <div
              ref={topChromeRef}
              className={`${chromeInteractive ? 'pointer-events-auto' : 'pointer-events-none'} relative z-[1] flex shrink-0 items-center justify-between gap-2 ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]`}
              data-lounge-lightbox-top-chrome
              data-lounge-lightbox-no-swipe
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  requestClose()
                }}
                aria-label="Back"
                className={LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS}
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  ←
                </span>
              </button>
              <div className="ml-auto flex items-center gap-1" data-lounge-lightbox-no-swipe>
                {lightboxTopBarExtraContent ? <div>{lightboxTopBarExtraContent}</div> : null}
                {lightboxMenuContent ? <div>{lightboxMenuContent}</div> : null}
              </div>
            </div>
            {lightboxChromeContent ? (
              <div
                className={`pointer-events-none w-full bg-gradient-to-t from-black/85 via-black/45 to-transparent ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-8`}
                data-lounge-image-lightbox-footer
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  ref={footerChromeRef}
                  className={chromeInteractive ? 'pointer-events-auto' : 'pointer-events-none'}
                  data-lounge-image-lightbox-footer-chrome
                >
                  {lightboxChromeContent}
                </div>
                {multi ? (
                  <div
                    data-lounge-lightbox-image-pager
                    className="pointer-events-none mt-2 text-center text-[12px] font-medium tabular-nums text-white"
                  >
                    {idx + 1} / {list.length}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {multi && !lightboxChromeContent ? (
            <div
              data-lounge-lightbox-image-pager
              className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[2] -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium tabular-nums text-zinc-200 backdrop-blur-[2px]"
              style={{
                opacity: chromeVisible ? 1 - dismissProgress : 0,
                transition: `opacity ${phase === 'opening' ? HERO_EXPAND_MS : HERO_CHROME_FADE_MS}ms ease-out`,
              }}
            >
              {idx + 1} / {list.length}
            </div>
          ) : null}
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={zoomPointerDown}
            onPointerMove={zoomPointerMove}
            onPointerUp={zoomPointerUp}
            onPointerCancel={zoomPointerCancel}
            className="relative z-0 flex min-h-0 flex-1 flex-col"
            style={{ visibility: phase === 'opening' ? 'hidden' : 'visible' }}
            aria-hidden={phase === 'opening' ? true : undefined}
          >
            <div
              ref={mediaContainerRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
              style={(() => {
                if (carouselMode) return undefined
                const pad = bandPadIfFits(idx)
                return pad ? { paddingTop: pad.top, paddingBottom: pad.bottom } : undefined
              })()}
            >
              {carouselMode ? (
                <div
                  ref={carouselScrollRef}
                  data-lounge-lightbox-carousel
                  className="relative z-[1] flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-x] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                >
                  {list.map((slideUrl, i) => {
                    const slidePad = bandPadIfFits(i)
                    const near = Math.abs(i - idx) <= 1
                    // Feed 960 on current ±1 as soon as open (do not wait for settle / 2048).
                    // Sharp 2048 stacks on top once decoded … never swap the visible src.
                    const loadFeed =
                      phase === 'opening'
                        ? i === landSlideIndexRef.current
                        : phase === 'open' && (i === idx || near)
                    const loadSharp = loadFeed
                    const imgClass =
                      i === landSlideIndexRef.current && heroShellStyle
                        ? 'relative z-[1] h-full w-full select-none object-contain'
                        : 'relative z-[1] max-h-full max-w-full select-none object-contain'
                    return (
                    <div
                      key={`${slideUrl}-${i}`}
                      className="relative z-[1] box-border flex h-full w-full shrink-0 snap-start snap-always items-center justify-center"
                      style={
                        slidePad
                          ? { paddingTop: slidePad.top, paddingBottom: slidePad.bottom }
                          : undefined
                      }
                    >
                      <div
                        className="relative z-[1] inline-flex max-h-full max-w-full"
                        style={
                          i === landSlideIndexRef.current && heroShellStyle ? heroShellStyle : undefined
                        }
                      >
                        {loadFeed ? (
                          <LoungeLightboxStackedPhoto
                            storedUrl={slideUrl}
                            loadSharp={loadSharp}
                            className={imgClass}
                            imgRef={i === idx ? mediaImageRef : undefined}
                            onAspect={(img) => noteSlideAspectAt(img, i)}
                            fetchPriority={i === landSlideIndexRef.current || i === idx ? 'high' : 'auto'}
                          />
                        ) : (
                          <div
                            className={
                              i === landSlideIndexRef.current && heroShellStyle
                                ? 'relative z-[1] h-full w-full'
                                : 'relative z-[1] max-h-full max-w-full'
                            }
                            aria-hidden
                          />
                        )}
                      </div>
                    </div>
                    )
                  })}
                </div>
              ) : (
                <div
                  className={
                    heroShellStyle
                      ? 'relative z-[1] inline-flex origin-center'
                      : 'relative z-[1] inline-flex max-h-full max-w-full origin-center'
                  }
                  style={{ ...(heroShellStyle || null), ...mediaTransformStyle }}
                >
                  <LoungeLightboxStackedPhoto
                    storedUrl={current}
                    loadSharp
                    className={
                      heroShellStyle
                        ? 'relative z-[1] h-full w-full select-none object-contain'
                        : 'relative z-[1] max-h-full max-w-full select-none object-contain'
                    }
                    imgRef={mediaImageRef}
                    onAspect={(img) => noteSlideAspectAt(img, idx)}
                    fetchPriority="high"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        </>
      ) : null}
    </div>,
    document.body,
  )
}

/**
 * GIF/photo URL shown below the post caption (always under the final line of text).
 * @param {string} [marginTopClass] - Tailwind margin-top on the wrapper (default `mt-2` after caption).
 * @param {boolean} [enableLightbox] - Tap to open fullscreen (feed/detail); set false for non-interactive embeds if needed.
 */
export function LoungeInlineMediaUrl({
  url,
  variant = 'feed',
  marginTopClass = 'mt-2',
  enableLightbox = true,
  knownGifUrl = '',
  lightboxPortalClass = 'z-[100]',
  renderMediaLightboxMenu,
  renderMediaLightboxTopBarExtra,
  renderMediaLightboxChrome,
  renderMediaLightboxInteractionBar,
}) {
  const [lightbox, setLightbox] = useState(null)
  const originImgRef = useRef(/** @type {HTMLImageElement | null} */ (null))
  const [feedAttachmentTier, setFeedAttachmentTier] = useState(
    /** @type {import('./loungeFeedImageAttachment.js').LoungeFeedAttachmentTier} */ ('column'),
  )
  if (!url) return null
  const isEmbed = variant === 'embed'
  const isDetail = variant === 'detail'
  const isCommentInline = variant === 'commentInline'
  const imgClass = isDetail
    ? 'block max-h-56 w-auto max-w-full h-auto object-contain sm:max-h-60'
    : isCommentInline
      ? 'block max-h-36 w-auto max-w-full h-auto object-contain sm:max-h-40'
      : isEmbed
        ? 'block max-h-40 w-auto max-w-full h-auto object-contain sm:max-h-44'
        : 'block max-h-[312px] w-auto max-w-full h-auto object-contain'
  const rounding = isEmbed ? 'rounded-lg' : 'rounded-xl'
  const border = isEmbed ? 'border-zinc-600/40' : 'border-zinc-700/60'

  const displayUrl = loungeFeedImageDeliveryUrl(
    url,
    variant === 'detail' ? 'detail' : variant === 'commentInline' ? 'commentInline' : variant === 'embed' ? 'embed' : 'feed',
  )

  const usesFeedAttachmentLayout = variant === 'feed' || variant === 'embed'
  const frameClass = usesFeedAttachmentLayout
    ? loungeFeedAttachmentFrameClassName(feedAttachmentTier, { rounding, border })
    : `inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`
  const resolvedImgClass = usesFeedAttachmentLayout
    ? loungeFeedAttachmentImgClassName(feedAttachmentTier, { variant })
    : imgClass
  const tapTargetClass = usesFeedAttachmentLayout
    ? loungeFeedAttachmentTapTargetClassName(feedAttachmentTier)
    : 'block max-w-full cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50'
  const outerShellClass = usesFeedAttachmentLayout
    ? loungeFeedAttachmentOuterShellClassName(feedAttachmentTier, { variant })
    : 'w-full min-w-0 max-w-full'

  const openLightbox = useCallback(() => {
    const img = originImgRef.current
    const stored = String(url).trim()
    const fromRect =
      isLoungeLightboxGifUrl(stored, knownGifUrl) && img instanceof HTMLImageElement
        ? readContainedImageViewportRect(img)
        : img instanceof HTMLElement
          ? readElementViewportRect(img)
          : null
    setLightbox({
      urls: [stored],
      index: 0,
      fromRect: heroRectUsableForShrinkBack(fromRect) ? fromRect : null,
    })
  }, [url, knownGifUrl])

  const getOriginRect = useCallback((_index) => {
    const img = originImgRef.current
    if (!(img instanceof HTMLElement)) return null
    const stored = String(url).trim()
    if (isLoungeLightboxGifUrl(stored, knownGifUrl) && img instanceof HTMLImageElement) {
      return readContainedImageViewportRect(img)
    }
    const rect = readElementViewportRect(img)
    return heroRectUsableForShrinkBack(rect) ? rect : null
  }, [url, knownGifUrl])

  const framed = (
    <div className={frameClass}>
      <img
        ref={originImgRef}
        src={displayUrl}
        alt=""
        className={resolvedImgClass}
        loading="lazy"
        decoding="async"
        onLoad={(e) => {
          if (!usesFeedAttachmentLayout) return
          const tier = loungeFeedImageAttachmentTier(
            e.currentTarget.naturalWidth,
            e.currentTarget.naturalHeight,
          )
          setFeedAttachmentTier((prev) => (prev === tier ? prev : tier))
        }}
      />
    </div>
  )

  return (
    <div className={`${marginTopClass} ${outerShellClass}`}>
      {enableLightbox ? (
        <div
          role="button"
          tabIndex={0}
          data-lounge-image-zoom
          className={tapTargetClass}
          onClick={(e) => {
            e.stopPropagation()
            openLightbox()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              openLightbox()
            }
          }}
          aria-label="View full image"
          title="View full image"
        >
          {framed}
        </div>
      ) : (
        framed
      )}
      {lightbox ? (
        <LoungeImageLightbox
          urls={lightbox.urls}
          initialIndex={lightbox.index}
          fromRect={lightbox.fromRect}
          gifUrl={knownGifUrl}
          getOriginRect={getOriginRect}
          onClose={() => setLightbox(null)}
          lightboxPortalClass={lightboxPortalClass}
          renderMediaLightboxMenu={renderMediaLightboxMenu}
          renderMediaLightboxTopBarExtra={renderMediaLightboxTopBarExtra}
          renderMediaLightboxChrome={renderMediaLightboxChrome}
          renderMediaLightboxInteractionBar={renderMediaLightboxInteractionBar}
        />
      ) : null}
    </div>
  )
}

/**
 * Renders `media_url` then optional `gif_url` (image + external GIF), or a single legacy URL in `media_url`.
 * @param {string} [firstMarginTopClass]
 */
export function LoungePostMediaPair({
  mediaUrl,
  gifUrl,
  variant = 'feed',
  firstMarginTopClass = 'mt-2',
  enableLightbox = true,
  lightboxPortalClass = 'z-[100]',
  renderMediaLightboxMenu,
  renderMediaLightboxTopBarExtra,
  renderMediaLightboxChrome,
  renderMediaLightboxInteractionBar,
}) {
  const m = mediaUrl != null ? String(mediaUrl).trim() : ''
  const g = gifUrl != null ? String(gifUrl).trim() : ''
  if (!m && !g) return null
  if (m && g) {
    return (
      <>
        <LoungeInlineMediaUrl
          url={m}
          variant={variant}
          marginTopClass={firstMarginTopClass}
          enableLightbox={enableLightbox}
          lightboxPortalClass={lightboxPortalClass}
          renderMediaLightboxMenu={renderMediaLightboxMenu}
          renderMediaLightboxTopBarExtra={renderMediaLightboxTopBarExtra}
          renderMediaLightboxChrome={renderMediaLightboxChrome}
          renderMediaLightboxInteractionBar={renderMediaLightboxInteractionBar}
        />
        <LoungeInlineMediaUrl
          url={g}
          knownGifUrl={g}
          variant={variant}
          marginTopClass="mt-2"
          enableLightbox={enableLightbox}
          lightboxPortalClass={lightboxPortalClass}
          renderMediaLightboxMenu={renderMediaLightboxMenu}
          renderMediaLightboxTopBarExtra={renderMediaLightboxTopBarExtra}
          renderMediaLightboxChrome={renderMediaLightboxChrome}
          renderMediaLightboxInteractionBar={renderMediaLightboxInteractionBar}
        />
      </>
    )
  }
  const single = m || g
  return (
    <LoungeInlineMediaUrl
      url={single}
      knownGifUrl={!m && g ? g : ''}
      variant={variant}
      marginTopClass={firstMarginTopClass}
      enableLightbox={enableLightbox}
      lightboxPortalClass={lightboxPortalClass}
      renderMediaLightboxMenu={renderMediaLightboxMenu}
      renderMediaLightboxTopBarExtra={renderMediaLightboxTopBarExtra}
      renderMediaLightboxChrome={renderMediaLightboxChrome}
      renderMediaLightboxInteractionBar={renderMediaLightboxInteractionBar}
    />
  )
}
