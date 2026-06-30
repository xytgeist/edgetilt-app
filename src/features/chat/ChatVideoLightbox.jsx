import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD,
  LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS,
} from '../lounge/LoungeStreamVideoLightboxChrome.jsx'
import { useLoungeLightboxSwipeDismiss } from '../lounge/loungeLightboxSwipeDismiss.js'
import { notifyLoungeStreamLightboxOpen } from '../lounge/loungeStreamLightboxRegistry.js'
import { loungeFeedImageDeliveryUrl } from '../../utils/loungeCfImageMedia.js'

/**
 * Full-screen chat video viewer - lounge-style chrome (back + swipe dismiss).
 * R2 MP4 via native `<video>`; legacy CF Stream via iframe.
 */
export default function ChatVideoLightbox({
  videoUid = null,
  videoUrl = null,
  posterUrl = null,
  onClose,
  lightboxPortalClass = 'z-[130]',
}) {
  const videoRef = useRef(null)
  const uid = videoUid ? String(videoUid).trim() : ''
  const url = videoUrl ? String(videoUrl).trim() : ''
  const poster = posterUrl ? loungeFeedImageDeliveryUrl(String(posterUrl).trim(), 'poster') : ''

  const { swipeSurfaceProps } = useLoungeLightboxSwipeDismiss({
    onClose,
    allowSwipeOnVideo: true,
    className: 'relative flex min-h-0 flex-1 flex-col',
  })

  const {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    style: swipeDragStyle,
    className: swipeClassName,
  } = swipeSurfaceProps

  useEffect(() => {
    notifyLoungeStreamLightboxOpen(true)
    return () => notifyLoungeStreamLightboxOpen(false)
  }, [])

  useEffect(() => {
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
  }, [onClose])

  useEffect(() => {
    if (uid || !url) return
    const v = videoRef.current
    if (!v) return
    const play = () => {
      v.play().catch(() => {})
    }
    if (v.readyState >= 2) play()
    else v.addEventListener('loadeddata', play, { once: true })
  }, [uid, url])

  if (!uid && !url) return null

  return createPortal(
    <div
      data-lounge-media-lightbox
      className={`fixed inset-0 ${lightboxPortalClass} flex flex-col bg-black`}
      role="dialog"
      aria-modal="true"
      aria-label="Video"
    >
      <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col justify-between">
        <div
          className={`pointer-events-auto flex shrink-0 items-center justify-between gap-2 ${LOUNGE_HERO_LIGHTBOX_CHROME_X_PAD} pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]`}
          data-lounge-lightbox-no-swipe
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            aria-label="Back"
            className={LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS}
          >
            <span className="text-[22px] leading-none" aria-hidden>
              ←
            </span>
          </button>
        </div>
      </div>
      <div
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={swipeDragStyle}
        className={['relative z-0 flex min-h-0 flex-1 flex-col', swipeClassName].filter(Boolean).join(' ')}
      >
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2">
          {uid ? (
            <iframe
              src={`https://iframe.videodelivery.net/${uid}?autoplay=true&muted=false`}
              className="h-full w-full max-h-full max-w-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              title="Video"
            />
          ) : (
            <video
              ref={videoRef}
              src={url}
              poster={poster || undefined}
              controls
              playsInline
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
