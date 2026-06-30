import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import LoungeStreamVideoLightboxChrome, {
  LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS,
  LOUNGE_IMAGE_LIGHTBOX_NAV_BTN_CLASS,
  LOUNGE_IMAGE_LIGHTBOX_TOP_FOLLOW_BTN_CLASS,
  LoungeStreamLightboxFollowButton,
} from './LoungeStreamVideoLightboxChrome.jsx'
import { mergeLightboxDismissOnQuoteRepost } from './loungeLightboxFooterDismissQuote.js'

import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'
import { feedCommentSubtreeReplyCount } from '../../utils/communityFeedComment.js'

/** @param {object | null | undefined} menuState */
function resolveStreamLightboxShare(hostPost, mediaPost, menuState, ctx) {
  if (typeof ctx.onSharePost !== 'function') return undefined
  const media = mediaPost ?? hostPost
  if (isFeedCommentEntity(media)) {
    const pid = media?.post_id
    return pid ? () => ctx.onSharePost({ id: pid }) : undefined
  }
  if (media?.id && hostPost?.id && String(media.id) !== String(hostPost.id)) {
    return () => ctx.onSharePost(media)
  }
  if (menuState?.isPlainPostRepost || menuState?.isCommentRepost) return undefined
  return hostPost ? () => ctx.onSharePost(hostPost) : undefined
}

function buildStreamLightboxInteractionPost(mediaPost, ctx) {
  if (!isFeedCommentEntity(mediaPost)) return mediaPost
  const descendantFallback =
    typeof ctx.commentDescendantFallback === 'number' ? ctx.commentDescendantFallback : 0
  return {
    id: mediaPost.id,
    comment_count: feedCommentSubtreeReplyCount(mediaPost, descendantFallback),
    like_count: typeof mediaPost.like_count === 'number' ? mediaPost.like_count : 0,
    repost_count: typeof mediaPost.repost_count === 'number' ? mediaPost.repost_count : 0,
  }
}

function buildStreamLightboxInteractionBar(hostPost, mediaPost, menuState, ctx, dismissLightbox) {
  const media = mediaPost ?? hostPost
  const isCommentMedia = isFeedCommentEntity(media)
  const menuPortalZ =
    ctx.repostMenuPortalClass === 'z-[48]' ? 'z-[105]' : ctx.repostMenuPortalClass || 'z-[105]'

  const openDetailFromLightbox = (focusComposer) => {
    if (typeof ctx.onLightboxOpenDetail !== 'function') return
    ctx.onLightboxOpenDetail(hostPost, media, { focusComposer })
  }

  const interactionStateFor =
    isCommentMedia && typeof ctx.interactionStateForComment === 'function'
      ? ctx.interactionStateForComment
      : ctx.interactionStateFor

  return mergeLightboxDismissOnQuoteRepost(
    <LoungePostInteractionBar
      post={buildStreamLightboxInteractionPost(media, ctx)}
      variant={ctx.interactionBarVariant || 'sheet'}
      rootClassName="w-full"
      repostMenuPortalClass={menuPortalZ}
      loungeReadOnly={ctx.loungeReadOnly}
      interactionStateFor={interactionStateFor}
      toggleInteraction={ctx.toggleInteraction}
      onPlainRepost={isCommentMedia ? ctx.onCommentPlainRepost : ctx.onPlainRepost}
      onUndoPlainRepost={isCommentMedia ? ctx.onCommentUndoPlainRepost : ctx.onUndoPlainRepost}
      onRemoveQuoteRepost={ctx.onRemoveQuoteRepost}
      onQuoteRepost={ctx.onQuoteRepost}
      toggleBookmark={ctx.toggleBookmark}
      bookmarkedByPost={ctx.bookmarkedByPost}
      onToggleLike={isCommentMedia ? ctx.onToggleCommentLike : undefined}
      onToggleBookmark={isCommentMedia ? ctx.onToggleCommentBookmark : undefined}
      getBookmarked={isCommentMedia ? ctx.getCommentBookmarked : undefined}
      onOpenComments={
        typeof ctx.onLightboxOpenDetail === 'function'
          ? () => openDetailFromLightbox(false)
          : ctx.onOpenComments
      }
      requireLoungeAuth={ctx.requireLoungeAuth}
      openProfileGateIfNeeded={ctx.openProfileGateIfNeeded}
      repostMenuScrollRootRef={ctx.repostMenuScrollRootRef}
      onCommentClick={
        typeof ctx.onLightboxOpenDetail === 'function'
          ? () => openDetailFromLightbox(true)
          : ctx.onCommentClick
      }
      pillOverlay
      repostActionBusy={ctx.repostActionBusy}
      onShare={resolveStreamLightboxShare(hostPost, media, menuState, ctx)}
    />,
    dismissLightbox,
  )
}

