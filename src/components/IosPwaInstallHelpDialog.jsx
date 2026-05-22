import { createPortal } from 'react-dom'
import { iosPwaInstallHelpMessage } from '../utils/pwaNotificationPrompt.js'

/** iPhone Home Screen install steps — shared by Lounge Settings and Offers flows. */
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
        className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="ios-pwa-install-help-title" className="text-[17px] font-semibold text-zinc-100">
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">
          {iosPwaInstallHelpMessage(isSafariBrowser)}
        </p>
        <div className="mt-3 max-h-[45dvh] overflow-auto pr-0.5">
          <div className="rounded-2xl border border-zinc-700/70 bg-zinc-950/60 p-2">
            <img
              src="/onboarding/ios-setup.png"
              alt="iPhone Share menu and Add to Home Screen steps"
              className="w-full rounded-xl object-cover"
              loading="lazy"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onClose?.()}
          className="mt-4 min-h-11 w-full rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-cyan-500 [-webkit-tap-highlight-color:transparent]"
        >
          Got it
        </button>
      </div>
    </div>,
    document.body,
  )
}
