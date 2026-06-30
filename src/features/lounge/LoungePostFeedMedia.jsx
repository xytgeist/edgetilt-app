import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { feedPostImageUrls, feedPostStreamPosterUrl, feedPostStreamVideoDisplayDimensions, feedPostStreamVideoUid } from '../../utils/communityFeedPost'
import { loungeFeedImageDeliveryUrl } from '../../utils/loungeCfImageMedia.js'
import { LoungePostMediaPair, LoungeImageLightbox } from './LoungeInlineMediaUrl.jsx'
import LoungePostStreamVideo from './LoungePostStreamVideo.jsx'
import { useLoungeStreamLightbox } from './LoungeStreamLightboxContext.jsx'
import { peekLoungeStreamSessionPoster } from './loungeStreamSessionPoster.js'

/** Match `LoungeInlineMediaUrl`: border wraps intrinsic image size (`w-auto`), not a fixed slide width. */
const imgClassByVariant = {
  feed: 'block max-h-[312px] w-auto max-w-full h-auto object-contain',
  detail: 'block max-h-56 w-auto max-w-full h-auto object-contain sm:max-h-60',
  /** Post detail comment list: ~⅔ of `detail` image caps. */
  commentInline: 'block max-h-36 w-auto max-w-full h-auto object-contain sm:max-h-40',
  embed: 'block max-h-40 w-auto max-w-full h-auto object-contain sm:max-h-44',
  composer: 'block max-h-40 w-auto max-w-full h-auto object-contain',
}

/**
 * Horizontal swipe row of images (scroll-snap). Used in composer and feed/detail when `image_urls` is set.
 */
