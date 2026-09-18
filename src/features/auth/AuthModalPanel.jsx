import { useEffect, useRef } from 'react'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import { inputBase, btnPrimary, linkBtn } from '../shell/shellClasses'
import { AppleIcon, OAuthDivider, GoogleIcon } from './OAuthUi'
import AuthTabSwitcher from './AuthTabSwitcher'
import AuthPasswordField from './AuthPasswordField'

function isOAuthProviderError(message) {
  const lower = String(message || '').toLowerCase()
  if (!lower) return false
  if (lower.includes('appleid.apple.com')) return true
  if (lower.includes('not enabled on this server')) return true
  return lower.includes('provider') && lower.includes('not enabled')
}

function AuthErrorBanner({ message }) {
  if (!message) return null
  return (
    <div
      className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed"
      role="alert"
    >
      {message}
    </div>
  )
}

export default function AuthModalPanel({
  authTab,
  onAuthTabChange,
  showForgotPassword,
  onOpenForgotPassword,
  onCloseForgotPassword,
  verificationSuccess,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  loginError,
  isLoggingIn,
  onLoginSubmit,
  signupEmail,
  onSignupEmailChange,
  signupPassword,
  onSignupPasswordChange,
  signupConfirmPassword,
  onSignupConfirmPasswordChange,
  signupError,
  signupMessage,
  isSigningUp,
  onSignUpSubmit,
  forgotEmail,
  onForgotEmailChange,
  forgotError,
  forgotMessage,
  isSendingReset,
  onForgotSubmit,
  isOAuthLoading,
  onOAuthSignIn,
  onOpenLegalDocument,
}) {
  const signupMessageRef = useRef(null)

  /** After Create account, success lives at the top ... scroll the sheet so it is not below the fold. */
  useEffect(() => {
    if (!signupMessage) return
    const modal = document.querySelector('[data-auth-modal]')
    if (modal instanceof HTMLElement) {
      modal.scrollTo({ top: 0, behavior: 'smooth' })
    }
    signupMessageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [signupMessage])

  const showAppleSignIn = isEdgeiOSShell()
  const legalLinks = (
    <>
      <a
        href="/terms?from=auth"
        onClick={(e) => {
          e.preventDefault()
          onOpenLegalDocument?.('terms')
        }}
        className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
      >
        Terms &amp; Conditions
      </a>
      {', '}
      <a
        href="/privacy?from=auth"
        onClick={(e) => {
          e.preventDefault()
          onOpenLegalDocument?.('privacy')
        }}
        className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
      >
        Privacy Policy
      </a>
    </>
  )
  if (showForgotPassword) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white text-center">Trouble signing in?</h3>
        <div
          className="rounded-2xl border border-zinc-600/80 bg-zinc-800/60 p-4 text-sm text-zinc-300 leading-relaxed space-y-3"
          role="note"
        >
          <p>
            {showAppleSignIn ? (
              <>
                If you <span className="font-semibold text-white">signed up with Apple or Google</span>, use that
                button below. You won&apos;t have an Edge password.
              </>
            ) : (
              <>
                If you <span className="font-semibold text-white">signed up with Google</span>, use that button
                below. Apple accounts sign in from the Edge iOS app. You won&apos;t have an Edge password.
              </>
            )}
          </p>
          <p>
            Still having trouble? Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>
        {showAppleSignIn ? (
        <button
          type="button"
          disabled={isOAuthLoading}
          onClick={() => onOAuthSignIn({ provider: 'apple', setErrorTarget: 'forgot' })}
          className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-black text-white hover:bg-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed`}
          aria-label="Continue with Apple"
        >
          <AppleIcon />
          Continue with Apple
        </button>
        ) : null}
        <button
          type="button"
          disabled={isOAuthLoading}
          onClick={() => onOAuthSignIn({ provider: 'google', setErrorTarget: 'forgot' })}
          className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
          aria-label="Continue with Google"
        >
          <GoogleIcon />
          Continue with Google
        </button>
        <OAuthDivider />
        <form onSubmit={onForgotSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email for password reset"
            value={forgotEmail}
            onChange={(e) => onForgotEmailChange(e.target.value)}
            className={inputBase}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          {forgotError ? (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">
              {forgotError}
            </div>
          ) : null}
          {forgotMessage ? (
            <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">
              {forgotMessage}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={isSendingReset}
            className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isSendingReset ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <button type="button" onClick={onCloseForgotPassword} className={`${linkBtn} text-sm sm:text-base w-full`}>
          ← Back to sign in
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {signupMessage ? (
        <div
          ref={signupMessageRef}
          data-auth-signup-message
          role="status"
          className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed"
        >
          {signupMessage}
        </div>
      ) : null}
      {verificationSuccess ? (
        <div className="p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm sm:text-base font-medium leading-relaxed">
          ✅ Account verified - have fun!
        </div>
      ) : null}
      <AuthTabSwitcher value={authTab} onChange={onAuthTabChange} />
      {showAppleSignIn ? (
      <button
        type="button"
        disabled={isOAuthLoading}
        onClick={() => onOAuthSignIn({ provider: 'apple', setErrorTarget: authTab })}
        className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border-0 bg-black text-white hover:bg-zinc-900 disabled:opacity-60 disabled:cursor-not-allowed`}
        aria-label="Continue with Apple"
      >
        <AppleIcon />
        Continue with Apple
      </button>
      ) : null}
      <button
        type="button"
        disabled={isOAuthLoading}
        onClick={() => onOAuthSignIn({ provider: 'google', setErrorTarget: authTab })}
        className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
        aria-label="Continue with Google"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      {authTab === 'join' && isOAuthProviderError(signupError) ? (
        <AuthErrorBanner message={signupError} />
      ) : null}
      {authTab !== 'join' && isOAuthProviderError(loginError) ? (
        <AuthErrorBanner message={loginError} />
      ) : null}
      <OAuthDivider />
      {authTab === 'join' ? (
        <form onSubmit={onSignUpSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={signupEmail}
            onChange={(e) => onSignupEmailChange(e.target.value)}
            className={inputBase}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <AuthPasswordField
            placeholder="Password"
            value={signupPassword}
            onChange={onSignupPasswordChange}
            autoComplete="new-password"
            enterKeyHint="next"
          />
          <AuthPasswordField
            placeholder="Confirm password"
            value={signupConfirmPassword}
            onChange={onSignupConfirmPasswordChange}
            autoComplete="new-password"
            enterKeyHint="go"
          />
          {signupError && !isOAuthProviderError(signupError) ? (
            <AuthErrorBanner message={signupError} />
          ) : null}
          <button
            type="submit"
            disabled={isSigningUp}
            className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isSigningUp ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      ) : (
        <form onSubmit={onLoginSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            className={inputBase}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          <AuthPasswordField
            placeholder="Password"
            value={password}
            onChange={onPasswordChange}
            autoComplete="current-password"
            enterKeyHint="go"
          />
          <button
            type="submit"
            disabled={isLoggingIn}
            className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </button>
          {loginError && !isOAuthProviderError(loginError) ? (
            <AuthErrorBanner message={loginError} />
          ) : null}
          <div className="pt-1">
            <button
              type="button"
              onClick={onOpenForgotPassword}
              className="w-full min-h-12 text-base text-orange-400 hover:text-orange-300 touch-manipulation py-3 text-center"
            >
              Trouble signing in?
            </button>
          </div>
        </form>
      )}
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">
        By continuing, you agree to our {legalLinks}, and{' '}
        <a
          href="/guidelines?from=auth"
          onClick={(e) => {
            e.preventDefault()
            onOpenLegalDocument?.('guidelines')
          }}
          className="text-orange-400/90 underline underline-offset-2"
        >
          Community Guidelines
        </a>
        .
      </p>
    </div>
  )
}

