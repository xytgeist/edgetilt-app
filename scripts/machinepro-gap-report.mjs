/**
 * Machine Pro discover / export / canonical index gap report.
 *
 * Usage:
 *   node scripts/machinepro-gap-report.mjs
 *
 * Compares:
 *   1. scripts/machinepro-canonical-index-titles.txt  (Ryan's alphabetical index copy)
 *   2. machinepro-export/discovered-links.json     (last discover run)
 *   3. machinepro-export/pages/                    (exported HTML mirrors)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  CANONICAL_TITLES_PATH,
  loadCanonicalIndexTitles,
  machineProExportSlug,
  machineProLessonIdFromUrl,
  matchLessonsToCanonical,
  normalizeIndexTitle,
  parseDiscoverFile,
} from './lib/machineproDiscover.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'machinepro-export')
const PAGES_DIR = path.join(OUT_DIR, 'pages')
const LINKS_PATH = path.join(OUT_DIR, 'discovered-links.json')
const REPORT_PATH = path.join(OUT_DIR, 'gap-report.json')

function loadDiscoverLessons() {
  if (!fs.existsSync(LINKS_PATH)) return []
  const raw = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'))
  if (raw?.lessons?.length) return raw.lessons
  return parseDiscoverFile(raw).map((url) => ({
    title: '',
    url,
    lessonId: machineProLessonIdFromUrl(url),
  }))
}

function loadExportedSlugs() {
  if (!fs.existsSync(PAGES_DIR)) return new Set()
  return new Set(
    fs.readdirSync(PAGES_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name),
  )
}

const canonical = loadCanonicalIndexTitles()
const lessons = loadDiscoverLessons()
const match = matchLessonsToCanonical(lessons, canonical)
const exported = loadExportedSlugs()

const discoveredUrls = lessons.map((l) => l.url)
const missingExport = lessons.filter((l) => !exported.has(machineProExportSlug(l.title, l.url)))
const orphanExports = [...exported].filter((slug) => {
  return !lessons.some((l) => machineProExportSlug(l.title, l.url) === slug)
})

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    canonicalTitles: canonical.length,
    discoveredLessons: lessons.length,
    canonicalMatched: match.matchedCount,
    exportedFolders: exported.size,
    missingFromDiscover: match.missingFromDiscover.length,
    discoveredNotExported: missingExport.length,
    exportOrphans: orphanExports.length,
    extraDiscoverTitles: match.extraDiscover.length,
  },
  missingFromDiscover: match.missingFromDiscover,
  discoveredNotExported: missingExport.map((l) => ({
    title: l.title,
    url: l.url,
    expectedSlug: machineProExportSlug(l.title, l.url),
  })),
  extraDiscover: match.extraDiscover,
  exportOrphans: orphanExports.sort(),
}

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

console.log('Machine Pro gap report')
console.log('  Canonical titles (index copy):', report.counts.canonicalTitles)
console.log('  Discovered lessons (unique IDs):', report.counts.discoveredLessons)
console.log('  Canonical matched by link text:', report.counts.canonicalMatched)
console.log('  Exported HTML folders:', report.counts.exportedFolders)
console.log('')
console.log('  Missing from discover:', report.counts.missingFromDiscover)
console.log('  Discovered but not exported:', report.counts.discoveredNotExported)
console.log('  Export folders w/o discover row:', report.counts.exportOrphans)
console.log('  Extra discover (not in canonical list):', report.counts.extraDiscoverTitles)
console.log('')
console.log('  →', path.relative(REPO_ROOT, REPORT_PATH))

if (match.missingFromDiscover.length) {
  console.log('\nFirst 15 missing from discover:')
  for (const t of match.missingFromDiscover.slice(0, 15)) console.log('  -', t)
}

if (missingExport.length) {
  console.log('\nFirst 10 discovered but not exported:')
  for (const l of missingExport.slice(0, 10)) console.log('  -', l.title || l.url)
}
