/**
 * Cloudflare R2 + Image Resizing helpers for Lounge feed images and Stream posters.
 */
import { mapGenericNetworkErrorMessage } from './loungeVideoUpload.js'

/** Content-addressed R2 keys - match Edge `LOUNGE_CF_R2_OBJECT_CACHE_CONTROL`. */
export const LOUNGE_CF_R2_OBJECT_CACHE_CONTROL = 'public, max-age=31536000, immutable'


/** @typedef {'feed' | 'detail' | 'commentInline' | 'embed' | 'composer' | 'lightbox' | 'poster' | 'og'} LoungeFeedImageDeliveryVariant */

const DELIVERY_WIDTH_BY_VARIANT = {
  feed: 960,
  detail: 1200,
  commentInline: 720,
  embed: 800,
  composer: 640,
  lightbox: 2048,
  poster: 960,
  og: 1200,
}

function loungeCfMediaPublicBaseUrl() {
  return String(import.meta.env.VITE_LOUNGE_CF_MEDIA_PUBLIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
}

export function loungeCfImageResizeEnabled() {
  return String(import.meta.env.VITE_LOUNGE_CF_IMAGE_RESIZE || 'true').trim().toLowerCase() !== 'false'
}

/** True when URL is on the configured R2 public domain. */
export function isLoungeCfR2MediaUrl(url) {
  const u = String(url || '').trim()
  const base = loungeCfMediaPublicBaseUrl()
  if (!u || !base) return false
  try {
    return new URL(u).origin === new URL(base).origin
  } catch {
    return false
  }
}

export function isLoungeSupabaseFeedMediaUrl(url) {
  const s = String(url || '').toLowerCase()
  if (!s) return false
  return s.includes('/storage/v1/object/public/lounge-feed/') || s.includes('/lounge-feed/')
}

export function isLoungeHostedFeedMediaUrl(url) {
  return isLoungeCfR2MediaUrl(url) || isLoungeSupabaseFeedMediaUrl(url)
}

/**
 * Build a delivery URL with optional Cloudflare Image Resizing params.
 * Legacy Supabase and external URLs pass through unchanged.
 */
export function loungeFeedImageDeliveryUrl(storedUrl, variant = 'feed', opts = {}) {
  const url = String(storedUrl || '').trim()
  if (!url) return ''
  if (!isLoungeCfR2MediaUrl(url)) return url

  const width = opts.width ?? DELIVERY_WIDTH_BY_VARIANT[variant] ?? DELIVERY_WIDTH_BY_VARIANT.feed
  if (!loungeCfImageResizeEnabled() || !width) return url

  const quality = opts.quality ?? (variant === 'lightbox' ? 85 : 80)
  const format = opts.format ?? 'auto'

  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/^\//, '')
    if (!path) return url
    if (path.startsWith('cdn-cgi/image/')) return url
    const options = [`width=${width}`, `quality=${quality}`, `format=${format}`].join(',')
    return `${parsed.origin}/cdn-cgi/image/${options}/${path}`
  } catch {
    return url
  }
}

async function messageFromR2InvokeError(error, invokeResponse, functionName, defaultUserMessage) {
  const fallback = String(
    (error && typeof error === 'object' && 'message' in error && error.message) || defaultUserMessage,
  ).trim()
  const ctx = error && typeof error === 'object' ? error.context : null
  const res =
    ctx && typeof ctx === 'object' && typeof ctx.status === 'number'
      ? ctx
      : invokeResponse && typeof invokeResponse.status === 'number'
        ? invokeResponse
        : null
  if (res) {
    try {
      const raw = await res.clone().text()
      if (raw) {
        try {
          const body = JSON.parse(raw)
          if (body?.error) return String(body.error).trim()
        } catch {
          return raw.slice(0, 400)
        }
      }
    } catch {
      // ignore
    }
    if (res.status === 503) {
      return `R2_NOT_CONFIGURED:${functionName}`
    }
    if (res.status === 404) {
      return `Deploy Edge Function \`${functionName}\` on this Supabase project.`
    }
  }
  return mapGenericNetworkErrorMessage(fallback, defaultUserMessage)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ contentType?: string, fileName?: string }} [opts]
 */
