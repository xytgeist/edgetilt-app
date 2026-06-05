import {
  isLoungePostShareId,
  isLoungeProfileHandleSlug,
  parseLoungeProfilePathHandle,
} from '../../utils/loungeSharePost.js'
import { trimUrlTrail } from './loungeCaption.jsx'

/** Parse a Lounge post id from share URLs (`/lounge/p/:id`, `?post=…`). */
export function parseLoungePostIdFromUrl(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://lvslotpro.com')
    const pathM = u.pathname.match(/\/lounge\/p\/([0-9a-f-]{36})/i)
    if (pathM && isLoungePostShareId(pathM[1])) return pathM[1]
    const q = (u.searchParams.get('post') || '').trim()
    if (isLoungePostShareId(q)) return q
  } catch {
    /* */
  }
  return null
}

/** Parse a profile handle from `/u/:handle` or `?u=@handle`. */
export function parseLoungeProfileHandleFromUrl(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://lvslotpro.com')
    const fromPath = parseLoungeProfilePathHandle(u.pathname)
    if (fromPath) return fromPath
    const q = (u.searchParams.get('u') || '').trim().replace(/^@/, '').toLowerCase()
    if (isLoungeProfileHandleSlug(q)) return q
  } catch {
    /* */
  }
  return null
}

/** Parse AP Guide slug from `/guides/:slug/…` paths. */
export function parseGuideSlugFromUrl(url) {
  try {
    const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://lvslotpro.com')
    const m = u.pathname.match(/\/guides\/([a-z0-9-]+)/i)
    if (m?.[1]) return m[1].toLowerCase()
  } catch {
    /* */
  }
  return null
}

/** Normalize bare domains to https for external open. */
export function hrefForExternalOpen(display) {
  const d = trimUrlTrail(String(display || '').trim())
  if (!d) return ''
  if (/^https?:\/\//iu.test(d)) return d
  if (/^www\./iu.test(d)) return `https://${d}`
  if (/\./.test(d)) return `https://${d}`
  return d
}
