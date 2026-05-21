import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react'
import { createPortal, flushSync } from 'react-dom'
import {
  checkProfileHandleAvailability,
  fetchOwnProfile,
  formatProfileSaveDebugError,
  handleSlugFromAtInput,
  isProfileHandleUniqueViolation,
  normalizeHandle,
  profileAvatarInitials,
  profileAvatarToneClass,
  profileSeedFromUser,
  saveProfileWithHandleFallback,
  suggestAvailableProfileHandle,
  uploadProfileAvatar,
} from '../profiles/profileGate'
import ProfileHandleConflictDialog from '../profiles/ProfileHandleConflictDialog.jsx'
import { adminSetProfileRole } from '../profiles/adminSetProfileRole.js'
import {
  collectLoungePostInteractionHydrateIds,
  communityFeedPlainRepostInsertPayload,
  communityFeedCommentRepostInsertPayload,
  deleteLoungeFeedMediaFromPublicUrl,
  collectLoungeFeedStoredMediaUrls,
  feedPostAuthorEditMediaSeed,
  feedPostDisplayCaption,
  feedPostMediaUpdatePayload,
  feedPostStreamVideoUid,
  normalizeFeedCaption,
} from '../../utils/communityFeedPost'
import {
  feedCommentAuthorEditMediaSeed,
  feedCommentRowHasMedia,
  feedCommentStreamVideoUid,
  bumpFeedCommentAncestorCountsInList,
  feedCommentAncestorIdsAfterRemoval,
  feedCommentDescendantCountById,
} from '../../utils/communityFeedComment.js'
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
  buildLoungeProfileShareUrl,
  isLoungePostShareId,
  isLoungeProfileHandleSlug,
  LOUNGE_SINGLE_POST_SELECT,
  parseLoungeProfilePathHandle,
  shareLoungePostHybrid,
  stripLoungePostQueryParam,
  stripLoungeProfileShareFromUrl,
} from '../../utils/loungeSharePost'
import {
  isLoungeActivitySchemaMissingError,
  loungeActivityUnreadCount,
} from '../../utils/loungeActivityApi.js'
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
import { markLoungeColdBootFeedMounted } from '../../utils/loungeColdBootFeedMounted.js'
import { setLoungeColdBootPendingWork } from '../../utils/loungeColdBootPendingWork.js'
import {
  executeLoungeCommunityPostSubmission,
  loungeSubmissionSnapshotIncludesVideo,
} from './loungePostSubmitJob'
import { executeLoungeCommentSubmission } from './loungeCommentSubmitJob.js'
import {
  runComposerStreamVideoPrepWithRetries,
  uploadEncodedVideoToCfStreamWithRetries,
} from './loungeComposerVideoPrep.js'
import {
  awaitQueuedVideoPrepForJob,
  resolveLoungeSubmissionVideoPrep,
  snapshotNeedsBackgroundVideoPrep,
  startParallelQueuedVideoPrep,
  startParallelQueuedVideoPrepForWaitingJobs,
} from './loungeQueuedVideoPrep.js'
import {
  formatCompactStatCount,
  fullStatCountTitle,
  loungeInteractionStatCountCellClass,
} from '../../utils/formatCompactStatCount.js'
import { composerStableInitialsFromUid, formatLoungePostDetailWhen } from './loungeFormat'
import { renderRichCaption } from './loungeCaption'
import { useMentionState } from './loungeMentionAutocomplete'
import LoungeMentionDropdown from './LoungeMentionDropdown'
import { LoungeImageCarousel, LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungePostArticle from './LoungePostArticle'
import {
  LoungeStreamLightboxProvider,
  buildLoungeStreamLightboxCtxFromPostCardProps,
} from './LoungeStreamLightboxContext.jsx'
import { isFeedCommentEntity, loungeStreamLightboxMediaSource } from './loungeStreamLightboxRenderers.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import { LoungeInteractionGlyphRail } from './LoungeInteractionGlyphRail.jsx'
import {
  LoungeFeedAutoplayPostsKick,
  LoungeFeedInlineSoundResetBinder,
  LoungeFeedCoordinatorSuspendBinder,
  LoungeFeedVideoAutoplayProvider,
} from './LoungeFeedVideoAutoplayContext.jsx'
import {
  getLoungeStreamLightboxOpen,
  subscribeLoungeStreamLightboxOpen,
} from './loungeStreamLightboxRegistry.js'
import { pauseAllLoungeStreamInlineVideos } from '../../utils/loungeStreamInlineVideoControl.js'
import LoungeProfileFullScreen from './LoungeProfileFullScreen'
import {
  fetchLoungeProfilePosts,
  fetchLoungeProfileRow,
  loadLoungeProfileScreenPostsRemainder,
  LOUNGE_PROFILE_POST_INITIAL_LIMIT,
} from './loungeProfileScreenLoad.js'
import ProfileAvatarCropModal from './ProfileAvatarCropModal'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import LoungeVideoCropModal from './LoungeVideoCropModal.jsx'
import {
  loungeSubmitSnapshotBlobUrls,
  pinLoungeStreamSessionPoster,
  releaseLoungeStreamSessionPoster,
} from './loungeStreamSessionPoster.js'
import KlipyGifPicker from './KlipyGifPicker.jsx'
import EdgeLogoWithEasterEgg from '../../components/EdgeLogoWithEasterEgg.jsx'
import TitleBarStatusLine from '../../components/TitleBarStatusLine.jsx'
// LOUNGE_DOCK_FOOTER_BAR_DISABLED — classic dock icon row (FAB wheel is primary nav). Re-enable import + JSX below to restore.
// import LoungeDockFooterBar from '../../components/LoungeDockFooterBar.jsx'
import LoungeDockArcCarouselPrototype from '../../components/LoungeDockArcCarouselPrototype.jsx'
import {
  blurLoungeComposerCaption,
  focusLoungeComposerCaption,
  invokeLoungeComposerCaptionKeyboard,
  LOUNGE_COMPOSER_FOCUS_AFTER_MEDIA_DELAYS_MS,
  scheduleLoungeComposerTextareaFocus,
} from './loungeDockComposeFocus.js'
import { buildLoungeDockArcCarouselItems } from '../../components/loungeDockArcCarouselItems.jsx'
import { dockChromeHeightFromTitleBarPx } from '../../utils/loungeDockChrome.js'
import {
  LOUNGE_DOCK_MENU_LAYOUT_KEY,
  readLoungeDockMenuLayout,
  writeLoungeDockMenuLayout,
} from '../../utils/loungeDockFabPosition.js'
import {
  loungeTitleRevealAfterScrollStep,
  loungeTitleRevealClampScrollDelta,
} from '../../utils/loungeTitleRevealScroll.js'
import LoungeDockSlidePanels from '../../components/LoungeDockSlidePanels.jsx'
import LoungePostCommentThread from './LoungePostCommentThread.jsx'
import {
  LOUNGE_COMMENT_DETAIL_THREAD_PAD,
  LOUNGE_FEED_AVATAR_CLASS,
  LOUNGE_FEED_CAPTION_TEXT_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_DETAIL_CLASS,
  LOUNGE_FEED_POST_DETAIL_AUTHOR_BLOCK_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_SEPARATOR_CLASS,
  LOUNGE_FEED_POST_ROW_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_ROW_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_SECTION_CLASS,
  LOUNGE_FEED_POST_DETAIL_INTERACTIONS_WRAP_CLASS,
  LOUNGE_FEED_POST_DETAIL_HANDLE_TIME_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_ROW_CLASS,
  LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS,
} from './loungeFeedAvatar.js'
import LoungePostDetailCommentSort from './LoungePostDetailCommentSort.jsx'
import LoungePostDetailCommentHierarchy from './LoungePostDetailCommentHierarchy.jsx'
import { readLoungeDetailCommentSort } from '../../utils/loungeFeedCommentSort.js'
import {
  readLoungeFeedVideoAutoplayEnabled,
  subscribeLoungeFeedVideoAutoplayEnabled,
  writeLoungeFeedVideoAutoplayEnabled,
} from '../../utils/loungeFeedVideoAutoplayPref.js'
import {
  readLoungeFeedVideoDebugEnabled,
  subscribeLoungeFeedVideoDebugEnabled,
  writeLoungeFeedVideoDebugEnabled,
} from '../../utils/loungeFeedVideoDebugPref.js'
import { LOUNGE_FEED_SCOPE_ALL, LOUNGE_FEED_SCOPE_FOLLOWING } from '../../utils/loungeFeedScope'
import { LOUNGE_FEED_SORT } from '../../utils/loungeFeedSortPref'
import LoungeFeedSortSwitch from './LoungeFeedSortSwitch.jsx'
import LoungeFeedScopeSwitch from './LoungeFeedScopeSwitch.jsx'
import { LOUNGE_COMMENT_BODY_MAX } from '../../utils/loungeCommentLimits.js'

/** DB raises exception 'MAX_PINNED_POSTS' when a third visible pin is attempted. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

/** Post detail reply composer — collapsed pill copy when empty + expanded textarea placeholder. */
const LOUNGE_DETAIL_COMMENT_PLACEHOLDER = "Post your reply (or don't, nerd)"

const FEED_COMMENT_SELECT_COLS =
  'id,body,created_at,user_id,parent_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at'

/** Root → focused comment ids for post-detail drill / comment-repost deep link. */
function buildFeedCommentDrillPath(commentId, comments) {
  const byId = new Map((comments || []).map((r) => [String(r.id), r]))
  const chain = []
  let cur = byId.get(String(commentId))
  if (!cur) return chain
  while (cur) {
    chain.unshift(String(cur.id))
    const pid = cur.parent_id
    cur = pid != null && pid !== '' && byId.has(String(pid)) ? byId.get(String(pid)) : null
  }
  return chain
}

async function fetchHydratedFeedCommentsForPost(supabaseClient, postId) {
  const { data, error } = await supabaseClient
    .from('feed_comments')
    .select(FEED_COMMENT_SELECT_COLS)
    .eq('post_id', postId)
    .is('hidden_at', null)
    .order('created_at', { ascending: true })
  if (error) throw error
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
  return rows.map((r) => ({ ...r, author_profile: profileBy[r.user_id] || null }))
}

/** Thread ancestor tap — same interactive exclusions as comment/post feed rows. */
function loungePostDetailThreadAncestorClick(e, onNavigate) {
  if (typeof onNavigate !== 'function') return
  const t = e.target
  if (!(t instanceof Element)) return
  if (
    t.closest(
      'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-badge-tip], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-original-embed], [data-lounge-post-interaction-bar]',
    )
  ) {
    return
  }
  onNavigate()
}

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

const LOUNGE_COMPOSER_MEDIA_INPUT_ID = 'lounge-composer-media-input'
const LOUNGE_DETAIL_COMMENT_MEDIA_INPUT_ID = 'lounge-detail-comment-media-input'
const LOUNGE_QUOTE_REPOST_MEDIA_INPUT_ID = 'lounge-quote-repost-media-input'

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
  loungeFeedSort = LOUNGE_FEED_SORT.LATEST,
  onLoungeFeedSortChange,
  loungeFeedBrowseMode = 'member',
  /** True only when the Lounge tab is the active/visible screen; gates the portaled dock FAB. */
  isActivePage = true,
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
  const [composerFocusToken, setComposerFocusToken] = useState(0)
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
  const loungeUploadBarRef = useRef(null)
  /** Last step label when a background submission throws (paired with `loungePostUploadFailureDetails`). */
  const loungePostUploadLastPhaseRef = useRef('')
  /** Set on failed background submission for the retry modal. */
  const [loungePostUploadFailureDetails, setLoungePostUploadFailureDetails] = useState(null)
  /** True while any background lounge post submission is running (kept for bar visibility; no longer gates submit buttons). */
  const [loungePostSubmitInFlight, setLoungePostSubmitInFlight] = useState(false)
  const [loungePostUploadFailedOpen, setLoungePostUploadFailedOpen] = useState(false)
  const loungePostSnapshotRef = useRef(null)
  const loungePostAbortRef = useRef(null)
  /** True while a background lounge post job may be in flight (guards double submit). */
  const loungePostJobRunningRef = useRef(false)
  /** Video-only submission queue — text/image/GIF use the fast lane (parallel). */
  const loungeSubmitQueueRef = useRef(
    /** @type {Array<{id:string,type:string,snapshot:object,videoPrep?:import('./loungeQueuedVideoPrep.js').LoungeQueuedVideoPrepSlot}>} */ ([]),
  )
  /** True while the video queue drain loop is actively running. */
  const loungeSubmitQueueRunningRef = useRef(false)
  /** Monotonic batch counters for "Post X of Y" bar display (video jobs only). */
  const loungeSubmitQueueBatchRef = useRef({ total: 0, completed: 0 })
  /** Parallel fast-lane submits (no Stream video) in flight. */
  const loungeFastLaneInFlightRef = useRef(0)
  /** Fast-lane failure deferred while a video job owns the upload failure modal. */
  const loungePendingFastLaneFailureRef = useRef(
    /** @type {{ kind: 'post' | 'comment', snapshot: object, phase: string, message: string } | null} */ (null),
  )
  /** Ref-count for `loungePostSubmitInFlight` across fast-lane + video jobs. */
  const loungeSubmitInFlightCountRef = useRef(0)
  /** React state mirror of batch counters so the bar header re-renders. */
  const [loungeSubmitQueueDisplay, setLoungeSubmitQueueDisplay] = useState({ index: 0, total: 0 })
  /** Snapshot + abort for background post-detail reply submission (same pattern as feed composer). */
  const loungeDetailCommentSnapshotRef = useRef(null)
  const loungeDetailCommentAbortRef = useRef(null)
  const loungeDetailCommentJobRunningRef = useRef(false)
  /** Patched after definitions so early `submitQuoteRepost` can call `clearQuoteRepostForPostAttempt` / `runBackgroundLoungePostSubmission` without reordering hooks. */
  const clearQuoteRepostForPostAttemptRef = useRef(/** @type {(opts?: { preserveQuoteVideoPrep?: boolean }) => void} */ (() => {}))
  const runBackgroundLoungePostSubmissionRef = useRef(/** @type {(jobOrSnapshot: unknown) => void} */ (() => {}))
  const runBackgroundLoungeDetailCommentSubmissionRef = useRef(
    /** @type {(jobOrSnapshot: unknown) => void} */ (() => {}),
  )
  /** Stable ref so early submit callbacks can call the enqueue function before its useCallback is defined. */
  const enqueueAndRunLoungeSubmitRef = useRef(/** @type {(type: string, snapshot: object) => void} */ (() => {}))
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
  const [profileGateHandleConflict, setProfileGateHandleConflict] = useState(null)
  const [profileGateDisplayName, setProfileGateDisplayName] = useState('')
  const [profileGateAvatarFile, setProfileGateAvatarFile] = useState(null)
  const [profileGateAvatarPreview, setProfileGateAvatarPreview] = useState('')
  /** Raw pick before crop modal (Complete your profile). */
  const [profileGateAvatarCropFile, setProfileGateAvatarCropFile] = useState(null)
  const profileGateAvatarInputRef = useRef(null)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [profileModalVisible, setProfileModalVisible] = useState(true)
  const profileModalVisibleRef = useRef(true)
  const profileModalCloseFallbackTimerRef = useRef(0)
  const profileModalLoadGenRef = useRef(0)
  /** `closeProfileModal` is defined later; dock Home uses this ref. */
  const closeProfileModalRef = useRef(() => {})
  /** `finalizeProfileModalClose` is defined later; dock compose dismisses profile without animation wait. */
  const finalizeProfileModalCloseRef = useRef(() => {})
  const [profileModalLoading, setProfileModalLoading] = useState(false)
  const [profileModalErr, setProfileModalErr] = useState('')
  const [profileModalData, setProfileModalData] = useState(null)
  const [profileModalPosts, setProfileModalPosts] = useState([])
  /** Profiles opened from feed/detail/profile without replacing the root sheet (back pops one layer). */
  const [profileOverlayStack, setProfileOverlayStack] = useState([])
  /** Root profile sits above Stream hero lightbox (z ~103+) while closing video behind the sheet. */
  const [profileStackAboveStreamLightbox, setProfileStackAboveStreamLightbox] = useState(false)
  /** Scroll-linked FAB reveal while profile sheet is open. */
  const [loungeProfileDockReveal, setLoungeProfileDockReveal] = useState(1)
  const [interactionByPost, setInteractionByPost] = useState({})
  const [bookmarkedByPost, setBookmarkedByPost] = useState({})
  const interactionByPostRef = useRef(interactionByPost)
  interactionByPostRef.current = interactionByPost
  const bookmarkedByPostRef = useRef(bookmarkedByPost)
  bookmarkedByPostRef.current = bookmarkedByPost
  const [interactionByComment, setInteractionByComment] = useState({})
  const [bookmarkedByComment, setBookmarkedByComment] = useState({})
  const interactionByCommentRef = useRef(interactionByComment)
  interactionByCommentRef.current = interactionByComment
  const bookmarkedByCommentRef = useRef(bookmarkedByComment)
  bookmarkedByCommentRef.current = bookmarkedByComment
  const bookmarksMigratedFromLocalRef = useRef(false)
  /** Maps original post id → this user's plain-repost row id (for undo). */
  const plainRepostChildIdRef = useRef({})
  /** Maps original post id → this user's quote-repost row id (for remove). */
  const quoteRepostChildIdRef = useRef({})
  const [composerDiscardPromptOpen, setComposerDiscardPromptOpen] = useState(false)
  const [loungeDetailRepostMenuOpen, setLoungeDetailRepostMenuOpen] = useState(false)
  const loungeDetailRepostMenuRef = useRef(null)
  const loungePostDetailScrollRef = useRef(null)
  const loungePostDetailPostAvatarRef = useRef(null)
  const loungePostDetailCommentConnectorRef = useRef(null)
  const loungeDetailCommentTextareaRef = useRef(null)
  const loungeDetailCommentDraftRef = useRef('')
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
  const [loungeDetailCommentQueuedToast, setLoungeDetailCommentQueuedToast] = useState(false)
  const loungeDetailCommentQueuedToastTimerRef = useRef(0)
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
  const loungeDetailCommentIdsKey = useMemo(
    () =>
      loungeDetailComments
        .map((r) => r.id)
        .filter(Boolean)
        .sort()
        .join('\0'),
    [loungeDetailComments],
  )
  /** Own just-posted comment ids — prepended at top of post-detail list for this viewer only. */
  const [loungeDetailViewerPinnedCommentIds, setLoungeDetailViewerPinnedCommentIds] = useState([])
  const [loungeDetailCommentSort, setLoungeDetailCommentSort] = useState(() => readLoungeDetailCommentSort())
  const [loungeDetailFollowingUserIds, setLoungeDetailFollowingUserIds] = useState([])
  /** Set of user IDs the viewer follows — drives the follow pill on feed/profile cards. */
  const [loungeFollowingUserIds, setLoungeFollowingUserIds] = useState(() => new Set())
  const [loungeDetailCommentDraft, setLoungeDetailCommentDraft] = useState('')
  const [loungeDetailCommentErr, setLoungeDetailCommentErr] = useState('')
  /** Mirrors feed composer: collapsed one-line affordance → expanded textarea + toolbar. */
  const [loungeDetailCommentComposerExpanded, setLoungeDetailCommentComposerExpanded] = useState(false)
  const [loungeDetailCommentDiscardPromptOpen, setLoungeDetailCommentDiscardPromptOpen] = useState(false)
  /** iOS / visualViewport: lift footer above software keyboard. */
  const [loungeDetailCommentKbOverlapPx, setLoungeDetailCommentKbOverlapPx] = useState(0)
  const [loungeDetailCommentImageItems, setLoungeDetailCommentImageItems] = useState([])
  const [loungeDetailCommentMediaUrl, setLoungeDetailCommentMediaUrl] = useState('')
  const [loungeDetailCommentVideoSlot, setLoungeDetailCommentVideoSlot] = useState(null)
  const loungeDetailCommentImageItemsRef = useRef(loungeDetailCommentImageItems)
  const loungeDetailCommentMediaUrlRef = useRef('')
  /** True while native picker / probe / crop is in flight — blocks blur from collapsing the reply composer early. */
  const loungeDetailCommentMediaSessionRef = useRef(false)
  /** Which composer has the iOS file/photo sheet or gallery open (`null` when idle). */
  const loungeComposerMediaPickerTargetRef = useRef(
    /** @type {null | 'composer' | 'detailComment' | 'quote'} */ (null),
  )
  const loungeDetailCommentVideoSlotRef = useRef(null)
  const loungeDetailCommentMediaInputRef = useRef(null)
  const loungeDetailCommentVideoPrepJobIdRef = useRef(0)
  const loungeDetailCommentVideoPrepAbortRef = useRef(null)
  const loungeDetailCommentVideoPrepSpecRef = useRef(null)
  const loungeDetailCommentVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const loungeDetailCommentVideoPrepHandoffRef = useRef(null)
  /** Set by profile Replies tab; cleared after `openLoungeCommentDetail` runs once comments load. */
  const loungePostDetailPendingCommentIdRef = useRef(null)
  /** Profile Replies ⋯ → Edit: open post detail, then start inline edit when comments load. */
  const loungePostDetailPendingCommentEditRef = useRef(null)
  /** Profile Replies interaction bar → reply: focus composer after drill-in. */
  const loungePostDetailPendingCommentComposerRef = useRef(false)
  /**
   * Comment-repost deep link: prefetch comments + path before opening post detail so the first
   * paint is already the Reply screen (not post-only, then drill).
   */
  const loungePostDetailDirectCommentOpenRef = useRef(
    /** @type {null | { postId: string, pathIds: string[], comments: object[], focusComposer?: boolean }} */ (null),
  )
  /** When set, ← at this path depth closes detail instead of popping to post-only view. */
  const loungeCommentDetailDirectEntryDepthRef = useRef(/** @type {null | number} */ (null))
  /** One-shot: smooth scroll from top when opening comment detail from profile / repost / deep link. */
  const loungeCommentDetailDirectEntryAnimateRef = useRef(false)
  const loungePostDetailFocusScrollRafRef = useRef(0)
  /** While smooth-scrolling to a focused comment, ignore scroll-driven title hide until landed. */
  const loungePostDetailFocusScrollTitleLockRef = useRef(false)
  /** Tracks which post the detail-comments effect last initialized (avoids clearing drill path on auth refresh). */
  const loungeDetailCommentsEffectPostIdRef = useRef(/** @type {null | string} */ (null))
  /** Post id whose comments finished loading — Strict Mode retry when unset after cancel. */
  const loungeDetailCommentsLoadedPostIdRef = useRef(/** @type {null | string} */ (null))
  const [loungeDetailCommentEditImageUrls, setLoungeDetailCommentEditImageUrls] = useState([])
  const [loungeDetailCommentEditGifUrl, setLoungeDetailCommentEditGifUrl] = useState('')
  /** Drill-down into a comment thread (`slice(-1)` = composer reply parent). */
  const [loungeCommentDetailPathIds, setLoungeCommentDetailPathIds] = useState([])
  const [loungeDetailCommentEditingId, setLoungeDetailCommentEditingId] = useState(null)
  const [loungeDetailCommentEditDraft, setLoungeDetailCommentEditDraft] = useState('')
  const [loungeDetailCommentEditBusy, setLoungeDetailCommentEditBusy] = useState(false)
  const [loungeDetailCommentDeleteBusyId, setLoungeDetailCommentDeleteBusyId] = useState(null)
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
  const [loungeDockSearchQuery, setLoungeDockSearchQuery] = useState('')
  const [loungeDockSearchQueryVersion, setLoungeDockSearchQueryVersion] = useState(0)
  const [loungeFabPointerBlocked, setLoungeFabPointerBlocked] = useState(false)
  const [loungeDockMenuLayout, setLoungeDockMenuLayout] = useState(() =>
    typeof window !== 'undefined' ? readLoungeDockMenuLayout() : 'wheel',
  )
  const [loungePanelTitleReveal, setLoungePanelTitleReveal] = useState(1)
  /** When set, Chat panel opens a DM with this user (cleared after `open_dm` runs). */
  const [chatDockInitialPeerUserId, setChatDockInitialPeerUserId] = useState(null)
  const [loungeNotificationsUnread, setLoungeNotificationsUnread] = useState(0)
  const [loungeDockFooterHeight, setLoungeDockFooterHeight] = useState(0)
  const [loungePostDetail, setLoungePostDetail] = useState(null)
  /** When true, post detail was opened from profile (likes/bookmarks/posts) and must sit above z-[101] profile chrome. */
  const [loungePostDetailAboveProfile, setLoungePostDetailAboveProfile] = useState(false)
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
  /** False while the detail sheet slide-in is running; focus scroll waits for true. */
  const [loungePostDetailPanelEntered, setLoungePostDetailPanelEntered] = useState(true)
  const loungePostDetailPanelEnteredRef = useRef(true)
  /** If `transitionend` never runs on open, still allow focus scroll (matches close fallback). */
  const loungePostDetailOpenFallbackTimerRef = useRef(0)
  /** If `transitionend` never runs, still tear down the full-screen detail shell (otherwise feed stays dead). */
  const loungePostDetailCloseFallbackTimerRef = useRef(0)
  const loungePostDetailMenuWrapRef = useRef(null)
  const loadMoreSentinelRef = useRef(null)
  const pullStartYRef = useRef(null)
  const pullTriggeredRef = useRef(false)
  const composerMediaInputRef = useRef(null)
  const composerTextareaRef = useRef(null)
  const composerMirrorRef = useRef(null)
  const mentionComposerAnchorRef = useRef(null)
  const mentionDetailCommentAnchorRef = useRef(null)
  const mentionQuoteRepostAnchorRef = useRef(null)
  const loungeDetailEditTextareaRef = useRef(null)
  const loungeDetailEditMirrorRef = useRef(null)
  const loungeDetailEditMediaInputRef = useRef(null)
  const loungeFeedScrollRef = useRef(null)
  /** Bound inside feed `LoungeFeedVideoAutoplayProvider` — reset feed inline sound when opening post detail. */
  const resetFeedInlineSoundRef = useRef(() => {})
  /** Bound inside post-detail `LoungeFeedVideoAutoplayProvider` — reset comment-thread inline sound on close. */
  const resetPostDetailInlineSoundRef = useRef(() => {})
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

  const loungeFeedVideoAutoplayEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoAutoplayEnabled,
    readLoungeFeedVideoAutoplayEnabled,
    () => true,
  )
  const onLoungeFeedVideoAutoplayChange = useCallback((enabled) => {
    writeLoungeFeedVideoAutoplayEnabled(enabled)
  }, [])

  useEffect(() => {
    markLoungeColdBootFeedMounted()
  }, [])

  useEffect(() => {
    const composerBusy =
      postText.trim().length > 0 ||
      composerImageItems.length > 0 ||
      composerVideoSlot != null ||
      String(composerMediaUrl || '').trim().length > 0 ||
      composerVideoSlot?.prepStatus === 'preparing'
    const uploadBusy = loungePostUploadBar != null || loungePostSubmitInFlight
    setLoungeColdBootPendingWork(composerBusy || uploadBusy)
  }, [
    postText,
    composerImageItems,
    composerVideoSlot,
    composerMediaUrl,
    loungePostUploadBar,
    loungePostSubmitInFlight,
  ])

  const loungeFeedVideoDebugEnabled = useSyncExternalStore(
    subscribeLoungeFeedVideoDebugEnabled,
    readLoungeFeedVideoDebugEnabled,
    () => false,
  )
  const onLoungeFeedVideoDebugChange = useCallback((enabled) => {
    writeLoungeFeedVideoDebugEnabled(enabled)
  }, [])

  const loungeFeedVideoDebugHudOnFeed =
    loungeFeedVideoDebugEnabled &&
    !loungePostDetail?.id &&
    loungeDockPanel !== 'search' &&
    !profileModalOpen &&
    profileOverlayStack.length === 0
  const loungeProfileVideoDebugHud =
    loungeFeedVideoDebugEnabled &&
    !loungePostDetail?.id &&
    !loungeDockPanel &&
    (profileModalOpen || profileOverlayStack.length > 0)

  // ── @mention autocomplete — one instance per composer ──────────────────────
  const mentionComposer = useMentionState(postText, supabaseClient, !loungeReadOnly)
  const mentionDetailComment = useMentionState(loungeDetailCommentDraft, supabaseClient, !loungeReadOnly)
  const mentionQuoteRepost = useMentionState(quoteRepostDraft, supabaseClient, !loungeReadOnly)

  const loungeViewerIsStaff = useMemo(() => {
    const r = composerUserProfile?.role
    return r === 'moderator' || r === 'admin'
  }, [composerUserProfile?.role])

  const loungeViewerIsAdmin = useMemo(
    () => String(composerUserProfile?.role || '').toLowerCase() === 'admin',
    [composerUserProfile?.role],
  )

  const chatDockIsStaff = Boolean(isStaff || loungeViewerIsStaff)

  const loungeDetailIsOwn = useMemo(
    () => Boolean(composerUserId && loungePostDetail?.user_id && loungePostDetail.user_id === composerUserId),
    [composerUserId, loungePostDetail?.user_id]
  )

  const loungeDetailShowPostMenu = useMemo(
    () => Boolean(loungePostDetail?.id && !loungeDetailEditing),
    [loungePostDetail?.id, loungeDetailEditing]
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
    onRequireAuth?.()
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

  const scrollLoungeFeedToTopInstant = useCallback(() => {
    const el = loungeFeedScrollRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'auto' })
  }, [])

  const scrollLoungePostDetailToTopInstant = useCallback(() => {
    const el = loungePostDetailScrollRef.current
    if (!el) return
    el.scrollTo({ top: 0, behavior: 'auto' })
    loungePostDetailScrollPrevTopRef.current = 0
    loungePostDetailTitleRevealRef.current = 1
    setLoungePostDetailTitleReveal(1)
  }, [])

  const scrollLoungePostDetailToFocusedComment = useCallback((opts = {}) => {
    const animate =
      opts.animate === true &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches !== true

    const sc = loungePostDetailScrollRef.current
    const el = document.getElementById('lounge-detail-focus-comment')
    if (!sc || !el) return false

    const barH = loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56
    // 4px matches the mt-1 row-separator in LoungePostDetailCommentHierarchy so the title
    // bar lands just at the bottom of the interaction row of the card above the focused comment.
    const GAP_PX = 8

    const computeTargetTop = () => {
      const scRect = sc.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      return Math.max(0, sc.scrollTop + (elRect.top - scRect.top) - barH - GAP_PX)
    }

    const flashFocus = () => {
      el.classList.remove('lounge-focus-flash')
      requestAnimationFrame(() => {
        el.classList.add('lounge-focus-flash')
        window.setTimeout(() => el.classList.remove('lounge-focus-flash'), 1700)
      })
    }

    const landOnTarget = (behavior) => {
      const nextTop = computeTargetTop()
      sc.scrollTo({ top: nextTop, behavior })
      if (behavior === 'smooth') {
        let done = false
        const finish = () => {
          if (done) return
          done = true
          loungePostDetailFocusScrollTitleLockRef.current = false
          loungePostDetailScrollPrevTopRef.current = sc.scrollTop
          loungePostDetailTitleRevealRef.current = 1
          setLoungePostDetailTitleReveal(1)
          flashFocus()
        }
        sc.addEventListener('scrollend', finish, { once: true })
        window.setTimeout(finish, 650)
      } else {
        loungePostDetailScrollPrevTopRef.current = nextTop
        loungePostDetailTitleRevealRef.current = 1
        setLoungePostDetailTitleReveal(1)
        flashFocus()
      }
    }

    if (animate) {
      loungePostDetailFocusScrollTitleLockRef.current = true
      loungePostDetailTitleRevealRef.current = 1
      setLoungePostDetailTitleReveal(1)
      sc.scrollTo({ top: 0, behavior: 'auto' })
      loungePostDetailScrollPrevTopRef.current = 0
      requestAnimationFrame(() => {
        requestAnimationFrame(() => landOnTarget('smooth'))
      })
    } else {
      landOnTarget('auto')
    }
    return true
  }, [loungePostDetailTitleBarHeight])

  const scheduleLoungePostDetailFocusScroll = useCallback(
    (opts = {}) => {
      if (loungePostDetailFocusScrollRafRef.current) {
        window.cancelAnimationFrame(loungePostDetailFocusScrollRafRef.current)
        loungePostDetailFocusScrollRafRef.current = 0
      }
      let triesLeft = 10
      const attempt = () => {
        loungePostDetailFocusScrollRafRef.current = 0
        const ok = scrollLoungePostDetailToFocusedComment(opts)
        if (!ok && triesLeft > 0) {
          triesLeft -= 1
          loungePostDetailFocusScrollRafRef.current = requestAnimationFrame(attempt)
        }
      }
      loungePostDetailFocusScrollRafRef.current = requestAnimationFrame(() => {
        loungePostDetailFocusScrollRafRef.current = requestAnimationFrame(attempt)
      })
    },
    [scrollLoungePostDetailToFocusedComment],
  )

  const loungeComposerCaptionTargetConfig = useCallback(
    (target) => {
      const scrollFeedToTop =
        target === 'detailComment'
          ? scrollLoungePostDetailToTopInstant
          : target === 'composer'
            ? scrollLoungeFeedToTopInstant
            : undefined
      const getTextarea = () => {
        if (target === 'detailComment') return loungeDetailCommentTextareaRef.current
        if (target === 'quote') return quoteRepostTextareaRef.current
        return composerTextareaRef.current
      }
      const isBlocked = () => {
        if (target === 'detailComment') return !loungePostDetail
        if (target === 'quote') {
          return !quoteRepostModal || quoteRepostModal.mode !== 'compose'
        }
        return !composerExpanded
      }
      return { getTextarea, scrollFeedToTop, isBlocked }
    },
    [
      composerExpanded,
      loungePostDetail,
      quoteRepostModal,
      scrollLoungeFeedToTopInstant,
      scrollLoungePostDetailToTopInstant,
    ],
  )

  /** Sync focus while the file-picker user gesture is still active (before previews mount). */
  const focusLoungeComposerCaptionNow = useCallback(
    (target) => {
      if (target === 'detailComment') {
        flushSync(() => {
          setLoungeDetailCommentComposerExpanded(true)
        })
      }
      const { getTextarea } = loungeComposerCaptionTargetConfig(target)
      focusLoungeComposerCaption(getTextarea)
    },
    [loungeComposerCaptionTargetConfig],
  )

  /** Re-open the software keyboard after native/Klipy/crop pickers dismiss (iOS loses focus). */
  const scheduleLoungeComposerCaptionRefocus = useCallback(
    (target, opts = {}) => {
      const { immediate = true, afterMedia = false, skipExpand = false } = opts
      if (target === 'detailComment' && !skipExpand) {
        flushSync(() => {
          setLoungeDetailCommentComposerExpanded(true)
        })
      }
      const { getTextarea, scrollFeedToTop, isBlocked } = loungeComposerCaptionTargetConfig(target)
      if (immediate) {
        invokeLoungeComposerCaptionKeyboard(getTextarea, { scrollFeedToTop })
      }
      return scheduleLoungeComposerTextareaFocus({
        getTextarea,
        scrollFeedToTop,
        isBlocked,
        extraDelaysMs: afterMedia ? LOUNGE_COMPOSER_FOCUS_AFTER_MEDIA_DELAYS_MS : [],
      })
    },
    [loungeComposerCaptionTargetConfig],
  )

  const beginLoungeDetailCommentMediaSession = useCallback(() => {
    loungeDetailCommentMediaSessionRef.current = true
    flushSync(() => {
      setLoungeDetailCommentComposerExpanded(true)
    })
  }, [])

  const endLoungeDetailCommentMediaSession = useCallback(() => {
    loungeDetailCommentMediaSessionRef.current = false
  }, [])

  const beginLoungeComposerMediaPicker = useCallback(
    (target) => {
      loungeComposerMediaPickerTargetRef.current = target
      if (target === 'detailComment') beginLoungeDetailCommentMediaSession()
    },
    [beginLoungeDetailCommentMediaSession],
  )

  const endLoungeComposerMediaPicker = useCallback(
    (target) => {
      if (loungeComposerMediaPickerTargetRef.current === target) {
        loungeComposerMediaPickerTargetRef.current = null
      }
      if (target === 'detailComment') endLoungeDetailCommentMediaSession()
    },
    [endLoungeDetailCommentMediaSession],
  )

  const nudgeLoungeComposerCaptionDuringMediaSheet = useCallback(
    (target) => {
      const { getTextarea } = loungeComposerCaptionTargetConfig(target)
      focusLoungeComposerCaption(getTextarea)
      requestAnimationFrame(() => {
        if (loungeComposerMediaPickerTargetRef.current !== target) return
        focusLoungeComposerCaption(getTextarea)
      })
    },
    [loungeComposerCaptionTargetConfig],
  )

  const loungeFileInputMediaPickerHandlers = useCallback(
    (target) => ({
      onClick: () => {
        beginLoungeComposerMediaPicker(target)
        nudgeLoungeComposerCaptionDuringMediaSheet(target)
      },
      onCancel: () => {
        endLoungeComposerMediaPicker(target)
      },
    }),
    [beginLoungeComposerMediaPicker, endLoungeComposerMediaPicker, nudgeLoungeComposerCaptionDuringMediaSheet],
  )

  const blurLoungeComposerCaptionForTarget = useCallback((target) => {
    const getTextarea = () => {
      if (target === 'detailComment') return loungeDetailCommentTextareaRef.current
      if (target === 'quote') return quoteRepostTextareaRef.current
      return composerTextareaRef.current
    }
    blurLoungeComposerCaption(getTextarea)
    if (target === 'detailComment') setLoungeDetailCommentKbOverlapPx(0)
  }, [])

  const openKlipyPicker = useCallback(
    (target) => {
      if (openProfileGateIfNeeded()) return
      if (target === 'detailComment') beginLoungeDetailCommentMediaSession()
      setKlipyPickerTarget(target)
      blurLoungeComposerCaptionForTarget(target)
      setKlipyPickerOpen(true)
    },
    [beginLoungeDetailCommentMediaSession, blurLoungeComposerCaptionForTarget, openProfileGateIfNeeded],
  )

  const expandAndFocusLoungeDetailCommentComposer = useCallback(({ skipScrollToTop = false } = {}) => {
    if (!skipScrollToTop) scrollLoungePostDetailToTopInstant()
    focusLoungeComposerCaption(() => loungeDetailCommentTextareaRef.current, {
      scrollFeedToTop: skipScrollToTop ? undefined : scrollLoungePostDetailToTopInstant,
    })
    scheduleLoungeComposerCaptionRefocus('detailComment')
  }, [scheduleLoungeComposerCaptionRefocus, scrollLoungePostDetailToTopInstant])

  const restoreLoungeComposerCaptionAfterMediaPick = useCallback(
    (target, applyDomUpdates) => {
      if (applyDomUpdates) flushSync(applyDomUpdates)
      const { getTextarea, scrollFeedToTop, isBlocked } = loungeComposerCaptionTargetConfig(target)
      invokeLoungeComposerCaptionKeyboard(getTextarea, { scrollFeedToTop })
      scheduleLoungeComposerTextareaFocus({
        getTextarea,
        scrollFeedToTop,
        isBlocked,
        extraDelaysMs: LOUNGE_COMPOSER_FOCUS_AFTER_MEDIA_DELAYS_MS,
      })
    },
    [loungeComposerCaptionTargetConfig],
  )

  useEffect(() => {
    loungeDetailCommentDraftRef.current = loungeDetailCommentDraft
  }, [loungeDetailCommentDraft])

  useEffect(() => {
    loungeDetailCommentMediaUrlRef.current = String(loungeDetailCommentMediaUrl || '').trim()
  }, [loungeDetailCommentMediaUrl])

  useEffect(() => {
    if (!loungePostDetail || loungeReadOnly) {
      setLoungeDetailCommentKbOverlapPx(0)
      return undefined
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return undefined
    const sync = () => {
      try {
        const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        setLoungeDetailCommentKbOverlapPx(Number.isFinite(overlap) ? overlap : 0)
      } catch {
        setLoungeDetailCommentKbOverlapPx(0)
      }
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      setLoungeDetailCommentKbOverlapPx(0)
    }
  }, [loungePostDetail, loungeReadOnly])

  useLayoutEffect(() => {
    const ta = loungeDetailCommentTextareaRef.current
    if (!ta || !loungeDetailCommentComposerExpanded || !loungePostDetail) return
    try {
      ta.style.height = 'auto'
      const max = Math.round(Math.min(window.innerHeight * 0.42, 352))
      const lineFloor = 38
      ta.style.height = `${Math.min(Math.max(ta.scrollHeight, lineFloor), max)}px`
    } catch {
      // ignore
    }
  }, [loungeDetailCommentDraft, loungeDetailCommentComposerExpanded, loungePostDetail])

  useEffect(() => {
    if (!composerExpanded || composerFoldReveal < 0.88 || loungeDockPanel) return undefined
    return scheduleLoungeComposerTextareaFocus({
      getTextarea: () => composerTextareaRef.current,
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
  }, [composerExpanded, composerFoldReveal, loungeDockPanel, composerFocusToken, scrollLoungeFeedToTopInstant])

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
    const sync = () => setLoungeDockMenuLayout(readLoungeDockMenuLayout())
    window.addEventListener('loungeDockMenuLayoutChange', sync)
    const onStorage = (e) => {
      if (e.key === LOUNGE_DOCK_MENU_LAYOUT_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('loungeDockMenuLayoutChange', sync)
      window.removeEventListener('storage', onStorage)
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

      if (loungePostDetailFocusScrollTitleLockRef.current) {
        if (loungePostDetailTitleRevealRef.current !== 1) {
          loungePostDetailTitleRevealRef.current = 1
          queueDetailTitleFlush()
        }
        return
      }

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

  const handleShareLoungeProfile = useCallback((profileRow) => {
    const url = buildLoungeProfileShareUrl(profileRow)
    if (!url) return
    void shareLoungePostHybrid({
      url,
      title: 'Edge Lounge profile',
      onCopied: () => setLoungeShareFlash('Link copied to clipboard.'),
      onCopyFailed: () => setLoungeShareFlash('Could not copy link. Try copying from the address bar.'),
    })
  }, [])

  const handleBlockLoungeProfile = useCallback((profileRow) => {
    void profileRow
    if (typeof window !== 'undefined') window.alert('Blocking users is not available yet.')
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
    loungeDetailCommentImageItemsRef.current = loungeDetailCommentImageItems
  }, [loungeDetailCommentImageItems])

  useEffect(() => {
    loungeDetailCommentVideoSlotRef.current = loungeDetailCommentVideoSlot
  }, [loungeDetailCommentVideoSlot])

  useEffect(() => {
    loungePostUploadFailureDetailsRef.current = loungePostUploadFailureDetails
  }, [loungePostUploadFailureDetails])

  useEffect(() => {
    if (!loungeShareFlash) return
    const tid = window.setTimeout(() => setLoungeShareFlash(''), 2500)
    return () => window.clearTimeout(tid)
  }, [loungeShareFlash])

  const bumpLoungeSubmitInFlight = useCallback((delta) => {
    loungeSubmitInFlightCountRef.current = Math.max(0, loungeSubmitInFlightCountRef.current + delta)
    setLoungePostSubmitInFlight(loungeSubmitInFlightCountRef.current > 0)
  }, [])

  /** Feed / quote / reply background jobs share one upload bar — do not clear it from unrelated surface cleanup. */
  const dismissLoungePostUploadBarIfIdle = useCallback(() => {
    if (loungePostJobRunningRef.current || loungeDetailCommentJobRunningRef.current) return
    setLoungePostUploadBar(null)
  }, [])

  /** True while a video submit queue job may still own shared video prep / upload bar state. */
  const loungeBackgroundSubmitBusy = useCallback(
    () =>
      loungePostJobRunningRef.current ||
      loungeDetailCommentJobRunningRef.current ||
      loungeSubmitQueueRunningRef.current,
    [],
  )

  const flushPendingFastLaneFailure = useCallback(() => {
    const pending = loungePendingFastLaneFailureRef.current
    if (!pending) return
    loungePendingFastLaneFailureRef.current = null
    if (pending.kind === 'comment') {
      loungeDetailCommentSnapshotRef.current = pending.snapshot
      const pathIds = pending.snapshot.commentDetailPathIds
      if (Array.isArray(pathIds) && pathIds.length > 0) {
        setLoungeCommentDetailPathIds((prev) => (prev.length > 0 ? prev : pathIds))
      }
      setLoungeDetailCommentErr(pending.message)
    } else {
      loungePostSnapshotRef.current = pending.snapshot
    }
    setLoungePostUploadFailureDetails({
      kind: pending.kind,
      phase: pending.phase,
      message: pending.message,
    })
    setLoungePostUploadFailedOpen(true)
  }, [])

  const deferOrShowFastLaneFailure = useCallback((kind, snapshot, phase, message) => {
    const payload = { kind, snapshot, phase, message }
    if (
      loungePostJobRunningRef.current ||
      loungeDetailCommentJobRunningRef.current ||
      loungeSubmitQueueRunningRef.current
    ) {
      loungePendingFastLaneFailureRef.current = payload
      return
    }
    loungePendingFastLaneFailureRef.current = null
    if (kind === 'comment') {
      loungeDetailCommentSnapshotRef.current = snapshot
      const pathIds = snapshot.commentDetailPathIds
      if (Array.isArray(pathIds) && pathIds.length > 0) {
        setLoungeCommentDetailPathIds((prev) => (prev.length > 0 ? prev : pathIds))
      }
      setLoungeDetailCommentErr(message)
    } else {
      loungePostSnapshotRef.current = snapshot
    }
    setLoungePostUploadFailureDetails({ kind, phase, message })
    setLoungePostUploadFailedOpen(true)
  }, [])

  /** Only the active (non-queued) submit should pin the shared snapshot ref before drain starts. */
  const shouldAssignLoungePostSnapshotRef = useCallback(
    () =>
      !loungePostJobRunningRef.current &&
      !loungeDetailCommentJobRunningRef.current &&
      !loungeSubmitQueueRunningRef.current,
    [],
  )

  const quoteRepostBackgroundUploadInFlight = useCallback(
    () =>
      Boolean(
        loungePostJobRunningRef.current &&
          String(loungePostSnapshotRef.current?.quoteRepostOfPostId || '').trim(),
      ),
    [],
  )

  const loungeDetailCommentBackgroundUploadInFlight = useCallback(
    () => loungeDetailCommentJobRunningRef.current && loungeDetailCommentSnapshotRef.current != null,
    [],
  )

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
      if (loungeBackgroundSubmitBusy()) {
        composerVideoPrepSpecRef.current = spec
        composerVideoLastEncodedFileRef.current = null
        setComposerVideoSlot({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        })
        return
      }
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
      if (!loungeBackgroundSubmitBusy()) {
        setLoungePostUploadBar({
          mode: 'mediaPrep',
          prepJobId: jobId,
          progress: 0.02,
          status: 'Starting…',
          detail: '',
        })
      }

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
          if (loungePostJobRunningRef.current || loungePostSnapshotRef.current) {
            setLoungePostUploadBar((bar) =>
              bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
            )
            return
          }
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
            dismissLoungePostUploadBarIfIdle()
            return
          }
          if (composerVideoPrepJobIdRef.current !== jobId) return
          if (loungePostJobRunningRef.current || loungePostSnapshotRef.current) {
            dismissLoungePostUploadBarIfIdle()
            return
          }
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
    [supabaseClient, loungeBackgroundSubmitBusy],
  )

  const startQuoteRepostVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      if (loungeBackgroundSubmitBusy()) {
        quoteRepostVideoPrepSpecRef.current = spec
        quoteRepostVideoLastEncodedFileRef.current = null
        setQuoteRepostVideoSlot({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        })
        return
      }
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
      if (!loungeBackgroundSubmitBusy()) {
        setLoungePostUploadBar({
          mode: 'mediaPrep',
          prepJobId: jobId,
          progress: 0.02,
          status: 'Starting…',
          detail: '',
        })
      }

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
          if (loungePostJobRunningRef.current || loungePostSnapshotRef.current) {
            setLoungePostUploadBar((bar) =>
              bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
            )
            return
          }
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
            dismissLoungePostUploadBarIfIdle()
            return
          }
          if (quoteRepostVideoPrepJobIdRef.current !== jobId) return
          if (loungePostJobRunningRef.current || loungePostSnapshotRef.current) {
            dismissLoungePostUploadBarIfIdle()
            return
          }
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
    [supabaseClient, loungeBackgroundSubmitBusy],
  )

  const cancelComposerMediaPrep = useCallback(
    (opts = {}) => {
      const userInitiated = Boolean(opts.userInitiated)
      // Background queue job may still own composer prep handoff / abort — never tear down from composer dismiss.
      if (loungeBackgroundSubmitBusy()) {
        return
      }
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
      if (userInitiated) setLoungePostUploadBar(null)
      else dismissLoungePostUploadBarIfIdle()
    },
    [disposeComposerVideoMedia, dismissLoungePostUploadBarIfIdle, loungeBackgroundSubmitBusy],
  )

  const cancelQuoteRepostMediaPrep = useCallback((opts = {}) => {
    const userInitiated = Boolean(opts.userInitiated)
    const preserveForBackgroundQuote = !userInitiated && quoteRepostBackgroundUploadInFlight()
    if (!preserveForBackgroundQuote) {
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
    }
    if (userInitiated) setLoungePostUploadBar(null)
    else dismissLoungePostUploadBarIfIdle()
  }, [disposeComposerVideoMedia, dismissLoungePostUploadBarIfIdle, quoteRepostBackgroundUploadInFlight])

  const cancelLoungeDetailCommentMediaPrep = useCallback((opts = {}) => {
    const userInitiated = Boolean(opts.userInitiated)
    const preserveForBackgroundComment = !userInitiated && loungeDetailCommentBackgroundUploadInFlight()
    if (!preserveForBackgroundComment) {
      const h = loungeDetailCommentVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      loungeDetailCommentVideoPrepHandoffRef.current = null
      loungeDetailCommentVideoPrepJobIdRef.current += 1
      try {
        loungeDetailCommentVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailCommentVideoPrepAbortRef.current = null
      loungeDetailCommentVideoLastEncodedFileRef.current = null
      disposeComposerVideoMedia(loungeDetailCommentVideoSlotRef.current)
      setLoungeDetailCommentVideoSlot(null)
    }
    if (userInitiated) setLoungePostUploadBar(null)
    else dismissLoungePostUploadBarIfIdle()
  }, [
    disposeComposerVideoMedia,
    dismissLoungePostUploadBarIfIdle,
    loungeDetailCommentBackgroundUploadInFlight,
  ])

  const clearLoungeDetailCommentComposerMedia = useCallback((opts = {}) => {
    const preserveBackgroundUpload = Boolean(opts.preserveBackgroundUpload)
    if (!preserveBackgroundUpload) {
      cancelLoungeDetailCommentMediaPrep()
    }
    setLoungeDetailCommentImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailCommentMediaUrl('')
    endLoungeDetailCommentMediaSession()
    try {
      const el = loungeDetailCommentMediaInputRef.current
      if (el) el.value = ''
    } catch {
      // ignore
    }
  }, [
    cancelLoungeDetailCommentMediaPrep,
    endLoungeDetailCommentMediaSession,
  ])

  const collapseLoungeDetailCommentComposer = useCallback(() => {
    setLoungeDetailCommentDiscardPromptOpen(false)
    setLoungeDetailCommentDraft('')
    setLoungeDetailCommentErr('')
    clearLoungeDetailCommentComposerMedia()
    setLoungeDetailCommentComposerExpanded(false)
    try {
      loungeDetailCommentTextareaRef.current?.blur()
    } catch {
      // ignore
    }
  }, [clearLoungeDetailCommentComposerMedia])

  const clearLoungeDetailCommentForPostAttempt = useCallback((opts = {}) => {
    const preserve = Boolean(opts.preserveDetailCommentVideoPrep)
    const snap = opts.pendingSnapshot ?? loungeDetailCommentSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = loungeSubmitSnapshotBlobUrls(snap)
    if (pendingPoster.startsWith('blob:')) {
      const sl = loungeDetailCommentVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      if (!loungeBackgroundSubmitBusy()) {
        const h = loungeDetailCommentVideoPrepHandoffRef.current
        if (h && !h.settled) {
          try {
            h.reject(new DOMException('Aborted', 'AbortError'))
          } catch {
            // ignore
          }
        }
        loungeDetailCommentVideoPrepJobIdRef.current += 1
        try {
          loungeDetailCommentVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        loungeDetailCommentVideoPrepAbortRef.current = null
        loungeDetailCommentVideoPrepHandoffRef.current = null
      }
    }
    setLoungeDetailCommentDraft('')
    setLoungeDetailCommentErr('')
    setLoungeDetailCommentImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailCommentMediaUrl('')
    setLoungeDetailCommentVideoSlot((prev) => {
      if (!preserve && prev) {
        disposeComposerVideoMedia(prev)
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
    endLoungeDetailCommentMediaSession()
    setLoungeDetailCommentComposerExpanded(false)
    try {
      const el = loungeDetailCommentMediaInputRef.current
      if (el) el.value = ''
    } catch {
      // ignore
    }
    try {
      loungeDetailCommentTextareaRef.current?.blur()
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [disposeComposerVideoMedia, endLoungeDetailCommentMediaSession])

  const requestDismissLoungeDetailCommentComposer = useCallback(() => {
    const hasContent =
      loungeDetailCommentDraftRef.current.trim().length > 0 ||
      loungeDetailCommentImageItemsRef.current.length > 0 ||
      loungeDetailCommentMediaUrlRef.current.length > 0 ||
      loungeDetailCommentVideoSlotRef.current != null
    if (hasContent) {
      setLoungeDetailCommentDiscardPromptOpen(true)
      return
    }
    collapseLoungeDetailCommentComposer()
  }, [collapseLoungeDetailCommentComposer])

  const startLoungeDetailCommentVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      if (loungeBackgroundSubmitBusy()) {
        loungeDetailCommentVideoPrepSpecRef.current = spec
        loungeDetailCommentVideoLastEncodedFileRef.current = null
        setLoungeDetailCommentVideoSlot({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        })
        return
      }
      const prevH = loungeDetailCommentVideoPrepHandoffRef.current
      if (prevH && !prevH.settled) {
        try {
          prevH.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        loungeDetailCommentVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      const jobId = (loungeDetailCommentVideoPrepJobIdRef.current += 1)
      loungeDetailCommentVideoLastEncodedFileRef.current = null
      const ac = new AbortController()
      loungeDetailCommentVideoPrepAbortRef.current = ac
      loungeDetailCommentVideoPrepSpecRef.current = spec

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
      loungeDetailCommentVideoPrepHandoffRef.current = handoff

      setLoungeDetailCommentVideoSlot({
        ...slotBase,
        prepJobId: jobId,
        prepStatus: 'preparing',
        prepError: '',
      })
      if (!loungeBackgroundSubmitBusy()) {
        setLoungePostUploadBar({
          mode: 'mediaPrep',
          prepJobId: jobId,
          progress: 0.02,
          status: 'Starting…',
          detail: '',
        })
      }

      void (async () => {
        try {
          const result = await runComposerStreamVideoPrepWithRetries({
            supabaseClient,
            signal: ac.signal,
            spec,
            onEncodedFileReady: (f) => {
              loungeDetailCommentVideoLastEncodedFileRef.current = f
            },
            onProgress: (info) => {
              if (loungeDetailCommentVideoPrepJobIdRef.current !== jobId) return
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
              if (loungeDetailCommentVideoPrepJobIdRef.current !== jobId) return
              const d = String(detail || '').trim()
              if (!d) return
              setLoungePostUploadBar((bar) =>
                bar?.mode === 'mediaPrep' && bar.prepJobId === jobId
                  ? { ...bar, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL }
                  : bar,
              )
            },
          })
          if (ac.signal.aborted || loungeDetailCommentVideoPrepJobIdRef.current !== jobId) {
            if (!handoff.settled) handoff.reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          handoff.resolve(result)
          loungeDetailCommentVideoLastEncodedFileRef.current = null
          if (loungeDetailCommentJobRunningRef.current || loungeDetailCommentSnapshotRef.current) {
            setLoungePostUploadBar((bar) =>
              bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
            )
            return
          }
          const { encodedFile, streamVideoUid } = result
          setLoungeDetailCommentVideoSlot((prev) => {
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
          if (!handoff.settled) handoff.reject(e instanceof Error ? e : new Error(String(e)))
          if (e?.name === 'AbortError') {
            if (loungeDetailCommentVideoPrepJobIdRef.current !== jobId) return
            setLoungePostUploadBar(null)
            return
          }
          if (loungeDetailCommentVideoPrepJobIdRef.current !== jobId) return
          if (loungeDetailCommentJobRunningRef.current || loungeDetailCommentSnapshotRef.current) {
            setLoungePostUploadBar(null)
            return
          }
          const msg =
            (e instanceof Error ? e.message : String(e || '')).trim() ||
            'Video upload failed after multiple attempts.'
          const slotStill = loungeDetailCommentVideoSlotRef.current
          if (slotStill?.prepJobId === jobId) {
            setLoungeDetailCommentVideoSlot((prev) =>
              prev?.prepJobId === jobId ? { ...prev, prepStatus: 'failed', prepError: msg } : prev,
            )
            setLoungeDetailCommentErr(msg)
          }
          setLoungePostUploadBar(null)
        }
      })()
    },
    [supabaseClient, loungeBackgroundSubmitBusy],
  )

  const queueLoungeVideoOrCrop = useCallback(
    async (vf, mode) => {
      const msgRead = (e) => (e instanceof Error ? e.message : 'Could not read this video file.')
      try {
        const dur = await probeVideoFileDurationSeconds(vf)
        if (!Number.isFinite(dur) || dur <= 0) {
          if (mode === 'composer') setPostErr('Could not read this video file.')
          else if (mode === 'quote') setQuoteRepostErr('Could not read this video file.')
          else if (mode === 'detailComment') {
            setLoungeDetailCommentErr('Could not read this video file.')
            loungeDetailCommentMediaSessionRef.current = false
          } else setLoungeDetailEditErr('Could not read this video file.')
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
            restoreLoungeComposerCaptionAfterMediaPick('composer')
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
            restoreLoungeComposerCaptionAfterMediaPick('quote')
          } else if (mode === 'detailComment') {
            disposeComposerVideoMedia(loungeDetailCommentVideoSlotRef.current)
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startLoungeDetailCommentVideoPrepFromSpec(spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            setLoungeDetailCommentMediaUrl('')
            loungeDetailCommentMediaSessionRef.current = false
            restoreLoungeComposerCaptionAfterMediaPick('detailComment')
          } else {
            setLoungeDetailEditMediaFile(vf)
            setLoungeDetailEditMediaKind('video')
          }
          return
        }
        if (mode === 'detailComment') {
          focusLoungeComposerCaption(() => loungeDetailCommentTextareaRef.current)
        }
        setLoungeVideoCrop({ file: vf, mode, knownDurationSec: dur })
      } catch (e) {
        if (mode === 'composer') setPostErr(msgRead(e))
        else if (mode === 'quote') setQuoteRepostErr(msgRead(e))
        else if (mode === 'detailComment') {
          setLoungeDetailCommentErr(msgRead(e))
          loungeDetailCommentMediaSessionRef.current = false
        } else setLoungeDetailEditErr(msgRead(e))
      }
    },
    [
      disposeComposerVideoMedia,
      restoreLoungeComposerCaptionAfterMediaPick,
      startComposerVideoPrepFromSpec,
      startLoungeDetailCommentVideoPrepFromSpec,
      startQuoteRepostVideoPrepFromSpec,
    ],
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

  const loungeDetailCommentVideoPostBlocked = useMemo(() => {
    const v = loungeDetailCommentVideoSlot
    if (!v) return false
    return v.prepStatus === 'failed'
  }, [loungeDetailCommentVideoSlot])

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

  const feedInteractionHydrateIdsKey = useMemo(() => {
    const ids = collectLoungePostInteractionHydrateIds(communityPosts)
    for (const id of collectLoungePostInteractionHydrateIds(profileModalPosts)) ids.add(id)
    return [...ids].sort().join(',')
  }, [communityPosts, profileModalPosts])

  // Comment IDs that appear as plain comment-repost cards in the feed — need separate interaction hydration.
  const feedCommentRepostIdsKey = useMemo(() => {
    const ids = new Set()
    for (const p of [...communityPosts, ...profileModalPosts]) {
      if (p?.repost_of_comment_id) ids.add(String(p.repost_of_comment_id))
    }
    return [...ids].sort().join(',')
  }, [communityPosts, profileModalPosts])

  useEffect(() => {
    if (!composerUserId || loungeReadOnly) return
    const ids = feedInteractionHydrateIdsKey ? feedInteractionHydrateIdsKey.split(',').filter(Boolean) : []
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
  }, [composerUserId, loungeReadOnly, feedInteractionHydrateIdsKey, refreshLoungePostInteractions, supabaseClient])

  const interactionStateFor = useCallback(
    (postId) => interactionByPost[postId] || defaultInteraction,
    [interactionByPost, defaultInteraction]
  )

  const interactionStateForComment = useCallback(
    (commentId) => interactionByComment[String(commentId)] || defaultInteraction,
    [interactionByComment, defaultInteraction]
  )

  const hydrateCommentInteractionsForIds = useCallback(
    async (commentIds) => {
      const cids = [...new Set((commentIds || []).map((id) => String(id)).filter(Boolean))]
      if (!composerUserId || cids.length === 0 || loungeReadOnly) return
      // Check both legacy feed_comment_reposts table and the new community_feed_posts path.
      const [likesRes, legacyRepostsRes, newRepostsRes, bmRes] = await Promise.all([
        supabaseClient.from('feed_comment_likes').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient.from('feed_comment_reposts').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient
          .from('community_feed_posts')
          .select('repost_of_comment_id')
          .eq('user_id', composerUserId)
          .eq('is_plain_repost', true)
          .in('repost_of_comment_id', cids),
        supabaseClient.from('feed_comment_bookmarks').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
      ])
      const intErr = likesRes.error?.message || legacyRepostsRes.error?.message || bmRes.error?.message
      if (intErr) {
        console.warn('profile comment interactions:', intErr)
        return
      }
      const repostedCommentIds = new Set([
        ...(legacyRepostsRes.data || []).map((r) => r.comment_id).filter(Boolean),
        ...(newRepostsRes.data || []).map((r) => r.repost_of_comment_id).filter(Boolean),
      ])
      setInteractionByComment((prev) => {
        const next = { ...prev }
        for (const id of cids) {
          const key = String(id)
          const cur = next[key] || { ...defaultInteraction }
          next[key] = {
            ...cur,
            liked: false,
            reposted: false,
            plainRepostChildId: null,
            quoteRepostChildId: null,
          }
        }
        for (const r of likesRes.data || []) {
          const cid = r.comment_id != null ? String(r.comment_id) : ''
          if (!cid || !next[cid]) continue
          next[cid] = { ...next[cid], liked: true }
        }
        for (const cid of repostedCommentIds) {
          const key = String(cid)
          if (!next[key]) continue
          next[key] = {
            ...next[key],
            reposted: true,
            plainRepostChildId: key,
            quoteRepostChildId: null,
          }
        }
        return next
      })
      setBookmarkedByComment((prev) => {
        const next = { ...prev }
        for (const id of cids) {
          next[String(id)] = false
        }
        for (const r of bmRes.data || []) {
          if (r.comment_id) next[String(r.comment_id)] = true
        }
        return next
      })
    },
    [composerUserId, defaultInteraction, loungeReadOnly, supabaseClient],
  )

  // Hydrate like/repost/bookmark state for comments that appear as repost cards in the feed.
  useEffect(() => {
    if (!composerUserId || loungeReadOnly) return
    const ids = feedCommentRepostIdsKey ? feedCommentRepostIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) return
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await hydrateCommentInteractionsForIds(ids)
    })()
    return () => {
      cancelled = true
    }
  }, [composerUserId, loungeReadOnly, feedCommentRepostIdsKey, hydrateCommentInteractionsForIds])

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
        const dupLike =
          !was &&
          (res.error.code === '23505' ||
            /duplicate key value violates unique constraint "post_likes_pk"/i.test(String(res.error.message || '')))
        if (dupLike) {
          setInteractionByPost((prev) => {
            const cur = prev[postId] || defaultInteraction
            return { ...prev, [postId]: { ...cur, liked: true } }
          })
          const { data: row } = await supabaseClient
            .from('community_feed_posts')
            .select('like_count,comment_count,repost_count')
            .eq('id', postId)
            .maybeSingle()
          if (row) patchPostAggregate(postId, row)
          return { ok: true, liked: true }
        }
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
        else if (klipyPickerTarget === 'detailComment') setLoungeDetailCommentErr(chk.message)
        else setPostErr(chk.message)
        return
      }
      const u = chk.value
      if (!u) return
      const target = klipyPickerTarget
      flushSync(() => {
        if (target === 'quote') {
          cancelQuoteRepostMediaPrep()
          setQuoteRepostMediaUrl(u)
        } else if (target === 'detailComment') {
          cancelLoungeDetailCommentMediaPrep()
          setLoungeDetailCommentMediaUrl(u)
          endLoungeDetailCommentMediaSession()
        } else {
          disposeComposerVideoMedia(composerVideoSlotRef.current)
          if (!loungeBackgroundSubmitBusy()) {
            composerVideoPrepJobIdRef.current += 1
            try {
              composerVideoPrepAbortRef.current?.abort()
            } catch {
              // ignore
            }
            composerVideoPrepAbortRef.current = null
            composerVideoPrepHandoffRef.current = null
          }
          setComposerVideoSlot(null)
          dismissLoungePostUploadBarIfIdle()
          try {
            const el = composerMediaInputRef.current
            if (el) el.value = ''
          } catch {
            // ignore
          }
          setComposerMediaUrl(u)
        }
      })
      restoreLoungeComposerCaptionAfterMediaPick(target)
    },
    [
      klipyPickerTarget,
      setPostErr,
      setQuoteRepostErr,
      disposeComposerVideoMedia,
      dismissLoungePostUploadBarIfIdle,
      loungeBackgroundSubmitBusy,
      cancelQuoteRepostMediaPrep,
      cancelLoungeDetailCommentMediaPrep,
      endLoungeDetailCommentMediaSession,
      restoreLoungeComposerCaptionAfterMediaPick,
    ],
  )

  const openQuoteRepostComposer = useCallback(
    (post) => {
      if (!post?.id || loungeReadOnly) return
      if (openProfileGateIfNeeded()) return
      if (quoteRepostBackgroundUploadInFlight()) {
        setLoungeManageErr('Your quote repost is still uploading. You can keep browsing while it finishes.')
        return
      }
      clearQuoteRepostMedia()
      setQuoteRepostDraft('')
      setQuoteRepostErr('')
      setQuoteRepostModal({ mode: 'compose', original: post })
      setLoungeDetailRepostMenuOpen(false)
    },
    [clearQuoteRepostMedia, loungeReadOnly, openProfileGateIfNeeded, quoteRepostBackgroundUploadInFlight]
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
          onRequireAuth?.()
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

        // ── Chain collapse ──────────────────────────────────────────────────
        // If the card being reposted is itself a plain repost, target the original.
        if (post.is_plain_repost) {
          if (post.repost_of_comment_id) {
            // Repost of a comment card → create a new comment-repost feed card
            const { error: cErr } = await supabaseClient
              .from('community_feed_posts')
              .insert(communityFeedCommentRepostInsertPayload({ originalCommentId: post.repost_of_comment_id }))
            if (cErr) {
              setLoungeManageErr(
                cErr.code === '23505' ? 'You already reposted this comment.' : cErr.message || 'Could not repost.'
              )
              return
            }
            await loadCommunityFeed({ silent: true })
            return
          }
          if (post.repost_of_post_id) {
            // Repost of a post card → target the original post ID directly
            const { error } = await supabaseClient
              .from('community_feed_posts')
              .insert(communityFeedPlainRepostInsertPayload({ originalPostId: post.repost_of_post_id }))
            if (error) {
              const msg = String(error.message || '')
              setLoungeManageErr(
                error.code === '23505'
                  ? 'You already have a plain repost for this post.'
                  : msg || 'Could not repost right now.'
              )
              return
            }
            await loadCommunityFeed({ silent: true })
            await refreshLoungePostInteractions([post.repost_of_post_id])
            return
          }
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
        onRequireAuth?.()
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
      const specForSnap =
        hasVideo && !uid && quoteRepostVideoPrepSpecRef.current
          ? quoteRepostVideoPrepSpecRef.current
          : null
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
        // Capture prep handoff by reference so queued jobs don't race on the shared ref
        _capturedPrepHandoff: quoteRepostVideoPrepHandoffRef.current ?? null,
      }
    } finally {
      setQuoteRepostBusy(false)
    }

    if (!snapshot) return

    const preserveVideoPrep = snapshot.awaitingComposerVideoPrepJobId != null
    if (shouldAssignLoungePostSnapshotRef()) {
      loungePostSnapshotRef.current = snapshot
    }
    const quotePosterBlob =
      typeof snapshot.sessionStreamPosterBlobUrl === 'string'
        ? snapshot.sessionStreamPosterBlobUrl.trim()
        : ''
    const quotePostUid = String(snapshot.streamVideoUid || '').trim()
    if (quotePostUid && quotePosterBlob.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(quotePostUid, quotePosterBlob)
    }
    clearQuoteRepostForPostAttemptRef.current?.({
      preserveQuoteVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    enqueueAndRunLoungeSubmitRef.current('quote', snapshot)

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
      try {
        window.clearTimeout(loungeDetailCommentQueuedToastTimerRef.current)
      } catch {
        // ignore
      }
      loungeDetailCommentQueuedToastTimerRef.current = 0
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

  const handleLoungeFollowUser = useCallback(
    async (userId) => {
      if (!composerUserId || !userId || userId === composerUserId) return
      if (loungeFollowingUserIds.has(userId)) return
      setLoungeFollowingUserIds((prev) => new Set([...prev, userId]))
      setLoungeDetailFollowingUserIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
      const { error } = await supabaseClient
        .from('profile_follows')
        .insert({ follower_id: composerUserId, following_id: userId })
      if (error) {
        setLoungeFollowingUserIds((prev) => {
          const next = new Set(prev)
          next.delete(userId)
          return next
        })
        setLoungeDetailFollowingUserIds((prev) => prev.filter((id) => id !== userId))
      }
    },
    [composerUserId, loungeFollowingUserIds, supabaseClient],
  )

  /** Keep feed follow pills, comment sort, and Following filter in sync after profile / list toggles. */
  const syncLoungeViewerFollowState = useCallback(
    (userId, isFollowing) => {
      const uid = String(userId || '').trim()
      if (!uid || !composerUserId || uid === composerUserId) return
      setLoungeFollowingUserIds((prev) => {
        const next = new Set(prev)
        if (isFollowing) next.add(uid)
        else next.delete(uid)
        return next
      })
      setLoungeDetailFollowingUserIds((prev) => {
        if (isFollowing) return prev.includes(uid) ? prev : [...prev, uid]
        return prev.filter((id) => id !== uid)
      })
      if (!isFollowing && loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING) {
        void loadCommunityFeed({ silent: true, scope: LOUNGE_FEED_SCOPE_FOLLOWING })
      }
    },
    [composerUserId, loungeFeedScope, loadCommunityFeed],
  )

  const noopLoungeBarPostToggle = useCallback(async () => undefined, [])

  const getLoungeDetailCommentBookmarked = useCallback(
    (commentId) => !!bookmarkedByComment[commentId],
    [bookmarkedByComment]
  )

  const toggleLoungeDetailCommentLike = useCallback(
    async (commentId) => {
      if (!composerUserId || !commentId) return
      const prevSnap = interactionByCommentRef.current[commentId] || defaultInteraction
      const was = !!prevSnap.liked
      const delta = was ? -1 : 1
      setInteractionByComment((prev) => {
        const cur = prev[commentId] || defaultInteraction
        return { ...prev, [commentId]: { ...cur, liked: !was } }
      })
      setLoungeDetailComments((prev) =>
        prev.map((row) =>
          row.id === commentId
            ? { ...row, like_count: Math.max(0, (Number(row.like_count) || 0) + delta) }
            : row,
        ),
      )
      const res = was
        ? await supabaseClient
            .from('feed_comment_likes')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', composerUserId)
        : await supabaseClient
            .from('feed_comment_likes')
            .insert({ comment_id: commentId, user_id: composerUserId })
      if (res.error) {
        const dupLike =
          !was &&
          (res.error.code === '23505' ||
            /duplicate key value violates unique constraint "feed_comment_likes_pk"/i.test(
              String(res.error.message || ''),
            ))
        if (dupLike) {
          setInteractionByComment((prev) => {
            const cur = prev[commentId] || defaultInteraction
            return { ...prev, [commentId]: { ...cur, liked: true } }
          })
          const { data: row } = await supabaseClient
            .from('feed_comments')
            .select('like_count')
            .eq('id', commentId)
            .maybeSingle()
          if (row && typeof row.like_count === 'number') {
            setLoungeDetailComments((prev) =>
              prev.map((r) => (r.id === commentId ? { ...r, like_count: row.like_count } : r)),
            )
          }
          return
        }
        setInteractionByComment((prev) => {
          const cur = prev[commentId] || defaultInteraction
          return { ...prev, [commentId]: { ...cur, liked: was } }
        })
        setLoungeDetailComments((prev) =>
          prev.map((row) =>
            row.id === commentId
              ? { ...row, like_count: Math.max(0, (Number(row.like_count) || 0) - delta) }
              : row,
          ),
        )
        setLoungeManageErr(res.error.message || 'Could not update.')
        return
      }
      const { data: row } = await supabaseClient
        .from('feed_comments')
        .select('like_count')
        .eq('id', commentId)
        .maybeSingle()
      if (row && typeof row.like_count === 'number') {
        setLoungeDetailComments((prev) =>
          prev.map((r) => (r.id === commentId ? { ...r, like_count: row.like_count } : r)),
        )
      }
    },
    [composerUserId, defaultInteraction, supabaseClient]
  )

  const toggleLoungeDetailCommentBookmark = useCallback(
    async (commentId) => {
      if (!composerUserId || !commentId) return
      const was = !!bookmarkedByCommentRef.current[commentId]
      const delta = was ? -1 : 1
      setBookmarkedByComment((prev) => ({ ...prev, [commentId]: !was }))
      setLoungeDetailComments((prev) =>
        prev.map((row) =>
          row.id === commentId
            ? { ...row, bookmark_count: Math.max(0, (Number(row.bookmark_count) || 0) + delta) }
            : row,
        ),
      )
      const res = was
        ? await supabaseClient
            .from('feed_comment_bookmarks')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', composerUserId)
        : await supabaseClient
            .from('feed_comment_bookmarks')
            .insert({ comment_id: commentId, user_id: composerUserId })
      if (res.error) {
        setBookmarkedByComment((prev) => ({ ...prev, [commentId]: was }))
        setLoungeDetailComments((prev) =>
          prev.map((row) =>
            row.id === commentId
              ? { ...row, bookmark_count: Math.max(0, (Number(row.bookmark_count) || 0) - delta) }
              : row,
          ),
        )
        setLoungeManageErr(res.error.message || 'Could not update bookmark.')
        return
      }
      const { data: row } = await supabaseClient
        .from('feed_comments')
        .select('bookmark_count')
        .eq('id', commentId)
        .maybeSingle()
      if (row && typeof row.bookmark_count === 'number') {
        setLoungeDetailComments((prev) =>
          prev.map((r) => (r.id === commentId ? { ...r, bookmark_count: row.bookmark_count } : r)),
        )
      }
    },
    [composerUserId, supabaseClient]
  )

  const addLoungeDetailCommentPlainRepost = useCallback(
    async (commentId) => {
      if (!composerUserId || !commentId) return
      const prevSnap = interactionByCommentRef.current[commentId] || defaultInteraction
      if (prevSnap.reposted) return
      // Optimistic update
      setInteractionByComment((prev) => {
        const cur = prev[commentId] || defaultInteraction
        return {
          ...prev,
          [commentId]: {
            ...cur,
            reposted: true,
            plainRepostChildId: commentId,
            quoteRepostChildId: null,
          },
        }
      })
      setLoungeDetailComments((prev) =>
        prev.map((row) =>
          row.id === commentId
            ? { ...row, repost_count: Math.max(0, (Number(row.repost_count) || 0) + 1) }
            : row,
        ),
      )
      // Create a community_feed_posts row so the repost appears in the main feed.
      const res = await supabaseClient
        .from('community_feed_posts')
        .insert(communityFeedCommentRepostInsertPayload({ originalCommentId: commentId }))
      if (res.error) {
        // Roll back optimistic update
        setInteractionByComment((prev) => {
          const cur = prev[commentId] || defaultInteraction
          return { ...prev, [commentId]: { ...cur, reposted: false, plainRepostChildId: null } }
        })
        setLoungeDetailComments((prev) =>
          prev.map((row) =>
            row.id === commentId
              ? { ...row, repost_count: Math.max(0, (Number(row.repost_count) || 0) - 1) }
              : row,
          ),
        )
        if (res.error.code === '23505') {
          setLoungeManageErr('You already reposted this comment.')
        } else {
          setLoungeManageErr(res.error.message || 'Could not repost.')
        }
        return
      }
      // Sync true count from DB (trigger on community_feed_posts updated it)
      const { data: row } = await supabaseClient
        .from('feed_comments')
        .select('repost_count')
        .eq('id', commentId)
        .maybeSingle()
      if (row && typeof row.repost_count === 'number') {
        setLoungeDetailComments((prev) =>
          prev.map((r) => (r.id === commentId ? { ...r, repost_count: row.repost_count } : r)),
        )
      }
      await loadCommunityFeed({ silent: true })
    },
    [composerUserId, defaultInteraction, loadCommunityFeed, supabaseClient]
  )

  const undoLoungeDetailCommentPlainRepost = useCallback(
    async (commentId) => {
      if (!composerUserId || !commentId) return
      const prevSnap = interactionByCommentRef.current[commentId] || defaultInteraction
      if (!prevSnap.reposted) return
      // Optimistic update
      setInteractionByComment((prev) => {
        const cur = prev[commentId] || defaultInteraction
        return {
          ...prev,
          [commentId]: { ...cur, reposted: false, plainRepostChildId: null, quoteRepostChildId: null },
        }
      })
      setLoungeDetailComments((prev) =>
        prev.map((row) =>
          row.id === commentId
            ? { ...row, repost_count: Math.max(0, (Number(row.repost_count) || 0) - 1) }
            : row,
        ),
      )
      // Delete from community_feed_posts (new path) and legacy feed_comment_reposts in parallel.
      const [newRes] = await Promise.all([
        supabaseClient
          .from('community_feed_posts')
          .delete()
          .eq('user_id', composerUserId)
          .eq('repost_of_comment_id', commentId)
          .eq('is_plain_repost', true),
        // Legacy cleanup — no-op if row doesn't exist
        supabaseClient
          .from('feed_comment_reposts')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', composerUserId),
      ])
      if (newRes.error) {
        // Roll back optimistic update
        setInteractionByComment((prev) => {
          const cur = prev[commentId] || defaultInteraction
          return {
            ...prev,
            [commentId]: {
              ...cur,
              reposted: true,
              plainRepostChildId: commentId,
              quoteRepostChildId: null,
            },
          }
        })
        setLoungeDetailComments((prev) =>
          prev.map((row) =>
            row.id === commentId
              ? { ...row, repost_count: Math.max(0, (Number(row.repost_count) || 0) + 1) }
              : row,
          ),
        )
        setLoungeManageErr(newRes.error.message || 'Could not undo repost.')
        return
      }
      const { data: row } = await supabaseClient
        .from('feed_comments')
        .select('repost_count')
        .eq('id', commentId)
        .maybeSingle()
      if (row && typeof row.repost_count === 'number') {
        setLoungeDetailComments((prev) =>
          prev.map((r) => (r.id === commentId ? { ...r, repost_count: row.repost_count } : r)),
        )
      }
      await loadCommunityFeed({ silent: true })
    },
    [composerUserId, defaultInteraction, loadCommunityFeed, supabaseClient]
  )

  /** Post-detail reply: clear composer immediately and upload in the background (feed composer parity). */
  const submitLoungeDetailComment = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId || loungeReadOnly) return
    // No job-running guard here — the queue serialises execution; the composer clears
    // synchronously on submit so a rapid second tap fails the content check below.
    const body = loungeDetailCommentDraft.trim()
    setLoungeDetailCommentErr('')
    const gifCheck = validateAtMostOneGifUrl(loungeDetailCommentMediaUrl)
    if (!gifCheck.ok) {
      setLoungeDetailCommentErr(gifCheck.message)
      return
    }
    const gifOnlyUrl = gifCheck.value
    const slotNow = loungeDetailCommentVideoSlotRef.current
    const hasVideo = slotNow != null
    const hasImages = loungeDetailCommentImageItems.length > 0
    const hasMedia = hasImages || Boolean(gifOnlyUrl) || hasVideo
    if (!body && !hasMedia) return
    if (body.length > LOUNGE_COMMENT_BODY_MAX) {
      setLoungeDetailCommentErr(`Reply must be ${LOUNGE_COMMENT_BODY_MAX} characters or fewer.`)
      return
    }
    if (loungeDetailCommentVideoPostBlocked) return
    if (hasVideo && gifOnlyUrl) {
      setLoungeDetailCommentErr('Remove the GIF before posting a video.')
      return
    }
    if (hasVideo && slotNow?.file && slotNow.file.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
      setLoungeDetailCommentErr('Video must be 200 MB or smaller for upload.')
      return
    }
    if (hasVideo && slotNow?.prepStatus === 'failed') {
      setLoungeDetailCommentErr(slotNow.prepError || 'Video processing failed. Remove the video or try again.')
      return
    }

    const parentId =
      loungeCommentDetailPathIds.length > 0
        ? loungeCommentDetailPathIds[loungeCommentDetailPathIds.length - 1]
        : null

    const uid = hasVideo ? String(slotNow?.streamVideoUid || '').trim() || null : null
    const awaiting =
      hasVideo && !uid && slotNow?.prepStatus === 'preparing' && typeof slotNow?.prepJobId === 'number'
        ? slotNow.prepJobId
        : null
    const specForSnap =
      hasVideo && !uid && loungeDetailCommentVideoPrepSpecRef.current
        ? loungeDetailCommentVideoPrepSpecRef.current
        : null
    const sessionPosterBlob =
      hasVideo && slotNow?.posterUrl && String(slotNow.posterUrl).startsWith('blob:')
        ? String(slotNow.posterUrl)
        : null

    const snapshot = {
      body,
      gifOnlyUrl,
      imageFiles: loungeDetailCommentImageItems.map((it) => it.file),
      videoFile: hasVideo && slotNow?.file ? slotNow.file : null,
      streamVideoUid: uid,
      sessionStreamPosterBlobUrl: sessionPosterBlob,
      postId: loungePostDetail.id,
      parentId,
      userId: composerUserId,
      awaitingDetailCommentVideoPrepJobId: awaiting,
      videoPrepSpec: specForSnap,
      /** Screen to return to after post (comment detail vs OP post detail). */
      commentDetailPathIds:
        loungeCommentDetailPathIds.length > 0 ? [...loungeCommentDetailPathIds] : [],
      // Capture prep handoff by reference so queued jobs don't race on the shared ref
      _capturedPrepHandoff: loungeDetailCommentVideoPrepHandoffRef.current ?? null,
    }

    const preserveVideoPrep = snapshot.awaitingDetailCommentVideoPrepJobId != null
    if (shouldAssignLoungePostSnapshotRef()) {
      loungeDetailCommentSnapshotRef.current = snapshot
    }
    const commentPosterBlob =
      typeof snapshot.sessionStreamPosterBlobUrl === 'string'
        ? snapshot.sessionStreamPosterBlobUrl.trim()
        : ''
    const commentPostUid = String(snapshot.streamVideoUid || '').trim()
    if (commentPostUid && commentPosterBlob.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(commentPostUid, commentPosterBlob)
    }
    clearLoungeDetailCommentForPostAttempt({
      preserveDetailCommentVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    enqueueAndRunLoungeSubmitRef.current('comment', snapshot)

    const commentMediaOrPrepPending =
      (Array.isArray(snapshot.imageFiles) && snapshot.imageFiles.length > 0) ||
      Boolean(String(snapshot.gifOnlyUrl || '').trim()) ||
      Boolean(snapshot.videoFile) ||
      Boolean(String(snapshot.streamVideoUid || '').trim()) ||
      snapshot.awaitingDetailCommentVideoPrepJobId != null
    if (commentMediaOrPrepPending) {
      try {
        window.clearTimeout(loungeDetailCommentQueuedToastTimerRef.current)
      } catch {
        // ignore
      }
      setLoungeDetailCommentQueuedToast(true)
      loungeDetailCommentQueuedToastTimerRef.current = window.setTimeout(() => {
        loungeDetailCommentQueuedToastTimerRef.current = 0
        setLoungeDetailCommentQueuedToast(false)
      }, 2800)
    }
  }, [
    clearLoungeDetailCommentForPostAttempt,
    composerUserId,
    loungeCommentDetailPathIds,
    loungeDetailCommentDraft,
    loungeDetailCommentImageItems,
    loungeDetailCommentMediaUrl,
    loungeDetailCommentVideoPostBlocked,
    loungePostDetail?.id,
    loungeReadOnly,
  ])

  const cancelLoungeDetailCommentEdit = useCallback(() => {
    setLoungeDetailCommentEditingId(null)
    setLoungeDetailCommentEditDraft('')
    setLoungeDetailCommentEditImageUrls([])
    setLoungeDetailCommentEditGifUrl('')
  }, [])

  const onCommentMenuEditFromDetail = useCallback((c) => {
    if (!c?.id) return
    const seed = feedCommentAuthorEditMediaSeed(c)
    setLoungeDetailCommentEditingId(c.id)
    setLoungeDetailCommentEditDraft(String(c.body ?? ''))
    setLoungeDetailCommentEditImageUrls(seed.imageUrls)
    setLoungeDetailCommentEditGifUrl(seed.gifUrl)
  }, [])

  const saveLoungeDetailCommentEdit = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId || !loungeDetailCommentEditingId) return
    const body = loungeDetailCommentEditDraft.trim()
    const editingRow = loungeDetailComments.find((r) => r.id === loungeDetailCommentEditingId)
    const keepStream = feedCommentStreamVideoUid(editingRow)
    const hasRemoteMedia =
      loungeDetailCommentEditImageUrls.length > 0 ||
      String(loungeDetailCommentEditGifUrl || '').trim().length > 0 ||
      keepStream
    if (!body && !hasRemoteMedia) return
    if (body.length > LOUNGE_COMMENT_BODY_MAX) return
    setLoungeDetailCommentEditBusy(true)
    setLoungeDetailCommentErr('')
    try {
      const editedAt = new Date().toISOString()
      const mediaPatch = feedPostMediaUpdatePayload({
        imageUrls: loungeDetailCommentEditImageUrls,
        gifUrl: loungeDetailCommentEditGifUrl,
      })
      const updateBody = keepStream
        ? { body, edited_at: editedAt, ...mediaPatch, stream_video_uid: keepStream }
        : { body, edited_at: editedAt, ...mediaPatch }
      const { data, error } = await supabaseClient
        .from('feed_comments')
        .update(updateBody)
        .eq('id', loungeDetailCommentEditingId)
        .eq('user_id', composerUserId)
        .select(FEED_COMMENT_SELECT_COLS)
        .maybeSingle()
      if (error) {
        const msg = String(error.message || '')
        if (error.code === '42501') {
          setLoungeDetailCommentErr('You do not have permission to edit this reply.')
        } else {
          setLoungeDetailCommentErr(msg || 'Could not save edit.')
        }
        return
      }
      if (!data?.id) {
        setLoungeDetailCommentErr('Could not save. Try refreshing.')
        return
      }
      setLoungeDetailComments((prev) =>
        prev.map((row) => (row.id === loungeDetailCommentEditingId ? { ...row, ...data } : row)),
      )
      cancelLoungeDetailCommentEdit()
    } finally {
      setLoungeDetailCommentEditBusy(false)
    }
  }, [
    cancelLoungeDetailCommentEdit,
    composerUserId,
    loungeDetailCommentEditDraft,
    loungeDetailCommentEditGifUrl,
    loungeDetailCommentEditImageUrls,
    loungeDetailCommentEditingId,
    loungeDetailComments,
    loungePostDetail?.id,
    supabaseClient,
  ])

  const deleteLoungeDetailComment = useCallback(
    async (c) => {
      if (!c?.id || !composerUserId || !loungePostDetail?.id) return
      const ok = window.confirm('Delete this reply? This cannot be undone.')
      if (!ok) return
      const removeIds = new Set([c.id])
      let grew = true
      while (grew) {
        grew = false
        for (const row of loungeDetailComments) {
          if (row.parent_id && removeIds.has(row.parent_id) && !removeIds.has(row.id)) {
            removeIds.add(row.id)
            grew = true
          }
        }
      }
      setLoungeDetailCommentDeleteBusyId(c.id)
      setLoungeDetailCommentErr('')
      try {
        for (const row of loungeDetailComments) {
          if (!removeIds.has(row.id)) continue
          const suid = feedCommentStreamVideoUid(row)
          if (suid) await deleteCfStreamOrphanAsset(supabaseClient, suid)
          for (const mediaUrl of collectLoungeFeedStoredMediaUrls(row)) {
            await deleteLoungeFeedMediaFromPublicUrl(supabaseClient, mediaUrl)
          }
        }
        const { error } = await supabaseClient
          .from('feed_comments')
          .delete()
          .eq('id', c.id)
          .eq('user_id', composerUserId)
        if (error) {
          const msg = String(error.message || '')
          if (error.code === '42501') {
            setLoungeDetailCommentErr('You do not have permission to delete this reply.')
          } else {
            setLoungeDetailCommentErr(msg || 'Could not delete.')
          }
          return
        }
        const ancestorIds = feedCommentAncestorIdsAfterRemoval(loungeDetailComments, removeIds)
        setLoungeDetailComments((prev) => prev.filter((row) => !removeIds.has(row.id)))
        setLoungeDetailViewerPinnedCommentIds((ids) => ids.filter((id) => !removeIds.has(id)))
        setLoungeCommentDetailPathIds((p) => p.filter((id) => !removeIds.has(id)))
        setInteractionByComment((prev) => {
          const next = { ...prev }
          for (const id of removeIds) delete next[id]
          return next
        })
        setBookmarkedByComment((prev) => {
          const next = { ...prev }
          for (const id of removeIds) delete next[id]
          return next
        })
        if (loungeDetailCommentEditingId && removeIds.has(loungeDetailCommentEditingId)) {
          cancelLoungeDetailCommentEdit()
        }
        const { data: countRow } = await supabaseClient
          .from('community_feed_posts')
          .select('comment_count')
          .eq('id', loungePostDetail.id)
          .maybeSingle()
        if (countRow && typeof countRow.comment_count === 'number') {
          patchPostAggregate(loungePostDetail.id, { comment_count: countRow.comment_count })
          setLoungePostDetail((prev) =>
            prev?.id === loungePostDetail.id ? { ...prev, comment_count: countRow.comment_count } : prev,
          )
        }
        if (ancestorIds.length > 0) {
          const { data: countRows } = await supabaseClient
            .from('feed_comments')
            .select('id, comment_count')
            .in('id', ancestorIds)
          if (countRows?.length) {
            const byId = Object.fromEntries(countRows.map((r) => [r.id, r.comment_count]))
            setLoungeDetailComments((prev) =>
              prev.map((r) => (byId[r.id] != null ? { ...r, comment_count: byId[r.id] } : r)),
            )
          }
        }
      } finally {
        setLoungeDetailCommentDeleteBusyId(null)
      }
    },
    [
      cancelLoungeDetailCommentEdit,
      composerUserId,
      loungeDetailCommentEditingId,
      loungeDetailComments,
      loungePostDetail?.id,
      patchPostAggregate,
      supabaseClient,
    ],
  )

  const onCommentMenuBlockFromDetail = useCallback((c) => {
    void c
    if (typeof window !== 'undefined') window.alert('Blocking users is not available yet.')
  }, [])

  const onCommentMenuReportFromDetail = useCallback((c) => {
    void c
    if (typeof window !== 'undefined') window.alert('Reporting comments is not available yet.')
  }, [])

  /**
   * Load post-detail comments once per opened post — not on every auth/interaction dep change.
   * Do NOT reset `loungeCommentDetailPathIds` here when `composerUserId` (or similar) updates:
   * comment-repost direct entry sets the drill path first; a re-run used to clear it and leave
   * the user stuck on post-only detail ("Post" title) instead of Reply + hierarchy.
   * Never put `loungeDetailCommentsLoading` in this effect's deps — toggling it re-ran the
   * effect, cancelled the in-flight fetch, then bailed on "already loading" → stuck forever.
   * Comment likes/reposts/bookmarks hydrate in the effect below.
   */
  useEffect(() => {
    if (!loungePostDetail?.id || loungeReadOnly) {
      loungeDetailCommentsEffectPostIdRef.current = null
      loungeDetailCommentsLoadedPostIdRef.current = null
      setLoungeDetailComments([])
      setLoungeDetailViewerPinnedCommentIds([])
      setLoungeDetailCommentSort(readLoungeDetailCommentSort())
      setLoungeDetailFollowingUserIds([])
      setLoungeDetailCommentsLoading(false)
      setLoungeDetailCommentErr('')
      setLoungeCommentDetailPathIds([])
      return
    }

    const postId = String(loungePostDetail.id)
    if (loungeDetailCommentsLoadedPostIdRef.current === postId) return

    const isNewPost = loungeDetailCommentsEffectPostIdRef.current !== postId
      if (isNewPost) {
      loungeDetailCommentsEffectPostIdRef.current = postId

      const directOpen =
        loungePostDetailDirectCommentOpenRef.current?.postId === postId
          ? loungePostDetailDirectCommentOpenRef.current
          : null
      if (directOpen?.pathIds?.length) {
        setLoungeCommentDetailPathIds(directOpen.pathIds)
        loungeCommentDetailDirectEntryDepthRef.current = directOpen.pathIds.length
        loungePostDetailPendingCommentIdRef.current = null
        loungePostDetailPendingCommentComposerRef.current = false
      } else if (!loungePostDetailPendingCommentIdRef.current) {
        setLoungeCommentDetailPathIds([])
      }
      setLoungeDetailViewerPinnedCommentIds([])
      setLoungeDetailFollowingUserIds([])
      setLoungeDetailCommentErr('')
    }

    const directOpen =
      isNewPost &&
      loungePostDetailDirectCommentOpenRef.current?.postId === postId
        ? loungePostDetailDirectCommentOpenRef.current
        : null
    const directFocusComposer = directOpen?.focusComposer === true
    const prefetchedComments = directOpen?.comments ?? null
    if (prefetchedComments) {
      loungePostDetailDirectCommentOpenRef.current = null
    }

    let cancelled = false
    setLoungeDetailCommentsLoading(true)
    ;(async () => {
      let hydrated
      if (prefetchedComments) {
        hydrated = prefetchedComments
      } else {
        const { data, error } = await supabaseClient
          .from('feed_comments')
          .select(FEED_COMMENT_SELECT_COLS)
          .eq('post_id', postId)
          .is('hidden_at', null)
          .order('created_at', { ascending: true })
        if (cancelled) return
        if (error) {
          setLoungeDetailCommentErr(error.message)
          setLoungeDetailComments([])
          setLoungeDetailCommentsLoading(false)
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
        hydrated = rows.map((r) => ({ ...r, author_profile: profileBy[r.user_id] || null }))
      }
      if (cancelled) return
      setLoungeDetailComments(hydrated)
      loungeDetailCommentsLoadedPostIdRef.current = postId
      setLoungeDetailCommentsLoading(false)
      if (directFocusComposer) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => expandAndFocusLoungeDetailCommentComposer({ skipScrollToTop: true }))
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    loungePostDetail?.id,
    loungeReadOnly,
    profileModalOpen,
    profileOverlayStack.length,
    supabaseClient,
    expandAndFocusLoungeDetailCommentComposer,
  ])

  /** Post detail: who the viewer follows among comment authors (session may resolve after open). */
  useEffect(() => {
    if (!loungePostDetail?.id || loungeReadOnly || loungeDetailCommentsLoading) return
    if (!composerUserId) {
      setLoungeDetailFollowingUserIds([])
      return
    }
    let cancelled = false
    ;(async () => {
      const folRes = await supabaseClient
        .from('profile_follows')
        .select('following_id')
        .eq('follower_id', composerUserId)
      if (cancelled || folRes.error) return
      setLoungeDetailFollowingUserIds((folRes.data || []).map((r) => r.following_id).filter(Boolean))
    })()
    return () => {
      cancelled = true
    }
  }, [composerUserId, loungeDetailCommentsLoading, loungePostDetail?.id, loungeReadOnly, supabaseClient])

  /** Hydrate comment likes/reposts/bookmarks when comment ids or viewer session changes — not on count-only updates. */
  useEffect(() => {
    if (!loungePostDetail?.id || loungeReadOnly || loungeDetailCommentsLoading) return
    const cids = loungeDetailCommentIdsKey ? loungeDetailCommentIdsKey.split('\0').filter(Boolean) : []
    if (!composerUserId || cids.length === 0) return
    let cancelled = false
    ;(async () => {
      const [likesRes, legacyRepostsRes, newRepostsRes, bmRes] = await Promise.all([
        supabaseClient.from('feed_comment_likes').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient.from('feed_comment_reposts').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient
          .from('community_feed_posts')
          .select('repost_of_comment_id')
          .eq('user_id', composerUserId)
          .eq('is_plain_repost', true)
          .in('repost_of_comment_id', cids),
        supabaseClient.from('feed_comment_bookmarks').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
      ])
      if (cancelled) return
      const intErr = likesRes.error?.message || legacyRepostsRes.error?.message || bmRes.error?.message
      if (intErr) {
        console.warn('feed comment interactions:', intErr)
        return
      }
      const repostedCommentIds = new Set([
        ...(legacyRepostsRes.data || []).map((r) => r.comment_id).filter(Boolean),
        ...(newRepostsRes.data || []).map((r) => r.repost_of_comment_id).filter(Boolean),
      ])
      setInteractionByComment((prev) => {
        const next = { ...prev }
        for (const id of cids) {
          const key = String(id)
          const cur = next[key] || { ...defaultInteraction }
          next[key] = {
            ...cur,
            liked: false,
            reposted: false,
            plainRepostChildId: null,
            quoteRepostChildId: null,
          }
        }
        for (const r of likesRes.data || []) {
          const cid = r.comment_id != null ? String(r.comment_id) : ''
          if (!cid || !next[cid]) continue
          next[cid] = { ...next[cid], liked: true }
        }
        for (const cid of repostedCommentIds) {
          const key = String(cid)
          if (!next[key]) continue
          next[key] = {
            ...next[key],
            reposted: true,
            plainRepostChildId: key,
            quoteRepostChildId: null,
          }
        }
        return next
      })
      setBookmarkedByComment((prev) => {
        const next = { ...prev }
        for (const id of cids) {
          next[String(id)] = false
        }
        for (const r of bmRes.data || []) {
          if (r.comment_id) next[String(r.comment_id)] = true
        }
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [
    composerUserId,
    defaultInteraction,
    loungeDetailCommentIdsKey,
    loungeDetailCommentsLoading,
    loungePostDetail?.id,
    loungeReadOnly,
    supabaseClient,
  ])

  /** Re-hydrate feed comment-repost interaction glyphs after post detail closes (shared `interactionByComment` map). */
  const loungePostDetailOpenRef = useRef(/** @type {null | string} */ (null))
  useEffect(() => {
    const postId = loungePostDetail?.id ? String(loungePostDetail.id) : null
    const wasOpen = loungePostDetailOpenRef.current
    loungePostDetailOpenRef.current = postId
    if (postId || !wasOpen) return
    if (!composerUserId || loungeReadOnly) return
    const ids = feedCommentRepostIdsKey ? feedCommentRepostIdsKey.split(',').filter(Boolean) : []
    if (ids.length === 0) return
    void hydrateCommentInteractionsForIds(ids)
  }, [
    composerUserId,
    feedCommentRepostIdsKey,
    hydrateCommentInteractionsForIds,
    loungePostDetail?.id,
    loungeReadOnly,
  ])

  const finalizeLoungePostDetailClose = useCallback(() => {
    const tid = loungePostDetailCloseFallbackTimerRef.current
    if (tid) {
      window.clearTimeout(tid)
      loungePostDetailCloseFallbackTimerRef.current = 0
    }
    const openTid = loungePostDetailOpenFallbackTimerRef.current
    if (openTid) {
      window.clearTimeout(openTid)
      loungePostDetailOpenFallbackTimerRef.current = 0
    }
    loungePostDetailPanelEnteredRef.current = true
    setLoungePostDetailPanelEntered(true)
    setLoungePostDetail(null)
    setLoungePostDetailAboveProfile(false)
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
    setLoungeDetailViewerPinnedCommentIds([])
    setLoungeDetailFollowingUserIds([])
    setLoungeDetailCommentsLoading(false)
    const commentUploadInFlight = loungeDetailCommentBackgroundUploadInFlight()
    if (!commentUploadInFlight) {
      try {
        loungeDetailCommentAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailCommentAbortRef.current = null
      loungeDetailCommentJobRunningRef.current = false
      loungeDetailCommentSnapshotRef.current = null
    }
    setLoungeDetailCommentDraft('')
    setLoungeDetailCommentErr('')
    setLoungeDetailCommentComposerExpanded(false)
    setLoungeDetailCommentDiscardPromptOpen(false)
    setLoungeDetailCommentKbOverlapPx(0)
    clearLoungeDetailCommentComposerMedia({ preserveBackgroundUpload: commentUploadInFlight })
    setLoungeCommentDetailPathIds([])
    setLoungeDetailCommentEditingId(null)
    setLoungeDetailCommentEditDraft('')
    setLoungeDetailCommentEditBusy(false)
    setLoungeDetailCommentDeleteBusyId(null)
    setLoungeDetailCommentEditImageUrls([])
    setLoungeDetailCommentEditGifUrl('')
    loungePostDetailDirectCommentOpenRef.current = null
    loungeCommentDetailDirectEntryDepthRef.current = null
    loungeCommentDetailDirectEntryAnimateRef.current = false
    loungePostDetailFocusScrollTitleLockRef.current = false
    if (loungePostDetailFocusScrollRafRef.current) {
      window.cancelAnimationFrame(loungePostDetailFocusScrollRafRef.current)
      loungePostDetailFocusScrollRafRef.current = 0
    }
    loungeDetailCommentsEffectPostIdRef.current = null
    loungeDetailCommentsLoadedPostIdRef.current = null
    loungeTitleRevealRef.current = 1
    setLoungeTitleReveal(1)
    try {
      resetPostDetailInlineSoundRef.current?.()
    } catch {
      // ignore
    }
  }, [clearLoungeDetailCommentComposerMedia, loungeDetailCommentBackgroundUploadInFlight])

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
      pauseAllLoungeStreamInlineVideos()
      if (loungeReadOnly && !opts?.fromPublicLink) {
        onRequireAuth?.()
        return
      }
      try {
        resetFeedInlineSoundRef.current?.()
      } catch {
        /* ignore */
      }
      try {
        resetPostDetailInlineSoundRef.current?.()
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
      const directOpen =
        loungePostDetailDirectCommentOpenRef.current?.postId === String(post.id)
          ? loungePostDetailDirectCommentOpenRef.current
          : null
      if (directOpen?.pathIds?.length) {
        setLoungeCommentDetailPathIds(directOpen.pathIds)
        loungeCommentDetailDirectEntryDepthRef.current = directOpen.pathIds.length
        loungePostDetailPendingCommentIdRef.current = null
        loungePostDetailPendingCommentComposerRef.current = false
      } else {
        setLoungeCommentDetailPathIds([])
        loungePostDetailPendingCommentIdRef.current = opts?.focusCommentId
          ? String(opts.focusCommentId)
          : null
        loungePostDetailPendingCommentComposerRef.current = opts?.focusCommentComposer === true
        if (opts?.focusCommentId) {
          loungeCommentDetailDirectEntryAnimateRef.current = true
        }
      }
      setLoungeDetailCommentDraft('')
      setLoungeDetailCommentErr('')
      setLoungeDetailCommentComposerExpanded(false)
      setLoungeDetailCommentEditingId(null)
      setLoungeDetailCommentEditDraft('')
      setLoungeDetailCommentEditBusy(false)
      setLoungeDetailCommentDeleteBusyId(null)
      setLoungePostDetail(post)
      setLoungePostDetailAboveProfile(profileModalOpen || profileOverlayStack.length > 0)
      if (composerUserId) {
        void refreshLoungePostInteractions([post.id])
      }
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
      const openTid = loungePostDetailOpenFallbackTimerRef.current
      if (openTid) {
        window.clearTimeout(openTid)
        loungePostDetailOpenFallbackTimerRef.current = 0
      }
      if (reduce) {
        loungePostDetailPanelEnteredRef.current = true
        setLoungePostDetailPanelEntered(true)
        setLoungePostDetailVisible(true)
        return
      }
      loungePostDetailPanelEnteredRef.current = false
      setLoungePostDetailPanelEntered(false)
      setLoungePostDetailVisible(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setLoungePostDetailVisible(true)
          loungePostDetailOpenFallbackTimerRef.current = window.setTimeout(() => {
            loungePostDetailOpenFallbackTimerRef.current = 0
            if (loungePostDetailVisibleRef.current && !loungePostDetailPanelEnteredRef.current) {
              loungePostDetailPanelEnteredRef.current = true
              setLoungePostDetailPanelEntered(true)
            }
          }, 400)
        })
      })
    },
    [composerUserId, loungeReadOnly, onRequireAuth, profileModalOpen, profileOverlayStack.length, refreshLoungePostInteractions]
  )

  /**
   * Profile / repost / deep link: prefetch comments + drill path so first paint is Reply view,
   * then smooth-scroll from top to the focused comment (see pathIds focus-scroll effect).
   */
  const openDirectCommentPostDetail = useCallback(
    async (post, commentId, { focusComposer = false, prefetchedComments = null } = {}) => {
      if (!post?.id || !commentId) return
      let parentPost = post
      if (!parentPost.user_id && !parentPost.caption) {
        const { data } = await supabaseClient
          .from('community_feed_posts')
          .select(
            'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height',
          )
          .eq('id', post.id)
          .is('hidden_at', null)
        if (data?.length) {
          const hydrated = await hydrateCommunityPosts(data)
          parentPost = hydrated?.[0] || parentPost
        }
      }

      let comments = prefetchedComments
      if (!comments) {
        try {
          comments = await fetchHydratedFeedCommentsForPost(supabaseClient, parentPost.id)
        } catch {
          openLoungePostDetail(parentPost, {
            focusCommentId: commentId,
            focusCommentComposer: focusComposer,
          })
          return
        }
      }

      const pathIds = buildFeedCommentDrillPath(commentId, comments)
      if (!pathIds.length) {
        openLoungePostDetail(parentPost, {
          focusCommentId: commentId,
          focusCommentComposer: focusComposer,
        })
        return
      }

      loungeCommentDetailDirectEntryAnimateRef.current = true
      loungePostDetailDirectCommentOpenRef.current = {
        postId: String(parentPost.id),
        pathIds,
        comments,
        focusComposer,
      }
      loungeCommentDetailDirectEntryDepthRef.current = pathIds.length
      openLoungePostDetail(parentPost)
    },
    [hydrateCommunityPosts, openLoungePostDetail, supabaseClient],
  )

  /**
   * Tap on a comment-repost feed card → open directly into Reply view with full ancestor hierarchy.
   * Prefetches comments so the first paint is comment detail, not post-only then drill.
   */
  const openCommentRepostDetail = useCallback(
    async (repostedComment, { focusComposer = false } = {}) => {
      if (!repostedComment?.post_id || !repostedComment?.id) return
      let parentPost = communityPosts.find((p) => String(p.id) === String(repostedComment.post_id))
      if (!parentPost) {
        const { data } = await supabaseClient
          .from('community_feed_posts')
          .select(
            'id,caption,game_title,game_slug,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height',
          )
          .eq('id', repostedComment.post_id)
          .is('hidden_at', null)
        if (data?.length) {
          const hydrated = await hydrateCommunityPosts(data)
          parentPost = hydrated?.[0]
        }
        if (!parentPost) {
          parentPost = { id: repostedComment.post_id }
        }
      }

      let comments = []
      try {
        comments = await fetchHydratedFeedCommentsForPost(supabaseClient, repostedComment.post_id)
      } catch {
        openLoungePostDetail(parentPost, {
          focusCommentId: repostedComment.id,
          focusCommentComposer: focusComposer,
        })
        return
      }

      await openDirectCommentPostDetail(parentPost, repostedComment.id, {
        focusComposer,
        prefetchedComments: comments,
      })
    },
    [communityPosts, hydrateCommunityPosts, openDirectCommentPostDetail, openLoungePostDetail, supabaseClient],
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
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    setLoungeDockPanel((p) => (p === 'search' ? null : 'search'))
  }, [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth])
  const onLoungeDockNotifications = useCallback(() => {
    setLoungeDockPanel((p) => (p === 'notifications' ? null : 'notifications'))
  }, [])

  const refreshLoungeNotificationsUnread = useCallback(async () => {
    if (!composerUserId || loungeFeedBrowseMode === 'anonymous') {
      setLoungeNotificationsUnread(0)
      return
    }
    try {
      const n = await loungeActivityUnreadCount(supabaseClient)
      setLoungeNotificationsUnread(n)
    } catch (e) {
      if (!isLoungeActivitySchemaMissingError(e)) {
        /* ignore transient unread errors */
      }
      setLoungeNotificationsUnread(0)
    }
  }, [composerUserId, loungeFeedBrowseMode, supabaseClient])

  useEffect(() => {
    void refreshLoungeNotificationsUnread()
    if (typeof window === 'undefined' || !composerUserId || loungeFeedBrowseMode === 'anonymous') return undefined
    const id = window.setInterval(() => void refreshLoungeNotificationsUnread(), 60_000)
    return () => window.clearInterval(id)
  }, [composerUserId, loungeFeedBrowseMode, refreshLoungeNotificationsUnread])

  const onLoungeNotificationsUnreadChange = useCallback((n) => {
    setLoungeNotificationsUnread(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
  }, [])

  const onLoungeOpenPostFromNotifications = useCallback(
    async ({ postId, commentId }) => {
      if (!postId) return
      let postRow = communityPosts.find((p) => p.id === postId)
      if (!postRow) {
        const { data, error } = await supabaseClient
          .from('community_feed_posts')
          .select(LOUNGE_SINGLE_POST_SELECT)
          .eq('id', postId)
          .is('hidden_at', null)
          .maybeSingle()
        if (error || !data) return
        const hydrated = await hydrateCommunityPosts([data])
        postRow = hydrated?.[0] || null
        if (postRow) {
          setCommunityPosts((prev) => (prev.some((p) => p.id === postRow.id) ? prev : [postRow, ...prev]))
        }
      }
      if (!postRow) return
      setLoungeDockPanel(null)
      openLoungePostDetail(postRow, commentId ? { focusCommentId: commentId } : {})
    },
    [communityPosts, hydrateCommunityPosts, openLoungePostDetail, setCommunityPosts, supabaseClient],
  )
  const onLoungeDockChat = useCallback(() => {
    setLoungeDockPanel((p) => {
      if (p === 'chat') {
        setChatDockInitialPeerUserId(null)
        return null
      }
      return 'chat'
    })
  }, [])

  const onLoungeDockSettings = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    setLoungeDockPanel((p) => (p === 'settings' ? null : 'settings'))
  }, [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth])

  const onLoungeDockCompose = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    /** Dismiss z-stacked chrome synchronously so the caption is focusable in the same user gesture (iOS keyboard). */
    if (loungePostDetail) finalizeLoungePostDetailClose()
    if (profileModalOpen) finalizeProfileModalCloseRef.current?.()

    flushSync(() => {
      setLoungeDockPanel(null)
      setChatDockInitialPeerUserId(null)
      loungeTitleRevealRef.current = 1
      setLoungeTitleReveal(1)
      composerFoldedFromFeedScrollRef.current = false
      composerFoldRevealRef.current = 1
      setComposerFoldReveal(1)
      composerExpandedRef.current = true
      setComposerExpanded(true)
      setComposerFocusToken((t) => t + 1)
    })

    scrollLoungeFeedToTopInstant()
    focusLoungeComposerCaption(() => composerTextareaRef.current, {
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
    scheduleLoungeComposerTextareaFocus({
      getTextarea: () => composerTextareaRef.current,
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
  }, [
    loungeFeedBrowseMode,
    loungeReadOnly,
    onRequireAuth,
    profileModalOpen,
    loungePostDetail,
    finalizeLoungePostDetailClose,
    scrollLoungeFeedToTopInstant,
  ])

  const loungeFollowingFilterOn = loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING

  const onLoungeFollowingFilterToggle = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous') {
      onRequireAuth?.()
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
      openLoungePostDetail(post, {})
    },
    [openLoungePostDetail]
  )

  useEffect(() => {
    if (loungePostDetail && loungeDockPanel && loungeDockPanel !== 'search') {
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

  const loungePostDetailOpenedOverSearch = Boolean(
    loungePostDetail?.id && loungeDockPanel === 'search' && !loungePostDetailAboveProfile,
  )
  const loungePostDetailShellZClass = loungePostDetailAboveProfile
    ? 'z-[102]'
    : loungePostDetailOpenedOverSearch
      ? 'z-[100]'
      : 'z-[98]'

  const loungeDetailMediaLightboxPortalClass = loungePostDetailAboveProfile
    ? 'z-[103]'
    : loungePostDetailOpenedOverSearch
      ? 'z-[101]'
      : 'z-[100]'

  const loungeDetailStreamLightboxSurface = useMemo(
    () => ({
      repostMenuPortalClass:
        loungeDetailMediaLightboxPortalClass === 'z-[103]' ? 'z-[106]' : 'z-[105]',
      repostMenuScrollRootRef: loungePostDetailScrollRef,
    }),
    [loungeDetailMediaLightboxPortalClass, loungePostDetailScrollRef],
  )

  const quoteRepostStreamLightboxSurface = useMemo(
    () => ({
      repostMenuPortalClass: 'z-[110]',
      repostMenuScrollRootRef: quoteRepostScrollRef,
    }),
    [quoteRepostScrollRef],
  )

  const onLoungePostDetailPanelTransitionEnd = useCallback(
    (e) => {
      if (e.propertyName !== 'transform') return
      if (e.target !== e.currentTarget) return
      if (loungePostDetailVisibleRef.current) {
        if (!loungePostDetailPanelEnteredRef.current) {
          const openTid = loungePostDetailOpenFallbackTimerRef.current
          if (openTid) {
            window.clearTimeout(openTid)
            loungePostDetailOpenFallbackTimerRef.current = 0
          }
          loungePostDetailPanelEnteredRef.current = true
          setLoungePostDetailPanelEntered(true)
        }
        return
      }
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

  const handleLoungePostDetailBack = useCallback(() => {
    if (loungePostDetailMenuOpen) {
      setLoungePostDetailMenuOpen(false)
      return
    }
    if (loungeDetailEditing) {
      cancelLoungeDetailEdit()
      return
    }
    if (loungeCommentDetailPathIds.length > 0) {
      const entryDepth = loungeCommentDetailDirectEntryDepthRef.current
      if (entryDepth != null && loungeCommentDetailPathIds.length <= entryDepth) {
        closeLoungePostDetail()
        return
      }
      setLoungeCommentDetailPathIds((p) => {
        const next = p.slice(0, -1)
        if (next.length === 0) {
          requestAnimationFrame(() => scrollLoungePostDetailToTopInstant())
        }
        return next
      })
      return
    }
    closeLoungePostDetail()
  }, [
    cancelLoungeDetailEdit,
    closeLoungePostDetail,
    loungeCommentDetailPathIds.length,
    loungeDetailEditing,
    loungePostDetailMenuOpen,
    scrollLoungePostDetailToTopInstant,
  ])

  const resetPostDetailInlineSound = useCallback(() => {
    try {
      resetPostDetailInlineSoundRef.current?.()
    } catch {
      // ignore
    }
  }, [])

  const buildLoungeCommentDrillPath = useCallback(
    (commentId) => buildFeedCommentDrillPath(commentId, loungeDetailComments),
    [loungeDetailComments],
  )

  const openLoungeCommentDetail = useCallback(
    (comment, { focusComposer = false } = {}) => {
      if (!comment?.id) return
      pauseAllLoungeStreamInlineVideos()
      if (loungeReadOnly) {
        requireLoungeAuth()
        return
      }
      if (openProfileGateIfNeeded()) return
      const chain = buildLoungeCommentDrillPath(comment.id)
      if (!chain.length) return
      setLoungePostDetailMenuOpen(false)
      cancelLoungeDetailEdit()
      cancelLoungeDetailCommentEdit()
      if (!focusComposer) collapseLoungeDetailCommentComposer()
      else loungePostDetailPendingCommentComposerRef.current = true
      resetPostDetailInlineSound()
      setLoungeCommentDetailPathIds(chain)
    },
    [
      buildLoungeCommentDrillPath,
      cancelLoungeDetailCommentEdit,
      cancelLoungeDetailEdit,
      collapseLoungeDetailCommentComposer,
      loungeReadOnly,
      openProfileGateIfNeeded,
      requireLoungeAuth,
      resetPostDetailInlineSound,
    ],
  )

  const openLoungeCommentDrillFromRoots = useCallback(
    (comment) => openLoungeCommentDetail(comment, { focusComposer: false }),
    [openLoungeCommentDetail],
  )

  const drillDeeperIntoLoungeComment = useCallback(
    (comment) => openLoungeCommentDetail(comment, { focusComposer: false }),
    [openLoungeCommentDetail],
  )

  const navigateLoungeCommentDetailToPathIndex = useCallback(
    (pathIndex) => {
      loungeCommentDetailDirectEntryDepthRef.current = null
      setLoungeCommentDetailPathIds((prev) => {
        if (pathIndex < 0 || pathIndex >= prev.length) return prev
        return prev.slice(0, pathIndex + 1)
      })
      cancelLoungeDetailCommentEdit()
      resetPostDetailInlineSound()
    },
    [cancelLoungeDetailCommentEdit, resetPostDetailInlineSound],
  )

  const exitLoungeCommentDetailToPostView = useCallback(() => {
    loungeCommentDetailDirectEntryDepthRef.current = null
    setLoungeCommentDetailPathIds([])
    setLoungePostDetailMenuOpen(false)
    cancelLoungeDetailCommentEdit()
    requestAnimationFrame(() => scrollLoungePostDetailToTopInstant())
  }, [cancelLoungeDetailCommentEdit, scrollLoungePostDetailToTopInstant])

  const onLoungeCommentReplyInteraction = useCallback(
    (comment) => openLoungeCommentDetail(comment, { focusComposer: true }),
    [openLoungeCommentDetail],
  )

  const openLoungeStreamLightboxDetail = useCallback(
    (hostPost, mediaPost, { focusComposer = false } = {}) => {
      if (openProfileGateIfNeeded()) return
      const { displayEntity } = loungeStreamLightboxMediaSource(hostPost, mediaPost)
      if (isFeedCommentEntity(displayEntity)) {
        if (loungePostDetail?.id && String(loungePostDetail.id) === String(displayEntity.post_id)) {
          openLoungeCommentDetail(displayEntity, { focusComposer })
          return
        }
        void openCommentRepostDetail(displayEntity, { focusComposer })
        return
      }
      const targetPost = displayEntity || mediaPost || hostPost
      if (!targetPost?.id) return
      if (loungePostDetail?.id && String(loungePostDetail.id) === String(targetPost.id)) {
        if (focusComposer) expandAndFocusLoungeDetailCommentComposer()
        return
      }
      openLoungePostDetail(
        targetPost,
        focusComposer ? { focusCommentComposer: true } : {},
      )
    },
    [
      openProfileGateIfNeeded,
      loungePostDetail?.id,
      openLoungeCommentDetail,
      openCommentRepostDetail,
      expandAndFocusLoungeDetailCommentComposer,
      openLoungePostDetail,
    ],
  )

  const openLoungeCommentStreamLightboxDetail = useCallback(
    (comment, _media, { focusComposer = false } = {}) => {
      if (!comment?.id) return
      if (openProfileGateIfNeeded()) return
      if (focusComposer) onLoungeCommentReplyInteraction(comment)
      else openLoungeCommentDetail(comment, { focusComposer: false })
    },
    [openProfileGateIfNeeded, onLoungeCommentReplyInteraction, openLoungeCommentDetail],
  )

  useEffect(() => {
    if (loungeCommentDetailPathIds.length === 0 || loungeDetailCommentsLoading) return
    if (!loungePostDetailPanelEntered) return
    resetPostDetailInlineSound()
    const animate = loungeCommentDetailDirectEntryAnimateRef.current
    if (animate) loungeCommentDetailDirectEntryAnimateRef.current = false
    const run = () => scheduleLoungePostDetailFocusScroll({ animate })
    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(run)
      })
    } else {
      run()
    }
    return () => {
      if (loungePostDetailFocusScrollRafRef.current) {
        window.cancelAnimationFrame(loungePostDetailFocusScrollRafRef.current)
        loungePostDetailFocusScrollRafRef.current = 0
      }
    }
  }, [
    loungeCommentDetailPathIds,
    loungeDetailCommentsLoading,
    loungePostDetailPanelEntered,
    resetPostDetailInlineSound,
    scheduleLoungePostDetailFocusScroll,
  ])

  /** Post detail opened from feed/lightbox with composer focus (no comment drill). */
  useEffect(() => {
    if (!loungePostDetail?.id) return
    if (loungePostDetailPendingCommentIdRef.current) return
    if (loungeCommentDetailPathIds.length > 0) return
    if (!loungePostDetailPendingCommentComposerRef.current) return
    loungePostDetailPendingCommentComposerRef.current = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => expandAndFocusLoungeDetailCommentComposer())
    })
  }, [
    loungePostDetail?.id,
    loungeCommentDetailPathIds.length,
    expandAndFocusLoungeDetailCommentComposer,
  ])

  /** After comment drill-in, expand reply composer when requested (feed reply or profile Replies bar). */
  useEffect(() => {
    if (loungeCommentDetailPathIds.length === 0 || loungeDetailCommentsLoading) return
    if (!loungePostDetailPendingCommentComposerRef.current) return
    loungePostDetailPendingCommentComposerRef.current = false
    requestAnimationFrame(() => {
      requestAnimationFrame(() => expandAndFocusLoungeDetailCommentComposer({ skipScrollToTop: true }))
    })
  }, [
    loungeCommentDetailPathIds.length,
    loungeDetailCommentsLoading,
    expandAndFocusLoungeDetailCommentComposer,
  ])

  /** Profile Replies tab: open post detail first, then drill to the reply once comments are loaded. */
  useEffect(() => {
    const pendingId = loungePostDetailPendingCommentIdRef.current
    if (!pendingId || !loungePostDetail?.id || loungeDetailCommentsLoading) return
    const row = loungeDetailComments.find((c) => String(c.id) === pendingId)
    if (!row) return
    const focusComposer = loungePostDetailPendingCommentComposerRef.current
    loungePostDetailPendingCommentIdRef.current = null
    if (!focusComposer) loungePostDetailPendingCommentComposerRef.current = false
    openLoungeCommentDetail(row, { focusComposer })
  }, [
    loungePostDetail?.id,
    loungeDetailComments,
    loungeDetailCommentsLoading,
    openLoungeCommentDetail,
  ])

  /** Profile Replies ⋯ → Edit: start inline edit once the post’s comments are loaded. */
  useEffect(() => {
    const pendingEditId = loungePostDetailPendingCommentEditRef.current
    if (!pendingEditId || !loungePostDetail?.id || loungeDetailCommentsLoading) return
    const row = loungeDetailComments.find((c) => String(c.id) === pendingEditId)
    if (!row) return
    loungePostDetailPendingCommentEditRef.current = null
    onCommentMenuEditFromDetail(row)
  }, [
    loungePostDetail?.id,
    loungeDetailComments,
    loungeDetailCommentsLoading,
    onCommentMenuEditFromDetail,
  ])

  const loungeDetailDescendantCountByCommentId = useMemo(
    () => feedCommentDescendantCountById(loungeDetailComments),
    [loungeDetailComments],
  )

  const loungeDetailCommentHierarchyFocusId = useMemo(
    () =>
      loungeCommentDetailPathIds.length > 0
        ? loungeCommentDetailPathIds[loungeCommentDetailPathIds.length - 1]
        : null,
    [loungeCommentDetailPathIds],
  )

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
        onRequireAuth?.()
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
      for (const mediaUrl of collectLoungeFeedStoredMediaUrls(loungePostDetail)) {
        await deleteLoungeFeedMediaFromPublicUrl(supabaseClient, mediaUrl)
      }
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
      for (const mediaUrl of collectLoungeFeedStoredMediaUrls(loungePostDetail)) {
        await deleteLoungeFeedMediaFromPublicUrl(supabaseClient, mediaUrl)
      }
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
        for (const mediaUrl of collectLoungeFeedStoredMediaUrls(post)) {
          await deleteLoungeFeedMediaFromPublicUrl(supabaseClient, mediaUrl)
        }
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
        for (const mediaUrl of collectLoungeFeedStoredMediaUrls(post)) {
          await deleteLoungeFeedMediaFromPublicUrl(supabaseClient, mediaUrl)
        }
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
      if (loungeDetailCommentEditingId) {
        e.preventDefault()
        cancelLoungeDetailCommentEdit()
        return
      }
      closeLoungePostDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    cancelLoungeDetailCommentEdit,
    cancelLoungeDetailEdit,
    closeLoungePostDetail,
    loungeDetailCommentEditingId,
    loungeDetailEditing,
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
          .select('user_id,handle,display_name,avatar_url,bio,about_me,banner_url,location,created_at,role,handle_changed_at,is_og')
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
    if (!composerUserId) {
      setLoungeFollowingUserIds(new Set())
      return
    }
    let cancelled = false
    supabaseClient
      .from('profile_follows')
      .select('following_id')
      .eq('follower_id', composerUserId)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setLoungeFollowingUserIds(new Set((data || []).map((r) => r.following_id).filter(Boolean)))
      })
    return () => {
      cancelled = true
    }
  }, [composerUserId, supabaseClient])

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
    const snap = opts.pendingSnapshot ?? loungePostSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = loungeSubmitSnapshotBlobUrls(snap)
    if (pendingPoster.startsWith('blob:')) {
      const sl = composerVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      if (!loungeBackgroundSubmitBusy()) {
        const h = composerVideoPrepHandoffRef.current
        if (h && !h.settled) {
          try {
            h.reject(new DOMException('Aborted', 'AbortError'))
          } catch {
            // ignore
          }
        }
        composerVideoPrepJobIdRef.current += 1
        try {
          composerVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        composerVideoPrepAbortRef.current = null
        composerVideoPrepHandoffRef.current = null
      }
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
    const snap = opts.pendingSnapshot ?? loungePostSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = loungeSubmitSnapshotBlobUrls(snap)
    if (pendingPoster.startsWith('blob:')) {
      const sl = quoteRepostVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      if (!loungeBackgroundSubmitBusy()) {
        const h = quoteRepostVideoPrepHandoffRef.current
        if (h && !h.settled) {
          try {
            h.reject(new DOMException('Aborted', 'AbortError'))
          } catch {
            // ignore
          }
        }
        quoteRepostVideoPrepJobIdRef.current += 1
        try {
          quoteRepostVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        quoteRepostVideoPrepAbortRef.current = null
        quoteRepostVideoPrepHandoffRef.current = null
      }
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
    try {
      loungeDetailCommentAbortRef.current?.abort()
    } catch {
      // ignore
    }
    loungePostAbortRef.current = null
    loungeDetailCommentAbortRef.current = null
    loungePostJobRunningRef.current = false
    loungeDetailCommentJobRunningRef.current = false
    loungePostUploadLastPhaseRef.current = ''
    setLoungePostUploadFailureDetails(null)
    setLoungePostUploadBar(null)
    const commentSnapForPrep = loungeDetailCommentSnapshotRef.current
    if (commentSnapForPrep?.awaitingDetailCommentVideoPrepJobId != null) {
      const h = loungeDetailCommentVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      loungeDetailCommentVideoPrepHandoffRef.current = null
      loungeDetailCommentVideoPrepJobIdRef.current += 1
      try {
        loungeDetailCommentVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailCommentVideoPrepAbortRef.current = null
      loungeDetailCommentVideoLastEncodedFileRef.current = null
    }
    const snap = loungePostSnapshotRef.current
    if (snap?.awaitingComposerVideoPrepJobId != null) {
      if (String(snap.quoteRepostOfPostId || '').trim()) {
        const qh = quoteRepostVideoPrepHandoffRef.current
        if (qh && !qh.settled) {
          try {
            qh.reject(new DOMException('Aborted', 'AbortError'))
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
      } else {
        const ch = composerVideoPrepHandoffRef.current
        if (ch && !ch.settled) {
          try {
            ch.reject(new DOMException('Aborted', 'AbortError'))
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
    const commentSnap = loungeDetailCommentSnapshotRef.current
    if (commentSnap) {
      setLoungeDetailCommentDraft(String(commentSnap.body || ''))
      setLoungeDetailCommentMediaUrl(String(commentSnap.gifOnlyUrl || ''))
      loungeDetailCommentSnapshotRef.current = null
    }
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
    async (jobOrSnapshot) => {
      const job =
        jobOrSnapshot != null &&
        typeof jobOrSnapshot === 'object' &&
        Object.prototype.hasOwnProperty.call(jobOrSnapshot, 'snapshot')
          ? jobOrSnapshot
          : { snapshot: jobOrSnapshot, videoPrep: undefined }
      const snapshot = job.snapshot
      const isQueuedJob = Boolean(job?.id)
      const prepSource = String(snapshot.quoteRepostOfPostId || '').trim() ? 'quote' : 'composer'
      const lastEncRef =
        prepSource === 'quote' ? quoteRepostVideoLastEncodedFileRef : composerVideoLastEncodedFileRef
      const submissionHasVideo = loungeSubmissionSnapshotIncludesVideo(snapshot)
      const uidBar = String(snapshot.streamVideoUid || '').trim()
      const mediaUploadBarSkin =
        submissionHasVideo &&
        !uidBar &&
        (snapshot.awaitingComposerVideoPrepJobId != null || Boolean(snapshot.videoPrepSpec))
      const prepHudId = snapshot.awaitingComposerVideoPrepJobId ?? 0

      loungePostSnapshotRef.current = snapshot
      loungePostJobRunningRef.current = true
      bumpLoungeSubmitInFlight(1)
      loungePostUploadLastPhaseRef.current = ''
      setLoungePostUploadFailureDetails(null)
      const ac = new AbortController()
      loungePostAbortRef.current = ac

      if (submissionHasVideo) {
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
      }

      let snap = { ...snapshot }
      try {
        if (snapshotNeedsBackgroundVideoPrep(snap)) {
          loungePostUploadLastPhaseRef.current = 'Waiting for video'
          if (submissionHasVideo) {
            setLoungePostUploadBar((prev) => ({
              ...(mediaUploadBarSkin
                ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
                : { mode: 'post' }),
              progress:
                mediaUploadBarSkin && typeof prev?.progress === 'number' ? Math.max(0.06, prev.progress) : 0.06,
              status: 'Waiting for video',
              detail: mediaUploadBarSkin && prev?.detail ? prev.detail : '',
            }))
          }

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

          const priorParallel = await awaitQueuedVideoPrepForJob(job)
          if (priorParallel) {
            out = priorParallel
          } else if (!isQueuedJob && lastEncRef.current && snap.videoPrepSpec) {
            const reuse = lastEncRef.current
            const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
              supabaseClient,
              signal: ac.signal,
              uploadFile: reuse,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
            lastEncRef.current = null
            out = { encodedFile: reuse, streamVideoUid }
          } else {
            out = await resolveLoungeSubmissionVideoPrep({
              snapshot: snap,
              supabaseClient,
              signal: ac.signal,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
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
          if (snapshot.awaitingComposerVideoPrepJobId != null || snapshot._capturedPrepHandoff?.jobId != null) {
            const handoffJobId =
              snapshot.awaitingComposerVideoPrepJobId ?? snapshot._capturedPrepHandoff?.jobId
            const href =
              prepSource === 'quote' ? quoteRepostVideoPrepHandoffRef : composerVideoPrepHandoffRef
            if (href.current?.jobId === handoffJobId) {
              href.current = null
            }
          }
        }

        await executeLoungeCommunityPostSubmission({
          supabaseClient,
          snapshot: snap,
          signal: ac.signal,
          onProgress: submissionHasVideo
            ? (info) => {
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
              }
            : undefined,
          rateLimitMessage,
          onUploadDiagnostic: submissionHasVideo
            ? (detail) => {
                if (ac.signal.aborted) return
                const d = String(detail || '').trim()
                if (!d) return
                setLoungePostUploadBar((prev) =>
                  prev ? { ...prev, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL } : prev,
                )
              }
            : undefined,
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
        loungePostAbortRef.current = null
        loungePostJobRunningRef.current = false
        bumpLoungeSubmitInFlight(-1)
      }
    },
    [loadCommunityFeed, rateLimitMessage, refreshLoungePostInteractions, supabaseClient, bumpLoungeSubmitInFlight],
  )
  runBackgroundLoungePostSubmissionRef.current = runBackgroundLoungePostSubmission

  const runBackgroundLoungeDetailCommentSubmission = useCallback(
    async (jobOrSnapshot) => {
      const job =
        jobOrSnapshot != null &&
        typeof jobOrSnapshot === 'object' &&
        Object.prototype.hasOwnProperty.call(jobOrSnapshot, 'snapshot')
          ? jobOrSnapshot
          : { snapshot: jobOrSnapshot, videoPrep: undefined }
      const snapshot = job.snapshot
      const isQueuedJob = Boolean(job?.id)
      const submissionHasVideo = loungeSubmissionSnapshotIncludesVideo(snapshot)
      const uidBar = String(snapshot.streamVideoUid || '').trim()
      const mediaUploadBarSkin =
        submissionHasVideo &&
        !uidBar &&
        (snapshot.awaitingDetailCommentVideoPrepJobId != null || Boolean(snapshot.videoPrepSpec))
      const prepHudId = snapshot.awaitingDetailCommentVideoPrepJobId ?? 0

      loungeDetailCommentSnapshotRef.current = snapshot
      loungeDetailCommentJobRunningRef.current = true
      bumpLoungeSubmitInFlight(1)
      loungePostUploadLastPhaseRef.current = ''
      const ac = new AbortController()
      loungeDetailCommentAbortRef.current = ac

      if (submissionHasVideo) {
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
          return { mode: 'post', progress: 0, status: 'Publishing reply', detail: '' }
        })
      }

      let snap = { ...snapshot }
      try {
        if (snapshotNeedsBackgroundVideoPrep(snap)) {
          loungePostUploadLastPhaseRef.current = 'Waiting for video'
          if (submissionHasVideo) {
            setLoungePostUploadBar((prev) => ({
              ...(mediaUploadBarSkin
                ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
                : { mode: 'post' }),
              progress:
                mediaUploadBarSkin && typeof prev?.progress === 'number' ? Math.max(0.06, prev.progress) : 0.06,
              status: 'Waiting for video',
              detail: mediaUploadBarSkin && prev?.detail ? prev.detail : '',
            }))
          }

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

          /** @type {{ encodedFile: File, streamVideoUid: string }} */
          let out
          const priorParallel = await awaitQueuedVideoPrepForJob(job)
          if (priorParallel) {
            out = priorParallel
          } else if (!isQueuedJob && loungeDetailCommentVideoLastEncodedFileRef.current && snap.videoPrepSpec) {
            const reuse = loungeDetailCommentVideoLastEncodedFileRef.current
            const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
              supabaseClient,
              signal: ac.signal,
              uploadFile: reuse,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
            loungeDetailCommentVideoLastEncodedFileRef.current = null
            out = { encodedFile: reuse, streamVideoUid }
          } else {
            out = await resolveLoungeSubmissionVideoPrep({
              snapshot: snap,
              supabaseClient,
              signal: ac.signal,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
          }
          snap = {
            ...snap,
            videoFile: out.encodedFile,
            streamVideoUid: out.streamVideoUid,
            awaitingDetailCommentVideoPrepJobId: null,
          }
          loungeDetailCommentSnapshotRef.current = snap
          const pend =
            typeof snap.sessionStreamPosterBlobUrl === 'string' ? snap.sessionStreamPosterBlobUrl.trim() : ''
          const nu = String(snap.streamVideoUid || '').trim()
          if (nu && pend.startsWith('blob:')) {
            pinLoungeStreamSessionPoster(nu, pend)
          }
          if (
            snapshot.awaitingDetailCommentVideoPrepJobId != null ||
            snapshot._capturedPrepHandoff?.jobId != null
          ) {
            const handoffJobId =
              snapshot.awaitingDetailCommentVideoPrepJobId ?? snapshot._capturedPrepHandoff?.jobId
            const href = loungeDetailCommentVideoPrepHandoffRef
            if (href.current?.jobId === handoffJobId) {
              href.current = null
            }
          }
        }

        const data = await executeLoungeCommentSubmission({
          supabaseClient,
          snapshot: {
            body: snap.body,
            gifOnlyUrl: snap.gifOnlyUrl,
            imageFiles: snap.imageFiles,
            videoFile: snap.videoFile,
            streamVideoUid: snap.streamVideoUid,
            sessionStreamPosterBlobUrl: snap.sessionStreamPosterBlobUrl,
            postId: snap.postId,
            parentId: snap.parentId,
            userId: snap.userId,
          },
          signal: ac.signal,
          onProgress: submissionHasVideo
            ? (info) => {
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
              }
            : undefined,
          onUploadDiagnostic: submissionHasVideo
            ? (detail) => {
                if (ac.signal.aborted) return
                const d = String(detail || '').trim()
                if (!d) return
                setLoungePostUploadBar((prev) =>
                  prev ? { ...prev, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL } : prev,
                )
              }
            : undefined,
        })

        loungeDetailCommentSnapshotRef.current = null
        const pr = await supabaseClient
          .from('profiles')
          .select('user_id,handle,display_name,avatar_url,role,is_og')
          .eq('user_id', snap.userId)
          .maybeSingle()
        const row = { ...data, author_profile: pr.data || composerUserProfile || null }
        if (row.id) {
          setLoungeDetailViewerPinnedCommentIds((ids) =>
            ids[0] === row.id ? ids : [row.id, ...ids.filter((id) => id !== row.id)],
          )
        }
        setLoungeDetailComments((c) => {
          const withNew = c.some((r) => r.id === row.id) ? c : [...c, row]
          return snap.parentId
            ? bumpFeedCommentAncestorCountsInList(withNew, snap.parentId, 1)
            : withNew
        })
        const { data: countRow } = await supabaseClient
          .from('community_feed_posts')
          .select('comment_count')
          .eq('id', snap.postId)
          .maybeSingle()
        if (countRow && typeof countRow.comment_count === 'number') {
          patchPostAggregate(snap.postId, { comment_count: countRow.comment_count })
          setLoungePostDetail((prev) =>
            prev?.id === snap.postId ? { ...prev, comment_count: countRow.comment_count } : prev,
          )
        }
        setInteractionByPost((prev) => {
          const cur = prev[snap.postId] || defaultInteraction
          return { ...prev, [snap.postId]: { ...cur, commented: true } }
        })
        scheduleLoungePostDetailTitleAfterReply()
        if (snap.parentId) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => scrollLoungePostDetailToFocusedComment())
          })
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
        const curSnap = loungeDetailCommentSnapshotRef.current
        if (curSnap?.awaitingDetailCommentVideoPrepJobId != null) {
          loungeDetailCommentSnapshotRef.current = { ...curSnap, awaitingDetailCommentVideoPrepJobId: null }
        }
        if (String(snap.streamVideoUid || '').trim()) {
          loungeDetailCommentSnapshotRef.current = snap
        }
        if (Array.isArray(snap.commentDetailPathIds) && snap.commentDetailPathIds.length > 0) {
          setLoungeCommentDetailPathIds((prev) =>
            prev.length > 0 ? prev : snap.commentDetailPathIds,
          )
        }
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Could not post reply.'
        setLoungeDetailCommentErr(msg)
        setLoungePostUploadFailureDetails({
          kind: 'comment',
          phase: loungePostUploadLastPhaseRef.current || '(no step recorded)',
          message: msg,
        })
        setLoungePostUploadFailedOpen(true)
      } finally {
        loungeDetailCommentAbortRef.current = null
        loungeDetailCommentJobRunningRef.current = false
        bumpLoungeSubmitInFlight(-1)
      }
    },
    [
      composerUserProfile,
      defaultInteraction,
      patchPostAggregate,
      scheduleLoungePostDetailTitleAfterReply,
      scrollLoungePostDetailToFocusedComment,
      supabaseClient,
      bumpLoungeSubmitInFlight,
    ],
  )
  runBackgroundLoungeDetailCommentSubmissionRef.current = runBackgroundLoungeDetailCommentSubmission

  /** Text/image/GIF-only submits — run in parallel without blocking the video queue. */
  const runFastLaneLoungeSubmit = useCallback(
    async (type, snapshot) => {
      loungeFastLaneInFlightRef.current += 1
      bumpLoungeSubmitInFlight(1)
      const ac = new AbortController()
      try {
        if (type === 'comment') {
          const snap = snapshot
          const data = await executeLoungeCommentSubmission({
            supabaseClient,
            snapshot: {
              body: snap.body,
              gifOnlyUrl: snap.gifOnlyUrl,
              imageFiles: snap.imageFiles,
              videoFile: snap.videoFile,
              streamVideoUid: snap.streamVideoUid,
              sessionStreamPosterBlobUrl: snap.sessionStreamPosterBlobUrl,
              postId: snap.postId,
              parentId: snap.parentId,
              userId: snap.userId,
            },
            signal: ac.signal,
          })
          const pr = await supabaseClient
            .from('profiles')
            .select('user_id,handle,display_name,avatar_url,role,is_og')
            .eq('user_id', snap.userId)
            .maybeSingle()
          const row = { ...data, author_profile: pr.data || composerUserProfile || null }
          if (row.id) {
            setLoungeDetailViewerPinnedCommentIds((ids) =>
              ids[0] === row.id ? ids : [row.id, ...ids.filter((id) => id !== row.id)],
            )
          }
          setLoungeDetailComments((c) => {
            const withNew = c.some((r) => r.id === row.id) ? c : [...c, row]
            return snap.parentId
              ? bumpFeedCommentAncestorCountsInList(withNew, snap.parentId, 1)
              : withNew
          })
          const { data: countRow } = await supabaseClient
            .from('community_feed_posts')
            .select('comment_count')
            .eq('id', snap.postId)
            .maybeSingle()
          if (countRow && typeof countRow.comment_count === 'number') {
            patchPostAggregate(snap.postId, { comment_count: countRow.comment_count })
            setLoungePostDetail((prev) =>
              prev?.id === snap.postId ? { ...prev, comment_count: countRow.comment_count } : prev,
            )
          }
          setInteractionByPost((prev) => {
            const cur = prev[snap.postId] || defaultInteraction
            return { ...prev, [snap.postId]: { ...cur, commented: true } }
          })
          scheduleLoungePostDetailTitleAfterReply()
          if (snap.parentId) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => scrollLoungePostDetailToFocusedComment())
            })
          }
        } else {
          await executeLoungeCommunityPostSubmission({
            supabaseClient,
            snapshot,
            signal: ac.signal,
            rateLimitMessage,
          })
          await loadCommunityFeed({ silent: true })
          const quoteOrigId = String(snapshot.quoteRepostOfPostId || '').trim()
          if (quoteOrigId) {
            await refreshLoungePostInteractions([quoteOrigId])
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError') return
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Could not post right now.'
        if (msg === LOUNGE_MAX_PINNED_ALERT && typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
        deferOrShowFastLaneFailure(
          type === 'comment' ? 'comment' : 'post',
          snapshot,
          'Publishing',
          msg,
        )
      } finally {
        loungeFastLaneInFlightRef.current = Math.max(0, loungeFastLaneInFlightRef.current - 1)
        bumpLoungeSubmitInFlight(-1)
        dismissLoungePostUploadBarIfIdle()
      }
    },
    [
      bumpLoungeSubmitInFlight,
      composerUserProfile,
      defaultInteraction,
      deferOrShowFastLaneFailure,
      dismissLoungePostUploadBarIfIdle,
      loadCommunityFeed,
      patchPostAggregate,
      rateLimitMessage,
      refreshLoungePostInteractions,
      scheduleLoungePostDetailTitleAfterReply,
      scrollLoungePostDetailToFocusedComment,
      supabaseClient,
    ],
  )
  const runFastLaneLoungeSubmitRef = useRef(runFastLaneLoungeSubmit)
  runFastLaneLoungeSubmitRef.current = runFastLaneLoungeSubmit

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
    if (fail?.kind === 'comment') {
      const commentSnap = loungeDetailCommentSnapshotRef.current
      setLoungePostUploadFailureDetails(null)
      if (!commentSnap) return
      if (Array.isArray(commentSnap.commentDetailPathIds) && commentSnap.commentDetailPathIds.length > 0) {
        setLoungeCommentDetailPathIds(commentSnap.commentDetailPathIds)
      }
      void runBackgroundLoungeDetailCommentSubmissionRef.current(commentSnap)
      return
    }
    const snap = loungePostSnapshotRef.current
    setLoungePostUploadFailureDetails(null)
    if (!snap) return
    void runBackgroundLoungePostSubmission(snap)
  }, [runBackgroundLoungePostSubmission, startComposerVideoPrepFromSpec, startQuoteRepostVideoPrepFromSpec])

  /**
   * Resume composer/quote/comment video prep slots deferred while the submit queue owned the bar.
   */
  const resumeDeferredVideoPrepSlots = useCallback(() => {
    const composerSlot = composerVideoSlotRef.current
    const composerSpec = composerVideoPrepSpecRef.current
    if (composerSlot?.prepStatus === 'queued' && composerSpec) {
      startComposerVideoPrepFromSpec(composerSpec, {
        file: composerSpec.kind === 'direct' ? composerSpec.file : composerSlot.file,
        posterUrl: composerSlot.posterUrl,
        preview: composerSlot.preview,
        streamVideoUid: composerSlot.streamVideoUid ?? null,
        prepError: '',
      })
    }
    const quoteSlot = quoteRepostVideoSlotRef.current
    const quoteSpec = quoteRepostVideoPrepSpecRef.current
    if (quoteSlot?.prepStatus === 'queued' && quoteSpec) {
      startQuoteRepostVideoPrepFromSpec(quoteSpec, {
        file: quoteSpec.kind === 'direct' ? quoteSpec.file : quoteSlot.file,
        posterUrl: quoteSlot.posterUrl,
        preview: quoteSlot.preview,
        streamVideoUid: quoteSlot.streamVideoUid ?? null,
        prepError: '',
      })
    }
    const commentSlot = loungeDetailCommentVideoSlotRef.current
    const commentSpec = loungeDetailCommentVideoPrepSpecRef.current
    if (commentSlot?.prepStatus === 'queued' && commentSpec) {
      startLoungeDetailCommentVideoPrepFromSpec(commentSpec, {
        file: commentSpec.kind === 'direct' ? commentSpec.file : commentSlot.file,
        posterUrl: commentSlot.posterUrl,
        preview: commentSlot.preview,
        streamVideoUid: commentSlot.streamVideoUid ?? null,
        prepError: '',
      })
    }
  }, [
    startComposerVideoPrepFromSpec,
    startLoungeDetailCommentVideoPrepFromSpec,
    startQuoteRepostVideoPrepFromSpec,
  ])

  /**
   * Drain the video submit queue — DB insert stays sequential; waiting jobs prep/upload in parallel.
   * Fast-lane posts (text/image/GIF) bypass this loop entirely.
   */
  const drainLoungeSubmitQueue = useCallback(async () => {
    try {
      while (loungeSubmitQueueRef.current.length > 0) {
        startParallelQueuedVideoPrepForWaitingJobs(loungeSubmitQueueRef.current, supabaseClient)
        const job = loungeSubmitQueueRef.current[0]
        const batch = loungeSubmitQueueBatchRef.current
        setLoungeSubmitQueueDisplay({ index: batch.completed + 1, total: batch.total })
        if (job.type === 'post' || job.type === 'quote') {
          await runBackgroundLoungePostSubmissionRef.current?.(job)
        } else {
          await runBackgroundLoungeDetailCommentSubmissionRef.current?.(job)
        }
        loungeSubmitQueueRef.current.shift()
        loungeSubmitQueueBatchRef.current = {
          total: loungeSubmitQueueBatchRef.current.total,
          completed: loungeSubmitQueueBatchRef.current.completed + 1,
        }
        const nextJob = loungeSubmitQueueRef.current[0]
        if (!nextJob || !loungeSubmissionSnapshotIncludesVideo(nextJob.snapshot)) {
          dismissLoungePostUploadBarIfIdle()
        }
      }
    } finally {
      loungeSubmitQueueRunningRef.current = false
      loungeSubmitQueueBatchRef.current = { total: 0, completed: 0 }
      setLoungeSubmitQueueDisplay({ index: 0, total: 0 })
      dismissLoungePostUploadBarIfIdle()
      resumeDeferredVideoPrepSlots()
      flushPendingFastLaneFailure()
    }
  }, [dismissLoungePostUploadBarIfIdle, flushPendingFastLaneFailure, resumeDeferredVideoPrepSlots, supabaseClient])

  /** Video jobs queue; text/image/GIF run immediately on the fast lane. */
  const enqueueAndRunLoungeSubmit = useCallback(
    (type, snapshot) => {
      if (!loungeSubmissionSnapshotIncludesVideo(snapshot)) {
        void runFastLaneLoungeSubmitRef.current(type, snapshot)
        return
      }

      loungeSubmitQueueBatchRef.current = {
        total: loungeSubmitQueueBatchRef.current.total + 1,
        completed: loungeSubmitQueueBatchRef.current.completed,
      }
      const id = `lsq-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const job = { id, type, snapshot }
      loungeSubmitQueueRef.current.push(job)
      // Mark running before returning so a rapid second submit cannot overwrite snapshot refs.
      if (loungeSubmitQueueRunningRef.current) {
        startParallelQueuedVideoPrep(job, supabaseClient)
        setLoungeSubmitQueueDisplay((prev) => ({
          index: prev.index,
          total: loungeSubmitQueueBatchRef.current.total,
        }))
      } else {
        loungeSubmitQueueRunningRef.current = true
        void drainLoungeSubmitQueue()
      }
    },
    [drainLoungeSubmitQueue, supabaseClient],
  )
  enqueueAndRunLoungeSubmitRef.current = enqueueAndRunLoungeSubmit

  const onLoungePostUploadSaveDraft = useCallback(() => {
    const fail = loungePostUploadFailureDetailsRef.current
    if (fail?.kind === 'comment') {
      const commentSnap = loungeDetailCommentSnapshotRef.current
      if (commentSnap) {
        if (Array.isArray(commentSnap.commentDetailPathIds) && commentSnap.commentDetailPathIds.length > 0) {
          setLoungeCommentDetailPathIds(commentSnap.commentDetailPathIds)
        }
        setLoungeDetailCommentDraft(String(commentSnap.body || ''))
        setLoungeDetailCommentMediaUrl(String(commentSnap.gifOnlyUrl || ''))
        setLoungeDetailCommentErr('Reply draft restored. Re-add photos or video if you had any.')
        const cUid = String(commentSnap.streamVideoUid || '').trim()
        if (
          cUid &&
          typeof commentSnap.sessionStreamPosterBlobUrl === 'string' &&
          commentSnap.sessionStreamPosterBlobUrl.startsWith('blob:')
        ) {
          releaseLoungeStreamSessionPoster(cUid)
        }
      }
      loungeDetailCommentSnapshotRef.current = null
      loungeDetailCommentJobRunningRef.current = false
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      setLoungeDetailCommentComposerExpanded(true)
      return
    }
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
        onRequireAuth?.()
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
      const specForSnap =
        hasVideo && !uid && composerVideoPrepSpecRef.current
          ? composerVideoPrepSpecRef.current
          : null
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
        // Capture prep handoff by reference so queued jobs don't race on the shared ref
        _capturedPrepHandoff: composerVideoPrepHandoffRef.current ?? null,
      }
    } finally {
      setPostBusy(false)
    }

    if (!snapshot) return

    const preserveVideoPrep = snapshot.awaitingComposerVideoPrepJobId != null
    if (shouldAssignLoungePostSnapshotRef()) {
      loungePostSnapshotRef.current = snapshot
    }
    const posterBlob =
      typeof snapshot.sessionStreamPosterBlobUrl === 'string'
        ? snapshot.sessionStreamPosterBlobUrl.trim()
        : ''
    const postUid = String(snapshot.streamVideoUid || '').trim()
    if (postUid && posterBlob.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, posterBlob)
    }
    clearComposerForPostAttempt({
      preserveComposerVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    enqueueAndRunLoungeSubmitRef.current('post', snapshot)
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

  const saveProfileGate = useCallback(async (opts) => {
    setProfileGateErr('')
    const display = profileGateDisplayName.trim()
    if (!display) {
      setProfileGateErr('Display name is required.')
      return
    }
    const handle = normalizeHandle(opts?.forcedHandle ?? profileGateHandle)
    if (!handle) {
      setProfileGateErr('Handle must be at least 2 characters (letters, numbers, underscore).')
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
        onRequireAuth?.()
        return
      }

      if (!opts?.forcedHandle) {
        const availability = await checkProfileHandleAvailability({
          supabaseClient,
          requestedHandle: handle,
          excludeUserId: session.user.id,
        })
        if (!availability.ok && availability.reason !== 'invalid') {
          setProfileGateHandleConflict({
            requestedHandle: availability.handle,
            reason: availability.reason,
            suggestedHandle: availability.suggestedHandle,
          })
          return
        }
        if (!availability.ok) {
          setProfileGateErr('Handle must be at least 2 characters (letters, numbers, underscore).')
          return
        }
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
        requestedHandle: handle,
        avatarUrl,
        strictHandle: true,
      })
      if (error) {
        if (isProfileHandleUniqueViolation(error)) {
          const suggestedHandle = await suggestAvailableProfileHandle(
            supabaseClient,
            handle,
            session.user.id,
          )
          setProfileGateHandleConflict({
            requestedHandle: handle,
            reason: 'taken',
            suggestedHandle,
          })
          return
        }
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
      setProfileGateHandleConflict(null)
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
    profileModalLoadGenRef.current += 1
    setLoungePostDetailAboveProfile(false)
    setProfileModalOpen(false)
    setProfileModalData(null)
    setProfileModalPosts([])
    setProfileOverlayStack([])
    setProfileModalErr('')
    setProfileModalLoading(false)
    setProfileModalVisible(true)
    setLoungeProfileDockReveal(1)
    setProfileStackAboveStreamLightbox(false)
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

  useEffect(() => {
    finalizeProfileModalCloseRef.current = finalizeProfileModalClose
  }, [finalizeProfileModalClose])

  const profileStubFromOpenArg = useCallback((post) => {
    if (!post || typeof post !== 'object') return {}
    if (post.author_profile && typeof post.author_profile === 'object') return post.author_profile
    const { user_id: _uid, author_profile: _ap, ...rest } = post
    return rest
  }, [])

  const revealProfileModalPanel = useCallback((reduceMotion) => {
    if (reduceMotion) {
      profileModalVisibleRef.current = true
      setProfileModalVisible(true)
      return
    }
    profileModalVisibleRef.current = false
    setProfileModalVisible(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        profileModalVisibleRef.current = true
        setProfileModalVisible(true)
      })
    })
  }, [])

  const openProfileModal = useCallback(
    async (post, opts) => {
      if (loungeReadOnly && !opts?.fromPublicLink) {
        onRequireAuth?.()
        return
      }
      const userId = post?.user_id
      if (!userId) return
      const profileStub = profileStubFromOpenArg(post)
      const loadGen = ++profileModalLoadGenRef.current
      setProfileStackAboveStreamLightbox(getLoungeStreamLightboxOpen())
      setLoungePostDetailAboveProfile(false)
      setProfileOverlayStack([])
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
        ...profileStub,
      })
      setProfileModalPosts([])
      const reduce =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true
      revealProfileModalPanel(reduce)
      try {
        const { profile, profileErr } = await fetchLoungeProfileRow(supabaseClient, userId, profileStub)
        if (loadGen !== profileModalLoadGenRef.current) return
        setProfileModalData(profile)
        if (profileErr) {
          setProfileModalErr(profileErr)
        }

        const { posts, postsErr } = await fetchLoungeProfilePosts(
          supabaseClient,
          userId,
          hydrateCommunityPosts,
          { limit: LOUNGE_PROFILE_POST_INITIAL_LIMIT },
        )
        if (loadGen !== profileModalLoadGenRef.current) return
        if (postsErr) {
          setProfileModalErr((prev) => prev || postsErr)
        }
        setProfileModalPosts(posts)

        void (async () => {
          const { posts: morePosts, postsErr: moreErr } = await loadLoungeProfileScreenPostsRemainder(
            supabaseClient,
            userId,
            hydrateCommunityPosts,
            posts.length,
          )
          if (loadGen !== profileModalLoadGenRef.current) return
          if (moreErr) {
            setProfileModalErr((prev) => prev || moreErr)
            return
          }
          if (morePosts.length === 0) return
          setProfileModalPosts((prev) => {
            if (loadGen !== profileModalLoadGenRef.current) return prev
            const seen = new Set(prev.map((p) => p.id))
            const merged = [...prev]
            for (const row of morePosts) {
              if (row?.id && !seen.has(row.id)) {
                seen.add(row.id)
                merged.push(row)
              }
            }
            return merged
          })
        })()
      } catch (e) {
        if (loadGen !== profileModalLoadGenRef.current) return
        setProfileModalErr(e instanceof Error ? e.message : 'Could not load profile.')
      } finally {
        if (loadGen === profileModalLoadGenRef.current) {
          setProfileModalLoading(false)
        }
      }
    },
    [
      hydrateCommunityPosts,
      loungeReadOnly,
      onRequireAuth,
      profileStubFromOpenArg,
      revealProfileModalPanel,
      supabaseClient,
    ]
  )

  const profileEntityStub = useCallback(
    (entity) => {
      const userId = String(entity?.user_id || '').trim()
      if (!userId) return null
      if (entity?.author_profile && typeof entity.author_profile === 'object') {
        return { user_id: userId, ...entity.author_profile }
      }
      return { user_id: userId, ...profileStubFromOpenArg(entity) }
    },
    [profileStubFromOpenArg],
  )

  const pushProfileOverlay = useCallback(
    (entity) => {
      const stub = profileEntityStub(entity)
      if (!stub?.user_id) return
      const userId = stub.user_id
      setLoungePostDetailAboveProfile(false)
      setProfileOverlayStack((prev) => {
        const topUid =
          prev.length > 0 ? prev[prev.length - 1].userId : String(profileModalData?.user_id || '').trim()
        if (topUid === userId) return prev
        return [
          ...prev,
          {
            userId,
            profile: stub,
            posts: [],
            loading: true,
            error: '',
          },
        ]
      })
      void (async () => {
        try {
          const { profile, profileErr } = await fetchLoungeProfileRow(supabaseClient, userId, stub)
          setProfileOverlayStack((prev) =>
            prev.map((layer) =>
              layer.userId === userId
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    error: profileErr || layer.error,
                  }
                : layer,
            ),
          )

          const { posts, postsErr } = await fetchLoungeProfilePosts(
            supabaseClient,
            userId,
            hydrateCommunityPosts,
            { limit: LOUNGE_PROFILE_POST_INITIAL_LIMIT },
          )
          setProfileOverlayStack((prev) =>
            prev.map((layer) =>
              layer.userId === userId
                ? {
                    ...layer,
                    profile: profile || layer.profile,
                    posts,
                    loading: false,
                    error: postsErr || profileErr || '',
                  }
                : layer,
            ),
          )

          void (async () => {
            const { posts: morePosts, postsErr: moreErr } = await loadLoungeProfileScreenPostsRemainder(
              supabaseClient,
              userId,
              hydrateCommunityPosts,
              posts.length,
            )
            if (moreErr || morePosts.length === 0) return
            setProfileOverlayStack((prev) =>
              prev.map((layer) => {
                if (layer.userId !== userId) return layer
                const seen = new Set((layer.posts || []).map((p) => p.id))
                const merged = [...(layer.posts || [])]
                for (const row of morePosts) {
                  if (row?.id && !seen.has(row.id)) {
                    seen.add(row.id)
                    merged.push(row)
                  }
                }
                return { ...layer, posts: merged }
              }),
            )
          })()
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not load profile.'
          setProfileOverlayStack((prev) =>
            prev.map((layer) =>
              layer.userId === userId ? { ...layer, loading: false, error: msg } : layer,
            ),
          )
        }
      })()
    },
    [hydrateCommunityPosts, profileEntityStub, profileModalData?.user_id, supabaseClient],
  )

  const popProfileOverlay = useCallback(() => {
    setProfileOverlayStack((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev))
  }, [])

  /** Open another member's profile from a post/comment row (`user_id` + optional `author_profile`). */
  const openAuthorProfile = useCallback(
    (entity) => {
      const stub = profileEntityStub(entity)
      if (!stub?.user_id) return
      if (openProfileGateIfNeeded()) return
      if (profileModalOpen) {
        pushProfileOverlay(entity)
        return
      }
      void openProfileModal({
        user_id: stub.user_id,
        ...stub,
      })
    },
    [openProfileGateIfNeeded, openProfileModal, profileEntityStub, profileModalOpen, pushProfileOverlay],
  )

  const onLoungeDockOpenProfileFromSearch = useCallback(
    (entity) => {
      if (!entity?.user_id) return
      openAuthorProfile(entity)
    },
    [openAuthorProfile],
  )

  const onLoungeOpenProfileFromNotifications = useCallback(
    (entity) => {
      if (!entity?.user_id) return
      setLoungeDockPanel(null)
      openAuthorProfile(entity)
    },
    [openAuthorProfile],
  )

  /** Open a profile by handle string — used when a viewer taps an @mention in a caption or comment. */
  const openProfileByHandle = useCallback(
    async (handle) => {
      if (!handle) return
      if (openProfileGateIfNeeded()) return
      const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle
      try {
        const { data } = await supabaseClient
          .from('profiles')
          .select('user_id, display_name, handle, avatar_url, role, is_og')
          .ilike('handle', cleanHandle)
          .maybeSingle()
        if (data?.user_id) {
          void openProfileModal({ user_id: data.user_id, author_profile: data })
        }
      } catch {}
    },
    [openProfileGateIfNeeded, openProfileModal, supabaseClient],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const run = async () => {
      const params = new URLSearchParams(window.location.search || '')
      const pathHandle = parseLoungeProfilePathHandle(window.location.pathname || '')
      const queryHandle = (params.get('u') || '').trim().replace(/^@/, '').toLowerCase()
      const legacyUserId = (params.get('profile') || '').trim()
      const handle = pathHandle || (isLoungeProfileHandleSlug(queryHandle) ? queryHandle : '')

      if (handle) {
        await new Promise((resolve) => {
          window.requestAnimationFrame(() => resolve(undefined))
        })
        if (cancelled) return
        try {
          const { data, error } = await supabaseClient
            .from('profiles')
            .select('user_id, display_name, handle, avatar_url, role, is_og')
            .ilike('handle', handle)
            .maybeSingle()
          if (cancelled) return
          if (error || !data?.user_id) {
            setLoungeShareFlash('This profile is unavailable.')
            stripLoungeProfileShareFromUrl()
            return
          }
          await openProfileModal({ user_id: data.user_id, author_profile: data }, { fromPublicLink: true })
          if (cancelled) return
          stripLoungeProfileShareFromUrl()
        } catch {
          if (cancelled) return
          setLoungeShareFlash('This profile is unavailable.')
          stripLoungeProfileShareFromUrl()
        }
        return
      }

      if (!isLoungePostShareId(legacyUserId)) return
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve(undefined))
      })
      if (cancelled) return
      await openProfileModal({ user_id: legacyUserId }, { fromPublicLink: true })
      if (cancelled) return
      stripLoungeProfileShareFromUrl()
    }
    void run()
    const onPop = () => void run()
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [openProfileModal, supabaseClient])

  /** Open the search panel pre-filtered by a tapped #hashtag. */
  const openSearchByHashtag = useCallback(
    (tag) => {
      if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
        onRequireAuth?.()
        return
      }
      const q = tag.startsWith('#') ? tag.slice(1) : tag
      setLoungeDockSearchQuery(q)
      setLoungeDockSearchQueryVersion((v) => v + 1)
      setLoungeDockPanel('search')
    },
    [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth],
  )

  const onLoungeDockOpenOwnProfile = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    if (!composerUserId) return
    setLoungeDockPanel(null)
    void openProfileModal({
      user_id: composerUserId,
      author_profile: composerUserProfile,
    })
  }, [
    loungeFeedBrowseMode,
    loungeReadOnly,
    onRequireAuth,
    composerUserId,
    composerUserProfile,
    openProfileModal,
  ])

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
        'location',
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

  const patchMemberRoleInFeed = useCallback(
    (targetUserId, role) => {
      const uid = String(targetUserId || '').trim()
      if (!uid) return
      const patchPostAuthor = (p) => {
        if (!p || String(p.user_id) !== uid) return p
        const ap = p.author_profile && typeof p.author_profile === 'object' ? p.author_profile : {}
        return { ...p, author_profile: { ...ap, role, user_id: uid } }
      }
      setCommunityPosts((prev) => prev.map(patchPostAuthor))
      setLoungePostDetail((d) => (d ? patchPostAuthor(d) : d))
      setProfileModalData((prev) =>
        prev && String(prev.user_id) === uid ? { ...prev, role } : prev,
      )
      setProfileOverlayStack((prev) =>
        prev.map((layer) =>
          layer.userId === uid && layer.profile
            ? { ...layer, profile: { ...layer.profile, role } }
            : layer,
        ),
      )
    },
    [setCommunityPosts],
  )

  const handleAdminSetProfileRole = useCallback(
    async (targetUserId, nextRole) => {
      const uid = String(targetUserId || '').trim()
      if (!uid || !loungeViewerIsAdmin) {
        return { ok: false, error: 'Admin access required.' }
      }
      const { data, error } = await adminSetProfileRole(supabaseClient, uid, nextRole)
      if (error) {
        return { ok: false, error: error.message || String(error) }
      }
      const role = String(data?.role || nextRole)
      patchMemberRoleInFeed(uid, role)
      return { ok: true }
    },
    [loungeViewerIsAdmin, patchMemberRoleInFeed, supabaseClient],
  )

  const profilePostCardProps = useMemo(
    () => ({
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      refreshPostInteractions: refreshLoungePostInteractions,
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
      onAvatarClick: openAuthorProfile,
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
      onStreamLightboxOpenDetail: openLoungeStreamLightboxDetail,
      onOpenCommentRepost: openCommentRepostDetail,
      onOpenProfileReply: (comment, post, opts) => {
        if (!post?.id || !comment?.id) return
        void openDirectCommentPostDetail(post, comment.id, {
          focusComposer: opts?.focusComposer === true,
        })
      },
      hydrateCommentInteractionsForIds,
      interactionStateForComment,
      onCommentReplyInteraction: onLoungeCommentReplyInteraction,
      onToggleCommentLike: toggleLoungeDetailCommentLike,
      onToggleCommentBookmark: toggleLoungeDetailCommentBookmark,
      getCommentBookmarked: getLoungeDetailCommentBookmarked,
      commentToggleInteraction: noopLoungeBarPostToggle,
      onCommentPlainRepost: (p) => void addLoungeDetailCommentPlainRepost(p.id),
      onCommentUndoPlainRepost: (p) => void undoLoungeDetailCommentPlainRepost(p.id),
      repostActionBusy: repostManageBusy,
      onCommentMenuEdit: (c, post) => {
        if (!c?.id || !post?.id) return
        void openDirectCommentPostDetail(post, c.id)
        loungePostDetailPendingCommentEditRef.current = String(c.id)
      },
      onCommentMenuDelete: (c, post) => {
        if (!c?.id || !post?.id) return
        void openDirectCommentPostDetail(post, c.id)
      },
      onCommentMenuBlock: onCommentMenuBlockFromDetail,
      onCommentMenuReport: onCommentMenuReportFromDetail,
      busyDeletingCommentId: loungeDetailCommentDeleteBusyId,
      mediaLightboxPortalClass: 'z-[103]',
      repostMenuPortalClass: 'z-[104]',
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
      onMentionClick: openProfileByHandle,
      onHashtagClick: openSearchByHashtag,
      viewerFollowingUserIds: loungeReadOnly ? null : loungeFollowingUserIds,
      onFollowUser: loungeReadOnly ? undefined : handleLoungeFollowUser,
      feedVideoAutoplayEnabled: loungeFeedVideoAutoplayEnabled,
      onFeedVideoAutoplayChange: onLoungeFeedVideoAutoplayChange,
    }),
    [
      loungeReadOnly,
      interactionStateFor,
      toggleInteraction,
      refreshLoungePostInteractions,
      handlePlainRepost,
      undoPlainRepostForOriginal,
      openRemoveQuoteRepostForPost,
      openQuoteRepostComposer,
      toggleBookmark,
      bookmarkedByPost,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      openLoungePostDetail,
      openDirectCommentPostDetail,
      openCommentRepostDetail,
      openLoungeStreamLightboxDetail,
      openAuthorProfile,
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
      hydrateCommentInteractionsForIds,
      interactionStateForComment,
      onLoungeCommentReplyInteraction,
      toggleLoungeDetailCommentLike,
      toggleLoungeDetailCommentBookmark,
      getLoungeDetailCommentBookmarked,
      noopLoungeBarPostToggle,
      addLoungeDetailCommentPlainRepost,
      undoLoungeDetailCommentPlainRepost,
      repostManageBusy,
      onCommentMenuBlockFromDetail,
      onCommentMenuReportFromDetail,
      loungeDetailCommentDeleteBusyId,
      openProfileByHandle,
      openSearchByHashtag,
      loungeFollowingUserIds,
      handleLoungeFollowUser,
      loungeFeedVideoAutoplayEnabled,
      onLoungeFeedVideoAutoplayChange,
    ]
  )

  const routeLoungeStreamLightboxOpenDetail = useCallback(
    (host, media, opts = {}) => {
      if (isFeedCommentEntity(host)) {
        openLoungeCommentStreamLightboxDetail(host, media, opts)
      } else {
        openLoungeStreamLightboxDetail(host, media, opts)
      }
    },
    [openLoungeCommentStreamLightboxDetail, openLoungeStreamLightboxDetail],
  )

  const loungeStreamLightboxCtx = useMemo(
    () =>
      buildLoungeStreamLightboxCtxFromPostCardProps(profilePostCardProps, {
        onLightboxOpenDetail: routeLoungeStreamLightboxOpenDetail,
      }),
    [profilePostCardProps, routeLoungeStreamLightboxOpenDetail],
  )

  const loungeStreamLightboxOpen = useSyncExternalStore(
    subscribeLoungeStreamLightboxOpen,
    getLoungeStreamLightboxOpen,
    () => false,
  )
  const showLoungeViewportDock = isActivePage && !loungePostDetail && !loungeStreamLightboxOpen
  const loungeTitleBarChromePx = loungeTitleBarHeight > 0 ? loungeTitleBarHeight : 56
  /** Scroll inset for the opaque dock icon row only. Outer column uses `pb-0`; home-indicator inset lives in feed bottom padding + scroll content. */
  const loungeDockFeedContentInsetPx = showLoungeViewportDock
    ? dockChromeHeightFromTitleBarPx(loungeTitleBarChromePx) + 6
    : 0
  const loungeFeedDockPaddingBottom = loungeDockFeedContentInsetPx

  const { wheelItems: loungeDockWheelItems, cornerLItems: loungeDockCornerLItems } = useMemo(
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
        onSettings: onLoungeDockSettings,
        activePanel: loungeDockPanel,
        notificationsUnreadCount: loungeNotificationsUnread,
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
      onLoungeDockSettings,
      loungeDockPanel,
      loungeNotificationsUnread,
    ],
  )

  return (
    <div
      className={`mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-zinc-950 pt-[max(0px,env(safe-area-inset-top))] pb-0`}
    >
      <LoungeStreamLightboxProvider ctx={loungeStreamLightboxCtx}>
      {quoteRepostQueuedToast ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed left-1/2 w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 rounded-xl border border-cyan-500/50 bg-zinc-950/92 px-3 py-2.5 text-center text-[14px] font-medium leading-snug text-cyan-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${loungePostDetailAboveProfile ? 'z-[107]' : 'z-[102]'}`}
          style={{ top: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          Sending your quote... You&apos;ll have 30 minutes to edit after it posts.
        </div>
      ) : null}
      {loungeDetailCommentQueuedToast ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed left-1/2 w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 rounded-xl border border-cyan-500/50 bg-zinc-950/92 px-3 py-2.5 text-center text-[14px] font-medium leading-snug text-cyan-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${loungePostDetailAboveProfile ? 'z-[107]' : 'z-[102]'}`}
          style={{
            top: quoteRepostQueuedToast
              ? 'max(4.25rem, calc(0.5rem + 3.25rem + env(safe-area-inset-top)))'
              : 'max(0.5rem, env(safe-area-inset-top))',
          }}
        >
          Sending your reply… You&apos;ll have 30 minutes to edit after it posts.
        </div>
      ) : null}
      {loungeShareFlash ? (
        <div
          role="status"
          aria-live="polite"
          className={`pointer-events-none fixed left-1/2 w-[min(calc(100vw-1.5rem),42rem)] -translate-x-1/2 rounded-xl border border-emerald-500/45 bg-zinc-950/92 px-3 py-2.5 text-center text-[14px] font-medium leading-snug text-emerald-100 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md ${loungePostDetailAboveProfile ? 'z-[107]' : 'z-[102]'}`}
          style={{
            top:
              quoteRepostQueuedToast || loungeDetailCommentQueuedToast
                ? 'max(4.25rem, calc(0.5rem + 3.25rem + env(safe-area-inset-top)))'
                : 'max(0.5rem, env(safe-area-inset-top))',
          }}
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
          <div className={`flex items-center justify-between gap-3 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`}>
            <EdgeLogoWithEasterEgg className="h-6 w-auto max-w-[min(140px,calc(100vw-9rem))] shrink-0 object-contain object-left" />
            <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
              <TitleBarStatusLine loading={communityFeedLoading} />
              {titleBarNavSlot}
            </div>
          </div>
        </div>
      ) : null}

      {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED — see import above
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
      */}

      {showLoungeViewportDock ? (
        <LoungeDockArcCarouselPrototype
          items={loungeDockWheelItems}
          cornerLItems={loungeDockCornerLItems}
          reveal={
            profileModalOpen
              ? loungeProfileDockReveal
              : loungeDockPanel
                ? loungePanelTitleReveal
                : loungeTitleReveal
          }
          panelChrome={loungeDockPanel}
          menuLayout={loungeDockMenuLayout}
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
        <LoungeFeedVideoAutoplayProvider scrollRootRef={loungeFeedScrollRef} showDebugHud={loungeFeedVideoDebugHudOnFeed}>
        <LoungeFeedAutoplayPostsKick postCount={communityPosts.length} />
        <LoungeFeedInlineSoundResetBinder resetRef={resetFeedInlineSoundRef} />
        <LoungeFeedCoordinatorSuspendBinder
          suspended={Boolean(
            loungePostDetail?.id || profileModalOpen || profileOverlayStack.length > 0,
          )}
        />
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
            className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
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
                  <div ref={mentionComposerAnchorRef}>
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
                      onChange={(e) => { setPostText(e.target.value); mentionComposer.onCursorMove(e) }}
                      onKeyUp={mentionComposer.onCursorMove}
                      onMouseUp={mentionComposer.onCursorMove}
                      onKeyDown={(e) => mentionComposer.onMentionKeyDown(e, setPostText, composerTextareaRef.current)}
                      onBlur={() => window.setTimeout(() => mentionComposer.clearMention(), 150)}
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
                  <LoungeMentionDropdown
                    suggestions={mentionComposer.suggestions}
                    activeIndex={mentionComposer.activeIndex}
                    loading={mentionComposer.loading}
                    onSelect={(p) => mentionComposer.onMentionSelect(p, setPostText, composerTextareaRef.current)}
                    anchorRef={mentionComposerAnchorRef}
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
                  flushSync(() => {
                    setComposerFoldReveal(1)
                    composerExpandedRef.current = true
                    setComposerExpanded(true)
                    setComposerFocusToken((t) => t + 1)
                  })
                  focusLoungeComposerCaption(() => composerTextareaRef.current, {
                    scrollFeedToTop: scrollLoungeFeedToTopInstant,
                  })
                  scheduleLoungeComposerTextareaFocus({
                    getTextarea: () => composerTextareaRef.current,
                    scrollFeedToTop: scrollLoungeFeedToTopInstant,
                  })
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
              id={LOUNGE_COMPOSER_MEDIA_INPUT_ID}
              ref={composerMediaInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              {...loungeFileInputMediaPickerHandlers('composer')}
              onChange={(e) => {
                const input = e.target
                const files = Array.from(input.files || [])
                if (!files.length) {
                  endLoungeComposerMediaPicker('composer')
                  restoreLoungeComposerCaptionAfterMediaPick('composer')
                  return
                }
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
                  endLoungeComposerMediaPicker('composer')
                  restoreLoungeComposerCaptionAfterMediaPick('composer')
                  void queueLoungeVideoOrCrop(vf, 'composer')
                  return
                }
                const bad = files.some((f) => !isProbablyImageFile(f))
                if (bad) {
                  setPostErr('Unsupported media type. Please choose an image or video file.')
                  endLoungeComposerMediaPicker('composer')
                  try {
                    input.value = ''
                  } catch {
                    // ignore
                  }
                  restoreLoungeComposerCaptionAfterMediaPick('composer')
                  return
                }
                cancelComposerMediaPrep()
                const prevImgs = composerImageItemsRef.current
                const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
                composerImageItemsRef.current = next
                try {
                  input.value = ''
                } catch {
                  // ignore
                }
                endLoungeComposerMediaPicker('composer')
                restoreLoungeComposerCaptionAfterMediaPick('composer', () => {
                  setComposerImageItems(next)
                  if (limitDialog) setLoungeImageLimitDialog(limitDialog)
                })
              }}
            />
            <div
              data-lounge-fab-obstacle
              className="mt-1 flex w-full items-center gap-2 pr-2 pt-1.5 pb-1"
            >
              <label
                htmlFor={LOUNGE_COMPOSER_MEDIA_INPUT_ID}
                onPointerDown={() => beginLoungeComposerMediaPicker('composer')}
                onMouseDown={(e) => e.preventDefault()}
                className="flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
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
              </label>
              <button
                type="button"
                onClick={() => openKlipyPicker('composer')}
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
            className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-4 p-6 backdrop-blur-[3px]"
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
                Discard post?
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-zinc-400">
                Your post text and any attached media will be cleared.
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
                  className="order-1 min-h-11 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 touch-manipulation sm:order-2"
                  onClick={() => setComposerDiscardPromptOpen(false)}
                >
                  Keep writing
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!loungePostDetail ? (
          <div className="shrink-0 px-3 pt-1">
            <div className={`${LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_ROW_CLASS} items-center gap-3`}>
              <LoungeFeedScopeSwitch
                scope={loungeFeedScope}
                onScopeChange={onLoungeFeedScopeChange}
                disabled={communityFeedLoading && communityPosts.length === 0}
              />
              <LoungeFeedSortSwitch
                value={loungeFeedSort}
                onChange={onLoungeFeedSortChange}
                disabled={communityFeedLoading && communityPosts.length === 0}
              />
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
              <span className="text-zinc-300">Discover</span> to see the full lounge.
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
                className={LOUNGE_FEED_POST_ROW_CLASS}
                onClick={(e) => {
                  const t = e.target
                  if (!(t instanceof Element)) return
                  // Quote-repost embed tap
                  const origHost = t.closest('[data-lounge-original-embed]')
                  if (origHost && post.reposted_post?.id && !post.is_plain_repost) {
                    openLoungePostDetail(post.reposted_post)
                    return
                  }
                  if (
                    t.closest(
                      'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-image-zoom], [data-lounge-video-zoom], [data-lounge-badge-tip]',
                    )
                  )
                    return
                  // Plain post repost → open original
                  if (post.is_plain_repost && post.reposted_post?.id) {
                    openLoungePostDetail(post.reposted_post)
                    return
                  }
                  // Comment repost → open parent post with comment in focus
                  if (post.is_plain_repost && post.reposted_comment?.post_id) {
                    void openCommentRepostDetail(post.reposted_comment)
                    return
                  }
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
                  onAvatarClick={openAuthorProfile}
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
                  interactionStateForComment={interactionStateForComment}
                  onCommentPlainRepost={(p) => void addLoungeDetailCommentPlainRepost(p.id)}
                  onCommentUndoPlainRepost={(p) => void undoLoungeDetailCommentPlainRepost(p.id)}
                  onToggleCommentLike={toggleLoungeDetailCommentLike}
                  onToggleCommentBookmark={toggleLoungeDetailCommentBookmark}
                  getCommentBookmarked={getLoungeDetailCommentBookmarked}
                  onOpenCommentDetail={(rc, opts) => void openCommentRepostDetail(rc, opts)}
                  onStreamLightboxOpenDetail={openLoungeStreamLightboxDetail}
                  onMentionClick={openProfileByHandle}
                  onHashtagClick={openSearchByHashtag}
                  viewerFollowingUserIds={loungeReadOnly ? null : loungeFollowingUserIds}
                  onFollowUser={loungeReadOnly ? undefined : handleLoungeFollowUser}
                  feedVideoAutoplayEnabled={loungeFeedVideoAutoplayEnabled}
                  onFeedVideoAutoplayChange={onLoungeFeedVideoAutoplayChange}
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
          className={`fixed inset-0 sm:bg-black/55 sm:backdrop-blur-[2px] ${loungePostDetailShellZClass}`}
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
            className={`fixed inset-y-0 right-0 z-10 flex h-dvh max-h-dvh w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-800/70 bg-zinc-950/94 pt-[max(0px,env(safe-area-inset-top))] shadow-[-12px_0_40px_rgba(0,0,0,0.45)] backdrop-blur-md transition-transform duration-300 ease-out motion-reduce:transition-none ${
              loungePostDetailVisible ? 'translate-x-0' : 'translate-x-full'
            }`}
            onTransitionEnd={onLoungePostDetailPanelTransitionEnd}
            onTransitionCancel={onLoungePostDetailPanelTransitionEnd}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              ref={loungePostDetailTitleBarRef}
              className="absolute inset-x-0 top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/70 shadow-[0_1px_0_rgba(0,0,0,0.18)] will-change-transform"
              style={{
                transform: `translate3d(0, ${-(1 - loungePostDetailTitleReveal) * (loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56)}px, 0)`,
                pointerEvents: loungePostDetailTitleReveal > 0.12 ? 'auto' : 'none',
              }}
            >
              <div className={`flex shrink-0 items-center gap-2 ${LOUNGE_FEED_TITLE_BAR_ROW_CLASS}`}>
              <button
                type="button"
                onClick={handleLoungePostDetailBack}
                className={`flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} touch-manipulation items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]`}
                aria-label={loungeCommentDetailPathIds.length > 0 ? 'Back' : 'Back to Lounge'}
              >
                <span className="text-[22px] leading-none" aria-hidden>
                  ←
                </span>
              </button>
              <h2 id="lounge-post-detail-title" className="min-w-0 flex-1 text-center text-[17px] font-bold text-white">
                {loungeCommentDetailPathIds.length > 0 ? 'Reply' : 'Post'}
              </h2>
              {loungeDetailShowPostMenu ? (
                <div ref={loungePostDetailMenuWrapRef} className={`relative flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} justify-end`}>
                  <button
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={loungePostDetailMenuOpen}
                    aria-label="Post options"
                    onClick={() => setLoungePostDetailMenuOpen((o) => !o)}
                    className={`flex ${LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} touch-manipulation items-center justify-center rounded-full text-zinc-300 hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]`}
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
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-4 py-3 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                        onClick={() => {
                          setLoungePostDetailMenuOpen(false)
                          handleShareLoungePost(loungePostDetail)
                        }}
                      >
                        Share
                      </button>
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
                <div className={LOUNGE_FEED_TITLE_BAR_SIDE_SLOT_CLASS} aria-hidden />
              )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={loungePostDetailScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
            >
              <LoungeFeedVideoAutoplayProvider
                scrollRootRef={loungePostDetailScrollRef}
                showDebugHud={loungeFeedVideoDebugEnabled && Boolean(loungePostDetail?.id)}
              >
              <LoungeFeedInlineSoundResetBinder resetRef={resetPostDetailInlineSoundRef} />
              <div
                aria-hidden
                className="shrink-0"
                style={{ height: loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56 }}
              />
              <div className="px-4 py-4 pb-4">
              {loungeManageErr ? (
                <div className="mb-4 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
                  {loungeManageErr}
                </div>
              ) : null}

              <>
              <div
                ref={
                  loungeCommentDetailPathIds.length > 0 ? loungePostDetailCommentConnectorRef : undefined
                }
                className={loungeCommentDetailPathIds.length > 0 ? 'relative' : ''}
              >
              <article
                tabIndex={loungeCommentDetailPathIds.length > 0 ? 0 : undefined}
                aria-label={loungeCommentDetailPathIds.length > 0 ? 'View post' : undefined}
                onClick={
                  loungeCommentDetailPathIds.length > 0
                    ? (e) => loungePostDetailThreadAncestorClick(e, exitLoungeCommentDetailToPostView)
                    : undefined
                }
                onKeyDown={
                  loungeCommentDetailPathIds.length > 0
                    ? (e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        if (e.target !== e.currentTarget) return
                        e.preventDefault()
                        exitLoungeCommentDetailToPostView()
                      }
                    : undefined
                }
                className={
                  loungeCommentDetailPathIds.length > 0
                    ? 'cursor-pointer rounded-lg touch-manipulation outline-none hover:bg-zinc-900/50 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-violet-500/40'
                    : undefined
                }
              >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  id="lounge-detail-post-avatar"
                  ref={loungePostDetailPostAvatarRef}
                  onClick={() => openAuthorProfile(loungePostDetail)}
                  className={`${LOUNGE_FEED_AVATAR_CLASS} touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
                  aria-label={`Open profile for ${displayNameFor(loungePostDetail)}`}
                  title="View profile"
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
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openAuthorProfile(loungePostDetail)}
                    className="block w-full min-w-0 text-left hover:text-cyan-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                  >
                    <div className={LOUNGE_FEED_POST_DETAIL_AUTHOR_BLOCK_CLASS}>
                      <div className={LOUNGE_FEED_META_ROW_CLASS}>
                        <LoungeFeedAuthorMetaBadges
                          role={loungePostDetail?.author_profile?.role}
                          isOg={loungePostDetail?.author_profile?.is_og === true}
                          displayName={displayNameFor(loungePostDetail)}
                          displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_DETAIL_CLASS}
                        />
                      </div>
                      <span className={LOUNGE_FEED_POST_DETAIL_HANDLE_TIME_CLASS}>
                        <span className="min-w-0 truncate">{handleFor(loungePostDetail)}</span>
                      </span>
                    </div>
                  </button>
                  {loungePostDetail.pinned ? (
                    <div className="mt-1">
                      <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                        Pinned
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {loungePostDetail.game_slug ? (
                <div
                  className={`mt-4 flex justify-start ${
                    loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''
                  }`}
                >
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
                        className={`pointer-events-none min-h-[5rem] w-full overflow-y-auto border border-transparent px-0 py-0 text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}
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
                        className={`z-10 min-h-[5rem] w-full resize-none touch-manipulation overflow-y-auto bg-transparent px-0 py-0 ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-transparent caret-white outline-none selection:bg-cyan-500/25`}
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
                      className={`text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      } ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}
                    >
                      {renderRichCaption(feedPostDisplayCaption(loungePostDetail), {
                        hashtagClassName: 'font-semibold text-cyan-300',
                        linkClassName:
                          'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                      })}
                    </div>
                  ) : null}
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
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
                      lightboxPortalClass={loungeDetailMediaLightboxPortalClass}
                      streamLightboxHost={loungePostDetail}
                      streamLightboxSurface={loungeDetailStreamLightboxSurface}
                    />
                  </div>
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
                      feedAutoplayRowId={loungePostDetail.id}
                      feedAutoplayScope="detail"
                      firstMarginTopClass="mt-2"
                      visibilityResetRootRef={loungePostDetailScrollRef}
                      lightboxPortalClass={loungeDetailMediaLightboxPortalClass}
                      streamLightboxHost={loungePostDetail}
                      streamLightboxSurface={loungeDetailStreamLightboxSurface}
                    />
                  </button>
                </>
              ) : (
                <>
                  {feedPostDisplayCaption(loungePostDetail) ? (
                    <div
                      className={`text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      } ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}
                    >
                      {renderRichCaption(feedPostDisplayCaption(loungePostDetail), {
                        hashtagClassName: 'font-semibold text-cyan-300',
                        linkClassName:
                          'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
                      })}
                    </div>
                  ) : null}
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
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
                      lightboxPortalClass={loungeDetailMediaLightboxPortalClass}
                      streamLightboxHost={loungePostDetail}
                      streamLightboxSurface={loungeDetailStreamLightboxSurface}
                    />
                  </div>
                </>
              )}

              <div className={`mt-2 text-[14px] leading-tight text-zinc-500 ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}>
                {formatLoungePostDetailWhen(loungePostDetail.created_at)}
                {loungePostDetail.edited_at ? (
                  <span className="text-zinc-600"> · Edited</span>
                ) : null}
              </div>
              </article>

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
                const likeClass = loungeReadOnly ? 'text-zinc-500' : ui.liked ? 'text-lv-red' : 'text-zinc-500'
                const bookmarkClass = loungeReadOnly ? 'text-zinc-600' : isBookmarked ? 'text-lv-yellow' : 'text-zinc-500'
                const ro = loungeReadOnly
                const commentBubbleD =
                  'M4.75 5.75h10.5a1.5 1.5 0 011.5 1.5v5a1.5 1.5 0 01-1.5 1.5H9l-3.25 2v-2H4.75a1.5 1.5 0 01-1.5-1.5v-5a1.5 1.5 0 011.5-1.5z'
                const bookmarkRibbonD =
                  'M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z'
                const commentGlyphFilled = !ro && ui.commented
                const bookmarkGlyphFilled = !ro && isBookmarked
                const plainId = ui.plainRepostChildId
                const quoteId = ui.quoteRepostChildId
                const dSlotComment = 24
                const dSlotRepost = 24
                const dSlotLike = 24
                const dSlotBookmark = 26
                /** Post detail: keep icons aligned but avoid a tall “dead” band above/below the row. */
                const dRailMinH = 38
                return (
                  <div
                    className={`${LOUNGE_FEED_POST_DETAIL_INTERACTIONS_WRAP_CLASS} ${
                      loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''
                    }`}
                  >
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
                        <div className="mb-1 flex w-full items-center gap-2 pr-2 pb-1 pt-1.5">
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
                      className={`flex w-full min-w-0 flex-nowrap items-center justify-between py-0.5 text-[16px] ${loungeDetailEditing ? 'mt-1' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                      role="group"
                    >
                      <LoungeInteractionGlyphRail
                        railAlign="start"
                        slotPx={dSlotComment}
                        glyphPx={dSlotComment}
                        railMinH={dRailMinH}
                        readOnly={ro}
                        title={ro ? 'Sign in to comment' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => {
                          if (openProfileGateIfNeeded()) return
                          const elId =
                            loungeCommentDetailPathIds.length > 0
                              ? 'lounge-detail-comments-thread'
                              : 'lounge-detail-comments'
                          document.getElementById(elId)?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start',
                          })
                        }}
                        statClass="inline-flex w-full max-w-full shrink-0 items-center gap-0 rounded-lg px-0 py-0.5 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        glyph={
                          <svg
                            className={`block shrink-0 h-[24px] w-[24px] origin-center scale-y-[1.1] ${commentClass}`}
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden
                          >
                            {commentGlyphFilled ? (
                              <path d={commentBubbleD} fill="currentColor" />
                            ) : (
                              <path
                                d={commentBubbleD}
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.25"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                              />
                            )}
                          </svg>
                        }
                        countClass={commentClass}
                        countValue={commentCount}
                      />
                      <LoungeInteractionGlyphRail
                        railRef={loungeDetailRepostMenuRef}
                        extraAfterStat={
                          loungeDetailRepostMenuOpen && !ro ? (
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
                          ) : null
                        }
                        slotPx={dSlotRepost}
                        glyphPx={dSlotRepost}
                        railMinH={dRailMinH}
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
                        statClass="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-0.5 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        glyph={
                          <svg
                            className={`block shrink-0 h-[24px] w-[24px] ${repostClass}`}
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden
                          >
                            <path
                              d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                              stroke="currentColor"
                              strokeWidth="1.35"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        }
                        countClass={repostClass}
                        countValue={repostCount}
                      />
                      <LoungeInteractionGlyphRail
                        slotPx={dSlotLike}
                        glyphPx={dSlotLike}
                        railMinH={dRailMinH}
                        readOnly={ro}
                        title={ro ? 'Sign in to like' : undefined}
                        onReadOnlyClick={requireLoungeAuth}
                        onClick={() => void toggleInteraction(d.id, 'liked')}
                        statClass="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-0.5 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        glyph={<LoungeFlameIcon className={`shrink-0 h-[24px] w-[24px] ${likeClass}`} liked={ui.liked} readOnly={ro} />}
                        countClass={likeClass}
                        countValue={likeCount}
                      />
                      <div
                        className="relative flex shrink-0 flex-none items-center justify-center self-center overflow-visible"
                        style={{ width: dSlotBookmark, minWidth: dSlotBookmark, minHeight: dRailMinH }}
                      >
                        {ro ? (
                          <button
                            type="button"
                            onClick={requireLoungeAuth}
                            className="inline-flex size-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-0.5 text-zinc-600 box-border hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                            title="Sign in to save posts"
                          >
                            <svg className={`block shrink-0 h-[26px] w-[26px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                              {bookmarkGlyphFilled ? (
                                <path d={bookmarkRibbonD} fill="currentColor" />
                              ) : (
                                <path
                                  d={bookmarkRibbonD}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.15"
                                  strokeLinejoin="round"
                                />
                              )}
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void toggleBookmark(d.id)}
                            className="inline-flex size-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 py-0.5 box-border hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                            title={isBookmarked ? 'Remove bookmark' : 'Save post'}
                          >
                            <svg className={`block shrink-0 h-[26px] w-[26px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
                              {bookmarkGlyphFilled ? (
                                <path d={bookmarkRibbonD} fill="currentColor" />
                              ) : (
                                <path
                                  d={bookmarkRibbonD}
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.15"
                                  strokeLinejoin="round"
                                />
                              )}
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })()}

              {loungeCommentDetailPathIds.length === 0 ? (
                <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_SECTION_CLASS}>
                  {!loungeReadOnly && !loungeDetailCommentsLoading ? (
                    <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_ROW_CLASS}>
                      <LoungePostDetailCommentSort
                        value={loungeDetailCommentSort}
                        onChange={setLoungeDetailCommentSort}
                      />
                    </div>
                  ) : null}
                  <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SEPARATOR_CLASS} aria-hidden />
                </div>
              ) : null}

              {loungeCommentDetailPathIds.length > 0 ? (
                <LoungePostDetailCommentHierarchy
                  pathIds={loungeCommentDetailPathIds}
                  comments={loungeDetailComments}
                  postAvatarRef={loungePostDetailPostAvatarRef}
                  connectorRootRef={loungePostDetailCommentConnectorRef}
                  isCommentPostDetail
                  onNavigateToPathIndex={navigateLoungeCommentDetailToPathIndex}
                  descendantCountByCommentId={loungeDetailDescendantCountByCommentId}
                  cardProps={{
                    postAgeLabel,
                    displayNameFor,
                    handleFor,
                    loungeReadOnly,
                    viewerUserId: composerUserId,
                    requireLoungeAuth,
                    openProfileGateIfNeeded,
                    onCommentReplyInteraction: onLoungeCommentReplyInteraction,
                    interactionStateFor: interactionStateForComment,
                    toggleInteraction: noopLoungeBarPostToggle,
                    onPlainRepost: (p) => void addLoungeDetailCommentPlainRepost(p.id),
                    onUndoPlainRepost: (p) => void undoLoungeDetailCommentPlainRepost(p.id),
                    toggleBookmark: noopLoungeBarPostToggle,
                    bookmarkedByPost,
                    onToggleCommentLike: toggleLoungeDetailCommentLike,
                    onToggleCommentBookmark: toggleLoungeDetailCommentBookmark,
                    getCommentBookmarked: getLoungeDetailCommentBookmarked,
                    repostActionBusy: repostManageBusy,
                    onAvatarClickProfile: openAuthorProfile,
                    positionScrollRootRef: loungePostDetailScrollRef,
                    onCommentMenuEdit: onCommentMenuEditFromDetail,
                    onCommentMenuDelete: deleteLoungeDetailComment,
                    onCommentMenuBlock: onCommentMenuBlockFromDetail,
                    onCommentMenuReport: onCommentMenuReportFromDetail,
                    busyDeletingCommentId: loungeDetailCommentDeleteBusyId,
                    editingCommentId: loungeDetailCommentEditingId,
                    commentEditDraft: loungeDetailCommentEditDraft,
                    onCommentEditDraftChange: setLoungeDetailCommentEditDraft,
                    onCommentEditSave: saveLoungeDetailCommentEdit,
                    onCommentEditCancel: cancelLoungeDetailCommentEdit,
                    commentEditBusy: loungeDetailCommentEditBusy,
                    commentEditHasRemoteMedia:
                      loungeDetailCommentEditImageUrls.length > 0 ||
                      String(loungeDetailCommentEditGifUrl || '').trim().length > 0 ||
                      Boolean(
                        loungeDetailCommentEditingId &&
                          feedCommentStreamVideoUid(
                            loungeDetailComments.find((r) => r.id === loungeDetailCommentEditingId),
                          ),
                      ),
                    resolveMediaFeedVariant: (c) =>
                      c?.id === loungeDetailCommentHierarchyFocusId ? 'detail' : 'commentInline',
                    onMentionClick: openProfileByHandle,
                    onHashtagClick: openSearchByHashtag,
                    lightboxPortalClass: loungeDetailMediaLightboxPortalClass,
                    avatarText,
                    avatarToneClass,
                    viewerFollowingUserIds: loungeReadOnly ? null : loungeFollowingUserIds,
                    onFollowUser: loungeReadOnly ? undefined : handleLoungeFollowUser,
                    feedVideoAutoplayEnabled: loungeFeedVideoAutoplayEnabled,
                    onFeedVideoAutoplayChange: onLoungeFeedVideoAutoplayChange,
                    onStreamLightboxOpenDetail: openLoungeCommentStreamLightboxDetail,
                    onSharePost: handleShareLoungePost,
                  }}
                />
              ) : null}

              {loungeCommentDetailPathIds.length > 0 ? (
                <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_SECTION_CLASS}>
                  {!loungeReadOnly && !loungeDetailCommentsLoading ? (
                    <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SORT_ROW_CLASS}>
                      <LoungePostDetailCommentSort
                        value={loungeDetailCommentSort}
                        onChange={setLoungeDetailCommentSort}
                      />
                    </div>
                  ) : null}
                  <div className={LOUNGE_FEED_POST_DETAIL_COMMENT_SEPARATOR_CLASS} aria-hidden />
                </div>
              ) : null}
              </div>

              <div
                id={
                  loungeCommentDetailPathIds.length > 0
                    ? 'lounge-detail-comments-thread'
                    : 'lounge-detail-comments'
                }
                className="pt-0"
                style={loungeCommentDetailPathIds.length > 0 ? { paddingBottom: '80dvh' } : undefined}
              >
                {loungeReadOnly ? (
                  <p className="mt-1 text-[14px] text-zinc-500">
                    {loungeCommentDetailPathIds.length > 0
                      ? 'Sign in to read replies and participate.'
                      : typeof loungePostDetail.comment_count === 'number' && loungePostDetail.comment_count > 0
                        ? `${loungePostDetail.comment_count} comment${loungePostDetail.comment_count === 1 ? '' : 's'} · Sign in to read and reply`
                        : 'Sign in to join the conversation.'}
                  </p>
                ) : (
                  <>
                    {loungeDetailCommentsLoading ? (
                      <div className="mt-1 text-[14px] text-zinc-500">Loading comments…</div>
                    ) : (
                      <>
                        <LoungePostCommentThread
                          variant={
                            loungeCommentDetailPathIds.length > 0 ? 'commentDetailReplies' : 'post'
                          }
                          focusCommentId={loungeDetailCommentHierarchyFocusId}
                          postId={loungePostDetail?.id ?? null}
                          comments={loungeDetailComments}
                        postAuthorUserId={loungePostDetail.user_id}
                        postAgeLabel={postAgeLabel}
                        displayNameFor={displayNameFor}
                        handleFor={handleFor}
                        viewerUserId={composerUserId}
                        viewerPinnedCommentIds={loungeDetailViewerPinnedCommentIds}
                        rootCommentSortMode={loungeDetailCommentSort}
                        followingUserIds={loungeDetailFollowingUserIds}
                        loungeReadOnly={loungeReadOnly}
                        requireLoungeAuth={requireLoungeAuth}
                        openProfileGateIfNeeded={openProfileGateIfNeeded}
                        onCommentReplyInteraction={onLoungeCommentReplyInteraction}
                          onOpenCommentThread={
                            loungeCommentDetailPathIds.length > 0
                              ? drillDeeperIntoLoungeComment
                              : openLoungeCommentDrillFromRoots
                          }
                          onAvatarClickProfile={openAuthorProfile}
                          positionScrollRootRef={loungePostDetailScrollRef}
                          onCommentMenuEdit={onCommentMenuEditFromDetail}
                          onCommentMenuDelete={deleteLoungeDetailComment}
                          onCommentMenuBlock={onCommentMenuBlockFromDetail}
                          onCommentMenuReport={onCommentMenuReportFromDetail}
                          busyDeletingCommentId={loungeDetailCommentDeleteBusyId}
                          editingCommentId={loungeDetailCommentEditingId}
                          commentEditDraft={loungeDetailCommentEditDraft}
                          onCommentEditDraftChange={setLoungeDetailCommentEditDraft}
                          onCommentEditSave={saveLoungeDetailCommentEdit}
                          onCommentEditCancel={cancelLoungeDetailCommentEdit}
                          commentEditBusy={loungeDetailCommentEditBusy}
                          commentEditHasRemoteMedia={
                            loungeDetailCommentEditImageUrls.length > 0 ||
                            String(loungeDetailCommentEditGifUrl || '').trim().length > 0 ||
                            Boolean(
                              loungeDetailCommentEditingId &&
                                feedCommentStreamVideoUid(
                                  loungeDetailComments.find((r) => r.id === loungeDetailCommentEditingId),
                                ),
                            )
                          }
                          interactionStateFor={interactionStateForComment}
                          toggleInteraction={noopLoungeBarPostToggle}
                          onPlainRepost={(p) => void addLoungeDetailCommentPlainRepost(p.id)}
                          onUndoPlainRepost={(p) => void undoLoungeDetailCommentPlainRepost(p.id)}
                          toggleBookmark={noopLoungeBarPostToggle}
                          bookmarkedByPost={bookmarkedByPost}
                          onToggleCommentLike={toggleLoungeDetailCommentLike}
                          onToggleCommentBookmark={toggleLoungeDetailCommentBookmark}
                          getCommentBookmarked={getLoungeDetailCommentBookmarked}
                          repostActionBusy={repostManageBusy}
                          onMentionClick={openProfileByHandle}
                          onHashtagClick={openSearchByHashtag}
                          lightboxPortalClass={loungeDetailMediaLightboxPortalClass}
                          avatarText={avatarText}
                          avatarToneClass={avatarToneClass}
                          viewerFollowingUserIds={loungeReadOnly ? null : loungeFollowingUserIds}
                          onFollowUser={loungeReadOnly ? undefined : handleLoungeFollowUser}
                          feedVideoAutoplayEnabled={loungeFeedVideoAutoplayEnabled}
                          onFeedVideoAutoplayChange={onLoungeFeedVideoAutoplayChange}
                          onStreamLightboxOpenDetail={openLoungeCommentStreamLightboxDetail}
                          onSharePost={handleShareLoungePost}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
              </>
              </div>
              </LoungeFeedVideoAutoplayProvider>
            </div>
            {!loungeReadOnly ? (
              <div
                data-lounge-detail-comment-host
                data-lounge-fab-obstacle
                className="shrink-0 border-t border-zinc-800/90 bg-zinc-950/95 px-3 pt-2.5 pb-0 backdrop-blur-md supports-[backdrop-filter]:bg-zinc-950/80"
                style={{
                  // Keyboard open: `visualViewport` overlap already clears the keyboard — do not add
                  // `env(safe-area-inset-bottom)` here; iOS often keeps ~34px inset while the keyboard is up,
                  // which stacked under overlap and left a large dead band above the keys.
                  paddingBottom:
                    loungeDetailCommentKbOverlapPx > 0
                      ? `${loungeDetailCommentKbOverlapPx}px`
                      : `max(0.625rem, env(safe-area-inset-bottom))`,
                }}
              >
                {loungeDetailCommentErr ? (
                  <div className="mb-1 rounded-xl border border-rose-500/45 bg-rose-950/25 px-2.5 py-1.5 text-[13px] leading-snug text-rose-200">
                    {loungeDetailCommentErr}
                  </div>
                ) : null}
                {loungeDetailCommentComposerExpanded ? (
                  <div className="relative shrink-0 rounded-xl border border-zinc-600/65 bg-zinc-700/55 px-2.5 pt-2 pb-1">
                    <button
                      type="button"
                      onClick={requestDismissLoungeDetailCommentComposer}
                      className="absolute right-2 top-2 z-10 flex h-6 w-6 touch-manipulation items-center justify-center rounded-full bg-zinc-800/95 text-zinc-500 shadow-sm hover:bg-zinc-700 hover:text-zinc-200 active:text-white [-webkit-tap-highlight-color:transparent]"
                      title="Close reply"
                      aria-label="Close reply"
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
                    <div className="flex items-start gap-2">
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
                        className="mt-px flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-[14px] font-bold text-zinc-200 touch-manipulation hover:border-zinc-600 sm:h-10 sm:w-10 sm:text-[15px]"
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
                          <span className="block h-full w-full animate-pulse rounded-full bg-zinc-700/55" aria-hidden />
                        ) : (
                          <span
                            className={`flex h-full w-full items-center justify-center font-bold text-white ${avatarToneClass(
                              composerUserProfile?.user_id || composerUserId || 'me',
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
                      <div className="min-w-0 flex-1 pr-8">
                        <label htmlFor="lounge-detail-comment" className="sr-only">
                          Write a reply
                        </label>
                        <div ref={mentionDetailCommentAnchorRef}>
                        <textarea
                          ref={loungeDetailCommentTextareaRef}
                          id="lounge-detail-comment"
                          value={loungeDetailCommentDraft}
                          onChange={(e) => { setLoungeDetailCommentDraft(e.target.value); mentionDetailComment.onCursorMove(e) }}
                          onKeyUp={mentionDetailComment.onCursorMove}
                          onMouseUp={mentionDetailComment.onCursorMove}
                          onKeyDown={(e) => mentionDetailComment.onMentionKeyDown(e, setLoungeDetailCommentDraft, loungeDetailCommentTextareaRef.current)}
                          onBlur={(e) => {
                            const host = e.currentTarget.closest('[data-lounge-detail-comment-host]')
                            const next = e.relatedTarget
                            if (host && next instanceof Node && host.contains(next)) return
                            window.setTimeout(() => {
                              mentionDetailComment.clearMention()
                              if (loungeDetailCommentMediaSessionRef.current) return
                              if (loungeVideoCrop?.mode === 'detailComment') return
                              const t = loungeDetailCommentDraftRef.current.trim()
                              const hasLocal =
                                loungeDetailCommentImageItemsRef.current.length > 0 ||
                                loungeDetailCommentMediaUrlRef.current.length > 0 ||
                                loungeDetailCommentVideoSlotRef.current != null
                              if (!t && !hasLocal) {
                                setLoungeDetailCommentComposerExpanded(false)
                              }
                            }, 220)
                          }}
                          placeholder={LOUNGE_DETAIL_COMMENT_PLACEHOLDER}
                          maxLength={LOUNGE_COMMENT_BODY_MAX}
                          rows={1}
                          className="min-h-[38px] w-full resize-none overflow-hidden bg-transparent px-0 py-1 text-[17px] leading-[1.3] text-zinc-100 outline-none placeholder:text-zinc-500 selection:bg-cyan-500/25 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                          aria-label="Write a reply"
                        />
                        <LoungeMentionDropdown
                          suggestions={mentionDetailComment.suggestions}
                          activeIndex={mentionDetailComment.activeIndex}
                          loading={mentionDetailComment.loading}
                          onSelect={(p) => mentionDetailComment.onMentionSelect(p, setLoungeDetailCommentDraft, loungeDetailCommentTextareaRef.current)}
                          anchorRef={mentionDetailCommentAnchorRef}
                        />
                        </div>
                        <input
                          id={LOUNGE_DETAIL_COMMENT_MEDIA_INPUT_ID}
                          ref={loungeDetailCommentMediaInputRef}
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          className="hidden"
                          {...loungeFileInputMediaPickerHandlers('detailComment')}
                          onChange={(e) => {
                            const input = e.target
                            const files = Array.from(input.files || [])
                            if (!files.length) {
                              endLoungeComposerMediaPicker('detailComment')
                              restoreLoungeComposerCaptionAfterMediaPick('detailComment')
                              return
                            }
                            setLoungeDetailCommentErr('')
                            const hasVideo = files.some((f) => isProbablyVideoFile(f))
                            if (hasVideo) {
                              const vf = files.find((f) => isProbablyVideoFile(f))
                              if (!vf) {
                                endLoungeComposerMediaPicker('detailComment')
                                try {
                                  input.value = ''
                                } catch {
                                  // ignore
                                }
                                return
                              }
                              setLoungeDetailCommentImageItems((prev) => {
                                for (const it of prev) {
                                  try {
                                    URL.revokeObjectURL(it.preview)
                                  } catch {
                                    // ignore
                                  }
                                }
                                return []
                              })
                              cancelLoungeDetailCommentMediaPrep()
                              setLoungeDetailCommentMediaUrl('')
                              try {
                                input.value = ''
                              } catch {
                                // ignore
                              }
                              endLoungeComposerMediaPicker('detailComment')
                              restoreLoungeComposerCaptionAfterMediaPick('detailComment')
                              void queueLoungeVideoOrCrop(vf, 'detailComment')
                              return
                            }
                            const bad = files.some((f) => !isProbablyImageFile(f))
                            if (bad) {
                              setLoungeDetailCommentErr('Unsupported media type. Please choose an image or video file.')
                              endLoungeComposerMediaPicker('detailComment')
                              try {
                                input.value = ''
                              } catch {
                                // ignore
                              }
                              restoreLoungeComposerCaptionAfterMediaPick('detailComment')
                              return
                            }
                            cancelLoungeDetailCommentMediaPrep()
                            const prevImgs = loungeDetailCommentImageItemsRef.current
                            const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
                            loungeDetailCommentImageItemsRef.current = next
                            try {
                              input.value = ''
                            } catch {
                              // ignore
                            }
                            endLoungeComposerMediaPicker('detailComment')
                            restoreLoungeComposerCaptionAfterMediaPick('detailComment', () => {
                              setLoungeDetailCommentImageItems(next)
                              if (limitDialog) setLoungeImageLimitDialog(limitDialog)
                            })
                          }}
                        />
                        {(() => {
                          const gifUrl = String(loungeDetailCommentMediaUrl || '').trim()
                          const imageUrls = loungeDetailCommentImageItems.map((x) => x.preview)
                          const carouselUrls = gifUrl ? [...imageUrls, gifUrl] : imageUrls
                          if (carouselUrls.length === 0) return null
                          const nImg = loungeDetailCommentImageItems.length
                          return (
                            <LoungeImageCarousel
                              urls={carouselUrls}
                              variant="composer"
                              firstMarginTopClass="mt-1.5"
                              regionAriaLabel={gifUrl ? 'Reply images and GIF' : 'Reply images'}
                              removeLabelForIndex={(i) => (i < nImg ? 'Remove image' : 'Remove GIF')}
                              onRemoveIndex={(i) => {
                                if (i < nImg) {
                                  setLoungeDetailCommentImageItems((prev) => {
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
                                  setLoungeDetailCommentMediaUrl('')
                                }
                              }}
                            />
                          )
                        })()}
                        {loungeDetailCommentVideoSlot ? (
                          <div className="relative mt-1.5 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                            {!loungeDetailCommentVideoSlot.file && loungeDetailCommentVideoSlot.preview ? (
                              <img
                                src={loungeDetailCommentVideoSlot.preview}
                                alt=""
                                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                              />
                            ) : loungeDetailCommentVideoSlot.preview ? (
                              <video
                                src={loungeDetailCommentVideoSlot.preview}
                                poster={loungeDetailCommentVideoSlot.posterUrl || undefined}
                                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                                controls
                                playsInline
                                preload="metadata"
                                aria-label="Video preview"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => cancelLoungeDetailCommentMediaPrep()}
                              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
                              aria-label="Remove video"
                              title="Remove video"
                            >
                              ×
                            </button>
                          </div>
                        ) : null}
                        <div className="mx-auto mt-0.5 h-px w-[92%] bg-zinc-700/85" role="presentation" aria-hidden />
                        <div className="mt-0.5 flex w-full items-center gap-1.5 pb-0 pt-1">
                          <label
                            htmlFor={LOUNGE_DETAIL_COMMENT_MEDIA_INPUT_ID}
                            onPointerDown={() => beginLoungeComposerMediaPicker('detailComment')}
                            onMouseDown={(e) => e.preventDefault()}
                            className="flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md p-1 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
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
                          </label>
                          <button
                            type="button"
                            onClick={() => openKlipyPicker('detailComment')}
                            className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
                            title="Add GIF"
                            aria-label="Add GIF"
                          >
                            <svg className="h-7 w-7" viewBox="0 0 20 20" fill="none" aria-hidden>
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
                                style={{
                                  fontSize: '5.35px',
                                  fontWeight: 800,
                                  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
                                }}
                              >
                                GIF
                              </text>
                            </svg>
                          </button>
                          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                            <span
                              className={`shrink-0 text-[12px] tabular-nums ${loungeCharCounterClass(loungeDetailCommentDraft.length)}`}
                              aria-live="polite"
                            >
                              {loungeDetailCommentDraft.length}/{LOUNGE_COMMENT_BODY_MAX}
                            </span>
                            <button
                              type="button"
                              onClick={() => void submitLoungeDetailComment()}
                              disabled={
                                loungeDetailCommentVideoPostBlocked ||
                                (!loungeDetailCommentDraft.trim() &&
                                  loungeDetailCommentImageItems.length === 0 &&
                                  !String(loungeDetailCommentMediaUrl || '').trim() &&
                                  !loungeDetailCommentVideoSlot) ||
                                loungeDetailCommentDraft.length > LOUNGE_COMMENT_BODY_MAX
                              }
                              className="min-h-7 shrink-0 touch-manipulation rounded-md bg-cyan-600 px-2 py-0.5 text-[13px] font-bold leading-none text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (openProfileGateIfNeeded()) return
                      expandAndFocusLoungeDetailCommentComposer()
                    }}
                    className="flex min-h-10 w-full touch-manipulation items-center rounded-full border border-zinc-600/80 bg-zinc-900/90 px-3 py-2 text-left text-[15px] leading-tight text-zinc-500 [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900 active:bg-zinc-800/90"
                  >
                    {(() => {
                      const firstLine = String(loungeDetailCommentDraft || '')
                        .split('\n')[0]
                        .trim()
                      if (firstLine) {
                        return (
                          <span className="block w-full min-w-0 truncate text-zinc-100 [&_a]:pointer-events-none">
                            {renderRichCaption(firstLine, {
                              linkClassName:
                                'pointer-events-none font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70',
                            })}
                          </span>
                        )
                      }
                      return (
                        <span className="block w-full min-w-0 truncate text-zinc-500">
                          {LOUNGE_DETAIL_COMMENT_PLACEHOLDER}
                        </span>
                      )
                    })()}
                  </button>
                )}
              </div>
            ) : null}
            </div>
          </div>

        </div>
      ) : null}

      {loungeDetailCommentDiscardPromptOpen ? (
        <div
          className={`fixed inset-0 flex items-end justify-center bg-black/45 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8 backdrop-blur-[3px] sm:items-center sm:p-6 ${
            loungePostDetailAboveProfile ? 'z-[106]' : loungePostDetailOpenedOverSearch ? 'z-[101]' : 'z-[99]'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="lounge-detail-comment-discard-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default touch-manipulation bg-transparent"
            aria-label="Close"
            onClick={() => setLoungeDetailCommentDiscardPromptOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/85 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md">
            <h2 id="lounge-detail-comment-discard-title" className="text-[17px] font-bold text-white">
              Discard reply?
            </h2>
            <p className="mt-2 text-[14px] leading-snug text-zinc-400">
              Your reply text and any attached media will be cleared.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="order-2 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-1"
                onClick={collapseLoungeDetailCommentComposer}
              >
                Discard
              </button>
              <button
                type="button"
                className="order-1 min-h-11 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 touch-manipulation sm:order-2"
                onClick={() => setLoungeDetailCommentDiscardPromptOpen(false)}
              >
                Keep writing
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loungeDockPanel ? (
        <LoungeDockSlidePanels
          key={loungeDockPanel === 'search' ? `search-${loungeDockSearchQueryVersion}` : loungeDockPanel}
          initialSearchQuery={loungeDockPanel === 'search' ? loungeDockSearchQuery : ''}
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
          onSettings={onLoungeDockSettings}
          onOpenOwnProfile={onLoungeDockOpenOwnProfile}
          activePanel={loungeDockPanel}
          postCardProps={profilePostCardProps}
          onOpenPostFromSearch={onLoungeDockOpenPostFromSearch}
          searchSupabaseClient={supabaseClient}
          hydrateSearchPosts={hydrateCommunityPosts}
          onOpenProfileFromSearch={onLoungeDockOpenProfileFromSearch}
          chatSupabaseClient={supabaseClient}
          chatViewerUserId={composerUserId || ''}
          chatHasActiveSubscription={hasActiveSubscription}
          chatIsStaff={chatDockIsStaff}
          chatInitialPeerUserId={chatDockInitialPeerUserId}
          onChatInitialPeerCleared={clearChatDockInitialPeer}
          notificationsSupabaseClient={supabaseClient}
          notificationsViewerUserId={composerUserId || ''}
          onOpenPostFromNotifications={onLoungeOpenPostFromNotifications}
          onOpenProfileFromNotifications={onLoungeOpenProfileFromNotifications}
          onNotificationsUnreadChange={onLoungeNotificationsUnreadChange}
          blockUnderlyingPointer={loungeFabPointerBlocked}
          dockMenuLayout={loungeDockMenuLayout}
          onDockMenuLayoutChange={writeLoungeDockMenuLayout}
          feedVideoAutoplayEnabled={loungeFeedVideoAutoplayEnabled}
          onFeedVideoAutoplayChange={onLoungeFeedVideoAutoplayChange}
          feedVideoDebugEnabled={loungeFeedVideoDebugEnabled}
          onFeedVideoDebugChange={onLoungeFeedVideoDebugChange}
          onTitleRevealChange={onLoungePanelTitleReveal}
          videoCoordinatorSuspended={Boolean(loungePostDetail?.id)}
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
          onDockRevealChange={setLoungeProfileDockReveal}
          onNavigateToProfile={openAuthorProfile}
          onShareProfile={handleShareLoungeProfile}
          onBlockProfile={handleBlockLoungeProfile}
          suspendVideoCoordinator={Boolean(loungePostDetail?.id)}
          showVideoDebugHud={loungeProfileVideoDebugHud}
          viewerIsAdmin={loungeViewerIsAdmin}
          onAdminSetProfileRole={handleAdminSetProfileRole}
          onViewerFollowChange={syncLoungeViewerFollowState}
          stackAboveStreamLightbox={profileStackAboveStreamLightbox}
        />
      ) : null}

      {profileOverlayStack.map((layer, index) => {
        const isTop = index === profileOverlayStack.length - 1
        if (!isTop) return null
        return (
          <div
            key={`${layer.userId}-${index}`}
            className="fixed inset-0"
            style={{ zIndex: 102 + index }}
          >
            <LoungeProfileFullScreen
              stackedOverlay
              open
              panelVisible
              profileUserId={layer.userId}
              viewerUserId={composerUserId || ''}
              supabaseClient={supabaseClient}
              profile={layer.profile}
              posts={layer.posts}
              loading={layer.loading}
              error={layer.error}
              isOwnProfile={Boolean(composerUserId && layer.userId === composerUserId)}
              onClose={popProfileOverlay}
              onAfterTransitionOut={popProfileOverlay}
              postCardProps={profilePostCardProps}
              onProfileUpdated={onProfileScreenUpdated}
              hydratePosts={hydrateCommunityPosts}
              onNavigateToProfile={openAuthorProfile}
              onShareProfile={handleShareLoungeProfile}
              onBlockProfile={handleBlockLoungeProfile}
              suspendVideoCoordinator={Boolean(loungePostDetail?.id)}
              showVideoDebugHud={loungeProfileVideoDebugHud && isTop}
              viewerIsAdmin={loungeViewerIsAdmin}
              onAdminSetProfileRole={handleAdminSetProfileRole}
              onViewerFollowChange={syncLoungeViewerFollowState}
            />
          </div>
        )
      })}

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
                        <div className={`${LOUNGE_FEED_AVATAR_CLASS} border-zinc-600`}>
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
                            <div ref={mentionQuoteRepostAnchorRef}>
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
                                onChange={(e) => { setQuoteRepostDraft(e.target.value); mentionQuoteRepost.onCursorMove(e) }}
                                onKeyUp={mentionQuoteRepost.onCursorMove}
                                onMouseUp={mentionQuoteRepost.onCursorMove}
                                onKeyDown={(e) => mentionQuoteRepost.onMentionKeyDown(e, setQuoteRepostDraft, quoteRepostTextareaRef.current)}
                                onBlur={() => window.setTimeout(() => mentionQuoteRepost.clearMention(), 150)}
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
                            <LoungeMentionDropdown
                              suggestions={mentionQuoteRepost.suggestions}
                              activeIndex={mentionQuoteRepost.activeIndex}
                              loading={mentionQuoteRepost.loading}
                              onSelect={(p) => mentionQuoteRepost.onMentionSelect(p, setQuoteRepostDraft, quoteRepostTextareaRef.current)}
                              anchorRef={mentionQuoteRepostAnchorRef}
                            />
                            </div>
                            <input
                              id={LOUNGE_QUOTE_REPOST_MEDIA_INPUT_ID}
                              ref={quoteRepostMediaInputRef}
                              type="file"
                              accept="image/*,video/*"
                              multiple
                              className="hidden"
                              {...loungeFileInputMediaPickerHandlers('quote')}
                              onChange={(e) => {
                                const input = e.target
                                const files = Array.from(input.files || [])
                                if (!files.length) {
                                  endLoungeComposerMediaPicker('quote')
                                  restoreLoungeComposerCaptionAfterMediaPick('quote')
                                  return
                                }
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
                                  endLoungeComposerMediaPicker('quote')
                                  restoreLoungeComposerCaptionAfterMediaPick('quote')
                                  void queueLoungeVideoOrCrop(vf, 'quote')
                                  return
                                }
                                const bad = files.some((f) => !isProbablyImageFile(f))
                                if (bad) {
                                  setQuoteRepostErr('Unsupported media type. Please choose an image or video file.')
                                  endLoungeComposerMediaPicker('quote')
                                  try {
                                    input.value = ''
                                  } catch {
                                    // ignore
                                  }
                                  restoreLoungeComposerCaptionAfterMediaPick('quote')
                                  return
                                }
                                cancelQuoteRepostMediaPrep()
                                setQuoteRepostMediaUrl('')
                                const prevImgs = quoteRepostImageItemsRef.current
                                const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
                                quoteRepostImageItemsRef.current = next
                                try {
                                  input.value = ''
                                } catch {
                                  // ignore
                                }
                                endLoungeComposerMediaPicker('quote')
                                restoreLoungeComposerCaptionAfterMediaPick('quote', () => {
                                  setQuoteRepostImageItems(next)
                                  if (limitDialog) setLoungeImageLimitDialog(limitDialog)
                                })
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
                          <label
                            htmlFor={LOUNGE_QUOTE_REPOST_MEDIA_INPUT_ID}
                            onPointerDown={() => {
                              if (!quoteRepostBusy) beginLoungeComposerMediaPicker('quote')
                            }}
                            onMouseDown={(e) => {
                              if (!quoteRepostBusy) e.preventDefault()
                            }}
                            className={`flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md p-1.5 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent] ${
                              quoteRepostBusy ? 'pointer-events-none opacity-45' : ''
                            }`}
                            title="Add media"
                            aria-label="Add media"
                            aria-disabled={quoteRepostBusy || undefined}
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
                          </label>
                          <button
                            type="button"
                            disabled={quoteRepostBusy}
                            onClick={() => {
                              if (quoteRepostBusy) return
                              openKlipyPicker('quote')
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
                        <div className={`${LOUNGE_FEED_AVATAR_CLASS} invisible pointer-events-none`} aria-hidden />
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
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-nowrap items-center justify-start gap-x-1.5 text-[14px] leading-snug">
                                    <span className="min-w-0 truncate font-semibold text-zinc-200">
                                      {displayNameFor(orig)}
                                    </span>
                                    <span className="shrink-0">
                                      <LoungeStaffRoleBadge role={orig?.author_profile?.role} size="detail" />
                                    </span>
                                    <span className="shrink-0">
                                      <LoungeOgBadge isOg={orig?.author_profile?.is_og} size="detail" />
                                    </span>
                                    <span className="inline-flex min-w-0 max-w-[min(10rem,48vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[14px] text-zinc-500 sm:max-w-[12rem]">
                                      <span className="min-w-0 truncate">{handleFor(orig)}</span>
                                    </span>
                                  </div>
                                  {orig.pinned ? (
                                    <div className="mt-1">
                                      <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                                        Pinned
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                                  {renderRichCaption(feedPostDisplayCaption(orig))}
                                </div>
                                <LoungePostFeedImagesAndGif
                                  post={orig}
                                  variant="embed"
                                  firstMarginTopClass="mt-2"
                                  lightboxPortalClass="z-[110]"
                                  visibilityResetRootRef={quoteRepostScrollRef}
                                  streamLightboxHost={orig}
                                  streamLightboxSurface={quoteRepostStreamLightboxSurface}
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

      {profileGateOpen && typeof document !== 'undefined'
        ? createPortal(
            <div className="fixed inset-0 z-[115] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]" role="dialog" aria-modal>
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
            <div className="block">
              <span className="text-zinc-400 text-[13px] font-semibold uppercase tracking-wide">Profile photo</span>
              <div className="mt-1 flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="flex h-[3.3rem] w-[3.3rem] overflow-hidden rounded-full border border-zinc-700 bg-zinc-950 text-[13px] font-bold text-zinc-200">
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
                  </div>
                  <input
                    ref={profileGateAvatarInputRef}
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
                  <button
                    type="button"
                    onClick={() => profileGateAvatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 z-10 rounded-full border border-zinc-600/90 bg-zinc-950/95 px-2 py-0.5 text-[10px] font-semibold leading-tight text-zinc-200 shadow-md hover:bg-zinc-900 touch-manipulation sm:px-2.5 sm:py-1 sm:text-[11px] [-webkit-tap-highlight-color:transparent]"
                    aria-label="Change profile photo"
                  >
                    Photo
                  </button>
                </div>
              </div>
            </div>
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
        </div>,
            document.body,
          )
        : null}

      <ProfileAvatarCropModal
        open={Boolean(profileGateAvatarCropFile)}
        file={profileGateAvatarCropFile}
        onCancel={onProfileGateAvatarCropCancel}
        onApply={onProfileGateAvatarCropApply}
      />

      <ProfileHandleConflictDialog
        open={Boolean(profileGateHandleConflict)}
        busy={profileGateBusy}
        requestedHandle={profileGateHandleConflict?.requestedHandle}
        reason={profileGateHandleConflict?.reason}
        suggestedHandle={profileGateHandleConflict?.suggestedHandle}
        onCancel={() => setProfileGateHandleConflict(null)}
        onUseSuggested={(next) => {
          if (!next) return
          setProfileGateHandle(String(next))
          setProfileGateHandleConflict(null)
          void saveProfileGate({ forcedHandle: next })
        }}
      />

      {loungePostUploadBar ? (
        <div
          ref={loungeUploadBarRef}
          data-lounge-fab-obstacle
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[94] border-t border-zinc-700/90 bg-zinc-950/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-zinc-200">
                {loungeSubmitQueueDisplay.total > 1
                  ? `Post ${loungeSubmitQueueDisplay.index} of ${loungeSubmitQueueDisplay.total}`
                  : loungePostUploadBar.mode === 'mediaPrep'
                    ? 'Uploading media…'
                    : 'Uploading post…'}
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
                const backgroundUploadActive =
                  loungePostJobRunningRef.current || loungeDetailCommentJobRunningRef.current
                if (
                  backgroundUploadActive ||
                  loungePostUploadBar.postSubmission ||
                  loungePostUploadBar.mode !== 'mediaPrep'
                ) {
                  cancelLoungePostUpload()
                  return
                }
                if (loungeDetailCommentVideoSlotRef.current?.prepStatus === 'preparing') {
                  cancelLoungeDetailCommentMediaPrep({ userInitiated: true })
                } else if (quoteRepostVideoSlotRef.current?.prepStatus === 'preparing') {
                  cancelQuoteRepostMediaPrep({ userInitiated: true })
                } else {
                  cancelComposerMediaPrep({ userInitiated: true })
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
            } else if (loungeVideoCrop.mode === 'detailComment') {
              loungeDetailCommentMediaSessionRef.current = false
            }
            setLoungeVideoCrop(null)
          }}
          onConfirm={(result) => {
            const cropMode = loungeVideoCrop.mode
            if (cropMode === 'composer' || cropMode === 'quote' || cropMode === 'detailComment') {
              const startPrep =
                cropMode === 'quote'
                  ? startQuoteRepostVideoPrepFromSpec
                  : cropMode === 'detailComment'
                    ? startLoungeDetailCommentVideoPrepFromSpec
                    : startComposerVideoPrepFromSpec
              const disposeSlot =
                cropMode === 'quote'
                  ? () => disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
                  : cropMode === 'detailComment'
                    ? () => disposeComposerVideoMedia(loungeDetailCommentVideoSlotRef.current)
                    : () => disposeComposerVideoMedia(composerVideoSlotRef.current)
              if (result instanceof File) {
                disposeSlot()
                const previewUrl = URL.createObjectURL(result)
                startPrep(
                  { kind: 'direct', file: result },
                  { file: result, posterUrl: null, preview: previewUrl, streamVideoUid: null },
                )
                if (cropMode === 'quote') setQuoteRepostMediaUrl('')
                else if (cropMode === 'detailComment') setLoungeDetailCommentMediaUrl('')
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
                if (cropMode === 'quote') setQuoteRepostMediaUrl('')
                else if (cropMode === 'detailComment') setLoungeDetailCommentMediaUrl('')
                else setComposerMediaUrl('')
              }
            } else if (result instanceof File) {
              setLoungeDetailEditMediaFile(result)
              setLoungeDetailEditMediaKind('video')
            }
            setLoungeVideoCrop(null)
            if (cropMode === 'composer' || cropMode === 'quote' || cropMode === 'detailComment') {
              if (cropMode === 'detailComment') loungeDetailCommentMediaSessionRef.current = false
              restoreLoungeComposerCaptionAfterMediaPick(cropMode)
            }
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
      </LoungeStreamLightboxProvider>
    </div>
  )
}
