/**
 * Re-encode an image in the browser as JPEG so the result fits under `maxBytes`.
 * Used for avatar uploads with a strict size cap.
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
