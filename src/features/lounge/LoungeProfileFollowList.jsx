import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge.jsx'
import LoungeOgBadge from './LoungeOgBadge.jsx'
import {
  LOUNGE_FEED_AVATAR_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  loungeFeedAuthorHasStaffBadge,
  loungeFeedAuthorIdentityClusterClass,
} from './loungeFeedAvatar.js'
import {
  fetchProfileFollowListProfiles,
  fetchUsersFollowingViewerAmong,
  fetchViewerFollowingAmong,
} from './loungeProfileFollowList.js'

function followListFocusRowId(userId) {
  const id = String(userId || '').trim()
  return id ? `lounge-follow-list-focus-${id}` : ''
}

function flashFollowListRow(userId) {
  const el = document.getElementById(followListFocusRowId(userId))
  if (!el) return
  el.classList.remove('lounge-focus-flash')
  requestAnimationFrame(() => {
    el.classList.add('lounge-focus-flash')
    window.setTimeout(() => el.classList.remove('lounge-focus-flash'), 1700)
  })
}

/**
 * @param {object} props
 * @param {'following' | 'followers'} props.tab
 * @param {(tab: 'following' | 'followers') => void} props.onTabChange
 * @param {string} props.profileUserId
 * @param {string} props.profileDisplayName
 * @param {string} props.viewerUserId
 * @param {import('@supabase/supabase-js').SupabaseClient} props.supabaseClient
 * @param {() => void} props.onClose
 * @param {(entity: { user_id: string, author_profile?: object }) => void} [props.onOpenProfile]
 * @param {(userId: string, isFollowing: boolean) => void} [props.onViewerFollowChange]
 * @param {string[]} [props.highlightUserIds] - scroll + flash rows (e.g. grouped follow notification).
 */
