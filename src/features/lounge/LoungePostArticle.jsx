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
  LOUNGE_FEED_META_TEXT_COLUMN_CLASS,
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
  // ── Comment repost card props ──────────────────────────────────────────────
  /** `interactionByComment` lookup; used for comment-repost feed cards. */
  interactionStateForComment,
  /** Plain-repost a comment (comment-repost feed cards). */
  onCommentPlainRepost,
  /** Undo plain-repost of a comment. */
  onCommentUndoPlainRepost,
  /** Toggle like on a comment (comment-repost feed cards). */
  onToggleCommentLike,
  /** Toggle bookmark on a comment. */
  onToggleCommentBookmark,
  /** Check whether a comment is bookmarked. */
  getCommentBookmarked,
  /** Open the parent-post detail with the comment in focus (comment-repost cards). */
  onOpenCommentDetail,
  /** Open a user's profile by handle (tapping @mention in caption). */
  onMentionClick,
  /** Open search filtered by hashtag (tapping #tag in caption). */
  onHashtagClick,
}) {
  const ro = loungeReadOnly
  // ── Plain repost type detection ──────────────────────────────────────────
  const isPlainPostRepost = post?.is_plain_repost === true && post?.reposted_post != null
  const isCommentRepost = post?.is_plain_repost === true && post?.reposted_comment != null
  // The "display" entity (what we show as the card's main content / author)
  const displayPost = isPlainPostRepost ? post.reposted_post : post
  const rc = isCommentRepost ? post.reposted_comment : null
  // ── Row menu — always based on the repost row (`post`), not the display entity ──
  const menuIsOwn = Boolean(viewerUserId && post?.user_id === viewerUserId)
  const menuShowEdit = Boolean(
    menuIsOwn &&
      !isPlainPostRepost &&
      !isCommentRepost &&
      typeof onPostMenuEdit === 'function' &&
      (typeof captionEditableInMenu !== 'function' || captionEditableInMenu(post)),
  )
  const showStaffPin =
    Boolean(loungeViewerIsStaff && !ro && !isPlainPostRepost && !isCommentRepost && typeof setLoungePostPinned === 'function')
  const showPostRowMenu = Boolean(
    (!isPlainPostRepost && !isCommentRepost && typeof onSharePost === 'function') ||
      showStaffPin ||
      (!ro &&
        viewerUserId &&
        ((!isPlainPostRepost && !isCommentRepost && (onPostMenuEdit || onPostMenuBlock || onPostMenuReport)) ||
          onPostMenuDelete ||
          (loungeViewerIsStaff && !menuIsOwn && !isPlainPostRepost && !isCommentRepost && typeof onStaffPostDelete === 'function')))
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
    // For plain-repost cards, the avatar belongs to the original author / comment author
    const avatarEntity = isCommentRepost ? rc : displayPost
    if (suppressAvatarProfileNavigation && profileOwnerUserId && avatarEntity?.user_id === profileOwnerUserId) return
    if (openProfileGateIfNeeded?.()) return
    if (typeof onAvatarClick !== 'function') return
    onAvatarClick(avatarEntity)
  }

  const onEmbeddedAuthorProfile = (e, embeddedPost) => {
    e.stopPropagation()
    if (openProfileGateIfNeeded?.()) return
    if (!embeddedPost?.user_id || typeof onAvatarClick !== 'function') return
    onAvatarClick(embeddedPost)
  }

  // For plain-repost cards, show the original author's badges/name
  const displayEntity = isCommentRepost ? rc : displayPost
  const authorRole = displayEntity?.author_profile?.role
  const hasStaffBadge = loungeFeedAuthorHasStaffBadge(authorRole)
  const showOgBadge = displayEntity?.author_profile?.is_og === true

  // Shared repost-header SVG icon
  const repostIcon = (
    <svg className="h-3.5 w-3.5 shrink-0 text-emerald-500/90" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M6 6h8l-1.75-1.75M14 14H6l1.75 1.75M14 6l2 2-2 2M6 14l-2-2 2-2"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
  const reposterLabel =
    viewerUserId && post.user_id === viewerUserId ? 'You reposted' : `${displayNameFor(post)} reposted`

  return (
    <div className={`flex items-start gap-3 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
      {/* Avatar — always the *display* entity's author (original author / comment author) */}
      <button
        type="button"
        title="View profile"
        onClick={onAvatar}
        className={`${LOUNGE_FEED_AVATAR_CLASS} flex items-center justify-center touch-manipulation hover:border-zinc-600 [-webkit-tap-highlight-color:transparent]`}
      >
        {displayEntity?.author_profile?.avatar_url ? (
          <img
            src={displayEntity.author_profile.avatar_url}
            alt=""
            className="h-full w-full rounded-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={`h-full w-full flex items-center justify-center text-white font-bold ${avatarToneClass(
              displayEntity?.author_profile?.user_id || displayEntity?.user_id || displayLabel(displayEntity)
            )}`}
          >
            {avatarText(displayEntity)}
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        {/* ── Repost header (plain post repost or comment repost) ─────────── */}
        {(isPlainPostRepost || isCommentRepost) ? (
          <div className="mb-1 flex items-center gap-1.5 text-left text-[12px] leading-snug text-zinc-500">
            {repostIcon}
            <span className="min-w-0 truncate font-medium text-zinc-500">{reposterLabel}</span>
          </div>
        ) : null}

        {/* ── Meta row ────────────────────────────────────────────────────── */}
        <div className="relative min-w-0">
          <div
            className={`${LOUNGE_FEED_META_TEXT_COLUMN_CLASS} ${showPostRowMenu ? 'pr-7' : ''}`}
          >
            <div className={LOUNGE_FEED_META_ROW_CLASS}>
              <LoungeFeedAuthorMetaBadges
                role={authorRole}
                isOg={showOgBadge}
                displayName={displayNameFor(displayEntity)}
                displayNameClassName={LOUNGE_FEED_DISPLAY_NAME_CLASS}
              />
              <span className={LOUNGE_FEED_META_HANDLE_TIME_CLASS}>
                <span className="min-w-0 truncate">{handleFor(displayEntity)}</span>
                <span className="shrink-0 text-zinc-600">·</span>
                <span className="shrink-0 font-normal tabular-nums whitespace-nowrap">
                  {postAgeLabel(isCommentRepost ? rc?.created_at : displayPost.created_at)}
                </span>
              </span>
            </div>
            {/* Pinned pill — only on non-repost cards */}
            {!isPlainPostRepost && !isCommentRepost && post.pinned ? (
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
                showStaffDelete={Boolean(loungeViewerIsStaff && !menuIsOwn && !isPlainPostRepost && !isCommentRepost && typeof onStaffPostDelete === 'function')}
                staffDeleteBusy={Boolean(busyDeletingPostId && busyDeletingPostId === post.id)}
                onStaffDelete={() => onStaffPostDelete?.(post)}
                onBlock={() => onPostMenuBlock?.(post)}
                onReport={() => onPostMenuReport?.(post)}
                onShare={!isPlainPostRepost && !isCommentRepost && typeof onSharePost === 'function' ? () => onSharePost(post) : undefined}
                showPin={showStaffPin}
                pinned={Boolean(post?.pinned)}
                pinBusy={loungePinBusy}
                onPinToggle={() => void setLoungePostPinned(post.id, !post.pinned)}
                positionScrollRootRef={repostMenuScrollRootRef}
              />
            </div>
          ) : null}
        </div>

        {/* ── Game tag (non-repost posts only) ────────────────────────────── */}
        {!isPlainPostRepost && !isCommentRepost && post.game_slug ? (
          <div className="mt-1.5 flex justify-start">
            <span className="inline-flex max-w-full items-center truncate rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-tight text-amber-300 sm:max-w-[14rem]">
              {post.game_title}
            </span>
          </div>
        ) : null}

        {/* ── Content ─────────────────────────────────────────────────────── */}
        {isCommentRepost ? (
          // Comment repost: show comment body + "in reply to" + media
          <>
            {rc?.reply_to_profile?.handle ? (
              <div className="mt-0.5 text-[12px] leading-snug text-zinc-500">
                <em>…in reply to</em>{' '}
                <button
                  type="button"
                  onClick={(e) => onEmbeddedAuthorProfile(e, rc.reply_to_profile)}
                  className="font-medium text-orange-400 hover:text-orange-300 touch-manipulation [-webkit-tap-highlight-color:transparent]"
                >
                  <em>@{rc.reply_to_profile.handle}</em>
                </button>
              </div>
            ) : null}
            {rc?.body ? (
              <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                {renderRichCaption(rc.body, { onMentionClick, onHashtagClick })}
              </div>
            ) : null}
            <LoungePostFeedImagesAndGif
              post={rc}
              variant="feed"
              firstMarginTopClass={rc?.body ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS}
              {...mediaLightboxProps}
            />
          </>
        ) : isPlainPostRepost ? (
          // Plain post repost: show original post content directly (no embed box)
          <>
            {feedPostDisplayCaption(displayPost) ? (
              <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                {renderRichCaption(feedPostDisplayCaption(displayPost), { onMentionClick, onHashtagClick })}
              </div>
            ) : null}
            <LoungePostFeedImagesAndGif
              post={displayPost}
              variant="feed"
              firstMarginTopClass={
                feedPostDisplayCaption(displayPost)
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
              {...mediaLightboxProps}
            />
          </>
        ) : post.reposted_post ? (
          // Quote repost: reposter's caption + embedded original card
          <>
            {feedPostDisplayCaption(post) ? (
              <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                {renderRichCaption(feedPostDisplayCaption(post), { onMentionClick, onHashtagClick })}
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
                {renderRichCaption(feedPostDisplayCaption(post.reposted_post), { onMentionClick, onHashtagClick })}
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
          // Regular post
          <>
            {feedPostDisplayCaption(post) ? (
              <div className={`${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200`}>
                {renderRichCaption(feedPostDisplayCaption(post), { onMentionClick, onHashtagClick })}
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

        {/* Edited label — only for regular / quote-repost posts */}
        {!isPlainPostRepost && !isCommentRepost && post.edited_at ? (
          <div className="mt-1.5 text-left text-[14px] leading-tight text-zinc-500">Edited</div>
        ) : null}

        {/* ── Interaction bar ──────────────────────────────────────────────── */}
        {isCommentRepost ? (
          // Comment repost: interaction bar targets the original comment
          <LoungePostInteractionBar
            post={{
              id: rc?.id,
              like_count: rc?.like_count ?? 0,
              repost_count: rc?.repost_count ?? 0,
              comment_count: rc?.comment_count ?? 0,
            }}
            variant="feed"
            rootClassName={LOUNGE_FEED_POST_INTERACTIONS_CLASS}
            repostMenuPortalClass={repostMenuPortalClass}
            loungeReadOnly={loungeReadOnly}
            interactionStateFor={interactionStateForComment}
            toggleInteraction={toggleInteraction}
            onPlainRepost={onCommentPlainRepost}
            onUndoPlainRepost={onCommentUndoPlainRepost}
            onToggleLike={onToggleCommentLike ? () => onToggleCommentLike(rc?.id) : undefined}
            onToggleBookmark={onToggleCommentBookmark ? () => onToggleCommentBookmark(rc?.id) : undefined}
            getBookmarked={getCommentBookmarked}
            onCommentClick={onOpenCommentDetail ? () => onOpenCommentDetail(rc) : undefined}
            requireLoungeAuth={requireLoungeAuth}
            openProfileGateIfNeeded={openProfileGateIfNeeded}
            repostMenuScrollRootRef={repostMenuScrollRootRef}
          />
        ) : (
          // Plain post repost or regular post / quote repost
          <LoungePostInteractionBar
            post={displayPost}
            variant="feed"
            rootClassName={LOUNGE_FEED_POST_INTERACTIONS_CLASS}
            repostMenuPortalClass={repostMenuPortalClass}
            loungeReadOnly={loungeReadOnly}
            interactionStateFor={interactionStateFor}
            toggleInteraction={toggleInteraction}
            onPlainRepost={onPlainRepost}
            onUndoPlainRepost={onUndoPlainRepost}
            onRemoveQuoteRepost={isPlainPostRepost ? undefined : onRemoveQuoteRepost}
            onQuoteRepost={isPlainPostRepost ? undefined : onQuoteRepost}
            toggleBookmark={toggleBookmark}
            bookmarkedByPost={bookmarkedByPost}
            onOpenComments={onOpenComments}
            requireLoungeAuth={requireLoungeAuth}
            openProfileGateIfNeeded={openProfileGateIfNeeded}
            repostMenuScrollRootRef={repostMenuScrollRootRef}
          />
        )}
      </div>
    </div>
  )
}
