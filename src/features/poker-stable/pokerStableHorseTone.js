/**
 * Horse stake card highlights … same palette as Create Stake (cyan CTA / light blue chrome).
 * Six intensity steps so neighboring cards stay distinct without leaving the brand family.
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

/** Dark: cyan CTA family. Light remaps to blue chrome under html.light. */
/** @type {StableHorseTone[]} */
export const STABLE_HORSE_TONES = [
  {
    surface:
      'rounded-3xl border border-cyan-500/45 bg-gradient-to-br from-cyan-950/50 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/45',
    accent: 'text-cyan-200',
    statusActive: 'bg-cyan-500/25 text-cyan-200',
  },
  {
    surface:
      'rounded-3xl border border-cyan-500/38 bg-gradient-to-br from-cyan-950/42 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/38',
    accent: 'text-cyan-300',
    statusActive: 'bg-cyan-500/22 text-cyan-300',
  },
  {
    surface:
      'rounded-3xl border border-cyan-500/32 bg-gradient-to-br from-cyan-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/32',
    accent: 'text-cyan-300',
    statusActive: 'bg-cyan-500/20 text-cyan-300',
  },
  {
    surface:
      'rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-950/28 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-400/30',
    accent: 'text-cyan-300',
    statusActive: 'bg-cyan-500/18 text-cyan-300',
  },
  {
    surface:
      'rounded-3xl border border-cyan-600/35 bg-gradient-to-br from-cyan-950/40 via-zinc-900/90 to-zinc-950',
    divider: 'border-cyan-600/35',
    accent: 'text-cyan-200',
    statusActive: 'bg-cyan-600/25 text-cyan-200',
  },
  {
    surface:
      'rounded-3xl border border-cyan-500/28 bg-gradient-to-br from-cyan-900/30 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/28',
    accent: 'text-cyan-400',
    statusActive: 'bg-cyan-500/15 text-cyan-400',
  },
]

/**
 * Tone from carousel order so neighboring horses never share a step.
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
