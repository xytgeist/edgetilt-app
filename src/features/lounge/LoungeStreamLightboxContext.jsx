import { createContext, useCallback, useContext, useMemo } from 'react'

import {
  buildLoungeStreamLightboxChrome,
  buildLoungeStreamLightboxMenu,
} from './loungeStreamLightboxRenderers.jsx'

const LoungeStreamLightboxContext = createContext(null)

/**
 * @typedef {object} LoungeStreamLightboxTileCtx
 * @property {number} [commentDescendantFallback]
 */

/**
 * @typedef {object} LoungeStreamLightboxSurfaceCtx
 * @property {string} [repostMenuPortalClass]
 * @property {import('react').RefObject<HTMLElement | null>} [repostMenuScrollRootRef]
 */

/**
 * Shared handlers + display helpers for Stream video hero chrome (feed, detail, comments, profile).
 * Surface-specific portal/scroll refs are merged per tile via {@link LoungeStreamLightboxSurfaceCtx}.
 */
export function LoungeStreamLightboxProvider({ ctx, children }) {
  const buildChrome = useCallback(
    (hostEntity, mediaPost, dismissLightbox, tileCtx, surfaceCtx) =>
      buildLoungeStreamLightboxChrome(hostEntity, mediaPost, dismissLightbox, {
        ...ctx,
        ...surfaceCtx,
        ...(typeof tileCtx?.commentDescendantFallback === 'number'
          ? { commentDescendantFallback: tileCtx.commentDescendantFallback }
          : null),
      }),
    [ctx],
  )

  const buildMenu = useCallback(
    (hostEntity, tileCtx, surfaceCtx) =>
      buildLoungeStreamLightboxMenu(hostEntity, {
        ...ctx,
        ...surfaceCtx,
        ...(typeof tileCtx?.commentDescendantFallback === 'number'
          ? { commentDescendantFallback: tileCtx.commentDescendantFallback }
          : null),
      }),
    [ctx],
  )

  const value = useMemo(
    () => ({
      buildChrome,
      buildMenu,
    }),
    [buildChrome, buildMenu],
  )

  return <LoungeStreamLightboxContext.Provider value={value}>{children}</LoungeStreamLightboxContext.Provider>
}

/** @returns {{ buildChrome: Function, buildMenu: Function } | null} */
export function useLoungeStreamLightbox() {
  return useContext(LoungeStreamLightboxContext)
}

/**
 * Build Stream lightbox ctx from feed/profile `postCardProps` + SocialFeed-only handlers.
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
    onLightboxOpenDetail: extras.onLightboxOpenDetail ?? pp.onStreamLightboxOpenDetail,
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
    loungePinBusy: pp.loungePinBusy,
    feedVideoAutoplayEnabled: pp.feedVideoAutoplayEnabled,
    onFeedVideoAutoplayChange: pp.onFeedVideoAutoplayChange,
    ...extras,
  }
}
