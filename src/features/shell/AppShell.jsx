import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, useSyncExternalStore } from 'react'
import * as Sentry from '@sentry/react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost'
import { isLoungePostShareId, isLoungeProfileHandleSlug, parseLoungeProfilePathHandle } from '../../utils/loungeSharePost'
import {
  fetchLoungeFollowingAuthorIds,
  filterLoungeFeedTimelinePosts,
  LOUNGE_FEED_SCOPE_ALL,
  LOUNGE_FEED_SCOPE_FOLLOWING,
  loungeFeedCursorFromPageLast,
  loungeFeedPageRpcQuery,
  loungeFeedPinnedQuery,
} from '../../utils/loungeFeedScope'
import { LOUNGE_FEED_SORT, readLoungeFeedSort } from '../../utils/loungeFeedSortPref'
import { readLoungeFeedCategoryFilter } from '../../utils/loungeFeedCategoryFilterPref.js'
import { renderRichCaption } from '../lounge/loungeCaption'
import {
  OFFERS_ALERT_DEFAULT_PRESET_KEY_PREFIX,
  OFFERS_DEFAULT_VIEW_KEY_PREFIX,
  OFFERS_DELETE_CONFIRM_SKIP_KEY_PREFIX,
  OFFERS_IOS_ALERT_SETUP_SEEN_STORAGE_KEY_PREFIX,
  OFFERS_IOS_ALERT_REMINDER_SUPPRESS_STORAGE_KEY_PREFIX,
} from '../offers/offerStorageKeys'
import {
  hasSeenPwaNotifPrompt,
  isIosDevice,
  isPwaNotifPromptAuthEvent,
  isStandalonePwa,
  markPwaNotifPromptSeen,
  setPwaNotifEnablePending,
} from '../../utils/pwaNotificationPrompt'
import { syncLoungeFeedVideoDebugFromUrl } from '../../utils/loungeFeedVideoDebugPref.js'
import AppConsoleLogDebugHud from '../../components/AppConsoleLogDebugHud.jsx'
import {
  readAppConsoleLogHudEnabled,
  subscribeAppConsoleLogHudEnabled,
} from '../../utils/appConsoleLogHudPref.js'
import LoungeAppSplash from '../../components/LoungeAppSplash.jsx'
import { useLoungeColdBootSplash } from '../lounge/useLoungeColdBootSplash.js'
import { shouldShowLoungeColdBootSplash } from '../../utils/loungeColdBootSplash.js'
import { Z_APP_ALERT } from '../../constants/appZIndex.js'
import LoungeActivityInAppToast from '../lounge/LoungeActivityInAppToast.jsx'
import {
  loungeActivityInAppPayloadFromMessage,
  navigateFromLoungeActivityPayload,
} from '../../utils/loungeActivityInAppNavigate.js'
import { queueLoungeActivityMarkRead } from '../../utils/loungeActivityMarkReadQueue.js'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import TitleBarQuickLinks from '../../components/TitleBarQuickLinks.jsx'
import TitleBarCloseButton from '../../components/TitleBarCloseButton.jsx'
import {
  calculatorRequiresSlotsEdge,
  canOpenCalculator,
  calculatorsTabFullyGated,
} from '../calculators/calculatorAccess.js'
import { guidesTabFullyGated, normalizeGuideAccessSlug } from '../guides/guideAccess.js'
import { parseGuideSlugFromPathname } from '../lounge/loungeCaptionLink.js'
import { QUICK_LINK_BY_ID } from './quickLinkDestinations.js'
import {
  TAB_ERROR_COUNT_KEY,
  TabErrorSimulator,
  isStaffTabErrorTest,
  resetTabErrorStrikes,
} from './tabErrorBoundaryTools.js'
import { useFreemiumToolUsage } from '../billing/useFreemiumToolUsage.js'

const LOUNGE_ACTIVITY_INAPP_TOAST_MS = 7000
const GUIDES_SCREEN_CHUNK_RELOAD_KEY = 'lvsp_guides_screen_chunk_reload'

/** One hard reload when a stale deploy serves index.html for a missing lazy chunk. */
function lazyImportWithChunkReload(importFn, reloadKey) {
  return importFn().catch((err) => {
    if (typeof sessionStorage !== 'undefined' && !sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1')
      window.location.reload()
      return new Promise(() => {})
    }
    throw err
  })
}

const SocialFeed = lazy(() => import('../lounge/SocialFeed.jsx'))
const OffersCalendar = lazy(() => import('../offers/OffersCalendar.jsx'))
const GuidesScreen = lazy(() =>
  lazyImportWithChunkReload(
    () => import('../guides/GuidesScreen.jsx'),
    GUIDES_SCREEN_CHUNK_RELOAD_KEY,
  ),
)
const BankrollTracker = lazy(() => import('../bankroll/BankrollTracker.jsx'))
const LocalIntel = lazy(() => import('../intel/LocalIntel.jsx'))
const CalculatorsTab = lazy(() => import('../calculators/CalculatorsTab.jsx'))
const PlayLogbook = lazy(() => import('../play-logbook/PlayLogbook.jsx'))
const SlotsScreen = lazy(() => import('../slots/SlotsScreen.jsx'))
const ChatTab = lazy(() => import('../chat/ChatTab.jsx'))

function TabLoadingFallback() {
  return (
    <div className="flex min-h-[45vh] w-full items-center justify-center px-4 text-zinc-500 text-[15px]">
      Loading…
    </div>
  )
}

