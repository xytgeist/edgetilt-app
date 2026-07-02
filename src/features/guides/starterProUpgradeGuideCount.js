import {
  canOpenGuide,
  normalizeGuideAccessSlug,
} from './guideAccess.js'
import { machineForGuideRow } from './guideCalculatorKey.js'

/**
 * Published guides a Starter user still needs Pro to open immediately.
 *
 * @param {Array<{ slug?: string | null, published?: boolean, machines?: unknown }>} guideRows
 * @param {Parameters<typeof canOpenGuide>[1]} access
 */
export function countStarterProUpgradeGuides(guideRows, access = {}) {
  let count = 0
  for (const row of guideRows || []) {
    if (row?.published === false) continue
    const machine = machineForGuideRow(row)
    const slug = normalizeGuideAccessSlug(machine?.slug || row.slug)
    if (!slug) continue
    if (canOpenGuide(slug, { ...access, releaseYear: machine?.release_year ?? null })) continue
    count += 1
  }
  return count
}
