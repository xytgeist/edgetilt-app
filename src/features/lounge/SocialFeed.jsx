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
import { Z_APP_MODAL } from '../../constants/appZIndex.js'
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
  isQuoteRepostPost,
  normalizeFeedCaption,
  quoteRepostOriginalUnavailable,
} from '../../utils/communityFeedPost'
import {
  feedPostCategoryPills,
  displayPostCategoryPills,
  resolvePlainRepostCategoryPills,
  resolveQuoteRepostInitialCategoryPills,
  normalizeLoungeProfileCategoryPills,
  profileCategoryPills,
} from '../../utils/loungePostCategoryPills.js'
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
  stripLoungeDockQueryParam,
  stripLoungeActivityPushQueryParams,
} from '../../utils/loungeSharePost'
import {
  isLoungeActivitySchemaMissingError,
  loungeActivityMarkPushOpened,
  loungeActivityUnreadCount,
} from '../../utils/loungeActivityApi.js'
import {
  drainLoungeActivityMarkReadQueue,
  queueLoungeActivityMarkRead,
} from '../../utils/loungeActivityMarkReadQueue.js'
import useLoungePushNotifications from './hooks/useLoungePushNotifications.js'
import useLoungeNotificationPreferences from './hooks/useLoungeNotificationPreferences.js'
import {
  readLoungeProfileCache,
  writeLoungeProfileCache,
  readLoungeComposerDraft,
  persistLoungeComposerDraft,
  clearLoungeComposerDraft,
  readLoungeComposerLastCategoryPills,
  writeLoungeComposerLastCategoryPills,
  persistLoungeComposerLastCategoryPillsFromSubmit,
  LOUNGE_PROFILE_CACHE_KEY,
  loungeProfileNeedsGate,
  writeProfileGateAck,
  readLoungeWelcomeAck,
  writeLoungeWelcomeAck,
  readLoungeSlotsMenuHintAck,
  writeLoungeSlotsMenuHintAck,
} from './loungeStorage'
import LoungeWelcomeModal from './LoungeWelcomeModal.jsx'
import LoungeSlotsMenuHintOverlay from './LoungeSlotsMenuHintOverlay.jsx'
import {
  consumeReopenLoungeDockPanel,
  consumeReopenLoungeWelcome,
} from '../legal/index.js'
import LoungePostDraftsSheet from './LoungePostDraftsSheet.jsx'
import LoungeThreadComposeSheet from './LoungeThreadComposeSheet.jsx'
import LoungeComposerMediaToolbar from './LoungeComposerMediaToolbar.jsx'
import {
  countLoungePostDrafts,
  deleteLoungePostDraft,
  listLoungePostDrafts,
  loungePostDraftComposerVideoSlot,
  loungePostDraftHasContent,
  loungePostDraftIsThread,
  loungePostDraftPayloadFromSubmissionSnapshot,
  loungePostDraftThreadComposePartMedia,
  loungePostDraftThreadPartMediaInputFromCompose,
  loungePostDraftThreadParts,
  loungePostDraftValidateComposePartsForSave,
  loungePostDraftValidateComposerVideoSlotForSave,
  prepareLoungePostDraftPayloadForUpsert,
  upsertLoungePostDraft,
} from '../../utils/loungePostDraftApi.js'
import { markLoungeColdBootFeedMounted } from '../../utils/loungeColdBootFeedMounted.js'
import { loungeFeedPostRowPerfStyle } from '../../utils/loungeFeedPostRowPerfStyle.js'
import { setLoungeColdBootPendingWork } from '../../utils/loungeColdBootPendingWork.js'
import {
  executeLoungeCommunityPostSubmission,
  executeLoungeCommunityPostUpdate,
  loungeSubmissionSnapshotIncludesVideo,
  loungeSubmissionSnapshotThreadPartCount,
  sanitizeLoungeThreadSnapshotForVideoRetry,
} from './loungePostSubmitJob'
import {
  executeLoungeCommentSubmission,
  executeLoungeCommentUpdate,
} from './loungeCommentSubmitJob.js'
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
import LoungeRichComposerField from './LoungeRichComposerField.jsx'
import { renderRichCaption } from './loungeCaption'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
import {
  hrefForExternalOpen,
  parseGuideSlugFromUrlOrScheme,
  parseLoungePostIdFromUrl,
  parseLoungeProfileHandleFromUrl,
} from './loungeCaptionLink.js'
import { useMentionState } from './loungeMentionAutocomplete'
import LoungeComposerMarketSymbolPills from './LoungeComposerMarketSymbolPills.jsx'
import LoungeMentionDropdown from './LoungeMentionDropdown'
import { LoungeImageCarousel, LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungePostArticle from './LoungePostArticle'
import LoungeLinkPreviewBlock from './LoungeLinkPreviewBlock.jsx'
import { bodyTextWithLinkPreview } from '../../utils/linkifyText.jsx'
import { COMMUNITY_FEED_SELECT } from '../../utils/loungeFeedScope.js'
import { normalizeMarketEmbeds, LOUNGE_MARKET_EMBED_MAX, extractCashtagsFromCaption } from '../../utils/loungeMarketCaptionParse.js'
import LoungeFeedPendingStatusRow from './LoungeFeedPendingStatusRow.jsx'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import LoungePostCategoryPillPicker from './LoungePostCategoryPillPicker.jsx'
import LoungePostCategoryPillRow from './LoungePostCategoryPillRow.jsx'
import LoungePostOriginalUnavailableEmbed from './LoungePostOriginalUnavailableEmbed.jsx'
import {
  LoungeStreamLightboxProvider,
  buildLoungeStreamLightboxCtxFromPostCardProps,
} from './LoungeStreamLightboxContext.jsx'
import { isFeedCommentEntity, loungeStreamLightboxMediaSource } from './loungeStreamLightboxRenderers.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import {
  LOUNGE_COMMENT_BUBBLE_D,
  LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS,
} from './loungeCommentGlyph.js'
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
import {
  getLoungeDockSuppressed,
  subscribeLoungeDockSuppressed,
} from './loungeDockSuppressRegistry.js'
import { pauseAllLoungeStreamInlineVideos } from '../../utils/loungeStreamInlineVideoControl.js'
import LoungeProfileFullScreen from './LoungeProfileFullScreen'
import {
  createLoungeNavReturnStack,
  popLoungeNavReturnFrame,
  pushLoungeNavReturnFrame,
} from './loungeNavReturnStack.js'
import {
  fetchLoungeProfilePosts,
  fetchLoungeProfileRow,
  loadLoungeProfileScreenPostsRemainder,
  LOUNGE_PROFILE_POST_INITIAL_LIMIT,
} from './loungeProfileScreenLoad.js'
import ProfileAvatarCropModal from './ProfileAvatarCropModal'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeQuoteRepostEmbedAuthorMeta from './LoungeQuoteRepostEmbedAuthorMeta.jsx'
import LoungeVideoCropModal from './LoungeVideoCropModal.jsx'
import {
  loungeSubmitSnapshotBlobUrls,
  pinLoungeStreamSessionPoster,
  releaseLoungeStreamSessionPoster,
} from './loungeStreamSessionPoster.js'
import KlipyGifPicker from './KlipyGifPicker.jsx'
import LoungeMarketChartModal from './LoungeMarketChartModal.jsx'
import LoungeMarketChartStrip from './LoungeMarketChartStrip.jsx'
import { LoungeMarketFeedProvider } from './LoungeMarketFeedContext.jsx'
import { useLoungeMarketPollActivityTracker } from './loungeMarketPollActivity.js'
import LoungeMarketSymbolPickerSheet from './LoungeMarketSymbolPickerSheet.jsx'
import EdgeLogoWithEasterEgg from '../../components/EdgeLogoWithEasterEgg.jsx'
import PwaInstallTitleBarRow from '../../components/PwaInstallBanner.jsx'
import TitleBarStatusLine from '../../components/TitleBarStatusLine.jsx'
// LOUNGE_DOCK_FOOTER_BAR_DISABLED - classic dock icon row (FAB wheel is primary nav). Re-enable import + JSX below to restore.
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
import { useQuickLinkIds } from '../shell/quickLinksStore.js'
import { edgeLogoTitleBarClassName } from '../shell/titleBarLayout.js'
import { useEdgeTitleBarReveal } from '../shell/edgeTitleBarRevealStore.js'
import LoungePostDetailCommentSort from './LoungePostDetailCommentSort.jsx'
import LoungePostDetailCommentHierarchy from './LoungePostDetailCommentHierarchy.jsx'
import LoungePostThreadPartsHierarchy from './LoungePostThreadPartsHierarchy.jsx'
import { feedThreadPartsFromComments, loungePostIsThreadRoot } from '../../utils/loungePostThreadApi.js'
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
import {
  readAppConsoleLogHudEnabled,
  subscribeAppConsoleLogHudEnabled,
  writeAppConsoleLogHudEnabled,
} from '../../utils/appConsoleLogHudPref.js'
import {
  readLoungeBuildBadgeEnabled,
  subscribeLoungeBuildBadgeEnabled,
  writeLoungeBuildBadgeEnabled,
} from '../../utils/loungeBuildBadgePref.js'
import { LOUNGE_FEED_SCOPE_ALL, LOUNGE_FEED_SCOPE_FOLLOWING } from '../../utils/loungeFeedScope'
import { LOUNGE_FEED_SORT } from '../../utils/loungeFeedSortPref'
import LoungeFeedSortSwitch from './LoungeFeedSortSwitch.jsx'
import LoungeFeedCategoryFilter from './LoungeFeedCategoryFilter.jsx'
import LoungePullRefreshZone from './LoungePullRefreshZone.jsx'
import { useLoungePullToRefresh } from './useLoungePullToRefresh.js'
import LoungeFeedScopeSwitch from './LoungeFeedScopeSwitch.jsx'
import {
  LOUNGE_CAPTION_MAX,
  LOUNGE_COMMENT_BODY_MAX,
  LOUNGE_POST_THREAD_MAX_PARTS,
} from '../../utils/loungeCommentLimits.js'
import {
  collectThreadComposePartMediaBlobUrls,
  emptyThreadComposePartMedia,
  normalizeThreadComposePartsForSubmit,
  revokeThreadComposePartMediaFull,
  revokeThreadComposePartVideoSlot,
  threadComposePartHasContent,
  threadComposePartHasMedia,
  threadComposePartHasVideo,
  threadPartImageItemsFromSnapshot,
  threadPartImagePreviewBlobUrlsFromMedia,
} from '../../utils/loungeThreadComposeMedia.js'
import {
  stripDraftMediaMarkersFromCaption,
  threadDraftGifDisplayName,
} from '../../utils/loungeThreadComposeDraftMediaMarkers.js'
import {
  createThreadComposeVideoPrepController,
  LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE,
  threadComposePartVideoSnapshotFields,
  threadComposeVideoSlotBlocksPost,
  threadPartVideoSlotFromSnapshot,
} from './loungeThreadComposeVideoPrep.js'
/** DB raises exception 'MAX_PINNED_POSTS' when a third visible pin is attempted. */
const LOUNGE_MAX_PINNED_ALERT =
  'The maximum number of pinned posts is two. Unpin a post to pin this one.'

/** Post detail reply composer - collapsed pill copy when empty + expanded textarea placeholder. */
const LOUNGE_DETAIL_COMMENT_PLACEHOLDER = "Post your reply (or don't, nerd)"

const FEED_COMMENT_SELECT_COLS =
  'id,body,created_at,user_id,parent_id,comment_count,like_count,repost_count,bookmark_count,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,edited_at,link_preview,is_thread_part,thread_part_index'

function loungeDetailShowsCaption(row) {
  if (!row) return false
  return Boolean(bodyTextWithLinkPreview(feedPostDisplayCaption(row), row.link_preview))
}

function loungeDetailCaptionDisplayText(row) {
  return bodyTextWithLinkPreview(feedPostDisplayCaption(row), row?.link_preview)
}

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

/** Thread ancestor tap - same interactive exclusions as comment/post feed rows. */
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

const LOUNGE_COMPOSER_IMAGE_INPUT_ID = 'lounge-composer-image-input'
const LOUNGE_COMPOSER_VIDEO_INPUT_ID = 'lounge-composer-video-input'
const LOUNGE_DETAIL_COMMENT_IMAGE_INPUT_ID = 'lounge-detail-comment-image-input'
const LOUNGE_DETAIL_COMMENT_VIDEO_INPUT_ID = 'lounge-detail-comment-video-input'
/** Scroll padding under floating post-detail reply footer (matches chat composer gap). */
const LOUNGE_DETAIL_COMMENT_FOOTER_SCROLL_GAP_PX = 8
const LOUNGE_DETAIL_EDIT_IMAGE_INPUT_ID = 'lounge-detail-edit-image-input'
const LOUNGE_DETAIL_EDIT_VIDEO_INPUT_ID = 'lounge-detail-edit-video-input'
const LOUNGE_COMMENT_EDIT_IMAGE_INPUT_ID = 'lounge-comment-edit-image-input'
const LOUNGE_COMMENT_EDIT_VIDEO_INPUT_ID = 'lounge-comment-edit-video-input'
const LOUNGE_QUOTE_REPOST_IMAGE_INPUT_ID = 'lounge-quote-repost-image-input'
const LOUNGE_QUOTE_REPOST_VIDEO_INPUT_ID = 'lounge-quote-repost-video-input'
const LOUNGE_THREAD_COMPOSE_IMAGE_INPUT_ID = 'lounge-thread-compose-image-input'
const LOUNGE_THREAD_COMPOSE_VIDEO_INPUT_ID = 'lounge-thread-compose-video-input'

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

function loungeFilteredMediaFiles(pickKind, fileList) {
  const files = Array.from(fileList || [])
  if (pickKind === 'video') return files.filter(isProbablyVideoFile).slice(0, 1)
  return files.filter(isProbablyImageFile)
}

function loungeMediaPickErrorMessage(pickKind) {
  return pickKind === 'video'
    ? 'Unsupported media type. Please choose a video file.'
    : 'Unsupported media type. Please choose an image file.'
}

