/**
 * Post-crop document flatten: landscape normalize + illumination flatten + contrast.
 * Does not remove paper creases (needs 3D); makes the page look flatter and more readable for OCR.
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
 * Normalize uneven lighting and push paper toward white (scanner-style flatten).
 * @param {HTMLCanvasElement} source
 * @param {{ contrast?: number, targetPaper?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function flattenDocumentScan(source, opts = {}) {
  const contrast = opts.contrast ?? 1.32
  const targetPaper = opts.targetPaper ?? 248
  const w = source.width
  const h = source.height
  if (!(w > 0 && h > 0)) return source

  const srcCtx = source.getContext('2d', { willReadFrequently: true })
  if (!srcCtx) return source
  const src = srcCtx.getImageData(0, 0, w, h)

  const sw = Math.max(24, Math.round(w / 18))
  const sh = Math.max(24, Math.round(h / 18))
  const small = document.createElement('canvas')
  small.width = sw
  small.height = sh
  const sctx = small.getContext('2d')
  if (!sctx) return source
  sctx.filter = 'blur(10px)'
  sctx.drawImage(source, 0, 0, sw, sh)

  const blurC = document.createElement('canvas')
  blurC.width = w
  blurC.height = h
  const bctx = blurC.getContext('2d', { willReadFrequently: true })
  if (!bctx) return source
  bctx.imageSmoothingEnabled = true
  bctx.imageSmoothingQuality = 'high'
  bctx.drawImage(small, 0, 0, w, h)
  const blur = bctx.getImageData(0, 0, w, h)

  const outData = new ImageData(w, h)
  const s = src.data
  const b = blur.data
  const d = outData.data
  for (let i = 0; i < s.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const bg = Math.max(12, b[i + c])
      let n = (s[i + c] / bg) * targetPaper
      n = (n - 128) * contrast + 128
      d[i + c] = n < 0 ? 0 : n > 255 ? 255 : n
    }
    d[i + 3] = 255
  }

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) return source
  octx.putImageData(outData, 0, 0)
  return out
}

/**
 * Perspective crop output → landscape + lighting flatten.
 * @param {HTMLCanvasElement} cropped
 * @returns {HTMLCanvasElement}
 */
export function prepareFlattenedW2G(cropped) {
  return flattenDocumentScan(ensureLandscapeDocument(cropped))
}
