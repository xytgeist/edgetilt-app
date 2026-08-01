/** Distinct subtle tints for backer slice cards (cycles after 6). */
export const POKER_STABLE_SLICE_TONE_COUNT = 6

/**
 * @param {number | string | null | undefined} sliceIndex
 * @returns {number}
 */
export function pokerStableSliceToneId(sliceIndex) {
  const idx = Number(sliceIndex)
  if (!Number.isFinite(idx) || idx < 0) return 0
  return idx % POKER_STABLE_SLICE_TONE_COUNT
}

/** @param {number | string | null | undefined} sliceIndex */
export function pokerStableSliceToneAttr(sliceIndex) {
  return String(pokerStableSliceToneId(sliceIndex))
}

export const POKER_STABLE_SLICE_CARD_CLASS = 'poker-stable-slice-card rounded-2xl border p-3'
