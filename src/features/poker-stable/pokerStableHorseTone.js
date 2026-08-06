/**
 * Horse stake card highlights … analogous hues around Create Stake blue/cyan
 * on the color wheel (teal → cyan → sky → blue → indigo → violet).
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

/** Dark: cool neighbors of cyan CTA. Light remaps under html.light. */
/** @type {StableHorseTone[]} */
export const STABLE_HORSE_TONES = [
  {
    surface:
      'rounded-3xl border border-teal-500/30 bg-gradient-to-br from-teal-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-teal-500/30',
    accent: 'text-teal-300',
    statusActive: 'bg-teal-500/20 text-teal-300',
  },
  {
    surface:
      'rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/30',
    accent: 'text-cyan-300',
    statusActive: 'bg-cyan-500/20 text-cyan-300',
  },
  {
    surface:
      'rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-sky-500/30',
    accent: 'text-sky-300',
    statusActive: 'bg-sky-500/20 text-sky-300',
  },
  {
    surface:
      'rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-blue-500/30',
    accent: 'text-blue-300',
    statusActive: 'bg-blue-500/20 text-blue-300',
  },
  {
    surface:
      'rounded-3xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-indigo-500/30',
    accent: 'text-indigo-300',
    statusActive: 'bg-indigo-500/20 text-indigo-300',
  },
  {
    surface:
      'rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-violet-500/30',
    accent: 'text-violet-300',
    statusActive: 'bg-violet-500/20 text-violet-300',
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
