import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRAILING_PUNCT_RE = /[.,;:!?)'\]}>]+$/
const URL_RE =
  /(?:https?:\/\/|www\.)[\w\-.~:/?#[\]@!$&'()*+,;=%]+|\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?::\d{1,5})?(?:\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?/gi
const MAX_HTML_BYTES = 512_000
const FETCH_TIMEOUT_MS = 8000

export type LinkPreviewPayload = {
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  favicon_url: string | null
  site_name: string | null
  layout: 'rich' | 'compact'
  lounge_post_id: string | null
  /** Brand tint for compact link pills (theme-color, domain map, or client favicon sample). */
  accent_color: string | null
  /** Inline embed hint for clients (e.g. YouTube). */
  embed_kind?: 'youtube' | null
  youtube_video_id?: string | null
}

const DOMAIN_ACCENT: Record<string, string> = {
  'google.com': '#b2402e',
  'facebook.com': '#1877f2',
  'fb.com': '#1877f2',
  'instagram.com': '#e4405f',
  'x.com': '#000000',
  'twitter.com': '#1d9bf0',
  'youtube.com': '#ff0000',
  'reddit.com': '#ff4500',
  'linkedin.com': '#0a66c2',
  'tiktok.com': '#010101',
  'amazon.com': '#ff9900',
  'kalshi.com': '#00c389',
}

function trimTrailingPunct(raw: string) {
  return raw.replace(TRAILING_PUNCT_RE, '')
}

/** Decode common HTML entities so scraped OG text renders as plain text. */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function isEmailLocalPart(text: string, index: number) {
  if (index <= 0) return false
  const at = text.lastIndexOf('@', index - 1)
  if (at < 0) return false
  return /^[a-zA-Z0-9._-]*$/.test(text.slice(at + 1, index))
}

export function extractFirstUrlFromText(text: string): string | null {
  const s = String(text || '')
  if (!s.trim()) return null
  const re = new RegExp(URL_RE.source, URL_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    if (isEmailLocalPart(s, m.index)) continue
    const raw = trimTrailingPunct(m[0])
    let href = raw
    if (/^www\./i.test(href)) href = `https://${href}`
    else if (!/^https?:\/\//i.test(href)) href = `https://${href}`
    try {
      const u = new URL(href)
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.href
    } catch {
      /* skip */
    }
  }
  return null
}

function normalizeUrlKey(url: string) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href
  } catch {
    return url
  }
}

function faviconForHost(hostname: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  if (!h || h === 'localhost' || h.endsWith('.local')) return true
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true
  if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  const m = h.match(/^\[([0-9a-f:]+)\]$/) || h.match(/^([0-9.]+)$/)
  if (m) {
    const ip = m[1]
    if (ip.startsWith('fc') || ip.startsWith('fd') || ip === '::1') return true
  }
  return false
}

function hostnameDomainKey(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, '')
  const parts = h.split('.').filter(Boolean)
  if (parts.length >= 2) return parts.slice(-2).join('.')
  return h
}

const YT_ID_RE = /^[\w-]{11}$/

function parseYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./i, '').toLowerCase()
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0]?.split('?')[0]
      return id && YT_ID_RE.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const fromWatch = u.searchParams.get('v')
      if (fromWatch && YT_ID_RE.test(fromWatch)) return fromWatch
      for (const re of [/^\/shorts\/([\w-]{11})/, /^\/embed\/([\w-]{11})/, /^\/live\/([\w-]{11})/, /^\/v\/([\w-]{11})/]) {
        const m = u.pathname.match(re)
        if (m?.[1] && YT_ID_RE.test(m[1])) return m[1]
      }
    }
  } catch {
    /* */
  }
  return null
}

function withYouTubeEmbedFields(preview: LinkPreviewPayload): LinkPreviewPayload {
  const videoId = parseYouTubeVideoId(preview.url)
  if (!videoId) return preview
  return {
    ...preview,
    embed_kind: 'youtube',
    youtube_video_id: videoId,
    site_name: preview.site_name || 'YouTube',
    layout: preview.image_url ? 'rich' : preview.layout,
  }
}

function normalizeAccentHex(raw: string): string | null {
  const s = String(raw || '').trim()
  if (!s) return null
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const h = s.slice(1)
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase()
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
  if (/^#[0-9a-f]{8}$/i.test(s)) return s.slice(0, 7).toLowerCase()
  const rgb = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgb) {
    const clamp = (n: number) => Math.max(0, Math.min(255, n))
    const hex = (n: number) => clamp(n).toString(16).padStart(2, '0')
    return `#${hex(Number(rgb[1]))}${hex(Number(rgb[2]))}${hex(Number(rgb[3]))}`
  }
  return null
}

