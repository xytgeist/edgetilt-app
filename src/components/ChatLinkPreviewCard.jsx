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
 *   },
 *   className?: string,
 *   isMine?: boolean,
 * }} props
 */
export default function ChatLinkPreviewCard({ preview, className = '', isMine = false }) {
  if (!preview?.url) return null

  let hostname = preview.site_name || ''
  try {
    hostname = new URL(preview.url).hostname.replace(/^www\./i, '')
  } catch {
    /* */
  }
  const title = String(preview.title || hostname || 'Link').trim()
  const isRich = preview.layout === 'rich' && preview.image_url

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

  if (isRich) {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); open() }}
        onPointerDown={stop}
        className={`mt-1.5 block w-full max-w-[280px] overflow-hidden rounded-2xl text-left touch-manipulation ${
          isMine ? 'bg-blue-600/90' : 'bg-zinc-800/95'
        } ${className}`}
        aria-label={`Open link: ${title}`}
      >
        <img
          src={preview.image_url}
          alt=""
          className="aspect-[1.91/1] w-full object-cover"
          loading="lazy"
        />
        <div className={`px-3 py-2 ${isMine ? 'bg-blue-700/80' : 'bg-zinc-900/90'}`}>
          <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-zinc-100">
            {title}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-zinc-400">{hostname}</div>
        </div>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(e) => { stop(e); open() }}
      onPointerDown={stop}
      className={`mt-1.5 flex w-full max-w-[280px] items-center gap-2.5 overflow-hidden rounded-2xl px-3 py-2.5 text-left touch-manipulation ${
        isMine ? 'bg-blue-600/90' : 'bg-zinc-800/95'
      } ${className}`}
      aria-label={`Open link: ${title}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="line-clamp-2 text-[14px] font-semibold leading-snug text-zinc-100">
          {title}
        </div>
        <div className="truncate text-[12px] text-zinc-400">{hostname}</div>
      </div>
      {preview.favicon_url ? (
        <img
          src={preview.favicon_url}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg bg-zinc-700/80 object-cover"
          loading="lazy"
        />
      ) : null}
    </button>
  )
}
