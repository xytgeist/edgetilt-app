import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { fetchBotPortalSnapshot } from '../features/bots/botPortalApi.js'
import { resolveSyndicateDeskBot, SHARPE_SYNDICATE_BOT_SLUG } from './syndicateBotIdentity.js'

const BotSharpDeskPanel = lazy(() =>
  import('../features/bots/BotSharpDeskPanel.jsx').then((m) => ({ default: m.BotSharpDeskPanel }))
)

/** Desk child panels mix string toasts and `{ message }` objects ... always store a string. */
function normalizeOpsToast(value) {
  if (value == null || value === false) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    if (typeof value.message === 'string') return value.message
    if (value.message != null) return String(value.message)
  }
  return String(value)
}

/**
 * Admin shell: Sharp Desk (scorecard, Chedda paste, PVALs, metrics, monthly board).
 */
export function SyndicateOpsShell({ supabaseClient, userEmail, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const [toast, setToastRaw] = useState('')
  const setToast = useMemo(
    () => (value) => setToastRaw(normalizeOpsToast(value)),
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bot, setBot] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: snapErr } = await fetchBotPortalSnapshot(supabaseClient)
        if (cancelled) return
        if (snapErr) {
          setError(snapErr.message || 'Could not load bot portal snapshot.')
          setBot(null)
          return
        }
        const deskBot = resolveSyndicateDeskBot(data)
        if (!deskBot) {
          setError('No Sharpe Syndicate / Signal odds bot found on this project.')
          setBot(null)
          return
        }
        setBot(deskBot)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load Ops.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient])

  useEffect(() => {
    if (!toast) return undefined
    const t = setTimeout(() => setToastRaw(''), 4500)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.title = 'Syndicate Ops | Sharpe Syndicate'
    let meta = document.querySelector('meta[name="robots"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'robots')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', 'noindex, nofollow')
  }, [])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" data-syndicate-ops>
      <header className="sticky top-0 z-20 border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-3 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-500/80 font-semibold">
              Sharpe Syndicate
            </p>
            <h1 className="text-lg font-bold text-zinc-50 truncate">Ops · Desks</h1>
            <p className="text-[11px] text-zinc-500 truncate">{userEmail}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/"
              className="min-h-8 rounded-lg px-3 text-[11px] font-semibold text-zinc-300 bg-zinc-900 border border-zinc-700 hover:bg-zinc-800 inline-flex items-center"
            >
              Public site
            </a>
            <button
              type="button"
              onClick={() => void onSignOut()}
              className="min-h-8 rounded-lg px-3 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-4 pb-16">
        <p className="text-[11px] text-zinc-500 mb-4">
          House is the 4-desk composer. Open Scott, Rocco, Chedda, or Tank, then Preview a drop to see that desk&apos;s
          vote and why. Scorecard, Chedda paste, PVALs, and metrics stay on the tabs below. Bot create / pause / X sources stay on EdgeTilt{' '}
          <span className="font-mono text-zinc-400">/?tab=bots</span>.
        </p>

        {loading ? <p className="text-zinc-400 text-sm">Loading desks…</p> : null}
        {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}

        {!loading && bot ? (
          <Suspense fallback={<p className="text-zinc-400 text-sm">Loading Sharp Desk…</p>}>
            <BotSharpDeskPanel
              supabaseClient={supabaseClient}
              botUserId={bot.user_id}
              botSlug={bot.slug || SHARPE_SYNDICATE_BOT_SLUG}
              setToast={setToast}
              busy={busy}
              setBusy={setBusy}
            />
          </Suspense>
        ) : null}
      </main>

      {toast ? (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-md px-4 py-2.5 rounded-xl bg-zinc-900 border border-emerald-500/40 text-sm text-zinc-100 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
    </div>
  )
}
