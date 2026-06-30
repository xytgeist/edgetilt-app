import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeNotificationActionBadge from './LoungeNotificationActionBadge.jsx'
import LoungeNotificationActorStack from './LoungeNotificationActorStack.jsx'
import LoungeNotificationInteractionBar from './LoungeNotificationInteractionBar.jsx'
import LoungePullRefreshZone from './LoungePullRefreshZone.jsx'
import { useLoungePullToRefresh } from './useLoungePullToRefresh.js'
import {
  LOUNGE_FEED_CAPTION_TEXT_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
  LOUNGE_FEED_POST_ROW_CLASS,
  LOUNGE_FEED_POST_ROW_INNER_CLASS,
  LOUNGE_NOTIFICATION_AUTHOR_AVATAR_CLASS,
  LOUNGE_NOTIFICATION_GROUPED_TINT_RAIL_CLASS,
} from './loungeFeedAvatar.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate.js'
import {
  formatLoungeActivityWhen,
  isLoungeActivitySchemaMissingError,
  loungeActivityActionPhrase,
  loungeActivityEventsPage,
  loungeActivityMarkAllRead,
  loungeActivityMarkPushOpened,
  loungeActivityPlainPostRepostEvent,
  resolveLoungeActivityOpenPostTarget,
  loungeActivitySummary,
  loungeActivityUnreadCount,
  LOUNGE_ACTIVITY_EVENT_TYPES,
  LOUNGE_ACTIVITY_PAGE_SIZE,
} from '../../utils/loungeActivityApi.js'
import {
  hydrateLoungeActivityEventPreviews,
  loungeActivityShowsContextPreview,
} from '../../utils/loungeActivityPreview.js'
import {
  buildLoungeActivityDisplayRows,
  loungeActivityEventToActorProfile,
  loungeActivityGroupedActionPhrase,
} from '../../utils/loungeActivityGroup.js'
import {
  fetchLoungeActivityInteractionCountRows,
  loungeActivityInteractionBarKind,
  loungeActivityInteractionEntityFromRow,
} from '../../utils/loungeActivityInteraction.js'
import { renderRichCaption } from './loungeCaption'

function NotificationSettingsGearIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
      />
      <path
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
      />
    </svg>
  )
}

function loungeNotificationIsNew(sessionNewIds, idOrIds) {
  if (Array.isArray(idOrIds)) {
    return idOrIds.some((id) => sessionNewIds.has(String(id)))
  }
  return sessionNewIds.has(String(idOrIds))
}

function LoungeNotificationNewRail() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-2 left-0 z-[2] w-[3px] rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.45)]"
    />
  )
}

/**
 * Lounge dock **Notifications** panel - in-app activity feed (Phase H1).
 */
