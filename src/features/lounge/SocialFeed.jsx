import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
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
  communityFeedPlainRepostInsertPayload,
  deleteLoungeFeedStreamPosterFromPublicUrl,
  feedPostAuthorEditMediaSeed,
  feedPostDisplayCaption,
  feedPostMediaUpdatePayload,
  feedPostStreamPosterUrl,
  feedPostStreamVideoUid,
  normalizeFeedCaption,
} from '../../utils/communityFeedPost'
import {
  isProbablyImageFile,
  isProbablyVideoFile,
  prepareAvatarImageForUpload,
} from '../../utils/compressImageForUpload'
import {
  LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES,
  LOUNGE_VIDEO_MAX_SECONDS,
  captureVideoFilePosterObjectUrl,
  deleteCfStreamForCommunityFeedPost,
  deleteCfStreamOrphanAsset,
  probeVideoFileDurationSeconds,
} from '../../utils/loungeVideoUpload'
import {
  buildLoungePostShareUrl,
  isLoungePostShareId,
  LOUNGE_SINGLE_POST_SELECT,
  shareLoungePostHybrid,
  stripLoungePostQueryParam,
} from '../../utils/loungeSharePost'
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
import { executeLoungeCommunityPostSubmission } from './loungePostSubmitJob'
import {
  runComposerStreamVideoPrepWithRetries,
  uploadEncodedVideoToCfStreamWithRetries,
} from './loungeComposerVideoPrep.js'
import { composerStableInitialsFromUid, formatLoungePostDetailWhen } from './loungeFormat'
import { renderRichCaption } from './loungeCaption'
import { LoungeImageCarousel, LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungePostArticle from './LoungePostArticle'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import { LoungeFeedInlineSoundResetBinder, LoungeFeedVideoAutoplayProvider } from './LoungeFeedVideoAutoplayContext.jsx'
import LoungeProfileFullScreen from './LoungeProfileFullScreen'
import ProfileAvatarCropModal from './ProfileAvatarCropModal'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import LoungeVideoCropModal from './LoungeVideoCropModal.jsx'
import { pinLoungeStreamSessionPoster, releaseLoungeStreamSessionPoster } from './loungeStreamSessionPoster.js'
import KlipyGifPicker from './KlipyGifPicker.jsx'
import EdgeLogoWithEasterEgg from '../../components/EdgeLogoWithEasterEgg.jsx'
import LoungeDockFooterBar from '../../components/LoungeDockFooterBar.jsx'
import LoungeDockArcCarouselPrototype from '../../components/LoungeDockArcCarouselPrototype.jsx'
import { buildLoungeDockArcCarouselItems } from '../../components/loungeDockArcCarouselItems.jsx'
import { dockChromeHeightFromTitleBarPx } from '../../utils/loungeDockChrome.js'
import {
  loungeTitleRevealAfterScrollStep,
  loungeTitleRevealClampScrollDelta,
} from '../../utils/loungeTitleRevealScroll.js'
import LoungeDockSlidePanels from '../../components/LoungeDockSlidePanels.jsx'
import LoungePostCommentThread from './LoungePostCommentThread.jsx'
import { LOUNGE_FEED_SCOPE_ALL, LOUNGE_FEED_SCOPE_FOLLOWING } from '../../utils/loungeFeedScope'
import { loungeCommentRootId } from '../../utils/loungeFeedComments.js'

/** DB raises exception 'MAX_PINNED_POSTS' when a third visible pin is attempted. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

/** Shown in upload bar `detail` instead of raw telemetry when `onUploadDiagnostic` fires. */
const LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL = 'Ether goblins ate your shit...trying again...'

const LOUNGE_POST_AUTHOR_EDIT_WINDOW_MS = 30 * 60 * 1000

function isLoungePostWithinAuthorEditWindow(createdAt) {
  if (!createdAt) return false
  const t = new Date(createdAt).getTime()
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= LOUNGE_POST_AUTHOR_EDIT_WINDOW_MS
}

const LOUNGE_COMPOSER_MAX_IMAGES = 6

function newComposerImageId() {
  return `ci-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Merge new file picks into composer/quote image lists; never call `setLoungeImageLimitDialog` from inside another setState updater. */
function mergeLoungePickedImageItems(prevItems, fileList, newIdFn) {
  const next = [...prevItems]
  const cap = LOUNGE_COMPOSER_MAX_IMAGES
  let room = Math.max(0, cap - next.length)
  let limitDialog = ''
  if (room === 0) {
    limitDialog = `You can attach up to ${cap} images.`
    return { next, limitDialog }
  }
  let skipped = 0
  for (const file of fileList) {
    if (room <= 0) {
      skipped += 1
      continue
    }
    next.push({ id: newIdFn(), file, preview: URL.createObjectURL(file) })
    room -= 1
  }
  if (skipped > 0) {
    limitDialog = `You can attach up to ${cap} images. Extra files were not added.`
  }
  return { next, limitDialog }
}

/** Caption length → counter color (yellow 265+, orange 275+, red at 280). */
function loungeCharCounterClass(len) {
  const n = typeof len === 'number' ? len : 0
  if (n >= 280) return 'font-semibold text-red-500'
  if (n >= 275) return 'font-semibold text-orange-400'
  if (n >= 265) return 'font-semibold text-yellow-400'
  return 'text-zinc-500'
}

/** External GIF URL field: at most one URL (e.g. Klipy); reject pasted multi-URL strings. */
function validateAtMostOneGifUrl(urlField) {
  const t = String(urlField ?? '').trim()
  if (!t) return { ok: true, value: '' }
  const schemeHits = t.match(/https?:\/\//gi)
  if (schemeHits && schemeHits.length > 1) {
    return { ok: false, message: 'Only one GIF is allowed per post.' }
  }
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length > 1 && parts.every((p) => /^https?:\/\//i.test(p))) {
    return { ok: false, message: 'Only one GIF is allowed per post.' }
  }
  return { ok: true, value: t }
}

export default function SocialFeed({
  supabaseClient,
  onRequireAuth,
  communityPosts,
  setCommunityPosts,
  communityFeedLoading,
  communityFeedLoadingMore,
  communityFeedHasMore,
  /** Supabase/PostgREST error from the last feed load (empty when OK). */
  communityFeedQueryErr = '',
  loadCommunityFeed,
  loadMoreCommunityFeed,
  hydrateCommunityPosts = async (rows) => rows ?? [],
  /** Optional shell UI (e.g. hamburger) rendered on the right side of the fixed title bar. */
  titleBarNavSlot = null,
  /** Shell subscription + staff (topic channels); merged in-feed with profile role where useful. */
  hasActiveSubscription = false,
  isStaff = false,
  loungeFeedScope = LOUNGE_FEED_SCOPE_ALL,
  onLoungeFeedScopeChange,
  loungeFeedBrowseMode = 'member',
}) {
  const BOOKMARKS_STORAGE_KEY = 'lounge_bookmarks_v1'
  const loungeComposerBoot = () => {
    const d = readLoungeComposerDraft()
    if (!d) return { expanded: false, fold: 0 }
    const expanded =
      d.composerExpanded === true || (d.postText || '').length > 0 || String(d.composerMediaUrl || '').trim().length > 0
    return { expanded, fold: expanded ? 1 : 0 }
  }
  const loungeComposerInitial = loungeComposerBoot()
  const [postText, setPostText] = useState(() => {
    const d = readLoungeComposerDraft()
    return d?.postText ?? ''
  })
  const [composerExpanded, setComposerExpanded] = useState(loungeComposerInitial.expanded)
  const [composerFoldReveal, setComposerFoldReveal] = useState(loungeComposerInitial.fold)
  /** Pending uploaded images (local previews). */
  const [composerImageItems, setComposerImageItems] = useState([])
  /** Single unsupported video selection (clears images). */
  const [composerVideoSlot, setComposerVideoSlot] = useState(null)
  /** External GIF (Klipy CDN URL). */
  const [composerMediaUrl, setComposerMediaUrl] = useState(() => {
    const d = readLoungeComposerDraft()
    return String(d?.composerMediaUrl || '').trim().slice(0, 2048)
  })
  const [klipyPickerOpen, setKlipyPickerOpen] = useState(false)
  const [klipyPickerTarget, setKlipyPickerTarget] = useState('composer')
  /** Moderator/admin: create this lounge post already pinned (only one pinned post globally). */
  const [composerPinOnPost, setComposerPinOnPost] = useState(false)
  const [postBusy, setPostBusy] = useState(false)
  const [postErr, setPostErr] = useState('')
  /** Bottom bar during background lounge post submission (`progress` 0–1, plus diagnostic copy). */
  const [loungePostUploadBar, setLoungePostUploadBar] = useState(null)
  /** Last step label when a background submission throws (paired with `loungePostUploadFailureDetails`). */
  const loungePostUploadLastPhaseRef = useRef('')
  /** Set on failed background submission for the retry modal. */
  const [loungePostUploadFailureDetails, setLoungePostUploadFailureDetails] = useState(null)
  /** True while any background lounge post submission is running (keeps Post disabled without the video bar). */
  const [loungePostSubmitInFlight, setLoungePostSubmitInFlight] = useState(false)
  const [loungePostUploadFailedOpen, setLoungePostUploadFailedOpen] = useState(false)
  const loungePostSnapshotRef = useRef(null)
  const loungePostAbortRef = useRef(null)
  /** True while a background lounge post job may be in flight (guards double submit). */
  const loungePostJobRunningRef = useRef(false)
  /** Patched after definitions so early `submitQuoteRepost` can call `clearQuoteRepostForPostAttempt` / `runBackgroundLoungePostSubmission` without reordering hooks. */
  const clearQuoteRepostForPostAttemptRef = useRef(/** @type {(opts?: { preserveQuoteVideoPrep?: boolean }) => void} */ (() => {}))
  const runBackgroundLoungePostSubmissionRef = useRef(/** @type {(snapshot: unknown) => void} */ (() => {}))
  /** Mirrors `composerVideoSlot` for async prep / dispose (avoid stale closures). */
  const composerVideoSlotRef = useRef(null)
  /** Monotonic id so an older prep run cannot clear UI after a newer one starts. */
  const composerVideoPrepJobIdRef = useRef(0)
  const composerVideoPrepAbortRef = useRef(null)
  /** Last spec passed to `runComposerStreamVideoPrepWithRetries` (for Retry after prep failure). */
  const composerVideoPrepSpecRef = useRef(null)
  /** After encode completes (same prep job), reused so a failed handoff / post retry does not re-run FFmpeg. */
  const composerVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  /**
   * In-flight composer prep handoff for posts submitted before prep finishes.
   * @type {{ jobId: number, promise: Promise<{ encodedFile: File, streamVideoUid: string }>, resolve: (v: { encodedFile: File, streamVideoUid: string }) => void, reject: (e: unknown) => void, settled: boolean } | null}
   */
  const composerVideoPrepHandoffRef = useRef(null)
  /** Latest failure payload for Retry (ref avoids stale closure). */
  const loungePostUploadFailureDetailsRef = useRef(null)
  /** When set, user is trimming a long video before it enters the composer or detail editor. */
  const [loungeVideoCrop, setLoungeVideoCrop] = useState(null)
  /** Non-empty while showing the “too many images” alert (composer + quote repost uploads). */
  const [loungeImageLimitDialog, setLoungeImageLimitDialog] = useState('')
  const [loungePinBusy, setLoungePinBusy] = useState(false)
  const [profileGateOpen, setProfileGateOpen] = useState(false)
  const [profileGateBusy, setProfileGateBusy] = useState(false)
  const [profileGateErr, setProfileGateErr] = useState('')
  const [profileGateHandle, setProfileGateHandle] = useState('')
  const [profileGateDisplayName, setProfileGateDisplayName] = useState('')
  const [profileGateAvatarFile, setProfileGateAvatarFile] = useState(null)
  const [profileGateAvatarPreview, setProfileGateAvatarPreview] = useState('')
  /** Raw pick before crop modal (Complete your profile). */
  const [profileGateAvatarCropFile, setProfileGateAvatarCropFile] = useState(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalVisible, setProfileModalVisible] = useState(true)
  const profileModalVisibleRef = useRef(true)
  const profileModalCloseFallbackTimerRef = useRef(0)
  /** `closeProfileModal` is defined later; dock Home uses this ref. */
  const closeProfileModalRef = useRef(() => {})
  const [profileModalLoading, setProfileModalLoading] = useState(false)
  const [profileModalErr, setProfileModalErr] = useState('')
  const [profileModalData, setProfileModalData] = useState(null)
  const [profileModalPosts, setProfileModalPosts] = useState([])
  const [interactionByPost, setInteractionByPost] = useState({})
  const [bookmarkedByPost, setBookmarkedByPost] = useState({})
  const interactionByPostRef = useRef(interactionByPost)
  interactionByPostRef.current = interactionByPost
  const bookmarkedByPostRef = useRef(bookmarkedByPost)
  bookmarkedByPostRef.current = bookmarkedByPost
  const bookmarksMigratedFromLocalRef = useRef(false)
  /** Maps original post id → this user's plain-repost row id (for undo). */
  const plainRepostChildIdRef = useRef({})
  /** Maps original post id → this user's quote-repost row id (for remove). */
  const quoteRepostChildIdRef = useRef({})
  const [composerDiscardPromptOpen, setComposerDiscardPromptOpen] = useState(false)
  const [loungeDetailRepostMenuOpen, setLoungeDetailRepostMenuOpen] = useState(false)
  const loungeDetailRepostMenuRef = useRef(null)
  const loungePostDetailScrollRef = useRef(null)
  const loungePostDetailTitleBarRef = useRef(null)
  const loungePostDetailTitleRevealRef = useRef(1)
  const [loungePostDetailTitleReveal, setLoungePostDetailTitleReveal] = useState(1)
  const [loungePostDetailTitleBarHeight, setLoungePostDetailTitleBarHeight] = useState(0)
  const loungePostDetailScrollPrevTopRef = useRef(0)
  const loungePostDetailScrollVisualRafRef = useRef(0)
  /** After a reply, iOS Safari often fires scroll/viewport jitter that would re-hide the title; ignore hide until this `performance.now()` deadline. */
  const loungePostDetailTitleCoerceUntilRef = useRef(0)
  const [quoteRepostModal, setQuoteRepostModal] = useState(null)
  const [quoteRepostDraft, setQuoteRepostDraft] = useState('')
  const [quoteRepostBusy, setQuoteRepostBusy] = useState(false)
  const [repostManageBusy, setRepostManageBusy] = useState(false)
  const [quoteRepostErr, setQuoteRepostErr] = useState('')
  const [quoteRepostQueuedToast, setQuoteRepostQueuedToast] = useState(false)
  const quoteRepostQueuedToastTimerRef = useRef(0)
  /** Transient copy/share feedback (permalink flow). */
  const [loungeShareFlash, setLoungeShareFlash] = useState('')
  const [quoteRepostImageItems, setQuoteRepostImageItems] = useState([])
  const composerImageItemsRef = useRef(composerImageItems)
  composerImageItemsRef.current = composerImageItems
  const quoteRepostImageItemsRef = useRef(quoteRepostImageItems)
  quoteRepostImageItemsRef.current = quoteRepostImageItems
  const [quoteRepostMediaUrl, setQuoteRepostMediaUrl] = useState('')
  /** Quote repost sheet: optional video (same slot shape as main composer). */
  const [quoteRepostVideoSlot, setQuoteRepostVideoSlot] = useState(null)
  const quoteRepostVideoSlotRef = useRef(null)
  const quoteRepostVideoPrepJobIdRef = useRef(0)
  const quoteRepostVideoPrepAbortRef = useRef(null)
  const quoteRepostVideoPrepSpecRef = useRef(null)
  const quoteRepostVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const quoteRepostVideoPrepHandoffRef = useRef(null)
  const quoteRepostTextareaRef = useRef(null)
  const quoteRepostMirrorRef = useRef(null)
  const quoteRepostScrollRef = useRef(null)
  const quoteRepostMediaInputRef = useRef(null)
  const [loungeDetailComments, setLoungeDetailComments] = useState([])
  const [loungeDetailCommentsLoading, setLoungeDetailCommentsLoading] = useState(false)
  const [loungeDetailCommentBusy, setLoungeDetailCommentBusy] = useState(false)
  const [loungeDetailCommentDraft, setLoungeDetailCommentDraft] = useState('')
  const [loungeDetailCommentErr, setLoungeDetailCommentErr] = useState('')
  /** Reply target: `null` = top-level comment on the post. */
  const [loungeCommentReplyTo, setLoungeCommentReplyTo] = useState(null)
  /** Thread roots to auto-expand after posting a reply (merged in `LoungePostCommentThread`). */
  const [loungeCommentExpandRoots, setLoungeCommentExpandRoots] = useState([])
  const [composerUserId, setComposerUserId] = useState('')
  /** Session user for email-based initials before `profiles` exists. */
  const [composerAuthUser, setComposerAuthUser] = useState(null)
  const [composerUserProfile, setComposerUserProfile] = useState(null)
  /** False until first `getSession()` completes — avoids flashing guest "ME" while auth is unknown. */
  const [composerAuthResolved, setComposerAuthResolved] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const [loungeFeedDeleteBusyPostId, setLoungeFeedDeleteBusyPostId] = useState(null)
  /** Left dock: search / notifications / chat (Lounge shell). */
  const [loungeDockPanel, setLoungeDockPanel] = useState(null)
  const [loungeFabPointerBlocked, setLoungeFabPointerBlocked] = useState(false)
  const [loungePanelTitleReveal, setLoungePanelTitleReveal] = useState(1)
  /** When set, Chat panel opens a DM with this user (cleared after `open_dm` runs). */
  const [chatDockInitialPeerUserId, setChatDockInitialPeerUserId] = useState(null)
  const [loungeDockFooterHeight, setLoungeDockFooterHeight] = useState(0)
  const [loungePostDetail, setLoungePostDetail] = useState(null)
  const [loungeDetailEditing, setLoungeDetailEditing] = useState(false)
  const [loungeDetailDraftCaption, setLoungeDetailDraftCaption] = useState('')
  const [loungeDetailEditBusy, setLoungeDetailEditBusy] = useState(false)
  const [loungeDetailEditErr, setLoungeDetailEditErr] = useState('')
  const [loungeDetailEditMediaFile, setLoungeDetailEditMediaFile] = useState(null)
  const [loungeDetailEditMediaKind, setLoungeDetailEditMediaKind] = useState('')
  /** Remote URLs for the post being edited (remove-only in UI until upload-on-edit exists). */
  const [loungeDetailEditImageUrls, setLoungeDetailEditImageUrls] = useState([])
  const [loungeDetailEditGifUrl, setLoungeDetailEditGifUrl] = useState('')
  const [loungeDetailDeleteBusy, setLoungeDetailDeleteBusy] = useState(false)
  const loungePostDeleteInflightRef = useRef(false)
  const [loungeManageErr, setLoungeManageErr] = useState('')
  const [loungePostDetailVisible, setLoungePostDetailVisible] = useState(true)
  const [loungePostDetailMenuOpen, setLoungePostDetailMenuOpen] = useState(false)
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
  /** Bound inside `LoungeFeedVideoAutoplayProvider` — reset feed inline sound when opening post detail. */
  const resetFeedInlineSoundRef = useRef(() => {})
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
  const composerDraftFlushRef = useRef({
    postText: '',
    composerExpanded: false,
    hasComposerLocalMedia: false,
    composerMediaUrl: '',
  })
  composerDraftFlushRef.current = {
    postText,
    composerExpanded,
    hasComposerLocalMedia: composerImageItems.length > 0 || composerVideoSlot != null,
    composerMediaUrl,
  }
  composerExpandedRef.current = composerExpanded

  /** No composer, server-only counts, gated taps until session is known and user is signed in. */
  const loungeReadOnly = !composerAuthResolved || !composerUserId

  const loungeViewerIsStaff = useMemo(() => {
    const r = composerUserProfile?.role
    return r === 'moderator' || r === 'admin'
  }, [composerUserProfile?.role])

  const chatDockIsStaff = Boolean(isStaff || loungeViewerIsStaff)

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
    setProfileGateAvatarCropFile(null)
    setProfileGateAvatarPreview(String(composerUserProfile?.avatar_url || '').trim())
    setProfileGateErr('')
    setProfileGateOpen(true)
    return true
  }, [composerUserId, composerAuthUser, loungeReadOnly, composerUserProfile])

  const requireLoungeAuth = useCallback(() => {
    onRequireAuth?.('login')
  }, [onRequireAuth])

  useEffect(() => {
    persistLoungeComposerDraft(
      postText,
      composerExpanded,
      composerImageItems.length > 0 || composerVideoSlot != null,
      composerMediaUrl
    )
  }, [postText, composerExpanded, composerImageItems, composerVideoSlot, composerMediaUrl])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const flush = () => {
      const { postText: t, composerExpanded: ex, hasComposerLocalMedia: hm, composerMediaUrl: u } =
        composerDraftFlushRef.current
      persistLoungeComposerDraft(t, ex, hm, u)
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
  }, [loungeDockPanel])

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
    /** Scroll px to move composer fold ~1.0; tuned so fold tracks finger distance. */
    const composerCouplingPx = 240
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
      const eff = rawDelta === 0 ? 0 : loungeTitleRevealClampScrollDelta(rawDelta)

      const titleStep = loungeTitleRevealAfterScrollStep({
        scrollTop: st,
        effectiveDelta: eff,
        revealRef: loungeTitleRevealRef,
      })
      let scrollVisualDirty = titleStep.changed

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

  useLayoutEffect(() => {
    if (!loungePostDetail) return
    const bar = loungePostDetailTitleBarRef.current
    if (!bar || typeof ResizeObserver === 'undefined') return
    const apply = () => {
      const h = Math.ceil(bar.getBoundingClientRect().height)
      if (h > 0) setLoungePostDetailTitleBarHeight((prev) => (prev === h ? prev : h))
    }
    apply()
    const ro = new ResizeObserver(() => apply())
    ro.observe(bar)
    return () => ro.disconnect()
  }, [loungePostDetail])

  /** Only reset scroll when opening a different post — same-post updates (e.g. like) replace `loungePostDetail` by id and must not jump to top. */
  useEffect(() => {
    if (!loungePostDetail?.id) return
    loungePostDetailTitleRevealRef.current = 1
    setLoungePostDetailTitleReveal(1)
    loungePostDetailTitleCoerceUntilRef.current = 0
    const el = loungePostDetailScrollRef.current
    if (el) {
      el.scrollTop = 0
      loungePostDetailScrollPrevTopRef.current = 0
    }
  }, [loungePostDetail?.id])

  useEffect(() => {
    const el = loungePostDetailScrollRef.current
    if (!el || typeof window === 'undefined' || !loungePostDetail) return
    loungePostDetailScrollPrevTopRef.current = el.scrollTop
    const titleRevealPerScrollPx = 220
    const titleHidePerScrollPx = 190
    const maxAbsScrollStepPx = 180
    const minScrollStepPx = 0.35
    const queueDetailTitleFlush = () => {
      if (loungePostDetailScrollVisualRafRef.current) return
      loungePostDetailScrollVisualRafRef.current = window.requestAnimationFrame(() => {
        loungePostDetailScrollVisualRafRef.current = 0
        setLoungePostDetailTitleReveal(loungePostDetailTitleRevealRef.current)
      })
    }
    const onScroll = () => {
      const st = el.scrollTop
      const prev = loungePostDetailScrollPrevTopRef.current
      const rawDelta = st - prev
      loungePostDetailScrollPrevTopRef.current = st
      const eff =
        rawDelta === 0 ? 0 : Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxAbsScrollStepPx)

      let r = loungePostDetailTitleRevealRef.current
      const tMono =
        typeof performance !== 'undefined' && typeof performance.now === 'function'
          ? performance.now()
          : Date.now()
      /** iOS: ignore scroll-driven hide briefly after a reply (keyboard / anchoring can fire bogus deltas). */
      if (tMono < loungePostDetailTitleCoerceUntilRef.current) {
        r = 1
      } else if (st <= 16) {
        /** Treat a small band as “top” so the bar can return after layout/anchoring without needing pixel-perfect `0`. */
        r = 1
      } else if (eff < -minScrollStepPx) {
        r = Math.min(1, r + (-eff) / titleRevealPerScrollPx)
      } else if (eff > minScrollStepPx) {
        r = Math.max(0, r - eff / titleHidePerScrollPx)
      }
      if (r !== loungePostDetailTitleRevealRef.current) {
        loungePostDetailTitleRevealRef.current = r
        queueDetailTitleFlush()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (loungePostDetailScrollVisualRafRef.current) {
        window.cancelAnimationFrame(loungePostDetailScrollVisualRafRef.current)
        loungePostDetailScrollVisualRafRef.current = 0
      }
    }
  }, [loungePostDetail])

  useEffect(() => {
    if (!loungeDetailRepostMenuOpen) return
    const close = (e) => {
      const wrap = loungeDetailRepostMenuRef.current
      if (wrap && e.target instanceof Node && wrap.contains(e.target)) return
      setLoungeDetailRepostMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [loungeDetailRepostMenuOpen])

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

  const handleShareLoungePost = useCallback((post) => {
    if (!post?.id) return
    const url = buildLoungePostShareUrl(post.id)
    /** Omit `text` so iMessage does not show a second bubble; caption lives in OG `description` from `/lounge/p/…`. */
    void shareLoungePostHybrid({
      url,
      title: 'Edge Lounge',
      onCopied: () => setLoungeShareFlash('Link copied to clipboard.'),
      onCopyFailed: () => setLoungeShareFlash('Could not copy link. Try copying from the address bar.'),
    })
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

  useEffect(() => {
    composerVideoSlotRef.current = composerVideoSlot
  }, [composerVideoSlot])

  useEffect(() => {
    quoteRepostVideoSlotRef.current = quoteRepostVideoSlot
  }, [quoteRepostVideoSlot])

  useEffect(() => {
    loungePostUploadFailureDetailsRef.current = loungePostUploadFailureDetails
  }, [loungePostUploadFailureDetails])

  useEffect(() => {
    if (!loungeShareFlash) return
    const tid = window.setTimeout(() => setLoungeShareFlash(''), 2500)
    return () => window.clearTimeout(tid)
  }, [loungeShareFlash])

  const disposeComposerVideoMedia = useCallback(
    (slot) => {
      if (!slot) return
      const uid = String(slot.streamVideoUid || '').trim()
      if (uid) void deleteCfStreamOrphanAsset(supabaseClient, uid)
      const p = slot.preview
      const po = slot.posterUrl
      if (p) {
        try {
          URL.revokeObjectURL(p)
        } catch {
          // ignore
        }
      }
      if (po && po !== p) {
        try {
          URL.revokeObjectURL(po)
        } catch {
          // ignore
        }
      }
    },
    [supabaseClient],
  )

  const startComposerVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      const prevH = composerVideoPrepHandoffRef.current
      if (prevH && !prevH.settled) {
        try {
          prevH.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        composerVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      const jobId = (composerVideoPrepJobIdRef.current += 1)
      composerVideoLastEncodedFileRef.current = null
      const ac = new AbortController()
      composerVideoPrepAbortRef.current = ac
      composerVideoPrepSpecRef.current = spec

      let resHandoff = /** @type {((v: { encodedFile: File, streamVideoUid: string }) => void) | null} */ (null)
      let rejHandoff = /** @type {((e: unknown) => void) | null} */ (null)
      const prepPromise = new Promise((res, rej) => {
        resHandoff = res
        rejHandoff = rej
      })
      const handoff = {
        jobId,
        settled: false,
        promise: prepPromise,
        resolve: (v) => {
          if (handoff.settled) return
          handoff.settled = true
          resHandoff?.(v)
        },
        reject: (e) => {
          if (handoff.settled) return
          handoff.settled = true
          rejHandoff?.(e)
        },
      }
      composerVideoPrepHandoffRef.current = handoff

      const nextSlot = {
        ...slotBase,
        prepJobId: jobId,
        prepStatus: 'preparing',
        prepError: '',
      }
      setComposerVideoSlot(nextSlot)
      setLoungePostUploadBar({
        mode: 'mediaPrep',
        prepJobId: jobId,
        progress: 0.02,
        status: 'Starting…',
        detail: '',
      })

      void (async () => {
        try {
          const result = await runComposerStreamVideoPrepWithRetries({
            supabaseClient,
            signal: ac.signal,
            spec,
            onEncodedFileReady: (f) => {
              composerVideoLastEncodedFileRef.current = f
            },
            onProgress: (info) => {
              if (composerVideoPrepJobIdRef.current !== jobId) return
              setLoungePostUploadBar((bar) => {
                if (!bar || bar?.mode !== 'mediaPrep' || bar.prepJobId !== jobId) return bar
                const d = String(info.detail || '').trim()
                return {
                  mode: 'mediaPrep',
                  prepJobId: jobId,
                  progress: typeof info.progress === 'number' ? info.progress : 0,
                  status: String(info.status || ''),
                  detail: d !== '' ? d : typeof bar.detail === 'string' ? bar.detail : '',
                }
              })
            },
            onUploadDiagnostic: (detail) => {
              if (composerVideoPrepJobIdRef.current !== jobId) return
              const d = String(detail || '').trim()
              if (!d) return
              setLoungePostUploadBar((bar) =>
                bar?.mode === 'mediaPrep' && bar.prepJobId === jobId
                  ? { ...bar, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL }
                  : bar,
              )
            },
          })
          if (ac.signal.aborted || composerVideoPrepJobIdRef.current !== jobId) {
            if (!handoff.settled) {
              handoff.reject(new DOMException('Aborted', 'AbortError'))
            }
            return
          }
          handoff.resolve(result)
          composerVideoLastEncodedFileRef.current = null
          const { encodedFile, streamVideoUid } = result
          setComposerVideoSlot((prev) => {
            if (!prev || prev.prepJobId !== jobId) return prev
            const oldPreview = prev.preview
            const oldPoster = prev.posterUrl
            const vidUrl = URL.createObjectURL(encodedFile)

            const posterToKeep =
              typeof oldPoster === 'string' && oldPoster && oldPoster !== vidUrl
                ? oldPoster
                : typeof oldPreview === 'string' && oldPreview && oldPreview !== vidUrl
                  ? oldPreview
                  : null

            if (oldPreview && oldPreview !== posterToKeep) {
              try {
                URL.revokeObjectURL(oldPreview)
              } catch {
                // ignore
              }
            }
            if (oldPoster && oldPoster !== posterToKeep) {
              try {
                URL.revokeObjectURL(oldPoster)
              } catch {
                // ignore
              }
            }
            return {
              ...prev,
              file: encodedFile,
              streamVideoUid,
              preview: vidUrl,
              posterUrl: posterToKeep,
              prepStatus: 'ready',
              prepError: '',
            }
          })
          setLoungePostUploadBar((bar) =>
            bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
          )
        } catch (e) {
          if (!handoff.settled) {
            handoff.reject(e instanceof Error ? e : new Error(String(e)))
          }
          if (e?.name === 'AbortError') {
            if (composerVideoPrepJobIdRef.current !== jobId) return
            setLoungePostUploadBar(null)
            return
          }
          if (composerVideoPrepJobIdRef.current !== jobId) return
          const msg =
            (e instanceof Error ? e.message : String(e || '')).trim() ||
            'Video upload failed after multiple attempts.'
          const slotStill = composerVideoSlotRef.current
          if (slotStill?.prepJobId === jobId) {
            setComposerVideoSlot((prev) => (prev?.prepJobId === jobId ? { ...prev, prepStatus: 'failed', prepError: msg } : prev))
            setLoungePostUploadFailureDetails({
              kind: 'mediaPrep',
              phase: 'Uploading media…',
              message: msg,
            })
            setLoungePostUploadFailedOpen(true)
          }
          setLoungePostUploadBar(null)
        }
      })()
    },
    [supabaseClient],
  )

  const startQuoteRepostVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      const prevH = quoteRepostVideoPrepHandoffRef.current
      if (prevH && !prevH.settled) {
        try {
          prevH.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        quoteRepostVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      const jobId = (quoteRepostVideoPrepJobIdRef.current += 1)
      quoteRepostVideoLastEncodedFileRef.current = null
      const ac = new AbortController()
      quoteRepostVideoPrepAbortRef.current = ac
      quoteRepostVideoPrepSpecRef.current = spec

      let resHandoff = /** @type {((v: { encodedFile: File, streamVideoUid: string }) => void) | null} */ (null)
      let rejHandoff = /** @type {((e: unknown) => void) | null} */ (null)
      const prepPromise = new Promise((res, rej) => {
        resHandoff = res
        rejHandoff = rej
      })
      const handoff = {
        jobId,
        settled: false,
        promise: prepPromise,
        resolve: (v) => {
          if (handoff.settled) return
          handoff.settled = true
          resHandoff?.(v)
        },
        reject: (e) => {
          if (handoff.settled) return
          handoff.settled = true
          rejHandoff?.(e)
        },
      }
      quoteRepostVideoPrepHandoffRef.current = handoff

      const nextSlot = {
        ...slotBase,
        prepJobId: jobId,
        prepStatus: 'preparing',
        prepError: '',
      }
      setQuoteRepostVideoSlot(nextSlot)
      setLoungePostUploadBar({
        mode: 'mediaPrep',
        prepJobId: jobId,
        progress: 0.02,
        status: 'Starting…',
        detail: '',
      })

      void (async () => {
        try {
          const result = await runComposerStreamVideoPrepWithRetries({
            supabaseClient,
            signal: ac.signal,
            spec,
            onEncodedFileReady: (f) => {
              quoteRepostVideoLastEncodedFileRef.current = f
            },
            onProgress: (info) => {
              if (quoteRepostVideoPrepJobIdRef.current !== jobId) return
              setLoungePostUploadBar((bar) => {
                if (!bar || bar?.mode !== 'mediaPrep' || bar.prepJobId !== jobId) return bar
                const d = String(info.detail || '').trim()
                return {
                  mode: 'mediaPrep',
                  prepJobId: jobId,
                  progress: typeof info.progress === 'number' ? info.progress : 0,
                  status: String(info.status || ''),
                  detail: d !== '' ? d : typeof bar.detail === 'string' ? bar.detail : '',
                }
              })
            },
            onUploadDiagnostic: (detail) => {
              if (quoteRepostVideoPrepJobIdRef.current !== jobId) return
              const d = String(detail || '').trim()
              if (!d) return
              setLoungePostUploadBar((bar) =>
                bar?.mode === 'mediaPrep' && bar.prepJobId === jobId
                  ? { ...bar, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL }
                  : bar,
              )
            },
          })
          if (ac.signal.aborted || quoteRepostVideoPrepJobIdRef.current !== jobId) {
            if (!handoff.settled) {
              handoff.reject(new DOMException('Aborted', 'AbortError'))
            }
            return
          }
          handoff.resolve(result)
          quoteRepostVideoLastEncodedFileRef.current = null
          const { encodedFile, streamVideoUid } = result
          setQuoteRepostVideoSlot((prev) => {
            if (!prev || prev.prepJobId !== jobId) return prev
            const oldPreview = prev.preview
            const oldPoster = prev.posterUrl
            const vidUrl = URL.createObjectURL(encodedFile)

            const posterToKeep =
              typeof oldPoster === 'string' && oldPoster && oldPoster !== vidUrl
                ? oldPoster
                : typeof oldPreview === 'string' && oldPreview && oldPreview !== vidUrl
                  ? oldPreview
                  : null

            if (oldPreview && oldPreview !== posterToKeep) {
              try {
                URL.revokeObjectURL(oldPreview)
              } catch {
                // ignore
              }
            }
            if (oldPoster && oldPoster !== posterToKeep) {
              try {
                URL.revokeObjectURL(oldPoster)
              } catch {
                // ignore
              }
            }
            return {
              ...prev,
              file: encodedFile,
              streamVideoUid,
              preview: vidUrl,
              posterUrl: posterToKeep,
              prepStatus: 'ready',
              prepError: '',
            }
          })
          setLoungePostUploadBar((bar) =>
            bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
          )
        } catch (e) {
          if (!handoff.settled) {
            handoff.reject(e instanceof Error ? e : new Error(String(e)))
          }
          if (e?.name === 'AbortError') {
            if (quoteRepostVideoPrepJobIdRef.current !== jobId) return
            setLoungePostUploadBar(null)
            return
          }
          if (quoteRepostVideoPrepJobIdRef.current !== jobId) return
          const msg =
            (e instanceof Error ? e.message : String(e || '')).trim() ||
            'Video upload failed after multiple attempts.'
          const slotStill = quoteRepostVideoSlotRef.current
          if (slotStill?.prepJobId === jobId) {
            setQuoteRepostVideoSlot((prev) =>
              prev?.prepJobId === jobId ? { ...prev, prepStatus: 'failed', prepError: msg } : prev,
            )
            setLoungePostUploadFailureDetails({
              kind: 'mediaPrep',
              target: 'quote',
              phase: 'Uploading media…',
              message: msg,
            })
            setLoungePostUploadFailedOpen(true)
          }
          setLoungePostUploadBar(null)
        }
      })()
    },
    [supabaseClient],
  )

  const cancelComposerMediaPrep = useCallback(() => {
    const h = composerVideoPrepHandoffRef.current
    if (h && !h.settled) {
      try {
        h.reject(new DOMException('Aborted', 'AbortError'))
      } catch {
        // ignore
      }
    }
    composerVideoPrepHandoffRef.current = null
    composerVideoPrepJobIdRef.current += 1
    try {
      composerVideoPrepAbortRef.current?.abort()
    } catch {
      // ignore
    }
    composerVideoPrepAbortRef.current = null
    composerVideoLastEncodedFileRef.current = null
    disposeComposerVideoMedia(composerVideoSlotRef.current)
    setComposerVideoSlot(null)
    setLoungePostUploadBar(null)
  }, [disposeComposerVideoMedia])

  const cancelQuoteRepostMediaPrep = useCallback(() => {
    const h = quoteRepostVideoPrepHandoffRef.current
    if (h && !h.settled) {
      try {
        h.reject(new DOMException('Aborted', 'AbortError'))
      } catch {
        // ignore
      }
    }
    quoteRepostVideoPrepHandoffRef.current = null
    quoteRepostVideoPrepJobIdRef.current += 1
    try {
      quoteRepostVideoPrepAbortRef.current?.abort()
    } catch {
      // ignore
    }
    quoteRepostVideoPrepAbortRef.current = null
    quoteRepostVideoLastEncodedFileRef.current = null
    disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
    setQuoteRepostVideoSlot(null)
    setLoungePostUploadBar(null)
  }, [disposeComposerVideoMedia])

  const queueLoungeVideoOrCrop = useCallback(
    async (vf, mode) => {
      const msgRead = (e) => (e instanceof Error ? e.message : 'Could not read this video file.')
      try {
        const dur = await probeVideoFileDurationSeconds(vf)
        if (!Number.isFinite(dur) || dur <= 0) {
          if (mode === 'composer') setPostErr('Could not read this video file.')
          else if (mode === 'quote') setQuoteRepostErr('Could not read this video file.')
          else setLoungeDetailEditErr('Could not read this video file.')
          return
        }
        if (dur <= LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
          if (mode === 'composer') {
            disposeComposerVideoMedia(composerVideoSlotRef.current)
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startComposerVideoPrepFromSpec(spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            setComposerMediaUrl('')
          } else if (mode === 'quote') {
            disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startQuoteRepostVideoPrepFromSpec(spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            setQuoteRepostMediaUrl('')
          } else {
            setLoungeDetailEditMediaFile(vf)
            setLoungeDetailEditMediaKind('video')
          }
          return
        }
        setLoungeVideoCrop({ file: vf, mode, knownDurationSec: dur })
      } catch (e) {
        if (mode === 'composer') setPostErr(msgRead(e))
        else if (mode === 'quote') setQuoteRepostErr(msgRead(e))
        else setLoungeDetailEditErr(msgRead(e))
      }
    },
    [disposeComposerVideoMedia, startComposerVideoPrepFromSpec, startQuoteRepostVideoPrepFromSpec],
  )

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

  const loungeComposerVideoPostBlocked = useMemo(() => {
    const v = composerVideoSlot
    if (!v) return false
    return v.prepStatus === 'failed'
  }, [composerVideoSlot])

  const loungeQuoteRepostVideoPostBlocked = useMemo(() => {
    const v = quoteRepostVideoSlot
    if (!v) return false
    return v.prepStatus === 'failed'
  }, [quoteRepostVideoSlot])

  const actionIconClass = 'h-[20px] w-[20px] text-zinc-500'

  const defaultInteraction = useMemo(
    () => ({ commented: false, reposted: false, liked: false, plainRepostChildId: null, quoteRepostChildId: null }),
    []
  )

  const patchPostAggregate = useCallback((postId, partial) => {
    setCommunityPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...partial } : p)))
    setLoungePostDetail((d) => (d && d.id === postId ? { ...d, ...partial } : d))
    setProfileModalPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...partial } : p)))
  }, [setCommunityPosts])

  const monoNow = useCallback(() => {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
    return Date.now()
  }, [])

  const forceLoungePostDetailTitleVisible = useCallback(() => {
    if (typeof window === 'undefined') return
    const pending = loungePostDetailScrollVisualRafRef.current
    if (pending) {
      window.cancelAnimationFrame(pending)
      loungePostDetailScrollVisualRafRef.current = 0
    }
    const sc = loungePostDetailScrollRef.current
    if (sc) loungePostDetailScrollPrevTopRef.current = sc.scrollTop
    loungePostDetailTitleRevealRef.current = 1
    setLoungePostDetailTitleReveal(1)
    loungePostDetailTitleCoerceUntilRef.current = monoNow() + 750
  }, [monoNow])

  /** iOS: layout, keyboard, and scroll anchoring settle after `rAF`; re-apply so a follow-up scroll event cannot leave the bar hidden. */
  const scheduleLoungePostDetailTitleAfterReply = useCallback(() => {
    const run = () => {
      try {
        const active = document.activeElement
        if (active && active.id === 'lounge-detail-comment') active.blur()
      } catch {
        // ignore
      }
      forceLoungePostDetailTitleVisible()
    }
    run()
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run)
    })
    window.setTimeout(run, 0)
    window.setTimeout(run, 140)
    window.setTimeout(run, 360)
  }, [forceLoungePostDetailTitleVisible])

  const refreshLoungePostInteractions = useCallback(
    async (postIds) => {
      const ids = [...new Set((postIds || []).filter(Boolean))]
      if (!composerUserId || ids.length === 0) return
      const uid = composerUserId
      const [likesRes, quoteRepostRes, bookmarksRes, commentsRes, countsRes] = await Promise.all([
        supabaseClient.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', ids),
        supabaseClient
          .from('community_feed_posts')
          .select('id,repost_of_post_id,is_plain_repost')
          .eq('user_id', uid)
          .in('repost_of_post_id', ids)
          .is('hidden_at', null),
        supabaseClient.from('post_bookmarks').select('post_id').eq('user_id', uid).in('post_id', ids),
        supabaseClient
          .from('feed_comments')
          .select('post_id')
          .eq('user_id', uid)
          .is('parent_id', null)
          .is('hidden_at', null)
          .in('post_id', ids),
        supabaseClient
          .from('community_feed_posts')
          .select('id,like_count,comment_count,repost_count')
          .in('id', ids),
      ])
      const errMsg =
        likesRes.error?.message ||
        quoteRepostRes.error?.message ||
        bookmarksRes.error?.message ||
        commentsRes.error?.message ||
        countsRes.error?.message
      if (errMsg) {
        console.warn('refreshLoungePostInteractions:', errMsg)
        return
      }
      const likedSet = new Set((likesRes.data || []).map((r) => r.post_id))
      const repostedSet = new Set()
      const nextPlain = { ...plainRepostChildIdRef.current }
      const nextQuote = { ...quoteRepostChildIdRef.current }
      for (const id of ids) {
        delete nextPlain[id]
        delete nextQuote[id]
      }
      for (const r of quoteRepostRes.data || []) {
        const oid = r.repost_of_post_id
        if (!oid) continue
        repostedSet.add(oid)
        if (r.is_plain_repost === true) nextPlain[oid] = r.id
        else nextQuote[oid] = r.id
      }
      plainRepostChildIdRef.current = nextPlain
      quoteRepostChildIdRef.current = nextQuote
      const commentedSet = new Set((commentsRes.data || []).map((r) => r.post_id))
      setInteractionByPost((prev) => {
        const next = { ...prev }
        for (const id of ids) {
          const cur = next[id] || { ...defaultInteraction }
          const plainId = nextPlain[id] || null
          const quoteId = nextQuote[id] || null
          next[id] = {
            ...cur,
            liked: likedSet.has(id),
            reposted: !!(plainId || quoteId),
            plainRepostChildId: plainId,
            quoteRepostChildId: quoteId,
            commented: commentedSet.has(id),
          }
        }
        return next
      })
      setBookmarkedByPost((prev) => {
        const next = { ...prev }
        for (const id of ids) {
          if ((bookmarksRes.data || []).some((r) => r.post_id === id)) next[id] = true
          else delete next[id]
        }
        return next
      })
      for (const row of countsRes.data || []) {
        if (!row?.id) continue
        patchPostAggregate(row.id, {
          like_count: row.like_count,
          comment_count: row.comment_count,
          repost_count: row.repost_count,
        })
      }
    },
    [composerUserId, defaultInteraction, patchPostAggregate, supabaseClient]
  )

  const feedPostIdsKey = useMemo(
    () =>
      communityPosts
        .map((p) => p?.id)
        .filter(Boolean)
        .join(','),
    [communityPosts]
  )

  useEffect(() => {
    if (!composerUserId || loungeReadOnly) return
    const ids = feedPostIdsKey ? feedPostIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) return
    let cancelled = false
    ;(async () => {
      if (!bookmarksMigratedFromLocalRef.current && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY)
          if (raw) {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              const toSave = Object.keys(parsed).filter((pid) => parsed[pid])
              for (const postId of toSave) {
                if (cancelled) return
                await supabaseClient.from('post_bookmarks').upsert(
                  { post_id: postId, user_id: composerUserId },
                  { onConflict: 'post_id,user_id' }
                )
              }
            }
            window.localStorage.removeItem(BOOKMARKS_STORAGE_KEY)
          }
        } catch {
          // ignore migration errors
        }
        bookmarksMigratedFromLocalRef.current = true
      }
      if (cancelled) return
      await refreshLoungePostInteractions(ids)
    })()
    return () => {
      cancelled = true
    }
  }, [composerUserId, loungeReadOnly, feedPostIdsKey, refreshLoungePostInteractions, supabaseClient])

  const interactionStateFor = useCallback(
    (postId) => interactionByPost[postId] || defaultInteraction,
    [interactionByPost, defaultInteraction]
  )

  const toggleInteraction = useCallback(
    async (postId, key) => {
      if (!composerUserId) return
      if (key === 'commented') return
      if (key === 'reposted') return
      if (key !== 'liked') return undefined
      const prevSnap = interactionByPostRef.current[postId] || defaultInteraction
      const was = !!prevSnap[key]
      const delta = was ? -1 : 1
      const countKey = 'like_count'
      setInteractionByPost((prev) => {
        const cur = prev[postId] || defaultInteraction
        return { ...prev, [postId]: { ...cur, [key]: !was } }
      })
      setCommunityPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, [countKey]: Math.max(0, (Number(p[countKey]) || 0) + delta) } : p
        )
      )
      setLoungePostDetail((d) =>
        d && d.id === postId ? { ...d, [countKey]: Math.max(0, (Number(d[countKey]) || 0) + delta) } : d
      )
      setProfileModalPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, [countKey]: Math.max(0, (Number(p[countKey]) || 0) + delta) } : p
        )
      )
      const res = was
        ? await supabaseClient.from('post_likes').delete().eq('post_id', postId).eq('user_id', composerUserId)
        : await supabaseClient.from('post_likes').insert({ post_id: postId, user_id: composerUserId })
      if (res.error) {
        setInteractionByPost((prev) => {
          const cur = prev[postId] || defaultInteraction
          return { ...prev, [postId]: { ...cur, [key]: was } }
        })
        setCommunityPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, [countKey]: Math.max(0, (Number(p[countKey]) || 0) - delta) } : p
          )
        )
        setLoungePostDetail((d) =>
          d && d.id === postId ? { ...d, [countKey]: Math.max(0, (Number(d[countKey]) || 0) - delta) } : d
        )
        setProfileModalPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, [countKey]: Math.max(0, (Number(p[countKey]) || 0) - delta) } : p
          )
        )
        setLoungeManageErr(res.error.message || 'Could not update.')
        return { ok: false }
      }
      const { data: row } = await supabaseClient
        .from('community_feed_posts')
        .select('like_count,comment_count,repost_count')
        .eq('id', postId)
        .maybeSingle()
      if (row) patchPostAggregate(postId, row)
      return { ok: true, liked: !was }
    },
    [composerUserId, defaultInteraction, patchPostAggregate, setCommunityPosts, supabaseClient]
  )

  const clearQuoteRepostFileAttachment = useCallback(() => {
    setQuoteRepostImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    try {
      const el = quoteRepostMediaInputRef.current
      if (el) el.value = ''
    } catch {
      // ignore
    }
  }, [])

  const clearQuoteRepostMedia = useCallback(() => {
    cancelQuoteRepostMediaPrep()
    clearQuoteRepostFileAttachment()
    setQuoteRepostMediaUrl('')
  }, [cancelQuoteRepostMediaPrep, clearQuoteRepostFileAttachment])

  const handleKlipyGifPicked = useCallback(
    ({ gifUrl }) => {
      const chk = validateAtMostOneGifUrl(gifUrl)
      if (!chk.ok) {
        if (klipyPickerTarget === 'quote') setQuoteRepostErr(chk.message)
        else setPostErr(chk.message)
        return
      }
      const u = chk.value
      if (!u) return
      if (klipyPickerTarget === 'quote') {
        cancelQuoteRepostMediaPrep()
        setQuoteRepostMediaUrl(u)
      } else {
        disposeComposerVideoMedia(composerVideoSlotRef.current)
        composerVideoPrepJobIdRef.current += 1
        try {
          composerVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        composerVideoPrepAbortRef.current = null
        setComposerVideoSlot(null)
        setLoungePostUploadBar(null)
        try {
          const el = composerMediaInputRef.current
          if (el) el.value = ''
        } catch {
          // ignore
        }
        setComposerMediaUrl(u)
      }
    },
    [klipyPickerTarget, setPostErr, setQuoteRepostErr, disposeComposerVideoMedia, cancelQuoteRepostMediaPrep],
  )

  const openQuoteRepostComposer = useCallback(
    (post) => {
      if (!post?.id || loungeReadOnly) return
      if (openProfileGateIfNeeded()) return
      clearQuoteRepostMedia()
      setQuoteRepostDraft('')
      setQuoteRepostErr('')
      setQuoteRepostModal({ mode: 'compose', original: post })
      setLoungeDetailRepostMenuOpen(false)
    },
    [clearQuoteRepostMedia, loungeReadOnly, openProfileGateIfNeeded]
  )

  const handlePlainRepost = useCallback(
    async (post) => {
      if (!post?.id || loungeReadOnly || !composerUserId) return
      if (openProfileGateIfNeeded()) return
      setLoungeManageErr('')
      setLoungeDetailRepostMenuOpen(false)
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession()
        if (!session?.user) {
          onRequireAuth?.('login')
          return
        }
        const { data: ownProfile, error: profileErr } = await fetchOwnProfile(supabaseClient, session.user.id)
        if (profileErr) {
          setLoungeManageErr(`Could not verify profile: ${profileErr.message || 'Unknown error.'}`)
          return
        }
        if (loungeProfileNeedsGate(ownProfile, session.user.id)) {
          const h = String(ownProfile?.handle || '').trim()
          const d = String(ownProfile?.display_name || '').trim()
          const seed = profileSeedFromUser(session.user)
          setProfileGateHandle(h || seed.baseHandle)
          setProfileGateDisplayName(d || seed.displayName)
          setProfileGateAvatarFile(null)
          setProfileGateAvatarCropFile(null)
          setProfileGateAvatarPreview(ownProfile?.avatar_url || composerUserProfile?.avatar_url || '')
          setProfileGateErr('')
          setProfileGateOpen(true)
          setLoungeManageErr('Complete your profile to repost.')
          return
        }
        const { error } = await supabaseClient
          .from('community_feed_posts')
          .insert(communityFeedPlainRepostInsertPayload({ originalPostId: post.id }))
        if (error) {
          const msg = String(error.message || '')
          if (error.code === '23505') {
            setLoungeManageErr('You already have a plain repost for this post.')
            return
          }
          if (msg.toLowerCase().includes('rate limit exceeded')) {
            setLoungeManageErr(rateLimitMessage(msg))
            return
          }
          if (error.code === '42501') {
            setLoungeManageErr('Reposting is blocked by current permissions.')
            return
          }
          if (msg.toLowerCase().includes('plain') || msg.toLowerCase().includes('caption')) {
            setLoungeManageErr('Plain repost is not available until the latest DB migration is applied.')
            return
          }
          setLoungeManageErr(msg || 'Could not repost right now.')
          return
        }
        await loadCommunityFeed({ silent: true })
        await refreshLoungePostInteractions([post.id])
      } catch (e) {
        setLoungeManageErr(e?.message || 'Could not repost.')
      }
    },
    [
      composerUserId,
      composerUserProfile?.avatar_url,
      loungeReadOnly,
      loadCommunityFeed,
      openProfileGateIfNeeded,
      rateLimitMessage,
      refreshLoungePostInteractions,
      supabaseClient,
      onRequireAuth,
    ]
  )

  const undoPlainRepostForOriginal = useCallback(
    async (originalPostId) => {
      if (!originalPostId || !composerUserId) return
      const childId =
        plainRepostChildIdRef.current[originalPostId] ||
        interactionByPostRef.current[originalPostId]?.plainRepostChildId
      if (!childId) {
        setLoungeManageErr('Could not find your repost. Try refreshing.')
        return
      }
      setRepostManageBusy(true)
      setLoungeManageErr('')
      try {
        const { error } = await supabaseClient
          .from('community_feed_posts')
          .delete()
          .eq('id', childId)
          .eq('user_id', composerUserId)
        if (error) {
          setLoungeManageErr(error.message || 'Could not undo repost.')
          return
        }
        await loadCommunityFeed({ silent: true })
        await refreshLoungePostInteractions([originalPostId])
      } finally {
        setRepostManageBusy(false)
      }
    },
    [composerUserId, loadCommunityFeed, refreshLoungePostInteractions, supabaseClient]
  )

  const openRemoveQuoteRepostForPost = useCallback(
    (post) => {
      if (!post?.id || loungeReadOnly) return
      const quoteId =
        quoteRepostChildIdRef.current[post.id] ||
        interactionByPostRef.current[post.id]?.quoteRepostChildId
      if (!quoteId) {
        setLoungeManageErr('Could not find your quote repost. Try refreshing.')
        return
      }
      setLoungeDetailRepostMenuOpen(false)
      setQuoteRepostErr('')
      setQuoteRepostModal({ mode: 'remove', original: post, childId: quoteId })
    },
    [loungeReadOnly]
  )

  /** Quote repost uses the same background submission + upload bar as the main composer. */
  const submitQuoteRepost = useCallback(async () => {
    const modal = quoteRepostModal
    if (!modal || modal.mode !== 'compose' || !modal.original?.id) return
    const originalId = modal.original.id
    const cap = normalizeFeedCaption(quoteRepostDraft)
    setQuoteRepostErr('')
    const quoteGifCheck = validateAtMostOneGifUrl(quoteRepostMediaUrl)
    if (!quoteGifCheck.ok) {
      setQuoteRepostErr(quoteGifCheck.message)
      return
    }
    const gifOnlyUrl = quoteGifCheck.value
    const slotNow = quoteRepostVideoSlotRef.current
    const hasVideo = slotNow != null
    if (hasVideo && gifOnlyUrl) {
      setQuoteRepostErr('Remove the GIF before posting a video.')
      return
    }
    if (hasVideo && slotNow?.file && slotNow.file.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
      setQuoteRepostErr('Video must be 200 MB or smaller for upload.')
      return
    }
    const hasQuoteMedia =
      quoteRepostImageItems.length > 0 || String(gifOnlyUrl || '').trim().length > 0 || hasVideo
    if (!cap && !hasQuoteMedia) {
      setQuoteRepostErr('Add a comment, image, GIF, or video to repost.')
      return
    }
    if (loungePostJobRunningRef.current) return
    if (loungeQuoteRepostVideoPostBlocked) return
    if (hasVideo && slotNow?.prepStatus === 'failed') {
      setQuoteRepostErr(slotNow.prepError || 'Video processing failed. Remove the video or try again.')
      return
    }

    setQuoteRepostBusy(true)
    let snapshot = null
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        onRequireAuth?.('login')
        return
      }
      const { data: ownProfile, error: profileErr } = await fetchOwnProfile(supabaseClient, session.user.id)
      if (profileErr) {
        setQuoteRepostErr(`Could not verify profile: ${profileErr.message || 'Unknown error.'}`)
        return
      }
      if (loungeProfileNeedsGate(ownProfile, session.user.id)) {
        const h = String(ownProfile?.handle || '').trim()
        const d = String(ownProfile?.display_name || '').trim()
        const seed = profileSeedFromUser(session.user)
        setProfileGateHandle(h || seed.baseHandle)
        setProfileGateDisplayName(d || seed.displayName)
        setProfileGateAvatarFile(null)
        setProfileGateAvatarCropFile(null)
        setProfileGateAvatarPreview(ownProfile?.avatar_url || composerUserProfile?.avatar_url || '')
        setProfileGateErr('')
        setQuoteRepostModal(null)
        setQuoteRepostDraft('')
        setQuoteRepostErr('')
        clearQuoteRepostMedia()
        setProfileGateOpen(true)
        setLoungeManageErr('Complete your profile to repost.')
        return
      }

      const slot = quoteRepostVideoSlotRef.current
      const uid = hasVideo ? String(slot?.streamVideoUid || '').trim() || null : null
      const awaiting =
        hasVideo &&
        !uid &&
        slot?.prepStatus === 'preparing' &&
        typeof slot?.prepJobId === 'number'
          ? slot.prepJobId
          : null
      const specForSnap = awaiting != null ? quoteRepostVideoPrepSpecRef.current : null
      const trimRestore =
        awaiting != null && specForSnap && specForSnap.kind === 'trim' && slot
          ? { posterUrl: slot.posterUrl, preview: slot.preview }
          : null
      const sessionPosterBlob =
        hasVideo && slot?.posterUrl && String(slot.posterUrl).startsWith('blob:')
          ? String(slot.posterUrl)
          : null

      snapshot = {
        caption: cap,
        gifOnlyUrl,
        imageFiles: quoteRepostImageItems.map((it) => it.file),
        videoFile: hasVideo && slot?.file ? slot.file : null,
        streamVideoUid: uid,
        awaitingComposerVideoPrepJobId: awaiting,
        videoPrepSpec: specForSnap,
        videoPrepSlotRestore: trimRestore,
        sessionStreamPosterBlobUrl: sessionPosterBlob,
        wantsPin: false,
        isStaffPoster: false,
        quoteRepostOfPostId: originalId,
      }
    } finally {
      setQuoteRepostBusy(false)
    }

    if (!snapshot) return

    const preserveVideoPrep = snapshot.awaitingComposerVideoPrepJobId != null
    loungePostSnapshotRef.current = snapshot
    clearQuoteRepostForPostAttemptRef.current?.({ preserveQuoteVideoPrep: preserveVideoPrep })
    void runBackgroundLoungePostSubmissionRef.current?.(snapshot)

    const quoteMediaOrPrepPending =
      (Array.isArray(snapshot.imageFiles) && snapshot.imageFiles.length > 0) ||
      Boolean(String(snapshot.gifOnlyUrl || '').trim()) ||
      Boolean(snapshot.videoFile) ||
      Boolean(String(snapshot.streamVideoUid || '').trim()) ||
      snapshot.awaitingComposerVideoPrepJobId != null
    if (quoteMediaOrPrepPending) {
      try {
        window.clearTimeout(quoteRepostQueuedToastTimerRef.current)
      } catch {
        // ignore
      }
      setQuoteRepostQueuedToast(true)
      quoteRepostQueuedToastTimerRef.current = window.setTimeout(() => {
        quoteRepostQueuedToastTimerRef.current = 0
        setQuoteRepostQueuedToast(false)
      }, 2800)
    }
  }, [
    clearQuoteRepostMedia,
    composerUserProfile?.avatar_url,
    loungeQuoteRepostVideoPostBlocked,
    onRequireAuth,
    quoteRepostImageItems,
    quoteRepostMediaUrl,
    quoteRepostModal,
    quoteRepostDraft,
    supabaseClient,
  ])

  const confirmRemoveQuoteRepost = useCallback(async () => {
    const modal = quoteRepostModal
    if (!modal || modal.mode !== 'remove' || !modal.childId || !composerUserId) return
    setQuoteRepostBusy(true)
    setQuoteRepostErr('')
    try {
      const { error } = await supabaseClient
        .from('community_feed_posts')
        .delete()
        .eq('id', modal.childId)
        .eq('user_id', composerUserId)
      if (error) {
        setQuoteRepostErr(error.message || 'Could not remove quote repost.')
        return
      }
      const origId = modal.original?.id
      setQuoteRepostModal(null)
      clearQuoteRepostMedia()
      await loadCommunityFeed({ silent: true })
      if (origId) await refreshLoungePostInteractions([origId])
    } finally {
      setQuoteRepostBusy(false)
    }
  }, [clearQuoteRepostMedia, quoteRepostModal, composerUserId, supabaseClient, loadCommunityFeed, refreshLoungePostInteractions])

  useLayoutEffect(() => {
    if (!quoteRepostModal || quoteRepostModal.mode !== 'compose') return
    const el = quoteRepostTextareaRef.current
    if (!el) return
    try {
      el.focus({ preventScroll: true })
    } catch {
      el.focus()
    }
  }, [quoteRepostModal])

  useEffect(() => {
    return () => {
      try {
        window.clearTimeout(quoteRepostQueuedToastTimerRef.current)
      } catch {
        // ignore
      }
      quoteRepostQueuedToastTimerRef.current = 0
    }
  }, [])

  const toggleBookmark = useCallback(async (postId) => {
    if (!composerUserId) return { ok: false }
    const was = !!bookmarkedByPostRef.current[postId]
    setBookmarkedByPost((prev) => ({ ...prev, [postId]: !was }))
    const res = was
      ? await supabaseClient.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', composerUserId)
      : await supabaseClient.from('post_bookmarks').insert({ post_id: postId, user_id: composerUserId })
    if (res.error) {
      setBookmarkedByPost((prev) => ({ ...prev, [postId]: was }))
      setLoungeManageErr(res.error.message || 'Could not update bookmark.')
      return { ok: false }
    }
    return { ok: true, bookmarked: !was }
  }, [composerUserId, supabaseClient])

  const submitLoungeDetailComment = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId || loungeReadOnly) return
    const body = loungeDetailCommentDraft.trim()
    if (body.length === 0) return
    const parentId = loungeCommentReplyTo?.id || null
    setLoungeDetailCommentBusy(true)
    setLoungeDetailCommentErr('')
    const insertRow = { post_id: loungePostDetail.id, user_id: composerUserId, body }
    if (parentId) insertRow.parent_id = parentId
    const { data, error } = await supabaseClient
      .from('feed_comments')
      .insert(insertRow)
      .select('id,body,created_at,user_id,parent_id')
      .single()
    setLoungeDetailCommentBusy(false)
    if (error) {
      setLoungeDetailCommentErr(error.message)
      return
    }
    const pr = await supabaseClient
      .from('profiles')
      .select('user_id,handle,display_name,avatar_url,role,is_og')
      .eq('user_id', composerUserId)
      .maybeSingle()
    const row = { ...data, author_profile: pr.data || composerUserProfile || null }
    setLoungeDetailComments((c) => {
      const next = [...c, row]
      if (parentId) {
        const byId = new Map(next.map((r) => [r.id, r]))
        const rootId = loungeCommentRootId(parentId, byId)
        if (rootId) setLoungeCommentExpandRoots([rootId])
      }
      return next
    })
    setLoungeDetailCommentDraft('')
    setLoungeCommentReplyTo(null)
    if (!parentId) {
      const { data: countRow } = await supabaseClient
        .from('community_feed_posts')
        .select('comment_count')
        .eq('id', loungePostDetail.id)
        .maybeSingle()
      if (countRow && typeof countRow.comment_count === 'number') {
        patchPostAggregate(loungePostDetail.id, { comment_count: countRow.comment_count })
      }
    }
    setInteractionByPost((prev) => {
      const cur = prev[loungePostDetail.id] || defaultInteraction
      return { ...prev, [loungePostDetail.id]: { ...cur, commented: true } }
    })
    scheduleLoungePostDetailTitleAfterReply()
  }, [
    composerUserId,
    composerUserProfile,
    defaultInteraction,
    loungeCommentReplyTo?.id,
    loungeDetailCommentDraft,
    loungePostDetail?.id,
    loungeReadOnly,
    patchPostAggregate,
    scheduleLoungePostDetailTitleAfterReply,
    supabaseClient,
  ])

  const onLoungeCommentReply = useCallback((comment) => {
    if (!comment?.id) return
    const p = comment.author_profile
    const h = String(p?.handle || '').trim()
    const label = h ? `@${h}` : String(p?.display_name || 'Member').trim() || 'Member'
    setLoungeCommentReplyTo({ id: comment.id, label })
    setLoungeDetailCommentErr('')
    requestAnimationFrame(() => {
      document.getElementById('lounge-detail-comment')?.focus()
    })
  }, [])

  useEffect(() => {
    if (!loungePostDetail?.id || loungeReadOnly) {
      setLoungeDetailComments([])
      setLoungeDetailCommentsLoading(false)
      setLoungeDetailCommentErr('')
      return
    }
    let cancelled = false
    setLoungeDetailCommentsLoading(true)
    setLoungeDetailCommentErr('')
    ;(async () => {
      const postId = loungePostDetail.id
      const { data, error } = await supabaseClient
        .from('feed_comments')
        .select('id,body,created_at,user_id,parent_id')
        .eq('post_id', postId)
        .is('hidden_at', null)
        .order('created_at', { ascending: true })
      if (cancelled) return
      setLoungeDetailCommentsLoading(false)
      if (error) {
        setLoungeDetailCommentErr(error.message)
        setLoungeDetailComments([])
        return
      }
      const rows = data || []
      const authorIds = [...new Set(rows.map((r) => String(r.user_id)).filter(Boolean))]
      let profileBy = {}
      if (authorIds.length) {
        const pr = await supabaseClient
          .from('profiles')
          .select('user_id,handle,display_name,avatar_url,role,is_og')
          .in('user_id', authorIds)
        if (!pr.error && pr.data) profileBy = Object.fromEntries(pr.data.map((p) => [p.user_id, p]))
      }
      if (cancelled) return
      setLoungeDetailComments(rows.map((r) => ({ ...r, author_profile: profileBy[r.user_id] || null })))
    })()
    return () => {
      cancelled = true
    }
  }, [loungePostDetail?.id, loungeReadOnly, supabaseClient])

  const finalizeLoungePostDetailClose = useCallback(() => {
    const tid = loungePostDetailCloseFallbackTimerRef.current
    if (tid) {
      window.clearTimeout(tid)
      loungePostDetailCloseFallbackTimerRef.current = 0
    }
    setLoungePostDetail(null)
    setLoungePostDetailVisible(true)
    setLoungePostDetailMenuOpen(false)
    setLoungeDetailRepostMenuOpen(false)
    setLoungeDetailEditing(false)
    setLoungeDetailDraftCaption('')
    setLoungeDetailEditErr('')
    setLoungeDetailEditMediaFile(null)
    setLoungeDetailEditMediaKind('')
    setLoungeDetailEditImageUrls([])
    setLoungeDetailEditGifUrl('')
    setLoungeDetailDeleteBusy(false)
    loungePostDeleteInflightRef.current = false
    setLoungeManageErr('')
    setLoungeDetailComments([])
    setLoungeDetailCommentsLoading(false)
    setLoungeDetailCommentBusy(false)
    setLoungeDetailCommentDraft('')
    setLoungeDetailCommentErr('')
    setLoungeCommentReplyTo(null)
    setLoungeCommentExpandRoots([])
    loungeTitleRevealRef.current = 1
    setLoungeTitleReveal(1)
  }, [])

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

  const openLoungePostDetail = useCallback(
    (post, opts) => {
      if (!post?.id) return
      if (loungeReadOnly && !opts?.fromPublicLink) {
        onRequireAuth?.('login')
        return
      }
      try {
        resetFeedInlineSoundRef.current?.()
      } catch {
        /* ignore */
      }
      const wantEdit = opts?.startEditing === true
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
      setLoungeDetailRepostMenuOpen(false)
      setLoungePostDetail(post)
      setLoungeDetailEditImageUrls([])
      setLoungeDetailEditGifUrl('')
      if (
        wantEdit &&
        composerUserId &&
        post.user_id === composerUserId &&
        isLoungePostWithinAuthorEditWindow(post.created_at)
      ) {
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
        setLoungeDetailDraftCaption(feedPostDisplayCaption(post))
        const seed = feedPostAuthorEditMediaSeed(post)
        setLoungeDetailEditImageUrls(seed.imageUrls)
        setLoungeDetailEditGifUrl(seed.gifUrl)
        setLoungeDetailEditing(true)
      }
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
    },
    [composerUserId, loungeReadOnly, onRequireAuth]
  )

  const scrollLoungeFeedToTop = useCallback(() => {
    const el = loungeFeedScrollRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const onLoungeDockFooterHeight = useCallback((px) => {
    if (typeof px !== 'number' || !Number.isFinite(px) || px <= 0) return
    setLoungeDockFooterHeight((cur) => (cur === px ? cur : px))
  }, [])

  const onLoungePanelTitleReveal = useCallback((reveal) => {
    if (typeof reveal !== 'number' || !Number.isFinite(reveal)) return
    setLoungePanelTitleReveal((prev) => (prev === reveal ? prev : reveal))
  }, [])

  const onLoungeDockHome = useCallback(() => {
    setLoungeDockPanel(null)
    setChatDockInitialPeerUserId(null)
    if (profileModalOpen) closeProfileModalRef.current()
    if (loungePostDetail) closeLoungePostDetail()
    scrollLoungeFeedToTop()
    loungeTitleRevealRef.current = 1
    setLoungeTitleReveal(1)
  }, [profileModalOpen, loungePostDetail, closeLoungePostDetail, scrollLoungeFeedToTop])

  const onLoungeDockSearch = useCallback(() => {
    setLoungeDockPanel((p) => (p === 'search' ? null : 'search'))
  }, [])
  const onLoungeDockNotifications = useCallback(() => {
    setLoungeDockPanel((p) => (p === 'notifications' ? null : 'notifications'))
  }, [])
  const onLoungeDockChat = useCallback(() => {
    setLoungeDockPanel((p) => {
      if (p === 'chat') {
        setChatDockInitialPeerUserId(null)
        return null
      }
      return 'chat'
    })
  }, [])

  const onLoungeDockCompose = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.('login')
      return
    }
    setLoungeDockPanel(null)
    setChatDockInitialPeerUserId(null)
    if (profileModalOpen) closeProfileModalRef.current()
    if (loungePostDetail) closeLoungePostDetail()
    scrollLoungeFeedToTop()
    loungeTitleRevealRef.current = 1
    setLoungeTitleReveal(1)
    composerFoldedFromFeedScrollRef.current = false
    composerFoldRevealRef.current = 1
    setComposerFoldReveal(1)
    composerExpandedRef.current = true
    setComposerExpanded(true)
  }, [
    loungeFeedBrowseMode,
    loungeReadOnly,
    onRequireAuth,
    profileModalOpen,
    loungePostDetail,
    closeLoungePostDetail,
    scrollLoungeFeedToTop,
  ])

  const loungeFollowingFilterOn = loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING

  const onLoungeFollowingFilterToggle = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous') {
      onRequireAuth?.('login')
      return
    }
    const next =
      loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING ? LOUNGE_FEED_SCOPE_ALL : LOUNGE_FEED_SCOPE_FOLLOWING
    onLoungeFeedScopeChange?.(next)
  }, [loungeFeedBrowseMode, loungeFeedScope, onLoungeFeedScopeChange, onRequireAuth])

  const clearChatDockInitialPeer = useCallback(() => setChatDockInitialPeerUserId(null), [])

  const viewerCanUseLoungeChat = useMemo(
    () =>
      Boolean(
        composerUserId &&
          !loungeReadOnly &&
          !loungeProfileNeedsGate(composerUserProfile, composerUserId)
      ),
    [composerUserId, loungeReadOnly, composerUserProfile]
  )

  const openChatWithUserFromProfile = useCallback(
    (peerUserId) => {
      if (!peerUserId || peerUserId === composerUserId) return
      if (loungeReadOnly) {
        requireLoungeAuth()
        return
      }
      if (openProfileGateIfNeeded()) return
      setChatDockInitialPeerUserId(peerUserId)
      closeProfileModalRef.current()
      setLoungeDockPanel('chat')
    },
    [composerUserId, loungeReadOnly, openProfileGateIfNeeded, requireLoungeAuth]
  )

  const onLoungeDockOpenPostFromSearch = useCallback(
    (post) => {
      if (!post?.id) return
      setLoungeDockPanel(null)
      openLoungePostDetail(post, {})
    },
    [openLoungePostDetail]
  )

  useEffect(() => {
    if (loungePostDetail && loungeDockPanel) {
      setChatDockInitialPeerUserId(null)
      setLoungeDockPanel(null)
    }
  }, [loungePostDetail, loungeDockPanel])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const run = async () => {
      const params = new URLSearchParams(window.location.search || '')
      const raw = (params.get('post') || '').trim()
      if (!isLoungePostShareId(raw)) return
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve(undefined))
      })
      if (cancelled) return
      let postRow = communityPosts.find((p) => p.id === raw)
      if (!postRow) {
        const { data, error } = await supabaseClient
          .from('community_feed_posts')
          .select(LOUNGE_SINGLE_POST_SELECT)
          .eq('id', raw)
          .is('hidden_at', null)
          .maybeSingle()
        if (cancelled) return
        if (error || !data) {
          setLoungeShareFlash('This post is unavailable.')
          stripLoungePostQueryParam()
          return
        }
        const hydrated = await hydrateCommunityPosts([data])
        if (cancelled) return
        postRow = hydrated?.[0] || null
      }
      if (!postRow) {
        setLoungeShareFlash('This post is unavailable.')
        stripLoungePostQueryParam()
        return
      }
      if (cancelled) return
      setCommunityPosts((prev) => (prev.some((p) => p.id === postRow.id) ? prev : [postRow, ...prev]))
      openLoungePostDetail(postRow, { fromPublicLink: true })
      stripLoungePostQueryParam()
    }
    void run()
    const onPop = () => void run()
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [communityPosts, hydrateCommunityPosts, openLoungePostDetail, setCommunityPosts, supabaseClient])

  const renderDetailMediaLightboxFooter = useCallback(
    (mediaPost) => (
      <LoungePostInteractionBar
        post={mediaPost}
        variant="sheet"
        rootClassName="w-full"
        loungeReadOnly={loungeReadOnly}
        interactionStateFor={interactionStateFor}
        toggleInteraction={toggleInteraction}
        onPlainRepost={handlePlainRepost}
        onUndoPlainRepost={(p) => void undoPlainRepostForOriginal(p.id)}
        onRemoveQuoteRepost={openRemoveQuoteRepostForPost}
        onQuoteRepost={openQuoteRepostComposer}
        toggleBookmark={toggleBookmark}
        bookmarkedByPost={bookmarkedByPost}
        onOpenComments={openLoungePostDetail}
        requireLoungeAuth={requireLoungeAuth}
        openProfileGateIfNeeded={openProfileGateIfNeeded}
        repostMenuScrollRootRef={loungePostDetailScrollRef}
        onCommentClick={() => {
          if (openProfileGateIfNeeded()) return
          document.getElementById('lounge-detail-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
        repostActionBusy={repostManageBusy}
        onSharePost={handleShareLoungePost}
      />
    ),
    [
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      handlePlainRepost,
      undoPlainRepostForOriginal,
      openRemoveQuoteRepostForPost,
      openQuoteRepostComposer,
      toggleBookmark,
      bookmarkedByPost,
      openLoungePostDetail,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      loungePostDetailScrollRef,
      repostManageBusy,
      handleShareLoungePost,
    ],
  )

  const renderQuoteModalMediaLightboxFooter = useCallback(
    (mediaPost) => (
      <LoungePostInteractionBar
        post={mediaPost}
        variant="feed"
        rootClassName="w-full"
        repostMenuPortalClass="z-[110]"
        loungeReadOnly={loungeReadOnly}
        interactionStateFor={interactionStateFor}
        toggleInteraction={toggleInteraction}
        onPlainRepost={handlePlainRepost}
        onUndoPlainRepost={(p) => void undoPlainRepostForOriginal(p.id)}
        onRemoveQuoteRepost={openRemoveQuoteRepostForPost}
        onQuoteRepost={openQuoteRepostComposer}
        toggleBookmark={toggleBookmark}
        bookmarkedByPost={bookmarkedByPost}
        onOpenComments={openLoungePostDetail}
        requireLoungeAuth={requireLoungeAuth}
        openProfileGateIfNeeded={openProfileGateIfNeeded}
        repostMenuScrollRootRef={quoteRepostScrollRef}
        onSharePost={handleShareLoungePost}
      />
    ),
    [
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      handlePlainRepost,
      undoPlainRepostForOriginal,
      openRemoveQuoteRepostForPost,
      openQuoteRepostComposer,
      toggleBookmark,
      bookmarkedByPost,
      openLoungePostDetail,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      quoteRepostScrollRef,
      handleShareLoungePost,
    ],
  )

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
    setLoungeDetailEditImageUrls([])
    setLoungeDetailEditGifUrl('')
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
      const mediaPatch = feedPostMediaUpdatePayload({
        imageUrls: loungeDetailEditImageUrls,
        gifUrl: loungeDetailEditGifUrl,
      })
      const keepStreamUid = feedPostStreamVideoUid(loungePostDetail)
      const updateBody =
        keepStreamUid && !loungeDetailEditMediaFile
          ? { caption: cap, ...mediaPatch, stream_video_uid: keepStreamUid }
          : { caption: cap, ...mediaPatch }
      const { data, error } = await supabaseClient
        .from('community_feed_posts')
        .update(updateBody)
        .eq('id', loungePostDetail.id)
        .select('id,caption,edited_at,image_urls,media_url,gif_url,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height')
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
        prev.map((p) =>
          p.id === data.id
            ? {
                ...p,
                caption: data.caption,
                edited_at: data.edited_at,
                image_urls: data.image_urls,
                media_url: data.media_url,
                gif_url: data.gif_url,
                stream_video_uid: data.stream_video_uid,
                stream_poster_url: data.stream_poster_url,
                stream_video_width: data.stream_video_width,
                stream_video_height: data.stream_video_height,
              }
            : p
        )
      )
      setLoungePostDetail((prev) =>
        prev && prev.id === data.id
          ? {
              ...prev,
              caption: data.caption,
              edited_at: data.edited_at,
              image_urls: data.image_urls,
              media_url: data.media_url,
              gif_url: data.gif_url,
              stream_video_uid: data.stream_video_uid,
              stream_poster_url: data.stream_poster_url,
              stream_video_width: data.stream_video_width,
              stream_video_height: data.stream_video_height,
            }
          : prev
      )
      cancelLoungeDetailEdit()
    } finally {
      setLoungeDetailEditBusy(false)
    }
  }, [
    cancelLoungeDetailEdit,
    loungeDetailDraftCaption,
    loungeDetailEditGifUrl,
    loungeDetailEditImageUrls,
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
    if (loungePostDeleteInflightRef.current) return
    loungePostDeleteInflightRef.current = true
    const postId = loungePostDetail.id
    setLoungeManageErr('')
    setLoungeDetailDeleteBusy(true)
    try {
      if (feedPostStreamVideoUid(loungePostDetail)) {
        try {
          await deleteCfStreamForCommunityFeedPost(supabaseClient, postId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not remove hosted video.'
          setLoungeManageErr(msg)
          return
        }
      }
      await deleteLoungeFeedStreamPosterFromPublicUrl(supabaseClient, feedPostStreamPosterUrl(loungePostDetail))
      const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', postId)
      if (error) {
        const msg = String(error.message || '')
        if (error.code === '42501') {
          setLoungeManageErr('You do not have permission to delete this post.')
        } else {
          setLoungeManageErr(msg || 'Could not delete.')
        }
        return
      }
      closeLoungePostDetail()
      await loadCommunityFeed({ silent: true })
    } finally {
      loungePostDeleteInflightRef.current = false
      setLoungeDetailDeleteBusy(false)
    }
  }, [closeLoungePostDetail, composerUserId, loadCommunityFeed, loungePostDetail, supabaseClient])

  const performLoungeStaffDeleteFromDetail = useCallback(async () => {
    if (!loungePostDetail?.id || !loungeViewerIsStaff) return
    if (loungePostDetail.user_id === composerUserId) return
    if (loungePostDeleteInflightRef.current) return
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Delete this post as staff? This cannot be undone.')
      if (!ok) return
    }
    loungePostDeleteInflightRef.current = true
    const postId = loungePostDetail.id
    setLoungeManageErr('')
    setLoungeDetailDeleteBusy(true)
    try {
      if (feedPostStreamVideoUid(loungePostDetail)) {
        try {
          await deleteCfStreamForCommunityFeedPost(supabaseClient, postId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not remove hosted video.'
          setLoungeManageErr(msg)
          return
        }
      }
      await deleteLoungeFeedStreamPosterFromPublicUrl(supabaseClient, feedPostStreamPosterUrl(loungePostDetail))
      const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', postId)
      if (error) {
        const msg = String(error.message || '')
        if (error.code === '42501') {
          setLoungeManageErr('You do not have permission to delete this post.')
        } else {
          setLoungeManageErr(msg || 'Could not delete.')
        }
        return
      }
      closeLoungePostDetail()
      await loadCommunityFeed({ silent: true })
    } finally {
      loungePostDeleteInflightRef.current = false
      setLoungeDetailDeleteBusy(false)
    }
  }, [closeLoungePostDetail, composerUserId, loadCommunityFeed, loungePostDetail, loungeViewerIsStaff, supabaseClient])

  const deleteLoungePostFromFeed = useCallback(
    async (post) => {
      if (!post?.id || post.user_id !== composerUserId) return
      if (loungePostDeleteInflightRef.current) return
      if (typeof window !== 'undefined') {
        const ok = window.confirm('Delete this post? This cannot be undone.')
        if (!ok) return
      }
      loungePostDeleteInflightRef.current = true
      setLoungeFeedDeleteBusyPostId(post.id)
      setLoungeManageErr('')
      try {
        if (feedPostStreamVideoUid(post)) {
          try {
            await deleteCfStreamForCommunityFeedPost(supabaseClient, post.id)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Could not remove hosted video.'
            setLoungeManageErr(msg)
            return
          }
        }
        await deleteLoungeFeedStreamPosterFromPublicUrl(supabaseClient, feedPostStreamPosterUrl(post))
        const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', post.id)
        if (error) {
          const msg = String(error.message || '')
          if (error.code === '42501') {
            setLoungeManageErr('You do not have permission to delete this post.')
          } else {
            setLoungeManageErr(msg || 'Could not delete.')
          }
          return
        }
        if (loungePostDetail?.id === post.id) closeLoungePostDetail()
        await loadCommunityFeed({ silent: true })
      } finally {
        loungePostDeleteInflightRef.current = false
        setLoungeFeedDeleteBusyPostId(null)
      }
    },
    [closeLoungePostDetail, composerUserId, loadCommunityFeed, loungePostDetail, supabaseClient]
  )

  const deleteStaffLoungePostFromFeed = useCallback(
    async (post) => {
      if (!post?.id || !loungeViewerIsStaff || !composerUserId) return
      if (post.user_id === composerUserId) {
        await deleteLoungePostFromFeed(post)
        return
      }
      if (loungePostDeleteInflightRef.current) return
      if (typeof window !== 'undefined') {
        const ok = window.confirm('Delete this post as staff? This cannot be undone.')
        if (!ok) return
      }
      loungePostDeleteInflightRef.current = true
      setLoungeFeedDeleteBusyPostId(post.id)
      setLoungeManageErr('')
      try {
        if (feedPostStreamVideoUid(post)) {
          try {
            await deleteCfStreamForCommunityFeedPost(supabaseClient, post.id)
          } catch (e) {
            const msg = e instanceof Error ? e.message : 'Could not remove hosted video.'
            setLoungeManageErr(msg)
            return
          }
        }
        await deleteLoungeFeedStreamPosterFromPublicUrl(supabaseClient, feedPostStreamPosterUrl(post))
        const { error } = await supabaseClient.from('community_feed_posts').delete().eq('id', post.id)
        if (error) {
          const msg = String(error.message || '')
          if (error.code === '42501') {
            setLoungeManageErr('You do not have permission to delete this post.')
          } else {
            setLoungeManageErr(msg || 'Could not delete.')
          }
          return
        }
        if (loungePostDetail?.id === post.id) closeLoungePostDetail()
        await loadCommunityFeed({ silent: true })
      } finally {
        loungePostDeleteInflightRef.current = false
        setLoungeFeedDeleteBusyPostId(null)
      }
    },
    [
      closeLoungePostDetail,
      composerUserId,
      deleteLoungePostFromFeed,
      loadCommunityFeed,
      loungePostDetail,
      loungeViewerIsStaff,
      supabaseClient,
    ]
  )

  const onPostMenuBlockFromFeed = useCallback((p) => {
    void p
    if (typeof window !== 'undefined') window.alert('Blocking users is not available yet.')
  }, [])

  const onPostMenuReportFromFeed = useCallback((p) => {
    void p
    if (typeof window !== 'undefined') window.alert('Reporting posts is not available yet.')
  }, [])

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
  }, [cancelLoungeDetailEdit, closeLoungePostDetail, loungeDetailEditing, loungePostDetail, loungePostDetailMenuOpen])

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
          .select('user_id,handle,display_name,avatar_url,bio,about_me,banner_url,created_at,role,handle_changed_at,is_og')
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
      setProfileGateAvatarCropFile(null)
      setProfileGateOpen(false)
      return
    }
    if (!loungeProfileNeedsGate(composerUserProfile, composerUserId)) {
      setProfileGateAvatarCropFile(null)
      setProfileGateOpen(false)
    }
  }, [composerAuthResolved, composerUserId, composerAuthUser, composerUserProfile])

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

  const clearComposerForPostAttempt = useCallback((opts = {}) => {
    const preserve = Boolean(opts.preserveComposerVideoPrep)
    const snap = loungePostSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = new Set()
    if (pendingPoster.startsWith('blob:')) {
      skipRevoke.add(pendingPoster)
      const sl = composerVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
    }
    if (!preserve) {
      const h = composerVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      composerVideoPrepHandoffRef.current = null
      composerVideoPrepJobIdRef.current += 1
      try {
        composerVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      composerVideoPrepAbortRef.current = null
    }
    setPostText('')
    setComposerImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setComposerVideoSlot((prev) => {
      if (!preserve && prev) {
        if (prev.preview && !skipRevoke.has(prev.preview)) {
          try {
            URL.revokeObjectURL(prev.preview)
          } catch {
            // ignore
          }
        }
        if (prev.posterUrl && !skipRevoke.has(prev.posterUrl)) {
          try {
            URL.revokeObjectURL(prev.posterUrl)
          } catch {
            // ignore
          }
        }
      }
      return null
    })
    setComposerMediaUrl('')
    setComposerPinOnPost(false)
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

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [])

  const restoreComposerFromSnapshot = useCallback((snap) => {
    if (!snap) return
    setPostText(snap.caption)
    setComposerMediaUrl(snap.gifOnlyUrl)
    setComposerPinOnPost(Boolean(snap.wantsPin && snap.isStaffPoster))
    const files = Array.isArray(snap.imageFiles) ? snap.imageFiles : []
    setComposerImageItems(
      files.map((file) => ({
        id: newComposerImageId(),
        file,
        preview: URL.createObjectURL(file),
      })),
    )
    if (String(snap.streamVideoUid || '').trim()) {
      const vf = snap.videoFile
      const uid = String(snap.streamVideoUid || '').trim() || null
      if (vf) {
        setComposerVideoSlot({
          prepJobId: 0,
          file: vf,
          posterUrl: null,
          preview: URL.createObjectURL(vf),
          streamVideoUid: uid,
          prepStatus: 'ready',
          prepError: '',
        })
      } else {
        setComposerVideoSlot(null)
      }
    } else if (snap.videoPrepSpec) {
      if (snap.videoPrepSpec.kind === 'direct') {
        const f = snap.videoPrepSpec.file
        const previewUrl = URL.createObjectURL(f)
        startComposerVideoPrepFromSpec(snap.videoPrepSpec, {
          file: f,
          posterUrl: null,
          preview: previewUrl,
          streamVideoUid: null,
        })
      } else if (snap.videoPrepSlotRestore) {
        startComposerVideoPrepFromSpec(snap.videoPrepSpec, {
          file: null,
          posterUrl: snap.videoPrepSlotRestore.posterUrl,
          preview: snap.videoPrepSlotRestore.preview,
          streamVideoUid: null,
        })
      } else {
        setComposerVideoSlot(null)
      }
    } else if (snap.videoFile) {
      const vf = snap.videoFile
      setComposerVideoSlot({
        prepJobId: 0,
        file: vf,
        posterUrl: null,
        preview: URL.createObjectURL(vf),
        streamVideoUid: null,
        prepStatus: 'ready',
        prepError: '',
      })
    } else {
      setComposerVideoSlot(null)
    }
    setComposerExpanded(true)
    composerExpandedRef.current = true
    composerFoldRevealRef.current = 1
    setComposerFoldReveal(1)
    composerFoldedFromFeedScrollRef.current = false
  }, [startComposerVideoPrepFromSpec])

  const restoreQuoteFromSnapshot = useCallback(
    (snap, opts = {}) => {
      const skipVideo = Boolean(opts.skipVideo)
      if (!snap?.quoteRepostOfPostId) return
      const pid = String(snap.quoteRepostOfPostId).trim()
      if (!pid) return
      const orig =
        communityPosts.find((p) => p.id === pid) ||
        (loungePostDetail?.id === pid ? loungePostDetail : null) ||
        profileModalPosts.find((p) => p.id === pid) ||
        null
      if (!orig?.id) {
        setLoungeManageErr(
          'Could not restore quote repost — the original post is not loaded. Return to the feed and try again.',
        )
        return
      }
      setQuoteRepostModal({ mode: 'compose', original: orig })
      setQuoteRepostDraft(String(snap.caption || ''))
      setQuoteRepostMediaUrl(String(snap.gifOnlyUrl || '').trim())
      const files = Array.isArray(snap.imageFiles) ? snap.imageFiles : []
      setQuoteRepostImageItems(
        files.map((file) => ({
          id: newComposerImageId(),
          file,
          preview: URL.createObjectURL(file),
        })),
      )
      if (skipVideo) {
        cancelQuoteRepostMediaPrep()
        return
      }
      if (String(snap.streamVideoUid || '').trim()) {
        const vf = snap.videoFile
        const uid = String(snap.streamVideoUid || '').trim() || null
        if (vf) {
          setQuoteRepostVideoSlot({
            prepJobId: 0,
            file: vf,
            posterUrl: null,
            preview: URL.createObjectURL(vf),
            streamVideoUid: uid,
            prepStatus: 'ready',
            prepError: '',
          })
        } else {
          setQuoteRepostVideoSlot(null)
        }
      } else if (snap.videoPrepSpec) {
        if (snap.videoPrepSpec.kind === 'direct') {
          const f = snap.videoPrepSpec.file
          const previewUrl = URL.createObjectURL(f)
          void startQuoteRepostVideoPrepFromSpec(snap.videoPrepSpec, {
            file: f,
            posterUrl: null,
            preview: previewUrl,
            streamVideoUid: null,
          })
        } else if (snap.videoPrepSlotRestore) {
          void startQuoteRepostVideoPrepFromSpec(snap.videoPrepSpec, {
            file: null,
            posterUrl: snap.videoPrepSlotRestore.posterUrl,
            preview: snap.videoPrepSlotRestore.preview,
            streamVideoUid: null,
          })
        } else {
          setQuoteRepostVideoSlot(null)
        }
      } else if (snap.videoFile) {
        const vf = snap.videoFile
        setQuoteRepostVideoSlot({
          prepJobId: 0,
          file: vf,
          posterUrl: null,
          preview: URL.createObjectURL(vf),
          streamVideoUid: null,
          prepStatus: 'ready',
          prepError: '',
        })
      } else {
        setQuoteRepostVideoSlot(null)
      }
    },
    [
      cancelQuoteRepostMediaPrep,
      communityPosts,
      loungePostDetail,
      profileModalPosts,
      startQuoteRepostVideoPrepFromSpec,
    ],
  )

  const clearQuoteRepostForPostAttempt = useCallback((opts = {}) => {
    const preserve = Boolean(opts.preserveQuoteVideoPrep)
    const snap = loungePostSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = new Set()
    if (pendingPoster.startsWith('blob:')) {
      skipRevoke.add(pendingPoster)
      const sl = quoteRepostVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      const h = quoteRepostVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      quoteRepostVideoPrepHandoffRef.current = null
      quoteRepostVideoPrepJobIdRef.current += 1
      try {
        quoteRepostVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      quoteRepostVideoPrepAbortRef.current = null
    }
    setQuoteRepostModal(null)
    setQuoteRepostDraft('')
    setQuoteRepostErr('')
    setQuoteRepostImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setQuoteRepostMediaUrl('')
    setQuoteRepostVideoSlot((prev) => {
      if (!preserve && prev) {
        if (prev.preview && !skipRevoke.has(prev.preview)) {
          try {
            URL.revokeObjectURL(prev.preview)
          } catch {
            // ignore
          }
        }
        if (prev.posterUrl && !skipRevoke.has(prev.posterUrl)) {
          try {
            URL.revokeObjectURL(prev.posterUrl)
          } catch {
            // ignore
          }
        }
      }
      return null
    })
    try {
      const el = quoteRepostMediaInputRef.current
      if (el) el.value = ''
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [])
  clearQuoteRepostForPostAttemptRef.current = clearQuoteRepostForPostAttempt

  const cancelLoungePostUpload = useCallback(() => {
    try {
      loungePostAbortRef.current?.abort()
    } catch {
      // ignore
    }
    loungePostAbortRef.current = null
    loungePostJobRunningRef.current = false
    loungePostUploadLastPhaseRef.current = ''
    setLoungePostUploadFailureDetails(null)
    setLoungePostUploadBar(null)
    const snap = loungePostSnapshotRef.current
    if (snap?.awaitingComposerVideoPrepJobId != null) {
      if (String(snap.quoteRepostOfPostId || '').trim()) {
        try {
          quoteRepostVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        quoteRepostVideoPrepJobIdRef.current += 1
        quoteRepostVideoPrepHandoffRef.current = null
      } else {
        try {
          composerVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        composerVideoPrepJobIdRef.current += 1
        composerVideoPrepHandoffRef.current = null
      }
    }
    const cancelSnap = loungePostSnapshotRef.current
    if (cancelSnap?.quoteRepostOfPostId) {
      restoreQuoteFromSnapshot(cancelSnap)
    } else {
      restoreComposerFromSnapshot(cancelSnap)
    }
    if (cancelSnap) {
      const cUid = String(cancelSnap.streamVideoUid || '').trim()
      if (
        cUid &&
        typeof cancelSnap.sessionStreamPosterBlobUrl === 'string' &&
        cancelSnap.sessionStreamPosterBlobUrl.startsWith('blob:')
      ) {
        releaseLoungeStreamSessionPoster(cUid)
      }
    }
    loungePostSnapshotRef.current = null
  }, [restoreComposerFromSnapshot, restoreQuoteFromSnapshot])

  useEffect(() => {
    return () => {
      try {
        loungePostAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungePostAbortRef.current = null
      loungePostJobRunningRef.current = false

      const h = composerVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      composerVideoPrepHandoffRef.current = null
      composerVideoPrepJobIdRef.current += 1
      try {
        composerVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      composerVideoPrepAbortRef.current = null
      disposeComposerVideoMedia(composerVideoSlotRef.current)
      composerVideoLastEncodedFileRef.current = null
    }
  }, [disposeComposerVideoMedia])

  const runBackgroundLoungePostSubmission = useCallback(
    async (snapshot) => {
      const prepSource = String(snapshot.quoteRepostOfPostId || '').trim() ? 'quote' : 'composer'
      const lastEncRef =
        prepSource === 'quote' ? quoteRepostVideoLastEncodedFileRef : composerVideoLastEncodedFileRef
      const uidBar = String(snapshot.streamVideoUid || '').trim()
      const mediaUploadBarSkin =
        !uidBar && (snapshot.awaitingComposerVideoPrepJobId != null || Boolean(snapshot.videoPrepSpec))
      const prepHudId = snapshot.awaitingComposerVideoPrepJobId ?? 0

      loungePostJobRunningRef.current = true
      setLoungePostSubmitInFlight(true)
      loungePostUploadLastPhaseRef.current = ''
      setLoungePostUploadFailureDetails(null)
      const ac = new AbortController()
      loungePostAbortRef.current = ac

      setLoungePostUploadBar((prev) => {
        if (mediaUploadBarSkin) {
          const p = typeof prev?.progress === 'number' ? prev.progress : 0
          const st = prev?.mode === 'mediaPrep' && prev.status ? prev.status : 'Starting…'
          const det = prev?.mode === 'mediaPrep' && prev.detail ? prev.detail : ''
          return {
            mode: 'mediaPrep',
            postSubmission: true,
            prepJobId: prepHudId,
            progress: p,
            status: st,
            detail: det,
          }
        }
        return { mode: 'post', progress: 0, status: 'Starting…', detail: '' }
      })

      let snap = { ...snapshot }
      try {
        const uid0 = String(snap.streamVideoUid || '').trim()
        if (
          !uid0 &&
          (snap.awaitingComposerVideoPrepJobId != null || snap.videoPrepSpec)
        ) {
          loungePostUploadLastPhaseRef.current = 'Waiting for video'
          setLoungePostUploadBar((prev) => ({
            ...(mediaUploadBarSkin
              ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
              : { mode: 'post' }),
            progress:
              mediaUploadBarSkin && typeof prev?.progress === 'number' ? Math.max(0.06, prev.progress) : 0.06,
            status: 'Waiting for video',
            detail: mediaUploadBarSkin && prev?.detail ? prev.detail : '',
          }))

          /** @type {{ encodedFile: File, streamVideoUid: string }} */
          let out
          const onPrepProgressWhilePosting = (info) => {
            if (ac.signal.aborted) return
            setLoungePostUploadBar((prev) => {
              const d = String(info.detail || '').trim()
              return {
                ...(mediaUploadBarSkin
                  ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
                  : { mode: 'post' }),
                progress: 0.06 + (typeof info.progress === 'number' ? info.progress : 0) * 0.38,
                status: String(info.status || ''),
                detail: d !== '' ? d : prev && typeof prev.detail === 'string' ? prev.detail : '',
              }
            })
          }

          const onPrepUploadDiagnostic = (detail) => {
            if (ac.signal.aborted) return
            const d = String(detail || '').trim()
            if (!d) return
            setLoungePostUploadBar((prev) =>
              prev ? { ...prev, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL } : prev,
            )
          }

          const runPrepForPosting = async () => {
            if (!snap.videoPrepSpec) throw new Error('Video preparation was interrupted.')
            const reuse = lastEncRef.current
            if (reuse) {
              const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
                supabaseClient,
                signal: ac.signal,
                uploadFile: reuse,
                onProgress: onPrepProgressWhilePosting,
                onUploadDiagnostic: onPrepUploadDiagnostic,
              })
              lastEncRef.current = null
              return { encodedFile: reuse, streamVideoUid }
            }
            const prepOut = await runComposerStreamVideoPrepWithRetries({
              supabaseClient,
              signal: ac.signal,
              spec: snap.videoPrepSpec,
              onEncodedFileReady: (f) => {
                lastEncRef.current = f
              },
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
            lastEncRef.current = null
            return prepOut
          }

          const awaitingId = snap.awaitingComposerVideoPrepJobId
          const h =
            prepSource === 'quote'
              ? quoteRepostVideoPrepHandoffRef.current
              : composerVideoPrepHandoffRef.current
          if (awaitingId != null && h && h.jobId === awaitingId) {
            try {
              out = await h.promise
            } catch (e) {
              if (e?.name === 'AbortError') throw e
              if (!snap.videoPrepSpec) throw e
              out = await runPrepForPosting()
            }
          } else if (snap.videoPrepSpec) {
            out = await runPrepForPosting()
          } else {
            throw new Error('Video preparation was interrupted.')
          }
          snap = {
            ...snap,
            videoFile: out.encodedFile,
            streamVideoUid: out.streamVideoUid,
            awaitingComposerVideoPrepJobId: null,
          }
          loungePostSnapshotRef.current = snap
          const pend =
            typeof snap.sessionStreamPosterBlobUrl === 'string' ? snap.sessionStreamPosterBlobUrl.trim() : ''
          const nu = String(snap.streamVideoUid || '').trim()
          if (nu && pend.startsWith('blob:')) {
            pinLoungeStreamSessionPoster(nu, pend)
          }
          if (snapshot.awaitingComposerVideoPrepJobId != null) {
            const href =
              prepSource === 'quote' ? quoteRepostVideoPrepHandoffRef : composerVideoPrepHandoffRef
            if (href.current?.jobId === snapshot.awaitingComposerVideoPrepJobId) {
              href.current = null
            }
          }
        }

        await executeLoungeCommunityPostSubmission({
          supabaseClient,
          snapshot: snap,
          signal: ac.signal,
          onProgress: (info) => {
            loungePostUploadLastPhaseRef.current = String(info?.status || '')
            setLoungePostUploadBar((prev) => {
              const d = String(info?.detail || '').trim()
              return {
                ...(mediaUploadBarSkin
                  ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
                  : { mode: 'post' }),
                progress: typeof info?.progress === 'number' ? info.progress : 0,
                status: String(info?.status || ''),
                detail: d !== '' ? d : prev && typeof prev.detail === 'string' ? prev.detail : '',
              }
            })
          },
          rateLimitMessage,
          onUploadDiagnostic: (detail) => {
            if (ac.signal.aborted) return
            const d = String(detail || '').trim()
            if (!d) return
            setLoungePostUploadBar((prev) =>
              prev ? { ...prev, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL } : prev,
            )
          },
        })
        loungePostSnapshotRef.current = null
        await loadCommunityFeed()
        const quoteOrigId = String(snapshot.quoteRepostOfPostId || '').trim()
        if (quoteOrigId) {
          await refreshLoungePostInteractions([quoteOrigId])
        }
      } catch (e) {
        if (e?.name === 'AbortError') return
        const failUid = String(snap.streamVideoUid || '').trim()
        const hadSessionPoster =
          typeof snap.sessionStreamPosterBlobUrl === 'string' &&
          snap.sessionStreamPosterBlobUrl.startsWith('blob:')
        if (failUid && hadSessionPoster) {
          releaseLoungeStreamSessionPoster(failUid)
        }
        const curSnap = loungePostSnapshotRef.current
        if (curSnap?.awaitingComposerVideoPrepJobId != null) {
          loungePostSnapshotRef.current = { ...curSnap, awaitingComposerVideoPrepJobId: null }
        }
        if (String(snap.streamVideoUid || '').trim()) {
          loungePostSnapshotRef.current = snap
        }
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Unknown error'
        if (msg === LOUNGE_MAX_PINNED_ALERT && typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
        setLoungePostUploadFailureDetails({
          kind: 'post',
          phase: loungePostUploadLastPhaseRef.current || '(no step recorded)',
          message: msg,
        })
        setLoungePostUploadFailedOpen(true)
      } finally {
        setLoungePostUploadBar(null)
        loungePostAbortRef.current = null
        loungePostJobRunningRef.current = false
        setLoungePostSubmitInFlight(false)
      }
    },
    [loadCommunityFeed, rateLimitMessage, refreshLoungePostInteractions, supabaseClient],
  )
  runBackgroundLoungePostSubmissionRef.current = runBackgroundLoungePostSubmission

  const retryLoungePostUpload = useCallback(() => {
    const fail = loungePostUploadFailureDetailsRef.current
    setLoungePostUploadFailedOpen(false)
    if (fail?.kind === 'mediaPrep') {
      if (fail?.target === 'quote') {
        const spec = quoteRepostVideoPrepSpecRef.current
        const slot = quoteRepostVideoSlotRef.current
        if (spec && slot) {
          void startQuoteRepostVideoPrepFromSpec(spec, {
            ...slot,
            file: spec.kind === 'direct' ? spec.file : null,
            posterUrl: slot.posterUrl,
            preview: slot.preview,
            streamVideoUid: null,
            prepError: '',
          })
        }
        setLoungePostUploadFailureDetails(null)
        return
      }
      const spec = composerVideoPrepSpecRef.current
      const slot = composerVideoSlotRef.current
      if (spec && slot) {
        void startComposerVideoPrepFromSpec(spec, {
          ...slot,
          file: spec.kind === 'direct' ? spec.file : null,
          posterUrl: slot.posterUrl,
          preview: slot.preview,
          streamVideoUid: null,
          prepError: '',
        })
      }
      setLoungePostUploadFailureDetails(null)
      return
    }
    const snap = loungePostSnapshotRef.current
    setLoungePostUploadFailureDetails(null)
    if (!snap) return
    void runBackgroundLoungePostSubmission(snap)
  }, [runBackgroundLoungePostSubmission, startComposerVideoPrepFromSpec, startQuoteRepostVideoPrepFromSpec])

  const onLoungePostUploadSaveDraft = useCallback(() => {
    const fail = loungePostUploadFailureDetailsRef.current
    if (fail?.kind === 'mediaPrep') {
      if (fail?.target === 'quote') {
        cancelQuoteRepostMediaPrep()
        setQuoteRepostErr('Video was cleared — add a video again when you are ready.')
        setLoungePostUploadFailedOpen(false)
        setLoungePostUploadFailureDetails(null)
        return
      }
      persistLoungeComposerDraft(postText, false, false, String(composerMediaUrl || '').trim())
      disposeComposerVideoMedia(composerVideoSlotRef.current)
      setComposerVideoSlot(null)
      setPostErr('Draft saved. Video was cleared — add a video again when you are ready.')
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    const snap = loungePostSnapshotRef.current
    if (snap) {
      if (String(snap.quoteRepostOfPostId || '').trim()) {
        restoreQuoteFromSnapshot(snap, { skipVideo: true })
        setQuoteRepostErr('Draft saved. Re-add photos or video if you had any.')
      } else {
        persistLoungeComposerDraft(snap.caption, false, false, snap.gifOnlyUrl)
        setPostErr('Draft saved. Re-add photos or video if you had any.')
      }
      const cUid = String(snap.streamVideoUid || '').trim()
      if (
        cUid &&
        typeof snap.sessionStreamPosterBlobUrl === 'string' &&
        snap.sessionStreamPosterBlobUrl.startsWith('blob:')
      ) {
        releaseLoungeStreamSessionPoster(cUid)
      }
    }
    loungePostSnapshotRef.current = null
    loungePostJobRunningRef.current = false
    setLoungePostUploadFailedOpen(false)
    setLoungePostUploadFailureDetails(null)
  }, [cancelQuoteRepostMediaPrep, composerMediaUrl, disposeComposerVideoMedia, postText, restoreQuoteFromSnapshot])

  const onLoungePostUploadFailureCancel = useCallback(() => {
    const fail = loungePostUploadFailureDetailsRef.current
    if (fail?.kind === 'mediaPrep') {
      if (fail?.target === 'quote') {
        disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
        setQuoteRepostVideoSlot(null)
      } else {
        disposeComposerVideoMedia(composerVideoSlotRef.current)
        setComposerVideoSlot(null)
      }
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    const failSnap = loungePostSnapshotRef.current
    if (String(failSnap?.quoteRepostOfPostId || '').trim()) {
      restoreQuoteFromSnapshot(failSnap)
    } else {
      restoreComposerFromSnapshot(failSnap)
    }
    if (failSnap) {
      const cUid = String(failSnap.streamVideoUid || '').trim()
      if (
        cUid &&
        typeof failSnap.sessionStreamPosterBlobUrl === 'string' &&
        failSnap.sessionStreamPosterBlobUrl.startsWith('blob:')
      ) {
        releaseLoungeStreamSessionPoster(cUid)
      }
    }
    loungePostSnapshotRef.current = null
    loungePostJobRunningRef.current = false
    setLoungePostUploadFailedOpen(false)
    setLoungePostUploadFailureDetails(null)
  }, [disposeComposerVideoMedia, restoreComposerFromSnapshot, restoreQuoteFromSnapshot])

  const submitLoungePost = useCallback(async () => {
    const caption = postText.trim()
    setPostErr('')
    const gifCheck = validateAtMostOneGifUrl(composerMediaUrl)
    if (!gifCheck.ok) {
      setPostErr(gifCheck.message)
      return
    }
    const hasGif = gifCheck.value.length > 0
    const hasImages = composerImageItems.length > 0
    const hasVideo = composerVideoSlot != null
    if (!caption && !hasGif && !hasImages && !hasVideo) return
    if (caption.length > 280) {
      setPostErr('Caption must be 280 characters or fewer.')
      return
    }
    if (loungePostJobRunningRef.current) return
    if (loungeComposerVideoPostBlocked) return

    if (hasVideo && composerVideoSlot?.file) {
      if (composerVideoSlot.file.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
        setPostErr('Video must be 200 MB or smaller for upload.')
        return
      }
    }

    setPostBusy(true)
    /** @type {{ caption: string, gifOnlyUrl: string, imageFiles: File[], videoFile: File | null, streamVideoUid: string | null, awaitingComposerVideoPrepJobId?: number | null, videoPrepSpec?: object | null, videoPrepSlotRestore?: { posterUrl: string, preview: string } | null, wantsPin: boolean, isStaffPoster: boolean } | null} */
    let snapshot = null
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
        setProfileGateAvatarCropFile(null)
        setProfileGateAvatarPreview(
          ownProfile?.avatar_url || composerUserProfile?.avatar_url || '',
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

      const gifOnlyUrl = gifCheck.value
      if (hasVideo && gifOnlyUrl) {
        setPostErr('Remove the GIF before posting a video.')
        return
      }

      const slot = composerVideoSlot
      const uid = hasVideo ? String(slot?.streamVideoUid || '').trim() || null : null
      const awaiting =
        hasVideo &&
        !uid &&
        slot?.prepStatus === 'preparing' &&
        typeof slot?.prepJobId === 'number'
          ? slot.prepJobId
          : null
      const specForSnap = awaiting != null ? composerVideoPrepSpecRef.current : null
      const trimRestore =
        awaiting != null && specForSnap && specForSnap.kind === 'trim' && slot
          ? { posterUrl: slot.posterUrl, preview: slot.preview }
          : null

      const sessionPosterBlob =
        hasVideo && slot?.posterUrl && String(slot.posterUrl).startsWith('blob:')
          ? String(slot.posterUrl)
          : null

      snapshot = {
        caption,
        gifOnlyUrl,
        imageFiles: composerImageItems.map((it) => it.file),
        videoFile: hasVideo && slot?.file ? slot.file : null,
        streamVideoUid: uid,
        awaitingComposerVideoPrepJobId: awaiting,
        videoPrepSpec: specForSnap,
        videoPrepSlotRestore: trimRestore,
        sessionStreamPosterBlobUrl: sessionPosterBlob,
        wantsPin: composerPinOnPost,
        isStaffPoster,
      }
    } finally {
      setPostBusy(false)
    }

    if (!snapshot) return

    const preserveVideoPrep = snapshot.awaitingComposerVideoPrepJobId != null
    loungePostSnapshotRef.current = snapshot
    clearComposerForPostAttempt({ preserveComposerVideoPrep: preserveVideoPrep })
    void runBackgroundLoungePostSubmission(snapshot)
  }, [
    loungeComposerVideoPostBlocked,
    clearComposerForPostAttempt,
    composerImageItems,
    composerMediaUrl,
    composerPinOnPost,
    composerUserProfile?.avatar_url,
    composerUserProfile?.role,
    composerVideoSlot,
    onRequireAuth,
    postText,
    runBackgroundLoungePostSubmission,
    supabaseClient,
  ])

  const onProfileGateAvatarCropCancel = useCallback(() => {
    setProfileGateAvatarCropFile(null)
  }, [])

  const onProfileGateAvatarCropApply = useCallback(async (croppedFile) => {
    setProfileGateAvatarCropFile(null)
    setProfileGateErr('')
    const { file: ready, error } = await prepareAvatarImageForUpload(croppedFile)
    if (error) {
      setProfileGateErr(error.message)
      return
    }
    setProfileGateAvatarFile(ready)
    setProfileGateAvatarPreview(URL.createObjectURL(ready))
  }, [])

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
        setProfileGateAvatarCropFile(null)
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
      setProfileGateAvatarCropFile(null)
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

  useEffect(() => {
    closeProfileModalRef.current = closeProfileModal
  }, [closeProfileModal])

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
            .select('id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height')
            .eq('user_id', userId)
            .is('hidden_at', null)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .limit(30),
          supabaseClient
            .from('profiles')
            .select('user_id,handle,display_name,avatar_url,bio,created_at,role,handle_changed_at,is_og')
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
      for (const k of [
        'avatar_url',
        'display_name',
        'handle',
        'banner_url',
        'about_me',
        'bio',
        'role',
        'handle_changed_at',
        'is_og',
      ]) {
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
      onPlainRepost: handlePlainRepost,
      onUndoPlainRepost: (p) => {
        void undoPlainRepostForOriginal(p.id)
      },
      onRemoveQuoteRepost: openRemoveQuoteRepostForPost,
      onQuoteRepost: openQuoteRepostComposer,
      toggleBookmark,
      bookmarkedByPost,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      onOpenComments: openLoungePostDetail,
      onSharePost: handleShareLoungePost,
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
      viewerUserId: composerUserId,
      captionEditableInMenu: (p) =>
        Boolean(
          composerUserId &&
            p?.user_id === composerUserId &&
            isLoungePostWithinAuthorEditWindow(p?.created_at),
        ),
      onPostMenuEdit: (p) => openLoungePostDetail(p, { startEditing: true }),
      onPostMenuDelete: deleteLoungePostFromFeed,
      onStaffPostDelete: deleteStaffLoungePostFromFeed,
      onPostMenuBlock: onPostMenuBlockFromFeed,
      onPostMenuReport: onPostMenuReportFromFeed,
      busyDeletingPostId: loungeFeedDeleteBusyPostId,
    }),
    [
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      handlePlainRepost,
      undoPlainRepostForOriginal,
      openRemoveQuoteRepostForPost,
      openQuoteRepostComposer,
      toggleBookmark,
      bookmarkedByPost,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      openLoungePostDetail,
      openProfileModal,
      handleShareLoungePost,
      loungeViewerIsStaff,
      setLoungePostPinned,
      loungePinBusy,
      displayNameFor,
      handleFor,
      postAgeLabel,
      displayLabel,
      avatarToneClass,
      avatarText,
      composerUserId,
      deleteLoungePostFromFeed,
      deleteStaffLoungePostFromFeed,
      onPostMenuBlockFromFeed,
      onPostMenuReportFromFeed,
      loungeFeedDeleteBusyPostId,
    ]
  )

  const showLoungeViewportDock = !loungePostDetail && !profileModalOpen
  const loungeTitleBarChromePx = loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56
  /** Scroll inset for the opaque dock icon row only. Outer column uses `pb-0`; home-indicator inset lives in feed bottom padding + scroll content. */
  const loungeDockFeedContentInsetPx = showLoungeViewportDock
    ? dockChromeHeightFromTitleBarPx(loungeTitleBarChromePx) + 6
    : 0
  const loungeFeedDockPaddingBottom = loungeDockFeedContentInsetPx

  const loungeArcCarouselItems = useMemo(
    () =>
      buildLoungeDockArcCarouselItems({
        onCompose: onLoungeDockCompose,
        composeActive: composerExpanded,
        composeDisabled: loungeFeedBrowseMode === 'anonymous' || loungeReadOnly,
        onHome: onLoungeDockHome,
        onSearch: onLoungeDockSearch,
        onFollowingFilterToggle: onLoungeFollowingFilterToggle,
        followingFilterOn: loungeFollowingFilterOn,
        followingFilterDisabled: loungeFeedBrowseMode === 'anonymous',
        onNotifications: onLoungeDockNotifications,
        onChat: onLoungeDockChat,
        activePanel: loungeDockPanel,
      }),
    [
      onLoungeDockCompose,
      composerExpanded,
      loungeReadOnly,
      onLoungeDockHome,
      onLoungeDockSearch,
      onLoungeFollowingFilterToggle,
      loungeFollowingFilterOn,
      loungeFeedBrowseMode,
      onLoungeDockNotifications,
      onLoungeDockChat,
      loungeDockPanel,
    ],
  )

  return (
    <div
      className={`mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-zinc-950 pt-[max(0px,env(safe-area-inset-top))] pb-0`}
    >
      {quoteRepostQueuedToast ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 z-[102] w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 rounded-xl border border-cyan-500/50 bg-zinc-950/92 px-3 py-2.5 text-center text-[14px] font-medium leading-snug text-cyan-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          Sending your quote... You&apos;ll have 30 minutes to edit after it posts.
        </div>
      ) : null}
      {loungeShareFlash ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 z-[102] w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 rounded-xl border border-emerald-500/45 bg-zinc-950/92 px-3 py-2.5 text-center text-[14px] font-medium leading-snug text-emerald-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md"
          style={{ top: quoteRepostQueuedToast ? 'max(4.25rem, calc(0.5rem + 3.25rem + env(safe-area-inset-top)))' : 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          {loungeShareFlash}
        </div>
      ) : null}
      {/* Fixed title bar: hidden while dock slide panel is open (panel renders its own scroll-linked bar). */}
      {!loungeDockPanel ? (
        <div
          ref={loungeTitleBarRef}
          className="fixed left-1/2 z-[50] w-full max-w-2xl border-b border-zinc-800/95 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85 shadow-[0_1px_0_rgba(0,0,0,0.22)] will-change-transform"
          style={{
            top: loungeFeedViewportTopPx,
            transform: `translate3d(-50%, ${-(1 - loungeTitleReveal) * (loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56)}px, 0)`,
            pointerEvents: loungeTitleReveal > 0.12 ? 'auto' : 'none',
          }}
        >
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <EdgeLogoWithEasterEgg className="h-6 w-auto max-w-[min(140px,calc(100vw-9rem))] shrink-0 object-contain object-left" />
            <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
              <div className="pointer-events-none truncate text-right text-zinc-600 text-[13px]">
                {communityFeedLoading ? 'Updating…' : ''}
              </div>
              {titleBarNavSlot}
            </div>
          </div>
        </div>
      ) : null}

      {showLoungeViewportDock && !loungeDockPanel ? (
        <LoungeDockFooterBar
          reveal={loungeTitleReveal}
          barHeightPx={loungeDockFooterHeight}
          matchTitleBarHeightPx={loungeTitleBarChromePx}
          onHeightChange={onLoungeDockFooterHeight}
          onHome={onLoungeDockHome}
          onSearch={onLoungeDockSearch}
          onFollowingFilterToggle={onLoungeFollowingFilterToggle}
          followingFilterOn={loungeFollowingFilterOn}
          followingFilterDisabled={loungeFeedBrowseMode === 'anonymous'}
          onNotifications={onLoungeDockNotifications}
          onChat={onLoungeDockChat}
          activePanel={loungeDockPanel}
          layout="viewport"
        />
      ) : null}

      {showLoungeViewportDock ? (
        <LoungeDockArcCarouselPrototype
          items={loungeArcCarouselItems}
          reveal={loungeDockPanel ? loungePanelTitleReveal : loungeTitleReveal}
          panelChrome={loungeDockPanel}
          onPointerBlockChange={setLoungeFabPointerBlocked}
        />
      ) : null}

      <div
        ref={loungeFeedScrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-zinc-950 [-webkit-overflow-scrolling:touch]"
        style={{
          ...(loungeFeedDockPaddingBottom > 0 ? { paddingBottom: loungeFeedDockPaddingBottom } : {}),
          pointerEvents: loungeFabPointerBlocked ? 'none' : undefined,
        }}
      >
        <LoungeFeedVideoAutoplayProvider scrollRootRef={loungeFeedScrollRef}>
        <LoungeFeedInlineSoundResetBinder resetRef={resetFeedInlineSoundRef} />
        <div
          aria-hidden
          className="shrink-0"
          style={{ height: loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56 }}
        />

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

        {loungeReadOnly ? null : postErr ? (
          <div className="shrink-0 border-b border-rose-500/25 bg-zinc-950/90 px-3 py-2">
            <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[15px] leading-snug text-rose-200">
              {postErr}
            </div>
          </div>
        ) : null}

        {loungeReadOnly ? null : (
        <div
          className={`relative shrink-0 border-b border-zinc-600/65 bg-zinc-700/55 px-3 ${
            composerExpanded ? 'pt-3 pb-2.5' : 'py-3'
          }`}
        >
        {composerExpanded && composerFoldReveal > 0.14 ? (
          <button
            type="button"
            onClick={() => {
              const hasContent =
                postText.trim().length > 0 ||
                composerImageItems.length > 0 ||
                composerVideoSlot != null ||
                String(composerMediaUrl || '').trim().length > 0
              if (hasContent) {
                setComposerDiscardPromptOpen(true)
                return
              }
              setPostText('')
              setComposerImageItems((prev) => {
                for (const it of prev) {
                  try {
                    URL.revokeObjectURL(it.preview)
                  } catch {
                    // ignore
                  }
                }
                return []
              })
              cancelComposerMediaPrep()
              setComposerMediaUrl('')
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
                <div className="mt-0.5 flex min-h-[6.5rem] flex-col pr-8">
                  <div className="grid min-h-[2.75rem] max-h-[min(50vh,22rem)] shrink-0 grid-cols-1 grid-rows-1 [&>*]:col-start-1 [&>*]:row-start-1 sm:min-h-[3rem]">
                    <div
                      ref={composerMirrorRef}
                      aria-hidden
                      className="pointer-events-none min-h-[2.75rem] max-h-[min(50vh,22rem)] w-full overflow-y-auto whitespace-pre-wrap break-words px-0 py-0 pt-[10px] text-left text-[17px] leading-[1.25] text-zinc-100 [scrollbar-width:none] [-ms-overflow-style:none] sm:min-h-[3rem] sm:pt-[13px] [&::-webkit-scrollbar]:hidden"
                    >
                      {postText ? (
                        renderRichCaption(postText, {
                          linkClassName:
                            'pointer-events-none font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                        })
                      ) : (
                        <span className="text-zinc-500">Are ya winning, son?</span>
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
                      className="z-10 min-h-[2.75rem] max-h-[min(50vh,22rem)] w-full resize-none touch-manipulation overflow-y-auto bg-transparent px-0 py-0 pt-[10px] text-[17px] leading-[1.25] text-transparent caret-white outline-none selection:bg-cyan-500/25 sm:min-h-[3rem] sm:pt-[13px]"
                      placeholder=""
                      aria-label="Lounge post caption"
                      maxLength={280}
                    />
                  </div>
                  {(() => {
                    const gifUrl = String(composerMediaUrl || '').trim()
                    const imageUrls = composerImageItems.map((x) => x.preview)
                    const carouselUrls = gifUrl ? [...imageUrls, gifUrl] : imageUrls
                    if (carouselUrls.length === 0) return null
                    const nImg = composerImageItems.length
                    return (
                      <LoungeImageCarousel
                        urls={carouselUrls}
                        variant="composer"
                        firstMarginTopClass="mt-1.5"
                        regionAriaLabel={gifUrl ? 'Post images and GIF' : 'Post images'}
                        removeLabelForIndex={(i) => (i < nImg ? 'Remove image' : 'Remove GIF')}
                        onRemoveIndex={(i) => {
                          if (i < nImg) {
                            setComposerImageItems((prev) => {
                              const row = prev[i]
                              if (row?.preview) {
                                try {
                                  URL.revokeObjectURL(row.preview)
                                } catch {
                                  // ignore
                                }
                              }
                              return prev.filter((_, j) => j !== i)
                            })
                          } else {
                            setComposerMediaUrl('')
                          }
                        }}
                      />
                    )
                  })()}
                  {composerVideoSlot ? (
                    <div className="relative mt-1.5 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                      {!composerVideoSlot.file && composerVideoSlot.preview ? (
                        <img
                          src={composerVideoSlot.preview}
                          alt=""
                          className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                        />
                      ) : composerVideoSlot.preview ? (
                        <video
                          src={composerVideoSlot.preview}
                          poster={composerVideoSlot.posterUrl || undefined}
                          className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                          controls
                          playsInline
                          preload="metadata"
                          aria-label="Video preview"
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          cancelComposerMediaPrep()
                        }}
                        className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
                        aria-label="Remove video"
                        title="Remove video"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <div className="min-h-0 flex-1" aria-hidden />
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
                  return 'Are ya winning, son?'
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
              multiple
              className="hidden"
              onChange={(e) => {
                const input = e.target
                const files = Array.from(input.files || [])
                if (!files.length) return
                setPostErr('')
                const hasVideo = files.some((f) => isProbablyVideoFile(f))
                if (hasVideo) {
                  const vf = files.find((f) => isProbablyVideoFile(f))
                  if (!vf) {
                    try {
                      input.value = ''
                    } catch {
                      // ignore
                    }
                    return
                  }
                  setComposerImageItems((prev) => {
                    for (const it of prev) {
                      try {
                        URL.revokeObjectURL(it.preview)
                      } catch {
                        // ignore
                      }
                    }
                    return []
                  })
                  cancelComposerMediaPrep()
                  setComposerMediaUrl('')
                  try {
                    input.value = ''
                  } catch {
                    // ignore
                  }
                  void queueLoungeVideoOrCrop(vf, 'composer')
                  return
                }
                const bad = files.some((f) => !isProbablyImageFile(f))
                if (bad) {
                  setPostErr('Unsupported media type. Please choose an image or video file.')
                  try {
                    input.value = ''
                  } catch {
                    // ignore
                  }
                  return
                }
                cancelComposerMediaPrep()
                const prevImgs = composerImageItemsRef.current
                const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
                composerImageItemsRef.current = next
                setComposerImageItems(next)
                if (limitDialog) setLoungeImageLimitDialog(limitDialog)
                try {
                  input.value = ''
                } catch {
                  // ignore
                }
              }}
            />
            <div className="mt-1 flex w-full items-center gap-2 pr-2 pt-1.5 pb-1">
              <button
                type="button"
                onClick={() => composerMediaInputRef.current?.click()}
                className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
                title="Add media"
                aria-label="Add media"
              >
                <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect
                    x="3.75"
                    y="3.75"
                    width="12.5"
                    height="12.5"
                    rx="2"
                    fill="currentColor"
                    fillOpacity="0.14"
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
                  <circle cx="8" cy="8" r="1" fill="currentColor" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (openProfileGateIfNeeded()) return
                  setKlipyPickerTarget('composer')
                  setKlipyPickerOpen(true)
                }}
                className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
                title="Add GIF (Klipy)"
                aria-label="Add GIF"
              >
                <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <rect
                    x="3.75"
                    y="3.75"
                    width="12.5"
                    height="12.5"
                    rx="2"
                    fill="currentColor"
                    fillOpacity="0.14"
                    stroke="currentColor"
                    strokeWidth="1.35"
                  />
                  <text
                    x="10"
                    y="12.85"
                    textAnchor="middle"
                    fill="currentColor"
                    style={{ fontSize: '5.35px', fontWeight: 800, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                  >
                    GIF
                  </text>
                </svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2" />
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
                  <span
                    className={`shrink-0 text-[12px] tabular-nums ${loungeCharCounterClass(postText.length)}`}
                    aria-live="polite"
                  >
                    {postText.length}/280
                  </span>
                  <button
                    type="button"
                    onClick={() => void submitLoungePost()}
                    disabled={
                      postBusy ||
                      loungePostSubmitInFlight ||
                      loungeComposerVideoPostBlocked ||
                      loungePostUploadFailedOpen ||
                      loungeVideoCrop != null ||
                      (!postText.trim() &&
                        !String(composerMediaUrl || '').trim() &&
                        composerImageItems.length === 0 &&
                        !composerVideoSlot)
                    }
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

        {composerDiscardPromptOpen ? (
          <div
            className="fixed inset-0 z-[91] flex items-end justify-center bg-black/45 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[3px] sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-discard-title"
          >
            <button
              type="button"
              className="absolute inset-0 cursor-default touch-manipulation bg-transparent"
              aria-label="Close"
              onClick={() => setComposerDiscardPromptOpen(false)}
            />
            <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/85 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md">
              <h2 id="composer-discard-title" className="text-[17px] font-bold text-white">
                Save draft?
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-zinc-400">
                Save your text and linked GIF to drafts. Photos and videos in the composer are cleared and need to be
                re-added when you continue.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="order-2 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-1"
                  onClick={() => {
                    setComposerDiscardPromptOpen(false)
                    setPostText('')
                    setComposerImageItems((prev) => {
                      for (const it of prev) {
                        try {
                          URL.revokeObjectURL(it.preview)
                        } catch {
                          // ignore
                        }
                      }
                      return []
                    })
                    cancelComposerMediaPrep()
                    setComposerMediaUrl('')
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
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="order-1 min-h-11 rounded-xl bg-violet-600 px-4 text-[15px] font-semibold text-white hover:bg-violet-500 touch-manipulation sm:order-2"
                  onClick={() => {
                    persistLoungeComposerDraft(postText, false, false, composerMediaUrl)
                    setComposerImageItems((prev) => {
                      for (const it of prev) {
                        try {
                          URL.revokeObjectURL(it.preview)
                        } catch {
                          // ignore
                        }
                      }
                      return []
                    })
                    cancelComposerMediaPrep()
                    try {
                      const el = composerMediaInputRef.current
                      if (el) el.value = ''
                    } catch {
                      // ignore
                    }
                    setComposerDiscardPromptOpen(false)
                    setComposerPinOnPost(false)
                    setPostErr('Draft saved. Re-add photos if you had any.')
                    composerFoldedFromFeedScrollRef.current = false
                    composerFoldRevealRef.current = 0
                    setComposerFoldReveal(0)
                    composerExpandedRef.current = false
                    setComposerExpanded(false)
                  }}
                >
                  Save draft
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="border-b border-zinc-800 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
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
          communityFeedQueryErr ? (
            <div className="px-3 py-5 text-[17px] leading-relaxed">
              <div className="rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-rose-200 break-words whitespace-pre-wrap">
                Could not load the lounge feed: {communityFeedQueryErr}
              </div>
              {/media_url|gif_url|schema cache|column/i.test(communityFeedQueryErr) ? (
                <p className="mt-3 text-zinc-400">
                  If you recently added GIFs or media on posts, apply{' '}
                  <code className="text-fuchsia-200/90">supabase/lounge_feed_post_media.sql</code> and{' '}
                  <code className="text-fuchsia-200/90">supabase/lounge_feed_post_gif_url.sql</code> in the Supabase SQL
                  editor so the <code className="text-fuchsia-200/90">media_url</code> and{' '}
                  <code className="text-fuchsia-200/90">gif_url</code> columns exist, then refresh.
                </p>
              ) : (
                <p className="mt-3 text-zinc-400">
                  Check the browser network tab for the <code className="text-fuchsia-200/90">community_feed_posts</code>{' '}
                  request, fix the Supabase schema or RLS issue, then pull to refresh.
                </p>
              )}
            </div>
          ) : loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING ? (
            <div className="px-3 py-5 text-zinc-400 text-[17px] leading-relaxed">
              No posts from people you follow yet. Follow members from their profile, or switch back to{' '}
              <span className="text-zinc-300">All</span> to see the full lounge.
            </div>
          ) : (
            <div className="px-3 py-5 text-zinc-400 text-[17px] leading-relaxed">
              No posts yet. Run{' '}
              <code className="text-fuchsia-200/90">supabase/feed_phase_a_profiles_public_read.sql</code> in Supabase,
              then post from Guides → Ask community.
            </div>
          )
        ) : (
          <>
            {communityPosts.map((post) => (
              <article
                key={post.id}
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
                className="border-t border-zinc-800 bg-zinc-950/35 px-3 py-4 transition-colors active:bg-zinc-900/55 [-webkit-tap-highlight-color:transparent]"
                onClick={(e) => {
                  const t = e.target
                  if (!(t instanceof Element)) return
                  const origHost = t.closest('[data-lounge-original-embed]')
                  if (origHost && post.reposted_post?.id) {
                    openLoungePostDetail(post.reposted_post)
                    return
                  }
                  if (
                    t.closest(
                      'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                    )
                  )
                    return
                  openLoungePostDetail(post)
                }}
              >
                <LoungePostArticle
                  post={post}
                  loungeReadOnly={loungeReadOnly}
                  interactionStateFor={interactionStateFor}
                  toggleInteraction={toggleInteraction}
                  repostMenuScrollRootRef={loungeFeedScrollRef}
                  onPlainRepost={handlePlainRepost}
                  onUndoPlainRepost={(p) => {
                    void undoPlainRepostForOriginal(p.id)
                  }}
                  onRemoveQuoteRepost={openRemoveQuoteRepostForPost}
                  onQuoteRepost={openQuoteRepostComposer}
                  toggleBookmark={toggleBookmark}
                  bookmarkedByPost={bookmarkedByPost}
                  onOpenComments={openLoungePostDetail}
                  onSharePost={handleShareLoungePost}
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
                  viewerUserId={composerUserId}
                  captionEditableInMenu={(p) =>
                    Boolean(
                      composerUserId &&
                        p?.user_id === composerUserId &&
                        isLoungePostWithinAuthorEditWindow(p?.created_at),
                    )
                  }
                  onPostMenuEdit={(p) => openLoungePostDetail(p, { startEditing: true })}
                  onPostMenuDelete={deleteLoungePostFromFeed}
                  onStaffPostDelete={deleteStaffLoungePostFromFeed}
                  onPostMenuBlock={onPostMenuBlockFromFeed}
                  onPostMenuReport={onPostMenuReportFromFeed}
                  busyDeletingPostId={loungeFeedDeleteBusyPostId}
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
        </LoungeFeedVideoAutoplayProvider>
      </div>

      {loungePostDetail ? (
        <div
          className="fixed inset-0 z-[98] sm:bg-black/55 sm:backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lounge-post-detail-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 hidden cursor-default sm:block"
            aria-label="Close post"
            onClick={() => {
              if (loungeDetailEditing) cancelLoungeDetailEdit()
              else closeLoungePostDetail()
            }}
          />
          <div
            className={`fixed inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-800/70 bg-zinc-950/94 shadow-[-12px_0_40px_rgba(0,0,0,0.45)] backdrop-blur-md transition-transform duration-300 ease-out motion-reduce:transition-none ${
              loungePostDetailVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
            onTransitionEnd={onLoungePostDetailPanelTransitionEnd}
            onTransitionCancel={onLoungePostDetailPanelTransitionEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={loungePostDetailTitleBarRef}
              className="absolute inset-x-0 top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/80 px-3 py-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/70 sm:py-3 shadow-[0_1px_0_rgba(0,0,0,0.18)] will-change-transform"
              style={{
                transform: `translate3d(0, ${-(1 - loungePostDetailTitleReveal) * (loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56)}px, 0)`,
                pointerEvents: loungePostDetailTitleReveal > 0.12 ? 'auto' : 'none',
              }}
            >
              <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
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
                      {loungeDetailIsOwn && isLoungePostWithinAuthorEditWindow(loungePostDetail.created_at) ? (
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
                            const seed = feedPostAuthorEditMediaSeed(loungePostDetail)
                            setLoungeDetailEditImageUrls(seed.imageUrls)
                            setLoungeDetailEditGifUrl(seed.gifUrl)
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
                            void performLoungePostDeleteFromDetail()
                          }}
                        >
                          Delete
                        </button>
                      ) : null}
                      {loungeViewerIsStaff && !loungeDetailIsOwn ? (
                        <button
                          type="button"
                          role="menuitem"
                          className="block w-full px-4 py-3 text-left text-[15px] font-medium text-rose-300 hover:bg-zinc-800 touch-manipulation disabled:opacity-50"
                          disabled={loungeDetailDeleteBusy}
                          onClick={() => {
                            setLoungePostDetailMenuOpen(false)
                            void performLoungeStaffDeleteFromDetail()
                          }}
                        >
                          Delete post
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
            </div>

            <div
              ref={loungePostDetailScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            >
              <div
                aria-hidden
                className="shrink-0"
                style={{ height: loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56 }}
              />
              <div className="px-4 py-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
                        void openProfileModal(p)
                      }}
                      className="min-w-0 inline-flex max-w-full overflow-hidden text-left hover:text-cyan-300"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
                        <span className="min-w-0 max-w-[min(12rem,46vw)] truncate font-semibold text-[15px] text-zinc-100 sm:max-w-[14rem]">
                          {displayNameFor(loungePostDetail)}
                        </span>
                        <LoungeStaffRoleBadge role={loungePostDetail?.author_profile?.role} size="detail" />
                        <LoungeOgBadge isOg={loungePostDetail?.author_profile?.is_og} size="detail" />
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
                          <span className="text-zinc-500">Are ya winning, son?</span>
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
                  {(() => {
                    const gifUrl = String(loungeDetailEditGifUrl || '').trim()
                    const imageUrls = loungeDetailEditImageUrls
                    const carouselUrls = gifUrl ? [...imageUrls, gifUrl] : imageUrls
                    if (carouselUrls.length === 0) return null
                    const nImg = loungeDetailEditImageUrls.length
                    return (
                      <LoungeImageCarousel
                        urls={carouselUrls}
                        variant="composer"
                        firstMarginTopClass="mt-3"
                        regionAriaLabel={gifUrl ? 'Post images and GIF' : 'Post images'}
                        removeLabelForIndex={(i) => (i < nImg ? 'Remove image' : 'Remove GIF')}
                        onRemoveIndex={(i) => {
                          if (i < nImg) {
                            setLoungeDetailEditImageUrls((prev) => prev.filter((_, j) => j !== i))
                          } else {
                            setLoungeDetailEditGifUrl('')
                          }
                        }}
                      />
                    )
                  })()}
                </div>
              ) : loungePostDetail.reposted_post ? (
                <>
                  {feedPostDisplayCaption(loungePostDetail) ? (
                    <div
                      className={`text-left text-[18px] leading-snug text-zinc-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      }`}
                    >
                      {renderRichCaption(feedPostDisplayCaption(loungePostDetail), {
                        hashtagClassName: 'font-semibold text-cyan-300',
                        linkClassName:
                          'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                      })}
                    </div>
                  ) : null}
                  <LoungePostFeedImagesAndGif
                    post={loungePostDetail}
                    variant="detail"
                    firstMarginTopClass={
                      feedPostDisplayCaption(loungePostDetail)
                        ? 'mt-2'
                        : loungePostDetail.game_slug
                          ? 'mt-1.5'
                          : 'mt-4'
                    }
                    visibilityResetRootRef={loungePostDetailScrollRef}
                    renderMediaLightboxFooter={renderDetailMediaLightboxFooter}
                  />
                  <button
                    type="button"
                    data-lounge-original-embed
                    aria-label="View original post"
                    onClick={() => void openLoungePostDetail(loungePostDetail.reposted_post)}
                    className="mt-3 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] leading-snug">
                      <span className="min-w-0 max-w-[min(11rem,42vw)] truncate font-semibold text-zinc-200 sm:max-w-[13rem]">
                        {displayNameFor(loungePostDetail.reposted_post)}
                      </span>
                      <LoungeStaffRoleBadge role={loungePostDetail.reposted_post?.author_profile?.role} size="detail" />
                      <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[14px] text-zinc-500">
                        <span className="min-w-0 max-w-[min(9rem,36vw)] truncate sm:max-w-[11rem]">
                          {handleFor(loungePostDetail.reposted_post)}
                        </span>
                      </span>
                      {loungePostDetail.reposted_post.pinned ? (
                        <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                          Pinned
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                      {renderRichCaption(feedPostDisplayCaption(loungePostDetail.reposted_post), {
                        hashtagClassName: 'font-semibold text-cyan-300',
                        linkClassName:
                          'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                      })}
                    </div>
                    <LoungePostFeedImagesAndGif
                      post={loungePostDetail.reposted_post}
                      variant="embed"
                      firstMarginTopClass="mt-2"
                      visibilityResetRootRef={loungePostDetailScrollRef}
                      renderMediaLightboxFooter={renderDetailMediaLightboxFooter}
                    />
                  </button>
                </>
              ) : (
                <>
                  {feedPostDisplayCaption(loungePostDetail) ? (
                    <div
                      className={`text-left text-[18px] leading-snug text-zinc-100 whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      }`}
                    >
                      {renderRichCaption(feedPostDisplayCaption(loungePostDetail), {
                        hashtagClassName: 'font-semibold text-cyan-300',
                        linkClassName:
                          'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                      })}
                    </div>
                  ) : null}
                  <LoungePostFeedImagesAndGif
                    post={loungePostDetail}
                    variant="detail"
                    firstMarginTopClass={
                      feedPostDisplayCaption(loungePostDetail)
                        ? 'mt-2'
                        : loungePostDetail.game_slug
                          ? 'mt-1.5'
                          : 'mt-4'
                    }
                    visibilityResetRootRef={loungePostDetailScrollRef}
                    renderMediaLightboxFooter={renderDetailMediaLightboxFooter}
                  />
                </>
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
                const baseReposts = typeof d.repost_count === 'number' ? d.repost_count : 0
                const commentCount = baseComments
                const likeCount = baseLikes
                const repostCount = baseReposts
                const commentClass = loungeReadOnly ? 'text-zinc-500' : ui.commented ? 'text-zinc-100' : 'text-zinc-500'
                const repostClass = loungeReadOnly ? 'text-zinc-500' : ui.reposted ? 'text-emerald-400' : 'text-zinc-500'
                const likeClass = loungeReadOnly ? 'text-zinc-500' : ui.liked ? 'text-rose-400' : 'text-zinc-500'
                const bookmarkClass = loungeReadOnly ? 'text-zinc-600' : isBookmarked ? 'text-amber-300' : 'text-zinc-500'
                const ro = loungeReadOnly
                const plainId = ui.plainRepostChildId
                const quoteId = ui.quoteRepostChildId
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
                              void queueLoungeVideoOrCrop(file, 'detail')
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
                            className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
                            title="Add media"
                            aria-label="Add media"
                          >
                            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <rect
                                x="3.75"
                                y="3.75"
                                width="12.5"
                                height="12.5"
                                rx="2"
                                fill="currentColor"
                                fillOpacity="0.14"
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
                              <circle cx="8" cy="8" r="1" fill="currentColor" />
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
                              <span
                                className={`text-[12px] tabular-nums ${loungeCharCounterClass(loungeDetailDraftCaption.length)}`}
                                aria-live="polite"
                              >
                                {loungeDetailDraftCaption.length}/280
                              </span>
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
                          document.getElementById('lounge-detail-comments')?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }}
                        className="inline-flex items-center justify-start gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                      >
                        <svg className={`h-[22px] w-[22px] ${commentClass}`} viewBox="0 0 20 20" aria-hidden>
                          <path
                            d="M4.75 5.75h10.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3.25 2v-2H4.75a1.5 1.5 0 01-1.5-1.5v-5a1.5 1.5 0 011.5-1.5z"
                            fill="currentColor"
                            fillOpacity={ro ? 0.08 : ui.commented ? 0.42 : 0.18}
                            stroke="currentColor"
                            strokeWidth="1.35"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {Number.isFinite(commentCount) ? <span className={commentClass}>{commentCount}</span> : null}
                      </LoungeFeedStatSlot>
                      <div className="relative flex justify-center" ref={loungeDetailRepostMenuRef}>
                        <LoungeFeedStatSlot
                          readOnly={ro}
                          title={
                            ro
                              ? 'Sign in to repost'
                              : ui.reposted
                                ? 'Repost options'
                                : 'Repost or quote repost'
                          }
                          onReadOnlyClick={requireLoungeAuth}
                          onClick={() => {
                            if (openProfileGateIfNeeded()) return
                            setLoungeDetailRepostMenuOpen((o) => !o)
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
                          {Number.isFinite(repostCount) ? <span className={repostClass}>{repostCount}</span> : null}
                        </LoungeFeedStatSlot>
                        {loungeDetailRepostMenuOpen && !ro ? (
                          <div
                            role="menu"
                            className="absolute bottom-full left-1/2 z-[130] mb-1 min-w-[11.5rem] -translate-x-1/2 rounded-xl border border-zinc-700/90 bg-zinc-900/95 py-0.5 shadow-xl backdrop-blur-sm"
                          >
                            {ui.reposted ? (
                              <>
                                {plainId ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                                    disabled={repostManageBusy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLoungeDetailRepostMenuOpen(false)
                                      void undoPlainRepostForOriginal(d.id)
                                    }}
                                  >
                                    <svg className="h-4 w-4 shrink-0 text-emerald-400/90" viewBox="0 0 20 20" fill="none" aria-hidden>
                                      <path
                                        d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                                        stroke="currentColor"
                                        strokeWidth="1.35"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                    Undo repost
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                                    disabled={repostManageBusy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLoungeDetailRepostMenuOpen(false)
                                      void handlePlainRepost(d)
                                    }}
                                  >
                                    <svg className="h-4 w-4 shrink-0 text-emerald-400/90" viewBox="0 0 20 20" fill="none" aria-hidden>
                                      <path
                                        d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                                        stroke="currentColor"
                                        strokeWidth="1.35"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                    Repost
                                  </button>
                                )}
                                {quoteId ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-rose-400 hover:bg-rose-950/35 touch-manipulation"
                                    disabled={repostManageBusy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLoungeDetailRepostMenuOpen(false)
                                      openRemoveQuoteRepostForPost(d)
                                    }}
                                  >
                                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden>
                                      <path
                                        d="M6.5 6.5h7v9.5a1 1 0 01-1 1h-5a1 1 0 01-1-1V6.5zM8 6.5V5a1.5 1.5 0 013 0v1.5M4 6.5h12"
                                        stroke="currentColor"
                                        strokeWidth="1.35"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                    Remove quote
                                  </button>
                                ) : null}
                                {!quoteId ? (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                                    disabled={repostManageBusy}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setLoungeDetailRepostMenuOpen(false)
                                      openQuoteRepostComposer(d)
                                    }}
                                  >
                                    <svg className="h-4 w-4 shrink-0 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                      <path
                                        d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    </svg>
                                    Quote
                                  </button>
                                ) : null}
                              </>
                            ) : (
                              <>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                              onClick={(e) => {
                                e.stopPropagation()
                                setLoungeDetailRepostMenuOpen(false)
                                void handlePlainRepost(d)
                              }}
                            >
                              <svg className="h-4 w-4 shrink-0 text-emerald-400/90" viewBox="0 0 20 20" fill="none" aria-hidden>
                                <path
                                  d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                                  stroke="currentColor"
                                  strokeWidth="1.35"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              Repost
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                              onClick={(e) => {
                                e.stopPropagation()
                                setLoungeDetailRepostMenuOpen(false)
                                openQuoteRepostComposer(d)
                              }}
                            >
                              <svg className="h-4 w-4 shrink-0 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                                <path
                                  d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              Quote
                            </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </div>
                      <LoungeFeedStatSlot
                        readOnly={ro}
                        title={ro ? 'Sign in to like' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => void toggleInteraction(d.id, 'liked')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                      >
                        <svg className={`h-[22px] w-[22px] ${likeClass}`} viewBox="0 0 20 20" aria-hidden>
                          <path
                            d="M10 16.1l-.85-.78C5.65 12.1 3.5 10.16 3.5 7.78A3.28 3.28 0 016.78 4.5c1.07 0 2.1.5 2.72 1.29A3.55 3.55 0 0112.22 4.5a3.28 3.28 0 013.28 3.28c0 2.38-2.15 4.33-5.65 7.54l-.85.78z"
                            fill="currentColor"
                            fillOpacity={ro ? 0.06 : ui.liked ? 1 : 0.2}
                            stroke={ui.liked ? 'none' : 'currentColor'}
                            strokeWidth={ui.liked ? 0 : 1.35}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {Number.isFinite(likeCount) ? <span className={likeClass}>{likeCount}</span> : null}
                      </LoungeFeedStatSlot>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleShareLoungePost(d)
                        }}
                        className="inline-flex items-center justify-center rounded-lg px-2 py-2 text-zinc-500 hover:bg-zinc-900/80 hover:text-zinc-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        title="Share post"
                        aria-label="Share post"
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
                      </button>
                      {ro ? (
                        <button
                          type="button"
                          onClick={requireLoungeAuth}
                          className="inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-2 text-zinc-600 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                          title="Sign in to save posts"
                        >
                          <svg className={`h-[22px] w-[22px] ${bookmarkClass}`} viewBox="0 0 20 20" aria-hidden>
                            <path
                              d="M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z"
                              fill="currentColor"
                              fillOpacity={0.08}
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
                          onClick={() => void toggleBookmark(d.id)}
                          className="inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation"
                          title={isBookmarked ? 'Remove bookmark' : 'Save post'}
                        >
                          <svg className={`h-[22px] w-[22px] ${bookmarkClass}`} viewBox="0 0 20 20" aria-hidden>
                            <path
                              d="M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z"
                              fill="currentColor"
                              fillOpacity={isBookmarked ? 0.55 : 0.18}
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

              <div id="lounge-detail-comments" className="mt-6 border-t border-zinc-800/90 pt-4">
                <div className="text-[15px] font-bold text-zinc-200">Comments</div>
                {loungeReadOnly ? (
                  <p className="mt-2 text-[14px] text-zinc-500">
                    {typeof loungePostDetail.comment_count === 'number' && loungePostDetail.comment_count > 0
                      ? `${loungePostDetail.comment_count} comment${loungePostDetail.comment_count === 1 ? '' : 's'} · Sign in to read and reply`
                      : 'Sign in to join the conversation.'}
                  </p>
                ) : (
                  <>
                    {loungeDetailCommentsLoading ? (
                      <div className="mt-2 text-[14px] text-zinc-500">Loading comments…</div>
                    ) : (
                      <LoungePostCommentThread
                        comments={loungeDetailComments}
                        postAuthorUserId={loungePostDetail.user_id || ''}
                        postAgeLabel={postAgeLabel}
                        readOnly={loungeReadOnly}
                        onReply={onLoungeCommentReply}
                        autoExpandThreadRootIds={loungeCommentExpandRoots}
                        composerSlot={
                          <>
                            {loungeDetailCommentErr ? (
                              <div className="mt-3 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] text-rose-200">
                                {loungeDetailCommentErr}
                              </div>
                            ) : null}
                            {loungeCommentReplyTo ? (
                              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/70 px-3 py-2 text-[13px] text-zinc-400">
                                <span className="min-w-0 truncate">
                                  Replying to{' '}
                                  <span className="font-semibold text-zinc-200">{loungeCommentReplyTo.label}</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setLoungeCommentReplyTo(null)}
                                  className="shrink-0 min-h-9 rounded-lg px-2 text-[13px] font-semibold text-zinc-500 touch-manipulation hover:text-zinc-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : null}
                            <div className="mt-4">
                              <label htmlFor="lounge-detail-comment" className="sr-only">
                                {loungeCommentReplyTo ? 'Write a reply' : 'Write a comment'}
                              </label>
                              <textarea
                                id="lounge-detail-comment"
                                value={loungeDetailCommentDraft}
                                onChange={(e) => setLoungeDetailCommentDraft(e.target.value)}
                                placeholder={loungeCommentReplyTo ? 'Write a reply…' : 'Write a comment…'}
                                maxLength={2000}
                                rows={3}
                                className="w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-[16px] leading-snug text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
                              />
                              <div className="mt-2 flex justify-end">
                                <button
                                  type="button"
                                  disabled={loungeDetailCommentBusy || !loungeDetailCommentDraft.trim()}
                                  onClick={() => void submitLoungeDetailComment()}
                                  className="min-h-10 rounded-xl bg-violet-600 px-4 text-[14px] font-bold text-white touch-manipulation hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50 [-webkit-tap-highlight-color:transparent]"
                                >
                                  {loungeDetailCommentBusy ? 'Posting…' : loungeCommentReplyTo ? 'Reply' : 'Comment'}
                                </button>
                              </div>
                            </div>
                          </>
                        }
                      />
                    )}
                  </>
                )}
              </div>
              </div>
            </div>
          </div>

        </div>
      ) : null}

      {loungeDockPanel ? (
        <LoungeDockSlidePanels
          key={loungeDockPanel}
          openPanel={loungeDockPanel}
          onClose={() => {
            setChatDockInitialPeerUserId(null)
            setLoungeDockPanel(null)
          }}
          communityPosts={communityPosts}
          viewportTitleTopPx={loungeFeedViewportTopPx}
          titleBarNavSlot={titleBarNavSlot}
          communityFeedLoading={communityFeedLoading}
          onHome={onLoungeDockHome}
          onSearch={onLoungeDockSearch}
          onFollowingFilterToggle={onLoungeFollowingFilterToggle}
          followingFilterOn={loungeFollowingFilterOn}
          followingFilterDisabled={loungeFeedBrowseMode === 'anonymous'}
          onNotifications={onLoungeDockNotifications}
          onChat={onLoungeDockChat}
          activePanel={loungeDockPanel}
          postCardProps={profilePostCardProps}
          onOpenPostFromSearch={onLoungeDockOpenPostFromSearch}
          chatSupabaseClient={supabaseClient}
          chatViewerUserId={composerUserId || ''}
          chatHasActiveSubscription={hasActiveSubscription}
          chatIsStaff={chatDockIsStaff}
          chatInitialPeerUserId={chatDockInitialPeerUserId}
          onChatInitialPeerCleared={clearChatDockInitialPeer}
          blockUnderlyingPointer={loungeFabPointerBlocked}
          onTitleRevealChange={onLoungePanelTitleReveal}
        />
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
          hydratePosts={hydrateCommunityPosts}
          shellDock={{
            activePanel: loungeDockPanel,
            onHome: onLoungeDockHome,
            onSearch: onLoungeDockSearch,
            onFollowingFilterToggle: onLoungeFollowingFilterToggle,
            followingFilterOn: loungeFollowingFilterOn,
            followingFilterDisabled: loungeFeedBrowseMode === 'anonymous',
            onNotifications: onLoungeDockNotifications,
            onChat: onLoungeDockChat,
          }}
          onOpenChatWithUser={openChatWithUserFromProfile}
          viewerCanUseLoungeChat={viewerCanUseLoungeChat}
        />
      ) : null}

      {quoteRepostModal?.mode === 'remove' ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 px-3 pb-0 backdrop-blur-[3px]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="quote-remove-confirm-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default touch-manipulation bg-transparent"
            aria-label="Dismiss"
            disabled={quoteRepostBusy}
            onClick={() => {
              if (quoteRepostBusy) return
              setQuoteRepostModal(null)
              setQuoteRepostErr('')
            }}
          />
          <div className="pointer-events-none relative z-10 mx-auto w-full max-w-md pb-[max(1.25rem,env(safe-area-inset-bottom)+28px)]">
            <div className="pointer-events-auto rounded-t-2xl border border-zinc-600/80 bg-[#181b22]/96 px-4 pb-6 pt-5 shadow-2xl backdrop-blur-md">
              <p id="quote-remove-confirm-title" className="text-[16px] font-semibold leading-snug text-white">
                Are you sure you want to delete your quote of this post?
              </p>
              {quoteRepostErr ? (
                <div className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[14px] leading-relaxed text-rose-200 break-words whitespace-pre-wrap">
                  {quoteRepostErr}
                </div>
              ) : null}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={quoteRepostBusy}
                  onClick={() => {
                    if (quoteRepostBusy) return
                    setQuoteRepostModal(null)
                    setQuoteRepostErr('')
                  }}
                  className="min-h-12 flex-1 touch-manipulation rounded-xl border border-zinc-600 bg-zinc-800/90 text-[15px] font-semibold text-zinc-100 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={quoteRepostBusy}
                  onClick={() => void confirmRemoveQuoteRepost()}
                  className="min-h-12 flex-1 touch-manipulation rounded-xl border border-rose-500/50 bg-rose-600 text-[15px] font-semibold text-white hover:bg-rose-500 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
                >
                  {quoteRepostBusy ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : quoteRepostModal ? (
        <div
          className="fixed inset-0 z-[100] flex bg-black/45 px-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quote-repost-sheet-title"
        >
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default touch-manipulation bg-transparent"
            aria-label="Close"
            disabled={quoteRepostBusy}
            onClick={() => {
              if (quoteRepostBusy) return
              setQuoteRepostModal(null)
              setQuoteRepostDraft('')
              setQuoteRepostErr('')
              clearQuoteRepostMedia()
            }}
          />
          <div className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 items-end pointer-events-none">
            <div
              className="pointer-events-auto relative w-full overflow-hidden rounded-t-[36px] border border-zinc-700/40 bg-[#181b22]/92 shadow-[0_6px_16px_rgba(0,0,0,0.12)] backdrop-blur-md"
              style={{ height: 'calc(100dvh - (env(safe-area-inset-top) + 12px))' }}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-4 pb-5 pt-4">
                <div className="relative flex shrink-0 items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={quoteRepostBusy}
                    aria-label="Cancel"
                    onClick={() => {
                      if (quoteRepostBusy) return
                      setQuoteRepostModal(null)
                      setQuoteRepostDraft('')
                      setQuoteRepostErr('')
                      clearQuoteRepostMedia()
                    }}
                    className="pointer-events-auto min-h-12 min-w-[4.75rem] shrink-0 touch-manipulation rounded-full px-3 py-2 text-left text-[15px] font-semibold leading-tight text-zinc-300 hover:bg-zinc-800/90 hover:text-white active:text-white disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
                  >
                    Cancel
                  </button>
                  <div
                    id="quote-repost-sheet-title"
                    className="pointer-events-none absolute left-0 right-0 text-center text-[16px] font-semibold text-white"
                  >
                    Repost
                  </div>
                  <div className="pointer-events-none min-h-12 min-w-[4.75rem] shrink-0" aria-hidden />
                </div>
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-black/4 backdrop-blur-xl"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)',
                }}
              />

              <div
                ref={quoteRepostScrollRef}
                className="relative h-full overscroll-contain overflow-y-auto touch-pan-y"
                style={{
                  WebkitOverflowScrolling: 'touch',
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.92) 28px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 96px), rgba(0,0,0,0.9) calc(100% - 56px), rgba(0,0,0,0) 100%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.92) 28px, rgba(0,0,0,1) 64px, rgba(0,0,0,1) calc(100% - 96px), rgba(0,0,0,0.9) calc(100% - 56px), rgba(0,0,0,0) 100%)',
                }}
              >
                <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[86px]">
                  <>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-600 bg-zinc-900">
                          {composerUserProfile?.avatar_url ? (
                            <img
                              src={composerUserProfile.avatar_url}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                            />
                          ) : !composerAuthResolved ? (
                            <span className="block h-full w-full rounded-full bg-zinc-700/55 animate-pulse" aria-hidden />
                          ) : (
                            <span
                              className={`flex h-full w-full items-center justify-center text-[14px] font-bold text-white ${avatarToneClass(
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
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="mt-0.5 flex min-h-[6.5rem] flex-col">
                            <div className="grid min-h-[2.75rem] max-h-[min(50vh,22rem)] shrink-0 grid-cols-1 grid-rows-1 sm:min-h-[3rem] [&>*]:col-start-1 [&>*]:row-start-1">
                              <div
                                ref={quoteRepostMirrorRef}
                                aria-hidden
                                className="pointer-events-none min-h-[2.75rem] max-h-[min(50vh,22rem)] w-full overflow-y-auto whitespace-pre-wrap break-words px-0 py-0 pt-[10px] text-left text-[17px] leading-[1.25] text-zinc-100 [overflow-wrap:anywhere] [scrollbar-width:none] [-ms-overflow-style:none] sm:min-h-[3rem] sm:pt-[13px] [&::-webkit-scrollbar]:hidden"
                              >
                                {quoteRepostDraft ? (
                                  quoteRepostDraft
                                ) : (
                                  <span className="text-zinc-500">Add a comment</span>
                                )}
                              </div>
                              <textarea
                                ref={quoteRepostTextareaRef}
                                value={quoteRepostDraft}
                                onChange={(e) => setQuoteRepostDraft(e.target.value)}
                                onScroll={(e) => {
                                  const m = quoteRepostMirrorRef.current
                                  if (m) m.scrollTop = e.currentTarget.scrollTop
                                }}
                                maxLength={280}
                                className="z-10 min-h-[2.75rem] max-h-[min(50vh,22rem)] w-full resize-none touch-manipulation overflow-y-auto bg-transparent px-0 py-0 pt-[10px] text-[17px] leading-[1.25] text-transparent caret-white outline-none selection:bg-cyan-500/25 focus:outline-none focus:ring-0 sm:min-h-[3rem] sm:pt-[13px]"
                                placeholder=""
                                aria-label="Quote for repost"
                              />
                            </div>
                            <input
                              ref={quoteRepostMediaInputRef}
                              type="file"
                              accept="image/*,video/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                const input = e.target
                                const files = Array.from(input.files || [])
                                if (!files.length) return
                                setQuoteRepostErr('')
                                const hasVideo = files.some((f) => isProbablyVideoFile(f))
                                if (hasVideo) {
                                  const vf = files.find((f) => isProbablyVideoFile(f))
                                  if (!vf) {
                                    try {
                                      input.value = ''
                                    } catch {
                                      // ignore
                                    }
                                    return
                                  }
                                  setQuoteRepostImageItems((prev) => {
                                    for (const it of prev) {
                                      try {
                                        URL.revokeObjectURL(it.preview)
                                      } catch {
                                        // ignore
                                      }
                                    }
                                    return []
                                  })
                                  cancelQuoteRepostMediaPrep()
                                  setQuoteRepostMediaUrl('')
                                  try {
                                    input.value = ''
                                  } catch {
                                    // ignore
                                  }
                                  void queueLoungeVideoOrCrop(vf, 'quote')
                                  return
                                }
                                const bad = files.some((f) => !isProbablyImageFile(f))
                                if (bad) {
                                  setQuoteRepostErr('Unsupported media type. Please choose an image or video file.')
                                  try {
                                    input.value = ''
                                  } catch {
                                    // ignore
                                  }
                                  return
                                }
                                cancelQuoteRepostMediaPrep()
                                setQuoteRepostMediaUrl('')
                                const prevImgs = quoteRepostImageItemsRef.current
                                const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
                                quoteRepostImageItemsRef.current = next
                                setQuoteRepostImageItems(next)
                                if (limitDialog) setLoungeImageLimitDialog(limitDialog)
                                try {
                                  input.value = ''
                                } catch {
                                  // ignore
                                }
                              }}
                            />
                            {(() => {
                              const gifUrl = String(quoteRepostMediaUrl || '').trim()
                              const imageUrls = quoteRepostImageItems.map((x) => x.preview)
                              const carouselUrls = gifUrl ? [...imageUrls, gifUrl] : imageUrls
                              if (carouselUrls.length === 0) return null
                              const nImg = quoteRepostImageItems.length
                              return (
                                <LoungeImageCarousel
                                  urls={carouselUrls}
                                  variant="composer"
                                  firstMarginTopClass="mt-1.5"
                                  regionAriaLabel={gifUrl ? 'Quote images and GIF' : 'Quote images'}
                                  removeLabelForIndex={(i) => (i < nImg ? 'Remove image' : 'Remove GIF')}
                                  onRemoveIndex={(i) => {
                                    if (i < nImg) {
                                      setQuoteRepostImageItems((prev) => {
                                        const row = prev[i]
                                        if (row?.preview) {
                                          try {
                                            URL.revokeObjectURL(row.preview)
                                          } catch {
                                            // ignore
                                          }
                                        }
                                        return prev.filter((_, j) => j !== i)
                                      })
                                    } else {
                                      setQuoteRepostMediaUrl('')
                                    }
                                  }}
                                />
                              )
                            })()}
                            {quoteRepostVideoSlot ? (
                              <div className="relative mt-1.5 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                                {!quoteRepostVideoSlot.file && quoteRepostVideoSlot.preview ? (
                                  <img
                                    src={quoteRepostVideoSlot.preview}
                                    alt=""
                                    className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                                  />
                                ) : quoteRepostVideoSlot.preview ? (
                                  <video
                                    src={quoteRepostVideoSlot.preview}
                                    poster={quoteRepostVideoSlot.posterUrl || undefined}
                                    className="block h-auto max-h-52 w-auto max-w-[min(78vw,18rem)] object-contain"
                                    controls
                                    playsInline
                                    preload="metadata"
                                    aria-label="Video preview"
                                  />
                                ) : null}
                                <button
                                  type="button"
                                  disabled={quoteRepostBusy}
                                  onClick={() => {
                                    cancelQuoteRepostMediaPrep()
                                  }}
                                  className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55 disabled:opacity-45"
                                  aria-label="Remove video"
                                  title="Remove video"
                                >
                                  ×
                                </button>
                              </div>
                            ) : null}
                            <div className="min-h-0 flex-1" aria-hidden />
                          </div>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-zinc-700/70 pt-1.5 pb-1">
                        <div className="flex h-10 shrink-0 items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={quoteRepostBusy}
                            onClick={() => quoteRepostMediaInputRef.current?.click()}
                            className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
                            title="Add media"
                            aria-label="Add media"
                          >
                            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <rect
                                x="3.75"
                                y="3.75"
                                width="12.5"
                                height="12.5"
                                rx="2"
                                fill="currentColor"
                                fillOpacity="0.14"
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
                              <circle cx="8" cy="8" r="1" fill="currentColor" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            disabled={quoteRepostBusy}
                            onClick={() => {
                              if (quoteRepostBusy) return
                              if (openProfileGateIfNeeded()) return
                              setKlipyPickerTarget('quote')
                              setKlipyPickerOpen(true)
                            }}
                            className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 disabled:opacity-45 [-webkit-tap-highlight-color:transparent]"
                            title="Add GIF (Klipy)"
                            aria-label="Add GIF"
                          >
                            <svg className="h-8 w-8" viewBox="0 0 20 20" fill="none" aria-hidden>
                              <rect
                                x="3.75"
                                y="3.75"
                                width="12.5"
                                height="12.5"
                                rx="2"
                                fill="currentColor"
                                fillOpacity="0.14"
                                stroke="currentColor"
                                strokeWidth="1.35"
                              />
                              <text
                                x="10"
                                y="12.85"
                                textAnchor="middle"
                                fill="currentColor"
                                style={{ fontSize: '5.35px', fontWeight: 800, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}
                              >
                                GIF
                              </text>
                            </svg>
                          </button>
                        </div>
                        <div className="flex min-w-0 grow basis-[min(100%,14rem)] flex-wrap items-center justify-end gap-2">
                          <span
                            className={`shrink-0 text-[12px] tabular-nums ${loungeCharCounterClass(quoteRepostDraft.length)}`}
                          >
                            {quoteRepostDraft.length}/280
                          </span>
                          <button
                            type="button"
                            disabled={
                              quoteRepostBusy ||
                              loungePostSubmitInFlight ||
                              loungeQuoteRepostVideoPostBlocked ||
                              loungePostUploadFailedOpen ||
                              loungeVideoCrop != null ||
                              (!normalizeFeedCaption(quoteRepostDraft) &&
                                quoteRepostImageItems.length === 0 &&
                                !String(quoteRepostMediaUrl || '').trim() &&
                                !quoteRepostVideoSlot)
                            }
                            aria-label={quoteRepostBusy ? 'Posting' : 'Post quote repost'}
                            aria-busy={quoteRepostBusy}
                            title={quoteRepostBusy ? 'Posting…' : undefined}
                            onClick={() => void submitQuoteRepost()}
                            className={`shrink-0 touch-manipulation rounded-lg border px-2.5 text-center text-[12px] font-semibold leading-tight transition-colors disabled:opacity-45 [-webkit-tap-highlight-color:transparent] ${
                              quoteRepostBusy ? 'min-h-10 min-w-[6.5rem] py-2' : 'min-h-8 py-1'
                            } ${
                              (normalizeFeedCaption(quoteRepostDraft) ||
                                quoteRepostImageItems.length > 0 ||
                                !!String(quoteRepostMediaUrl || '').trim() ||
                                quoteRepostVideoSlot) &&
                              !quoteRepostBusy &&
                              !loungePostSubmitInFlight &&
                              !loungeQuoteRepostVideoPostBlocked &&
                              !loungePostUploadFailedOpen &&
                              loungeVideoCrop == null
                                ? 'border-emerald-400/70 bg-emerald-500 text-white hover:bg-emerald-400'
                                : 'border-zinc-600 bg-zinc-800/90 text-zinc-500'
                            }`}
                          >
                            {quoteRepostBusy ? 'Posting…' : 'Post'}
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-start gap-3">
                        <div className="mt-0.5 h-10 w-10 shrink-0" aria-hidden />
                        <div className="min-w-0 flex-1">
                          {(() => {
                            const orig = quoteRepostModal.original
                            if (!orig?.id) return null
                            return (
                              <div
                                role="figure"
                                aria-label="Quoted post preview"
                                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit"
                              >
                                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] leading-snug">
                                  <span className="min-w-0 max-w-[min(11rem,42vw)] truncate font-semibold text-zinc-200 sm:max-w-[13rem]">
                                    {displayNameFor(orig)}
                                  </span>
                                  <LoungeStaffRoleBadge role={orig?.author_profile?.role} size="detail" />
                                  <LoungeOgBadge isOg={orig?.author_profile?.is_og} size="detail" />
                                  <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[14px] text-zinc-500">
                                    <span className="min-w-0 max-w-[min(9rem,36vw)] truncate sm:max-w-[11rem]">{handleFor(orig)}</span>
                                  </span>
                                  {orig.pinned ? (
                                    <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                                      Pinned
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                                  {renderRichCaption(feedPostDisplayCaption(orig))}
                                </div>
                                <LoungePostFeedImagesAndGif
                                  post={orig}
                                  variant="embed"
                                  firstMarginTopClass="mt-2"
                                  visibilityResetRootRef={quoteRepostScrollRef}
                                  renderMediaLightboxFooter={renderQuoteModalMediaLightboxFooter}
                                />
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                      {quoteRepostErr ? (
                        <div className="mt-2 rounded-2xl border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[14px] leading-relaxed text-rose-200 break-words whitespace-pre-wrap">
                          {quoteRepostErr}
                        </div>
                      ) : null}
                    </>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <KlipyGifPicker
        open={klipyPickerOpen}
        onClose={() => setKlipyPickerOpen(false)}
        onPick={handleKlipyGifPicked}
        supabaseClient={supabaseClient}
      />

      {loungeImageLimitDialog && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="lounge-image-limit-msg"
            >
              <button
                type="button"
                className="absolute inset-0 z-0 cursor-default touch-manipulation"
                aria-label="Dismiss"
                onClick={() => setLoungeImageLimitDialog('')}
              />
              <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-600 bg-zinc-900 p-5 shadow-2xl">
                <p id="lounge-image-limit-msg" className="text-[15px] leading-relaxed text-zinc-100">
                  {loungeImageLimitDialog}
                </p>
                <button
                  type="button"
                  onClick={() => setLoungeImageLimitDialog('')}
                  className="mt-4 w-full min-h-11 rounded-xl bg-zinc-100 text-[15px] font-semibold text-zinc-900 touch-manipulation hover:bg-white active:bg-zinc-200 [-webkit-tap-highlight-color:transparent]"
                >
                  OK
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}

      {profileGateOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" role="dialog" aria-modal>
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default"
            aria-label="Close profile gate"
            onClick={() => {
              if (profileGateProvisionalConfirmNeeded) return
              setProfileGateAvatarCropFile(null)
              setProfileGateOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700/85 bg-zinc-950/92 p-5 shadow-2xl backdrop-blur-md">
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
                    onChange={(e) => {
                      const input = e.target
                      const file = input.files?.[0] || null
                      try {
                        input.value = ''
                      } catch {
                        // ignore
                      }
                      if (!file) return
                      if (!isProbablyImageFile(file)) {
                        setProfileGateErr('Please choose an image file.')
                        return
                      }
                      setProfileGateErr('')
                      setProfileGateAvatarCropFile(file)
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
                  setProfileGateAvatarCropFile(null)
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

      <ProfileAvatarCropModal
        open={Boolean(profileGateAvatarCropFile)}
        file={profileGateAvatarCropFile}
        onCancel={onProfileGateAvatarCropCancel}
        onApply={onProfileGateAvatarCropApply}
      />

      {loungePostUploadBar ? (
        <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-[94] border-t border-zinc-700/90 bg-zinc-950/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.35)]">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-zinc-200">
                {loungePostUploadBar.mode === 'mediaPrep' ? 'Uploading media…' : 'Uploading post…'}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-cyan-200/90">
                <span className="font-semibold text-cyan-300/95">Now:</span>{' '}
                {loungePostUploadBar.status || '—'}
              </div>
              {loungePostUploadBar.detail ? (
                <div
                  className={`mt-0.5 text-[11px] leading-snug break-words ${
                    loungePostUploadBar.mode === 'mediaPrep' &&
                    (String(loungePostUploadBar.status || '').toLowerCase() === 'retrying' ||
                      String(loungePostUploadBar.detail || '').toLowerCase().includes('retry') ||
                      String(loungePostUploadBar.detail || '').includes('goblins'))
                      ? 'text-amber-200/90'
                      : 'text-zinc-400'
                  }`}
                >
                  {loungePostUploadBar.detail}
                </div>
              ) : null}
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.round((loungePostUploadBar.progress || 0) * 100)}%` }}
                  role="progressbar"
                  aria-valuenow={Math.round((loungePostUploadBar.progress || 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (loungePostUploadBar.mode === 'mediaPrep' && !loungePostUploadBar.postSubmission) {
                  if (quoteRepostVideoSlotRef.current?.prepStatus === 'preparing') {
                    cancelQuoteRepostMediaPrep()
                  } else {
                    cancelComposerMediaPrep()
                  }
                } else {
                  cancelLoungePostUpload()
                }
              }}
              aria-label="Cancel upload"
              className="shrink-0 touch-manipulation bg-transparent px-1 py-1 text-[14px] font-semibold text-cyan-400 hover:text-cyan-300 [-webkit-tap-highlight-color:transparent]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {loungeVideoCrop ? (
        <LoungeVideoCropModal
          file={loungeVideoCrop.file}
          knownDurationSec={loungeVideoCrop.knownDurationSec}
          intent={loungeVideoCrop.mode === 'detail' ? 'detail' : 'composer'}
          onCancel={() => {
            if (loungeVideoCrop.mode === 'detail') {
              setLoungeDetailEditMediaFile(null)
              setLoungeDetailEditMediaKind('')
            }
            setLoungeVideoCrop(null)
          }}
          onConfirm={(result) => {
            if (loungeVideoCrop.mode === 'composer' || loungeVideoCrop.mode === 'quote') {
              const startPrep = loungeVideoCrop.mode === 'quote' ? startQuoteRepostVideoPrepFromSpec : startComposerVideoPrepFromSpec
              const disposeSlot =
                loungeVideoCrop.mode === 'quote'
                  ? () => disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
                  : () => disposeComposerVideoMedia(composerVideoSlotRef.current)
              if (result instanceof File) {
                disposeSlot()
                const previewUrl = URL.createObjectURL(result)
                startPrep(
                  { kind: 'direct', file: result },
                  { file: result, posterUrl: null, preview: previewUrl, streamVideoUid: null },
                )
                if (loungeVideoCrop.mode === 'quote') setQuoteRepostMediaUrl('')
                else setComposerMediaUrl('')
              } else if (result && typeof result === 'object' && result.type === 'composerTrimJob') {
                disposeSlot()
                const spec = {
                  kind: 'trim',
                  sourceFile: result.sourceFile,
                  startSec: result.startSec,
                  endSec: result.endSec,
                  cropPx: result.cropPx,
                  intrinsicWidth: result.intrinsicWidth,
                  intrinsicHeight: result.intrinsicHeight,
                }
                startPrep(spec, {
                  file: null,
                  posterUrl: result.posterUrl,
                  preview: result.posterUrl,
                  streamVideoUid: null,
                })
                if (loungeVideoCrop.mode === 'quote') setQuoteRepostMediaUrl('')
                else setComposerMediaUrl('')
              }
            } else if (result instanceof File) {
              setLoungeDetailEditMediaFile(result)
              setLoungeDetailEditMediaKind('video')
            }
            setLoungeVideoCrop(null)
          }}
        />
      ) : null}

      {loungePostUploadFailedOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px] sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lounge-upload-failed-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default touch-manipulation bg-transparent"
            aria-label="Close"
            onClick={() => onLoungePostUploadFailureCancel()}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/85 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-md">
            <h2 id="lounge-upload-failed-title" className="text-[17px] font-bold text-white">
              {loungePostUploadFailureDetails?.kind === 'mediaPrep' ? 'Media upload failed' : 'Upload failed'}
            </h2>
            {loungePostUploadFailureDetails ? (
              <div className="mt-3 space-y-2 rounded-xl border border-zinc-700/70 bg-zinc-900/80 px-3 py-2.5 text-left">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Last step</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-zinc-200 break-words">
                    {loungePostUploadFailureDetails.phase}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What failed</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-rose-200/95 break-words whitespace-pre-wrap">
                    {loungePostUploadFailureDetails.message}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                onClick={() => retryLoungePostUpload()}
                className="min-h-11 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 touch-manipulation sm:order-1"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => onLoungePostUploadSaveDraft()}
                className="min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-2"
              >
                Save as draft
              </button>
              <button
                type="button"
                onClick={() => onLoungePostUploadFailureCancel()}
                className="min-h-11 rounded-xl bg-zinc-800 px-4 text-[15px] font-semibold text-zinc-100 hover:bg-zinc-700 touch-manipulation sm:order-3"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
