/**
 * Horse stake card highlights … regular distinct hues (blue / green / orange / red / violet / amber).
 * Dark: tinted border/wash. Light: white card + left accent bar (index.css).
 */

export const STABLE_HORSE_TONE_COUNT = 6

/**
 * @typedef {{
 *   surface: string,
 *   divider: string,
 *   accent: string,
 *   statusActive: string,
 * }} StableHorseTone
 */

/** @type {StableHorseTone[]} */
export const STABLE_HORSE_TONES = [
  {
    surface:
      'rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-blue-500/30',
    accent: 'text-blue-300',
    statusActive: 'bg-blue-500/20 text-blue-300',
  },
  {
    surface:
      'rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-emerald-500/30',
    accent: 'text-emerald-300',
    statusActive: 'bg-emerald-500/20 text-emerald-300',
  },
  {
    surface:
      'rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-orange-500/30',
    accent: 'text-orange-300',
    statusActive: 'bg-orange-500/20 text-orange-300',
  },
  {
    surface:
      'rounded-3xl border border-red-500/30 bg-gradient-to-br from-red-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-red-500/30',
    accent: 'text-red-300',
    statusActive: 'bg-red-500/20 text-red-300',
  },
  {
    surface:
      'rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-violet-500/30',
    accent: 'text-violet-300',
    statusActive: 'bg-violet-500/20 text-violet-300',
  },
  {
    surface:
      'rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-amber-500/30',
    accent: 'text-amber-300',
    statusActive: 'bg-amber-500/20 text-amber-300',
  },
]

/**
 * Tone from carousel order so neighboring horses never share a hue.
 * @param {number} dealIndex index in the active horse list
 */
export function stableHorseCardToneIndex(dealIndex) {
  const idx = Number(dealIndex)
  if (!Number.isFinite(idx) || idx < 0) return 0
  return idx % STABLE_HORSE_TONE_COUNT
}

/** @param {number} dealIndex */
export function stableHorseCardTone(dealIndex) {
  return STABLE_HORSE_TONES[stableHorseCardToneIndex(dealIndex)]
}

/** @param {number} dealIndex */
export function stableHorseCardToneAttr(dealIndex) {
  return String(stableHorseCardToneIndex(dealIndex))
}
