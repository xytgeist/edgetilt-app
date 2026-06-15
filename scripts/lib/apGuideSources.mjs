import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { clusterGuideEntries, cleanTitleFragment, pickTitle } from './apGuideMatchKeys.mjs'

export const AP_GUIDE_SOURCES = [
  { id: 'machinepro', label: 'Machine Pro', dir: 'machinepro-export/pages' },
  { id: 'advantageslots', label: 'Advantage Slots', dir: 'advantageslots-export/pages' },
  { id: 'advantageplay', label: 'AdvantagePlay', dir: 'advantageplay-export/pages' },
  { id: 'slotfarmers', label: 'SlotFarmers', dir: 'slotfarmers-export/pages' },
]

/** @param {string} repoRoot @param {typeof AP_GUIDE_SOURCES[0]} source */
export async function loadSourceEntries(repoRoot, source) {
  const pagesDir = path.join(repoRoot, source.dir)
  if (!fs.existsSync(pagesDir)) return []

  const entries = []
  for (const folder of fs.readdirSync(pagesDir)) {
    const metaPath = path.join(pagesDir, folder, 'meta.json')
    if (!fs.existsSync(metaPath)) continue
    const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
    entries.push({
      title: String(meta.title || folder).trim(),
      url: meta.url || '',
      folder,
      source: source.id,
      label: source.label,
    })
  }
  return entries
}

/** @param {string} repoRoot */
export async function loadAllExportEntries(repoRoot) {
  const all = []
  const totals = { bySource: {} }
  for (const source of AP_GUIDE_SOURCES) {
    const rows = await loadSourceEntries(repoRoot, source)
    totals.bySource[source.id] = rows.length
    all.push(...rows)
  }
  return { entries: all, totals }
}

/** @param {{ title: string, url: string, folder: string, source: string, label: string }[]} allEntries */
export function buildCoverageRows(allEntries) {
  const groups = clusterGuideEntries(allEntries)

  return groups
    .map((g) => {
      const siteEntries = Object.fromEntries(g.sites)
      const titles = [...g.sites.values()].map((s) => s.title)
      let title = g.title
      for (const t of titles) title = pickTitle(title, t)
      title = cleanTitleFragment(title) || g.title

      const aliases = [...g.aliases].sort()
      return {
        key: aliases[0] || 'unknown',
        aliases,
        title,
        siteCount: g.sites.size,
        sites: siteEntries,
      }
    })
    .sort((a, b) => b.siteCount - a.siteCount || a.title.localeCompare(b.title))
}

/** @param {string} repoRoot @param {string} sourceId @param {string} folder */
export function mirrorPageDir(repoRoot, sourceId, folder) {
  const source = AP_GUIDE_SOURCES.find((s) => s.id === sourceId)
  if (!source) throw new Error(`Unknown source: ${sourceId}`)
  return path.join(repoRoot, source.dir, folder)
}
