import { useMemo, useState } from 'react'
import { isLoungeCfR2MediaUrl } from './loungeCfImageMedia.js'

const OUR_MEDIA_HOSTS = new Set(['media.lvslotpro.com', 'media-test.lvslotpro.com'])
/** ESPN headshot masters are 600×436. The combiner is the thumbnail endpoint espn.com itself uses. */
const ESPN_HEADSHOT = /^https:\/\/a\.espncdn\.com(\/i\/headshots\/[^?#]+\.png)$/i
/** Our R2 player masters. Stored webp variants sit beside them (playerHeadshotStore.ts). */
const OUR_PLAYER_MASTER = /^\/sports\/([a-z-]+)\/players\/(?:v2\/)?(\d+)\.(?:png|webp|jpe?g)$/i

function onOurMedia(parsed, src) {
  return OUR_MEDIA_HOSTS.has(parsed.hostname) || isLoungeCfR2MediaUrl(src)
}

/** Stored 192 px thumb (or 512 px card for big portraits) for an R2 player master, else ''. */
function storedVariantUrl(parsed, px) {
  const m = parsed.pathname.match(OUR_PLAYER_MASTER)
  if (!m) return ''
  const kind = px > 256 ? 'card' : 'thumb'
  return `${parsed.origin}/sports/${m[1].toLowerCase()}/players/${kind}/${m[2]}.webp`
}

/**
 * Small delivery URL for a player headshot at `px` pixels wide (already ×3 for retina by the caller).
 * Our R2 copies go through Cloudflare Image Resizing; ESPN masters use ESPN's combiner. Anything else is unchanged.
 */
export function smallHeadshotUrl(url, px = 160) {
  const src = String(url || '').trim()
  if (!src) return ''
  const w = Math.max(48, Math.min(1024, Math.round(Number(px) || 160)))
  let parsed
  try {
    parsed = new URL(src)
  } catch {
    return src
  }
  if (parsed.pathname.startsWith('/cdn-cgi/image/') || parsed.pathname.startsWith('/combiner/')) return src
  if (onOurMedia(parsed, src)) {
    return `${parsed.origin}/cdn-cgi/image/width=${w},quality=75,format=auto/${src}`
  }
  const espn = src.match(ESPN_HEADSHOT)
  if (espn) {
    const h = Math.round((w * 436) / 600)
    return `https://a.espncdn.com/combiner/i?img=${espn[1]}&w=${w}&h=${h}&scale=crop&cquality=60`
  }
  return src
}

/** Ordered light sources for a headshot: stored small copy, then resized, never the heavy master. */
export function headshotSources(url, px = 160) {
  const full = String(url || '').trim()
  if (!full) return []
  let parsed
  try {
    parsed = new URL(full)
  } catch {
    return [full]
  }
  if (onOurMedia(parsed, full)) {
    const stored = storedVariantUrl(parsed, px)
    const resized = smallHeadshotUrl(full, px)
    return [stored, resized].filter(Boolean)
  }
  const small = smallHeadshotUrl(full, px)
  return small ? [small] : [full]
}

/** Stored small copy first, resized second, then `failed` so the caller can show its letter / silhouette. */
export function useHeadshotSrc(url, px = 160) {
  const sources = useMemo(() => headshotSources(url, px), [url, px])
  const key = sources.join('|')
  const [tries, setTries] = useState({ key, attempt: 0 })
  const attempt = tries.key === key ? tries.attempt : 0
  return {
    src: sources[attempt] || '',
    failed: !sources.length || attempt >= sources.length,
    onError: () => setTries((prev) => ({ key, attempt: (prev.key === key ? prev.attempt : 0) + 1 })),
  }
}
