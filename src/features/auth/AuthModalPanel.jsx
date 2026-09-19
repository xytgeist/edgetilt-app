import { useEffect, useRef, useState } from 'react'
import { isEdgeiOSShell } from '../../utils/edgeNative.js'
import { inputBase, btnPrimary, linkBtn } from '../shell/shellClasses'
import { AppleIcon, OAuthDivider, GoogleIcon } from './OAuthUi'
import AuthPasswordField from './AuthPasswordField'
import { useIpadAuthStage } from './AuthModalShell'
import { formatPhoneDisplay, toE164ForCountry } from './phoneSignIn.js'
import PhoneCountryField from './PhoneCountryField.jsx'

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

function ProviderCircle({ label, onClick, disabled, selected, children }) {
  return (
    <button
      type="button"
      data-auth-ipad-provider
      data-selected={selected ? '1' : undefined}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={selected || undefined}
      className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-500 bg-transparent text-white disabled:opacity-50 [&_svg]:h-7 [&_svg]:w-7"
    >
      {children}
    </button>
  )
}

function EmailIcon() {
  return (
    <svg className="h-7 w-7" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        d="M4 6.5h16v11H4z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        d="M4 7.5 12 13l8-5.5"
      />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      />
    </svg>
  )
}

function OrDivider({ chipClassName = 'bg-zinc-950', className = 'my-7' }) {
  return (
    <div className={`relative w-full ${className}`} data-auth-ipad-or>
      <div className="absolute inset-0 flex items-center" aria-hidden>
        <div data-auth-ipad-or-line className="w-full border-t border-zinc-700" />
      </div>
      <div className="relative flex justify-center text-lg text-zinc-500">
        <span className={`${chipClassName} px-3`}>or</span>
      </div>
    </div>
  )
}