export default function LoungeProfileFollowList({
  tab,
  onTabChange,
  profileUserId,
  profileDisplayName,
  viewerUserId,
  supabaseClient,
  onClose,
  onOpenProfile,
  onViewerFollowChange,
  highlightUserIds = [],
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [viewerFollowing, setViewerFollowing] = useState(() => new Set())
  const [followsViewer, setFollowsViewer] = useState(() => new Set())
  const [rowBusyId, setRowBusyId] = useState('')
  const listScrollRef = useRef(null)
  const focusScrollRafRef = useRef(0)

  const highlightIdSet = useMemo(
    () => new Set((highlightUserIds || []).map(String).filter(Boolean)),
    [highlightUserIds],
  )

  const load = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const { profiles, error } = await fetchProfileFollowListProfiles(supabaseClient, profileUserId, tab)
      if (error) {
        setErr(error.message || 'Could not load list.')
        setRows([])
        return
      }
      setRows(profiles)
      const ids = profiles.map((p) => p.user_id).filter(Boolean)
      if (viewerUserId && ids.length > 0) {
        const [following, theyFollowViewer] = await Promise.all([
          fetchViewerFollowingAmong(supabaseClient, viewerUserId, ids),
          fetchUsersFollowingViewerAmong(supabaseClient, viewerUserId, ids),
        ])
        setViewerFollowing(following)
        setFollowsViewer(theyFollowViewer)
      } else {
        setViewerFollowing(new Set())
        setFollowsViewer(new Set())
      }
    } finally {
      setLoading(false)
    }
  }, [profileUserId, supabaseClient, tab, viewerUserId])

  useEffect(() => {
    void load()
  }, [load])

  const scrollToHighlightedFollowers = useCallback(() => {
    if (tab !== 'followers' || highlightIdSet.size === 0) return false
    const sc = listScrollRef.current
    if (!sc) return false

    const focusIds = rows
      .map((row) => String(row?.user_id || '').trim())
      .filter((uid) => uid && highlightIdSet.has(uid))
    if (focusIds.length === 0) return false

    const firstEl = document.getElementById(followListFocusRowId(focusIds[0]))
    if (!firstEl) return false

    const animate =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches !== true

    const HEADER_GAP = 12
    const computeTargetTop = () => {
      const scRect = sc.getBoundingClientRect()
      const elRect = firstEl.getBoundingClientRect()
      return Math.max(0, sc.scrollTop + (elRect.top - scRect.top) - HEADER_GAP)
    }

    const flashAll = () => {
      for (const uid of focusIds) flashFollowListRow(uid)
    }

    const landOnTarget = (behavior) => {
      sc.scrollTo({ top: computeTargetTop(), behavior })
      if (behavior === 'smooth') {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          flashAll()
        }
        sc.addEventListener('scrollend', finish, { once: true })
        window.setTimeout(finish, 650)
      } else {
        flashAll()
      }
    }

    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => landOnTarget('smooth'))
      })
    } else {
      landOnTarget('auto')
    }
    return true
  }, [highlightIdSet, rows, tab])

  useEffect(() => {
    if (tab !== 'followers' || loading || highlightIdSet.size === 0) return undefined
    if (focusScrollRafRef.current) {
      window.cancelAnimationFrame(focusScrollRafRef.current)
      focusScrollRafRef.current = 0
    }
    let triesLeft = 10
    const attempt = () => {
      focusScrollRafRef.current = 0
      if (scrollToHighlightedFollowers()) return
      if (triesLeft > 0) {
        triesLeft -= 1
        focusScrollRafRef.current = window.requestAnimationFrame(attempt)
      }
    }
    focusScrollRafRef.current = window.requestAnimationFrame(() => {
      focusScrollRafRef.current = window.requestAnimationFrame(attempt)
    })
    return () => {
      if (focusScrollRafRef.current) {
        window.cancelAnimationFrame(focusScrollRafRef.current)
        focusScrollRafRef.current = 0
      }
    }
  }, [highlightIdSet, loading, rows, scrollToHighlightedFollowers, tab])

  const toggleRowFollow = async (targetUserId) => {
    const target = String(targetUserId || '').trim()
    const viewer = String(viewerUserId || '').trim()
    if (!target || !viewer || target === viewer || rowBusyId) return
    setRowBusyId(target)
    try {
      if (viewerFollowing.has(target)) {
        await supabaseClient
          .from('profile_follows')
          .delete()
          .eq('follower_id', viewer)
          .eq('following_id', target)
        setViewerFollowing((prev) => {
          const next = new Set(prev)
          next.delete(target)
          return next
        })
        onViewerFollowChange?.(target, false)
      } else {
        await supabaseClient.from('profile_follows').insert({
          follower_id: viewer,
          following_id: target,
        })
        setViewerFollowing((prev) => new Set(prev).add(target))
        onViewerFollowChange?.(target, true)
      }
    } finally {
      setRowBusyId('')
    }
  }

  const titleName = String(profileDisplayName || 'Member').trim() || 'Member'

  const openRowProfile = (row) => {
    const uid = row?.user_id
    if (!uid) return
    onOpenProfile?.({
      user_id: uid,
      author_profile: row,
    })
  }

  return (
    <div
      className="absolute inset-0 z-30 flex min-h-0 flex-col bg-zinc-950"
      role="dialog"
      aria-modal="true"
      aria-label={tab === 'following' ? 'Following' : 'Followers'}
    >
      <header className="shrink-0 border-b border-zinc-800/90 bg-zinc-950/95 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to profile"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-zinc-100 touch-manipulation hover:bg-zinc-800/80 [-webkit-tap-highlight-color:transparent]"
          >
            <span className="text-2xl leading-none" aria-hidden>
              ←
            </span>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-[17px] font-bold text-white">{titleName}</div>
          </div>
          <div className="h-10 w-10 shrink-0" aria-hidden />
        </div>
        <div className="flex border-t border-zinc-800/80">
          {(['following', 'followers']).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              className={`relative min-h-11 flex-1 touch-manipulation text-[15px] font-semibold capitalize [-webkit-tap-highlight-color:transparent] ${
                tab === id ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {id}
              {tab === id ? (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-cyan-500" />
              ) : null}
            </button>
          ))}
        </div>
      </header>

      <div
        ref={listScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {loading ? (
          <div className="px-4 py-10 text-center text-[15px] text-zinc-500">Loading…</div>
        ) : err ? (
          <div className="m-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
            {err}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[15px] text-zinc-500">
            {tab === 'following' ? 'Not following anyone yet.' : 'No followers yet.'}
          </div>
        ) : (
          <ul className="list-none divide-y divide-zinc-800/70 p-0">
            {rows.map((row) => {
              const uid = row.user_id
              const displayName = String(row.display_name || row.handle || 'Member').trim() || 'Member'
              const handleLabel = row.handle ? `@${String(row.handle).trim()}` : '@member'
              const bio = String(row.about_me || row.bio || '').trim()
              const isSelf = viewerUserId && uid === viewerUserId
              const followingThem = viewerFollowing.has(uid)
              const hideFollowsYouOnOwnFollowers =
                tab === 'followers' &&
                viewerUserId &&
                profileUserId &&
                viewerUserId === profileUserId
              const showFollowsYouPill =
                viewerUserId &&
                !isSelf &&
                !hideFollowsYouOnOwnFollowers &&
                followsViewer.has(uid) &&
                !followingThem
              const showFollow = viewerUserId && !isSelf
              const focusRowId = highlightIdSet.has(String(uid)) ? followListFocusRowId(uid) : undefined

              return (
                <li key={uid}>
                  <div
                    id={focusRowId}
                    className="relative z-[1] px-1"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => openRowProfile(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openRowProfile(row)
                        }
                      }}
                      className="flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left touch-manipulation active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                      aria-label={`Open ${displayName} profile`}
                    >
                      <div
                        className={`${LOUNGE_FEED_AVATAR_CLASS} grid shrink-0 place-items-center`}
                        aria-hidden
                      >
                        {row.avatar_url ? (
                          <img
                            src={row.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        ) : (
                          <span
                            className={`font-bold text-white ${profileAvatarToneClass(
                              row.user_id || row.handle || 'member',
                            )}`}
                          >
                            {profileAvatarInitials(row.display_name, row.handle)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start gap-1.5 -translate-y-0.5">
                          {(() => {
                            const hasStaff = loungeFeedAuthorHasStaffBadge(row.role)
                            const showOg = row.is_og === true
                            return (
                              <>
                                <span className={loungeFeedAuthorIdentityClusterClass(hasStaff, showOg)}>
                                  <span className={`${LOUNGE_FEED_DISPLAY_NAME_CLASS} text-[15px]`}>{displayName}</span>
                                  {hasStaff ? (
                                    <span className={`shrink-0 ${String(row.role).trim().toLowerCase() === 'admin' ? '-translate-y-px' : '-translate-y-[2px]'}`}>
                                      <LoungeStaffRoleBadge role={row.role} />
                                    </span>
                                  ) : showOg ? (
                                    <span className="shrink-0 -translate-y-[3px]">
                                      <LoungeOgBadge isOg />
                                    </span>
                                  ) : null}
                                </span>
                                {hasStaff && showOg ? (
                                  <span className="shrink-0 -ml-0.5 -translate-y-[3px]">
                                    <LoungeOgBadge isOg />
                                  </span>
                                ) : null}
                              </>
                            )
                          })()}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2">
                          <span className={`${LOUNGE_FEED_META_HANDLE_TIME_CLASS} text-zinc-500`}>
                            {handleLabel}
                          </span>
                          {showFollowsYouPill ? (
                            <span className="rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                              Follows you
                            </span>
                          ) : null}
                        </div>
                        {bio ? (
                          <p className="mt-1 line-clamp-2 text-[14px] leading-snug text-zinc-400">{bio}</p>
                        ) : null}
                      </div>
                      {showFollow ? (
                        <button
                          type="button"
                          disabled={rowBusyId === uid}
                          onClick={(e) => {
                            e.stopPropagation()
                            void toggleRowFollow(uid)
                          }}
                          className={`mt-0.5 shrink-0 min-h-9 rounded-full px-4 text-[14px] font-bold touch-manipulation disabled:opacity-50 [-webkit-tap-highlight-color:transparent] ${
                            followingThem
                              ? 'border border-zinc-600 bg-zinc-900 text-zinc-100'
                              : 'bg-white text-zinc-950 hover:bg-zinc-200'
                          }`}
                        >
                          {followingThem ? 'Following' : 'Follow'}
                        </button>
                      ) : (
                        <div className="w-[5.5rem] shrink-0" aria-hidden />
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
