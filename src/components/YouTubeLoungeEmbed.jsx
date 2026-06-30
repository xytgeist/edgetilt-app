import { useMemo } from 'react'
import {
  isYouTubeLinkPreview,
  resolveYouTubeVideoId,
  youtubeEmbedSrc,
} from '../utils/youtubeEmbed.js'
import YouTubeBrandMark from './YouTubeBrandMark.jsx'

/**
 * Inline YouTube player for Lounge posts/comments - X-style embed with iframe always mounted.
 * Playback starts from YouTube's own controls (no forced autoplay).
 *
 * @param {{
 *   preview: object,
 *   className?: string,
 *   iframeLoading?: 'lazy' | 'eager',
 * }} props
 */
export default function YouTubeLoungeEmbed({ preview, className = '', iframeLoading = 'lazy' }) {
  const videoId = useMemo(() => resolveYouTubeVideoId(preview), [preview])
  const title = String(preview?.title || 'YouTube video').trim()

  if (!isYouTubeLinkPreview(preview) || !videoId) return null

  return (
    <div
      data-lounge-youtube-embed=""
      className={`mt-2 w-full max-w-full overflow-hidden rounded-2xl border border-zinc-700/80 bg-black ${className}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="relative aspect-video w-full bg-zinc-950">
        <iframe
          src={youtubeEmbedSrc(videoId, { autoplay: false })}
          title={title}
          className="absolute inset-0 h-full w-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading={iframeLoading}
        />
      </div>
      <div data-lounge-youtube-embed-footer="" className="border-t border-zinc-800/90 px-3 py-2">
        <YouTubeBrandMark labelClassName="text-[13px] font-medium text-zinc-300" />
      </div>
    </div>
  )
}
