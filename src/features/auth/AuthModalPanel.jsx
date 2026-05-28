import { inputBase, btnPrimary, linkBtn } from '../shell/shellClasses'
import { OAuthDivider, GoogleIcon } from './OAuthUi'
import AuthTabSwitcher from './AuthTabSwitcher'

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
}) {
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
          ✅ Account verified — have fun!
        </div>
      ) : null}
      <AuthTabSwitcher value={authTab} onChange={onAuthTabChange} />
      <button
        type="button"
        disabled={isOAuthLoading}
        onClick={() => onGoogleSignIn({ setErrorTarget: authTab })}
        className={`${btnPrimary} flex w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
        aria-label="Continue with Google"
      >
        <GoogleIcon />
        Continue with Google
      </button>
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
    </div>
  )
}

