import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { mobileShell, inputBase, btnPrimary, linkBtn } from './features/shell/shellClasses'
import { readAuthCallbackParams, getOAuthCallbackMessage } from './features/auth/oauthCallback'
import AuthModalPanel from './features/auth/AuthModalPanel'
import AppShell from './features/shell'
import { ensureDefaultProfileRow } from './features/profiles/profileGate'
import SubscribeModal from './features/billing/SubscribeModal.jsx'
import { PRODUCT_SLOTS_EDGE } from './features/billing/edgeProducts.js'
import { startEdgeCheckout } from './features/billing/stripeBillingApi.js'
import { useEdgeEntitlements } from './features/billing/useEdgeEntitlements.js'
import { useContentAccessGates } from './features/billing/useContentAccessGates.js'
import {
  readLoungeComposerDraftPendingWork,
  shouldShowLoungeColdBootSplash,
} from './utils/loungeColdBootSplash.js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

function readBillingQueryParams() {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    const billing = params.get('billing')
    if (!billing) return null
    return {
      billing,
      product: params.get('product') || PRODUCT_SLOTS_EDGE,
    }
  } catch {
    return null
  }
}

function clearBillingQueryParams() {
  if (typeof window === 'undefined') return
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('billing')
    url.searchParams.delete('product')
    const next = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, document.title, next || '/')
  } catch {
    // ignore
  }
}

