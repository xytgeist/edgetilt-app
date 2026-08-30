import { useEffect, useState } from 'react'

/** Stable blob URL for a File preview; revokes on change/unmount. */
export function useBlobObjectUrl(file) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    if (!file) {
      return undefined
    }
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    return () => {
      URL.revokeObjectURL(objectUrl)
      setUrl(null)
    }
  }, [file])
  return url
}

/** @param {string} name */
export function ensureWebpFilename(name) {
  const base = String(name || 'image').replace(/\.[^.]+$/, '')
  return base.endsWith('.webp') ? base : `${base}.webp`
}

/**
 * Convert a browser File/Blob to WebP for guide uploads (hero + diagrams).
 * @param {File | Blob} file
 * @param {string} filename
 * @returns {Promise<File>}
 */
export async function prepareGuideImageFile(file, filename) {
  const outName = ensureWebpFilename(filename)
  if (file.type === 'image/webp' && file instanceof File && file.name === outName) {
    return file
  }
  const bmp = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bmp.width
    canvas.height = bmp.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not prepare image canvas.')
    ctx.drawImage(bmp, 0, 0)
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('WebP conversion failed.'))),
        'image/webp',
        0.85,
      )
    })
    return new File([blob], outName, { type: 'image/webp' })
  } finally {
    bmp.close()
  }
}
