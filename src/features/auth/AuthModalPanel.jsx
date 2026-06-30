import { useEffect, useRef, useState } from 'react'
import { inputBase, btnPrimary, linkBtn } from '../shell/shellClasses'
import { OAuthDivider, GoogleIcon } from './OAuthUi'
import AuthTabSwitcher from './AuthTabSwitcher'

const LEGAL_NUDGE_MESSAGE = 'Please accept the Terms & Conditions and Privacy Policy.'

function LegalAcceptanceNudge() {
  return (
    <div
      role="alert"
      data-auth-legal-nudge
      className="mb-2 rounded-xl border border-cyan-500/40 bg-cyan-950/35 px-3 py-2.5 text-center text-[13px] font-medium leading-snug text-cyan-100"
    >
      {LEGAL_NUDGE_MESSAGE}
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
  onGoogleSignIn,
  acceptedLegal = false,
  onAcceptedLegalChange,
}) {
  /** Which signup control triggered the legal nudge: `google` | `create`. */
  const [legalNudgeSource, setLegalNudgeSource] = useState(null)
  const legalCheckboxRef = useRef(null)

  useEffect(() => {
    if (!legalNudgeSource) return
    legalCheckboxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [legalNudgeSource])

  useEffect(() => {
    if (acceptedLegal) setLegalNudgeSource(null)
  }, [acceptedLegal])

  useEffect(() => {
    if (authTab !== 'join') setLegalNudgeSource(null)
  }, [authTab])

  const requireLegalAcceptance = (source) => {
    if (acceptedLegal) return false
    setLegalNudgeSource(source)
    return true
  }

  const onLegalCheckboxChange = (checked) => {
    onAcceptedLegalChange?.(checked)
    if (checked) setLegalNudgeSource(null)
  }

  const legalCheckboxHighlighted = authTab === 'join' && !acceptedLegal && legalNudgeSource != null
  const legalLinks = (
    <>
      <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-orange-400 underline underline-offset-2 hover:text-orange-300">
        Terms &amp; Conditions
      </a>
      {' '}and{' '}
      <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-400 underline underline-offset-2 hover:text-orange-300">
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
            If you <span className="font-semibold text-white">signed up with Google</span>, use{' '}
            <span className="text-orange-300">Continue with Google</span> below. You won&apos;t have an Edge password.
          </p>
          <p>
            Still having trouble? Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>
        <button
          type="button"
          disabled={isOAuthLoading}
          onClick={() => onGoogleSignIn({ setErrorTarget: 'forgot' })}
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
      {verificationSuccess ? (
        <div className="p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm sm:text-base font-medium leading-relaxed">
          ✅ Account verified - have fun!
        </div>
      ) : null}
      <AuthTabSwitcher value={authTab} onChange={onAuthTabChange} />
      {authTab === 'join' && legalNudgeSource === 'google' ? <LegalAcceptanceNudge /> : null}
      <button
        type="button"
        disabled={isOAuthLoading}
        onClick={() => {
          if (authTab === 'join' && requireLegalAcceptance('google')) return
          onGoogleSignIn({ setErrorTarget: authTab })
        }}
        className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
        aria-label="Continue with Google"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      <OAuthDivider />
      {authTab === 'join' ? (
        <form
          onSubmit={(e) => {
            if (requireLegalAcceptance('create')) {
              e.preventDefault()
              return
            }
            onSignUpSubmit(e)
          }}
          className="space-y-4"
        >
          <label
            ref={legalCheckboxRef}
            data-auth-legal-checkbox
            data-auth-legal-nudge={legalCheckboxHighlighted ? '1' : undefined}
            className={`relative flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left cursor-pointer touch-manipulation transition-colors ${
              legalCheckboxHighlighted
                ? 'border-orange-400/70 bg-orange-950/25'
                : 'border-zinc-700/80 bg-zinc-900/50'
            }`}
          >
            {legalCheckboxHighlighted ? (
              <span
                className="pointer-events-none absolute -inset-0.5 rounded-[1.1rem] ring-2 ring-cyan-400/75 auth-legal-checkbox-pulse"
                aria-hidden
              />
            ) : null}
            <input
              type="checkbox"
              checked={acceptedLegal}
              onChange={(e) => onLegalCheckboxChange(e.target.checked)}
              className="relative z-[1] mt-1 h-4 w-4 shrink-0 rounded border-zinc-500 accent-orange-500"
              aria-invalid={legalCheckboxHighlighted || undefined}
              aria-describedby={legalCheckboxHighlighted ? 'auth-legal-nudge-msg' : undefined}
            />
            <span className="relative z-[1] text-[13px] leading-relaxed text-zinc-300">
              I agree to the {legalLinks}.
            </span>
          </label>
          {legalCheckboxHighlighted ? (
            <span id="auth-legal-nudge-msg" className="sr-only">
              {LEGAL_NUDGE_MESSAGE}
            </span>
          ) : null}
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
          <input
            type="password"
            placeholder="Password"
            value={signupPassword}
            onChange={(e) => onSignupPasswordChange(e.target.value)}
            className={inputBase}
            autoComplete="new-password"
            inputMode="text"
            enterKeyHint="next"
            required
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={signupConfirmPassword}
            onChange={(e) => onSignupConfirmPasswordChange(e.target.value)}
            className={inputBase}
            autoComplete="new-password"
            inputMode="text"
            enterKeyHint="go"
            required
          />
          {signupError ? (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">
              {signupError}
            </div>
          ) : null}
          {signupMessage ? (
            <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">
              {signupMessage}
            </div>
          ) : null}
          {legalNudgeSource === 'create' ? <LegalAcceptanceNudge /> : null}
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
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className={inputBase}
            autoComplete="current-password"
            inputMode="text"
            enterKeyHint="go"
            required
          />
          <button
            type="submit"
            disabled={isLoggingIn}
            className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {isLoggingIn ? 'Signing in...' : 'Sign in'}
          </button>
          {loginError ? (
            <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">
              {loginError}
            </div>
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
        {authTab === 'join' ? (
          <>
            Required to create an account. See also{' '}
            <a href="/guidelines" target="_blank" rel="noopener noreferrer" className="text-orange-400/90 underline underline-offset-2">
              Community Guidelines
            </a>
            .
          </>
        ) : (
          <>
            By signing in you agree to our {legalLinks}. See also{' '}
            <a href="/guidelines" target="_blank" rel="noopener noreferrer" className="text-orange-400/90 underline underline-offset-2">
              Community Guidelines
            </a>
            .
          </>
        )}
      </p>
    </div>
  )
}

