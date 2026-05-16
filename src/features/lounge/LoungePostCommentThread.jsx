import { useMemo, useCallback } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import {
  feedCommentDescendantCountById,
  feedCommentRowHasMedia,
  feedCommentSubtreeReplyCount,
} from '../../utils/communityFeedComment.js'
import {
  compareFeedCommentsChronologicalAsc,
  LOUNGE_DETAIL_COMMENT_SORT,
  orderCommentDetailDirectReplies,
  orderPostDetailRootComments,
} from '../../utils/loungeFeedCommentSort.js'
import { LOUNGE_COMMENT_BODY_MAX } from '../../utils/loungeCommentLimits.js'

function CommentAvatar({ profile, comment, className }) {
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${className} object-cover`} />
  }
  return (
    <span
      className={`grid place-items-center font-bold text-white ${profileAvatarToneClass(
        profile?.user_id || profile?.handle || comment?.user_id || 'member',
      )} ${className}`}
    >
      {profileAvatarInitials(profile?.display_name, profile?.handle)}
    </span>
  )
}

/**
 * Meta row matches `LoungePostArticle`: name, badges, handle · time (left); ⋯ menu on the right.
 *
 * @param {boolean} navigable — Whole row opens the comment thread (not nested interactive targets except avatar / menu / interaction bar).
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
  editingCommentId,
  commentEditDraft,
  onCommentEditDraftChange,
  onCommentEditSave,
  onCommentEditCancel,
  commentEditBusy,
  commentEditHasRemoteMedia = false,
  mediaFeedVariant: mediaFeedVariantProp = 'commentInline',
  resolveMediaFeedVariant,
  showDetailTimestamp = false,
  detailTimestampLabel = '',
  avatarButtonRef = null,
}) {
  const mediaFeedVariant =
    typeof resolveMediaFeedVariant === 'function'
      ? resolveMediaFeedVariant(comment)
      : mediaFeedVariantProp
  const profile = comment.author_profile
  const displayName = typeof displayNameFor === 'function' ? displayNameFor(comment) : profile?.display_name || profile?.handle || 'Member'
  const handleLabel = typeof handleFor === 'function' ? handleFor(comment) : '@member'
  const avatarClass =
    'mt-0.5 h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 font-bold text-zinc-200 text-[15px] sm:h-[2.75rem] sm:w-[2.75rem] sm:text-[16px]'
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

  const menuIsOwn = Boolean(viewerUserId && comment.user_id === viewerUserId)
  const showCommentMenu = Boolean(
    !loungeReadOnly &&
      viewerUserId &&
      (typeof onCommentMenuEdit === 'function' ||
        typeof onCommentMenuDelete === 'function' ||
        typeof onCommentMenuBlock === 'function' ||
        typeof onCommentMenuReport === 'function'),
  )

  const metaHeader = (
    <div className="flex min-w-0 items-start gap-2 pt-0.5">
      <div className="min-w-0 flex-1 overflow-hidden text-left">
        <div className="flex min-w-0 flex-nowrap items-center justify-start gap-x-1.5 text-[15px] leading-snug">
          <span className="min-w-0 truncate font-semibold text-zinc-100">{displayName}</span>
          <span className="shrink-0">
            <LoungeStaffRoleBadge role={profile?.role} />
          </span>
          <span className="shrink-0">
            <LoungeOgBadge isOg={profile?.is_og} />
          </span>
          <span className="inline-flex min-w-0 max-w-[min(11rem,52vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[15px] text-zinc-500 sm:max-w-[13rem]">
            <span className="min-w-0 truncate">{handleLabel}</span>
            <span className="shrink-0 text-zinc-600">·</span>
            <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">{postAgeLabel(comment.created_at)}</span>
          </span>
        </div>
      </div>
      {showCommentMenu ? (
        <div className="shrink-0 self-start translate-y-px">
          <LoungePostRowMenu
            menuAriaLabel="Comment options"
            isOwn={menuIsOwn}
            showEdit={Boolean(menuIsOwn && typeof onCommentMenuEdit === 'function')}
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
      <textarea
        value={commentEditDraft}
        onChange={(e) => onCommentEditDraftChange?.(e.target.value)}
        rows={3}
        maxLength={LOUNGE_COMMENT_BODY_MAX}
        className="w-full resize-y rounded-xl border border-zinc-600/70 bg-zinc-900/90 px-3 py-2 text-[15px] leading-snug text-zinc-100 outline-none focus:border-cyan-600/55 touch-manipulation"
        aria-label="Edit reply"
      />
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
            (!String(commentEditDraft || '').trim() && !commentEditHasRemoteMedia) ||
            String(commentEditDraft || '').length > LOUNGE_COMMENT_BODY_MAX
          }
          className="rounded-full border border-cyan-600/70 bg-cyan-950/40 px-3 py-1 text-[13px] font-semibold text-cyan-100 hover:bg-cyan-900/50 disabled:opacity-50 touch-manipulation"
        >
          {commentEditBusy ? 'Saving…' : 'Save'}
        </button>
        <span className="text-[12px] tabular-nums text-zinc-500">
          {String(commentEditDraft || '').length}/{LOUNGE_COMMENT_BODY_MAX}
        </span>
      </div>
    </div>
  ) : (
    (() => {
      const bodyText = String(comment.body || '').trim()
      if (!bodyText) return null
      return (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-snug text-zinc-100">
          {comment.body}
        </p>
      )
    })()
  )

  const commentMediaBlock =
    !bodyEditing && feedCommentRowHasMedia(comment) ? (
      <LoungePostFeedImagesAndGif
        post={comment}
        variant={mediaFeedVariant}
        firstMarginTopClass={String(comment.body || '').trim() ? 'mt-1.5' : 'mt-0.5'}
        visibilityResetRootRef={positionScrollRootRef}
      />
    ) : null

  const metaRow = (
    <div className="flex items-start gap-3">
      <button
        ref={avatarButtonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onAvatarClickProfile?.(comment)
        }}
        className="shrink-0 touch-manipulation [-webkit-tap-highlight-color:transparent]"
        aria-label={`Open profile for ${displayName}`}
      >
        <CommentAvatar profile={profile} comment={comment} className={avatarClass} />
      </button>
      <div className="min-w-0 flex-1">
        {metaHeader}
        {bodyBlock}
        {commentMediaBlock}
        {showDetailTimestamp && detailTimestampLabel && !bodyEditing ? (
          <div className="mt-2 text-[14px] leading-tight text-zinc-500">{detailTimestampLabel}</div>
        ) : null}
        {bodyEditing ? null : interactionBarPost ? (
          <LoungePostInteractionBar
            post={interactionBarPost}
            variant="comment"
            rootClassName="mt-1 w-full"
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
              'button, a, textarea, input, select, [data-lounge-post-menu], [data-lounge-badge-tip], [data-lounge-post-interaction-bar]',
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
        className="min-w-0 cursor-pointer rounded-lg px-1 py-1 touch-manipulation outline-none hover:bg-zinc-900/50 [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-violet-500/40"
      >
        {metaRow}
      </article>
    )
  }

  return <article className="min-w-0 px-1 py-1">{metaRow}</article>
}

/**
 * Post detail comments — tap any comment to open its own comment-detail screen (OP + ancestry + replies).
 *
 * **`variant === 'post'`:** Top-level roots only; all replies (including OP) open via comment detail.
 *
 * @param {'post' | 'commentDetailReplies'} variant
 * @param {string | null} focusCommentId — Required when `variant === 'commentDetailReplies'`.
 * @param {string | null} [postAuthorUserId] — Post author's `user_id`; used for sort + orphan OP root rows.
 */
export default function LoungePostCommentThread({
  comments,
  postAgeLabel,
  /** Same helpers as feed posts (`comment` has `author_profile` like a post). */
  displayNameFor,
  handleFor,
  variant = 'post',
  /** Post owner's user id — used for ranked sort buckets and orphan OP root rows. */
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
  editingCommentId,
  commentEditDraft,
  onCommentEditDraftChange,
  onCommentEditSave,
  onCommentEditCancel,
  commentEditBusy,
  commentEditHasRemoteMedia = false,
  /** Comment ids the signed-in viewer just posted — shown at top of their list only (chronological for others). */
  viewerPinnedCommentIds = [],
  /** First-level sort on post detail (`ranked` | `popular` | `chronological` | `likes`). */
  rootCommentSortMode = LOUNGE_DETAIL_COMMENT_SORT.RANKED,
  /** `profile_follows.following_id` for the signed-in viewer. */
  followingUserIds = [],
}) {
  const byId = useMemo(() => new Map((comments || []).map((c) => [c.id, c])), [comments])

  const descendantCountByCommentId = useMemo(
    () => feedCommentDescendantCountById(comments),
    [comments],
  )

  const rootsSorted = useMemo(() => {
    if (variant !== 'post') return []
    return orderPostDetailRootComments({
      roots: comments,
      postAuthorUserId,
      viewerUserId,
      followingUserIds,
      viewerPinnedCommentIds,
      sortMode: rootCommentSortMode,
    })
  }, [
    comments,
    followingUserIds,
    postAuthorUserId,
    rootCommentSortMode,
    variant,
    viewerPinnedCommentIds,
    viewerUserId,
  ])

  const rootIdSet = useMemo(() => new Set(rootsSorted.map((r) => r.id).filter(Boolean)), [rootsSorted])

  /** OP replies to a non-root parent — show as extra root rows so nothing disappears. */
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
    return orderCommentDetailDirectReplies({
      replies: direct,
      viewerPinnedCommentIds,
      sortMode: rootCommentSortMode,
    })
  }, [comments, focusCommentId, rootCommentSortMode, variant, viewerPinnedCommentIds])

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
    editingCommentId,
    commentEditDraft,
    onCommentEditDraftChange,
    onCommentEditSave,
    onCommentEditCancel,
    commentEditBusy,
    commentEditHasRemoteMedia,
  }

  if (variant === 'commentDetailReplies') {
    if (!focusComment || !focusCommentId) {
      return <p className="mt-1 text-[14px] text-zinc-500">Could not load this comment.</p>
    }
    return directRepliesSorted.length ? (
      <ul className="mt-1.5 divide-y divide-zinc-800/70 space-y-0 border-t border-zinc-800/70 pt-1.5">
        {directRepliesSorted.map((r) => (
          <li key={r.id}>
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
      <p className="mt-1.5 border-t border-zinc-800/70 pt-1.5 text-[14px] text-zinc-500">No replies yet.</p>
    )
  }

  if (rootsSorted.length === 0) {
    return <p className="mt-1 text-[14px] text-zinc-500">No comments yet. Be the first.</p>
  }

  return (
    <ul className="mt-0 divide-y divide-zinc-800/70 space-y-0">
      {rootsSorted.map((root) => (
        <li key={root.id} className="min-w-0">
          <LoungeCommentCard
            comment={root}
            navigable={Boolean(onOpenCommentThread)}
            onOpenCommentThread={onOpenCommentThread}
            descendantFallback={descendantCountByCommentId.get(root.id) ?? 0}
            {...cardProps}
          />
        </li>
      ))}
      {orphanOpAuthorReplies.map((c) => (
        <li key={c.id} className="min-w-0">
          <LoungeCommentCard
            comment={c}
            navigable={Boolean(onOpenCommentThread)}
            onOpenCommentThread={onOpenCommentThread}
            descendantFallback={descendantCountByCommentId.get(c.id) ?? 0}
            {...cardProps}
          />
        </li>
      ))}
    </ul>
  )
}
