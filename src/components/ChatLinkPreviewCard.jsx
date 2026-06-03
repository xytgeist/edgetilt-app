import { useEffect, useMemo, useState } from 'react'
import {
  bubbleAccentBackground,
  extractAccentFromImageUrl,
  resolvePreviewAccent,
} from '../utils/linkPreviewAccent.js'

/**
 * iMessage-style link preview: rich card (og:image) or compact pill (favicon + title + domain).
 *
 * @param {{
 *   preview: {
 *     url: string,
 *     title?: string | null,
 *     image_url?: string | null,
 *     favicon_url?: string | null,
 *     site_name?: string | null,
 *     layout?: 'rich' | 'compact',
 *     lounge_post_id?: string | null,
 *     accent_color?: string | null,
 *   },
 *   className?: string,
 *   isMine?: boolean,
 *   embedded?: boolean,
 * }} props
 */
export default function ChatLinkPreviewCard({ preview, className = '', isMine = false, embedded = false }) {
  const [sampledAccent, setSampledAccent] = useState(null)

  const resolvedAccent = useMemo(() => (preview?.url ? resolvePreviewAccent(preview) : null), [preview])
  const accentBg = useMemo(() => {
    const hex = sampledAccent || resolvedAccent
    return hex ? bubbleAccentBackground(hex) : null
  }, [resolvedAccent, sampledAccent])

  useEffect(() => {
    setSampledAccent(null)
    if (resolvedAccent) return undefined
    const favicon = String(preview.favicon_url || '').trim()
    if (!favicon) return undefined
    let cancelled = false
    void extractAccentFromImageUrl(favicon).then((color) => {
      if (!cancelled && color) setSampledAccent(color)
    })
    return () => {
      cancelled = true
    }
  }, [preview?.favicon_url, preview?.url, resolvedAccent])

  if (!preview?.url) return null

  let hostname = preview.site_name || ''
  try {
    hostname = new URL(preview.url).hostname.replace(/^www\./i, '')
  } catch {
    /* */
  }
  const title = String(preview.title || hostname || 'Link').trim()
  const isRich = preview.layout === 'rich' && preview.image_url

  const branded = Boolean(accentBg)
  const cardStyle = accentBg ? { backgroundColor: accentBg } : undefined
  const titleClass = branded ? 'text-white' : 'text-zinc-100'
  const domainClass = branded ? 'text-white/75' : 'text-zinc-400'

  const open = () => {
    try {
      window.open(preview.url, '_blank', 'noopener,noreferrer')
    } catch {
      /* */
    }
  }

  const stop = (e) => {
    e.stopPropagation()
    e.preventDefault()
  }

  const marginTop = embedded ? 'mt-2' : 'mt-1.5'
  const widthClass = embedded ? 'w-full max-w-full' : 'w-full max-w-[280px]'
  const embeddedShell = embedded
    ? `pt-2 border-t ${isMine ? 'border-white/20' : 'border-zinc-600/50'}`
    : ''
  const defaultBg = embedded
    ? isMine
      ? 'bg-black/12'
      : 'bg-black/25'
    : isMine
      ? 'bg-blue-600/90'
      : 'bg-zinc-800/95'
  const shapeClass = branded
    ? embedded
      ? 'rounded-xl'
      : 'rounded-[1.35rem]'
    : 'rounded-xl'

  if (isRich) {
    const footerBg = branded
      ? cardStyle
      : undefined
    const footerClass = branded
      ? 'px-3 py-2'
      : `px-3 py-2 ${embedded ? (isMine ? 'bg-black/15' : 'bg-zinc-900/80') : isMine ? 'bg-blue-700/80' : 'bg-zinc-900/90'}`

    return (
      <button
        type="button"
        onClick={(e) => {
          stop(e)
          open()
        }}
        onPointerDown={stop}
        className={`${marginTop} ${embeddedShell} block ${widthClass} overflow-hidden ${shapeClass} text-left touch-manipulation ${branded ? '' : defaultBg} ${className}`}
        style={branded ? undefined : cardStyle}
        aria-label={`Open link: ${title}`}
      >
        <img
          src={preview.image_url}
          alt=""
          className="aspect-[1.91/1] w-full object-cover"
          loading="lazy"
        />
        <div className={footerClass} style={footerBg}>
          <div className={`line-clamp-2 text-[14px] font-semibold leading-snug ${titleClass}`}>
            {title}
          </div>
          <div className={`mt-0.5 truncate text-[12px] ${domainClass}`}>{hostname}</div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e)
        open()
      }}
      onPointerDown={stop}
      className={`${marginTop} ${embeddedShell} flex ${widthClass} items-center gap-2.5 overflow-hidden ${shapeClass} px-3 py-2.5 text-left touch-manipulation ${branded ? '' : defaultBg} ${className}`}
      style={cardStyle}
      aria-label={`Open link: ${title}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className={`line-clamp-2 text-[14px] font-semibold leading-snug ${titleClass}`}>
          {title}
        </div>
        <div className={`truncate text-[12px] ${domainClass}`}>{hostname}</div>
      </div>
      {preview.favicon_url ? (
        <img
          src={preview.favicon_url}
          alt=""
          className={`h-10 w-10 shrink-0 rounded-lg object-cover ${branded ? 'bg-white/15' : 'bg-zinc-700/80'}`}
          loading="lazy"
        />
      ) : null}
    </button>
  )
}