function App() {
  const AUTH_VIEW_STORAGE_KEY = 'lvslotpro-auth-view'
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isChecking, setIsChecking] = useState(true)
  const [currentView, setCurrentView] = useState('app')
  /** Login/signup as a modal over the app when the user chooses it or a feature calls onRequireAuth. */
  const [authPanelOpen, setAuthPanelOpen] = useState(false)
  /** Optional shell banner (e.g. future account notices). */
  const [accessNotice, setAccessNotice] = useState('')
  /** Moderator/admin: full access; hamburger hides subscriber-only lock icons. */
  const [isStaffRole, setIsStaffRole] = useState(false)
  /** Admin only: content access lock switches on calcs/guides. */
  const [isAdminRole, setIsAdminRole] = useState(false)
  /** From `profiles.has_active_subscription` when column exists (see `supabase/profiles_tier_testing.sql`). */
  const [hasActiveSubscriptionFromProfile, setHasActiveSubscriptionFromProfile] = useState(false)
  const [stripeCustomerId, setStripeCustomerId] = useState(null)
  const [subscribeModal, setSubscribeModal] = useState({ open: false, productSlug: PRODUCT_SLOTS_EDGE })

  // Forgot password states
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotMessage, setForgotMessage] = useState('')
  const [forgotError, setForgotError] = useState('')
  const [authTab, setAuthTab] = useState('join')
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
  const [deleteAccountBusy, setDeleteAccountBusy] = useState(false)

  // Verification success message
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const pref = window.localStorage.getItem(AUTH_VIEW_STORAGE_KEY)
        if (pref === 'create') {
          setAuthTab('join')
          setShowForgotPassword(false)
          setAuthPanelOpen(true)
        }
        if (pref === 'login') {
          setAuthTab('signin')
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
        setAuthTab('signin')
        setLoginError(oauthMsg)
        setAuthPanelOpen(true)
        window.history.replaceState({}, document.title, window.location.pathname || '/')
      }

      const hash = window.location.hash || ''
      const search = window.location.search || ''
      const combinedForType = `${hash}${search}`
      const hashParams = new URLSearchParams(hash.replace('#', ''))
      // Email confirmation uses type=signup (or type=confirmation); Google OAuth includes provider_token in the hash.
      const isEmailOnlyVerification =
        (combinedForType.includes('type=signup') || combinedForType.includes('type=confirmation')) &&
        !combinedForType.includes('provider_token')
      if (isEmailOnlyVerification) {
        setVerificationSuccess(true)
        setAuthTab('signin')
        setShowForgotPassword(false)
        setLoginError('')
        setAuthPanelOpen(true)
        setTimeout(() => {
          if (window.location.hash) {
            window.history.replaceState({}, document.title, window.location.pathname || '/')
          }
        }, 0)
      }

      // Only trigger reset password for actual recovery links
      if (combinedForType.includes('type=recovery')) {
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

  /** Seeds `profiles` when missing (avoids Lounge composer UUID hex initials like “65”) — OAuth and session restore, not only password login. */
  useEffect(() => {
    if (!user?.id) return
    void ensureDefaultProfileRow(supabase, user)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when auth user id changes; not every new `user` reference from Supabase.
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) {
      queueMicrotask(() => {
        setIsStaffRole(false)
        setIsAdminRole(false)
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
      })
      return
    }
    let cancelled = false
    const load = async () => {
      const wide = await supabase
        .from('profiles')
        .select('role, has_active_subscription, stripe_customer_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (wide.data) {
        const r = wide.data.role
        setIsStaffRole(r === 'moderator' || r === 'admin')
        setIsAdminRole(r === 'admin')
        setHasActiveSubscriptionFromProfile(Boolean(wide.data.has_active_subscription))
        setStripeCustomerId(wide.data.stripe_customer_id ?? null)
        return
      }
      if (wide.error?.code === 'PGRST116') {
        setIsStaffRole(false)
        setIsAdminRole(false)
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
        return
      }
      if (wide.error) {
        const narrow = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
        if (cancelled) return
        if (narrow.data) {
          const r = narrow.data.role
          setIsStaffRole(r === 'moderator' || r === 'admin')
          setIsAdminRole(r === 'admin')
        } else {
          setIsStaffRole(false)
          setIsAdminRole(false)
        }
        setHasActiveSubscriptionFromProfile(false)
        setStripeCustomerId(null)
        return
      }
      setIsStaffRole(false)
      setIsAdminRole(false)
      setHasActiveSubscriptionFromProfile(false)
      setStripeCustomerId(null)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const {
    entitlements,
    refresh: refreshEntitlements,
    hasSlotsEdge: hasSlotsEdgeFromRpc,
  } = useEdgeEntitlements(supabase, user?.id)

  const {
    gatesMap: contentAccessGatesMap,
    gatesDbReady: contentAccessGatesDbReady,
    setContentGate: setContentAccessGate,
  } = useContentAccessGates(supabase, isAdminRole)

  useEffect(() => {
    const billing = readBillingQueryParams()
    if (!billing || !user?.id) return

    let cancelled = false

    const pollEntitlements = async () => {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        if (cancelled) return
        await refreshEntitlements()
        const { data } = await supabase
          .from('profiles')
          .select('has_active_subscription, stripe_customer_id')
          .eq('user_id', user.id)
          .maybeSingle()
        if (data) {
          setHasActiveSubscriptionFromProfile(Boolean(data.has_active_subscription))
          setStripeCustomerId(data.stripe_customer_id ?? null)
          if (data.has_active_subscription) return
        }
        await new Promise((r) => window.setTimeout(r, 1200))
      }
    }

    if (billing.billing === 'success' || billing.billing === 'portal') {
      void pollEntitlements()
      setAccessNotice(
        billing.billing === 'success'
          ? 'Subscription updated — thanks for supporting Edge.'
          : 'Billing settings saved.',
      )
    }
    clearBillingQueryParams()

    return () => {
      cancelled = true
    }
  }, [user?.id, refreshEntitlements])

  const openSubscribeModal = useCallback((productSlug = PRODUCT_SLOTS_EDGE, options = {}) => {
    if (options?.directCheckout) {
      return startEdgeCheckout(supabase, productSlug)
    }
    setSubscribeModal({ open: true, productSlug })
  }, [])

  const closeSubscribeModal = useCallback(() => {
    setSubscribeModal((s) => ({ ...s, open: false }))
  }, [])

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

    setIsLoggingIn(false)
    setUser(data.user)
    setAccessNotice('')
    setVerificationSuccess(false)
    setAuthPanelOpen(false)
    await ensureDefaultProfileRow(supabase, data.user)
    // Full reload so Lounge (and composer) mount with the new session; same-tab anon → member can leave feed UI stale otherwise.
    window.location.reload()
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
    if (data?.session?.user) {
      void ensureDefaultProfileRow(supabase, data.session.user)
    }
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

  const handleDeleteAccount = useCallback(async () => {
    if (
      !window.confirm(
        'Permanently delete this account? All data tied to it in this project (profile, Lounge posts, offers subscriptions, Auth flags, etc.) will be removed. This cannot be undone.'
      )
    )
      return
    setDeleteAccountBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('delete-own-account', {
        method: 'POST',
        body: {},
      })
      if (error) throw error
      if (data && typeof data === 'object' && data.error) {
        throw new Error(String(data.error))
      }
      await supabase.auth.signOut()
      window.location.href = `${window.location.origin}/`
    } catch (e) {
      const fallback =
        'Could not delete account. Deploy the delete-own-account Edge Function (see supabase/functions/delete-own-account/README.md).'
      const msg = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : fallback
      window.alert(msg)
    } finally {
      setDeleteAccountBusy(false)
    }
  }, [])

  const switchAuthTab = useCallback(
    (nextTab) => {
      setAuthTab(nextTab)
      setShowForgotPassword(false)
      setLoginError('')
      setSignupError('')
      setSignupMessage('')
      if (nextTab === 'join') {
        setSignupEmail((prev) => (prev.trim() ? prev : email.trim()))
      } else {
        setEmail((prev) => (prev.trim() ? prev : signupEmail.trim()))
      }
    },
    [email, signupEmail],
  )

  const openAuthPanel = (mode = 'create') => {
    setAuthTab(mode === 'login' ? 'signin' : 'join')
    setShowForgotPassword(false)
    setLoginError('')
    setSignupError('')
    setSignupMessage('')
    setAuthPanelOpen(true)
  }

  const closeAuthPanel = useCallback(() => {
    setAuthPanelOpen(false)
    setLoginError('')
    setSignupError('')
    setSignupMessage('')
    setVerificationSuccess(false)
  }, [])

  useEffect(() => {
    if (!authPanelOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') closeAuthPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [authPanelOpen, closeAuthPanel])

  useEffect(() => {
    if (!authPanelOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [authPanelOpen])

  if (isChecking && !shouldShowLoungeColdBootSplash({
    tab: 'home',
    pendingWork: readLoungeComposerDraftPendingWork(),
  })) {
    return <div className={`${mobileShell} text-zinc-50`}>Loading...</div>
  }

  // Reset Password Page
  if (currentView === 'reset-password') {
    return (
      <div className={mobileShell}>
        <div className="bg-gray-900 p-6 sm:p-8 rounded-3xl max-w-sm w-full" data-auth-modal>
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

  const hasSlotsEdgeAccess =
    isStaffRole ||
    hasSlotsEdgeFromRpc ||
    hasActiveSubscriptionFromProfile ||
    String(import.meta.env.VITE_HAS_ACTIVE_SUBSCRIPTION || '').toLowerCase() === 'true'

  // App shell (Lounge and tabs); sign-in / create-account open as a modal on top
  if (currentView === 'app') {
    return (
      <>
        <AppShell
          browseMode={user ? 'member' : 'anonymous'}
          authSessionReady={!isChecking}
          hasActiveSubscription={hasSlotsEdgeAccess}
          isStaff={isStaffRole}
          isAdmin={isAdminRole}
          contentAccessGatesMap={contentAccessGatesMap}
          contentAccessGatesDbReady={contentAccessGatesDbReady}
          onSetContentAccessGate={setContentAccessGate}
          onOpenAuth={openAuthPanel}
          onRequireSubscribe={openSubscribeModal}
          accessNotice={accessNotice}
          onDismissAccessNotice={() => setAccessNotice('')}
          onLogout={handleLogout}
          onDeleteAccount={handleDeleteAccount}
          deleteAccountBusy={deleteAccountBusy}
          supabaseClient={supabase}
          onRequireAuth={(mode) => openAuthPanel(mode === 'login' ? 'login' : 'create')}
        />
        <SubscribeModal
          open={subscribeModal.open}
          productSlug={subscribeModal.productSlug}
          onClose={closeSubscribeModal}
          supabaseClient={supabase}
          hasBillingAccount={Boolean(stripeCustomerId)}
        />
        {authPanelOpen ? (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <button
              type="button"
              className="absolute inset-0 cursor-default bg-black/70 [-webkit-tap-highlight-color:transparent]"
              aria-label="Close sign in"
              onClick={closeAuthPanel}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
              className="relative z-10 w-full max-w-sm max-h-[min(90dvh,calc(100dvh-2rem))] overflow-y-auto overscroll-contain rounded-3xl border border-zinc-600/80 bg-gray-900 p-6 shadow-2xl sm:p-8"
              data-auth-modal
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeAuthPanel}
                className={`${linkBtn} mb-4 !min-h-11 w-full text-sm sm:text-base`}
              >
                ← Continue without signing in
              </button>
              <svg
                id="auth-modal-title"
                viewBox="0 0 260 32"
                width="100%"
                className="mb-6 mx-auto block max-w-[300px]"
                aria-label="Find Your Edge"
                role="img"
              >
                <text x="26" y="24" textAnchor="start" fontFamily="'Montserrat', sans-serif" fontWeight="300" fontSize="24" fill="currentColor">
                  Find Your
                </text>
                <image href="/edge-lounge-logo-transparent.png" x="150" y="6" width="77" height="19" className="edge-logo--dark" />
                <image href="/edge-lounge-logo-light.png"       x="150" y="6" width="77" height="19" className="edge-logo--light" />
              </svg>

              <AuthModalPanel
                authTab={authTab}
                onAuthTabChange={switchAuthTab}
                showForgotPassword={showForgotPassword}
                onOpenForgotPassword={() => {
                  setShowForgotPassword(true)
                  setForgotError('')
                  setForgotMessage('')
                  const addr = email.trim() || signupEmail.trim()
                  if (addr && !forgotEmail.trim()) setForgotEmail(addr)
                }}
                onCloseForgotPassword={() => {
                  setShowForgotPassword(false)
                  setForgotError('')
                  setForgotMessage('')
                  switchAuthTab('signin')
                }}
                verificationSuccess={verificationSuccess}
                email={email}
                onEmailChange={setEmail}
                password={password}
                onPasswordChange={setPassword}
                loginError={loginError}
                isLoggingIn={isLoggingIn}
                onLoginSubmit={handleLogin}
                signupEmail={signupEmail}
                onSignupEmailChange={setSignupEmail}
                signupPassword={signupPassword}
                onSignupPasswordChange={setSignupPassword}
                signupConfirmPassword={signupConfirmPassword}
                onSignupConfirmPasswordChange={setSignupConfirmPassword}
                signupError={signupError}
                signupMessage={signupMessage}
                isSigningUp={isSigningUp}
                onSignUpSubmit={handleSignUp}
                forgotEmail={forgotEmail}
                onForgotEmailChange={setForgotEmail}
                forgotError={forgotError}
                forgotMessage={forgotMessage}
                isSendingReset={isSendingReset}
                onForgotSubmit={handleForgotPassword}
                isOAuthLoading={isOAuthLoading}
                onGoogleSignIn={({ setErrorTarget }) => {
                  const setError =
                    setErrorTarget === 'forgot'
                      ? setForgotError
                      : setErrorTarget === 'join'
                        ? setSignupError
                        : setLoginError
                  setError('')
                  void handleOAuthSignIn('google', { setError })
                }}
              />
            </div>
          </div>
        ) : null}
      </>
    )
  }

  return null
}

export default App

