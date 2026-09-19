import { useEffect, useState } from 'react'
import { linkBtn } from '../shell/shellClasses'

/**
 * iPad (and the open Duo, once it is this wide): full-screen centered column.
 * Phone stays a bottom sheet. A landscape iPhone is wide but short, so the
 * height check keeps that on the sheet.
 */
const IPAD_AUTH_QUERY = '(min-width: 768px) and (min-height: 700px) and (pointer: coarse)'

export function useIpadAuthStage() {
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

const IPAD_SLOGANS = ['Find your Edge', 'Degen with Edge']

function AuthIpadHero() {
  const [slogan] = useState(() => IPAD_SLOGANS[Math.floor(Math.random() * IPAD_SLOGANS.length)])

  return (
    <div className="flex flex-col items-center px-4 pt-4 text-center">
      <span className="inline-flex" aria-hidden>
        <img
          src="/edge-lounge-logo-transparent.png"
          alt=""
          className="edge-logo--dark h-[4.25rem] w-auto"
          draggable={false}
        />
        <img
          src="/edge-lounge-logo-light.png"
          alt=""
          className="edge-logo--light h-[4.25rem] w-auto"
          draggable={false}
        />
      </span>
      <h1
        id="auth-modal-title"
        data-auth-ipad-slogan
        className="mt-8 text-[2.5rem] font-bold leading-tight tracking-tight text-white"
      >
        {slogan}
      </h1>
    </div>
  )
}

const PHONE_WORDMARKS = [
  { lead: 'Find Your', label: 'Find Your Edge' },
  { lead: 'Degen with', label: 'Degen with Edge' },
]

function AuthWordmark() {
  const [mark] = useState(() => PHONE_WORDMARKS[Math.floor(Math.random() * PHONE_WORDMARKS.length)])

  return (
    <h1
      id="auth-modal-title"
      aria-label={mark.label}
      className={`mx-auto mb-6 flex items-center justify-center gap-2.5 text-white ${
        mark.lead === 'Degen with' ? 'text-[clamp(1.9rem,9.4vw,2.7rem)]' : 'text-2xl'
      }`}
    >
      <span
        className="font-light leading-none tracking-tight"
        style={{ fontFamily: "'Montserrat', sans-serif" }}
      >
        {mark.lead}
      </span>
      <span className="inline-flex shrink-0" aria-hidden>
        <img
          src="/edge-lounge-logo-transparent.png"
          alt=""
          className={`edge-logo--dark w-auto ${mark.lead === 'Degen with' ? 'h-[0.78em]' : 'h-[1.2rem]'}`}
          draggable={false}
        />
        <img
          src="/edge-lounge-logo-light.png"
          alt=""
          className={`edge-logo--light w-auto ${mark.lead === 'Degen with' ? 'h-[0.78em]' : 'h-[1.2rem]'}`}
          draggable={false}
        />
      </span>
    </h1>
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
          className="absolute left-5 z-20 min-h-11 px-1 text-left text-lg text-zinc-400 touch-manipulation"
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
            className="mx-auto flex min-h-full w-full max-w-[26rem] flex-col bg-transparent px-6 pb-[calc(6.75rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] shadow-none"
            style={{
              paddingTop:
                'max(4.5rem, calc(max(env(safe-area-inset-top, 0px), var(--edge-sat, 0px)) + 2.5rem))',
            }}
          >
            <div className="my-auto flex w-full flex-col">
              <AuthIpadHero />
              {children}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center overflow-x-hidden bg-black md:items-center md:p-4 md:pt-[max(1rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] md:pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
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
        className="relative z-10 w-full max-w-lg min-h-0 max-h-[min(92dvh,calc(100dvh-max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))))] overflow-y-auto overscroll-contain rounded-t-3xl border border-zinc-800 border-b-0 bg-black px-5 pt-3 pb-[max(1.25rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))] shadow-2xl md:rounded-3xl md:border-b-zinc-800 md:p-8 md:pt-6"
        data-auth-modal
        data-auth-sheet
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
