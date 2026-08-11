/**
 * Light post-crop prep for W-2G.
 * Intentionally NOT doing illumination-division / hard binarize — that hollowed text and wrecked OCR.
 */

/**
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement}
 */
export function ensureLandscapeDocument(source) {
  if (!(source?.width > 0 && source?.height > 0)) return source
  if (source.width >= source.height) return source

  const out = document.createElement('canvas')
  out.width = source.height
  out.height = source.width
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.translate(out.width, 0)
  ctx.rotate(Math.PI / 2)
  ctx.drawImage(source, 0, 0)
  return out
}

/**
 * Gentle readability bump only (keeps color, avoids halo/ghost artifacts).
 * @param {HTMLCanvasElement} source
 * @returns {HTMLCanvasElement}
 */
export function enhanceDocumentGently(source) {
  const w = source.width
  const h = source.height
  if (!(w > 0 && h > 0)) return source

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Mild: lift midtones a hair, tiny contrast. No blur-division.
  ctx.filter = 'contrast(1.06) brightness(1.03) saturate(0.92)'
  ctx.drawImage(source, 0, 0)
  ctx.filter = 'none'
  return out
}

/**
 * @param {HTMLCanvasElement} cropped
 * @returns {HTMLCanvasElement}
 */
export function prepareFlattenedW2G(cropped) {
  return enhanceDocumentGently(ensureLandscapeDocument(cropped))
}