export function LoungeImageCarousel({
  urls,
  variant = 'feed',
  firstMarginTopClass = 'mt-2',
  /** If set, show a remove control on each slide (composer only). */
  onRemoveIndex,
  /** Overrides default region label (e.g. when slides include a GIF). */
  regionAriaLabel = 'Post images',
  /** Per-slide remove control copy when `onRemoveIndex` is set. */
  removeLabelForIndex,
  /** Tap image to open fullscreen (disabled in composer). */
  enableLightbox = true,
  lightboxPortalClass = 'z-[100]',
  renderMediaLightboxMenu,
  renderMediaLightboxTopBarExtra,
  renderMediaLightboxInteractionBar,
  /**
   * When set (feed/detail scroll container), carousel snaps back to slide 1 when this block
   * re-enters that scrollport after leaving - fixes nested scroll + `content-visibility` with `root: null`.
   */
  visibilityResetRootRef,
  /** Composer: parent scroll tail-follow when a slide image finishes layout. */
  onSlideMediaLayout,
}) {
  const list = Array.isArray(urls) ? urls.map((u) => String(u || '').trim()).filter(Boolean) : []
  const deliveryVariant = variant === 'composer' ? 'composer' : variant
  const [lightbox, setLightbox] = useState(null)
  const carouselScrollRef = useRef(null)
  const urlsKey = list.join('\0')
  useLayoutEffect(() => {
    const el = carouselScrollRef.current
    if (!el) return
    const reset = () => {
      el.scrollLeft = 0
      try {
        el.scrollTo({ left: 0, behavior: 'instant' })
      } catch {
        // ignore
      }
    }
    reset()
    const id0 = requestAnimationFrame(reset)
    const id1 = requestAnimationFrame(() => {
      reset()
    })
    return () => {
      cancelAnimationFrame(id0)
      cancelAnimationFrame(id1)
    }
  }, [urlsKey])
  const isComposer = variant === 'composer'
  /** When the media strip re-enters the scroll container (or viewport), snap back to slide 1. */
  useEffect(() => {
    if (isComposer || !list.length) return
    const scroller = carouselScrollRef.current
    if (!scroller) return
    const observeTarget = scroller.parentElement
    if (!observeTarget) return
    const scrollRoot = visibilityResetRootRef?.current ?? null

    const resetToStart = () => {
      scroller.scrollLeft = 0
      try {
        scroller.scrollTo({ left: 0, behavior: 'instant' })
      } catch {
        // ignore
      }
    }

    /** Geometry check: more reliable than IO alone for nested scroll + freshly mounted rows (e.g. new posts). */
    const stripIntersectsRoot = (rootEl, targetEl) => {
      if (!rootEl || !targetEl) return false
      const rr = rootEl.getBoundingClientRect()
      const tr = targetEl.getBoundingClientRect()
      if (tr.height < 6 || tr.width < 6) return false
      return tr.bottom > rr.top + 2 && tr.top < rr.bottom - 2 && tr.right > rr.left + 2 && tr.left < rr.right - 2
    }

    let wasOut = false
    let raf = 0
    const runScrollGeometry = () => {
      if (!scrollRoot) return
      const inView = stripIntersectsRoot(scrollRoot, observeTarget)
      if (!inView) {
        wasOut = true
        return
      }
      if (wasOut) {
        wasOut = false
        resetToStart()
      }
    }
    const scheduleGeometry = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        runScrollGeometry()
      })
    }

    if (scrollRoot) {
      scrollRoot.addEventListener('scroll', scheduleGeometry, { passive: true })
      window.addEventListener('resize', scheduleGeometry, { passive: true })
      scheduleGeometry()
    }

    let io = null
    if (typeof IntersectionObserver !== 'undefined') {
      let wasVisibleEnough = false
      const visibleEnough = (en) => en.isIntersecting && en.intersectionRatio >= 0.05
      io = new IntersectionObserver(
        (entries) => {
          const en = entries[0]
          if (!en) return
          const now = visibleEnough(en)
          if (now && !wasVisibleEnough) resetToStart()
          wasVisibleEnough = now
        },
        {
          root: scrollRoot,
          rootMargin: '0px',
          threshold: [0, 0.02, 0.05, 0.12, 0.25],
        }
      )
      io.observe(observeTarget)
    }

    return () => {
      if (scrollRoot) {
        scrollRoot.removeEventListener('scroll', scheduleGeometry)
        window.removeEventListener('resize', scheduleGeometry)
      }
      if (raf) window.cancelAnimationFrame(raf)
      if (io) io.disconnect()
    }
  }, [urlsKey, isComposer, list.length, visibilityResetRootRef])
  const imgClass = imgClassByVariant[variant] || imgClassByVariant.feed
  const canOpenLightbox = enableLightbox && !isComposer && typeof onRemoveIndex !== 'function'
  /** Cap slide width in the row; inner frame still shrinks to image (`inline-block` + `w-auto` img). */
  const slideMaxW = isComposer
    ? 'max-w-[min(78vw,18rem)]'
    : 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]'
  const rounding = variant === 'embed' ? 'rounded-lg' : 'rounded-xl'
  const border =
    variant === 'embed' ? 'border-zinc-600/40' : variant === 'commentInline' ? 'border-zinc-700/50' : 'border-zinc-700/60'

  const nudgeScrollStart = () => {
    const el = carouselScrollRef.current
    if (!el) return
    el.scrollLeft = 0
    try {
      el.scrollTo({ left: 0, behavior: 'instant' })
    } catch {
      // ignore
    }
  }

  const notifySlideMediaLayout = () => {
    if (typeof onSlideMediaLayout === 'function') onSlideMediaLayout()
  }

  return (
    <div className={`${firstMarginTopClass} w-full min-w-0`}>
      <div
        ref={carouselScrollRef}
        className={`flex max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] snap-x snap-mandatory [-webkit-overflow-scrolling:touch] ${isComposer ? 'scroll-smooth' : ''}`}
        role="region"
        aria-label={regionAriaLabel}
      >
        {list.map((url, i) => {
          const displaySrc = loungeFeedImageDeliveryUrl(url, deliveryVariant)
          return (
          <div
            key={`${url}-${i}`}
            className={`relative w-auto shrink-0 snap-start ${!isComposer ? 'min-w-[3rem]' : ''} ${slideMaxW}`}
          >
            {canOpenLightbox ? (
              <div
                role="button"
                tabIndex={0}
                data-lounge-image-zoom
                className="block max-w-full cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightbox({ urls: list, index: i })
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setLightbox({ urls: list, index: i })
                  }
                }}
                aria-label="View full image"
                title="View full image"
              >
                <div className={`inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`}>
                  <img
                    src={displaySrc}
                    alt=""
                    className={imgClass}
                    loading={i === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    fetchPriority={i === 0 ? 'high' : undefined}
                    onLoad={() => {
                      if (i === 0) nudgeScrollStart()
                      notifySlideMediaLayout()
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className={`inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`}>
                <img
                  src={displaySrc}
                  alt=""
                  className={imgClass}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={i === 0 ? 'high' : undefined}
                  onLoad={() => {
                    if (i === 0) nudgeScrollStart()
                    notifySlideMediaLayout()
                  }}
                />
              </div>
            )}
            {typeof onRemoveIndex === 'function' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemoveIndex(i)
                }}
                className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
                aria-label={
                  typeof removeLabelForIndex === 'function' ? removeLabelForIndex(i) : 'Remove image'
                }
                title={typeof removeLabelForIndex === 'function' ? removeLabelForIndex(i) : 'Remove image'}
              >
                ×
              </button>
            ) : null}
          </div>
          )
        })}
      </div>
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
 * Mid-scroll autoplay coordinator id - unique per feed/detail row surface, not canonical post id
 * (reposts of the same clip must not share one DOM registration).
 */