class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null, attemptCount: 0 }
    /** Per-boundary ref so Strict Mode remount can throw again; Replay keeps the same instance. */
    this.lastSimulatedTriggerRef = { current: 0 }
    this.handleReport = this.handleReport.bind(this)
    this.handleRetry = this.handleRetry.bind(this)
    this.handleBack = this.handleBack.bind(this)
  }

  static getDerivedStateFromError(error) {
    // Read persisted strike count only - increment happens in componentDidCatch after paint.
    const count = parseInt(sessionStorage.getItem(TAB_ERROR_COUNT_KEY) || '0', 10)
    return { error, attemptCount: count }
  }

  componentDidCatch(error, info) {
    const prev = parseInt(sessionStorage.getItem(TAB_ERROR_COUNT_KEY) || '0', 10)
    sessionStorage.setItem(TAB_ERROR_COUNT_KEY, String(prev + 1))
    if (!isStaffTabErrorTest(error)) {
      Sentry.captureException(error, { extra: { componentStack: info?.componentStack } })
    }
  }

  handleRetry() {
    this.setState({ error: null })
    this.props.onRecover?.()
  }

  handleBack() {
    this.props.onBack?.()
  }

  // No componentDidMount clear - sessionStorage persists across reloads within the session.
  // It naturally clears when the browser tab is closed.

  handleReport() {
    const errText = this.state.error?.stack || this.state.error?.message || 'Unknown error'
    const subject = encodeURIComponent('LVSlotPro App Error Report')
    const body = encodeURIComponent(
      `App tab crashed twice - please investigate.\n\nTimestamp: ${new Date().toISOString()}\n\nError:\n${errText}`,
    )
    // Open mail client
    window.location.href = `mailto:operations@lvslotpro.com?subject=${subject}&body=${body}`
    // Clear strike counter so next visit starts fresh, then reload to Lounge
    sessionStorage.removeItem(TAB_ERROR_COUNT_KEY)
    setTimeout(() => window.location.reload(), 600)
  }

  render() {
    if (this.state.error) {
      const isFumble = this.state.attemptCount > 0
      const shellClass =
        this.props.variant === 'fullscreen'
          ? 'flex min-h-full w-full flex-col items-center justify-center gap-5 px-6 py-10 text-center'
          : 'flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 text-center'

      if (isFumble) {
        return (
          <div className={shellClass}>
            {/* Red flag SVG */}
            <svg width="64" height="64" viewBox="0 0 40 52" aria-hidden fill="none">
              <line x1="8" y1="2" x2="8" y2="50" stroke="#EF4444" strokeWidth="3.5" strokeLinecap="round"/>
              <polygon points="8,4 36,13 8,22" fill="#EF4444"/>
            </svg>
            <div>
              <div className="text-white text-2xl font-black tracking-tight">FUMBLE!</div>
              <div className="mt-1 text-zinc-400 text-sm leading-relaxed">
                Scott's demoted to the practice squad.
              </div>
              <div className="mt-2 max-w-xs text-zinc-600 text-[11px] leading-snug break-all">
                {String(this.state.error?.message || 'Unknown penalty').slice(0, 140)}
              </div>
            </div>
            <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={this.handleBack}
                className="min-h-11 flex-1 rounded-2xl border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 px-5 py-2.5 text-sm font-bold text-zinc-200 touch-manipulation transition-colors"
              >
                Back to Lounge
              </button>
              <button
                type="button"
                onClick={this.handleReport}
                className="min-h-11 flex-1 rounded-2xl border border-rose-500/40 bg-rose-600/15 hover:bg-rose-600/25 px-5 py-2.5 text-sm font-bold text-rose-300 touch-manipulation transition-colors"
              >
                Report Issue
              </button>
            </div>
          </div>
        )
      }

      return (
        <div className={shellClass}>
          {/* Yellow flag SVG */}
          <svg width="64" height="64" viewBox="0 0 40 52" aria-hidden fill="none">
            <line x1="8" y1="2" x2="8" y2="50" stroke="#EAB308" strokeWidth="3.5" strokeLinecap="round"/>
            <polygon points="8,4 36,13 8,22" fill="#EAB308"/>
          </svg>
          <div>
            <div className="text-white text-2xl font-black tracking-tight">False Start</div>
            <div className="mt-1 text-zinc-400 text-sm leading-relaxed">
              Dev gets 10 lashes.
            </div>
            <div className="mt-2 max-w-xs text-zinc-600 text-[11px] leading-snug break-all">
              {String(this.state.error?.message || 'Unknown penalty').slice(0, 140)}
            </div>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="min-h-11 rounded-2xl border border-cyan-500/40 bg-cyan-600/20 hover:bg-cyan-600/30 px-5 py-2.5 text-sm font-bold text-cyan-300 touch-manipulation transition-colors"
          >
            Replay 2nd Down
          </button>
        </div>
      )
    }
    return (
      <>
        {this.props.simulatorTrigger != null ? (
          <TabErrorSimulator
            trigger={this.props.simulatorTrigger}
            lastSimulatedRef={this.lastSimulatedTriggerRef}
          />
        ) : null}
        {this.props.children}
      </>
    )
  }
}

