import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD,
  LOUNGE_IMAGE_LIGHTBOX_NAV_BTN_CLASS,
} from './LoungeStreamVideoLightboxChrome.jsx'
import { useLoungeLightboxImageZoom } from './loungeLightboxImageZoom.js'
import { useLoungeLightboxSwipeDismiss } from './loungeLightboxSwipeDismiss.js'
import { useLoungeLightboxCarouselSnap } from './useLoungeLightboxCarouselSnap.js'
import { notifyLoungeStreamLightboxOpen } from './loungeStreamLightboxRegistry.js'
import { loungeFeedImageDeliveryUrl } from '../../utils/loungeCfImageMedia.js'
import {
  loungeFeedAttachmentFrameClassName,
  loungeFeedAttachmentImgClassName,
  loungeFeedAttachmentOuterShellClassName,
  loungeFeedAttachmentTapTargetClassName,
  loungeFeedImageAttachmentTier,
  LOUNGE_FEED_ATTACHMENT_COLUMN_MAX_H_CLASS,
} from './loungeFeedImageAttachment.js'
import MediaLightboxAmbientBackdrop from '../../components/MediaLightboxAmbientBackdrop.jsx'

function normalizeUrlList(urls) {
  if (!Array.isArray(urls)) return []
  return urls.map((u) => String(u ?? '').trim()).filter(Boolean)
}

/**
 * Full-screen image/GIF viewer - Stream-style chrome: back + ⋯ top bar, pill interactions on bottom gradient.
 * Pass `urls` + `initialIndex` for multi-image navigation; or legacy single `url`.
 */
