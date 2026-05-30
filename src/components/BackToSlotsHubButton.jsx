/**
 * Return to the Slots hub from a slot tool screen (Calcs, Calendar, Bankroll, etc.).
 */
export default function BackToSlotsHubButton({ onClick, className = '' }) {
  if (!onClick) return null

  return (
    <button
      type="button"
      onClick={onClick}
      data-slots-tool-back
      className={`mb-3 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-cyan-400 touch-manipulation active:opacity-70 hover:text-cyan-300 ${className}`}
      aria-label="Back to Slots"
    >
      <span aria-hidden className="text-[40px] font-light leading-none">
        ‹
      </span>
    </button>
  )
}
