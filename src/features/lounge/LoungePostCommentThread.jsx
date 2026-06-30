import { useMemo, useCallback, useRef } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import LoungeFeedPendingStatusRow from './LoungeFeedPendingStatusRow.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import {
  feedCommentDescendantCountById,
  feedCommentRowHasMedia,
  feedCommentSubtreeReplyCount,
} from '../../utils/communityFeedComment.js'
import {
  commentsFromIdOrder,
  compareFeedCommentsChronologicalAsc,
  LOUNGE_DETAIL_COMMENT_SORT,
  orderCommentDetailDirectReplies,
  orderPostDetailRootComments,
  stabilizeCommentListOrder,
} from '../../utils/loungeFeedCommentSort.js'
import { LOUNGE_COMMENT_BODY_MAX } from '../../utils/loungeCommentLimits.js'
import LoungeComposerCharRing from './LoungeComposerCharRing.jsx'
import LoungeRichComposerField from './LoungeRichComposerField.jsx'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
import LoungeLinkPreviewBlock from './LoungeLinkPreviewBlock.jsx'
import { bodyTextWithLinkPreview } from '../../utils/linkifyText.jsx'
import {
  LOUNGE_FEED_CAPTION_TEXT_CLASS,
  LOUNGE_FEED_CAPTION_TOP_CLASS,
  LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS,
  LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_AVATAR_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_ITEM_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_ROW_CLASS,
  LOUNGE_FEED_POST_DETAIL_COMMENT_INTERACTIONS_CLASS,
  LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS,
} from './loungeFeedAvatar.js'

/**
 * Meta row matches `LoungePostArticle`: name, badges, handle · time (left); ⋯ menu on the right.
 *
 * @param {boolean} navigable - Whole row opens the comment thread (not nested interactive targets except avatar / menu / interaction bar).
 */
