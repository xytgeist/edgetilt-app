/** Admin-only Slots Edge lock toggle (calculators + guides). */
export default function ContentAccessAdminSwitch({
  locked,
  disabled = false,
  busy = false,
  onLockedChange,
  label = 'Slots Edge lock',
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={locked}
      aria-label={label}
      aria-busy={busy}
      disabled={disabled || busy}
      onClick={(event) => {
        event.stopPropagation()
        if (disabled || busy) return
        onLockedChange?.(!locked)
      }}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-fuchsia-500/35 bg-fuchsia-950/40 px-2.5 py-1.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-fuchsia-950/60 disabled:opacity-50"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-fuchsia-200/90">Lock</span>
      <span
        className={`relative h-5 w-9 rounded-full transition-colors ${
          locked ? 'bg-amber-500/90' : 'bg-zinc-600/90'
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            locked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  )
}
