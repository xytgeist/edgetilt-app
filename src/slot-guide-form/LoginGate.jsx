import { useEffect, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const SB_URL = 'https://jtjgtucumuoswnbauxry.supabase.co'
const SB_ANON = 'sb_publishable_u3-GQGrZ_hswapkiWiPyLA_Ah3mxU8B'

export const supabase = createClient(SB_URL, SB_ANON)

const ic = 'w-full min-h-11 text-base text-white bg-gray-900 rounded-xl border border-gray-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500/40'

/** Inline + CSS - survives file-picker viewport quirks on Chrome/Windows. */
const SHELL_STYLE = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 0,
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  maxHeight: '100vh',
  width: '100%',
  overflow: 'hidden',
  backgroundColor: '#030712',
}

const SCROLL_STYLE = {
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  WebkitOverflowScrolling: 'touch',
}

function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || ''
      if (k.startsWith('sb-') && k.endsWith('-auth-token')) return true
    }
  } catch { /* ignore */ }
  return false
}

export default function LoginGate({ children }) {
  const [state, setState] = useState(() => hasStoredSession() ? 'checking' : 'login')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState('')
  const userRef = useRef(null)

  useEffect(() => {
    const lock = () => {
      document.documentElement.style.height = '100vh'
      document.body.style.height = '100vh'
      const root = document.getElementById('root')
      if (root) {
        root.style.height = '100vh'
        root.style.maxHeight = '100vh'
        root.style.minHeight = '0'
      }
    }
    lock()
    window.visualViewport?.addEventListener('resize', lock)
    window.addEventListener('resize', lock)
    return () => {
      window.visualViewport?.removeEventListener('resize', lock)
      window.removeEventListener('resize', lock)
    }
  }, [])

  async function checkRole(userId) {
    const { data } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle()
    return data?.role === 'admin'
  }

  useEffect(() => {
    if (state !== 'checking') return

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
    } catch (err) {
      setError(err.message || 'Login failed.')
      setBusy(false)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setState('login')
  }

  function shell(className, content) {
    return (
      <div className={className} data-slot-guide-form style={SHELL_STYLE}>
        {content}
      </div>
    )
  }

  if (state === 'checking') {
    return shell('slot-guide-form-shell', (
      <div className="slot-guide-form-scroll flex items-center justify-center" style={SCROLL_STYLE}>
        <p className="text-gray-400">Checking session…</p>
      </div>
    ))
  }

  if (state === 'not-admin') {
    return shell('slot-guide-form-shell', (
      <div className="slot-guide-form-scroll flex flex-col items-center justify-center gap-4 px-4" style={SCROLL_STYLE}>
        <p className="text-red-400 font-semibold">Your account does not have admin access.</p>
        <button type="button" onClick={handleSignOut} className="px-4 py-2 rounded-xl bg-gray-700 hover:bg-gray-600 text-sm text-white">
          Sign out
        </button>
      </div>
    ))
  }

  if (state === 'login') {
    return shell('slot-guide-form-shell text-white', (
      <div className="slot-guide-form-scroll flex items-center justify-center px-4 py-8" style={SCROLL_STYLE}>
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
    ))
  }

  return shell('slot-guide-form-shell', (
    <>
      <div className="shrink-0 flex justify-end px-4 pt-3">
        <button type="button" onClick={handleSignOut} className="text-xs text-gray-500 hover:text-gray-300">
          Sign out ({userRef.current?.email})
        </button>
      </div>
      <div className="slot-guide-form-scroll" style={SCROLL_STYLE}>
        {children}
      </div>
    </>
  ))
}
