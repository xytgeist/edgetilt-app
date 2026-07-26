import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import {
  LOUNGE_COMPOSER_AUDIENCE_ALL,
  LOUNGE_COMPOSER_AUDIENCE_SUBS,
} from '../../utils/loungeFanOnlyPost.js'

const GAP_PX = 6
const VIEWPORT_PAD_PX = 10
const MENU_MIN_WIDTH_PX = 248

const OPTIONS = [
  {
    id: LOUNGE_COMPOSER_AUDIENCE_ALL,
    label: 'Everyone',
    hint: 'Full post on the Lounge feed',
  },
  {
    id: LOUNGE_COMPOSER_AUDIENCE_SUBS,
    label: 'Subscribers',
    hint: 'Fans see everything; others see a teaser',
  },
]

function measureAudienceMenuPos(anchorEl, menuEl) {
  const anchor = anchorEl.getBoundingClientRect()
  const menuH = menuEl?.offsetHeight ?? 0
  const vv = window.visualViewport
  const vTop = (vv?.offsetTop ?? 0) + VIEWPORT_PAD_PX
  const vBottom = (vv ? vv.offsetTop + vv.height : window.innerHeight) - VIEWPORT_PAD_PX
  const vWidth = vv?.width ?? window.innerWidth
  const width = Math.min(MENU_MIN_WIDTH_PX, vWidth - VIEWPORT_PAD_PX * 2)

  const spaceBelow = Math.max(0, vBottom - anchor.bottom - GAP_PX)
  const spaceAbove = Math.max(0, anchor.top - vTop - GAP_PX)
  const openUp = menuH > 0 && spaceBelow < menuH && spaceAbove > spaceBelow

  let top = openUp ? anchor.top - menuH - GAP_PX : anchor.bottom + GAP_PX
  if (top < vTop) top = vTop
  if (menuH > 0 && top + menuH > vBottom) top = Math.max(vTop, vBottom - menuH)

  let left = anchor.left
  left = Math.max(VIEWPORT_PAD_PX, Math.min(left, vWidth - VIEWPORT_PAD_PX - width))

  return { top, left, width }
}

/**
 * X-style audience pill for monetized creators (Everyone vs Subscribers).
 * Menu portals to document.body so composer overflow:hidden does not clip Subscribers.
 *
 * @param {{
 *   value: typeof LOUNGE_COMPOSER_AUDIENCE_ALL | typeof LOUNGE_COMPOSER_AUDIENCE_SUBS,
 *   onChange: (next: typeof LOUNGE_COMPOSER_AUDIENCE_ALL | typeof LOUNGE_COMPOSER_AUDIENCE_SUBS) => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function LoungeComposerAudiencePill({ value, onChange, disabled = false, className = '' }) {
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const selected =
    value === LOUNGE_COMPOSER_AUDIENCE_SUBS ? LOUNGE_COMPOSER_AUDIENCE_SUBS : LOUNGE_COMPOSER_AUDIENCE_ALL
  const selectedOption = OPTIONS.find((o) => o.id === selected) ?? OPTIONS[0]

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) {
      setMenuPos(null)
      return undefined
    }

    const updatePos = () => {
      if (!buttonRef.current || !menuRef.current) return
      setMenuPos(measureAudienceMenuPos(buttonRef.current, menuRef.current))
    }

    updatePos()
    const vv = window.visualViewport
    vv?.addEventListener('resize', updatePos)
    vv?.addEventListener('scroll', updatePos)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      vv?.removeEventListener('resize', updatePos)
      vv?.removeEventListener('scroll', updatePos)
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDocPointerDown = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const menu =
    open &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        aria-label="Who can see this post"
        style={{
          position: 'fixed',
          zIndex: 9999,
          left: menuPos?.left ?? -9999,
          top: menuPos?.top ?? -9999,
          width: menuPos?.width ?? MENU_MIN_WIDTH_PX,
          visibility: menuPos ? 'visible' : 'hidden',
        }}
        className="overflow-hidden rounded-xl border border-zinc-700/90 bg-zinc-950/98 py-1 shadow-xl backdrop-blur-md"
        data-lounge-composer-audience-menu
      >
        {OPTIONS.map((opt) => {
          const on = opt.id === selected
          return (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={on}
              data-lounge-composer-audience-option={opt.id}
              className={`flex w-full touch-manipulation items-start gap-2 px-3 py-2.5 text-left hover:bg-zinc-800/80 [-webkit-tap-highlight-color:transparent] ${
                opt.id === LOUNGE_COMPOSER_AUDIENCE_SUBS ? 'data-[subs=true]:hover:bg-cyan-950/50' : ''
              }`}
              data-subs={opt.id === LOUNGE_COMPOSER_AUDIENCE_SUBS ? 'true' : undefined}
              onClick={() => {
                onChange(opt.id)
                setOpen(false)
              }}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {on ? <Check className="h-3.5 w-3.5 text-sky-400" strokeWidth={2.5} aria-hidden /> : null}
              </span>
              <span className="min-w-0">
                <span
                  className={`block text-[14px] font-semibold leading-snug ${
                    opt.id === LOUNGE_COMPOSER_AUDIENCE_SUBS ? 'text-cyan-100' : 'text-white'
                  }`}
                >
                  {opt.label}
                </span>
                <span
                  className={`mt-0.5 block text-[12px] leading-snug ${
                    opt.id === LOUNGE_COMPOSER_AUDIENCE_SUBS ? 'text-cyan-200/75' : 'text-zinc-400'
                  }`}
                >
                  {opt.hint}
                </span>
              </span>
            </button>
          )
        })}
      </div>,
      document.body,
    )

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()} data-lounge-composer-audience-pill="">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Post audience: ${selectedOption.label}`}
        onClick={() => setOpen((v) => !v)}
        className="lounge-composer-audience-pill-btn inline-flex touch-manipulation items-center gap-0.5 rounded-full border border-zinc-600/90 bg-transparent px-2.5 py-0.5 text-[13px] font-bold leading-none text-sky-400 hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
      >
        <span>{selectedOption.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.5}
          aria-hidden
        />
      </button>
      {menu}
    </div>
  )
}