/** @param {object | null | undefined} row */
export function isFeedCommentEntity(row) {
  if (!row?.user_id) return false
  if ('caption' in row) return false
  return 'body' in row || Boolean(row?.post_id)
}

/** Caption/body for lightbox overlay - comments use `body`, posts use `caption`. */
export function loungeStreamLightboxCaption(row) {
  if (!row) return ''
  if (isFeedCommentEntity(row)) return String(row.body ?? '').trim()
  return feedPostDisplayCaption(row)
}

/**
 * Author + caption for Stream lightbox chrome from the row that owns the media tile.
 * Repost/quote rows show the embedded comment or original post, not the reposter.
 */
export function loungeStreamLightboxMediaSource(hostPost, mediaPost) {
  const media = mediaPost ?? hostPost
  const rc = hostPost?.reposted_comment
  const rp = hostPost?.reposted_post

  if (rc && media?.id === rc.id) {
    return { displayEntity: rc, captionText: loungeStreamLightboxCaption(rc) }
  }

  if (rp && media?.id === rp.id) {
    return { displayEntity: rp, captionText: loungeStreamLightboxCaption(rp) }
  }

  if (isFeedCommentEntity(media)) {
    return { displayEntity: media, captionText: loungeStreamLightboxCaption(media) }
  }

  if (hostPost && media?.id === hostPost.id) {
    return { displayEntity: hostPost, captionText: loungeStreamLightboxCaption(hostPost) }
  }

  return { displayEntity: media, captionText: loungeStreamLightboxCaption(media) }
}

/** @deprecated Prefer {@link loungeStreamLightboxMediaSource} - kept for callers that only need author. */
export function loungeStreamLightboxDisplayEntity(hostPost) {
  const isPlainPostRepost = hostPost?.is_plain_repost === true && hostPost?.reposted_post != null
  const isCommentRepost = hostPost?.is_plain_repost === true && hostPost?.reposted_comment != null
  if (isCommentRepost) return hostPost.reposted_comment
  if (isPlainPostRepost) return hostPost.reposted_post
  if (hostPost?.reposted_comment) return hostPost.reposted_comment
  if (hostPost?.reposted_post) return hostPost.reposted_post
  return hostPost
}

