/**
 * Legacy: re-encode as JPEG until under `maxBytes` (white matte; loses PNG alpha).
 * Prefer {@link prepareAvatarImageForUpload} for profile photos.
 *
 * @param {File} file
 * @param {number} [maxBytes]
 * @returns {Promise<{ file: File, error: null } | { file: null, error: Error }>}
 */
export async function compressImageFileUnderMaxBytes(file, maxBytes = 5 * 1024 * 1024) {
  if (!file || typeof file !== 'object') {
    return { file: null, error: new Error('No file selected.') }
  }
  const mime = String(file.type || '').toLowerCase()
  if (!mime.startsWith('image/')) {
    return { file: null, error: new Error('Please choose an image file.') }
  }
  if (file.size <= maxBytes) {
    return { file, error: null }
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { file: null, error: new Error('Could not read this image.') }
  }

  const targetBytes = Math.floor(maxBytes * 0.92)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close?.()
    return { file: null, error: new Error('Could not compress image in this browser.') }
  }

  const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
  const maxSide = Math.max(bitmap.width, bitmap.height, 1)
  let scale = Math.min(1, 2048 / maxSide)
  let quality = 0.88
  const minSide = 96

  try {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const w = Math.max(1, Math.floor(bitmap.width * scale))
      const h = Math.max(1, Math.floor(bitmap.height * scale))
      if (Math.min(w, h) < minSide) {
        return { file: null, error: new Error('Could not shrink this image enough. Try another photo.') }
      }

      canvas.width = w
      canvas.height = h
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)

      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      })
      if (!blob) {
        return { file: null, error: new Error('Could not compress image.') }
      }
      if (blob.size <= targetBytes) {
        const out = new File([blob], `${baseName}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        })
        return { file: out, error: null }
      }

      if (quality > 0.38) {
        quality -= 0.06
      } else {
        quality = 0.8
        scale *= 0.8
      }
    }
    return { file: null, error: new Error('Could not compress image enough. Try a smaller photo.') }
  } finally {
    bitmap.close?.()
  }
}

/** Longer side cap for lounge feed photo uploads (pixels). */
const LOUNGE_FEED_IMAGE_MAX_LONG_EDGE = 2048
/** WebP quality for lounge feed uploads (0–1). */
const LOUNGE_FEED_WEBP_QUALITY = 0.8
/** Soft cap for encoded lounge image size before further downscaling. */
const LOUNGE_FEED_IMAGE_MAX_BYTES = 4 * 1024 * 1024

/** Profile avatar: longest side cap (square-ish display in UI). */
const AVATAR_IMAGE_MAX_LONG_EDGE = 512
/** WebP quality for avatar uploads (0–1). */
const AVATAR_WEBP_QUALITY = 0.82
/** Target max encoded size for avatars before further downscaling. */
const AVATAR_IMAGE_MAX_BYTES = 700 * 1024

/**
 * Formats that may carry an alpha channel; do not flatten to white or re-encode as JPEG-only.
 * @param {File} file
 */
function imageFileMayHaveTransparency(file) {
  const mime = String(file?.type || '').toLowerCase()
  if (mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif' || mime === 'image/avif') {
    return true
  }
  const ext = String(file?.name?.split('.').pop() || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (!mime || mime === 'application/octet-stream') {
    return ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'avif'
  }
  return false
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    if (quality != null) {
      canvas.toBlob((b) => resolve(b), type, quality)
    } else {
      canvas.toBlob((b) => resolve(b), type)
    }
  })
}

/**
 * Heuristic: treat as image for file-picker validation when MIME is missing or generic.
 * SVG excluded (not safely rasterized here).
 * @param {File} file
 */
export function isProbablyImageFile(file) {
  if (!file || typeof file !== 'object') return false
  const mime = String(file.type || '').toLowerCase()
  if (mime.startsWith('image/')) {
    if (mime === 'image/svg+xml') return false
    return true
  }
  const ext = String(file.name?.split('.').pop() || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (!ext || ext === 'svg') return false
  return /^(jpe?g|pjpeg|png|gif|webp|heic|heif|bmp|avif|tiff)$/.test(ext)
}

/**
 * @param {File} file
 */
export function isProbablyVideoFile(file) {
  if (!file || typeof file !== 'object') return false
  const mime = String(file.type || '').toLowerCase()
  if (mime.startsWith('video/')) return true
  const ext = String(file.name?.split('.').pop() || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  return /^(mp4|webm|mov|m4v|mkv|avi)$/.test(ext)
}

/**
 * Shared decode → resize → encode (WebP preferred; PNG or JPEG fallbacks).
 * @param {File} file
 * @param {{
 *   maxLongEdge: number
 *   maxBytes: number
 *   webpQuality: number
 *   minShortSide: number
 *   readErrorMessage: string
 * }} opts
 * @returns {Promise<{ file: File, error: null } | { file: null, error: Error }>}
 */
async function prepareRasterImageForUpload(file, opts) {
  const { maxLongEdge, maxBytes, webpQuality, minShortSide, readErrorMessage } = opts

  const preserveTransparency = imageFileMayHaveTransparency(file)

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { file: null, error: new Error(readErrorMessage) }
  }

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { alpha: true })
  if (!ctx) {
    bitmap.close?.()
    return { file: null, error: new Error('Could not process image in this browser.') }
  }

  const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '') || 'image'
  let scale = Math.min(1, maxLongEdge / Math.max(bitmap.width, bitmap.height, 1))

  try {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const w = Math.max(1, Math.floor(bitmap.width * scale))
      const h = Math.max(1, Math.floor(bitmap.height * scale))
      if (Math.min(w, h) < minShortSide) {
        return { file: null, error: new Error('Could not shrink this image enough. Try another photo.') }
      }

      canvas.width = w
      canvas.height = h
      if (preserveTransparency) {
        ctx.clearRect(0, 0, w, h)
      } else {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
      }
      ctx.drawImage(bitmap, 0, 0, w, h)

      if (preserveTransparency) {
        let blob = await canvasToBlob(canvas, 'image/webp', webpQuality)
        if (blob && blob.size >= 32 && blob.size <= maxBytes) {
          return {
            file: new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() }),
            error: null,
          }
        }
        if (!blob || blob.size < 32) {
          blob = await canvasToBlob(canvas, 'image/png')
        }
        if (blob && blob.size <= maxBytes) {
          return {
            file: new File([blob], `${baseName}.png`, { type: 'image/png', lastModified: Date.now() }),
            error: null,
          }
        }
        if (!blob) {
          return { file: null, error: new Error('Could not encode this image with transparency in this browser.') }
        }
      } else {
        let blob = await canvasToBlob(canvas, 'image/webp', webpQuality)
        let usedWebp = true
        if (!blob || blob.size < 32) {
          usedWebp = false
          blob = await canvasToBlob(canvas, 'image/jpeg', 0.85)
        }
        if (!blob) {
          return { file: null, error: new Error('Could not encode image.') }
        }
        if (blob.size <= maxBytes) {
          const out = usedWebp
            ? new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() })
            : new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
          return { file: out, error: null }
        }
      }

      scale *= 0.87
    }
    return { file: null, error: new Error('Could not compress image enough. Try a smaller photo.') }
  } finally {
    bitmap.close?.()
  }
}

/**
 * Decode, downscale if needed, encode as WebP (or JPEG when alpha is not needed).
 * PNG/WebP/GIF/AVIF: transparent canvas + WebP (alpha) or PNG fallback - never flatten to white or JPEG-only.
 * JPEG-like sources: white matte then WebP/JPEG as before. Used for lounge feed / quote repost uploads.
 *
 * @param {File} file
 * @returns {Promise<{ file: File, error: null } | { file: null, error: Error }>}
 */
export async function prepareLoungeFeedImageForUpload(file) {
  if (!file || typeof file !== 'object') {
    return { file: null, error: new Error('No file selected.') }
  }
  if (!isProbablyImageFile(file)) {
    return { file: null, error: new Error('Please choose an image file.') }
  }
  return prepareRasterImageForUpload(file, {
    maxLongEdge: LOUNGE_FEED_IMAGE_MAX_LONG_EDGE,
    maxBytes: LOUNGE_FEED_IMAGE_MAX_BYTES,
    webpQuality: LOUNGE_FEED_WEBP_QUALITY,
    minShortSide: 48,
    readErrorMessage: 'Could not read this image. Try JPEG or PNG if this format is not supported here.',
  })
}

/**
 * Profile avatar: max 512px long edge, WebP (or PNG with alpha / JPEG fallback), size-capped like lounge uploads.
 *
 * @param {File} file
 * @returns {Promise<{ file: File, error: null } | { file: null, error: Error }>}
 */
export async function prepareAvatarImageForUpload(file) {
  if (!file || typeof file !== 'object') {
    return { file: null, error: new Error('No file selected.') }
  }
  if (!isProbablyImageFile(file)) {
    return { file: null, error: new Error('Please choose an image file.') }
  }
  return prepareRasterImageForUpload(file, {
    maxLongEdge: AVATAR_IMAGE_MAX_LONG_EDGE,
    maxBytes: AVATAR_IMAGE_MAX_BYTES,
    webpQuality: AVATAR_WEBP_QUALITY,
    minShortSide: 16,
    readErrorMessage: 'Could not read this image. Try JPEG or PNG if this format is not supported here.',
  })
}
