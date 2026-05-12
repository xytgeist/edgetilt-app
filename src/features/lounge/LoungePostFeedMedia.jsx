import { useLayoutEffect, useRef, useState } from 'react'
import { feedPostImageUrls } from '../../utils/communityFeedPost'
import { LoungePostMediaPair, LoungeImageLightbox } from './LoungeInlineMediaUrl.jsx'

/** Match `LoungeInlineMediaUrl`: border wraps intrinsic image size (`w-auto`), not a fixed slide width. */
const imgClassByVariant = {
  feed: 'block max-h-48 w-auto max-w-full h-auto object-contain sm:max-h-52',
  detail: 'block max-h-56 w-auto max-w-full h-auto object-contain sm:max-h-60',
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
}) {
  const list = Array.isArray(urls) ? urls.map((u) => String(u || '').trim()).filter(Boolean) : []
  const [lightboxUrl, setLightboxUrl] = useState(null)
  const carouselScrollRef = useRef(null)
  const urlsKey = list.join('\0')
  useLayoutEffect(() => {
    const el = carouselScrollRef.current
    if (el) el.scrollLeft = 0
  }, [urlsKey])
  if (!list.length) return null
  const imgClass = imgClassByVariant[variant] || imgClassByVariant.feed
  const isComposer = variant === 'composer'
  const canOpenLightbox = enableLightbox && !isComposer && typeof onRemoveIndex !== 'function'
  /** Cap slide width in the row; inner frame still shrinks to image (`inline-block` + `w-auto` img). */
  const slideMaxW = isComposer
    ? 'max-w-[min(78vw,18rem)]'
    : 'max-w-[min(88vw,20rem)] sm:max-w-[min(72vw,17rem)]'
  const rounding = variant === 'embed' ? 'rounded-lg' : 'rounded-xl'
  const border = variant === 'embed' ? 'border-zinc-600/40' : 'border-zinc-700/60'

  return (
    <div className={`${firstMarginTopClass} w-full min-w-0`}>
      <div
        ref={carouselScrollRef}
        className="flex max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain scroll-smooth pb-1 [scrollbar-width:thin] snap-x snap-mandatory [-webkit-overflow-scrolling:touch]"
        role="region"
        aria-label={regionAriaLabel}
      >
        {list.map((url, i) => (
          <div key={`${url}-${i}`} className={`relative w-auto shrink-0 snap-start ${slideMaxW}`}>
            {canOpenLightbox ? (
              <div
                role="button"
                tabIndex={0}
                data-lounge-image-zoom
                className="block max-w-full cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
                onClick={(e) => {
                  e.stopPropagation()
                  setLightboxUrl(url)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    setLightboxUrl(url)
                  }
                }}
                aria-label="View full image"
                title="View full image"
              >
                <div className={`inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`}>
                  <img src={url} alt="" className={imgClass} loading="lazy" decoding="async" />
                </div>
              </div>
            ) : (
              <div className={`inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`}>
                <img src={url} alt="" className={imgClass} loading="lazy" decoding="async" />
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
        ))}
      </div>
      {lightboxUrl ? <LoungeImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
    </div>
  )
}

/**
 * Feed / detail: multi-image carousel when `image_urls` is non-empty; otherwise legacy `media_url` + `gif_url`.
 */
export function LoungePostFeedImagesAndGif({ post, variant = 'feed', firstMarginTopClass = 'mt-2', enableLightbox = true }) {
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
    />
  )
}
