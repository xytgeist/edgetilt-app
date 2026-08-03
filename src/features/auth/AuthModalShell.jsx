import { linkBtn } from '../shell/shellClasses'

/**
 * Auth sign-in / join as a bottom sheet on phone/tablet; centered card on desktop (md+).
 */
export default function AuthModalShell({ onClose, cancelLabel, children }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-x-hidden bg-black/70 backdrop-blur-sm md:items-center md:p-4 md:pt-[max(1rem,env(safe-area-inset-top))] md:pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="absolute inset-0 cursor-default [-webkit-tap-highlight-color:transparent]"
        aria-label="Close sign in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative z-10 w-full max-w-lg min-h-0 max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-bottom,0px)))] overflow-y-auto overscroll-contain rounded-t-3xl border border-zinc-600/80 border-b-0 bg-gray-900 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl md:rounded-3xl md:border-b-zinc-600/80 md:p-8 md:pt-6"
        data-auth-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-zinc-600/70 md:hidden"
          aria-hidden
        />
        <button
          type="button"
          onClick={onClose}
          className={`${linkBtn} mb-4 !min-h-11 w-full text-sm md:text-base`}
        >
          {cancelLabel}
        </button>
        <svg
          id="auth-modal-title"
          viewBox="0 0 260 32"
          width="100%"
          className="mb-6 mx-auto block max-w-[300px]"
          aria-label="Find Your Edge"
          role="img"
        >
          <text
            x="26"
            y="24"
            textAnchor="start"
            fontFamily="'Montserrat', sans-serif"
            fontWeight="300"
            fontSize="24"
            fill="currentColor"
          >
            Find Your
          </text>
          <image
            href="/edge-lounge-logo-transparent.png"
            x="150"
            y="6"
            width="77"
            height="19"
            className="edge-logo--dark"
          />
          <image
            href="/edge-lounge-logo-light.png"
            x="150"
            y="6"
            width="77"
            height="19"
            className="edge-logo--light"
          />
        </svg>
        {children}
      </div>
    </div>
  )
}
