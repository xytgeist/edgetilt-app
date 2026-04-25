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

  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      setCurrentView('reset-password')
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

  const handleLogin = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        emailRedirectTo: 'https://lvslotpro.com'
      }
    })
    if (error) alert("Error: " + error.message)
    else alert("✅ Account created! Please check your email for the confirmation link.")
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail) return alert("Please enter your email")

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: 'https://lvslotpro.com/reset-password'
    })

    if (error) alert("Error: " + error.message)
    else {
      alert("Reset link sent! Check your inbox/spam.")
      setShowForgotPassword(false)
      setForgotEmail('')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  if (isChecking) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>

  if (!user || !isAllowed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="bg-gray-900 p-8 rounded-3xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">Las Vegas Slot Pro</h2>

          <form className="space-y-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 bg-gray-800 rounded-2xl text-white"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-gray-800 rounded-2xl text-white"
              required
            />

            <button 
              type="button" 
              onClick={handleLogin}
              className="w-full bg-orange-600 hover:bg-orange-500 py-4 rounded-2xl font-bold"
            >
              Log In
            </button>

            <button 
              type="button" 
              onClick={handleSignUp}
              className="w-full bg-gray-700 hover:bg-gray-600 py-4 rounded-2xl font-bold"
            >
              Create Account
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-orange-400 hover:text-orange-300 text-sm underline"
              >
                Forgot Password?
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  // Dashboard (rest of your app)
  return (
    <div className="min-h-screen bg-gray-950">
      {currentView === 'dashboard' ? (
        <div className="max-w-lg mx-auto px-4 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-black text-white tracking-tight">Las Vegas Slot Pro</h1>
            <p className="text-zinc-400 mt-3">Select a calculator</p>
          </div>

          {/* Your calculator buttons remain unchanged */}
          <button onClick={() => setCurrentView('phoenix')} className="w-full bg-gray-900 hover:bg-gray-800 transition-colors p-8 rounded-3xl text-left flex items-center gap-5 mb-4 h-28">
            <img src="/phoenix-link-logo.png" alt="Phoenix" className="w-16 h-16 rounded-xl flex-shrink-0" />
            <div>
              <div className="font-semibold text-2xl text-orange-400">Phoenix Link EV Calc</div>
              <div className="text-base text-gray-400">Must-hit counter bonus analyzer</div>
            </div>
          </button>

          {/* ... other buttons ... */}

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