import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

const SLOTS_TOOL_LABELS = ['AP Guides', 'Calcs', 'Calendar', 'Bankroll', 'Logbook']
const MENU_BTN_SELECTOR = '[data-title-bar-menu-btn]'

function readMenuButtonRect() {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(MENU_BTN_SELECTOR)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  }
}

function ArrowToMenu({ menuRect, cardRect }) {
  if (!menuRect || !cardRect) return null

  const startX = cardRect.left + cardRect.width * 0.72
  const startY = cardRect.top + 8
  const endX = menuRect.centerX
  const endY = menuRect.bottom + 4
  const midX = (startX + endX) / 2
  const midY = startY - 28

  const path = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`

  return (
    <svg
      className="lounge-slots-menu-hint-arrow pointer-events-none fixed inset-0 z-[1] h-full w-full"
      aria-hidden
    >
      <defs>
        <marker
          id="lounge-slots-menu-hint-arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#f97316" />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="#f97316"
        strokeWidth="3"
        strokeLinecap="round"
        markerEnd="url(#lounge-slots-menu-hint-arrowhead)"
        pathLength="1"
        className="lounge-slots-menu-hint-arrow__path"
      />
    </svg>
  )
}

/** One-time hint after Lounge welcome: orange arrow to the real ☰ menu button. */
export default function LoungeSlotsMenuHintOverlay({ open, onDismiss }) {
  const [menuRect, setMenuRect] = useState(null)
  const [cardRect, setCardRect] = useState(null)
  const [cardNode, setCardNode] = useState(null)

  const cardRef = useCallback((node) => {
    setCardNode(node)
  }, [])

  const measure = useCallback(() => {
    setMenuRect(readMenuButtonRect())
    if (cardNode) setCardRect(cardNode.getBoundingClientRect())
  }, [cardNode])

  useEffect(() => {
    if (!open) return undefined
    measure()
    const onLayout = () => measure()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)
    const menuEl = document.querySelector(MENU_BTN_SELECTOR)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onLayout) : null
    if (menuEl) ro?.observe(menuEl)
    if (cardNode) ro?.observe(cardNode)
    const raf = window.requestAnimationFrame(onLayout)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
      ro?.disconnect()
    }
  }, [open, measure, cardNode])

  if (!open || typeof document === 'undefined') return null

  const cardStyle =
    menuRect != null
      ? {
          top: Math.min(menuRect.bottom + 52, window.innerHeight - 220),
          right: Math.max(12, window.innerWidth - menuRect.right - 8),
        }
      : { top: '5.5rem', right: '0.75rem' }

  return createPortal(
    <div
      className="fixed inset-0 touch-manipulation"
      style={{ zIndex: Z_APP_MODAL }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-slots-menu-hint-title"
      data-lounge-slots-menu-hint
    >
      <button
        type="button"
        aria-label="Dismiss slot tools hint"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={() => onDismiss?.()}
      />

      {menuRect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-orange-400/80 shadow-[0_0_0_6px_rgba(249,115,22,0.22)] animate-pulse"
          style={{
            top: menuRect.top - 4,
            left: menuRect.left - 4,
            width: menuRect.width + 8,
            height: menuRect.height + 8,
          }}
          aria-hidden
        />
      ) : null}

      <ArrowToMenu menuRect={menuRect} cardRect={cardRect} />

      <div
        ref={cardRef}
        className="lounge-slots-menu-hint-card absolute z-[2] w-[min(calc(100vw-1.5rem),18rem)] rounded-2xl border border-orange-500/35 bg-zinc-950/96 px-4 py-4 shadow-2xl backdrop-blur-md"
        style={cardStyle}
      >
        <h2 id="lounge-slots-menu-hint-title" className="text-[15px] font-semibold text-white">
          Guides & tools live in the top menu
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-zinc-300">
          Tap <span className="font-semibold text-zinc-100">☰</span> →{' '}
          <span className="font-semibold text-zinc-100">Slots</span> for {SLOTS_TOOL_LABELS.join(', ')}.
        </p>
        <button
          type="button"
          onClick={() => onDismiss?.()}
          className="mt-4 w-full min-h-11 rounded-xl bg-orange-600 text-[14px] font-semibold text-white touch-manipulation hover:bg-orange-500 active:bg-orange-700 [-webkit-tap-highlight-color:transparent]"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
