import { useCallback, useMemo, useState } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import {
  buildLoungeCommentForest,
  loungeCommentDescendantCount,
  loungeCommentOpRepliesInSubtree,
} from '../../utils/loungeFeedComments'

const INDENT_PX = 20
const MAX_VISUAL_DEPTH = 4

function profileHandleLabel(profile) {
  const h = String(profile?.handle || '').trim()
  if (h) return `@${h}`
  return String(profile?.display_name || 'Member').trim() || 'Member'
}

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

function CommentThreadLayout({ depth, children }) {
  if (depth <= 0) {
    return <div className="flex gap-2.5">{children}</div>
  }
  const pad = Math.min(depth, MAX_VISUAL_DEPTH) * INDENT_PX
  return (
    <div className="flex min-w-0" style={{ paddingLeft: pad }}>
      <div className="relative flex min-w-0 flex-1 gap-2.5 pl-3">
        <span className="pointer-events-none absolute bottom-0 left-0 top-0 w-px bg-zinc-700/90" aria-hidden />
        {children}
      </div>
    </div>
  )
}

function CommentRow({
  comment,
  depth,
  postAuthorUserId,
  postAgeLabel,
  readOnly,
  onReply,
  isPostAuthorComment,
  replyingToLabel,
}) {
  const profile = comment.author_profile
  const displayName = profile?.display_name || profile?.handle || 'Member'
  const avatarSize = depth > 0 ? 'h-8 w-8 text-[12px]' : 'h-9 w-9 text-[13px]'
  const isPostAuthor = Boolean(
    isPostAuthorComment ?? (postAuthorUserId && comment.user_id === postAuthorUserId),
  )

  return (
    <article className="min-w-0">
      {replyingToLabel ? (
        <p className="mb-1 truncate text-[12px] text-zinc-500">
          Replying to <span className="font-semibold text-zinc-400">{replyingToLabel}</span>
        </p>
      ) : null}
      <CommentThreadLayout depth={depth}>
        <CommentAvatar profile={profile} comment={comment} className={`${avatarSize} shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 font-bold text-zinc-200`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2 text-[13px] text-zinc-500">
            <span className="flex min-w-0 items-baseline gap-1.5 truncate font-semibold text-zinc-300">
              <span className="min-w-0 truncate">{displayName}</span>
              {isPostAuthor ? (
                <span className="shrink-0 rounded-md bg-violet-950/50 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-violet-300">
                  Author
                </span>
              ) : null}
              <LoungeStaffRoleBadge role={profile?.role} size="detail" />
              <LoungeOgBadge isOg={profile?.is_og} size="detail" />
            </span>
            <span className="shrink-0 tabular-nums">{postAgeLabel(comment.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-snug text-zinc-100">
            {comment.body}
          </p>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="mt-1.5 min-h-9 rounded-lg px-1 text-[13px] font-semibold text-zinc-500 touch-manipulation hover:text-violet-300 [-webkit-tap-highlight-color:transparent]"
            >
              Reply
            </button>
          ) : null}
        </div>
      </CommentThreadLayout>
    </article>
  )
}

function CommentNode({
  comment,
  depth,
  postAuthorUserId,
  postAgeLabel,
  readOnly,
  expandedIds,
  onToggleExpand,
  onReply,
}) {
  const isExpanded = expandedIds.has(comment.id)
  const descendantCount = loungeCommentDescendantCount(comment)
  const opReplies = useMemo(
    () => loungeCommentOpRepliesInSubtree(comment, postAuthorUserId),
    [comment, postAuthorUserId],
  )

  if (isExpanded) {
    return (
      <li className="space-y-3">
        <CommentRow
          comment={comment}
          depth={depth}
          postAuthorUserId={postAuthorUserId}
          postAgeLabel={postAgeLabel}
          readOnly={readOnly}
          onReply={onReply}
        />
        {comment.children?.length ? (
          <ul className="space-y-3">
            {comment.children.map((child) => (
              <CommentNode
                key={child.id}
                comment={child}
                depth={depth + 1}
                postAuthorUserId={postAuthorUserId}
                postAgeLabel={postAgeLabel}
                readOnly={readOnly}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                onReply={onReply}
              />
            ))}
          </ul>
        ) : null}
      </li>
    )
  }

  const hiddenCount = descendantCount - opReplies.length

  return (
    <li className="space-y-3">
      <CommentRow
        comment={comment}
        depth={depth}
        postAuthorUserId={postAuthorUserId}
        postAgeLabel={postAgeLabel}
        readOnly={readOnly}
        onReply={onReply}
      />
      {opReplies.map(({ comment: opComment, parent }) => {
        const parentVisible = parent?.id === comment.id
        const replyingToLabel = parentVisible ? null : profileHandleLabel(parent?.author_profile)
        return (
          <CommentRow
            key={opComment.id}
            comment={opComment}
            depth={depth + 1}
            postAuthorUserId={postAuthorUserId}
            postAgeLabel={postAgeLabel}
            readOnly={readOnly}
            onReply={onReply}
            isPostAuthorComment
            replyingToLabel={replyingToLabel}
          />
        )
      })}
      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => onToggleExpand(comment.id)}
          className="min-h-10 rounded-lg px-1 text-[13px] font-semibold text-violet-400 touch-manipulation hover:text-violet-300 [-webkit-tap-highlight-color:transparent]"
          style={{ marginLeft: Math.min(depth + 1, MAX_VISUAL_DEPTH) * INDENT_PX }}
        >
          Show {hiddenCount} repl{hiddenCount === 1 ? 'y' : 'ies'}
        </button>
      ) : null}
    </li>
  )
}

/**
 * Threaded comments for Lounge post detail — collapsed by default; auto-surfaces post-author replies only.
 */
export default function LoungePostCommentThread({
  comments,
  postAuthorUserId = '',
  postAgeLabel,
  readOnly = false,
  onReply,
  composerSlot,
  autoExpandThreadRootIds = [],
}) {
  const forest = useMemo(() => buildLoungeCommentForest(comments), [comments])
  const [userExpandedIds, setUserExpandedIds] = useState(() => new Set())

  const expandedIds = useMemo(() => {
    const next = new Set(userExpandedIds)
    for (const id of autoExpandThreadRootIds || []) {
      if (id) next.add(id)
    }
    return next
  }, [userExpandedIds, autoExpandThreadRootIds])

  const onToggleExpand = useCallback((commentId) => {
    setUserExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(commentId)) next.delete(commentId)
      else next.add(commentId)
      return next
    })
  }, [])

  if (forest.length === 0) {
    return (
      <>
        <p className="mt-2 text-[14px] text-zinc-500">No comments yet. Be the first.</p>
        {composerSlot}
      </>
    )
  }

  return (
    <>
      <ul className="mt-3 space-y-4">
        {forest.map((root) => (
          <CommentNode
            key={root.id}
            comment={root}
            depth={0}
            postAuthorUserId={postAuthorUserId}
            postAgeLabel={postAgeLabel}
            readOnly={readOnly}
            expandedIds={expandedIds}
            onToggleExpand={onToggleExpand}
            onReply={onReply}
          />
        ))}
      </ul>
      {composerSlot}
    </>
  )
}
