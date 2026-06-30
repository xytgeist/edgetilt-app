import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import { fetchPlayLogGuestUsageCounts, fetchPlayLogPartnerPickerData } from './playLogApi.js'
import { playLogPartnerLabel } from './playLogPartners.js'
import {
  addSavedGuestLabel,
  loadSavedGuestLabels,
  mergeGuestLabelsForPicker,
  removeSavedGuestLabel,
} from './playLogSavedGuests.js'

const PANEL_HEIGHT_CLASS =
  'h-[min(88dvh,calc(100dvh-env(safe-area-inset-top,0px)-1rem))]'

/** @param {Array<{ user_id?: string, handle?: string, display_name?: string }>} rows @param {string} query */
function filterPartnerProfiles(rows, query) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  if (!q) return rows
  return rows.filter(profile => {
    const name = String(profile?.display_name || '').toLowerCase()
    const handle = String(profile?.handle || '')
      .toLowerCase()
      .replace(/^@/, '')
    return name.includes(q) || handle.includes(q)
  })
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   userId: string,
 *   usedUserIds: Set<string>,
 *   usedGuestLabels?: Set<string>,
 *   onConfirm: (payload: { profiles: object[], guestLabels: string[] }) => void,
 * }} props
 */
export default function PlayLogPartnerPickerModal({
  open,
  onClose,
  supabaseClient,
  userId,
  usedUserIds,
  usedGuestLabels = new Set(),
  onConfirm,
}) {
  const [search, setSearch] = useState('')
  /** @type {[object[], Function]} */
  const [stagedProfiles, setStagedProfiles] = useState([])
  const [stagedGuests, setStagedGuests] = useState([])
  const [candidates, setCandidates] = useState([])
  const [viewerFollowingIds, setViewerFollowingIds] = useState(() => new Set())
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [followBusyId, setFollowBusyId] = useState('')
  /** @type {[Array<{ label: string, count: number }>, Function]} */
  const [savedGuests, setSavedGuests] = useState([])
  const searchRef = useRef(null)

  const stagedUserIds = useMemo(
    () => new Set(stagedProfiles.map(p => String(p.user_id || '').trim()).filter(Boolean)),
    [stagedProfiles],
  )

  const stagedCount = stagedProfiles.length + stagedGuests.length

  const refreshSavedGuests = useCallback(async () => {
    if (!userId) {
      setSavedGuests([])
      return
    }
    const saved = loadSavedGuestLabels(userId)
    try {
      const usage = await fetchPlayLogGuestUsageCounts(supabaseClient)
      setSavedGuests(mergeGuestLabelsForPicker(saved, usage))
    } catch {
      setSavedGuests(mergeGuestLabelsForPicker(saved, new Map()))
    }
  }, [supabaseClient, userId])

  const load = useCallback(async () => {
    if (!userId) {
      setCandidates([])
      setViewerFollowingIds(new Set())
      setSavedGuests([])
      return
    }
    setLoading(true)
    setErr('')
    try {
      const [data] = await Promise.all([
        fetchPlayLogPartnerPickerData(supabaseClient, userId),
        refreshSavedGuests(),
      ])
      if (data.error) {
        setErr(data.error)
        setCandidates([])
        setViewerFollowingIds(new Set())
        return
      }
      setCandidates(data.candidates)
      setViewerFollowingIds(data.viewerFollowingIds)
    } catch (e) {
      setCandidates([])
      setViewerFollowingIds(new Set())
      setErr(e?.message || 'Could not load partners.')
    } finally {
      setLoading(false)
    }
  }, [supabaseClient, userId, refreshSavedGuests])

  useEffect(() => {
    if (!open) {
      setSearch('')
      setStagedProfiles([])
      setStagedGuests([])
      return
    }
    setStagedProfiles([])
    setStagedGuests([])
    void load()
    const t = window.setTimeout(() => searchRef.current?.focus(), 120)
    return () => window.clearTimeout(t)
  }, [open, load])

  const addProfileToStaged = profile => {
    const uid = String(profile?.user_id || '').trim()
    if (!uid || usedUserIds.has(uid) || stagedUserIds.has(uid)) return
    setStagedProfiles(prev => [...prev, profile])
  }

  const removeStagedProfile = uid => {
    const id = String(uid || '').trim()
    setStagedProfiles(prev => prev.filter(p => String(p.user_id) !== id))
  }

  const searchTrimmed = search.trim()

  const guestProposalStaged = useMemo(() => {
    if (!searchTrimmed) return false
    const key = searchTrimmed.toLowerCase()
    return stagedGuests.some(g => g.toLowerCase() === key) || usedGuestLabels.has(key)
  }, [searchTrimmed, stagedGuests, usedGuestLabels])

  const filteredSavedGuests = useMemo(() => {
    const q = searchTrimmed.toLowerCase()
    if (!q) return savedGuests
    return savedGuests.filter(g => g.label.toLowerCase().includes(q))
  }, [savedGuests, searchTrimmed])

  const addGuestToStaged = label => {
    const trimmed = String(label || '').trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (stagedGuests.some(g => g.toLowerCase() === key)) return
    if (usedGuestLabels.has(key)) return
    setStagedGuests(prev => [...prev, trimmed])
    addSavedGuestLabel(userId, trimmed)
    void refreshSavedGuests()
    if (trimmed === searchTrimmed) setSearch('')
  }

  const removeSavedGuestFromList = label => {
    removeSavedGuestLabel(userId, label)
    const key = String(label || '').trim().toLowerCase()
    setSavedGuests(prev => prev.filter(g => g.label.toLowerCase() !== key))
    setStagedGuests(prev => prev.filter(g => g.toLowerCase() !== key))
  }

  const removeStagedGuest = index => {
    setStagedGuests(prev => prev.filter((_, i) => i !== index))
  }

  const finish = () => {
    if (stagedCount === 0) return
    onConfirm({ profiles: stagedProfiles, guestLabels: stagedGuests })
    onClose()
  }

  const followUser = async targetUserId => {
    const target = String(targetUserId || '').trim()
    const viewer = String(userId || '').trim()
    if (!target || !viewer || target === viewer || followBusyId) return
    if (viewerFollowingIds.has(target)) return
    setFollowBusyId(target)
    try {
      const { error } = await supabaseClient.from('profile_follows').insert({
        follower_id: viewer,
        following_id: target,
      })
      if (error) throw error
      setViewerFollowingIds(prev => new Set(prev).add(target))
    } catch (e) {
      setErr(e?.message || 'Could not follow.')
    } finally {
      setFollowBusyId('')
    }
  }

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filteredRows = useMemo(
    () => filterPartnerProfiles(candidates, search),
    [candidates, search],
  )

  const showSavedGuestsSection = filteredSavedGuests.length > 0
  const showNetworkSection =
    !loading && (filteredRows.length > 0 || (!searchTrimmed && candidates.length > 0))

  if (!open) return null

  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      style={{ zIndex: Z_APP_ALERT }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="play-log-partner-picker-title"
      onClick={onClose}
    >
      <div
        className={`flex w-full max-w-lg ${PANEL_HEIGHT_CLASS} shrink-0 flex-col rounded-t-3xl border border-zinc-700/60 border-b-0 bg-zinc-900 shadow-2xl`}
        onClick={e => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-zinc-800/80 px-4 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-3">
            <h2
              id="play-log-partner-picker-title"
              className="min-w-0 flex-1 text-base font-bold text-white"
            >
              Add partner
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-400 touch-manipulation active:bg-zinc-800 active:text-white"
            >
              Cancel
            </button>
          </div>

          {stagedCount > 0 ? (
            <div className="mb-3">
              <p className="text-zinc-500 text-[11px] font-semibold uppercase tracking-wide mb-2">
                Adding to this play
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {stagedProfiles.map(profile => {
                  const uid = String(profile.user_id)
                  return (
                    <li key={`user:${uid}`}>
                      <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-cyan-600/15 border border-cyan-500/30 pl-2.5 pr-1 py-1 text-xs font-semibold text-cyan-200">
                        <span className="truncate">{playLogPartnerLabel(profile)}</span>
                        <button
                          type="button"
                          onClick={() => removeStagedProfile(uid)}
                          className="shrink-0 rounded-md px-1 text-cyan-300/80 touch-manipulation active:text-white"
                          aria-label={`Remove ${playLogPartnerLabel(profile)}`}
                        >
                          ×
                        </button>
                      </span>
                    </li>
                  )
                })}
                {stagedGuests.map((label, i) => (
                  <li key={`guest:${i}:${label}`}>
                    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-zinc-800 border border-zinc-600/60 pl-2.5 pr-1 py-1 text-xs font-semibold text-zinc-200">
                      <span className="truncate">{label}</span>
                      <span className="text-zinc-500 text-[10px] font-medium shrink-0">guest</span>
                      <button
                        type="button"
                        onClick={() => removeStagedGuest(i)}
                        className="shrink-0 rounded-md px-1 text-zinc-400 touch-manipulation active:text-white"
                        aria-label={`Remove guest ${label}`}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <label className="sr-only" htmlFor="play-log-partner-search">
            Search followers and following, or type a guest name
          </label>
          <input
            id="play-log-partner-search"
            ref={searchRef}
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search or type a guest name"
            autoComplete="off"
            enterKeyHint="done"
            className="w-full min-h-11 rounded-xl bg-zinc-950 border border-zinc-700/60 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
            onKeyDown={e => {
              if (e.key === 'Enter' && searchTrimmed && !guestProposalStaged) {
                e.preventDefault()
                addGuestToStaged(searchTrimmed)
              }
            }}
          />

          {searchTrimmed ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-950 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-100">{searchTrimmed}</p>
                <p className="text-zinc-500 text-xs mt-0.5">Guest (not on app)</p>
              </div>
              {guestProposalStaged ? (
                <span className="shrink-0 text-xs font-semibold text-cyan-400/90">Added</span>
              ) : (
                <button
                  type="button"
                  onClick={() => addGuestToStaged(searchTrimmed)}
                  className="shrink-0 min-h-9 rounded-full bg-cyan-600/20 border border-cyan-500/40 px-4 text-xs font-bold text-cyan-300 touch-manipulation active:bg-cyan-600/30"
                >
                  Add guest
                </button>
              )}
            </div>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 pb-2">
          {loading ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center">
              <p className="text-zinc-500 text-sm text-center">Loading…</p>
            </div>
          ) : err && candidates.length === 0 && savedGuests.length === 0 ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-2">
              <p className="text-red-400 text-sm text-center">{err}</p>
            </div>
          ) : !showSavedGuestsSection && filteredRows.length === 0 ? (
            <div className="flex h-full min-h-[12rem] items-center justify-center px-2">
              <p className="text-zinc-500 text-sm text-center">
                {searchTrimmed
                  ? 'No matches in your network.'
                  : 'No followers or following yet - type a name to add a guest.'}
              </p>
            </div>
          ) : (
            <>
              {showSavedGuestsSection ? (
                <div className="pt-1 pb-2">
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Guests
                  </p>
                  <ul className="divide-y divide-zinc-800/70">
                    {filteredSavedGuests.map(guest => {
                      const key = guest.label.toLowerCase()
                      const onPlay = usedGuestLabels.has(key)
                      const picked = stagedGuests.some(l => l.toLowerCase() === key)
                      const disabled = onPlay || picked
                      return (
                        <li key={`saved-guest:${key}`}>
                          <div className="flex items-center gap-1 rounded-xl px-2 py-1">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => addGuestToStaged(guest.label)}
                              className={`min-w-0 flex-1 rounded-xl px-1 py-2 text-left touch-manipulation ${
                                disabled ? 'cursor-default opacity-50' : 'active:bg-zinc-800/80'
                              }`}
                            >
                              <span className="text-sm font-medium text-zinc-100">{guest.label}</span>
                              <span className="block text-zinc-500 text-xs mt-0.5">
                                {onPlay
                                  ? 'Already on this play'
                                  : picked
                                    ? 'Added'
                                    : 'Guest · tap to add'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSavedGuestFromList(guest.label)}
                              className="shrink-0 px-2 py-2 text-zinc-500 text-sm font-semibold touch-manipulation active:text-red-400"
                              aria-label={`Remove ${guest.label} from guest list`}
                            >
                              ×
                            </button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {showNetworkSection && filteredRows.length > 0 ? (
                <div className={showSavedGuestsSection ? 'pt-2 border-t border-zinc-800/80' : 'pt-1'}>
                  <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Your network
                  </p>
                  <ul className="divide-y divide-zinc-800/70">
                    {filteredRows.map(profile => {
                const uid = String(profile.user_id)
                const onPlayAlready = usedUserIds.has(uid)
                const picked = stagedUserIds.has(uid)
                const disabled = onPlayAlready || picked
                const followingThem = viewerFollowingIds.has(uid)
                const showFollow = !followingThem && !disabled
                return (
                  <li key={uid}>
                    <div
                      className={`flex items-start gap-2 rounded-xl px-2 py-1 ${
                        onPlayAlready ? 'opacity-40' : ''
                      }`}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => addProfileToStaged(profile)}
                        className={`min-w-0 flex-1 flex items-start gap-2 rounded-xl px-1 py-2 text-left touch-manipulation ${
                          disabled
                            ? 'cursor-default'
                            : 'active:bg-zinc-800/80 cursor-pointer'
                        }`}
                      >
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="text-zinc-100 font-medium">{playLogPartnerLabel(profile)}</span>
                          {profile.handle ? (
                            <span className="block text-zinc-500 text-xs mt-0.5">
                              @{String(profile.handle).trim().replace(/^@/, '')}
                            </span>
                          ) : null}
                          {onPlayAlready ? (
                            <span className="block text-zinc-500 text-xs mt-0.5">Already on this play</span>
                          ) : picked ? (
                            <span className="block text-cyan-400/90 text-xs mt-0.5">Added</span>
                          ) : showFollow ? (
                            <span className="block text-zinc-500 text-xs mt-0.5">Follows you · tap to add</span>
                          ) : (
                            <span className="block text-zinc-500 text-xs mt-0.5">Tap to add</span>
                          )}
                        </span>
                      </button>
                      {showFollow ? (
                        <button
                          type="button"
                          disabled={followBusyId === uid}
                          onClick={e => {
                            e.stopPropagation()
                            void followUser(uid)
                          }}
                          className="mt-2 shrink-0 min-h-9 rounded-full bg-white px-4 text-[13px] font-bold text-zinc-950 touch-manipulation active:bg-zinc-200 disabled:opacity-50"
                        >
                          {followBusyId === uid ? '…' : 'Follow'}
                        </button>
                      ) : (
                        <div className="w-[4.75rem] shrink-0" aria-hidden />
                      )}
                    </div>
                  </li>
                )
              })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </div>

        {err && candidates.length > 0 ? (
          <p className="shrink-0 px-4 pb-1 text-center text-xs text-red-400">{err}</p>
        ) : null}

        <footer className="shrink-0 border-t border-zinc-800/80 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={finish}
            disabled={stagedCount === 0 || loading}
            className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:bg-cyan-700 disabled:opacity-40"
          >
            {stagedCount === 0
              ? 'Done'
              : stagedCount === 1
                ? 'Done · 1 partner'
                : `Done · ${stagedCount} partners`}
          </button>
        </footer>
      </div>
    </div>
  )
}
