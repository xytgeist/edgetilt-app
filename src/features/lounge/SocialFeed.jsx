import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import {
  fetchOwnProfile,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  profileAvatarInitials,
  profileAvatarToneClass,
  profileSeedFromUser,
  saveProfileWithHandleFallback,
  uploadProfileAvatar,
} from '../profiles/profileGate'
import {
  communityFeedPostInsertPayload,
  feedPostDisplayCaption,
  normalizeFeedCaption,
} from '../../utils/communityFeedPost'
import { compressImageFileUnderMaxBytes } from '../../utils/compressImageForUpload'
import {
  readLoungeProfileCache,
  writeLoungeProfileCache,
  readLoungeComposerDraft,
  persistLoungeComposerDraft,
  clearLoungeComposerDraft,
  LOUNGE_PROFILE_CACHE_KEY,
  loungeProfileNeedsGate,
  writeProfileGateAck,
} from './loungeStorage'
import { composerStableInitialsFromUid, formatLoungePostDetailWhen } from './loungeFormat'
import { renderRichCaption } from './loungeCaption'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungePostArticle from './LoungePostArticle'
import LoungeProfileFullScreen from './LoungeProfileFullScreen'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'

/** DB raises exception 'MAX_PINNED_POSTS' when a third visible pin is attempted. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

export default function SocialFeed({
  supabaseClient,
  onRequireAuth,
  communityPosts,
  setCommunityPosts,
  communityFeedLoading,
  communityFeedLoadingMore,
  communityFeedHasMore,
  loadCommunityFeed,
  loadMoreCommunityFeed,
  hydrateCommunityPosts = async (rows) => rows ?? [],
}) {
  const BOOKMARKS_STORAGE_KEY = 'lounge_bookmarks_v1'
  const loungeComposerBoot = () => {
    const d = readLoungeComposerDraft()
    if (!d) return { expanded: false, fold: 0 }
    const expanded = d.composerExpanded === true || (d.postText || '').length > 0
    return { expanded, fold: expanded ? 1 : 0 }
  }
  const loungeComposerInitial = loungeComposerBoot()
  const [postText, setPostText] = useState(() => {
    const d = readLoungeComposerDraft()
    return d?.postText ?? ''
  })
  const [composerExpanded, setComposerExpanded] = useState(loungeComposerInitial.expanded)
  const [composerFoldReveal, setComposerFoldReveal] = useState(loungeComposerInitial.fold)
  const [composerMediaFile, setComposerMediaFile] = useState(null)
  const [composerMediaKind, setComposerMediaKind] = useState('')
  /** Moderator/admin: create this lounge post already pinned (only one pinned post globally). */
  const [composerPinOnPost, setComposerPinOnPost] = useState(false)
  const [postBusy, setPostBusy] = useState(false)
  const [postErr, setPostErr] = useState('')
  const [loungePinBusy, setLoungePinBusy] = useState(false)
  const [profileGateOpen, setProfileGateOpen] = useState(false)
  const [profileGateBusy, setProfileGateBusy] = useState(false)
  const [profileGateErr, setProfileGateErr] = useState('')
  const [profileGateHandle, setProfileGateHandle] = useState('')
  const [profileGateDisplayName, setProfileGateDisplayName] = useState('')
  const [profileGateAvatarFile, setProfileGateAvatarFile] = useState(null)
  const [profileGateAvatarPreview, setProfileGateAvatarPreview] = useState('')
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalVisible, setProfileModalVisible] = useState(true)
  const profileModalVisibleRef = useRef(true)
  const profileModalCloseFallbackTimerRef = useRef(0)
  const [profileModalLoading, setProfileModalLoading] = useState(false)
  const [profileModalErr, setProfileModalErr] = useState('')
  const [profileModalData, setProfileModalData] = useState(null)
  const [profileModalPosts, setProfileModalPosts] = useState([])
  const [interactionByPost, setInteractionByPost] = useState({})
  const [bookmarkedByPost, setBookmarkedByPost] = useState({})
  const [composerUserId, setComposerUserId] = useState('')
  /** Session user for email-based initials before `profiles` exists. */
  const [composerAuthUser, setComposerAuthUser] = useState(null)
  const [composerUserProfile, setComposerUserProfile] = useState(null)
  /** False until first `getSession()` completes — avoids flashing guest "ME" while auth is unknown. */
  const [composerAuthResolved, setComposerAuthResolved] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const LOUNGE_POST_AUTHOR_EDIT_WINDOW_MS = 30 * 60 * 1000
  const [loungePostDetail, setLoungePostDetail] = useState(null)
  const [loungeDetailEditing, setLoungeDetailEditing] = useState(false)
  const [loungeDetailDraftCaption, setLoungeDetailDraftCaption] = useState('')
  const [loungeDetailEditBusy, setLoungeDetailEditBusy] = useState(false)
  const [loungeDetailEditErr, setLoungeDetailEditErr] = useState('')
  const [loungeDetailEditMediaFile, setLoungeDetailEditMediaFile] = useState(null)
  const [loungeDetailEditMediaKind, setLoungeDetailEditMediaKind] = useState('')
  const [loungeDetailDeleteBusy, setLoungeDetailDeleteBusy] = useState(false)
  const [loungeManageErr, setLoungeManageErr] = useState('')
  const [loungePostDetailVisible, setLoungePostDetailVisible] = useState(true)
  const [loungePostDetailMenuOpen, setLoungePostDetailMenuOpen] = useState(false)
  const [loungePostDeleteConfirmOpen, setLoungePostDeleteConfirmOpen] = useState(false)
  const loungePostDetailVisibleRef = useRef(true)
  /** If `transitionend` never runs, still tear down the full-screen detail shell (otherwise feed stays dead). */
  const loungePostDetailCloseFallbackTimerRef = useRef(0)
  const loungePostDetailMenuWrapRef = useRef(null)
  const loadMoreSentinelRef = useRef(null)
  const pullStartYRef = useRef(null)
  const pullTriggeredRef = useRef(false)
  const composerMediaInputRef = useRef(null)
  const composerTextareaRef = useRef(null)
  const composerMirrorRef = useRef(null)
  const loungeDetailEditTextareaRef = useRef(null)
  const loungeDetailEditMirrorRef = useRef(null)
  const loungeDetailEditMediaInputRef = useRef(null)
  const loungeFeedScrollRef = useRef(null)
  const loungeTitleBarRef = useRef(null)
  const loungeScrollPrevTopRef = useRef(0)
  const loungeTitleRevealRef = useRef(1)
  const loungeScrollVisualRafRef = useRef(0)
  const composerFoldRevealRef = useRef(loungeComposerInitial.fold)
  const composerExpandedRef = useRef(loungeComposerInitial.expanded)
  const [loungeTitleBarHeight, setLoungeTitleBarHeight] = useState(0)
  const [loungeTitleReveal, setLoungeTitleReveal] = useState(1)
  const [loungeFeedViewportTopPx, setLoungeFeedViewportTopPx] = useState(0)
  /** True when feed scroll auto-collapsed the composer; cleared on explicit open / post / discard. */
  const composerFoldedFromFeedScrollRef = useRef(false)
  const composerDraftFlushRef = useRef({ postText: '', composerExpanded: false, composerMediaFile: null })
  composerDraftFlushRef.current = { postText, composerExpanded, composerMediaFile }
  composerExpandedRef.current = composerExpanded

  /** No composer, server-only counts, gated taps until session is known and user is signed in. */
  const loungeReadOnly = !composerAuthResolved || !composerUserId

  const loungeViewerIsStaff = useMemo(() => {
    const r = composerUserProfile?.role
    return r === 'moderator' || r === 'admin'
  }, [composerUserProfile?.role])

  const loungeDetailIsOwn = useMemo(
    () => Boolean(composerUserId && loungePostDetail?.user_id && loungePostDetail.user_id === composerUserId),
    [composerUserId, loungePostDetail?.user_id]
  )

  const loungeDetailShowPostMenu = useMemo(
    () =>
      Boolean(
        composerUserId &&
          loungePostDetail?.id &&
          !loungeDetailEditing &&
          (loungeDetailIsOwn || loungeViewerIsStaff)
      ),
    [composerUserId, loungePostDetail?.id, loungeDetailEditing, loungeDetailIsOwn, loungeViewerIsStaff]
  )

  /** Starter row from `ensureDefaultProfileRow`: must confirm once (cannot dismiss until Save). */
  const profileGateProvisionalConfirmNeeded = useMemo(() => {
    if (!composerUserId) return false
    const h = String(composerUserProfile?.handle || '').trim()
    const d = String(composerUserProfile?.display_name || '').trim()
    return Boolean(h && d && loungeProfileNeedsGate(composerUserProfile, composerUserId))
  }, [composerUserId, composerUserProfile])

  const openProfileGateIfNeeded = useCallback(() => {
    if (!composerUserId || !composerAuthUser || loungeReadOnly) return false
    if (!loungeProfileNeedsGate(composerUserProfile, composerUserId)) return false
    const h = String(composerUserProfile?.handle || '').trim()
    const d = String(composerUserProfile?.display_name || '').trim()
    const seed = profileSeedFromUser(composerAuthUser)
    setProfileGateHandle(h || seed.baseHandle)
    setProfileGateDisplayName(d || seed.displayName)
    setProfileGateAvatarFile(null)
    setProfileGateAvatarPreview(String(composerUserProfile?.avatar_url || '').trim())
    setProfileGateErr('')
    setProfileGateOpen(true)
    return true
  }, [composerUserId, composerAuthUser, loungeReadOnly, composerUserProfile])

  const requireLoungeAuth = useCallback(() => {
    onRequireAuth?.('login')
  }, [onRequireAuth])

  useEffect(() => {
    persistLoungeComposerDraft(postText, composerExpanded, composerMediaFile)
  }, [postText, composerExpanded, composerMediaFile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flush = () => {
      const { postText: t, composerExpanded: ex, composerMediaFile: f } = composerDraftFlushRef.current
      persistLoungeComposerDraft(t, ex, f)
    }
    window.addEventListener('pagehide', flush)
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  /** Pull-to-refresh: 1:1-ish finger travel in the feed scroller; cap avoids runaway state. */
  const pullRefreshThresholdPx = 88
  const pullMaxVisualPx = 300
  const pullFingerGain = 1

  useLayoutEffect(() => {
    if (!composerExpanded || composerFoldReveal < 0.88) return
    const el = composerTextareaRef.current
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }, [composerExpanded, composerFoldReveal])

  useLayoutEffect(() => {
    const ta = composerTextareaRef.current
    const m = composerMirrorRef.current
    if (!ta || !m) return
    m.scrollTop = ta.scrollTop
  }, [postText])

  useLayoutEffect(() => {
    if (!loungeDetailEditing) return
    const el = loungeDetailEditTextareaRef.current
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
    const len = el.value.length
    try {
      el.setSelectionRange(len, len)
    } catch {
      // ignore
    }
    el.scrollTop = el.scrollHeight
    const m = loungeDetailEditMirrorRef.current
    if (m) m.scrollTop = el.scrollTop
  }, [loungeDetailEditing])

  useLayoutEffect(() => {
    const ta = loungeDetailEditTextareaRef.current
    const m = loungeDetailEditMirrorRef.current
    if (!ta || !m) return
    m.scrollTop = ta.scrollTop
  }, [loungeDetailDraftCaption, loungeDetailEditing])

  useLayoutEffect(() => {
    const bar = loungeTitleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setLoungeTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  useLayoutEffect(() => {
    const el = loungeFeedScrollRef.current
    if (!el) return
    const sync = () => {
      setLoungeFeedViewportTopPx((prev) => {
        const n = Math.round(el.getBoundingClientRect().top)
        return prev === n ? prev : n
      })
    }
    sync()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', sync)
      return () => window.removeEventListener('resize', sync)
    }
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    const el = loungeFeedScrollRef.current
    if (!el || typeof window === 'undefined') return
    loungeScrollPrevTopRef.current = el.scrollTop
    /** Scroll px (same axis as feed) to move title reveal ~1.0; lower = faster motion per px. */
    const titleRevealPerScrollPx = 220
    const titleHidePerScrollPx = 190
    /** Scroll px to move composer fold ~1.0; tuned so fold tracks finger distance. */
    const composerCouplingPx = 240
    /** Only caps absurd single-event deltas (flings); normal scroll uses true distance. */
    const maxAbsScrollStepPx = 180
    /** When feed-folded, allow smooth reopen while scrollTop is within this distance of the top. */
    const composerUnfoldBandPx = 168
    const minScrollStepPx = 0.35
    const queueScrollVisualFlush = () => {
      if (loungeScrollVisualRafRef.current) return
      loungeScrollVisualRafRef.current = window.requestAnimationFrame(() => {
        loungeScrollVisualRafRef.current = 0
        setLoungeTitleReveal(loungeTitleRevealRef.current)
        setComposerFoldReveal(composerFoldRevealRef.current)
      })
    }
    const scrollDownPx = 14
    const onScroll = () => {
      const st = el.scrollTop
      const prev = loungeScrollPrevTopRef.current
      const rawDelta = st - prev
      loungeScrollPrevTopRef.current = st
      const eff =
        rawDelta === 0
          ? 0
          : Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxAbsScrollStepPx)

      let r = loungeTitleRevealRef.current
      if (st <= 2) {
        r = 1
      } else if (eff < -minScrollStepPx) {
        r = Math.min(1, r + (-eff) / titleRevealPerScrollPx)
      } else if (eff > minScrollStepPx) {
        r = Math.max(0, r - eff / titleHidePerScrollPx)
      }
      let scrollVisualDirty = false
      if (r !== loungeTitleRevealRef.current) {
        loungeTitleRevealRef.current = r
        scrollVisualDirty = true
      }

      if (composerExpandedRef.current && eff > minScrollStepPx) {
        if (st > scrollDownPx || composerFoldRevealRef.current < 0.998) {
          const next = Math.max(0, composerFoldRevealRef.current - eff / composerCouplingPx)
          if (next !== composerFoldRevealRef.current) {
            composerFoldRevealRef.current = next
            scrollVisualDirty = true
          }
        }
        if (composerFoldRevealRef.current < 0.04 && composerExpandedRef.current) {
          composerExpandedRef.current = false
          setComposerExpanded(false)
          composerFoldRevealRef.current = 0
          setComposerFoldReveal(0)
          composerFoldedFromFeedScrollRef.current = true
          scrollVisualDirty = true
        }
      } else if (
        composerExpandedRef.current &&
        composerFoldRevealRef.current < 0.995 &&
        st <= composerUnfoldBandPx &&
        eff < -minScrollStepPx
      ) {
        const next = Math.min(1, composerFoldRevealRef.current + (-eff) / composerCouplingPx)
        if (next !== composerFoldRevealRef.current) {
          composerFoldRevealRef.current = next
          scrollVisualDirty = true
        }
      } else if (
        !composerExpandedRef.current &&
        composerFoldedFromFeedScrollRef.current &&
        st <= composerUnfoldBandPx
      ) {
        if (eff < -minScrollStepPx) {
          if (!composerExpandedRef.current) {
            setComposerExpanded(true)
            composerExpandedRef.current = true
            composerFoldRevealRef.current = Math.max(composerFoldRevealRef.current, 0.06)
            scrollVisualDirty = true
          }
          const next = Math.min(1, composerFoldRevealRef.current + (-eff) / composerCouplingPx)
          if (next !== composerFoldRevealRef.current) {
            composerFoldRevealRef.current = next
            scrollVisualDirty = true
          }
          if (composerFoldRevealRef.current > 0.96) {
            composerFoldedFromFeedScrollRef.current = false
          }
        }
      }

      if (scrollVisualDirty) queueScrollVisualFlush()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (loungeScrollVisualRafRef.current) window.cancelAnimationFrame(loungeScrollVisualRafRef.current)
    }
  }, [])

  const displayLabel = useCallback((p) => {
    const pr = p?.author_profile
    if (pr?.handle) return `@${pr.handle}`
    if (pr?.display_name) return pr.display_name
    return 'Member'
  }, [])

  const handleFor = useCallback((p) => {
    const pr = p?.author_profile
    const h = pr?.handle != null ? String(pr.handle).trim() : ''
    if (h) return `@${h}`
    return '@member'
  }, [])

  const displayNameFor = useCallback((p) => {
    const pr = p?.author_profile
    const dn = pr?.display_name != null ? String(pr.display_name).trim() : ''
    if (dn) return dn
    const h = pr?.handle != null ? String(pr.handle).trim() : ''
    if (h) return `@${h}`
    return 'Member'
  }, [])

  const avatarText = useCallback((p) => {
    const pr = p?.author_profile
    const base = String(pr?.display_name || pr?.handle || 'Member')
      .trim()
      .replace(/\s+/g, ' ')
    if (!base) return 'ME'
    const words = base.split(' ').filter(Boolean)
    if (words.length >= 2) return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase()
    const letters = base.replace(/[^a-z0-9]/gi, '').toUpperCase()
    return letters.slice(0, 2) || 'ME'
  }, [])

  const avatarToneClass = profileAvatarToneClass

  const rateLimitMessage = useCallback((rawMessage) => {
    const m = /retry_in_seconds=(\d+)/i.exec(String(rawMessage || ''))
    const secs = m ? Number(m[1]) : NaN
    if (!Number.isFinite(secs) || secs <= 0) {
      return '🤖 You\'re in spam bot jail! Please wait a few minutes and try again.'
    }
    const mm = Math.floor(secs / 60)
    const ss = secs % 60
    const tail = mm > 0 ? `${mm}m ${String(ss).padStart(2, '0')}s` : `${ss}s`
    return `🤖 You're in spam bot jail! Try again in ${tail}.`
  }, [])

  const postAgeLabel = useCallback((createdAt) => {
    if (!createdAt) return ''
    const createdMs = new Date(createdAt).getTime()
    if (!Number.isFinite(createdMs)) return ''
    const diffMs = Date.now() - createdMs
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000))
    if (diffMinutes < 60) return `${Math.max(0, diffMinutes)}m`
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}h`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays <= 3) return `${diffDays}d`
    const dt = new Date(createdAt)
    const now = new Date()
    const sameYear = dt.getFullYear() === now.getFullYear()
    return dt.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
  }, [])

  const actionIconClass = 'h-[20px] w-[20px] text-zinc-500'

  const interactionStateFor = useCallback(
    (postId) => interactionByPost[postId] || { commented: false, reposted: false, liked: false },
    [interactionByPost]
  )

  const toggleInteraction = useCallback((postId, key) => {
    if (!composerUserId) return
    setInteractionByPost((prev) => {
      const cur = prev[postId] || { commented: false, reposted: false, liked: false }
      return { ...prev, [postId]: { ...cur, [key]: !cur[key] } }
    })
  }, [composerUserId])

  const toggleBookmark = useCallback((postId) => {
    if (!composerUserId) return
    setBookmarkedByPost((prev) => ({ ...prev, [postId]: !prev[postId] }))
  }, [composerUserId])

  function loungePostWithinAuthorEditWindow(createdAt) {
    if (!createdAt) return false
    const t = new Date(createdAt).getTime()
    if (!Number.isFinite(t)) return false
    return Date.now() - t <= LOUNGE_POST_AUTHOR_EDIT_WINDOW_MS
  }

  const finalizeLoungePostDetailClose = useCallback(() => {
    const tid = loungePostDetailCloseFallbackTimerRef.current
    if (tid) {
      window.clearTimeout(tid)
      loungePostDetailCloseFallbackTimerRef.current = 0
    }
    setLoungePostDetail(null)
    setLoungePostDetailVisible(true)
    setLoungePostDetailMenuOpen(false)
    setLoungePostDeleteConfirmOpen(false)
    setLoungeDetailEditing(false)
    setLoungeDetailDraftCaption('')
    setLoungeDetailEditErr('')
    setLoungeDetailEditMediaFile(null)
    setLoungeDetailEditMediaKind('')
    setLoungeDetailDeleteBusy(false)
    setLoungeManageErr('')
  }, [])

  const closeLoungePostDetailImmediate = useCallback(() => {
    finalizeLoungePostDetailClose()
  }, [finalizeLoungePostDetailClose])

  const closeLoungePostDetail = useCallback(() => {
    setLoungePostDetailMenuOpen(false)
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
    if (reduce) {
      finalizeLoungePostDetailClose()
      return
    }
    const prevTid = loungePostDetailCloseFallbackTimerRef.current
    if (prevTid) window.clearTimeout(prevTid)
    /** Match `onLoungePostDetailPanelTransitionEnd`: ref must be false before `transitionend` (same frame for 0ms transitions). */
    loungePostDetailVisibleRef.current = false
    setLoungePostDetailVisible(false)
    loungePostDetailCloseFallbackTimerRef.current = window.setTimeout(() => {
      loungePostDetailCloseFallbackTimerRef.current = 0
      if (!loungePostDetailVisibleRef.current) finalizeLoungePostDetailClose()
    }, 400)
  }, [finalizeLoungePostDetailClose])

  const openLoungePostDetail = useCallback((post) => {
    if (!post?.id) return
    if (loungeReadOnly) {
      onRequireAuth?.('login')
      return
    }
    const tid = loungePostDetailCloseFallbackTimerRef.current
    if (tid) {
      window.clearTimeout(tid)
      loungePostDetailCloseFallbackTimerRef.current = 0
    }
    setLoungeManageErr('')
    setLoungeDetailEditing(false)
    setLoungeDetailDraftCaption('')
    setLoungeDetailEditErr('')
    setLoungeDetailEditMediaFile(null)
    setLoungeDetailEditMediaKind('')
    setLoungePostDetailMenuOpen(false)
    setLoungePostDeleteConfirmOpen(false)
    setLoungePostDetail(post)
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
    if (reduce) {
      setLoungePostDetailVisible(true)
      return
    }
    setLoungePostDetailVisible(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setLoungePostDetailVisible(true))
    })
  }, [loungeReadOnly, onRequireAuth])

  const onLoungePostDetailPanelTransitionEnd = useCallback(
    (e) => {
      if (e.propertyName !== 'transform') return
      if (e.target !== e.currentTarget) return
      if (loungePostDetailVisibleRef.current) return
      finalizeLoungePostDetailClose()
    },
    [finalizeLoungePostDetailClose]
  )

  const cancelLoungeDetailEdit = useCallback(() => {
    setLoungeDetailEditing(false)
    setLoungeDetailDraftCaption('')
    setLoungeDetailEditErr('')
    setLoungeDetailEditMediaFile(null)
    setLoungeDetailEditMediaKind('')
    try {
      const el = loungeDetailEditMediaInputRef.current
      if (el) el.value = ''
    } catch {
      // ignore
    }
  }, [])

  const saveLoungeDetailCaption = useCallback(async () => {
    if (!loungePostDetail?.id) return
    const cap = normalizeFeedCaption(loungeDetailDraftCaption)
    setLoungeDetailEditErr('')
    if (loungeDetailEditMediaFile) {
      setLoungeDetailEditErr('Remove attached media to save — only the caption can be edited.')
      return
    }
    if (!cap) {
      setLoungeDetailEditErr('Write a caption before saving.')
      return
    }
    setLoungeDetailEditBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        onRequireAuth?.('login')
        setLoungeDetailEditErr('You must be signed in.')
        return
      }
      const { data, error } = await supabaseClient
        .from('community_feed_posts')
        .update({ caption: cap })
        .eq('id', loungePostDetail.id)
        .select('id,caption,edited_at')
        .maybeSingle()
      if (error) {
        const msg = String(error.message || '')
        if (msg.toLowerCase().includes('rate limit exceeded')) {
          setLoungeDetailEditErr(rateLimitMessage(msg))
          return
        }
        if (error.code === '42501') {
          setLoungeDetailEditErr('You can no longer edit this post (time window or permissions).')
          return
        }
        setLoungeDetailEditErr(msg || 'Could not save.')
        return
      }
      if (!data?.id) {
        setLoungeDetailEditErr('Could not save. Try refreshing the feed.')
        return
      }
      setCommunityPosts((prev) =>
        prev.map((p) => (p.id === data.id ? { ...p, caption: data.caption, edited_at: data.edited_at } : p))
      )
      setLoungePostDetail((prev) =>
        prev && prev.id === data.id ? { ...prev, caption: data.caption, edited_at: data.edited_at } : prev
      )
      cancelLoungeDetailEdit()
    } finally {
      setLoungeDetailEditBusy(false)
    }
  }, [
    cancelLoungeDetailEdit,
    loungeDetailDraftCaption,
    loungeDetailEditMediaFile,
    loungePostDetail,
    onRequireAuth,
    rateLimitMessage,
    setCommunityPosts,
    supabaseClient,
  ])

  const setLoungePostPinned = useCallback(
    async (postId, nextPinned) => {
      if (!postId || !loungeViewerIsStaff) return
      setLoungeManageErr('')
      setLoungePinBusy(true)
      try {
        const { error } = await supabaseClient
          .from('community_feed_posts')
          .update({ pinned: nextPinned })
          .eq('id', postId)
        if (error) {
          const raw = String(error.message || '')
          if (raw.includes('MAX_PINNED_POSTS')) {
            if (typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
            setLoungeManageErr(LOUNGE_MAX_PINNED_ALERT)
            return
          }
          setLoungeManageErr(raw || 'Could not update pin.')
          return
        }
        setLoungePostDetail((prev) => (prev && prev.id === postId ? { ...prev, pinned: nextPinned } : prev))
        setCommunityPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, pinned: nextPinned } : p)))
        setLoungePostDetailMenuOpen(false)
        await loadCommunityFeed({ silent: true })
      } finally {
        setLoungePinBusy(false)
      }
    },
    [loungeViewerIsStaff, loadCommunityFeed, setCommunityPosts, supabaseClient]
  )

  const performLoungePostDeleteFromDetail = useCallback(async () => {
    if (!loungePostDetail?.id || loungePostDetail.user_id !== composerUserId) return
    const postId = loungePostDetail.id
    setLoungeManageErr('')
    setLoungeDetailDeleteBusy(true)
    try {
      const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', postId)
      if (error) {
        const msg = String(error.message || '')
        if (error.code === '42501') {
          setLoungeManageErr('You do not have permission to delete this post.')
        } else {
          setLoungeManageErr(msg || 'Could not delete.')
        }
        setLoungePostDeleteConfirmOpen(false)
        return
      }
      setLoungePostDeleteConfirmOpen(false)
      closeLoungePostDetail()
      await loadCommunityFeed({ silent: true })
    } finally {
      setLoungeDetailDeleteBusy(false)
    }
  }, [closeLoungePostDetail, composerUserId, loadCommunityFeed, loungePostDetail, supabaseClient])

  useEffect(() => {
    loungePostDetailVisibleRef.current = loungePostDetailVisible
  }, [loungePostDetailVisible])

  useEffect(() => {
    if (!loungePostDetailMenuOpen) return
    const onDown = (e) => {
      const el = loungePostDetailMenuWrapRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setLoungePostDetailMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown, { passive: true })
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [loungePostDetailMenuOpen])

  useEffect(() => {
    if (!composerUserId) {
      closeLoungePostDetail()
    }
  }, [composerUserId, closeLoungePostDetail])

  useEffect(() => {
    if (!loungePostDetail) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (loungePostDeleteConfirmOpen) {
        e.preventDefault()
        if (!loungeDetailDeleteBusy) setLoungePostDeleteConfirmOpen(false)
        return
      }
      if (loungePostDetailMenuOpen) {
        e.preventDefault()
        setLoungePostDetailMenuOpen(false)
        return
      }
      if (loungeDetailEditing) {
        e.preventDefault()
        cancelLoungeDetailEdit()
        return
      }
      closeLoungePostDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    cancelLoungeDetailEdit,
    closeLoungePostDetail,
    loungeDetailDeleteBusy,
    loungeDetailEditing,
    loungePostDeleteConfirmOpen,
    loungePostDetail,
    loungePostDetailMenuOpen,
  ])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        const uid = session?.user?.id || ''
        if (cancelled) return
        setComposerUserId(uid)
        setComposerAuthUser(session?.user ?? null)
        if (!uid) {
          setComposerUserProfile(null)
          try {
            window.sessionStorage.removeItem(LOUNGE_PROFILE_CACHE_KEY)
          } catch {
            // ignore
          }
          return
        }
        const cached = readLoungeProfileCache(uid)
        if (cached) setComposerUserProfile(cached)
        const { data } = await supabaseClient
          .from('profiles')
          .select('user_id,handle,display_name,avatar_url,bio,created_at,role')
          .eq('user_id', uid)
          .maybeSingle()
        if (cancelled) return
        setComposerUserProfile(data || null)
        if (data) writeLoungeProfileCache(data)
        else {
          try {
            window.sessionStorage.removeItem(LOUNGE_PROFILE_CACHE_KEY)
          } catch {
            // ignore
          }
        }
      } finally {
        if (!cancelled) setComposerAuthResolved(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [supabaseClient])

  useEffect(() => {
    if (!composerAuthResolved) return
    if (!composerUserId || !composerAuthUser) {
      setProfileGateOpen(false)
      return
    }
    if (!loungeProfileNeedsGate(composerUserProfile, composerUserId)) {
      setProfileGateOpen(false)
    }
  }, [composerAuthResolved, composerUserId, composerAuthUser, composerUserProfile])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') setBookmarkedByPost(parsed)
    } catch {
      // Ignore local storage parse errors.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarkedByPost))
    } catch {
      // Ignore local storage write errors.
    }
  }, [bookmarkedByPost])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const zone = loungeFeedScrollRef.current
    if (!zone) return
    const thresholdPx = pullRefreshThresholdPx

    const onTouchStart = (e) => {
      if (zone.scrollTop > 0) {
        pullStartYRef.current = null
        return
      }
      pullStartYRef.current = e.touches?.[0]?.clientY ?? null
      pullTriggeredRef.current = false
    }

    const onTouchMove = (e) => {
      if (pullRefreshing) return
      const startY = pullStartYRef.current
      if (startY == null) return
      const currentY = e.touches?.[0]?.clientY ?? startY
      const dy = Math.max(0, currentY - startY)
      if (dy <= 0) {
        setPullDistance(0)
        return
      }
      const eased = Math.min(pullMaxVisualPx, Math.floor(dy * pullFingerGain))
      setPullDistance(eased)
    }

    const onTouchEnd = async () => {
      const shouldRefresh = pullDistance >= thresholdPx && !pullTriggeredRef.current
      pullStartYRef.current = null
      setPullDistance(0)
      if (!shouldRefresh) return
      pullTriggeredRef.current = true
      setPullRefreshing(true)
      try {
        await loadCommunityFeed({ silent: true })
      } finally {
        setPullRefreshing(false)
        pullTriggeredRef.current = false
      }
    }

    zone.addEventListener('touchstart', onTouchStart, { passive: true })
    zone.addEventListener('touchmove', onTouchMove, { passive: true })
    zone.addEventListener('touchend', onTouchEnd, { passive: true })
    zone.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      zone.removeEventListener('touchstart', onTouchStart)
      zone.removeEventListener('touchmove', onTouchMove)
      zone.removeEventListener('touchend', onTouchEnd)
      zone.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [loadCommunityFeed, pullDistance, pullRefreshing])

  useEffect(() => {
    if (!communityFeedHasMore || communityFeedLoadingMore || communityFeedLoading || pullRefreshing) return
    const root = loungeFeedScrollRef.current
    const node = loadMoreSentinelRef.current
    if (!root || !node || typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    const observer = new window.IntersectionObserver(
      (entries) => {
        const first = entries?.[0]
        if (first?.isIntersecting) void loadMoreCommunityFeed()
      },
      { root, rootMargin: '300px 0px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [
    communityFeedHasMore,
    communityFeedLoading,
    communityFeedLoadingMore,
    loadMoreCommunityFeed,
    pullRefreshing,
  ])

  const submitLoungePost = useCallback(async () => {
    const caption = postText.trim()
    setPostErr('')
    if (!caption) return
    if (caption.length > 280) {
      setPostErr('Caption must be 280 characters or fewer.')
      return
    }

    setPostBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setPostErr('You must be signed in to post in Lounge.')
        onRequireAuth?.('login')
        return
      }

      const { data: ownProfile, error: profileErr } = await fetchOwnProfile(supabaseClient, session.user.id)
      if (profileErr) {
        setPostErr(`Could not verify profile: ${profileErr.message || 'Unknown error.'}`)
        return
      }
      if (loungeProfileNeedsGate(ownProfile, session.user.id)) {
        const h = String(ownProfile?.handle || '').trim()
        const d = String(ownProfile?.display_name || '').trim()
        const seed = profileSeedFromUser(session.user)
        setProfileGateHandle(h || seed.baseHandle)
        setProfileGateDisplayName(d || seed.displayName)
        setProfileGateAvatarFile(null)
        setProfileGateAvatarPreview(
          ownProfile?.avatar_url || composerUserProfile?.avatar_url || ''
        )
        setProfileGateErr('')
        setProfileGateOpen(true)
        setPostErr('Complete your profile to post in Lounge.')
        return
      }

      const isStaffPoster =
        ownProfile?.role === 'moderator' ||
        ownProfile?.role === 'admin' ||
        composerUserProfile?.role === 'moderator' ||
        composerUserProfile?.role === 'admin'
      const { error } = await supabaseClient.from('community_feed_posts').insert(
        communityFeedPostInsertPayload({
          caption,
          gameTitle: 'Lounge',
          gameSlug: null,
          pinned: isStaffPoster && composerPinOnPost ? true : undefined,
        })
      )

      if (error) {
        const msg = String(error.message || '')
        if (msg.toLowerCase().includes('rate limit exceeded')) {
          setPostErr(rateLimitMessage(msg))
          return
        }
        if (error.code === '42501') {
          setPostErr('Posting is blocked by current permissions. Please sign in and try again.')
          return
        }
        if (error.code === '42P01') {
          setPostErr('Lounge feed table is not set up in this project yet.')
          return
        }
        if (msg.includes('MAX_PINNED_POSTS')) {
          if (typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
          setPostErr(LOUNGE_MAX_PINNED_ALERT)
          return
        }
        setPostErr(msg || 'Could not post right now.')
        return
      }

      setPostText('')
      setComposerMediaFile(null)
      setComposerMediaKind('')
      setComposerPinOnPost(false)
      composerFoldedFromFeedScrollRef.current = false
      composerFoldRevealRef.current = 0
      setComposerFoldReveal(0)
      composerExpandedRef.current = false
      setComposerExpanded(false)
      clearLoungeComposerDraft()
      await loadCommunityFeed()
    } finally {
      setPostBusy(false)
    }
  }, [
    composerPinOnPost,
    composerUserProfile?.avatar_url,
    composerUserProfile?.role,
    loadCommunityFeed,
    onRequireAuth,
    postText,
    rateLimitMessage,
    supabaseClient,
  ])

  const saveProfileGate = useCallback(async () => {
    setProfileGateErr('')
    const display = profileGateDisplayName.trim()
    if (!display) {
      setProfileGateErr('Display name is required.')
      return
    }
    setProfileGateBusy(true)
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setProfileGateOpen(false)
        onRequireAuth?.('login')
        return
      }
      let avatarUrl
      if (profileGateAvatarFile) {
        const { data: uploadedUrl, error: uploadErr } = await uploadProfileAvatar({
          supabaseClient,
          user: session.user,
          file: profileGateAvatarFile,
        })
        if (uploadErr) {
          setProfileGateErr(formatProfileSaveDebugError(uploadErr, 'Avatar upload'))
          return
        }
        avatarUrl = uploadedUrl || null
      }

      const { error } = await saveProfileWithHandleFallback({
        supabaseClient,
        user: session.user,
        displayName: display,
        requestedHandle: profileGateHandle,
        avatarUrl,
      })
      if (error) {
        setProfileGateErr(formatProfileSaveDebugError(error, 'Save profile'))
        return
      }
      const { data: freshProfile, error: freshErr } = await fetchOwnProfile(supabaseClient, session.user.id)
      if (!freshErr && freshProfile) {
        setComposerUserProfile(freshProfile)
        writeLoungeProfileCache(freshProfile)
      }
      writeProfileGateAck(session.user.id)
      setProfileGateOpen(false)
      await submitLoungePost()
    } finally {
      setProfileGateBusy(false)
    }
  }, [onRequireAuth, profileGateAvatarFile, profileGateDisplayName, profileGateHandle, submitLoungePost, supabaseClient])

  useEffect(() => {
    profileModalVisibleRef.current = profileModalVisible
  }, [profileModalVisible])

  const finalizeProfileModalClose = useCallback(() => {
    const tid = profileModalCloseFallbackTimerRef.current
    if (tid) {
      window.clearTimeout(tid)
      profileModalCloseFallbackTimerRef.current = 0
    }
    setProfileModalOpen(false)
    setProfileModalData(null)
    setProfileModalPosts([])
    setProfileModalErr('')
    setProfileModalVisible(true)
  }, [])

  const closeProfileModal = useCallback(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
    if (reduce) {
      finalizeProfileModalClose()
      return
    }
    const prevTid = profileModalCloseFallbackTimerRef.current
    if (prevTid) window.clearTimeout(prevTid)
    profileModalVisibleRef.current = false
    setProfileModalVisible(false)
    profileModalCloseFallbackTimerRef.current = window.setTimeout(() => {
      profileModalCloseFallbackTimerRef.current = 0
      if (!profileModalVisibleRef.current) finalizeProfileModalClose()
    }, 400)
  }, [finalizeProfileModalClose])

  const openProfileModal = useCallback(
    async (post) => {
      if (loungeReadOnly) {
        onRequireAuth?.('login')
        return
      }
      const userId = post?.user_id
      if (!userId) return
      const prevTid = profileModalCloseFallbackTimerRef.current
      if (prevTid) {
        window.clearTimeout(prevTid)
        profileModalCloseFallbackTimerRef.current = 0
      }
      setProfileModalOpen(true)
      setProfileModalLoading(true)
      setProfileModalErr('')
      setProfileModalData({
        user_id: userId,
        ...(post?.author_profile && typeof post.author_profile === 'object' ? post.author_profile : {}),
      })
      setProfileModalPosts([])
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
      if (reduce) {
        profileModalVisibleRef.current = true
        setProfileModalVisible(true)
      } else {
        profileModalVisibleRef.current = false
        setProfileModalVisible(false)
      }
      try {
        const [{ data: postRows, error: postsErr }, coreProfile] = await Promise.all([
          supabaseClient
            .from('community_feed_posts')
            .select('id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count')
            .eq('user_id', userId)
            .is('hidden_at', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(30),
          supabaseClient
            .from('profiles')
            .select('user_id,handle,display_name,avatar_url,bio,created_at,role')
            .eq('user_id', userId)
            .maybeSingle(),
        ])
        if (postsErr) {
          setProfileModalErr(postsErr?.message || 'Could not load posts.')
          if (!reduce) {
            profileModalVisibleRef.current = true
            setProfileModalVisible(true)
          }
          return
        }
        const mergedProfile = {
          user_id: userId,
          ...(post?.author_profile && typeof post.author_profile === 'object' ? post.author_profile : {}),
          ...(coreProfile.data || {}),
        }
        if (!coreProfile.error && coreProfile.data) {
          const ext = await supabaseClient
            .from('profiles')
            .select('about_me, banner_url')
            .eq('user_id', userId)
            .maybeSingle()
          if (!ext.error && ext.data) {
            Object.assign(mergedProfile, ext.data)
          }
        }
        setProfileModalData(mergedProfile)
        const hydrated = await hydrateCommunityPosts(postRows || [])
        setProfileModalPosts(hydrated)
        if (reduce) {
          profileModalVisibleRef.current = true
          setProfileModalVisible(true)
        } else {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              profileModalVisibleRef.current = true
              setProfileModalVisible(true)
            })
          })
        }
      } finally {
        setProfileModalLoading(false)
      }
    },
    [hydrateCommunityPosts, loungeReadOnly, onRequireAuth, supabaseClient]
  )

  const onProfileScreenUpdated = useCallback((next) => {
    setProfileModalData((prev) => ({ ...(prev || {}), ...next }))
    if (next?.user_id && composerUserId && next.user_id === composerUserId) {
      setComposerUserProfile((prev) => {
        const merged = { ...(prev || {}), ...next }
        writeLoungeProfileCache(merged)
        return merged
      })
      const authorPatch = {}
      for (const k of ['avatar_url', 'display_name', 'handle', 'banner_url', 'about_me', 'bio', 'role']) {
        if (Object.prototype.hasOwnProperty.call(next, k)) authorPatch[k] = next[k]
      }
      if (Object.keys(authorPatch).length > 0) {
        setCommunityPosts((prev) =>
          prev.map((p) => {
            if (p.user_id !== next.user_id) return p
            const ap = p.author_profile && typeof p.author_profile === 'object' ? p.author_profile : {}
            return { ...p, author_profile: { ...ap, ...authorPatch, user_id: next.user_id } }
          })
        )
      }
    }
  }, [composerUserId, setCommunityPosts])

  const profilePostCardProps = useMemo(
    () => ({
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      toggleBookmark,
      bookmarkedByPost,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      onAvatarClick: (p) => void openProfileModal(p),
      loungeViewerIsStaff,
      setLoungePostPinned,
      loungePinBusy,
      displayNameFor,
      handleFor,
      postAgeLabel,
      displayLabel,
      avatarToneClass,
      avatarText,
      onPostBodyClick: openLoungePostDetail,
    }),
    [
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      toggleBookmark,
      bookmarkedByPost,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      openProfileModal,
      loungeViewerIsStaff,
      setLoungePostPinned,
      loungePinBusy,
      displayNameFor,
      handleFor,
      postAgeLabel,
      displayLabel,
      avatarToneClass,
      avatarText,
      openLoungePostDetail,
    ]
  )

  return (
    <div className="mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-2xl flex-col overflow-hidden pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div
        ref={loungeFeedScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
      >
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56 }}
        />
        <div
          ref={loungeTitleBarRef}
          className="fixed left-1/2 z-[45] w-full max-w-2xl -translate-x-1/2 border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform"
          style={{
            top: loungeFeedViewportTopPx,
            transform: `translate3d(0, ${-(1 - loungeTitleReveal) * (loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56)}px, 0)`,
            pointerEvents: loungeTitleReveal > 0.12 ? 'auto' : 'none',
          }}
        >
          <div className="relative flex items-center justify-center px-3 py-2">
            <img
              src="/edge-lounge-logo.png"
              alt="EDGE"
              className="h-8 w-auto max-w-[min(220px,calc(100%-5rem))] object-contain object-center"
              draggable={false}
            />
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 text-[13px]">
              {communityFeedLoading ? 'Updating…' : ''}
            </div>
          </div>
        </div>

        <div
          className="overflow-hidden transition-[max-height,opacity] duration-200"
          style={{ maxHeight: pullRefreshing || pullDistance > 0 ? '2.25rem' : '0rem', opacity: pullRefreshing || pullDistance > 0 ? 1 : 0 }}
        >
          <div className="px-3 py-1 text-center text-[13px] text-zinc-400">
            {pullRefreshing
              ? 'Refreshing lounge…'
              : pullDistance >= pullRefreshThresholdPx
                ? 'Release to refresh'
                : 'Pull down to refresh'}
          </div>
        </div>

        {loungeReadOnly ? null : (
        <div
          className={`relative shrink-0 border-b border-zinc-800 bg-zinc-900/40 px-3 ${
            composerExpanded ? 'pt-3 pb-2.5' : 'py-3'
          }`}
        >
        {composerExpanded && composerFoldReveal > 0.14 ? (
          <button
            type="button"
            onClick={() => {
              setPostText('')
              setComposerMediaFile(null)
              setComposerMediaKind('')
              setComposerPinOnPost(false)
              setPostErr('')
              composerFoldedFromFeedScrollRef.current = false
              composerFoldRevealRef.current = 0
              setComposerFoldReveal(0)
              composerExpandedRef.current = false
              setComposerExpanded(false)
              clearLoungeComposerDraft()
              try {
                const el = composerMediaInputRef.current
                if (el) el.value = ''
              } catch {
                // ignore
              }
            }}
            className="absolute right-3 top-3 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full bg-zinc-800/95 text-zinc-500 shadow-sm hover:bg-zinc-700 hover:text-zinc-200 active:text-white [-webkit-tap-highlight-color:transparent]"
            title="Discard draft"
            aria-label="Discard draft"
          >
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M6 6l8 8M14 6l-8 8"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => {
              if (!composerUserId) return
              if (openProfileGateIfNeeded()) return
              void openProfileModal({
                user_id: composerUserId,
                author_profile: composerUserProfile,
              })
            }}
            className="mt-0.5 h-10 w-10 shrink-0 flex items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-[15px] font-bold text-zinc-200 touch-manipulation hover:border-zinc-600 sm:h-[2.75rem] sm:w-[2.75rem] sm:text-[16px]"
            title="Open your profile"
            aria-label="Open your profile"
          >
            {composerUserProfile?.avatar_url ? (
              <img
                key={composerUserProfile.avatar_url}
                src={composerUserProfile.avatar_url}
                alt=""
                className="h-full w-full rounded-full object-cover"
                loading="eager"
                decoding="async"
              />
            ) : !composerAuthResolved ? (
              <span
                className="block h-full w-full rounded-full bg-zinc-700/55 animate-pulse"
                aria-hidden
              />
            ) : (
              <span
                className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarToneClass(
                  composerUserProfile?.user_id || composerUserId || 'me'
                )}`}
              >
                {(() => {
                  if (composerUserProfile?.display_name?.trim() || composerUserProfile?.handle?.trim()) {
                    return avatarText({ author_profile: composerUserProfile })
                  }
                  if (composerAuthUser) {
                    const seed = profileSeedFromUser(composerAuthUser)
                    return profileAvatarInitials(seed.displayName, seed.baseHandle)
                  }
                  if (composerUserId) return composerStableInitialsFromUid(composerUserId)
                  return avatarText({ author_profile: { display_name: 'Me', handle: '' } })
                })()}
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            {composerExpanded ? (
              <div
                className="overflow-hidden will-change-[max-height,opacity]"
                style={{
                  maxHeight: `${Math.max(40, Math.round(composerFoldReveal * 340))}px`,
                  opacity: Math.min(1, 0.2 + 0.8 * composerFoldReveal),
                }}
              >
                <div className="mt-0.5 pr-8">
                  <div className="grid min-h-[6.5rem] grid-cols-1 grid-rows-1 [&>*]:col-start-1 [&>*]:row-start-1">
                    <div
                      ref={composerMirrorRef}
                      aria-hidden
                      className="pointer-events-none min-h-[6.5rem] w-full overflow-y-auto whitespace-pre-wrap break-words px-0 py-0 pt-[10px] text-left text-[17px] leading-[1.25] text-zinc-100 [scrollbar-width:none] [-ms-overflow-style:none] sm:pt-[13px] [&::-webkit-scrollbar]:hidden"
                    >
                      {postText ? (
                        renderRichCaption(postText, {
                          linkClassName:
                            'pointer-events-none font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                        })
                      ) : (
                        <span className="text-zinc-500">Are you winning, son?</span>
                      )}
                    </div>
                    <textarea
                      ref={composerTextareaRef}
                      value={postText}
                      onChange={(e) => setPostText(e.target.value)}
                      onScroll={(e) => {
                        const m = composerMirrorRef.current
                        if (m) m.scrollTop = e.currentTarget.scrollTop
                      }}
                      className="z-10 min-h-[6.5rem] w-full resize-none touch-manipulation overflow-y-auto bg-transparent px-0 py-0 pt-[10px] text-[17px] leading-[1.25] text-transparent caret-white outline-none selection:bg-cyan-500/25 sm:pt-[13px]"
                      placeholder=""
                      aria-label="Lounge post caption"
                      maxLength={280}
                    />
                  </div>
                  {postErr ? (
                    <div className="mt-2 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[17px] leading-tight text-rose-200">
                      {postErr}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  composerFoldedFromFeedScrollRef.current = false
                  composerFoldRevealRef.current = 1
                  setComposerFoldReveal(1)
                  composerExpandedRef.current = true
                  setComposerExpanded(true)
                }}
                className="mt-0.5 flex min-h-10 w-full min-w-0 touch-manipulation items-center justify-start sm:min-h-[2.75rem] text-left text-[17px] leading-[1.25] text-zinc-500"
              >
                {(() => {
                  const firstLine = String(postText || '')
                    .split('\n')[0]
                    .trim()
                  if (firstLine) {
                    return (
                      <span className="block w-full min-w-0 truncate text-left text-zinc-100 [&_a]:pointer-events-none">
                        {renderRichCaption(firstLine, {
                          linkClassName:
                            'pointer-events-none font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70',
                        })}
                      </span>
                    )
                  }
                  if (composerMediaFile) {
                    return (
                      <span className="block w-full min-w-0 truncate text-zinc-400">
                        {composerMediaKind === 'video' ? 'Video' : 'Image'} selected
                      </span>
                    )
                  }
                  return 'Are you winning, son?'
                })()}
              </button>
            )}
          </div>
        </div>
        {composerExpanded ? (
          <div
            className="will-change-[opacity]"
            style={{ opacity: Math.min(1, 0.2 + 0.8 * composerFoldReveal) }}
          >
            <div
              className="mx-auto mt-1 h-px w-[90%] bg-zinc-700/85"
              role="presentation"
              aria-hidden
            />
            <input
              ref={composerMediaInputRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] || null
                if (!file) return
                const mime = String(file.type || '').toLowerCase()
                if (mime.startsWith('image/')) {
                  setComposerMediaKind('image')
                  setComposerMediaFile(file)
                  return
                }
                if (mime.startsWith('video/')) {
                  setComposerMediaKind('video')
                  setComposerMediaFile(file)
                  return
                }
                setPostErr('Unsupported media type. Please choose an image or video file.')
              }}
            />
            <div className="mt-1 flex w-full items-center gap-2 pr-2 pt-1.5 pb-1">
              <button
                type="button"
                onClick={() => composerMediaInputRef.current?.click()}
                className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1 text-zinc-500 hover:text-zinc-200 active:text-white [-webkit-tap-highlight-color:transparent]"
                title="Add media"
                aria-label="Add media"
              >
                <svg className="h-7 w-7" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect
                    x="3.75"
                    y="3.75"
                    width="12.5"
                    height="12.5"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.35"
                  />
                  <path
                    d="M6.25 13.25 8.25 10.25l1.75 2 2.25-3 3.5 4"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="8" cy="8" r="0.9" fill="currentColor" />
                </svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2">
                  {composerMediaFile ? (
                    <span className="block truncate text-[17px] leading-tight text-zinc-400">
                      {composerMediaKind === 'video' ? 'Video' : 'Image'} selected
                    </span>
                  ) : null}
                </div>
                <div className="inline-flex shrink-0 items-center gap-2 py-0.5">
                  {loungeViewerIsStaff ? (
                    <label className="inline-flex cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-md border border-zinc-700/80 bg-zinc-900/50 px-2 py-1 text-[11px] font-semibold text-zinc-400 [-webkit-tap-highlight-color:transparent] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cyan-500/40">
                      <input
                        type="checkbox"
                        checked={composerPinOnPost}
                        onChange={(e) => setComposerPinOnPost(e.target.checked)}
                        className="h-3.5 w-3.5 shrink-0 rounded border-zinc-600 bg-zinc-900 text-cyan-600 focus:ring-0"
                        aria-label="Pin this post to the top of the lounge"
                      />
                      <span className="whitespace-nowrap">Pin</span>
                    </label>
                  ) : null}
                  {postText.length >= 250 ? (
                    <span
                      className={`text-[11px] tabular-nums font-semibold ${
                        postText.length >= 280 ? 'text-rose-400' : 'text-zinc-500'
                      }`}
                      aria-live="polite"
                    >
                      {postText.length}/280
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void submitLoungePost()}
                    disabled={postBusy || !postText.trim()}
                    className="min-h-8 shrink-0 touch-manipulation rounded-md bg-cyan-600 px-2 py-1 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {postBusy ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        </div>
        )}

        <div className="border-b border-zinc-800 pb-4">
        {loungeManageErr ? (
          <div className="px-3 pt-3">
            <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
              {loungeManageErr}
            </div>
          </div>
        ) : null}
        {communityFeedLoading && communityPosts.length === 0 ? (
          <div className="px-3 py-4 text-zinc-400 text-[17px]">Loading lounge…</div>
        ) : communityPosts.length === 0 ? (
          <div className="px-3 py-5 text-zinc-400 text-[17px] leading-relaxed">
            No posts yet. Run{' '}
            <code className="text-fuchsia-200/90">supabase/feed_phase_a_profiles_public_read.sql</code> in Supabase,
            then post from Guides → Ask community.
          </div>
        ) : (
          <>
            {communityPosts.map((post) => (
              <article
                key={post.id}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                className="border-t border-zinc-800 bg-zinc-950/35 px-3 py-4 transition-colors active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                onClick={(e) => {
                  const t = e.target
                  if (t instanceof Element && t.closest('button, a, textarea, input, select')) return
                  openLoungePostDetail(post)
                }}
              >
                <LoungePostArticle
                  post={post}
                  loungeReadOnly={loungeReadOnly}
                  interactionStateFor={interactionStateFor}
                  toggleInteraction={toggleInteraction}
                  toggleBookmark={toggleBookmark}
                  bookmarkedByPost={bookmarkedByPost}
                  requireLoungeAuth={requireLoungeAuth}
                  openProfileGateIfNeeded={openProfileGateIfNeeded}
                  onAvatarClick={(p) => void openProfileModal(p)}
                  loungeViewerIsStaff={loungeViewerIsStaff}
                  setLoungePostPinned={setLoungePostPinned}
                  loungePinBusy={loungePinBusy}
                  displayNameFor={displayNameFor}
                  handleFor={handleFor}
                  postAgeLabel={postAgeLabel}
                  displayLabel={displayLabel}
                  avatarToneClass={avatarToneClass}
                  avatarText={avatarText}
                />
              </article>
            ))}

            {communityFeedHasMore ? <div ref={loadMoreSentinelRef} className="h-2 w-full" aria-hidden /> : null}

            {communityFeedLoadingMore ? (
              <div className="px-3 py-3 text-zinc-500 text-[17px]">Loading more…</div>
            ) : null}

            {!communityFeedHasMore && communityPosts.length > 0 ? (
              <div className="text-center text-[14px] text-zinc-600 py-2">You are caught up.</div>
            ) : null}
          </>
        )}
        </div>
      </div>

      {loungePostDetail ? (
        <div
          className="fixed inset-0 z-[96] sm:bg-black/85"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lounge-post-detail-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 hidden cursor-default sm:block"
            aria-label="Close post"
            onClick={() => {
              if (loungePostDeleteConfirmOpen) {
                if (!loungeDetailDeleteBusy) setLoungePostDeleteConfirmOpen(false)
                return
              }
              if (loungeDetailEditing) cancelLoungeDetailEdit()
              else closeLoungePostDetail()
            }}
          />
          <div
            className={`fixed inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-800/90 bg-zinc-950 shadow-[-12px_0_40px_rgba(0,0,0,0.45)] transition-transform duration-300 ease-out motion-reduce:transition-none ${
              loungePostDetailVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
            onTransitionEnd={onLoungePostDetailPanelTransitionEnd}
            onTransitionCancel={onLoungePostDetailPanelTransitionEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] sm:py-3">
              <button
                type="button"
                onClick={() => {
                  if (loungePostDeleteConfirmOpen) {
                    if (!loungeDetailDeleteBusy) setLoungePostDeleteConfirmOpen(false)
                    return
                  }
                  if (loungePostDetailMenuOpen) {
                    setLoungePostDetailMenuOpen(false)
                    return
                  }
                  if (loungeDetailEditing) cancelLoungeDetailEdit()
                  else closeLoungePostDetail()
                }}
                className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]"
                aria-label="Back to Lounge"
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  ←
                </span>
              </button>
              <h2 id="lounge-post-detail-title" className="min-w-0 flex-1 text-center text-[17px] font-bold text-white">
                Post
              </h2>
              {loungeDetailShowPostMenu ? (
                <div ref={loungePostDetailMenuWrapRef} className="relative flex h-10 w-10 shrink-0 justify-end">
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={loungePostDetailMenuOpen}
                    aria-label="Post options"
                    onClick={() => setLoungePostDetailMenuOpen((o) => !o)}
                    className="flex h-10 w-10 touch-manipulation items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <circle cx="4" cy="10" r="1.65" />
                      <circle cx="10" cy="10" r="1.65" />
                      <circle cx="16" cy="10" r="1.65" />
                    </svg>
                  </button>
                  {loungePostDetailMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-[20] mt-1 min-w-[11rem] rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
                    >
                      {loungeDetailIsOwn && loungePostWithinAuthorEditWindow(loungePostDetail.created_at) ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-4 py-3 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                          onClick={() => {
                            setLoungePostDetailMenuOpen(false)
                            setLoungeDetailEditErr('')
                            setLoungeManageErr('')
                            setLoungeDetailEditMediaFile(null)
                            setLoungeDetailEditMediaKind('')
                            try {
                              const el = loungeDetailEditMediaInputRef.current
                              if (el) el.value = ''
                            } catch {
                              // ignore
                            }
                            setLoungeDetailDraftCaption(feedPostDisplayCaption(loungePostDetail))
                            setLoungeDetailEditing(true)
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {loungeDetailIsOwn ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-4 py-3 text-left text-[15px] font-medium text-rose-300 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                          disabled={loungeDetailDeleteBusy}
                          onClick={() => {
                            setLoungePostDetailMenuOpen(false)
                            setLoungePostDeleteConfirmOpen(true)
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                      {loungeViewerIsStaff ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-4 py-3 text-left text-[15px] font-medium text-fuchsia-200 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                          disabled={loungePinBusy}
                          onClick={() => void setLoungePostPinned(loungePostDetail.id, !loungePostDetail.pinned)}
                        >
                          {loungePostDetail.pinned ? 'Unpin from top' : 'Pin to top'}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="h-10 w-10 shrink-0" aria-hidden />
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              {loungeManageErr ? (
                <div className="mb-4 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
                  {loungeManageErr}
                </div>
              ) : null}

              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const p = loungePostDetail
                    closeLoungePostDetailImmediate()
                    void openProfileModal(p)
                  }}
                  className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-[15px] font-bold text-zinc-200 sm:h-[2.75rem] sm:w-[2.75rem] sm:text-[16px]"
                >
                  {loungePostDetail?.author_profile?.avatar_url ? (
                    <img
                      src={loungePostDetail.author_profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="eager"
                      decoding="async"
                    />
                  ) : (
                    <span
                      className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarToneClass(
                        loungePostDetail?.author_profile?.user_id ||
                          loungePostDetail?.user_id ||
                          displayLabel(loungePostDetail)
                      )}`}
                    >
                      {avatarText(loungePostDetail)}
                    </span>
                  )}
                </button>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        const p = loungePostDetail
                        closeLoungePostDetailImmediate()
                        void openProfileModal(p)
                      }}
                      className="min-w-0 inline-flex max-w-full overflow-hidden text-left hover:text-cyan-300"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
                        <span className="min-w-0 max-w-[min(12rem,46vw)] truncate font-semibold text-[15px] text-zinc-100 sm:max-w-[14rem]">
                          {displayNameFor(loungePostDetail)}
                        </span>
                        <LoungeStaffRoleBadge role={loungePostDetail?.author_profile?.role} size="detail" />
                        <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[15px] text-zinc-500">
                          <span className="min-w-0 truncate sm:max-w-[11rem]">{handleFor(loungePostDetail)}</span>
                          <span className="shrink-0 text-zinc-600">·</span>
                          <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
                            {postAgeLabel(loungePostDetail.created_at)}
                          </span>
                        </span>
                      </div>
                    </button>
                    {loungePostDetail.pinned ? (
                      <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                        Pinned
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {loungePostDetail.game_slug ? (
                <div className="mt-4 flex justify-start">
                  <span className="inline-flex max-w-full items-center truncate rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-tight text-amber-300 sm:max-w-[14rem]">
                    {loungePostDetail.game_title}
                  </span>
                </div>
              ) : null}

              {loungeDetailEditing ? (
                <div className={`relative ${loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'}`}>
                  <button
                    type="button"
                    disabled={loungeDetailEditBusy}
                    onClick={() => {
                      if (loungeDetailEditBusy) return
                      cancelLoungeDetailEdit()
                    }}
                    className="absolute right-0 top-0 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full bg-zinc-800/95 text-zinc-500 shadow-sm hover:bg-zinc-700 hover:text-zinc-200 active:text-white disabled:pointer-events-none disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                    title="Cancel edits"
                    aria-label="Cancel edits"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" aria-hidden>
                      <path
                        d="M6 6l8 8M14 6l-8 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <div className="pr-8">
                    <div className="grid min-h-[5rem] grid-cols-1 grid-rows-1 [&>*]:col-start-1 [&>*]:row-start-1">
                      <div
                        ref={loungeDetailEditMirrorRef}
                        aria-hidden
                        className="pointer-events-none min-h-[5rem] w-full overflow-y-auto whitespace-pre-wrap break-words border border-transparent px-0 py-0 text-left text-[18px] leading-snug text-zinc-100 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                      >
                        {loungeDetailDraftCaption ? (
                          renderRichCaption(loungeDetailDraftCaption, {
                            hashtagClassName: 'pointer-events-none font-semibold text-cyan-300',
                            linkClassName:
                              'pointer-events-none font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                          })
                        ) : (
                          <span className="text-zinc-500">Are you winning, son?</span>
                        )}
                      </div>
                      <textarea
                        ref={loungeDetailEditTextareaRef}
                        value={loungeDetailDraftCaption}
                        onChange={(e) => setLoungeDetailDraftCaption(e.target.value)}
                        onScroll={(e) => {
                          const m = loungeDetailEditMirrorRef.current
                          if (m) m.scrollTop = e.currentTarget.scrollTop
                        }}
                        className="z-10 min-h-[5rem] w-full resize-none touch-manipulation overflow-y-auto bg-transparent px-0 py-0 text-[18px] leading-snug text-transparent caret-white outline-none selection:bg-cyan-500/25"
                        placeholder=""
                        aria-label="Edit caption"
                        maxLength={280}
                      />
                    </div>
                    {loungeDetailEditErr ? (
                      <div className="mt-2 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
                        {loungeDetailEditErr}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div
                  className={`text-[18px] leading-snug text-zinc-100 whitespace-pre-wrap ${
                    loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                  }`}
                >
                  {renderRichCaption(feedPostDisplayCaption(loungePostDetail), {
                    hashtagClassName: 'font-semibold text-cyan-300',
                    linkClassName:
                      'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                  })}
                </div>
              )}

              <div className="mt-4 text-[14px] text-zinc-500">
                {formatLoungePostDetailWhen(loungePostDetail.created_at)}
                {loungePostDetail.edited_at ? (
                  <span className="text-zinc-600"> · Edited</span>
                ) : null}
              </div>

              {(() => {
                const d = loungePostDetail
                const ui = interactionStateFor(d.id)
                const isBookmarked = !!bookmarkedByPost[d.id]
                const baseComments = typeof d.comment_count === 'number' ? d.comment_count : 0
                const baseLikes = typeof d.like_count === 'number' ? d.like_count : 0
                const commentCount = baseComments + (loungeReadOnly ? 0 : ui.commented ? 1 : 0)
                const likeCount = baseLikes + (loungeReadOnly ? 0 : ui.liked ? 1 : 0)
                const commentClass = loungeReadOnly ? 'text-zinc-500' : ui.commented ? 'text-zinc-100' : 'text-zinc-500'
                const repostClass = loungeReadOnly ? 'text-zinc-500' : ui.reposted ? 'text-emerald-400' : 'text-zinc-500'
                const likeClass = loungeReadOnly ? 'text-zinc-500' : ui.liked ? 'text-rose-400' : 'text-zinc-500'
                const bookmarkClass = loungeReadOnly ? 'text-zinc-600' : isBookmarked ? 'text-amber-300' : 'text-zinc-500'
                const ro = loungeReadOnly
                return (
                  <div className="mt-5 border-t border-zinc-800/90 pt-4">
                    {loungeDetailEditing ? (
                      <>
                        <input
                          ref={loungeDetailEditMediaInputRef}
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null
                            if (!file) return
                            const mime = String(file.type || '').toLowerCase()
                            if (mime.startsWith('image/')) {
                              setLoungeDetailEditErr('')
                              setLoungeDetailEditMediaKind('image')
                              setLoungeDetailEditMediaFile(file)
                              return
                            }
                            if (mime.startsWith('video/')) {
                              setLoungeDetailEditErr('')
                              setLoungeDetailEditMediaKind('video')
                              setLoungeDetailEditMediaFile(file)
                              return
                            }
                            setLoungeDetailEditErr('Unsupported media type. Please choose an image or video file.')
                            setLoungeDetailEditMediaFile(null)
                            setLoungeDetailEditMediaKind('')
                            try {
                              const el = loungeDetailEditMediaInputRef.current
                              if (el) el.value = ''
                            } catch {
                              // ignore
                            }
                          }}
                        />
                        <div className="mb-2 flex w-full items-center gap-2 pr-2 pt-1.5 pb-1">
                          <button
                            type="button"
                            onClick={() => loungeDetailEditMediaInputRef.current?.click()}
                            className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1 text-zinc-500 hover:text-zinc-200 active:text-white [-webkit-tap-highlight-color:transparent]"
                            title="Add media"
                            aria-label="Add media"
                          >
                            <svg className="h-7 w-7" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <rect
                                x="3.75"
                                y="3.75"
                                width="12.5"
                                height="12.5"
                                rx="2"
                                stroke="currentColor"
                                strokeWidth="1.35"
                              />
                              <path
                                d="M6.25 13.25 8.25 10.25l1.75 2 2.25-3 3.5 4"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle cx="8" cy="8" r="0.9" fill="currentColor" />
                            </svg>
                          </button>
                          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                            <div className="min-w-0 flex-1 pr-2">
                              {loungeDetailEditMediaFile ? (
                                <span className="block truncate text-[17px] leading-tight text-zinc-400">
                                  {loungeDetailEditMediaKind === 'video' ? 'Video' : 'Image'} selected
                                </span>
                              ) : null}
                            </div>
                            <div className="inline-flex shrink-0 items-center gap-2 py-0.5">
                              {loungeDetailDraftCaption.length >= 280 ? (
                                <span className="text-[11px] tabular-nums font-semibold text-rose-400" aria-live="polite">
                                  {loungeDetailDraftCaption.length}/280
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => void saveLoungeDetailCaption()}
                                disabled={loungeDetailEditBusy}
                                className="min-h-8 shrink-0 touch-manipulation rounded-md bg-cyan-600 px-2 py-1 text-[14px] font-bold text-white hover:bg-cyan-500 disabled:opacity-60 [-webkit-tap-highlight-color:transparent]"
                              >
                                {loungeDetailEditBusy ? 'Saving…' : 'Save'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div
                      className={`grid grid-cols-5 items-center gap-1 text-[15px] ${loungeDetailEditing ? 'mt-1' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                      role="group"
                    >
                      <LoungeFeedStatSlot
                        readOnly={ro}
                        title={ro ? 'Sign in to comment' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => {
                          if (openProfileGateIfNeeded()) return
                          toggleInteraction(d.id, 'commented')
                        }}
                        className="inline-flex items-center justify-start gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                      >
                        <svg className={`h-[22px] w-[22px] ${commentClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path
                            d="M4.75 5.75h10.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3.25 2v-2H4.75a1.5 1.5 0 01-1.5-1.5v-5a1.5 1.5 0 011.5-1.5z"
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {Number.isFinite(commentCount) ? <span className={commentClass}>{commentCount}</span> : null}
                      </LoungeFeedStatSlot>
                      <LoungeFeedStatSlot
                        readOnly={ro}
                        title={ro ? 'Sign in to repost' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => {
                          if (openProfileGateIfNeeded()) return
                          toggleInteraction(d.id, 'reposted')
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                      >
                        <svg className={`h-[22px] w-[22px] ${repostClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path
                            d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </LoungeFeedStatSlot>
                      <LoungeFeedStatSlot
                        readOnly={ro}
                        title={ro ? 'Sign in to like' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => toggleInteraction(d.id, 'liked')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                      >
                        <svg className={`h-[22px] w-[22px] ${likeClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path
                            d="M10 16.1l-.85-.78C5.65 12.1 3.5 10.16 3.5 7.78A3.28 3.28 0 016.78 4.5c1.07 0 2.1.5 2.72 1.29A3.55 3.55 0 0112.22 4.5a3.28 3.28 0 013.28 3.28c0 2.38-2.15 4.33-5.65 7.54l-.85.78z"
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {Number.isFinite(likeCount) ? <span className={likeClass}>{likeCount}</span> : null}
                      </LoungeFeedStatSlot>
                      <span
                        className="inline-flex items-center justify-center rounded-lg px-2 py-2 text-zinc-600"
                        title="Share"
                        aria-hidden
                      >
                        <svg className={actionIconClass} viewBox="0 0 20 20" fill="none" aria-hidden>
                          <path
                            d="M11.5 4.75h3.75V8.5M15 5l-6.25 6.25M12.75 10.5v4a.75.75 0 01-.75.75H5.5a.75.75 0 01-.75-.75V8a.75.75 0 01.75-.75h4"
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      {ro ? (
                        <button
                          type="button"
                          onClick={requireLoungeAuth}
                          className="inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-2 text-zinc-600 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                          title="Sign in to save posts"
                        >
                          <svg className={`h-[22px] w-[22px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                            <path
                              d="M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleBookmark(d.id)}
                          className="inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                          title={isBookmarked ? 'Remove bookmark' : 'Save post'}
                        >
                          <svg className={`h-[22px] w-[22px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                            <path
                              d="M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>

          {loungePostDeleteConfirmOpen ? (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="lounge-delete-post-title"
              className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 p-4 sm:bg-black/70"
              onClick={() => {
                if (!loungeDetailDeleteBusy) setLoungePostDeleteConfirmOpen(false)
              }}
            >
              <div
                className="w-full max-w-sm rounded-3xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div id="lounge-delete-post-title" className="text-[17px] font-semibold text-zinc-100">
                  Delete this post?
                </div>
                <div className="mt-2 text-[14px] leading-relaxed text-zinc-300">
                  This removes the post from the Lounge. This cannot be undone.
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={loungeDetailDeleteBusy}
                    onClick={() => setLoungePostDeleteConfirmOpen(false)}
                    className="min-h-11 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-3 text-sm font-semibold text-zinc-200 touch-manipulation disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loungeDetailDeleteBusy}
                    onClick={() => void performLoungePostDeleteFromDetail()}
                    className="min-h-11 flex-1 rounded-xl border border-rose-500/50 bg-rose-600 px-3 text-sm font-semibold text-white touch-manipulation hover:bg-rose-500 disabled:opacity-50"
                  >
                    {loungeDetailDeleteBusy ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {profileModalOpen && profileModalData?.user_id ? (
        <LoungeProfileFullScreen
          open={profileModalOpen}
          panelVisible={profileModalVisible}
          profileUserId={profileModalData.user_id}
          viewerUserId={composerUserId || ''}
          supabaseClient={supabaseClient}
          profile={profileModalData}
          posts={profileModalPosts}
          loading={profileModalLoading}
          error={profileModalErr}
          isOwnProfile={Boolean(composerUserId && profileModalData.user_id === composerUserId)}
          onClose={closeProfileModal}
          onAfterTransitionOut={finalizeProfileModalClose}
          postCardProps={profilePostCardProps}
          onProfileUpdated={onProfileScreenUpdated}
        />
      ) : null}

      {profileGateOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default"
            aria-label="Close profile gate"
            onClick={() => {
              if (profileGateProvisionalConfirmNeeded) return
              setProfileGateOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl p-5">
            <div className="text-cyan-200 text-[15px] font-semibold uppercase tracking-wide">Complete your profile</div>
            <div className="text-white text-xl font-bold mt-1">One-time setup before posting</div>
            <div className="text-zinc-400 text-[15px] mt-2 leading-relaxed">
              {profileGateProvisionalConfirmNeeded
                ? 'We started your handle and display name from your email—confirm or edit them, then save.'
                : 'Pick a handle and display name for Lounge posts.'}
            </div>
            <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-zinc-400 text-[13px] font-semibold uppercase tracking-wide">Profile photo</span>
              <div className="mt-1 flex items-center gap-3">
                <label className="relative h-[3.3rem] w-[3.3rem] shrink-0 cursor-pointer overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 grid place-items-center">
                  {profileGateAvatarPreview ? (
                    <img
                      src={profileGateAvatarPreview}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span
                      className={`flex h-full w-full items-center justify-center text-[13px] font-bold text-white ${profileAvatarToneClass(
                        composerUserId || profileGateHandle || profileGateDisplayName
                      )}`}
                    >
                      {profileAvatarInitials(profileGateDisplayName, profileGateHandle)}
                    </span>
                  )}
                  <span
                    className="pointer-events-none absolute inset-0 flex items-center justify-center"
                    aria-hidden
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-1/2 w-1/2 text-cyan-400"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M12 4v16M4 12h16"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const input = e.target
                      const file = input.files?.[0] || null
                      if (!file) return
                      setProfileGateErr('')
                      const { file: ready, error } = await compressImageFileUnderMaxBytes(file)
                      if (error) {
                        setProfileGateErr(error.message)
                        try {
                          input.value = ''
                        } catch {
                          // ignore
                        }
                        return
                      }
                      setProfileGateAvatarFile(ready)
                      setProfileGateAvatarPreview(URL.createObjectURL(ready))
                    }}
                  />
                </label>
              </div>
            </label>
              <label className="block">
                <span className="text-zinc-400 text-[13px] font-semibold uppercase tracking-wide">Display name</span>
                <input
                  value={profileGateDisplayName}
                  onChange={(e) => setProfileGateDisplayName(e.target.value)}
                  maxLength={24}
                  className="mt-1 w-full min-h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-white text-[18px] focus:outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation"
                  placeholder="Bryan"
                />
              </label>
              <label className="block">
                <span className="text-zinc-400 text-[13px] font-semibold uppercase tracking-wide">Handle</span>
                <input
                  value={profileGateHandle ? `@${profileGateHandle}` : '@'}
                  onChange={(e) => setProfileGateHandle(handleSlugFromAtInput(e.target.value))}
                  className="mt-1 w-full min-h-12 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-white text-[18px] outline-none focus:ring-2 focus:ring-cyan-500/40 touch-manipulation"
                  placeholder="@your_handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </label>
              {profileGateErr ? (
                <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-rose-200 text-[13px] leading-relaxed break-words whitespace-pre-wrap">
                  {profileGateErr}
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={profileGateProvisionalConfirmNeeded || profileGateBusy}
                title={
                  profileGateProvisionalConfirmNeeded
                    ? 'Confirm your profile with Save to continue.'
                    : undefined
                }
                onClick={() => {
                  if (profileGateProvisionalConfirmNeeded) return
                  setProfileGateOpen(false)
                }}
                className="flex-1 min-h-11 rounded-xl bg-zinc-800 text-zinc-100 text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveProfileGate()}
                disabled={profileGateBusy}
                className="flex-1 min-h-11 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-[15px] text-white font-semibold disabled:opacity-60"
              >
                {profileGateBusy ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
