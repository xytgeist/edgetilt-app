/** Distinct subtle tints for backer slice cards — 0=cyan, then violet, emerald, rose, sky, amber. */
export const POKER_STABLE_SLICE_TONE_COUNT = 6

const SLICE_TONE_OUTER_CLASS = [
  'border-cyan-500/40 bg-cyan-950/30 shadow-[inset_0_1px_0_0_rgba(34,211,238,0.12)]',
  'border-violet-500/40 bg-violet-950/30 shadow-[inset_0_1px_0_0_rgba(167,139,250,0.12)]',
  'border-emerald-500/40 bg-emerald-950/30 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.12)]',
  'border-rose-500/40 bg-rose-950/30 shadow-[inset_0_1px_0_0_rgba(251,113,133,0.12)]',
  'border-sky-500/40 bg-sky-950/30 shadow-[inset_0_1px_0_0_rgba(56,189,248,0.12)]',
  'border-amber-500/40 bg-amber-950/30 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.12)]',
]

const SLICE_TONE_TITLE_CLASS = [
  'text-cyan-300',
  'text-violet-300',
  'text-emerald-300',
  'text-rose-300',
  'text-sky-300',
  'text-amber-300',
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
  return `poker-stable-slice-card rounded-2xl border p-3 ${SLICE_TONE_OUTER_CLASS[tone]}`
}

/** Slice heading accent on the tinted shell. */
export function pokerStableSliceTitleClass(sliceIndex) {
  return SLICE_TONE_TITLE_CLASS[pokerStableSliceToneId(sliceIndex)]
}

/** Player deal form card title: Backer, or Backer 1 / Backer 2 when multiple. */
export function pokerStableBackerSliceLabel(sliceCount, sliceIndex) {
  const count = Number(sliceCount)
  const index = Number(sliceIndex)
  if (!Number.isFinite(count) || count <= 1) return 'Backer'
  if (!Number.isFinite(index) || index < 0) return 'Backer'
  return `Backer ${index + 1}`
}

/** Neutral inner panel — fields sit on zinc like swap draft cards. */
export const POKER_STABLE_SLICE_INNER_CLASS =
  'poker-stable-slice-inner rounded-2xl border border-zinc-700/80 bg-zinc-900/70 p-3'
