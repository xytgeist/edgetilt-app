import { useEffect, useRef, useState } from 'react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost'
import { renderRichCaption } from './loungeCaption'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'

const actionIconClass = 'h-[20px] w-[20px] text-zinc-500'

/**
 * Single Lounge feed post (avatar row, caption, stats). Used on main feed and profile post list.
 */
export default function LoungePostArticle({
  post,
  loungeReadOnly,
  interactionStateFor,
  toggleInteraction,
  /** Plain repost (no quote); requires caption empty + `is_plain_repost` in DB. */
  onPlainRepost,
  /** When user already reposted: open sheet to undo plain / remove quote / add quote. */
  onRepostManage,
  /** Quote repost (opens composer with caption). */
  onQuoteRepost,
  toggleBookmark,
  bookmarkedByPost,
  /** Opens post detail / comments (e.g. feed row comment control). */
  onOpenComments,
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
  viewerUserId,
  captionEditableInMenu,
  onPostMenuEdit,
  onPostMenuDelete,
  onPostMenuBlock,
  onPostMenuReport,
  busyDeletingPostId,
  /** Moderator/admin: delete another user's post from the row menu. */
  onStaffPostDelete,
}) {
  const ui = interactionStateFor(post.id)
  const [repostMenuOpen, setRepostMenuOpen] = useState(false)
  const repostMenuRef = useRef(null)
  const isBookmarked = !!bookmarkedByPost[post.id]
  const baseComments = typeof post.comment_count === 'number' ? post.comment_count : 0
  const baseLikes = typeof post.like_count === 'number' ? post.like_count : 0
  const baseReposts = typeof post.repost_count === 'number' ? post.repost_count : 0
  const commentCount = baseComments
  const likeCount = baseLikes
  const repostCount = baseReposts
  const commentClass = loungeReadOnly ? 'text-zinc-500' : ui.commented ? 'text-zinc-100' : 'text-zinc-500'
  const repostClass = loungeReadOnly ? 'text-zinc-500' : ui.reposted ? 'text-emerald-400' : 'text-zinc-500'
  const likeClass = loungeReadOnly ? 'text-zinc-500' : ui.liked ? 'text-rose-400' : 'text-zinc-500'
  const bookmarkClass = loungeReadOnly ? 'text-zinc-600' : isBookmarked ? 'text-amber-300' : 'text-zinc-500'
  const ro = loungeReadOnly
  const menuIsOwn = Boolean(viewerUserId && post?.user_id === viewerUserId)
  const showPostRowMenu = Boolean(
    !ro &&
      viewerUserId &&
      (onPostMenuEdit ||
        onPostMenuDelete ||
        onPostMenuBlock ||
        onPostMenuReport ||
        (loungeViewerIsStaff && !menuIsOwn && typeof onStaffPostDelete === 'function'))
  )
  const menuShowEdit = Boolean(menuIsOwn && typeof captionEditableInMenu === 'function' && captionEditableInMenu(post))

  useEffect(() => {
    if (!repostMenuOpen) return
    const close = (e) => {
      const el = repostMenuRef.current
      if (el && e.target instanceof Node && el.contains(e.target)) return
      setRepostMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [repostMenuOpen])

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
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 overflow-hidden text-left">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] leading-snug">
              <span className="min-w-0 max-w-[min(12rem,46vw)] truncate font-semibold text-zinc-100 sm:max-w-[14rem]">
                {displayNameFor(post)}
              </span>
              <LoungeStaffRoleBadge role={post?.author_profile?.role} />
              <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-zinc-500">
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
          {showPostRowMenu ? (
            <LoungePostRowMenu
              isOwn={menuIsOwn}
              showEdit={menuShowEdit}
              deleteBusy={Boolean(busyDeletingPostId && busyDeletingPostId === post.id)}
              onEdit={() => onPostMenuEdit?.(post)}
              onDelete={() => onPostMenuDelete?.(post)}
              showStaffDelete={Boolean(loungeViewerIsStaff && !menuIsOwn && typeof onStaffPostDelete === 'function')}
              staffDeleteBusy={Boolean(busyDeletingPostId && busyDeletingPostId === post.id)}
              onStaffDelete={() => onStaffPostDelete?.(post)}
              onBlock={() => onPostMenuBlock?.(post)}
              onReport={() => onPostMenuReport?.(post)}
            />
          ) : null}
        </div>
        {post.game_slug ? (
          <div className="mt-1.5 flex justify-start">
            <span className="inline-flex max-w-full items-center truncate rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-tight text-amber-300 sm:max-w-[14rem]">
              {post.game_title}
            </span>
          </div>
        ) : null}
        {post.reposted_post ? (
          post?.is_plain_repost === true ? (
            <>
              <div className="mt-1.5 flex items-center gap-1.5 text-left text-[13px] leading-snug text-zinc-500">
                <svg className="h-4 w-4 shrink-0 text-emerald-500/90" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path
                    d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="min-w-0 font-medium text-zinc-400">
                  {viewerUserId && post.user_id === viewerUserId
                    ? 'You reposted'
                    : `${displayNameFor(post)} reposted`}
                </span>
              </div>
              <button
                type="button"
                data-lounge-original-embed
                aria-label="View original post"
                className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] leading-snug">
                  <span className="min-w-0 max-w-[min(11rem,42vw)] truncate font-semibold text-zinc-200 sm:max-w-[13rem]">
                    {displayNameFor(post.reposted_post)}
                  </span>
                  <LoungeStaffRoleBadge role={post.reposted_post?.author_profile?.role} size="detail" />
                  <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[14px] text-zinc-500">
                    <span className="min-w-0 max-w-[min(9rem,36vw)] truncate sm:max-w-[11rem]">{handleFor(post.reposted_post)}</span>
                  </span>
                  {post.reposted_post.pinned ? (
                    <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                      Pinned
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                  {renderRichCaption(feedPostDisplayCaption(post.reposted_post))}
                </div>
                <LoungePostFeedImagesAndGif
                  post={post.reposted_post}
                  variant="embed"
                  firstMarginTopClass="mt-2"
                />
              </button>
            </>
          ) : (
            <>
              {feedPostDisplayCaption(post) ? (
                <div className="mt-1.5 text-left text-[17px] leading-snug text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {renderRichCaption(feedPostDisplayCaption(post))}
                </div>
              ) : null}
              <LoungePostFeedImagesAndGif
                post={post}
                variant="feed"
                firstMarginTopClass={feedPostDisplayCaption(post) ? 'mt-2' : 'mt-1.5'}
              />
              <button
                type="button"
                data-lounge-original-embed
                aria-label="View original post"
                className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px] leading-snug">
                  <span className="min-w-0 max-w-[min(11rem,42vw)] truncate font-semibold text-zinc-200 sm:max-w-[13rem]">
                    {displayNameFor(post.reposted_post)}
                  </span>
                  <LoungeStaffRoleBadge role={post.reposted_post?.author_profile?.role} size="detail" />
                  <span className="inline-flex min-w-0 max-w-full items-center gap-x-1 text-[14px] text-zinc-500">
                    <span className="min-w-0 max-w-[min(9rem,36vw)] truncate sm:max-w-[11rem]">{handleFor(post.reposted_post)}</span>
                  </span>
                  {post.reposted_post.pinned ? (
                    <span className="shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                      Pinned
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                  {renderRichCaption(feedPostDisplayCaption(post.reposted_post))}
                </div>
                <LoungePostFeedImagesAndGif
                  post={post.reposted_post}
                  variant="embed"
                  firstMarginTopClass="mt-2"
                />
              </button>
            </>
          )
        ) : (
          <>
            {feedPostDisplayCaption(post) ? (
              <div className="mt-1.5 text-left text-[17px] leading-snug text-zinc-200 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {renderRichCaption(feedPostDisplayCaption(post))}
              </div>
            ) : null}
            <LoungePostFeedImagesAndGif
              post={post}
              variant="feed"
              firstMarginTopClass={feedPostDisplayCaption(post) ? 'mt-2' : 'mt-1.5'}
            />
          </>
        )}
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
              if (onOpenComments) {
                onOpenComments(post)
                return
              }
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
          <div className="relative flex justify-center" ref={repostMenuRef}>
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
                if (ui.reposted) {
                  setRepostMenuOpen(false)
                  onRepostManage?.(post)
                  return
                }
                if (onPlainRepost && onQuoteRepost) {
                  setRepostMenuOpen((o) => !o)
                  return
                }
                if (onQuoteRepost) {
                  onQuoteRepost(post)
                  return
                }
                void toggleInteraction(post.id, 'reposted')
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
              {Number.isFinite(repostCount) ? <span className={repostClass}>{repostCount}</span> : null}
            </LoungeFeedStatSlot>
            {repostMenuOpen && !ro && !ui.reposted && onPlainRepost && onQuoteRepost ? (
              <div
                role="menu"
                className="absolute bottom-full left-1/2 z-40 mb-1 min-w-[11rem] -translate-x-1/2 rounded-xl border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRepostMenuOpen(false)
                    onPlainRepost(post)
                  }}
                >
                  Repost
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRepostMenuOpen(false)
                    onQuoteRepost(post)
                  }}
                >
                  Quote repost
                </button>
              </div>
            ) : null}
          </div>
          <LoungeFeedStatSlot
            readOnly={ro}
            title={ro ? 'Sign in to like' : undefined}
            onReadOnlyClick={requireLoungeAuth}
            onClick={() => void toggleInteraction(post.id, 'liked')}
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
              onClick={() => void toggleBookmark(post.id)}
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
