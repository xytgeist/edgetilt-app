/** @param {number} n */
function even2(n) {
  const v = Math.floor(Number(n) || 0)
  return Math.max(2, v - (v % 2))
}

/**
 * Clamp and even-ify a crop rect in **source pixel** space. Returns `null` when crop is effectively full frame.
 *
 * @param {number} vw
 * @param {number} vh
 * @param {{ x: number, y: number, w: number, h: number }} c
 * @returns {{ x: number, y: number, w: number, h: number } | null}
 */
export function sanitizeVideoCropPx(vw, vh, c) {
  if (!(vw > 1) || !(vh > 1) || !c) return null
  let w = even2(c.w)
  let h = even2(c.h)
  let x = Math.floor(Number(c.x) || 0)
  let y = Math.floor(Number(c.y) || 0)
  w = Math.min(w, vw)
  h = Math.min(h, vh)
  x = Math.max(0, Math.min(x, vw - w))
  y = Math.max(0, Math.min(y, vh - h))
  x = Math.floor(x / 2) * 2
  y = Math.floor(y / 2) * 2
  if (w >= vw - 2 && h >= vh - 2 && x <= 2 && y <= 2) return null
  return { x, y, w, h }
}

/**
 * Largest centered crop inside `vw`×`vh` with width/height = `aspect` (cropW / cropH).
 *
 * @param {number} vw
 * @param {number} vh
 * @param {number} aspect
 */
export function maxCropRectForAspect(vw, vh, aspect) {
  if (!(vw > 2) || !(vh > 2) || !(aspect > 0)) return { x: 0, y: 0, w: 2, h: 2 }
  let cw = vw
  let ch = cw / aspect
  if (ch > vh) {
    ch = vh
    cw = ch * aspect
  }
  cw = Math.floor(cw / 2) * 2
  ch = Math.floor(ch / 2) * 2
  cw = Math.max(2, Math.min(cw, vw))
  ch = Math.max(2, Math.min(ch, vh))
  const x = Math.floor(Math.max(0, (vw - cw) / 2) / 2) * 2
  const y = Math.floor(Math.max(0, (vh - ch) / 2) / 2) * 2
  return { x, y, w: cw, h: ch }
}
