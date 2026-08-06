/** Distinct highlight chrome for Stable horse stake cards (border / wash / accent). */

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
      'rounded-3xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-cyan-500/15',
    accent: 'text-cyan-300',
    statusActive: 'bg-cyan-500/20 text-cyan-300',
  },
  {
    surface:
      'rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-emerald-500/15',
    accent: 'text-emerald-300',
    statusActive: 'bg-emerald-500/20 text-emerald-300',
  },
  {
    surface:
      'rounded-3xl border border-sky-500/30 bg-gradient-to-br from-sky-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-sky-500/15',
    accent: 'text-sky-300',
    statusActive: 'bg-sky-500/20 text-sky-300',
  },
  {
    surface:
      'rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-violet-500/15',
    accent: 'text-violet-300',
    statusActive: 'bg-violet-500/20 text-violet-300',
  },
  {
    surface:
      'rounded-3xl border border-fuchsia-500/30 bg-gradient-to-br from-fuchsia-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-fuchsia-500/15',
    accent: 'text-fuchsia-300',
    statusActive: 'bg-fuchsia-500/20 text-fuchsia-300',
  },
  {
    surface:
      'rounded-3xl border border-rose-500/30 bg-gradient-to-br from-rose-950/35 via-zinc-900/95 to-zinc-950',
    divider: 'border-rose-500/15',
    accent: 'text-rose-300',
    statusActive: 'bg-rose-500/20 text-rose-300',
  },
]

/**
 * Tone from carousel order so neighboring horses never share a color (hash collided for Edge Lord).
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
