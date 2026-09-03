import { useEffect, useRef, useState } from 'react'
import { syndicateAuthClient } from './syndicateAuthClient.js'

const ic =
  'w-full min-h-11 text-base text-zinc-100 bg-zinc-900 rounded-xl border border-zinc-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/40'

function hasStoredOpsSession() {
  try {
    return Boolean(localStorage.getItem('sb-syndicate-ops-auth'))
  } catch {
    return false
  }
}

/**
 * Admin email/password gate for Syndicate Ops (profiles.role === 'admin').
 */
export function SyndicateOpsLoginGate({ children }) {
  const [state, setState] = useState(() => (hasStoredOpsSession() ? 'checking' : 'login'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const userRef = useRef(null)

  async function checkRole(userId) {
    if (!syndicateAuthClient) return false
    const { data } = await syndicateAuthClient
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.role === 'admin'
  }

  useEffect(() => {
    if (!syndicateAuthClient) {
      setState('login')
      return undefined
    }

    let cancelled = false

    async function applySession(session) {
      if (cancelled) return
      if (!session?.user) {
        userRef.current = null
        setState('login')
        setBusy(false)
        return
      }
      userRef.current = session.user
      const ok = await checkRole(session.user.id)
      if (cancelled) return
      setState(ok ? 'ready' : 'not-admin')
      setBusy(false)
    }

    const timeout = setTimeout(() => {
      if (!cancelled) setState((s) => (s === 'checking' ? 'login' : s))
    }, 6000)

    syndicateAuthClient.auth.getSession().then(({ data: { session } }) => {
      clearTimeout(timeout)
      void applySession(session)
    })

    const { data: sub } = syndicateAuthClient.auth.onAuthStateChange((_event, session) => {
      void applySession(session)
    })

    return () => {
      cancelled = true
      clearTimeout(timeout)
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  async function handleLogin(e) {
    e.preventDefault()
    if (!syndicateAuthClient) {
      setError('Supabase client is not configured.')
      return
    }
    setError('')
    setBusy(true)
    try {
      const { error: err } = await syndicateAuthClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) throw err
      // onAuthStateChange applies ready / not-admin
    } catch (err) {
      setError(err.message || 'Login failed.')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await syndicateAuthClient?.auth.signOut()
    setState('login')
  }

  if (!syndicateAuthClient) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950 text-zinc-100">
        <p className="text-red-400 text-sm">Missing Supabase env for Syndicate Ops.</p>
      </div>
    )
  }

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950 text-zinc-100">
        <p className="text-zinc-400 text-sm">Checking session…</p>
      </div>
    )
  }

  if (state === 'not-admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 bg-zinc-950 text-zinc-100">
        <p className="text-red-400 font-semibold text-sm">Admin access required for Syndicate Ops.</p>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm"
        >
          Sign out
        </button>
      </div>
    )
  }

  if (state === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-zinc-950 text-zinc-100">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500/80 font-semibold">
              Sharpe Syndicate
            </p>
            <h1 className="text-2xl font-bold text-emerald-300 mt-1">Ops</h1>
            <p className="text-zinc-400 text-sm mt-1">Admin sign-in. Same EdgeTilt admin account.</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
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
              <label className="block text-sm font-medium text-zinc-300 mb-1">Password</label>
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
              className="w-full min-h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-bold"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <a href="/" className="block text-center text-xs text-zinc-500 hover:text-zinc-300">
            ← Public site
          </a>
        </div>
      </div>
    )
  }

  return children({
    supabaseClient: syndicateAuthClient,
    userEmail: userRef.current?.email || '',
    onSignOut: handleSignOut,
  })
}
