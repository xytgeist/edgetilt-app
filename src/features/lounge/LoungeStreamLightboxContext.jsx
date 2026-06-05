import { createContext, useCallback, useContext, useMemo } from 'react'

import {
  buildLoungeImageLightboxMenu,
  buildLoungeImageLightboxTopBarExtra,
  buildLoungeMediaLightboxInteractionBar,
  buildLoungeStreamLightboxChrome,
  buildLoungeStreamLightboxMenu,
  buildLoungeStreamLightboxTopBarExtra,
} from './loungeStreamLightboxRenderers.jsx'

const LoungeStreamLightboxContext = createContext(null)

/**
 * @typedef {object} LoungeStreamLightboxTileCtx
 * @property {number} [commentDescendantFallback]
 * @property {boolean} [hideLightboxInteractionBar]
 */

/**
 * @typedef {object} LoungeStreamLightboxSurfaceCtx
 * @property {string} [repostMenuPortalClass]
 * @property {import('react').RefObject<HTMLElement | null>} [repostMenuScrollRootRef]
 */

function mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx) {
  return {
    ...ctx,
    ...surfaceCtx,
    ...(typeof tileCtx?.commentDescendantFallback === 'number'
      ? { commentDescendantFallback: tileCtx.commentDescendantFallback }
      : null),
  }
}

/**
 * Shared handlers for Stream video + image/GIF lightboxes (feed, detail, comments, profile).
 * Surface-specific portal/scroll refs are merged per tile via {@link LoungeStreamLightboxSurfaceCtx}.
 */
export function LoungeStreamLightboxProvider({ ctx, children }) {
  const buildChrome = useCallback(
    (hostEntity, mediaPost, dismissLightbox, tileCtx, surfaceCtx) =>
      buildLoungeStreamLightboxChrome(
        hostEntity,
        mediaPost,
        dismissLightbox,
        mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx),
      ),
    [ctx],
  )

  const buildMenu = useCallback(
    (hostEntity, tileCtx, surfaceCtx) =>
      buildLoungeStreamLightboxMenu(hostEntity, mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx)),
    [ctx],
  )

  const buildTopBarExtra = useCallback(
    (hostEntity, mediaPost, tileCtx, surfaceCtx) =>
      buildLoungeStreamLightboxTopBarExtra(
        hostEntity,
        mediaPost,
        mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx),
      ),
    [ctx],
  )

  const buildImageMenu = useCallback(
    (hostEntity, tileCtx, surfaceCtx) =>
      buildLoungeImageLightboxMenu(hostEntity, mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx)),
    [ctx],
  )

  const buildImageInteractionBar = useCallback(
    (hostEntity, mediaPost, dismissLightbox, tileCtx, surfaceCtx) =>
      buildLoungeMediaLightboxInteractionBar(
        hostEntity,
        mediaPost,
        dismissLightbox,
        mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx),
      ),
    [ctx],
  )

  const buildImageTopBarExtra = useCallback(
    (hostEntity, mediaPost, tileCtx, surfaceCtx) =>
      buildLoungeImageLightboxTopBarExtra(
        hostEntity,
        mediaPost,
        mergeLoungeLightboxTileCtx(ctx, tileCtx, surfaceCtx),
      ),
    [ctx],
  )

  const value = useMemo(
    () => ({
      buildChrome,
      buildMenu,
      buildTopBarExtra,
      buildImageMenu,
      buildImageInteractionBar,
      buildImageTopBarExtra,
    }),
    [buildChrome, buildMenu, buildTopBarExtra, buildImageMenu, buildImageInteractionBar, buildImageTopBarExtra],
  )

  return <LoungeStreamLightboxContext.Provider value={value}>{children}</LoungeStreamLightboxContext.Provider>
}

/** @returns {{ buildChrome: Function, buildMenu: Function, buildTopBarExtra: Function, buildImageMenu: Function, buildImageInteractionBar: Function, buildImageTopBarExtra: Function } | null} */
export function useLoungeStreamLightbox() {
  return useContext(LoungeStreamLightboxContext)
}

/**
 * Build lightbox ctx from feed/profile `postCardProps` + SocialFeed-only handlers.
 * Keeps one mapping from app state → lightbox behavior.
 */
export function buildLoungeStreamLightboxCtxFromPostCardProps(pp, extras = {}) {
  if (!pp || typeof pp !== 'object') return {}
  return {
    loungeReadOnly: pp.loungeReadOnly,
    viewerUserId: pp.viewerUserId,
    onPostMenuEdit: pp.onPostMenuEdit,
    captionEditableInMenu: pp.captionEditableInMenu,
    loungeViewerIsStaff: pp.loungeViewerIsStaff,
    setLoungePostPinned: pp.setLoungePostPinned,
    onPostMenuDelete: pp.onPostMenuDelete,
    onStaffPostDelete: pp.onStaffPostDelete,
    onPostMenuBlock: pp.onPostMenuBlock,
    onPostMenuReport: pp.onPostMenuReport,
    onSharePost: pp.onSharePost,
    interactionBarVariant: 'sheet',
    interactionStateFor: pp.interactionStateFor,
    interactionStateForComment: pp.interactionStateForComment,
    toggleInteraction: pp.toggleInteraction,
    onPlainRepost: pp.onPlainRepost,
    onUndoPlainRepost: pp.onUndoPlainRepost,
    onRemoveQuoteRepost: pp.onRemoveQuoteRepost,
    onQuoteRepost: pp.onQuoteRepost,
    toggleBookmark: pp.toggleBookmark,
    bookmarkedByPost: pp.bookmarkedByPost,
    onOpenComments: pp.onOpenComments,
    onLightboxOpenDetail:
      'onLightboxOpenDetail' in extras ? extras.onLightboxOpenDetail : pp.onStreamLightboxOpenDetail,
    requireLoungeAuth: pp.requireLoungeAuth,
    openProfileGateIfNeeded: pp.openProfileGateIfNeeded,
    onToggleCommentLike: pp.onToggleCommentLike,
    onToggleCommentBookmark: pp.onToggleCommentBookmark,
    getCommentBookmarked: pp.getCommentBookmarked,
    onCommentPlainRepost: pp.onCommentPlainRepost,
    onCommentUndoPlainRepost: pp.onCommentUndoPlainRepost,
    onCommentMenuEdit: pp.onCommentMenuEdit,
    onCommentMenuDelete: pp.onCommentMenuDelete,
    onCommentMenuBlock: pp.onCommentMenuBlock,
    onCommentMenuReport: pp.onCommentMenuReport,
    busyDeletingCommentId: pp.busyDeletingCommentId,
    busyDeletingPostId: pp.busyDeletingPostId,
    repostActionBusy: pp.repostActionBusy,
    displayNameFor: pp.displayNameFor,
    handleFor: pp.handleFor,
    avatarText: pp.avatarText,
    avatarToneClass: pp.avatarToneClass,
    onAvatarClick: pp.onAvatarClick,
    viewerFollowingUserIds: pp.viewerFollowingUserIds,
    onFollowUser: pp.onFollowUser,
    onMentionClick: pp.onMentionClick,
    onHashtagClick: pp.onHashtagClick,
    onLinkClick: pp.onLinkClick,
    loungePinBusy: pp.loungePinBusy,
    feedVideoAutoplayEnabled: pp.feedVideoAutoplayEnabled,
    onFeedVideoAutoplayChange: pp.onFeedVideoAutoplayChange,
    ...extras,
  }
}
