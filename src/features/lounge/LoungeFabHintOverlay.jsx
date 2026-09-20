import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

const FAB_HOST_SELECTOR = '[data-lounge-dock-fab-host]'

function readFabHostRect() {
  if (typeof document === 'undefined') return null
  const el = document.querySelector(FAB_HOST_SELECTOR)
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

function ArrowToFab({ fabRect, cardRect }) {
  if (!fabRect || !cardRect) return null

  const startX = cardRect.left + cardRect.width / 2
  const startY = cardRect.bottom + 4
  const endX = fabRect.centerX
  const endY = fabRect.top - 4
  const midY = (startY + endY) / 2

  const path = `M ${startX} ${startY} Q ${startX} ${midY} ${endX} ${endY}`

  return (
    <svg
      className="lounge-fab-hint-arrow pointer-events-none fixed inset-0 z-[1] h-full w-full"
      aria-hidden
    >
      <defs>
        <marker
          id="lounge-fab-hint-arrowhead"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#06cefc" />
        </marker>
      </defs>
      <path
        d={path}
        fill="none"
        stroke="#06cefc"
        strokeWidth="3"
        strokeLinecap="round"
        markerEnd="url(#lounge-fab-hint-arrowhead)"
        pathLength="1"
        className="lounge-fab-hint-arrow__path"
      />
    </svg>
  )
}

/**
 * One-time hint: cyan arrow to the Lounge dock + FAB (compose, search, chat, settings).
 * Shown after the Slots menu hint on a signed-in member's first Lounge visit.
 */
export default function LoungeFabHintOverlay({ open, onDismiss, autoDismissMs = 0 }) {
  const [fabRect, setFabRect] = useState(null)
  const [cardRect, setCardRect] = useState(null)
  const [cardPos, setCardPos] = useState(null)
  const [cardNode, setCardNode] = useState(null)

  const cardRef = useCallback((node) => {
    setCardNode(node)
  }, [])

  const measure = useCallback(() => {
    const nextFabRect = readFabHostRect()
    setFabRect(nextFabRect)
    if (cardNode) {
      const nextCardRect = cardNode.getBoundingClientRect()
      setCardRect(nextCardRect)
      if (nextFabRect) {
        setCardPos({
          top: Math.max(12, nextFabRect.top - nextCardRect.height - 20),
          left: Math.min(
            Math.max(12, nextFabRect.centerX - nextCardRect.width / 2),
            window.innerWidth - nextCardRect.width - 12,
          ),
        })
      }
    }
  }, [cardNode])

  useEffect(() => {
    if (!open) return undefined
    measure()
    const onLayout = () => measure()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)
    const fabEl = document.querySelector(FAB_HOST_SELECTOR)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onLayout) : null
    if (fabEl) ro?.observe(fabEl)
    if (cardNode) ro?.observe(cardNode)
    const raf = window.requestAnimationFrame(onLayout)
    const retry = window.setInterval(onLayout, 250)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearInterval(retry)
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
      ro?.disconnect()
    }
  }, [open, measure, cardNode])

  useEffect(() => {
    if (!open || !autoDismissMs || typeof onDismiss !== 'function') return undefined
    const timer = window.setTimeout(() => onDismiss(), autoDismissMs)
    return () => window.clearTimeout(timer)
  }, [open, autoDismissMs, onDismiss])

  if (!open || typeof document === 'undefined') return null

  const cardStyle =
    cardPos ??
    (fabRect != null
      ? {
          top: Math.max(12, fabRect.top - 188),
          left: Math.min(
            Math.max(12, fabRect.centerX - 144),
            window.innerWidth - Math.min(window.innerWidth - 24, 288) - 12,
          ),
        }
      : { bottom: '6.5rem', left: '50%', transform: 'translateX(-50%)', width: 'min(calc(100vw - 1.5rem), 18rem)' })

  return createPortal(
    <div
      className="fixed inset-0 touch-manipulation"
      style={{ zIndex: Z_APP_MODAL }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-fab-hint-title"
      data-lounge-fab-hint
    >
      <button
        type="button"
        aria-label="Dismiss Lounge menu hint"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        onClick={() => onDismiss?.()}
      />

      {fabRect ? (
        <div
          className="pointer-events-none absolute rounded-full ring-2 ring-cyan-400/85 shadow-[0_0_0_8px_rgba(6,206,252,0.22)] animate-pulse"
          style={{
            top: fabRect.top - 6,
            left: fabRect.left - 6,
            width: fabRect.width + 12,
            height: fabRect.height + 12,
          }}
          aria-hidden
        />
      ) : null}

      <ArrowToFab fabRect={fabRect} cardRect={cardRect} />

      <div
        ref={cardRef}
        className="lounge-fab-hint-card absolute z-[2] w-[min(calc(100vw-1.5rem),18rem)] rounded-2xl border border-cyan-500/35 bg-zinc-950/96 px-4 py-4 shadow-2xl backdrop-blur-md"
        style={cardStyle}
      >
        <h2 id="lounge-fab-hint-title" className="text-[15px] font-semibold text-white">
          Your Lounge menu lives here
        </h2>
        <p className="mt-2 text-[13px] leading-snug text-zinc-300">
          Tap the <span className="font-semibold text-cyan-300">+</span> button for{' '}
          <span className="font-semibold text-zinc-100">New post</span>, search, chat, and settings. Hold to move it.
        </p>
      </div>
    </div>,
    document.body,
  )
}
