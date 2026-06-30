import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { loungePostInteractionScore } from '../utils/communityFeedPost'
import {
  loungePostCategoryPillChipClass,
  loungePostCategoryPillLabel,
  matchLoungePostCategoryPillsForSearch,
} from '../utils/loungePostCategoryPills.js'
import EdgeLogoWithEasterEgg from './EdgeLogoWithEasterEgg.jsx'
import PwaInstallTitleBarRow from './PwaInstallBanner.jsx'
import TitleBarStatusLine from './TitleBarStatusLine.jsx'
import LoungePostArticle from '../features/lounge/LoungePostArticle.jsx'
import LoungeOgBadge from '../features/lounge/LoungeOgBadge.jsx'
import {
  LOUNGE_FEED_AVATAR_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_POST_ROW_CLASS,
} from '../features/lounge/loungeFeedAvatar.js'
import { useQuickLinkIds } from '../features/shell/quickLinksStore.js'
import { edgeLogoTitleBarClassName } from '../features/shell/titleBarLayout.js'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../features/profiles/profileGate.js'
import {
  formatLoungeSearchError,
  LOUNGE_SEARCH_MIN_CHARS,
  LOUNGE_SEARCH_MAX_CHARS,
  LOUNGE_SEARCH_SORT,
  SEARCH_DEBOUNCE_MS,
  hydrateLoungeSearchCommentResults,
  loungeSearch,
} from '../features/lounge/loungeSearchApi.js'
import LoungeSearchCommentResultRow from '../features/lounge/LoungeSearchCommentResultRow.jsx'
import LoungeSearchSortSwitch from '../features/lounge/LoungeSearchSortSwitch.jsx'
import {
  LoungeFeedCoordinatorSuspendBinder,
  LoungeFeedVideoAutoplayProvider,
} from '../features/lounge/LoungeFeedVideoAutoplayContext.jsx'
import {
  buildLoungeStreamLightboxCtxFromPostCardProps,
  LoungeStreamLightboxProvider,
} from '../features/lounge/LoungeStreamLightboxContext.jsx'
import LoungeChatPanel from '../features/lounge/LoungeChatPanel.jsx'
import LoungeNotificationsPanel from '../features/lounge/LoungeNotificationsPanel.jsx'
import { loungeDockFabScrollBottomInsetPx } from '../utils/loungeDockFabPosition.js'
import {
  loungeTitleRevealAfterScrollStep,
  loungeTitleRevealClampScrollDelta,
} from '../utils/loungeTitleRevealScroll.js'
import { renderPlainTextWithSearchHighlight } from '../utils/loungeSearchHighlight.jsx'
import {
  forgetLoungeSearchQuery,
  LOUNGE_SEARCH_RECENT_COMMIT_IDLE_MS,
  readLoungeSearchRecent,
  rememberLoungeSearchQuery,
} from '../utils/loungeSearchRecentPref.js'
import {
  readLoungeSearchSort,
} from '../utils/loungeSearchSortPref.js'
import { LOUNGE_NOTIFICATION_PREF_ROWS } from '../utils/loungeNotificationPreferencesApi.js'
import LoungeDockMenuLayoutHelp from './LoungeDockMenuLayoutHelp.jsx'
import IosPwaInstallHelpDialog from './IosPwaInstallHelpDialog.jsx'
import { getTheme, setTheme } from '../utils/theme.js'
import {
  hasSeenLoungeIosPwaSetup,
  iosPwaInstallRequired,
  isSafariBrowser,
  markLoungeIosPwaSetupSeen,
} from '../utils/pwaNotificationPrompt.js'

const OPEN_MS = 300
const DISMISS_FRACTION = 0.22
const DISMISS_MIN_PX = 72
const COMMIT_PX = 10
/** Vertical must clearly beat horizontal to steal the gesture (thumb arcs skew slightly vertical). */
const VERTICAL_BEATS_HORIZONTAL = 1.52

/**
 * Full-screen Lounge dock panels (search / notifications / chat) over the feed column (`max-w-2xl`).
 * Same **title bar** chrome as the feed (logo, updating line, nav slot) with **scroll-linked hide/show**;
 * Bottom scroll inset clears the draggable FAB menu. On search / notifications / settings,
 * `SocialFeed` raises the viewport dock to z-index 100 above this `z-[99]` layer.
 * Swipe horizontally to dismiss (left or right). `viewportTitleTopPx` must
 * match the feed title’s `top` offset so the bar aligns with the main Lounge shell.
 *
 * Search tab: `postCardProps` is the same shape as profile/feed `LoungePostArticle` handlers (without
 * `repostMenuScrollRootRef`); this component injects `repostMenuScrollRootRef={panelScrollRef}`.
 */
