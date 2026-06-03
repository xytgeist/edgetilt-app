import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const PULL_DISMISS_THRESHOLD_PX = 80
const PULL_DISMISS_VELOCITY     = 0.4 // px/ms

/**
 * Full-screen media viewer for chat messages.
 * All items are stacked vertically with scroll-snap — scroll up/down to browse.
 * Pull down past the top to dismiss, or tap ×.
 *
 * @param {{
 *   items: Array<{ type: 'image' | 'video', url?: string, videoUid?: string, posterUrl?: string }>,
 *   initialIndex?: number,
 *   onClose: () => void,
 * }} props
 */
export default function ChatMediaViewer({ items, initialIndex = 0, onClose }) {
  const scrollRef    = useRef(null)
  const [activeIdx, setActiveIdx] = useState(Math.min(initialIndex, items.length - 1))

  // Pull-to-dismiss state
  const [pullY, setPullY]         = useState(0)
  const [dismissing, setDismissing] = useState(false)
  const touchStartY  = useRef(0)
  const touchStartMs = useRef(0)
  const pulling      = useRef(false)   // true once we've committed to pull-to-dismiss gesture

  // Scroll to initial item on mount (instant, no animation)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || initialIndex === 0) return
    el.scrollTop = initialIndex * el.clientHeight
  }, [initialIndex])

  // Track which item is visible via IntersectionObserver
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
    itemEls.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  // Keyboard navigation
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

  // Pull-to-dismiss: only engages when scrolled to the very top
  const onTouchStart = (e) => {
    touchStartY.current  = e.touches[0].clientY
    touchStartMs.current = Date.now()
    pulling.current = false
  }

  const onTouchMove = (e) => {
    const el = scrollRef.current
    if (!el) return
    const dy = e.touches[0].clientY - touchStartY.current

    // Only pull-to-dismiss when we're at scroll top and dragging down
    if (el.scrollTop <= 0 && dy > 0) {
      pulling.current = true
      e.preventDefault()       // prevent rubber-band / scroll fighting
      setPullY(dy)
    }
  }

  const onTouchEnd = (e) => {
    if (!pulling.current) { setPullY(0); return }
    const dy      = e.changedTouches[0].clientY - touchStartY.current
    const elapsed = Math.max(1, Date.now() - touchStartMs.current)
    const vy      = dy / elapsed

    if (dy > PULL_DISMISS_THRESHOLD_PX || vy > PULL_DISMISS_VELOCITY) {
      setDismissing(true)
      setTimeout(onClose, 220)
    } else {
      pulling.current = false
      setPullY(0)
    }
  }

  const bgOpacity  = dismissing ? 0 : Math.max(0, 1 - pullY / 260)
  const translateY = dismissing ? 350 : pullY

  return createPortal(
    <div
      className="fixed inset-0 z-[130]"
      style={{
        backgroundColor: `rgba(0,0,0,${bgOpacity})`,
        transition: dismissing ? 'background-color 0.22s ease' : undefined,
      }}
    >
      {/* Translating shell (moves during pull) */}
      <div
        className="flex h-full flex-col"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: (dismissing || pullY === 0) ? 'transform 0.22s ease' : undefined,
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 pointer-events-auto">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white touch-manipulation active:bg-white/20"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {items.length > 1 && (
            <span className="text-[13px] font-semibold text-white/70">
              {activeIdx + 1} / {items.length}
            </span>
          )}
          <div className="w-9" aria-hidden />
        </div>

        {/* Vertical scroll area */}
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {items.map((item, i) => (
            <div
              key={item.videoUid || item.url || i}
              data-media-item={i}
              className="flex h-full w-full items-center justify-center"
              style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {item.type === 'video' && item.videoUid ? (
                <iframe
                  src={`https://iframe.videodelivery.net/${item.videoUid}?autoplay=${i === activeIdx ? 'true' : 'false'}&muted=false`}
                  className="h-full w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  allowFullScreen
                  title="Video"
                />
              ) : (
                <img
                  src={item.url}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              )}
            </div>
          ))}
        </div>

        {/* Dot indicators */}
        {items.length > 1 && (
          <div className="flex shrink-0 justify-center gap-1.5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const el = scrollRef.current
                  if (el) el.scrollTo({ top: i * el.clientHeight, behavior: 'smooth' })
                }}
                className={`h-1.5 rounded-full transition-all touch-manipulation ${
                  i === activeIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/40'
                }`}
                aria-label={`Go to item ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
