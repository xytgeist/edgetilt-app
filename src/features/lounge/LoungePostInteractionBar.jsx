import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LoungeFeedStatSlot from './LoungeFeedStatSlot'
import { LoungeLikeStatContent } from './LoungeFlameIcon.jsx'

/**
 * Comment / repost / like / bookmark row — same behavior as the feed post row or post-detail sheet.
 *
 * @param {'feed' | 'sheet'} [props.variant='feed'] — `feed`: fixed portaled repost menus (feed card). `sheet`: absolute repost dropdown (post detail sheet styling).
 * @param {string} [props.repostMenuPortalClass='z-[48]'] — Tailwind z class for portaled repost menus (`feed` only). Use `z-[101]` above media lightboxes (`z-[100]`).
 * @param {() => void} [props.onCommentClick] — When set, runs instead of `onOpenComments` / `toggleInteraction('commented')` for the comment control.
 * @param {boolean} [props.repostActionBusy=false] — Disables repost menu actions (`sheet` only).
 */
export default function LoungePostInteractionBar({
  post,
  loungeReadOnly,
  interactionStateFor,
  toggleInteraction,
  onPlainRepost,
  onUndoPlainRepost,
  onRemoveQuoteRepost,
  onQuoteRepost,
  toggleBookmark,
  bookmarkedByPost,
  onOpenComments,
  requireLoungeAuth,
  openProfileGateIfNeeded,
  repostMenuScrollRootRef,
  variant = 'feed',
  repostMenuPortalClass = 'z-[48]',
  onCommentClick,
  repostActionBusy = false,
  /** Extra classes on the outer grid wrapper (e.g. `w-full` in lightbox). */
  rootClassName = '',
}) {
  const ui = interactionStateFor(post.id)
  const [repostMenuOpen, setRepostMenuOpen] = useState(false)
  const repostMenuRef = useRef(null)
  const repostMenuPortalRef = useRef(null)
  const [repostMenuFixed, setRepostMenuFixed] = useState({ top: 0, left: 0 })
  const isBookmarked = !!bookmarkedByPost[post.id]
  const baseComments = typeof post.comment_count === 'number' ? post.comment_count : 0
  const baseLikes = typeof post.like_count === 'number' ? post.like_count : 0
  const baseReposts = typeof post.repost_count === 'number' ? post.repost_count : 0
  const commentCount = baseComments
  const likeCount = baseLikes
  const repostCount = baseReposts
  const ro = loungeReadOnly
  const commentClass = ro ? 'text-zinc-500' : ui.commented ? 'text-zinc-100' : 'text-zinc-500'
  const repostClass = ro ? 'text-zinc-500' : ui.reposted ? 'text-emerald-400' : 'text-zinc-500'
  const likeClass = ro ? 'text-zinc-500' : ui.liked ? 'text-[#ff3824]' : 'text-zinc-500'
  const bookmarkClass = ro ? 'text-zinc-600' : isBookmarked ? 'text-[#ffd024]' : 'text-zinc-500'
  const plainId = ui.plainRepostChildId
  const quoteId = ui.quoteRepostChildId

  const isFeed = variant === 'feed'
  const iconSz = isFeed ? 'h-[20px] w-[20px]' : 'h-[22px] w-[22px]'
  const statFeedComment = 'inline-flex items-center justify-start gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70'
  const statFeedCenter = 'inline-flex items-center justify-center gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70'
  const statFeedBookmark = 'inline-flex items-center justify-end gap-1.5 rounded px-1.5 py-1 hover:bg-zinc-900/70'
  const statSheetStart =
    'inline-flex items-center justify-start gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation'
  const statSheetCenter =
    'inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation'
  const statSheetEnd =
    'inline-flex items-center justify-end gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation'

  useEffect(() => {
    if (!repostMenuOpen) return
    const close = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return
      const anchor = repostMenuRef.current
      const panel = repostMenuPortalRef.current
      if (anchor?.contains(t)) return
      if (panel?.contains(t)) return
      setRepostMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [repostMenuOpen])

  useLayoutEffect(() => {
    if (!repostMenuOpen || !isFeed) return
    const update = () => {
      const el = repostMenuRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      /** Anchor menu above the repost control so portaled menus do not run off the bottom of the viewport. */
      setRepostMenuFixed({ top: r.top - 4, left: r.left + r.width / 2 })
    }
    update()
    const scrollRoot = repostMenuScrollRootRef?.current ?? null
    window.addEventListener('resize', update)
    scrollRoot?.addEventListener('scroll', update, { passive: true })
    return () => {
      window.removeEventListener('resize', update)
      scrollRoot?.removeEventListener('scroll', update)
    }
  }, [repostMenuOpen, repostMenuScrollRootRef, isFeed])

  const onComment = () => {
    if (openProfileGateIfNeeded()) return
    if (typeof onCommentClick === 'function') {
      onCommentClick()
      return
    }
    if (onOpenComments) {
      onOpenComments(post)
      return
    }
    toggleInteraction(post.id, 'commented')
  }

  const gridClass = isFeed
    ? `grid grid-cols-4 items-center text-[14px] ${rootClassName}`.trim()
    : `grid grid-cols-4 items-center gap-1 text-[15px] ${rootClassName}`.trim()

  const repostMenusFeed =
    typeof document !== 'undefined' &&
    repostMenuOpen &&
    !ro &&
    isFeed &&
    ui.reposted &&
    (onUndoPlainRepost || onRemoveQuoteRepost || onQuoteRepost) ? (
      createPortal(
        <div
          ref={repostMenuPortalRef}
          role="menu"
          className={`fixed min-w-[11.5rem] -translate-x-1/2 -translate-y-full rounded-xl border border-zinc-700/90 bg-zinc-900/95 py-0.5 shadow-xl backdrop-blur-sm ${repostMenuPortalClass}`}
          style={{ top: repostMenuFixed.top, left: repostMenuFixed.left }}
        >
          {ui.plainRepostChildId ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onUndoPlainRepost?.(post)
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
          ) : onPlainRepost ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onPlainRepost(post)
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
          ) : null}
          {ui.quoteRepostChildId ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-rose-400 hover:bg-rose-950/35 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onRemoveQuoteRepost?.(post)
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
          {!ui.quoteRepostChildId && onQuoteRepost ? (
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onQuoteRepost(post)
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
        </div>,
        document.body,
      )
    ) : null

  const repostMenusFeedNotReposted =
    typeof document !== 'undefined' && repostMenuOpen && !ro && isFeed && !ui.reposted && onPlainRepost && onQuoteRepost
      ? createPortal(
          <div
            ref={repostMenuPortalRef}
            role="menu"
            className={`fixed min-w-[11.5rem] -translate-x-1/2 -translate-y-full rounded-xl border border-zinc-700/90 bg-zinc-900/95 py-0.5 shadow-xl backdrop-blur-sm ${repostMenuPortalClass}`}
            style={{ top: repostMenuFixed.top, left: repostMenuFixed.left }}
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onPlainRepost(post)
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
                setRepostMenuOpen(false)
                onQuoteRepost(post)
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
          </div>,
          document.body,
        )
      : null

  const repostMenuSheet =
    !isFeed && repostMenuOpen && !ro ? (
      <div
        role="menu"
        className="absolute bottom-full left-1/2 z-[30] mb-1 min-w-[11.5rem] -translate-x-1/2 rounded-xl border border-zinc-700/90 bg-zinc-900/95 py-0.5 shadow-xl backdrop-blur-sm"
      >
        {ui.reposted ? (
          <>
            {plainId ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                disabled={repostActionBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  setRepostMenuOpen(false)
                  onUndoPlainRepost?.(post)
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
                disabled={repostActionBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  setRepostMenuOpen(false)
                  onPlainRepost?.(post)
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
                disabled={repostActionBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  setRepostMenuOpen(false)
                  onRemoveQuoteRepost?.(post)
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
            {!quoteId && onQuoteRepost ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                disabled={repostActionBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  setRepostMenuOpen(false)
                  onQuoteRepost(post)
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
              disabled={repostActionBusy}
              onClick={(e) => {
                e.stopPropagation()
                setRepostMenuOpen(false)
                onPlainRepost?.(post)
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
            {onQuoteRepost ? (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[15px] font-medium text-zinc-100 hover:bg-zinc-800 touch-manipulation"
                disabled={repostActionBusy}
                onClick={(e) => {
                  e.stopPropagation()
                  setRepostMenuOpen(false)
                  onQuoteRepost(post)
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
        )}
      </div>
    ) : null

  return (
    <div className={gridClass} onClick={(e) => e.stopPropagation()} role="group">
        <LoungeFeedStatSlot
          readOnly={ro}
          title={ro ? 'Sign in to comment' : undefined}
          onReadOnlyClick={requireLoungeAuth}
          onClick={onComment}
          className={isFeed ? statFeedComment : statSheetStart}
        >
          <svg className={`${iconSz} ${commentClass}`} viewBox="0 0 20 20" aria-hidden>
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
        <div className="relative flex justify-center" ref={repostMenuRef}>
          <LoungeFeedStatSlot
            readOnly={ro}
            title={ro ? 'Sign in to repost' : ui.reposted ? 'Repost options' : 'Repost or quote repost'}
            onReadOnlyClick={requireLoungeAuth}
            onClick={() => {
              if (openProfileGateIfNeeded()) return
              if (ui.reposted) {
                setRepostMenuOpen((o) => !o)
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
            className={isFeed ? statFeedCenter : statSheetCenter}
          >
            <svg className={`${iconSz} ${repostClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
          {!isFeed ? repostMenuSheet : null}
        </div>
        {isFeed ? repostMenusFeed : null}
        {isFeed ? repostMenusFeedNotReposted : null}
        <LoungeFeedStatSlot
          readOnly={ro}
          title={ro ? 'Sign in to like' : undefined}
          onReadOnlyClick={requireLoungeAuth}
          onClick={() => void toggleInteraction(post.id, 'liked')}
          className={isFeed ? statFeedCenter : statSheetCenter}
        >
          <LoungeLikeStatContent
            iconClassName={`${iconSz} ${likeClass}`}
            countClassName={likeClass}
            liked={ui.liked}
            readOnly={ro}
            likeCount={likeCount}
            iconPx={isFeed ? 20 : 22}
          />
        </LoungeFeedStatSlot>
        {ro ? (
          <button
            type="button"
            onClick={requireLoungeAuth}
            className={
              isFeed
                ? `${statFeedBookmark} text-zinc-600 hover:bg-zinc-900/70 touch-manipulation [-webkit-tap-highlight-color:transparent]`
                : `${statSheetEnd} text-zinc-600`
            }
            title="Sign in to save posts"
          >
            <svg className={`${iconSz} ${bookmarkClass}`} viewBox="0 0 20 20" aria-hidden>
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
            onClick={() => void toggleBookmark(post.id)}
            className={isFeed ? statFeedBookmark : statSheetEnd}
            title={isBookmarked ? 'Remove bookmark' : 'Save post'}
          >
            <svg className={`${iconSz} ${bookmarkClass}`} viewBox="0 0 20 20" aria-hidden>
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
  )
}