export default function LoungeDockSlidePanels({
  openPanel,
  onClose,
  communityPosts = [],
  /** Props for `LoungePostArticle` on the search tab (e.g. `SocialFeed` `profilePostCardProps`). */
  postCardProps = null,
  /** Matches `SocialFeed` `loungeFeedViewportTopPx` (title `top` under shell padding). */
  viewportTitleTopPx = 0,
  titleBarNavSlot = null,
  communityFeedLoading = false,
  onHome,
  onSearch,
  onFollowingFilterToggle,
  followingFilterOn = false,
  followingFilterDisabled = false,
  onNotifications,
  onChat,
  onSettings,
  onOpenSettingsSection,
  settingsFocusSection = null,
  onSettingsFocusSectionHandled,
  activePanel = null,
  /** Open a post from search (full row); closes the panel and opens post detail like the main feed. */
  onOpenPostFromSearch,
  /** Signed-in Supabase client for Phase G server search RPCs. */
  searchSupabaseClient = null,
  /** Same as `AppShell` `hydrateCommunityPosts` - attaches author profiles + repost embeds. */
  hydrateSearchPosts = null,
  /** Open a profile row from search (`user_id` + optional `author_profile`). */
  onOpenProfileFromSearch,
  chatSupabaseClient = null,
  chatViewerUserId = '',
  chatHasActiveSubscription = false,
  chatIsStaff = false,
  chatInitialPeerUserId = null,
  onChatInitialPeerCleared,
  chatOnOpenRoom,
  notificationsSupabaseClient = null,
  notificationsViewerUserId = '',
  onOpenPostFromNotifications,
  onOpenProfileFromNotifications,
  onOpenOwnProfileFollowers,
  onNotificationsUnreadChange,
  notificationInteractionProps = null,
  /** Bumped when post detail closes over notifications - refresh interaction bar counts. */
  notificationInteractionCountsRefreshKey = 0,
  /** `'wheel'` | `'cornerL'` - persisted in `loungeDockMenuLayout:v1`. */
  dockMenuLayout = 'wheel',
  onDockMenuLayoutChange,
  feedVideoAutoplayEnabled = true,
  onFeedVideoAutoplayChange,
  feedVideoDebugEnabled = false,
  onFeedVideoDebugChange,
  consoleLogHudEnabled = false,
  onConsoleLogHudChange,
  /** Staff-only (admin/moderator): Settings developer toggles. */
  settingsViewerIsStaff = false,
  buildBadgeEnabled = false,
  onBuildBadgeChange,
  /** When true (e.g. FAB long-press), block scroll-region hits so gestures don’t fight the dock. */
  blockUnderlyingPointer = false,
  /** Scroll-linked 0–1 reveal for `LoungeDockArcCarouselPrototype` (same curve as panel title bar). */
  onTitleRevealChange,
  /** Pre-fill the search input when the panel opens (e.g. from a #hashtag tap). */
  initialSearchQuery = '',
  /** Freeze search scroll-root autoplay when post/comment detail is open over the panel. */
  videoCoordinatorSuspended = false,
  pushNotificationsEnabled = true,
  onPushNotificationsChange,
  pushNotificationsStatusHint = '',
  pushNotificationsBusy = false,
  pushNotificationsStatusMessage = '',
  notificationPrefs = null,
  notificationPrefsLoading = false,
  notificationPrefsSavingKey = '',
  notificationPrefsSchemaMissing = false,
  notificationPrefsError = '',
  onNotificationPrefToggle,
  onLogout,
  onDeleteAccount,
  deleteAccountBusy = false,
  /** Signed-in login email (read-only). */
  settingsAccountEmail = '',
  settingsHasActiveSubscription = false,
  settingsSupabaseClient = null,
  onSettingsEditProfile,
  /** Parent captures panel scroller for navigation return stack. */
  panelScrollRefOut = null,
  /** Restore scroll after caption navigation return. */
  restorePanelScrollTop = null,
  onPanelScrollRestored = null,
  /** Open a legal document in-app (e.g. Community Guidelines from Settings). */
  onOpenLegalDocument = null,
  /** Staff-only: trigger TabErrorBoundary on the active Slots tool tab. */
  onSimulateTabError = null,
  /** Staff-only: clear tab error strike count (False Start vs Fumble testing). */
  onResetTabErrorStrikes = null,
}) {
  const panelRef = useRef(null)
  const panelScrollRef = useRef(null)
  const panelTitleBarRef = useRef(null)
  const settingsNotificationsSectionRef = useRef(null)
  const settingsAccountSectionRef = useRef(null)
  const [panelW, setPanelW] = useState(300)
  const [tx, setTx] = useState(0)
  const [txTransition, setTxTransition] = useState(false)
  const dragTxRef = useRef(0)
  const closeTimerRef = useRef(0)

  const pointerIdRef = useRef(null)
  const startClientXRef = useRef(0)
  const startClientYRef = useRef(0)
  const startTxRef = useRef(0)
  const draggingRef = useRef(false)
  const decidedRef = useRef(false)
  const horizontalRef = useRef(false)
  const pointerCapturedRef = useRef(false)

  const [panelTitleBarHeight, setPanelTitleBarHeight] = useState(0)
  const panelTitleRevealRef = useRef(1)
  const [panelTitleReveal, setPanelTitleReveal] = useState(1)
  const quickLinkIds = useQuickLinkIds()
  const panelTitleLogoClassName = edgeLogoTitleBarClassName(quickLinkIds.length, { panelCloseVisible: true })
  const panelScrollPrevTopRef = useRef(0)
  const panelScrollVisualRafRef = useRef(0)

  const onOpenNotificationSettings = useCallback(() => {
    onOpenSettingsSection?.('notifications')
  }, [onOpenSettingsSection])

  const [notificationsSettingsOpen, setNotificationsSettingsOpen] = useState(false)
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false)
  const [menuLayoutSettingsOpen, setMenuLayoutSettingsOpen] = useState(false)
  const [adminUtilsSettingsOpen, setAdminUtilsSettingsOpen] = useState(false)
  const [currentTheme, setCurrentTheme] = useState(() => getTheme())
  const [iosPwaHelpOpen, setIosPwaHelpOpen] = useState(false)
  const [iosInstallBannerHidden, setIosInstallBannerHidden] = useState(false)
  const [iosInstallRequired, setIosInstallRequired] = useState(false)
  const [iosSafariBrowser, setIosSafariBrowser] = useState(false)
  const [passwordResetBusy, setPasswordResetBusy] = useState(false)
  const [passwordResetMessage, setPasswordResetMessage] = useState('')
  const [passwordResetError, setPasswordResetError] = useState('')

  useEffect(() => {
    if (panelScrollRefOut) panelScrollRefOut.current = panelScrollRef.current
  }, [openPanel, panelScrollRefOut])

  useLayoutEffect(() => {
    if (restorePanelScrollTop == null) return
    const el = panelScrollRef.current
    if (!el) return
    el.scrollTop = restorePanelScrollTop
    requestAnimationFrame(() => {
      if (panelScrollRef.current) panelScrollRef.current.scrollTop = restorePanelScrollTop
      onPanelScrollRestored?.()
    })
  }, [openPanel, onPanelScrollRestored, restorePanelScrollTop])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setIosInstallRequired(iosPwaInstallRequired())
    setIosSafariBrowser(isSafariBrowser())
  }, [])

  useEffect(() => {
    if (openPanel !== 'settings') {
      setNotificationsSettingsOpen(false)
      setAccountSettingsOpen(false)
      setMenuLayoutSettingsOpen(false)
      setAdminUtilsSettingsOpen(false)
      setIosPwaHelpOpen(false)
      setPasswordResetMessage('')
      setPasswordResetError('')
    }
  }, [openPanel])

  useEffect(() => {
    if (!notificationsSettingsOpen || !iosInstallRequired || hasSeenLoungeIosPwaSetup()) return
    markLoungeIosPwaSetupSeen()
    setIosPwaHelpOpen(true)
  }, [notificationsSettingsOpen, iosInstallRequired])

  const openIosPwaHelp = useCallback(() => {
    setIosPwaHelpOpen(true)
  }, [])

  const onPushNotificationsToggle = useCallback(() => {
    const nextEnabled = !pushNotificationsEnabled
    if (nextEnabled && iosInstallRequired) {
      openIosPwaHelp()
      return
    }
    onPushNotificationsChange?.(nextEnabled)
  }, [pushNotificationsEnabled, iosInstallRequired, openIosPwaHelp, onPushNotificationsChange])

  useLayoutEffect(() => {
    if (openPanel !== 'settings' || settingsFocusSection !== 'notifications') return
    setNotificationsSettingsOpen(true)
    const scroller = panelScrollRef.current
    const section = settingsNotificationsSectionRef.current
    if (!scroller || !section) return
    const scrollerTop = scroller.getBoundingClientRect().top
    const sectionTop = section.getBoundingClientRect().top
    scroller.scrollTop += sectionTop - scrollerTop - 8
    onSettingsFocusSectionHandled?.()
  }, [openPanel, settingsFocusSection, onSettingsFocusSectionHandled])

  useLayoutEffect(() => {
    if (openPanel !== 'settings' || settingsFocusSection !== 'account') return
    setAccountSettingsOpen(true)
    const scroller = panelScrollRef.current
    const section = settingsAccountSectionRef.current
    if (!scroller || !section) return
    const top = section.offsetTop - 8
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    onSettingsFocusSectionHandled?.()
  }, [openPanel, settingsFocusSection, onSettingsFocusSectionHandled])

  const settingsMembershipLabel = useMemo(() => {
    if (settingsViewerIsStaff) return 'Staff'
    if (settingsHasActiveSubscription) return 'Subscriber'
    return 'Free'
  }, [settingsHasActiveSubscription, settingsViewerIsStaff])

  const onSettingsChangePassword = useCallback(async () => {
    const email = String(settingsAccountEmail || '').trim()
    if (!email || !settingsSupabaseClient || passwordResetBusy) return
    setPasswordResetBusy(true)
    setPasswordResetMessage('')
    setPasswordResetError('')
    try {
      const { error } = await settingsSupabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setPasswordResetMessage('If this email is on your account, a reset link is on its way.')
    } catch (e) {
      setPasswordResetError(e instanceof Error ? e.message : 'Could not send reset email.')
    } finally {
      setPasswordResetBusy(false)
    }
  }, [passwordResetBusy, settingsAccountEmail, settingsSupabaseClient])

  const showAccountSection = typeof onLogout === 'function'

  const [q, setQ] = useState(() => initialSearchQuery || '')
  const [searchTextAfterCategory, setSearchTextAfterCategory] = useState('')
  const searchInputRef = useRef(null)
  const [searchPosts, setSearchPosts] = useState([])
  const [searchProfiles, setSearchProfiles] = useState([])
  const [searchComments, setSearchComments] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  /** Last query we finished fetching (success or error) - avoids "No results" during debounce. */
  const [searchSettledQuery, setSearchSettledQuery] = useState('')
  const [searchCategorySlug, setSearchCategorySlug] = useState('')
  const [searchSettledCategorySlug, setSearchSettledCategorySlug] = useState('')
  const [searchRecent, setSearchRecent] = useState(() => readLoungeSearchRecent())
  const [searchInputFocused, setSearchInputFocused] = useState(false)
  const [searchSort, setSearchSort] = useState(() => readLoungeSearchSort())
  const [searchPagination, setSearchPagination] = useState({
    postsHasMore: false,
    profilesHasMore: false,
    commentsHasMore: false,
  })
  const [searchLoadingMore, setSearchLoadingMore] = useState(false)
  const searchPostsRef = useRef([])
  const searchProfilesRef = useRef([])
  const searchCommentsRef = useRef([])
  const searchFetchSeqRef = useRef(0)
  searchPostsRef.current = searchPosts
  searchProfilesRef.current = searchProfiles
  searchCommentsRef.current = searchComments
  const refreshSearchInteractionsRef = useRef(postCardProps?.refreshPostInteractions)
  refreshSearchInteractionsRef.current = postCardProps?.refreshPostInteractions

  const trimmedQuery = searchCategorySlug ? searchTextAfterCategory.trim() : q.trim()
  const queryReady = trimmedQuery.length >= LOUNGE_SEARCH_MIN_CHARS
  const searchFetchActive = queryReady || Boolean(searchCategorySlug)
  const searchSettled =
    searchSettledQuery === trimmedQuery && searchSettledCategorySlug === (searchCategorySlug || '')
  const categorySuggestions = useMemo(
    () => (searchCategorySlug ? [] : matchLoungePostCategoryPillsForSearch(q.trim())),
    [q, searchCategorySlug],
  )

  const clearSearchInput = useCallback(() => {
    setQ('')
    setSearchTextAfterCategory('')
    setSearchCategorySlug('')
  }, [])

  const selectSearchCategory = useCallback((slug) => {
    setSearchCategorySlug(slug)
    setSearchTextAfterCategory('')
    setQ('')
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [])
  const searchHasResults =
    searchPosts.length > 0 || searchProfiles.length > 0 || searchComments.length > 0
  /** Full "Searching…" row only when there is nothing to show yet - refetches keep stale results. */
  const showSearchInitialLoading = searchLoading && !searchHasResults
  const showSearchLoadMore =
    searchFetchActive &&
    !searchLoading &&
    !searchError &&
    searchSettled &&
    (searchPagination.postsHasMore ||
      searchPagination.commentsHasMore ||
      searchPagination.profilesHasMore)

  const runSearchFetch = useCallback(
    async ({
      append = false,
      query = trimmedQuery,
      sort = searchSort,
      categorySlug = searchCategorySlug,
    } = {}) => {
      if (!searchSupabaseClient || !hydrateSearchPosts) return
      const categorySlugs = categorySlug ? [categorySlug] : null
      const canFetch = query.length >= LOUNGE_SEARCH_MIN_CHARS || categorySlugs
      if (!canFetch) return

      const seq = ++searchFetchSeqRef.current
      const postsOffset = append ? searchPostsRef.current.length : 0
      const profilesOffset = append ? searchProfilesRef.current.length : 0
      const commentsOffset = append ? searchCommentsRef.current.length : 0

      if (append) setSearchLoadingMore(true)
      else {
        setSearchLoading(true)
        setSearchError(null)
      }

      try {
        const result = await loungeSearch(searchSupabaseClient, query, {
          sort,
          postsOffset,
          profilesOffset,
          commentsOffset,
          categorySlugs,
        })

        const [hydrated, hydratedComments] = await Promise.all([
          result.posts.length ? hydrateSearchPosts(result.posts) : Promise.resolve([]),
          result.comments.length
            ? hydrateLoungeSearchCommentResults(searchSupabaseClient, hydrateSearchPosts, result.comments)
            : Promise.resolve([]),
        ])

        if (seq !== searchFetchSeqRef.current) return

        const ids = hydrated.map((p) => p.id).filter(Boolean)
        refreshSearchInteractionsRef.current?.(ids)

        if (append) {
          setSearchPosts((prev) => {
            const seen = new Set(prev.map((p) => String(p.id)))
            return [...prev, ...hydrated.filter((p) => p?.id && !seen.has(String(p.id)))]
          })
          setSearchProfiles((prev) => {
            const seen = new Set(prev.map((p) => String(p.user_id)))
            return [...prev, ...(result.profiles || []).filter((p) => p?.user_id && !seen.has(String(p.user_id)))]
          })
          setSearchComments((prev) => {
            const seen = new Set(prev.map(({ comment }) => String(comment?.id)))
            return [
              ...prev,
              ...hydratedComments.filter(({ comment }) => comment?.id && !seen.has(String(comment.id))),
            ]
          })
        } else {
          setSearchPosts(hydrated)
          setSearchProfiles(result.profiles || [])
          setSearchComments(hydratedComments)
        }

        setSearchPagination(result.pagination)
        setSearchSettledQuery(query)
        setSearchSettledCategorySlug(categorySlug || '')
      } catch (err) {
        if (!append) {
          setSearchPosts([])
          setSearchProfiles([])
          setSearchComments([])
          setSearchPagination({
            postsHasMore: false,
            profilesHasMore: false,
            commentsHasMore: false,
          })
        }
        setSearchError(formatLoungeSearchError(err))
        setSearchSettledQuery(query)
        setSearchSettledCategorySlug(categorySlug || '')
      } finally {
        if (seq !== searchFetchSeqRef.current) return
        if (append) setSearchLoadingMore(false)
        else setSearchLoading(false)
      }
    },
    [searchSupabaseClient, hydrateSearchPosts, trimmedQuery, searchSort, searchCategorySlug],
  )

  const onSearchLoadMore = useCallback(() => {
    if (searchLoading || searchLoadingMore || !showSearchLoadMore) return
    void runSearchFetch({ append: true })
  }, [searchLoading, searchLoadingMore, showSearchLoadMore, runSearchFetch])

  const showSearchNoResults =
    searchFetchActive &&
    !searchLoading &&
    !searchError &&
    searchSettled &&
    !searchHasResults

  const localTrendingPosts = useMemo(() => {
    const base = communityPosts || []
    const all = base.slice()
    all.sort((a, b) => {
      const d = loungePostInteractionScore(b) - loungePostInteractionScore(a)
      if (d !== 0) return d
      return new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
    })
    return all
  }, [communityPosts])

  const displaySearchFeedItems = useMemo(() => {
    if (!searchFetchActive) {
      return localTrendingPosts.map((post) => ({ kind: 'post', post }))
    }
    const items = [
      ...searchPosts.map((post) => ({
        kind: 'post',
        post,
        searchRelevance: Number(post.search_relevance) || 0,
        score: loungePostInteractionScore(post),
        createdAt: post?.created_at,
      })),
      ...(searchCategorySlug
        ? []
        : searchComments.map(({ comment, post }) => ({
            kind: 'comment',
            comment,
            post,
            searchRelevance: Number(comment.search_relevance) || 0,
            score: loungePostInteractionScore(comment),
            createdAt: comment?.created_at,
          }))),
    ]
    items.sort((a, b) => {
      const relDiff = b.searchRelevance - a.searchRelevance
      if (relDiff !== 0) return relDiff
      if (searchSort === LOUNGE_SEARCH_SORT.RECENT) {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      }
      const d = b.score - a.score
      if (d !== 0) return d
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
    return items
  }, [searchFetchActive, localTrendingPosts, searchPosts, searchComments, searchSort, searchCategorySlug])

  const showSearchSortOnPosts = searchFetchActive && displaySearchFeedItems.length > 0

  /** Search-only lightbox ctx - media fullscreen stays on search; no caption/comment chrome → post detail. */
  const searchPostCardProps = useMemo(() => {
    if (!postCardProps) return null
    return {
      ...postCardProps,
      loungeSearchHighlightQuery: queryReady ? trimmedQuery : '',
    }
  }, [postCardProps, queryReady, trimmedQuery])

  const searchLightboxCtx = useMemo(() => {
    if (!searchPostCardProps || openPanel !== 'search') return null
    return buildLoungeStreamLightboxCtxFromPostCardProps(searchPostCardProps, {
      onLightboxOpenDetail: null,
      onOpenComments: () => {},
    })
  }, [searchPostCardProps, openPanel])

  useEffect(() => {
    if (openPanel === 'search') {
      setSearchRecent(readLoungeSearchRecent())
    } else {
      setSearchInputFocused(false)
    }
  }, [openPanel])

  const commitSearchToRecent = useCallback(() => {
    if (trimmedQuery.length < LOUNGE_SEARCH_MIN_CHARS) return
    if (searchLoading || searchError) return
    if (searchSettledQuery !== trimmedQuery) return
    rememberLoungeSearchQuery(trimmedQuery)
    setSearchRecent(readLoungeSearchRecent())
  }, [trimmedQuery, searchLoading, searchError, searchSettledQuery])

  const openPanelPrevRef = useRef(openPanel)
  useEffect(() => {
    const prev = openPanelPrevRef.current
    openPanelPrevRef.current = openPanel
    if (prev === 'search' && openPanel !== 'search') {
      commitSearchToRecent()
    }
  }, [openPanel, commitSearchToRecent])

  useEffect(() => {
    if (openPanel !== 'search') return
    if (!queryReady || searchLoading || searchError) return
    if (searchSettledQuery !== trimmedQuery) return

    const timer = window.setTimeout(() => {
      rememberLoungeSearchQuery(trimmedQuery)
      setSearchRecent(readLoungeSearchRecent())
    }, LOUNGE_SEARCH_RECENT_COMMIT_IDLE_MS)

    return () => window.clearTimeout(timer)
  }, [
    openPanel,
    queryReady,
    searchLoading,
    searchError,
    searchSettledQuery,
    trimmedQuery,
  ])

  useEffect(() => {
    if (openPanel !== 'search') return
    if (!searchSupabaseClient || !hydrateSearchPosts) return

    if (!searchFetchActive) {
      searchFetchSeqRef.current += 1
      setSearchPosts([])
      setSearchProfiles([])
      setSearchComments([])
      setSearchError(null)
      setSearchLoading(false)
      setSearchLoadingMore(false)
      setSearchSettledQuery('')
      setSearchSettledCategorySlug('')
      setSearchPagination({
        postsHasMore: false,
        profilesHasMore: false,
        commentsHasMore: false,
      })
      return
    }

    setSearchSettledQuery((prev) => (prev === trimmedQuery ? prev : ''))
    setSearchSettledCategorySlug((prev) => (prev === (searchCategorySlug || '') ? prev : ''))

    const debounceMs = searchCategorySlug && !queryReady ? 0 : SEARCH_DEBOUNCE_MS

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return
        await runSearchFetch({
          append: false,
          query: trimmedQuery,
          sort: searchSort,
          categorySlug: searchCategorySlug,
        })
      })()
    }, debounceMs)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      searchFetchSeqRef.current += 1
    }
  }, [
    openPanel,
    trimmedQuery,
    queryReady,
    searchFetchActive,
    searchCategorySlug,
    searchSort,
    runSearchFetch,
  ])

  const panelTitleBarChromePx = panelTitleBarHeight > 0 ? panelTitleBarHeight : 56
  const scrollBottomInsetPx = loungeDockFabScrollBottomInsetPx()
  const titleHidePx = panelTitleBarHeight > 0 ? panelTitleBarHeight : 56
  const scrollPaddingTopPx = viewportTitleTopPx + panelTitleBarChromePx

  useLayoutEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const bar = panelTitleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setPanelTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [openPanel])

  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || typeof window === 'undefined') return
    let cancelled = false
    let innerRaf = 0
    const outerRaf = window.requestAnimationFrame(() => {
      if (cancelled) return
      const w = Math.round(el.getBoundingClientRect().width)
      const wClamped = Math.max(w || 300, 200)
      setPanelW(wClamped)
      setTxTransition(false)
      setTx(-wClamped)
      dragTxRef.current = -wClamped
      innerRaf = window.requestAnimationFrame(() => {
        if (cancelled) return
        const w2 = Math.round(el.getBoundingClientRect().width)
        const wc = Math.max(w2 || wClamped, 200)
        setPanelW(wc)
        setTxTransition(true)
        setTx(0)
        dragTxRef.current = 0
      })
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(outerRaf)
      if (innerRaf) window.cancelAnimationFrame(innerRaf)
    }
  }, [openPanel])

  useEffect(() => {
    const el = panelRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.getBoundingClientRect().width)
      if (w > 0) setPanelW(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!openPanel) return
    panelTitleRevealRef.current = 1
    setPanelTitleReveal(1)
    onTitleRevealChange?.(1)
  }, [openPanel, onTitleRevealChange])

  useEffect(() => {
    const el = panelScrollRef.current
    if (!el || typeof window === 'undefined' || !openPanel) return
    panelScrollPrevTopRef.current = el.scrollTop
    const queuePanelTitleFlush = () => {
      if (panelScrollVisualRafRef.current) return
      panelScrollVisualRafRef.current = window.requestAnimationFrame(() => {
        panelScrollVisualRafRef.current = 0
        const next = panelTitleRevealRef.current
        setPanelTitleReveal(next)
        onTitleRevealChange?.(next)
      })
    }
    const onScroll = () => {
      const st = el.scrollTop
      const prev = panelScrollPrevTopRef.current
      const rawDelta = st - prev
      panelScrollPrevTopRef.current = st
      const eff = rawDelta === 0 ? 0 : loungeTitleRevealClampScrollDelta(rawDelta)
      const titleStep = loungeTitleRevealAfterScrollStep({
        scrollTop: st,
        effectiveDelta: eff,
        revealRef: panelTitleRevealRef,
      })
      if (titleStep.changed) queuePanelTitleFlush()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (panelScrollVisualRafRef.current) {
        window.cancelAnimationFrame(panelScrollVisualRafRef.current)
        panelScrollVisualRafRef.current = 0
      }
    }
  }, [openPanel, onTitleRevealChange])

  const dismissWithAnimation = useCallback((direction = 'left') => {
    const w = Math.round(panelRef.current?.getBoundingClientRect().width || panelW)
    const wc = Math.max(w, 200)
    setPanelW(wc)
    setTxTransition(true)
    const endTx = direction === 'right' ? wc : -wc
    setTx(endTx)
    dragTxRef.current = endTx
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = 0
      onClose()
    }, OPEN_MS + 40)
  }, [onClose, panelW])

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = e.target
    if (t instanceof Element) {
      if (t.closest('input, textarea, select, label')) return
      if (t.closest('[data-lounge-panel-horizontal-scroll]')) return
      if (t.closest('button[aria-label="Close"]')) return
      if (t.closest('button[aria-label="Close panel"]')) return
    }
    if (!(e.currentTarget instanceof Element)) return
    pointerIdRef.current = e.pointerId
    startClientXRef.current = e.clientX
    startClientYRef.current = e.clientY
    startTxRef.current = dragTxRef.current
    draggingRef.current = true
    decidedRef.current = false
    horizontalRef.current = false
    pointerCapturedRef.current = false
    setTxTransition(false)
  }, [])

  const onPointerMove = useCallback(
    (e) => {
      if (!draggingRef.current || pointerIdRef.current !== e.pointerId) return
      const dx = e.clientX - startClientXRef.current
      const dy = e.clientY - startClientYRef.current
      if (!decidedRef.current) {
        if (Math.abs(dx) < COMMIT_PX && Math.abs(dy) < COMMIT_PX) return
        decidedRef.current = true
        if (Math.abs(dy) > Math.abs(dx) * VERTICAL_BEATS_HORIZONTAL) {
          draggingRef.current = false
          horizontalRef.current = false
          pointerIdRef.current = null
          setTxTransition(true)
          return
        }
        horizontalRef.current = true
        const cur = e.currentTarget
        if (cur instanceof Element && !pointerCapturedRef.current) {
          try {
            cur.setPointerCapture(e.pointerId)
            pointerCapturedRef.current = true
          } catch {
            // still try to drag without capture (e.g. lost race)
          }
        }
      }
      if (!horizontalRef.current) return
      e.preventDefault()
      const w = Math.max(panelW, 200)
      const next = Math.max(-w, Math.min(w, startTxRef.current + dx))
      dragTxRef.current = next
      setTx(next)
    },
    [panelW]
  )

  const endPointerGesture = useCallback(
    (e) => {
      if (pointerIdRef.current !== e.pointerId) return
      if (pointerCapturedRef.current && e.currentTarget instanceof Element) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          // ignore
        }
      }
      pointerCapturedRef.current = false
      pointerIdRef.current = null
      const wasHorizontal = horizontalRef.current
      draggingRef.current = false
      horizontalRef.current = false
      decidedRef.current = false
      setTxTransition(true)
      if (!wasHorizontal) return
      const cur = dragTxRef.current
      const w = Math.max(panelW, 200)
      const travel = Math.max(w * DISMISS_FRACTION, DISMISS_MIN_PX)
      const thresholdNeg = -travel
      const thresholdPos = travel
      if (cur <= thresholdNeg) {
        dismissWithAnimation('left')
      } else if (cur >= thresholdPos) {
        dismissWithAnimation('right')
      } else {
        setTx(0)
        dragTxRef.current = 0
      }
    },
    [dismissWithAnimation, panelW]
  )

  if (!openPanel) return null

  return (
    <>
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[99] flex h-dvh max-h-dvh justify-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={
          openPanel === 'search'
            ? 'Search lounge'
            : openPanel === 'notifications'
              ? 'Notifications'
              : openPanel === 'settings'
                ? 'Settings'
                : 'Chat'
        }
        className="pointer-events-auto relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-zinc-950 shadow-[0_0_0_1px_rgba(24,24,27,0.6)] will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translate3d(${tx}px, 0, 0)`,
          transition: txTransition ? `transform ${OPEN_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerGesture}
        onPointerCancel={endPointerGesture}
      >
      <div
        ref={panelTitleBarRef}
        className="pointer-events-auto absolute left-0 right-0 z-20 w-full border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform"
        style={{
          top: viewportTitleTopPx,
          transform: `translate3d(0, ${-(1 - panelTitleReveal) * titleHidePx}px, 0)`,
          pointerEvents: panelTitleReveal > 0.12 ? 'auto' : 'none',
        }}
      >
        <PwaInstallTitleBarRow
          rowClassName="px-3 py-2"
          logo={<EdgeLogoWithEasterEgg className={panelTitleLogoClassName} />}
          navSlot={
            <>
              <TitleBarStatusLine
                loading={communityFeedLoading}
                showBuildBadge={settingsViewerIsStaff && buildBadgeEnabled}
              />
              {titleBarNavSlot}
              <button
                type="button"
                onClick={() => dismissWithAnimation('left')}
                className="lounge-title-nav-btn pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-700/60 bg-zinc-900 text-zinc-200 touch-manipulation hover:bg-zinc-800"
                aria-label="Close panel"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </>
          }
        />
      </div>

      <div
        ref={panelScrollRef}
        className={
          openPanel === 'chat'
            ? 'min-h-0 flex flex-1 flex-col overflow-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y'
            : 'min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] touch-pan-y'
        }
        style={{
          paddingTop: scrollPaddingTopPx,
          paddingBottom: scrollBottomInsetPx,
          pointerEvents: blockUnderlyingPointer ? 'none' : undefined,
        }}
      >
        {openPanel === 'search' ? (
          <div className="px-3 pt-3">
            <div className="relative mb-2 flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900/90 py-1 pl-3 pr-1.5 focus-within:border-cyan-500/45 focus-within:ring-1 focus-within:ring-cyan-500/25">
              {searchCategorySlug ? (
                <>
                  <span
                    className={`lounge-category-pill inline-flex max-w-[min(42vw,9.5rem)] shrink-0 truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${loungePostCategoryPillChipClass(searchCategorySlug, 'display')}`}
                  >
                    {loungePostCategoryPillLabel(searchCategorySlug)}
                  </span>
                  <span className="shrink-0 text-[16px] font-medium text-zinc-400" aria-hidden>
                    +
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    role="searchbox"
                    value={searchTextAfterCategory}
                    onChange={(e) => setSearchTextAfterCategory(e.target.value)}
                    onFocus={() => setSearchInputFocused(true)}
                    onBlur={() => setSearchInputFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && searchTextAfterCategory === '') {
                        e.preventDefault()
                        setSearchCategorySlug('')
                        return
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        commitSearchToRecent()
                      }
                    }}
                    autoComplete="off"
                    maxLength={LOUNGE_SEARCH_MAX_CHARS}
                    aria-busy={searchLoading}
                    aria-label={`Search within ${loungePostCategoryPillLabel(searchCategorySlug)}`}
                    className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-[16px] text-zinc-100 outline-none"
                  />
                </>
              ) : (
                <input
                  ref={searchInputRef}
                  type="text"
                  role="searchbox"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchInputFocused(true)}
                  onBlur={() => setSearchInputFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitSearchToRecent()
                    }
                  }}
                  placeholder="Search posts, profiles, hashtags, games…"
                  autoComplete="off"
                  maxLength={LOUNGE_SEARCH_MAX_CHARS}
                  aria-busy={searchLoading}
                  className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-[16px] text-zinc-100 placeholder:text-zinc-500 outline-none"
                />
              )}
              {trimmedQuery || searchCategorySlug || searchLoading ? (
                <div className="flex shrink-0 items-center">
                  {searchLoading ? (
                    <span className="flex items-center px-0.5 text-zinc-500" aria-hidden>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400" />
                    </span>
                  ) : null}
                  {trimmedQuery || searchCategorySlug ? (
                    <button
                      type="button"
                      onClick={clearSearchInput}
                      aria-label="Clear search"
                      className="flex h-8 w-8 shrink-0 items-center justify-center text-[20px] leading-none text-zinc-500 touch-manipulation hover:text-zinc-300 [-webkit-tap-highlight-color:transparent]"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {searchInputFocused && !queryReady && !searchCategorySlug && searchRecent.length > 0 ? (
              <section className="mb-3">
                <h3 className="mb-1.5 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
                  Recent
                </h3>
                <div
                  data-lounge-panel-horizontal-scroll
                  className="-mx-3 flex flex-nowrap gap-2 overflow-x-auto overscroll-x-contain px-3 pb-0.5 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] touch-pan-x"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {searchRecent.map((term) => (
                    <span
                      key={term}
                      className="inline-flex max-w-[min(100%,14rem)] shrink-0 items-center rounded-full border border-zinc-700/90 bg-zinc-900/70 text-[14px] text-zinc-200"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setQ(term)}
                        className="min-w-0 truncate py-1 pl-3 pr-1 touch-manipulation hover:text-zinc-100 active:text-zinc-100 [-webkit-tap-highlight-color:transparent]"
                      >
                        {term}
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term} from recent searches`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setSearchRecent(forgetLoungeSearchQuery(term))}
                        className="flex h-7 w-7 shrink-0 items-center justify-center text-[16px] leading-none text-zinc-500 touch-manipulation hover:text-zinc-300 active:text-zinc-200 [-webkit-tap-highlight-color:transparent]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
            {showSearchInitialLoading ? (
              <p className="mb-3 text-[14px] leading-relaxed text-zinc-500">Searching…</p>
            ) : null}
            {searchError ? (
              <p className="mb-3 text-[14px] leading-relaxed text-red-400">{searchError}</p>
            ) : null}
            {!postCardProps ? (
              <p className="text-[14px] leading-relaxed text-zinc-500">Search is not available.</p>
            ) : showSearchNoResults ? (
              <p className="text-[14px] leading-relaxed text-zinc-500">No results.</p>
            ) : searchFetchActive && showSearchInitialLoading ? null : !searchFetchActive && localTrendingPosts.length === 0 ? (
              <p className="text-[14px] leading-relaxed text-zinc-500">No posts loaded yet.</p>
            ) : (
              <LoungeFeedVideoAutoplayProvider
                scrollRootRef={panelScrollRef}
                showDebugHud={settingsViewerIsStaff && feedVideoDebugEnabled && openPanel === 'search'}
              >
                <LoungeFeedCoordinatorSuspendBinder suspended={videoCoordinatorSuspended} />
                <LoungeStreamLightboxProvider ctx={searchLightboxCtx}>
                {queryReady && !searchCategorySlug && categorySuggestions.length > 0 ? (
                  <section className="mb-3">
                    <h3 className="mb-1.5 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
                      Tribes
                    </h3>
                    <ul className="list-none p-0">
                      {categorySuggestions.map(({ slug, label }) => (
                        <li key={slug}>
                          <button
                            type="button"
                            onClick={() => selectSearchCategory(slug)}
                            className="flex w-full items-center border-t border-zinc-800/70 bg-zinc-950/35 px-0.5 py-2.5 text-left touch-manipulation active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                          >
                            <span
                              className={`lounge-category-pill inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none ${loungePostCategoryPillChipClass(slug, 'display')}`}
                            >
                              {label}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                {queryReady && searchProfiles.length > 0 ? (
                  <section className="mb-3">
                    <h3 className="mb-1.5 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
                      Profiles
                    </h3>
                    <ul className="list-none p-0">
                      {searchProfiles.map((profile) => {
                        const displayName = String(profile.display_name || profile.handle || 'Member').trim()
                        const handle = String(profile.handle || '').trim()
                        const seed = profile.user_id || handle || displayName
                        const aboutMe = String(profile.about_me || '').trim()
                        return (
                          <li key={profile.user_id}>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenProfileFromSearch?.({
                                  user_id: profile.user_id,
                                  author_profile: profile,
                                })
                              }
                              className="flex w-full items-center gap-3 border-t border-zinc-800/70 bg-zinc-950/35 px-0.5 py-2.5 text-left touch-manipulation active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                            >
                              {profile.avatar_url ? (
                                <img
                                  src={profile.avatar_url}
                                  alt=""
                                  className={`${LOUNGE_FEED_AVATAR_CLASS} object-cover`}
                                />
                              ) : (
                                <div
                                  className={`${LOUNGE_FEED_AVATAR_CLASS} grid place-items-center ${profileAvatarToneClass(seed)}`}
                                >
                                  {profileAvatarInitials(displayName, handle)}
                                </div>
                              )}
                              <span className="min-w-0 flex-1">
                                <span className={LOUNGE_FEED_META_ROW_CLASS}>
                                  <span className="truncate font-semibold text-zinc-100">{displayName}</span>
                                  <LoungeOgBadge isOg={profile.is_og === true} size="feed" />
                                </span>
                                {handle ? (
                                  <span className="mt-0.5 block truncate text-[14px] text-zinc-500">@{handle}</span>
                                ) : null}
                                {aboutMe ? (
                                  <span className="mt-1 block line-clamp-2 text-[13px] leading-snug text-zinc-400">
                                    {renderPlainTextWithSearchHighlight(aboutMe, trimmedQuery)}
                                  </span>
                                ) : null}
                              </span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ) : null}
                {!searchFetchActive && localTrendingPosts.length > 0 ? (
                  <h3 className="mb-1 px-0.5 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
                    Trending in your feed
                  </h3>
                ) : null}
                {searchFetchActive && displaySearchFeedItems.length > 0 ? (
                  <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
                    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-zinc-500">Posts</h3>
                    {showSearchSortOnPosts ? (
                      <LoungeSearchSortSwitch
                        value={searchSort}
                        onChange={setSearchSort}
                        disabled={searchLoading && !searchHasResults}
                      />
                    ) : null}
                  </div>
                ) : null}
                {displaySearchFeedItems.map((item) =>
                  item.kind === 'comment' ? (
                    <LoungeSearchCommentResultRow
                      key={`comment:${item.comment.id}`}
                      comment={item.comment}
                      post={item.post}
                      postCardProps={searchPostCardProps}
                      scrollRootRef={panelScrollRef}
                      searchHighlightQuery={trimmedQuery}
                    />
                  ) : (
                    <article
                      key={`post:${item.post.id}`}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                      className={LOUNGE_FEED_POST_ROW_CLASS}
                      onClick={(e) => {
                        const t = e.target
                        if (!(t instanceof Element)) return
                        const origHost = t.closest('[data-lounge-original-embed]')
                        if (origHost && item.post.reposted_post?.id) {
                          onOpenPostFromSearch?.(item.post.reposted_post)
                          return
                        }
                        if (
                          t.closest(
                            'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                          )
                        )
                          return
                        onOpenPostFromSearch?.(item.post)
                      }}
                    >
                      <LoungePostArticle
                        post={item.post}
                        {...searchPostCardProps}
                        repostMenuScrollRootRef={panelScrollRef}
                      />
                    </article>
                  ),
                )}
                {showSearchLoadMore ? (
                  <div className="py-4">
                    <button
                      type="button"
                      onClick={onSearchLoadMore}
                      disabled={searchLoadingMore}
                      className="mx-auto flex min-h-10 items-center justify-center rounded-xl border border-zinc-700/90 bg-zinc-900/70 px-5 text-[14px] font-medium text-zinc-200 touch-manipulation hover:border-zinc-600 hover:bg-zinc-800/80 disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
                    >
                      {searchLoadingMore ? 'Loading…' : 'Load more'}
                    </button>
                  </div>
                ) : null}
                </LoungeStreamLightboxProvider>
              </LoungeFeedVideoAutoplayProvider>
            )}
          </div>
        ) : openPanel === 'chat' ? (
          <div className="flex min-h-0 flex-1 flex-col px-0 pt-2">
            <LoungeChatPanel
              supabaseClient={chatSupabaseClient}
              viewerUserId={chatViewerUserId}
              hasActiveSubscription={chatHasActiveSubscription}
              isStaff={chatIsStaff}
              initialPeerUserId={chatInitialPeerUserId}
              onClearInitialPeer={onChatInitialPeerCleared}
              onOpenChatRoom={chatOnOpenRoom}
            />
          </div>
        ) : openPanel === 'notifications' ? (
          <div className="px-0 pt-1">
            <LoungeNotificationsPanel
              supabaseClient={notificationsSupabaseClient}
              viewerUserId={notificationsViewerUserId}
              onOpenPost={onOpenPostFromNotifications}
              onOpenProfile={onOpenProfileFromNotifications}
              onOpenOwnProfileFollowers={onOpenOwnProfileFollowers}
              onUnreadChange={onNotificationsUnreadChange}
              onOpenNotificationSettings={onOpenNotificationSettings}
              notificationPostCardProps={notificationInteractionProps}
              repostMenuScrollRootRef={panelScrollRef}
              listScrollRootRef={panelScrollRef}
              interactionCountsRefreshKey={notificationInteractionCountsRefreshKey}
            />
          </div>
        ) : openPanel === 'settings' ? (
          <div className="px-3 py-4">
            <h2 className="text-[17px] font-semibold text-zinc-100">Settings</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-zinc-500">
              Lounge preferences.
            </p>

            {/* ── Appearance ── */}
            <div className="mt-5">
              <span className="block text-[15px] font-semibold text-zinc-100">Appearance</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                Choose dark, light, or follow your device.
              </span>
              <div className="mt-3 flex gap-1.5 rounded-xl bg-zinc-800/50 p-1">
                {[
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTheme(value)
                      setCurrentTheme(value)
                    }}
                    className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent] ${
                      currentTheme === value
                        ? 'bg-zinc-700 text-zinc-100 shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-5">
              <button
                type="button"
                aria-expanded={menuLayoutSettingsOpen}
                onClick={() => setMenuLayoutSettingsOpen((open) => !open)}
                className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/40"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-zinc-100">Menu button layout</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                    Wheel (O) or Edge (L), plus how to move the <span className="text-zinc-400">+</span> button.
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`mt-0.5 shrink-0 text-zinc-400 transition-transform duration-200 ${
                    menuLayoutSettingsOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {menuLayoutSettingsOpen ? (
                <div className="mt-2">
                  <LoungeDockMenuLayoutHelp
                    dockMenuLayout={dockMenuLayout}
                    onDockMenuLayoutChange={onDockMenuLayoutChange}
                  />
                </div>
              ) : null}
            </div>

            {showAccountSection ? (
              <div ref={settingsAccountSectionRef} className="mt-6 border-t border-zinc-800 pt-5">
                <button
                  type="button"
                  aria-expanded={accountSettingsOpen}
                  onClick={() => setAccountSettingsOpen((open) => !open)}
                  className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/40"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-zinc-100">Account</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                      Profile, sign-in email, password, and membership.
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`mt-0.5 shrink-0 text-zinc-400 transition-transform duration-200 ${
                      accountSettingsOpen ? 'rotate-180' : 'rotate-0'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                {accountSettingsOpen ? (
                  <div className="mt-2 rounded-xl border border-zinc-800/90 bg-zinc-950/40 divide-y divide-zinc-800/90">
                    {typeof onSettingsEditProfile === 'function' ? (
                      <button
                        type="button"
                        onClick={() => onSettingsEditProfile()}
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-3.5 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/50"
                      >
                        <span className="min-w-0">
                          <span className="block text-[15px] font-semibold text-zinc-100">Edit profile</span>
                          <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                            Photo, banner, handle, and about.
                          </span>
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          className="h-5 w-5 shrink-0 text-zinc-500"
                          fill="none"
                          aria-hidden
                        >
                          <path
                            d="M9 6l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}

                    <div className="px-3.5 py-3">
                      <div className="text-[15px] font-semibold text-zinc-100">Email</div>
                      <div className="mt-1 break-all text-[14px] text-zinc-300">
                        {settingsAccountEmail || '-'}
                      </div>
                      <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                        Login address for this account. Contact support to change it for now.
                      </p>
                    </div>

                    <div className="px-3.5 py-3">
                      <button
                        type="button"
                        disabled={!settingsAccountEmail || !settingsSupabaseClient || passwordResetBusy}
                        onClick={() => void onSettingsChangePassword()}
                        className="min-h-11 rounded-lg border border-zinc-700/90 bg-zinc-900/80 px-4 text-[14px] font-semibold text-zinc-100 touch-manipulation transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
                      >
                        {passwordResetBusy ? 'Sending reset link…' : 'Change password'}
                      </button>
                      <p className="mt-2 text-[12px] leading-snug text-zinc-500">
                        We&apos;ll email a link to set a new password.
                      </p>
                      {passwordResetMessage ? (
                        <p className="mt-2 text-[12px] leading-snug text-cyan-200/90">{passwordResetMessage}</p>
                      ) : null}
                      {passwordResetError ? (
                        <p className="mt-2 text-[12px] leading-snug text-red-300/90">{passwordResetError}</p>
                      ) : null}
                    </div>

                    <div className="px-3.5 py-3">
                      <div className="text-[15px] font-semibold text-zinc-100">Legal</div>
                      <div className="mt-2 flex flex-col gap-2 text-[14px]">
                        <a
                          href="/terms?from=settings"
                          onClick={(e) => {
                            e.preventDefault()
                            onOpenLegalDocument?.('terms', 'settings')
                          }}
                          className="min-h-11 inline-flex items-center text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
                        >
                          Terms &amp; Conditions
                        </a>
                        <a
                          href="/privacy?from=settings"
                          onClick={(e) => {
                            e.preventDefault()
                            onOpenLegalDocument?.('privacy', 'settings')
                          }}
                          className="min-h-11 inline-flex items-center text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
                        >
                          Privacy Policy
                        </a>
                        <a
                          href="/guidelines?from=settings"
                          onClick={(e) => {
                            e.preventDefault()
                            onOpenLegalDocument?.('guidelines', 'settings')
                          }}
                          className="min-h-11 inline-flex items-center text-orange-400 underline underline-offset-2 hover:text-orange-300 touch-manipulation"
                        >
                          Community Guidelines
                        </a>
                      </div>
                    </div>

                    <div className="px-3.5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-semibold text-zinc-100">Membership</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                            settingsViewerIsStaff
                              ? 'bg-fuchsia-500/20 text-fuchsia-200'
                              : settingsHasActiveSubscription
                                ? 'bg-cyan-500/20 text-cyan-200'
                                : 'bg-zinc-700/80 text-zinc-300'
                          }`}
                        >
                          {settingsMembershipLabel}
                        </span>
                      </div>
                      {!settingsHasActiveSubscription && !settingsViewerIsStaff ? (
                        <p className="mt-2 text-[12px] leading-snug text-zinc-500">
                          Subscriptions and billing are coming soon.
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              ref={settingsNotificationsSectionRef}
              className="mt-6 border-t border-zinc-800 pt-5"
            >
              <button
                type="button"
                aria-expanded={notificationsSettingsOpen}
                onClick={() => setNotificationsSettingsOpen((open) => !open)}
                className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/40"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-zinc-100">Notifications</span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                    Push on this device and what to alert you about.
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`mt-0.5 shrink-0 text-zinc-400 transition-transform duration-200 ${
                    notificationsSettingsOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>

              {notificationsSettingsOpen ? (
                <div className="mt-2 space-y-3">
                  {iosInstallRequired && !iosInstallBannerHidden ? (
                    <div className="rounded-lg border border-amber-400/40 bg-amber-950/30 p-3 text-[12px] leading-relaxed text-amber-100">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <span className="font-semibold text-amber-50">Save Edge to Home Screen</span>
                        <button
                          type="button"
                          onClick={() => setIosInstallBannerHidden(true)}
                          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold text-amber-100/80 touch-manipulation hover:bg-amber-500/20 [-webkit-tap-highlight-color:transparent]"
                        >
                          Hide
                        </button>
                      </div>
                      <p className="text-amber-100/95">
                        Push alerts on iPhone only work when you open Edge from a Home Screen icon - not a regular
                        Safari tab.
                      </p>
                      <button
                        type="button"
                        onClick={openIosPwaHelp}
                        className="mt-2 min-h-10 w-full rounded-lg border border-amber-300/35 bg-amber-600/90 px-3 text-[13px] font-semibold text-white touch-manipulation hover:bg-amber-500 [-webkit-tap-highlight-color:transparent]"
                      >
                        Show install steps
                      </button>
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={pushNotificationsEnabled}
                      aria-busy={pushNotificationsBusy}
                      disabled={pushNotificationsBusy}
                      onClick={onPushNotificationsToggle}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-2.5 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/50 disabled:opacity-70"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-zinc-100">Push notifications</span>
                        <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                          {iosInstallRequired
                            ? 'Add Edge to your Home Screen, then open from the icon to enable push here.'
                            : pushNotificationsStatusHint || 'Lounge activity alerts on this device.'}
                        </span>
                        {pushNotificationsStatusMessage ? (
                          <span className="mt-1 block text-[11px] font-normal leading-snug text-cyan-200/85">
                            {pushNotificationsStatusMessage}
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className={`relative h-7 w-11 shrink-0 overflow-hidden rounded-full transition-colors duration-200 ${
                          pushNotificationsEnabled ? 'bg-cyan-500' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                            pushNotificationsEnabled ? 'translate-x-[18px]' : 'translate-x-0'
                          }`}
                        />
                      </span>
                    </button>

                    {notificationPrefsSchemaMissing ? (
                      <p className="px-2.5 pb-2 text-[12px] leading-relaxed text-zinc-500">
                        Apply migration{' '}
                        <span className="font-mono text-zinc-400">20260523170000_lounge_activity_push_h3.sql</span> on
                        test to save category preferences.
                      </p>
                    ) : null}
                    {notificationPrefsError ? (
                      <p className="px-2.5 pb-2 text-[12px] leading-relaxed text-red-300/90">{notificationPrefsError}</p>
                    ) : null}
                    <div className="divide-y divide-zinc-800/90 border-t border-zinc-800/90">
                      {LOUNGE_NOTIFICATION_PREF_ROWS.map((row) => {
                    const checked = Boolean(notificationPrefs?.[row.key])
                    const rowBusy = notificationPrefsSavingKey === row.key
                    const rowDisabled =
                      row.disabled ||
                      notificationPrefsLoading ||
                      notificationPrefsSchemaMissing ||
                      rowBusy ||
                      !onNotificationPrefToggle
                    return (
                      <button
                        key={row.key}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        aria-busy={rowBusy}
                        disabled={rowDisabled}
                        onClick={() => {
                          if (rowDisabled || row.disabled) return
                          onNotificationPrefToggle?.(row.key, !checked)
                        }}
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-2.5 py-2.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/50 disabled:opacity-55"
                      >
                        <span className="min-w-0 text-[14px] font-medium text-zinc-200">{row.label}</span>
                        <span
                          aria-hidden
                          className={`relative h-6 w-10 shrink-0 overflow-hidden rounded-full transition-colors duration-200 ${
                            checked ? 'bg-cyan-500' : 'bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                              checked ? 'translate-x-[16px]' : 'translate-x-0'
                            }`}
                          />
                        </span>
                      </button>
                    )
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-5">
              <button
                type="button"
                role="switch"
                aria-checked={feedVideoAutoplayEnabled}
                onClick={() => onFeedVideoAutoplayChange?.(!feedVideoAutoplayEnabled)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-zinc-700/90 bg-zinc-950/80 px-4 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/70"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-zinc-100">Autoplay while scrolling</span>
                  <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                    Inline video across Lounge - home feed, search, profiles, and post detail.
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`relative h-7 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                    feedVideoAutoplayEnabled ? 'bg-cyan-500' : 'bg-zinc-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                      feedVideoAutoplayEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
            </div>

            {settingsViewerIsStaff ? (
              <div className="mt-6 border-t border-zinc-800 pt-5">
                <button
                  type="button"
                  aria-expanded={adminUtilsSettingsOpen}
                  onClick={() => setAdminUtilsSettingsOpen((open) => !open)}
                  className="flex min-h-12 w-full items-start justify-between gap-3 rounded-xl px-1 py-1 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/40"
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-semibold text-zinc-100">Admin utils</span>
                    <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                      Staff-only debugging and deploy verification toggles.
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`mt-0.5 shrink-0 text-zinc-400 transition-transform duration-200 ${
                      adminUtilsSettingsOpen ? 'rotate-180' : 'rotate-0'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                      <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </button>

                {adminUtilsSettingsOpen ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-zinc-800/90 bg-zinc-950/40 p-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={feedVideoDebugEnabled}
                      onClick={() => onFeedVideoDebugChange?.(!feedVideoDebugEnabled)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-zinc-700/90 bg-zinc-950/80 px-3.5 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/70"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-zinc-100">Video debug HUD</span>
                        <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                          On-device coordinator overlay (PWA-friendly). Copy JSON to share captures.
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`relative h-7 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                          feedVideoDebugEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                            feedVideoDebugEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={buildBadgeEnabled}
                      onClick={() => onBuildBadgeChange?.(!buildBadgeEnabled)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-zinc-700/90 bg-zinc-950/80 px-3.5 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/70"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-zinc-100">Build SHA in title bar</span>
                        <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                          Shows the deployed git SHA next to the EDGE logo so you can confirm which bundle is live.
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`relative h-7 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                          buildBadgeEnabled ? 'bg-amber-500' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                            buildBadgeEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={consoleLogHudEnabled}
                      onClick={() => onConsoleLogHudChange?.(!consoleLogHudEnabled)}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-zinc-700/90 bg-zinc-950/80 px-3.5 py-3 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/70"
                    >
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold text-zinc-100">Console log HUD</span>
                        <span className="mt-0.5 block text-[12px] font-normal leading-snug text-zinc-500">
                          Floating log window (bottom-right). Tap lines to copy; stays open while you debug charts.
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={`relative h-7 w-11 shrink-0 rounded-full transition-colors duration-200 ${
                          consoleLogHudEnabled ? 'bg-cyan-500' : 'bg-zinc-700'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                            consoleLogHudEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                    </button>
                    <div className="rounded-lg border border-zinc-700/90 bg-zinc-950/80 p-3">
                      <div className="text-[15px] font-semibold text-zinc-100">Tab error screens</div>
                      <p className="mt-1 text-[12px] leading-snug text-zinc-500">
                        Test False Start (1st strike) and FUMBLE (2nd). Overlay only ... stays on your current screen.
                      </p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => onSimulateTabError?.()}
                          className="min-h-11 flex-1 rounded-xl border border-amber-500/40 bg-amber-600/20 px-3 text-sm font-bold text-amber-200 touch-manipulation hover:bg-amber-600/30 [-webkit-tap-highlight-color:transparent]"
                        >
                          Simulate tab error
                        </button>
                        <button
                          type="button"
                          onClick={() => onResetTabErrorStrikes?.()}
                          className="min-h-11 flex-1 rounded-xl border border-zinc-600/80 bg-zinc-800/80 px-3 text-sm font-semibold text-zinc-200 touch-manipulation hover:bg-zinc-700/80 [-webkit-tap-highlight-color:transparent]"
                        >
                          Reset strikes
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {typeof onLogout === 'function' ? (
              <div className="mt-6 flex min-h-[50dvh] flex-col border-t border-zinc-800 pt-5">
                <div className="flex-1" aria-hidden />
                <div className="flex flex-col items-center gap-2 pb-2 text-center">
                  <button
                    type="button"
                    onClick={() => void onLogout()}
                    className="min-h-12 inline-flex items-center justify-center px-4 py-2 text-[15px] text-zinc-400 underline touch-manipulation transition-colors hover:text-red-400 [-webkit-tap-highlight-color:transparent]"
                  >
                    Log out
                  </button>
                  {typeof onDeleteAccount === 'function' ? (
                    <button
                      type="button"
                      disabled={deleteAccountBusy}
                      onClick={() => void onDeleteAccount()}
                      className="min-h-11 inline-flex max-w-sm items-center justify-center px-4 py-2 text-[14px] leading-snug text-rose-400/95 underline decoration-rose-400/60 underline-offset-2 touch-manipulation transition-colors hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
                    >
                      {deleteAccountBusy
                        ? 'Deleting account…'
                        : 'Delete account (removes Auth user + cascaded data)'}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-3 py-4">
            <p className="text-[15px] leading-relaxed text-zinc-400">
              Chat panel is unavailable.
            </p>
          </div>
        )}
      </div>
      </div>
    </div>
    <IosPwaInstallHelpDialog
      open={iosPwaHelpOpen}
      onClose={() => setIosPwaHelpOpen(false)}
      isSafariBrowser={iosSafariBrowser}
    />
    </>
  )
}
