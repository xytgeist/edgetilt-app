/**
 * Landscape Lounge right pane: external link engagement (no iframe in v1).
 */
export default function LoungeLandscapeExternalLinkPane({ url, title, description, onClose, onOpenExternal }) {
  const href = String(url || '').trim()
  let host = ''
  try {
    host = href ? new URL(href).host.replace(/^www\./, '') : ''
  } catch {
    host = ''
  }

  return (
    <div
      data-lounge-engagement-external-link
      className="flex h-full min-h-0 flex-col bg-zinc-950 text-white"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800/90 px-2 py-2">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 touch-manipulation hover:bg-zinc-800 hover:text-white [-webkit-tap-highlight-color:transparent]"
          aria-label="Close"
        >
          <span className="text-[20px] leading-none" aria-hidden>
            ←
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{title || 'Link'}</p>
          {host ? <p className="truncate text-[11px] text-zinc-500">{host}</p> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6">
        {description ? (
          <p className="text-[14px] leading-relaxed text-zinc-300">{description}</p>
        ) : (
          <p className="text-[14px] leading-relaxed text-zinc-500">
            Open this link in your browser. We do not load arbitrary sites inside Edge.
          </p>
        )}
        <p className="mt-4 break-all text-[12px] text-zinc-500">{href}</p>
        <button
          type="button"
          onClick={() => onOpenExternal?.(href)}
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-zinc-100 px-4 text-[14px] font-semibold text-zinc-950 touch-manipulation active:bg-white"
        >
          Open in browser
        </button>
      </div>
    </div>
  )
}
