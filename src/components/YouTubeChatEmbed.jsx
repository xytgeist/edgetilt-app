import { useMemo } from 'react'
import {
  CHAT_YOUTUBE_EMBED_WIDTH_CLASS,
  isYouTubeLinkPreview,
  resolveYouTubeVideoId,
  youtubeEmbedSrc,
} from '../utils/youtubeEmbed.js'
import YouTubeBrandMark from './YouTubeBrandMark.jsx'

/**
 * YouTube preview for chat - iframe always mounted (one tap on YouTube controls to play).
 * No duplicate URL row; caption text may still include the link when present.
 *
 * @param {{
 *   preview: object,
 *   className?: string,
 *   isMine?: boolean,
 *   embedded?: boolean,
 * }} props
 */
export default function YouTubeChatEmbed({ preview, className = '', isMine = false, embedded = false }) {
  const videoId = useMemo(() => resolveYouTubeVideoId(preview), [preview])
  const title = String(preview?.title || 'YouTube video').trim()
  const description = String(preview?.description || '').trim()

  if (!isYouTubeLinkPreview(preview) || !videoId) return null

  const marginTop = embedded ? 'mt-2' : 'mt-1.5'
  const widthClass = CHAT_YOUTUBE_EMBED_WIDTH_CLASS
  const shellClass = embedded
    ? `pt-2 border-t ${isMine ? 'border-white/20' : 'border-zinc-600/50'}`
    : ''
  const cardBg = embedded
    ? isMine
      ? 'bg-black/12'
      : 'bg-black/25'
    : isMine
      ? 'bg-blue-600/90'
      : 'bg-zinc-800/95'
  const titleClass = isMine ? 'text-white' : 'text-zinc-100'
  const bodyClass = isMine ? 'text-white/80' : 'text-zinc-300'
  const metaClass = isMine ? 'text-white/70' : 'text-zinc-400'

  return (
    <div
      className={`${marginTop} ${shellClass} ${widthClass} overflow-hidden rounded-xl ${cardBg} ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative aspect-video w-full bg-black">
        <iframe
          src={youtubeEmbedSrc(videoId, { autoplay: false })}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="eager"
        />
      </div>

      <div className="space-y-1 px-3 py-2.5">
        <YouTubeBrandMark
          labelClassName={`text-[12px] font-semibold uppercase tracking-wide ${metaClass}`}
          iconClassName="h-[14px] w-[20px]"
        />
        <div className={`text-[15px] font-semibold leading-snug ${titleClass}`}>{title}</div>
        {description ? (
          <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed line-clamp-5 ${bodyClass}`}>
            {description}
          </p>
        ) : null}
      </div>
    </div>
  )
}