function clearHiddenFileInputs(...elements) {
  for (const el of elements) {
    try {
      if (el) el.value = ''
    } catch {
      // ignore
    }
  }
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

/** True when a post edit uploads new media and the feed row should show an updating spinner. */
function loungePostEditSnapshotShowsFeedCardSpinner(snapshot) {
  if (!snapshot?.postId) return false
  const nImg = Array.isArray(snapshot.imageFiles) ? snapshot.imageFiles.length : 0
  if (nImg > 0) return true
  if (loungeSubmissionSnapshotIncludesVideo(snapshot)) return true
  return false
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
  loungeFeedCategoryExcludedSlugs = [],
  onLoungeFeedCategoryFilterChange,
  loungeFeedBrowseMode = 'member',
  /** False while Supabase session is still restoring (push / cold start). */
  authSessionReady = true,
  /** True while the Lounge cold-boot splash covers the feed (defer first-run modals). */
  coldBootSplashVisible = false,
  /** True only when the Lounge tab is the active/visible screen; gates the portaled dock FAB. */
  isActivePage = true,
  /** Called when the user should return to the Lounge feed tab (e.g. dock home from another shell tab). */
  onNavigateToLoungeFeed,
  onLogout,
  onDeleteAccount,
  deleteAccountBusy = false,
  /** Called with a guide machine slug when user taps a guide embed card in the feed. */
  onOpenGuideCard,
  /** Called with peerUserId when "Message" is tapped on a profile - navigates to Chat tab at app shell level. */
  onOpenChatWithUser,
  /** Called with roomId when a room is tapped in the dock chat panel - navigates to Chat tab. */
  onOpenChatRoomFromDock,
  /** When set, opens the lounge profile modal for this user (e.g. from Chat member profile). */
  requestOpenProfileUserId = null,
  onRequestOpenProfileConsumed,
  /** Open terms, privacy, or guidelines in-app with return navigation. */
  onOpenLegalDocument = null,
  /** Staff-only: trigger TabErrorBoundary on the active Slots tool tab. */
  onSimulateTabError = null,
  /** Staff-only: clear tab error strike count (False Start vs Fumble testing). */
  onResetTabErrorStrikes = null,
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
  /** Full-screen thread composer (multi-post with per-section media). */
  const [threadComposeOpen, setThreadComposeOpen] = useState(false)
  const [threadComposeSessionKey, setThreadComposeSessionKey] = useState(0)
  const [threadComposeCaptions, setThreadComposeCaptions] = useState([''])
  const [threadComposePartMedia, setThreadComposePartMedia] = useState([emptyThreadComposePartMedia()])
  const [threadComposeActivePartIndex, setThreadComposeActivePartIndex] = useState(0)
  const [threadComposeErr, setThreadComposeErr] = useState('')
  const [threadComposeDiscardOpen, setThreadComposeDiscardOpen] = useState(false)
  const [threadComposeFocusPartIndex, setThreadComposeFocusPartIndex] = useState(null)
  const threadComposeFieldRef = useRef(null)
  const threadComposePartRefMap = useRef({})
  const threadComposeMentionAnchorRef = useRef(null)
  const threadComposeImageInputRef = useRef(null)
  const threadComposeVideoInputRef = useRef(null)
  const threadComposeOpenRef = useRef(false)
  const threadComposeActivePartIndexRef = useRef(0)
  const threadComposePartMediaRef = useRef(threadComposePartMedia)
  const threadComposeVideoPrepByPartRef = useRef({})
  const threadComposeVideoPrepJobIdRef = useRef(0)
  const threadComposeVideoPrepControllerRef = useRef(null)
  threadComposeOpenRef.current = threadComposeOpen
  threadComposeActivePartIndexRef.current = threadComposeActivePartIndex
  threadComposePartMediaRef.current = threadComposePartMedia
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
  const [marketPickerOpen, setMarketPickerOpen] = useState(false)
  const [marketPickerTarget, setMarketPickerTarget] = useState(/** @type {'composer' | 'detailEdit'} */ ('composer'))
  const [composerMarketSymbols, setComposerMarketSymbols] = useState([])
  const [loungeDetailEditMarketSymbols, setLoungeDetailEditMarketSymbols] = useState([])
  const [marketChartModal, setMarketChartModal] = useState({
    open: false,
    embeds: [],
    focusSymbol: null,
  })
  const [composerCategoryPills, setComposerCategoryPills] = useState(() => readLoungeComposerLastCategoryPills())
  /** Server draft id when composer content was loaded from or last saved to `lounge_post_drafts`. */
  const [loungeComposerActiveDraftId, setLoungeComposerActiveDraftId] = useState(null)
  const [loungeDraftCount, setLoungeDraftCount] = useState(0)
  const [loungeDraftsSheetOpen, setLoungeDraftsSheetOpen] = useState(false)
  const [loungeDraftsList, setLoungeDraftsList] = useState([])
  const [loungeDraftsLoading, setLoungeDraftsLoading] = useState(false)
  const [loungeDraftSheetBusyId, setLoungeDraftSheetBusyId] = useState(null)
  const loungeComposerActiveDraftIdRef = useRef(null)
  loungeComposerActiveDraftIdRef.current = loungeComposerActiveDraftId

  useEffect(() => {
    writeLoungeComposerLastCategoryPills(composerCategoryPills)
  }, [composerCategoryPills])
  const [postBusy, setPostBusy] = useState(false)
  const [postErr, setPostErr] = useState('')
  /** Bottom bar during background lounge post submission (`progress` 0–1, plus diagnostic copy). */
  const [loungePostUploadBar, setLoungePostUploadBar] = useState(null)
  const loungeUploadBarRef = useRef(null)
  const [loungeUploadBarHeightPx, setLoungeUploadBarHeightPx] = useState(0)
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
  /** Video-only submission queue - text/image/GIF use the fast lane (parallel). */
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
  const closeThreadComposeImmediateRef = useRef(/** @type {(opts?: object) => void} */ ((opts = {}) => { void opts }))
  const runBackgroundLoungeDetailCommentSubmissionRef = useRef(
    /** @type {(jobOrSnapshot: unknown) => void} */ (() => {}),
  )
  const runBackgroundLoungePostEditSubmissionRef = useRef(
    /** @type {(jobOrSnapshot: unknown) => void} */ (() => {}),
  )
  const runBackgroundLoungeCommentEditSubmissionRef = useRef(
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
  const [loungeWelcomeOpen, setLoungeWelcomeOpen] = useState(false)
  const loungeWelcomeScheduleRef = useRef(false)
  const [slotsMenuHintOpen, setSlotsMenuHintOpen] = useState(false)
  const [profileGateBusy, setProfileGateBusy] = useState(false)
  const [profileGateErr, setProfileGateErr] = useState('')
  const [profileGateHandle, setProfileGateHandle] = useState('')
  const [profileGateHandleConflict, setProfileGateHandleConflict] = useState(null)
  const [profileGateDisplayName, setProfileGateDisplayName] = useState('')
  const [profileGateCategoryPills, setProfileGateCategoryPills] = useState([])
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
  /** Clears post detail / profile stack before FAB dock navigation (defined later). */
  const dismissLoungeStackForDockNavRef = useRef(() => {})
  /** When profile opens from dock search/notifications, back restores that panel. @deprecated - use loungeNavReturnStackRef */
  const profileReturnDockPanelRef = useRef(null)
  const loungeNavReturnStackRef = useRef(createLoungeNavReturnStack())
  const loungeNavRestoringRef = useRef(false)
  const loungeNavSearchReturnPendingRef = useRef(false)
  const profileNavSnapshotRef = useRef({ tab: 'posts', scrollTop: 0 })
  const loungeDockPanelScrollRef = useRef(null)
  const restoreLoungeNavFrameRef = useRef(async () => {})
  const pushLoungeNavReturnContextRef = useRef(() => {})
  const [profileNavRestore, setProfileNavRestore] = useState(null)
  const [dockPanelScrollRestore, setDockPanelScrollRestore] = useState(null)
  const [profileModalLoading, setProfileModalLoading] = useState(false)
  const [profileModalErr, setProfileModalErr] = useState('')
  const [profileModalData, setProfileModalData] = useState(null)
  const [profileModalPosts, setProfileModalPosts] = useState([])
  const [profileModalStartEditing, setProfileModalStartEditing] = useState(false)
  const [profileModalFollowListTab, setProfileModalFollowListTab] = useState(null)
  const [profileModalHighlightFollowerIds, setProfileModalHighlightFollowerIds] = useState([])
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
  const loungeDetailCommentFooterRef = useRef(null)
  const loungePostDetailPostAvatarRef = useRef(null)
  const loungePostDetailCommentConnectorRef = useRef(null)
  const loungeDetailCommentFieldRef = useRef(null)
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
  const [quoteRepostCategoryPills, setQuoteRepostCategoryPills] = useState([])
  /** Quote repost sheet: optional video (same slot shape as main composer). */
  const [quoteRepostVideoSlot, setQuoteRepostVideoSlot] = useState(null)
  const quoteRepostVideoSlotRef = useRef(null)
  const quoteRepostVideoPrepJobIdRef = useRef(0)
  const quoteRepostVideoPrepAbortRef = useRef(null)
  const quoteRepostVideoPrepSpecRef = useRef(null)
  const quoteRepostVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const quoteRepostVideoPrepHandoffRef = useRef(null)
  const quoteRepostFieldRef = useRef(null)
  const quoteRepostScrollRef = useRef(null)
  const quoteRepostImageInputRef = useRef(null)
  const quoteRepostVideoInputRef = useRef(null)
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
  /** Own just-posted comment ids - prepended at top of post-detail list for this viewer only. */
  const [loungeDetailViewerPinnedCommentIds, setLoungeDetailViewerPinnedCommentIds] = useState([])
  const [loungeDetailCommentSort, setLoungeDetailCommentSort] = useState(() => readLoungeDetailCommentSort())
  const [loungeDetailFollowingUserIds, setLoungeDetailFollowingUserIds] = useState([])
  /** Set of user IDs the viewer follows - drives the follow pill on feed/profile cards. */
  const [loungeFollowingUserIds, setLoungeFollowingUserIds] = useState(() => new Set())
  const [loungeDetailCommentDraft, setLoungeDetailCommentDraft] = useState('')
  const [loungeDetailCommentErr, setLoungeDetailCommentErr] = useState('')
  /** Mirrors feed composer: collapsed one-line affordance → expanded textarea + toolbar. */
  const [loungeDetailCommentComposerExpanded, setLoungeDetailCommentComposerExpanded] = useState(false)
  const [loungeDetailCommentDiscardPromptOpen, setLoungeDetailCommentDiscardPromptOpen] = useState(false)
  /** iOS / visualViewport: lift footer above software keyboard. */
  const [loungeDetailCommentKbOverlapPx, setLoungeDetailCommentKbOverlapPx] = useState(0)
  /** Bottom inset for post-detail scroll so content clears the floating reply footer. */
  const [loungeDetailCommentFooterInsetPx, setLoungeDetailCommentFooterInsetPx] = useState(72)
  const [loungeDetailCommentImageItems, setLoungeDetailCommentImageItems] = useState([])
  const [loungeDetailCommentMediaUrl, setLoungeDetailCommentMediaUrl] = useState('')
  const [loungeDetailCommentVideoSlot, setLoungeDetailCommentVideoSlot] = useState(null)
  const loungeDetailCommentImageItemsRef = useRef(loungeDetailCommentImageItems)
  const loungeDetailCommentMediaUrlRef = useRef('')
  /** True while native picker / probe / crop is in flight - blocks blur from collapsing the reply composer early. */
  const loungeDetailCommentMediaSessionRef = useRef(false)
  /** Which composer has the iOS file/photo sheet or gallery open (`null` when idle). */
  const loungeComposerMediaPickerTargetRef = useRef(
    /** @type {null | 'composer' | 'detailComment' | 'detailEdit' | 'detailCommentEdit' | 'quote'} */ (null),
  )
  const loungeDetailCommentVideoSlotRef = useRef(null)
  const loungeDetailCommentImageInputRef = useRef(null)
  const loungeDetailCommentVideoInputRef = useRef(null)
  const loungeDetailCommentVideoPrepJobIdRef = useRef(0)
  const loungeDetailCommentVideoPrepAbortRef = useRef(null)
  const loungeDetailCommentVideoPrepSpecRef = useRef(null)
  const loungeDetailCommentVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const loungeDetailCommentVideoPrepHandoffRef = useRef(null)
  /** Set by profile Replies tab; cleared after `openLoungeCommentDetail` runs once comments load. */
  const loungePostDetailPendingCommentIdRef = useRef(null)
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
  /** Post id whose comments finished loading - Strict Mode retry when unset after cancel. */
  const loungeDetailCommentsLoadedPostIdRef = useRef(/** @type {null | string} */ (null))
  const [loungeDetailCommentEditImageUrls, setLoungeDetailCommentEditImageUrls] = useState([])
  const [loungeDetailCommentEditImageItems, setLoungeDetailCommentEditImageItems] = useState([])
  const [loungeDetailCommentEditMediaUrl, setLoungeDetailCommentEditMediaUrl] = useState('')
  const [loungeDetailCommentEditVideoSlot, setLoungeDetailCommentEditVideoSlot] = useState(null)
  const [loungeDetailCommentEditKeepStreamUid, setLoungeDetailCommentEditKeepStreamUid] = useState(null)
  const loungeDetailCommentEditImageItemsRef = useRef(loungeDetailCommentEditImageItems)
  const loungeDetailCommentEditMediaUrlRef = useRef('')
  const loungeDetailCommentEditVideoSlotRef = useRef(null)
  const loungeDetailCommentEditFieldRef = useRef(null)
  const loungeDetailCommentEditImageInputRef = useRef(null)
  const loungeDetailCommentEditVideoInputRef = useRef(null)
  const loungeDetailCommentEditVideoPrepJobIdRef = useRef(0)
  const loungeDetailCommentEditVideoPrepAbortRef = useRef(null)
  const loungeDetailCommentEditVideoPrepSpecRef = useRef(null)
  const loungeDetailCommentEditVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const loungeDetailCommentEditVideoPrepHandoffRef = useRef(null)
  const loungeDetailCommentEditSnapshotRef = useRef(null)
  const loungeDetailCommentEditAbortRef = useRef(null)
  const loungeDetailCommentEditJobRunningRef = useRef(false)
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
  /** False until first `getSession()` completes - avoids flashing guest "ME" while auth is unknown. */
  const [composerAuthResolved, setComposerAuthResolved] = useState(false)
  const [pullRefreshing, setPullRefreshing] = useState(false)
  const [loungeFeedDeleteBusyPostId, setLoungeFeedDeleteBusyPostId] = useState(null)
  /** Left dock: search / notifications / chat (Lounge shell). */
  const [loungeDockPanel, setLoungeDockPanel] = useState(null)

  useEffect(() => {
    if (consumeReopenLoungeWelcome()) {
      loungeWelcomeScheduleRef.current = true
      setLoungeWelcomeOpen(true)
    }
    const panel = consumeReopenLoungeDockPanel()
    if (panel === 'settings') {
      setLoungeDockPanel('settings')
    }
  }, [])
  const prevLoungeFeedActiveRef = useRef(isActivePage)
  const ensureLoungeFeedVisible = useCallback(() => {
    if (!isActivePage) onNavigateToLoungeFeed?.()
  }, [isActivePage, onNavigateToLoungeFeed])
  useEffect(() => {
    if (prevLoungeFeedActiveRef.current && !isActivePage) {
      setLoungeDockPanel(null)
      setChatDockInitialPeerUserId(null)
      setLoungeSettingsFocusSection(null)
    }
    prevLoungeFeedActiveRef.current = isActivePage
  }, [isActivePage])
  /** When opening Settings from another panel, scroll to this section (`notifications`, …). */
  const [loungeSettingsFocusSection, setLoungeSettingsFocusSection] = useState(null)
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
  const [chatUnreadRoomCount, setChatUnreadRoomCount] = useState(0)
  const loungePushMarkDedupeRef = useRef(new Set())
  const loungePostDetailIdForNotifRefreshRef = useRef(null)
  const [notificationInteractionCountsRefreshKey, setNotificationInteractionCountsRefreshKey] = useState(0)
  const loungeDockPanelRef = useRef(loungeDockPanel)
  loungeDockPanelRef.current = loungeDockPanel
  const bumpNotificationInteractionRefreshIfOpen = useCallback(() => {
    if (loungeDockPanelRef.current === 'notifications') {
      setNotificationInteractionCountsRefreshKey((k) => k + 1)
    }
  }, [])
  const [loungeDockFooterHeight, setLoungeDockFooterHeight] = useState(0)
  const [loungePostDetail, setLoungePostDetail] = useState(null)
  /** Continuation rows for multi-part post threads in post detail. */
  /** When true, post detail was opened from profile (likes/bookmarks/posts) and must sit above z-[101] profile chrome. */
  const [loungePostDetailAboveProfile, setLoungePostDetailAboveProfile] = useState(false)
  const [loungeDetailEditing, setLoungeDetailEditing] = useState(false)
  const [loungeDetailDraftCaption, setLoungeDetailDraftCaption] = useState('')
  const [loungeDetailEditBusy, setLoungeDetailEditBusy] = useState(false)
  const [loungeDetailEditErr, setLoungeDetailEditErr] = useState('')
  /** Remote URLs for the post being edited (remove-only in UI until upload-on-edit exists). */
  const [loungeDetailEditImageUrls, setLoungeDetailEditImageUrls] = useState([])
  const [loungeDetailEditImageItems, setLoungeDetailEditImageItems] = useState([])
  const [loungeDetailEditMediaUrl, setLoungeDetailEditMediaUrl] = useState('')
  const [loungeDetailEditVideoSlot, setLoungeDetailEditVideoSlot] = useState(null)
  const [loungeDetailEditKeepStreamUid, setLoungeDetailEditKeepStreamUid] = useState(null)
  const [loungeDetailEditCategoryPills, setLoungeDetailEditCategoryPills] = useState([])
  /** Main feed row: unobtrusive spinner while a post edit with media upload finishes. */
  const [loungeFeedPostEditPendingPostId, setLoungeFeedPostEditPendingPostId] = useState(null)
  const [loungeDetailCommentEditPendingCommentId, setLoungeDetailCommentEditPendingCommentId] = useState(null)
  const loungeDetailEditImageItemsRef = useRef(loungeDetailEditImageItems)
  const loungeDetailEditMediaUrlRef = useRef('')
  const loungeDetailEditVideoSlotRef = useRef(null)
  const loungeDetailEditVideoPrepJobIdRef = useRef(0)
  const loungeDetailEditVideoPrepAbortRef = useRef(null)
  const loungeDetailEditVideoPrepSpecRef = useRef(null)
  const loungeDetailEditVideoLastEncodedFileRef = useRef(/** @type {File | null} */ (null))
  const loungeDetailEditVideoPrepHandoffRef = useRef(null)
  const loungeDetailEditSnapshotRef = useRef(null)
  const loungeDetailEditAbortRef = useRef(null)
  const loungeDetailEditJobRunningRef = useRef(false)
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
  const pullRefreshZoneRef = useRef(null)
  const pullPostsWrapRef = useRef(null)
  const pullIndicatorOverlayRef = useRef(null)
  const pullIndicatorWrapRef = useRef(null)
  const pullArrowRef = useRef(null)
  const pullSpinnerRef = useRef(null)
  const pullAriaRef = useRef(null)
  const composerImageInputRef = useRef(null)
  const composerVideoInputRef = useRef(null)
  const composerFieldRef = useRef(null)
  const mentionComposerAnchorRef = useRef(null)
  const mentionDetailCommentAnchorRef = useRef(null)
  const mentionQuoteRepostAnchorRef = useRef(null)
  const loungeDetailEditFieldRef = useRef(null)
  const loungeDetailEditImageInputRef = useRef(null)
  const loungeDetailEditVideoInputRef = useRef(null)
  const loungeFeedScrollRef = useRef(null)
  useLoungeMarketPollActivityTracker({ feedActive: isActivePage, scrollRootRef: loungeFeedScrollRef })
  /** Bound inside feed `LoungeFeedVideoAutoplayProvider` - reset feed inline sound when opening post detail. */
  const resetFeedInlineSoundRef = useRef(() => {})
  /** Bound inside post-detail `LoungeFeedVideoAutoplayProvider` - reset comment-thread inline sound on close. */
  const resetPostDetailInlineSoundRef = useRef(() => {})
  const loungeTitleBarRef = useRef(null)
  const loungeScrollPrevTopRef = useRef(0)
  const loungeTitleRevealRef = useRef(1)
  const loungeScrollVisualRafRef = useRef(0)
  const composerFoldRevealRef = useRef(loungeComposerInitial.fold)
  const composerExpandedRef = useRef(loungeComposerInitial.expanded)
  const [loungeTitleBarHeight, setLoungeTitleBarHeight] = useState(0)
  const [loungeTitleReveal, setLoungeTitleReveal] = useState(1)
  const quickLinkIds = useQuickLinkIds()
  const loungeTitleLogoClassName = edgeLogoTitleBarClassName(quickLinkIds.length)
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

  const loungeConsoleLogHudEnabled = useSyncExternalStore(
    subscribeAppConsoleLogHudEnabled,
    readAppConsoleLogHudEnabled,
    () => false,
  )
  const onLoungeConsoleLogHudChange = useCallback((enabled) => {
    writeAppConsoleLogHudEnabled(enabled)
  }, [])

  const loungeBuildBadgeEnabled = useSyncExternalStore(
    subscribeLoungeBuildBadgeEnabled,
    readLoungeBuildBadgeEnabled,
    () => false,
  )
  const onLoungeBuildBadgeChange = useCallback((enabled) => {
    writeLoungeBuildBadgeEnabled(enabled)
  }, [])

  const loungeViewerIsStaff = useMemo(() => {
    const r = composerUserProfile?.role
    return r === 'moderator' || r === 'admin'
  }, [composerUserProfile?.role])

  const loungeViewerIsAdmin = useMemo(
    () => String(composerUserProfile?.role || '').toLowerCase() === 'admin',
    [composerUserProfile?.role],
  )

  const loungeStaffToolsEnabled = Boolean(isStaff || loungeViewerIsStaff)

  const loungeTitleBarShowBuildBadge = loungeStaffToolsEnabled && loungeBuildBadgeEnabled

  const loungeFeedVideoDebugHudOnFeed =
    loungeStaffToolsEnabled &&
    loungeFeedVideoDebugEnabled &&
    !loungePostDetail?.id &&
    loungeDockPanel !== 'search' &&
    !profileModalOpen &&
    profileOverlayStack.length === 0
  const loungeProfileVideoDebugHud =
    loungeStaffToolsEnabled &&
    loungeFeedVideoDebugEnabled &&
    !loungePostDetail?.id &&
    !loungeDockPanel &&
    (profileModalOpen || profileOverlayStack.length > 0)

  // ── @mention autocomplete - one instance per composer ──────────────────────
  const mentionComposer = useMentionState(postText, supabaseClient, !loungeReadOnly)
  const mentionDetailComment = useMentionState(loungeDetailCommentDraft, supabaseClient, !loungeReadOnly)
  const mentionQuoteRepost = useMentionState(quoteRepostDraft, supabaseClient, !loungeReadOnly)
  const mentionThreadCompose = useMentionState(
    threadComposeCaptions[0] ?? '',
    supabaseClient,
    threadComposeOpen && !loungeReadOnly,
  )

  const chatDockIsStaff = Boolean(isStaff || loungeViewerIsStaff)

  const loungeDetailIsOwn = useMemo(
    () => Boolean(composerUserId && loungePostDetail?.user_id && loungePostDetail.user_id === composerUserId),
    [composerUserId, loungePostDetail?.user_id]
  )

  const loungeDetailShowPostMenu = useMemo(
    () => Boolean(loungePostDetail?.id && !loungeDetailEditing),
    [loungePostDetail?.id, loungeDetailEditing],
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
    setProfileGateCategoryPills(profileCategoryPills(composerUserProfile))
    setProfileGateErr('')
    setProfileGateOpen(true)
    return true
  }, [composerUserId, composerAuthUser, loungeReadOnly, composerUserProfile])

  const requireLoungeAuth = useCallback(() => {
    onRequireAuth?.()
  }, [onRequireAuth])

  const refreshLoungeDraftCount = useCallback(async () => {
    if (!supabaseClient || loungeReadOnly) {
      setLoungeDraftCount(0)
      return
    }
    const { count } = await countLoungePostDrafts(supabaseClient)
    setLoungeDraftCount(count)
  }, [loungeReadOnly, supabaseClient])

  useEffect(() => {
    void refreshLoungeDraftCount()
  }, [refreshLoungeDraftCount])

  const loadLoungeDraftsForSheet = useCallback(async () => {
    if (!supabaseClient || loungeReadOnly) {
      setLoungeDraftsList([])
      return
    }
    setLoungeDraftsLoading(true)
    try {
      const { data, error } = await listLoungePostDrafts(supabaseClient)
      if (error) throw error
      setLoungeDraftsList(data)
      setLoungeDraftCount(data.length)
    } catch {
      setLoungeDraftsList([])
      void refreshLoungeDraftCount()
    } finally {
      setLoungeDraftsLoading(false)
    }
  }, [loungeReadOnly, refreshLoungeDraftCount, supabaseClient])

  const openLoungeDraftsSheet = useCallback(() => {
    if (loungeReadOnly) {
      requireLoungeAuth()
      return
    }
    setLoungeDraftsSheetOpen(true)
    void loadLoungeDraftsForSheet()
  }, [loadLoungeDraftsForSheet, loungeReadOnly, requireLoungeAuth])

  const composerImageItemsFromDraftUrls = useCallback((urls) => {
    const list = Array.isArray(urls) ? urls : []
    return list.map((url) => ({
      id: newComposerImageId(),
      file: null,
      preview: String(url),
      remoteUrl: String(url),
    }))
  }, [])

  const collectComposerDraftBlobUrls = useCallback((imageItems, videoSlot) => {
    /** @type {Set<string>} */
    const urls = new Set()
    for (const it of imageItems || []) {
      const p = String(it?.preview || '').trim()
      if (p.startsWith('blob:')) urls.add(p)
    }
    for (const raw of [videoSlot?.preview, videoSlot?.posterUrl]) {
      const u = String(raw || '').trim()
      if (u.startsWith('blob:')) urls.add(u)
    }
    return urls
  }, [])

  const loungeDraftSaveBlobUrlsRef = useRef(/** @type {Set<string> | null} */ (null))

  const revokeLoungeDraftSaveBlobUrls = useCallback(() => {
    const urls = loungeDraftSaveBlobUrlsRef.current
    loungeDraftSaveBlobUrlsRef.current = null
    if (!urls) return
    for (const u of urls) {
      try {
        URL.revokeObjectURL(u)
      } catch {
        // ignore
      }
    }
  }, [])

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
        if (target === 'detailComment') return loungeDetailCommentFieldRef.current
        if (target === 'detailEdit') return loungeDetailEditFieldRef.current
        if (target === 'detailCommentEdit') return loungeDetailCommentEditFieldRef.current
        if (target === 'quote') return quoteRepostFieldRef.current
        if (target === 'composer' && threadComposeOpenRef.current) {
          return threadComposePartRefMap.current[threadComposeActivePartIndexRef.current]
        }
        return composerFieldRef.current
      }
      const isBlocked = () => {
        if (target === 'detailComment') return !loungePostDetail
        if (target === 'detailEdit') return !loungeDetailEditing
        if (target === 'detailCommentEdit') return !loungeDetailCommentEditingId
        if (target === 'quote') {
          return !quoteRepostModal || quoteRepostModal.mode !== 'compose'
        }
        if (target === 'composer' && threadComposeOpenRef.current) return false
        return !composerExpanded
      }
      return { getTextarea, scrollFeedToTop, isBlocked }
    },
    [
      composerExpanded,
      loungeDetailCommentEditingId,
      loungeDetailEditing,
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

  const blurLoungeComposerCaptionForTarget = useCallback((target) => {
    const getTextarea = () => {
      if (target === 'detailComment') return loungeDetailCommentFieldRef.current
      if (target === 'detailEdit') return loungeDetailEditFieldRef.current
      if (target === 'detailCommentEdit') return loungeDetailCommentEditFieldRef.current
      if (target === 'quote') return quoteRepostFieldRef.current
      if (target === 'composer' && threadComposeOpenRef.current) {
        return threadComposePartRefMap.current[threadComposeActivePartIndexRef.current]
      }
      return composerFieldRef.current
    }
    blurLoungeComposerCaption(getTextarea)
    if (target === 'detailComment') setLoungeDetailCommentKbOverlapPx(0)
  }, [])

  const loungeFileInputMediaPickerHandlers = useCallback(
    (target) => ({
      onClick: () => {
        beginLoungeComposerMediaPicker(target)
        blurLoungeComposerCaptionForTarget(target)
      },
      onCancel: () => {
        endLoungeComposerMediaPicker(target)
      },
    }),
    [beginLoungeComposerMediaPicker, blurLoungeComposerCaptionForTarget, endLoungeComposerMediaPicker],
  )

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

  const openMarketPicker = useCallback(
    (target) => {
      if (openProfileGateIfNeeded()) return
      setMarketPickerTarget(target)
      setMarketPickerOpen(true)
    },
    [openProfileGateIfNeeded],
  )

  const openMarketChartModal = useCallback(({ embed, embeds }) => {
    const list = Array.isArray(embeds) && embeds.length ? embeds : embed ? [embed] : []
    if (!list.length) return
    setMarketChartModal({
      open: true,
      embeds: list,
      focusSymbol: embed?.display_symbol || embed?.symbol || list[0]?.display_symbol || null,
    })
  }, [])

  const closeMarketChartModal = useCallback(() => {
    setMarketChartModal({ open: false, embeds: [], focusSymbol: null })
  }, [])

  const insertMarketChartSnapshotIntoComposer = useCallback(
    (file) => {
      if (!(file instanceof File)) return false
      if (!composerUserId || loungeReadOnly) return false
      if (openProfileGateIfNeeded()) return false
      const { next, limitDialog } = mergeLoungePickedImageItems(
        composerImageItemsRef.current,
        [file],
        newComposerImageId,
      )
      if (limitDialog) {
        setLoungeImageLimitDialog(limitDialog)
        return false
      }
      composerImageItemsRef.current = next
      composerFoldedFromFeedScrollRef.current = false
      composerFoldRevealRef.current = 1
      flushSync(() => {
        setComposerImageItems(next)
        setComposerFoldReveal(1)
        composerExpandedRef.current = true
        setComposerExpanded(true)
        setComposerFocusToken((t) => t + 1)
      })
      closeMarketChartModal()
      scrollLoungeFeedToTopInstant()
      setLoungeShareFlash('Chart image added to post.')
      return true
    },
    [
      closeMarketChartModal,
      composerUserId,
      loungeReadOnly,
      openProfileGateIfNeeded,
      scrollLoungeFeedToTopInstant,
    ],
  )

  const expandAndFocusLoungeDetailCommentComposer = useCallback(({ skipScrollToTop = false } = {}) => {
    if (!skipScrollToTop) scrollLoungePostDetailToTopInstant()
    focusLoungeComposerCaption(() => loungeDetailCommentFieldRef.current, {
      scrollFeedToTop: skipScrollToTop ? undefined : scrollLoungePostDetailToTopInstant,
    })
    scheduleLoungeComposerCaptionRefocus('detailComment')
  }, [scheduleLoungeComposerCaptionRefocus, scrollLoungePostDetailToTopInstant])

  const restoreLoungeComposerCaptionAfterMediaPick = useCallback(
    (target, applyDomUpdates) => {
      if (applyDomUpdates) flushSync(applyDomUpdates)
      if (target === 'composer' && threadComposeOpenRef.current) {
        blurLoungeComposerCaptionForTarget(target)
        return
      }
      const { getTextarea, scrollFeedToTop, isBlocked } = loungeComposerCaptionTargetConfig(target)
      invokeLoungeComposerCaptionKeyboard(getTextarea, { scrollFeedToTop })
      scheduleLoungeComposerTextareaFocus({
        getTextarea,
        scrollFeedToTop,
        isBlocked,
        extraDelaysMs: LOUNGE_COMPOSER_FOCUS_AFTER_MEDIA_DELAYS_MS,
      })
    },
    [blurLoungeComposerCaptionForTarget, loungeComposerCaptionTargetConfig],
  )

  useEffect(() => {
    loungeDetailCommentDraftRef.current = loungeDetailCommentDraft
  }, [loungeDetailCommentDraft])

  useEffect(() => {
    loungeDetailCommentMediaUrlRef.current = String(loungeDetailCommentMediaUrl || '').trim()
  }, [loungeDetailCommentMediaUrl])

  useEffect(() => {
    loungeDetailEditMediaUrlRef.current = String(loungeDetailEditMediaUrl || '').trim()
  }, [loungeDetailEditMediaUrl])

  useEffect(() => {
    loungeDetailCommentEditMediaUrlRef.current = String(loungeDetailCommentEditMediaUrl || '').trim()
  }, [loungeDetailCommentEditMediaUrl])

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

  useEffect(() => {
    if (!loungePostDetail || loungeReadOnly) {
      setLoungeDetailCommentFooterInsetPx(72)
      return undefined
    }
    const footer = loungeDetailCommentFooterRef.current
    if (!footer) return undefined
    const syncInset = () => {
      setLoungeDetailCommentFooterInsetPx(
        footer.offsetHeight + LOUNGE_DETAIL_COMMENT_FOOTER_SCROLL_GAP_PX,
      )
    }
    syncInset()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncInset) : null
    ro?.observe(footer)
    return () => ro?.disconnect()
  }, [
    loungePostDetail?.id,
    loungeReadOnly,
    loungeDetailCommentComposerExpanded,
    loungeDetailCommentKbOverlapPx,
    loungeDetailCommentErr,
    loungeDetailCommentImageItems.length,
    loungeDetailCommentVideoSlot,
  ])

  useLayoutEffect(() => {
    if (!loungeDetailEditing) return
    focusLoungeComposerCaption(() => loungeDetailEditFieldRef.current)
    const el = loungeDetailEditFieldRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [loungeDetailEditing])

  useEffect(() => {
    if (
      threadComposeOpen ||
      !composerExpanded ||
      composerFoldReveal < 0.88 ||
      loungeDockPanel
    ) {
      return undefined
    }
    return scheduleLoungeComposerTextareaFocus({
      getTextarea: () => composerFieldRef.current,
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
  }, [
    composerExpanded,
    composerFoldReveal,
    composerFocusToken,
    loungeDockPanel,
    scrollLoungeFeedToTopInstant,
    threadComposeOpen,
  ])

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

  /** Stable bottom inset for the dock FAB while the upload bar is visible (avoids collision feedback loops). */
  useLayoutEffect(() => {
    if (!loungePostUploadBar) {
      setLoungeUploadBarHeightPx(0)
      return undefined
    }
    const el = loungeUploadBarRef.current
    if (!el) return undefined
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      if (h > 0) setLoungeUploadBarHeightPx((prev) => (prev === h ? prev : h))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [loungePostUploadBar])

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

  /** Only reset scroll when opening a different post - same-post updates (e.g. like) replace `loungePostDetail` by id and must not jump to top. */
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
    loungeDetailEditImageItemsRef.current = loungeDetailEditImageItems
  }, [loungeDetailEditImageItems])

  useEffect(() => {
    loungeDetailEditVideoSlotRef.current = loungeDetailEditVideoSlot
  }, [loungeDetailEditVideoSlot])

  useEffect(() => {
    loungeDetailCommentEditImageItemsRef.current = loungeDetailCommentEditImageItems
  }, [loungeDetailCommentEditImageItems])

  useEffect(() => {
    loungeDetailCommentEditVideoSlotRef.current = loungeDetailCommentEditVideoSlot
  }, [loungeDetailCommentEditVideoSlot])

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

  /** Feed / quote / reply background jobs share one upload bar - do not clear it from unrelated surface cleanup. */
  const dismissLoungePostUploadBarIfIdle = useCallback(() => {
    if (
      loungePostJobRunningRef.current ||
      loungeDetailCommentJobRunningRef.current ||
      loungeDetailEditJobRunningRef.current ||
      loungeDetailCommentEditJobRunningRef.current
    ) {
      return
    }
    setLoungePostUploadBar(null)
  }, [])

  /** True while a video submit queue job may still own shared video prep / upload bar state. */
  const loungeBackgroundSubmitBusy = useCallback(
    () =>
      loungePostJobRunningRef.current ||
      loungeDetailCommentJobRunningRef.current ||
      loungeDetailEditJobRunningRef.current ||
      loungeDetailCommentEditJobRunningRef.current ||
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
    } else if (pending.kind === 'commentEdit') {
      loungeDetailCommentEditSnapshotRef.current = pending.snapshot
      setLoungeDetailCommentEditPendingCommentId(null)
      setLoungeDetailCommentErr(pending.message)
    } else if (pending.kind === 'postEdit') {
      loungeDetailEditSnapshotRef.current = pending.snapshot
      setLoungeFeedPostEditPendingPostId(null)
      setLoungeDetailEditErr(pending.message)
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
    } else if (kind === 'commentEdit') {
      loungeDetailCommentEditSnapshotRef.current = snapshot
      setLoungeDetailCommentEditPendingCommentId(null)
      setLoungeDetailCommentErr(message)
    } else if (kind === 'postEdit') {
      loungeDetailEditSnapshotRef.current = snapshot
      setLoungeFeedPostEditPendingPostId(null)
      setLoungeDetailEditErr(message)
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
      !loungeDetailEditJobRunningRef.current &&
      !loungeDetailCommentEditJobRunningRef.current &&
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

  const loungeDetailEditBackgroundUploadInFlight = useCallback(
    () => loungeDetailEditSnapshotRef.current != null,
    [],
  )

  const loungeDetailCommentEditBackgroundUploadInFlight = useCallback(
    () =>
      loungeDetailCommentEditJobRunningRef.current && loungeDetailCommentEditSnapshotRef.current != null,
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

  const updateThreadComposePartVideoSlot = useCallback((partIdx, updater) => {
    setThreadComposePartMedia((prev) =>
      prev.map((row, j) => {
        if (j !== partIdx) return row
        const nextSlot = typeof updater === 'function' ? updater(row.videoSlot) : updater
        return { ...row, videoSlot: nextSlot ?? null }
      }),
    )
  }, [])

  const updateThreadComposePartPrepHud = useCallback((partIdx, hud) => {
    setThreadComposePartMedia((prev) =>
      prev.map((row, j) => (j === partIdx ? { ...row, videoPrepHud: hud } : row)),
    )
  }, [])

  useEffect(() => {
    threadComposeVideoPrepControllerRef.current = createThreadComposeVideoPrepController({
      supabaseClient,
      updatePartVideoSlot: updateThreadComposePartVideoSlot,
      updatePartPrepHud: updateThreadComposePartPrepHud,
      isBackgroundSubmitBusy: loungeBackgroundSubmitBusy,
      getPrepMeta: (partIdx) => threadComposeVideoPrepByPartRef.current[partIdx] ?? null,
      setPrepMeta: (partIdx, meta) => {
        if (meta) threadComposeVideoPrepByPartRef.current[partIdx] = meta
        else delete threadComposeVideoPrepByPartRef.current[partIdx]
      },
      nextJobId: () => {
        threadComposeVideoPrepJobIdRef.current += 1
        return threadComposeVideoPrepJobIdRef.current
      },
      uploadBarGoblinDetail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL,
    })
    return () => {
      threadComposeVideoPrepControllerRef.current?.reset()
    }
  }, [
    loungeBackgroundSubmitBusy,
    supabaseClient,
    updateThreadComposePartPrepHud,
    updateThreadComposePartVideoSlot,
  ])

  const cancelThreadComposePartVideo = useCallback(
    (partIdx) => {
      if (loungeBackgroundSubmitBusy()) return
      const slot = threadComposePartMediaRef.current[partIdx]?.videoSlot ?? null
      threadComposeVideoPrepControllerRef.current?.cancel(partIdx)
      disposeComposerVideoMedia(slot)
      updateThreadComposePartVideoSlot(partIdx, () => null)
      updateThreadComposePartPrepHud(partIdx, null)
    },
    [
      disposeComposerVideoMedia,
      loungeBackgroundSubmitBusy,
      updateThreadComposePartPrepHud,
      updateThreadComposePartVideoSlot,
    ],
  )

  const removeThreadPartDraftMediaMarkers = useCallback((partIdx, names) => {
    const list = (Array.isArray(names) ? names : [names])
      .map((n) => String(n || '').trim())
      .filter(Boolean)
    if (!list.length) return
    setThreadComposeCaptions((prev) =>
      prev.map((cap, j) =>
        j === partIdx ? stripDraftMediaMarkersFromCaption(cap, list) : cap,
      ),
    )
  }, [])

  const startThreadComposePartVideoPrepFromSpec = useCallback(
    (partIdx, spec, slotBase) => {
      const videoName =
        spec?.file instanceof File
          ? spec.file.name
          : spec?.sourceFile instanceof File
            ? spec.sourceFile.name
            : slotBase?.file instanceof File
              ? slotBase.file.name
              : 'video'
      removeThreadPartDraftMediaMarkers(partIdx, [videoName])
      setThreadComposePartMedia((prev) =>
        prev.map((row, j) => {
          if (j !== partIdx) return row
          revokeThreadComposePartVideoSlot(row.videoSlot)
          disposeComposerVideoMedia(row.videoSlot)
          return { ...row, videoSlot: null, videoPrepHud: null }
        }),
      )
      threadComposeVideoPrepControllerRef.current?.enqueue(partIdx, spec, {
        ...slotBase,
        prepJobId: null,
        prepStatus: 'queued',
        prepError: '',
      })
    },
    [disposeComposerVideoMedia, removeThreadPartDraftMediaMarkers],
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
      // Background queue job may still own composer prep handoff / abort - never tear down from composer dismiss.
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

  const blurAllThreadComposeFields = useCallback(() => {
    for (const el of Object.values(threadComposePartRefMap.current)) {
      try {
        el?.blur?.()
      } catch {
        // ignore
      }
    }
  }, [])

  const consumeThreadComposeFocusPartIndex = useCallback(() => {
    setThreadComposeFocusPartIndex(null)
  }, [])

  const loadServerDraftIntoThreadCompose = useCallback(
    (draft) => {
      cancelComposerMediaPrep()
      blurAllThreadComposeFields()
      blurLoungeComposerCaption(() => composerFieldRef.current)
      setComposerVideoSlot(null)
      setPostText('')
      setPostErr('')
      setThreadComposeErr('')
      loungePostSnapshotRef.current = null
      loungePostJobRunningRef.current = false
      setLoungePostUploadBar(null)
      threadComposeVideoPrepControllerRef.current?.reset()
      threadComposeVideoPrepByPartRef.current = {}
      setThreadComposeOpen(false)
      flushSync(() => {
        setLoungeComposerActiveDraftId(String(draft.id))
        setComposerCategoryPills(Array.isArray(draft.category_pills) ? draft.category_pills : [])
        const parts = loungePostDraftThreadParts(draft)
        setThreadComposeCaptions(parts)
        setThreadComposePartMedia(loungePostDraftThreadComposePartMedia(draft, parts.length))
        setComposerImageItems([])
        setComposerMediaUrl('')
        setThreadComposeActivePartIndex(0)
        setThreadComposeDiscardOpen(false)
        setThreadComposeFocusPartIndex(null)
        composerExpandedRef.current = false
        composerFoldRevealRef.current = 0
        setComposerFoldReveal(0)
        composerFoldedFromFeedScrollRef.current = false
        setComposerExpanded(false)
        setLoungeDraftsSheetOpen(false)
        setThreadComposeSessionKey((k) => k + 1)
      })
      setThreadComposeOpen(true)
    },
    [blurAllThreadComposeFields, cancelComposerMediaPrep],
  )

  const loadServerDraftIntoComposer = useCallback(
    (draft) => {
      if (!draft?.id) return
      if (loungePostDraftIsThread(draft)) {
        loadServerDraftIntoThreadCompose(draft)
        return
      }
      cancelComposerMediaPrep()
      setComposerVideoSlot(loungePostDraftComposerVideoSlot(draft))
      setPostText(String(draft.caption || ''))
      setComposerMediaUrl(String(draft.gif_url || '').trim())
      setComposerCategoryPills(Array.isArray(draft.category_pills) ? draft.category_pills : [])
      setComposerImageItems(composerImageItemsFromDraftUrls(draft.image_urls))
      setLoungeComposerActiveDraftId(String(draft.id))
      composerExpandedRef.current = true
      composerFoldRevealRef.current = 1
      setComposerFoldReveal(1)
      composerFoldedFromFeedScrollRef.current = false
      setComposerExpanded(true)
      setComposerFocusToken((t) => t + 1)
      persistLoungeComposerDraft(
        String(draft.caption || ''),
        true,
        Array.isArray(draft.image_urls) && draft.image_urls.length > 0,
        String(draft.gif_url || '').trim(),
      )
      setPostErr('')
      setLoungeDraftsSheetOpen(false)
      scheduleLoungeComposerTextareaFocus({
        getTextarea: () => composerFieldRef.current,
        scrollFeedToTop: scrollLoungeFeedToTopInstant,
      })
    },
    [
      cancelComposerMediaPrep,
      composerImageItemsFromDraftUrls,
      loadServerDraftIntoThreadCompose,
      scrollLoungeFeedToTopInstant,
    ],
  )

  const runBackgroundLoungeDraftSave = useCallback(
    async (job, opts = {}) => {
      const payload = job?.payload && typeof job.payload === 'object' ? job.payload : job
      const videoPrepByPart =
        job?.videoPrepByPart && typeof job.videoPrepByPart === 'object' ? job.videoPrepByPart : {}
      const composerVideoPrep = job?.composerVideoPrep ?? null
      const skipRevokeUrls = opts.skipRevokeUrls instanceof Set ? opts.skipRevokeUrls : null
      loungeDraftSaveBlobUrlsRef.current = skipRevokeUrls

      const ac = new AbortController()
      loungePostAbortRef.current = ac
      loungePostJobRunningRef.current = true
      bumpLoungeSubmitInFlight(1)

      const threadTotal =
        Array.isArray(payload.threadCaptions) && payload.threadCaptions.length > 1
          ? payload.threadCaptions.length
          : 0

      const syncDraftBar = (info) => {
        if (ac.signal.aborted) return
        setLoungePostUploadBar((prev) =>
          prev
            ? {
                ...prev,
                draftSave: true,
                progress: typeof info.progress === 'number' ? info.progress : prev.progress,
                status: String(info.status || prev.status || ''),
                detail: info.detail != null ? String(info.detail) : prev.detail,
              }
            : prev,
        )
      }

      setLoungePostUploadBar({
        mode: 'mediaPrep',
        draftSave: true,
        postSubmission: true,
        progress: 0.04,
        status: 'Saving draft…',
        detail: '',
        threadPartTotal: threadTotal,
        threadPartPublished: 0,
      })

      try {
        const prepared = await prepareLoungePostDraftPayloadForUpsert(supabaseClient, payload, {
          videoPrepByPart,
          composerVideoPrep,
          signal: ac.signal,
          onProgress: syncDraftBar,
        })
        const { data, error } = await upsertLoungePostDraft(supabaseClient, {
          ...prepared,
          id: prepared.id || loungeComposerActiveDraftIdRef.current,
          signal: ac.signal,
          onProgress: syncDraftBar,
        })
        if (error) throw error
        if (!data) throw new Error('Could not save draft.')
        setLoungeComposerActiveDraftId(data.id)
        persistLoungeComposerDraft(
          data.caption,
          false,
          (Array.isArray(data.image_urls) && data.image_urls.length > 0) ||
            Boolean(data.stream_video_uid),
          data.gif_url,
        )
        await refreshLoungeDraftCount()
        setLoungePostUploadBar((prev) =>
          prev ? { ...prev, progress: 1, status: 'Draft saved', detail: '' } : prev,
        )
        window.setTimeout(() => {
          revokeLoungeDraftSaveBlobUrls()
          dismissLoungePostUploadBarIfIdle()
        }, 450)
      } catch (e) {
        revokeLoungeDraftSaveBlobUrls()
        if (e?.name === 'AbortError') {
          setLoungePostUploadBar(null)
          if (!opts.silent) setPostErr('Draft save canceled.')
          return
        }
        const msg = e instanceof Error ? e.message : 'Could not save draft.'
        setPostErr(msg)
        setLoungePostUploadBar(null)
      } finally {
        loungePostJobRunningRef.current = false
        loungePostAbortRef.current = null
        bumpLoungeSubmitInFlight(-1)
      }
    },
    [
      bumpLoungeSubmitInFlight,
      dismissLoungePostUploadBarIfIdle,
      refreshLoungeDraftCount,
      revokeLoungeDraftSaveBlobUrls,
      supabaseClient,
    ],
  )

  const saveThreadComposeAsServerDraft = useCallback(
    async () => {
      if (loungeReadOnly) {
        requireLoungeAuth()
        return null
      }
      if (openProfileGateIfNeeded()) return null
      const videoErr = loungePostDraftValidateComposePartsForSave(threadComposePartMedia)
      if (videoErr) {
        setThreadComposeErr(videoErr)
        return null
      }
      const rootPart = threadComposePartMedia[0] || emptyThreadComposePartMedia()
      const gifUrl = String(rootPart.gifUrl || '').trim()
      const part0Items = rootPart.imageItems || []
      const existingImageUrls = part0Items
        .map((it) => String(it.remoteUrl || '').trim())
        .filter(Boolean)
      const imageFiles = part0Items.map((it) => it.file).filter((f) => f instanceof File)
      const threadCaptions = threadComposeCaptions.map((t) => String(t ?? ''))
      if (
        !loungePostDraftHasContent({
          threadCaptions,
          gifUrl,
          imageUrls: existingImageUrls,
          imageFiles,
          streamVideoUid: String(rootPart.videoSlot?.streamVideoUid || '').trim(),
          rootVideoSlot: rootPart.videoSlot ?? null,
          threadPartMedia: loungePostDraftThreadPartMediaInputFromCompose(threadComposePartMedia),
        })
      ) {
        setThreadComposeErr('Add thread text, a GIF, or at least one image before saving a draft.')
        return null
      }
      setThreadComposeErr('')
      const skipRevokeUrls = collectThreadComposePartMediaBlobUrls(threadComposePartMedia)
      const videoPrepByPart = { ...threadComposeVideoPrepByPartRef.current }
      const payload = {
        id: loungeComposerActiveDraftIdRef.current,
        threadCaptions,
        categoryPills: composerCategoryPills,
        gifUrl,
        existingImageUrls,
        imageFiles,
        videoSlot: rootPart.videoSlot,
        threadPartMediaInput: loungePostDraftThreadPartMediaInputFromCompose(threadComposePartMedia),
      }
      setThreadComposeDiscardOpen(false)
      closeThreadComposeImmediateRef.current({
        skipRestoreFeedText: true,
        skipRevokeUrls,
        preserveThreadVideoPrep: true,
      })
      void runBackgroundLoungeDraftSave({ payload, videoPrepByPart }, { skipRevokeUrls })
      return { started: true }
    },
    [
      composerCategoryPills,
      runBackgroundLoungeDraftSave,
      threadComposePartMedia,
      loungeReadOnly,
      openProfileGateIfNeeded,
      requireLoungeAuth,
      threadComposeCaptions,
    ],
  )

  const threadComposeCanSaveDraft = useMemo(() => {
    if (postBusy) return false
    if (loungePostDraftValidateComposePartsForSave(threadComposePartMedia)) return false
    const rootPart = threadComposePartMedia[0] || emptyThreadComposePartMedia()
    const gifUrl = String(rootPart.gifUrl || '').trim()
    const part0Items = rootPart.imageItems || []
    const existingImageUrls = part0Items
      .map((it) => String(it.remoteUrl || '').trim())
      .filter(Boolean)
    const imageFiles = part0Items.map((it) => it.file).filter((f) => f instanceof File)
    const threadCaptions = threadComposeCaptions.map((t) => String(t ?? ''))
    return loungePostDraftHasContent({
      threadCaptions,
      gifUrl,
      imageUrls: existingImageUrls,
      imageFiles,
      streamVideoUid: String(rootPart.videoSlot?.streamVideoUid || '').trim(),
      rootVideoSlot: rootPart.videoSlot ?? null,
      threadPartMedia: loungePostDraftThreadPartMediaInputFromCompose(threadComposePartMedia),
    })
  }, [postBusy, threadComposePartMedia, threadComposeCaptions])

  const persistThreadSubmissionSnapshotAsDraft = useCallback(
    async (snap, opts = {}) => {
      if (!snap) return { data: null, error: new Error('Nothing to save.') }
      if (loungeSubmissionSnapshotThreadPartCount(snap) <= 1) {
        return { data: null, error: null }
      }
      const fromPartIndex =
        typeof opts.fromPartIndex === 'number' && opts.fromPartIndex > 0 ? opts.fromPartIndex : 0
      const payload = loungePostDraftPayloadFromSubmissionSnapshot(snap, { fromPartIndex })
      if (!payload) return { data: null, error: new Error('Could not build draft.') }
      if (
        !loungePostDraftHasContent({
          caption: payload.caption,
          threadCaptions: payload.threadCaptions,
          gifUrl: payload.gifUrl,
          imageUrls: payload.existingImageUrls,
          imageFiles: payload.imageFiles,
          streamVideoUid: payload.streamVideoUid,
          threadPartMedia: payload.threadPartMediaInput,
        })
      ) {
        return { data: null, error: null }
      }
      return upsertLoungePostDraft(supabaseClient, {
        ...payload,
        id: payload.id || loungeComposerActiveDraftIdRef.current,
      })
    },
    [supabaseClient],
  )

  const applyLoungePostSubmitUploadProgress = useCallback((info, snapshot, barBase = {}) => {
    const threadTotal = loungeSubmissionSnapshotThreadPartCount(snapshot)
    loungePostUploadLastPhaseRef.current = String(info?.status || '')
    setLoungePostUploadBar((prev) => {
      const d = String(info?.detail || '').trim()
      const threadPartPublished =
        typeof info?.threadPartPublished === 'number'
          ? info.threadPartPublished
          : typeof prev?.threadPartPublished === 'number'
            ? prev.threadPartPublished
            : 0
      const threadPartTotal =
        typeof info?.threadPartTotal === 'number'
          ? info.threadPartTotal
          : typeof prev?.threadPartTotal === 'number' && prev.threadPartTotal > 1
            ? prev.threadPartTotal
            : threadTotal
      return {
        ...(prev || {}),
        ...barBase,
        postSubmission: true,
        threadPartTotal: threadPartTotal > 1 ? threadPartTotal : 0,
        threadPartPublished,
        progress: typeof info?.progress === 'number' ? info.progress : prev?.progress ?? 0,
        status: String(info?.status || ''),
        detail: d !== '' ? d : prev && typeof prev.detail === 'string' ? prev.detail : '',
      }
    })
  }, [])

  const clearComposerAfterDraftSaveQueued = useCallback(
    (skipRevokeUrls) => {
      setPostText('')
      setComposerImageItems((prev) => {
        for (const it of prev) {
          const p = String(it?.preview || '').trim()
          if (skipRevokeUrls instanceof Set && skipRevokeUrls.has(p)) continue
          try {
            URL.revokeObjectURL(it.preview)
          } catch {
            // ignore
          }
        }
        return []
      })
      setComposerVideoSlot(null)
      setComposerMediaUrl('')
      composerExpandedRef.current = false
      composerFoldRevealRef.current = 0
      setComposerFoldReveal(0)
      composerFoldedFromFeedScrollRef.current = false
      setComposerExpanded(false)
      persistLoungeComposerDraft('', false, false, '')
    },
    [],
  )

  const saveComposerAsServerDraft = useCallback(
    async (opts = {}) => {
      if (loungeReadOnly) {
        requireLoungeAuth()
        return null
      }
      if (openProfileGateIfNeeded()) return null
      const videoErr = loungePostDraftValidateComposerVideoSlotForSave(composerVideoSlot)
      if (videoErr) {
        setPostErr(videoErr)
        return null
      }
      const caption = String(postText || '')
      const gifUrl = String(composerMediaUrl || '').trim()
      const existingImageUrls = composerImageItems
        .map((it) => String(it.remoteUrl || '').trim())
        .filter(Boolean)
      const imageFiles = composerImageItems.map((it) => it.file).filter((f) => f instanceof File)
      if (
        !loungePostDraftHasContent({
          caption,
          gifUrl,
          imageUrls: existingImageUrls,
          imageFiles,
          streamVideoUid: String(composerVideoSlot?.streamVideoUid || '').trim(),
          rootVideoSlot: composerVideoSlot ?? null,
        })
      ) {
        setPostErr('Add caption text, a GIF, or at least one image before saving a draft.')
        return null
      }
      setPostErr('')
      const skipRevokeUrls = collectComposerDraftBlobUrls(composerImageItems, composerVideoSlot)
      const composerVideoPrep =
        composerVideoPrepHandoffRef.current != null
          ? {
              handoff: composerVideoPrepHandoffRef.current,
              spec: composerVideoPrepSpecRef.current,
            }
          : null
      const payload = {
        id: loungeComposerActiveDraftIdRef.current,
        caption,
        categoryPills: composerCategoryPills,
        gifUrl,
        existingImageUrls,
        imageFiles,
        videoSlot: composerVideoSlot,
      }
      if (opts.background !== false) {
        setComposerDiscardPromptOpen(false)
        clearComposerAfterDraftSaveQueued(skipRevokeUrls)
        void runBackgroundLoungeDraftSave(
          { payload, composerVideoPrep },
          { skipRevokeUrls, silent: opts.silent === true },
        )
        return { started: true }
      }
      try {
        const { data, error } = await upsertLoungePostDraft(supabaseClient, payload)
        if (error) throw error
        if (!data) throw new Error('Could not save draft.')
        setLoungeComposerActiveDraftId(data.id)
        if (Array.isArray(data.image_urls) && data.image_urls.length > 0) {
          setComposerImageItems(composerImageItemsFromDraftUrls(data.image_urls))
        }
        setComposerVideoSlot(loungePostDraftComposerVideoSlot(data))
        persistLoungeComposerDraft(
          data.caption,
          true,
          data.image_urls?.length > 0 || Boolean(data.stream_video_uid),
          data.gif_url,
        )
        await refreshLoungeDraftCount()
        return data
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Could not save draft.'
        if (!opts.silent) setPostErr(msg)
        return null
      }
    },
    [
      clearComposerAfterDraftSaveQueued,
      collectComposerDraftBlobUrls,
      composerCategoryPills,
      composerImageItems,
      composerImageItemsFromDraftUrls,
      composerMediaUrl,
      composerVideoSlot,
      loungeReadOnly,
      openProfileGateIfNeeded,
      postText,
      refreshLoungeDraftCount,
      requireLoungeAuth,
      runBackgroundLoungeDraftSave,
      supabaseClient,
    ],
  )

  const deleteServerLoungeDraft = useCallback(
    async (draftId) => {
      if (!supabaseClient || !draftId) return
      setLoungeDraftSheetBusyId(String(draftId))
      try {
        const { error } = await deleteLoungePostDraft(supabaseClient, draftId)
        if (error) throw error
        if (loungeComposerActiveDraftIdRef.current === String(draftId)) {
          setLoungeComposerActiveDraftId(null)
        }
        await loadLoungeDraftsForSheet()
        await refreshLoungeDraftCount()
      } catch (e) {
        setPostErr(e instanceof Error ? e.message : 'Could not delete draft.')
      } finally {
        setLoungeDraftSheetBusyId(null)
      }
    },
    [loadLoungeDraftsForSheet, refreshLoungeDraftCount, supabaseClient],
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

  const cancelLoungeDetailEditMediaPrep = useCallback((opts = {}) => {
    const userInitiated = Boolean(opts.userInitiated)
    const preserveForBackgroundEdit = !userInitiated && loungeDetailEditBackgroundUploadInFlight()
    if (!preserveForBackgroundEdit) {
      const h = loungeDetailEditVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      loungeDetailEditVideoPrepHandoffRef.current = null
      loungeDetailEditVideoPrepJobIdRef.current += 1
      try {
        loungeDetailEditVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailEditVideoPrepAbortRef.current = null
      loungeDetailEditVideoLastEncodedFileRef.current = null
      disposeComposerVideoMedia(loungeDetailEditVideoSlotRef.current)
      setLoungeDetailEditVideoSlot(null)
    }
    if (userInitiated) setLoungePostUploadBar(null)
    else dismissLoungePostUploadBarIfIdle()
  }, [
    disposeComposerVideoMedia,
    dismissLoungePostUploadBarIfIdle,
    loungeDetailEditBackgroundUploadInFlight,
  ])

  const cancelLoungeDetailCommentEditMediaPrep = useCallback((opts = {}) => {
    const userInitiated = Boolean(opts.userInitiated)
    const preserveForBackgroundEdit =
      !userInitiated && loungeDetailCommentEditBackgroundUploadInFlight()
    if (!preserveForBackgroundEdit) {
      const h = loungeDetailCommentEditVideoPrepHandoffRef.current
      if (h && !h.settled) {
        try {
          h.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      loungeDetailCommentEditVideoPrepHandoffRef.current = null
      loungeDetailCommentEditVideoPrepJobIdRef.current += 1
      try {
        loungeDetailCommentEditVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailCommentEditVideoPrepAbortRef.current = null
      loungeDetailCommentEditVideoLastEncodedFileRef.current = null
      disposeComposerVideoMedia(loungeDetailCommentEditVideoSlotRef.current)
      setLoungeDetailCommentEditVideoSlot(null)
    }
    if (userInitiated) setLoungePostUploadBar(null)
    else dismissLoungePostUploadBarIfIdle()
  }, [
    disposeComposerVideoMedia,
    dismissLoungePostUploadBarIfIdle,
    loungeDetailCommentEditBackgroundUploadInFlight,
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
      clearHiddenFileInputs(
        loungeDetailCommentImageInputRef.current,
        loungeDetailCommentVideoInputRef.current,
      )
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
      loungeDetailCommentFieldRef.current?.blur()
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
      clearHiddenFileInputs(
        loungeDetailCommentImageInputRef.current,
        loungeDetailCommentVideoInputRef.current,
      )
    } catch {
      // ignore
    }
    try {
      loungeDetailCommentFieldRef.current?.blur()
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [disposeComposerVideoMedia, endLoungeDetailCommentMediaSession])

  const clearLoungeDetailEditForPostAttempt = useCallback((opts = {}) => {
    const preserve = Boolean(opts.preserveDetailEditVideoPrep)
    const snap = opts.pendingSnapshot ?? loungeDetailEditSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = loungeSubmitSnapshotBlobUrls(snap)
    if (pendingPoster.startsWith('blob:')) {
      const sl = loungeDetailEditVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      if (!loungeBackgroundSubmitBusy()) {
        const h = loungeDetailEditVideoPrepHandoffRef.current
        if (h && !h.settled) {
          try {
            h.reject(new DOMException('Aborted', 'AbortError'))
          } catch {
            // ignore
          }
        }
        loungeDetailEditVideoPrepJobIdRef.current += 1
        try {
          loungeDetailEditVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        loungeDetailEditVideoPrepAbortRef.current = null
        loungeDetailEditVideoPrepHandoffRef.current = null
      }
    }
    setLoungeDetailEditErr('')
    setLoungeDetailEditImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailEditMediaUrl('')
    setLoungeDetailEditVideoSlot((prev) => {
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
    setLoungeDetailEditKeepStreamUid(null)
    setLoungeDetailEditMarketSymbols([])
    try {
      clearHiddenFileInputs(loungeDetailEditImageInputRef.current, loungeDetailEditVideoInputRef.current)
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [disposeComposerVideoMedia])

  const clearLoungeDetailCommentEditForPostAttempt = useCallback((opts = {}) => {
    const preserve = Boolean(opts.preserveDetailCommentEditVideoPrep)
    const snap = opts.pendingSnapshot ?? loungeDetailCommentEditSnapshotRef.current
    const pendingPoster =
      snap && typeof snap.sessionStreamPosterBlobUrl === 'string'
        ? snap.sessionStreamPosterBlobUrl.trim()
        : ''
    const skipRevoke = loungeSubmitSnapshotBlobUrls(snap)
    if (pendingPoster.startsWith('blob:')) {
      const sl = loungeDetailCommentEditVideoSlotRef.current
      if (sl?.preview && sl.preview === pendingPoster) skipRevoke.add(sl.preview)
      if (sl?.posterUrl && sl.posterUrl === pendingPoster) skipRevoke.add(sl.posterUrl)
    }
    if (!preserve) {
      if (!loungeBackgroundSubmitBusy()) {
        const h = loungeDetailCommentEditVideoPrepHandoffRef.current
        if (h && !h.settled) {
          try {
            h.reject(new DOMException('Aborted', 'AbortError'))
          } catch {
            // ignore
          }
        }
        loungeDetailCommentEditVideoPrepJobIdRef.current += 1
        try {
          loungeDetailCommentEditVideoPrepAbortRef.current?.abort()
        } catch {
          // ignore
        }
        loungeDetailCommentEditVideoPrepAbortRef.current = null
        loungeDetailCommentEditVideoPrepHandoffRef.current = null
      }
    }
    setLoungeDetailCommentEditImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailCommentEditMediaUrl('')
    setLoungeDetailCommentEditVideoSlot((prev) => {
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
    setLoungeDetailCommentEditKeepStreamUid(null)
    try {
      clearHiddenFileInputs(
        loungeDetailCommentEditImageInputRef.current,
        loungeDetailCommentEditVideoInputRef.current,
      )
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [disposeComposerVideoMedia])

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

  const startLoungeDetailEditVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      if (loungeBackgroundSubmitBusy()) {
        loungeDetailEditVideoPrepSpecRef.current = spec
        loungeDetailEditVideoLastEncodedFileRef.current = null
        setLoungeDetailEditVideoSlot({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        })
        return
      }
      const prevH = loungeDetailEditVideoPrepHandoffRef.current
      if (prevH && !prevH.settled) {
        try {
          prevH.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        loungeDetailEditVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      const jobId = (loungeDetailEditVideoPrepJobIdRef.current += 1)
      loungeDetailEditVideoLastEncodedFileRef.current = null
      const ac = new AbortController()
      loungeDetailEditVideoPrepAbortRef.current = ac
      loungeDetailEditVideoPrepSpecRef.current = spec

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
      loungeDetailEditVideoPrepHandoffRef.current = handoff

      setLoungeDetailEditVideoSlot({
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
              loungeDetailEditVideoLastEncodedFileRef.current = f
            },
            onProgress: (info) => {
              if (loungeDetailEditVideoPrepJobIdRef.current !== jobId) return
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
              if (loungeDetailEditVideoPrepJobIdRef.current !== jobId) return
              const d = String(detail || '').trim()
              if (!d) return
              setLoungePostUploadBar((bar) =>
                bar?.mode === 'mediaPrep' && bar.prepJobId === jobId
                  ? { ...bar, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL }
                  : bar,
              )
            },
          })
          if (ac.signal.aborted || loungeDetailEditVideoPrepJobIdRef.current !== jobId) {
            if (!handoff.settled) handoff.reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          handoff.resolve(result)
          loungeDetailEditVideoLastEncodedFileRef.current = null
          if (loungeDetailEditJobRunningRef.current || loungeDetailEditSnapshotRef.current) {
            setLoungePostUploadBar((bar) =>
              bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
            )
            return
          }
          const { encodedFile, streamVideoUid } = result
          setLoungeDetailEditVideoSlot((prev) => {
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
            if (loungeDetailEditVideoPrepJobIdRef.current !== jobId) return
            setLoungePostUploadBar(null)
            return
          }
          if (loungeDetailEditVideoPrepJobIdRef.current !== jobId) return
          if (loungeDetailEditJobRunningRef.current || loungeDetailEditSnapshotRef.current) {
            setLoungePostUploadBar(null)
            return
          }
          const msg =
            (e instanceof Error ? e.message : String(e || '')).trim() ||
            'Video upload failed after multiple attempts.'
          const slotStill = loungeDetailEditVideoSlotRef.current
          if (slotStill?.prepJobId === jobId) {
            setLoungeDetailEditVideoSlot((prev) =>
              prev?.prepJobId === jobId ? { ...prev, prepStatus: 'failed', prepError: msg } : prev,
            )
            setLoungeDetailEditErr(msg)
          }
          setLoungePostUploadBar(null)
        }
      })()
    },
    [supabaseClient, loungeBackgroundSubmitBusy],
  )

  const startLoungeDetailCommentEditVideoPrepFromSpec = useCallback(
    (spec, slotBase) => {
      if (loungeBackgroundSubmitBusy()) {
        loungeDetailCommentEditVideoPrepSpecRef.current = spec
        loungeDetailCommentEditVideoLastEncodedFileRef.current = null
        setLoungeDetailCommentEditVideoSlot({
          ...slotBase,
          prepJobId: null,
          prepStatus: 'queued',
          prepError: '',
        })
        return
      }
      const prevH = loungeDetailCommentEditVideoPrepHandoffRef.current
      if (prevH && !prevH.settled) {
        try {
          prevH.reject(new DOMException('Aborted', 'AbortError'))
        } catch {
          // ignore
        }
      }
      try {
        loungeDetailCommentEditVideoPrepAbortRef.current?.abort()
      } catch {
        // ignore
      }
      const jobId = (loungeDetailCommentEditVideoPrepJobIdRef.current += 1)
      loungeDetailCommentEditVideoLastEncodedFileRef.current = null
      const ac = new AbortController()
      loungeDetailCommentEditVideoPrepAbortRef.current = ac
      loungeDetailCommentEditVideoPrepSpecRef.current = spec

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
      loungeDetailCommentEditVideoPrepHandoffRef.current = handoff

      setLoungeDetailCommentEditVideoSlot({
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
              loungeDetailCommentEditVideoLastEncodedFileRef.current = f
            },
            onProgress: (info) => {
              if (loungeDetailCommentEditVideoPrepJobIdRef.current !== jobId) return
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
              if (loungeDetailCommentEditVideoPrepJobIdRef.current !== jobId) return
              const d = String(detail || '').trim()
              if (!d) return
              setLoungePostUploadBar((bar) =>
                bar?.mode === 'mediaPrep' && bar.prepJobId === jobId
                  ? { ...bar, detail: LOUNGE_UPLOAD_BAR_GOBLIN_DETAIL }
                  : bar,
              )
            },
          })
          if (ac.signal.aborted || loungeDetailCommentEditVideoPrepJobIdRef.current !== jobId) {
            if (!handoff.settled) handoff.reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          handoff.resolve(result)
          loungeDetailCommentEditVideoLastEncodedFileRef.current = null
          if (loungeDetailCommentEditJobRunningRef.current || loungeDetailCommentEditSnapshotRef.current) {
            setLoungePostUploadBar((bar) =>
              bar?.mode === 'mediaPrep' && bar.prepJobId === jobId && !bar.postSubmission ? null : bar,
            )
            return
          }
          const { encodedFile, streamVideoUid } = result
          setLoungeDetailCommentEditVideoSlot((prev) => {
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
            if (loungeDetailCommentEditVideoPrepJobIdRef.current !== jobId) return
            setLoungePostUploadBar(null)
            return
          }
          if (loungeDetailCommentEditVideoPrepJobIdRef.current !== jobId) return
          if (loungeDetailCommentEditJobRunningRef.current || loungeDetailCommentEditSnapshotRef.current) {
            setLoungePostUploadBar(null)
            return
          }
          const msg =
            (e instanceof Error ? e.message : String(e || '')).trim() ||
            'Video upload failed after multiple attempts.'
          const slotStill = loungeDetailCommentEditVideoSlotRef.current
          if (slotStill?.prepJobId === jobId) {
            setLoungeDetailCommentEditVideoSlot((prev) =>
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
          if (threadComposeOpenRef.current || mode === LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE) {
            setThreadComposeErr('Could not read this video file.')
          } else if (mode === 'composer') setPostErr('Could not read this video file.')
          else if (mode === 'quote') setQuoteRepostErr('Could not read this video file.')
          else if (mode === 'detailComment') {
            setLoungeDetailCommentErr('Could not read this video file.')
            loungeDetailCommentMediaSessionRef.current = false
          } else if (mode === 'detailCommentEdit') {
            setLoungeDetailCommentErr('Could not read this video file.')
          } else setLoungeDetailEditErr('Could not read this video file.')
          return
        }
        if (threadComposeOpenRef.current || mode === LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE) {
          const partIdx = threadComposeActivePartIndexRef.current
          if (dur <= LOUNGE_VIDEO_MAX_SECONDS + 0.35) {
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startThreadComposePartVideoPrepFromSpec(partIdx, spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            restoreLoungeComposerCaptionAfterMediaPick('composer')
          } else {
            setLoungeVideoCrop({
              file: vf,
              mode: LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE,
              partIdx,
              knownDurationSec: dur,
            })
          }
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
          } else if (mode === 'detailEdit') {
            disposeComposerVideoMedia(loungeDetailEditVideoSlotRef.current)
            setLoungeDetailEditKeepStreamUid(null)
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startLoungeDetailEditVideoPrepFromSpec(spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            setLoungeDetailEditMediaUrl('')
            restoreLoungeComposerCaptionAfterMediaPick('detailEdit')
          } else if (mode === 'detailCommentEdit') {
            disposeComposerVideoMedia(loungeDetailCommentEditVideoSlotRef.current)
            setLoungeDetailCommentEditKeepStreamUid(null)
            const spec = { kind: 'direct', file: vf }
            const previewUrl = URL.createObjectURL(vf)
            let posterUrl = null
            try {
              posterUrl = await captureVideoFilePosterObjectUrl(vf)
            } catch {
              posterUrl = null
            }
            startLoungeDetailCommentEditVideoPrepFromSpec(spec, {
              file: vf,
              posterUrl: posterUrl || null,
              preview: previewUrl,
              streamVideoUid: null,
            })
            setLoungeDetailCommentEditMediaUrl('')
            restoreLoungeComposerCaptionAfterMediaPick('detailCommentEdit')
          }
          return
        }
        if (mode === 'detailComment') {
          focusLoungeComposerCaption(() => loungeDetailCommentFieldRef.current)
        } else if (mode === 'detailEdit') {
          focusLoungeComposerCaption(() => loungeDetailEditFieldRef.current)
        } else if (mode === 'detailCommentEdit') {
          focusLoungeComposerCaption(() => loungeDetailCommentEditFieldRef.current)
        }
        setLoungeVideoCrop({ file: vf, mode, knownDurationSec: dur })
      } catch (e) {
        if (threadComposeOpenRef.current || mode === LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE) {
          setThreadComposeErr(msgRead(e))
        } else if (mode === 'composer') setPostErr(msgRead(e))
        else if (mode === 'quote') setQuoteRepostErr(msgRead(e))
        else if (mode === 'detailComment') {
          setLoungeDetailCommentErr(msgRead(e))
          loungeDetailCommentMediaSessionRef.current = false
        } else if (mode === 'detailCommentEdit') {
          setLoungeDetailCommentErr(msgRead(e))
        } else setLoungeDetailEditErr(msgRead(e))
      }
    },
    [
      disposeComposerVideoMedia,
      restoreLoungeComposerCaptionAfterMediaPick,
      startComposerVideoPrepFromSpec,
      startLoungeDetailCommentVideoPrepFromSpec,
      startLoungeDetailCommentEditVideoPrepFromSpec,
      startLoungeDetailEditVideoPrepFromSpec,
      startQuoteRepostVideoPrepFromSpec,
      startThreadComposePartVideoPrepFromSpec,
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
    if (!threadComposeOpen) {
      if (!v) return false
      return v.prepStatus === 'failed'
    }
    return threadComposePartMedia.some((part) => threadComposeVideoSlotBlocksPost(part.videoSlot))
  }, [composerVideoSlot, threadComposeOpen, threadComposePartMedia])

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

  const loungeDetailEditVideoPostBlocked = useMemo(() => {
    const v = loungeDetailEditVideoSlot
    if (!v) return false
    return v.prepStatus === 'failed'
  }, [loungeDetailEditVideoSlot])

  const loungeDetailCommentEditVideoPostBlocked = useMemo(() => {
    const v = loungeDetailCommentEditVideoSlot
    if (!v) return false
    return v.prepStatus === 'failed'
  }, [loungeDetailCommentEditVideoSlot])

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

  // Comment IDs that appear as plain comment-repost cards in the feed - need separate interaction hydration.
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
      const [likesRes, legacyRepostsRes, commentRepostsRes, bmRes, repliesRes] = await Promise.all([
        supabaseClient.from('feed_comment_likes').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient.from('feed_comment_reposts').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient
          .from('community_feed_posts')
          .select('id,repost_of_comment_id,is_plain_repost')
          .eq('user_id', composerUserId)
          .in('repost_of_comment_id', cids)
          .is('hidden_at', null),
        supabaseClient.from('feed_comment_bookmarks').select('comment_id').eq('user_id', composerUserId).in('comment_id', cids),
        supabaseClient
          .from('feed_comments')
          .select('parent_id')
          .eq('user_id', composerUserId)
          .in('parent_id', cids)
          .is('hidden_at', null),
      ])
      const intErr =
        likesRes.error?.message ||
        legacyRepostsRes.error?.message ||
        commentRepostsRes.error?.message ||
        bmRes.error?.message ||
        repliesRes.error?.message
      if (intErr) {
        console.warn('profile comment interactions:', intErr)
        return
      }
      const legacyRepostedCommentIds = new Set(
        (legacyRepostsRes.data || []).map((r) => (r.comment_id != null ? String(r.comment_id) : '')).filter(Boolean),
      )
      const plainRepostByCommentId = new Map()
      const quoteRepostByCommentId = new Map()
      for (const r of commentRepostsRes.data || []) {
        const cid = r.repost_of_comment_id != null ? String(r.repost_of_comment_id) : ''
        if (!cid) continue
        if (r.is_plain_repost === true) plainRepostByCommentId.set(cid, r.id)
        else quoteRepostByCommentId.set(cid, r.id)
      }
      const repliedToCommentIds = new Set(
        (repliesRes.data || []).map((r) => (r.parent_id != null ? String(r.parent_id) : '')).filter(Boolean),
      )
      setInteractionByComment((prev) => {
        const next = { ...prev }
        for (const id of cids) {
          const key = String(id)
          const cur = next[key] || { ...defaultInteraction }
          const plainId = plainRepostByCommentId.get(key) || null
          const quoteId = quoteRepostByCommentId.get(key) || null
          next[key] = {
            ...cur,
            liked: false,
            reposted: !!(plainId || quoteId || legacyRepostedCommentIds.has(key)),
            commented: repliedToCommentIds.has(key),
            plainRepostChildId: plainId,
            quoteRepostChildId: quoteId,
          }
        }
        for (const r of likesRes.data || []) {
          const cid = r.comment_id != null ? String(r.comment_id) : ''
          if (!cid || !next[cid]) continue
          next[cid] = { ...next[cid], liked: true }
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
      clearHiddenFileInputs(quoteRepostImageInputRef.current, quoteRepostVideoInputRef.current)
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
        else if (klipyPickerTarget === 'detailCommentEdit') setLoungeDetailCommentErr(chk.message)
        else if (klipyPickerTarget === 'detailEdit') setLoungeDetailEditErr(chk.message)
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
        } else if (target === 'detailEdit') {
          cancelLoungeDetailEditMediaPrep()
          setLoungeDetailEditMediaUrl(u)
        } else if (target === 'detailCommentEdit') {
          cancelLoungeDetailCommentEditMediaPrep()
          setLoungeDetailCommentEditMediaUrl(u)
        } else if (threadComposeOpenRef.current) {
          const activeIdx = threadComposeActivePartIndexRef.current
          if (threadComposePartMediaRef.current[activeIdx]?.videoSlot) {
            setThreadComposeErr('Remove the video before adding a GIF to this post.')
            return
          }
          removeThreadPartDraftMediaMarkers(activeIdx, [threadDraftGifDisplayName(u)])
          setThreadComposePartMedia((prev) =>
            prev.map((row, j) => (j === activeIdx ? { ...row, gifUrl: u } : row)),
          )
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
          clearComposerMediaInputs()
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
      cancelLoungeDetailCommentEditMediaPrep,
      cancelLoungeDetailEditMediaPrep,
      endLoungeDetailCommentMediaSession,
      removeThreadPartDraftMediaMarkers,
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
      setQuoteRepostCategoryPills(resolveQuoteRepostInitialCategoryPills(post))
      setQuoteRepostModal({ mode: 'compose', original: post, originalKind: 'post' })
      setLoungeDetailRepostMenuOpen(false)
    },
    [clearQuoteRepostMedia, loungeReadOnly, openProfileGateIfNeeded, quoteRepostBackgroundUploadInFlight]
  )

  const openQuoteRepostComposerForComment = useCallback(
    (comment) => {
      if (!comment?.id || loungeReadOnly) return
      if (openProfileGateIfNeeded()) return
      if (quoteRepostBackgroundUploadInFlight()) {
        setLoungeManageErr('Your quote repost is still uploading. You can keep browsing while it finishes.')
        return
      }
      clearQuoteRepostMedia()
      setQuoteRepostDraft('')
      setQuoteRepostErr('')
      setQuoteRepostCategoryPills(feedPostCategoryPills(loungePostDetail))
      setQuoteRepostModal({ mode: 'compose', original: comment, originalKind: 'comment' })
      setLoungeDetailRepostMenuOpen(false)
    },
    [
      clearQuoteRepostMedia,
      loungePostDetail,
      loungeReadOnly,
      openProfileGateIfNeeded,
      quoteRepostBackgroundUploadInFlight,
    ],
  )

  const openRemoveQuoteRepostForComment = useCallback(
    (comment) => {
      if (!comment?.id || loungeReadOnly) return
      const quoteId =
        interactionByCommentRef.current[String(comment.id)]?.quoteRepostChildId
      if (!quoteId) {
        setLoungeManageErr('Could not find your quote repost. Try refreshing.')
        return
      }
      setLoungeDetailRepostMenuOpen(false)
      setQuoteRepostErr('')
      setQuoteRepostModal({
        mode: 'remove',
        original: comment,
        originalKind: 'comment',
        childId: quoteId,
      })
    },
    [loungeReadOnly]
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
          setProfileGateCategoryPills(profileCategoryPills(ownProfile || composerUserProfile))
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
              .insert(
                communityFeedCommentRepostInsertPayload({
                  originalCommentId: post.repost_of_comment_id,
                  categoryPills: resolvePlainRepostCategoryPills(post),
                }),
              )
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
              .insert(
                communityFeedPlainRepostInsertPayload({
                  originalPostId: post.repost_of_post_id,
                  categoryPills: resolvePlainRepostCategoryPills(post),
                }),
              )
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
          .insert(
            communityFeedPlainRepostInsertPayload({
              originalPostId: post.id,
              categoryPills: resolvePlainRepostCategoryPills(post),
            }),
          )
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
        bumpNotificationInteractionRefreshIfOpen()
      } catch (e) {
        setLoungeManageErr(e?.message || 'Could not repost.')
      }
    },
    [
      bumpNotificationInteractionRefreshIfOpen,
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
        bumpNotificationInteractionRefreshIfOpen()
      } finally {
        setRepostManageBusy(false)
      }
    },
    [bumpNotificationInteractionRefreshIfOpen, composerUserId, loadCommunityFeed, refreshLoungePostInteractions, supabaseClient]
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
    const quoteComment = modal.originalKind === 'comment'
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
        setProfileGateCategoryPills(profileCategoryPills(ownProfile || composerUserProfile))
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
        quoteRepostOfPostId: quoteComment ? null : originalId,
        quoteRepostOfCommentId: quoteComment ? originalId : null,
        categoryPills: quoteRepostCategoryPills,
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
    quoteRepostCategoryPills,
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
      if (origId) {
        if (modal.originalKind === 'comment') {
          await hydrateCommentInteractionsForIds([origId])
        } else {
          await refreshLoungePostInteractions([origId])
        }
      }
      bumpNotificationInteractionRefreshIfOpen()
    } finally {
      setQuoteRepostBusy(false)
    }
  }, [
    bumpNotificationInteractionRefreshIfOpen,
    clearQuoteRepostMedia,
    quoteRepostModal,
    composerUserId,
    supabaseClient,
    hydrateCommentInteractionsForIds,
    loadCommunityFeed,
    refreshLoungePostInteractions,
  ])

  useLayoutEffect(() => {
    if (!quoteRepostModal || quoteRepostModal.mode !== 'compose') return
    focusLoungeComposerCaption(() => quoteRepostFieldRef.current)
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
      setCommunityPosts((prev) =>
        prev.map((p) =>
          p.reposted_comment != null && p.reposted_comment.id === commentId
            ? { ...p, reposted_comment: { ...p.reposted_comment, like_count: Math.max(0, (Number(p.reposted_comment.like_count) || 0) + delta) } }
            : p,
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
    [composerUserId, defaultInteraction, setCommunityPosts, supabaseClient]
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
        .insert(
          communityFeedCommentRepostInsertPayload({
            originalCommentId: commentId,
            categoryPills: feedPostCategoryPills(loungePostDetail),
          }),
        )
        .select('id')
        .maybeSingle()
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
      const childId = res.data?.id ? String(res.data.id) : null
      if (childId) {
        setInteractionByComment((prev) => {
          const cur = prev[commentId] || defaultInteraction
          return {
            ...prev,
            [commentId]: { ...cur, reposted: true, plainRepostChildId: childId, quoteRepostChildId: null },
          }
        })
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
      bumpNotificationInteractionRefreshIfOpen()
    },
    [bumpNotificationInteractionRefreshIfOpen, composerUserId, defaultInteraction, loadCommunityFeed, loungePostDetail, supabaseClient]
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
        // Legacy cleanup - no-op if row doesn't exist
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
      bumpNotificationInteractionRefreshIfOpen()
    },
    [bumpNotificationInteractionRefreshIfOpen, composerUserId, defaultInteraction, loadCommunityFeed, supabaseClient]
  )

  /** Post-detail reply: clear composer immediately and upload in the background (feed composer parity). */
  const submitLoungeDetailComment = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId || loungeReadOnly) return
    // No job-running guard here - the queue serialises execution; the composer clears
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

  const beginLoungeDetailCommentEdit = useCallback(
    (comment) => {
      if (!comment?.id || loungeReadOnly || !composerUserId) return
      if (comment.user_id !== composerUserId) return
      if (!isLoungePostWithinAuthorEditWindow(comment.created_at)) return
      if (openProfileGateIfNeeded()) return
      setLoungeDetailCommentErr('')
      cancelLoungeDetailCommentEditMediaPrep()
      setLoungeDetailCommentEditImageItems([])
      setLoungeDetailCommentEditVideoSlot(null)
      try {
        clearHiddenFileInputs(
          loungeDetailCommentEditImageInputRef.current,
          loungeDetailCommentEditVideoInputRef.current,
        )
      } catch {
        // ignore
      }
      setLoungeDetailCommentEditingId(comment.id)
      setLoungeDetailCommentEditDraft(String(comment.body || ''))
      const seed = feedCommentAuthorEditMediaSeed(comment)
      setLoungeDetailCommentEditImageUrls(seed.imageUrls)
      setLoungeDetailCommentEditMediaUrl(String(seed.gifUrl || '').trim())
      setLoungeDetailCommentEditKeepStreamUid(feedCommentStreamVideoUid(comment) || null)
    },
    [
      cancelLoungeDetailCommentEditMediaPrep,
      composerUserId,
      loungeReadOnly,
      openProfileGateIfNeeded,
    ],
  )

  const cancelLoungeDetailCommentEdit = useCallback(() => {
    const preserveMedia =
      loungeDetailCommentEditBackgroundUploadInFlight() ||
      loungeDetailCommentEditSnapshotRef.current != null
    if (!preserveMedia) {
      cancelLoungeDetailCommentEditMediaPrep()
      setLoungeDetailCommentEditImageItems((prev) => {
        for (const it of prev) {
          try {
            URL.revokeObjectURL(it.preview)
          } catch {
            // ignore
          }
        }
        return []
      })
      setLoungeDetailCommentEditMediaUrl('')
      setLoungeDetailCommentEditKeepStreamUid(null)
      try {
        clearHiddenFileInputs(
          loungeDetailCommentEditImageInputRef.current,
          loungeDetailCommentEditVideoInputRef.current,
        )
      } catch {
        // ignore
      }
    }
    setLoungeDetailCommentEditingId(null)
    setLoungeDetailCommentEditDraft('')
    setLoungeDetailCommentEditImageUrls([])
  }, [
    cancelLoungeDetailCommentEditMediaPrep,
    loungeDetailCommentEditBackgroundUploadInFlight,
  ])

  const saveLoungeDetailCommentEdit = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId || !loungeDetailCommentEditingId) return
    const body = loungeDetailCommentEditDraft.trim()
    setLoungeDetailCommentErr('')
    const gifCheck = validateAtMostOneGifUrl(loungeDetailCommentEditMediaUrl)
    if (!gifCheck.ok) {
      setLoungeDetailCommentErr(gifCheck.message)
      return
    }
    const gifOnlyUrl = gifCheck.value
    const slotNow = loungeDetailCommentEditVideoSlotRef.current
    const keepStream = String(loungeDetailCommentEditKeepStreamUid || '').trim() || null
    const hasNewVideo = slotNow != null
    const hasVideo = hasNewVideo || Boolean(keepStream)
    const hasImages =
      loungeDetailCommentEditImageItems.length > 0 || loungeDetailCommentEditImageUrls.length > 0
    const hasMedia = hasImages || Boolean(gifOnlyUrl) || hasVideo
    if (!body && !hasMedia) return
    if (body.length > LOUNGE_COMMENT_BODY_MAX) {
      setLoungeDetailCommentErr(`Reply must be ${LOUNGE_COMMENT_BODY_MAX} characters or fewer.`)
      return
    }
    if (loungeDetailCommentEditVideoPostBlocked) return
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

    const editingRow = loungeDetailComments.find((r) => r.id === loungeDetailCommentEditingId)
    const previousStreamUid = feedCommentStreamVideoUid(editingRow) || null
    const uid = hasNewVideo ? String(slotNow?.streamVideoUid || '').trim() || null : keepStream
    const clearStream = Boolean(previousStreamUid && !keepStream && !hasNewVideo)
    const awaiting =
      hasNewVideo && !uid && slotNow?.prepStatus === 'preparing' && typeof slotNow?.prepJobId === 'number'
        ? slotNow.prepJobId
        : null
    const specForSnap =
      hasNewVideo && !uid && loungeDetailCommentEditVideoPrepSpecRef.current
        ? loungeDetailCommentEditVideoPrepSpecRef.current
        : null
    const sessionPosterBlob =
      hasNewVideo && slotNow?.posterUrl && String(slotNow.posterUrl).startsWith('blob:')
        ? String(slotNow.posterUrl)
        : null

    const snapshot = {
      commentId: loungeDetailCommentEditingId,
      body,
      gifOnlyUrl,
      remoteImageUrls: loungeDetailCommentEditImageUrls,
      imageFiles: loungeDetailCommentEditImageItems.map((it) => it.file),
      videoFile: hasNewVideo && slotNow?.file ? slotNow.file : null,
      streamVideoUid: uid,
      sessionStreamPosterBlobUrl: sessionPosterBlob,
      previousStreamUid,
      clearStream,
      userId: composerUserId,
      awaitingDetailCommentEditVideoPrepJobId: awaiting,
      videoPrepSpec: specForSnap,
      _capturedPrepHandoff: loungeDetailCommentEditVideoPrepHandoffRef.current ?? null,
    }

    const preserveVideoPrep = snapshot.awaitingDetailCommentEditVideoPrepJobId != null
    if (shouldAssignLoungePostSnapshotRef()) {
      loungeDetailCommentEditSnapshotRef.current = snapshot
    }
    const commentPosterBlob =
      typeof snapshot.sessionStreamPosterBlobUrl === 'string'
        ? snapshot.sessionStreamPosterBlobUrl.trim()
        : ''
    const commentPostUid = String(snapshot.streamVideoUid || '').trim()
    if (commentPostUid && commentPosterBlob.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(commentPostUid, commentPosterBlob)
    }
    clearLoungeDetailCommentEditForPostAttempt({
      preserveDetailCommentEditVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    setLoungeDetailCommentEditPendingCommentId(loungeDetailCommentEditingId)
    enqueueAndRunLoungeSubmitRef.current('commentEdit', snapshot)
    cancelLoungeDetailCommentEdit()
  }, [
    cancelLoungeDetailCommentEdit,
    clearLoungeDetailCommentEditForPostAttempt,
    composerUserId,
    loungeDetailCommentEditDraft,
    loungeDetailCommentEditImageItems,
    loungeDetailCommentEditImageUrls,
    loungeDetailCommentEditMediaUrl,
    loungeDetailCommentEditVideoPostBlocked,
    loungeDetailCommentEditingId,
    loungeDetailComments,
    loungePostDetail?.id,
    shouldAssignLoungePostSnapshotRef,
  ])

  const deleteLoungeDetailComment = useCallback(
    async (c) => {
      if (!c?.id || !composerUserId || !loungePostDetail?.id) return
      if (typeof window !== 'undefined') {
        const ok = window.confirm('Delete this reply? This cannot be undone.')
        if (!ok) return
      }
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
      setLoungeDetailCommentEditPendingCommentId((prev) =>
        prev === c.id || removeIds.has(prev) ? null : prev,
      )
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
   * Load post-detail comments once per opened post - not on every auth/interaction dep change.
   * Do NOT reset `loungeCommentDetailPathIds` here when `composerUserId` (or similar) updates:
   * comment-repost direct entry sets the drill path first; a re-run used to clear it and leave
   * the user stuck on post-only detail ("Post" title) instead of Reply + hierarchy.
   * Never put `loungeDetailCommentsLoading` in this effect's deps - toggling it re-ran the
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

  /** Hydrate comment likes/reposts/bookmarks when comment ids or viewer session changes - not on count-only updates. */
  useEffect(() => {
    if (!loungePostDetail?.id || loungeReadOnly || loungeDetailCommentsLoading) return
    const cids = loungeDetailCommentIdsKey ? loungeDetailCommentIdsKey.split('\0').filter(Boolean) : []
    if (!composerUserId || cids.length === 0) return
    void hydrateCommentInteractionsForIds(cids)
  }, [
    composerUserId,
    hydrateCommentInteractionsForIds,
    loungeDetailCommentIdsKey,
    loungeDetailCommentsLoading,
    loungePostDetail?.id,
    loungeReadOnly,
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
    cancelLoungeDetailEditMediaPrep()
    setLoungeDetailEditImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailEditImageUrls([])
    setLoungeDetailEditMediaUrl('')
    setLoungeDetailEditKeepStreamUid(null)
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
    setLoungeDetailCommentEditPendingCommentId(null)
    setLoungeDetailCommentDeleteBusyId(null)
    setLoungeDetailCommentEditImageUrls([])
    setLoungeDetailCommentEditImageItems((prev) => {
      for (const it of prev) {
        try {
          URL.revokeObjectURL(it.preview)
        } catch {
          // ignore
        }
      }
      return []
    })
    setLoungeDetailCommentEditMediaUrl('')
    setLoungeDetailCommentEditKeepStreamUid(null)
    cancelLoungeDetailCommentEditMediaPrep()
    const postEditUploadInFlight = loungeDetailEditBackgroundUploadInFlight()
    if (!postEditUploadInFlight) {
      try {
        loungeDetailEditAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailEditAbortRef.current = null
      loungeDetailEditJobRunningRef.current = false
      loungeDetailEditSnapshotRef.current = null
    }
    const commentEditUploadInFlight = loungeDetailCommentEditBackgroundUploadInFlight()
    if (!commentEditUploadInFlight) {
      try {
        loungeDetailCommentEditAbortRef.current?.abort()
      } catch {
        // ignore
      }
      loungeDetailCommentEditAbortRef.current = null
      loungeDetailCommentEditJobRunningRef.current = false
      loungeDetailCommentEditSnapshotRef.current = null
    }
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
    if (loungeNavRestoringRef.current || loungeNavSearchReturnPendingRef.current) {
      return
    }
    if (profileModalOpen || profileOverlayStack.length > 0) {
      return
    }
    const navFrame = popLoungeNavReturnFrame(loungeNavReturnStackRef.current)
    if (navFrame) {
      requestAnimationFrame(() => {
        void restoreLoungeNavFrameRef.current(navFrame)
      })
    }
  }, [
    cancelLoungeDetailCommentEditMediaPrep,
    cancelLoungeDetailEditMediaPrep,
    clearLoungeDetailCommentComposerMedia,
    loungeDetailCommentBackgroundUploadInFlight,
    loungeDetailCommentEditBackgroundUploadInFlight,
    loungeDetailEditBackgroundUploadInFlight,
    profileModalOpen,
    profileOverlayStack.length,
  ])

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
      cancelLoungeDetailEditMediaPrep()
      setLoungeDetailEditImageItems((prev) => {
        for (const it of prev) {
          try {
            URL.revokeObjectURL(it.preview)
          } catch {
            // ignore
          }
        }
        return []
      })
      setLoungeDetailEditMediaUrl('')
      setLoungeDetailEditKeepStreamUid(null)
      setLoungeDetailEditVideoSlot(null)
      setLoungeDetailEditMarketSymbols([])
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
      if (opts?.restoreCommentPathIds?.length) {
        const path = opts.restoreCommentPathIds.map(String).filter(Boolean)
        setLoungeCommentDetailPathIds(path)
        loungeCommentDetailDirectEntryDepthRef.current = path.length
      }
      setLoungeDetailCommentDraft('')
      setLoungeDetailCommentErr('')
      setLoungeDetailCommentComposerExpanded(false)
      setLoungeDetailCommentEditingId(null)
      setLoungeDetailCommentEditDraft('')
      setLoungeDetailCommentEditBusy(false)
      setLoungeDetailCommentEditPendingCommentId(null)
      setLoungeDetailCommentDeleteBusyId(null)
      setLoungePostDetail(post)
      setLoungePostDetailAboveProfile(profileModalOpen || profileOverlayStack.length > 0)
      if (composerUserId) {
        void refreshLoungePostInteractions([post.id])
      }
      setLoungeDetailEditImageUrls([])
      setLoungeDetailEditMediaUrl('')
      if (
        wantEdit &&
        composerUserId &&
        post.user_id === composerUserId &&
        isLoungePostWithinAuthorEditWindow(post.created_at)
      ) {
        setLoungeDetailEditErr('')
        setLoungeManageErr('')
        cancelLoungeDetailEditMediaPrep()
        setLoungeDetailEditImageItems([])
        setLoungeDetailEditVideoSlot(null)
        try {
          clearHiddenFileInputs(loungeDetailEditImageInputRef.current, loungeDetailEditVideoInputRef.current)
        } catch {
          // ignore
        }
        setLoungeDetailDraftCaption(feedPostDisplayCaption(post))
        const seed = feedPostAuthorEditMediaSeed(post)
        setLoungeDetailEditImageUrls(seed.imageUrls)
        setLoungeDetailEditMediaUrl(String(seed.gifUrl || '').trim())
        setLoungeDetailEditKeepStreamUid(feedPostStreamVideoUid(post) || null)
        setLoungeDetailEditCategoryPills(displayPostCategoryPills(post))
        setLoungeDetailEditMarketSymbols(
          normalizeMarketEmbeds(post.market_embeds).map((e) => ({
            symbol: e.symbol,
            asset_class: e.asset_class,
            display_symbol: e.display_symbol,
            name: e.name,
            exchange: e.exchange,
            logo_url: e.logo_url,
            market_cap: e.market_cap,
            currency: e.currency,
          })),
        )
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
    [cancelLoungeDetailEditMediaPrep, composerUserId, loungeReadOnly, onRequireAuth, profileModalOpen, profileOverlayStack.length, refreshLoungePostInteractions, supabaseClient]
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
          .select(COMMUNITY_FEED_SELECT)
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
          .select(COMMUNITY_FEED_SELECT)
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
    if (!isActivePage) {
      onNavigateToLoungeFeed?.()
      return
    }
    dismissLoungeStackForDockNavRef.current()
    setLoungeDockPanel(null)
    setChatDockInitialPeerUserId(null)
    scrollLoungeFeedToTop()
    loungeTitleRevealRef.current = 1
    setLoungeTitleReveal(1)
  }, [isActivePage, onNavigateToLoungeFeed, scrollLoungeFeedToTop])

  const onLoungeDockSearch = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    ensureLoungeFeedVisible()
    dismissLoungeStackForDockNavRef.current()
    setLoungeDockPanel((p) => (p === 'search' ? null : 'search'))
  }, [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth, ensureLoungeFeedVisible])
  const onLoungeDockNotifications = useCallback(() => {
    ensureLoungeFeedVisible()
    dismissLoungeStackForDockNavRef.current()
    setLoungeDockPanel((p) => (p === 'notifications' ? null : 'notifications'))
  }, [ensureLoungeFeedVisible])

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

  const markLoungePushOpened = useCallback(
    async ({ activityEventId, activityBatchId } = {}) => {
      const eventId = String(activityEventId || '').trim()
      const batchId = String(activityBatchId || '').trim()
      if (!eventId && !batchId) return

      if (!composerUserId || loungeFeedBrowseMode === 'anonymous') {
        queueLoungeActivityMarkRead({ activityEventId: eventId, activityBatchId: batchId })
        return
      }

      const dedupeKey = batchId ? `batch:${batchId}` : `event:${eventId}`
      if (loungePushMarkDedupeRef.current.has(dedupeKey)) return
      loungePushMarkDedupeRef.current.add(dedupeKey)

      try {
        await loungeActivityMarkPushOpened(supabaseClient, {
          activityEventId: eventId || null,
          batchId: batchId || null,
        })
      } catch (e) {
        loungePushMarkDedupeRef.current.delete(dedupeKey)
        if (!isLoungeActivitySchemaMissingError(e)) {
          /* ignore transient mark-read errors */
        }
      }
      void refreshLoungeNotificationsUnread()
    },
    [composerUserId, loungeFeedBrowseMode, refreshLoungeNotificationsUnread, supabaseClient],
  )

  useEffect(() => {
    if (!composerUserId || loungeFeedBrowseMode === 'anonymous') return
    for (const item of drainLoungeActivityMarkReadQueue()) {
      void markLoungePushOpened(item)
    }
  }, [composerUserId, loungeFeedBrowseMode, markLoungePushOpened])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onPushOpened = (ev) => {
      void markLoungePushOpened(ev.detail || {})
    }
    window.addEventListener('lounge-push-opened', onPushOpened)
    return () => window.removeEventListener('lounge-push-opened', onPushOpened)
  }, [markLoungePushOpened])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let cancelled = false
    const run = async () => {
      const params = new URLSearchParams(window.location.search || '')
      const activityEventId = (params.get('activityEvent') || '').trim()
      const activityBatchId = (params.get('activityBatch') || '').trim()
      if (!activityEventId && !activityBatchId) return
      if (cancelled) return
      await markLoungePushOpened({ activityEventId, activityBatchId })
      if (cancelled) return
      stripLoungeActivityPushQueryParams()
    }
    void run()
    const onPop = () => void run()
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [markLoungePushOpened])

  useEffect(() => {
    void refreshLoungeNotificationsUnread()
    if (typeof window === 'undefined' || !composerUserId || loungeFeedBrowseMode === 'anonymous') return undefined
    const id = window.setInterval(() => void refreshLoungeNotificationsUnread(), 60_000)
    return () => window.clearInterval(id)
  }, [composerUserId, loungeFeedBrowseMode, refreshLoungeNotificationsUnread])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const onActivityArrived = () => {
      void refreshLoungeNotificationsUnread()
    }
    window.addEventListener('lounge-activity-arrived', onActivityArrived)
    return () => window.removeEventListener('lounge-activity-arrived', onActivityArrived)
  }, [refreshLoungeNotificationsUnread])

  const refreshChatUnreadRoomCount = useCallback(async () => {
    if (!composerUserId || loungeFeedBrowseMode === 'anonymous') {
      setChatUnreadRoomCount(0)
      return
    }
    try {
      const { data, error } = await supabaseClient.rpc('chat_unread_room_count')
      if (!error) setChatUnreadRoomCount(data ?? 0)
    } catch {
      /* ignore transient errors */
    }
  }, [composerUserId, loungeFeedBrowseMode, supabaseClient])

  useEffect(() => {
    void refreshChatUnreadRoomCount()
    if (typeof window === 'undefined' || !composerUserId || loungeFeedBrowseMode === 'anonymous') return undefined
    const id = window.setInterval(() => void refreshChatUnreadRoomCount(), 60_000)
    return () => window.clearInterval(id)
  }, [composerUserId, loungeFeedBrowseMode, refreshChatUnreadRoomCount])

  const {
    pushActive: loungePushActive,
    pushBusy: loungePushBusy,
    pushStatusHint: loungePushStatusHint,
    pushStatusMessage: loungePushStatusMessage,
    onPushToggle: onLoungePushToggle,
  } = useLoungePushNotifications({
    supabaseClient,
    viewerUserId: composerUserId || '',
  })

  const {
    notificationPrefs: loungeNotificationPrefs,
    notificationPrefsLoading: loungeNotificationPrefsLoading,
    notificationPrefsSavingKey: loungeNotificationPrefsSavingKey,
    notificationPrefsSchemaMissing: loungeNotificationPrefsSchemaMissing,
    notificationPrefsError: loungeNotificationPrefsError,
    onNotificationPrefToggle: onLoungeNotificationPrefToggle,
  } = useLoungeNotificationPreferences({
    supabaseClient,
    viewerUserId: composerUserId || '',
  })

  const onLoungeNotificationsUnreadChange = useCallback((n) => {
    setLoungeNotificationsUnread(Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)
  }, [])

  const onLoungeOpenPostFromNotifications = useCallback(
    async ({ postId, commentId, focusComposer = false }) => {
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
      if (postRow?.is_plain_repost) {
        const originalId = String(postRow.reposted_post?.id ?? postRow.repost_of_post_id ?? '').trim()
        if (!originalId) return
        if (String(originalId) !== String(postRow.id)) {
          let originalPost = communityPosts.find((p) => p.id === originalId)
          if (!originalPost) {
            const { data, error } = await supabaseClient
              .from('community_feed_posts')
              .select(LOUNGE_SINGLE_POST_SELECT)
              .eq('id', originalId)
              .is('hidden_at', null)
              .maybeSingle()
            if (error || !data) return
            const hydrated = await hydrateCommunityPosts([data])
            originalPost = hydrated?.[0] || null
            if (originalPost) {
              setCommunityPosts((prev) => (prev.some((p) => p.id === originalPost.id) ? prev : [originalPost, ...prev]))
            }
          }
          if (!originalPost) return
          postRow = originalPost
        }
      }
      if (!postRow) return
      pushLoungeNavReturnContextRef.current()
      if (commentId) {
        await openDirectCommentPostDetail(postRow, commentId, { focusComposer })
      } else {
        openLoungePostDetail(
          postRow,
          focusComposer ? { focusCommentComposer: true, skipNavCapture: true } : { skipNavCapture: true },
        )
      }
    },
    [
      communityPosts,
      hydrateCommunityPosts,
      openDirectCommentPostDetail,
      openLoungePostDetail,
      setCommunityPosts,
      supabaseClient,
    ],
  )
  const onLoungeDockChat = useCallback(() => {
    // Optimistically clear badge when user navigates to chat
    setChatUnreadRoomCount(0)
    // Re-check after a delay so any unread rooms the user didn't visit remain
    setTimeout(() => void refreshChatUnreadRoomCount(), 3000)

    dismissLoungeStackForDockNavRef.current()
    if (typeof onOpenChatRoomFromDock === 'function') {
      // Navigate straight to the full Chat tab (no pre-selected room)
      onOpenChatRoomFromDock(null)
    } else {
      // Fallback: open dock chat panel (no Chat tab available)
      ensureLoungeFeedVisible()
      setLoungeDockPanel((p) => {
        if (p === 'chat') {
          setChatDockInitialPeerUserId(null)
          return null
        }
        return 'chat'
      })
    }
  }, [onOpenChatRoomFromDock, ensureLoungeFeedVisible, refreshChatUnreadRoomCount])

  const onLoungeDockSettings = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    ensureLoungeFeedVisible()
    dismissLoungeStackForDockNavRef.current()
    setLoungeDockPanel((p) => (p === 'settings' ? null : 'settings'))
  }, [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth, ensureLoungeFeedVisible])

  const onLoungeOpenSettingsSection = useCallback(
    (section) => {
      if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
        onRequireAuth?.()
        return
      }
      ensureLoungeFeedVisible()
      dismissLoungeStackForDockNavRef.current()
      setLoungeSettingsFocusSection(section)
      setLoungeDockPanel('settings')
    },
    [loungeFeedBrowseMode, loungeReadOnly, onRequireAuth, ensureLoungeFeedVisible],
  )

  const onLoungeSettingsFocusSectionHandled = useCallback(() => {
    setLoungeSettingsFocusSection(null)
  }, [])

  const onLoungeDockCompose = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
      onRequireAuth?.()
      return
    }
    ensureLoungeFeedVisible()
    /** Dismiss z-stacked chrome synchronously so the caption is focusable in the same user gesture (iOS keyboard). */
    dismissLoungeStackForDockNavRef.current()

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
    focusLoungeComposerCaption(() => composerFieldRef.current, {
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
    scheduleLoungeComposerTextareaFocus({
      getTextarea: () => composerFieldRef.current,
      scrollFeedToTop: scrollLoungeFeedToTopInstant,
    })
  }, [
    loungeFeedBrowseMode,
    loungeReadOnly,
    onRequireAuth,
    ensureLoungeFeedVisible,
    scrollLoungeFeedToTopInstant,
  ])

  const loungeFollowingFilterOn = loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING

  const feedPostRowPerfStyle = useMemo(() => loungeFeedPostRowPerfStyle(), [])

  const onLoungeFollowingFilterToggle = useCallback(() => {
    if (loungeFeedBrowseMode === 'anonymous') {
      onRequireAuth?.()
      return
    }
    ensureLoungeFeedVisible()
    dismissLoungeStackForDockNavRef.current()
    const next =
      loungeFeedScope === LOUNGE_FEED_SCOPE_FOLLOWING ? LOUNGE_FEED_SCOPE_ALL : LOUNGE_FEED_SCOPE_FOLLOWING
    onLoungeFeedScopeChange?.(next)
  }, [loungeFeedBrowseMode, loungeFeedScope, onLoungeFeedScopeChange, onRequireAuth, ensureLoungeFeedVisible])

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
      closeProfileModalRef.current()
      // If AppShell provides a top-level chat tab handler, prefer it; otherwise fall back to dock panel.
      if (typeof onOpenChatWithUser === 'function') {
        onOpenChatWithUser(peerUserId)
      } else {
        setChatDockInitialPeerUserId(peerUserId)
        setLoungeDockPanel('chat')
      }
    },
    [composerUserId, loungeReadOnly, openProfileGateIfNeeded, requireLoungeAuth, onOpenChatWithUser]
  )

  const onLoungeDockOpenPostFromSearch = useCallback(
    (post) => {
      if (!post?.id) return
      pushLoungeNavReturnContextRef.current()
      openLoungePostDetail(post, { skipNavCapture: true })
    },
    [openLoungePostDetail],
  )

  useEffect(() => {
    if (
      loungePostDetail &&
      loungeDockPanel &&
      loungeDockPanel !== 'search' &&
      loungeDockPanel !== 'notifications'
    ) {
      setChatDockInitialPeerUserId(null)
      setLoungeDockPanel(null)
    }
  }, [loungePostDetail, loungeDockPanel])

  useEffect(() => {
    const prevId = loungePostDetailIdForNotifRefreshRef.current
    const nextId = loungePostDetail?.id ?? null
    loungePostDetailIdForNotifRefreshRef.current = nextId
    if (prevId && !nextId && loungeDockPanel === 'notifications') {
      setNotificationInteractionCountsRefreshKey((k) => k + 1)
    }
  }, [loungePostDetail?.id, loungeDockPanel])

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

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const run = () => {
      const params = new URLSearchParams(window.location.search || '')
      const loungePanel = (params.get('lounge') || '').trim().toLowerCase()
      if (loungePanel !== 'notifications') return
      if (!authSessionReady || !composerAuthResolved) return
      if (loungeFeedBrowseMode === 'anonymous') {
        onRequireAuth?.()
        stripLoungeDockQueryParam()
        return
      }
      window.requestAnimationFrame(() => {
        if (cancelled) return
        setLoungeDockPanel('notifications')
        stripLoungeDockQueryParam()
      })
    }
    run()
    const onPop = () => run()
    window.addEventListener('popstate', onPop)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', onPop)
    }
  }, [authSessionReady, composerAuthResolved, loungeFeedBrowseMode, onRequireAuth])

  const loungePostDetailOpenedOverSearch = Boolean(
    loungePostDetail?.id &&
      (loungeDockPanel === 'search' || loungeDockPanel === 'notifications') &&
      !loungePostDetailAboveProfile,
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

  const loungeProfileScreenOpen = profileModalOpen || profileOverlayStack.length > 0
  const loungeQuoteRepostShellZClass = loungePostDetailAboveProfile
    ? 'z-[107]'
    : loungeProfileScreenOpen
      ? 'z-[111]'
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
    const preserveMedia =
      loungeDetailEditBackgroundUploadInFlight() || loungeDetailEditSnapshotRef.current != null
    if (!preserveMedia) {
      cancelLoungeDetailEditMediaPrep()
      setLoungeDetailEditImageItems((prev) => {
        for (const it of prev) {
          try {
            URL.revokeObjectURL(it.preview)
          } catch {
            // ignore
          }
        }
        return []
      })
      setLoungeDetailEditMediaUrl('')
      setLoungeDetailEditKeepStreamUid(null)
    }
    setLoungeDetailEditing(false)
    setLoungeDetailDraftCaption('')
    setLoungeDetailEditErr('')
    setLoungeDetailEditImageUrls([])
    setLoungeDetailEditCategoryPills([])
    if (!preserveMedia) {
      try {
        clearHiddenFileInputs(loungeDetailEditImageInputRef.current, loungeDetailEditVideoInputRef.current)
      } catch {
        // ignore
      }
    }
  }, [cancelLoungeDetailEditMediaPrep, loungeDetailEditBackgroundUploadInFlight])

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

  const loungeDetailDescendantCountByCommentId = useMemo(
    () => feedCommentDescendantCountById(loungeDetailComments),
    [loungeDetailComments],
  )

  const loungeDetailThreadPartsSorted = useMemo(
    () =>
      loungeCommentDetailPathIds.length === 0
        ? feedThreadPartsFromComments(loungeDetailComments, loungeDetailViewerPinnedCommentIds)
        : [],
    [loungeCommentDetailPathIds.length, loungeDetailComments, loungeDetailViewerPinnedCommentIds],
  )

  const loungePostDetailConnectorActive =
    loungeCommentDetailPathIds.length > 0 ||
    (loungePostIsThreadRoot(loungePostDetail) && loungeDetailThreadPartsSorted.length > 0)

  const loungeDetailCommentHierarchyFocusId = useMemo(
    () =>
      loungeCommentDetailPathIds.length > 0
        ? loungeCommentDetailPathIds[loungeCommentDetailPathIds.length - 1]
        : null,
    [loungeCommentDetailPathIds],
  )

  const loungeDetailCommentEditHasMedia = useMemo(
    () =>
      loungeDetailCommentEditImageUrls.length > 0 ||
      loungeDetailCommentEditImageItems.length > 0 ||
      String(loungeDetailCommentEditMediaUrl || '').trim().length > 0 ||
      Boolean(loungeDetailCommentEditVideoSlot) ||
      Boolean(loungeDetailCommentEditKeepStreamUid),
    [
      loungeDetailCommentEditImageItems,
      loungeDetailCommentEditImageUrls,
      loungeDetailCommentEditKeepStreamUid,
      loungeDetailCommentEditMediaUrl,
      loungeDetailCommentEditVideoSlot,
    ],
  )

  const saveLoungeDetailCaption = useCallback(async () => {
    if (!loungePostDetail?.id || !composerUserId) return
    const cap = normalizeFeedCaption(loungeDetailDraftCaption)
    setLoungeDetailEditErr('')
    const gifCheck = validateAtMostOneGifUrl(loungeDetailEditMediaUrl)
    if (!gifCheck.ok) {
      setLoungeDetailEditErr(gifCheck.message)
      return
    }
    const gifOnlyUrl = gifCheck.value
    const slotNow = loungeDetailEditVideoSlotRef.current
    const keepStream = String(loungeDetailEditKeepStreamUid || '').trim() || null
    const hasNewVideo = slotNow != null
    const hasVideo = hasNewVideo || Boolean(keepStream)
    const hasImages = loungeDetailEditImageItems.length > 0 || loungeDetailEditImageUrls.length > 0
    const hasMedia = hasImages || Boolean(gifOnlyUrl) || hasVideo
    const hasMarket =
      loungeDetailEditMarketSymbols.length > 0 ||
      extractCashtagsFromCaption(cap).length > 0
    if (!cap && !hasMedia && !hasMarket) {
      setLoungeDetailEditErr('Write a caption or attach media before saving.')
      return
    }
    if (loungeDetailEditVideoPostBlocked) return
    if (hasVideo && gifOnlyUrl) {
      setLoungeDetailEditErr('Remove the GIF before posting a video.')
      return
    }
    if (hasNewVideo && slotNow?.file && slotNow.file.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
      setLoungeDetailEditErr('Video must be 200 MB or smaller for upload.')
      return
    }
    if (hasNewVideo && slotNow?.prepStatus === 'failed') {
      setLoungeDetailEditErr(slotNow.prepError || 'Video processing failed. Remove the video or try again.')
      return
    }

    const previousStreamUid = feedPostStreamVideoUid(loungePostDetail) || null
    const uid = hasNewVideo ? String(slotNow?.streamVideoUid || '').trim() || null : keepStream
    const clearStream = Boolean(previousStreamUid && !keepStream && !hasNewVideo)
    const awaiting =
      hasNewVideo && !uid && slotNow?.prepStatus === 'preparing' && typeof slotNow?.prepJobId === 'number'
        ? slotNow.prepJobId
        : null
    const specForSnap =
      hasNewVideo && !uid && loungeDetailEditVideoPrepSpecRef.current
        ? loungeDetailEditVideoPrepSpecRef.current
        : null
    const sessionPosterBlob =
      hasNewVideo && slotNow?.posterUrl && String(slotNow.posterUrl).startsWith('blob:')
        ? String(slotNow.posterUrl)
        : null

    const snapshot = {
      postId: loungePostDetail.id,
      caption: cap,
      categoryPills: loungeDetailEditCategoryPills,
      remoteImageUrls: loungeDetailEditImageUrls,
      gifOnlyUrl,
      imageFiles: loungeDetailEditImageItems.map((it) => it.file),
      videoFile: hasNewVideo && slotNow?.file ? slotNow.file : null,
      streamVideoUid: uid,
      sessionStreamPosterBlobUrl: sessionPosterBlob,
      previousStreamUid,
      clearStream,
      awaitingDetailEditVideoPrepJobId: awaiting,
      videoPrepSpec: specForSnap,
      _capturedPrepHandoff: loungeDetailEditVideoPrepHandoffRef.current ?? null,
      marketSymbols: loungeDetailEditMarketSymbols,
    }

    const preserveVideoPrep = snapshot.awaitingDetailEditVideoPrepJobId != null
    if (shouldAssignLoungePostSnapshotRef()) {
      loungeDetailEditSnapshotRef.current = snapshot
    }
    const editPosterBlob =
      typeof snapshot.sessionStreamPosterBlobUrl === 'string'
        ? snapshot.sessionStreamPosterBlobUrl.trim()
        : ''
    const editPostUid = String(snapshot.streamVideoUid || '').trim()
    if (editPostUid && editPosterBlob.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(editPostUid, editPosterBlob)
    }
    if (loungePostEditSnapshotShowsFeedCardSpinner(snapshot)) {
      setLoungeFeedPostEditPendingPostId(loungePostDetail.id)
    }
    clearLoungeDetailEditForPostAttempt({
      preserveDetailEditVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    enqueueAndRunLoungeSubmitRef.current('postEdit', snapshot)
    setLoungeDetailEditing(false)
    closeLoungePostDetail()
  }, [
    clearLoungeDetailEditForPostAttempt,
    closeLoungePostDetail,
    composerUserId,
    loungeDetailDraftCaption,
    loungeDetailEditCategoryPills,
    loungeDetailEditImageItems,
    loungeDetailEditImageUrls,
    loungeDetailEditKeepStreamUid,
    loungeDetailEditMarketSymbols,
    loungeDetailEditMediaUrl,
    loungeDetailEditVideoPostBlocked,
    loungePostDetail,
    shouldAssignLoungePostSnapshotRef,
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
    if (typeof window !== 'undefined') {
      const ok = window.confirm('Delete this post? This cannot be undone.')
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
          .select('user_id,handle,display_name,avatar_url,bio,about_me,banner_url,location,category_pills,created_at,role,handle_changed_at,is_og')
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
    if (loungeWelcomeScheduleRef.current || loungeWelcomeOpen) return
    if (!isActivePage) return
    if (loungeFeedBrowseMode !== 'member' || !composerUserId) return
    if (!authSessionReady || !composerAuthResolved) return
    if (coldBootSplashVisible) return
    if (readLoungeWelcomeAck(composerUserId)) return

    const timer = window.setTimeout(() => {
      if (readLoungeWelcomeAck(composerUserId)) return
      loungeWelcomeScheduleRef.current = true
      setLoungeWelcomeOpen(true)
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    isActivePage,
    loungeFeedBrowseMode,
    composerUserId,
    authSessionReady,
    composerAuthResolved,
    coldBootSplashVisible,
    loungeWelcomeOpen,
  ])

  const onLoungeWelcomeAcknowledge = useCallback(() => {
    if (composerUserId) writeLoungeWelcomeAck(composerUserId)
    setLoungeWelcomeOpen(false)
  }, [composerUserId])

  const onSlotsMenuHintDismiss = useCallback(() => {
    if (composerUserId) writeLoungeSlotsMenuHintAck(composerUserId)
    setSlotsMenuHintOpen(false)
  }, [composerUserId])

  useEffect(() => {
    if (!composerUserId) {
      setSlotsMenuHintOpen(false)
      return undefined
    }
    if (!readLoungeWelcomeAck(composerUserId)) return undefined
    if (readLoungeSlotsMenuHintAck(composerUserId)) return undefined
    if (slotsMenuHintOpen || loungeWelcomeOpen || profileGateOpen) return undefined
    if (!isActivePage) return undefined
    if (loungeFeedBrowseMode !== 'member' || !authSessionReady || !composerAuthResolved) return undefined
    if (coldBootSplashVisible) return undefined

    const timer = window.setTimeout(() => {
      if (readLoungeSlotsMenuHintAck(composerUserId)) return
      if (loungeWelcomeOpen || profileGateOpen) return
      setSlotsMenuHintOpen(true)
    }, 400)

    return () => window.clearTimeout(timer)
  }, [
    composerUserId,
    slotsMenuHintOpen,
    loungeWelcomeOpen,
    profileGateOpen,
    isActivePage,
    loungeFeedBrowseMode,
    authSessionReady,
    composerAuthResolved,
    coldBootSplashVisible,
  ])

  const onOpenGuidelinesFromWelcome = useCallback(() => {
    setLoungeWelcomeOpen(false)
    onOpenLegalDocument?.('guidelines', 'welcome')
  }, [onOpenLegalDocument])

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

  const refreshCommunityFeed = useCallback(async () => {
    await loadCommunityFeed({ silent: true })
  }, [loadCommunityFeed])

  useLoungePullToRefresh({
    scrollRootRef: loungeFeedScrollRef,
    pullZoneRef: pullRefreshZoneRef,
    pullPostsWrapRef,
    pullIndicatorOverlayRef,
    pullIndicatorWrapRef,
    pullArrowRef,
    pullSpinnerRef,
    pullAriaRef,
    onRefresh: refreshCommunityFeed,
    enabled: true,
    pullRefreshing,
    setPullRefreshing,
  })

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

  const registerThreadComposePartRef = useCallback((idx, el) => {
    if (el) threadComposePartRefMap.current[idx] = el
    else delete threadComposePartRefMap.current[idx]
    if (idx === 0) threadComposeFieldRef.current = el
  }, [])

  const getThreadComposePartRef = useCallback((idx) => threadComposePartRefMap.current[idx], [])

  useEffect(() => {
    setThreadComposePartMedia((prev) => {
      const n = threadComposeCaptions.length
      if (prev.length === n) return prev
      if (prev.length < n) {
        return [
          ...prev,
          ...Array.from({ length: n - prev.length }, () => emptyThreadComposePartMedia()),
        ]
      }
      for (let i = n; i < prev.length; i += 1) revokeThreadComposePartMediaFull(prev[i])
      return prev.slice(0, n)
    })
  }, [threadComposeCaptions.length])

  const focusThreadComposePart = useCallback((index) => {
    setThreadComposeFocusPartIndex(index)
  }, [])

  const appendThreadComposePart = useCallback(() => {
    setThreadComposeCaptions((prev) => {
      if (prev.length >= LOUNGE_POST_THREAD_MAX_PARTS) return prev
      const nextIndex = prev.length
      window.setTimeout(() => {
        focusThreadComposePart(nextIndex)
        setThreadComposeActivePartIndex(nextIndex)
      }, 80)
      return [...prev, '']
    })
    setThreadComposePartMedia((prev) => [...prev, emptyThreadComposePartMedia()])
  }, [focusThreadComposePart])

  const handleComposerMediaInputChange = useCallback(
    (e, pickKind) => {
      const input = e.target
      let files = Array.from(input.files || [])
      if (!files.length) {
        endLoungeComposerMediaPicker('composer')
        restoreLoungeComposerCaptionAfterMediaPick('composer')
        return
      }
      setPostErr('')
      setThreadComposeErr('')

      if (pickKind === 'video') {
        files = files.filter(isProbablyVideoFile).slice(0, 1)
        if (!files.length) {
          const msg = 'Unsupported media type. Please choose a video file.'
          setPostErr(msg)
          setThreadComposeErr(msg)
          endLoungeComposerMediaPicker('composer')
          try {
            input.value = ''
          } catch {
            // ignore
          }
          restoreLoungeComposerCaptionAfterMediaPick('composer')
          return
        }
      } else {
        files = files.filter(isProbablyImageFile)
        if (!files.length) {
          const msg = 'Unsupported media type. Please choose an image file.'
          setPostErr(msg)
          setThreadComposeErr(msg)
          endLoungeComposerMediaPicker('composer')
          try {
            input.value = ''
          } catch {
            // ignore
          }
          restoreLoungeComposerCaptionAfterMediaPick('composer')
          return
        }
      }

      const isVideoPick = pickKind === 'video'
      if (threadComposeOpenRef.current) {
        const activeIdx = threadComposeActivePartIndexRef.current
        if (isVideoPick) {
          const vf = files[0]
          cancelThreadComposePartVideo(activeIdx)
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
        cancelComposerMediaPrep()
        if (threadComposePartMediaRef.current[activeIdx]?.videoSlot) {
          cancelThreadComposePartVideo(activeIdx)
        }
        const prevImgs = threadComposePartMediaRef.current[activeIdx]?.imageItems || []
        const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
        try {
          input.value = ''
        } catch {
          // ignore
        }
        endLoungeComposerMediaPicker('composer')
        restoreLoungeComposerCaptionAfterMediaPick('composer', () => {
          removeThreadPartDraftMediaMarkers(
            activeIdx,
            files.map((f) => String(f.name || '').trim()).filter(Boolean),
          )
          setThreadComposePartMedia((prev) =>
            prev.map((row, j) => (j === activeIdx ? { ...row, imageItems: next } : row)),
          )
          if (limitDialog) setLoungeImageLimitDialog(limitDialog)
        })
        return
      }
      if (isVideoPick) {
        const vf = files[0]
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
    },
    [
      cancelComposerMediaPrep,
      cancelThreadComposePartVideo,
      endLoungeComposerMediaPicker,
      queueLoungeVideoOrCrop,
      removeThreadPartDraftMediaMarkers,
      restoreLoungeComposerCaptionAfterMediaPick,
      setLoungeImageLimitDialog,
    ],
  )

  const handleComposerImageInputChange = useCallback(
    (e) => handleComposerMediaInputChange(e, 'image'),
    [handleComposerMediaInputChange],
  )

  const handleComposerVideoInputChange = useCallback(
    (e) => handleComposerMediaInputChange(e, 'video'),
    [handleComposerMediaInputChange],
  )

  const handleDetailCommentEditMediaInputChange = useCallback(
    (e, pickKind) => {
      const input = e.target
      const files = loungeFilteredMediaFiles(pickKind, input.files)
      if (!Array.from(input.files || []).length) {
        endLoungeComposerMediaPicker('detailCommentEdit')
        restoreLoungeComposerCaptionAfterMediaPick('detailCommentEdit')
        return
      }
      setLoungeDetailCommentErr('')
      if (!files.length) {
        setLoungeDetailCommentErr(loungeMediaPickErrorMessage(pickKind))
        endLoungeComposerMediaPicker('detailCommentEdit')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        restoreLoungeComposerCaptionAfterMediaPick('detailCommentEdit')
        return
      }
      if (pickKind === 'video') {
        const vf = files[0]
        setLoungeDetailCommentEditImageItems((prev) => {
          for (const it of prev) {
            try {
              URL.revokeObjectURL(it.preview)
            } catch {
              // ignore
            }
          }
          return []
        })
        cancelLoungeDetailCommentEditMediaPrep()
        setLoungeDetailCommentEditKeepStreamUid(null)
        setLoungeDetailCommentEditMediaUrl('')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        endLoungeComposerMediaPicker('detailCommentEdit')
        restoreLoungeComposerCaptionAfterMediaPick('detailCommentEdit')
        void queueLoungeVideoOrCrop(vf, 'detailCommentEdit')
        return
      }
      cancelLoungeDetailCommentEditMediaPrep()
      setLoungeDetailCommentEditKeepStreamUid(null)
      const prevImgs = loungeDetailCommentEditImageItemsRef.current
      const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
      loungeDetailCommentEditImageItemsRef.current = next
      try {
        input.value = ''
      } catch {
        // ignore
      }
      endLoungeComposerMediaPicker('detailCommentEdit')
      restoreLoungeComposerCaptionAfterMediaPick('detailCommentEdit', () => {
        setLoungeDetailCommentEditImageItems(next)
        if (limitDialog) setLoungeImageLimitDialog(limitDialog)
      })
    },
    [
      cancelLoungeDetailCommentEditMediaPrep,
      endLoungeComposerMediaPicker,
      queueLoungeVideoOrCrop,
      restoreLoungeComposerCaptionAfterMediaPick,
      setLoungeImageLimitDialog,
    ],
  )

  const loungeDetailCommentEditMediaSlot = useMemo(() => {
    if (!loungeDetailCommentEditingId) return null
    const editingRow = loungeDetailComments.find((r) => r.id === loungeDetailCommentEditingId)
    const gifUrl = String(loungeDetailCommentEditMediaUrl || '').trim()
    const localPreviews = loungeDetailCommentEditImageItems.map((x) => x.preview)
    const remoteUrls = loungeDetailCommentEditImageUrls
    const carouselUrls = gifUrl ? [...remoteUrls, ...localPreviews, gifUrl] : [...remoteUrls, ...localPreviews]
    const nRemote = remoteUrls.length
    const nLocal = localPreviews.length
    return (
      <>
        <input
          id={LOUNGE_COMMENT_EDIT_IMAGE_INPUT_ID}
          ref={loungeDetailCommentEditImageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          {...loungeFileInputMediaPickerHandlers('detailCommentEdit')}
          onChange={(e) => handleDetailCommentEditMediaInputChange(e, 'image')}
        />
        <input
          id={LOUNGE_COMMENT_EDIT_VIDEO_INPUT_ID}
          ref={loungeDetailCommentEditVideoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          {...loungeFileInputMediaPickerHandlers('detailCommentEdit')}
          onChange={(e) => handleDetailCommentEditMediaInputChange(e, 'video')}
        />
        {carouselUrls.length > 0 ? (
          <LoungeImageCarousel
            urls={carouselUrls}
            variant="composer"
            firstMarginTopClass="mt-1.5"
            regionAriaLabel={gifUrl ? 'Reply images and GIF' : 'Reply images'}
            removeLabelForIndex={(i) => {
              if (i < nRemote) return 'Remove image'
              if (i < nRemote + nLocal) return 'Remove image'
              return 'Remove GIF'
            }}
            onRemoveIndex={(i) => {
              if (i < nRemote) {
                setLoungeDetailCommentEditImageUrls((prev) => prev.filter((_, j) => j !== i))
              } else if (i < nRemote + nLocal) {
                setLoungeDetailCommentEditImageItems((prev) => {
                  const row = prev[i - nRemote]
                  if (row?.preview) {
                    try {
                      URL.revokeObjectURL(row.preview)
                    } catch {
                      // ignore
                    }
                  }
                  return prev.filter((_, j) => j !== i - nRemote)
                })
              } else {
                setLoungeDetailCommentEditMediaUrl('')
              }
            }}
          />
        ) : null}
        {loungeDetailCommentEditKeepStreamUid && !loungeDetailCommentEditVideoSlot ? (
          <div className="relative mt-1.5 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
            {editingRow?.stream_poster_url ? (
              <img
                src={editingRow.stream_poster_url}
                alt=""
                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
              />
            ) : null}
            <button
              type="button"
              onClick={() => setLoungeDetailCommentEditKeepStreamUid(null)}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
              aria-label="Remove video"
              title="Remove video"
            >
              ×
            </button>
          </div>
        ) : null}
        {loungeDetailCommentEditVideoSlot ? (
          <div className="relative mt-1.5 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
            {!loungeDetailCommentEditVideoSlot.file && loungeDetailCommentEditVideoSlot.preview ? (
              <img
                src={loungeDetailCommentEditVideoSlot.preview}
                alt=""
                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
              />
            ) : loungeDetailCommentEditVideoSlot.preview ? (
              <video
                src={loungeDetailCommentEditVideoSlot.preview}
                poster={loungeDetailCommentEditVideoSlot.posterUrl || undefined}
                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                controls
                playsInline
                preload="metadata"
                aria-label="Video preview"
              />
            ) : null}
            <button
              type="button"
              onClick={() => cancelLoungeDetailCommentEditMediaPrep()}
              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
              aria-label="Remove video"
              title="Remove video"
            >
              ×
            </button>
          </div>
        ) : null}
        <div className="lounge-media-toolbar mt-1 flex w-full items-center gap-1.5">
          <LoungeComposerMediaToolbar
            variant="compact"
            imageInputId={LOUNGE_COMMENT_EDIT_IMAGE_INPUT_ID}
            videoInputId={LOUNGE_COMMENT_EDIT_VIDEO_INPUT_ID}
            onImagePointerDown={() => beginLoungeComposerMediaPicker('detailCommentEdit')}
            onVideoPointerDown={() => beginLoungeComposerMediaPicker('detailCommentEdit')}
            onOpenGifPicker={() => openKlipyPicker('detailCommentEdit')}
          />
        </div>
      </>
    )
  }, [
    beginLoungeComposerMediaPicker,
    cancelLoungeDetailCommentEditMediaPrep,
    handleDetailCommentEditMediaInputChange,
    loungeDetailCommentEditImageItems,
    loungeDetailCommentEditImageUrls,
    loungeDetailCommentEditKeepStreamUid,
    loungeDetailCommentEditMediaUrl,
    loungeDetailCommentEditVideoSlot,
    loungeDetailCommentEditingId,
    loungeDetailComments,
    loungeFileInputMediaPickerHandlers,
    openKlipyPicker,
  ])

  const handleDetailEditMediaInputChange = useCallback(
    (e, pickKind) => {
      const input = e.target
      const files = loungeFilteredMediaFiles(pickKind, input.files)
      if (!Array.from(input.files || []).length) {
        endLoungeComposerMediaPicker('detailEdit')
        restoreLoungeComposerCaptionAfterMediaPick('detailEdit')
        return
      }
      setLoungeDetailEditErr('')
      if (!files.length) {
        setLoungeDetailEditErr(loungeMediaPickErrorMessage(pickKind))
        endLoungeComposerMediaPicker('detailEdit')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        restoreLoungeComposerCaptionAfterMediaPick('detailEdit')
        return
      }
      if (pickKind === 'video') {
        const vf = files[0]
        setLoungeDetailEditImageItems((prev) => {
          for (const it of prev) {
            try {
              URL.revokeObjectURL(it.preview)
            } catch {
              // ignore
            }
          }
          return []
        })
        cancelLoungeDetailEditMediaPrep()
        setLoungeDetailEditKeepStreamUid(null)
        setLoungeDetailEditMediaUrl('')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        endLoungeComposerMediaPicker('detailEdit')
        restoreLoungeComposerCaptionAfterMediaPick('detailEdit')
        void queueLoungeVideoOrCrop(vf, 'detailEdit')
        return
      }
      cancelLoungeDetailEditMediaPrep()
      setLoungeDetailEditKeepStreamUid(null)
      const prevImgs = loungeDetailEditImageItemsRef.current
      const { next, limitDialog } = mergeLoungePickedImageItems(prevImgs, files, newComposerImageId)
      loungeDetailEditImageItemsRef.current = next
      try {
        input.value = ''
      } catch {
        // ignore
      }
      endLoungeComposerMediaPicker('detailEdit')
      restoreLoungeComposerCaptionAfterMediaPick('detailEdit', () => {
        setLoungeDetailEditImageItems(next)
        if (limitDialog) setLoungeImageLimitDialog(limitDialog)
      })
    },
    [
      cancelLoungeDetailEditMediaPrep,
      endLoungeComposerMediaPicker,
      queueLoungeVideoOrCrop,
      restoreLoungeComposerCaptionAfterMediaPick,
      setLoungeImageLimitDialog,
    ],
  )

  const handleDetailCommentMediaInputChange = useCallback(
    (e, pickKind) => {
      const input = e.target
      const files = loungeFilteredMediaFiles(pickKind, input.files)
      if (!Array.from(input.files || []).length) {
        endLoungeComposerMediaPicker('detailComment')
        restoreLoungeComposerCaptionAfterMediaPick('detailComment')
        return
      }
      setLoungeDetailCommentErr('')
      if (!files.length) {
        setLoungeDetailCommentErr(loungeMediaPickErrorMessage(pickKind))
        endLoungeComposerMediaPicker('detailComment')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        restoreLoungeComposerCaptionAfterMediaPick('detailComment')
        return
      }
      if (pickKind === 'video') {
        const vf = files[0]
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
    },
    [
      cancelLoungeDetailCommentMediaPrep,
      endLoungeComposerMediaPicker,
      queueLoungeVideoOrCrop,
      restoreLoungeComposerCaptionAfterMediaPick,
      setLoungeImageLimitDialog,
    ],
  )

  const handleQuoteRepostMediaInputChange = useCallback(
    (e, pickKind) => {
      const input = e.target
      const files = loungeFilteredMediaFiles(pickKind, input.files)
      if (!Array.from(input.files || []).length) {
        endLoungeComposerMediaPicker('quote')
        restoreLoungeComposerCaptionAfterMediaPick('quote')
        return
      }
      setQuoteRepostErr('')
      if (!files.length) {
        setQuoteRepostErr(loungeMediaPickErrorMessage(pickKind))
        endLoungeComposerMediaPicker('quote')
        try {
          input.value = ''
        } catch {
          // ignore
        }
        restoreLoungeComposerCaptionAfterMediaPick('quote')
        return
      }
      if (pickKind === 'video') {
        const vf = files[0]
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
    },
    [
      cancelQuoteRepostMediaPrep,
      endLoungeComposerMediaPicker,
      queueLoungeVideoOrCrop,
      restoreLoungeComposerCaptionAfterMediaPick,
      setLoungeImageLimitDialog,
    ],
  )

  const clearComposerMediaInputs = useCallback(() => {
    for (const el of [composerImageInputRef.current, composerVideoInputRef.current]) {
      try {
        if (el) el.value = ''
      } catch {
        // ignore
      }
    }
  }, [])

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
    setComposerMarketSymbols([])
    composerFoldedFromFeedScrollRef.current = false
    composerFoldRevealRef.current = 0
    setComposerFoldReveal(0)
    composerExpandedRef.current = false
    setComposerExpanded(false)
    clearLoungeComposerDraft()
    try {
      clearComposerMediaInputs()
    } catch {
      // ignore
    }

    const postUid = snap && String(snap.streamVideoUid || '').trim()
    if (postUid && pendingPoster.startsWith('blob:')) {
      pinLoungeStreamSessionPoster(postUid, pendingPoster)
    }
  }, [])

  const restoreComposerFromSnapshot = useCallback(
    (snap, opts = {}) => {
      if (!snap) return
      const fromPartIndex = Math.max(0, Number(opts.fromPartIndex) || 0)
      const snapThread =
        Array.isArray(snap.threadParts) && snap.threadParts.length > 0
          ? snap.threadParts.slice(fromPartIndex).map((p) => String(p?.body ?? ''))
          : Array.isArray(snap.threadCaptions)
            ? snap.threadCaptions.slice(fromPartIndex)
            : []
      const snapThreadParts =
        Array.isArray(snap.threadParts) && snap.threadParts.length > 0
          ? snap.threadParts.slice(fromPartIndex)
          : null
      const partsNeedingPrep = /** @type {Array<{ partIdx: number, spec: object, slot: object }>} */ ([])

      if (snapThread.length > 1) {
        setThreadComposeCaptions(snapThread)
        if (snapThreadParts && snapThreadParts.length > 1) {
          setThreadComposePartMedia(
            snapThreadParts.map((p, i) => {
              const videoSlot = threadPartVideoSlotFromSnapshot(p)
              if (videoSlot && p?.videoPrepSpec && !String(p?.streamVideoUid ?? '').trim()) {
                partsNeedingPrep.push({ partIdx: i, spec: p.videoPrepSpec, slot: videoSlot })
              }
              return {
                gifUrl: String(p?.gifUrl ?? '').trim(),
                videoSlot,
                videoPrepHud: null,
                imageItems: threadPartImageItemsFromSnapshot(p),
              }
            }),
          )
        } else {
          const rootPart = snapThreadParts?.[0]
          const rootVideoSlot = rootPart ? threadPartVideoSlotFromSnapshot(rootPart) : null
          if (rootVideoSlot && rootPart?.videoPrepSpec && !String(rootPart?.streamVideoUid ?? '').trim()) {
            partsNeedingPrep.push({ partIdx: 0, spec: rootPart.videoPrepSpec, slot: rootVideoSlot })
          }
          setThreadComposePartMedia([
            {
              gifUrl: rootPart
                ? String(rootPart.gifUrl ?? '').trim()
                : String(snap.gifOnlyUrl || '').trim(),
              videoSlot: rootVideoSlot,
              videoPrepHud: null,
              imageItems: rootPart
                ? threadPartImageItemsFromSnapshot(rootPart)
                : threadPartImageItemsFromSnapshot({
                    gifUrl: snap.gifOnlyUrl,
                    existingImageUrls: snap.existingImageUrls,
                    imageFiles: snap.imageFiles,
                  }),
            },
            ...snapThread.slice(1).map((_, i) => {
              const p = snapThreadParts?.[i + 1]
              if (!p) return emptyThreadComposePartMedia()
              const videoSlot = threadPartVideoSlotFromSnapshot(p)
              if (videoSlot && p?.videoPrepSpec && !String(p?.streamVideoUid ?? '').trim()) {
                partsNeedingPrep.push({ partIdx: i + 1, spec: p.videoPrepSpec, slot: videoSlot })
              }
              return {
                gifUrl: String(p?.gifUrl ?? '').trim(),
                videoSlot,
                videoPrepHud: null,
                imageItems: threadPartImageItemsFromSnapshot(p),
              }
            }),
          ])
        }
        setComposerImageItems([])
        setComposerMediaUrl('')
        setThreadComposeOpen(true)
        setThreadComposeErr('')
        setPostText('')
        setThreadComposeActivePartIndex(0)
        window.setTimeout(() => setThreadComposeFocusPartIndex(fromPartIndex > 0 ? 0 : 1), 120)
        if (snapThreadParts) {
          for (const p of snapThreadParts) {
            const partUid = String(p?.streamVideoUid ?? '').trim()
            const partPoster =
              typeof p?.sessionStreamPosterBlobUrl === 'string'
                ? p.sessionStreamPosterBlobUrl.trim()
                : ''
            if (partUid && partPoster.startsWith('blob:')) {
              pinLoungeStreamSessionPoster(partUid, partPoster)
            }
          }
        }
        if (partsNeedingPrep.length > 0) {
          window.setTimeout(() => {
            for (const { partIdx, spec, slot } of partsNeedingPrep) {
              startThreadComposePartVideoPrepFromSpec(partIdx, spec, slot)
            }
          }, 0)
        }
      } else if (fromPartIndex > 0 && snapThreadParts?.[0]) {
        const only = snapThreadParts[0]
        setPostText(String(only.body ?? ''))
        setComposerMediaUrl(String(only.gifUrl ?? '').trim())
        setComposerImageItems(threadPartImageItemsFromSnapshot(only).map((it) => ({
          ...it,
          id: newComposerImageId(),
        })))
        const uid = String(only.streamVideoUid ?? '').trim() || null
        if (uid && only.videoFile instanceof File) {
          setComposerVideoSlot({
            prepJobId: 0,
            file: only.videoFile,
            posterUrl: null,
            preview: URL.createObjectURL(only.videoFile),
            streamVideoUid: uid,
            prepStatus: 'ready',
            prepError: '',
          })
        } else if (only.videoPrepSpec) {
          if (only.videoPrepSpec.kind === 'direct') {
            const f = only.videoPrepSpec.file
            startComposerVideoPrepFromSpec(only.videoPrepSpec, {
              file: f,
              posterUrl: null,
              preview: URL.createObjectURL(f),
              streamVideoUid: null,
            })
          } else if (only.videoPrepSlotRestore) {
            startComposerVideoPrepFromSpec(only.videoPrepSpec, {
              file: null,
              posterUrl: only.videoPrepSlotRestore.posterUrl,
              preview: only.videoPrepSlotRestore.preview,
              streamVideoUid: null,
            })
          }
        } else if (only.videoFile instanceof File) {
          setComposerVideoSlot({
            prepJobId: 0,
            file: only.videoFile,
            posterUrl: null,
            preview: URL.createObjectURL(only.videoFile),
            streamVideoUid: null,
            prepStatus: 'ready',
            prepError: '',
          })
        }
      } else {
        setPostText(snap.caption)
        setComposerMediaUrl(String(snap.gifOnlyUrl || '').trim())
        setComposerImageItems(
          threadPartImageItemsFromSnapshot({
            existingImageUrls: snap.existingImageUrls,
            imageFiles: snap.imageFiles,
          }).map((it) => ({ ...it, id: newComposerImageId() })),
        )
      }
      if (snapThread.length <= 1 && !(fromPartIndex > 0 && snapThreadParts?.[0])) {
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
      }
      if (Array.isArray(snap.categoryPills)) {
        setComposerCategoryPills(snap.categoryPills)
      }
      if (snapThread.length > 1 || (fromPartIndex > 0 && snapThreadParts?.length)) {
        composerExpandedRef.current = false
        composerFoldRevealRef.current = 0
        setComposerFoldReveal(0)
        setComposerExpanded(false)
      } else if (!(fromPartIndex > 0 && snapThreadParts?.[0])) {
        setComposerExpanded(true)
        composerExpandedRef.current = true
        composerFoldRevealRef.current = 1
        setComposerFoldReveal(1)
        composerFoldedFromFeedScrollRef.current = false
      }
    },
    [startComposerVideoPrepFromSpec, startThreadComposePartVideoPrepFromSpec],
  )

  const restoreThreadAfterUploadFailure = useCallback(
    (snap) => {
      if (!snap) return null
      const retrySnap = sanitizeLoungeThreadSnapshotForVideoRetry(snap)
      restoreComposerFromSnapshot(retrySnap, { fromPartIndex: 0 })
      loungePostSnapshotRef.current = retrySnap
      return retrySnap
    },
    [restoreComposerFromSnapshot],
  )

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
          'Could not restore quote repost - the original post is not loaded. Return to the feed and try again.',
        )
        return
      }
      setQuoteRepostModal({ mode: 'compose', original: orig })
      setQuoteRepostDraft(String(snap.caption || ''))
      setQuoteRepostCategoryPills(Array.isArray(snap.categoryPills) ? snap.categoryPills : resolveQuoteRepostInitialCategoryPills(orig))
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
    setQuoteRepostCategoryPills([])
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
      clearHiddenFileInputs(quoteRepostImageInputRef.current, quoteRepostVideoInputRef.current)
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
    try {
      loungeDetailEditAbortRef.current?.abort()
    } catch {
      // ignore
    }
    loungePostAbortRef.current = null
    loungeDetailCommentAbortRef.current = null
    loungeDetailEditAbortRef.current = null
    loungePostJobRunningRef.current = false
    loungeDetailCommentJobRunningRef.current = false
    loungeDetailEditJobRunningRef.current = false
    loungePostUploadLastPhaseRef.current = ''
    setLoungeFeedPostEditPendingPostId(null)
    setLoungeDetailCommentEditPendingCommentId(null)
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
      const threadTotal = loungeSubmissionSnapshotThreadPartCount(snapshot)
      const showSubmitBar = submissionHasVideo || threadTotal > 1
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

      if (showSubmitBar) {
        setLoungePostUploadBar((prev) => {
          const threadFields =
            threadTotal > 1
              ? { threadPartTotal: threadTotal, threadPartPublished: 0 }
              : {}
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
              ...threadFields,
            }
          }
          return {
            mode: threadTotal > 1 || submissionHasVideo ? 'mediaPrep' : 'post',
            postSubmission: true,
            progress: 0,
            status: threadTotal > 1 ? 'Starting thread…' : 'Starting…',
            detail: '',
            ...threadFields,
          }
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
          onProgress: showSubmitBar
            ? (info) =>
                applyLoungePostSubmitUploadProgress(info, snap, {
                  ...(mediaUploadBarSkin || threadTotal > 1
                    ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId }
                    : { mode: 'post' }),
                })
            : undefined,
          rateLimitMessage,
          onUploadDiagnostic: showSubmitBar
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
        persistLoungeComposerLastCategoryPillsFromSubmit(snapshot)
        const publishedDraftId = String(
          snapshot.savedDraftId || loungeComposerActiveDraftIdRef.current || '',
        ).trim()
        if (publishedDraftId) {
          await deleteLoungePostDraft(supabaseClient, publishedDraftId, { retainStreamAssets: true })
          setLoungeComposerActiveDraftId(null)
          await refreshLoungeDraftCount()
        }
        await loadCommunityFeed()
        const quoteOrigPostId = String(snapshot.quoteRepostOfPostId || '').trim()
        const quoteOrigCommentId = String(snapshot.quoteRepostOfCommentId || '').trim()
        if (quoteOrigPostId) {
          await refreshLoungePostInteractions([quoteOrigPostId])
          bumpNotificationInteractionRefreshIfOpen()
        } else if (quoteOrigCommentId) {
          await hydrateCommentInteractionsForIds([quoteOrigCommentId])
          bumpNotificationInteractionRefreshIfOpen()
        }
      } catch (e) {
        if (e?.name === 'AbortError') return
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Unknown error'
        if (msg === LOUNGE_MAX_PINNED_ALERT && typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
        if (threadTotal > 1) {
          const retrySnap = restoreThreadAfterUploadFailure(snap)
          const detail = msg !== 'Unknown error' ? msg : ''
          setThreadComposeErr(
            detail
              ? `Could not post thread - ${detail} Your full thread is still here; fix or tap Post all again.`
              : 'Could not post thread - all parts are still here with your media. Tap Post all again or edit below.',
          )
          void persistThreadSubmissionSnapshotAsDraft(retrySnap || snap, { fromPartIndex: 0 }).then(
            ({ data }) => {
              if (data) void refreshLoungeDraftCount()
            },
          )
          setLoungePostUploadBar(null)
        } else {
          const failUid = String(snap.streamVideoUid || '').trim()
          const hadSessionPoster =
            typeof snap.sessionStreamPosterBlobUrl === 'string' &&
            snap.sessionStreamPosterBlobUrl.startsWith('blob:')
          if (failUid && hadSessionPoster) {
            releaseLoungeStreamSessionPoster(failUid)
          }
          loungePostSnapshotRef.current = snap
          setLoungePostUploadFailureDetails({
            kind: 'post',
            phase: loungePostUploadLastPhaseRef.current || '(no step recorded)',
            message: msg,
          })
          setLoungePostUploadFailedOpen(true)
        }
      } finally {
        loungePostAbortRef.current = null
        loungePostJobRunningRef.current = false
        bumpLoungeSubmitInFlight(-1)
        if (threadTotal > 1) setLoungePostUploadBar(null)
      }
    },
    [bumpNotificationInteractionRefreshIfOpen, loadCommunityFeed, rateLimitMessage, refreshLoungeDraftCount, refreshLoungePostInteractions, supabaseClient, bumpLoungeSubmitInFlight, applyLoungePostSubmitUploadProgress, persistThreadSubmissionSnapshotAsDraft, restoreThreadAfterUploadFailure],
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
        if (snap.parentId) {
          setInteractionByComment((prev) => {
            const key = String(snap.parentId)
            const cur = prev[key] || defaultInteraction
            return { ...prev, [key]: { ...cur, commented: true } }
          })
        }
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

  const patchLoungePostEditResult = useCallback(
    (data) => {
      if (!data?.id) return
      setLoungeFeedPostEditPendingPostId((prev) => (prev === data.id ? null : prev))
      setCommunityPosts((prev) =>
        prev.map((p) =>
          p.id === data.id
            ? {
                ...p,
                caption: data.caption,
                edited_at: data.edited_at,
                category_pills: data.category_pills,
                image_urls: data.image_urls,
                media_url: data.media_url,
                gif_url: data.gif_url,
                stream_video_uid: data.stream_video_uid,
                stream_poster_url: data.stream_poster_url,
                stream_video_width: data.stream_video_width,
                stream_video_height: data.stream_video_height,
                link_preview: data.link_preview,
                market_embeds: data.market_embeds,
              }
            : p,
        ),
      )
      setLoungePostDetail((prev) =>
        prev && prev.id === data.id
          ? {
              ...prev,
              caption: data.caption,
              edited_at: data.edited_at,
              category_pills: data.category_pills,
              image_urls: data.image_urls,
              media_url: data.media_url,
              gif_url: data.gif_url,
              stream_video_uid: data.stream_video_uid,
              stream_poster_url: data.stream_poster_url,
              stream_video_width: data.stream_video_width,
              stream_video_height: data.stream_video_height,
              link_preview: data.link_preview,
              market_embeds: data.market_embeds,
            }
          : prev,
      )
      setProfileModalPosts((prev) =>
        prev.map((p) =>
          p.id === data.id
            ? {
                ...p,
                caption: data.caption,
                edited_at: data.edited_at,
                category_pills: data.category_pills,
                image_urls: data.image_urls,
                media_url: data.media_url,
                gif_url: data.gif_url,
                stream_video_uid: data.stream_video_uid,
                stream_poster_url: data.stream_poster_url,
                stream_video_width: data.stream_video_width,
                stream_video_height: data.stream_video_height,
                link_preview: data.link_preview,
                market_embeds: data.market_embeds,
              }
            : p,
        ),
      )
    },
    [setCommunityPosts],
  )

  const patchLoungeCommentEditResult = useCallback((data) => {
    if (!data?.id) return
    setLoungeDetailCommentEditPendingCommentId((prev) => (prev === data.id ? null : prev))
    setLoungeDetailComments((prev) => prev.map((row) => (row.id === data.id ? { ...row, ...data } : row)))
  }, [])

  const runBackgroundLoungePostEditSubmission = useCallback(
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
        (snapshot.awaitingDetailEditVideoPrepJobId != null || Boolean(snapshot.videoPrepSpec))
      const prepHudId = snapshot.awaitingDetailEditVideoPrepJobId ?? 0

      loungeDetailEditSnapshotRef.current = snapshot
      loungeDetailEditJobRunningRef.current = true
      bumpLoungeSubmitInFlight(1)
      loungePostUploadLastPhaseRef.current = ''
      const ac = new AbortController()
      loungeDetailEditAbortRef.current = ac

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
              editSave: true,
            }
          }
          return { mode: 'post', progress: 0, status: 'Saving edit', detail: '', editSave: true }
        })
      }

      let snap = { ...snapshot }
      try {
        if (snapshotNeedsBackgroundVideoPrep(snap)) {
          loungePostUploadLastPhaseRef.current = 'Waiting for video'
          if (submissionHasVideo) {
            setLoungePostUploadBar((prev) => ({
              ...(mediaUploadBarSkin
                ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId, editSave: true }
                : { mode: 'post', editSave: true }),
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
                  ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId, editSave: true }
                  : { mode: 'post', editSave: true }),
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
          } else if (!isQueuedJob && loungeDetailEditVideoLastEncodedFileRef.current && snap.videoPrepSpec) {
            const reuse = loungeDetailEditVideoLastEncodedFileRef.current
            const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
              supabaseClient,
              signal: ac.signal,
              uploadFile: reuse,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
            loungeDetailEditVideoLastEncodedFileRef.current = null
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
            awaitingDetailEditVideoPrepJobId: null,
          }
          loungeDetailEditSnapshotRef.current = snap
          const pend =
            typeof snap.sessionStreamPosterBlobUrl === 'string' ? snap.sessionStreamPosterBlobUrl.trim() : ''
          const nu = String(snap.streamVideoUid || '').trim()
          if (nu && pend.startsWith('blob:')) {
            pinLoungeStreamSessionPoster(nu, pend)
          }
          if (
            snapshot.awaitingDetailEditVideoPrepJobId != null ||
            snapshot._capturedPrepHandoff?.jobId != null
          ) {
            const handoffJobId =
              snapshot.awaitingDetailEditVideoPrepJobId ?? snapshot._capturedPrepHandoff?.jobId
            const href = loungeDetailEditVideoPrepHandoffRef
            if (href.current?.jobId === handoffJobId) {
              href.current = null
            }
          }
        }

        const data = await executeLoungeCommunityPostUpdate({
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
                      ? { mode: 'mediaPrep', postSubmission: true, prepJobId: prepHudId, editSave: true }
                      : { mode: 'post', editSave: true }),
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
        loungeDetailEditSnapshotRef.current = null
        patchLoungePostEditResult(data)
        persistLoungeComposerLastCategoryPillsFromSubmit(snap)
        setLoungePostUploadFailedOpen(false)
        setLoungePostUploadFailureDetails(null)
      } catch (e) {
        if (e?.name === 'AbortError') return
        const failUid = String(snap.streamVideoUid || '').trim()
        const hadSessionPoster =
          typeof snap.sessionStreamPosterBlobUrl === 'string' &&
          snap.sessionStreamPosterBlobUrl.startsWith('blob:')
        if (failUid && hadSessionPoster) {
          releaseLoungeStreamSessionPoster(failUid)
        }
        const curSnap = loungeDetailEditSnapshotRef.current
        if (curSnap?.awaitingDetailEditVideoPrepJobId != null) {
          loungeDetailEditSnapshotRef.current = { ...curSnap, awaitingDetailEditVideoPrepJobId: null }
        }
        if (String(snap.streamVideoUid || '').trim()) {
          loungeDetailEditSnapshotRef.current = snap
        }
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Could not save edit.'
        if (msg === LOUNGE_MAX_PINNED_ALERT && typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
        setLoungeDetailEditErr(msg)
        setLoungePostUploadFailureDetails({
          kind: 'postEdit',
          phase: loungePostUploadLastPhaseRef.current || '(no step recorded)',
          message: msg,
        })
        setLoungePostUploadFailedOpen(true)
      } finally {
        loungeDetailEditAbortRef.current = null
        loungeDetailEditJobRunningRef.current = false
        bumpLoungeSubmitInFlight(-1)
        setLoungeFeedPostEditPendingPostId(null)
        dismissLoungePostUploadBarIfIdle()
      }
    },
    [bumpLoungeSubmitInFlight, dismissLoungePostUploadBarIfIdle, patchLoungePostEditResult, rateLimitMessage, supabaseClient],
  )
  runBackgroundLoungePostEditSubmissionRef.current = runBackgroundLoungePostEditSubmission

  const runBackgroundLoungeCommentEditSubmission = useCallback(
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
        (snapshot.awaitingDetailCommentEditVideoPrepJobId != null || Boolean(snapshot.videoPrepSpec))
      const prepHudId = snapshot.awaitingDetailCommentEditVideoPrepJobId ?? 0

      loungeDetailCommentEditSnapshotRef.current = snapshot
      loungeDetailCommentEditJobRunningRef.current = true
      bumpLoungeSubmitInFlight(1)
      loungePostUploadLastPhaseRef.current = ''
      const ac = new AbortController()
      loungeDetailCommentEditAbortRef.current = ac

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
              editSave: true,
            }
          }
          return { mode: 'post', progress: 0, status: 'Saving edit', detail: '', editSave: true }
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
          } else if (
            !isQueuedJob &&
            loungeDetailCommentEditVideoLastEncodedFileRef.current &&
            snap.videoPrepSpec
          ) {
            const reuse = loungeDetailCommentEditVideoLastEncodedFileRef.current
            const { streamVideoUid } = await uploadEncodedVideoToCfStreamWithRetries({
              supabaseClient,
              signal: ac.signal,
              uploadFile: reuse,
              onProgress: onPrepProgressWhilePosting,
              onUploadDiagnostic: onPrepUploadDiagnostic,
            })
            loungeDetailCommentEditVideoLastEncodedFileRef.current = null
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
            awaitingDetailCommentEditVideoPrepJobId: null,
          }
          loungeDetailCommentEditSnapshotRef.current = snap
          const pend =
            typeof snap.sessionStreamPosterBlobUrl === 'string' ? snap.sessionStreamPosterBlobUrl.trim() : ''
          const nu = String(snap.streamVideoUid || '').trim()
          if (nu && pend.startsWith('blob:')) {
            pinLoungeStreamSessionPoster(nu, pend)
          }
          if (
            snapshot.awaitingDetailCommentEditVideoPrepJobId != null ||
            snapshot._capturedPrepHandoff?.jobId != null
          ) {
            const handoffJobId =
              snapshot.awaitingDetailCommentEditVideoPrepJobId ?? snapshot._capturedPrepHandoff?.jobId
            const href = loungeDetailCommentEditVideoPrepHandoffRef
            if (href.current?.jobId === handoffJobId) {
              href.current = null
            }
          }
        }

        const data = await executeLoungeCommentUpdate({
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
        loungeDetailCommentEditSnapshotRef.current = null
        patchLoungeCommentEditResult(data)
        setLoungePostUploadFailedOpen(false)
        setLoungePostUploadFailureDetails(null)
      } catch (e) {
        if (e?.name === 'AbortError') return
        const failUid = String(snap.streamVideoUid || '').trim()
        const hadSessionPoster =
          typeof snap.sessionStreamPosterBlobUrl === 'string' &&
          snap.sessionStreamPosterBlobUrl.startsWith('blob:')
        if (failUid && hadSessionPoster) {
          releaseLoungeStreamSessionPoster(failUid)
        }
        const curSnap = loungeDetailCommentEditSnapshotRef.current
        if (curSnap?.awaitingDetailCommentEditVideoPrepJobId != null) {
          loungeDetailCommentEditSnapshotRef.current = {
            ...curSnap,
            awaitingDetailCommentEditVideoPrepJobId: null,
          }
        }
        if (String(snap.streamVideoUid || '').trim()) {
          loungeDetailCommentEditSnapshotRef.current = snap
        }
        setLoungeDetailCommentEditPendingCommentId(null)
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Could not save edit.'
        setLoungeDetailCommentErr(msg)
        setLoungePostUploadFailureDetails({
          kind: 'commentEdit',
          phase: loungePostUploadLastPhaseRef.current || '(no step recorded)',
          message: msg,
        })
        setLoungePostUploadFailedOpen(true)
      } finally {
        loungeDetailCommentEditAbortRef.current = null
        loungeDetailCommentEditJobRunningRef.current = false
        bumpLoungeSubmitInFlight(-1)
        setLoungeDetailCommentEditPendingCommentId(null)
        dismissLoungePostUploadBarIfIdle()
      }
    },
    [bumpLoungeSubmitInFlight, dismissLoungePostUploadBarIfIdle, patchLoungeCommentEditResult, supabaseClient],
  )
  runBackgroundLoungeCommentEditSubmissionRef.current = runBackgroundLoungeCommentEditSubmission

  /** Text/image/GIF-only submits - run in parallel without blocking the video queue. */
  const runFastLaneLoungeSubmit = useCallback(
    async (type, snapshot) => {
      loungeFastLaneInFlightRef.current += 1
      bumpLoungeSubmitInFlight(1)
      const ac = new AbortController()
      try {
        if (type === 'commentEdit') {
          const data = await executeLoungeCommentUpdate({
            supabaseClient,
            snapshot,
            signal: ac.signal,
          })
          loungeDetailCommentEditSnapshotRef.current = null
          patchLoungeCommentEditResult(data)
        } else if (type === 'postEdit') {
          loungeDetailEditJobRunningRef.current = true
          loungeDetailEditAbortRef.current = ac
          const data = await executeLoungeCommunityPostUpdate({
            supabaseClient,
            snapshot,
            signal: ac.signal,
            rateLimitMessage,
          })
          loungeDetailEditSnapshotRef.current = null
          patchLoungePostEditResult(data)
          persistLoungeComposerLastCategoryPillsFromSubmit(snapshot)
        } else if (type === 'comment') {
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
          if (snap.parentId) {
            setInteractionByComment((prev) => {
              const key = String(snap.parentId)
              const cur = prev[key] || defaultInteraction
              return { ...prev, [key]: { ...cur, commented: true } }
            })
          }
          scheduleLoungePostDetailTitleAfterReply()
          if (snap.parentId) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => scrollLoungePostDetailToFocusedComment())
            })
          }
        } else {
          const threadTotal = loungeSubmissionSnapshotThreadPartCount(snapshot)
          if (threadTotal > 1) {
            loungePostSnapshotRef.current = snapshot
            loungePostJobRunningRef.current = true
            loungePostUploadLastPhaseRef.current = ''
            setLoungePostUploadBar({
              mode: 'mediaPrep',
              postSubmission: true,
              threadPartTotal: threadTotal,
              threadPartPublished: 0,
              threadPartActive: 1,
              progress: 0,
              status: 'Starting thread…',
              detail: '',
            })
          }
          await executeLoungeCommunityPostSubmission({
            supabaseClient,
            snapshot,
            signal: ac.signal,
            rateLimitMessage,
            onProgress:
              threadTotal > 1
                ? (info) =>
                    applyLoungePostSubmitUploadProgress(info, snapshot, {
                      mode: 'mediaPrep',
                      postSubmission: true,
                    })
                : undefined,
          })
          persistLoungeComposerLastCategoryPillsFromSubmit(snapshot)
          const publishedDraftId = String(
            snapshot.savedDraftId || loungeComposerActiveDraftIdRef.current || '',
          ).trim()
          if (publishedDraftId) {
            await deleteLoungePostDraft(supabaseClient, publishedDraftId, { retainStreamAssets: true })
            setLoungeComposerActiveDraftId(null)
            await refreshLoungeDraftCount()
          }
          await loadCommunityFeed({ silent: true })
          if (threadTotal > 1) {
            loungePostSnapshotRef.current = null
            loungePostJobRunningRef.current = false
          }
          const quoteOrigPostId = String(snapshot.quoteRepostOfPostId || '').trim()
          const quoteOrigCommentId = String(snapshot.quoteRepostOfCommentId || '').trim()
          if (quoteOrigPostId) {
            await refreshLoungePostInteractions([quoteOrigPostId])
            bumpNotificationInteractionRefreshIfOpen()
          } else if (quoteOrigCommentId) {
            await hydrateCommentInteractionsForIds([quoteOrigCommentId])
            bumpNotificationInteractionRefreshIfOpen()
          }
        }
      } catch (e) {
        if (e?.name === 'AbortError') {
          return
        }
        const msg = (e instanceof Error ? e.message : String(e || '')).trim() || 'Could not post right now.'
        if (msg === LOUNGE_MAX_PINNED_ALERT && typeof window !== 'undefined') window.alert(LOUNGE_MAX_PINNED_ALERT)
        const failKind =
          type === 'comment'
            ? 'comment'
            : type === 'commentEdit'
              ? 'commentEdit'
              : type === 'postEdit'
                ? 'postEdit'
                : 'post'
        if (type === 'post' || type === 'quote') {
          const threadTotal = loungeSubmissionSnapshotThreadPartCount(snapshot)
          if (threadTotal > 1) {
            const retrySnap = restoreThreadAfterUploadFailure(snapshot)
            const detail = msg !== 'Could not post right now.' ? msg : ''
            setThreadComposeErr(
              detail
                ? `Could not post thread - ${detail} Your full thread is still here; fix or tap Post all again.`
                : 'Could not post thread - all parts are still here with your media. Tap Post all again or edit below.',
            )
            void persistThreadSubmissionSnapshotAsDraft(retrySnap || snapshot, { fromPartIndex: 0 }).then(
              ({ data }) => {
                if (data) void refreshLoungeDraftCount()
              },
            )
            loungePostJobRunningRef.current = false
          } else {
            deferOrShowFastLaneFailure(failKind, snapshot, 'Publishing', msg)
          }
        } else {
          deferOrShowFastLaneFailure(failKind, snapshot, 'Publishing', msg)
        }
      } finally {
        if (type === 'postEdit') {
          loungeDetailEditAbortRef.current = null
          loungeDetailEditJobRunningRef.current = false
          setLoungeFeedPostEditPendingPostId(null)
        }
        if (type === 'commentEdit') {
          setLoungeDetailCommentEditPendingCommentId(null)
        }
        loungeFastLaneInFlightRef.current = Math.max(0, loungeFastLaneInFlightRef.current - 1)
        bumpLoungeSubmitInFlight(-1)
        dismissLoungePostUploadBarIfIdle()
      }
    },
    [
      applyLoungePostSubmitUploadProgress,
      bumpNotificationInteractionRefreshIfOpen,
      bumpLoungeSubmitInFlight,
      composerUserProfile,
      defaultInteraction,
      deferOrShowFastLaneFailure,
      dismissLoungePostUploadBarIfIdle,
      loadCommunityFeed,
      patchLoungeCommentEditResult,
      patchLoungePostEditResult,
      patchPostAggregate,
      persistThreadSubmissionSnapshotAsDraft,
      rateLimitMessage,
      refreshLoungeDraftCount,
      refreshLoungePostInteractions,
      restoreThreadAfterUploadFailure,
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
    if (fail?.kind === 'commentEdit') {
      const editSnap = loungeDetailCommentEditSnapshotRef.current
      setLoungePostUploadFailureDetails(null)
      if (!editSnap) return
      if (editSnap.commentId) {
        setLoungeDetailCommentEditPendingCommentId(String(editSnap.commentId))
      }
      void runBackgroundLoungeCommentEditSubmissionRef.current(editSnap)
      return
    }
    if (fail?.kind === 'postEdit') {
      const editSnap = loungeDetailEditSnapshotRef.current
      setLoungePostUploadFailureDetails(null)
      if (!editSnap) return
      void runBackgroundLoungePostEditSubmissionRef.current(editSnap)
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
    if (loungeSubmissionSnapshotThreadPartCount(snap) > 1 || snap.threadResumePostId) {
      setThreadComposeOpen(true)
    }
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
    const editSlot = loungeDetailEditVideoSlotRef.current
    const editSpec = loungeDetailEditVideoPrepSpecRef.current
    if (editSlot?.prepStatus === 'queued' && editSpec) {
      startLoungeDetailEditVideoPrepFromSpec(editSpec, {
        file: editSpec.kind === 'direct' ? editSpec.file : editSlot.file,
        posterUrl: editSlot.posterUrl,
        preview: editSlot.preview,
        streamVideoUid: editSlot.streamVideoUid ?? null,
        prepError: '',
      })
    }
    const commentEditSlot = loungeDetailCommentEditVideoSlotRef.current
    const commentEditSpec = loungeDetailCommentEditVideoPrepSpecRef.current
    if (commentEditSlot?.prepStatus === 'queued' && commentEditSpec) {
      startLoungeDetailCommentEditVideoPrepFromSpec(commentEditSpec, {
        file: commentEditSpec.kind === 'direct' ? commentEditSpec.file : commentEditSlot.file,
        posterUrl: commentEditSlot.posterUrl,
        preview: commentEditSlot.preview,
        streamVideoUid: commentEditSlot.streamVideoUid ?? null,
        prepError: '',
      })
    }
  }, [
    startComposerVideoPrepFromSpec,
    startLoungeDetailCommentEditVideoPrepFromSpec,
    startLoungeDetailCommentVideoPrepFromSpec,
    startLoungeDetailEditVideoPrepFromSpec,
    startQuoteRepostVideoPrepFromSpec,
  ])

  /**
   * Drain the video submit queue - DB insert stays sequential; waiting jobs prep/upload in parallel.
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
        } else if (job.type === 'postEdit') {
          await runBackgroundLoungePostEditSubmissionRef.current?.(job)
        } else if (job.type === 'commentEdit') {
          await runBackgroundLoungeCommentEditSubmissionRef.current?.(job)
        } else {
          await runBackgroundLoungeDetailCommentSubmissionRef.current?.(job)
        }
        loungeSubmitQueueRef.current.shift()
        loungeSubmitQueueBatchRef.current = {
          total: loungeSubmitQueueBatchRef.current.total,
          completed: loungeSubmitQueueBatchRef.current.completed + 1,
        }
        const nextJob = loungeSubmitQueueRef.current[0]
        if (
          !nextJob ||
          (!loungeSubmissionSnapshotIncludesVideo(nextJob.snapshot) &&
            loungeSubmissionSnapshotThreadPartCount(nextJob.snapshot) <= 1)
        ) {
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

  const onLoungePostUploadSaveDraft = useCallback(async () => {
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
    if (fail?.kind === 'commentEdit') {
      const editSnap = loungeDetailCommentEditSnapshotRef.current
      if (editSnap) {
        setLoungeDetailCommentEditingId(String(editSnap.commentId || ''))
        setLoungeDetailCommentEditDraft(String(editSnap.body || ''))
        setLoungeDetailCommentEditMediaUrl(String(editSnap.gifOnlyUrl || ''))
        setLoungeDetailCommentEditImageUrls(Array.isArray(editSnap.remoteImageUrls) ? editSnap.remoteImageUrls : [])
        setLoungeDetailCommentEditKeepStreamUid(
          String(editSnap.previousStreamUid || editSnap.streamVideoUid || '').trim() || null,
        )
        setLoungeDetailCommentErr('Edit draft restored. Re-add photos or video if you had any.')
        const cUid = String(editSnap.streamVideoUid || '').trim()
        if (
          cUid &&
          typeof editSnap.sessionStreamPosterBlobUrl === 'string' &&
          editSnap.sessionStreamPosterBlobUrl.startsWith('blob:')
        ) {
          releaseLoungeStreamSessionPoster(cUid)
        }
      }
      loungeDetailCommentEditSnapshotRef.current = null
      loungeDetailCommentEditJobRunningRef.current = false
      setLoungeDetailCommentEditPendingCommentId(null)
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    if (fail?.kind === 'postEdit') {
      const editSnap = loungeDetailEditSnapshotRef.current
      if (editSnap && loungePostDetail?.id === editSnap.postId) {
        setLoungeDetailEditing(true)
        setLoungeDetailDraftCaption(String(editSnap.caption || ''))
        setLoungeDetailEditMediaUrl(String(editSnap.gifOnlyUrl || ''))
        setLoungeDetailEditImageUrls(Array.isArray(editSnap.remoteImageUrls) ? editSnap.remoteImageUrls : [])
        setLoungeDetailEditCategoryPills(Array.isArray(editSnap.categoryPills) ? editSnap.categoryPills : [])
        setLoungeDetailEditMarketSymbols(Array.isArray(editSnap.marketSymbols) ? editSnap.marketSymbols : [])
        setLoungeDetailEditKeepStreamUid(
          String(editSnap.previousStreamUid || editSnap.streamVideoUid || '').trim() || null,
        )
        setLoungeDetailEditErr('Edit draft restored. Re-add photos or video if you had any.')
        const pUid = String(editSnap.streamVideoUid || '').trim()
        if (
          pUid &&
          typeof editSnap.sessionStreamPosterBlobUrl === 'string' &&
          editSnap.sessionStreamPosterBlobUrl.startsWith('blob:')
        ) {
          releaseLoungeStreamSessionPoster(pUid)
        }
      }
      loungeDetailEditSnapshotRef.current = null
      loungeDetailEditJobRunningRef.current = false
      setLoungeFeedPostEditPendingPostId(null)
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    if (fail?.kind === 'mediaPrep') {
      if (fail?.target === 'quote') {
        cancelQuoteRepostMediaPrep()
        setQuoteRepostErr('Video was cleared - add a video again when you are ready.')
        setLoungePostUploadFailedOpen(false)
        setLoungePostUploadFailureDetails(null)
        return
      }
      persistLoungeComposerDraft(postText, true, false, String(composerMediaUrl || '').trim())
      disposeComposerVideoMedia(composerVideoSlotRef.current)
      setComposerVideoSlot(null)
      composerExpandedRef.current = true
      composerFoldRevealRef.current = 1
      setComposerFoldReveal(1)
      composerFoldedFromFeedScrollRef.current = false
      setComposerExpanded(true)
      setComposerFocusToken((t) => t + 1)
      void saveComposerAsServerDraft({ silent: true, background: true })
      setPostErr('')
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    const snap = loungePostSnapshotRef.current
    if (snap) {
      if (String(snap.quoteRepostOfPostId || '').trim()) {
        restoreQuoteFromSnapshot(snap, { skipVideo: true })
        setQuoteRepostErr('Draft saved. Re-add photos or video if you had any.')
      } else if (loungeSubmissionSnapshotThreadPartCount(snap) > 1 || snap.threadResumePostId) {
        restoreComposerFromSnapshot(snap, { fromPartIndex: 0 })
        void persistThreadSubmissionSnapshotAsDraft(snap, { fromPartIndex: 0 }).then(({ data }) => {
          if (data) {
            setLoungeComposerActiveDraftId(data.id)
            void refreshLoungeDraftCount()
          }
        })
        setThreadComposeErr('Thread saved to drafts - photos, GIFs, and videos kept in compose.')
      } else {
        restoreComposerFromSnapshot(snap)
        const draftPayload = loungePostDraftPayloadFromSubmissionSnapshot(snap)
        const { data, error } = await upsertLoungePostDraft(supabaseClient, {
          ...(draftPayload || {
            caption: String(snap.caption || ''),
            gifUrl: String(snap.gifOnlyUrl || '').trim(),
            existingImageUrls: Array.isArray(snap.existingImageUrls) ? snap.existingImageUrls : [],
            imageFiles: Array.isArray(snap.imageFiles)
              ? snap.imageFiles.filter((f) => f instanceof File)
              : [],
          }),
          id: snap.savedDraftId || loungeComposerActiveDraftIdRef.current,
          categoryPills: snap.categoryPills,
          threadCaptions: Array.isArray(snap.threadCaptions) ? snap.threadCaptions : undefined,
        })
        if (error) {
          setPostErr(error.message)
        } else if (data) {
          setLoungeComposerActiveDraftId(data.id)
          await refreshLoungeDraftCount()
        }
      }
    }
    loungePostSnapshotRef.current = null
    loungePostJobRunningRef.current = false
    setLoungePostUploadFailedOpen(false)
    setLoungePostUploadFailureDetails(null)
  }, [
    cancelQuoteRepostMediaPrep,
    composerMediaUrl,
    disposeComposerVideoMedia,
    loadServerDraftIntoComposer,
    loungePostDetail?.id,
    persistThreadSubmissionSnapshotAsDraft,
    postText,
    refreshLoungeDraftCount,
    restoreComposerFromSnapshot,
    restoreQuoteFromSnapshot,
    saveComposerAsServerDraft,
    supabaseClient,
  ])

  const onLoungePostUploadFailureCancel = useCallback(() => {
    const fail = loungePostUploadFailureDetailsRef.current
    if (fail?.kind === 'commentEdit') {
      loungeDetailCommentEditSnapshotRef.current = null
      loungeDetailCommentEditJobRunningRef.current = false
      setLoungeDetailCommentEditPendingCommentId(null)
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
    if (fail?.kind === 'postEdit') {
      loungeDetailEditSnapshotRef.current = null
      loungeDetailEditJobRunningRef.current = false
      setLoungeFeedPostEditPendingPostId(null)
      setLoungePostUploadFailedOpen(false)
      setLoungePostUploadFailureDetails(null)
      return
    }
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

  const closeThreadComposeImmediate = useCallback((opts = {}) => {
    setThreadComposeOpen(false)
    setThreadComposeFocusPartIndex(null)
    setThreadComposeActivePartIndex(0)
    const skipRevoke = opts.pendingSnapshot
      ? loungeSubmitSnapshotBlobUrls(opts.pendingSnapshot)
      : opts.skipRevokeUrls instanceof Set
        ? opts.skipRevokeUrls
        : null
    if (!opts.pendingSnapshot) {
      loungePostSnapshotRef.current = null
      if (!opts.preserveThreadVideoPrep) {
        setLoungePostUploadBar(null)
        threadComposeVideoPrepControllerRef.current?.reset()
        threadComposeVideoPrepByPartRef.current = {}
      }
    }
    setThreadComposePartMedia((prev) => {
      for (const part of prev) revokeThreadComposePartMediaFull(part, skipRevoke)
      return [emptyThreadComposePartMedia()]
    })
    if (!opts.skipRestoreFeedText) {
      setThreadComposeCaptions((prev) => {
        const root = String(prev[0] || '')
        if (root) setPostText(root)
        return ['']
      })
    } else {
      setThreadComposeCaptions([''])
    }
    threadComposePartRefMap.current = {}
    setThreadComposeErr('')
    setThreadComposeDiscardOpen(false)
    try {
      clearHiddenFileInputs(threadComposeImageInputRef.current, threadComposeVideoInputRef.current)
    } catch {
      // ignore
    }
  }, [])
  closeThreadComposeImmediateRef.current = closeThreadComposeImmediate

  const openThreadComposeSheet = useCallback(() => {
    if (loungeReadOnly) {
      requireLoungeAuth()
      return
    }
    if (openProfileGateIfNeeded()) return
    setPostErr('')
    setThreadComposeErr('')
    if (threadComposeOpen) {
      appendThreadComposePart()
      return
    }
    const seed =
      composerFieldRef.current && typeof composerFieldRef.current.value === 'string'
        ? composerFieldRef.current.value
        : postText
    const hasSeedCaption = Boolean(normalizeFeedCaption(seed))
    const initialFocusPartIndex = hasSeedCaption ? 1 : 0
    const applyOpen = () => {
      setThreadComposeCaptions([seed, ''])
      setThreadComposePartMedia([
        {
          imageItems: [...composerImageItems],
          gifUrl: String(composerMediaUrl || '').trim(),
          videoSlot: composerVideoSlot ? { ...composerVideoSlot } : null,
          videoPrepHud: null,
        },
        emptyThreadComposePartMedia(),
      ])
      if (composerVideoSlot) {
        setComposerVideoSlot(null)
      }
      setComposerImageItems([])
      setComposerMediaUrl('')
      setThreadComposeActivePartIndex(initialFocusPartIndex)
      setPostText('')
      composerFoldedFromFeedScrollRef.current = false
      composerFoldRevealRef.current = 0
      setComposerFoldReveal(0)
      composerExpandedRef.current = false
      setComposerExpanded(false)
      setThreadComposeOpen(true)
      setThreadComposeFocusPartIndex(initialFocusPartIndex)
    }

    blurLoungeComposerCaption(() => composerFieldRef.current)

    if (!hasSeedCaption) {
      flushSync(applyOpen)
      const focusThreadPart0 = () => threadComposePartRefMap.current[0]
      invokeLoungeComposerCaptionKeyboard(focusThreadPart0)
      scheduleLoungeComposerTextareaFocus({
        getTextarea: focusThreadPart0,
        isBlocked: () => !threadComposeOpenRef.current,
      })
    } else {
      applyOpen()
    }
  }, [
    appendThreadComposePart,
    loungeReadOnly,
    openProfileGateIfNeeded,
    composerVideoSlot,
    composerImageItems,
    composerMediaUrl,
    postText,
    requireLoungeAuth,
    threadComposeOpen,
  ])

  const requestCloseThreadCompose = useCallback(() => {
    const hasText = threadComposeCaptions.some((t) => String(t || '').trim())
    const hasMedia =
      threadComposePartMedia.some(
        (part) => threadComposePartHasMedia(part) || threadComposePartHasVideo(part),
      )
    if (hasText || hasMedia) {
      setThreadComposeDiscardOpen(true)
      return
    }
    closeThreadComposeImmediate()
  }, [closeThreadComposeImmediate, threadComposeCaptions, threadComposePartMedia])

  const discardThreadCompose = useCallback(() => {
    closeThreadComposeImmediate({ skipRestoreFeedText: true })
    setPostText('')
    setPostErr('')
    clearLoungeComposerDraft()
    composerFoldedFromFeedScrollRef.current = false
    composerFoldRevealRef.current = 0
    setComposerFoldReveal(0)
    composerExpandedRef.current = false
    setComposerExpanded(false)
  }, [closeThreadComposeImmediate])

  const submitThreadCompose = useCallback(async () => {
    setThreadComposeErr('')
    const normalizedParts = normalizeThreadComposePartsForSubmit(
      threadComposeCaptions,
      threadComposePartMedia,
    )
    if (normalizedParts.length === 0) return
    if (!threadComposePartHasContent(normalizedParts[0].body, threadComposePartMedia[0])) {
      setThreadComposeErr('Add text, media, or a GIF to the first post.')
      return
    }
    for (let i = 0; i < normalizedParts.length; i += 1) {
      const part = normalizedParts[i]
      const media = threadComposePartMedia[i] || emptyThreadComposePartMedia()
      if (!threadComposePartHasContent(part.body, media)) {
        setThreadComposeErr(`Post ${i + 1} needs text or media.`)
        return
      }
      if (threadComposePartHasVideo(media) && String(part.gifUrl || '').trim()) {
        setThreadComposeErr(`Post ${i + 1}: remove the GIF before posting a video.`)
        return
      }
      const gifCheckPart = validateAtMostOneGifUrl(part.gifUrl)
      if (!gifCheckPart.ok) {
        setThreadComposeErr(`Post ${i + 1}: ${gifCheckPart.message}`)
        return
      }
      const slot = media.videoSlot
      if (slot?.file && slot.file.size > LOUNGE_CF_STREAM_MAX_UPLOAD_BYTES) {
        setThreadComposeErr(`Post ${i + 1}: video must be 200 MB or smaller for upload.`)
        return
      }
    }
    if (normalizedParts.length > LOUNGE_POST_THREAD_MAX_PARTS) {
      setThreadComposeErr(`Threads can have at most ${LOUNGE_POST_THREAD_MAX_PARTS} posts.`)
      return
    }
    for (let i = 0; i < threadComposeCaptions.length; i += 1) {
      if (String(threadComposeCaptions[i] || '').length > LOUNGE_CAPTION_MAX) {
        setThreadComposeErr(`Post ${i + 1} must be ${LOUNGE_CAPTION_MAX} characters or fewer.`)
        return
      }
    }
    const rootPart = normalizedParts[0]
    const rootMedia = threadComposePartMedia[0] || emptyThreadComposePartMedia()
    const rootSlot = rootMedia.videoSlot
    const gifCheck = validateAtMostOneGifUrl(rootPart.gifUrl)
    if (!gifCheck.ok) {
      setThreadComposeErr(gifCheck.message)
      return
    }
    const caption = rootPart.body
    const hasThread = normalizedParts.length > 1
    if (loungeComposerVideoPostBlocked) {
      const blockedPart = threadComposePartMedia.findIndex((part) =>
        threadComposeVideoSlotBlocksPost(part.videoSlot),
      )
      setThreadComposeErr(
        blockedPart >= 0
          ? `Post ${blockedPart + 1}: video upload failed - remove the video or pick a new one before posting.`
          : 'A video in this thread failed to upload - fix it before posting.',
      )
      return
    }

    const buildThreadPartsSnapshot = () =>
      normalizedParts.map((part, i) => {
        const media = threadComposePartMedia[i] || emptyThreadComposePartMedia()
        const videoSnap = threadComposePartVideoSnapshotFields(
          media.videoSlot,
          threadComposeVideoPrepByPartRef.current[i] ?? null,
        )
        return {
          body: part.body,
          gifUrl: part.gifUrl,
          imageFiles: part.imageFiles,
          existingImageUrls: part.existingImageUrls,
          imagePreviewBlobUrls: threadPartImagePreviewBlobUrlsFromMedia(media),
          ...videoSnap,
        }
      })

    setPostBusy(true)
    let snapshot = null
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession()
      if (!session?.user) {
        setThreadComposeErr('You must be signed in to post in Lounge.')
        onRequireAuth?.()
        return
      }

      const { data: ownProfile, error: profileErr } = await fetchOwnProfile(supabaseClient, session.user.id)
      if (profileErr) {
        setThreadComposeErr(`Could not verify profile: ${profileErr.message || 'Unknown error.'}`)
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
        setProfileGateCategoryPills(profileCategoryPills(ownProfile || composerUserProfile))
        setProfileGateErr('')
        setProfileGateOpen(true)
        setThreadComposeErr('Complete your profile to post in Lounge.')
        return
      }

      const isStaffPoster =
        ownProfile?.role === 'moderator' ||
        ownProfile?.role === 'admin' ||
        composerUserProfile?.role === 'moderator' ||
        composerUserProfile?.role === 'admin'

      const gifOnlyUrl = gifCheck.value
      const rootVideoSnap = threadComposePartVideoSnapshotFields(
        rootSlot,
        threadComposeVideoPrepByPartRef.current[0] ?? null,
      )
      if (rootSlot && gifOnlyUrl) {
        setThreadComposeErr('Remove the GIF before posting a video.')
        return
      }

      const uid = rootSlot ? String(rootSlot.streamVideoUid || '').trim() || null : null
      const awaiting =
        rootSlot &&
        !uid &&
        rootSlot.prepStatus === 'preparing' &&
        typeof rootSlot.prepJobId === 'number'
          ? rootSlot.prepJobId
          : null
      const specForSnap = rootSlot && !uid ? rootVideoSnap.videoPrepSpec : null
      const trimRestore = rootVideoSnap.videoPrepSlotRestore
      const sessionPosterBlob = rootVideoSnap.sessionStreamPosterBlobUrl

      const threadPartsSnap = buildThreadPartsSnapshot()

      snapshot = {
        caption,
        gifOnlyUrl,
        imageFiles: rootPart.imageFiles,
        existingImageUrls: rootPart.existingImageUrls,
        imagePreviewBlobUrls: threadPartImagePreviewBlobUrlsFromMedia(
          threadComposePartMedia[0] || emptyThreadComposePartMedia(),
        ),
        videoFile: rootVideoSnap.videoFile,
        streamVideoUid: uid,
        awaitingComposerVideoPrepJobId: awaiting ?? rootVideoSnap.awaitingThreadPartVideoPrepJobId,
        videoPrepSpec: specForSnap,
        videoPrepSlotRestore: trimRestore,
        sessionStreamPosterBlobUrl: sessionPosterBlob,
        wantsPin: false,
        isStaffPoster,
        savedDraftId: loungeComposerActiveDraftIdRef.current,
        _capturedPrepHandoff:
          threadComposeVideoPrepByPartRef.current[0]?.handoff ??
          rootVideoSnap._capturedPrepHandoff ??
          null,
        categoryPills: composerCategoryPills,
        threadParts: hasThread ? threadPartsSnap : threadPartsSnap.length > 0 ? threadPartsSnap : undefined,
        threadCaptions: hasThread ? normalizedParts.map((p) => p.body) : undefined,
      }
    } finally {
      setPostBusy(false)
    }

    if (!snapshot) return

    if (loungeSubmissionSnapshotThreadPartCount(snapshot) > 1) {
      try {
        const draftPayload = loungePostDraftPayloadFromSubmissionSnapshot(snapshot)
        if (
          draftPayload &&
          loungePostDraftHasContent({
            caption: draftPayload.caption,
            threadCaptions: draftPayload.threadCaptions,
            gifUrl: draftPayload.gifUrl,
            imageUrls: draftPayload.existingImageUrls,
            imageFiles: draftPayload.imageFiles,
          })
        ) {
          const { data: draftRow, error: draftErr } = await upsertLoungePostDraft(supabaseClient, {
            ...draftPayload,
            id: snapshot.savedDraftId || loungeComposerActiveDraftIdRef.current,
          })
          if (draftRow) {
            snapshot = { ...snapshot, savedDraftId: draftRow.id }
            setLoungeComposerActiveDraftId(draftRow.id)
            await refreshLoungeDraftCount()
          } else if (draftErr) {
            setThreadComposeErr(draftErr.message)
            return
          }
        }
      } catch {
        // Non-blocking - failure handler saves again if needed.
      }
    }

    const preserveVideoPrep =
      snapshot.awaitingComposerVideoPrepJobId != null ||
      (Array.isArray(snapshot.threadParts) &&
        snapshot.threadParts.some(
          (p) =>
            p?.awaitingThreadPartVideoPrepJobId != null ||
            (p?._capturedPrepHandoff && !p._capturedPrepHandoff.settled),
        ))
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
    if (Array.isArray(snapshot.threadParts)) {
      for (const part of snapshot.threadParts) {
        const partUid = String(part?.streamVideoUid ?? '').trim()
        const partPoster =
          typeof part?.sessionStreamPosterBlobUrl === 'string'
            ? part.sessionStreamPosterBlobUrl.trim()
            : ''
        if (partUid && partPoster.startsWith('blob:')) {
          pinLoungeStreamSessionPoster(partUid, partPoster)
        }
      }
    }
    closeThreadComposeImmediate({ skipRestoreFeedText: true, pendingSnapshot: snapshot })
    clearComposerForPostAttempt({
      preserveComposerVideoPrep: preserveVideoPrep,
      pendingSnapshot: snapshot,
    })
    enqueueAndRunLoungeSubmitRef.current('post', snapshot)
  }, [
    clearComposerForPostAttempt,
    closeThreadComposeImmediate,
    composerCategoryPills,
    composerUserProfile?.avatar_url,
    composerUserProfile?.role,
    loungeComposerVideoPostBlocked,
    onRequireAuth,
    supabaseClient,
    threadComposeCaptions,
    threadComposePartMedia,
    refreshLoungeDraftCount,
  ])

  const submitLoungePost = useCallback(async () => {
    const caption = normalizeFeedCaption(postText)
    setPostErr('')
    const gifCheck = validateAtMostOneGifUrl(composerMediaUrl)
    if (!gifCheck.ok) {
      setPostErr(gifCheck.message)
      return
    }
    const hasGif = gifCheck.value.length > 0
    const hasImages = composerImageItems.length > 0
    const hasVideo = composerVideoSlot != null
    const hasMarket = composerMarketSymbols.length > 0 || extractCashtagsFromCaption(caption).length > 0
    if (!caption && !hasGif && !hasImages && !hasVideo && !hasMarket) return
    if (caption.length > LOUNGE_CAPTION_MAX) {
      setPostErr(`Caption must be ${LOUNGE_CAPTION_MAX} characters or fewer.`)
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
        setProfileGateCategoryPills(profileCategoryPills(ownProfile || composerUserProfile))
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
        imageFiles: composerImageItems.map((it) => it.file).filter((f) => f instanceof File),
        existingImageUrls: composerImageItems
          .map((it) => String(it.remoteUrl || '').trim())
          .filter(Boolean),
        imagePreviewBlobUrls: composerImageItems
          .map((it) => String(it.preview || '').trim())
          .filter((p) => p.startsWith('blob:')),
        videoFile: hasVideo && slot?.file ? slot.file : null,
        streamVideoUid: uid,
        awaitingComposerVideoPrepJobId: awaiting,
        videoPrepSpec: specForSnap,
        videoPrepSlotRestore: trimRestore,
        sessionStreamPosterBlobUrl: sessionPosterBlob,
        wantsPin: false,
        isStaffPoster,
        savedDraftId: loungeComposerActiveDraftIdRef.current,
        // Capture prep handoff by reference so queued jobs don't race on the shared ref
        _capturedPrepHandoff: composerVideoPrepHandoffRef.current ?? null,
        categoryPills: composerCategoryPills,
        marketSymbols: composerMarketSymbols,
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
    composerCategoryPills,
    composerImageItems,
    composerMarketSymbols,
    composerMediaUrl,
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

      const nextCategoryPills = normalizeLoungeProfileCategoryPills(profileGateCategoryPills)
      const { error: categoryErr } = await supabaseClient
        .from('profiles')
        .update({ category_pills: nextCategoryPills })
        .eq('user_id', session.user.id)
      if (categoryErr) {
        const raw = String(categoryErr.message || '')
        if (/category_pills|schema cache/i.test(raw)) {
          setProfileGateErr(
            'Profile tribes need the latest SQL. In Supabase, run supabase/profile_category_pills.sql, then save again.',
          )
        } else {
          setProfileGateErr(raw || 'Could not save tribes.')
        }
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
  }, [onRequireAuth, profileGateAvatarFile, profileGateCategoryPills, profileGateDisplayName, profileGateHandle, submitLoungePost, supabaseClient])

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
    if (loungeNavRestoringRef.current) {
      setProfileModalStartEditing(false)
      setProfileModalFollowListTab(null)
      setProfileModalHighlightFollowerIds([])
      return
    }
    if (loungeNavSearchReturnPendingRef.current) {
      setProfileModalStartEditing(false)
      setProfileModalFollowListTab(null)
      setProfileModalHighlightFollowerIds([])
      return
    }
    const navFrame = popLoungeNavReturnFrame(loungeNavReturnStackRef.current)
    if (navFrame) {
      requestAnimationFrame(() => {
        void restoreLoungeNavFrameRef.current(navFrame)
      })
      return
    }
    const returnPanel = profileReturnDockPanelRef.current
    profileReturnDockPanelRef.current = null
    if (returnPanel === 'notifications' || returnPanel === 'search' || returnPanel === 'settings') {
      setLoungeDockPanel(returnPanel)
    }
    setProfileModalStartEditing(false)
    setProfileModalFollowListTab(null)
    setProfileModalHighlightFollowerIds([])
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

  /** FAB dock actions bypass return-stack / profile-back restoration and dismiss open overlays first. */
  const dismissLoungeStackForDockNav = useCallback(() => {
    profileReturnDockPanelRef.current = null
    loungeNavReturnStackRef.current.length = 0
    loungeNavSearchReturnPendingRef.current = false
    if (loungePostDetail) finalizeLoungePostDetailClose()
    if (profileModalOpen || profileOverlayStack.length > 0) {
      finalizeProfileModalClose()
    } else {
      setProfileOverlayStack([])
    }
  }, [
    finalizeLoungePostDetailClose,
    finalizeProfileModalClose,
    loungePostDetail,
    profileModalOpen,
    profileOverlayStack.length,
  ])

  useEffect(() => {
    dismissLoungeStackForDockNavRef.current = dismissLoungeStackForDockNav
  }, [dismissLoungeStackForDockNav])

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
      profileReturnDockPanelRef.current = opts?.returnDockPanel ?? null
      setProfileModalStartEditing(opts?.startEditing === true)
      setProfileModalFollowListTab(
        opts?.openFollowListTab === 'following' || opts?.openFollowListTab === 'followers'
          ? opts.openFollowListTab
          : null,
      )
      setProfileModalHighlightFollowerIds(
        Array.isArray(opts?.highlightFollowerUserIds)
          ? opts.highlightFollowerUserIds.map(String).filter(Boolean)
          : [],
      )
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

  useEffect(() => {
    if (!requestOpenProfileUserId) return
    const userId = requestOpenProfileUserId
    onRequestOpenProfileConsumed?.()
    void openProfileModal({ user_id: userId })
  }, [requestOpenProfileUserId, openProfileModal, onRequestOpenProfileConsumed])

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

  const captureLoungeNavReturnContext = useCallback(() => {
    if (loungePostDetail?.id) {
      return {
        kind: 'postDetail',
        post: loungePostDetail,
        commentPathIds: [...loungeCommentDetailPathIds],
        scrollTop: loungePostDetailScrollRef.current?.scrollTop ?? 0,
        aboveProfile: loungePostDetailAboveProfile,
      }
    }
    if (profileModalOpen && profileModalData?.user_id) {
      const snap = profileNavSnapshotRef.current ?? { tab: 'posts', scrollTop: 0 }
      return {
        kind: 'profile',
        userId: profileModalData.user_id,
        tab: snap.tab,
        scrollTop: snap.scrollTop,
        profileStub: profileModalData,
      }
    }
    if (loungeDockPanel === 'search') {
      return {
        kind: 'search',
        query: loungeDockSearchQuery,
        scrollTop: loungeDockPanelScrollRef.current?.scrollTop ?? 0,
      }
    }
    if (loungeDockPanel === 'notifications' || loungeDockPanel === 'settings' || loungeDockPanel === 'chat') {
      return {
        kind: 'dock',
        panel: loungeDockPanel,
        scrollTop: loungeDockPanelScrollRef.current?.scrollTop ?? 0,
      }
    }
    return {
      kind: 'feed',
      scrollTop: loungeFeedScrollRef.current?.scrollTop ?? 0,
    }
  }, [
    loungeCommentDetailPathIds,
    loungeDockPanel,
    loungeDockSearchQuery,
    loungePostDetail,
    loungePostDetailAboveProfile,
    profileModalData,
    profileModalOpen,
  ])

  const pushLoungeNavReturnContext = useCallback(() => {
    if (loungeNavRestoringRef.current) return
    pushLoungeNavReturnFrame(loungeNavReturnStackRef.current, captureLoungeNavReturnContext())
  }, [captureLoungeNavReturnContext])

  const restoreLoungeNavFrame = useCallback(
    async (frame) => {
      if (!frame) return
      loungeNavRestoringRef.current = true
      try {
        switch (frame.kind) {
          case 'feed': {
            setLoungeDockPanel(null)
            setProfileOverlayStack([])
            if (loungePostDetail?.id) finalizeLoungePostDetailClose()
            if (profileModalOpen) finalizeProfileModalClose()
            await new Promise((resolve) => requestAnimationFrame(resolve))
            const el = loungeFeedScrollRef.current
            if (el) el.scrollTop = frame.scrollTop
            break
          }
          case 'profile': {
            setLoungeDockPanel(null)
            setProfileOverlayStack([])
            if (loungePostDetail?.id) finalizeLoungePostDetailClose()
            setProfileNavRestore({ tab: frame.tab, scrollTop: frame.scrollTop })
            await openProfileModal(
              { user_id: frame.userId, ...(frame.profileStub || {}) },
              { skipNavCapture: true },
            )
            break
          }
          case 'postDetail': {
            setLoungeDockPanel(null)
            setProfileOverlayStack([])
            if (profileModalOpen) finalizeProfileModalClose()
            setLoungePostDetailAboveProfile(frame.aboveProfile)
            openLoungePostDetail(frame.post, {
              skipNavCapture: true,
              restoreCommentPathIds: frame.commentPathIds,
            })
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const el = loungePostDetailScrollRef.current
            if (el) el.scrollTop = frame.scrollTop
            break
          }
          case 'search': {
            if (loungePostDetail?.id) finalizeLoungePostDetailClose()
            if (profileModalOpen) finalizeProfileModalClose()
            setProfileOverlayStack([])
            setDockPanelScrollRestore(frame.scrollTop)
            setLoungeDockSearchQuery(frame.query)
            setLoungeDockSearchQueryVersion((v) => v + 1)
            setLoungeDockPanel('search')
            break
          }
          case 'dock': {
            if (loungePostDetail?.id) finalizeLoungePostDetailClose()
            if (profileModalOpen) finalizeProfileModalClose()
            setProfileOverlayStack([])
            setDockPanelScrollRestore(frame.scrollTop)
            if (frame.panel === 'search') {
              setLoungeDockSearchQuery(frame.searchQuery || '')
              setLoungeDockSearchQueryVersion((v) => v + 1)
            }
            setLoungeDockPanel(frame.panel)
            break
          }
          default:
            break
        }
      } finally {
        loungeNavRestoringRef.current = false
      }
    },
    [
      finalizeLoungePostDetailClose,
      finalizeProfileModalClose,
      loungePostDetail?.id,
      openLoungePostDetail,
      openProfileModal,
      profileModalOpen,
    ],
  )

  useEffect(() => {
    restoreLoungeNavFrameRef.current = restoreLoungeNavFrame
  }, [restoreLoungeNavFrame])

  useEffect(() => {
    pushLoungeNavReturnContextRef.current = pushLoungeNavReturnContext
  }, [pushLoungeNavReturnContext])

  /** Open another member's profile from a post/comment row (`user_id` + optional `author_profile`). */
  const openAuthorProfile = useCallback(
    (entity, opts) => {
      const stub = profileEntityStub(entity)
      if (!stub?.user_id) return
      if (openProfileGateIfNeeded()) return
      if (profileModalOpen || profileOverlayStack.length > 0) {
        pushProfileOverlay(entity)
        return
      }
      if (!opts?.skipNavCapture && !opts?.fromPublicLink) {
        pushLoungeNavReturnContext()
      }
      void openProfileModal(
        {
          user_id: stub.user_id,
          ...stub,
        },
        {
          skipNavCapture: true,
          returnDockPanel: opts?.returnDockPanel ?? null,
        },
      )
    },
    [
      openProfileGateIfNeeded,
      openProfileModal,
      profileEntityStub,
      profileModalOpen,
      profileOverlayStack.length,
      pushLoungeNavReturnContext,
      pushProfileOverlay,
    ],
  )

  const onLoungeDockPanelClose = useCallback(() => {
    setChatDockInitialPeerUserId(null)
    setLoungeSettingsFocusSection(null)
    if (loungeNavSearchReturnPendingRef.current && loungeDockPanel === 'search') {
      loungeNavSearchReturnPendingRef.current = false
      const frame = popLoungeNavReturnFrame(loungeNavReturnStackRef.current)
      setLoungeDockPanel(null)
      if (frame) {
        requestAnimationFrame(() => {
          void restoreLoungeNavFrameRef.current(frame)
        })
      }
      return
    }
    setLoungeDockPanel(null)
  }, [loungeDockPanel])

  const onProfileNavRestoreApplied = useCallback(() => {
    setProfileNavRestore(null)
  }, [])

  const onDockPanelScrollRestored = useCallback(() => {
    setDockPanelScrollRestore(null)
  }, [])

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
      openAuthorProfile(entity)
    },
    [openAuthorProfile],
  )

  const onLoungeOpenOwnProfileFollowers = useCallback(
    ({ highlightUserIds = [] } = {}) => {
      if (!composerUserId) return
      if (openProfileGateIfNeeded()) return
      pushLoungeNavReturnContext()
      void openProfileModal(
        {
          user_id: composerUserId,
          author_profile: composerUserProfile,
        },
        {
          skipNavCapture: true,
          openFollowListTab: 'followers',
          highlightFollowerUserIds: highlightUserIds,
        },
      )
    },
    [
      composerUserId,
      composerUserProfile,
      openProfileGateIfNeeded,
      openProfileModal,
      pushLoungeNavReturnContext,
    ],
  )

  const onLoungeSettingsEditProfile = useCallback(() => {
    if (!composerUserId || loungeReadOnly) return
    if (openProfileGateIfNeeded()) return
    pushLoungeNavReturnContext()
    setLoungeDockPanel(null)
    void openProfileModal(
      {
        user_id: composerUserId,
        author_profile: composerUserProfile,
      },
      { skipNavCapture: true, startEditing: true },
    )
  }, [
    composerUserId,
    composerUserProfile,
    loungeReadOnly,
    openProfileGateIfNeeded,
    openProfileModal,
    pushLoungeNavReturnContext,
  ])

  /** Open a profile by handle string - used when a viewer taps an @mention in a caption or comment. */
  const openProfileByHandle = useCallback(
    async (handle, e) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
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
          if (profileModalOpen || profileOverlayStack.length > 0) {
            pushProfileOverlay({ user_id: data.user_id, author_profile: data })
            return
          }
          pushLoungeNavReturnContext()
          void openProfileModal(
            { user_id: data.user_id, author_profile: data },
            { skipNavCapture: true },
          )
        }
      } catch {}
    },
    [
      openProfileGateIfNeeded,
      openProfileModal,
      profileModalOpen,
      profileOverlayStack.length,
      pushLoungeNavReturnContext,
      pushProfileOverlay,
      supabaseClient,
    ],
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
    (tag, e) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      if (loungeFeedBrowseMode === 'anonymous' || loungeReadOnly) {
        onRequireAuth?.()
        return
      }
      pushLoungeNavReturnContext()
      loungeNavSearchReturnPendingRef.current = true
      const q = tag.startsWith('#') ? tag.slice(1) : tag
      if (loungePostDetail?.id) {
        finalizeLoungePostDetailClose()
      }
      if (profileModalOpen) {
        closeProfileModal()
      }
      setProfileOverlayStack([])
      setLoungeDockSearchQuery(q)
      setLoungeDockSearchQueryVersion((v) => v + 1)
      setLoungeDockPanel('search')
    },
    [
      closeProfileModal,
      finalizeLoungePostDetailClose,
      loungeFeedBrowseMode,
      loungePostDetail?.id,
      loungeReadOnly,
      onRequireAuth,
      profileModalOpen,
      pushLoungeNavReturnContext,
    ],
  )

  const openLoungePostById = useCallback(
    async (postId, opts = {}) => {
      const raw = String(postId || '').trim()
      if (!isLoungePostShareId(raw)) return
      let postRow = communityPosts.find((p) => p.id === raw)
      if (!postRow) {
        const { data, error } = await supabaseClient
          .from('community_feed_posts')
          .select(LOUNGE_SINGLE_POST_SELECT)
          .eq('id', raw)
          .is('hidden_at', null)
          .maybeSingle()
        if (error || !data) return
        const hydrated = await hydrateCommunityPosts([data])
        postRow = hydrated?.[0] || null
        if (postRow) {
          setCommunityPosts((prev) => (prev.some((p) => p.id === postRow.id) ? prev : [postRow, ...prev]))
        }
      }
      if (postRow) {
        openLoungePostDetail(postRow, {
          fromPublicLink: opts.fromPublicLink === true,
          skipNavCapture: opts.skipNavCapture === true,
        })
      }
    },
    [communityPosts, hydrateCommunityPosts, openLoungePostDetail, setCommunityPosts, supabaseClient],
  )

  const openCaptionLink = useCallback(
    (href, e) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      const url = String(href || '').trim()
      if (!url) return
      const postId = parseLoungePostIdFromUrl(url)
      if (postId) {
        pushLoungeNavReturnContext()
        void openLoungePostById(postId, { skipNavCapture: true })
        return
      }
      const handle = parseLoungeProfileHandleFromUrl(url)
      if (handle) {
        void openProfileByHandle(handle, e)
        return
      }
      const guideSlug = parseGuideSlugFromUrlOrScheme(url)
      if (guideSlug) {
        onOpenGuideCard?.(guideSlug)
        return
      }
      const openHref = hrefForExternalOpen(url)
      if (!openHref) return
      try {
        window.open(openHref, '_blank', 'noopener,noreferrer')
      } catch {
        /* */
      }
    },
    [openLoungePostById, openProfileByHandle, onOpenGuideCard, pushLoungeNavReturnContext],
  )

  const openLinkPreview = useCallback(
    (preview, e) => {
      e?.stopPropagation?.()
      e?.preventDefault?.()
      const postId = preview?.lounge_post_id
      if (postId && isLoungePostShareId(String(postId))) {
        void openLoungePostById(String(postId), { fromPublicLink: true })
        return
      }
      openCaptionLink(preview?.url, e)
    },
    [openCaptionLink, openLoungePostById],
  )

  const loungePostDetailRichCaptionOpts = useMemo(
    () => ({
      hashtagClassName: 'font-semibold text-cyan-300',
      linkClassName:
        'font-medium text-sky-400 underline underline-offset-2 decoration-sky-400/70 break-words',
      onMentionClick: openProfileByHandle,
      onHashtagClick: openSearchByHashtag,
      onLinkClick: openCaptionLink,
    }),
    [openCaptionLink, openProfileByHandle, openSearchByHashtag],
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
      onLinkClick: openCaptionLink,
      onLinkPreviewOpen: openLinkPreview,
      viewerFollowingUserIds: loungeReadOnly ? null : loungeFollowingUserIds,
      onFollowUser: loungeReadOnly ? undefined : handleLoungeFollowUser,
      feedVideoAutoplayEnabled: loungeFeedVideoAutoplayEnabled,
      onFeedVideoAutoplayChange: onLoungeFeedVideoAutoplayChange,
      onOpenGuideCard,
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
      openCaptionLink,
      openLinkPreview,
      loungeFollowingUserIds,
      handleLoungeFollowUser,
      loungeFeedVideoAutoplayEnabled,
      onLoungeFeedVideoAutoplayChange,
      onOpenGuideCard,
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

  const notificationInteractionProps = useMemo(
    () => ({
      loungeReadOnly,
      interactionStateFor,
      interactionStateForComment,
      toggleInteraction,
      toggleBookmark,
      bookmarkedByPost,
      onPlainRepost: handlePlainRepost,
      onUndoPlainRepost: (p) => {
        void undoPlainRepostForOriginal(p.id)
      },
      onRemoveQuoteRepost: openRemoveQuoteRepostForPost,
      onQuoteRepost: openQuoteRepostComposer,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      onOpenComments: openLoungePostDetail,
      onToggleCommentLike: toggleLoungeDetailCommentLike,
      onToggleCommentBookmark: toggleLoungeDetailCommentBookmark,
      getCommentBookmarked: getLoungeDetailCommentBookmarked,
      onCommentPlainRepost: (p) => void addLoungeDetailCommentPlainRepost(p.id),
      onCommentUndoPlainRepost: (p) => void undoLoungeDetailCommentPlainRepost(p.id),
      commentToggleInteraction: noopLoungeBarPostToggle,
      repostActionBusy: repostManageBusy,
      refreshPostInteractions: refreshLoungePostInteractions,
      hydrateCommentInteractionsForIds: hydrateCommentInteractionsForIds,
      onMentionClick: openProfileByHandle,
      onHashtagClick: openSearchByHashtag,
      onLinkClick: openCaptionLink,
      onLinkPreviewOpen: openLinkPreview,
      onOpenGuideCard,
    }),
    [
      loungeReadOnly,
      interactionStateFor,
      interactionStateForComment,
      toggleInteraction,
      toggleBookmark,
      bookmarkedByPost,
      handlePlainRepost,
      undoPlainRepostForOriginal,
      openRemoveQuoteRepostForPost,
      openQuoteRepostComposer,
      requireLoungeAuth,
      openProfileGateIfNeeded,
      openLoungePostDetail,
      toggleLoungeDetailCommentLike,
      toggleLoungeDetailCommentBookmark,
      getLoungeDetailCommentBookmarked,
      addLoungeDetailCommentPlainRepost,
      undoLoungeDetailCommentPlainRepost,
      noopLoungeBarPostToggle,
      repostManageBusy,
      refreshLoungePostInteractions,
      hydrateCommentInteractionsForIds,
      openProfileByHandle,
      openSearchByHashtag,
      openCaptionLink,
      openLinkPreview,
      onOpenGuideCard,
    ],
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
  const loungeDockSuppressed = useSyncExternalStore(
    subscribeLoungeDockSuppressed,
    getLoungeDockSuppressed,
    () => false,
  )
  const loungeDockFabBottomObstaclePx = loungePostUploadBar ? loungeUploadBarHeightPx + 10 : 0
  const toolScrollTitleReveal = useEdgeTitleBarReveal()

  const showLoungeViewportDock = !loungeStreamLightboxOpen && !loungeDockSuppressed
  const loungeDockPanelChrome =
    loungeDockPanel ?? (!isActivePage ? 'awayFromFeed' : null)
  const loungeDockReveal = !isActivePage
    ? toolScrollTitleReveal
    : loungePostDetail?.id
      ? loungePostDetailTitleReveal
      : loungeProfileScreenOpen
        ? loungeProfileDockReveal
        : loungeDockPanel
          ? loungePanelTitleReveal
          : loungeTitleReveal
  const loungeDockBottomObstaclePx = isActivePage ? loungeDockFabBottomObstaclePx : 0
  const loungeFeedHomeActive = isActivePage && !loungeDockPanel
  const loungeDockStackAboveSlidePanel =
    loungeDockPanel === 'search' ||
    loungeDockPanel === 'notifications' ||
    loungeDockPanel === 'settings'
  const loungeDockStackAboveDetailOrProfile = Boolean(
    loungePostDetail?.id || loungeProfileScreenOpen,
  )
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
        chatUnreadCount: chatUnreadRoomCount,
        feedHomeActive: loungeFeedHomeActive,
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
      chatUnreadRoomCount,
      loungeFeedHomeActive,
    ],
  )

  const loungeDockCarousel = showLoungeViewportDock ? (
    <LoungeDockArcCarouselPrototype
      items={loungeDockWheelItems}
      cornerLItems={loungeDockCornerLItems}
      reveal={loungeDockReveal}
      panelChrome={loungeDockPanelChrome}
      menuLayout={loungeDockMenuLayout}
      bottomObstacleInsetPx={loungeDockBottomObstaclePx}
      onPointerBlockChange={setLoungeFabPointerBlocked}
      notificationsUnreadCount={loungeNotificationsUnread}
      enableFabCompactPip={
        !isActivePage || loungeDockStackAboveSlidePanel || loungeDockStackAboveDetailOrProfile
      }
      stackAboveSlidePanel={loungeDockStackAboveSlidePanel}
      stackAboveDetailOrProfile={loungeDockStackAboveDetailOrProfile}
      fabDetailShellCompact={Boolean(loungePostDetail?.id)}
    />
  ) : null

  const loungeMarketFeedPosts = useMemo(() => {
    if (!loungePostDetail?.id) return communityPosts
    if (communityPosts.some((p) => p.id === loungePostDetail.id)) return communityPosts
    return [loungePostDetail, ...communityPosts]
  }, [communityPosts, loungePostDetail])

  return (
    <div
      className={`mx-auto flex h-dvh max-h-dvh min-h-0 w-full max-w-2xl flex-col overflow-hidden bg-zinc-950 pt-[max(0px,env(safe-area-inset-top))] pb-0`}
    >
      <LoungeStreamLightboxProvider ctx={loungeStreamLightboxCtx}>
      <LoungeMarketFeedProvider
        supabaseClient={supabaseClient}
        posts={loungeMarketFeedPosts}
        feedActive={isActivePage}
      >
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
      {/* Fixed title bar: hidden while dock slide panel is open. */}
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
          <PwaInstallTitleBarRow
            rowClassName={LOUNGE_FEED_TITLE_BAR_ROW_CLASS}
            logo={<EdgeLogoWithEasterEgg className={loungeTitleLogoClassName} />}
            navSlot={
              <>
                <TitleBarStatusLine
                  loading={communityFeedLoading}
                  showBuildBadge={loungeTitleBarShowBuildBadge}
                />
                {titleBarNavSlot}
              </>
            }
          />
        </div>
      ) : null}

      {/* LOUNGE_DOCK_FOOTER_BAR_DISABLED - see import above
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

      {isActivePage ? loungeDockCarousel : null}

      {!isActivePage && loungeDockCarousel && typeof document !== 'undefined'
        ? createPortal(loungeDockCarousel, document.body)
        : null}

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
            composerExpanded ? 'pt-3 pb-1.5' : 'py-3'
          }`}
        >
        {composerExpanded && composerFoldReveal > 0.14 ? (
          <div className="absolute right-3 top-3 z-10">
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
                setPostErr('')
                composerFoldedFromFeedScrollRef.current = false
                composerFoldRevealRef.current = 0
                setComposerFoldReveal(0)
                composerExpandedRef.current = false
                setComposerExpanded(false)
                clearLoungeComposerDraft()
                try {
                  clearComposerMediaInputs()
                } catch {
                  // ignore
                }
              }}
              className="flex h-6 w-6 shrink-0 touch-manipulation items-center justify-center rounded-full bg-zinc-800/95 text-zinc-500 shadow-sm hover:bg-zinc-700 hover:text-zinc-200 active:text-white [-webkit-tap-highlight-color:transparent]"
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
          </div>
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
                <div className="mt-0.5 flex min-h-[6.5rem] flex-col">
                  <div ref={mentionComposerAnchorRef} className="pr-8">
                    <LoungeRichComposerField
                      ref={composerFieldRef}
                      variant="feed"
                      value={postText}
                      onChange={setPostText}
                      maxLength={LOUNGE_CAPTION_MAX}
                      placeholder="Are ya winning, son?"
                      ariaLabel="Lounge post caption"
                      onKeyDown={(e) => {
                        mentionComposer.onMentionKeyDown(e, setPostText, composerFieldRef.current)
                      }}
                      onKeyUp={(e) => {
                        mentionComposer.onCursorMove(e)
                      }}
                      onMouseUp={(e) => {
                        mentionComposer.onCursorMove(e)
                      }}
                      onInput={(e) => {
                        mentionComposer.onCursorMove(e)
                      }}
                      onBlur={() =>
                        window.setTimeout(() => {
                          mentionComposer.clearMention()
                        }, 150)
                      }
                    />
                    <LoungeMentionDropdown
                      suggestions={mentionComposer.suggestions}
                      activeIndex={mentionComposer.activeIndex}
                      loading={mentionComposer.loading}
                      onSelect={(p) => mentionComposer.onMentionSelect(p, setPostText, composerFieldRef.current)}
                      anchorRef={mentionComposerAnchorRef}
                      caretFieldRef={composerFieldRef}
                    />
                    <LoungeComposerMarketSymbolPills
                      symbols={composerMarketSymbols}
                      onChange={setComposerMarketSymbols}
                      className="mt-1.5"
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
                  focusLoungeComposerCaption(() => composerFieldRef.current, {
                    scrollFeedToTop: scrollLoungeFeedToTopInstant,
                  })
                  scheduleLoungeComposerTextareaFocus({
                    getTextarea: () => composerFieldRef.current,
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
            <LoungePostCategoryPillPicker
              value={composerCategoryPills}
              onChange={setComposerCategoryPills}
              disabled={postBusy}
              className="mb-3"
            />
            <div
              className="mx-auto h-px w-[90%] bg-zinc-700/85"
              role="presentation"
              aria-hidden
            />
            <input
              id={LOUNGE_COMPOSER_IMAGE_INPUT_ID}
              ref={composerImageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              {...loungeFileInputMediaPickerHandlers('composer')}
              onChange={handleComposerImageInputChange}
            />
            <input
              id={LOUNGE_COMPOSER_VIDEO_INPUT_ID}
              ref={composerVideoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              {...loungeFileInputMediaPickerHandlers('composer')}
              onChange={handleComposerVideoInputChange}
            />
            <div
              data-lounge-fab-obstacle
              className="lounge-media-toolbar mt-0.5 flex w-full items-center gap-1.5 pr-1 py-0.5"
            >
              <LoungeComposerMediaToolbar
                variant="feed"
                imageInputId={LOUNGE_COMPOSER_IMAGE_INPUT_ID}
                videoInputId={LOUNGE_COMPOSER_VIDEO_INPUT_ID}
                onImagePointerDown={() => beginLoungeComposerMediaPicker('composer')}
                onVideoPointerDown={() => beginLoungeComposerMediaPicker('composer')}
                onOpenGifPicker={() => openKlipyPicker('composer')}
                onOpenMarketPicker={() => openMarketPicker('composer')}
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openThreadComposeSheet()}
                className="flex shrink-0 touch-manipulation items-center justify-center rounded-md p-1 text-sky-400 hover:text-sky-300 active:text-sky-200 [-webkit-tap-highlight-color:transparent]"
                title="Start a thread"
                aria-label="Start a thread"
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
                    d="M10 6.75v6.5M6.75 10h6.5"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                <div className="inline-flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={openLoungeDraftsSheet}
                    className="shrink-0 touch-manipulation rounded-md px-1 py-0.5 text-[12px] font-semibold text-zinc-400 hover:text-zinc-200 [-webkit-tap-highlight-color:transparent]"
                  >
                    Drafts{loungeDraftCount > 0 ? ` (${loungeDraftCount})` : ''}
                  </button>
                  <LoungeComposerCharRing
                    len={postText.length}
                    max={LOUNGE_CAPTION_MAX}
                    aria-live="polite"
                  />
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
                        !composerVideoSlot &&
                        composerMarketSymbols.length === 0 &&
                        extractCashtagsFromCaption(postText).length === 0)
                    }
                    className="lounge-composer-post-btn min-h-7 shrink-0 touch-manipulation rounded-md px-2 py-0.5 text-[13px] font-bold leading-tight disabled:cursor-not-allowed disabled:opacity-40"
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
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  className="order-3 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-1"
                  onClick={() => {
                    setComposerDiscardPromptOpen(false)
                    void saveComposerAsServerDraft()
                  }}
                >
                  Save draft
                </button>
                <button
                  type="button"
                  className="order-2 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-2"
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
                    setPostErr('')
                    setLoungeComposerActiveDraftId(null)
                    composerFoldedFromFeedScrollRef.current = false
                    composerFoldRevealRef.current = 0
                    setComposerFoldReveal(0)
                    composerExpandedRef.current = false
                    setComposerExpanded(false)
                    clearLoungeComposerDraft()
                    try {
                      clearComposerMediaInputs()
                    } catch {
                      // ignore
                    }
                  }}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="order-1 min-h-11 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 touch-manipulation sm:order-3"
                  onClick={() => setComposerDiscardPromptOpen(false)}
                >
                  Keep writing
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="shrink-0 px-3 pt-1 pb-[5px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
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
            <LoungeFeedCategoryFilter
              value={loungeFeedCategoryExcludedSlugs}
              onChange={onLoungeFeedCategoryFilterChange}
              disabled={communityFeedLoading && communityPosts.length === 0}
              className="shrink-0"
            />
          </div>
        </div>

        <LoungePullRefreshZone
          pullRefreshZoneRef={pullRefreshZoneRef}
          pullIndicatorOverlayRef={pullIndicatorOverlayRef}
          pullIndicatorWrapRef={pullIndicatorWrapRef}
          pullArrowRef={pullArrowRef}
          pullSpinnerRef={pullSpinnerRef}
          pullAriaRef={pullAriaRef}
          pullPostsWrapRef={pullPostsWrapRef}
        >
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
          ) : loungeFeedCategoryExcludedSlugs?.length > 0 ? (
            <div className="px-3 py-5 text-zinc-400 text-[17px] leading-relaxed">
              No posts match your tribe settings. Open Tribes and tap dimmed pills to show them again, or reset with
              Show all tribes.
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
                style={feedPostRowPerfStyle}
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
                  feedEditSavePending={loungeFeedPostEditPendingPostId === post.id}
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
                  onPostBodyClick={openLoungePostDetail}
                  onStreamLightboxOpenDetail={openLoungeStreamLightboxDetail}
                  onMentionClick={openProfileByHandle}
                  onHashtagClick={openSearchByHashtag}
                  onLinkClick={openCaptionLink}
                  onLinkPreviewOpen={openLinkPreview}
                  viewerFollowingUserIds={loungeReadOnly ? null : loungeFollowingUserIds}
                  onFollowUser={loungeReadOnly ? undefined : handleLoungeFollowUser}
                  feedVideoAutoplayEnabled={loungeFeedVideoAutoplayEnabled}
                  onFeedVideoAutoplayChange={onLoungeFeedVideoAutoplayChange}
                  onOpenGuideCard={onOpenGuideCard}
                  onOpenMarketChart={openMarketChartModal}
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
        </LoungePullRefreshZone>
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
                            cancelLoungeDetailEditMediaPrep()
                            setLoungeDetailEditImageItems([])
                            setLoungeDetailEditVideoSlot(null)
                            try {
                              clearHiddenFileInputs(
                                loungeDetailEditImageInputRef.current,
                                loungeDetailEditVideoInputRef.current,
                              )
                            } catch {
                              // ignore
                            }
                            setLoungeDetailDraftCaption(feedPostDisplayCaption(loungePostDetail))
                            const seed = feedPostAuthorEditMediaSeed(loungePostDetail)
                            setLoungeDetailEditImageUrls(seed.imageUrls)
                            setLoungeDetailEditMediaUrl(String(seed.gifUrl || '').trim())
                            setLoungeDetailEditKeepStreamUid(feedPostStreamVideoUid(loungePostDetail) || null)
                            setLoungeDetailEditCategoryPills(displayPostCategoryPills(loungePostDetail))
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

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              ref={loungePostDetailScrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]"
              style={
                loungeReadOnly
                  ? undefined
                  : { paddingBottom: loungeDetailCommentFooterInsetPx }
              }
            >
              <LoungeFeedVideoAutoplayProvider
                scrollRootRef={loungePostDetailScrollRef}
                showDebugHud={
                  loungeStaffToolsEnabled &&
                  loungeFeedVideoDebugEnabled &&
                  Boolean(loungePostDetail?.id)
                }
              >
              <LoungeFeedInlineSoundResetBinder resetRef={resetPostDetailInlineSoundRef} />
              <div
                aria-hidden
                className="shrink-0"
                style={{
                  height: loungePostDetailTitleBarHeight > 0 ? loungePostDetailTitleBarHeight : 56,
                }}
              />
              <div className="px-4 py-4 pb-4">
              {loungeManageErr ? (
                <div className="mb-4 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
                  {loungeManageErr}
                </div>
              ) : null}

              <>
              <div
                ref={loungePostDetailConnectorActive ? loungePostDetailCommentConnectorRef : undefined}
                className={loungePostDetailConnectorActive ? 'relative' : ''}
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
                  {loungeDetailDeleteBusy ||
                  (loungeFeedDeleteBusyPostId &&
                    loungeFeedDeleteBusyPostId === loungePostDetail.id) ? (
                    <LoungeFeedPendingStatusRow className="mt-1">Deleting post…</LoungeFeedPendingStatusRow>
                  ) : null}
                </div>
              </div>

              {loungePostDetail.game_slug && !loungePostDetail.is_ap_guide_post ? (
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

              {!loungeDetailEditing && displayPostCategoryPills(loungePostDetail).length > 0 ? (
                <div
                  className={`flex justify-start ${
                    loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                  } ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}
                >
                  <LoungePostCategoryPillRow pills={displayPostCategoryPills(loungePostDetail)} />
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
                    <LoungeRichComposerField
                      ref={loungeDetailEditFieldRef}
                      variant="detailEdit"
                      autoGrow
                      value={loungeDetailDraftCaption}
                      onChange={setLoungeDetailDraftCaption}
                      maxLength={LOUNGE_CAPTION_MAX}
                      placeholder="Are ya winning, son?"
                      ariaLabel="Edit caption"
                      disabled={loungeDetailEditBusy}
                    />
                    <LoungeComposerMarketSymbolPills
                      symbols={loungeDetailEditMarketSymbols}
                      onChange={setLoungeDetailEditMarketSymbols}
                      className="mt-1.5"
                    />
                    {loungeDetailEditErr ? (
                      <div className="mt-2 rounded-xl border border-rose-500/45 bg-rose-950/25 px-3 py-2 text-[14px] leading-tight text-rose-200">
                        {loungeDetailEditErr}
                      </div>
                    ) : null}
                    <LoungePostCategoryPillPicker
                      value={loungeDetailEditCategoryPills}
                      onChange={setLoungeDetailEditCategoryPills}
                      disabled={loungeDetailEditBusy}
                    />
                  </div>
                  {(() => {
                    const gifUrl = String(loungeDetailEditMediaUrl || '').trim()
                    const localPreviews = loungeDetailEditImageItems.map((x) => x.preview)
                    const remoteUrls = loungeDetailEditImageUrls
                    const carouselUrls = gifUrl
                      ? [...remoteUrls, ...localPreviews, gifUrl]
                      : [...remoteUrls, ...localPreviews]
                    const nRemote = remoteUrls.length
                    const nLocal = localPreviews.length
                    return (
                      <>
                        {carouselUrls.length > 0 ? (
                          <LoungeImageCarousel
                            urls={carouselUrls}
                            variant="composer"
                            firstMarginTopClass="mt-3"
                            regionAriaLabel={gifUrl ? 'Post images and GIF' : 'Post images'}
                            removeLabelForIndex={(i) => {
                              if (i < nRemote) return 'Remove image'
                              if (i < nRemote + nLocal) return 'Remove image'
                              return 'Remove GIF'
                            }}
                            onRemoveIndex={(i) => {
                              if (i < nRemote) {
                                setLoungeDetailEditImageUrls((prev) => prev.filter((_, j) => j !== i))
                              } else if (i < nRemote + nLocal) {
                                setLoungeDetailEditImageItems((prev) => {
                                  const row = prev[i - nRemote]
                                  if (row?.preview) {
                                    try {
                                      URL.revokeObjectURL(row.preview)
                                    } catch {
                                      // ignore
                                    }
                                  }
                                  return prev.filter((_, j) => j !== i - nRemote)
                                })
                              } else {
                                setLoungeDetailEditMediaUrl('')
                              }
                            }}
                          />
                        ) : null}
                        {loungeDetailEditKeepStreamUid && !loungeDetailEditVideoSlot ? (
                          <div className="relative mt-3 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                            {loungePostDetail?.stream_poster_url ? (
                              <img
                                src={loungePostDetail.stream_poster_url}
                                alt=""
                                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setLoungeDetailEditKeepStreamUid(null)}
                              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
                              aria-label="Remove video"
                              title="Remove video"
                            >
                              ×
                            </button>
                          </div>
                        ) : null}
                        {loungeDetailEditVideoSlot ? (
                          <div className="relative mt-3 inline-flex max-w-[min(78vw,18rem)] shrink-0 self-start overflow-hidden rounded-xl border border-zinc-700/80 bg-black leading-none">
                            {!loungeDetailEditVideoSlot.file && loungeDetailEditVideoSlot.preview ? (
                              <img
                                src={loungeDetailEditVideoSlot.preview}
                                alt=""
                                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                              />
                            ) : loungeDetailEditVideoSlot.preview ? (
                              <video
                                src={loungeDetailEditVideoSlot.preview}
                                poster={loungeDetailEditVideoSlot.posterUrl || undefined}
                                className="block h-auto max-h-40 w-auto max-w-[min(78vw,18rem)] object-contain"
                                controls
                                playsInline
                                preload="metadata"
                                aria-label="Video preview"
                              />
                            ) : null}
                            <button
                              type="button"
                              onClick={() => cancelLoungeDetailEditMediaPrep()}
                              className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-500/35 bg-black/25 text-base leading-none text-zinc-100 shadow-sm backdrop-blur-[2px] touch-manipulation hover:bg-black/45 active:bg-black/55"
                              aria-label="Remove video"
                              title="Remove video"
                            >
                              ×
                            </button>
                          </div>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              ) : isQuoteRepostPost(loungePostDetail) ? (
                <>
                  {loungeDetailShowsCaption(loungePostDetail) ? (
                    <div
                      className={`text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      } ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}
                    >
                      <LoungeExpandableRichCaption
                        text={loungeDetailCaptionDisplayText(loungePostDetail)}
                        captionOpts={loungePostDetailRichCaptionOpts}
                      />
                    </div>
                  ) : null}
                  {loungePostDetail.link_preview ? (
                    <div
                      className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                    >
                      <LoungeLinkPreviewBlock
                        preview={loungePostDetail.link_preview}
                        className="mt-2"
                        onPreviewOpen={openLinkPreview}
                        youtubeIframeLoading="eager"
                      />
                    </div>
                  ) : null}
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
                    <LoungeMarketChartStrip
                      post={loungePostDetail}
                      onOpenChart={(embed, embeds) => openMarketChartModal({ embed, embeds })}
                    />
                  </div>
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
                    <LoungePostFeedImagesAndGif
                      post={loungePostDetail}
                      variant="detail"
                      firstMarginTopClass={
                        loungeDetailShowsCaption(loungePostDetail) || loungePostDetail.link_preview
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

                  <div className={LOUNGE_COMMENT_DETAIL_THREAD_PAD}>
                    {quoteRepostOriginalUnavailable(loungePostDetail) ? (
                      <LoungePostOriginalUnavailableEmbed
                        post={loungePostDetail}
                        className="mt-3"
                        variant="detail"
                      />
                    ) : loungePostDetail.reposted_post ? (
                    <div
                      role="button"
                      tabIndex={0}
                      data-lounge-original-embed
                      aria-label="View original post"
                      onClick={(e) => {
                        if (e.target instanceof Element && e.target.closest('button, a')) {
                          e.stopPropagation()
                          return
                        }
                        void openLoungePostDetail(loungePostDetail.reposted_post)
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' && e.key !== ' ') return
                        if (e.target !== e.currentTarget) return
                        e.preventDefault()
                        void openLoungePostDetail(loungePostDetail.reposted_post)
                      }}
                      className="mt-3 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
                    >
                    <LoungeQuoteRepostEmbedAuthorMeta
                      post={loungePostDetail.reposted_post}
                      displayNameFor={displayNameFor}
                      handleFor={handleFor}
                      postAgeLabel={postAgeLabel}
                    />
                    {loungeDetailCaptionDisplayText(loungePostDetail.reposted_post) ? (
                      <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 whitespace-pre-wrap break-words">
                        <LoungeExpandableRichCaption
                          text={loungeDetailCaptionDisplayText(loungePostDetail.reposted_post)}
                          captionOpts={loungePostDetailRichCaptionOpts}
                        />
                      </div>
                    ) : null}
                    <LoungeLinkPreviewBlock
                      preview={loungePostDetail.reposted_post.link_preview}
                      className="mt-2"
                      onPreviewOpen={openLinkPreview}
                    />
                    <LoungeMarketChartStrip
                      post={loungePostDetail.reposted_post}
                      className="mt-2"
                      onOpenChart={(embed, embeds) => openMarketChartModal({ embed, embeds })}
                    />
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
                    {loungePostDetail.reposted_post.is_ap_guide_post && loungePostDetail.reposted_post.game_slug ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenGuideCard?.(loungePostDetail.reposted_post.game_slug)
                        }}
                        className="mt-2 w-full text-left rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/80 hover:border-zinc-600 active:border-cyan-700/60 transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        aria-label={`View AP Guide: ${loungePostDetail.reposted_post.game_title}`}
                      >
                        <div className="relative h-40 bg-gradient-to-br from-amber-950/60 to-zinc-900 overflow-hidden">
                          {loungePostDetail.reposted_post.guide_thumbnail_url ? (
                            <img
                              src={loungePostDetail.reposted_post.guide_thumbnail_url}
                              alt=""
                              className="h-full w-full object-cover opacity-80"
                              loading="lazy"
                              decoding="async"
                              onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                            />
                          ) : null}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <div className="absolute bottom-0 inset-x-0 px-2.5 pb-2 flex flex-col items-start gap-1">
                            <p className="text-[#fff] font-bold text-xs leading-tight truncate w-full">{loungePostDetail.reposted_post.game_title}</p>
                            <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                              AP Guide
                            </span>
                          </div>
                        </div>
                      </button>
                    ) : null}
                    </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  {loungeDetailShowsCaption(loungePostDetail) ? (
                    <div
                      className={`text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 ${
                        loungePostDetail.game_slug ? 'mt-1.5' : 'mt-4'
                      } ${loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}`}
                    >
                      <LoungeExpandableRichCaption
                        text={loungeDetailCaptionDisplayText(loungePostDetail)}
                        captionOpts={loungePostDetailRichCaptionOpts}
                      />
                    </div>
                  ) : null}
                  {loungePostDetail.link_preview ? (
                    <div
                      className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                    >
                      <LoungeLinkPreviewBlock
                        preview={loungePostDetail.link_preview}
                        className="mt-2"
                        onPreviewOpen={openLinkPreview}
                        youtubeIframeLoading="eager"
                      />
                    </div>
                  ) : null}
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
                    <LoungeMarketChartStrip
                      post={loungePostDetail}
                      onOpenChart={(embed, embeds) => openMarketChartModal({ embed, embeds })}
                    />
                  </div>
                  <div
                    className={loungeCommentDetailPathIds.length > 0 ? LOUNGE_COMMENT_DETAIL_THREAD_PAD : ''}
                  >
                    <LoungePostFeedImagesAndGif
                      post={loungePostDetail}
                      variant="detail"
                      firstMarginTopClass={
                        loungeDetailShowsCaption(loungePostDetail) || loungePostDetail.link_preview
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
                    {/* AP Guide embed card - detail view */}
                    {loungePostDetail.is_ap_guide_post && loungePostDetail.game_slug ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenGuideCard?.(loungePostDetail.game_slug)
                        }}
                        className="mt-3 w-full text-left rounded-2xl overflow-hidden border border-zinc-700/80 bg-zinc-900/80 hover:border-zinc-600 active:border-cyan-700/60 transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]"
                        aria-label={`View AP Guide: ${loungePostDetail.game_title}`}
                      >
                        <div className="relative h-56 bg-gradient-to-br from-amber-950/60 to-zinc-900 overflow-hidden">
                          {loungePostDetail.guide_thumbnail_url ? (
                            <img
                              src={loungePostDetail.guide_thumbnail_url}
                              alt=""
                              className="h-full w-full object-cover opacity-80"
                              loading="lazy"
                              decoding="async"
                              onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                            />
                          ) : null}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                          <div className="absolute bottom-0 inset-x-0 px-3 pb-2.5 flex flex-col items-start gap-1">
                            <p className="text-[#fff] font-bold text-sm leading-tight truncate w-full">{loungePostDetail.game_title}</p>
                            <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                              AP Guide
                            </span>
                          </div>
                        </div>
                      </button>
                    ) : null}
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
                const commentBubbleD = LOUNGE_COMMENT_BUBBLE_D
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
                          id={LOUNGE_DETAIL_EDIT_IMAGE_INPUT_ID}
                          ref={loungeDetailEditImageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          {...loungeFileInputMediaPickerHandlers('detailEdit')}
                          onChange={(e) => handleDetailEditMediaInputChange(e, 'image')}
                        />
                        <input
                          id={LOUNGE_DETAIL_EDIT_VIDEO_INPUT_ID}
                          ref={loungeDetailEditVideoInputRef}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          {...loungeFileInputMediaPickerHandlers('detailEdit')}
                          onChange={(e) => handleDetailEditMediaInputChange(e, 'video')}
                        />
                        <div className="lounge-media-toolbar mb-0.5 flex w-full items-center gap-1.5 pr-1 py-0.5">
                          <LoungeComposerMediaToolbar
                            variant="feed"
                            imageInputId={LOUNGE_DETAIL_EDIT_IMAGE_INPUT_ID}
                            videoInputId={LOUNGE_DETAIL_EDIT_VIDEO_INPUT_ID}
                            onImagePointerDown={() => beginLoungeComposerMediaPicker('detailEdit')}
                            onVideoPointerDown={() => beginLoungeComposerMediaPicker('detailEdit')}
                            onOpenGifPicker={() => openKlipyPicker('detailEdit')}
                            onOpenMarketPicker={() => openMarketPicker('detailEdit')}
                          />
                          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                            <LoungeComposerCharRing
                              len={loungeDetailDraftCaption.length}
                              max={LOUNGE_CAPTION_MAX}
                              aria-live="polite"
                            />
                            <button
                              type="button"
                              onClick={() => void saveLoungeDetailCaption()}
                              disabled={
                                loungeDetailEditVideoPostBlocked ||
                                (!normalizeFeedCaption(loungeDetailDraftCaption) &&
                                  loungeDetailEditImageItems.length === 0 &&
                                  loungeDetailEditImageUrls.length === 0 &&
                                  !String(loungeDetailEditMediaUrl || '').trim() &&
                                  !loungeDetailEditVideoSlot &&
                                  !loungeDetailEditKeepStreamUid &&
                                  loungeDetailEditMarketSymbols.length === 0)
                              }
                              className="min-h-8 shrink-0 touch-manipulation rounded-md bg-cyan-600 px-2 py-1 text-[14px] font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}
                    <div
                      className={`flex w-full min-w-0 flex-nowrap items-center justify-between py-0.5 text-[16px] ${loungeDetailEditing ? 'mt-1' : ''}`}
                      onClick={(e) => e.stopPropagation()}
                      role="group"
                      data-lounge-post-interaction-bar
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
                            className={`block shrink-0 h-[24px] w-[24px] ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS} ${commentClass}`}
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

              {loungeCommentDetailPathIds.length === 0 &&
              !loungeDetailCommentsLoading &&
              loungeDetailThreadPartsSorted.length > 0 ? (
                <LoungePostThreadPartsHierarchy
                  threadParts={loungeDetailThreadPartsSorted}
                  descendantCountByCommentId={loungeDetailDescendantCountByCommentId}
                  onOpenCommentThread={openLoungeCommentDrillFromRoots}
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
                    onQuoteRepost: openQuoteRepostComposerForComment,
                    onRemoveQuoteRepost: openRemoveQuoteRepostForComment,
                    toggleBookmark: noopLoungeBarPostToggle,
                    bookmarkedByPost,
                    onToggleCommentLike: toggleLoungeDetailCommentLike,
                    onToggleCommentBookmark: toggleLoungeDetailCommentBookmark,
                    getCommentBookmarked: getLoungeDetailCommentBookmarked,
                    repostActionBusy: repostManageBusy,
                    onAvatarClickProfile: openAuthorProfile,
                    positionScrollRootRef: loungePostDetailScrollRef,
                    onCommentMenuDelete: deleteLoungeDetailComment,
                    onCommentMenuBlock: onCommentMenuBlockFromDetail,
                    onCommentMenuReport: onCommentMenuReportFromDetail,
                    onCommentMenuEdit: beginLoungeDetailCommentEdit,
                    busyDeletingCommentId: loungeDetailCommentDeleteBusyId,
                    commentEditSavePendingCommentId: loungeDetailCommentEditPendingCommentId,
                    editingCommentId: loungeDetailCommentEditingId,
                    commentEditDraft: loungeDetailCommentEditDraft,
                    onCommentEditDraftChange: setLoungeDetailCommentEditDraft,
                    onCommentEditSave: saveLoungeDetailCommentEdit,
                    onCommentEditCancel: cancelLoungeDetailCommentEdit,
                    commentEditBusy: loungeDetailCommentEditBusy,
                    commentEditHasRemoteMedia: loungeDetailCommentEditHasMedia,
                    commentEditMediaSlot: loungeDetailCommentEditMediaSlot,
                    commentEditFieldRef: loungeDetailCommentEditFieldRef,
                    commentEditVideoPostBlocked: loungeDetailCommentEditVideoPostBlocked,
                    onMentionClick: openProfileByHandle,
                    onHashtagClick: openSearchByHashtag,
                    onLinkClick: openCaptionLink,
                    onLinkPreviewOpen: openLinkPreview,
                    youtubeIframeLoading: 'eager',
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
                    onQuoteRepost: openQuoteRepostComposerForComment,
                    onRemoveQuoteRepost: openRemoveQuoteRepostForComment,
                    toggleBookmark: noopLoungeBarPostToggle,
                    bookmarkedByPost,
                    onToggleCommentLike: toggleLoungeDetailCommentLike,
                    onToggleCommentBookmark: toggleLoungeDetailCommentBookmark,
                    getCommentBookmarked: getLoungeDetailCommentBookmarked,
                    repostActionBusy: repostManageBusy,
                    onAvatarClickProfile: openAuthorProfile,
                    positionScrollRootRef: loungePostDetailScrollRef,
                    onCommentMenuDelete: deleteLoungeDetailComment,
                    onCommentMenuBlock: onCommentMenuBlockFromDetail,
                    onCommentMenuReport: onCommentMenuReportFromDetail,
                    onCommentMenuEdit: beginLoungeDetailCommentEdit,
                    busyDeletingCommentId: loungeDetailCommentDeleteBusyId,
                    commentEditSavePendingCommentId: loungeDetailCommentEditPendingCommentId,
                    editingCommentId: loungeDetailCommentEditingId,
                    commentEditDraft: loungeDetailCommentEditDraft,
                    onCommentEditDraftChange: setLoungeDetailCommentEditDraft,
                    onCommentEditSave: saveLoungeDetailCommentEdit,
                    onCommentEditCancel: cancelLoungeDetailCommentEdit,
                    commentEditBusy: loungeDetailCommentEditBusy,
                    commentEditHasRemoteMedia: loungeDetailCommentEditHasMedia,
                    commentEditMediaSlot: loungeDetailCommentEditMediaSlot,
                    commentEditFieldRef: loungeDetailCommentEditFieldRef,
                    resolveMediaFeedVariant: (c) =>
                      c?.id === loungeDetailCommentHierarchyFocusId ? 'detail' : 'commentInline',
                    onMentionClick: openProfileByHandle,
                    onHashtagClick: openSearchByHashtag,
                    onLinkClick: openCaptionLink,
                    onLinkPreviewOpen: openLinkPreview,
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
                          onCommentMenuDelete={deleteLoungeDetailComment}
                          onCommentMenuBlock={onCommentMenuBlockFromDetail}
                          onCommentMenuReport={onCommentMenuReportFromDetail}
                          onCommentMenuEdit={beginLoungeDetailCommentEdit}
                          busyDeletingCommentId={loungeDetailCommentDeleteBusyId}
                          commentEditSavePendingCommentId={loungeDetailCommentEditPendingCommentId}
                          editingCommentId={loungeDetailCommentEditingId}
                          commentEditDraft={loungeDetailCommentEditDraft}
                          onCommentEditDraftChange={setLoungeDetailCommentEditDraft}
                          onCommentEditSave={saveLoungeDetailCommentEdit}
                          onCommentEditCancel={cancelLoungeDetailCommentEdit}
                          commentEditBusy={loungeDetailCommentEditBusy}
                          commentEditHasRemoteMedia={loungeDetailCommentEditHasMedia}
                          commentEditMediaSlot={loungeDetailCommentEditMediaSlot}
                          commentEditFieldRef={loungeDetailCommentEditFieldRef}
                          commentEditVideoPostBlocked={loungeDetailCommentEditVideoPostBlocked}
                          interactionStateFor={interactionStateForComment}
                          toggleInteraction={noopLoungeBarPostToggle}
                          onPlainRepost={(p) => void addLoungeDetailCommentPlainRepost(p.id)}
                          onUndoPlainRepost={(p) => void undoLoungeDetailCommentPlainRepost(p.id)}
                          onQuoteRepost={openQuoteRepostComposerForComment}
                          onRemoveQuoteRepost={openRemoveQuoteRepostForComment}
                          toggleBookmark={noopLoungeBarPostToggle}
                          bookmarkedByPost={bookmarkedByPost}
                          onToggleCommentLike={toggleLoungeDetailCommentLike}
                          onToggleCommentBookmark={toggleLoungeDetailCommentBookmark}
                          getCommentBookmarked={getLoungeDetailCommentBookmarked}
                          repostActionBusy={repostManageBusy}
                          onMentionClick={openProfileByHandle}
                          onHashtagClick={openSearchByHashtag}
                          onLinkClick={openCaptionLink}
                          onLinkPreviewOpen={openLinkPreview}
                          youtubeIframeLoading="eager"
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
                ref={loungeDetailCommentFooterRef}
                data-lounge-detail-comment-host
                className="pointer-events-none absolute inset-x-0 bottom-0 z-20"
              >
                <div
                  className="lounge-detail-comment-footer-gradient pointer-events-none absolute inset-x-0 bottom-full h-14"
                  aria-hidden
                />
                <div
                  className="lounge-detail-comment-footer-glass pointer-events-auto px-3 pt-2.5 pb-0"
                  style={{
                    // Keyboard open: `visualViewport` overlap already clears the keyboard - do not add
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
                  <div className="lounge-detail-comment-composer-glass relative shrink-0 rounded-2xl px-2.5 pt-2 pb-1">
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
                        <LoungeRichComposerField
                          ref={loungeDetailCommentFieldRef}
                          id="lounge-detail-comment"
                          variant="detailComment"
                          autoGrow
                          value={loungeDetailCommentDraft}
                          onChange={setLoungeDetailCommentDraft}
                          maxLength={LOUNGE_COMMENT_BODY_MAX}
                          placeholder={LOUNGE_DETAIL_COMMENT_PLACEHOLDER}
                          ariaLabel="Write a reply"
                          onKeyDown={(e) =>
                            mentionDetailComment.onMentionKeyDown(
                              e,
                              setLoungeDetailCommentDraft,
                              loungeDetailCommentFieldRef.current,
                            )
                          }
                          onKeyUp={mentionDetailComment.onCursorMove}
                          onMouseUp={mentionDetailComment.onCursorMove}
                          onInput={mentionDetailComment.onCursorMove}
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
                        />
                        <LoungeMentionDropdown
                          suggestions={mentionDetailComment.suggestions}
                          activeIndex={mentionDetailComment.activeIndex}
                          loading={mentionDetailComment.loading}
                          onSelect={(p) => mentionDetailComment.onMentionSelect(p, setLoungeDetailCommentDraft, loungeDetailCommentFieldRef.current)}
                          anchorRef={mentionDetailCommentAnchorRef}
                          caretFieldRef={loungeDetailCommentFieldRef}
                        />
                        </div>
                        <input
                          id={LOUNGE_DETAIL_COMMENT_IMAGE_INPUT_ID}
                          ref={loungeDetailCommentImageInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          {...loungeFileInputMediaPickerHandlers('detailComment')}
                          onChange={(e) => handleDetailCommentMediaInputChange(e, 'image')}
                        />
                        <input
                          id={LOUNGE_DETAIL_COMMENT_VIDEO_INPUT_ID}
                          ref={loungeDetailCommentVideoInputRef}
                          type="file"
                          accept="video/*"
                          className="hidden"
                          {...loungeFileInputMediaPickerHandlers('detailComment')}
                          onChange={(e) => handleDetailCommentMediaInputChange(e, 'video')}
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
                        <div className="lounge-media-toolbar mt-0.5 flex w-full items-center gap-1.5 pb-0 pt-1">
                          <LoungeComposerMediaToolbar
                            variant="compact"
                            imageInputId={LOUNGE_DETAIL_COMMENT_IMAGE_INPUT_ID}
                            videoInputId={LOUNGE_DETAIL_COMMENT_VIDEO_INPUT_ID}
                            onImagePointerDown={() => beginLoungeComposerMediaPicker('detailComment')}
                            onVideoPointerDown={() => beginLoungeComposerMediaPicker('detailComment')}
                            onOpenGifPicker={() => openKlipyPicker('detailComment')}
                          />
                          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                            <LoungeComposerCharRing
                              len={loungeDetailCommentDraft.length}
                              max={LOUNGE_COMMENT_BODY_MAX}
                              aria-live="polite"
                            />
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
                    className="lounge-detail-comment-composer-glass flex min-h-10 w-full touch-manipulation items-center rounded-full px-3 py-2 text-left text-[15px] leading-tight text-zinc-500 [-webkit-tap-highlight-color:transparent] active:opacity-80"
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
          onClose={onLoungeDockPanelClose}
          panelScrollRefOut={loungeDockPanelScrollRef}
          restorePanelScrollTop={dockPanelScrollRestore}
          onPanelScrollRestored={onDockPanelScrollRestored}
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
          onOpenSettingsSection={onLoungeOpenSettingsSection}
          settingsFocusSection={loungeSettingsFocusSection}
          onSettingsFocusSectionHandled={onLoungeSettingsFocusSectionHandled}
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
          chatOnOpenRoom={onOpenChatRoomFromDock}
          notificationsSupabaseClient={supabaseClient}
          notificationsViewerUserId={composerUserId || ''}
          onOpenPostFromNotifications={onLoungeOpenPostFromNotifications}
          onOpenProfileFromNotifications={onLoungeOpenProfileFromNotifications}
          onOpenOwnProfileFollowers={onLoungeOpenOwnProfileFollowers}
          onNotificationsUnreadChange={onLoungeNotificationsUnreadChange}
          notificationInteractionProps={notificationInteractionProps}
          notificationInteractionCountsRefreshKey={notificationInteractionCountsRefreshKey}
          blockUnderlyingPointer={loungeFabPointerBlocked}
          dockMenuLayout={loungeDockMenuLayout}
          onDockMenuLayoutChange={writeLoungeDockMenuLayout}
          feedVideoAutoplayEnabled={loungeFeedVideoAutoplayEnabled}
          onFeedVideoAutoplayChange={onLoungeFeedVideoAutoplayChange}
          feedVideoDebugEnabled={loungeFeedVideoDebugEnabled}
          onFeedVideoDebugChange={onLoungeFeedVideoDebugChange}
          consoleLogHudEnabled={loungeConsoleLogHudEnabled}
          onConsoleLogHudChange={onLoungeConsoleLogHudChange}
          settingsViewerIsStaff={loungeStaffToolsEnabled}
          buildBadgeEnabled={loungeBuildBadgeEnabled}
          onBuildBadgeChange={onLoungeBuildBadgeChange}
          onTitleRevealChange={onLoungePanelTitleReveal}
          videoCoordinatorSuspended={Boolean(loungePostDetail?.id)}
          pushNotificationsEnabled={loungePushActive}
          onPushNotificationsChange={onLoungePushToggle}
          pushNotificationsStatusHint={loungePushStatusHint}
          pushNotificationsBusy={loungePushBusy}
          pushNotificationsStatusMessage={loungePushStatusMessage}
          notificationPrefs={loungeNotificationPrefs}
          notificationPrefsLoading={loungeNotificationPrefsLoading}
          notificationPrefsSavingKey={loungeNotificationPrefsSavingKey}
          notificationPrefsSchemaMissing={loungeNotificationPrefsSchemaMissing}
          notificationPrefsError={loungeNotificationPrefsError}
          onNotificationPrefToggle={onLoungeNotificationPrefToggle}
          settingsAccountEmail={String(composerAuthUser?.email || '').trim()}
          settingsHasActiveSubscription={hasActiveSubscription}
          settingsSupabaseClient={supabaseClient}
          onSettingsEditProfile={onLoungeSettingsEditProfile}
          onLogout={onLogout}
          onDeleteAccount={onDeleteAccount}
          deleteAccountBusy={deleteAccountBusy}
          onOpenLegalDocument={onOpenLegalDocument}
          onSimulateTabError={onSimulateTabError}
          onResetTabErrorStrikes={onResetTabErrorStrikes}
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
          requestOwnProfileEditing={profileModalStartEditing}
          requestFollowListTab={profileModalFollowListTab}
          highlightFollowerUserIds={profileModalHighlightFollowerIds}
          navSnapshotRef={profileNavSnapshotRef}
          navRestore={profileNavRestore}
          onNavRestoreApplied={onProfileNavRestoreApplied}
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
          className={`fixed inset-0 ${loungeQuoteRepostShellZClass} flex items-end justify-center bg-black/45 px-3 pb-0 backdrop-blur-[3px]`}
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
            <div
              data-lounge-quote-repost-sheet=""
              className="pointer-events-auto rounded-t-2xl border border-zinc-600/80 bg-[#181b22]/96 px-4 pb-6 pt-5 shadow-2xl backdrop-blur-md"
            >
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
          className={`fixed inset-0 ${loungeQuoteRepostShellZClass} flex bg-black/45 px-3 pt-[calc(env(safe-area-inset-top)+12px)] backdrop-blur-[3px]`}
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
              data-lounge-quote-repost-sheet=""
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
                className="lounge-quote-repost-header-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-20 bg-black/4 backdrop-blur-xl"
                style={{
                  WebkitMaskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)',
                  maskImage:
                    'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.95) 18%, rgba(0,0,0,0.82) 42%, rgba(0,0,0,0.5) 62%, rgba(0,0,0,0) 78%)',
                }}
              />

              <div
                ref={quoteRepostScrollRef}
                className="lounge-quote-repost-scroll relative h-full overscroll-contain overflow-y-auto touch-pan-y"
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
                            <LoungeRichComposerField
                              ref={quoteRepostFieldRef}
                              variant="quote"
                              value={quoteRepostDraft}
                              onChange={setQuoteRepostDraft}
                              maxLength={LOUNGE_CAPTION_MAX}
                              placeholder="Add a comment"
                              ariaLabel="Quote for repost"
                              onKeyDown={(e) =>
                                mentionQuoteRepost.onMentionKeyDown(
                                  e,
                                  setQuoteRepostDraft,
                                  quoteRepostFieldRef.current,
                                )
                              }
                              onKeyUp={mentionQuoteRepost.onCursorMove}
                              onMouseUp={mentionQuoteRepost.onCursorMove}
                              onInput={mentionQuoteRepost.onCursorMove}
                              onBlur={() => window.setTimeout(() => mentionQuoteRepost.clearMention(), 150)}
                            />
                            <LoungeMentionDropdown
                              suggestions={mentionQuoteRepost.suggestions}
                              activeIndex={mentionQuoteRepost.activeIndex}
                              loading={mentionQuoteRepost.loading}
                              onSelect={(p) => mentionQuoteRepost.onMentionSelect(p, setQuoteRepostDraft, quoteRepostFieldRef.current)}
                              anchorRef={mentionQuoteRepostAnchorRef}
                              caretFieldRef={quoteRepostFieldRef}
                            />
                            </div>
                            <LoungePostCategoryPillPicker
                              value={quoteRepostCategoryPills}
                              onChange={setQuoteRepostCategoryPills}
                              disabled={quoteRepostBusy}
                              hint=""
                            />
                            <input
                              id={LOUNGE_QUOTE_REPOST_IMAGE_INPUT_ID}
                              ref={quoteRepostImageInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              {...loungeFileInputMediaPickerHandlers('quote')}
                              onChange={(e) => handleQuoteRepostMediaInputChange(e, 'image')}
                            />
                            <input
                              id={LOUNGE_QUOTE_REPOST_VIDEO_INPUT_ID}
                              ref={quoteRepostVideoInputRef}
                              type="file"
                              accept="video/*"
                              className="hidden"
                              {...loungeFileInputMediaPickerHandlers('quote')}
                              onChange={(e) => handleQuoteRepostMediaInputChange(e, 'video')}
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
                        <div className="lounge-media-toolbar mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-zinc-700/70 py-0.5">
                          <div className="flex shrink-0 items-center justify-center gap-1.5">
                            <LoungeComposerMediaToolbar
                              variant="feed"
                              imageInputId={LOUNGE_QUOTE_REPOST_IMAGE_INPUT_ID}
                              videoInputId={LOUNGE_QUOTE_REPOST_VIDEO_INPUT_ID}
                              disabled={quoteRepostBusy}
                              gifDisabled={quoteRepostBusy}
                              onImagePointerDown={() => {
                                if (!quoteRepostBusy) beginLoungeComposerMediaPicker('quote')
                              }}
                              onVideoPointerDown={() => {
                                if (!quoteRepostBusy) beginLoungeComposerMediaPicker('quote')
                              }}
                              onOpenGifPicker={() => {
                                if (!quoteRepostBusy) openKlipyPicker('quote')
                              }}
                            />
                          </div>
                        <div className="flex min-w-0 grow basis-[min(100%,14rem)] flex-wrap items-center justify-end gap-2">
                          <LoungeComposerCharRing len={quoteRepostDraft.length} max={LOUNGE_CAPTION_MAX} />
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
                            const quoteComment = quoteRepostModal.originalKind === 'comment'
                            const embedCaption = bodyTextWithLinkPreview(
                              quoteComment ? String(orig.body || '').trim() : feedPostDisplayCaption(orig),
                              orig.link_preview,
                            )
                            return (
                              <div
                                role="figure"
                                aria-label={quoteComment ? 'Quoted comment preview' : 'Quoted post preview'}
                                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit"
                              >
                                <LoungeQuoteRepostEmbedAuthorMeta
                                  post={orig}
                                  displayNameFor={displayNameFor}
                                  handleFor={handleFor}
                                  postAgeLabel={postAgeLabel}
                                />
                                {embedCaption ? (
                                  <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 whitespace-pre-wrap break-words">
                                    <LoungeExpandableRichCaption
                                      text={embedCaption}
                                      captionOpts={loungePostDetailRichCaptionOpts}
                                    />
                                  </div>
                                ) : null}
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

      <LoungeMarketSymbolPickerSheet
        open={marketPickerOpen}
        onClose={() => setMarketPickerOpen(false)}
        caption={marketPickerTarget === 'detailEdit' ? loungeDetailDraftCaption : postText}
        selected={marketPickerTarget === 'detailEdit' ? loungeDetailEditMarketSymbols : composerMarketSymbols}
        onChange={
          marketPickerTarget === 'detailEdit' ? setLoungeDetailEditMarketSymbols : setComposerMarketSymbols
        }
        supabaseClient={supabaseClient}
      />

      <LoungeMarketChartModal
        open={marketChartModal.open}
        embeds={marketChartModal.embeds}
        focusSymbol={marketChartModal.focusSymbol}
        supabaseClient={supabaseClient}
        hydratePosts={hydrateCommunityPosts}
        onOpenPost={openLoungePostDetail}
        onClose={closeMarketChartModal}
        onInsertSnapshot={composerUserId && !loungeReadOnly ? insertMarketChartSnapshotIntoComposer : undefined}
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

      {loungeWelcomeOpen ? (
        <LoungeWelcomeModal
          open={loungeWelcomeOpen}
          onAcknowledge={onLoungeWelcomeAcknowledge}
          onOpenGuidelines={onOpenGuidelinesFromWelcome}
        />
      ) : null}

      {slotsMenuHintOpen ? (
        <LoungeSlotsMenuHintOverlay open={slotsMenuHintOpen} onDismiss={onSlotsMenuHintDismiss} />
      ) : null}

      {profileGateOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
              style={{ zIndex: Z_APP_MODAL }}
              role="dialog"
              aria-modal
            >
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
          <div
            className="relative z-10 w-full max-w-md rounded-3xl border border-zinc-700/85 bg-zinc-950/92 p-5 shadow-2xl backdrop-blur-md"
            data-ask-community-profile-gate
          >
            <div className="profile-gate-kicker text-cyan-200 text-[15px] font-semibold uppercase tracking-wide">Complete your profile</div>
            <div className="text-white text-xl font-bold mt-1">One-time setup before posting</div>
            <div className="text-zinc-400 text-[15px] mt-2 leading-relaxed">
              {profileGateProvisionalConfirmNeeded
                ? 'We started your handle and display name from your email - confirm or edit them, then save.'
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
              <div className="block">
                <span className="text-zinc-400 text-[13px] font-semibold uppercase tracking-wide">Tribes</span>
                <LoungePostCategoryPillPicker
                  value={profileGateCategoryPills}
                  onChange={setProfileGateCategoryPills}
                  disabled={profileGateBusy}
                  maxPills={null}
                  collapsibleSingleRow={false}
                  sortAlphabetically
                  hint="Choose your tribes - helps us to deliver you better results."
                />
              </div>
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
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-[94] border-t border-zinc-700/90 bg-zinc-950/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md shadow-[0_-8px_30px_rgba(0,0,0,0.35)]"
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-zinc-200">
                {loungeSubmitQueueDisplay.total > 1
                  ? `Post ${loungeSubmitQueueDisplay.index} of ${loungeSubmitQueueDisplay.total}`
                  : loungePostUploadBar.draftSave
                    ? 'Saving draft…'
                    : loungePostUploadBar.editSave
                      ? 'Saving edit…'
                      : loungePostUploadBar.mode === 'mediaPrep'
                        ? 'Uploading media…'
                        : 'Uploading post…'}
              </div>
              <div className="mt-0.5 text-[12px] leading-snug text-cyan-200/90">
                <span className="font-semibold text-cyan-300/95">Now:</span>{' '}
                {loungePostUploadBar.status ||
                  (loungePostUploadBar.threadPartTotal > 1 && loungePostUploadBar.threadPartPublished > 0
                    ? `Part ${loungePostUploadBar.threadPartPublished} of ${loungePostUploadBar.threadPartTotal} posted`
                    : '-')}
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
                  loungePostJobRunningRef.current ||
                  loungeDetailCommentJobRunningRef.current ||
                  loungeDetailEditJobRunningRef.current
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
          intent="composer"
          shellClassName={
            loungeVideoCrop.mode === 'quote'
              ? loungePostDetailAboveProfile
                ? 'z-[108]'
                : loungeProfileScreenOpen
                  ? 'z-[112]'
                  : 'z-[105]'
              : loungePostDetailAboveProfile
                ? 'z-[106]'
                : 'z-[105]'
          }
          onCancel={() => {
            if (loungeVideoCrop.mode === 'detailComment') {
              loungeDetailCommentMediaSessionRef.current = false
            }
            setLoungeVideoCrop(null)
          }}
          onConfirm={(result) => {
            const cropMode = loungeVideoCrop.mode
            if (cropMode === LOUNGE_THREAD_COMPOSE_VIDEO_CROP_MODE) {
              const partIdx =
                typeof loungeVideoCrop.partIdx === 'number'
                  ? loungeVideoCrop.partIdx
                  : threadComposeActivePartIndexRef.current
              if (result instanceof File) {
                const previewUrl = URL.createObjectURL(result)
                startThreadComposePartVideoPrepFromSpec(partIdx, { kind: 'direct', file: result }, {
                  file: result,
                  posterUrl: null,
                  preview: previewUrl,
                  streamVideoUid: null,
                })
              } else if (result && typeof result === 'object' && result.type === 'composerTrimJob') {
                const spec = {
                  kind: 'trim',
                  sourceFile: result.sourceFile,
                  startSec: result.startSec,
                  endSec: result.endSec,
                  cropPx: result.cropPx,
                  intrinsicWidth: result.intrinsicWidth,
                  intrinsicHeight: result.intrinsicHeight,
                }
                startThreadComposePartVideoPrepFromSpec(partIdx, spec, {
                  file: null,
                  posterUrl: result.posterUrl,
                  preview: result.posterUrl,
                  streamVideoUid: null,
                })
              }
              setLoungeVideoCrop(null)
              restoreLoungeComposerCaptionAfterMediaPick('composer')
              return
            }
            if (
              cropMode === 'composer' ||
              cropMode === 'quote' ||
              cropMode === 'detailComment' ||
              cropMode === 'detailEdit' ||
              cropMode === 'detailCommentEdit'
            ) {
              const startPrep =
                cropMode === 'quote'
                  ? startQuoteRepostVideoPrepFromSpec
                  : cropMode === 'detailComment'
                    ? startLoungeDetailCommentVideoPrepFromSpec
                    : cropMode === 'detailEdit'
                      ? startLoungeDetailEditVideoPrepFromSpec
                      : cropMode === 'detailCommentEdit'
                        ? startLoungeDetailCommentEditVideoPrepFromSpec
                        : startComposerVideoPrepFromSpec
              const disposeSlot =
                cropMode === 'quote'
                  ? () => disposeComposerVideoMedia(quoteRepostVideoSlotRef.current)
                  : cropMode === 'detailComment'
                    ? () => disposeComposerVideoMedia(loungeDetailCommentVideoSlotRef.current)
                    : cropMode === 'detailEdit'
                      ? () => disposeComposerVideoMedia(loungeDetailEditVideoSlotRef.current)
                      : cropMode === 'detailCommentEdit'
                        ? () => disposeComposerVideoMedia(loungeDetailCommentEditVideoSlotRef.current)
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
                else if (cropMode === 'detailEdit') {
                  setLoungeDetailEditMediaUrl('')
                  setLoungeDetailEditKeepStreamUid(null)
                } else if (cropMode === 'detailCommentEdit') {
                  setLoungeDetailCommentEditMediaUrl('')
                  setLoungeDetailCommentEditKeepStreamUid(null)
                } else setComposerMediaUrl('')
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
                else if (cropMode === 'detailEdit') {
                  setLoungeDetailEditMediaUrl('')
                  setLoungeDetailEditKeepStreamUid(null)
                } else if (cropMode === 'detailCommentEdit') {
                  setLoungeDetailCommentEditMediaUrl('')
                  setLoungeDetailCommentEditKeepStreamUid(null)
                } else setComposerMediaUrl('')
              }
            }
            setLoungeVideoCrop(null)
            if (
              cropMode === 'composer' ||
              cropMode === 'quote' ||
              cropMode === 'detailComment' ||
              cropMode === 'detailEdit' ||
              cropMode === 'detailCommentEdit'
            ) {
              if (cropMode === 'detailComment') loungeDetailCommentMediaSessionRef.current = false
              restoreLoungeComposerCaptionAfterMediaPick(cropMode)
            }
          }}
        />
      ) : null}

      <LoungeThreadComposeSheet
        key={threadComposeSessionKey}
        open={threadComposeOpen}
        onRequestClose={requestCloseThreadCompose}
        captions={threadComposeCaptions}
        partsMedia={threadComposePartMedia}
        activePartIndex={threadComposeActivePartIndex}
        onFocusPart={setThreadComposeActivePartIndex}
        onChangePart={(idx, next) => {
          setThreadComposeCaptions((prev) => prev.map((row, j) => (j === idx ? next : row)))
        }}
        onAddPart={appendThreadComposePart}
          onRemovePart={(idx) => {
          setThreadComposePartMedia((prev) => {
            revokeThreadComposePartMediaFull(prev[idx])
            threadComposeVideoPrepControllerRef.current?.cancel(idx)
            delete threadComposeVideoPrepByPartRef.current[idx]
            return prev.filter((_, j) => j !== idx)
          })
          setThreadComposeCaptions((prev) => {
            if (prev.length <= 1) return ['']
            return prev.filter((_, j) => j !== idx)
          })
          setThreadComposeActivePartIndex((prev) => {
            if (prev > idx) return prev - 1
            if (prev === idx) return Math.max(0, idx - 1)
            return prev
          })
        }}
        registerPartRef={registerThreadComposePartRef}
        getPartRef={getThreadComposePartRef}
        focusPartIndex={threadComposeFocusPartIndex}
        onFocusPartIndexConsumed={consumeThreadComposeFocusPartIndex}
        categoryPills={composerCategoryPills}
        onCategoryPillsChange={setComposerCategoryPills}
        onSubmit={submitThreadCompose}
        onSaveDraft={saveThreadComposeAsServerDraft}
        canSaveDraft={threadComposeCanSaveDraft}
        submitting={postBusy}
        error={threadComposeErr}
        composerUserProfile={composerUserProfile}
        composerUserId={composerUserId}
        composerAuthResolved={composerAuthResolved}
        composerAuthUser={composerAuthUser}
        avatarToneClass={avatarToneClass}
        avatarText={avatarText}
        profileSeedFromUser={profileSeedFromUser}
        profileAvatarInitials={profileAvatarInitials}
        composerStableInitialsFromUid={composerStableInitialsFromUid}
        mentionComposer={mentionThreadCompose}
        mentionAnchorRef={threadComposeMentionAnchorRef}
        part0FieldRef={threadComposeFieldRef}
        imageInputId={LOUNGE_THREAD_COMPOSE_IMAGE_INPUT_ID}
        videoInputId={LOUNGE_THREAD_COMPOSE_VIDEO_INPUT_ID}
        imageInputRef={threadComposeImageInputRef}
        videoInputRef={threadComposeVideoInputRef}
        mediaInputHandlers={loungeFileInputMediaPickerHandlers('composer')}
        onImagePointerDown={() => beginLoungeComposerMediaPicker('composer')}
        onVideoPointerDown={() => beginLoungeComposerMediaPicker('composer')}
        onOpenGifPicker={() => openKlipyPicker('composer')}
        onImageInputChange={handleComposerImageInputChange}
        onVideoInputChange={handleComposerVideoInputChange}
        onRemovePartImageIndex={(partIdx, imageIdx) => {
          setThreadComposePartMedia((prev) =>
            prev.map((row, j) => {
              if (j !== partIdx) return row
              const target = row.imageItems[imageIdx]
              if (target?.preview?.startsWith?.('blob:')) {
                try {
                  URL.revokeObjectURL(target.preview)
                } catch {
                  // ignore
                }
              }
              return {
                ...row,
                imageItems: row.imageItems.filter((_, k) => k !== imageIdx),
              }
            }),
          )
        }}
        onRemovePartGif={(partIdx) => {
          setThreadComposePartMedia((prev) =>
            prev.map((row, j) => (j === partIdx ? { ...row, gifUrl: '' } : row)),
          )
        }}
        onRemovePartVideo={cancelThreadComposePartVideo}
      />

      {threadComposeDiscardOpen ? (
        <div
          className="fixed inset-0 z-[99] flex items-center justify-center bg-black/45 px-4 p-6 backdrop-blur-[3px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="thread-compose-discard-title"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default touch-manipulation bg-transparent"
            aria-label="Close"
            onClick={() => {
              setThreadComposeDiscardOpen(false)
            }}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/85 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-md">
            <>
              <h2 id="thread-compose-discard-title" className="text-[17px] font-bold text-white">
                Discard thread?
              </h2>
              <p className="mt-2 text-[14px] leading-snug text-zinc-400">
                Your thread text and any attached media will be cleared.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <button
                  type="button"
                  className="order-3 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-1"
                  onClick={() => {
                    setThreadComposeDiscardOpen(false)
                    void saveThreadComposeAsServerDraft()
                  }}
                >
                  Save draft
                </button>
                  <button
                    type="button"
                    className="order-2 min-h-11 rounded-xl border border-zinc-600 px-4 text-[15px] font-semibold text-zinc-200 hover:bg-zinc-800 touch-manipulation sm:order-2"
                    onClick={() => {
                      setThreadComposeDiscardOpen(false)
                      discardThreadCompose()
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="order-1 min-h-11 rounded-xl bg-cyan-600 px-4 text-[15px] font-semibold text-white hover:bg-cyan-500 touch-manipulation sm:order-3"
                    onClick={() => {
                      setThreadComposeDiscardOpen(false)
                    }}
                  >
                    Keep writing
                  </button>
                </div>
            </>
          </div>
        </div>
      ) : null}

      <LoungePostDraftsSheet
        open={loungeDraftsSheetOpen}
        onClose={() => setLoungeDraftsSheetOpen(false)}
        drafts={loungeDraftsList}
        loading={loungeDraftsLoading}
        busyId={loungeDraftSheetBusyId}
        onOpenDraft={loadServerDraftIntoComposer}
        onDeleteDraft={(id) => void deleteServerLoungeDraft(id)}
        onRefresh={() => void loadLoungeDraftsForSheet()}
      />

      {loungePostUploadFailedOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px] sm:items-center sm:p-6"
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
                onClick={() => void onLoungePostUploadSaveDraft()}
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
      </LoungeMarketFeedProvider>
      </LoungeStreamLightboxProvider>
    </div>
  )
}



