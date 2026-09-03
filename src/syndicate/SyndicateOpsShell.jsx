import { lazy, Suspense, useEffect, useState } from 'react'
import { fetchBotPortalSnapshot } from '../features/bots/botPortalApi.js'

const BotSharpDeskPanel = lazy(() =>
  import('../features/bots/BotSharpDeskPanel.jsx').then((m) => ({ default: m.BotSharpDeskPanel }))
)

const SPORT_OPTIONS = [
  { id: 'americanfootball_nfl', label: 'NFL' },
  { id: 'americanfootball_ncaaf', label: 'CFB' },
  { id: 'mma_mixed_martial_arts', label: 'UFC' },
]

function resolveScottBot(snapshot) {
  const bots = Array.isArray(snapshot?.bots) ? snapshot.bots : []
  const bySlug = bots.find((b) => String(b.slug || '').toLowerCase() === 'sports-odds')
  if (bySlug) return bySlug
  return bots.find((b) => b.pipeline === 'odds_api') || null
}

/**
 * Admin shell: Sharp Desk (scorecard, Chedda paste, PVALs, metrics, monthly board).
 */
export function SyndicateOpsShell({ supabaseClient, userEmail, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bot, setBot] = useState(null)
  const [selectedSportKey, setSelectedSportKey] = useState('americanfootball_nfl')

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
        const scott = resolveScottBot(data)
        if (!scott) {
          setError('No sports-odds / odds_api bot found on this project.')
          setBot(null)
          return
        }
        setBot(scott)
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
    const t = setTimeout(() => setToast(''), 4500)
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
            <h1 className="text-lg font-bold text-zinc-50 truncate">Ops · Sharp Desk</h1>
            <p className="text-[11px] text-zinc-500 truncate">{userEmail}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-zinc-400">
              Drop sport
              <select
                value={selectedSportKey}
                onChange={(e) => setSelectedSportKey(e.target.value)}
                className="rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1.5"
              >
                {SPORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
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
          Scorecard, Chedda Action PRO paste, PVALs, EPA / CFB / UFC metrics, monthly board. Bot create / pause / X
          sources stay on EdgeTilt <span className="font-mono text-zinc-400">/?tab=bots</span>.
        </p>

        {loading ? <p className="text-zinc-400 text-sm">Loading Scott desk…</p> : null}
        {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}

        {!loading && bot ? (
          <Suspense fallback={<p className="text-zinc-400 text-sm">Loading Sharp Desk…</p>}>
            <BotSharpDeskPanel
              supabaseClient={supabaseClient}
              botUserId={bot.user_id}
              botSlug={bot.slug || 'sports-odds'}
              setToast={setToast}
              busy={busy}
              setBusy={setBusy}
              selectedSportKey={selectedSportKey}
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
