import { useEffect, useState } from 'react'
import { linkBtn } from '../shell/shellClasses'

/**
 * iPad (and the open Duo, once it is this wide): full-screen centered column.
 * Phone stays a bottom sheet. A landscape iPhone is wide but short, so the
 * height check keeps that on the sheet.
 */
const IPAD_AUTH_QUERY = '(min-width: 768px) and (min-height: 700px) and (pointer: coarse)'

function useIpadAuthStage() {
  const [on, setOn] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(IPAD_AUTH_QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(IPAD_AUTH_QUERY)
    const apply = () => setOn(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return on
}

function AuthWordmark() {
  return (
    <svg
      id="auth-modal-title"
      viewBox="0 0 260 32"
      width="100%"
      className="mx-auto mb-6 block max-w-[300px]"
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
  )
}

/**
 * Auth sign-in / join as a bottom sheet on phone; X-style centered column on iPad.
 */
export default function AuthModalShell({ onClose, cancelLabel, children }) {
  const ipadStage = useIpadAuthStage()

  if (ipadStage) {
    return (
      <div
        data-auth-ipad-stage
        className="fixed inset-0 z-[200] flex flex-col bg-zinc-950 text-zinc-100"
      >
        <button
          type="button"
          data-auth-ipad-dismiss
          onClick={onClose}
          className="absolute left-5 z-20 min-h-11 px-1 text-left text-sm text-zinc-400 touch-manipulation"
          style={{ top: 'max(0.75rem, max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)))' }}
        >
          {cancelLabel}
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            data-auth-modal
            className="mx-auto flex w-full max-w-[26rem] flex-1 flex-col bg-transparent px-6 pb-[calc(6.75rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] shadow-none"
            style={{
              paddingTop:
                'max(5.5rem, calc(max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)) + 3.25rem))',
            }}
          >
            <AuthWordmark />
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-x-hidden bg-black/70 backdrop-blur-sm md:items-center md:p-4 md:pt-[max(1rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] md:pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
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
        className="relative z-10 w-full max-w-lg min-h-0 max-h-[min(92dvh,calc(100dvh-max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))))] overflow-y-auto overscroll-contain rounded-t-3xl border border-zinc-600/80 border-b-0 bg-gray-900 px-5 pt-3 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] shadow-2xl md:rounded-3xl md:border-b-zinc-600/80 md:p-8 md:pt-6"
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
        <AuthWordmark />
        {children}
      </div>
    </div>
  )
}