export default function AppShell({
  onLogout,
  onDeleteAccount,
  deleteAccountBusy = false,
  supabaseClient,
  onRequireAuth,
  browseMode = 'member',
  /** False until first `getSession()` completes - avoids push deep links firing auth gate while session restores. */
  authSessionReady = true,
  onOpenAuth,
  accessNotice = '',
  onDismissAccessNotice,
  hasActiveSubscription = false,
  isStaff = false,
  isAdmin = false,
  contentAccessGatesMap = null,
  contentAccessGatesDbReady = false,
  onSetContentAccessGate,
  onRequireSubscribe,
  onOpenLegalDocument,
}) {
  const consoleLogHudEnabled = useSyncExternalStore(
    subscribeAppConsoleLogHudEnabled,
    readAppConsoleLogHudEnabled,
    () => false,
  )
  const COMMUNITY_FEED_PAGE_SIZE = 28
  const [tab, setTab] = useState('home')
  const [pendingPlayLogEntryId, setPendingPlayLogEntryId] = useState(null)
  const [guideOpenCardSlug, setGuideOpenCardSlug] = useState(null)
  const [pendingChatPeerUserId, setPendingChatPeerUserId] = useState(null)
  const [pendingChatRoomId, setPendingChatRoomId] = useState(null)
  const [pendingLoungeProfileUserId, setPendingLoungeProfileUserId] = useState(null)
  const [pendingOfferEventIds, setPendingOfferEventIds] = useState([])
  const [offerSpotlightEventIds, setOfferSpotlightEventIds] = useState([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [tabErrorTestTrigger, setTabErrorTestTrigger] = useState(0)
  const [tabErrorTestOpen, setTabErrorTestOpen] = useState(false)
  const {
    canCreateBankrollSession,
    canCreatePlayLog,
    bankrollSessionsRemaining,
    playLogsRemaining,
    freemiumUsageLoading,
    refreshFreemiumUsage,
  } = useFreemiumToolUsage({
    supabaseClient,
    enabled: browseMode === 'member',
    isStaff,
    hasSlotsEdge: hasActiveSubscription,
  })
  const [activeCalculator, setActiveCalculator] = useState(null) // 'phoenix' | 'buffalo-link' | 'stackup' | 'mhb' | null
  const [communityPosts, setCommunityPosts] = useState([])
  const [communityFeedLoading, setCommunityFeedLoading] = useState(false)
  const [communityFeedLoadingMore, setCommunityFeedLoadingMore] = useState(false)
  const [communityFeedHasMore, setCommunityFeedHasMore] = useState(false)
  const [communityFeedCursor, setCommunityFeedCursor] = useState(null)
  /** Set when the feed query fails (e.g. missing column); avoids showing “no posts” when posts exist but select failed. */
  const [communityFeedQueryErr, setCommunityFeedQueryErr] = useState('')
  const [loungeFeedScope, setLoungeFeedScope] = useState(LOUNGE_FEED_SCOPE_ALL)
  const loungeFeedScopeRef = useRef(loungeFeedScope)
  loungeFeedScopeRef.current = loungeFeedScope
  const [loungeFeedSort, setLoungeFeedSort] = useState(() => readLoungeFeedSort())
  const loungeFeedSortRef = useRef(loungeFeedSort)
  loungeFeedSortRef.current = loungeFeedSort
  const [loungeFeedCategoryExcludedSlugs, setLoungeFeedCategoryExcludedSlugs] = useState(() =>
    readLoungeFeedCategoryFilter(),
  )
  const loungeFeedCategoryExcludedSlugsRef = useRef(loungeFeedCategoryExcludedSlugs)
  loungeFeedCategoryExcludedSlugsRef.current = loungeFeedCategoryExcludedSlugs
  /** Frozen `p_as_of` for Popular pagination within one head load + load-more chain. */
  const loungeFeedPopularAsOfRef = useRef(/** @type {string | null} */ (null))
  /** True while the first page of the Lounge feed is being reloaded (including silent pull-to-refresh). */
  const communityFeedHeadReloadingRef = useRef(false)
  const iosPwaNotifPromptInFlightRef = useRef(false)
  const [globalConfirmState, setGlobalConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel'
  })
  const globalConfirmResolverRef = useRef(null)
  const onRequireAuthRef = useRef(onRequireAuth)
  onRequireAuthRef.current = onRequireAuth
  const [loungeActivityInAppToast, setLoungeActivityInAppToast] = useState(null)
  const loungeActivityInAppToastTimerRef = useRef(0)

  const dismissLoungeActivityInAppToast = useCallback(() => {
    try {
      window.clearTimeout(loungeActivityInAppToastTimerRef.current)
    } catch {
      // ignore
    }
    loungeActivityInAppToastTimerRef.current = 0
    setLoungeActivityInAppToast(null)
  }, [])

  const showLoungeActivityInAppToast = useCallback(
    (payload) => {
      if (browseMode === 'anonymous' || !payload?.body) return
      setLoungeActivityInAppToast(payload)
      try {
        window.clearTimeout(loungeActivityInAppToastTimerRef.current)
      } catch {
        // ignore
      }
      loungeActivityInAppToastTimerRef.current = window.setTimeout(() => {
        loungeActivityInAppToastTimerRef.current = 0
        setLoungeActivityInAppToast(null)
      }, LOUNGE_ACTIVITY_INAPP_TOAST_MS)
      window.dispatchEvent(new CustomEvent('lounge-activity-arrived', { detail: payload }))
    },
    [browseMode],
  )

  const openLoungeActivityInAppToast = useCallback(
    (payload) => {
      dismissLoungeActivityInAppToast()
      const { activityEventId, activityBatchId } = navigateFromLoungeActivityPayload(payload, {
        onTabHome: () => {
          setTab('home')
          setMenuOpen(false)
        },
      })
      if (activityEventId || activityBatchId) {
        queueLoungeActivityMarkRead({ activityEventId, activityBatchId })
        window.dispatchEvent(
          new CustomEvent('lounge-push-opened', {
            detail: { activityEventId, activityBatchId },
          }),
        )
      }
    },
    [dismissLoungeActivityInAppToast],
  )

  useEffect(() => {
    return () => {
      try {
        window.clearTimeout(loungeActivityInAppToastTimerRef.current)
      } catch {
        // ignore
      }
    }
  }, [])

  const closeGlobalConfirm = useCallback((result) => {
    const resolver = globalConfirmResolverRef.current
    globalConfirmResolverRef.current = null
    setGlobalConfirmState((cur) => ({ ...cur, open: false }))
    if (resolver) resolver(result === true)
  }, [])

  const showGlobalConfirm = useCallback(
    ({ title, message = '', confirmLabel = 'Continue', cancelLabel = 'Cancel' }) =>
      new Promise((resolve) => {
        globalConfirmResolverRef.current = resolve
        setGlobalConfirmState({
          open: true,
          title,
          message,
          confirmLabel,
          cancelLabel
        })
      }),
    []
  )

  /** User id queued for one-time iOS PWA notification opt-in (shown after member UI + splash settle). */
  const [pwaNotifPromptUserId, setPwaNotifPromptUserId] = useState(null)

  const hydrateCommunityPosts = useCallback(
    async (rows, depth = 0) => {
      if (!rows?.length) return []
      /** Stable map key so post.user_id always matches hydrated profiles (UUID string vs object edge cases). */
      const uidKey = (id) => (id == null || id === '' ? '' : String(id))
      const userIds = [...new Set(rows.map((r) => uidKey(r.user_id)).filter(Boolean))]
      let profileByUserId = {}
      if (userIds.length > 0) {
        const coreFields = 'user_id,handle,display_name,avatar_url,bio,role,is_og'
        let res = await supabaseClient
          .from('profiles')
          .select(`${coreFields},about_me,banner_url,location`)
          .in('user_id', userIds)
        if (res.error) {
          res = await supabaseClient.from('profiles').select(coreFields).in('user_id', userIds)
        }
        const profiles = res.data
        profileByUserId = Object.fromEntries((profiles || []).map((p) => [uidKey(p.user_id), p]))
      }

      const originalPostSelect =
        'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url,link_preview'

      let repostById = {}
      if (depth === 0) {
        const repostTargetIds = [
          ...new Set(
            rows
              .map((r) => r.repost_of_post_id)
              .filter((id) => id != null && id !== '')
              .map((id) => uidKey(id))
          ),
        ]
        if (repostTargetIds.length > 0) {
          const { data: origRows, error: origErr } = await supabaseClient
            .from('community_feed_posts')
            .select(originalPostSelect)
            .in('id', repostTargetIds)
            .is('hidden_at', null)
          if (origErr) {
            console.warn('hydrateCommunityPosts originals:', origErr.message)
          } else if (origRows?.length) {
            const nested = await hydrateCommunityPosts(origRows, depth + 1)
            repostById = Object.fromEntries(nested.map((p) => [uidKey(p.id), p]))
          }
        }
      }

      // ── Comment reposts ──────────────────────────────────────────────────
      // Fetch the original comment + its author + the "in reply to" parent context.
      let repostedCommentById = {}
      if (depth === 0) {
        const commentRepostTargetIds = [
          ...new Set(
            rows
              .filter((r) => r.repost_of_comment_id != null && r.repost_of_comment_id !== '')
              .map((r) => uidKey(r.repost_of_comment_id))
          ),
        ]
        if (commentRepostTargetIds.length > 0) {
          const commentSelect =
            'id,body,post_id,parent_id,user_id,created_at,like_count,repost_count,comment_count,image_urls,gif_url,media_url,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height'
          const { data: commentRows, error: commentErr } = await supabaseClient
            .from('feed_comments')
            .select(commentSelect)
            .in('id', commentRepostTargetIds)
            .is('hidden_at', null)
          if (!commentErr && commentRows?.length) {
            const commentUserIds = commentRows.map((c) => c.user_id).filter(Boolean)
            const parentCommentIds = commentRows.filter((c) => c.parent_id).map((c) => c.parent_id).filter(Boolean)
            const rootPostIds = commentRows
              .filter((c) => !c.parent_id && c.post_id)
              .map((c) => c.post_id)
              .filter(Boolean)

            const [parentCommentRes, rootPostRes] = await Promise.all([
              parentCommentIds.length > 0
                ? supabaseClient.from('feed_comments').select('id,user_id').in('id', parentCommentIds)
                : Promise.resolve({ data: [] }),
              rootPostIds.length > 0
                ? supabaseClient.from('community_feed_posts').select('id,user_id').in('id', rootPostIds)
                : Promise.resolve({ data: [] }),
            ])

            const parentCommentByParentId = Object.fromEntries(
              (parentCommentRes.data || []).map((r) => [r.id, r])
            )
            const rootPostByPostId = Object.fromEntries(
              (rootPostRes.data || []).map((r) => [r.id, r])
            )

            const allParentUserIds = [
              ...(parentCommentRes.data || []).map((r) => r.user_id),
              ...(rootPostRes.data || []).map((r) => r.user_id),
            ].filter(Boolean)

            const allCommentUserIds = [...new Set([...commentUserIds, ...allParentUserIds])]
            const { data: commentProfiles } =
              allCommentUserIds.length > 0
                ? await supabaseClient
                    .from('profiles')
                    .select('user_id,handle,display_name,avatar_url,role,is_og')
                    .in('user_id', allCommentUserIds)
                : { data: [] }

            const commentProfileById = Object.fromEntries(
              (commentProfiles || []).map((p) => [uidKey(p.user_id), p])
            )

            repostedCommentById = Object.fromEntries(
              commentRows.map((c) => {
                let replyToProfile = null
                if (c.parent_id && parentCommentByParentId[c.parent_id]) {
                  replyToProfile = commentProfileById[uidKey(parentCommentByParentId[c.parent_id].user_id)] || null
                } else if (!c.parent_id && c.post_id && rootPostByPostId[c.post_id]) {
                  replyToProfile = commentProfileById[uidKey(rootPostByPostId[c.post_id].user_id)] || null
                }
                return [
                  uidKey(c.id),
                  {
                    ...c,
                    author_profile: commentProfileById[uidKey(c.user_id)] || null,
                    reply_to_profile: replyToProfile,
                  },
                ]
              })
            )
          }
        }
      }

      return rows.map((r) => ({
        ...r,
        author_profile: profileByUserId[uidKey(r.user_id)] || null,
        reposted_post:
          depth === 0 && r.repost_of_post_id != null && r.repost_of_post_id !== ''
            ? repostById[uidKey(r.repost_of_post_id)] || null
            : null,
        reposted_comment:
          depth === 0 && r.repost_of_comment_id != null && r.repost_of_comment_id !== ''
            ? repostedCommentById[uidKey(r.repost_of_comment_id)] || null
            : null,
      }))
    },
    [supabaseClient]
  )

  const loadCommunityFeed = useCallback(async (opts) => {
    const silent = opts?.silent === true
    const scope = opts?.scope ?? loungeFeedScopeRef.current
    const sort = opts?.sort ?? loungeFeedSortRef.current
    const excludedCategorySlugs = opts?.excludedCategorySlugs ?? loungeFeedCategoryExcludedSlugsRef.current
    if (!silent) {
      setCommunityFeedLoading(true)
      setCommunityFeedLoadingMore(false)
    }
    communityFeedHeadReloadingRef.current = true
    try {
      let followingAuthorIds = null
      if (scope === LOUNGE_FEED_SCOPE_FOLLOWING) {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const viewerId = session?.user?.id
        if (!viewerId) {
          setCommunityFeedQueryErr('')
          setCommunityPosts([])
          setCommunityFeedHasMore(false)
          setCommunityFeedCursor(null)
          loungeFeedPopularAsOfRef.current = null
          return
        }
        followingAuthorIds = await fetchLoungeFollowingAuthorIds(supabaseClient, viewerId)
        if (followingAuthorIds.length === 0) {
          setCommunityFeedQueryErr('')
          setCommunityPosts([])
          setCommunityFeedHasMore(false)
          setCommunityFeedCursor(null)
          loungeFeedPopularAsOfRef.current = null
          return
        }
      }

      const asOf = new Date().toISOString()
      loungeFeedPopularAsOfRef.current = sort === LOUNGE_FEED_SORT.POPULAR ? asOf : null

      const [{ data: pinnedRows }, { data: rows, error }] = await Promise.all([
        loungeFeedPinnedQuery(supabaseClient, scope, followingAuthorIds, excludedCategorySlugs),
        loungeFeedPageRpcQuery(supabaseClient, {
          sort,
          scope,
          followingAuthorIds,
          excludedCategorySlugs,
          limit: COMMUNITY_FEED_PAGE_SIZE + 1,
          asOf,
          cursor: null,
        }),
      ])

      if (error) {
        setCommunityFeedQueryErr(String(error.message || error.details || 'Could not load feed.'))
        setCommunityPosts([])
        setCommunityFeedHasMore(false)
        setCommunityFeedCursor(null)
        loungeFeedPopularAsOfRef.current = null
        return
      }

      setCommunityFeedQueryErr('')
      const list = rows || []
      const hasMore = list.length > COMMUNITY_FEED_PAGE_SIZE
      const pageRows = hasMore ? list.slice(0, COMMUNITY_FEED_PAGE_SIZE) : list
      const pageLast = pageRows.at(-1) || null
      const merged = filterLoungeFeedTimelinePosts([...(pinnedRows || []), ...pageRows])
      const deduped = merged.filter((row, idx, arr) => arr.findIndex((x) => x.id === row.id) === idx)
      const hydrated = await hydrateCommunityPosts(deduped)

      setCommunityPosts(hydrated)
      setCommunityFeedHasMore(hasMore)
      setCommunityFeedCursor(loungeFeedCursorFromPageLast(pageLast, sort, asOf))
    } catch (e) {
      setCommunityFeedQueryErr(String(e?.message || 'Could not load feed.'))
      setCommunityPosts([])
      setCommunityFeedHasMore(false)
      setCommunityFeedCursor(null)
      loungeFeedPopularAsOfRef.current = null
    } finally {
      communityFeedHeadReloadingRef.current = false
      if (!silent) setCommunityFeedLoading(false)
    }
  }, [COMMUNITY_FEED_PAGE_SIZE, hydrateCommunityPosts, supabaseClient])

  const onLoungeFeedScopeChange = useCallback(
    (nextScope) => {
      if (nextScope !== LOUNGE_FEED_SCOPE_ALL && nextScope !== LOUNGE_FEED_SCOPE_FOLLOWING) return
      if (nextScope === LOUNGE_FEED_SCOPE_FOLLOWING && browseMode === 'anonymous') {
        onRequireAuth?.()
        return
      }
      setLoungeFeedScope(nextScope)
      loungeFeedScopeRef.current = nextScope
      void loadCommunityFeed({ scope: nextScope })
    },
    [browseMode, loadCommunityFeed, onRequireAuth],
  )

  const onLoungeFeedSortChange = useCallback(
    (nextSort) => {
      if (nextSort !== LOUNGE_FEED_SORT.LATEST && nextSort !== LOUNGE_FEED_SORT.POPULAR) return
      setLoungeFeedSort(nextSort)
      loungeFeedSortRef.current = nextSort
      void loadCommunityFeed({ sort: nextSort })
    },
    [loadCommunityFeed],
  )

  const onLoungeFeedCategoryFilterChange = useCallback(
    (nextExcludedSlugs) => {
      const normalized = Array.isArray(nextExcludedSlugs) ? nextExcludedSlugs : []
      setLoungeFeedCategoryExcludedSlugs(normalized)
      loungeFeedCategoryExcludedSlugsRef.current = normalized
      void loadCommunityFeed({ excludedCategorySlugs: normalized })
    },
    [loadCommunityFeed],
  )

  useEffect(() => {
    if (browseMode !== 'anonymous') return
    if (loungeFeedScope !== LOUNGE_FEED_SCOPE_FOLLOWING) return
    setLoungeFeedScope(LOUNGE_FEED_SCOPE_ALL)
    loungeFeedScopeRef.current = LOUNGE_FEED_SCOPE_ALL
  }, [browseMode, loungeFeedScope])

  const loadCommunityFeedRef = useRef(loadCommunityFeed)
  loadCommunityFeedRef.current = loadCommunityFeed

  const loadMoreCommunityFeed = useCallback(async () => {
    if (
      !communityFeedHasMore ||
      !communityFeedCursor ||
      communityFeedLoading ||
      communityFeedLoadingMore ||
      communityFeedHeadReloadingRef.current
    )
      return
    setCommunityFeedLoadingMore(true)
    try {
      const scope = loungeFeedScopeRef.current
      const sort = loungeFeedSortRef.current
      const excludedCategorySlugs = loungeFeedCategoryExcludedSlugsRef.current
      const asOf = loungeFeedPopularAsOfRef.current || new Date().toISOString()
      let followingAuthorIds = null
      if (scope === LOUNGE_FEED_SCOPE_FOLLOWING) {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const viewerId = session?.user?.id
        if (!viewerId) return
        followingAuthorIds = await fetchLoungeFollowingAuthorIds(supabaseClient, viewerId)
        if (followingAuthorIds.length === 0) return
      }

      const { data: rows, error } = await loungeFeedPageRpcQuery(supabaseClient, {
        sort,
        scope,
        followingAuthorIds,
        excludedCategorySlugs,
        limit: COMMUNITY_FEED_PAGE_SIZE + 1,
        asOf,
        cursor: communityFeedCursor,
      })

      if (error) return

      const list = rows || []
      const hasMore = list.length > COMMUNITY_FEED_PAGE_SIZE
      const pageRows = hasMore ? list.slice(0, COMMUNITY_FEED_PAGE_SIZE) : list
      const pageLast = pageRows.at(-1) || null
      const hydrated = await hydrateCommunityPosts(filterLoungeFeedTimelinePosts(pageRows))

      setCommunityPosts((prev) => [
        ...prev,
        ...hydrated.filter((row) => !prev.some((existing) => existing.id === row.id)),
      ])
      setCommunityFeedHasMore(hasMore)
      setCommunityFeedCursor(loungeFeedCursorFromPageLast(pageLast, sort, asOf))
    } finally {
      setCommunityFeedLoadingMore(false)
    }
  }, [
    COMMUNITY_FEED_PAGE_SIZE,
    communityFeedCursor,
    communityFeedHasMore,
    communityFeedLoading,
    communityFeedLoadingMore,
    hydrateCommunityPosts,
    supabaseClient,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') return
    syncLoungeFeedVideoDebugFromUrl()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyFromUrl = () => {
      const params = new URLSearchParams(window.location.search || '')
      const targetTab = params.get('tab')
      const postShareId = (params.get('post') || '').trim()
      const profileHandle = (params.get('u') || '').trim().replace(/^@/, '').toLowerCase()
      const profileUserId = (params.get('profile') || '').trim()
      const profilePathHandle = parseLoungeProfilePathHandle(window.location.pathname || '')
      if (
        isLoungePostShareId(postShareId) ||
        isLoungeProfileHandleSlug(profileHandle) ||
        isLoungeProfileHandleSlug(profilePathHandle) ||
        isLoungePostShareId(profileUserId)
      ) {
        setTab('home')
        setMenuOpen(false)
      }
      const targetEventId = params.get('eventId')
      const targetEventIdsRaw = params.get('eventIds')
      const targetEventIds = targetEventIdsRaw
        ? targetEventIdsRaw
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
        : []
      if (targetTab === 'offers') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
        } else {
          setTab('offers')
        }
      }
      if (targetTab === 'logbook') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
        } else {
          setTab('logbook')
          setMenuOpen(false)
          const playLogEntry = (params.get('playLogEntry') || '').trim()
          if (playLogEntry) setPendingPlayLogEntryId(playLogEntry)
        }
      }
      if (targetTab === 'chat') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
        } else {
          setTab('chat')
          setMenuOpen(false)
          const roomId = (params.get('room') || '').trim()
          if (roomId) setPendingChatRoomId(roomId)
        }
      }
      const guideFromQuery = (params.get('guide') || '').trim()
      const guideFromPath = parseGuideSlugFromPathname(window.location.pathname || '')
      const guideSlug = guideFromQuery || guideFromPath
      if (guideSlug) {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
        } else {
          setGuideOpenCardSlug(normalizeGuideAccessSlug(guideSlug))
          setTab('guides')
          setMenuOpen(false)
        }
        try {
          const u = new URL(window.location.href)
          if (guideFromPath) u.pathname = '/'
          if (guideFromQuery) u.searchParams.delete('guide')
          const qs = u.searchParams.toString()
          const next = `${u.pathname || '/'}${qs ? `?${qs}` : ''}${u.hash}`
          window.history.replaceState({}, document.title, next)
        } catch {
          /* ignore */
        }
      }
      if (targetEventId && !targetEventIds.includes(targetEventId)) targetEventIds.unshift(targetEventId)
      if (targetEventIds.length > 0) {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
        } else {
          setPendingOfferEventIds(targetEventIds)
        }
      }
    }
    applyFromUrl()
    window.addEventListener('popstate', applyFromUrl)
    return () => window.removeEventListener('popstate', applyFromUrl)
  }, [browseMode])

  /** Only refire when entering Lounge - not when `loadCommunityFeed` identity changes (avoids scroll reset mid-feed). */
  useEffect(() => {
    if (tab === 'home') void loadCommunityFeedRef.current()
  }, [tab])

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator?.serviceWorker) return
    const handleServiceWorkerMessage = (event) => {
      const type = event?.data?.type
      if (type === 'offers-open-tab') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
          return
        }
        setTab('offers')
        return
      }
      if (type === 'lounge-activity-inapp') {
        const payload = loungeActivityInAppPayloadFromMessage(event?.data)
        if (payload) showLoungeActivityInAppToast(payload)
        return
      }
      if (type !== 'app-navigate') return
      const targetTab = event?.data?.tab
      if (targetTab === 'offers') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
          return
        }
        setTab('offers')
        return
      }
      if (targetTab === 'chat') {
        if (browseMode === 'anonymous') {
          onRequireAuthRef.current?.()
          return
        }
        setTab('chat')
        setMenuOpen(false)
        try {
          const msgUrl = new URL(event?.data?.url || '', window.location.origin)
          const roomId = (msgUrl.searchParams.get('room') || '').trim()
          if (roomId) setPendingChatRoomId(roomId)
        } catch {
          // ignore malformed url
        }
        return
      }
      if (targetTab === 'home' || !targetTab) {
        setTab('home')
        setMenuOpen(false)
        const activityEventId = event?.data?.activityEventId || null
        const activityBatchId = event?.data?.activityBatchId || null
        if (event?.data?.markActivityRead || activityEventId || activityBatchId) {
          queueLoungeActivityMarkRead({ activityEventId, activityBatchId })
          window.dispatchEvent(
            new CustomEvent('lounge-push-opened', {
              detail: { activityEventId, activityBatchId },
            }),
          )
        }
      }
    }
    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)
    return () => navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
  }, [browseMode, showLoungeActivityInAppToast])

  const openCalculator = (key) => {
    if (browseMode === 'anonymous') {
      onRequireAuth?.()
      setMenuOpen(false)
      return
    }
    if (!canOpenCalculator(key, { isStaff, hasSlotsEdge: hasActiveSubscription, gatesMap: contentAccessGatesMap })) {
      onRequireSubscribe?.('slots-edge')
      setMenuOpen(false)
      return
    }
    setActiveCalculator(key)
    setTab('calculators')
    setMenuOpen(false)
  }

  const openSlotsTool = useCallback((toolId) => {
    if (toolId !== 'calculators') setActiveCalculator(null)
    setTab(toolId)
  }, [])

  const openLogbook = useCallback(() => {
    setActiveCalculator(null)
    setTab('logbook')
    setMenuOpen(false)
  }, [])

  const simulateTabError = useCallback(() => {
    setTabErrorTestOpen(true)
    setTabErrorTestTrigger((n) => n + 1)
  }, [])

  const dismissTabErrorTest = useCallback(() => {
    setTabErrorTestOpen(false)
  }, [])

  const handleResetTabErrorStrikes = useCallback(() => {
    resetTabErrorStrikes()
  }, [])

  const backToSlotsHub = useCallback(() => {
    setActiveCalculator(null)
    setTab('slots')
    setMenuOpen(false)
  }, [])

  const SLOTS_TOOL_TAB_IDS = new Set(['calculators', 'offers', 'bankroll', 'guides', 'intel', 'logbook'])
  // `intel` - routable if tab set programmatically; not on Slots hub (Ryan, 2026-05-29).
  const isSlotsAreaTab = (activeTab) => activeTab === 'slots' || SLOTS_TOOL_TAB_IDS.has(activeTab)

  /** Title bar ☰ menu - Slots hub + Chat (Lounge via dock home; Team not in menu). */
  const navItems = [
    { id: 'slots', label: 'Slots', icon: '🎰', subscriberGated: false },
    { id: 'chat', label: 'Chat', icon: '💬', subscriberGated: false },
  ]

  const showNavSubscriberLocks =
    browseMode === 'member' && !isStaff && !hasActiveSubscription

  useEffect(() => {
    if (isStaff || hasActiveSubscription) return
    if (tab !== 'calculators' || !activeCalculator) return
    if (!calculatorRequiresSlotsEdge(activeCalculator, contentAccessGatesMap)) return
    onRequireSubscribe?.('slots-edge')
    setActiveCalculator(null)
  }, [tab, activeCalculator, isStaff, hasActiveSubscription, onRequireSubscribe, contentAccessGatesMap])

  const renderNavMenuItems = () =>
    navItems.map((item) => {
      const showLock = showNavSubscriberLocks && item.subscriberGated
      const isActive = tab === item.id || (item.id === 'slots' && isSlotsAreaTab(tab))
      return (
        <button
          key={item.id}
          type="button"
          title={showLock ? 'Subscribe to unlock Slots Edge' : undefined}
          onClick={() => {
            if (browseMode === 'anonymous' && item.id !== 'home') {
              onRequireAuth?.()
              setMenuOpen(false)
              return
            }
            if (showLock) {
              onRequireSubscribe?.('slots-edge')
              setMenuOpen(false)
              return
            }
            if (item.id === 'slots') {
              setActiveCalculator(null)
              setTab('slots')
            } else {
              setActiveCalculator(null)
              setTab(item.id)
            }
            setMenuOpen(false)
          }}
          className={`lounge-title-nav-menu-item w-full rounded-xl px-3 py-2.5 text-left text-sm touch-manipulation ${
            isActive
              ? 'lounge-title-nav-menu-item--active bg-zinc-800 text-white'
              : 'text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span aria-hidden>{item.icon}</span>
            <span className="min-w-0 flex-1 font-semibold truncate">{item.label}</span>
            {showLock ? <NavLockGlyph className="h-3.5 w-3.5 shrink-0 text-amber-400/95" /> : null}
          </span>
        </button>
      )
    })

  const slotsToolTitleBarCloseVisible =
    SLOTS_TOOL_TAB_IDS.has(tab) && !(tab === 'calculators' && activeCalculator)

  const renderTitleBarNavSlot = () => (
    <div className="flex items-center gap-1.5 shrink-0" data-title-bar-nav-cluster>
      <TitleBarQuickLinks
        browseMode={browseMode}
        hasSlotsEdge={hasActiveSubscription}
        isStaff={isStaff}
        gatesMap={contentAccessGatesMap}
        onNavigate={handleQuickLinkNavigate}
      />
      <div className="relative z-[55] shrink-0">
      {menuOpen ? (
        <div
          className="lounge-title-nav-menu absolute right-0 top-full z-[55] mt-1 min-w-[8.05rem] max-w-[min(10.5rem,calc(100vw-1rem))] w-max max-h-[min(22rem,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-5rem))] overflow-y-auto overscroll-y-contain rounded-2xl border border-zinc-800/80 bg-zinc-950/98 px-2 py-2 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-zinc-950/90"
          role="menu"
        >
          {renderNavMenuItems()}
        </div>
      ) : null}
      <button
        type="button"
        data-title-bar-menu-btn
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="lounge-title-nav-btn grid h-10 w-10 place-items-center rounded-xl border border-zinc-700/50 bg-zinc-800/90 text-white shadow-sm touch-manipulation hover:bg-zinc-800 [-webkit-tap-highlight-color:transparent]"
      >
        <span aria-hidden className="block leading-none text-xl -translate-y-px">
          {menuOpen ? '×' : '☰'}
        </span>
      </button>
      </div>
      {slotsToolTitleBarCloseVisible ? (
        <TitleBarCloseButton onClick={backToSlotsHub} ariaLabel="Close" />
      ) : null}
    </div>
  )

  const handleQuickLinkNavigate = useCallback((id) => {
    const dest = QUICK_LINK_BY_ID[id]
    if (!dest) return
    setMenuOpen(false)
    setActiveCalculator(null)
    if (browseMode !== 'member') {
      onRequireAuth?.()
      return
    }
    if (!isStaff && !hasActiveSubscription) {
      if (dest.requiresSlotsEdge) {
        onRequireSubscribe?.('slots-edge')
        return
      }
      if (dest.guidesTabGate && guidesTabFullyGated(contentAccessGatesMap)) {
        onRequireSubscribe?.('slots-edge')
        return
      }
      if (id === 'calculators' && calculatorsTabFullyGated(contentAccessGatesMap)) {
        onRequireSubscribe?.('slots-edge')
        return
      }
    }
    setTab(dest.tab)
  }, [
    browseMode,
    contentAccessGatesMap,
    hasActiveSubscription,
    isStaff,
    onRequireAuth,
    onRequireSubscribe,
  ])

  useEffect(() => {
    if (isStaff || hasActiveSubscription) return
    if (!['bankroll', 'logbook', 'guides', 'calculators'].includes(tab)) return
    void refreshFreemiumUsage()
  }, [tab, isStaff, hasActiveSubscription, refreshFreemiumUsage])

  useEffect(() => {
    if (browseMode !== 'anonymous') return
    if (tab === 'home') return
    setTab('home')
    setMenuOpen(false)
  }, [browseMode, tab])

  useEffect(() => {
    if (shouldShowLoungeColdBootSplash({ tab: 'home', pendingWork: false })) {
      void import('../lounge/SocialFeed.jsx')
    }
  }, [])

  /** Prefetch AP Guides chunk while Lounge is visible (Ask Community embed taps). */
  useEffect(() => {
    if (tab !== 'home') return undefined
    void import('../guides/GuidesScreen.jsx')
    return undefined
  }, [tab])

  const openGuideFromLounge = useCallback((rawSlug) => {
    const slug = normalizeGuideAccessSlug(rawSlug)
    if (!slug) return
    setActiveCalculator(null)
    setMenuOpen(false)
    void import('../guides/GuidesScreen.jsx')
      .then(() => {
        try {
          sessionStorage.removeItem(GUIDES_SCREEN_CHUNK_RELOAD_KEY)
        } catch {
          /* ignore */
        }
        setGuideOpenCardSlug(slug)
        setTab('guides')
      })
      .catch(() => {
        try {
          if (!sessionStorage.getItem(GUIDES_SCREEN_CHUNK_RELOAD_KEY)) {
            sessionStorage.setItem(GUIDES_SCREEN_CHUNK_RELOAD_KEY, '1')
            window.location.assign(`/?guide=${encodeURIComponent(slug)}`)
          }
        } catch {
          /* ignore */
        }
      })
  }, [])

  const { splashVisible, splashDismissing, onSplashAnimationStart, onSplashAnimationComplete } =
    useLoungeColdBootSplash({
    tab,
    browseMode,
  })

  /** Queue iOS Home Screen (PWA) notification opt-in on first auth - do not show until UI is stable. */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isIosDevice() || !isStandalonePwa()) return

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((event, session) => {
      if (!isPwaNotifPromptAuthEvent(event)) return
      const userId = session?.user?.id
      if (!userId || hasSeenPwaNotifPrompt(userId) || iosPwaNotifPromptInFlightRef.current) return
      const permission = window.Notification?.permission
      if (permission === 'granted' || permission === 'denied') {
        markPwaNotifPromptSeen(userId)
        if (permission === 'granted') {
          setPwaNotifEnablePending(userId)
        }
        return
      }
      setPwaNotifPromptUserId(userId)
    })

    return () => subscription.unsubscribe()
  }, [supabaseClient])

  /** Show queued PWA notification prompt only after signed-in member UI + cold-boot splash finish. */
  useEffect(() => {
    if (!pwaNotifPromptUserId) return
    if (browseMode !== 'member' || !authSessionReady || splashVisible) return
    if (iosPwaNotifPromptInFlightRef.current) return

    const userId = pwaNotifPromptUserId
    const settleMs = 450
    const timer = window.setTimeout(() => {
      if (iosPwaNotifPromptInFlightRef.current) return
      iosPwaNotifPromptInFlightRef.current = true
      setPwaNotifPromptUserId(null)

      void (async () => {
        try {
          const shouldEnable = await showGlobalConfirm({
            title: 'Enable Notifications',
            message: 'Allow notifications for this Home Screen app now?',
            confirmLabel: 'Enable',
            cancelLabel: 'Not now',
          })
          markPwaNotifPromptSeen(userId)
          if (!shouldEnable) return
          const nextPermission = await window.Notification?.requestPermission?.()
          if (nextPermission === 'granted') {
            setPwaNotifEnablePending(userId)
          }
        } catch {
          markPwaNotifPromptSeen(userId)
        } finally {
          iosPwaNotifPromptInFlightRef.current = false
        }
      })()
    }, settleMs)

    return () => window.clearTimeout(timer)
  }, [pwaNotifPromptUserId, browseMode, authSessionReady, splashVisible, showGlobalConfirm])

  const homeSuspenseFallback =
    tab === 'home' ? <div className="min-h-dvh w-full bg-zinc-950" aria-hidden /> : null

  const renderTabContent = () => {
    /** Stay mounted across tabs so lounge composer / uploads are not torn down when browsing elsewhere in-app. */
    const keepAliveSocialFeed = (
      <Suspense fallback={homeSuspenseFallback}>
        <div
          key="lounge-keepalive"
          className={tab === 'home' ? 'contents min-h-0' : 'hidden'}
          inert={tab !== 'home'}
        >
          <SocialFeed
            supabaseClient={supabaseClient}
            onRequireAuth={onRequireAuth}
            communityPosts={communityPosts}
            setCommunityPosts={setCommunityPosts}
            communityFeedLoading={communityFeedLoading}
            communityFeedLoadingMore={communityFeedLoadingMore}
            communityFeedHasMore={communityFeedHasMore}
            communityFeedQueryErr={communityFeedQueryErr}
            loadCommunityFeed={loadCommunityFeed}
            loadMoreCommunityFeed={loadMoreCommunityFeed}
            hydrateCommunityPosts={hydrateCommunityPosts}
            titleBarNavSlot={renderTitleBarNavSlot()}
            hasActiveSubscription={hasActiveSubscription}
            isStaff={isStaff}
            loungeFeedScope={loungeFeedScope}
            onLoungeFeedScopeChange={onLoungeFeedScopeChange}
            loungeFeedSort={loungeFeedSort}
            onLoungeFeedSortChange={onLoungeFeedSortChange}
            loungeFeedCategoryExcludedSlugs={loungeFeedCategoryExcludedSlugs}
            onLoungeFeedCategoryFilterChange={onLoungeFeedCategoryFilterChange}
            loungeFeedBrowseMode={browseMode}
            authSessionReady={authSessionReady}
            coldBootSplashVisible={splashVisible}
            isActivePage={tab === 'home'}
            onNavigateToLoungeFeed={() => {
              setTab('home')
              setMenuOpen(false)
            }}
            onLogout={onLogout}
            onDeleteAccount={onDeleteAccount}
            deleteAccountBusy={deleteAccountBusy}
            onOpenGuideCard={openGuideFromLounge}
            onOpenChatWithUser={(peerUserId) => {
              if (!peerUserId) return
              setPendingChatPeerUserId(peerUserId)
              setTab('chat')
              setMenuOpen(false)
            }}
            onOpenChatRoomFromDock={(roomId) => {
              if (roomId) setPendingChatRoomId(roomId)
              setTab('chat')
              setMenuOpen(false)
            }}
            requestOpenProfileUserId={pendingLoungeProfileUserId}
            onRequestOpenProfileConsumed={() => setPendingLoungeProfileUserId(null)}
            onOpenLegalDocument={onOpenLegalDocument}
            onSimulateTabError={simulateTabError}
            onResetTabErrorStrikes={handleResetTabErrorStrikes}
          />
        </div>
      </Suspense>
    )

    /** Lazy tab content: own Suspense so a loading lounge chunk does not block Offers / Guides / etc. */
    let visibleTab = null
    if (tab === 'slots') {
      visibleTab = (
        <SlotsScreen
          titleBarNavSlot={renderTitleBarNavSlot()}
          browseMode={browseMode}
          onOpenAuth={() => onOpenAuth?.('login')}
          onOpenTool={openSlotsTool}
          onRequireSubscribe={onRequireSubscribe}
          hasSlotsEdge={hasActiveSubscription}
          isStaff={isStaff}
          gatesMap={contentAccessGatesMap}
        />
      )
    } else if (tab === 'calculators') {
      visibleTab = (
        <CalculatorsTab
          activeCalculator={activeCalculator}
          setActiveCalculator={setActiveCalculator}
          browseMode={browseMode}
          onOpenAuth={() => onOpenAuth?.('login')}
          hasSlotsEdge={hasActiveSubscription}
          isStaff={isStaff}
          isAdmin={isAdmin}
          gatesMap={contentAccessGatesMap}
          gatesDbReady={contentAccessGatesDbReady}
          onSetContentGate={onSetContentAccessGate}
          onRequireSubscribe={onRequireSubscribe}
          onOpenLogbook={openLogbook}
          logPlayLocked={!canCreatePlayLog}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
          supabaseClient={supabaseClient}
        />
      )
    } else if (tab === 'dashboard') {
      visibleTab = (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={renderTitleBarNavSlot()} contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-white text-2xl font-black tracking-tight">Edge</div>
              <div className="text-zinc-400 text-sm mt-0.5">Lounge</div>
            </div>
            {browseMode === 'member' ? (
              <button
                onClick={onLogout}
                className="min-h-10 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm font-semibold touch-manipulation"
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenAuth?.('login')}
                className="min-h-10 px-4 rounded-2xl bg-cyan-700 hover:bg-cyan-600 text-white text-sm font-semibold touch-manipulation"
              >
                Log in
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => setTab('calculators')}
              className="bg-zinc-900 rounded-3xl p-4 text-left touch-manipulation active:scale-[0.99]"
            >
              <div className="text-zinc-400 text-xs">Quick action</div>
              <div className="text-white font-bold text-lg mt-1">Open calculators</div>
              <div className="text-zinc-500 text-xs mt-1">Favorites + recent</div>
            </button>
            <button
              onClick={() => openCalculator('stackup')}
              className="bg-zinc-900 rounded-3xl p-4 text-left touch-manipulation active:scale-[0.99]"
            >
              <div className="text-zinc-400 text-xs">Quick eval</div>
              <div className="text-white font-bold text-lg mt-1">Stack Up Pays</div>
              <div className="text-zinc-500 text-xs mt-1">Jump into meters</div>
            </button>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white font-bold">Community feed</div>
              <button
                onClick={() => setTab('offers')}
                className="text-cyan-300 text-sm font-semibold hover:text-cyan-200"
              >
                View calendar →
              </button>
            </div>
            <p className="text-zinc-500 text-xs mb-3 leading-relaxed">
              Questions posted from <span className="text-zinc-400">Guides → Ask community</span> appear here in the
              Lounge feed.
            </p>
            {communityFeedLoading && communityPosts.length === 0 ? (
              <div className="text-zinc-500 text-sm py-2">Loading feed…</div>
            ) : communityPosts.length === 0 ? (
              <div className="rounded-2xl bg-zinc-800/70 p-4 text-zinc-400 text-sm leading-relaxed">
                No posts yet. Open a guide card and use{' '}
                <span className="text-zinc-200 font-semibold">Ask community</span>, or tap compose in the Lounge.
              </div>
            ) : (
              <div className="space-y-3">
                {communityPosts.map((p) => (
                  <div key={p.id} className="rounded-2xl bg-zinc-800/70 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="text-zinc-200 font-semibold">
                        {renderRichCaption(feedPostDisplayCaption(p) || 'Post', {
                          hashtagClassName: 'font-semibold text-cyan-400',
                        })}
                      </div>
                      {p.game_title ? (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-400/90 shrink-0">{p.game_title}</span>
                      ) : null}
                    </div>
                    <div className="text-zinc-600 text-[11px] mt-2">
                      {p.created_at
                        ? new Date(p.created_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollLinkedEdgeTitleBarShell>
      )
    } else if (tab === 'guides') {
      visibleTab = (
        <GuidesScreen
          supabaseClient={supabaseClient}
          onOpenCalculator={openCalculator}
          onOpenLogbook={openLogbook}
          onNavigateHome={() => setTab('home')}
          onCommunityPosted={loadCommunityFeed}
          onRequireAuth={onRequireAuth}
          hasSlotsEdge={hasActiveSubscription}
          isStaff={isStaff}
          isAdmin={isAdmin}
          gatesMap={contentAccessGatesMap}
          gatesDbReady={contentAccessGatesDbReady}
          onSetContentGate={onSetContentAccessGate}
          onRequireSubscribe={onRequireSubscribe}
          canCreatePlayLog={canCreatePlayLog}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
          openCardSlug={guideOpenCardSlug}
        />
      )
    } else if (tab === 'offers') {
      visibleTab = (
        <OffersCalendar
          supabaseClient={supabaseClient}
          pendingOfferEventIds={pendingOfferEventIds}
          setPendingOfferEventIds={setPendingOfferEventIds}
          offerSpotlightEventIds={offerSpotlightEventIds}
          setOfferSpotlightEventIds={setOfferSpotlightEventIds}
          hasSlotsEdge={hasActiveSubscription || isStaff}
          onRequireSubscribe={() => onRequireSubscribe?.('slots-edge')}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
          isAdmin={isAdmin}
        />
      )
    } else if (tab === 'bankroll') {
      visibleTab = (
        <BankrollTracker
          supabaseClient={supabaseClient}
          canCreateBankrollSession={canCreateBankrollSession}
          bankrollSessionsRemaining={bankrollSessionsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
          onRequireSubscribeForBankroll={() => onRequireSubscribe?.('slots-edge')}
          onBankrollSessionCreated={refreshFreemiumUsage}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
        />
      )
    } else if (tab === 'logbook') {
      visibleTab = (
        <PlayLogbook
          supabaseClient={supabaseClient}
          isAdmin={isAdmin}
          canCreatePlayLog={canCreatePlayLog}
          playLogsRemaining={playLogsRemaining}
          freemiumUsageLoading={freemiumUsageLoading}
          onRequireSubscribeForPlayLog={() => onRequireSubscribe?.('slots-edge')}
          onPlayLogCreated={refreshFreemiumUsage}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
          highlightEntryId={pendingPlayLogEntryId}
          onHighlightEntryConsumed={() => setPendingPlayLogEntryId(null)}
        />
      )
    } else if (tab === 'intel') {
      visibleTab = (
        <LocalIntel
          supabaseClient={supabaseClient}
          titleBarNavSlot={renderTitleBarNavSlot()}
          titleBarToolCloseVisible={slotsToolTitleBarCloseVisible}
        />
      )
    } else if (tab === 'chat') {
      visibleTab = (
        <ChatTab
          supabaseClient={supabaseClient}
          hasActiveSubscription={hasActiveSubscription}
          isStaff={isStaff}
          browseMode={browseMode}
          onRequireAuth={() => onRequireAuth?.()}
          titleBarNavSlot={renderTitleBarNavSlot()}
          initialPeerUserId={pendingChatPeerUserId}
          onInitialPeerConsumed={() => setPendingChatPeerUserId(null)}
          initialRoomId={pendingChatRoomId}
          onInitialRoomConsumed={() => setPendingChatRoomId(null)}
          onViewProfile={(userId) => {
            if (!userId) return
            setPendingLoungeProfileUserId(userId)
            setTab('home')
            setMenuOpen(false)
          }}
        />
      )
    } else if (tab === 'team') {
      visibleTab = (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={renderTitleBarNavSlot()} contentClassName="px-3 py-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
          <div className="mb-6">
            <div className="text-white text-2xl font-black tracking-tight">Team / Deals</div>
            <div className="text-zinc-400 text-sm mt-0.5">Bring our team in (skeleton)</div>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5 mb-4">
            <div className="text-white font-bold">Request help on a play</div>
            <div className="text-zinc-400 text-sm mt-1">
              Intake flow for large plays you can’t take solo. (Run it / buy it / partner.)
            </div>
            <button
              type="button"
              className="mt-4 w-full min-h-12 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold touch-manipulation"
            >
              Start intake (coming soon)
            </button>
          </div>

          <div className="bg-zinc-900 rounded-3xl p-5">
            <div className="text-white font-bold">Submission status</div>
            <div className="text-zinc-500 text-sm mt-1">Submitted → Reviewing → Accepted → Coordinating</div>
          </div>
        </ScrollLinkedEdgeTitleBarShell>
      )
    }

    return (
      <>
        {keepAliveSocialFeed}
        {visibleTab != null ? (
          <TabErrorBoundary onBack={() => setTab('home')}>
            <Suspense fallback={<TabLoadingFallback />}>{visibleTab}</Suspense>
          </TabErrorBoundary>
        ) : null}
      </>
    )
  }

  return (
    <div className="min-h-dvh bg-zinc-950">
      {accessNotice ? (
        <div
          role="status"
          className="pointer-events-none fixed inset-x-0 top-0 z-[94] flex justify-center px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
        >
          <div className="pointer-events-auto flex w-full max-w-2xl items-start justify-between gap-3 rounded-2xl border border-amber-800/50 bg-amber-950/95 px-4 py-3 shadow-lg backdrop-blur">
            <p className="min-w-0 flex-1 text-left text-[13px] leading-snug text-amber-100">{accessNotice}</p>
            <button
              type="button"
              onClick={() => onDismissAccessNotice?.()}
              className="shrink-0 rounded-lg border border-amber-700/60 px-2.5 py-1 text-[12px] font-semibold text-amber-200 touch-manipulation hover:bg-amber-900/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {renderTabContent()}

      {loungeActivityInAppToast ? (
        <LoungeActivityInAppToast
          toast={loungeActivityInAppToast}
          onDismiss={dismissLoungeActivityInAppToast}
          onOpen={openLoungeActivityInAppToast}
        />
      ) : null}

      {splashVisible && tab === 'home' ? (
        <LoungeAppSplash
          dismissing={splashDismissing}
          onAnimationStart={onSplashAnimationStart}
          onAnimationComplete={onSplashAnimationComplete}
        />
      ) : null}

      {globalConfirmState.open ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/60 p-4"
          style={{ zIndex: Z_APP_ALERT }}
          onClick={() => closeGlobalConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-[17px] font-semibold text-zinc-100">{globalConfirmState.title}</div>
            {globalConfirmState.message ? (
              <div className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-300">{globalConfirmState.message}</div>
            ) : null}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => closeGlobalConfirm(false)}
                className="min-h-11 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 touch-manipulation"
              >
                {globalConfirmState.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => closeGlobalConfirm(true)}
                className="min-h-11 flex-1 rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-sm font-semibold text-white touch-manipulation"
              >
                {globalConfirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {menuOpen && (
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-black/35"
        />
      )}

      {isStaff && consoleLogHudEnabled ? <AppConsoleLogDebugHud /> : null}

      {tabErrorTestOpen && isStaff ? (
        <div
          className="fixed inset-0 z-[300] flex w-full flex-col bg-zinc-950"
          data-tab-error-test-overlay
          aria-hidden={false}
        >
          <TabErrorBoundary
            variant="fullscreen"
            onRecover={dismissTabErrorTest}
            onBack={dismissTabErrorTest}
            simulatorTrigger={tabErrorTestTrigger}
          />
        </div>
      ) : null}

    </div>
  )
}
