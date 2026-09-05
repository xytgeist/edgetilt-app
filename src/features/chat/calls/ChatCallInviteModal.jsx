import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchProfileFollowListProfiles } from '../../lounge/loungeProfileFollowList.js'
import { chatInviteToCall } from '../../../utils/chatCallsApi.js'
import { dismissEdgeCallKeyboard } from '../../../utils/edgeCallKit.js'

/**
 * @param {string} query
 * @param {{ display_name?: string, handle?: string }} profile
 */
function profileMatchesQuery(query, profile) {
  const q = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
  if (!q) return true
  const name = String(profile?.display_name || '').toLowerCase()
  const handle = String(profile?.handle || '')
    .toLowerCase()
    .replace(/^@/, '')
  return name.includes(q) || handle.includes(q)
}

/**
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   callId: string,
 *   viewerUserId: string,
 *   excludeUserIds?: Iterable<string>,
 *   onInvited?: (result: { userId: string, name: string, promoted?: boolean, roomId?: string, call?: object }) => void,
 * }} props
 */
export default function ChatCallInviteModal({
  open,
  onClose,
  supabaseClient,
  callId,
  viewerUserId,
  excludeUserIds = [],
  onInvited,
}) {
  const exclude = useMemo(() => {
    const set = new Set(
      [...(excludeUserIds || [])].map((id) => String(id || '').trim()).filter(Boolean),
    )
    if (viewerUserId) set.add(viewerUserId)
    return set
  }, [excludeUserIds, viewerUserId])

  const [search, setSearch] = useState('')
  const [following, setFollowing] = useState(/** @type {object[]} */ ([]))
  const [followers, setFollowers] = useState(/** @type {object[]} */ ([]))
  const [searchHits, setSearchHits] = useState(/** @type {object[]} */ ([]))
  const [loading, setLoading] = useState(false)
  const [invitingId, setInvitingId] = useState(/** @type {string | null} */ (null))
  const [error, setError] = useState('')
  const listsReadyRef = useRef(false)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSearchHits([])
      setError('')
      setInvitingId(null)
      return undefined
    }
    dismissEdgeCallKeyboard()
    let cancelled = false
    if (!listsReadyRef.current) setLoading(true)
    void (async () => {
      try {
        const [followingRes, followersRes] = await Promise.all([
          fetchProfileFollowListProfiles(supabaseClient, viewerUserId, 'following'),
          fetchProfileFollowListProfiles(supabaseClient, viewerUserId, 'followers'),
        ])
        if (cancelled) return
        if (followingRes.error) throw followingRes.error
        if (followersRes.error) throw followersRes.error
        setFollowing(followingRes.profiles || [])
        setFollowers(followersRes.profiles || [])
        listsReadyRef.current = true
      } catch (ex) {
        if (!cancelled) setError(ex?.message || 'Could not load people.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, supabaseClient, viewerUserId])

  useEffect(() => {
    if (!open) return undefined
    const raw = search.trim().replace(/^@/, '')
    if (raw.length < 2) {
      setSearchHits([])
      return undefined
    }
    const safe = raw.replace(/[%(),]/g, '').slice(0, 40)
    if (!safe) {
      setSearchHits([])
      return undefined
    }
    let cancelled = false
    const t = window.setTimeout(async () => {
      const { data } = await supabaseClient
        .from('profiles')
        .select('user_id, handle, display_name, avatar_url')
        .or(`handle.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(16)
      if (cancelled) return
      setSearchHits((data || []).filter((p) => p?.user_id && !exclude.has(p.user_id)))
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, search, supabaseClient, exclude])

  const followingIds = useMemo(() => new Set(following.map((p) => p.user_id)), [following])
  const filteredFollowing = useMemo(
    () => following.filter((p) => p?.user_id && !exclude.has(p.user_id) && profileMatchesQuery(search, p)),
    [following, search, exclude],
  )
  const filteredFollowers = useMemo(
    () =>
      followers.filter(
        (p) =>
          p?.user_id &&
          !exclude.has(p.user_id) &&
          profileMatchesQuery(search, p) &&
          !followingIds.has(p.user_id),
      ),
    [followers, followingIds, search, exclude],
  )
  const extraSearch = useMemo(() => {
    const known = new Set([...followingIds, ...followers.map((p) => p.user_id)])
    return searchHits.filter((p) => !known.has(p.user_id))
  }, [followers, followingIds, searchHits])

  const invite = async (profile) => {
    const id = String(profile?.user_id || '').trim()
    if (!id || invitingId) return
    setInvitingId(id)
    setError('')
    try {
      const result = await chatInviteToCall(supabaseClient, callId, id)
      const name = String(profile.display_name || profile.handle || 'them').trim()
      onInvited?.({
        userId: id,
        name,
        promoted: Boolean(result?.promoted),
        roomId: result?.room_id ? String(result.room_id) : undefined,
        call: result?.call || null,
      })
      onClose()
    } catch (ex) {
      setError(ex?.message || 'Could not send the invite.')
    } finally {
      setInvitingId(null)
    }
  }

  if (!open || typeof document === 'undefined') return null

  const renderRow = (profile) => {
    const id = profile.user_id
    const label = profile.display_name || profile.handle || 'Member'
    const busy = invitingId === id
    return (
      <button
        key={id}
        type="button"
        data-chat-call-interactive=""
        disabled={Boolean(invitingId)}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left touch-manipulation active:bg-white/10 disabled:opacity-50"
        onClick={() => void invite(profile)}
      >
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-700 text-[15px] font-bold text-zinc-200">
            {String(label)[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{label}</p>
          {profile.handle ? (
            <p className="truncate text-[12px] text-zinc-400">@{String(profile.handle).replace(/^@/, '')}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-[13px] font-semibold text-cyan-300">
          {busy ? 'Inviting…' : 'Invite'}
        </span>
      </button>
    )
  }

  return createPortal(
    <div
      data-chat-call-interactive=""
      data-call-invite-modal=""
      className="fixed inset-0 z-[132] flex items-end justify-center bg-black/65 px-3 pb-[max(1rem,env(safe-area-inset-bottom,0px),env(keyboard-inset-height,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex h-[min(36rem,calc(100dvh-2.75rem))] w-full max-w-md shrink-0 flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#121214] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-[18px] font-bold tracking-tight text-white">Add people</h2>
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-[14px] font-semibold text-zinc-300 touch-manipulation active:bg-white/10"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className="shrink-0 px-5 pb-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or handle…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="w-full rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-[15px] text-white placeholder:text-zinc-500 focus:border-cyan-500/50 focus:outline-none"
          />
        </div>
        {error ? (
          <p className="shrink-0 px-5 pb-2 text-[13px] font-medium text-rose-300">{error}</p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5">
          {loading ? (
            <p className="px-2 py-6 text-center text-[13px] text-zinc-400">Loading people…</p>
          ) : null}
          {!loading && extraSearch.length > 0 ? (
            <section className="mb-3">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Search</p>
              {extraSearch.map(renderRow)}
            </section>
          ) : null}
          {!loading ? (
            <section className="mb-3">
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Following</p>
              {filteredFollowing.length > 0 ? (
                filteredFollowing.map(renderRow)
              ) : (
                <p className="px-2 py-2 text-[13px] text-zinc-500">
                  {search.trim() ? 'No following matches.' : 'You are not following anyone yet.'}
                </p>
              )}
            </section>
          ) : null}
          {!loading ? (
            <section>
              <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">Followers</p>
              {filteredFollowers.length > 0 ? (
                filteredFollowers.map(renderRow)
              ) : (
                <p className="px-2 py-2 text-[13px] text-zinc-500">
                  {search.trim() ? 'No follower matches.' : 'No other followers to invite.'}
                </p>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
