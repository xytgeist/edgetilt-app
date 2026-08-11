/**
 * Corner quality gates for W-2G scans.
 * Wrinkled casino slips + a hard homography = wavy garbage; prefer AABB crop unless the page is clearly planar.
 */

/** @typedef {import('scanic').CornerPoints} CornerPoints */
/** @typedef {import('scanic').Point} Point */

/**
 * @param {Point} a
 * @param {Point} b
 */
function dist(a, b) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

/**
 * @param {Point} a
 * @param {Point} b
 * @param {Point} c
 */
function angleDeg(a, b, c) {
  const abx = a.x - b.x
  const aby = a.y - b.y
  const cbx = c.x - b.x
  const cby = c.y - b.y
  const den = Math.hypot(abx, aby) * Math.hypot(cbx, cby)
  if (!(den > 0)) return 0
  const cos = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / den))
  return (Math.acos(cos) * 180) / Math.PI
}

/**
 * @param {CornerPoints | null | undefined} corners
 */
export function isValidCornerQuad(corners) {
  if (!corners?.topLeft || !corners?.topRight || !corners?.bottomRight || !corners?.bottomLeft) {
    return false
  }
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners
  const pts = [tl, tr, br, bl]
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
  }
  // Reject crossed quads (bow-tie): diagonals should intersect inside.
  const area =
    Math.abs(
      tl.x * tr.y +
        tr.x * br.y +
        br.x * bl.y +
        bl.x * tl.y -
        (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x),
    ) / 2
  return area > 100
}

/**
 * @param {CornerPoints} corners
 * @param {number} imgW
 * @param {number} imgH
 */
export function analyzeCorners(corners, imgW, imgH) {
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = corners
  const top = dist(tl, tr)
  const right = dist(tr, br)
  const bottom = dist(br, bl)
  const left = dist(bl, tl)
  const avgW = (top + bottom) / 2
  const avgH = (left + right) / 2
  const aspect = avgH > 0 ? avgW / avgH : 0
  const imgArea = Math.max(1, imgW * imgH)
  const polyArea =
    Math.abs(
      tl.x * tr.y +
        tr.x * br.y +
        br.x * bl.y +
        bl.x * tl.y -
        (tl.y * tr.x + tr.y * br.x + br.y * bl.x + bl.y * tl.x),
    ) / 2
  const coverage = polyArea / imgArea

  const angles = [
    angleDeg(bl, tl, tr),
    angleDeg(tl, tr, br),
    angleDeg(tr, br, bl),
    angleDeg(br, bl, tl),
  ]
  const angleErr = angles.reduce((s, a) => s + Math.abs(a - 90), 0) / 4
  const sideBalance =
    Math.max(top, bottom) / Math.max(1, Math.min(top, bottom)) +
    Math.max(left, right) / Math.max(1, Math.min(left, right))
  const trapezoid =
    Math.max(top / Math.max(1, bottom), bottom / Math.max(1, top)) - 1

  // Soft gates for auto AABB crop; strict gates only for perspective deskew.
  const aspectOk = aspect >= 0.85 && aspect <= 3.6
  const coverageOk = coverage >= 0.18 && coverage <= 0.995
  const anglesOk = angleErr <= 32
  const balancedOk = sideBalance <= 2.8

  const score =
    (aspectOk ? 0.25 : 0) +
    (coverageOk ? 0.25 : 0) +
    (anglesOk ? 0.25 : 0) +
    (balancedOk ? 0.15 : 0) +
    Math.max(0, 0.1 - angleErr / 200)

  // Any plausible page quad → auto-crop. Manual only when we find nothing usable.
  const usable = aspectOk && coverageOk && score >= 0.45
  const preferPerspective =
    usable &&
    aspect >= 1.2 &&
    aspect <= 2.8 &&
    coverage >= 0.28 &&
    angleErr <= 14 &&
    sideBalance <= 1.85 &&
    trapezoid >= 0.08

  return {
    aspect,
    coverage,
    angleErr,
    sideBalance,
    trapezoid,
    aspectOk,
    coverageOk,
    anglesOk,
    balancedOk,
    score,
    usable,
    preferPerspective,
  }
}

/**
 * Axis-aligned crop from corner bounds (keeps wrinkles; avoids homography melt).
 * @param {HTMLCanvasElement} source
 * @param {CornerPoints} corners
 * @param {{ padRatio?: number }} [opts]
 * @returns {HTMLCanvasElement}
 */
export function axisAlignedCropFromCorners(source, corners, opts = {}) {
  const padRatio = opts.padRatio ?? 0.012
  const pts = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
  let minX = Math.min(...pts.map((p) => p.x))
  let maxX = Math.max(...pts.map((p) => p.x))
  let minY = Math.min(...pts.map((p) => p.y))
  let maxY = Math.max(...pts.map((p) => p.y))
  const pad = Math.max(4, Math.round(Math.max(source.width, source.height) * padRatio))
  minX = Math.max(0, Math.floor(minX - pad))
  minY = Math.max(0, Math.floor(minY - pad))
  maxX = Math.min(source.width, Math.ceil(maxX + pad))
  maxY = Math.min(source.height, Math.ceil(maxY + pad))
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return source
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, minX, minY, w, h, 0, 0, w, h)
  return out
}