export default function LoungeNotificationsPanel({
  supabaseClient,
  viewerUserId,
  onOpenPost,
  onOpenProfile,
  /** Grouped follow row: open viewer's own profile on Followers tab with glow on new followers. */
  onOpenOwnProfileFollowers,
  onUnreadChange,
  onOpenNotificationSettings,
  /** Same handlers as feed `LoungePostArticle` for inline like/repost/bookmark/comment. */
  notificationPostCardProps = null,
  repostMenuScrollRootRef = null,
  /** Panel scroller - first scroll clears "new" highlights (inbox seen). */
  listScrollRootRef = null,
  /** Bumped when post detail closes over this panel - refresh interaction counts. */
  interactionCountsRefreshKey = 0,
}) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const markedReadRef = useRef(false)
  const fetchSeqRef = useRef(0)
  const pullRefreshZoneRef = useRef(null)
  const pullPostsWrapRef = useRef(null)
  const pullIndicatorOverlayRef = useRef(null)
  const pullIndicatorWrapRef = useRef(null)
  const pullArrowRef = useRef(null)
  const pullSpinnerRef = useRef(null)
  const pullAriaRef = useRef(null)
  /** Unread at fetch time - cyan rail until inbox is seen (mark-all-read) or the row is opened. */
  const [sessionNewIds, setSessionNewIds] = useState(() => new Set())

  const clearAllSessionNewIds = useCallback(() => {
    setSessionNewIds((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const richCaptionOpts = useMemo(
    () => ({
      onMentionClick: notificationPostCardProps?.onMentionClick,
      onHashtagClick: notificationPostCardProps?.onHashtagClick,
      onLinkClick: notificationPostCardProps?.onLinkClick,
    }),
    [notificationPostCardProps],
  )

  const sessionNewSeenRef = useRef(false)
  const markSessionNewSeen = useCallback(() => {
    if (sessionNewSeenRef.current) return
    sessionNewSeenRef.current = true
    clearAllSessionNewIds()
  }, [clearAllSessionNewIds])

  const loadPage = useCallback(
    async ({ append = false, cursor = null, silent = false } = {}) => {
      if (!viewerUserId || !supabaseClient) {
        setItems([])
        if (!silent) setLoading(false)
        setHasMore(false)
        return
      }
      const seq = ++fetchSeqRef.current
      if (append) setLoadingMore(true)
      else if (!silent) setLoading(true)
      setErr('')
      try {
        let rows = await loungeActivityEventsPage(supabaseClient, {
          limit: LOUNGE_ACTIVITY_PAGE_SIZE,
          beforeCreatedAt: cursor?.created_at ?? null,
          beforeId: cursor?.id ?? null,
        })
        if (seq !== fetchSeqRef.current) return
        rows = await hydrateLoungeActivityEventPreviews(supabaseClient, rows)
        if (seq !== fetchSeqRef.current) return
        setSchemaMissing(false)
        setHasMore(rows.length >= LOUNGE_ACTIVITY_PAGE_SIZE)
        setItems((prev) => (append ? [...prev, ...rows] : rows))
        if (append) {
          setSessionNewIds((prev) => {
            const next = new Set(prev)
            for (const row of rows) {
              if (!row.read_at) next.add(String(row.id))
            }
            return next
          })
        } else {
          setSessionNewIds((prev) => {
            const newIds = new Set(prev)
            for (const row of rows) {
              if (!row.read_at) newIds.add(String(row.id))
            }
            return newIds
          })
        }
      } catch (e) {
        if (seq !== fetchSeqRef.current) return
        if (isLoungeActivitySchemaMissingError(e)) {
          setSchemaMissing(true)
          setItems([])
          setHasMore(false)
        } else {
          setErr(e?.message || 'Could not load notifications.')
          if (!append) setItems([])
        }
      } finally {
        if (seq !== fetchSeqRef.current) return
        if (append) setLoadingMore(false)
        else if (!silent) setLoading(false)
      }
    },
    [supabaseClient, viewerUserId],
  )

  const refreshNotifications = useCallback(async () => {
    await loadPage({ append: false, silent: true })
  }, [loadPage])

  useLoungePullToRefresh({
    scrollRootRef: listScrollRootRef,
    pullZoneRef: pullRefreshZoneRef,
    pullPostsWrapRef,
    pullIndicatorOverlayRef,
    pullIndicatorWrapRef,
    pullArrowRef,
    pullSpinnerRef,
    pullAriaRef,
    onRefresh: refreshNotifications,
    enabled: Boolean(viewerUserId && listScrollRootRef),
    pullRefreshing,
    setPullRefreshing,
  })

  useEffect(() => {
    markedReadRef.current = false
    sessionNewSeenRef.current = false
    setSessionNewIds(new Set())
    void loadPage()
    return () => {
      fetchSeqRef.current += 1
    }
  }, [loadPage])

  /** Stable id sets only - avoid re-hydrating when like_count patches replace `items`. */
  const notificationInteractionIdsKey = useMemo(() => {
    const postIds = new Set()
    const commentIds = new Set()
    for (const event of items) {
      const kind = event.interaction_bar_kind || loungeActivityInteractionBarKind(event.event_type)
      if (kind === 'post' && event.post_id && event.interaction_bar_entity) {
        postIds.add(String(event.post_id))
      } else if (kind === 'comment' && event.comment_id && event.interaction_bar_entity) {
        commentIds.add(String(event.comment_id))
      }
    }
    return `${[...postIds].sort().join(',')}|${[...commentIds].sort().join(',')}`
  }, [items])

  const notificationPostCardPropsRef = useRef(notificationPostCardProps)
  notificationPostCardPropsRef.current = notificationPostCardProps

  const itemsRef = useRef(items)
  itemsRef.current = items

  const refreshInteractionEntityCounts = useCallback(async () => {
    if (!viewerUserId || !supabaseClient) return
    const postIds = []
    const commentIds = []
    for (const event of itemsRef.current) {
      const kind = event.interaction_bar_kind || loungeActivityInteractionBarKind(event.event_type)
      if (kind === 'post' && event.post_id && event.interaction_bar_entity) {
        postIds.push(String(event.post_id))
      } else if (kind === 'comment' && event.comment_id && event.interaction_bar_entity) {
        commentIds.push(String(event.comment_id))
      }
    }
    if (postIds.length === 0 && commentIds.length === 0) return
    try {
      const { postsById, commentsById } = await fetchLoungeActivityInteractionCountRows(
        supabaseClient,
        { postIds, commentIds },
      )
      setItems((prev) =>
        prev.map((event) => {
          const kind = event.interaction_bar_kind || loungeActivityInteractionBarKind(event.event_type)
          if (!kind || !event.interaction_bar_entity) return event
          const sourceRow =
            kind === 'comment'
              ? event.comment_id
                ? commentsById.get(String(event.comment_id))
                : null
              : event.post_id
                ? postsById.get(String(event.post_id))
                : null
          if (!sourceRow) return event
          const entity = loungeActivityInteractionEntityFromRow(kind, sourceRow)
          if (!entity) return event
          return { ...event, interaction_bar_entity: entity }
        }),
      )
      const pp = notificationPostCardPropsRef.current
      if (commentIds.length > 0) void pp?.hydrateCommentInteractionsForIds?.(commentIds)
      if (postIds.length > 0) void pp?.refreshPostInteractions?.(postIds)
    } catch {
      /* ignore transient count refresh errors */
    }
  }, [supabaseClient, viewerUserId])

  useEffect(() => {
    if (!interactionCountsRefreshKey) return
    void refreshInteractionEntityCounts()
  }, [interactionCountsRefreshKey, refreshInteractionEntityCounts])

  useEffect(() => {
    const pp = notificationPostCardPropsRef.current
    if (!pp || !viewerUserId || notificationInteractionIdsKey === '|') return
    const [postPart, commentPart] = notificationInteractionIdsKey.split('|')
    const postIds = postPart ? postPart.split(',').filter(Boolean) : []
    const commentIds = commentPart ? commentPart.split(',').filter(Boolean) : []
    if (postIds.length > 0) void pp.refreshPostInteractions?.(postIds)
    if (commentIds.length > 0) void pp.hydrateCommentInteractionsForIds?.(commentIds)
  }, [notificationInteractionIdsKey, viewerUserId])

  useEffect(() => {
    if (!viewerUserId || !supabaseClient || schemaMissing || markedReadRef.current) return
    if (loading) return
    markedReadRef.current = true
    void (async () => {
      try {
        await loungeActivityMarkAllRead(supabaseClient)
        onUnreadChange?.(0)
      } catch {
        markedReadRef.current = false
      }
    })()
  }, [loading, onUnreadChange, schemaMissing, supabaseClient, viewerUserId])

  useEffect(() => {
    const el = listScrollRootRef?.current
    if (!el || loading) return undefined
    const onScroll = () => {
      markSessionNewSeen()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [listScrollRootRef, loading, markSessionNewSeen])

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || items.length === 0) return
    const last = items[items.length - 1]
    void loadPage({ append: true, cursor: { created_at: last.created_at, id: last.id } })
  }, [hasMore, items, loadPage, loadingMore])

  const emptyCopy = useMemo(() => {
    if (schemaMissing) {
      return 'Notification center is almost ready - apply the Phase H SQL migration on test, then refresh.'
    }
    return 'No notifications yet. When someone follows you, comments, replies, or @mentions you, it shows up here.'
  }, [schemaMissing])

  const markNotificationEventsRead = useCallback(
    async (readEventIds) => {
      const ids = [...new Set((readEventIds || []).map(String).filter(Boolean))]
      if (ids.length === 0 || !viewerUserId || !supabaseClient) return
      try {
        for (const id of ids) {
          await loungeActivityMarkPushOpened(supabaseClient, { activityEventId: id })
        }
        const n = await loungeActivityUnreadCount(supabaseClient)
        onUnreadChange?.(n)
      } catch {
        /* ignore transient mark-read errors */
      }
    },
    [onUnreadChange, supabaseClient, viewerUserId],
  )

  const onRowActivate = useCallback(
    (event, readEventIds = null, { groupedActors = null } = {}) => {
      if (!event) return
      markSessionNewSeen()
      void markNotificationEventsRead(readEventIds || (event.id ? [event.id] : []))

      if (
        event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW &&
        Array.isArray(groupedActors) &&
        groupedActors.length > 0
      ) {
        onOpenOwnProfileFollowers?.({
          highlightUserIds: groupedActors.map((actor) => actor?.user_id).filter(Boolean),
        })
        return
      }

      if (
        (event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_SHARED ||
          event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_PAID ||
          event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.PLAY_LOG_PARTNER_UNPAID) &&
        event.play_log_entry_id
      ) {
        const params = new URLSearchParams()
        params.set('tab', 'logbook')
        params.set('playLogEntry', String(event.play_log_entry_id))
        const nextPath = `/?${params.toString()}`
        if (typeof window !== 'undefined' && window.location.pathname + window.location.search !== nextPath) {
          window.history.pushState({}, '', nextPath)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
        return
      }

      if (event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW) {
        onOpenProfile?.({
          user_id: event.actor_user_id,
          author_profile: {
            user_id: event.actor_user_id,
            handle: event.actor_handle,
            display_name: event.actor_display_name,
            avatar_url: event.actor_avatar_url,
            role: event.actor_role,
            is_og: event.actor_is_og,
          },
        })
        return
      }
      if (event.post_id || loungeActivityPlainPostRepostEvent(event)) {
        void (async () => {
          const target = await resolveLoungeActivityOpenPostTarget(supabaseClient, event)
          if (target) onOpenPost?.(target)
        })()
      }
    },
    [markNotificationEventsRead, markSessionNewSeen, onOpenOwnProfileFollowers, onOpenPost, onOpenProfile, supabaseClient],
  )

  const patchNotificationInteractionEntity = useCallback((kind, entityId, patch) => {
    if (!kind || entityId == null) return
    const id = String(entityId)
    setItems((prev) =>
      prev.map((event) => {
        const eventKind = event.interaction_bar_kind || loungeActivityInteractionBarKind(event.event_type)
        if (eventKind !== kind || !event.interaction_bar_entity) return event
        const targetId =
          kind === 'comment' ? String(event.comment_id || '') : String(event.post_id || '')
        if (targetId !== id) return event
        return {
          ...event,
          interaction_bar_entity: { ...event.interaction_bar_entity, ...patch },
        }
      }),
    )
  }, [])

  const renderNotificationInteractionBar = useCallback(
    (event) => {
      if (!notificationPostCardProps || !event?.interaction_bar_entity) return null
      const kind = event.interaction_bar_kind || loungeActivityInteractionBarKind(event.event_type)
      if (!kind) return null
      return (
        <div className="mt-1 w-full pl-[calc(2.5rem+0.75rem)] pr-3 pb-1 sm:pl-[calc(2.75rem+0.75rem)]">
          <LoungeNotificationInteractionBar
            kind={kind}
            entity={event.interaction_bar_entity}
            event={event}
            postCardProps={notificationPostCardProps}
            repostMenuScrollRootRef={repostMenuScrollRootRef}
            onOpenPost={({ postId, commentId, focusComposer = false }) => {
              if (!postId) return
              void markNotificationEventsRead(event.id ? [event.id] : [])
              onOpenPost?.({ postId, commentId: commentId || null, focusComposer })
            }}
            onEntityCountsChange={patchNotificationInteractionEntity}
          />
        </div>
      )
    },
    [
      markNotificationEventsRead,
      notificationPostCardProps,
      onOpenPost,
      patchNotificationInteractionEntity,
      repostMenuScrollRootRef,
    ],
  )

  const displayRows = useMemo(() => buildLoungeActivityDisplayRows(items), [items])

  const previewClampClass = (eventType) => {
    if (
      eventType === LOUNGE_ACTIVITY_EVENT_TYPES.LIKE ||
      eventType === LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK ||
      eventType === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST ||
      eventType === LOUNGE_ACTIVITY_EVENT_TYPES.QUOTE_REPOST
    ) {
      return 'line-clamp-2'
    }
    return 'line-clamp-3'
  }

  const openActorProfile = useCallback(
    (actorProfile) => {
      if (!actorProfile?.user_id) return
      onOpenProfile?.({
        user_id: actorProfile.user_id,
        author_profile: actorProfile,
      })
    },
    [onOpenProfile],
  )

  const renderGroupedRow = (row) => {
    const { event, actors, firstActor, othersCount, eventIds, groupKey } = row
    const isNew = loungeNotificationIsNew(sessionNewIds, eventIds)
    const when = formatLoungeActivityWhen(event.created_at)
    const actionPhrase = loungeActivityGroupedActionPhrase(event, firstActor, othersCount, event)
    const showContext = loungeActivityShowsContextPreview(event.event_type)
    const previewText = showContext ? String(event.preview_text || '').trim() : ''
    const previewPosterUrl = showContext ? String(event.preview_poster_url || '').trim() : ''
    const groupedTintClass =
      event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.LIKE
        ? 'bg-gradient-to-r from-lv-red/28 via-lv-red/12 to-transparent'
        : event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.BOOKMARK
          ? 'bg-gradient-to-r from-lv-yellow/24 via-lv-yellow/10 to-transparent'
          : event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.REPOST
            ? 'bg-gradient-to-r from-lv-green/28 via-lv-green/12 to-transparent'
            : event.event_type === LOUNGE_ACTIVITY_EVENT_TYPES.FOLLOW
              ? 'bg-gradient-to-r from-cyan-400/28 via-cyan-400/12 to-transparent'
              : ''

    return (
      <li key={groupKey}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => onRowActivate(event, eventIds, { groupedActors: actors })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onRowActivate(event, eventIds, { groupedActors: actors })
            }
          }}
          aria-label={actionPhrase}
          className={`${LOUNGE_FEED_POST_ROW_CLASS} relative flex w-full cursor-pointer items-center gap-3 overflow-hidden text-left touch-manipulation ${
            isNew ? 'bg-cyan-950/25 ring-1 ring-inset ring-cyan-500/20 active:bg-cyan-950/35' : ''
          }`}
        >
          {isNew ? <LoungeNotificationNewRail /> : null}
          {groupedTintClass ? (
            <span aria-hidden className={`${LOUNGE_NOTIFICATION_GROUPED_TINT_RAIL_CLASS} ${groupedTintClass}`} />
          ) : null}
          <span className="relative z-[1] shrink-0">
            <LoungeNotificationActionBadge eventType={event.event_type} slot="avatar" />
          </span>
          <span className={`relative z-[1] min-w-0 flex-1 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
            <div className={LOUNGE_FEED_META_TEXT_COLUMN_CLASS}>
              <div className={LOUNGE_FEED_META_ROW_CLASS}>
                <LoungeNotificationActorStack
                  actors={actors}
                  onOpenProfile={(actor) =>
                    openActorProfile({
                      user_id: actor.user_id,
                      handle: actor.handle,
                      display_name: actor.display_name,
                      avatar_url: actor.avatar_url,
                      role: actor.role,
                      is_og: actor.is_og,
                    })
                  }
                />
              </div>
              <p className="mt-0.5 min-w-0 text-[15px] leading-snug text-zinc-400">
                <span className="break-words">{actionPhrase}</span>
                {when ? (
                  <>
                    <span className="text-zinc-600"> · </span>
                    <span className="whitespace-nowrap tabular-nums">{when}</span>
                  </>
                ) : null}
              </p>
              {previewText ? (
                <p
                  className={`${LOUNGE_FEED_CAPTION_TEXT_CLASS} mt-1 line-clamp-2 text-zinc-300`}
                  onClick={(e) => {
                    if (e.target instanceof Element && e.target.closest('a, button')) {
                      e.stopPropagation()
                    }
                  }}
                >
                  {renderRichCaption(previewText, richCaptionOpts)}
                </p>
              ) : null}
            </div>
          </span>
          {previewPosterUrl ? (
            <span
              className="pointer-events-none relative z-[1] h-14 w-14 shrink-0 self-center overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900"
              aria-hidden
            >
              <img
                src={previewPosterUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </span>
          ) : null}
        </div>
      </li>
    )
  }

  const renderSingleRow = (row) => {
    const event = row.event
    const isNew = loungeNotificationIsNew(sessionNewIds, event.id)
    const actorProfile = loungeActivityEventToActorProfile(event)
    const avatarUrl = String(actorProfile.avatar_url || '').trim()
    const avatarTone = profileAvatarToneClass(actorProfile.user_id)
    const avatarText = profileAvatarInitials(actorProfile.display_name, actorProfile.handle)
    const displayName =
      String(actorProfile.display_name || '').trim() ||
      (actorProfile.handle ? `@${String(actorProfile.handle).trim()}` : 'Member')
    const handleLabel = (() => {
      const h = actorProfile.handle != null ? String(actorProfile.handle).trim() : ''
      return h ? `@${h}` : '@member'
    })()
    const when = formatLoungeActivityWhen(event.created_at)
    const actionPhrase = loungeActivityActionPhrase(event)
    const summary = loungeActivitySummary(event)
    const showContext = loungeActivityShowsContextPreview(event.event_type)
    const previewText = showContext ? String(event.preview_text || '').trim() : ''
    const previewPosterUrl = showContext ? String(event.preview_poster_url || '').trim() : ''
    const clampClass = previewClampClass(event.event_type)

    return (
      <li key={event.id}>
        <div
          className={`${LOUNGE_FEED_POST_ROW_CLASS} relative flex w-full flex-col text-left touch-manipulation ${
            isNew ? 'bg-cyan-950/25 ring-1 ring-inset ring-cyan-500/20' : ''
          }`}
        >
          {isNew ? <LoungeNotificationNewRail /> : null}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onRowActivate(event)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onRowActivate(event)
              }
            }}
            aria-label={isNew ? `${summary} - new notification` : summary}
            className={`relative flex w-full cursor-pointer items-start gap-3 ${
              isNew ? 'active:bg-cyan-950/35' : ''
            }`}
          >
            <button
              type="button"
              title="View profile"
              aria-label={`View ${displayName}'s profile`}
              onClick={(e) => {
                e.stopPropagation()
                openActorProfile(actorProfile)
              }}
              className={`${LOUNGE_NOTIFICATION_AUTHOR_AVATAR_CLASS} flex items-center justify-center overflow-hidden touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span
                  className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarTone}`}
                >
                  {avatarText}
                </span>
              )}
            </button>
            <span className={`min-w-0 flex-1 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
              <div className={LOUNGE_FEED_META_TEXT_COLUMN_CLASS}>
                <div className={LOUNGE_FEED_META_ROW_CLASS}>
                  <LoungeFeedAuthorMetaBadges
                    role={actorProfile.role}
                    isOg={event.actor_is_og === true}
                    displayName={displayName}
                    displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
                  />
                  {when ? (
                    <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                      <span className="min-w-0 truncate">{handleLabel}</span>
                      <span className="shrink-0 text-zinc-600">·</span>
                      <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">{when}</span>
                    </span>
                  ) : (
                    <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                      <span className="min-w-0 truncate">{handleLabel}</span>
                    </span>
                  )}
                </div>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[15px] leading-snug text-zinc-400">
                  <LoungeNotificationActionBadge eventType={event.event_type} slot="inline" />
                  <span className="min-w-0">{actionPhrase}</span>
                </span>
                {previewText ? (
                  <p
                    className={`${LOUNGE_FEED_CAPTION_TEXT_CLASS} mt-1 ${clampClass} text-zinc-300`}
                    onClick={(e) => {
                      if (e.target instanceof Element && e.target.closest('a, button')) {
                        e.stopPropagation()
                      }
                    }}
                  >
                    {renderRichCaption(previewText, richCaptionOpts)}
                  </p>
                ) : null}
              </div>
            </span>
            {previewPosterUrl ? (
              <span
                className="pointer-events-none h-14 w-14 shrink-0 self-center overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900"
                aria-hidden
              >
                <img
                  src={previewPosterUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              </span>
            ) : null}
          </div>
          {renderNotificationInteractionBar(event)}
        </div>
      </li>
    )
  }

  if (!viewerUserId) {
    return (
      <div className="px-3 py-4">
        <p className="text-[15px] leading-relaxed text-zinc-400">Sign in to see your notifications.</p>
      </div>
    )
  }

  return (
    <div className="px-3 pt-1 pb-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[17px] font-semibold leading-none text-zinc-100">Notifications</h2>
        <button
          type="button"
          aria-label="Notification settings"
          onClick={() => onOpenNotificationSettings?.()}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 touch-manipulation hover:bg-zinc-900/80 hover:text-zinc-200 [-webkit-tap-highlight-color:transparent]"
        >
          <NotificationSettingsGearIcon />
        </button>
      </div>

      <LoungePullRefreshZone
        pullRefreshZoneRef={pullRefreshZoneRef}
        pullIndicatorOverlayRef={pullIndicatorOverlayRef}
        pullIndicatorWrapRef={pullIndicatorWrapRef}
        pullArrowRef={pullArrowRef}
        pullSpinnerRef={pullSpinnerRef}
        pullAriaRef={pullAriaRef}
        pullPostsWrapRef={pullPostsWrapRef}
        leadingDivider
      >
      {loading && !pullRefreshing ? (
        <p className="mt-4 text-[14px] text-zinc-500">Loading…</p>
      ) : err ? (
        <p className="mt-4 text-[14px] text-red-300">{err}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-[14px] leading-relaxed text-zinc-400">{emptyCopy}</p>
      ) : (
        <ul className="mt-0 -mx-3 list-none p-0 [&>li:first-child>div]:border-t-0">
          {displayRows.map((row) =>
            row.type === 'grouped' ? renderGroupedRow(row) : renderSingleRow(row),
          )}
        </ul>
      )}

      {hasMore && !loading && items.length > 0 ? (
        <div className="py-4">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore || pullRefreshing}
            className="mx-auto flex min-h-10 items-center justify-center rounded-xl border border-zinc-700/90 bg-zinc-900/70 px-5 text-[14px] font-medium text-zinc-200 touch-manipulation hover:border-zinc-600 hover:bg-zinc-800/80 disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
      </LoungePullRefreshZone>
    </div>
  )
}
