/**
 * Default one-line +EV threshold when `guides.card_ev_threshold` is null - and helpers for manifests.
 * Tune per slug in Supabase after sync or in `Slots/<slug>/card.meta.json` → guide_seed.card_ev_threshold.
 */

export const TYPE_DEFAULT_CARD_EV_THRESHOLD = {
  'Must Hit By': 'Counter tight vs cost per increment',
  'Persistent State': 'Strong meters / state vs cost to clear',
  'Lock Game': 'Lock package worth the buy-in',
  Accumulator: 'Progress far along vs price to finish',
  Hybrid: 'Best axis lines up cheap (meters / prizes)',
  Other: 'Rules on glass favor you - verify live',
}

/** Curated overrides - short operator phrases. */
export const SLUG_CARD_EV_THRESHOLD = {
  'buffalo-link': 'Play any 1400+',
  'lightning-buffalo-link': 'Play any 1400+',
  'phoenix-link': 'Cheap path to must-hit award',
  'stack-up-pays': 'Stacks / meters beat the grind tax',
  'plants-vs-zombies-3d': 'Brain meter 150–200+ on your tier',
  'cash-machine-lock': 'Lock EV clears buy-in hurdle',
  'legend-of-the-phoenix': 'Red 12 / Green 13 / Blue 14',
}

/** Year-only when documented / widely cited - expand as you confirm. */
export const SLUG_RELEASE_YEAR = {
  'plants-vs-zombies-3d': 2016,
  'legend-of-the-phoenix': 2022,
}

/** Map messy DB/UI type strings onto keys in TYPE_DEFAULT_CARD_EV_THRESHOLD. */
export function evThresholdTypeKey(type) {
  if (!type) return 'Other'
  const raw = String(type)
  if (raw.includes('Must-Hit-By') || /\bmust\s+hit\s+by\b/i.test(raw)) return 'Must Hit By'
  if (TYPE_DEFAULT_CARD_EV_THRESHOLD[type] != null) return type
  return 'Other'
}

export function defaultCardEvThresholdForSlug(slug, type) {
  if (slug && SLUG_CARD_EV_THRESHOLD[slug]) return SLUG_CARD_EV_THRESHOLD[slug]
  const t = evThresholdTypeKey(type)
  return TYPE_DEFAULT_CARD_EV_THRESHOLD[t]
}

export function defaultReleaseYearForSlug(slug) {
  if (!slug) return null
  return SLUG_RELEASE_YEAR[slug] ?? null
}
