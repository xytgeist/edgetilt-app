import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Auth always checks against prod — admin accounts live there.
// Publishable key, safe to hardcode.
const supabase = createClient(
  'https://wedrhwtsxifbnnbgxdkm.supabase.co',
  'sb_publishable_jtH82joS6gk2_gfzwEgomA_AtmkXwOY',
)

const ic = 'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

/**
 * Wraps children behind a Supabase email/password login.
 * Only users with profiles.role = 'admin' are admitted.
 */
export default function LoginGate({ children }) {
  const [state, setState] = useState('checking') // 'checking' | 'login' | 'not-admin' | 'ready'
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const userRef = useRef(null)

  async function checkRole(userId) {
    const { data } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle()
    return data?.role === 'admin'
  }

  useEffect(() => {
    // Timeout guard — if Supabase doesn't respond in 6s, drop to login screen
    const timeout = setTimeout(() => setState('login'), 6000)

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        clearTimeout(timeout)
        if (!session) { setState('login'); return }
        userRef.current = session.user
        const ok = await checkRole(session.user.id)
        setState(ok ? 'ready' : 'not-admin')
      })
      .catch(() => { clearTimeout(timeout); setState('login') })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      clearTimeout(timeout)
      if (!session) { setState('login'); return }
      userRef.current = session.user
      const ok = await checkRole(session.user.id)
      setState(ok ? 'ready' : 'not-admin')
    })
    return () => { clearTimeout(timeout); subscription.unsubscribe() }
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (err) throw err
      // onAuthStateChange handles the rest
    } catch (err) {
      setError(err.message || 'Login failed.')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setState('login')
  }

  if (state === 'checking') {
    return (
      <div className="min-h-dvh bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">Checking session…</p>
      </div>
    )
  }

  if (state === 'not-admin') {
    return (
      <div className="min-h-dvh bg-gray-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400 font-semibold">Your account does not have admin access.</p>
        <button onClick={handleSignOut} className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-white">
          Sign out
        </button>
      </div>
    )
  }

  if (state === 'login') {
    return (
      <div className="min-h-dvh bg-gray-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-cyan-300">AP Guide editor</h1>
            <p className="text-gray-400 text-sm mt-1">Admin access required.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
              <input
                type="email"
                className={ic}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
              <input
                type="password"
                className={ic}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error ? <p className="text-red-400 text-sm">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 font-bold"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // state === 'ready'
  return (
    <div>
      <div className="flex justify-end px-4 pt-3">
        <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-gray-300">
          Sign out ({userRef.current?.email})
        </button>
      </div>
      {children}
    </div>
  )
}
