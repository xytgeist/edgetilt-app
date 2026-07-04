/** Max characters per lounge post caption / feed comment body (free tier). */
export const LOUNGE_CAPTION_MAX = 500

/** Subscriber, bot, and staff lounge post/comment cap. */
export const LOUNGE_CAPTION_SUBSCRIBER_MAX = 2000

/** Max continuation parts after the root post (root + 24 = 25 posts total). */
export const LOUNGE_POST_THREAD_MAX_PARTS = 25

/** Collapsed caption length in feed/list UI (tap …more for full text). */
export const LOUNGE_CAPTION_DISPLAY_MAX = 320

/** Collapsed caption line count in feed/list UI (whichever limit hits first: chars or lines). */
export const LOUNGE_CAPTION_DISPLAY_MAX_LINES = 12

/** @deprecated use {@link loungeCaptionMaxForProfile} */
export const LOUNGE_COMMENT_BODY_MAX = LOUNGE_CAPTION_MAX

/**
 * Lounge compose cap for the signed-in author.
 * @param {Record<string, unknown> | null | undefined} profile
 * @param {{ hasActiveSubscription?: boolean, isStaff?: boolean }} [opts]
 */
export function loungeCaptionMaxForProfile(profile, opts = {}) {
  if (opts.isStaff) return LOUNGE_CAPTION_SUBSCRIBER_MAX
  if (profile?.is_bot === true) return LOUNGE_CAPTION_SUBSCRIBER_MAX
  if (opts.hasActiveSubscription || profile?.has_active_subscription === true) {
    return LOUNGE_CAPTION_SUBSCRIBER_MAX
  }
  const role = String(profile?.role || '').toLowerCase()
  if (role === 'admin' || role === 'moderator') return LOUNGE_CAPTION_SUBSCRIBER_MAX
  return LOUNGE_CAPTION_MAX
}
