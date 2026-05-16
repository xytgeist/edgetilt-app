import { useMemo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import {
  profileAvatarInitials,
  profileAvatarToneClass,
} from '../profiles/profileGate'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import { feedCommentRowHasMedia } from '../../utils/communityFeedComment.js'
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
function LoungeCommentCard({
  comment,
  postAgeLabel,
  displayNameFor,
  handleFor,
  navigable,
  onOpenCommentThread,
  onAvatarClickProfile,
  directReplyCount = 0,
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
      comment_count: directReplyCount,
      like_count: typeof comment.like_count === 'number' ? comment.like_count : 0,
      repost_count: typeof comment.repost_count === 'number' ? comment.repost_count : 0,
    }
  }, [comment, directReplyCount])

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
        aria-label="View replies to this comment"
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

/** Profile avatar control in `LoungeCommentCard` — stable selector for thread connector geometry. */
const COMMENT_AVATAR_BUTTON_SEL = 'button[aria-label^="Open profile"]'

/**
 * Root + OP replies: same layout as flat comments; vertical segment from just below the parent avatar
 * to just above the first OP avatar (no tail through OP body / bar).
 */
function RootCommentWithOpConnector({
  root,
  nestedOp,
  directReplyCountByCommentId,
  onOpenCommentThread,
  cardProps,
}) {
  const liRef = useRef(null)
  const rootWrapRef = useRef(null)
  const firstOpWrapRef = useRef(null)
  const [line, setLine] = useState(null)

  const nestedKey = nestedOp.map((c) => c.id).join(',')

  const updateLine = useCallback(() => {
    const li = liRef.current
    const rootW = rootWrapRef.current
    const opW = firstOpWrapRef.current
    if (!li || !rootW || !opW) {
      setLine(null)
      return
    }
    const rootBtn = rootW.querySelector(COMMENT_AVATAR_BUTTON_SEL)
    const opBtn = opW.querySelector(COMMENT_AVATAR_BUTTON_SEL)
    if (!(rootBtn instanceof HTMLElement) || !(opBtn instanceof HTMLElement)) {
      setLine(null)
      return
    }
    const liRect = li.getBoundingClientRect()
    const rr = rootBtn.getBoundingClientRect()
    const or = opBtn.getBoundingClientRect()
    const cxRoot = (rr.left + rr.right) / 2 - liRect.left
    const cxOp = (or.left + or.right) / 2 - liRect.left
    const x = (cxRoot + cxOp) / 2

    /** Small gap so the stroke does not touch the circular avatars. */
    const END_PAD_PX = 3
    const yStart = rr.bottom - liRect.top + END_PAD_PX
    const yEnd = or.top - liRect.top - END_PAD_PX
    if (yEnd <= yStart) {
      setLine(null)
      return
    }
    setLine({ left: x, top: yStart, height: yEnd - yStart })
  }, [nestedKey, root.id])

  useLayoutEffect(() => {
    updateLine()
    const el = liRef.current
    if (!el || typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLine)
      return () => window.removeEventListener('resize', updateLine)
    }
    const ro = new ResizeObserver(() => updateLine())
    ro.observe(el)
    window.addEventListener('resize', updateLine)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateLine)
    }
  }, [updateLine])

  return (
    <li ref={liRef} className="relative min-w-0">
      <div ref={rootWrapRef}>
        <LoungeCommentCard
          comment={root}
          navigable={Boolean(onOpenCommentThread)}
          onOpenCommentThread={onOpenCommentThread}
          directReplyCount={directReplyCountByCommentId.get(root.id) ?? 0}
          {...cardProps}
        />
      </div>
      <>
        {line ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-0 w-0.5 bg-zinc-500/30"
            style={{
              left: line.left,
              top: line.top,
              height: line.height,
              transform: 'translateX(-50%)',
            }}
          />
        ) : null}
        <div className="relative z-[1] mt-1 space-y-0" aria-label="Replies from the post author">
          {nestedOp.map((reply, idx) => (
            <div
              key={reply.id}
              ref={idx === 0 ? firstOpWrapRef : undefined}
              className={idx > 0 ? 'border-t border-zinc-800/60 pt-1.5' : ''}
            >
              <LoungeCommentCard
                comment={reply}
                navigable={Boolean(onOpenCommentThread)}
                onOpenCommentThread={onOpenCommentThread}
                directReplyCount={directReplyCountByCommentId.get(reply.id) ?? 0}
                {...cardProps}
              />
            </div>
          ))}
        </div>
      </>
    </li>
  )
}

