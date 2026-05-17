import { useCallback } from 'react'
import { feedPostDisplayCaption } from '../../utils/communityFeedPost'
import { renderRichCaption } from './loungeCaption'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungeStaffRoleBadge from './LoungeStaffRoleBadge'
import LoungeOgBadge from './LoungeOgBadge'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import {
  LOUNGE_FEED_META_HANDLE_TIME_CLASS,
  LOUNGE_FEED_AVATAR_CLASS,
  LOUNGE_FEED_CAPTION_TEXT_CLASS,
  LOUNGE_FEED_CAPTION_TOP_CLASS,
  LOUNGE_FEED_DISPLAY_NAME_CLASS,
  LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS,
  LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS,
  LOUNGE_FEED_META_ROW_CLASS,
  LOUNGE_FEED_POST_INTERACTIONS_CLASS,
  LOUNGE_FEED_POST_ROW_INNER_CLASS,
  LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS,
  loungeFeedAuthorHasStaffBadge,
} from './loungeFeedAvatar.js'

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
  /** Undo plain repost for this original post (feed + profile use small menu). */
  onUndoPlainRepost,
  /** Open remove-quote flow for this original post. */
  onRemoveQuoteRepost,
  /** Quote repost (opens composer with caption). */
  onQuoteRepost,
  toggleBookmark,
  bookmarkedByPost,
  /** Opens post detail / comments (e.g. feed row comment control). */
  onOpenComments,
  /** Share / copy permalink (allowed when read-only). */
  onSharePost,
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
  /** Scroll container (e.g. main feed) so the portaled Repost/Quote menu stays aligned while scrolling. */
  repostMenuScrollRootRef,
  /** Portaled image/video lightbox z-index (profile sheet uses `z-[103]`). */
  mediaLightboxPortalClass = 'z-[100]',
  /** Repost menu portal z-index on feed row + inside media lightbox footer. */
  repostMenuPortalClass = 'z-[48]',
}) {
  const ro = loungeReadOnly
  const menuIsOwn = Boolean(viewerUserId && post?.user_id === viewerUserId)
  const menuShowEdit = Boolean(
    menuIsOwn &&
      typeof onPostMenuEdit === 'function' &&
      (typeof captionEditableInMenu !== 'function' || captionEditableInMenu(post)),
  )
  const showStaffPin =
    Boolean(loungeViewerIsStaff && !ro && typeof setLoungePostPinned === 'function')
  const showPostRowMenu = Boolean(
    typeof onSharePost === 'function' ||
      showStaffPin ||
      (!ro &&
        viewerUserId &&
        (onPostMenuEdit ||
          onPostMenuDelete ||
          onPostMenuBlock ||
          onPostMenuReport ||
          (loungeViewerIsStaff && !menuIsOwn && typeof onStaffPostDelete === 'function')))
  )

  const renderMediaLightboxFooter = useCallback(
    (mediaPost) => (
      <LoungePostInteractionBar
        post={mediaPost}
        variant="feed"
        rootClassName="w-full"
        repostMenuPortalClass={repostMenuPortalClass === 'z-[48]' ? 'z-[101]' : repostMenuPortalClass}
        loungeReadOnly={loungeReadOnly}
        interactionStateFor={interactionStateFor}
        toggleInteraction={toggleInteraction}
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
      />
    ),
    [
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
      repostMenuPortalClass,
    ],
  )

  const mediaLightboxProps = {
    lightboxPortalClass: mediaLightboxPortalClass,
    visibilityResetRootRef: repostMenuScrollRootRef,
    renderMediaLightboxFooter,
  }

  const onAvatar = (e) => {
    e.stopPropagation()
    if (suppressAvatarProfileNavigation && profileOwnerUserId && post.user_id === profileOwnerUserId) return
    if (openProfileGateIfNeeded?.()) return
    if (typeof onAvatarClick !== 'function') return
    onAvatarClick(post)
  }

  const onEmbeddedAuthorProfile = (e, embeddedPost) => {
    e.stopPropagation()
    if (openProfileGateIfNeeded?.()) return
    if (!embeddedPost?.user_id || typeof onAvatarClick !== 'function') return
    onAvatarClick(embeddedPost)
  }

  const authorRole = post?.author_profile?.role
  const hasStaffBadge = loungeFeedAuthorHasStaffBadge(authorRole)
  const showOgBadge = post?.author_profile?.is_og === true

  return (
    <div className={`flex items-start gap-3 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
      <button
        type="button"
        title="View profile"
        onClick={onAvatar}
        className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
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
      <div className="min-w-0 flex-1">
        <div className="relative min-w-0">
          <div
            className={`min-w-0 overflow-hidden text-left ${showPostRowMenu ? 'pr-7' : ''}`}
          >
            <div className={LOUNGE_FEED_META_ROW_CLASS}>
          <LoungeFeedAuthorMetaBadges
            role={authorRole}
            isOg={showOgBadge}
            displayName={displayNameFor(post)}
            displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
          />
          <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
            <span className="min-w-0 truncate">{handleFor(post)}</span>
            <span className="shrink-0 text-zinc-600">·</span>
            <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
              {postAgeLabel(post.created_at)}
            </span>
          </span>
        </div>
        {post.pinned ? (
          <div className="mt-1">
            <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
              Pinned
            </span>
          </div>
        ) : null}
          </div>
          {showPostRowMenu ? (
            <div className={LOUNGE_FEED_POST_CARD_MENU_ANCHOR_CLASS}>
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
            onShare={typeof onSharePost === 'function' ? () => onSharePost(post) : undefined}
            showPin={showStaffPin}
            pinned={Boolean(post?.pinned)}
            pinBusy={loungePinBusy}
            onPinToggle={() => void setLoungePostPinned(post.id, !post.pinned)}
                positionScrollRootRef={repostMenuScrollRootRef}
              />
            </div>
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
              <div
                role="button"
                tabIndex={0}
                data-lounge-original-embed
                aria-label="View original post"
                className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-nowrap items-center justify-start gap-x-1.5 text-[14px] leading-snug">
                    <button
                      type="button"
                      onClick={(e) => onEmbeddedAuthorProfile(e, post.reposted_post)}
                      className="min-w-0 truncate font-semibold text-zinc-200 text-left touch-manipulation hover:text-cyan-300 [-webkit-tap-highlight-color:transparent]"
                    >
                      {displayNameFor(post.reposted_post)}
                    </button>
                    <span className="shrink-0">
                      <LoungeStaffRoleBadge role={post.reposted_post?.author_profile?.role} size="detail" />
                    </span>
                    <span className="shrink-0">
                      <LoungeOgBadge isOg={post.reposted_post?.author_profile?.is_og} size="detail" />
                    </span>
                    <span className="inline-flex min-w-0 max-w-[min(10rem,48vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[14px] text-zinc-500 sm:max-w-[12rem]">
                      <span className="min-w-0 truncate">{handleFor(post.reposted_post)}</span>
                    </span>
                  </div>
                  {post.reposted_post.pinned ? (
                    <div className="mt-1">
                      <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                        Pinned
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                  {renderRichCaption(feedPostDisplayCaption(post.reposted_post))}
                </div>
                <LoungePostFeedImagesAndGif
                  post={post.reposted_post}
                  variant="embed"
                  firstMarginTopClass="mt-2"
                  {...mediaLightboxProps}
                />
              </div>
            </>
          ) : (
            <>
              {feedPostDisplayCaption(post) ? (
                <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                  {renderRichCaption(feedPostDisplayCaption(post))}
                </div>
              ) : null}
              <LoungePostFeedImagesAndGif
                post={post}
                variant="feed"
                firstMarginTopClass={
                feedPostDisplayCaption(post)
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
                {...mediaLightboxProps}
              />
              <div
                role="button"
                tabIndex={0}
                data-lounge-original-embed
                aria-label="View original post"
                className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-nowrap items-center justify-start gap-x-1.5 text-[14px] leading-snug">
                    <button
                      type="button"
                      onClick={(e) => onEmbeddedAuthorProfile(e, post.reposted_post)}
                      className="min-w-0 truncate font-semibold text-zinc-200 text-left touch-manipulation hover:text-cyan-300 [-webkit-tap-highlight-color:transparent]"
                    >
                      {displayNameFor(post.reposted_post)}
                    </button>
                    <span className="shrink-0">
                      <LoungeStaffRoleBadge role={post.reposted_post?.author_profile?.role} size="detail" />
                    </span>
                    <span className="shrink-0">
                      <LoungeOgBadge isOg={post.reposted_post?.author_profile?.is_og} size="detail" />
                    </span>
                    <span className="inline-flex min-w-0 max-w-[min(10rem,48vw)] shrink-[3] items-center gap-x-1 overflow-hidden text-[14px] text-zinc-500 sm:max-w-[12rem]">
                      <span className="min-w-0 truncate">{handleFor(post.reposted_post)}</span>
                    </span>
                  </div>
                  {post.reposted_post.pinned ? (
                    <div className="mt-1">
                      <span className="inline-flex shrink-0 rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-wide text-fuchsia-200">
                        Pinned
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 line-clamp-4 whitespace-pre-wrap break-words">
                  {renderRichCaption(feedPostDisplayCaption(post.reposted_post))}
                </div>
                <LoungePostFeedImagesAndGif
                  post={post.reposted_post}
                  variant="embed"
                  firstMarginTopClass="mt-2"
                  {...mediaLightboxProps}
                />
              </div>
            </>
          )
        ) : (
          <>
            {feedPostDisplayCaption(post) ? (
              <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                {renderRichCaption(feedPostDisplayCaption(post))}
              </div>
            ) : null}
            <LoungePostFeedImagesAndGif
              post={post}
              variant="feed"
              firstMarginTopClass={
                feedPostDisplayCaption(post)
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
              {...mediaLightboxProps}
            />
          </>
        )}
        {post.edited_at ? (
          <div className="mt-1.5 text-left text-[14px] leading-tight text-zinc-500">Edited</div>
        ) : null}
        <LoungePostInteractionBar
          post={post}
          variant="feed"
          rootClassName={LOUNGE_FEED_POST_INTERACTIONS_CLASS}
          repostMenuPortalClass={repostMenuPortalClass}
          loungeReadOnly={loungeReadOnly}
          interactionStateFor={interactionStateFor}
          toggleInteraction={toggleInteraction}
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
        />
      </div>
    </div>
  )
}
