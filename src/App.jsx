import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { mobileShell, inputBase, btnPrimary, btnSecondary, linkBtn } from './features/shell/shellClasses'
import { readAuthCallbackParams, getOAuthCallbackMessage } from './features/auth/oauthCallback'
import { OAuthDivider, GoogleIcon } from './features/auth/OAuthUi'
import AppShell from './features/shell'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

function App() {
  const AUTH_VIEW_STORAGE_KEY = 'lvslotpro-auth-view'
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isChecking, setIsChecking] = useState(true)
  const [currentView, setCurrentView] = useState('app')
  /** Full-screen login/signup when the user chooses it or a feature calls onRequireAuth. */
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  /** Optional shell banner (e.g. future account notices). */
  const [accessNotice, setAccessNotice] = useState('')
  /** Moderator/admin: full access; hamburger hides subscriber-only lock icons. */
  const [isStaffRole, setIsStaffRole] = useState(false)
  /** From `profiles.has_active_subscription` when column exists (see `supabase/profiles_tier_testing.sql`). */
  const [hasActiveSubscriptionFromProfile, setHasActiveSubscriptionFromProfile] = useState(false)

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [showCreateAccount, setShowCreateAccount] = useState(false)
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('')
  const [signupMessage, setSignupMessage] = useState('')
  const [signupError, setSignupError] = useState('')

  // Reset password states
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetError, setResetError] = useState('')

  // Login error (only shown after failed login attempt)
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [isSigningUp, setIsSigningUp] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isOAuthLoading, setIsOAuthLoading] = useState(false)

  // Verification success message
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const pref = window.localStorage.getItem(AUTH_VIEW_STORAGE_KEY)
        if (pref === 'create') {
          setShowCreateAccount(true)
          setShowForgotPassword(false)
          setAuthPanelOpen(true)
        }
        if (pref === 'login') {
          setShowCreateAccount(false)
          setShowForgotPassword(false)
          setAuthPanelOpen(true)
        }
        if (pref) window.localStorage.removeItem(AUTH_VIEW_STORAGE_KEY)
      } catch {
        // Ignore storage read failures.
      }
    })
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      const { error: oauthError, errorCode, errorDescription } = readAuthCallbackParams()
      const oauthMsg = getOAuthCallbackMessage(oauthError, errorCode, errorDescription)
      if (oauthMsg) {
        setLoginError(oauthMsg)
        window.history.replaceState({}, document.title, window.location.pathname || '/')
      }

      const hash = window.location.hash
      const hashParams = new URLSearchParams(hash.replace('#', ''))
      // Email confirmation uses type=signup; Google OAuth can too, but the hash includes provider_token
      const isEmailOnlyVerification =
        (hash.includes('type=signup') || hash.includes('type=confirmation')) && !hash.includes('provider_token')
      if (isEmailOnlyVerification) {
        setVerificationSuccess(true)
        setTimeout(() => {
          if (window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname || '/')
          }
        }, 0)
      }

      // Only trigger reset password for actual recovery links
      if (hash.includes('type=recovery')) {
        setCurrentView('reset-password')
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        if (accessToken && refreshToken) {
          void supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          })
        }

        window.history.replaceState({}, document.title, '/reset-password')
      }
    })

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setIsChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!user?.id) {
      queueMicrotask(() => {
        setIsStaffRole(false)
        setHasActiveSubscriptionFromProfile(false)
      })
      return
    }
    let cancelled = false
    const load = async () => {
      const wide = await supabase
        .from('profiles')
        .select('role, has_active_subscription')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (wide.data) {
        const r = wide.data.role
        setIsStaffRole(r === 'moderator' || r === 'admin')
        setHasActiveSubscriptionFromProfile(Boolean(wide.data.has_active_subscription))
        return
      }
      if (wide.error?.code === 'PGRST116') {
        setIsStaffRole(false)
        setHasActiveSubscriptionFromProfile(false)
        return
      }
      if (wide.error) {
        const narrow = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
        if (cancelled) return
        if (narrow.data) {
          const r = narrow.data.role
          setIsStaffRole(r === 'moderator' || r === 'admin')
        } else {
          setIsStaffRole(false)
        }
        setHasActiveSubscriptionFromProfile(false)
        return
      }
      setIsStaffRole(false)
      setHasActiveSubscriptionFromProfile(false)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const getFriendlyErrorMessage = (error, context = 'general') => {
    const message = error?.message || 'Unknown error'
    const lower = message.toLowerCase()

    if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('fetch')) {
      return 'Network error. Check your connection and try again.'
    }

    if (lower.includes('rate limit') || lower.includes('too many requests')) {
      return 'Too many attempts. Please wait a few minutes and try again.'
    }

    if (context === 'login' && (lower.includes('email not confirmed') || lower.includes('not confirmed'))) {
      return 'Please verify your email before logging in.'
    }

    if (context === 'reset' && (lower.includes('session missing') || lower.includes('invalid') || lower.includes('expired') || lower.includes('jwt'))) {
      return 'This reset link is invalid or expired. Please request a new one.'
    }

    return message
  }

  const handleLogin = async (e) => {
    e?.preventDefault()
    if (isLoggingIn) return
    setIsLoggingIn(true)
    setLoginError('')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    
    if (error) {
      setLoginError(getFriendlyErrorMessage(error, 'login'))
      setIsLoggingIn(false)
      return
    }

    setUser(data.user)
    setAccessNotice('')
    setAuthPanelOpen(false)
    setIsLoggingIn(false)
  }

  const handleOAuthSignIn = async (provider, { setError = setLoginError } = {}) => {
    if (isOAuthLoading) return
    setError('')
    setIsOAuthLoading(true)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/` }
    })
    if (error) {
      setError(getFriendlyErrorMessage(error))
      setIsOAuthLoading(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    if (isSigningUp) return
    setSignupError('')
    setSignupMessage('')
    if (!signupEmail || !signupPassword || !signupConfirmPassword) return setSignupError("Please fill in all fields")
    if (signupPassword !== signupConfirmPassword) return setSignupError("Passwords do not match")
    if (signupPassword.length < 6) return setSignupError("Password must be at least 6 characters")
    setIsSigningUp(true)

    const { data, error } = await supabase.auth.signUp({ 
      email: signupEmail, 
      password: signupPassword,
      options: {
        emailRedirectTo: window.location.origin

      }
    })
    if (error) {
      const message = error.message?.toLowerCase() || ''
      if (message.includes('already registered') || message.includes('already exists') || message.includes('user already')) {
        setSignupError("Account already exists. Please log in or use Forgot Password.")
      } else {
        setSignupError(getFriendlyErrorMessage(error))
      }
      setIsSigningUp(false)
      return
    }

    // Supabase can return a user with no identities when the email already exists.
    if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setSignupError("Account already exists. Please log in or use Forgot Password.")
      setIsSigningUp(false)
      return
    }

    setSignupMessage("✅ Account created! Please check your email for the confirmation link.")
    setSignupEmail('')
    setSignupPassword('')
    setSignupConfirmPassword('')
    setIsSigningUp(false)
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (isSendingReset) return
    if (!forgotEmail) return setForgotError("Please enter your email")
    setIsSendingReset(true)
    setForgotError('')
    setForgotMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (error) {
      setForgotError(getFriendlyErrorMessage(error))
    } else {
      setForgotMessage("If an account exists for that email, a reset link has been sent.")
      setForgotEmail('')
    }
    setIsSendingReset(false)
  }

  const handlePasswordReset = async (e) => {
    e.preventDefault()
    if (isUpdatingPassword) return
    setResetError('')
    if (newPassword !== confirmPassword) return setResetError("Passwords do not match")
    if (newPassword.length < 6) return setResetError("Password must be at least 6 characters")
    setIsUpdatingPassword(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setResetError("This reset link is invalid or expired. Please request a new one.")
      setIsUpdatingPassword(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setResetError(getFriendlyErrorMessage(error, 'reset'))
    } else {
      setResetMessage("✅ Password updated successfully!")
      setTimeout(() => {
        window.location.href = window.location.origin
      }, 2000)
    }
    setIsUpdatingPassword(false)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  const openAuthPanel = (mode = 'login') => {
    if (mode === 'create') {
      setShowCreateAccount(true)
      setShowForgotPassword(false)
    } else {
      setShowCreateAccount(false)
      setShowForgotPassword(false)
    }
    setLoginError('')
    setAuthPanelOpen(true)
  }

  if (isChecking) return <div className={`${mobileShell} text-white`}>Loading...</div>

  // Reset Password Page
  if (currentView === 'reset-password') {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Reset Your Password</h2>

          {resetError && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-sm text-center">{resetError}</div>}

          {resetMessage ? (
            <div className="text-center py-8 text-emerald-400 text-base font-medium leading-relaxed">{resetMessage}</div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="next"
                required
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              <button type="submit" disabled={isUpdatingPassword} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <button onClick={() => { window.location.href = window.location.origin }} className={`${linkBtn} text-sm sm:text-base mt-4`}>← Back to Login</button>
        </div>
      </div>
    )
  }

  // Login / signup (overlay path — app shell stays available when this is closed)
  if (authPanelOpen) {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full">
          <button
            type="button"
            onClick={() => {
              setAuthPanelOpen(false)
              setLoginError('')
              setSignupError('')
              setSignupMessage('')
            }}
            className={`${linkBtn} mb-5 block w-full text-left text-sm sm:text-base`}
          >
            ← Continue without signing in
          </button>
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Las Vegas Slot Pro</h2>

          {verificationSuccess && (
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center text-sm sm:text-base font-medium leading-relaxed">
              ✅ Account Verified - have fun!
            </div>
          )}

          {!showForgotPassword && !showCreateAccount ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                onChange={(e) => setPassword(e.target.value)}
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
                {isLoggingIn ? 'Logging In...' : 'Log In'}
              </button>

              {loginError && (
                <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">
                  {loginError}
                </div>
              )}

              <OAuthDivider />
              <button
                type="button"
                disabled={isOAuthLoading}
                onClick={() => handleOAuthSignIn('google')}
                className={`${btnPrimary} flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
                aria-label="Continue with Google"
              >
                <GoogleIcon />
                Google
              </button>

              <button 
                type="button" 
                onClick={() => {
                  setShowCreateAccount(true)
                  setShowForgotPassword(false)
                  setSignupError('')
                  setSignupMessage('')
                }}
                className={`${btnSecondary} bg-gray-700 hover:bg-gray-600 border border-orange-600 rounded-2xl text-white`}
              >
                Signup
              </button>

              <div className="pt-1">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="w-full min-h-12 text-base text-orange-400 hover:text-orange-300 touch-manipulation py-3 text-center">
                  Forgot Password?
                </button>
              </div>
            </form>
          ) : showCreateAccount ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
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
                onChange={(e) => setSignupPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="next"
                required
              />
              <input
                type="password"
                placeholder="Confirm Password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                className={inputBase}
                autoComplete="new-password"
                inputMode="text"
                enterKeyHint="go"
                required
              />
              {signupError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">{signupError}</div>}
              {signupMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">{signupMessage}</div>}
              <button type="submit" disabled={isSigningUp} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isSigningUp ? 'Creating Account...' : 'Create Account'}
              </button>
              <OAuthDivider />
              <button
                type="button"
                disabled={isOAuthLoading}
                onClick={() => handleOAuthSignIn('google', { setError: setSignupError })}
                className={`${btnPrimary} flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed`}
                aria-label="Sign up with Google"
              >
                <GoogleIcon />
                Google
              </button>
              <button type="button" onClick={() => {
                setShowCreateAccount(false)
                setSignupError('')
                setSignupMessage('')
              }} className={`${linkBtn} text-sm sm:text-base`}>← Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input
                type="email"
                placeholder="Enter your email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className={inputBase}
                autoComplete="email"
                inputMode="email"
                enterKeyHint="go"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
              {forgotError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center leading-relaxed" role="alert">{forgotError}</div>}
              {forgotMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center leading-relaxed">{forgotMessage}</div>}
              <button type="submit" disabled={isSendingReset} className={`${btnPrimary} bg-orange-600 hover:bg-orange-500 rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed`}>
                {isSendingReset ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => setShowForgotPassword(false)} className={`${linkBtn} text-sm sm:text-base`}>← Back to Login</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  const hasActiveSubscription =
    hasActiveSubscriptionFromProfile ||
    String(import.meta.env.VITE_HAS_ACTIVE_SUBSCRIPTION || '').toLowerCase() === 'true'

  // Logged-in app shell
  if (currentView === 'app') {
    return (
      <AppShell
        browseMode={user ? 'member' : 'anonymous'}
        hasActiveSubscription={hasActiveSubscription}
        isStaff={isStaffRole}
        onOpenAuth={openAuthPanel}
        accessNotice={accessNotice}
        onDismissAccessNotice={() => setAccessNotice('')}
        onLogout={handleLogout}
        supabaseClient={supabase}
        onRequireAuth={(mode = 'login') => openAuthPanel(mode === 'create' ? 'create' : 'login')}
      />
    )
  }

  return null
}

export default App

