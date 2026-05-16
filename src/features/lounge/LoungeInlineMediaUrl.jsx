import { useCallback, useEffect, useMemo, useState } from 'react'
import { mergeLightboxDismissOnQuoteRepost } from './loungeLightboxFooterDismissQuote.js'
import { createPortal } from 'react-dom'

function normalizeUrlList(urls) {
  if (!Array.isArray(urls)) return []
  return urls.map((u) => String(u ?? '').trim()).filter(Boolean)
}

/**
 * Full-screen image viewer (feed / detail). Portals to `document.body` above sheets and feed rows.
 * Pass `urls` + `initialIndex` for multi-image navigation; or legacy single `url`.
 * @param {import('react').ReactNode} [footer] — e.g. post interaction bar; clicks do not close the lightbox.
 */
export function LoungeImageLightbox({ url, urls, initialIndex = 0, onClose, footer }) {
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

  const goPrev = useCallback(() => {
    setIdx((i) => (list.length <= 1 ? i : i <= 0 ? list.length - 1 : i - 1))
  }, [list.length])

  const goNext = useCallback(() => {
    setIdx((i) => (list.length <= 1 ? i : i >= list.length - 1 ? 0 : i + 1))
  }, [list.length])

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

  const multi = list.length > 1

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/75 backdrop-blur-[2px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label={multi ? `Image ${idx + 1} of ${list.length}` : 'Full image'}
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
        {multi ? (
          <>
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => {
                e.stopPropagation()
                goPrev()
              }}
              className="absolute left-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-950/75 text-zinc-100 shadow-lg backdrop-blur-sm hover:bg-zinc-800/90 sm:left-2 sm:h-12 sm:w-12 [-webkit-tap-highlight-color:transparent]"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => {
                e.stopPropagation()
                goNext()
              }}
              className="absolute right-1 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-950/75 text-zinc-100 shadow-lg backdrop-blur-sm hover:bg-zinc-800/90 sm:right-2 sm:h-12 sm:w-12 [-webkit-tap-highlight-color:transparent]"
            >
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium tabular-nums text-zinc-200">
              {idx + 1} / {list.length}
            </div>
          </>
        ) : null}
        <img
          key={current}
          src={current}
          alt=""
          className="max-h-full max-w-full object-contain"
          loading="eager"
          decoding="async"
        />
      </div>
      {footer ? (
        <div
          className="shrink-0 border-t border-zinc-700/50 bg-black/40 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
    </div>,
    document.body
  )
}

/**
 * GIF/photo URL shown below the post caption (always under the final line of text).
 * @param {string} [marginTopClass] — Tailwind margin-top on the wrapper (default `mt-2` after caption).
 * @param {boolean} [enableLightbox] — Tap to open fullscreen (feed/detail); set false for non-interactive embeds if needed.
 * @param {import('react').ReactNode} [lightboxFooter] — Shown below the image in fullscreen (e.g. interactions).
 */
export function LoungeInlineMediaUrl({
  url,
  variant = 'feed',
  marginTopClass = 'mt-2',
  enableLightbox = true,
  lightboxFooter,
}) {
  const [lightbox, setLightbox] = useState(null)
  const lightboxFooterMerged = useMemo(
    () => mergeLightboxDismissOnQuoteRepost(lightboxFooter, () => setLightbox(null)),
    [lightboxFooter, setLightbox],
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

  const framed = (
    <div className={`inline-block max-w-full overflow-hidden ${rounding} border ${border} bg-zinc-950/40`}>
      <img src={url} alt="" className={imgClass} loading="lazy" decoding="async" />
    </div>
  )

  return (
    <div className={`${marginTopClass} flex justify-start`}>
      {enableLightbox ? (
        <div
          role="button"
          tabIndex={0}
          data-lounge-image-zoom
          className="max-w-full cursor-zoom-in touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
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
          footer={lightboxFooterMerged}
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
  lightboxFooter,
}) {
  const m = mediaUrl != null ? String(mediaUrl).trim() : ''
  const g = gifUrl != null ? String(gifUrl).trim() : ''
  if (!m && !g) return null
  if (m && g) {
    return (
      <>
        <LoungeInlineMediaUrl url={m} variant={variant} marginTopClass={firstMarginTopClass} enableLightbox={enableLightbox} lightboxFooter={lightboxFooter} />
        <LoungeInlineMediaUrl url={g} variant={variant} marginTopClass="mt-2" enableLightbox={enableLightbox} lightboxFooter={lightboxFooter} />
      </>
    )
  }
  const single = m || g
  return <LoungeInlineMediaUrl url={single} variant={variant} marginTopClass={firstMarginTopClass} enableLightbox={enableLightbox} lightboxFooter={lightboxFooter} />
}
