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
  readElementViewportRect,
  resolveLoungeHeroStackZIndexes,
  runHeroExpandAnimation,
  runHeroShrinkAnimation,
  snapFlyoutToHeroOpen,
} from './loungeLightboxFlip.js'
import { loungeFeedImageDeliveryUrl } from '../../utils/loungeCfImageMedia.js'
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
  /** Tailwind z-index on the portaled shell (default below profile sheet `z-[101]`). */
  lightboxPortalClass = 'z-[100]',
  /** `() => ReactNode` - top-right ⋯ menu (no autoplay toggle for images). */
  renderMediaLightboxMenu,
  /**
   * `(chromeOpts?: { showAuthorMeta?: boolean }) => ReactNode` - Follow left of ⋯.
   * Compact (tall) slides pass `showAuthorMeta: false` so Follow stays available.
   */
  renderMediaLightboxTopBarExtra,
  /**
   * `(dismissLightbox, chromeOpts?: { showAuthorMeta?: boolean }) => ReactNode` - Stream hero chrome.
   * Tall slides (`natural height > width`) omit avatar / name / handle / caption.
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
  const [prevList, setPrevList] = useState(null)
  const [prevInitialIndex, setPrevInitialIndex] = useState(null)
  if (prevList !== list || prevInitialIndex !== initialIndex) {
    setPrevList(list)
    setPrevInitialIndex(initialIndex)
    const n = list.length
    setIdx(n === 0 ? 0 : Math.max(0, Math.min(initialIndex, n - 1)))
  }

  const current = list[idx] || ''
  const currentDisplaySrc = loungeFeedImageDeliveryUrl(current, 'lightbox')
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
  /** Current slide natural width/height. `>= 1` → square/landscape (full chrome). */
  const [imageAspect, setImageAspect] = useState(/** @type {number | null} */ (null))
  /** Padding so media centers between top buttons and avatar row / bottom pills. */
  const [mediaBandPad, setMediaBandPad] = useState({ top: 0, bottom: 0 })
  const noteSlideAspect = useCallback((img) => {
    const next = readImageAspectRatio(img)
    if (next == null) return
    setImageAspect((prev) => (prev != null && Math.abs(prev - next) < 0.0001 ? prev : next))
  }, [])
  // height <= width (square / landscape): full author chrome. Taller: pills only.
  const showAuthorMeta = imageAspect == null || imageAspect >= 1
  const chromeOpts = useMemo(() => ({ showAuthorMeta }), [showAuthorMeta])

  const syncMediaBandPad = useCallback(() => {
    const next = measureImageLightboxMediaBand(
      mediaContainerRef.current,
      topChromeRef.current,
      footerChromeRef.current,
    )
    setMediaBandPad((prev) =>
      prev.top === next.top && prev.bottom === next.bottom ? prev : next,
    )
  }, [])

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
      mediaEl instanceof HTMLElement
        ? readElementViewportRect(mediaEl)
        : targetRectRef.current

    if (!heroRectUsableForShrinkBack(origin) || !heroRectUsableForShrinkBack(heroFrame)) {
      finishClose()
      return
    }

    closingRef.current = true
    setChromeVisible(false)
    setDismissProgress(0)
    // Keep scrim at full opacity for this paint, then fade with shrink (video hero pattern).
    setScrimOpacity(1)
    setPhase('closing')

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
    className: 'relative flex min-h-0 flex-1 flex-col',
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

  const onMediaPointerDown = useCallback(
    (e) => {
      if (zoomPointerDown(e)) return
      swipePointerDown?.(e)
    },
    [zoomPointerDown, swipePointerDown],
  )

  const onMediaPointerMove = useCallback(
    (e) => {
      zoomPointerMove(e)
      swipePointerMove?.(e)
    },
    [zoomPointerMove, swipePointerMove],
  )

  const onMediaPointerUp = useCallback(
    (e) => {
      zoomPointerUp(e)
      swipePointerUp?.(e)
    },
    [zoomPointerUp, swipePointerUp],
  )

  const onMediaPointerCancel = useCallback(
    (e) => {
      zoomPointerCancel(e)
      swipePointerCancel?.(e)
    },
    [zoomPointerCancel, swipePointerCancel],
  )

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
    if (img?.complete) {
      noteSlideAspect(img)
      return
    }
    setImageAspect(null)
  }, [idx, current, phase, noteSlideAspect])

  // Keep every slide optically centered in the chrome band (top buttons ↔ avatar/pills).
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
  }, [phase, showAuthorMeta, chromeVisible, lightboxChromeContent, multi, idx, syncMediaBandPad])

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

  useEffect(() => {
    if (!current) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
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
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [current, requestClose, list.length, goPrev, goNext])

  // FLIP open from feed tile.
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

    const target = computeHeroTargetRect(from, {
      displayW: from.width,
      displayH: from.height,
    })
    targetRectRef.current = target
    landSlideIndexRef.current = Math.max(0, Math.min(initialIndex, Math.max(list.length - 1, 0)))
    setLandFrame(target)

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
    // Square immediately … keeping 12px through expand looks fine until land, then pops square.
    flyout.style.borderRadius = '0px'
    flyout.style.opacity = '1'

    let cancelled = false
    const scrimRaf = requestAnimationFrame(() => {
      if (!cancelled) setScrimOpacity(1)
    })

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return
        runHeroExpandAnimation(flyout, from, target, {
          animRef: expandAnimRef,
          finishTimerRef: expandTimerRef,
          // Cover the pre-mounted open media layer for the whole expand.
          flyoutZIndex: zStack.overlay + 1,
          borderRadiusPx: 0,
          onDone: () => {
            if (cancelled) return
            snapFlyoutToHeroOpen(flyout, target, zStack.overlay + 1)
            // Open media was painting under the flyout during expand … lift cover in the same frame.
            // Drop landFrame with open … fixed land shell blocks native carousel pan-x.
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
  }, [phase, zStack.overlay, initialIndex, list.length])

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
      className={`fixed inset-0 ${lightboxPortalClass}`}
      role="dialog"
      aria-modal="true"
      aria-label={multi ? `Image ${idx + 1} of ${list.length}` : 'Full image'}
    >
      <div
        data-lounge-image-lightbox-scrim
        className="absolute inset-0 bg-black"
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
          visibility: motionActive ? 'visible' : 'hidden',
          pointerEvents: 'none',
          zIndex: zStack.overlay + 1,
          position: 'fixed',
        }}
      >
        <img
          src={currentDisplaySrc}
          alt=""
          className="h-full w-full select-none object-cover"
          draggable={false}
          decoding="async"
        />
      </div>

      {showMediaLayer ? (
        <div
          className="absolute inset-0 flex flex-col bg-transparent"
          style={{
            zIndex: zStack.overlay,
            pointerEvents: mediaInteractive ? undefined : 'none',
            // Pre-mount during expand for decode/layout, but stay invisible until land
            // … otherwise the full hero paints behind the growing flyout (double image).
            visibility: phase === 'opening' ? 'hidden' : 'visible',
          }}
          aria-hidden={phase === 'opening' ? true : undefined}
        >
          <div
            className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between"
            style={{
              opacity: chromeVisible ? 1 - dismissProgress : 0,
              transition: `opacity ${HERO_CHROME_FADE_MS}ms ease-out`,
            }}
            aria-hidden={chromeVisible ? undefined : true}
          >
            <div className="media-lightbox-status-bar-blend" aria-hidden />
            <div
              ref={topChromeRef}
              className={`${chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'} relative z-[1] flex shrink-0 items-center justify-between gap-2 ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]`}
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
                data-lounge-lightbox-no-swipe
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  ref={footerChromeRef}
                  className={chromeVisible ? 'pointer-events-auto' : 'pointer-events-none'}
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
                transition: chromeVisible ? `opacity ${HERO_CHROME_FADE_MS}ms ease-out` : 'none',
              }}
            >
              {idx + 1} / {list.length}
            </div>
          ) : null}
          <div
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onMediaPointerDown}
            onPointerMove={onMediaPointerMove}
            onPointerUp={onMediaPointerUp}
            onPointerCancel={onMediaPointerCancel}
            className={[
              'relative z-0 flex min-h-0 flex-1 flex-col',
              swipeClassName,
              isZoomed || isPinching ? 'touch-none' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div
              ref={mediaContainerRef}
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
              style={
                mediaBandPad.top > 0 || mediaBandPad.bottom > 0
                  ? { paddingTop: mediaBandPad.top, paddingBottom: mediaBandPad.bottom }
                  : undefined
              }
            >
              <MediaLightboxAmbientBackdrop src={ambientDisplaySrc} />
              {carouselMode ? (
                <div
                  ref={carouselScrollRef}
                  data-lounge-lightbox-carousel
                  className="relative z-[1] flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-auto [-webkit-overflow-scrolling:touch] [touch-action:pan-x] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                >
                  {list.map((slideUrl, i) => (
                    <div
                      key={`${slideUrl}-${i}`}
                      className="relative z-[1] flex h-full w-full shrink-0 snap-start snap-always items-center justify-center"
                    >
                      <div
                        className="relative z-[1] inline-flex max-h-full max-w-full"
                        style={
                          i === landSlideIndexRef.current && heroShellStyle ? heroShellStyle : undefined
                        }
                      >
                        <img
                          ref={i === idx ? mediaImageRef : undefined}
                          src={loungeFeedImageDeliveryUrl(slideUrl, 'lightbox')}
                          alt=""
                          className={
                            i === landSlideIndexRef.current && heroShellStyle
                              ? 'relative z-[1] h-full w-full select-none object-contain'
                              : 'relative z-[1] max-h-full max-w-full select-none object-contain'
                          }
                          loading={i === idx || phase === 'opening' ? 'eager' : 'lazy'}
                          decoding="async"
                          draggable={false}
                          onLoad={(e) => {
                            if (i === idxRef.current) noteSlideAspect(e.currentTarget)
                          }}
                        />
                      </div>
                    </div>
                  ))}
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
                  <img
                    ref={mediaImageRef}
                    key={current}
                    src={currentDisplaySrc}
                    alt=""
                    className={
                      heroShellStyle
                        ? 'relative z-[1] h-full w-full select-none object-contain'
                        : 'relative z-[1] max-h-full max-w-full select-none object-contain'
                    }
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    onLoad={(e) => noteSlideAspect(e.currentTarget)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
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
    const fromRect = img instanceof HTMLElement ? readElementViewportRect(img) : null
    setLightbox({
      urls: [String(url).trim()],
      index: 0,
      fromRect: heroRectUsableForShrinkBack(fromRect) ? fromRect : null,
    })
  }, [url])

  const getOriginRect = useCallback((_index) => {
    const img = originImgRef.current
    if (!(img instanceof HTMLElement)) return null
    const rect = readElementViewportRect(img)
    return heroRectUsableForShrinkBack(rect) ? rect : null
  }, [])

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