/** Viewer’s own just-posted rows (session pin) sort first; everyone else stays chronological. */
function compareCommentsChronologicalAsc(a, b, viewerPinnedCommentIds) {
  const pins = viewerPinnedCommentIds || []
  const pinIndex = new Map(pins.map((id, i) => [id, i]))
  const ai = pinIndex.has(a.id) ? pinIndex.get(a.id) : Number.POSITIVE_INFINITY
  const bi = pinIndex.has(b.id) ? pinIndex.get(b.id) : Number.POSITIVE_INFINITY
  if (ai !== bi) return ai - bi
  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
}

/** Drill-down replies: pinned first, then newest-first for the rest. */
function compareDirectRepliesForViewer(a, b, viewerPinnedCommentIds) {
  const pins = viewerPinnedCommentIds || []
  const pinIndex = new Map(pins.map((id, i) => [id, i]))
  const aPin = pinIndex.has(a.id)
  const bPin = pinIndex.has(b.id)
  if (aPin !== bPin) return aPin ? -1 : 1
  if (aPin && bPin) return pinIndex.get(a.id) - pinIndex.get(b.id)
  return String(b.created_at || '').localeCompare(String(a.created_at || ''))
}

/**
 * Post detail comments — roots tap through into threaded replies on separate drill-down screens.
 *
 * **`variant === 'post'`:** On the main post detail list, only **one** kind of inline grouping is shown:
 * replies authored by **`postAuthorUserId`** (the post owner) whose `parent_id` is a **top-level** comment
 * on that post — rendered **below** that parent with the **same alignment** as other comments; a **short vertical segment**
 * from just below the parent commenter’s avatar to just above the **first** OP reply’s avatar marks the reply. Other replies stay drill-down only. OP replies whose parent is not a visible root render as
 * extra root rows (fallback) so nothing disappears.
 *
 * @param {'post' | 'commentDetail'} variant
 * @param {string | null} focusCommentId — Required when `variant === 'commentDetail'`.
 * @param {string | null} [postAuthorUserId] — Post author's `user_id`; enables OP-only nesting when `variant === 'post'`.
 */