function themeColorFromHtml(html: string): string | null {
  const raw =
    metaContent(html, 'theme-color', 'name') ||
    metaContent(html, 'msapplication-TileColor', 'name')
  return normalizeAccentHex(raw)
}

function accentForHost(hostname: string, html: string): string | null {
  return themeColorFromHtml(html) || DOMAIN_ACCENT[hostnameDomainKey(hostname)] || null
}

function metaContent(html: string, key: string, attr: 'property' | 'name' = 'property'): string {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`,
    'i',
  )
  const m = html.match(re)
  return (m?.[1] || m?.[2] || '').trim()
}

function titleFromHtml(html: string): string {
  const og = metaContent(html, 'og:title') || metaContent(html, 'twitter:title', 'name')
  if (og) return og
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m?.[1]?.trim() || ''
}

function resolveMaybeRelative(base: string, raw: string): string {
  const r = String(raw || '').trim()
  if (!r) return ''
  try {
    return new URL(r, base).href
  } catch {
    return ''
  }
}

function parseLoungePostId(url: string): string | null {
  try {
    const u = new URL(url)
    const pathM = u.pathname.match(/\/lounge\/p\/([0-9a-f-]{36})/i)
    if (pathM && UUID_RE.test(pathM[1])) return pathM[1]
    const q = u.searchParams.get('post') || ''
    if (UUID_RE.test(q)) return q
  } catch {
    /* */
  }
  return null
}

function pickPostImage(post: Record<string, unknown>): string {
  for (const key of ['stream_poster_url', 'media_url', 'gif_url']) {
    const u = String(post[key] || '').trim()
    if (/^https?:\/\//i.test(u)) return u
  }
  let urls = post.image_urls
  if (typeof urls === 'string') {
    try {
      urls = JSON.parse(urls)
    } catch {
      urls = null
    }
  }
  if (Array.isArray(urls)) {
    for (const item of urls) {
      const u = String(item || '').trim()
      if (/^https?:\/\//i.test(u)) return u
    }
  }
  return ''
}

async function fetchLoungePostPreview(
  admin: SupabaseClient,
  postId: string,
  canonicalUrl: string,
): Promise<LinkPreviewPayload | null> {
  const { data: post, error } = await admin
    .from('community_feed_posts')
    .select('id,caption,user_id,like_count,comment_count,stream_poster_url,media_url,image_urls,gif_url')
    .eq('id', postId)
    .maybeSingle()
  if (error || !post) return null

  const { data: prof } = await admin
    .from('profiles')
    .select('display_name,handle,is_og')
    .eq('user_id', post.user_id)
    .maybeSingle()

  const displayName = String(prof?.display_name || prof?.handle || 'Member').trim()
  const handle = prof?.handle ? `@${prof.handle}` : ''
  const caption = String(post.caption || '').trim()
  const snippet = caption.length > 120 ? `${caption.slice(0, 119)}…` : caption
  const title = snippet
    ? `${displayName}${handle ? ` (${handle})` : ''} on Edge · ${snippet}`
    : `${displayName} on Edge`
  const image = pickPostImage(post as Record<string, unknown>)

  let hostname = 'Edge'
  try {
    hostname = new URL(canonicalUrl).hostname.replace(/^www\./i, '')
  } catch {
    /* */
  }

  return {
    url: canonicalUrl,
    title: title.slice(0, 380),
    description: 'Open this post in Edge.',
    image_url: image || null,
    favicon_url: faviconForHost(hostname),
    site_name: hostname,
    layout: image ? 'rich' : 'compact',
    lounge_post_id: postId,
    accent_color: '#06cefc',
  }
}

async function imageUrlIsReachable(imageUrl: string): Promise<boolean> {
  if (!/^https?:\/\//i.test(imageUrl)) return false
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 6000)
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; LVSlotProLinkPreview/1.0)',
    Accept: 'image/*,*/*',
  }
  try {
    let res = await fetch(imageUrl, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow', headers })
    if (res.ok) {
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      if (ct.startsWith('image/')) return true
    }
    res = await fetch(imageUrl, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { ...headers, Range: 'bytes=0-8191' },
    })
    if (!res.ok) return false
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    return ct.startsWith('image/')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function sanitizePreviewImages(preview: LinkPreviewPayload): Promise<LinkPreviewPayload> {
  let p = withYouTubeEmbedFields(preview)
  if (p.layout === 'rich' && p.image_url) {
    const ok = await imageUrlIsReachable(p.image_url)
    if (!ok) p = { ...p, layout: 'compact', image_url: null }
  }
  return p
}

async function fetchHtmlSafe(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LVSlotProLinkPreview/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return ''
    const reader = res.body?.getReader()
    if (!reader) return ''
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        if (total > MAX_HTML_BYTES) break
        chunks.push(value)
      }
    }
    const buf = new Uint8Array(Math.min(total, MAX_HTML_BYTES))
    let off = 0
    for (const c of chunks) {
      const take = Math.min(c.length, buf.length - off)
      if (take <= 0) break
      buf.set(c.subarray(0, take), off)
      off += take
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf)
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

export async function unfurlUrl(
  admin: SupabaseClient,
  rawUrl: string,
): Promise<LinkPreviewPayload | null> {
  const url = extractFirstUrlFromText(rawUrl) || rawUrl
  if (!url) return null
  const key = normalizeUrlKey(url)

  const { data: cached } = await admin
    .from('link_preview_cache')
    .select('preview')
    .eq('url_normalized', key)
    .maybeSingle()
  if (cached?.preview && typeof cached.preview === 'object') {
    return sanitizePreviewImages(cached.preview as LinkPreviewPayload)
  }

  const loungePostId = parseLoungePostId(url)
  if (loungePostId) {
    const lp = await fetchLoungePostPreview(admin, loungePostId, key)
    if (lp) {
      await admin.from('link_preview_cache').upsert({
        url_normalized: key,
        preview: lp,
        fetched_at: new Date().toISOString(),
      })
      return lp
    }
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (isPrivateOrBlockedHost(parsed.hostname)) return null

  const html = await fetchHtmlSafe(parsed.href)
  const title = decodeHtmlEntities(titleFromHtml(html) || parsed.hostname)
  const description = (() => {
    const raw = metaContent(html, 'og:description') || metaContent(html, 'description', 'name')
    return raw ? decodeHtmlEntities(raw) : null
  })()
  const imageRaw =
    metaContent(html, 'og:image') ||
    metaContent(html, 'twitter:image', 'name') ||
    metaContent(html, 'twitter:image:src', 'name')
  const imageCandidate = resolveMaybeRelative(parsed.href, imageRaw) || null
  const image_url =
    imageCandidate && (await imageUrlIsReachable(imageCandidate)) ? imageCandidate : null
  const site_name = decodeHtmlEntities(
    metaContent(html, 'og:site_name') || parsed.hostname.replace(/^www\./i, ''),
  )

  const preview = await sanitizePreviewImages(
    withYouTubeEmbedFields({
      url: key,
      title: title.slice(0, 380) || null,
      description: description ? description.slice(0, 500) : null,
      image_url,
      favicon_url: faviconForHost(parsed.hostname),
      site_name,
      layout: image_url ? 'rich' : 'compact',
      lounge_post_id: null,
      accent_color: accentForHost(parsed.hostname, html),
    }),
  )

  await admin.from('link_preview_cache').upsert({
    url_normalized: key,
    preview,
    fetched_at: new Date().toISOString(),
  })

  return preview
}

export async function attachLinkPreviewToEntity(
  admin: SupabaseClient,
  entityType: 'chat_message' | 'feed_post' | 'feed_comment',
  entityId: string,
  text: string,
  requesterId: string,
): Promise<LinkPreviewPayload | null> {
  const url = extractFirstUrlFromText(text)
  if (!url) return null

  const preview = await unfurlUrl(admin, url)
  if (!preview) return null

  if (entityType === 'chat_message') {
    const { data: msg } = await admin
      .from('chat_messages')
      .select('id, room_id, sender_id')
      .eq('id', entityId)
      .maybeSingle()
    if (!msg) return null
    const { data: mem } = await admin
      .from('chat_room_members')
      .select('room_id')
      .eq('room_id', msg.room_id)
      .eq('user_id', requesterId)
      .maybeSingle()
    if (!mem) return null
    await admin.from('chat_messages').update({ link_preview: preview }).eq('id', entityId)
    return preview
  }

  if (entityType === 'feed_post') {
    const { data: post } = await admin
      .from('community_feed_posts')
      .select('id, user_id')
      .eq('id', entityId)
      .maybeSingle()
    if (!post || post.user_id !== requesterId) return null
    await admin.from('community_feed_posts').update({ link_preview: preview }).eq('id', entityId)
    return preview
  }

  if (entityType === 'feed_comment') {
    const { data: c } = await admin
      .from('feed_comments')
      .select('id, user_id')
      .eq('id', entityId)
      .maybeSingle()
    if (!c || c.user_id !== requesterId) return null
    await admin.from('feed_comments').update({ link_preview: preview }).eq('id', entityId)
    return preview
  }

  return null
}
