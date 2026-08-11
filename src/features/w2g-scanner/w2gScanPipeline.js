/**
 * Client-side W-2G pretty-scan: load photo → detect page → perspective crop → centered pad.
 * Uses scanic (lazy-imported) so the main app bundle stays light.
 */

/** @typedef {import('scanic').CornerPoints} CornerPoints */
/** @typedef {import('scanic').ScannerResult} ScannerResult */

const CLASSICAL_OPTS = {
  mode: 'extract',
  output: 'canvas',
  detector: 'classical',
  maxProcessingDimension: 1600,
}

const ML_OPTS = {
  mode: 'extract',
  output: 'canvas',
  detector: 'ml',
  maxProcessingDimension: 1600,
}

/**
 * @param {File | Blob} file
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function loadImageCanvasFromFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas unavailable')
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close?.()
      return canvas
    } catch {
      // fall through to Image()
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not read that photo'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || img.width
    canvas.height = img.naturalHeight || img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * @param {HTMLCanvasElement} source
 * @returns {Promise<{ result: ScannerResult, detector: 'classical' | 'ml' | null }>}
 */
export async function autoScanDocument(source) {
  const { scanDocument } = await import('scanic')

  let result = await scanDocument(source, CLASSICAL_OPTS)
  if (result?.success && result.output) {
    return { result, detector: 'classical' }
  }

  try {
    result = await scanDocument(source, ML_OPTS)
    if (result?.success && result.output) {
      return { result, detector: 'ml' }
    }
  } catch {
    // ML CDN / wasm may fail offline; keep classical miss.
  }

  return { result: result || { success: false, message: 'No document found', output: null, corners: null }, detector: null }
}

/**
 * @param {HTMLCanvasElement} source
 * @param {CornerPoints} corners
 * @returns {Promise<ScannerResult>}
 */
export async function extractWithCorners(source, corners) {
  const { extractDocument } = await import('scanic')
  return extractDocument(source, corners, { output: 'canvas' })
}

/**
 * Place a cropped form on a clean white matte, centered with even padding.
 * @param {HTMLCanvasElement | HTMLImageElement} doc
 * @param {{ padRatio?: number, bg?: string, maxEdge?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function presentPrettyScan(doc, opts = {}) {
  const padRatio = opts.padRatio ?? 0.06
  const bg = opts.bg ?? '#ffffff'
  const maxEdge = opts.maxEdge ?? 2400

  const srcW = /** @type {any} */ (doc).width || /** @type {any} */ (doc).naturalWidth
  const srcH = /** @type {any} */ (doc).height || /** @type {any} */ (doc).naturalHeight
  if (!(srcW > 0 && srcH > 0)) {
    throw new Error('Empty scan output')
  }

  let drawW = srcW
  let drawH = srcH
  const longest = Math.max(drawW, drawH)
  if (longest > maxEdge) {
    const scale = maxEdge / longest
    drawW = Math.max(1, Math.round(drawW * scale))
    drawH = Math.max(1, Math.round(drawH * scale))
  }

  const pad = Math.max(12, Math.round(Math.max(drawW, drawH) * padRatio))
  const out = document.createElement('canvas')
  out.width = drawW + pad * 2
  out.height = drawH + pad * 2
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(doc, pad, pad, drawW, drawH)
  return out
}

/**
 * Default inset quad when auto-detect misses (manual adjust).
 * @param {number} width
 * @param {number} height
 * @param {number} [insetRatio]
 * @returns {CornerPoints}
 */
export function defaultInsetCorners(width, height, insetRatio = 0.08) {
  const ix = Math.max(8, width * insetRatio)
  const iy = Math.max(8, height * insetRatio)
  return {
    topLeft: { x: ix, y: iy },
    topRight: { x: width - ix, y: iy },
    bottomRight: { x: width - ix, y: height - iy },
    bottomLeft: { x: ix, y: height - iy },
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename]
 * @returns {Promise<File>}
 */
export async function canvasToPngFile(canvas, filename = `w2g-scan-${Date.now()}.png`) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode PNG'))), 'image/png')
  })
  return new File([blob], filename, { type: 'image/png' })
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} [filename]
 */
export async function downloadScanPng(canvas, filename = `w2g-scan-${Date.now()}.png`) {
  const file = await canvasToPngFile(canvas, filename)
  const url = URL.createObjectURL(file)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<'shared' | 'downloaded'>}
 */
export async function shareOrDownloadScan(canvas) {
  const file = await canvasToPngFile(canvas)
  try {
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'W-2G scan' })
      return 'shared'
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      return 'shared'
    }
  }
  await downloadScanPng(canvas, file.name)
  return 'downloaded'
}
