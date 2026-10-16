import { useCallback, useEffect, useState } from 'react'
import { loungeReportReasonLabel } from './loungeReportReasons.js'
import {
  actionLoungeReport,
  fetchLoungeReportsForStaff,
  hydrateLoungeReportTargets,
  requestLoungeReportTriageBatch,
  updateLoungeReportStatus,
} from './loungeReportsApi.js'

const FILTERS = [
  { id: 'needs_human', label: 'Needs human' },
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

function targetPreview(row, targets) {
  if (row.target_kind === 'post') {
    const post = targets.posts[row.target_id]
    if (!post) return 'Post missing or already deleted.'
    const caption = String(post.caption || '').trim()
    return caption || '(no caption)'
  }
  if (row.target_kind === 'comment') {
    const comment = targets.comments[row.target_id]
    if (!comment) return 'Comment missing or already deleted.'
    return String(comment.body || '').trim() || '(empty comment)'
  }
  return 'Profile report.'
}

function postHref(row, targets) {
  if (row.target_kind === 'post') return `/?tab=home&post=${encodeURIComponent(row.target_id)}`
  if (row.target_kind === 'comment') {
    const postId = targets.comments[row.target_id]?.post_id
    return postId ? `/?tab=home&post=${encodeURIComponent(postId)}` : null
  }
  return null
}

export default function LoungeModQueuePanel({ supabaseClient, compact = false }) {
  const [filter, setFilter] = useState('needs_human')
  const [rows, setRows] = useState([])
  const [profiles, setProfiles] = useState({})
  const [targets, setTargets] = useState({ posts: {}, comments: {} })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [notes, setNotes] = useState({})

  const load = useCallback(async () => {
    if (!supabaseClient) return
    setLoading(true)
    setError('')
    try {
      const needsHuman = filter === 'needs_human'
      const status = needsHuman ? 'all' : filter
      const data = await fetchLoungeReportsForStaff(supabaseClient, { status, needsHuman })
      setRows(data)
      const [peoplePack, targetPack] = await Promise.all([
        (async () => {
          const ids = [
            ...new Set(data.flatMap((row) => [row.reporter_id, row.target_user_id].filter(Boolean))),
          ]
          if (!ids.length) return {}
          const { data: people, error: peopleError } = await supabaseClient
            .from('profiles')
            .select('user_id,handle,display_name')
            .in('user_id', ids)
          if (peopleError) throw peopleError
          return Object.fromEntries((people || []).map((row) => [row.user_id, row]))
        })(),
        hydrateLoungeReportTargets(supabaseClient, data),
      ])
      setProfiles(peoplePack)
      setTargets(targetPack)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reports.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [filter, supabaseClient])

  useEffect(() => {
    void load()
  }, [load])

  const sessionUserId = async () => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession()
    return session?.user?.id
  }

  const runAction = async (row, action) => {
    const reviewerId = await sessionUserId()
    setBusyId(row.id)
    setError('')
    try {
      if (action === 'reviewing') {
        await updateLoungeReportStatus(supabaseClient, row.id, { status: 'reviewing', reviewerId })
      } else {
        await actionLoungeReport(supabaseClient, row, {
          action,
          reviewerId,
          note: notes[row.id] || '',
        })
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update report.')
    } finally {
      setBusyId('')
    }
  }

  const runTriage = async () => {
    setBusyId('triage')
    setError('')
    try {
      await requestLoungeReportTriageBatch(supabaseClient)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Triage failed.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <section
      data-lounge-mod-queue=""
      className={`rounded-2xl border border-zinc-800 bg-zinc-900 ${compact ? 'p-4' : 'p-4 lg:p-5'}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-white">Mod queue</div>
          <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">
            Human inbox for reports the bot elevated. New reports start pending. Spam can auto-dismiss.
            Sexual, illegal, impersonation, hate, and uncertain get elevated. Hide removes from Lounge.
            Delete is permanent.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-10 rounded-xl bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            onClick={() => void runTriage()}
            disabled={busyId === 'triage' || loading}
          >
            Run triage
          </button>
          <button
            type="button"
            className="min-h-10 rounded-xl bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
            onClick={() => void load()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`min-h-8 rounded-lg px-2.5 text-[11px] font-semibold ${
              filter === item.id ? 'bg-zinc-100 text-zinc-950' : 'bg-zinc-800 text-zinc-300'
            }`}
            onClick={() => setFilter(item.id)}
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
          const href = postHref(row, targets)
          const preview = targetPreview(row, targets)
          return (
            <article key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
                    {loungeReportReasonLabel(row.reason)}
                    <span className="ml-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                      {row.target_kind}
                    </span>
                    {row.needs_human ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                        human
                      </span>
                    ) : null}
                    {row.triage_status && row.triage_status !== 'pending' ? (
                      <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                        {row.triage_status}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {profileLabel(profiles[row.reporter_id])} reported {profileLabel(profiles[row.target_user_id])}
                  </div>
                  <p className="mt-1 line-clamp-4 text-xs text-zinc-200">{preview}</p>
                  {row.details ? <p className="mt-1 text-xs text-zinc-400">Reporter: {row.details}</p> : null}
                  {row.triage_reasons ? (
                    <p className="mt-1 text-[11px] text-zinc-500">Bot: {row.triage_reasons}</p>
                  ) : null}
                  <div className="mt-1 text-[11px] text-zinc-600">
                    {new Date(row.created_at).toLocaleString()} · {row.status}
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={notes[row.id] || ''}
                onChange={(event) => setNotes((cur) => ({ ...cur, [row.id]: event.target.value }))}
                placeholder="Optional note (shown on warn)"
                className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {href ? (
                  <a
                    href={href}
                    className="inline-flex min-h-8 items-center rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200"
                  >
                    Open
                  </a>
                ) : null}
                {row.status === 'open' ? (
                  <button
                    type="button"
                    className="min-h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void runAction(row, 'reviewing')}
                  >
                    Reviewing
                  </button>
                ) : null}
                {row.target_user_id ? (
                  <button
                    type="button"
                    className="min-h-8 rounded-lg bg-amber-900/70 px-2.5 text-[11px] font-semibold text-amber-100 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => void runAction(row, 'warn')}
                  >
                    Warn
                  </button>
                ) : null}
                {row.target_kind !== 'profile' ? (
                  <>
                    <button
                      type="button"
                      className="min-h-8 rounded-lg bg-rose-900/70 px-2.5 text-[11px] font-semibold text-rose-100 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => void runAction(row, 'hide')}
                    >
                      Hide
                    </button>
                    <button
                      type="button"
                      className="min-h-8 rounded-lg bg-rose-950 px-2.5 text-[11px] font-semibold text-rose-100 disabled:opacity-50"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Delete this permanently? This cannot be undone.')) {
                          void runAction(row, 'delete')
                        }
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  className="min-h-8 rounded-lg bg-zinc-800 px-2.5 text-[11px] font-semibold text-zinc-200 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void runAction(row, 'dismiss')}
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
