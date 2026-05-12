import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Full-screen image viewer (feed / detail). Portals to `document.body` above sheets and feed rows.
 */
export function LoungeImageLightbox({ url, onClose }) {
  useEffect(() => {
    if (!url) return
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
  }, [url, onClose])

  if (!url) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/92 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-label="Full image"
      onClick={onClose}
    >
      <div className="flex shrink-0 justify-end">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          className="touch-manipulation rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-1.5 text-[14px] font-semibold text-zinc-200 hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500/50"
        >
          Close
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={url} alt="" className="max-h-full max-w-full object-contain" loading="eager" decoding="async" />
      </div>
    </div>,
    document.body
  )
}

/**
 * GIF/photo URL shown below the post caption (always under the final line of text).
 * @param {string} [marginTopClass] — Tailwind margin-top on the wrapper (default `mt-2` after caption).
 * @param {boolean} [enableLightbox] — Tap to open fullscreen (feed/detail); set false for non-interactive embeds if needed.
 */
export function LoungeInlineMediaUrl({ url, variant = 'feed', marginTopClass = 'mt-2', enableLightbox = true }) {
  const [lightboxUrl, setLightboxUrl] = useState(null)
  if (!url) return null
  const isEmbed = variant === 'embed'
  const isDetail = variant === 'detail'
  const imgClass = isDetail
    ? 'block max-h-56 w-auto max-w-full h-auto object-contain sm:max-h-60'
    : isEmbed
      ? 'block max-h-40 w-auto max-w-full h-auto object-contain sm:max-h-44'
      : 'block max-h-48 w-auto max-w-full h-auto object-contain sm:max-h-52'
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
            setLightboxUrl(String(url).trim())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              e.stopPropagation()
              setLightboxUrl(String(url).trim())
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
      {lightboxUrl ? <LoungeImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} /> : null}
    </div>
  )
}

/**
 * Renders `media_url` then optional `gif_url` (image + external GIF), or a single legacy URL in `media_url`.
 * @param {string} [firstMarginTopClass]
 */
export function LoungePostMediaPair({ mediaUrl, gifUrl, variant = 'feed', firstMarginTopClass = 'mt-2', enableLightbox = true }) {
  const m = mediaUrl != null ? String(mediaUrl).trim() : ''
  const g = gifUrl != null ? String(gifUrl).trim() : ''
  if (!m && !g) return null
  if (m && g) {
    return (
      <>
        <LoungeInlineMediaUrl url={m} variant={variant} marginTopClass={firstMarginTopClass} enableLightbox={enableLightbox} />
        <LoungeInlineMediaUrl url={g} variant={variant} marginTopClass="mt-2" enableLightbox={enableLightbox} />
      </>
    )
  }
  const single = m || g
  return <LoungeInlineMediaUrl url={single} variant={variant} marginTopClass={firstMarginTopClass} enableLightbox={enableLightbox} />
}
