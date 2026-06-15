/**
 * Build gap export list: archive missing titles → unique URLs to scrape.
 *
 * Usage:
 *   node scripts/machinepro-gap-export-list.mjs
 *   node scripts/machinepro-gap-export-list.mjs --archive=machinepro-export-2026-06-08
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { machineProExportSlug, machineProLessonIdFromUrl } from './lib/machineproDiscover.mjs'
import { isWeekContainerUrl } from './lib/machineproDiscover.mjs'
import {
  filterLessonsForMissingCanonical,
  missingCanonicalTitlesFromArchive,
} from './lib/machineproExportMatch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'machinepro-export')
const LINKS_PATH = path.join(OUT_DIR, 'discovered-links.json')

function parseArchiveArg(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--archive=')) {
      const rel = arg.slice('--archive='.length).trim()
      return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel)
    }
  }
  return path.join(REPO_ROOT, 'machinepro-export-2026-06-08')
}

function loadArchiveLessonIds(archiveDir) {
  const manifestPath = path.join(archiveDir, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return new Set()
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  return new Set(
    (manifest.exported ?? [])
      .filter((row) => row.format === 'html' && row.url)
      .map((row) => machineProLessonIdFromUrl(row.url))
      .filter(Boolean),
  )
}

const archiveDir = parseArchiveArg(process.argv.slice(2))
if (!fs.existsSync(LINKS_PATH)) {
  console.error('Missing discovered-links.json — run: npm run machinepro:export:discover')
  process.exit(1)
}

const raw = JSON.parse(fs.readFileSync(LINKS_PATH, 'utf8'))
const lessons = raw.lessons ?? []
const canonicalLinks = raw.canonicalLinks ?? null
const missing82 = missingCanonicalTitlesFromArchive(archiveDir)
const filtered = filterLessonsForMissingCanonical(lessons, missing82, canonicalLinks)
const archiveIds = loadArchiveLessonIds(archiveDir)

const exportable = filtered.lessons
  .map((l) => ({
    canonical: l.title,
    url: l.url,
    lessonId: machineProLessonIdFromUrl(l.url),
    expectedSlug: machineProExportSlug(l.title, l.url),
    weekContainer: isWeekContainerUrl(l.url),
    alreadyInArchive:
      !isWeekContainerUrl(l.url) &&
      archiveIds.has(machineProLessonIdFromUrl(l.url) ?? ''),
  }))
  .sort((a, b) => a.canonical.localeCompare(b.canonical))

const toScrape = exportable.filter((r) => !r.alreadyInArchive)

const report = {
  generatedAt: new Date().toISOString(),
  archiveDir: path.relative(REPO_ROOT, archiveDir),
  missingFromArchiveCount: missing82.length,
  exportableUniqueUrls: exportable.length,
  toScrapeCount: toScrape.length,
  alreadyInArchiveCount: exportable.length - toScrape.length,
  weekContainerCount: exportable.filter((r) => r.weekContainer).length,
  unresolvedCount: filtered.unresolved.length,
  toScrape,
  exportable,
  missing82Titles: missing82.sort(),
  unresolved: filtered.unresolved,
}

const jsonPath = path.join(OUT_DIR, 'gap-export-62.json')
const txtPath = path.join(OUT_DIR, 'gap-export-62.txt')
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8')

const lines = [
  'Machine Pro gap scrape list',
  `Generated: ${report.generatedAt}`,
  '',
  `Missing from archive: ${missing82.length}`,
  `Unique index URLs: ${exportable.length}`,
  `Week container links (need resolve): ${report.weekContainerCount}`,
  `Already in archive (skip): ${report.alreadyInArchiveCount}`,
  `To scrape: ${toScrape.length}`,
  '',
  `--- To scrape (${toScrape.length}) ---`,
  ...toScrape.map((r) => `${r.canonical} | ${r.expectedSlug}`),
]
fs.writeFileSync(txtPath, lines.join('\n'), 'utf8')

console.log('Gap scrape list')
console.log('  To scrape:', toScrape.length)
console.log('  Week containers:', report.weekContainerCount)
console.log('  →', path.relative(REPO_ROOT, txtPath))
console.log('  →', path.relative(REPO_ROOT, jsonPath))
