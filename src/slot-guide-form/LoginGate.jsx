import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://jtjgtucumuoswnbauxry.supabase.co'
const SB_ANON = 'sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B'

// Auth checks against the test environment (where the app currently lives).
// Exported so SlotGuideFormApp can reuse the same authenticated client instance
// for reads/writes — no service key needed; RLS admin policies gate access.
export const supabase = createClient(SB_URL, SB_ANON)

const ic = 'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

/** Check localStorage for any Supabase session token synchronously. */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return true
    }
  } catch { /* ignore */ }
  return false
}

/**
 * Wraps children behind a Supabase email/password login.
 * Only users with profiles.role = 'admin' are admitted.
 */
export default function LoginGate({ children }) {
  // Skip 'checking' entirely if there's no stored session token
  const [state, setState] = useState(() => hasStoredSession() ? 'checking' : 'login')
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
    if (state !== 'checking') return  // no stored session, skip async check

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

    return () => clearTimeout(timeout)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="h-dvh overflow-y-auto overscroll-y-contain bg-gray-950">
        <div className="min-h-dvh flex items-center justify-center">
          <p className="text-gray-400">Checking session…</p>
        </div>
      </div>
    )
  }

  if (state === 'not-admin') {
    return (
      <div className="h-dvh overflow-y-auto overscroll-y-contain bg-gray-950">
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4 px-4">
          <p className="text-red-400 font-semibold">Your account does not have admin access.</p>
          <button onClick={handleSignOut} className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-white">
            Sign out
          </button>
        </div>
      </div>
    )
  }

  if (state === 'login') {
    return (
      <div className="h-dvh overflow-y-auto overscroll-y-contain bg-gray-950 text-white">
        <div className="min-h-dvh flex items-center justify-center px-4">
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
      </div>
    )
  }

  // state === 'ready'
  return (
    <div className="h-dvh overflow-y-auto overscroll-y-contain bg-gray-950" data-slot-guide-form>
      <div className="flex justify-end px-4 pt-3">
        <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-gray-300">
          Sign out ({userRef.current?.email})
        </button>
      </div>
      {children}
    </div>
  )
}
