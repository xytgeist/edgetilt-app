import { ArrowRight } from 'lucide-react'
import { APP_MODAL_OVERLAY_CLASS, APP_MODAL_SHEET_PANEL_CLASS } from '../../constants/appZIndex.js'

/**
 * After stake-offer onboarding: explain personal vs stake carousel cards.
 * @param {{ mode: 'accepted' | 'declined' | 'counter', dealLabel?: string, backerName?: string, onDismiss: () => void }} props
 */
export default function PokerBankrollCarouselCoachModal({
  mode,
  dealLabel = 'your stake',
  backerName = 'Your backer',
  onDismiss,
}) {
  const title =
    mode === 'accepted'
      ? 'Your stake is on Bankroll'
      : mode === 'counter'
        ? 'Counter sent'
        : 'Poker Bankroll'

  const body =
    mode === 'accepted' ? (
      <>
        <p>
          The first card is your <span className="font-semibold text-white">personal bankroll</span>
          ... your own session history and roll, always yours.
        </p>
        <p className="mt-3">
          Swipe <span className="font-semibold text-white">right</span> to the stake card for{' '}
          <span className="font-semibold text-white">{dealLabel}</span>. Log sessions there so your
          backer sees roll, makeup, and settlements.
        </p>
      </>
    ) : mode === 'counter' ? (
      <>
        <p>
          Your counter-proposal was sent to{' '}
          <span className="font-semibold text-white">{backerName}</span>. When they respond, swipe
          right from your personal card to open the stake card and log sessions there.
        </p>
        <p className="mt-3">
          The left card is your <span className="font-semibold text-white">personal bankroll</span>{' '}
          for sessions that are not on a stake.
        </p>
      </>
    ) : (
      <>
        <p>You declined this stake. Your personal poker sessions still live here on Bankroll.</p>
        <p className="mt-3">
          The first card is your <span className="font-semibold text-white">personal bankroll</span>{' '}
          tracker ... swipe through the carousel anytime you join or create a stake later.
        </p>
      </>
    )

  return (
    <div
      className={`${APP_MODAL_OVERLAY_CLASS} z-[140] overflow-x-hidden bg-black/70 backdrop-blur-sm`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="poker-bankroll-carousel-coach-title"
      data-poker-bankroll-carousel-coach
    >
      <div
        className={`relative z-10 max-h-[85dvh] overflow-y-auto ${APP_MODAL_SHEET_PANEL_CLASS}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-600/70" aria-hidden />

        <h2 id="poker-bankroll-carousel-coach-title" className="text-center text-xl font-black text-white">
          {title}
        </h2>

        <div className="mt-4 text-sm leading-relaxed text-zinc-300">{body}</div>

        {mode === 'accepted' ? (
          <div className="mt-5 flex items-center justify-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-950/30 px-4 py-4 text-sm text-cyan-100">
            <div className="rounded-xl border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200">
              Personal
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
            <div className="rounded-xl border border-cyan-500/50 bg-cyan-900/40 px-3 py-2 text-xs font-bold text-cyan-100">
              {dealLabel}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onDismiss?.()}
          className="mt-5 w-full rounded-2xl bg-orange-600 py-3.5 text-base font-bold text-white touch-manipulation hover:bg-orange-500 active:bg-orange-700"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
