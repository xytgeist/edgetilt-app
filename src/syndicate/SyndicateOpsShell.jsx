import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { fetchBotPortalSnapshot } from '../features/bots/botPortalApi.js'
import {
  formatTodayPicksResult,
  todayPicksPlan,
  runTodayPicksForSport,
} from './syndicateTodayPicks.js'
import { resolveSyndicateDeskBot, SHARPE_SYNDICATE_BOT_SLUG } from './syndicateBotIdentity.js'
import { SyndicateDryRunPreview } from './SyndicateDryRunPreview.jsx'

const BotSharpDeskPanel = lazy(() =>
  import('../features/bots/BotSharpDeskPanel.jsx').then((m) => ({ default: m.BotSharpDeskPanel }))
)

const SPORT_OPTIONS = [
  { id: 'americanfootball_nfl', label: 'NFL' },
  { id: 'americanfootball_ncaaf', label: 'CFB' },
  { id: 'mma_mixed_martial_arts', label: 'UFC' },
]

/**
 * Admin shell: Sharp Desk (scorecard, Chedda paste, PVALs, metrics, monthly board).
 */
export function SyndicateOpsShell({ supabaseClient, userEmail, onSignOut }) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bot, setBot] = useState(null)
  const [selectedSportKey, setSelectedSportKey] = useState('americanfootball_ncaaf')
  const [runDryRun, setRunDryRun] = useState(true)
  const [dryRunPreview, setDryRunPreview] = useState(null)
  const previewAnchorRef = useRef(null)

  const todayPlan = useMemo(() => todayPicksPlan(selectedSportKey), [selectedSportKey])

  useEffect(() => {
    if (!dryRunPreview) return
    previewAnchorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [dryRunPreview])

  async function handleRunPicksForToday() {
    if (!bot || busy) return
    setBusy(true)
    try {
      const { plan, data, error: runErr } = await runTodayPicksForSport(supabaseClient, {
        // Desk product … queue as Syndicate (not Signal).
        slug: bot.slug || SHARPE_SYNDICATE_BOT_SLUG,
        sportKey: selectedSportKey,
        dryRun: runDryRun,
      })
      if (runErr) {
        setDryRunPreview(null)
        setToast(runErr.message || 'Run picks failed.')
        return
      }
      if (runDryRun || data?.dryRun) {
        const skipNote = data?.skipped
          ? String(data.note || data.skipped)
          : null
        const publicCaption = String(data?.previewCaption || data?.captionPreview || '').trim()
        const vipCaption = String(data?.vipPreviewCaption || '').trim()
        const threadParts = Array.isArray(data?.subscriberThreadParts)
          ? data.subscriberThreadParts
          : null
        setDryRunPreview({
          sportLabel: plan.sportLabel,
          dayKey: data?.dayKey,
          previewCaption: publicCaption || null,
          vipPreviewCaption: vipCaption || null,
          subscriberThreadParts: threadParts,
          gamesSummary: data?.gamesSummary,
          gamesToday: data?.gamesToday,
          totalGames: data?.totalGames,
          hammersCount: data?.hammersCount,
          consensusCount: data?.consensusCount,
          splitsCount: data?.splitsCount,
          solosCount: data?.solosCount,
          majoritySplitsCount: data?.majoritySplitsCount,
          passOnlyCount: data?.passOnlyCount,
          error:
            data?.ok === false
              ? data.message || data.error
              : skipNote,
        })
        setToast(
          publicCaption || vipCaption || (threadParts && threadParts.length)
            ? 'Preview ready below (Public + Subscriber tabs).'
            : formatTodayPicksResult(data, true),
        )
        return
      }
      setDryRunPreview(null)
      setToast(formatTodayPicksResult(data, false))
    } catch (err) {
      setDryRunPreview(null)
      setToast(err.message || 'Run picks failed.')
    } finally {
      setBusy(false)
    }
  }

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
              Sport
              <select
                value={selectedSportKey}
                onChange={(e) => setSelectedSportKey(e.target.value)}
                disabled={busy}
                className="rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 text-[11px] px-2 py-1.5 disabled:opacity-50"
              >
                {SPORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[11px] text-zinc-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={runDryRun}
                onChange={(e) => setRunDryRun(e.target.checked)}
                disabled={busy}
                className="rounded border-zinc-600"
              />
              Dry run
            </label>
            <button
              type="button"
              disabled={busy || !bot}
              onClick={() => void handleRunPicksForToday()}
              className="min-h-8 rounded-lg px-3 text-[11px] font-bold text-zinc-950 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50"
            >
              {busy ? 'Running…' : 'Run picks for today'}
            </button>
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
        <div className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-3 py-2.5 text-[11px] text-emerald-100/90">
          <span className="font-semibold text-emerald-300">Run picks for today:</span> {todayPlan.summary}
          <span className="block text-zinc-500 mt-1">
            Does not replay scheduled crons (Thu tease, Fri lock, etc.). Dry run first, then uncheck to publish to Lounge +
            ledger.
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 mb-4">
          Scorecard, Chedda Action PRO paste, PVALs, EPA / CFB / UFC metrics, monthly board. Bot create / pause / X
          sources stay on EdgeTilt <span className="font-mono text-zinc-400">/?tab=bots</span>.
        </p>

        <div ref={previewAnchorRef}>
          <SyndicateDryRunPreview preview={dryRunPreview} onDismiss={() => setDryRunPreview(null)} />
        </div>

        {loading ? <p className="text-zinc-400 text-sm">Loading Scott desk…</p> : null}
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
