import { LOUNGE_QUOTE_EMBED_SHELL_UNAVAILABLE } from './loungeFeedAvatar.js'

/**
 * Placeholder when a quote repost's embedded original post was deleted or is hidden.
 */
export default function LoungePostOriginalUnavailableEmbed({
  post,
  className = 'mt-2',
  variant = 'feed',
}) {
  const deleted = post?.repost_target_unavailable === true
  const message = deleted ? 'This post was deleted.' : 'This post is no longer available.'

  return (
    <div
      className={`${LOUNGE_QUOTE_EMBED_SHELL_UNAVAILABLE} ${className}`}
      data-lounge-original-unavailable
      aria-live="polite"
    >
      <p
        className={`font-medium leading-snug text-zinc-400 ${
          variant === 'detail' ? 'text-[15px]' : 'text-[14px]'
        }`}
      >
        {message}
      </p>
    </div>
  )
}
