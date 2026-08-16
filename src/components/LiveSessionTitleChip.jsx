import { useEffect, useId, useRef, useState } from 'react'

function LiveSessionDot({ className, paused = false }) {
  return (
    <span
      data-live-session-dot
      data-live-session-dot-paused={paused ? 'true' : undefined}
      className={`h-1.5 w-1.5 shrink-0 rounded-full ${paused ? '' : 'animate-pulse'} ${className}`}
      aria-hidden
    />
  )
}

/**
 * Center title-bar control for active slots / poker live sessions.
 *
 * @param {{
 *   slots?: { id: string, label: string } | null,
 *   poker?: { id: string, label: string, paused?: boolean } | null,
 *   onOpenSlots?: () => void,
 *   onOpenPoker?: (sessionId: string) => void,
 * }} props
 */
export default function LiveSessionTitleChip({
  slots = null,
  poker = null,
  onOpenSlots,
  onOpenPoker,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null))
  const menuId = useId()

  const onlySlots = Boolean(slots && !poker)
  const onlyPoker = Boolean(poker && !slots)

  useEffect(() => {
    if (!pickerOpen) return undefined
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setPickerOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  if (!slots && !poker) return null

  /* Hug the label, cap at the title-bar gap, truncate past it (no fixed max). */
  const chipClass =
    'flex w-fit max-w-full min-w-0 items-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-semibold leading-snug shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent]'

  if (onlySlots) {
    return (
      <button
        type="button"
        data-live-session-chip
        data-live-session-kind="slots"
        onClick={() => onOpenSlots?.()}
        className={`${chipClass} border-emerald-500/45 bg-emerald-950/70 text-emerald-100 hover:border-emerald-400/55 hover:bg-emerald-900/70 active:bg-emerald-900/90`}
        aria-label={`Live slots session ${slots.label}. Open Slots Bankroll.`}
      >
        <LiveSessionDot className="bg-emerald-400" />
        <span className="min-w-0 truncate">{slots.label}</span>
      </button>
    )
  }

  if (onlyPoker) {
    return (
      <button
        type="button"
        data-live-session-chip
        data-live-session-kind="poker"
        data-live-session-paused={poker.paused ? 'true' : undefined}
        onClick={() => onOpenPoker?.(poker.id)}
        className={`${chipClass} ${
          poker.paused
            ? 'border-amber-500/40 bg-amber-950/55 text-amber-100/90 hover:border-amber-400/50 hover:bg-amber-900/60'
            : 'border-teal-500/45 bg-teal-950/70 text-teal-100 hover:border-teal-400/55 hover:bg-teal-900/70 active:bg-teal-900/90'
        }`}
        aria-label={`Live poker session ${poker.label}${poker.paused ? ', paused' : ''}. Open Poker Bankroll.`}
      >
        <LiveSessionDot
          paused={Boolean(poker.paused)}
          className={poker.paused ? 'bg-amber-400' : 'bg-teal-400'}
        />
        <span className="min-w-0 truncate">
          {poker.paused ? `⏸ ${poker.label}` : poker.label}
        </span>
      </button>
    )
  }

  // Both live: dual mini chips when space allows; otherwise compact picker.
  return (
    <div ref={rootRef} className="relative min-w-0 w-full max-w-full" data-live-session-dual>
      <div className="hidden min-[380px]:flex w-full min-w-0 items-center justify-center gap-1">
        <button
          type="button"
          data-live-session-chip
          data-live-session-kind="slots"
          onClick={() => onOpenSlots?.()}
          className={`${chipClass} max-w-[calc(50%-0.125rem)] min-w-0 border-emerald-500/45 bg-emerald-950/70 text-emerald-100`}
          aria-label={`Live slots session ${slots.label}. Open Slots Bankroll.`}
        >
          <LiveSessionDot className="bg-emerald-400" />
          <span className="min-w-0 truncate">{slots.label}</span>
        </button>
        <button
          type="button"
          data-live-session-chip
          data-live-session-kind="poker"
          data-live-session-paused={poker.paused ? 'true' : undefined}
          onClick={() => onOpenPoker?.(poker.id)}
          className={`${chipClass} max-w-[calc(50%-0.125rem)] min-w-0 ${
            poker.paused
              ? 'border-amber-500/40 bg-amber-950/55 text-amber-100/90'
              : 'border-teal-500/45 bg-teal-950/70 text-teal-100'
          }`}
          aria-label={`Live poker session ${poker.label}${poker.paused ? ', paused' : ''}. Open Poker Bankroll.`}
        >
          <LiveSessionDot
            paused={Boolean(poker.paused)}
            className={poker.paused ? 'bg-amber-400' : 'bg-teal-400'}
          />
          <span className="min-w-0 truncate">{poker.paused ? 'Paused' : poker.label}</span>
        </button>
      </div>

      <div className="min-[380px]:hidden w-full min-w-0">
        <button
          type="button"
          data-live-session-chip
          data-live-session-kind="both"
          aria-expanded={pickerOpen}
          aria-controls={menuId}
          onClick={() => setPickerOpen((v) => !v)}
          className={`${chipClass} min-w-0 border-cyan-500/45 bg-cyan-950/70 text-cyan-100`}
          aria-label="Two live sessions. Choose Slots or Poker Bankroll."
        >
          <LiveSessionDot className="bg-cyan-400" />
          <span className="whitespace-nowrap">2 live</span>
        </button>
        {pickerOpen ? (
          <div
            id={menuId}
            role="menu"
            data-live-session-picker
            className="absolute left-1/2 top-full z-[60] mt-1 w-max min-w-[10rem] -translate-x-1/2 rounded-2xl border border-zinc-800/80 bg-zinc-950/98 px-1.5 py-1.5 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-zinc-950/90"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold text-emerald-100 touch-manipulation hover:bg-zinc-900"
              onClick={() => {
                setPickerOpen(false)
                onOpenSlots?.()
              }}
            >
              <LiveSessionDot className="bg-emerald-400" />
              <span className="min-w-0 truncate">Slots · {slots.label}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold text-teal-100 touch-manipulation hover:bg-zinc-900"
              onClick={() => {
                setPickerOpen(false)
                onOpenPoker?.(poker.id)
              }}
            >
              <LiveSessionDot
                paused={Boolean(poker.paused)}
                className={poker.paused ? 'bg-amber-400' : 'bg-teal-400'}
              />
              <span className="min-w-0 truncate">
                Poker · {poker.paused ? `Paused · ${poker.label}` : poker.label}
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
