import { useMemo } from 'react'
import { LinkifiedText } from '../utils/linkifyText.jsx'
import {
  CHAT_X_TWEET_EMBED_WIDTH_CLASS,
  isXTweetLinkPreview,
  resolveXTweetEmbed,
  xTweetAgeLabel,
} from '../utils/xTweetEmbed.js'
import {
  LOUNGE_QUOTE_EMBED_AVATAR_CLASS,
  LOUNGE_QUOTE_EMBED_CAPTION_CLASS,
  LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS,
  LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS,
  LOUNGE_QUOTE_EMBED_META_ROW_CLASS,
  LOUNGE_QUOTE_EMBED_SHELL_BASE,
  LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE,
} from '../features/lounge/loungeFeedAvatar.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../features/profiles/profileGate.js'

/**
 * Inline X post card for Lounge feed/comments and chat link previews.
 *
 * @param {{
 *   preview: object,
 *   className?: string,
 *   embedded?: boolean,
 *   isMine?: boolean,
 *   interactive?: boolean,
 *   onPreviewOpen?: (preview: object, e: MouseEvent) => void,
 * }} props
 */
export default function XTweetEmbedCard({
  preview,
  className = '',
  embedded = false,
  isMine = false,
  interactive = true,
  onPreviewOpen,
}) {
  const embed = useMemo(() => resolveXTweetEmbed(preview), [preview])

  if (!isXTweetLinkPreview(preview) || !embed) return null

  const displayName = embed.author_name || (embed.author_handle ? `@${embed.author_handle}` : 'X')
  const handleLabel = embed.author_handle ? `@${embed.author_handle}` : ''
  const ageLabel = xTweetAgeLabel(embed.created_at)
  const mediaUrls = embed.media_urls || []

  const marginTop = embedded ? 'mt-2' : 'mt-2'
  const widthClass = embedded ? CHAT_X_TWEET_EMBED_WIDTH_CLASS : 'w-full max-w-full'
  const embeddedShell = embedded
    ? `pt-2 border-t ${isMine ? 'border-white/20' : 'border-zinc-600/50'}`
    : ''
  const shellClass = interactive && !embedded
    ? LOUNGE_QUOTE_EMBED_SHELL_INTERACTIVE
    : LOUNGE_QUOTE_EMBED_SHELL_BASE
  const chatShell = embedded
    ? `${widthClass} overflow-hidden rounded-xl ${isMine ? 'bg-black/12' : 'bg-black/25'}`
    : ''

  const openExternal = (e) => {
    e?.stopPropagation?.()
    if (typeof onPreviewOpen === 'function') {
      onPreviewOpen(preview, e)
      return
    }
    const url = String(preview?.url || '').trim()
    if (!url) return
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      /* */
    }
  }

  const stop = (e) => {
    e.stopPropagation()
  }

  const avatarTone = profileAvatarToneClass(displayName)
  const avatarInitials = profileAvatarInitials(displayName)

  const body = (
    <>
      <div className={LOUNGE_QUOTE_EMBED_META_ROW_CLASS}>
        <div className={`${LOUNGE_QUOTE_EMBED_AVATAR_CLASS} ${avatarTone}`}>
          {embed.author_avatar_url ? (
            <img src={embed.author_avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">{avatarInitials}</span>
          )}
        </div>
        <span className={`${LOUNGE_QUOTE_EMBED_DISPLAY_NAME_CLASS} truncate`}>{displayName}</span>
        {handleLabel && embed.author_name ? (
          <span className={`${LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS} truncate`}>{handleLabel}</span>
        ) : null}
        {ageLabel ? (
          <span className={`${LOUNGE_QUOTE_EMBED_META_HANDLE_TIME_CLASS} shrink-0`}>· {ageLabel}</span>
        ) : null}
      </div>

      <div className={`${LOUNGE_QUOTE_EMBED_CAPTION_CLASS} mt-1.5`}>
        <LinkifiedText text={embed.text} linkClassName="underline underline-offset-2" />
      </div>

      {mediaUrls.length ? (
        <div
          className={`mt-2 grid gap-1 overflow-hidden rounded-lg ${mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}
          onPointerDown={stop}
        >
          {mediaUrls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="max-h-72 w-full object-cover"
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      <div
        data-lounge-x-tweet-embed-footer=""
        className="mt-2 flex items-center gap-1.5 border-t border-zinc-800/90 pt-2 text-[12px] font-medium text-zinc-400"
      >
        <span aria-hidden="true" className="text-[13px] leading-none">
          𝕏
        </span>
        <button
          type="button"
          className="touch-manipulation underline-offset-2 hover:underline"
          onClick={(e) => {
            stop(e)
            openExternal(e)
          }}
        >
          View on X
        </button>
      </div>
    </>
  )

  if (embedded) {
    return (
      <div
        data-lounge-x-tweet-embed=""
        className={`${marginTop} ${embeddedShell} ${chatShell} px-3 py-2.5 ${className}`}
        onPointerDown={stop}
      >
        {body}
      </div>
    )
  }

  if (!interactive) {
    return (
      <div data-lounge-x-tweet-embed="" className={`${shellClass} ${className}`} onPointerDown={stop}>
        {body}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-lounge-x-tweet-embed=""
      aria-label={`X post by ${displayName}`}
      className={`${marginTop} ${shellClass} ${className}`}
      onClick={(e) => {
        stop(e)
        openExternal(e)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        openExternal(e)
      }}
      onPointerDown={stop}
    >
      {body}
    </div>
  )
}
