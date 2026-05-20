import LoungePostInteractionBar from './LoungePostInteractionBar.jsx'
import LoungePostRowMenu from './LoungePostRowMenu.jsx'
import LoungeStreamVideoLightboxChrome, {
  LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS,
} from './LoungeStreamVideoLightboxChrome.jsx'
import { mergeLightboxDismissOnQuoteRepost } from './loungeLightboxFooterDismissQuote.js'

import { feedPostDisplayCaption } from '../../utils/communityFeedPost.js'

/** @param {object | null | undefined} row */
export function isFeedCommentEntity(row) {
  if (!row?.user_id) return false
  if ('caption' in row) return false
  return 'body' in row || Boolean(row?.post_id)
}

/** Caption/body for lightbox overlay — comments use `body`, posts use `caption`. */
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

/** @deprecated Prefer {@link loungeStreamLightboxMediaSource} — kept for callers that only need author. */
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
 * Factory for Stream hero overlay renderers (author block, interactions, ⋯ menu).
 * @param {object} hostPost — Feed/detail row post (menu + author resolution).
 * @param {object} ctx — Handlers and display helpers shared with `LoungePostArticle`.
 */
export function createLoungeStreamLightboxRenderers(hostPost, ctx) {
  const menuState = loungeStreamLightboxMenuState(hostPost, ctx)

  const renderMediaLightboxChrome = (mediaPost, dismissLightbox) => {
    const { displayEntity, captionText } = loungeStreamLightboxMediaSource(hostPost, mediaPost)
    const menuPortalZ =
      ctx.repostMenuPortalClass === 'z-[48]' ? 'z-[105]' : ctx.repostMenuPortalClass || 'z-[105]'
    const openDetailFromLightbox = (focusComposer) => {
      if (typeof ctx.onLightboxOpenDetail !== 'function') return
      ctx.onLightboxOpenDetail(hostPost, mediaPost, { focusComposer })
    }
    const interactionBar = mergeLightboxDismissOnQuoteRepost(
      <LoungePostInteractionBar
        post={mediaPost}
        variant={ctx.interactionBarVariant || 'sheet'}
        rootClassName="w-full"
        repostMenuPortalClass={menuPortalZ}
        loungeReadOnly={ctx.loungeReadOnly}
        interactionStateFor={ctx.interactionStateFor}
        toggleInteraction={ctx.toggleInteraction}
        onPlainRepost={ctx.onPlainRepost}
        onUndoPlainRepost={ctx.onUndoPlainRepost}
        onRemoveQuoteRepost={ctx.onRemoveQuoteRepost}
        onQuoteRepost={ctx.onQuoteRepost}
        toggleBookmark={ctx.toggleBookmark}
        bookmarkedByPost={ctx.bookmarkedByPost}
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
        onShare={
          !menuState.isPlainPostRepost && !menuState.isCommentRepost && typeof ctx.onSharePost === 'function'
            ? () => ctx.onSharePost(hostPost)
            : undefined
        }
      />,
      dismissLightbox,
    )
    return (
      <LoungeStreamVideoLightboxChrome
        post={mediaPost}
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

  const renderMediaLightboxMenu = () => {
    if (!menuState.showPostRowMenu) return null
    return (
      <LoungePostRowMenu
        isOwn={menuState.menuIsOwn}
        showEdit={menuState.menuShowEdit}
        deleteBusy={Boolean(ctx.busyDeletingPostId && ctx.busyDeletingPostId === hostPost.id)}
        onEdit={() => ctx.onPostMenuEdit?.(hostPost)}
        onDelete={() => ctx.onPostMenuDelete?.(hostPost)}
        showStaffDelete={Boolean(
          ctx.loungeViewerIsStaff &&
            !menuState.menuIsOwn &&
            !menuState.isPlainPostRepost &&
            !menuState.isCommentRepost &&
            typeof ctx.onStaffPostDelete === 'function',
        )}
        staffDeleteBusy={Boolean(ctx.busyDeletingPostId && ctx.busyDeletingPostId === hostPost.id)}
        onStaffDelete={() => ctx.onStaffPostDelete?.(hostPost)}
        onBlock={() => ctx.onPostMenuBlock?.(hostPost)}
        onReport={() => ctx.onPostMenuReport?.(hostPost)}
        onShare={
          !menuState.isPlainPostRepost &&
          !menuState.isCommentRepost &&
          typeof ctx.onSharePost === 'function'
            ? () => ctx.onSharePost(hostPost)
            : undefined
        }
        showPin={menuState.showStaffPin}
        pinned={Boolean(hostPost?.pinned)}
        pinBusy={ctx.loungePinBusy}
        onPinToggle={() => void ctx.setLoungePostPinned?.(hostPost.id, !hostPost.pinned)}
        positionScrollRootRef={ctx.repostMenuScrollRootRef}
        showAutoplayToggle={typeof ctx.onFeedVideoAutoplayChange === 'function'}
        feedVideoAutoplayEnabled={ctx.feedVideoAutoplayEnabled}
        onFeedVideoAutoplayChange={ctx.onFeedVideoAutoplayChange}
        menuButtonClassName={LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS}
      />
    )
  }

  return { renderMediaLightboxChrome, renderMediaLightboxMenu }
}

/**
 * Stream hero overlay for comment-thread videos (author, body, comment interactions, ⋯ menu).
 * @param {object} comment — `feed_comments` row with `author_profile`.
 * @param {object} ctx
 * @param {(comment: object) => import('react').ReactNode} ctx.buildInteractionBar
 */
export function createLoungeCommentStreamLightboxRenderers(comment, ctx) {
  const menuIsOwn = Boolean(ctx.viewerUserId && comment?.user_id === ctx.viewerUserId)
  const showCommentMenu = Boolean(
    !ctx.loungeReadOnly &&
      ctx.viewerUserId &&
      (typeof ctx.onCommentMenuEdit === 'function' ||
        typeof ctx.onCommentMenuDelete === 'function' ||
        typeof ctx.onCommentMenuBlock === 'function' ||
        typeof ctx.onCommentMenuReport === 'function'),
  )
  const showLightboxMenu =
    showCommentMenu || typeof ctx.onFeedVideoAutoplayChange === 'function'

  const renderMediaLightboxChrome = (mediaPost, dismissLightbox) => {
    const media = mediaPost ?? comment
    const { displayEntity, captionText } = loungeStreamLightboxMediaSource(comment, media)
    const openDetailFromLightbox = (focusComposer) => {
      if (typeof ctx.onLightboxOpenDetail !== 'function') return
      ctx.onLightboxOpenDetail(comment, media, { focusComposer })
    }
    const interactionBar =
      typeof ctx.buildInteractionBar === 'function'
        ? mergeLightboxDismissOnQuoteRepost(ctx.buildInteractionBar(media), dismissLightbox)
        : null

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

  const renderMediaLightboxMenu = () => {
    if (!showLightboxMenu) return null
    return (
      <LoungePostRowMenu
        menuAriaLabel="Comment options"
        isOwn={menuIsOwn}
        showEdit={Boolean(menuIsOwn && typeof ctx.onCommentMenuEdit === 'function')}
        deleteBusy={Boolean(ctx.busyDeletingCommentId && ctx.busyDeletingCommentId === comment.id)}
        onEdit={() => ctx.onCommentMenuEdit?.(comment)}
        onDelete={() => ctx.onCommentMenuDelete?.(comment)}
        onBlock={() => ctx.onCommentMenuBlock?.(comment)}
        onReport={() => ctx.onCommentMenuReport?.(comment)}
        positionScrollRootRef={ctx.repostMenuScrollRootRef}
        showAutoplayToggle={typeof ctx.onFeedVideoAutoplayChange === 'function'}
        feedVideoAutoplayEnabled={ctx.feedVideoAutoplayEnabled}
        onFeedVideoAutoplayChange={ctx.onFeedVideoAutoplayChange}
        menuButtonClassName={LOUNGE_HERO_LIGHTBOX_TOP_BTN_CLASS}
      />
    )
  }

  return { renderMediaLightboxChrome, renderMediaLightboxMenu }
}
