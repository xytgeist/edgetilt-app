import { useEffect } from 'react'
import { btnPrimary, linkBtn } from '../shell/shellClasses'
import { edgeAppOpenSchemeUrl } from './emailConfirmRouting.js'
import { lockAuthConfirmViewport, unlockAuthConfirmViewport } from './authConfirmViewport.js'

/**
 * Email-confirm landing. Stays a single card (no Lounge chrome) so Gmail's
 * in-app browser cannot dump the full app into a too-tall dvh box.
 */
export default function AuthConfirmScreen({
  error = '',
  success = false,
  onContinueInBrowser,
}) {
  useEffect(() => {
    const apply = () => lockAuthConfirmViewport()
    apply()
    const vv = window.visualViewport
    window.addEventListener('resize', apply)
    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    return () => {
      window.removeEventListener('resize', apply)
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      unlockAuthConfirmViewport()
    }
  }, [])

  return (
    <div className="auth-confirm-shell bg-zinc-950" data-auth-confirm-shell>
      <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full" data-auth-modal>
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Confirm your email</h2>
        {error ? (
          <>
            <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-sm text-center">
              {error}
            </div>
            <button
              type="button"
              onClick={() => {
                window.location.href = window.location.origin
              }}
              className={`${linkBtn} text-sm sm:text-base`}
            >
              ← Back to Login
            </button>
          </>
        ) : success ? (
          <>
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm sm:text-base font-medium leading-relaxed">
              You&apos;re confirmed. Open EdgeTilt and sign in, or continue here.
            </div>
            <a
              href={edgeAppOpenSchemeUrl()}
              className={`${btnPrimary} mb-3 flex items-center justify-center rounded-2xl bg-cyan-600 text-white hover:bg-cyan-500`}
            >
              Open EdgeTilt
            </a>
            <button
              type="button"
              onClick={() => onContinueInBrowser?.()}
              className={`${linkBtn} text-sm sm:text-base`}
            >
              Continue in browser
            </button>
          </>
        ) : (
          <p className="text-center text-gray-500 text-sm leading-relaxed">
            One moment… finishing your confirmation.
          </p>
        )}
      </div>
    </div>
  )
}
