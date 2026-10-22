import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Z_APP_ALERT } from '../../../constants/appZIndex.js'
import {
  countOddsHoldTipShow,
  oddsHoldLearnedEventName,
  shouldShowOddsHoldTip,
} from '../../sports-bet-tracker/oddsHoldHint.js'

const FIRST_LOOK_MS = 1200
const RETRY_MS = 800
const RETRIES = 6
const SHOW_MS = 8000
const EDGE_PX = 12
/** About half the bubble's two-line width so a clamped bubble never runs off screen. */
const HALF_W_PX = 110

function findTarget() {
  const vh = window.innerHeight || 0
  for (const el of document.querySelectorAll('[data-lounge-game-hub] [data-odds-hold]')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.top >= 0 && r.bottom <= vh) return el
  }
  return null
}

function placeFor(el) {
  const r = el.getBoundingClientRect()
  const vw = window.innerWidth || 0
  const below = r.bottom + 90 < (window.innerHeight || 0)
  return {
    x: Math.min(Math.max(r.left + r.width / 2, EDGE_PX + HALF_W_PX), vw - EDGE_PX - HALF_W_PX),
    arrowX: r.left + r.width / 2,
    y: below ? r.bottom + 8 : r.top - 8,
    below,
  }
}

/** One-time bubble on the first holdable line: "Long press any bet to log it in your Bet Tracker". Gone on any touch, a hold, or 8s. */
export default function GameHubOddsHoldTip() {
  const [target, setTarget] = useState(null)
  const [place, setPlace] = useState(null)

  useEffect(() => {
    if (!shouldShowOddsHoldTip()) return undefined
    let tries = 0
    let timer = window.setTimeout(function look() {
      const el = findTarget()
      if (el) {
        countOddsHoldTipShow()
        setTarget(el)
        setPlace(placeFor(el))
        return
      }
      tries += 1
      if (tries < RETRIES) timer = window.setTimeout(look, RETRY_MS)
    }, FIRST_LOOK_MS)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!target) return undefined
    const hide = () => setTarget(null)
    const reflow = () => {
      if (!target.isConnected) hide()
      else setPlace(placeFor(target))
    }
    const done = window.setTimeout(hide, SHOW_MS)
    document.addEventListener('pointerdown', hide, true)
    window.addEventListener(oddsHoldLearnedEventName(), hide)
    window.addEventListener('scroll', reflow, true)
    window.addEventListener('resize', reflow)
    return () => {
      window.clearTimeout(done)
      document.removeEventListener('pointerdown', hide, true)
      window.removeEventListener(oddsHoldLearnedEventName(), hide)
      window.removeEventListener('scroll', reflow, true)
      window.removeEventListener('resize', reflow)
    }
  }, [target])

  if (!target || !place || typeof document === 'undefined') return null
  return createPortal(
    <div
      data-game-hub-hold-tip
      role="status"
      className="pointer-events-none fixed"
      style={{
        zIndex: Z_APP_ALERT,
        left: place.x,
        top: place.y,
        transform: `translate(-50%, ${place.below ? '0' : '-100%'})`,
      }}
    >
      <span
        data-game-hub-hold-tip-arrow
        aria-hidden="true"
        className="absolute h-2.5 w-2.5 rotate-45 border border-cyan-400/50 bg-zinc-900"
        style={{
          left: `calc(50% + ${place.arrowX - place.x}px)`,
          ...(place.below ? { top: -5, borderRight: 0, borderBottom: 0 } : { bottom: -5, borderLeft: 0, borderTop: 0 }),
          marginLeft: -5,
        }}
      />
      <span className="relative block whitespace-nowrap rounded-2xl border border-cyan-400/50 bg-zinc-900 px-3 py-1.5 text-center text-[12px] font-semibold leading-snug text-zinc-100 shadow-[0_6px_24px_rgba(0,0,0,0.45)]">
        Long press any bet
        <br />
        to log it in your Bet Tracker
      </span>
    </div>,
    document.body,
  )
}