function loungeStreamLightboxMenuState(hostPost, ctx) {
  const {
    loungeReadOnly: ro,
    viewerUserId,
    onPostMenuEdit,
    captionEditableInMenu,
    loungeViewerIsStaff,
    setLoungePostPinned,
    onPostMenuDelete,
    onStaffPostDelete,
    onPostMenuBlock,
    onPostMenuReport,
    onSharePost,
  } = ctx

  const isPlainPostRepost = hostPost?.is_plain_repost === true && hostPost?.reposted_post != null
  const isCommentRepost = hostPost?.is_plain_repost === true && hostPost?.reposted_comment != null
  const menuIsOwn = Boolean(viewerUserId && hostPost?.user_id === viewerUserId)
  const menuShowEdit = Boolean(
    menuIsOwn &&
      !isPlainPostRepost &&
      !isCommentRepost &&
      typeof onPostMenuEdit === 'function' &&
      (typeof captionEditableInMenu !== 'function' || captionEditableInMenu(hostPost)),
  )
  const showStaffPin = Boolean(
    loungeViewerIsStaff && !ro && !isPlainPostRepost && !isCommentRepost && typeof setLoungePostPinned === 'function',
  )
  const showPostRowMenu = Boolean(
    (!isPlainPostRepost && !isCommentRepost && typeof onSharePost === 'function') ||
      showStaffPin ||
      (!ro &&
        viewerUserId &&
        ((!isPlainPostRepost && !isCommentRepost && (onPostMenuEdit || onPostMenuBlock || onPostMenuReport)) ||
          onPostMenuDelete ||
          (loungeViewerIsStaff && !menuIsOwn && !isPlainPostRepost && !isCommentRepost && typeof onStaffPostDelete === 'function'))),
  )

  return {
    isPlainPostRepost,
    isCommentRepost,
    menuIsOwn,
    menuShowEdit,
    showStaffPin,
    showPostRowMenu,
  }
}

/**
 * Stream hero overlay chrome (author, caption, interactions).
 * @param {object} hostEntity - Feed row, comment row, or detail host for menu + author resolution.
 * @param {object} mediaPost - Tile that owns the Stream uid (may differ on quote/repost embed).
 * @param {() => void} dismissLightbox
 * @param {object} ctx - Handlers from {@link LoungeStreamLightboxProvider}.
 */
export function buildLoungeStreamLightboxChrome(hostEntity, mediaPost, dismissLightbox, ctx) {
  const host = hostEntity ?? mediaPost
  const media = mediaPost ?? host
  const menuState = isFeedCommentEntity(host)
    ? { isPlainPostRepost: false, isCommentRepost: false }
    : loungeStreamLightboxMenuState(host, ctx)
  const { displayEntity, captionText } = loungeStreamLightboxMediaSource(host, media)
  const openDetailFromLightbox = (focusComposer) => {
    if (typeof ctx.onLightboxOpenDetail !== 'function') return
    ctx.onLightboxOpenDetail(host, media, { focusComposer })
  }
  const interactionBar = buildStreamLightboxInteractionBar(host, media, menuState, ctx, dismissLightbox)
  return (
    <LoungeStreamVideoLightboxChrome
      post={media}
      displayEntity={displayEntity}
      captionText={captionText}
      displayNameFor={ctx.displayNameFor}
      handleFor={ctx.handleFor}
      avatarText={ctx.avatarText}
      avatarToneClass={ctx.avatarToneClass}
      onAvatarClick={ctx.onAvatarClick}
      openProfileGateIfNeeded={ctx.openProfileGateIfNeeded}
      dismissLightbox={dismissLightbox}
      viewerUserId={ctx.viewerUserId}
      viewerFollowingUserIds={ctx.viewerFollowingUserIds}
      onFollowUser={ctx.onFollowUser}
      interactionBar={interactionBar}
      onMentionClick={ctx.onMentionClick}
      onHashtagClick={ctx.onHashtagClick}
      onLinkClick={ctx.onLinkClick}
      onCaptionClick={
        typeof ctx.onLightboxOpenDetail === 'function' && captionText
          ? () => {
              dismissLightbox()
              openDetailFromLightbox(false)
            }
          : undefined
      }
    />
  )
}

/**
 * Top-bar Follow - `landscapeOnly` hides in portrait (Stream video uses author row there).
 */
function buildLoungeLightboxFollowTopBar(hostEntity, mediaPost, ctx, { landscapeOnly = false, topBarBtnClass } = {}) {
  const host = hostEntity ?? mediaPost
  const media = mediaPost ?? host
  const { displayEntity } = loungeStreamLightboxMediaSource(host, media)
  const follow = (
    <LoungeStreamLightboxFollowButton
      author={displayEntity}
      viewerUserId={ctx.viewerUserId}
      viewerFollowingUserIds={ctx.viewerFollowingUserIds}
      onFollowUser={ctx.onFollowUser}
      placement="topBar"
      topBarBtnClass={topBarBtnClass}
    />
  )
  if (landscapeOnly) {
    return <div className="hidden landscape:block">{follow}</div>
  }
  return follow
}

