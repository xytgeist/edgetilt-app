import { useMemo } from 'react'
import { LinkifiedText } from '../utils/linkifyText.jsx'
import {
  CHAT_X_TWEET_EMBED_WIDTH_CLASS,
  formatXTweetTimestamp,
  formatXTweetViewCount,
  isXTweetLinkPreview,
  resolveXTweetEmbed,
  xTweetVideoPlayUrl,
} from '../utils/xTweetEmbed.js'
import { profileAvatarInitials, profileAvatarToneClass } from '../features/profiles/profileGate.js'

function XVerifiedBadge({ className = '' }) {
  return (
    <svg
      viewBox="0 0 22 22"
      aria-label="Verified account"
      role="img"
      className={`h-[1.05em] w-[1.05em] shrink-0 fill-[#1d9bf0] ${className}`}
    >
      <path d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246-1.01-.5-2.196-.5-3.206 0-.586.274-1.084.706-1.438 1.246-.355.54-.552 1.17-.57 1.816v.08c.018.646.215 1.275.57 1.816.354.54.852.972 1.438 1.246 1.01.5 2.196.5 3.206 0 .586-.274 1.084-.706 1.438-1.246.355-.54.552-1.17.57-1.816v-.08zM9.5 14.25 6.25 11l1.06-1.06 2.19 2.19 5.19-5.19L15.75 8 9.5 14.25z" />
    </svg>
  )
}

function XBrandMark({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] font-bold leading-none text-zinc-500 ${className}`}
    >
      𝕏
    </span>
  )
}

/**
 * @param {{ item: { type: string, url: string, poster_url?: string | null }, solo: boolean }} props
 */
function XTweetMediaTile({ item, solo }) {
  const stop = (e) => {
    e.stopPropagation()
  }

  if (item.type === 'video' || item.type === 'animated_gif') {
    const playUrl = xTweetVideoPlayUrl(item.url)
    return (
      <video
        data-lounge-x-tweet-video=""
        src={playUrl}
        poster={item.poster_url || undefined}
        controls
        playsInline
        preload="metadata"
        referrerPolicy="no-referrer"
        loop={item.type === 'animated_gif'}
        muted={item.type === 'animated_gif'}
        className={`w-full bg-black object-contain ${solo ? 'max-h-[28rem]' : 'max-h-56'}`}
        onClick={stop}
        onPointerDown={stop}
      />
    )
  }

  return (
    <img
      src={item.url}
      alt=""
      className={`w-full object-cover ${solo ? 'max-h-80' : 'max-h-56'}`}
      loading="lazy"
    />
  )
}

/**
 * Native-style X post card for Lounge feed/comments and chat link previews.
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

  const displayName = embed.author_name || (embed.author_handle ? embed.author_handle : 'X')
  const handleLabel = embed.author_handle ? `@${embed.author_handle}` : ''
  const timestampLabel = formatXTweetTimestamp(embed.created_at)
  const viewLabel = formatXTweetViewCount(embed.view_count)
  const metaLine = [timestampLabel, viewLabel].filter(Boolean).join(' · ')
  const mediaItems = embed.media || []

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

  const shellClass = embedded
    ? `${CHAT_X_TWEET_EMBED_WIDTH_CLASS} ${isMine ? 'border-white/15 bg-black/10' : 'border-zinc-600/40 bg-black/20'}`
    : 'w-full max-w-full border-zinc-700/75 bg-zinc-950/55'

  const card = (
    <div
      data-lounge-x-tweet-embed=""
      className={`overflow-hidden rounded-2xl border ${shellClass} ${className}`}
      onPointerDown={stop}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-full ${avatarTone}`}>
            {embed.author_avatar_url ? (
              <img
                src={embed.author_avatar_url}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[13px] font-bold text-zinc-100">
                {avatarInitials}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1">
                  <span
                    data-lounge-x-tweet-name=""
                    className="truncate text-[15px] font-bold leading-tight text-zinc-50"
                  >
                    {displayName}
                  </span>
                  {embed.author_verified ? <XVerifiedBadge className="translate-y-px" /> : null}
                </div>
                {handleLabel ? (
                  <div data-lounge-x-tweet-handle="" className="truncate text-[15px] leading-tight text-zinc-500">
                    {handleLabel}
                  </div>
                ) : null}
              </div>
              <XBrandMark />
            </div>
          </div>
        </div>

        <div
          data-lounge-x-tweet-body=""
          className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-[1.35] text-zinc-100 [overflow-wrap:anywhere]"
        >
          <LinkifiedText text={embed.text} linkClassName="text-[#1d9bf0] underline-offset-2 hover:underline" />
        </div>

        {mediaItems.length ? (
          <div
            className={`mt-3 overflow-hidden rounded-xl border border-zinc-800/80 ${mediaItems.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}`}
            onPointerDown={stop}
            onClick={stop}
          >
            {mediaItems.map((item) => (
              <XTweetMediaTile key={`${item.type}:${item.url}`} item={item} solo={mediaItems.length === 1} />
            ))}
          </div>
        ) : null}

        {metaLine ? (
          <div data-lounge-x-tweet-meta="" className="mt-3 text-[13px] leading-snug text-zinc-500">
            {metaLine}
          </div>
        ) : null}
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div
        className={`mt-2 pt-2 ${isMine ? 'border-t border-white/20' : 'border-t border-zinc-600/50'}`}
        onPointerDown={stop}
      >
        {card}
      </div>
    )
  }

  if (!interactive) {
    return <div className="mt-2">{card}</div>
  }

  return (
    <div
      role="link"
      tabIndex={0}
      className="mt-2 cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]"
      aria-label={`X post by ${displayName}`}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('[data-lounge-x-tweet-video], video, a')) {
          stop(e)
          return
        }
        stop(e)
        openExternal(e)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        openExternal(e)
      }}
    >
      {card}
    </div>
  )
}
