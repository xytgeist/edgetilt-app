/**
 * Client-side W-2G scan: load photo → detect page → safe crop → light enhance → pad.
 * Prefer axis-aligned crop over homography on wrinkled slips (homography was melting forms).
 */

/** @typedef {import('scanic').CornerPoints} CornerPoints */
/** @typedef {import('scanic').ScannerResult} ScannerResult */

const DETECT_BASE = {
  mode: 'detect',
  output: 'canvas',
  maxProcessingDimension: 1800,
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
 * @param {'classical' | 'ml'} detector
 */
async function detectCorners(source, detector) {
  const { scanDocument } = await import('scanic')
  return scanDocument(source, {
    ...DETECT_BASE,
    detector,
  })
}

/**
 * @param {HTMLCanvasElement} source
 * @returns {Promise<{
 *   result: ScannerResult,
 *   detector: 'classical' | 'ml' | null,
 *   cropMode: 'bounds' | 'perspective' | null,
 * }>}
 */
export async function autoScanDocument(source) {
  const { extractDocument } = await import('scanic')
  const { analyzeCorners, isValidCornerQuad, axisAlignedCropFromCorners } = await import('./w2gCorners.js')

  /** @type {ScannerResult | null} */
  let best = null
  /** @type {'classical' | 'ml' | null} */
  let bestDetector = null
  /** @type {ReturnType<typeof analyzeCorners> | null} */
  let bestAnalysis = null

  for (const detector of /** @type {const} */ (['classical', 'ml'])) {
    try {
      const detected = await detectCorners(source, detector)
      if (!isValidCornerQuad(detected?.corners)) continue
      const analysis = analyzeCorners(detected.corners, source.width, source.height)
      if (!bestAnalysis || analysis.score > bestAnalysis.score) {
        best = detected
        bestDetector = detector
        bestAnalysis = analysis
      }
      // Strong classical hit — skip ML wait.
      if (detector === 'classical' && analysis.usable && analysis.score >= 0.92) break
    } catch {
      // ML CDN / classical miss — try next.
    }
  }

  // No valid page quad → caller opens manual corner editor.
  if (!best?.corners || !isValidCornerQuad(best.corners) || !bestAnalysis?.usable) {
    return {
      result: {
        success: false,
        message: 'No document found',
        output: null,
        corners: best?.corners && isValidCornerQuad(best.corners) ? best.corners : null,
        confidence: best?.confidence ?? null,
        contour: best?.contour ?? null,
        debug: null,
        timings: best?.timings || [],
      },
      detector: bestDetector,
      cropMode: null,
    }
  }

  // Perspective only when the page looks flat + clearly trapezoidal.
  if (bestAnalysis.preferPerspective) {
    try {
      const extracted = await extractDocument(source, best.corners, { output: 'canvas' })
      if (extracted?.success && extracted.output) {
        return {
          result: {
            ...extracted,
            corners: best.corners,
            confidence: best.confidence ?? bestAnalysis.score,
          },
          detector: bestDetector,
          cropMode: 'perspective',
        }
      }
    } catch {
      // fall through to bounds crop
    }
  }

  // Default: auto AABB crop from detected corners (no manual step).
  const cropped = axisAlignedCropFromCorners(source, best.corners)
  return {
    result: {
      success: true,
      message: 'Bounds crop',
      output: cropped,
      corners: best.corners,
      confidence: best.confidence ?? bestAnalysis.score,
      contour: best.contour ?? null,
      debug: null,
      timings: best.timings || [],
    },
    detector: bestDetector,
    cropMode: 'bounds',
  }
}

/**
 * Manual corners: prefer gentle bounds crop (avoids crease melt). Use perspective only if clean.
 * @param {HTMLCanvasElement} source
 * @param {CornerPoints} corners
 * @returns {Promise<{ result: ScannerResult, cropMode: 'bounds' | 'perspective' }>}
 */
export async function extractWithCorners(source, corners) {
  const { extractDocument } = await import('scanic')
  const { analyzeCorners, isValidCornerQuad, axisAlignedCropFromCorners } = await import('./w2gCorners.js')

  if (!isValidCornerQuad(corners)) {
    return {
      result: {
        success: false,
        message: 'Invalid corners',
        output: null,
        corners,
        confidence: null,
        contour: null,
        debug: null,
        timings: [],
      },
      cropMode: 'bounds',
    }
  }

  const analysis = analyzeCorners(corners, source.width, source.height)
  if (analysis.preferPerspective) {
    try {
      const extracted = await extractDocument(source, corners, { output: 'canvas' })
      if (extracted?.success && extracted.output) {
        return { result: extracted, cropMode: 'perspective' }
      }
    } catch {
      /* bounds fallback */
    }
  }

  const cropped = axisAlignedCropFromCorners(source, corners)
  return {
    result: {
      success: true,
      message: 'Bounds crop',
      output: cropped,
      corners,
      confidence: analysis.score,
      contour: null,
      debug: null,
      timings: [],
    },
    cropMode: 'bounds',
  }
}

/**
 * Light enhance after crop (no harsh flatten).
 * @param {HTMLCanvasElement} cropped
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function flattenCroppedDocument(cropped) {
  const { prepareFlattenedW2G } = await import('./w2gFlatten.js')
  return prepareFlattenedW2G(cropped)
}

/**
 * Place a cropped form on a clean white matte, centered with even padding.
 * @param {HTMLCanvasElement | HTMLImageElement} doc
 * @param {{ padRatio?: number, bg?: string, maxEdge?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function presentPrettyScan(doc, opts = {}) {
  const padRatio = opts.padRatio ?? 0.04
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

  const pad = Math.max(10, Math.round(Math.max(drawW, drawH) * padRatio))
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
 * @param {number} width
 * @param {number} height
 * @param {number} [insetRatio]
 * @returns {CornerPoints}
 */
export function defaultInsetCorners(width, height, insetRatio = 0.06) {
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
