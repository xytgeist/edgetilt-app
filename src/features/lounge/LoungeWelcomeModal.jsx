import { createPortal } from 'react-dom'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import { getLegalDocument } from '../legal/legalDocuments.js'

const SLOTS_TOOL_LABELS = ['Calcs', 'Calendar', 'Bankroll', 'Logbook', 'AP Guides']

function TitleBarMenuHint() {
  return (
    <div
      className="mt-3 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-3"
      aria-hidden
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700/60 bg-zinc-950/90 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <img
            src="/edge-lounge-logo-transparent.png"
            alt=""
            className="h-4 w-auto max-w-[4.5rem] object-contain opacity-90"
            loading="lazy"
          />
        </div>
        <div className="relative shrink-0">
          <span
            className="absolute -inset-1.5 rounded-lg bg-orange-500/25 ring-2 ring-orange-400/70 animate-pulse"
            aria-hidden
          />
          <span className="relative flex h-9 min-w-[2.75rem] items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-lg font-semibold text-zinc-100">
            ☰
          </span>
        </div>
      </div>
      <p className="mt-2.5 text-[12px] leading-snug text-zinc-400">
        Tap <span className="font-semibold text-zinc-200">☰</span> (top-right) →{' '}
        <span className="font-semibold text-zinc-200">Slots</span> for {SLOTS_TOOL_LABELS.join(', ')}.
      </p>
    </div>
  )
}

export default function LoungeWelcomeModal({ open, onAcknowledge }) {
  if (!open || typeof document === 'undefined') return null

  const guidelines = getLegalDocument('guidelines')
  const highlightBullets = [
    'This is a free speech platform. Say whatever tf you want, but keep it constructive. Disagreement is fine, harassment is not. Bottom line, just don\'t be a dick.',
    'Gambling, edge play, sports, trading, investing, bankroll, and related topics welcome. No spam.',
    'Share real results and setups; do not mislead with fake wins or guaranteed systems.',
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
          <p className="text-cyan-200 text-[13px] font-semibold uppercase tracking-wide">Welcome</p>
          <h2 id="lounge-welcome-title" className="mt-1 text-xl font-bold text-white">
            Community Guidelines
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-zinc-400">
            {guidelines?.intro ||
              'These guidelines apply to the Lounge, comments, chat, and your profile.'}
          </p>

          <ul className="mt-4 space-y-2.5 text-[14px] leading-relaxed text-zinc-200">
            {highlightBullets.map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
          </ul>

          <a
            href="/guidelines"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-11 items-center text-[14px] font-semibold text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
          >
            Read full Community Guidelines
          </a>

          <div className="mt-5 border-t border-zinc-800 pt-4">
            <h3 className="text-[15px] font-semibold text-white">Slot tools live in the menu</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-zinc-400">
              Calculators, offers calendar, bankroll, play logbook, and AP guides are one tap away from the
              Lounge.
            </p>
            <TitleBarMenuHint />
          </div>
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