function loungeFeedAutoplayClientId({
  enableLightbox,
  variant,
  streamUid,
  postId,
  hostRowId,
  slot,
  scope,
}) {
  if (!enableLightbox || !streamUid) return undefined
  const uid = String(streamUid).trim()
  if (!uid) return undefined
  const mediaPostId = String(postId || '').trim()
  const rowId = String(hostRowId || mediaPostId || '').trim()
  const scopePrefix = scope === 'detail' ? 'detail' : ''
  const withScope = (tail) => (scopePrefix ? `${scopePrefix}:${tail}` : tail)

  if (variant === 'commentInline') {
    if (!mediaPostId) return undefined
    if (hostRowId) {
      const s = String(slot || 'comment').trim()
      return withScope(s ? `${rowId}:${s}:${uid}` : `${rowId}:${uid}`)
    }
    return `comment:${mediaPostId}:${uid}`
  }
  if (variant === 'detail') {
    if (!mediaPostId) return undefined
    return `detail:${mediaPostId}:${uid}`
  }
  if (variant === 'feed' || variant === 'embed') {
    if (!rowId) return undefined
    const s = String(slot || (variant === 'embed' ? 'embed' : '')).trim()
    return withScope(s ? `${rowId}:${s}:${uid}` : `${rowId}:${uid}`)
  }
  return undefined
}

/**
 * Feed / detail: multi-image carousel when `image_urls` is non-empty; otherwise legacy `media_url` + `gif_url`.
 */