function ConsentLine({ legalLinks, onOpenLegalDocument }) {
  return (
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
  onSendPhoneCode,
  onVerifyPhoneCode,
}) {
  const signupMessageRef = useRef(null)
  const ipadStage = useIpadAuthStage()
  const [emailOpen, setEmailOpen] = useState(false)
  const [phoneStep, setPhoneStep] = useState(null)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneCountry, setPhoneCountry] = useState('US')
  const [phoneE164, setPhoneE164] = useState('')
  const [phoneCode, setPhoneCode] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneBusy, setPhoneBusy] = useState(false)

  useEffect(() => {
    setPhoneStep(null)
    setPhoneError('')
    setPhoneBusy(false)
  }, [authTab])

  /** After Create account, success lives at the top ... scroll the sheet so it is not below the fold. */
  useEffect(() => {
    if (!signupMessage) return
    const modal = document.querySelector('[data-auth-modal]')
    if (modal instanceof HTMLElement) {
      modal.scrollTo({ top: 0, behavior: 'smooth' })
    }
    signupMessageRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [signupMessage])

  const showAppleSignIn = ipadStage || isEdgeiOSShell()
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

  const showJoinEmail =
    authTab === 'join' &&
    (emailOpen || Boolean(signupMessage) || Boolean(signupError && !isOAuthProviderError(signupError)))

  const closePhoneStep = () => {
    setPhoneStep(null)
    setPhoneError('')
    setPhoneBusy(false)
    setPhoneCode('')
  }

  const submitPhoneNumber = async (e) => {
    e?.preventDefault?.()
    if (phoneBusy) return
    const e164 = toE164ForCountry(phoneInput, phoneCountry)
    if (!e164) {
      setPhoneError('Enter a valid mobile number.')
      return
    }
    setPhoneBusy(true)
    setPhoneError('')
    try {
      const result = await onSendPhoneCode?.(e164)
      if (result?.error) {
        setPhoneError(result.error)
        return
      }
      setPhoneE164(e164)
      setPhoneCode('')
      setPhoneStep('code')
    } catch {
      setPhoneError('Could not send the code. Try again in a minute.')
    } finally {
      setPhoneBusy(false)
    }
  }

  const submitPhoneCode = async (e) => {
    e.preventDefault()
    if (phoneBusy) return
    const token = phoneCode.replace(/\D/g, '')
    if (token.length < 4) {
      setPhoneError('Enter the code from the text.')
      return
    }
    setPhoneBusy(true)
    setPhoneError('')
    try {
      const result = await onVerifyPhoneCode?.(phoneE164, token)
      if (result?.error) setPhoneError(result.error)
    } catch {
      setPhoneError('That code is incorrect or expired.')
    } finally {
      setPhoneBusy(false)
    }
  }

  return (
      <div className="flex flex-col">
        {signupMessage ? (
          <div
            ref={signupMessageRef}
            data-auth-signup-message
            role="status"
            className="mb-4 p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed"
          >
            {signupMessage}
          </div>
        ) : null}
        {verificationSuccess ? (
          <div className="mb-4 p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm font-medium leading-relaxed">
            ✅ Account verified - have fun!
          </div>
        ) : null}
        <div className={`${ipadStage ? 'mt-[calc(2.5rem+100px)] -mb-[100px]' : 'mt-2'} flex flex-col items-center px-1`}>
          {phoneStep ? (
            <form
              onSubmit={phoneStep === 'code' ? submitPhoneCode : submitPhoneNumber}
              className="mt-2 w-full space-y-4"
            >
              {phoneStep === 'number' ? (
                <PhoneCountryField
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  country={phoneCountry}
                  onCountryChange={setPhoneCountry}
                  placeholder="Phone number"
                  enterKeyHint="go"
                  required
                />
              ) : (
                <>
                  <p className="text-center text-sm leading-relaxed text-zinc-400">
                    Code sent to {formatPhoneDisplay(phoneE164)}
                  </p>
                  <input
                    type="text"
                    placeholder="6-digit code"
                    value={phoneCode}
                    onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className={inputBase}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    enterKeyHint="go"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                  />
                </>
              )}
              {phoneError ? <AuthErrorBanner message={phoneError} /> : null}
              <button
                type="submit"
                disabled={phoneBusy}
                className={`${btnPrimary} rounded-full bg-orange-600 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {phoneBusy
                  ? phoneStep === 'number'
                    ? 'Sending...'
                    : 'Checking...'
                  : phoneStep === 'number'
                    ? 'Send code'
                    : 'Continue'}
              </button>
              {phoneStep === 'code' ? (
                <button
                  type="button"
                  disabled={phoneBusy}
                  onClick={submitPhoneNumber}
                  className={`${linkBtn} w-full text-sm sm:text-base`}
                >
                  Send again
                </button>
              ) : null}
              <button type="button" onClick={closePhoneStep} className={`${linkBtn} w-full text-sm sm:text-base`}>
                ← Back
              </button>
            </form>
          ) : (
          <>
          <div className="flex items-center justify-center gap-5">
            <ProviderCircle
              label="Continue with Google"
              disabled={isOAuthLoading}
              onClick={() => onOAuthSignIn({ provider: 'google', setErrorTarget: authTab })}
            >
              <GoogleIcon />
            </ProviderCircle>
            {showAppleSignIn ? (
              <ProviderCircle
                label="Continue with Apple"
                disabled={isOAuthLoading}
                onClick={() => onOAuthSignIn({ provider: 'apple', setErrorTarget: authTab })}
              >
                <AppleIcon />
              </ProviderCircle>
            ) : null}
            <ProviderCircle
              label={authTab === 'join' ? 'Continue with email' : 'Sign in with email'}
              selected={authTab !== 'join' || showJoinEmail}
              onClick={() => {
                if (authTab !== 'join') return
                setEmailOpen(true)
              }}
            >
              <EmailIcon />
            </ProviderCircle>
          </div>
          {!showJoinEmail ? (
            <>
              <OrDivider
                chipClassName={ipadStage ? 'bg-zinc-950' : 'bg-black'}
                className={ipadStage ? 'my-7' : 'my-5'}
              />
              <button
                type="button"
                data-auth-ipad-phone
                className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-full border-0 bg-black text-white`}
                onClick={() => {
                  setPhoneError('')
                  setPhoneStep('number')
                }}
              >
                <PhoneIcon />
                Continue with Phone
              </button>
            </>
          ) : null}
          {authTab === 'join' && isOAuthProviderError(signupError) ? (
            <div className="mt-4 w-full">
              <AuthErrorBanner message={signupError} />
            </div>
          ) : null}
          {authTab !== 'join' && isOAuthProviderError(loginError) ? (
            <div className="mt-4 w-full">
              <AuthErrorBanner message={loginError} />
            </div>
          ) : null}
          {authTab === 'join' && showJoinEmail ? (
            <form onSubmit={onSignUpSubmit} className="mt-8 w-full space-y-4">
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
                className={`${btnPrimary} rounded-full bg-orange-600 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isSigningUp ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          ) : null}
          {authTab !== 'join' ? (
            <form onSubmit={onLoginSubmit} className="mt-8 w-full space-y-4">
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
                className={`${btnPrimary} rounded-full bg-orange-600 hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {isLoggingIn ? 'Signing in...' : 'Sign in'}
              </button>
              {loginError && !isOAuthProviderError(loginError) ? (
                <AuthErrorBanner message={loginError} />
              ) : null}
              <button
                type="button"
                onClick={onOpenForgotPassword}
                className="w-full min-h-12 py-3 text-center text-lg text-orange-400 touch-manipulation hover:text-orange-300"
              >
                Trouble signing in?
              </button>
            </form>
          ) : null}
          </>
          )}
          <div className="mt-6 w-full">
            <ConsentLine legalLinks={legalLinks} onOpenLegalDocument={onOpenLegalDocument} />
          </div>
        </div>
        <button
          type="button"
          {...(ipadStage ? { 'data-auth-ipad-footer': '' } : { 'data-auth-sheet-footer': '' })}
          onClick={() => {
            setEmailOpen(false)
            onAuthTabChange(authTab === 'join' ? 'signin' : 'join')
          }}
        >
          {authTab === 'join' ? 'Sign in' : 'Create account'}
          <span aria-hidden className="text-lg leading-none">
            ›
          </span>
        </button>
      </div>
    )
}

