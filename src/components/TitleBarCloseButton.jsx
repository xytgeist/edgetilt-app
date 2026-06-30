/** Title bar × - same chrome as Lounge dock panel close (`LoungeDockSlidePanels`). */
export default function TitleBarCloseButton({ onClick, ariaLabel = 'Close', className = '' }) {
  if (!onClick) return null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`lounge-title-nav-btn grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900 text-zinc-200 touch-manipulation hover:bg-zinc-800 ${className}`}
    >
      <span className="text-xl leading-none">×</span>
    </button>
  )
}
