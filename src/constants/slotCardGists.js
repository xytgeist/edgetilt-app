/**
 * Default one-line card “gist” when `guides.card_gist` is null — and helpers for manifests.
 * Tune per slug in Supabase after sync or in `Slots/<slug>/card.meta.json` → guide_seed.card_gist.
 */

export const TYPE_DEFAULT_CARD_GIST = {
  'Must-Hit-By': 'Counter tight vs cost per increment',
  'Persistent State': 'Strong meters / state vs cost to clear',
  'Lock Game': 'Lock package worth the buy-in',
  Accumulator: 'Progress far along vs price to finish',
  Hybrid: 'Best axis lines up cheap (meters / prizes)',
  Other: 'Rules on glass favor you — verify live',
}

/** Curated overrides — short operator phrases. */
export const SLUG_CARD_GIST = {
  'buffalo-link': 'Play any 1400+',
  'phoenix-link': 'Cheap path to must-hit award',
  'stack-up-pays': 'Stacks / meters beat the grind tax',
  'plants-vs-zombies-3d': 'Brain meter 150–200+ on your tier',
  'adventures-of-sinbad': '2 bosses down; Cyclops close on map',
  'cash-machine-lock': 'Lock EV clears buy-in hurdle',
}

/** Year-only when documented / widely cited — expand as you confirm. */
export const SLUG_RELEASE_YEAR = {
  'plants-vs-zombies-3d': 2016,
}

/** Map messy DB/UI type strings onto keys in TYPE_DEFAULT_CARD_GIST. */
export function gistTypeKey(type) {
  if (!type) return 'Other'
  if (String(type).includes('Must-Hit-By')) return 'Must-Hit-By'
  if (TYPE_DEFAULT_CARD_GIST[type] != null) return type
  return 'Other'
}

export function defaultCardGistForSlug(slug, type) {
  if (slug && SLUG_CARD_GIST[slug]) return SLUG_CARD_GIST[slug]
  const t = gistTypeKey(type)
  return TYPE_DEFAULT_CARD_GIST[t]
}

export function defaultReleaseYearForSlug(slug) {
  if (!slug) return null
  return SLUG_RELEASE_YEAR[slug] ?? null
}
