import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PULL_DISMISS_THRESHOLD_PX = 80
const PULL_DISMISS_VELOCITY     = 0.4 // px/ms

/**
 * Full-screen scroll-snap image viewer for chat messages.
 * Images stack vertically - scroll up/down to browse. Pull down at top to dismiss.
 *
 * @param {{
 *   urls: string[],
 *   initialIndex?: number,
 *   onClose: () => void,
 * }} props
 */
export default function ChatImageMediaViewer({ urls, initialIndex = 0, onClose }) {
  const items = (urls || []).filter(Boolean)
  const scrollRef = useRef(null)
  const [activeIdx, setActiveIdx] = useState(Math.min(initialIndex, Math.max(0, items.length - 1)))

  // Light mode: the iOS PWA status bar is white and unreachable, so paint the
  // viewer backdrop light too - the white bar blends in instead of clashing with
  // black. Dark mode keeps the black cinematic backdrop.
  const isLight =
    typeof document !== 'undefined' && document.documentElement.classList.contains('light')
  const backdrop = isLight ? '250, 250, 250' : '0, 0, 0'

  const [pullY, setPullY] = useState(0)
  const [dismissing, setDismissing] = useState(false)
  const touchStartY = useRef(0)
  const touchStartMs = useRef(0)
  const pulling = useRef(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || initialIndex === 0) return
    el.scrollTop = initialIndex * el.clientHeight
  }, [initialIndex])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const itemEls = Array.from(el.querySelectorAll('[data-media-item]'))
    if (!itemEls.length) return
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const i = parseInt(entry.target.dataset.mediaItem, 10)
            if (!isNaN(i)) setActiveIdx(i)
          }
        })
      },
      { root: el, threshold: 0.5 },
    )
    itemEls.forEach((node) => io.observe(node))
    return () => io.disconnect()
  }, [items.length])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        const el = scrollRef.current
        if (el) el.scrollBy({ top: el.clientHeight, behavior: 'smooth' })
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        const el = scrollRef.current
        if (el) el.scrollBy({ top: -el.clientHeight, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onTouchStart = (e) => {
    touchStartY.current = e.touches[0].clientY
    touchStartMs.current = Date.now()
    pulling.current = false
  }

  const onTouchMove = (e) => {
    const el = scrollRef.current
    if (!el) return
    const dy = e.touches[0].clientY - touchStartY.current

    if (el.scrollTop <= 0 && dy > 0) {
      pulling.current = true
      e.preventDefault()
      setPullY(dy)
    }
  }

  const onTouchEnd = (e) => {
    if (!pulling.current) {
      setPullY(0)
      return
    }
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const elapsed = Math.max(1, Date.now() - touchStartMs.current)
    const vy = dy / elapsed

    if (dy > PULL_DISMISS_THRESHOLD_PX || vy > PULL_DISMISS_VELOCITY) {
      setDismissing(true)
      setTimeout(onClose, 220)
    } else {
      pulling.current = false
      setPullY(0)
    }
  }

  if (!items.length) return null

  const bgOpacity = dismissing ? 0 : 1
  const translateY = dismissing ? 350 : pullY

  return createPortal(
    <div
      data-chat-image-lightbox
      className="fixed inset-0 z-[130]"
      style={{
        backgroundColor: `rgba(${backdrop},${bgOpacity})`,
        transition: dismissing ? 'background-color 0.22s ease' : undefined,
      }}
    >
      {/* Chrome stays fixed - only media layer translates on pull-to-dismiss (see ChatVideoLightbox). */}
      <div className="media-lightbox-status-bar-blend pointer-events-none absolute inset-x-0 top-0 z-[11]" aria-hidden />
      <div
        data-chat-image-lightbox-header
        className="pointer-events-none absolute inset-x-0 top-0 z-[12]"
      >
        <div className="pointer-events-auto flex items-center px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="chat-header-glass media-lightbox-nav-btn relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-100 touch-manipulation transition-opacity active:opacity-70"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
      </div>

      {items.length > 1 && (
        <div
          data-chat-image-lightbox-footer
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[12]"
        >
          <div className="pointer-events-auto flex justify-center gap-1.5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const el = scrollRef.current
                  if (el) el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' })
                }}
                className={`h-1.5 rounded-full transition-all touch-manipulation ${
                  isLight
                    ? i === activeIdx ? 'w-4 bg-zinc-600' : 'w-1.5 bg-zinc-800'
                    : i === activeIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                }`}
                aria-label={`Go to image ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}

      <div
        className="absolute inset-0 z-0"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: dismissing || pullY === 0 ? 'transform 0.22s ease' : undefined,
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {items.map((url, i) => (
            <div
              key={url || i}
              data-media-item={i}
              className="relative flex h-full w-full items-center justify-center overflow-hidden"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <img
                src={url}
                alt=""
                className="relative z-[1] max-h-full max-w-full object-contain"
                draggable={false}
              />
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
