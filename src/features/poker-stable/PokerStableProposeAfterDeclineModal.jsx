import { triggerTapHapticLight } from '../../utils/tapHaptic.js'

/**
 * After the viewer declines a stake offer: card is gone; offer to start a fresh proposal.
 */
export default function PokerStableProposeAfterDeclineModal({
  counterpartLabel = 'them',
  onPropose,
  onCancel,
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center overflow-x-hidden bg-black/70 backdrop-blur-sm p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-stable-propose-after-decline-title"
      onClick={() => onCancel?.()}
    >
      <div
        data-poker-propose-after-decline
        className="relative z-10 w-full max-w-md max-h-[85dvh] overflow-y-auto overscroll-contain rounded-3xl border border-zinc-700/50 bg-zinc-900 px-5 py-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="poker-stable-propose-after-decline-title"
          className="text-center text-xl font-black text-white"
        >
          Stake declined
        </h2>
        <p className="mt-4 text-center text-sm leading-relaxed text-zinc-300">
          Want to propose new terms to{' '}
          <span className="font-semibold text-white">{counterpartLabel}</span>?
        </p>
        <button
          type="button"
          onClick={() => {
            triggerTapHapticLight()
            onPropose?.()
          }}
          className="mt-5 w-full rounded-2xl bg-amber-600 py-3.5 text-base font-bold text-white touch-manipulation active:bg-amber-500"
        >
          Propose new terms
        </button>
        <button
          type="button"
          onClick={() => {
            triggerTapHapticLight()
            onCancel?.()
          }}
          className="mt-2 w-full rounded-2xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-200 touch-manipulation active:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
