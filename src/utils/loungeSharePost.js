/** Matches `AppShell` / feed head select for `community_feed_posts` hydration. */
export const LOUNGE_SINGLE_POST_SELECT =
  'id,caption,game_title,game_slug,category_pills,user_id,created_at,edited_at,pinned,like_count,comment_count,repost_count,repost_of_post_id,repost_of_comment_id,is_plain_repost,repost_target_unavailable,media_url,gif_url,image_urls,stream_video_uid,stream_poster_url,stream_video_width,stream_video_height,is_ap_guide_post,guide_thumbnail_url,link_preview'

/** Standard 8-4-4-4-12 hex UUID string (any version). */
const LOUNGE_POST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Stored profile handle slug (matches `profileGate.normalizeHandle` output). */
const LOUNGE_PROFILE_HANDLE_RE = /^[a-z0-9_]{2,30}$/

export function isLoungePostShareId(value) {
  return typeof value === 'string' && LOUNGE_POST_ID_RE.test(value.trim())
}

export function isLoungeProfileHandleSlug(value) {
  if (typeof value !== 'string') return false
  const h = value.trim().replace(/^@/, '').toLowerCase()
  return LOUNGE_PROFILE_HANDLE_RE.test(h)
}

/** Parse `/u/:handle` from a pathname (case-insensitive; returns lowercase slug). */
export function parseLoungeProfilePathHandle(pathname) {
  if (typeof pathname !== 'string') return ''
  const m = pathname.match(/^\/u\/([a-z0-9_]{2,30})\/?$/i)
  return m ? m[1].toLowerCase() : ''
}

/**
 * Canonical **share** URL for a Lounge post: `/lounge/p/:id` (served by Vercel `api/lounge-post-og.js`
 * with Open Graph meta for iMessage / Slack / etc.). Humans are redirected to `/?tab=home&post=…`.
 */
export function buildLoungePostShareUrl(postId) {
  if (typeof window === 'undefined' || !postId) return ''
  const u = new URL(window.location.href)
  u.pathname = `/lounge/p/${encodeURIComponent(String(postId))}`
  u.search = ''
  u.hash = ''
  return u.toString()
}

/**
 * Share link for a Lounge profile: `/u/:handle` (OG via `api/lounge-profile-og.js`).
 * Accepts a profile row `{ handle, user_id }`, a handle string, or legacy UUID (query fallback).
 */
export function buildLoungeProfileShareUrl(profileOrHandleOrUserId) {
  if (typeof window === 'undefined' || profileOrHandleOrUserId == null) return ''
  const u = new URL(window.location.href)

  let handle = ''
  let userId = ''
  if (typeof profileOrHandleOrUserId === 'string') {
    const raw = profileOrHandleOrUserId.trim()
    if (isLoungeProfileHandleSlug(raw)) {
      handle = raw.replace(/^@/, '').toLowerCase()
    } else if (isLoungePostShareId(raw)) {
      userId = raw
    }
  } else if (typeof profileOrHandleOrUserId === 'object') {
    handle = String(profileOrHandleOrUserId.handle || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase()
    userId = String(profileOrHandleOrUserId.user_id || '').trim()
  }

  if (isLoungeProfileHandleSlug(handle)) {
    u.pathname = `/u/${encodeURIComponent(handle)}`
    u.search = ''
    u.hash = ''
    return u.toString()
  }

  if (isLoungePostShareId(userId)) {
    if (!u.searchParams.has('tab')) u.searchParams.set('tab', 'home')
    u.pathname = '/'
    u.searchParams.set('profile', userId)
    u.hash = ''
    return u.toString()
  }

  return ''
}

export function stripLoungePostQueryParam() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  if (!u.searchParams.has('post')) return
  u.searchParams.delete('post')
  const qs = u.searchParams.toString()
  const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`
  window.history.replaceState(window.history.state ?? {}, '', next)
}

/** Remove profile deep-link markers from the URL after the sheet opens. */
export function stripLoungeProfileShareFromUrl() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  let changed = false
  if (parseLoungeProfilePathHandle(u.pathname)) {
    u.pathname = '/'
    changed = true
  }
  for (const key of ['u', 'profile']) {
    if (u.searchParams.has(key)) {
      u.searchParams.delete(key)
      changed = true
    }
  }
  if (!changed) return
  const qs = u.searchParams.toString()
  const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`
  window.history.replaceState(window.history.state ?? {}, '', next)
}

/** Remove `lounge=` dock panel deep link after the panel opens. */
export function stripLoungeDockQueryParam() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  if (!u.searchParams.has('lounge')) return
  u.searchParams.delete('lounge')
  const qs = u.searchParams.toString()
  const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`
  window.history.replaceState(window.history.state ?? {}, '', next)
}

/** Remove push mark-read deep link params after the client handles them. */
export function stripLoungeActivityPushQueryParams() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  let changed = false
  for (const key of ['activityEvent', 'activityBatch']) {
    if (u.searchParams.has(key)) {
      u.searchParams.delete(key)
      changed = true
    }
  }
  if (!changed) return
  const qs = u.searchParams.toString()
  const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`
  window.history.replaceState(window.history.state ?? {}, '', next)
}

/**
 * Prefer `navigator.share` when allowed; otherwise copy `url` to the clipboard.
 * User cancel / dismiss of the native sheet → `AbortError` → no `onCopied` / `onCopyFailed`.
 */
export async function shareLoungePostHybrid({ url, title, text, onCopied, onCopyFailed }) {
  if (!url) {
    onCopyFailed?.()
    return { mode: 'failed' }
  }
  const shareData = { url, title: title || 'Lounge post' }
  const t = typeof text === 'string' ? text.trim() : ''
  if (t) shareData.text = t
  const nav = typeof navigator !== 'undefined' ? navigator : null
  if (nav?.share) {
    const allowed = typeof nav.canShare !== 'function' ? true : nav.canShare(shareData)
    if (allowed) {
      try {
        await nav.share(shareData)
        return { mode: 'native' }
      } catch (e) {
        if (e && typeof e === 'object' && e.name === 'AbortError') {
          return { mode: 'aborted' }
        }
      }
    }
  }
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(url)
      onCopied?.()
      return { mode: 'copy' }
    }
  } catch {
    // fall through
  }
  onCopyFailed?.()
  return { mode: 'failed' }
}
