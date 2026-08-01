/** Distinct subtle tints for backer slice cards — 0=emerald, 1=blue, 2=rose, 3=green, 4=blue, 5=zinc. */
export const POKER_STABLE_SLICE_TONE_COUNT = 6

const SLICE_TONE_OUTER_CLASS = [
  'border-emerald-500/40 bg-emerald-950/30 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]',
  'border-blue-500/40 bg-blue-950/30 shadow-[inset_0_1px_0_0_rgba(96,165,250,0.12)]',
  'border-rose-500/40 bg-rose-950/30 shadow-[inset_0_1px_0_0_rgba(251,113,133,0.12)]',
  'border-emerald-500/40 bg-emerald-950/30 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]',
  'border-blue-500/40 bg-blue-950/30 shadow-[inset_0_1px_0_0_rgba(96,165,250,0.12)]',
  'border-zinc-500/40 bg-zinc-900/50 shadow-[inset_0_1px_0_0_rgba(161,161,170,0.1)]',
]

const SLICE_TONE_TITLE_CLASS = [
  'text-emerald-300',
  'text-blue-300',
  'text-rose-300',
  'text-emerald-300',
  'text-blue-300',
  'text-zinc-300',
]

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

/** Outer featured-style shell (matches tournament Swaps card). */
export function pokerStableSliceCardClass(sliceIndex) {
  const tone = pokerStableSliceToneId(sliceIndex)
  return `poker-stable-slice-card rounded-xl border p-3 ${SLICE_TONE_OUTER_CLASS[tone]}`
}

/** Slice heading accent on the tinted shell. */
export function pokerStableSliceTitleClass(sliceIndex) {
  return `${POKER_STABLE_SLICE_TITLE_ROW_CLASS} ${SLICE_TONE_TITLE_CLASS[pokerStableSliceToneId(sliceIndex)]}`
}

/** Shared slice card title row (backer name / Backer N). */
export const POKER_STABLE_SLICE_TITLE_ROW_CLASS =
  'min-w-0 truncate text-base font-bold leading-snug'

/** Player deal form card title: Backer, or Backer 1 / Backer 2 when multiple. */
export function pokerStableBackerSliceLabel(sliceCount, sliceIndex) {
  const count = Number(sliceCount)
  const index = Number(sliceIndex)
  if (!Number.isFinite(count) || count <= 1) return 'Backer'
  if (!Number.isFinite(index) || index < 0) return 'Backer'
  return `Backer ${index + 1}`
}