export default function LoungePostCommentThread({
  comments,
  postAgeLabel,
  /** Same helpers as feed posts (`comment` has `author_profile` like a post). */
  displayNameFor,
  handleFor,
  variant = 'post',
  /** Post owner's user id — used to nest their replies under parent comments on the main detail list only. */
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
}) {
  const byId = useMemo(() => new Map((comments || []).map((c) => [c.id, c])), [comments])

  const directReplyCountByCommentId = useMemo(() => {
    const m = new Map()
    for (const c of comments || []) {
      const pid = c.parent_id
      if (!pid) continue
      m.set(pid, (m.get(pid) || 0) + 1)
    }
    return m
  }, [comments])

  const rootsSorted = useMemo(() => {
    return [...(comments || [])]
      .filter((c) => !c.parent_id)
      .sort((a, b) => compareCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }, [comments, viewerPinnedCommentIds])

  const rootIdSet = useMemo(() => new Set(rootsSorted.map((r) => r.id).filter(Boolean)), [rootsSorted])

  /** OP-authored replies attached under a top-level parent (main detail only). */
  const opAuthorRepliesByParentId = useMemo(() => {
    const m = new Map()
    if (!postAuthorUserId) return m
    for (const c of comments || []) {
      const pid = c.parent_id
      if (!pid) continue
      if (c.user_id !== postAuthorUserId) continue
      if (!rootIdSet.has(pid)) continue
      const arr = m.get(pid) || []
      arr.push(c)
      m.set(pid, arr)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => compareCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
    }
    return m
  }, [comments, postAuthorUserId, rootIdSet, viewerPinnedCommentIds])

  /** OP replies to a non-root parent (not shown inline under a root) — keep visible as roots. */
  const orphanOpAuthorReplies = useMemo(() => {
    if (!postAuthorUserId) return []
    return [...(comments || [])]
      .filter(
        (c) =>
          Boolean(c.parent_id) &&
          c.user_id === postAuthorUserId &&
          !rootIdSet.has(c.parent_id),
      )
      .sort((a, b) => compareCommentsChronologicalAsc(a, b, viewerPinnedCommentIds))
  }, [comments, postAuthorUserId, rootIdSet, viewerPinnedCommentIds])

  const focusComment = useMemo(() => {
    if (!focusCommentId) return null
    return byId.get(focusCommentId) || null
  }, [byId, focusCommentId])

  const directRepliesNewestFirst = useMemo(() => {
    if (!focusCommentId) return []
    return [...(comments || [])]
      .filter((c) => c.parent_id === focusCommentId)
      .sort((a, b) => compareDirectRepliesForViewer(a, b, viewerPinnedCommentIds))
  }, [comments, focusCommentId, viewerPinnedCommentIds])

  const mediaVariantForComment = useCallback(
    (comment) => {
      if (variant === 'commentDetail' && focusCommentId && comment?.id === focusCommentId) {
        return 'detail'
      }
      return 'commentInline'
    },
    [focusCommentId, variant],
  )

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

  if (variant === 'commentDetail') {
    if (!focusComment || !focusCommentId) {
      return <p className="mt-1 text-[14px] text-zinc-500">Could not load this comment.</p>
    }
    return (
      <>
        <LoungeCommentCard
          comment={focusComment}
          navigable={false}
          onOpenCommentThread={onOpenCommentThread}
          directReplyCount={directReplyCountByCommentId.get(focusComment.id) ?? 0}
          {...cardProps}
        />
        {directRepliesNewestFirst.length ? (
          <ul className="mt-1.5 divide-y divide-zinc-800/70 space-y-0 border-t border-zinc-800/70 pt-1.5">
            {directRepliesNewestFirst.map((r) => (
              <li key={r.id}>
                <LoungeCommentCard
                  comment={r}
                  navigable={Boolean(onOpenCommentThread)}
                  onOpenCommentThread={onOpenCommentThread}
                  directReplyCount={directReplyCountByCommentId.get(r.id) ?? 0}
                  {...cardProps}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 border-t border-zinc-800/70 pt-1.5 text-[14px] text-zinc-500">No replies yet.</p>
        )}
      </>
    )
  }

  if (rootsSorted.length === 0) {
    return <p className="mt-1 text-[14px] text-zinc-500">No comments yet. Be the first.</p>
  }

  return (
    <ul className="mt-0 divide-y divide-zinc-800/70 space-y-0">
      {rootsSorted.map((root) => {
        const nestedOp = opAuthorRepliesByParentId.get(root.id) || []
        if (nestedOp.length) {
          return (
            <RootCommentWithOpConnector
              key={root.id}
              root={root}
              nestedOp={nestedOp}
              directReplyCountByCommentId={directReplyCountByCommentId}
              onOpenCommentThread={onOpenCommentThread}
              cardProps={cardProps}
            />
          )
        }
        return (
          <li key={root.id} className="min-w-0">
            <LoungeCommentCard
              comment={root}
              navigable={Boolean(onOpenCommentThread)}
              onOpenCommentThread={onOpenCommentThread}
              directReplyCount={directReplyCountByCommentId.get(root.id) ?? 0}
              {...cardProps}
            />
          </li>
        )
      })}
      {orphanOpAuthorReplies.map((c) => (
        <li key={c.id} className="min-w-0">
          <LoungeCommentCard
            comment={c}
            navigable={Boolean(onOpenCommentThread)}
            onOpenCommentThread={onOpenCommentThread}
            directReplyCount={directReplyCountByCommentId.get(c.id) ?? 0}
            {...cardProps}
          />
        </li>
      ))}
    </ul>
  )
}
