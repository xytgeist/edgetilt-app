/**
 * Horse stake card highlights … regular distinct hues (blue / green / orange / red / violet / amber).
 * Dark: tinted border/wash. Light: white card + left accent bar (index.css).
 *
 * Tone is pinned for the life of a deal: index = creation order among the backer's deals
 * (including archived/hidden), not carousel display order. Creating or reordering horses
 * must not recolor existing cards.
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
 * @param {number} dealIndex
 */
export function stableHorseCardToneIndex(dealIndex) {
  const idx = Number(dealIndex)
  if (!Number.isFinite(idx) || idx < 0) return 0
  return idx % STABLE_HORSE_TONE_COUNT
}

/**
 * Lifetime tone index for a deal: oldest backer deal = 0, next created = 1, …
 * @param {string | null | undefined} dealId
 * @param {Array<{ id?: string, created_at?: string | null }>} toneDeals all deals that should reserve a hue slot (include archived/hidden)
 */
export function stableHorseCardToneIndexForDeal(dealId, toneDeals = []) {
  const id = String(dealId || '').trim()
  if (!id) return 0
  const sorted = [...(toneDeals || [])].sort((a, b) => {
    const ta = new Date(a?.created_at || 0).getTime()
    const tb = new Date(b?.created_at || 0).getTime()
    if (ta !== tb) return ta - tb
    return String(a?.id || '').localeCompare(String(b?.id || ''))
  })
  const idx = sorted.findIndex((d) => d?.id === id)
  return stableHorseCardToneIndex(idx >= 0 ? idx : 0)
}

/** @param {number} dealIndex */
export function stableHorseCardTone(dealIndex) {
  return STABLE_HORSE_TONES[stableHorseCardToneIndex(dealIndex)]
}

/** @param {string | null | undefined} dealId @param {Array<{ id?: string, created_at?: string | null }>} toneDeals */
export function stableHorseCardToneForDeal(dealId, toneDeals = []) {
  return STABLE_HORSE_TONES[stableHorseCardToneIndexForDeal(dealId, toneDeals)]
}

/** @param {number} dealIndex */
export function stableHorseCardToneAttr(dealIndex) {
  return String(stableHorseCardToneIndex(dealIndex))
}

/** @param {string | null | undefined} dealId @param {Array<{ id?: string, created_at?: string | null }>} toneDeals */
export function stableHorseCardToneAttrForDeal(dealId, toneDeals = []) {
  return String(stableHorseCardToneIndexForDeal(dealId, toneDeals))
}

/**
 * Deals that reserve a horse highlight slot for this backer (includes archived/hidden).
 * @param {object[]} deals
 * @param {Record<string, object[]>} slicesByDeal
 * @param {string | null | undefined} userId
 */
export function stableHorseToneScopeDeals(deals = [], slicesByDeal = {}, userId) {
  const uid = String(userId || '').trim()
  if (!uid) return []
  return (deals || []).filter((deal) => {
    if (!deal?.id) return false
    if (deal.staker_user_id === uid) return true
    const slices = slicesByDeal[deal.id] || []
    return slices.some((s) => s?.staker_user_id === uid)
  })
}
