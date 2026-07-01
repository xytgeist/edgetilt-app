import {
  isGuideInStarterPackByReleaseYear,
  normalizeGuideAccessSlug,
} from './guideAccess.js'
import { machineForGuideRow, resolveCalculatorKeyFromMachine } from './guideCalculatorKey.js'

/**
 * Calculator keys unlocked for Slots Edge Starter via guide access (2019 pack + weekly drops).
 * @param {Array<{ slug?: string | null, machines?: unknown }>} guideRows
 * @param {Set<string> | null | undefined} [starterUnlockedGuideSlugs] weekly drop slugs (normalized)
 */
export function buildStarterUnlockedCalculatorKeys(guideRows, starterUnlockedGuideSlugs = null) {
  const weekly = starterUnlockedGuideSlugs instanceof Set ? starterUnlockedGuideSlugs : new Set()
  /** @type {Set<string>} */
  const keys = new Set()

  for (const row of guideRows || []) {
    const m = machineForGuideRow(row)
    const slug = normalizeGuideAccessSlug(m?.slug || row.slug)
    if (!slug) continue

    const inStarterPack = isGuideInStarterPackByReleaseYear(m?.release_year)
    const inWeeklyDrop = weekly.has(slug)
    if (!inStarterPack && !inWeeklyDrop) continue

    const calcKey = resolveCalculatorKeyFromMachine(m)
    if (calcKey) keys.add(calcKey)
  }

  return keys
}

const STARTER_GUIDE_CALC_SELECT = `
  slug,
  machines (
    slug,
    has_calculator,
    calculator_slug,
    release_year,
    volatility_index
  )
`

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchPublishedGuideRowsForStarterCalcUnlocks(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('guides')
    .select(STARTER_GUIDE_CALC_SELECT)
    .eq('published', true)

  if (error) throw error
  return data || []
}