/** Stream video top bar - landscape only (portrait uses author row). */
export function buildLoungeStreamLightboxTopBarExtra(hostEntity, mediaPost, ctx) {
  return buildLoungeLightboxFollowTopBar(hostEntity, mediaPost, ctx, { landscapeOnly: true })
}

/** Image/GIF lightbox top bar - always beside ⋯. */
export function buildLoungeImageLightboxTopBarExtra(hostEntity, mediaPost, ctx) {
  return buildLoungeLightboxFollowTopBar(hostEntity, mediaPost, ctx, {
    landscapeOnly: false,
    topBarBtnClass: LOUNGE_IMAGE_LIGHTBOX_TOP_FOLLOW_BTN_CLASS,
  })
}

function loungeStreamLightboxCommentMenuState(hostComment, ctx, { countAutoplayForVisibility = true } = {}) {
  const menuIsOwn = Boolean(ctx.viewerUserId && hostComment?.user_id === ctx.viewerUserId)
  const showCommentMenu = Boolean(
    !ctx.loungeReadOnly &&
      ctx.viewerUserId &&
      (typeof ctx.onCommentMenuDelete === 'function' ||
        typeof ctx.onCommentMenuBlock === 'function' ||
        typeof ctx.onCommentMenuReport === 'function'),
  )
  const showLightboxMenu =
    showCommentMenu ||
    (countAutoplayForVisibility && typeof ctx.onFeedVideoAutoplayChange === 'function') ||
    typeof ctx.onSharePost === 'function'
  return { menuIsOwn, showCommentMenu, showLightboxMenu }
}

/**
 * Stream hero top-right ⋯ menu (+ optional autoplay toggle on video).
 * @param {object} hostEntity
 * @param {object} ctx
 * @param {{ showAutoplayToggle?: boolean }} [options]
 */
