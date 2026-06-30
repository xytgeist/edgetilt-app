import { createPortal } from 'react-dom'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'

const WELCOME_GUIDELINES_INTRO =
  'Whether you are here for trading, sports, poker, slots, or any other edge-hunting niche, this is a chill community for you to learn, share, troll, and have fun.'

export default function LoungeWelcomeModal({ open, onAcknowledge, onOpenGuidelines }) {
  if (!open || typeof document === 'undefined') return null

  const highlightBullets = [
    'This is a free speech platform. Say whatever tf you want, but keep it constructive. Disagreement is fine, harassment is not. Bottom line, just don\'t be a dick.',
    'Gambling, edge play, sports, trading, investing, bankroll, and related topics welcome. No spam.',
    'Respect privacy ... no doxing or posting other people without consent.',
  ]

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center"
      style={{ zIndex: Z_APP_MODAL }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-welcome-title"
      data-lounge-welcome-modal
    >
      <div className="relative z-10 flex max-h-[min(88dvh,calc(100dvh-2rem))] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-zinc-700/85 bg-zinc-950/95 shadow-2xl backdrop-blur-md">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-4">
          <p className="lounge-welcome-kicker text-cyan-200 text-[13px] font-semibold uppercase tracking-wide">Welcome</p>
          <h2 id="lounge-welcome-title" className="mt-1 text-xl font-bold text-white">
            Community Guidelines
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">{WELCOME_GUIDELINES_INTRO}</p>

          <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-zinc-200">
            {highlightBullets.map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <a
            href="/guidelines?from=welcome"
            onClick={(e) => {
              e.preventDefault()
              onOpenGuidelines?.()
            }}
            className="mt-4 inline-flex min-h-11 items-center text-[14px] font-semibold text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
          >
            Read full Community Guidelines
          </a>
        </div>

        <div className="shrink-0 border-t border-zinc-800 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
          <button
            type="button"
            onClick={() => onAcknowledge?.()}
            className="w-full min-h-12 rounded-2xl bg-orange-600 text-[15px] font-semibold text-white touch-manipulation hover:bg-orange-500 active:bg-orange-700 [-webkit-tap-highlight-color:transparent]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
