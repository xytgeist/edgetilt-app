import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Lock, Globe } from 'lucide-react'

const GAP_PX = 6
const VIEWPORT_PAD_PX = 10
const MENU_MIN_WIDTH_PX = 250

const OPTIONS = [
  {
    id: false,
    label: 'Everyone can reply',
    shortLabel: 'Everyone can reply',
    hint: 'Anyone can reply to this post',
    icon: Globe,
  },
  {
    id: true,
    label: 'Edge Pro only',
    shortLabel: 'Edge Pro replies',
    hint: 'Only Edge Pro subscribers and staff can reply',
    icon: Lock,
  },
]

function measureReplyGateMenuPos(anchorEl, menuEl) {
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
 * X-style author reply gating selector pill (Everyone can reply vs Edge Pro only).
 *
 * @param {{
 *   value: boolean,
 *   onChange: (next: boolean) => void,
 *   disabled?: boolean,
 *   className?: string,
 * }} props
 */
export default function LoungeComposerReplyGatePill({ value, onChange, disabled = false, className = '' }) {
  const [open, setOpen] = useState(false)
  const [menuPos, setMenuPos] = useState(null)
  const rootRef = useRef(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const selected = Boolean(value)
  const selectedOption = OPTIONS.find((o) => o.id === selected) || OPTIONS[0]
  const IconComponent = selectedOption.icon

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) {
      setMenuPos(null)
      return undefined
    }

    const updatePos = () => {
      if (!buttonRef.current || !menuRef.current) return
      setMenuPos(measureReplyGateMenuPos(buttonRef.current, menuRef.current))
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
        aria-label="Who can reply to this post"
        style={{
          position: 'fixed',
          zIndex: 9999,
          left: menuPos?.left ?? -9999,
          top: menuPos?.top ?? -9999,
          width: menuPos?.width ?? MENU_MIN_WIDTH_PX,
          visibility: menuPos ? 'visible' : 'hidden',
        }}
        className="overflow-hidden rounded-xl border border-zinc-700/90 bg-zinc-950/98 py-1 shadow-xl backdrop-blur-md"
        data-lounge-composer-reply-gate-menu=""
      >
        <div className="px-3 py-1.5 border-b border-zinc-800 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
          Who can reply?
        </div>
        {OPTIONS.map((opt) => {
          const on = opt.id === selected
          const OptIcon = opt.icon
          return (
            <button
              key={String(opt.id)}
              type="button"
              role="option"
              aria-selected={on}
              className={`flex w-full touch-manipulation items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800/80 [-webkit-tap-highlight-color:transparent] ${
                opt.id ? 'hover:bg-amber-950/30' : ''
              }`}
              onClick={() => {
                onChange(opt.id)
                setOpen(false)
              }}
            >
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                {on ? <Check className="h-3.5 w-3.5 text-amber-400" strokeWidth={2.5} aria-hidden /> : null}
              </span>
              <OptIcon className={`mt-0.5 h-4 w-4 shrink-0 ${opt.id ? 'text-amber-400' : 'text-zinc-400'}`} aria-hidden />
              <span className="min-w-0">
                <span
                  className={`block text-[13px] font-semibold leading-snug ${
                    opt.id ? 'text-amber-200' : 'text-white'
                  }`}
                >
                  {opt.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-zinc-400">
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
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()} data-lounge-composer-reply-gate-pill="">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Who can reply: ${selectedOption.label}`}
        onClick={() => setOpen((v) => !v)}
        className={`lounge-composer-reply-gate-pill-btn inline-flex touch-manipulation items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-semibold leading-none transition-colors disabled:cursor-not-allowed disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${
          selected
            ? 'border-amber-500/50 bg-amber-950/30 text-amber-400 hover:bg-amber-950/50'
            : 'border-zinc-700/80 bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-300'
        }`}
      >
        <IconComponent className="h-3 w-3 shrink-0" aria-hidden />
        <span>{selectedOption.shortLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2.5} aria-hidden />
      </button>
      {menu}
    </div>
  )
}
