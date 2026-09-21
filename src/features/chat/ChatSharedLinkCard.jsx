import { useState } from 'react'
import { openExternalUrl } from '../../utils/edgeNative.js'

/**
 * iMessage-style shared link row for group info → Links / Docs tabs.
 *
 * @param {{
 *   url: string,
 *   linkPreview?: Record<string, unknown> | null,
 *   bodyPreview?: string | null,
 *   onOpenUrl?: () => void,
 *   onViewMessage: () => void,
 * }} props
 */
export default function ChatSharedLinkCard({
  url,
  linkPreview = null,
  bodyPreview = null,
  onOpenUrl,
  onViewMessage,
}) {
  const preview = linkPreview && typeof linkPreview === 'object' ? linkPreview : null
  const href = String(preview?.url || url || '').trim()
  const [thumbFailed, setThumbFailed] = useState(false)

  let domain = String(preview?.site_name || '').trim()
  try {
    const u = new URL(href)
    domain = u.hostname
  } catch {
    if (!domain) domain = href.replace(/^https?:\/\//i, '').split('/')[0] || href
  }

  const title = String(preview?.title || href).trim() || 'Link'
  const description = String(preview?.description || '').trim()
  const thumbUrl = !thumbFailed ? String(preview?.image_url || preview?.favicon_url || '').trim() : ''

  const openUrl = () => {
    if (onOpenUrl) {
      onOpenUrl()
      return
    }
    if (!href) return
    void openExternalUrl(href)
  }

  const footerText = bodyPreview?.trim() || 'View message'

  return (
    <div className="overflow-hidden rounded-xl bg-zinc-900/95">
      <button
        type="button"
        onClick={openUrl}
        className="flex w-full gap-3 p-3 text-left touch-manipulation active:bg-zinc-800/70"
        aria-label={`Open link: ${title}`}
      >
        <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-zinc-800">
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <polygon points="16 8 14.5 14 8 16 9.5 10 16 8" fill="currentColor" stroke="none" opacity="0.85" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1 py-0.5">
          <div className="line-clamp-2 text-[15px] font-semibold leading-snug text-zinc-100">
            {title}
          </div>
          {description ? (
            <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-zinc-400">
              {description}
            </p>
          ) : null}
          <p className={`truncate text-[12px] text-zinc-500 ${description ? 'mt-1' : 'mt-1.5'}`}>
            {domain}
          </p>
        </div>
      </button>
      <div className="border-t border-zinc-700/55">
        <button
          type="button"
          onClick={onViewMessage}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left touch-manipulation active:bg-zinc-800/60"
        >
          <span className="min-w-0 flex-1 line-clamp-3 text-[13px] leading-snug text-zinc-400">
            {footerText}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="shrink-0 text-zinc-500"
            aria-hidden
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/**
 * @param {string} iso
 */
export function monthGroupLabel(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  const now = new Date()
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('en-US', { month: 'long' })
  }
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * @param {any[]} items
 */
export function groupSharedLinksByMonth(items) {
  /** @type {Map<string, { label: string, items: any[] }>} */
  const map = new Map()
  for (const item of items) {
    const d = new Date(item.created_at)
    const key = Number.isNaN(d.getTime())
      ? 'unknown'
      : `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
    const label = monthGroupLabel(item.created_at)
    if (!map.has(key)) map.set(key, { label, items: [] })
    map.get(key).items.push(item)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, group]) => group)
}

/**
 * @param {any} item
 * @param {string} query
 */
export function sharedLinkMatchesQuery(item, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const lp = item.link_preview && typeof item.link_preview === 'object' ? item.link_preview : {}
  const hay = [
    item.url,
    item.body_preview,
    lp.title,
    lp.description,
    lp.site_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}
