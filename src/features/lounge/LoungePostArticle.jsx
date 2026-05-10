import { feedPostDisplayCaption } from '../../utils/communityFeedPost'
import { renderRichCaption } from './loungeCaption'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'

const actionIconClass = 'h-[20px] w-[20px] text-zinc-500'

/**
 * Single Lounge feed post (avatar row, caption, stats). Used on main feed and profile post list.
 */
export default function LoungePostArticle({
  post,
  loungeReadOnly,
  interactionStateFor,
  toggleInteraction,
  toggleBookmark,
  bookmarkedByPost,
  requireLoungeAuth,
  openProfileGateIfNeeded,
  onAvatarClick,
  loungeViewerIsStaff,
  setLoungePostPinned,
  loungePinBusy,
  displayNameFor,
  handleFor,
  postAgeLabel,
  displayLabel,
  avatarToneClass,
  avatarText,
  /** When set, avatar tap does not open profile (same user as profile owner). */
  suppressAvatarProfileNavigation,
  profileOwnerUserId,
}) {
  const ui = interactionStateFor(post.id)
  const isBookmarked = !!bookmarkedByPost[post.id]
  const baseComments = typeof post.comment_count === 'number' ? post.comment_count : 0
  const baseLikes = typeof post.like_count === 'number' ? post.like_count : 0
  const commentCount = baseComments + (loungeReadOnly ? 0 : ui.commented ? 1 : 0)
  const likeCount = baseLikes + (loungeReadOnly ? 0 : ui.liked ? 1 : 0)
  const commentClass = loungeReadOnly ? 'text-zinc-500' : ui.commented ? 'text-zinc-100' : 'text-zinc-500'
  const repostClass = loungeReadOnly ? 'text-zinc-500' : ui.reposted ? 'text-emerald-400' : 'text-zinc-500'
  const likeClass = loungeReadOnly ? 'text-zinc-500' : ui.liked ? 'text-rose-400' : 'text-zinc-500'
  const bookmarkClass = loungeReadOnly ? 'text-zinc-600' : isBookmarked ? 'text-amber-300' : 'text-zinc-500'
  const ro = loungeReadOnly

  const onAvatar = (e) => {
    e.stopPropagation()
    if (suppressAvatarProfileNavigation && profileOwnerUserId && post.user_id === profileOwnerUserId) return
    onAvatarClick(post)
  }

  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        title="View profile"
        onClick={onAvatar}
        className="mt-0.5 h-10 w-10 shrink-0 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 text-[15px] font-bold flex items-center justify-center overflow-hidden touch-manipulation hover:border-zinc-600 sm:h-[2.75rem] sm:w-[2.75rem] sm:text-[16px]"
      >
        {post?.author_profile?.avatar_url ? (
          <img
            src={post.author_profile.avatar_url}
            alt=""
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={`h-full w-full flex items-center justify-center text-white font-bold ${avatarToneClass(
              post?.author_profile?.user_id || post?.user_id || displayLabel(post)
            )}`}
          >
            {avatarText(post)}
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="min-w-0 overflow-hidden text-left">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 leading-snug">
            <span className="min-w-0 max-w-[min(12rem,46vw)] truncate font-semibold text-[15px] text-zinc-100 sm:max-w-[14rem]">
              {displayNameFor(post)}
            </span>
            <LoungeStaffRoleBadge role={post?.author_profile?.role} />
            <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[15px] text-zinc-500">
              <span className="min-w-0 truncate sm:max-w-[11rem]">{handleFor(post)}</span>
              <span className="shrink-0 text-zinc-600">·</span>
              <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">{postAgeLabel(post.created_at)}</span>
            </span>
            {post.pinned ? (
              <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                Pinned
              </span>
            ) : null}
            {loungeViewerIsStaff && !loungeReadOnly ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void setLoungePostPinned(post.id, !post.pinned)
                }}
                disabled={loungePinBusy}
                className="shrink-0 rounded-full border border-zinc-600/90 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-zinc-300 hover:border-fuchsia-500/50 hover:text-fuchsia-100 disabled:opacity-50 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              >
                {post.pinned ? 'Unpin' : 'Pin'}
              </button>
            ) : null}
          </div>
        </div>
        {post.game_slug ? (
          <div className="mt-1.5 flex justify-start">
            <span className="inline-flex max-w-full items-center truncate rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-tight text-amber-300 sm:max-w-[14rem]">
              {post.game_title}
            </span>
          </div>
        ) : null}
        <div className={`text-zinc-200 text-[17px] leading-tight whitespace-pre-wrap ${post.game_slug ? 'mt-1' : 'mt-1.5'}`}>
          {renderRichCaption(feedPostDisplayCaption(post))}
        </div>
        {post.edited_at ? (
          <div className="mt-1.5 text-left text-[14px] leading-tight text-zinc-500">Edited</div>
        ) : null}
        <div
          className="mt-2 grid grid-cols-5 items-center text-[14px]"
          onClick={(e) => e.stopPropagation()}
          role="group"
        >
          <LoungeFeedStatSlot
            readOnly={ro}
            title={ro ? 'Sign in to comment' : undefined}
            onReadOnlyClick={requireLoungeAuth}
            onClick={() => {
              if (openProfileGateIfNeeded()) return
              toggleInteraction(post.id, 'commented')
            }}
            className="inline-flex items-center justify-start gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70"
          >
            <svg className={`h-[20px] w-[20px] ${commentClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
              toggleInteraction(post.id, 'reposted')
            }}
            className="inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70"
          >
            <svg className={`h-[20px] w-[20px] ${repostClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
            onClick={() => toggleInteraction(post.id, 'liked')}
            className="inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70"
          >
            <svg className={`h-[20px] w-[20px] ${likeClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
          <span className="inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 text-zinc-600" title="Share" aria-hidden>
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
              className="inline-flex items-center justify-end gap-1.5 rounded px-1.5 py-1 text-zinc-600 hover:bg-zinc-900/70 touch-manipulation [-webkit-tap-highlight-color:transparent]"
              title="Sign in to save posts"
            >
              <svg className={`h-[20px] w-[20px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
              onClick={() => toggleBookmark(post.id)}
              className="inline-flex items-center justify-end gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70"
              title={isBookmarked ? 'Remove bookmark' : 'Save post'}
            >
              <svg className={`h-[20px] w-[20px] ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
    </div>
  )
}