export function LoungeCommentCard({
  comment,
  postAgeLabel,
  displayNameFor,
  handleFor,
  navigable,
  onOpenCommentThread,
  onAvatarClickProfile,
  descendantFallback = 0,
  loungeReadOnly = false,
  viewerUserId,
  requireLoungeAuth,
  openProfileGateIfNeeded,
  onCommentReplyInteraction,
  /** Per-comment row: `post.id` is the comment id; counts come from the comment row (not the parent post). */
  interactionStateFor,
  toggleInteraction,
  onPlainRepost,
  onUndoPlainRepost,
  onRemoveQuoteRepost,
  onQuoteRepost,
  toggleBookmark,
  bookmarkedByPost,
  onToggleCommentLike,
  onToggleCommentBookmark,
  getCommentBookmarked,
  repostActionBusy,
  positionScrollRootRef,
  onCommentMenuEdit,
  onCommentMenuDelete,
  onCommentMenuBlock,
  onCommentMenuReport,
  busyDeletingCommentId,
  commentEditSavePendingCommentId = null,
  editingCommentId,
  commentEditDraft,
  onCommentEditDraftChange,
  onCommentEditSave,
  onCommentEditCancel,
  commentEditBusy,
  commentEditHasRemoteMedia = false,
  commentEditMediaSlot = null,
  commentEditFieldRef = null,
  commentEditVideoPostBlocked = false,
  mediaFeedVariant: mediaFeedVariantProp = 'commentInline',
  resolveMediaFeedVariant,
  showDetailTimestamp = false,
  detailTimestampLabel = '',
  avatarButtonRef = null,
  /** Thread part rail owns the avatar column (`LoungePostThreadPartsHierarchy`). */
  hideAvatar = false,
  hideInteractionBar = false,
  lightboxPortalClass = 'z-[100]',
  repostMenuPortalClass = 'z-[48]',
  onMentionClick,
  onHashtagClick,
  onLinkClick,
  onLinkPreviewOpen,
  youtubeIframeLoading = 'lazy',
  avatarText,
  avatarToneClass,
  viewerFollowingUserIds,
  onFollowUser,
  feedVideoAutoplayEnabled = true,
  onFeedVideoAutoplayChange,
  onStreamLightboxOpenDetail,
  onSharePost,
}) {
  const mediaFeedVariant =
    typeof resolveMediaFeedVariant === 'function'
      ? resolveMediaFeedVariant(comment)
      : mediaFeedVariantProp
  const profile = comment.author_profile
  const displayName = typeof displayNameFor === 'function' ? displayNameFor(comment) : profile?.display_name || profile?.handle || 'Member'
  const handleLabel = typeof handleFor === 'function' ? handleFor(comment) : '@member'
  const interactionBarPost = useMemo(() => {
    if (!comment?.id) return null
    return {
      id: comment.id,
      comment_count: feedCommentSubtreeReplyCount(comment, descendantFallback),
      like_count: typeof comment.like_count === 'number' ? comment.like_count : 0,
      repost_count: typeof comment.repost_count === 'number' ? comment.repost_count : 0,
    }
  }, [comment, descendantFallback])

  const onCommentBarClick = useCallback(() => {
    if (openProfileGateIfNeeded?.()) return
    onCommentReplyInteraction?.(comment)
  }, [comment, onCommentReplyInteraction, openProfileGateIfNeeded])

  const streamLightboxSurface = useMemo(
    () => ({
      repostMenuPortalClass,
      repostMenuScrollRootRef: positionScrollRootRef,
    }),
    [repostMenuPortalClass, positionScrollRootRef],
  )

  const menuIsOwn = Boolean(viewerUserId && comment.user_id === viewerUserId)
  const commentDeletePending = Boolean(busyDeletingCommentId && busyDeletingCommentId === comment.id)
  const commentEditSavePending = Boolean(
    commentEditSavePendingCommentId && commentEditSavePendingCommentId === comment.id,
  )
  const showCommentMenu = Boolean(
    !loungeReadOnly &&
      viewerUserId &&
      (typeof onCommentMenuEdit === 'function' ||
        typeof onCommentMenuDelete === 'function' ||
        typeof onCommentMenuBlock === 'function' ||
        typeof onCommentMenuReport === 'function'),
  )

  const bodyEditing = editingCommentId === comment.id

  const bodyBlock = bodyEditing ? (
    <div
      className="mt-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') onCommentEditCancel?.()
      }}
      role="presentation"
    >
      {commentEditFieldRef ? (
        <LoungeRichComposerField
          ref={commentEditFieldRef}
          variant="detailCommentEdit"
          autoGrow
          value={commentEditDraft}
          onChange={onCommentEditDraftChange}
          maxLength={LOUNGE_COMMENT_BODY_MAX}
          placeholder="Edit reply"
          ariaLabel="Edit reply"
          disabled={commentEditBusy}
        />
      ) : (
        <textarea
          value={commentEditDraft}
          onChange={(e) => onCommentEditDraftChange?.(e.target.value)}
          rows={3}
          maxLength={LOUNGE_COMMENT_BODY_MAX}
          className={`w-full resize-y rounded-xl border border-zinc-600/70 bg-zinc-900/90 px-3 py-2 ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-100 outline-none focus:border-cyan-600/55 touch-manipulation`}
          aria-label="Edit reply"
        />
      )}
      {commentEditMediaSlot}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onCommentEditCancel?.()}
          disabled={commentEditBusy}
          className="rounded-full border border-zinc-600 bg-zinc-900/80 px-3 py-1 text-[13px] font-semibold text-zinc-200 hover:border-zinc-500 disabled:opacity-50 touch-manipulation"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onCommentEditSave?.()}
          disabled={
            commentEditBusy ||
            commentEditVideoPostBlocked ||
            (!String(commentEditDraft || '').trim() && !commentEditHasRemoteMedia) ||
            String(commentEditDraft || '').length > LOUNGE_COMMENT_BODY_MAX
          }
          className="rounded-full border border-cyan-600/70 bg-cyan-950/40 px-3 py-1 text-[13px] font-semibold text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-50 touch-manipulation"
        >
          {commentEditBusy ? 'Saving…' : 'Save'}
        </button>
        <LoungeComposerCharRing
          len={String(commentEditDraft || '').length}
          max={LOUNGE_COMMENT_BODY_MAX}
        />
      </div>
    </div>
  ) : (
    (() => {
      const bodyText = bodyTextWithLinkPreview(comment.body, comment.link_preview)
      if (!bodyText && !comment.link_preview) return null
      return (
        <>
          {bodyText ? (
            <div
              className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}
            >
              <LoungeExpandableRichCaption
                text={bodyText}
                captionOpts={{ onMentionClick, onHashtagClick, onLinkClick }}
              />
            </div>
          ) : null}
          <LoungeLinkPreviewBlock
            preview={comment.link_preview}
            className="mt-2"
            onPreviewOpen={onLinkPreviewOpen}
            youtubeIframeLoading={youtubeIframeLoading}
          />
        </>
      )
    })()
  )

  const commentMediaBlock =
    !bodyEditing && feedCommentRowHasMedia(comment) ? (
      <LoungePostFeedImagesAndGif
        post={comment}
        variant={mediaFeedVariant}
        firstMarginTopClass={
          String(comment.body || '').trim()
            ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
            : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
        }
        visibilityResetRootRef={positionScrollRootRef}
        lightboxPortalClass={lightboxPortalClass}
        streamLightboxHost={comment}
        streamLightboxTileCtx={{
          commentDescendantFallback: descendantFallback,
          hideLightboxInteractionBar: hideInteractionBar,
        }}
        streamLightboxSurface={streamLightboxSurface}
      />
    ) : null

  const commentBodyColumn = (
      <div className="min-w-0 flex-1">
        {commentDeletePending ? (
          <LoungeFeedPendingStatusRow className="mb-1">Deleting reply…</LoungeFeedPendingStatusRow>
        ) : null}
        {commentEditSavePending ? (
          <LoungeFeedPendingStatusRow className="mb-1">Updating reply…</LoungeFeedPendingStatusRow>
        ) : null}
        <div className="relative min-w-0">
          <div className={`${LOUNGE_FEED_META_TEXT_COLUMN_CLASS} ${showCommentMenu ? 'pr-7' : ''}`}>
            <div className={LOUNGE_FEED_META_ROW_CLASS}>
              <LoungeFeedAuthorMetaBadges
                role={profile?.role}
                isOg={profile?.is_og}
                displayName={displayName}
                displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
              />
              <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                <span className="min-w-0 truncate">{handleLabel}</span>
                <span className="shrink-0 text-zinc-600">·</span>
                <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
                  {typeof postAgeLabel === 'function' ? postAgeLabel(comment.created_at) : ''}
                </span>
              </span>
            </div>
          </div>
          {showCommentMenu ? (
            <div className={LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS}>
              <LoungePostRowMenu
                menuAriaLabel="Comment options"
                isOwn={menuIsOwn}
                showEdit={menuIsOwn && typeof onCommentMenuEdit === 'function'}
                deleteBusy={Boolean(busyDeletingCommentId && busyDeletingCommentId === comment.id)}
                onEdit={() => onCommentMenuEdit?.(comment)}
                onDelete={() => onCommentMenuDelete?.(comment)}
                showStaffDelete={false}
                onBlock={() => onCommentMenuBlock?.(comment)}
                onReport={() => onCommentMenuReport?.(comment)}
                positionScrollRootRef={positionScrollRootRef}
              />
            </div>
          ) : null}
        </div>
        {bodyBlock}
        {commentMediaBlock}
        {showDetailTimestamp && detailTimestampLabel && !bodyEditing ? (
          <div className="mt-2 text-[14px] leading-tight text-zinc-500">{detailTimestampLabel}</div>
        ) : null}
        {bodyEditing || hideInteractionBar || typeof interactionStateFor !== 'function' ? null : interactionBarPost ? (
          <LoungePostInteractionBar
            post={interactionBarPost}
            variant="comment"
            rootClassName={LOUNGE_FEED_POST_DETAIL_COMMENT_INTERACTIONS_CLASS}
            loungeReadOnly={loungeReadOnly}
            interactionStateFor={interactionStateFor}
            toggleInteraction={toggleInteraction}
            onPlainRepost={onPlainRepost}
            onUndoPlainRepost={onUndoPlainRepost}
            onRemoveQuoteRepost={onRemoveQuoteRepost}
            onQuoteRepost={onQuoteRepost}
            toggleBookmark={toggleBookmark}
            bookmarkedByPost={bookmarkedByPost}
            onToggleLike={onToggleCommentLike}
            onToggleBookmark={onToggleCommentBookmark}
            getBookmarked={getCommentBookmarked}
            requireLoungeAuth={requireLoungeAuth}
            openProfileGateIfNeeded={openProfileGateIfNeeded}
            repostMenuScrollRootRef={positionScrollRootRef}
            onCommentClick={onCommentBarClick}
            repostActionBusy={repostActionBusy}
          />
        ) : null}
      </div>
  )

  const metaRow = hideAvatar ? (
    commentBodyColumn
  ) : (
    <div className="flex items-start gap-3">
      <button
        ref={avatarButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (openProfileGateIfNeeded?.()) return
          onAvatarClickProfile?.(comment)
        }}
        className={`${LOUNGE_FEED_POST_DETAIL_COMMENT_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
        aria-label={`Open profile for ${displayName}`}
      >
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={`flex h-full w-full items-center justify-center font-bold text-white ${profileAvatarToneClass(
              profile?.user_id || profile?.handle || comment?.user_id || 'member',
            )}`}
          >
            {profileAvatarInitials(profile?.display_name, profile?.handle)}
          </span>
        )}
      </button>
      {commentBodyColumn}
    </div>
  )

  if (navigable && onOpenCommentThread) {
    const openRow = () => onOpenCommentThread(comment)
    return (
      <article
        tabIndex={0}
        aria-label="View comment"
        onClick={(e) => {
          const t = e.target
          if (!(t instanceof Element)) return
          // Match feed post row: avoid drilling when tapping real controls (nested <button> inside role="button" breaks touch on iOS).
          if (
            t.closest(
              'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-badge-tip], [data-lounge-post-interaction-bar], [data-lounge-image-zoom], [data-lounge-video-zoom]',
            )
          ) {
            return
          }
          openRow()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          if (e.target !== e.currentTarget) return
          e.preventDefault()
          openRow()
        }}
        className={`${LOUNGE_FEED_POST_DETAIL_COMMENT_ROW_CLASS} cursor-pointer rounded-lg touch-manipulation outline-none hover:bg-zinc-900/50 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-violet-500/40`}
      >
        {metaRow}
      </article>
    )
  }

  return <article className={LOUNGE_FEED_POST_DETAIL_COMMENT_ROW_CLASS}>{metaRow}</article>
}

/**
 * Post detail comments - tap any comment to open its own comment-detail screen (OP + ancestry + replies).
 *
 * **`variant === 'post'`:** Top-level roots only; all replies (including OP) open via comment detail.
 *
 * @param {'post' | 'commentDetailReplies'} variant
 * @param {string | null} focusCommentId - Required when `variant === 'commentDetailReplies'`.
 * @param {string | null} [postAuthorUserId] - Post author's `user_id`; used for sort + orphan OP root rows.
 */
export default function LoungePostCommentThread({
  comments,
  /** Post id - resets stable sort when the detail post changes. */
  postId = null,
  postAgeLabel,
  /** Same helpers as feed posts (`comment` has `author_profile` like a post). */
  displayNameFor,
  handleFor,
  variant = 'post',
  /** Post owner's user id - used for ranked sort buckets and orphan OP root rows. */
  postAuthorUserId = null,
  focusCommentId = null,
  loungeReadOnly = false,
  viewerUserId,
  requireLoungeAuth = () => {},
  openProfileGateIfNeeded = () => false,
  onCommentReplyInteraction,
  interactionStateFor,
  toggleInteraction,
  onPlainRepost,
  onUndoPlainRepost,
  onRemoveQuoteRepost,
  onQuoteRepost,
  toggleBookmark,
  bookmarkedByPost,
  onToggleCommentLike,
  onToggleCommentBookmark,
  getCommentBookmarked,
  repostActionBusy = false,
  onOpenCommentThread,
  onAvatarClickProfile,
  positionScrollRootRef,
  onCommentMenuEdit,
  onCommentMenuDelete,
  onCommentMenuBlock,
  onCommentMenuReport,
  busyDeletingCommentId,
  commentEditSavePendingCommentId = null,
  editingCommentId,
  commentEditDraft,
  onCommentEditDraftChange,
  onCommentEditSave,
  onCommentEditCancel,
  commentEditBusy,
  commentEditHasRemoteMedia = false,
  commentEditMediaSlot = null,
  commentEditFieldRef = null,
  commentEditVideoPostBlocked = false,
  /** Comment ids the signed-in viewer just posted - shown at top of their list only (chronological for others). */
  viewerPinnedCommentIds = [],
  /** First-level sort on post detail (`ranked` | `popular` | `chronological` | `likes`). */
  rootCommentSortMode = LOUNGE_DETAIL_COMMENT_SORT.RANKED,
  /** `profile_follows.following_id` for the signed-in viewer. */
  followingUserIds = [],
  onMentionClick,
  onHashtagClick,
  onLinkClick,
  onLinkPreviewOpen,
  youtubeIframeLoading = 'lazy',
  avatarText,
  avatarToneClass,
  viewerFollowingUserIds,
  onFollowUser,
  feedVideoAutoplayEnabled = true,
  onFeedVideoAutoplayChange,
  onStreamLightboxOpenDetail,
  onSharePost,
  /** Tailwind z-index for image/video lightboxes (must exceed the detail shell's z-index). */
  lightboxPortalClass = 'z-[100]',
}) {
  const byId = useMemo(() => new Map((comments || []).map((c) => [c.id, c])), [comments])

  const rootOrderSessionKeyRef = useRef('')
  const stableRootIdsRef = useRef(/** @type {string[]} */ ([]))
  const replyOrderSessionKeyRef = useRef('')
  const stableReplyIdsRef = useRef(/** @type {string[]} */ ([]))

  const descendantCountByCommentId = useMemo(
    () => feedCommentDescendantCountById(comments),
    [comments],
  )

  const rootsSorted = useMemo(() => {
    if (variant !== 'post') return []
    const fresh = orderPostDetailRootComments({
      roots: comments,
      postAuthorUserId,
      viewerUserId,
      followingUserIds,
      viewerPinnedCommentIds,
      sortMode: rootCommentSortMode,
    })
    const sessionKey = `${postId || ''}|${rootCommentSortMode}|post`
    const sessionChanged = rootOrderSessionKeyRef.current !== sessionKey
    if (sessionChanged) {
      rootOrderSessionKeyRef.current = sessionKey
      stableRootIdsRef.current = []
    }
    stableRootIdsRef.current = stabilizeCommentListOrder({
      stableIds: stableRootIdsRef.current,
      freshlySorted: fresh,
      viewerPinnedCommentIds,
      resort: sessionChanged || stableRootIdsRef.current.length === 0,
    })
    return commentsFromIdOrder(stableRootIdsRef.current, byId)
  }, [
    byId,
    comments,
    followingUserIds,
    postAuthorUserId,
    postId,
    rootCommentSortMode,
    variant,
    viewerPinnedCommentIds,
    viewerUserId,
  ])

  const rootIdSet = useMemo(() => new Set(rootsSorted.map((r) => r.id).filter(Boolean)), [rootsSorted])

  /** OP replies to a non-root parent - show as extra root rows so nothing disappears. */
  const orphanOpAuthorReplies = useMemo(() => {
    if (!postAuthorUserId) return []
    return [...(comments || [])]
      .filter(
        (c) =>
          Boolean(c.parent_id) &&
          c.user_id === postAuthorUserId &&
          !rootIdSet.has(c.parent_id),
      )
      .sort((a, b) => compareFeedCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }, [comments, postAuthorUserId, rootIdSet, viewerPinnedCommentIds])

  const focusComment = useMemo(() => {
    if (!focusCommentId) return null
    return byId.get(focusCommentId) || null
  }, [byId, focusCommentId])

  const mediaVariantForComment = useCallback(
    (comment) => {
      if (variant === 'commentDetailReplies' && focusCommentId && comment?.id === focusCommentId) {
        return 'detail'
      }
      return 'commentInline'
    },
    [focusCommentId, variant],
  )

  const directRepliesSorted = useMemo(() => {
    if (variant !== 'commentDetailReplies' || !focusCommentId) return []
    const direct = [...(comments || [])].filter((c) => c.parent_id === focusCommentId)
    const fresh = orderCommentDetailDirectReplies({
      replies: direct,
      viewerPinnedCommentIds,
      sortMode: rootCommentSortMode,
    })
    const sessionKey = `${postId || ''}|${rootCommentSortMode}|${focusCommentId}|replies`
    const sessionChanged = replyOrderSessionKeyRef.current !== sessionKey
    if (sessionChanged) {
      replyOrderSessionKeyRef.current = sessionKey
      stableReplyIdsRef.current = []
    }
    stableReplyIdsRef.current = stabilizeCommentListOrder({
      stableIds: stableReplyIdsRef.current,
      freshlySorted: fresh,
      viewerPinnedCommentIds,
      resort: sessionChanged || stableReplyIdsRef.current.length === 0,
    })
    return commentsFromIdOrder(stableReplyIdsRef.current, byId)
  }, [byId, comments, focusCommentId, postId, rootCommentSortMode, variant, viewerPinnedCommentIds])

  const cardProps = {
    postAgeLabel,
    displayNameFor,
    handleFor,
    resolveMediaFeedVariant: mediaVariantForComment,
    loungeReadOnly,
    viewerUserId,
    requireLoungeAuth,
    openProfileGateIfNeeded,
    onCommentReplyInteraction,
    onMentionClick,
    onHashtagClick,
    onLinkClick,
    onLinkPreviewOpen,
    youtubeIframeLoading,
    interactionStateFor,
    toggleInteraction,
    onPlainRepost,
    onUndoPlainRepost,
    onRemoveQuoteRepost,
    onQuoteRepost,
    toggleBookmark,
    bookmarkedByPost,
    onToggleCommentLike,
    onToggleCommentBookmark,
    getCommentBookmarked,
    repostActionBusy,
    onAvatarClickProfile,
    positionScrollRootRef,
    onCommentMenuEdit,
    onCommentMenuDelete,
    onCommentMenuBlock,
    onCommentMenuReport,
    busyDeletingCommentId,
    commentEditSavePendingCommentId,
    editingCommentId,
    commentEditDraft,
    onCommentEditDraftChange,
    onCommentEditSave,
    onCommentEditCancel,
    commentEditBusy,
    commentEditHasRemoteMedia,
    commentEditMediaSlot,
    commentEditFieldRef,
    commentEditVideoPostBlocked,
    lightboxPortalClass,
    avatarText,
    avatarToneClass,
    viewerFollowingUserIds,
    onFollowUser,
    feedVideoAutoplayEnabled,
    onFeedVideoAutoplayChange,
    onStreamLightboxOpenDetail,
    onSharePost,
  }

  const renderCommentRow = (comment) => (
    <LoungeCommentCard
      key={comment.id}
      comment={comment}
      navigable={Boolean(onOpenCommentThread)}
      onOpenCommentThread={onOpenCommentThread}
      descendantFallback={descendantCountByCommentId.get(comment.id) ?? 0}
      {...cardProps}
    />
  )

  if (variant === 'commentDetailReplies') {
    if (!focusComment || !focusCommentId) {
      return <p className="mt-1 text-[14px] text-zinc-500">Could not load this comment.</p>
    }
    return directRepliesSorted.length ? (
      <ul className={LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_CLASS}>
        {directRepliesSorted.map((r) => (
          <li key={r.id} className={LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_ITEM_CLASS}>
            <LoungeCommentCard
              comment={r}
              navigable={Boolean(onOpenCommentThread)}
              onOpenCommentThread={onOpenCommentThread}
              descendantFallback={descendantCountByCommentId.get(r.id) ?? 0}
              {...cardProps}
            />
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-1 text-[14px] text-zinc-500">No replies yet.</p>
    )
  }

  const hasRootComments = rootsSorted.length > 0 || orphanOpAuthorReplies.length > 0

  if (!hasRootComments) {
    return <p className="mt-1 text-[14px] text-zinc-500">No comments yet. Be the first.</p>
  }

  return (
    <ul className={LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_CLASS}>
      {rootsSorted.map((root) => (
        <li key={root.id} className={LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_ITEM_CLASS}>
          {renderCommentRow(root)}
        </li>
      ))}
      {orphanOpAuthorReplies.map((c) => (
        <li key={c.id} className={LOUNGE_FEED_POST_DETAIL_COMMENT_LIST_ITEM_CLASS}>
          {renderCommentRow(c)}
        </li>
      ))}
    </ul>
  )
}