export async function requestCfR2DirectUpload(supabaseClient, opts = {}) {
  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) {
    throw new Error('You must be signed in to upload images.')
  }
  const { data, error, response } = await supabaseClient.functions.invoke('lounge-cf-r2-direct-upload', {
    body: {
      contentType: opts.contentType || 'image/jpeg',
      fileName: opts.fileName || '',
    },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromR2InvokeError(
      error,
      response,
      'lounge-cf-r2-direct-upload',
      'Could not start image upload.',
    )
    if (msg.startsWith('R2_NOT_CONFIGURED:')) {
      return { configured: false, data: null, error: null }
    }
    throw new Error(msg)
  }
  if (!data?.uploadURL || !data?.publicUrl) {
    throw new Error('Invalid response from image upload service.')
  }
  return {
    configured: true,
    data: {
      uploadURL: String(data.uploadURL),
      publicUrl: String(data.publicUrl),
      objectKey: String(data.objectKey || ''),
    },
    error: null,
  }
}

/**
 * @param {string} uploadURL
 * @param {File | Blob} file
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function uploadFileToCfR2PresignedUrl(uploadURL, file, opts = {}) {
  const signal = opts.signal
  const res = await fetch(uploadURL, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'Cache-Control': LOUNGE_CF_R2_OBJECT_CACHE_CONTROL,
    },
    body: file,
    signal,
  })
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(
      mapGenericNetworkErrorMessage(
        raw || `Upload failed (${res.status})`,
        'Could not upload your image. Check your connection and try again.',
      ),
    )
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} publicUrl
 */
export async function deleteCfR2ObjectByPublicUrl(supabaseClient, publicUrl) {
  const url = String(publicUrl || '').trim()
  if (!url || !isLoungeCfR2MediaUrl(url)) return { ok: true, skipped: true }
  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) return { ok: false, skipped: true }
  const { error, response } = await supabaseClient.functions.invoke('lounge-cf-r2-delete-object', {
    body: { publicUrl: url },
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (error) {
    const msg = await messageFromR2InvokeError(error, response, 'lounge-cf-r2-delete-object', 'Could not delete image.')
    if (msg.startsWith('R2_NOT_CONFIGURED:')) return { ok: true, skipped: true }
    throw new Error(msg)
  }
  return { ok: true }
}

/** Orphan cleanup after failed post / abandoned upload. */
export async function deleteCfR2OrphanObject(supabaseClient, publicUrl) {
  const url = String(publicUrl || '').trim()
  if (!url || !isLoungeCfR2MediaUrl(url)) return
  const {
    data: { session },
  } = await supabaseClient.auth.getSession()
  if (!session?.access_token) return
  try {
    await supabaseClient.functions.invoke('lounge-cf-r2-delete-orphan', {
      body: { publicUrl: url },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
  } catch {
    // best-effort
  }
}

/**
 * Upload to R2 when configured; returns `{ publicUrl }` or `{ configured: false }`.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{ id: string }} user
 * @param {File} file
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function uploadLoungeFeedPostImageToCfR2(supabaseClient, user, file, opts = {}) {
  const mime = String(file?.type || '').toLowerCase()
  if (!mime.startsWith('image/')) {
    return { data: null, error: new Error('Please choose an image file.'), configured: true }
  }
  const mint = await requestCfR2DirectUpload(supabaseClient, {
    contentType: file.type || 'image/jpeg',
    fileName: file.name || '',
  })
  if (!mint.configured) {
    return { data: null, error: null, configured: false }
  }
  try {
    await uploadFileToCfR2PresignedUrl(mint.data.uploadURL, file, { signal: opts.signal })
    return { data: mint.data.publicUrl, error: null, configured: true }
  } catch (e) {
    if (mint.data?.publicUrl) {
      void deleteCfR2OrphanObject(supabaseClient, mint.data.publicUrl)
    }
    const msg = mapGenericNetworkErrorMessage(
      e instanceof Error ? e.message : String(e),
      'Could not upload your image. Check your connection and try again.',
    )
    return { data: null, error: new Error(msg), configured: true }
  }
}
