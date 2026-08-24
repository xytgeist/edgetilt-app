import { X } from 'lucide-react'
import {
  LOUNGE_COMPOSER_AUDIENCE_ALL,
  LOUNGE_COMPOSER_AUDIENCE_SUBS,
} from '../../utils/loungeFanOnlyPost.js'

/**
 * Minimal chooser when a monetized creator posts — pick Everyone vs Subscribers only.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onSelect: (audience: typeof LOUNGE_COMPOSER_AUDIENCE_ALL | typeof LOUNGE_COMPOSER_AUDIENCE_SUBS) => void,
 * }} props
 */
export default function LoungeComposerAudienceSheet({ open, onClose, onSelect }) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-[max(1rem,max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))] pb-[max(1rem,max(env(safe-area-inset-bottom, 0px), var(--edge-sab, 0px)))] backdrop-blur-[2px]"
      data-lounge-composer-audience-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-composer-audience-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default touch-manipulation bg-transparent"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/85 bg-zinc-950/95 p-4 pt-3.5 shadow-2xl backdrop-blur-md"
        data-lounge-composer-audience-panel
      >
        <button
          type="button"
          data-lounge-composer-audience-close
          className="absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-lg text-zinc-400 touch-manipulation hover:bg-zinc-800 hover:text-zinc-100 [-webkit-tap-highlight-color:transparent]"
          aria-label="Close"
          onClick={onClose}
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden />
        </button>
        <h2 id="lounge-composer-audience-title" className="pr-9 text-[17px] font-bold text-white">
          Who should see this?
        </h2>
        <p className="mt-1.5 text-[14px] leading-snug text-zinc-400">
          Choose before your post goes live. Subscribers-only posts show a teaser to everyone else.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-900/80 px-4 text-left touch-manipulation hover:bg-zinc-800"
            onClick={() => onSelect(LOUNGE_COMPOSER_AUDIENCE_ALL)}
          >
            <span className="block text-[15px] font-semibold text-white">Everyone</span>
            <span className="mt-0.5 block text-[13px] text-zinc-400">Full post on the Lounge feed</span>
          </button>
          <button
            type="button"
            data-lounge-composer-audience-subs
            className="min-h-12 w-full rounded-xl border border-cyan-500/40 bg-cyan-950/45 px-4 text-left touch-manipulation hover:bg-cyan-950/65 hover:border-cyan-400/55"
            onClick={() => onSelect(LOUNGE_COMPOSER_AUDIENCE_SUBS)}
          >
            <span className="block text-[15px] font-semibold text-cyan-50">Subscribers only</span>
            <span className="mt-0.5 block text-[13px] text-cyan-200/75">
              Fans see everything; others see a teaser
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}