export function LoungePostFeedImagesAndGif({
  post,
  variant = 'feed',
  firstMarginTopClass = 'mt-2',
  enableLightbox = true,
  visibilityResetRootRef,
  lightboxPortalClass = 'z-[100]',
  /** Feed/detail row or comment row for Stream hero chrome (defaults to `post`). */
  streamLightboxHost,
  /** Per-tile overrides merged into lightbox ctx (e.g. comment reply counts). */
  streamLightboxTileCtx,
  /** Surface overrides: repost menu portal z-index + scroll root for this strip. */
  streamLightboxSurface,
  /** Feed/detail row id when media `post` is not the host card (plain/quote/comment reposts). */
  feedAutoplayRowId,
  /** Optional slot when one row has multiple Stream tiles (e.g. quote caption + embed). */
  feedAutoplaySlot,
  /** Prefix coordinator ids in post detail (`detail:…`) while using feed/embed variant tiles. */
  feedAutoplayScope,
}) {
  const streamLightbox = useLoungeStreamLightbox()
  const lightboxHost = streamLightboxHost ?? post
  const imageLightboxMenuRenderer =
    streamLightbox && lightboxHost
      ? () => streamLightbox.buildImageMenu(lightboxHost, streamLightboxTileCtx, streamLightboxSurface)
      : null
  const imageLightboxTopBarExtraRenderer =
    streamLightbox && lightboxHost
      ? () => streamLightbox.buildImageTopBarExtra(lightboxHost, post, streamLightboxTileCtx, streamLightboxSurface)
      : null
  const imageLightboxInteractionBarRenderer =
    streamLightbox &&
    lightboxHost &&
    !streamLightboxTileCtx?.hideLightboxInteractionBar
      ? (dismissLightbox) =>
          streamLightbox.buildImageInteractionBar(
            lightboxHost,
            post,
            dismissLightbox,
            streamLightboxTileCtx,
            streamLightboxSurface,
          )
      : null
  const chromeRenderer =
    streamLightbox && lightboxHost
      ? (dismissLightbox) =>
          streamLightbox.buildChrome(
            lightboxHost,
            post,
            dismissLightbox,
            streamLightboxTileCtx,
            streamLightboxSurface,
          )
      : null
  const menuRenderer =
    streamLightbox && lightboxHost
      ? () => streamLightbox.buildMenu(lightboxHost, streamLightboxTileCtx, streamLightboxSurface)
      : null
  const topBarExtraRenderer =
    streamLightbox && lightboxHost
      ? () => streamLightbox.buildTopBarExtra(lightboxHost, post, streamLightboxTileCtx, streamLightboxSurface)
      : null
  const streamUid = feedPostStreamVideoUid(post)
  const persistedStreamPoster = streamUid ? feedPostStreamPosterUrl(post) : ''
  const streamDims = streamUid ? feedPostStreamVideoDisplayDimensions(post) : null
  const sessionStreamPosterUrl = streamUid ? peekLoungeStreamSessionPoster(streamUid) : ''
  const feedAutoplayClientId = loungeFeedAutoplayClientId({
    enableLightbox,
    variant,
    streamUid,
    postId: post?.id,
    hostRowId: feedAutoplayRowId,
    slot: feedAutoplaySlot,
    scope: feedAutoplayScope,
  })
  if (streamUid) {
    return (
      <LoungePostStreamVideo
        key={feedAutoplayClientId || streamUid}
        uid={streamUid}
        variant={variant}
        firstMarginTopClass={firstMarginTopClass}
        enableLightbox={enableLightbox}
        visibilityResetRootRef={visibilityResetRootRef}
        feedAutoplayClientId={feedAutoplayClientId}
        sessionPosterUrl={sessionStreamPosterUrl || undefined}
        persistedStreamPosterUrl={persistedStreamPoster || undefined}
        streamVideoDisplayWidth={streamDims?.width}
        streamVideoDisplayHeight={streamDims?.height}
        renderMediaLightboxChrome={chromeRenderer}
        renderMediaLightboxMenu={menuRenderer}
        renderMediaLightboxTopBarExtra={topBarExtraRenderer}
        lightboxPortalClass={lightboxPortalClass}
      />
    )
  }
  const imageLightboxProps = {
    lightboxPortalClass,
    renderMediaLightboxMenu: imageLightboxMenuRenderer,
    renderMediaLightboxTopBarExtra: imageLightboxTopBarExtraRenderer,
    renderMediaLightboxInteractionBar: imageLightboxInteractionBarRenderer,
  }
  const imgs = feedPostImageUrls(post)
  const gif = String(post?.gif_url || '').trim()
  if (imgs.length > 0) {
    const urls = gif ? [...imgs, gif] : imgs
    return (
      <LoungeImageCarousel
        urls={urls}
        variant={variant}
        firstMarginTopClass={firstMarginTopClass}
        regionAriaLabel={gif ? 'Post images and GIF' : 'Post images'}
        enableLightbox={enableLightbox}
        visibilityResetRootRef={visibilityResetRootRef}
        {...imageLightboxProps}
      />
    )
  }
  return (
    <LoungePostMediaPair
      mediaUrl={post?.media_url}
      gifUrl={post?.gif_url}
      variant={variant}
      firstMarginTopClass={firstMarginTopClass}
      enableLightbox={enableLightbox}
      {...imageLightboxProps}
    />
  )
}
