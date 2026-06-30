import { useCallback, useMemo, useState } from 'react'
import { feedPostDisplayCaption, isQuoteRepostPost, quoteRepostOriginalUnavailable } from '../../utils/communityFeedPost'
import { displayPostCategoryPills } from '../../utils/loungePostCategoryPills.js'
import LoungeExpandableRichCaption from './LoungeExpandableRichCaption.jsx'
import LoungeLinkPreviewBlock from './LoungeLinkPreviewBlock.jsx'
import LoungeMarketChartStrip from './LoungeMarketChartStrip.jsx'
import { bodyTextWithLinkPreview } from '../../utils/linkifyText.jsx'
import { LoungePostFeedImagesAndGif } from './LoungePostFeedMedia.jsx'
import LoungeFeedAuthorMetaBadges from './LoungeFeedAuthorMetaBadges.jsx'
import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import LoungePostOriginalUnavailableEmbed from './LoungePostOriginalUnavailableEmbed.jsx'
import LoungePostCategoryPillRow from './LoungePostCategoryPillRow.jsx'
import LoungeQuoteRepostEmbedAuthorMeta from './LoungeQuoteRepostEmbedAuthorMeta.jsx'
import LoungeFeedPendingStatusRow from './LoungeFeedPendingStatusRow.jsx'
import { loungePostIsThreadRoot, loungePostThreadPartCount } from '../../utils/loungePostThreadApi.js'
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
  /** Main feed: show unobtrusive row spinner while a media edit save finishes. */
  feedEditSavePending = false,
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
  /** Set of user IDs the viewer follows. When provided (with `onFollowUser`), shows the follow pill. */
  viewerFollowingUserIds,
  /** Follow the given user ID. Called with the author's user_id on pill tap. */
  onFollowUser,
  /** Matches Settings → Feed playback (Stream lightbox ⋯ menu). */
  feedVideoAutoplayEnabled = true,
  onFeedVideoAutoplayChange,
  /** Stream hero: caption / comment → post or comment detail (`hostPost`, `mediaPost`, `{ focusComposer }`). */
  onStreamLightboxOpenDetail,
  /** Tap caption body → post detail (feed/profile cards). */
  onPostBodyClick,
  /** Active Lounge search query - highlights matching terms in captions (search panel only). */
  loungeSearchHighlightQuery = '',
  /** Called with `game_slug` when the viewer taps the guide embed card (navigates to AP Guides). */
  onOpenGuideCard,
  /** In-app navigation for bare URLs in captions (Lounge permalinks, profiles, guides, external). */
  onLinkClick,
  /** Tap link preview card (prefers `lounge_post_id` when present). */
  onLinkPreviewOpen,
  /** Tap a market mini chart → full-screen modal. */
  onOpenMarketChart,
}) {
  const ro = loungeReadOnly

  const captionDisplayText = (raw, linkPreview) => bodyTextWithLinkPreview(raw, linkPreview)
  const postCaptionDisplayText = (row) =>
    captionDisplayText(row ? feedPostDisplayCaption(row) : '', row?.link_preview)
  const showCaptionText = (raw, linkPreview) => Boolean(captionDisplayText(raw, linkPreview))
  const showPostCaption = (row) => Boolean(postCaptionDisplayText(row))
  const renderMarketStrip = (row, className = 'mt-2') =>
    row ? (
      <LoungeMarketChartStrip
        post={row}
        className={className}
        onOpenChart={(embed, embeds) => onOpenMarketChart?.({ embed, embeds, post: row })}
      />
    ) : null

  // ── Plain repost type detection ──────────────────────────────────────────
  const isPlainPostRepost = post?.is_plain_repost === true && post?.reposted_post != null
  const isCommentRepost = post?.is_plain_repost === true && post?.reposted_comment != null
  const isQuoteRepost = isQuoteRepostPost(post)
  // The "display" entity (what we show as the card's main content / author)
  const displayPost = isPlainPostRepost ? post.reposted_post : post
  const rc = isCommentRepost ? post.reposted_comment : null
  // ── Row menu - always based on the repost row (`post`), not the display entity ──
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

  const streamLightboxSurface = useMemo(
    () => ({
      repostMenuPortalClass: repostMenuPortalClass === 'z-[48]' ? 'z-[101]' : repostMenuPortalClass,
      repostMenuScrollRootRef,
    }),
    [repostMenuPortalClass, repostMenuScrollRootRef],
  )

  const mediaLightboxProps = {
    lightboxPortalClass: mediaLightboxPortalClass,
    visibilityResetRootRef: repostMenuScrollRootRef,
    streamLightboxHost: post,
    streamLightboxSurface,
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

  // ── Follow pill ───────────────────────────────────────────────────────────
  const displayAuthorUserId = displayEntity?.user_id
  const showFollowPill = Boolean(
    !isCommentRepost &&
      typeof onFollowUser === 'function' &&
      viewerUserId &&
      displayAuthorUserId &&
      displayAuthorUserId !== viewerUserId &&
      viewerFollowingUserIds instanceof Set &&
      !viewerFollowingUserIds.has(displayAuthorUserId),
  )
  const [followPillTapped, setFollowPillTapped] = useState(false)
  const handleFollowTap = (e) => {
    e.stopPropagation()
    if (followPillTapped) return
    setFollowPillTapped(true)
    onFollowUser(displayAuthorUserId)
  }

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

  const richCaptionOpts = useMemo(() => {
    const base = { onMentionClick, onHashtagClick, onLinkClick }
    const hq = String(loungeSearchHighlightQuery || '').trim()
    if (hq.length >= 2) return { ...base, highlightQuery: hq }
    return base
  }, [onMentionClick, onHashtagClick, onLinkClick, loungeSearchHighlightQuery])

  const captionOpensDetail = Boolean(onPostBodyClick || onOpenCommentDetail)
  const captionBlockClass = `${LOUNGE_FEED_CAPTION_TOP_CLASS} text-left ${LOUNGE_FEED_CAPTION_TEXT_CLASS} text-zinc-200${
    captionOpensDetail ? ' touch-manipulation cursor-pointer' : ''
  }`

  const onCaptionAreaClick = useCallback(
    (e) => {
      if (!(e.target instanceof Element)) return
      if (e.target.closest('button, a')) return
      if (openProfileGateIfNeeded?.()) return
      if (isCommentRepost) {
        onOpenCommentDetail?.(rc)
        e.stopPropagation()
        return
      }
      if (isPlainPostRepost) {
        onPostBodyClick?.(displayPost)
        e.stopPropagation()
        return
      }
      onPostBodyClick?.(post)
      e.stopPropagation()
    },
    [
      displayPost,
      isCommentRepost,
      isPlainPostRepost,
      onOpenCommentDetail,
      onPostBodyClick,
      openProfileGateIfNeeded,
      post,
      rc,
    ],
  )

  return (
    <div className={`flex items-start gap-3 ${LOUNGE_FEED_POST_ROW_INNER_CLASS}`}>
      {/* Avatar - always the *display* entity's author (original author / comment author) */}
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

        {feedEditSavePending ? (
          <LoungeFeedPendingStatusRow>Updating post…</LoungeFeedPendingStatusRow>
        ) : null}
        {busyDeletingPostId && busyDeletingPostId === post.id ? (
          <LoungeFeedPendingStatusRow>Deleting post…</LoungeFeedPendingStatusRow>
        ) : null}

        {/* ── Meta row ────────────────────────────────────────────────────── */}
        <div className="relative min-w-0">
          <div
            className={`${LOUNGE_FEED_META_TEXT_COLUMN_CLASS} ${
              showFollowPill && showPostRowMenu
                ? 'pr-14'
                : showFollowPill
                  ? 'pr-8'
                  : showPostRowMenu
                    ? 'pr-7'
                    : ''
            }`}
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
            {/* Pinned pill - only on non-repost cards */}
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
          {showFollowPill ? (
            <div
              className={`absolute top-0 z-10 -translate-y-2 ${showPostRowMenu ? 'right-7' : 'right-0'}`}
            >
              <button
                type="button"
                onClick={handleFollowTap}
                className="inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] leading-none text-zinc-500 touch-manipulation active:opacity-60 [-webkit-tap-highlight-color:transparent]"
              >
                +
              </button>
            </div>
          ) : null}
        </div>

        {/* ── Game tag (non-repost posts only) ────────────────────────────── */}
        {!isPlainPostRepost && !isCommentRepost && post.game_slug && !post.is_ap_guide_post ? (
          <div className="mt-1.5 flex justify-start">
            <span className="inline-flex max-w-full items-center truncate rounded-full border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-tight text-amber-300 sm:max-w-[14rem]">
              {post.game_title}
            </span>
          </div>
        ) : null}

        {displayPostCategoryPills(post).length > 0 ? (
          <div className="mt-1.5 flex justify-start">
            <LoungePostCategoryPillRow pills={displayPostCategoryPills(post)} />
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
            {rc?.body && showCaptionText(rc.body, rc.link_preview) ? (
              <div
                data-lounge-post-caption
                role="presentation"
                onClick={captionOpensDetail ? onCaptionAreaClick : undefined}
                className={captionBlockClass}
              >
                <LoungeExpandableRichCaption
                  text={captionDisplayText(rc.body, rc.link_preview)}
                  captionOpts={richCaptionOpts}
                />
              </div>
            ) : null}
            <LoungeLinkPreviewBlock preview={rc?.link_preview} className="mt-2" onPreviewOpen={onLinkPreviewOpen} />
            <LoungePostFeedImagesAndGif
              post={rc}
              variant="feed"
              feedAutoplayRowId={post.id}
              feedAutoplaySlot="comment"
              firstMarginTopClass={rc?.body ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS}
              {...mediaLightboxProps}
            />
          </>
        ) : isPlainPostRepost ? (
          // Plain post repost: show original post content directly (no embed box)
          <>
            {showPostCaption(displayPost) ? (
              <div
                data-lounge-post-caption
                role="presentation"
                onClick={captionOpensDetail ? onCaptionAreaClick : undefined}
                className={captionBlockClass}
              >
                <LoungeExpandableRichCaption
                  text={postCaptionDisplayText(displayPost)}
                  captionOpts={richCaptionOpts}
                />
              </div>
            ) : null}
            <LoungeLinkPreviewBlock preview={displayPost.link_preview} className="mt-2" onPreviewOpen={onLinkPreviewOpen} />
            {renderMarketStrip(displayPost)}
            <LoungePostFeedImagesAndGif
              post={displayPost}
              variant="feed"
              feedAutoplayRowId={post.id}
              firstMarginTopClass={
                showPostCaption(displayPost) || displayPost.link_preview
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
              {...mediaLightboxProps}
            />
          </>
        ) : isQuoteRepost ? (
          // Quote repost: reposter's caption + embedded original (or unavailable placeholder)
          <>
            {showPostCaption(post) ? (
              <div
                data-lounge-post-caption
                role="presentation"
                onClick={captionOpensDetail ? onCaptionAreaClick : undefined}
                className={captionBlockClass}
              >
                <LoungeExpandableRichCaption text={postCaptionDisplayText(post)} captionOpts={richCaptionOpts} />
              </div>
            ) : null}
            <LoungeLinkPreviewBlock preview={post.link_preview} className="mt-2" onPreviewOpen={onLinkPreviewOpen} />
            {renderMarketStrip(post)}
            <LoungePostFeedImagesAndGif
              post={post}
              variant="feed"
              firstMarginTopClass={
                showPostCaption(post) || post.link_preview
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
              {...mediaLightboxProps}
            />
            {quoteRepostOriginalUnavailable(post) ? (
              <LoungePostOriginalUnavailableEmbed post={post} />
            ) : post.reposted_post ? (
            <div
              role="button"
              tabIndex={0}
              data-lounge-original-embed
              aria-label="View original post"
              className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
            >
              <LoungeQuoteRepostEmbedAuthorMeta
                post={post.reposted_post}
                displayNameFor={displayNameFor}
                handleFor={handleFor}
                postAgeLabel={postAgeLabel}
                onDisplayNameClick={(e) => onEmbeddedAuthorProfile(e, post.reposted_post)}
              />
              {showPostCaption(post.reposted_post) ? (
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 whitespace-pre-wrap break-words">
                  <LoungeExpandableRichCaption
                    text={postCaptionDisplayText(post.reposted_post)}
                    captionOpts={richCaptionOpts}
                  />
                </div>
              ) : null}
              <LoungeLinkPreviewBlock
                preview={post.reposted_post.link_preview}
                className="mt-2"
                onPreviewOpen={onLinkPreviewOpen}
              />
              {renderMarketStrip(post.reposted_post, 'mt-2')}
              <LoungePostFeedImagesAndGif
                post={post.reposted_post}
                variant="embed"
                feedAutoplayRowId={post.id}
                firstMarginTopClass="mt-2"
                {...mediaLightboxProps}
              />
              {post.reposted_post.is_ap_guide_post && post.reposted_post.game_slug ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenGuideCard?.(post.reposted_post.game_slug)
                  }}
                  className="mt-2 w-full text-left rounded-xl overflow-hidden border border-zinc-700/60 bg-zinc-900/80 hover:border-zinc-600 active:border-cyan-700/60 transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]"
                  aria-label={`View AP Guide: ${post.reposted_post.game_title}`}
                >
                  <div className="relative h-40 bg-gradient-to-br from-amber-950/60 to-zinc-900 overflow-hidden">
                    {post.reposted_post.guide_thumbnail_url ? (
                      <img
                        src={post.reposted_post.guide_thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover opacity-80"
                        loading="lazy"
                        decoding="async"
                        onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 inset-x-0 px-2.5 pb-2 flex flex-col items-start gap-1">
                      <p className="text-[#fff] font-bold text-xs leading-tight truncate w-full">{post.reposted_post.game_title}</p>
                      <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                        AP Guide
                      </span>
                    </div>
                  </div>
                </button>
              ) : null}
            </div>
            ) : post.reposted_comment ? (
            <div
              role="button"
              tabIndex={0}
              data-lounge-original-embed
              aria-label="View original comment"
              className="mt-2 w-full cursor-pointer rounded-xl border border-zinc-700/80 bg-zinc-900/55 px-2.5 py-2 text-left font-inherit text-inherit touch-manipulation [-webkit-tap-highlight-color:transparent] hover:bg-zinc-900/80 active:bg-zinc-800/50"
            >
              <LoungeQuoteRepostEmbedAuthorMeta
                post={post.reposted_comment}
                displayNameFor={displayNameFor}
                handleFor={handleFor}
                postAgeLabel={postAgeLabel}
              />
              {showCaptionText(post.reposted_comment.body, post.reposted_comment.link_preview) ? (
                <div className="mt-1 text-left text-[15px] leading-snug text-zinc-400 whitespace-pre-wrap break-words">
                  <LoungeExpandableRichCaption
                    text={captionDisplayText(post.reposted_comment.body, post.reposted_comment.link_preview)}
                    captionOpts={richCaptionOpts}
                  />
                </div>
              ) : null}
              <LoungeLinkPreviewBlock
                preview={post.reposted_comment.link_preview}
                className="mt-2"
                onPreviewOpen={onLinkPreviewOpen}
              />
              <LoungePostFeedImagesAndGif
                post={post.reposted_comment}
                variant="embed"
                feedAutoplayRowId={post.id}
                firstMarginTopClass="mt-2"
                {...mediaLightboxProps}
              />
            </div>
            ) : null}
          </>
        ) : (
          // Regular post
          <>
            {showPostCaption(post) ? (
              <div
                data-lounge-post-caption
                role="presentation"
                onClick={captionOpensDetail ? onCaptionAreaClick : undefined}
                className={captionBlockClass}
              >
                <LoungeExpandableRichCaption text={postCaptionDisplayText(post)} captionOpts={richCaptionOpts} />
              </div>
            ) : null}
            {loungePostIsThreadRoot(post) ? (
              <div
                className={`${showPostCaption(post) ? 'mt-1' : LOUNGE_FEED_CAPTION_TOP_CLASS} text-left text-[13px] font-semibold text-cyan-400/90`}
              >
                Thread · {loungePostThreadPartCount(post)} parts
              </div>
            ) : null}
            <LoungeLinkPreviewBlock preview={post.link_preview} className="mt-2" onPreviewOpen={onLinkPreviewOpen} />
            {renderMarketStrip(post)}
            <LoungePostFeedImagesAndGif
              post={post}
              variant="feed"
              firstMarginTopClass={
                showPostCaption(post) || post.link_preview || loungePostIsThreadRoot(post)
                  ? LOUNGE_FEED_MEDIA_AFTER_CAPTION_TOP_CLASS
                  : LOUNGE_FEED_MEDIA_ONLY_TOP_CLASS
              }
              {...mediaLightboxProps}
            />
          </>
        )}

        {/* ── AP Guide embed card ─────────────────────────────────────────── */}
        {!isCommentRepost && displayPost.is_ap_guide_post && displayPost.game_slug ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpenGuideCard?.(displayPost.game_slug)
            }}
            className="mt-3 w-full text-left rounded-2xl overflow-hidden border border-zinc-700/80 bg-zinc-900/80 hover:border-zinc-600 active:border-cyan-700/60 transition-colors touch-manipulation [-webkit-tap-highlight-color:transparent]"
            aria-label={`View AP Guide: ${displayPost.game_title}`}
          >
            <div className="relative h-56 bg-gradient-to-br from-amber-950/60 to-zinc-900 overflow-hidden">
              {displayPost.guide_thumbnail_url ? (
                <img
                  src={displayPost.guide_thumbnail_url}
                  alt=""
                  className="h-full w-full object-cover opacity-80"
                  loading="lazy"
                  decoding="async"
                  onError={(ev) => { ev.currentTarget.style.display = 'none' }}
                />
              ) : null}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
              <div className="absolute bottom-0 inset-x-0 px-3 pb-2.5 flex flex-col items-start gap-1">
                <p className="text-[#fff] font-bold text-sm leading-tight truncate w-full">{displayPost.game_title}</p>
                <span className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
                  AP Guide
                </span>
              </div>
            </div>
          </button>
        ) : null}

        {/* Edited label - only for regular / quote-repost posts */}
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
            onCommentClick={
              onOpenCommentDetail
                ? () => {
                    if (openProfileGateIfNeeded?.()) return
                    onOpenCommentDetail(rc, { focusComposer: true })
                  }
                : undefined
            }
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
            onCommentClick={() => {
              if (openProfileGateIfNeeded?.()) return
              onOpenComments?.(displayPost, { focusCommentComposer: true })
            }}
            requireLoungeAuth={requireLoungeAuth}
            openProfileGateIfNeeded={openProfileGateIfNeeded}
            repostMenuScrollRootRef={repostMenuScrollRootRef}
          />
        )}
      </div>
    </div>
  )
}



