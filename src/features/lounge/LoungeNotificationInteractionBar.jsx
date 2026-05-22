import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import {
  LOUNGE_FEED_POST_DETAIL_COMMENT_INTERACTIONS_CLASS,
  LOUNGE_FEED_POST_INTERACTIONS_CLASS,
} from './loungeFeedAvatar.js'

/**
 * Interaction row on notification cards (comments, replies, mentions, quote reposts).
 */
export default function LoungeNotificationInteractionBar({
  kind,
  entity,
  event,
  postCardProps,
  repostMenuScrollRootRef,
  onOpenPost,
  onEntityCountsChange,
}) {
  if (!kind || !entity?.id || !postCardProps) return null

  const {
    loungeReadOnly,
    interactionStateFor,
    interactionStateForComment,
    toggleInteraction,
    toggleBookmark,
    bookmarkedByPost,
    onPlainRepost,
    onUndoPlainRepost,
    onRemoveQuoteRepost,
    onQuoteRepost,
    requireLoungeAuth,
    openProfileGateIfNeeded,
    onOpenComments,
    onToggleCommentLike,
    onToggleCommentBookmark,
    getCommentBookmarked,
    onCommentPlainRepost,
    onCommentUndoPlainRepost,
    commentToggleInteraction,
    repostActionBusy,
  } = postCardProps

  const patchCounts = (patch) => {
    onEntityCountsChange?.(kind, entity.id, patch)
  }

  if (kind === 'comment') {
    const commentId = entity.id
    return (
      <div
        className="w-full"
        data-lounge-post-interaction-bar
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <LoungePostInteractionBar
          post={entity}
          variant="comment"
          rootClassName={LOUNGE_FEED_POST_DETAIL_COMMENT_INTERACTIONS_CLASS}
          repostMenuPortalClass="z-[101]"
          loungeReadOnly={loungeReadOnly}
          interactionStateFor={interactionStateForComment}
          toggleInteraction={commentToggleInteraction}
          onPlainRepost={onCommentPlainRepost}
          onUndoPlainRepost={onCommentUndoPlainRepost}
          onToggleLike={
            onToggleCommentLike
              ? async () => {
                  const was = interactionStateForComment?.(commentId)?.liked
                  patchCounts({
                    like_count: Math.max(0, (Number(entity.like_count) || 0) + (was ? -1 : 1)),
                  })
                  await onToggleCommentLike(commentId)
                }
              : undefined
          }
          onToggleBookmark={
            onToggleCommentBookmark ? () => onToggleCommentBookmark(commentId) : undefined
          }
          getBookmarked={getCommentBookmarked}
          requireLoungeAuth={requireLoungeAuth}
          openProfileGateIfNeeded={openProfileGateIfNeeded}
          repostMenuScrollRootRef={repostMenuScrollRootRef}
          repostActionBusy={repostActionBusy}
          onCommentClick={
            event?.post_id && event?.comment_id
              ? () => {
                  onOpenPost?.({ postId: event.post_id, commentId: event.comment_id, focusComposer: true })
                }
              : undefined
          }
        />
      </div>
    )
  }

  const postId = entity.id
  return (
    <div
      className="w-full"
      data-lounge-post-interaction-bar
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <LoungePostInteractionBar
        post={entity}
        variant="feed"
        rootClassName={LOUNGE_FEED_POST_INTERACTIONS_CLASS}
        repostMenuPortalClass="z-[101]"
        loungeReadOnly={loungeReadOnly}
        interactionStateFor={interactionStateFor}
        toggleInteraction={async (id, key) => {
          if (key === 'liked') {
            const was = interactionStateFor?.(id)?.liked
            patchCounts({
              like_count: Math.max(0, (Number(entity.like_count) || 0) + (was ? -1 : 1)),
            })
          }
          await toggleInteraction?.(id, key)
        }}
        onPlainRepost={onPlainRepost}
        onUndoPlainRepost={onUndoPlainRepost}
        onRemoveQuoteRepost={onRemoveQuoteRepost}
        onQuoteRepost={onQuoteRepost}
        toggleBookmark={toggleBookmark}
        bookmarkedByPost={bookmarkedByPost}
        onOpenComments={onOpenComments}
        requireLoungeAuth={requireLoungeAuth}
        openProfileGateIfNeeded={openProfileGateIfNeeded}
        repostMenuScrollRootRef={repostMenuScrollRootRef}
        onCommentClick={
          event?.post_id
            ? () => {
                onOpenPost?.({
                  postId: event.post_id,
                  commentId:
                    event.event_type === 'comment_on_post' && event.comment_id
                      ? event.comment_id
                      : null,
                  focusComposer: true,
                })
              }
            : undefined
        }
      />
    </div>
  )
}
