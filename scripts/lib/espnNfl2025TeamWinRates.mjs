/**
 * ESPN Analytics 2025 end-of-season team trench win rates.
 * Source JSON: data/syndicate/espn-nfl-2025-team-win-rates.json
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const JSON_PATH = join(ROOT, 'data', 'syndicate', 'espn-nfl-2025-team-win-rates.json')

/** @type {null | { source: string, url: string, season: number, through: string, teams: Record<string, { prwr: number, rswr: number, pbwr: number, rbwr: number }> }} */
let cached = null

export function loadEspnNfl2025TeamWinRates() {
  if (cached) return cached
  cached = JSON.parse(readFileSync(JSON_PATH, 'utf8'))
  return cached
}
