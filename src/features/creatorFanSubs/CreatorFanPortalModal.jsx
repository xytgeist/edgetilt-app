import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, X } from 'lucide-react'
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import {
  creatorFanSubscribersToCsv,
  fetchMyCreatorFanMonetization,
  fetchMyCreatorFanSubscriberStats,
  listMyCreatorFanSubscribers,
  refreshCreatorFanConnectStatus,
  saveCreatorFanMonetization,
  startCreatorFanConnectOnboarding,
} from './creatorFanSubsApi.js'
import { formatFanTierLabel } from './fanSubTiers.js'
import { fanSubBillingStatusLine } from './fanSubBillingDates.js'

function formatUsdFromCents(cents) {
  const n = Number(cents)
  if (!Number.isFinite(n)) return '$0'
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100)
}

function formatWhen(iso) {
  if (!iso) return '...'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '...'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   onOpenMonetizationSettings?: () => void,
 *   onViewSubscriber?: (userId: string) => void,
 * }} props
 */
export default function CreatorFanPortalModal({
  open,
  onClose,
  supabaseClient,
  onOpenMonetizationSettings,
  onViewSubscriber,
}) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState(null)
  const [monetization, setMonetization] = useState(null)
  const [subscribers, setSubscribers] = useState([])

  const reload = useCallback(async () => {
    if (!supabaseClient) {
      setLoading(false)
      return
    }
    setError('')
    try {
      const [statRow, monRow, subRows] = await Promise.all([
        fetchMyCreatorFanSubscriberStats(supabaseClient),
        fetchMyCreatorFanMonetization(supabaseClient),
        listMyCreatorFanSubscribers(supabaseClient, { search: search.trim(), limit: 200 }),
      ])
      setStats(statRow)
      setMonetization(monRow)
      setSubscribers(subRows)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load fan hub.')
    } finally {
      setLoading(false)
    }
  }, [search, supabaseClient])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void reload()
  }, [open, reload])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (ev) => {
      if (ev.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, busy])

  const tierKey = String(monetization?.fan_tier_key || stats?.fan_tier_key || '')
  const enabled = Boolean(stats?.enabled ?? monetization?.enabled)
  const connectComplete = Boolean(
    stats?.connect_onboarding_complete ?? monetization?.connect_onboarding_complete,
  )
  const activeCount = Number(stats?.active_count) || 0
  const pendingCancel = Number(stats?.pending_cancel_count) || 0
  const mrrCents = Number(stats?.estimated_mrr_cents) || 0

  const filteredSubs = useMemo(() => subscribers, [subscribers])

  const onToggleLive = async () => {
    if (!supabaseClient || busy || !tierKey) return
    setBusy(true)
    setError('')
    try {
      await saveCreatorFanMonetization(supabaseClient, tierKey, !enabled)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update fan subscriptions.')
    } finally {
      setBusy(false)
    }
  }

  const onConnect = async () => {
    if (!supabaseClient || busy) return
    setBusy(true)
    try {
      await startCreatorFanConnectOnboarding(supabaseClient)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed.')
      setBusy(false)
    }
  }

  const onRefreshConnect = async () => {
    if (!supabaseClient || busy) return
    setBusy(true)
    setError('')
    try {
      await refreshCreatorFanConnectStatus(supabaseClient)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect refresh failed.')
    } finally {
      setBusy(false)
    }
  }

  const onExportCsv = () => {
    const csv = creatorFanSubscribersToCsv(filteredSubs)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fan-subscribers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4 sm:pt-[max(1rem,max(env(safe-area-inset-top,0px),var(--edge-sat,0px)))] sm:pb-[max(1rem,max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]"
      style={{ zIndex: Z_APP_MODAL }}
      data-creator-fan-portal
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/75 backdrop-blur-[3px]"
        aria-label="Close fan hub"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="creator-fan-portal-title"
        className="relative flex h-[min(94dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px))-8px))] w-full max-w-[min(100%,40rem)] flex-col overflow-hidden rounded-t-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl sm:max-w-2xl sm:rounded-2xl lg:max-w-3xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800/90 px-4 py-3">
          <div>
            <h2 id="creator-fan-portal-title" className="text-lg font-bold text-white">
              Fan hub
            </h2>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              Subscribers, payouts, and fan subscription controls
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
          {loading ? (
            <p className="text-[13px] text-zinc-500">Loading…</p>
          ) : (
            <>
              <div className="shrink-0">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Active subs', value: String(activeCount) },
                  { label: 'Est. monthly', value: formatUsdFromCents(mrrCents) },
                  { label: 'Pending cancel', value: String(pendingCancel) },
                  {
                    label: 'Tier',
                    value: tierKey ? formatFanTierLabel(tierKey) : '...',
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-xl border border-zinc-800/80 bg-zinc-900/50 px-3 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {item.label}
                    </div>
                    <div className="mt-0.5 truncate text-sm font-bold tabular-nums text-white">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ${
                    enabled
                      ? 'bg-emerald-950/50 text-emerald-200 ring-emerald-500/35'
                      : 'bg-zinc-800/80 text-zinc-400 ring-zinc-600/50'
                  }`}
                >
                  {enabled ? 'Live' : 'Paused'}
                </span>
                {connectComplete ? (
                  <span className="text-[12px] text-emerald-300/90">Payouts ready</span>
                ) : (
                  <span className="text-[12px] text-amber-200/90">Finish Stripe Connect</span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onToggleLive()}
                  className="min-h-9 rounded-lg bg-orange-500/90 px-3 text-[12px] font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
                >
                  {enabled ? 'Pause fan subs' : 'Turn on fan subs'}
                </button>
                {onOpenMonetizationSettings ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onClose()
                      onOpenMonetizationSettings()
                    }}
                    className="min-h-9 rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Monetization settings
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void (connectComplete ? onRefreshConnect() : onConnect())}
                  className="min-h-9 rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  {connectComplete ? 'Refresh payouts' : 'Connect payouts'}
                </button>
                <button
                  type="button"
                  disabled={busy || filteredSubs.length === 0}
                  onClick={onExportCsv}
                  className="min-h-9 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 text-[12px] font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Export CSV
                </button>
              </div>

              <label className="mt-4 block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Search subscribers
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setLoading(true)
                      void reload()
                    }
                  }}
                  placeholder="Handle or name"
                  className="mt-1 w-full rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-3 py-2 text-[14px] text-zinc-100"
                />
              </label>
              <button
                type="button"
                disabled={loading || busy}
                onClick={() => {
                  setLoading(true)
                  void reload()
                }}
                className="mt-2 text-[12px] font-semibold text-cyan-300/90 hover:text-cyan-200 disabled:opacity-40"
              >
                Apply search
              </button>
              </div>

              <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 text-[12px] font-semibold uppercase tracking-wide text-zinc-500">
                  Subscribers ({filteredSubs.length})
                </div>
                {filteredSubs.length === 0 ? (
                  <p className="mt-2 shrink-0 text-[13px] leading-relaxed text-zinc-500">
                    No fan subscribers yet … share your profile and offer. New subs show up here and
                    in Alerts.
                  </p>
                ) : (
                  <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-y-contain pb-1 [-webkit-overflow-scrolling:touch]">
                    {filteredSubs.map((row) => {
                      const uid = String(row.subscriber_user_id || '')
                      const handle = String(row.handle || '').replace(/^@/, '')
                      const name = String(row.display_name || handle || 'Member')
                      const statusLine = fanSubBillingStatusLine({
                        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
                        currentPeriodEnd:
                          typeof row.current_period_end === 'string' ? row.current_period_end : null,
                      })
                      return (
                        <li
                          key={uid}
                          className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
                        >
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                            {row.avatar_url ? (
                              <img src={String(row.avatar_url)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <span
                                className={`grid h-full w-full place-items-center text-xs font-bold text-white ${profileAvatarToneClass(uid)}`}
                              >
                                {profileAvatarInitials(name, handle)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold text-zinc-100">{name}</div>
                            <div className="truncate text-[12px] text-zinc-500">
                              {handle ? `@${handle}` : uid.slice(0, 8)} ·{' '}
                              {formatFanTierLabel(String(row.fan_tier_key || ''))}
                            </div>
                            <div className="text-[11px] text-zinc-600">
                              Joined {formatWhen(row.subscribed_at)} · {statusLine}
                            </div>
                          </div>
                          {onViewSubscriber && uid ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                onClose()
                                onViewSubscriber(uid)
                              }}
                              className="shrink-0 rounded-lg border border-zinc-700/80 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
                            >
                              Profile
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
          {error ? <p className="mt-3 shrink-0 text-[12px] text-red-300/95">{error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
