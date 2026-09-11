import { useCallback, useEffect, useState } from 'react'
import { loungeReportReasonLabel } from './loungeReportReasons.js'
import {
  fetchLoungeReportsForStaff,
  hideLoungeReportTarget,
  updateLoungeReportStatus,
} from './loungeReportsApi.js'

const STATUS_FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'actioned', label: 'Actioned' },
  { id: 'dismissed', label: 'Dismissed' },
  { id: 'all', label: 'All' },
]

function profileLabel(profile) {
  if (!profile) return 'Unknown'
  const handle = String(profile.handle || '').replace(/^@/, '')
  return handle ? `@${handle}` : profile.display_name || 'Unknown'
}

export default function EdgeMonitorLoungeReportsPanel({ supabaseClient }) {
  const [status, setStatus] = useState('open')
  const [rows, setRows] = useState([])
  const [profiles, setProfiles] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchLoungeReportsForStaff(supabaseClient, { status })
      setRows(data)
      const ids = [...new Set(data.flatMap((row) => [row.reporter_id, row.target_user_id].filter(Boolean)))]
      if (!ids.length) {
        setProfiles({})
        return
      }
      const { data: people, error: peopleError } = await supabaseClient
        .from('profiles')
        .select('user_id,handle,display_name')
        .in('user_id', ids)
      if (peopleError) throw peopleError
      setProfiles(Object.fromEntries((people || []).map((row) => [row.user_id, row])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [status, supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const runStatus = async (row, nextStatus, hideTarget = false) => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession()
    const reviewerId = session?.user?.id
    setBusyId(row.id)
    setError('')
    try {
      if (hideTarget) await hideLoungeReportTarget(supabaseClient, row)
      await updateLoungeReportStatus(supabaseClient, row.id, {
        status: nextStatus,
        reviewerId,
      })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update report.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section className="edge-monitor-section rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-white">Lounge reports</div>
          <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            Member flags. Hide removes the post or comment from Lounge. Block is the member&apos;s own action.
          </div>
        </div>
        <button
          type="button"
          className="min-h-10 rounded-xl bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
          onClick={() => void load()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`min-h-8 rounded-lg px-2.5 text-[11px] font-semibold ${
              status === item.id ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
            }`}
            onClick={() => setStatus(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="mb-3 text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-zinc-400">Loading reports…</p> : null}
      {!loading && !rows.length ? <p className="text-sm text-zinc-500">No reports in this filter.</p> : null}
      <div className="space-y-2">
        {rows.map((row) => {
          const busy = busyId === row.id
          return (
            <article key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {loungeReportReasonLabel(row.reason)}
                    <span className="ml-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {row.target_kind}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {profileLabel(profiles[row.reporter_id])} reported {profileLabel(profiles[row.target_user_id])}
                  </div>
                  {row.details ? <p className="mt-1 text-xs text-zinc-300">{row.details}</p> : null}
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {new Date(row.created_at).toLocaleString()} · {row.status}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.status === 'open' ? (
                  <button
                    type="button"
                    className="min-h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void runStatus(row, 'reviewing')}
                  >
                    Reviewing
                  </button>
                ) : null}
                {row.target_kind !== 'profile' ? (
                  <button
                    type="button"
                    className="min-h-8 rounded-lg bg-rose-900/70 px-2.5 text-[11px] font-semibold text-rose-100 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void runStatus(row, 'actioned', true)}
                  >
                    Hide + action
                  </button>
                ) : null}
                <button
                  type="button"
                  className="min-h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void runStatus(row, 'actioned')}
                >
                  Actioned
                </button>
                <button
                  type="button"
                  className="min-h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void runStatus(row, 'dismissed')}
                >
                  Dismiss
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
