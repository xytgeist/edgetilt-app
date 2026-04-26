import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import PhoenixLink from './calculators/PhoenixLink'
import BuffaloLink from './calculators/BuffaloLink'
import StackUpPays from './calculators/StackUpPays'
import MHBCalculator from './calculators/MHBCalculator'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseAnonKey)

function App() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isAllowed, setIsAllowed] = useState(false)
  const [isChecking, setIsChecking] = useState(true)
  const [currentView, setCurrentView] = useState('dashboard')

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

  // Verification success message
  const [verificationSuccess, setVerificationSuccess] = useState(false)

  useEffect(() => {
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.replace('#', ''))

    // Handle verification success FIRST
    if (hash.includes('type=signup') || hash.includes('type=confirmation')) {
      setVerificationSuccess(true)
      window.history.replaceState({}, document.title, '/')
      setIsAllowed(false)
      setIsChecking(false)
      return
    }

    // Only trigger reset password for actual recovery links
    if (hash.includes('type=recovery')) {
      setCurrentView('reset-password')
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      // Ensure recovery links create an auth session before password update.
      if (accessToken && refreshToken) {
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
      }

      window.history.replaceState({}, document.title, '/reset-password')
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) checkWhitelist(session.user.email)
      else setIsChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) checkWhitelist(session.user.email)
      else {
        setIsAllowed(false)
        setIsChecking(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const checkWhitelist = async (userEmail) => {
    const { data } = await supabase.from('allowed_emails').select('email').eq('email', userEmail).single()
    setIsAllowed(!!data)
    setIsChecking(false)
  }

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

    const { data: whitelistData } = await supabase.from('allowed_emails').select('email').eq('email', email).single()
    
    if (whitelistData) {
      setUser(data.user)
      setIsAllowed(true)
    } else {
      await supabase.auth.signOut()
      setLoginError("Your account is not yet approved. Contact Ryan to be whitelisted.")
    }
    setIsLoggingIn(false)
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

  if (isChecking) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>

  // Reset Password Page
  if (currentView === 'reset-password') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Reset Your Password</h2>

          {resetError && <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-2xl text-red-300 text-center">{resetError}</div>}

          {resetMessage ? (
            <div className="text-center py-8 text-emerald-400 text-lg font-medium">{resetMessage}</div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <input type="password" placeholder="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <button type="submit" disabled={isUpdatingPassword} className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold disabled:opacity-60 disabled:cursor-not-allowed">{isUpdatingPassword ? 'Updating...' : 'Update Password'}</button>
            </form>
          )}

          <button onClick={() => window.location.href = window.location.origin} className="mt-6 w-full text-gray-400 hover:text-white py-3 text-sm">← Back to Login</button>
        </div>
      </div>
    )
  }

  // Login Screen
  if (!user || !isAllowed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Las Vegas Slot Pro</h2>

          {verificationSuccess && (
            <div className="mb-6 p-4 bg-emerald-900/50 border border-emerald-500 rounded-2xl text-emerald-300 text-center font-medium">
              ✅ Account Verified - have fun!
            </div>
          )}

          {!showForgotPassword && !showCreateAccount ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoggingIn ? 'Logging In...' : 'Log In'}
              </button>

              {loginError && (
                <div className="mt-3 p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center">
                  {loginError}
                </div>
              )}

              <button 
                type="button" 
                onClick={() => {
                  setShowCreateAccount(true)
                  setShowForgotPassword(false)
                  setSignupError('')
                  setSignupMessage('')
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 border border-orange-600 py-4 rounded-2xl font-bold text-white"
              >
                Signup
              </button>

              <div className="text-center pt-2">
                <button type="button" onClick={() => setShowForgotPassword(true)} className="text-orange-400 hover:text-orange-300 text-sm underline">Forgot Password?</button>
              </div>
            </form>
          ) : showCreateAccount ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <input type="email" placeholder="Email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <input type="password" placeholder="Password" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              <input type="password" placeholder="Confirm Password" value={signupConfirmPassword} onChange={(e) => setSignupConfirmPassword(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              {signupError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center">{signupError}</div>}
              {signupMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center">{signupMessage}</div>}
              <button type="submit" disabled={isSigningUp} className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold disabled:opacity-60 disabled:cursor-not-allowed">{isSigningUp ? 'Creating Account...' : 'Create Account'}</button>
              <button type="button" onClick={() => {
                setShowCreateAccount(false)
                setSignupError('')
                setSignupMessage('')
              }} className="w-full text-gray-400 hover:text-white py-3 text-sm">← Back to Login</button>
            </form>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <input type="email" placeholder="Enter your email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} className="w-full p-4 bg-gray-800 rounded-2xl text-white" required />
              {forgotError && <div className="p-3 bg-red-900/50 border border-red-500 rounded-xl text-red-300 text-sm text-center">{forgotError}</div>}
              {forgotMessage && <div className="p-3 bg-emerald-900/50 border border-emerald-500 rounded-xl text-emerald-300 text-sm text-center">{forgotMessage}</div>}
              <button type="submit" disabled={isSendingReset} className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold disabled:opacity-60 disabled:cursor-not-allowed">{isSendingReset ? 'Sending...' : 'Send Reset Link'}</button>
              <button type="button" onClick={() => setShowForgotPassword(false)} className="w-full text-gray-400 hover:text-white py-3 text-sm">← Back to Login</button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gray-950">
      {currentView === 'dashboard' ? (
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-black text-white tracking-tight">Las Vegas Slot Pro</h1>
            <p className="text-zinc-400 mt-3">Select a calculator</p>
          </div>

          <button onClick={() => setCurrentView('phoenix')} className="w-full bg-gray-900 hover:bg-gray-800 transition-colors p-8 rounded-3xl text-left flex items-center gap-5 mb-4 h-28">
            <img src="/phoenix-link-logo.png" alt="Phoenix" className="w-16 h-16 rounded-xl flex-shrink-0" />
            <div>
              <div className="font-semibold text-2xl text-orange-400">Phoenix Link EV Calc</div>
              <div className="text-base text-gray-400">Must-hit counter bonus analyzer</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('buffalo')} className="w-full bg-gradient-to-br from-amber-600 via-orange-600 to-red-700 hover:from-amber-500 hover:via-orange-500 hover:to-red-600 p-8 rounded-3xl text-left flex items-center gap-5 mb-4 h-28 transition-all active:scale-[0.985]">
            <div className="w-16 h-16 flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 shadow-inner flex-shrink-0">
              <img src="/buffalo-icon.png" alt="Buffalo" className="w-14 h-14 object-contain" />
            </div>
            <div>
              <div className="font-semibold text-2xl text-amber-100">Buffalo Link EV Calc</div>
              <div className="text-base text-amber-200">Midpoint-based counter analyzer</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('stackup')} className="w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-8 rounded-3xl text-left flex items-center gap-5 mb-4 h-28 transition-all active:scale-[0.985]">
            <img src="/stackup-icon.jpg" alt="Stack Up Pays" className="w-16 h-16 object-cover rounded-2xl shadow-lg flex-shrink-0" />
            <div>
              <div className="font-semibold text-2xl text-cyan-100">Stack Up Pays</div>
              <div className="text-base text-cyan-200">Ascending Fortunes • 5-meter analyzer</div>
            </div>
          </button>

          <button onClick={() => setCurrentView('mhb')} className="w-full bg-gradient-to-br from-purple-600 via-violet-600 to-fuchsia-700 hover:from-purple-500 hover:via-violet-500 hover:to-fuchsia-600 p-8 rounded-3xl text-left flex items-center gap-5 mb-4 h-28 transition-all active:scale-[0.985]">
            <div className="w-16 h-16 flex items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-purple-400 to-fuchsia-400 shadow-inner flex-shrink-0 text-5xl">🎰</div>
            <div>
              <div className="font-semibold text-2xl text-purple-100">Must Hit By Jackpot</div>
              <div className="text-base text-purple-200">Progressive must-hit analyzer</div>
            </div>
          </button>

          <div className="mt-12 text-center">
            <button onClick={handleLogout} className="text-gray-400 hover:text-red-400 text-sm underline transition-colors">Logout</button>
          </div>
        </div>
      ) : currentView === 'phoenix' ? (
        <PhoenixLink onBack={() => setCurrentView('dashboard')} />
      ) : currentView === 'buffalo' ? (
        <BuffaloLink onBack={() => setCurrentView('dashboard')} />
      ) : currentView === 'stackup' ? (
        <StackUpPays onBack={() => setCurrentView('dashboard')} />
      ) : currentView === 'mhb' ? (
        <MHBCalculator onBack={() => setCurrentView('dashboard')} />
      ) : null}
    </div>
  )
}

export default App