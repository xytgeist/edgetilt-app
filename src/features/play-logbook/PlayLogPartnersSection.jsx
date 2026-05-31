import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPlayLogPartnerCandidates } from './playLogApi.js'
import {
  defaultCreatorPartnerRow,
  formatPlayLogPartnerOutcomeShare,
  playLogPartnerLabel,
  playLogPartnerOutcomeShareToneClass,
  playLogPartnerOutcomeShareUsd,
  playLogPartnersPercentSum,
} from './playLogPartners.js'

/**
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   userId: string,
 *   viewerProfile?: { handle?: string, display_name?: string } | null,
 *   partners: import('./playLogPartners.js').PlayLogPartnerRow[],
 *   onPartnersChange: (rows: import('./playLogPartners.js').PlayLogPartnerRow[]) => void,
 *   readOnly?: boolean,
 *   netOutcome?: number | null,
 * }} props
 */
export default function PlayLogPartnersSection({
  supabaseClient,
  userId,
  viewerProfile,
  partners,
  onPartnersChange,
  readOnly = false,
  netOutcome = null,
}) {
  const [candidates, setCandidates] = useState([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [candidateErr, setCandidateErr] = useState('')

  const percentSum = useMemo(() => playLogPartnersPercentSum(partners), [partners])
  const sumOk = Math.abs(percentSum - 100) < 0.02

  const usedUserIds = useMemo(
    () => new Set(partners.filter(p => p.kind === 'user').map(p => String(p.userId))),
    [partners],
  )

  const loadCandidates = useCallback(async () => {
    if (!userId) {
      setCandidates([])
      return
    }
    setLoadingCandidates(true)
    setCandidateErr('')
    try {
      const rows = await fetchPlayLogPartnerCandidates(supabaseClient, userId)
      setCandidates(rows)
    } catch (e) {
      setCandidates([])
      setCandidateErr(e?.message || 'Could not load partners.')
    } finally {
      setLoadingCandidates(false)
    }
  }, [supabaseClient, userId])

  useEffect(() => {
    if (readOnly || partners.length > 1) return
    if (partners.length === 0 && userId) {
      onPartnersChange([defaultCreatorPartnerRow(userId, viewerProfile)])
    }
  }, [partners.length, readOnly, userId, viewerProfile, onPartnersChange])

  useEffect(() => {
    if (readOnly || !userId) return
    void loadCandidates()
  }, [readOnly, userId, loadCandidates])

  useEffect(() => {
    if (pickerOpen && userId) void loadCandidates()
  }, [pickerOpen, userId, loadCandidates])

  const updateRow = (key, patch) => {
    onPartnersChange(partners.map(row => (row.key === key ? { ...row, ...patch } : row)))
  }

  const removeRow = key => {
    const next = partners.filter(row => row.key !== key)
    if (next.length === 0 && userId) {
      onPartnersChange([defaultCreatorPartnerRow(userId, viewerProfile)])
    } else {
      onPartnersChange(next)
    }
  }

  const addUserPartner = profile => {
    const uid = String(profile?.user_id || '').trim()
    if (!uid || usedUserIds.has(uid)) return
    onPartnersChange([
      ...partners,
      {
        key: `user:${uid}`,
        kind: 'user',
        userId: uid,
        handle: profile?.handle || '',
        displayName: profile?.display_name || '',
        avatarUrl: profile?.avatar_url || '',
        sharePercent: '',
      },
    ])
    setPickerOpen(false)
  }

  const addGuestPartner = () => {
    const label = guestName.trim()
    if (!label) return
    const key = `guest:${Date.now()}`
    onPartnersChange([
      ...partners,
      { key, kind: 'guest', guestLabel: label, sharePercent: '' },
    ])
    setGuestName('')
  }

  if (readOnly) {
    return (
      <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-3">
        <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide mb-2">Partners</div>
        <ul className="space-y-1.5">
          {partners.map(row => (
            <li key={row.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-200 truncate">
                {row.kind === 'guest'
                  ? row.guestLabel
                  : playLogPartnerLabel({ display_name: row.displayName, handle: row.handle })}
                {row.kind === 'user' && String(row.userId) === String(userId) ? (
                  <span className="text-zinc-500"> (you)</span>
                ) : null}
              </span>
              <span className="shrink-0 text-cyan-300 font-semibold tabular-nums text-sm">
                {row.sharePercent}%
                <PartnerShareParenthetical netOutcome={netOutcome} sharePercent={row.sharePercent} />
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-zinc-800/50 border border-zinc-700/50 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Partners</div>
        <span
          className={`text-xs font-semibold tabular-nums ${sumOk ? 'text-emerald-400' : 'text-amber-400'}`}
        >
          Total: {percentSum.toFixed(1)}%
        </span>
      </div>

      <ul className="space-y-2 mb-3">
        {partners.map(row => (
          <li key={row.key} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-sm text-zinc-200 truncate">
              {row.kind === 'guest' ? (
                <span>{row.guestLabel}</span>
              ) : (
                <span>
                  {playLogPartnerLabel({ display_name: row.displayName, handle: row.handle })}
                  {String(row.userId) === String(userId) ? (
                    <span className="text-zinc-500"> (you)</span>
                  ) : null}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 min-w-0">
                <input
                  type="text"
                  inputMode="decimal"
                  value={row.sharePercent}
                  onChange={e => updateRow(row.key, { sharePercent: e.target.value })}
                  placeholder="%"
                  className="w-14 min-h-9 rounded-xl bg-zinc-900 px-2 text-center text-sm text-white font-semibold tabular-nums outline-none focus:ring-2 focus:ring-cyan-500/40"
                  aria-label="Share percent"
                />
                <span className="text-zinc-500 text-xs font-semibold tabular-nums whitespace-nowrap">
                  %
                  <PartnerShareParenthetical netOutcome={netOutcome} sharePercent={row.sharePercent} />
                </span>
              </div>
              {partners.length > 1 || row.kind !== 'user' || String(row.userId) !== String(userId) ? (
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-zinc-500 text-xs font-semibold px-2 py-1 touch-manipulation active:text-red-400"
                  aria-label="Remove partner"
                >
                  ×
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          onClick={() => setPickerOpen(v => !v)}
          className="rounded-xl bg-zinc-900 border border-zinc-700/60 px-3 py-2 text-xs font-semibold text-cyan-300 touch-manipulation active:bg-zinc-800"
        >
          + Add follower / following
        </button>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={guestName}
          onChange={e => setGuestName(e.target.value)}
          placeholder="Guest name (not on app)"
          className="min-w-0 flex-1 min-h-9 rounded-xl bg-zinc-900 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
        />
        <button
          type="button"
          onClick={addGuestPartner}
          disabled={!guestName.trim()}
          className="shrink-0 rounded-xl bg-zinc-900 border border-zinc-700/60 px-3 py-2 text-xs font-semibold text-cyan-300 touch-manipulation active:bg-zinc-800 disabled:opacity-40"
        >
          + Guest
        </button>
      </div>

      {pickerOpen ? (
        <div className="rounded-xl bg-zinc-900 border border-zinc-700/60 p-2 max-h-48 overflow-y-auto">
          {loadingCandidates ? (
            <p className="text-zinc-500 text-xs py-2 text-center">Loading…</p>
          ) : candidateErr ? (
            <p className="text-red-400 text-xs py-2">{candidateErr}</p>
          ) : candidates.length === 0 ? (
            <p className="text-zinc-500 text-xs py-2 text-center">No followers or following yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {candidates.map(profile => {
                const uid = String(profile.user_id)
                const picked = usedUserIds.has(uid)
                return (
                  <li key={uid}>
                    <button
                      type="button"
                      disabled={picked}
                      onClick={() => addUserPartner(profile)}
                      className="w-full text-left rounded-lg px-2 py-2 text-sm touch-manipulation active:bg-zinc-800 disabled:opacity-40"
                    >
                      <span className="text-zinc-200">{playLogPartnerLabel(profile)}</span>
                      {picked ? <span className="text-zinc-500 text-xs ml-1">added</span> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : null}

      <p className="text-zinc-500 text-xs leading-snug mt-1">
        Registered partners get this play in their logbook and a Lounge alert. Guests are attribution only.
        {netOutcome != null && Number.isFinite(netOutcome) ? (
          <> Dollar share is each partner&apos;s % of session net win/loss.</>
        ) : null}
      </p>
    </div>
  )
}

/** @param {{ netOutcome: number | null, sharePercent: string }} props */
function PartnerShareParenthetical({ netOutcome, sharePercent }) {
  const usd = playLogPartnerOutcomeShareUsd(netOutcome, sharePercent)
  const label = formatPlayLogPartnerOutcomeShare(netOutcome, sharePercent)
  if (!label) return null
  return (
    <span
      className={`font-bold ${playLogPartnerOutcomeShareToneClass(usd)}`}
      title="Share of session net win/loss"
    >
      {` (${label})`}
    </span>
  )
}
