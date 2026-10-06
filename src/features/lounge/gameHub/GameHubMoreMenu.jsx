import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardList, MoreHorizontal, Share, ShieldCheck, Volume2, VolumeX } from 'lucide-react'
import { Z_APP_MODAL } from '../../../constants/appZIndex.js'
import { stateName, US_STATES } from './gameHubLegalBooks.js'

/**
 * Hub "..." chip: game sounds toggle, books-in-my-state (on/off + state pick), share. Menu portals to body
 * (the hero clips overflow) and anchors under the chip's right edge.
 */
export default function GameHubMoreMenu({
  chipClassName,
  muted,
  onToggleMuted,
  legalBooks,
  onToggleLegalBooks,
  onPickLegalState,
  onShare,
  onLogBet,
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (r) setAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const itemClass =
    'flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium touch-manipulation [-webkit-tap-highlight-color:transparent] '

  const legalSelectValue = !legalBooks?.on
    ? '__off__'
    : legalBooks.statePicked && legalBooks.state
      ? legalBooks.state
      : '__auto__'

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-lounge-game-glass-chip
        className={chipClassName}
        aria-label="More game options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2.25} />
      </button>
      {open && anchor && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              data-lounge-game-more-menu
              className="fixed min-w-[13rem] overflow-hidden rounded-2xl border shadow-sm"
              style={{ top: anchor.top, right: anchor.right, zIndex: Z_APP_MODAL + 1 }}
            >
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                data-lounge-hub-whistle-toggle={muted ? 'muted' : 'on'}
                onClick={() => {
                  onToggleMuted?.()
                  setOpen(false)
                }}
              >
                {muted ? (
                  <Volume2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                ) : (
                  <VolumeX className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                )}
                {muted ? 'Unmute game sounds' : 'Mute game sounds'}
              </button>
              <div data-lounge-game-more-menu-divider className="h-px" />
              <label
                role="menuitem"
                className={`${itemClass} relative`}
                data-lounge-game-legal-toggle={legalBooks?.on ? 'on' : 'off'}
              >
                <ShieldCheck className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                <span className="flex-1">Only books in my state</span>
                <span className="text-[12px] font-semibold opacity-70">
                  {legalBooks?.on
                    ? legalBooks.state
                      ? `On · ${legalBooks.state}${legalBooks.statePicked ? '' : ' (auto)'}`
                      : 'Pick state'
                    : 'Off'}
                </span>
                <select
                  aria-label="Only books in my state"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={legalSelectValue}
                  onChange={(e) => {
                    const next = e.target.value
                    if (next === '__off__') {
                      if (legalBooks?.on) onToggleLegalBooks?.()
                    } else if (next === '__auto__') {
                      onPickLegalState?.(null)
                      if (!legalBooks?.on) onToggleLegalBooks?.()
                    } else {
                      onPickLegalState?.(next)
                    }
                    setOpen(false)
                  }}
                >
                  <option value="__off__">Off</option>
                  <option value="__auto__">
                    {legalBooks?.geoState
                      ? `Auto-detect (${stateName(legalBooks.geoState)})`
                      : 'Auto-detect'}
                  </option>
                  {Object.entries(US_STATES)
                    .sort((a, b) => a[1].localeCompare(b[1]))
                    .map(([code, name]) => (
                      <option key={code} value={code}>
                        {name}
                      </option>
                    ))}
                </select>
              </label>
              {onLogBet ? (
                <>
                  <div data-lounge-game-more-menu-divider className="h-px" />
                  <button
                    type="button"
                    role="menuitem"
                    className={itemClass}
                    onClick={() => {
                      setOpen(false)
                      onLogBet?.()
                    }}
                  >
                    <ClipboardList className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                    Log a bet
                  </button>
                </>
              ) : null}
              <div data-lounge-game-more-menu-divider className="h-px" />
              <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                  setOpen(false)
                  void onShare?.()
                }}
              >
                <Share className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                Share game
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