export function LoungeImageLightbox({
  url,
  urls,
  initialIndex = 0,
  onClose,
  /** Tailwind z-index on the portaled shell (default below profile sheet `z-[101]`). */
  lightboxPortalClass = 'z-[100]',
  /** `() => ReactNode` - top-right ⋯ menu (no autoplay toggle for images). */
  renderMediaLightboxMenu,
  /** `() => ReactNode` - Follow pill left of ⋯ in the top bar. */
  renderMediaLightboxTopBarExtra,
  /** `(dismissLightbox) => ReactNode` - pill interaction row on bottom gradient. */
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

  const mediaContainerRef = useRef(null)
  const mediaImageRef = useRef(null)
  const carouselScrollRef = useRef(null)

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

  const carouselMode = multi && !isZoomed && !isPinching

  const onCarouselIndexChange = useCallback(
    (i) => {
      setIdx((prev) => (prev === i ? prev : i))
    },
    [],
  )

  useLoungeLightboxCarouselSnap(carouselScrollRef, carouselMode, list.length, onCarouselIndexChange)

  useLayoutEffect(() => {
    if (!multi) return
    const el = carouselScrollRef.current
    if (!el) return
    const alignIndex = Math.max(0, Math.min(initialIndex, list.length - 1))
    const apply = () => {
      const w = el.clientWidth
      if (!w) return
      el.scrollLeft = alignIndex * w
    }
    apply()
    const id = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(id)
  }, [multi, list, initialIndex])

  useLayoutEffect(() => {
    if (!carouselMode) return
    const el = carouselScrollRef.current
    if (!el) return
    const w = el.clientWidth
    if (!w) return
    el.scrollLeft = idx * w
  }, [carouselMode])

  const { swipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose,
    allowSwipeOnVideo: true,
    enabled: !isZoomed && !isPinching,
    verticalDismissOnly: multi,
    className: 'relative flex min-h-0 flex-1 flex-col',
  })

  const {
    onPointerDown: swipePointerDown,
    onPointerMove: swipePointerMove,
    onPointerUp: swipePointerUp,
    onPointerCancel: swipePointerCancel,
    style: swipeDragStyle,
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
    if (typeof renderMediaLightboxTopBarExtra === 'function') return renderMediaLightboxTopBarExtra()
    return null
  }, [renderMediaLightboxTopBarExtra])

  const lightboxInteractionBarContent = useMemo(() => {
    if (typeof renderMediaLightboxInteractionBar === 'function') {
      return renderMediaLightboxInteractionBar(onClose)
    }
    return null
  }, [renderMediaLightboxInteractionBar, onClose])

  useEffect(() => {
    notifyLoungeStreamLightboxOpen(true)
    return () => notifyLoungeStreamLightboxOpen(false)
  }, [])

  useEffect(() => {
    if (!current) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (list.length > 1) {
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
  }, [current, onClose, list.length, goPrev, goNext])

  if (!current) return null

  return createPortal(
    <div
      data-lounge-media-lightbox
      data-lounge-image-lightbox
      className={`fixed inset-0 ${lightboxPortalClass} flex flex-col bg-black`}
      role="dialog"
      aria-modal="true"
      aria-label={multi ? `Image ${idx + 1} of ${list.length}` : 'Full image'}
    >
      <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between">
        <div className="media-lightbox-status-bar-blend" aria-hidden />
        <div
          className={`pointer-events-auto relative z-[1] flex shrink-0 items-center justify-between gap-2 ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]`}
          data-lounge-lightbox-top-chrome
          data-lounge-lightbox-no-swipe
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="Back"
            className={LOUNGE_IMAGE_LIGHTBOX_NAV_BTN_CLASS}
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
        {lightboxInteractionBarContent ? (
          <div
            className={`pointer-events-auto w-full bg-gradient-to-t from-black/85 via-black/45 to-transparent ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8`}
            data-lounge-image-lightbox-footer
            data-lounge-lightbox-no-swipe
            onClick={(e) => e.stopPropagation()}
          >
            <div className="[&_[data-lounge-post-interaction-bar]]:landscape:w-auto [&_[data-lounge-post-interaction-bar]]:landscape:justify-end [&_[data-lounge-post-interaction-bar]]:landscape:gap-1.5">
              {lightboxInteractionBarContent}
            </div>
            {multi ? (
              <div
                data-lounge-lightbox-image-pager
                className="pointer-events-none mt-2 text-center text-[12px] font-medium tabular-nums text-zinc-200"
              >
                {idx + 1} / {list.length}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {multi && !lightboxInteractionBarContent ? (
        <div
          data-lounge-lightbox-image-pager
          className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-[2] -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium tabular-nums text-zinc-200 backdrop-blur-[2px]"
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
        style={swipeDragStyle}
        className={['relative z-0 flex min-h-0 flex-1 flex-col', swipeClassName, isZoomed || isPinching ? 'touch-none' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <div
          ref={mediaContainerRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2"
        >
          <MediaLightboxAmbientBackdrop src={ambientDisplaySrc} />
          {carouselMode ? (
            <div
              ref={carouselScrollRef}
              data-lounge-lightbox-carousel
              className="relative z-[1] flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-auto scroll-smooth [-webkit-overflow-scrolling:touch] [touch-action:pan-x] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {list.map((slideUrl, i) => (
                <div
                  key={`${slideUrl}-${i}`}
                  className="relative z-[1] flex h-full w-full shrink-0 snap-start snap-always items-center justify-center"
                >
                  <img
                    ref={i === idx ? mediaImageRef : undefined}
                    src={loungeFeedImageDeliveryUrl(slideUrl, 'lightbox')}
                    alt=""
                    className="relative z-[1] max-h-full max-w-full select-none object-contain"
                    loading={i === idx ? 'eager' : 'lazy'}
                    decoding="async"
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="relative z-[1] inline-flex max-h-full max-w-full origin-center" style={mediaTransformStyle}>
              <img
                ref={mediaImageRef}
                key={current}
                src={currentDisplaySrc}
                alt=""
                className="relative z-[1] max-h-full max-w-full select-none object-contain"
                loading="eager"
                decoding="async"
                draggable={false}
              />
            </div>
          )}
        </div>
      </div>
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
  renderMediaLightboxInteractionBar,
}) {
  const [lightbox, setLightbox] = useState(null)
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

  const displayUrl = loungeFeedImageDeliveryUrl(url, variant === 'detail' ? 'detail' : variant === 'commentInline' ? 'commentInline' : variant === 'embed' ? 'embed' : 'feed')

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

  const framed = (
    <div className={frameClass}>
      <img
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
            setLightbox({ urls: [String(url).trim()], index: 0 })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              setLightbox({ urls: [String(url).trim()], index: 0 })
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
          onClose={() => setLightbox(null)}
          lightboxPortalClass={lightboxPortalClass}
          renderMediaLightboxMenu={renderMediaLightboxMenu}
          renderMediaLightboxTopBarExtra={renderMediaLightboxTopBarExtra}
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
      renderMediaLightboxInteractionBar={renderMediaLightboxInteractionBar}
    />
  )
}
