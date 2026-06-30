import { createPortal } from 'react-dom'
import { iosPwaInstallHelpMessage } from '../utils/pwaNotificationPrompt.js'

/** iPhone Home Screen install steps - shared by Lounge Settings and Offers flows. */
export default function IosPwaInstallHelpDialog({
  open,
  onClose,
  isSafariBrowser = false,
  title = 'Save Edge to Home Screen',
}) {
  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[250] flex items-end justify-center bg-black/60 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ios-pwa-install-help-title"
      onClick={() => onClose?.()}
    >
      <div
        className="flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-bottom)-1rem))] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <h2 id="ios-pwa-install-help-title" className="text-[17px] font-semibold text-zinc-100">
            {title}
          </h2>
          <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">
            {iosPwaInstallHelpMessage(isSafariBrowser)}
          </p>
          <div className="mt-3 flex justify-center rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-2">
            <img
              src="/onboarding/ios-setup.png"
              alt="iPhone Share menu and Add to Home Screen steps"
              className="max-h-[min(32dvh,180px)] w-full max-w-[240px] rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        </div>
        <div className="shrink-0 border-t border-zinc-700/80 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="min-h-11 w-full rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-cyan-500 [-webkit-tap-highlight-color:transparent]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
