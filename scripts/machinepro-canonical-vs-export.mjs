/**
 * Compare canonical alphabetical index titles vs HTML export (pages/).
 *
 * Usage:
 *   node scripts/machinepro-canonical-vs-export.mjs
 *   node scripts/machinepro-canonical-vs-export.mjs --archive=machinepro-export-2026-06-08
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadCanonicalIndexTitles } from './lib/machineproDiscover.mjs'
import {
  exportCoversCanonical,
  loadHtmlExportsFromManifest,
} from './lib/machineproExportMatch.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

function parseArchiveArg(argv) {
  for (const arg of argv) {
    if (arg.startsWith('--archive=')) {
      const rel = arg.slice('--archive='.length).trim()
      return path.isAbsolute(rel) ? rel : path.join(REPO_ROOT, rel)
    }
  }
  return path.join(REPO_ROOT, 'machinepro-export')
}

const archiveDir = parseArchiveArg(process.argv.slice(2))
const PAGES_DIR = path.join(archiveDir, 'pages')
const MANIFEST_PATH = path.join(archiveDir, 'manifest.json')
const REPORT_PATH = path.join(archiveDir, 'canonical-vs-export-report.json')

function loadPageFolders() {
  if (!fs.existsSync(PAGES_DIR)) return []
  return fs
    .readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
}

const canonical = loadCanonicalIndexTitles()
const exports = loadHtmlExportsFromManifest(MANIFEST_PATH)
const folders = loadPageFolders()
const folderSet = new Set(folders)
const exportSlugs = new Set(exports.map((e) => e.slug))

/** @type {Array<{ canonical: string, export: typeof exports[0] | null }>} */
const matched = []
/** @type {string[]} */
const missingFromExport = []

for (const title of canonical) {
  const hit = exports.find((e) => exportCoversCanonical(e.title, title)) ?? null
  if (hit) matched.push({ canonical: title, export: hit })
  else missingFromExport.push(title)
}

const unmatchedExports = exports.filter(
  (e) => !canonical.some((c) => exportCoversCanonical(e.title, c)),
)

const foldersWithoutManifest = folders.filter((f) => !exportSlugs.has(f))
const manifestWithoutFolder = exports.filter((e) => !folderSet.has(e.slug))

const report = {
  generatedAt: new Date().toISOString(),
  archiveDir: path.relative(REPO_ROOT, archiveDir),
  counts: {
    canonicalTitles: canonical.length,
    htmlExportsInManifest: exports.length,
    pageFolders: folders.length,
    canonicalCoveredByExport: matched.length,
    canonicalMissingFromExport: missingFromExport.length,
    exportsNotMatchingCanonical: unmatchedExports.length,
    foldersWithoutManifestRow: foldersWithoutManifest.length,
    manifestRowsWithoutFolder: manifestWithoutFolder.length,
  },
  missingFromExport,
  unmatchedExports: unmatchedExports.map((e) => ({
    title: e.title,
    slug: e.slug,
    url: e.url,
  })),
  matched: matched.map(({ canonical: c, export: e }) => ({
    canonical: c,
    exportTitle: e.title,
    slug: e.slug,
  })),
  foldersWithoutManifestRow: foldersWithoutManifest,
  manifestRowsWithoutFolder: manifestWithoutFolder.map((e) => e.slug),
}

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

console.log('Canonical index vs HTML export (pages/)')
console.log('  Archive:', report.archiveDir)
console.log('  Canonical titles:', report.counts.canonicalTitles)
console.log('  HTML exports (manifest):', report.counts.htmlExportsInManifest)
console.log('  Page folders on disk:', report.counts.pageFolders)
console.log('')
console.log('  Canonical covered by an export:', report.counts.canonicalCoveredByExport)
console.log('  Canonical MISSING from export:', report.counts.canonicalMissingFromExport)
console.log('  Exports not matching any canonical line:', report.counts.exportsNotMatchingCanonical)
console.log('')
console.log('  →', path.relative(REPO_ROOT, REPORT_PATH))

if (missingFromExport.length) {
  console.log(`\nMissing from export (${missingFromExport.length}):`)
  for (const t of missingFromExport) console.log('  -', t)
}

if (unmatchedExports.length) {
  console.log(`\nExported but not in canonical list (${unmatchedExports.length}):`)
  for (const e of unmatchedExports) console.log('  -', e.title, `[${e.slug}]`)
}
