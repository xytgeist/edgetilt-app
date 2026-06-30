import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import LoungeFlameIcon from './LoungeFlameIcon.jsx'
import { LoungeInteractionGlyphRail } from './LoungeInteractionGlyphRail.jsx'
import {
  LOUNGE_COMMENT_BUBBLE_D,
  LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS,
} from './loungeCommentGlyph.js'

/**
 * Comment / repost / like / bookmark row - same behavior as the feed post row or post-detail sheet.
 * Layout: **equal gaps between the four primary glyphs** - `flex` + `justify-between` with each rail’s
 * **width fixed to its icon box**; counts hang at `left-full` and do not shift icons. Comment aligns
 * caption-left; bookmark aligns caption-right (full-width row matches the caption band).
 *
 * @param {'feed' | 'sheet' | 'comment'} [props.variant='feed'] - `feed`: portaled repost menus (feed card). `sheet`: post detail / lightbox row (larger glyphs). **`comment`**: under comment bodies - **smaller glyphs**, same repost behavior as `sheet` (inline menu).
 * @param {string} [props.repostMenuPortalClass='z-[48]'] - Tailwind z class for portaled repost menus (`feed` only). Use `z-[101]` above media lightboxes (`z-[100]`).
 * @param {() => void} [props.onCommentClick] - When set, runs instead of `onOpenComments` / `toggleInteraction('commented')` for the comment control.
 * @param {(id: string) => void | Promise<unknown>} [props.onToggleLike] - When set, like control calls this with `post.id` instead of `toggleInteraction(post.id, 'liked')` (e.g. feed comment likes).
 * @param {(id: string) => void | Promise<unknown>} [props.onToggleBookmark] - When set, bookmark control calls this with `post.id` instead of `toggleBookmark(post.id)`.
 * @param {(id: string) => boolean} [props.getBookmarked] - When set, used instead of `bookmarkedByPost[id]` to decide bookmark highlight.
 * @param {boolean} [props.repostActionBusy=false] - Disables repost menu actions (`sheet` only).
 * @param {() => void} [props.onShare] - When set, shows share control to the right of bookmark (e.g. Stream lightbox).
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
  onToggleLike,
  onToggleBookmark,
  getBookmarked,
  repostActionBusy = false,
  /** Stream hero overlay: pill per control instead of a shared bar background. */
  pillOverlay = false,
  /** Extra classes on the outer grid wrapper (e.g. `w-full` in lightbox). */
  rootClassName = '',
  onShare,
}) {
  const idleUi = {
    liked: false,
    reposted: false,
    commented: false,
    plainRepostChildId: null,
    quoteRepostChildId: null,
  }
  const postId = post?.id
  const ui =
    typeof interactionStateFor === 'function' && postId
      ? interactionStateFor(postId) || idleUi
      : idleUi
  const [repostMenuOpen, setRepostMenuOpen] = useState(false)
  const repostMenuRef = useRef(null)
  const repostMenuPortalRef = useRef(null)
  const [repostMenuFixed, setRepostMenuFixed] = useState({ top: 0, left: 0 })
  const isBookmarked =
    typeof getBookmarked === 'function'
      ? !!getBookmarked(postId)
      : bookmarkedByPost && typeof bookmarkedByPost === 'object'
        ? !!bookmarkedByPost[postId]
        : false
  const baseComments = typeof post.comment_count === 'number' ? post.comment_count : 0
  const baseLikes = typeof post.like_count === 'number' ? post.like_count : 0
  const baseReposts = typeof post.repost_count === 'number' ? post.repost_count : 0
  const commentCount = baseComments
  const likeCount = baseLikes
  const repostCount = baseReposts
  const ro = loungeReadOnly
  const overlayIdle = pillOverlay && !ro
  const commentClass = ro
    ? 'text-zinc-500'
    : ui.commented
      ? overlayIdle
        ? 'text-white'
        : 'text-zinc-100'
      : overlayIdle
        ? 'text-zinc-200'
        : 'text-zinc-500'
  const repostClass = ro
    ? 'text-zinc-500'
    : ui.reposted
      ? 'text-emerald-400'
      : overlayIdle
        ? 'text-zinc-200'
        : 'text-zinc-500'
  const likeClass = ro
    ? 'text-zinc-500'
    : ui.liked
      ? 'text-lv-red'
      : overlayIdle
        ? 'text-zinc-200'
        : 'text-zinc-500'
  const bookmarkClass = ro
    ? 'text-zinc-600'
    : isBookmarked
      ? 'text-lv-yellow'
      : overlayIdle
        ? 'text-zinc-200'
        : 'text-zinc-500'
  const shareClass = overlayIdle ? 'text-zinc-200' : ro ? 'text-zinc-500' : 'text-zinc-200'
  const plainId = ui.plainRepostChildId
  const quoteId = ui.quoteRepostChildId
  const commentBubbleD = LOUNGE_COMMENT_BUBBLE_D
  const bookmarkRibbonD =
    'M6.5 4.75h7a1 1 0 011 1v9.5L10 12.75 5.5 15.25v-9.5a1 1 0 011-1z'
  /** Filled only when the viewer has that interaction; idle + read-only stay outline like repost. */
  const commentGlyphFilled = !ro && ui.commented
  const bookmarkGlyphFilled = !ro && isBookmarked

  const isFeed = variant === 'feed'
  const isComment = variant === 'comment'
  /** Feed + comment-thread rows: tighter stat padding; sheet = post detail / lightbox. */
  const statsCompact = isFeed || isComment
  /** `justify-between` flex basis = glyph width only (px), so inter-icon gaps match (L − Σw) / 3. */
  const slotComment = isComment ? 20 : isFeed ? 22 : 24
  const slotRepost = isComment ? 20 : isFeed ? 22 : 24
  const slotLike = isComment ? 20 : isFeed ? 22 : 24
  const slotBookmark = isComment ? 22 : isFeed ? 24 : 26
  const railMinH = isComment ? 30 : isFeed ? 32 : 44
  const iconSz = isComment ? 'h-[20px] w-[20px]' : isFeed ? 'h-[22px] w-[22px]' : 'h-[24px] w-[24px]'
  /** Bubble glyph sits low in the 20 viewBox - slight Y stretch so it matches the chip visually */
  const iconSzComment = isComment
    ? `h-[20px] w-[20px] ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`
    : isFeed
      ? `h-[22px] w-[22px] ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`
      : `h-[24px] w-[24px] ${LOUNGE_COMMENT_GLYPH_Y_SCALE_CLASS}`
  /** Bookmark path is inset in the 20 viewBox - slightly larger box than other stats for visual parity with the chip */
  const iconSzBookmark = isComment ? 'h-[22px] w-[22px]' : isFeed ? 'h-[24px] w-[24px]' : 'h-[26px] w-[26px]'
  /** Stat hit targets (padding); inner layout is glyph rail + absolutely positioned count. */
  const statFeedComment =
    'inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-1 hover:bg-zinc-900/70 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const statFeedMid =
    'inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-1 hover:bg-zinc-900/70 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const statFeedBookmark =
    'inline-flex shrink-0 items-center gap-1.5 rounded px-1 py-1 hover:bg-zinc-900/70 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const statSheetComment =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const statSheetMid =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const statSheetBookmark =
    'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 hover:bg-zinc-900/80 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const pillOverlayStat = isComment
    ? 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/40 px-2 py-1.5 backdrop-blur-[2px] hover:bg-black/55 active:bg-black/60 touch-manipulation [-webkit-tap-highlight-color:transparent]'
    : 'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-2 backdrop-blur-[2px] hover:bg-black/55 active:bg-black/60 touch-manipulation [-webkit-tap-highlight-color:transparent]'
  const pickStat = (feedCls, sheetCls) => (pillOverlay ? pillOverlayStat : statsCompact ? feedCls : sheetCls)
  const statCommentCls = pickStat(statFeedComment, statSheetComment)
  const statMidCls = pickStat(statFeedMid, statSheetMid)
  const statBookmarkCls = pickStat(statFeedBookmark, statSheetBookmark)

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

  const rowClass = isFeed
    ? `flex w-full min-w-0 flex-1 flex-nowrap items-center justify-between text-[15px] ${rootClassName}`.trim()
    : isComment
      ? `flex w-full min-w-0 flex-1 flex-nowrap items-center justify-between text-[14px] ${rootClassName}`.trim()
      : `flex w-full min-w-0 flex-1 flex-nowrap items-center justify-between text-[16px] ${rootClassName}`.trim()

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
    <>
      <div
        className={rowClass}
        data-lounge-post-interaction-bar
        role="group"
      >
      <LoungeInteractionGlyphRail
        slotPx={slotComment}
        glyphPx={slotComment}
        railMinH={railMinH}
        readOnly={ro}
        title={ro ? 'Sign in to comment' : undefined}
        onReadOnlyClick={requireLoungeAuth}
        onClick={onComment}
        statClass={statCommentCls}
        pillOverlay={pillOverlay}
        glyph={
          <svg className={`block shrink-0 ${iconSzComment} ${commentClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
        railRef={repostMenuRef}
        extraAfterStat={!isFeed ? repostMenuSheet : null}
        slotPx={slotRepost}
        glyphPx={slotRepost}
        railMinH={railMinH}
        readOnly={ro}
        title={ro ? 'Sign in to repost' : ui.reposted ? 'Repost options' : 'Repost or quote repost'}
        onReadOnlyClick={requireLoungeAuth}
        onClick={() => {
          if (openProfileGateIfNeeded()) return
          if (ui.reposted) {
            setRepostMenuOpen((o) => !o)
            return
          }
          if (onPlainRepost && !onQuoteRepost) {
            onPlainRepost(post)
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
        statClass={statMidCls}
        pillOverlay={pillOverlay}
        glyph={
          <svg className={`block shrink-0 ${iconSz} ${repostClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
        slotPx={slotLike}
        glyphPx={slotLike}
        railMinH={railMinH}
        readOnly={ro}
        title={ro ? 'Sign in to like' : undefined}
        onReadOnlyClick={requireLoungeAuth}
        onClick={() =>
          typeof onToggleLike === 'function' ? void onToggleLike(post.id) : void toggleInteraction(post.id, 'liked')
        }
        statClass={statMidCls}
        pillOverlay={pillOverlay}
        glyph={<LoungeFlameIcon className={`shrink-0 ${iconSz} ${likeClass}`} liked={ui.liked} readOnly={ro} />}
        countClass={likeClass}
        countValue={likeCount}
      />

      <div
        className="relative flex shrink-0 flex-none items-center justify-center self-center overflow-visible"
        style={
          pillOverlay
            ? { minHeight: railMinH }
            : { width: slotBookmark, minWidth: slotBookmark, minHeight: railMinH }
        }
      >
        {ro ? (
          <button
            type="button"
            onClick={requireLoungeAuth}
            className={`${statBookmarkCls} box-border flex shrink-0 items-center justify-center text-zinc-600`}
            title="Sign in to save posts"
          >
            <svg className={`block shrink-0 ${iconSzBookmark} ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
            onClick={() =>
              typeof onToggleBookmark === 'function'
                ? void onToggleBookmark(post.id)
                : void toggleBookmark(post.id)
            }
            className={`${statBookmarkCls} box-border flex shrink-0 items-center justify-center`}
            title={isBookmarked ? 'Remove bookmark' : 'Save post'}
          >
            <svg className={`block shrink-0 ${iconSzBookmark} ${bookmarkClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
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
      {typeof onShare === 'function' ? (
        <div
          className="relative flex shrink-0 flex-none items-center justify-center self-center overflow-visible"
          style={
            pillOverlay
              ? { minHeight: railMinH }
              : { width: slotBookmark, minWidth: slotBookmark, minHeight: railMinH }
          }
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onShare()
            }}
            className={`${statBookmarkCls} box-border flex shrink-0 items-center justify-center ${shareClass}`}
            title="Share"
            aria-label="Share"
          >
            <svg className={`block shrink-0 ${iconSzBookmark} ${shareClass}`} viewBox="0 0 20 20" fill="none" aria-hidden>
              <path
                d="M10 3v8M10 3L7 6M10 3l3 3M5 12v4a1 1 0 001 1h8a1 1 0 001-1v-4"
                stroke="currentColor"
                strokeWidth="1.35"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : null}
      </div>
      {isFeed ? repostMenusFeed : null}
      {isFeed ? repostMenusFeedNotReposted : null}
    </>
  )
}