export function buildLoungeStreamLightboxMenu(hostEntity, ctx, options = {}) {
  const showAutoplayToggle =
    options.showAutoplayToggle !== false && typeof ctx.onFeedVideoAutoplayChange === 'function'
  const menuButtonClassName = options.menuButtonClassName ?? LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS
  const host = hostEntity
  if (!host) return null

  if (isFeedCommentEntity(host)) {
    const { menuIsOwn, showLightboxMenu } = loungeStreamLightboxCommentMenuState(host, ctx, {
      countAutoplayForVisibility: showAutoplayToggle,
    })
    if (!showLightboxMenu) return null
    return (
      <LoungePostRowMenu
        menuAriaLabel="Comment options"
        isOwn={menuIsOwn}
        showEdit={false}
        deleteBusy={Boolean(ctx.busyDeletingCommentId && ctx.busyDeletingCommentId === host.id)}
        onEdit={() => ctx.onCommentMenuEdit?.(host)}
        onDelete={() => ctx.onCommentMenuDelete?.(host)}
        onBlock={() => ctx.onCommentMenuBlock?.(host)}
        onReport={() => ctx.onCommentMenuReport?.(host)}
        onShare={
          typeof ctx.onSharePost === 'function' && host?.post_id
            ? () => ctx.onSharePost({ id: host.post_id })
            : undefined
        }
        positionScrollRootRef={ctx.repostMenuScrollRootRef}
        showAutoplayToggle={showAutoplayToggle}
        feedVideoAutoplayEnabled={ctx.feedVideoAutoplayEnabled}
        onFeedVideoAutoplayChange={ctx.onFeedVideoAutoplayChange}
        menuButtonClassName={menuButtonClassName}
      />
    )
  }

  const menuState = loungeStreamLightboxMenuState(host, ctx)
  if (!menuState.showPostRowMenu) return null
  return (
    <LoungePostRowMenu
      isOwn={menuState.menuIsOwn}
      showEdit={menuState.menuShowEdit}
      deleteBusy={Boolean(ctx.busyDeletingPostId && ctx.busyDeletingPostId === host.id)}
      onEdit={() => ctx.onPostMenuEdit?.(host)}
      onDelete={() => ctx.onPostMenuDelete?.(host)}
      showStaffDelete={Boolean(
        ctx.loungeViewerIsStaff &&
          !menuState.menuIsOwn &&
          !menuState.isPlainPostRepost &&
          !menuState.isCommentRepost &&
          typeof ctx.onStaffPostDelete === 'function',
      )}
      staffDeleteBusy={Boolean(ctx.busyDeletingPostId && ctx.busyDeletingPostId === host.id)}
      onStaffDelete={() => ctx.onStaffPostDelete?.(host)}
      onBlock={() => ctx.onPostMenuBlock?.(host)}
      onReport={() => ctx.onPostMenuReport?.(host)}
      onShare={
        !menuState.isPlainPostRepost &&
        !menuState.isCommentRepost &&
        typeof ctx.onSharePost === 'function'
          ? () => ctx.onSharePost(host)
          : undefined
      }
      showPin={menuState.showStaffPin}
      pinned={Boolean(host?.pinned)}
      pinBusy={ctx.loungePinBusy}
      onPinToggle={() => void ctx.setLoungePostPinned?.(host.id, !host.pinned)}
      positionScrollRootRef={ctx.repostMenuScrollRootRef}
      showAutoplayToggle={showAutoplayToggle}
      feedVideoAutoplayEnabled={ctx.feedVideoAutoplayEnabled}
      onFeedVideoAutoplayChange={ctx.onFeedVideoAutoplayChange}
      menuButtonClassName={menuButtonClassName}
    />
  )
}

/** Image/GIF lightbox ⋯ menu - same as Stream minus autoplay toggle. */
export function buildLoungeImageLightboxMenu(hostEntity, ctx) {
  return buildLoungeStreamLightboxMenu(hostEntity, ctx, {
    showAutoplayToggle: false,
    menuButtonClassName: LOUNGE_IMAGE_LIGHTBOX_NAV_BTN_CLASS,
  })
}

/**
 * Pill interaction row for image/GIF or Stream hero lightbox footers.
 */
export function buildLoungeMediaLightboxInteractionBar(hostEntity, mediaPost, dismissLightbox, ctx) {
  const host = hostEntity ?? mediaPost
  const media = mediaPost ?? host
  const menuState = isFeedCommentEntity(host)
    ? { isPlainPostRepost: false, isCommentRepost: false }
    : loungeStreamLightboxMenuState(host, ctx)
  return buildStreamLightboxInteractionBar(host, media, menuState, ctx, dismissLightbox)
}

/** @deprecated Use {@link LoungeStreamLightboxProvider} + {@link buildLoungeStreamLightboxChrome}. */
export function createLoungeStreamLightboxRenderers(hostPost, ctx) {
  return {
    renderMediaLightboxChrome: (mediaPost, dismissLightbox) =>
      buildLoungeStreamLightboxChrome(hostPost, mediaPost, dismissLightbox, ctx),
    renderMediaLightboxMenu: () => buildLoungeStreamLightboxMenu(hostPost, ctx),
  }
}

/** @deprecated Use {@link LoungeStreamLightboxProvider} + {@link buildLoungeStreamLightboxChrome}. */
export function createLoungeCommentStreamLightboxRenderers(comment, ctx) {
  return {
    renderMediaLightboxChrome: (mediaPost, dismissLightbox) =>
      buildLoungeStreamLightboxChrome(comment, mediaPost ?? comment, dismissLightbox, ctx),
    renderMediaLightboxMenu: () => buildLoungeStreamLightboxMenu(comment, ctx),
  }
}
