import { cloneElement, isValidElement } from 'react'

/**
 * Wraps a lightbox footer (e.g. `LoungePostInteractionBar`) so **Quote** closes the
 * image/video fullscreen first (quote composer **`z-[100]`+). **Comment / reply** keep
 * the lightbox mounted so post/comment detail can sit as a sheet over the media.
 * @param {import('react').ReactNode} footer
 * @param {() => void} dismissLightbox
 */
export function mergeLightboxDismissOnQuoteRepost(footer, dismissLightbox) {
  if (!footer || !isValidElement(footer) || typeof dismissLightbox !== 'function') return footer
  const prevQuote = footer.props.onQuoteRepost
  const prevCommentClick = footer.props.onCommentClick
  const prevOpenComments = footer.props.onOpenComments
  const prevToggleInteraction = footer.props.toggleInteraction
  const post = footer.props.post
  return cloneElement(footer, {
    onQuoteRepost: (p) => {
      dismissLightbox()
      prevQuote?.(p)
    },
    onCommentClick: () => {
      if (typeof prevCommentClick === 'function') {
        prevCommentClick()
        return
      }
      if (typeof prevOpenComments === 'function') {
        prevOpenComments(post)
        return
      }
      if (post?.id != null && typeof prevToggleInteraction === 'function') {
        prevToggleInteraction(post.id, 'commented')
      }
    },
  })
}
