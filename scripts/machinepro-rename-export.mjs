/**
 * Rename machinepro-export to short slot-name slugs (HTML pages + root .md files).
 *
 *   node scripts/machinepro-rename-export.mjs
 *   node scripts/machinepro-rename-export.mjs --dry-run
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { allocateMachineProSlugs, machineProSlotNameSlug } from './lib/exportSlotSlug.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(REPO_ROOT, 'machinepro-export')
const PAGES_DIR = path.join(OUT_DIR, 'pages')
const MANIFEST_PATH = path.join(OUT_DIR, 'manifest.json')

function relWin(subpath) {
  return subpath.split('/').join('\\')
}

/** @param {string} url @param {string} title @param {string} newSlug @param {'html'|'md'} format */
function manifestPaths(url, title, newSlug, format) {
  if (format === 'html') {
    return {
      slug: newSlug,
      file: relWin(`machinepro-export/pages/${newSlug}/index.html`),
      dir: relWin(`machinepro-export/pages/${newSlug}`),
    }
  }
  return {
    slug: newSlug,
    file: relWin(`machinepro-export/${newSlug}.md`),
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  /** @type {{ oldSlug: string, newSlug: string, title: string, url: string, kind: 'html'|'md' }[]} */
  const renames = []

  if (fs.existsSync(PAGES_DIR)) {
    const entries = await fsp.readdir(PAGES_DIR, { withFileTypes: true })
    const htmlRows = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const metaPath = path.join(PAGES_DIR, entry.name, 'meta.json')
      try {
        const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
        htmlRows.push({ oldSlug: entry.name, title: meta.title, url: meta.url })
      } catch {
        console.warn(`  skip (no meta.json): ${entry.name}`)
      }
    }
    const newSlugs = allocateMachineProSlugs(htmlRows.map((r) => ({ title: r.title, url: r.url })))
    htmlRows.forEach((row, i) => {
      if (row.oldSlug !== newSlugs[i]) {
        renames.push({ ...row, newSlug: newSlugs[i], kind: 'html' })
      }
    })
  }

  const mdFiles = (await fsp.readdir(OUT_DIR)).filter((f) => f.endsWith('.md'))
  /** @type {Map<string, { title: string, url: string }>} */
  const manifestByOldMd = new Map()
  if (fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'))
    for (const row of manifest.exported ?? []) {
      if (row.format === 'md' && row.file) {
        const base = path.basename(row.file, '.md')
        manifestByOldMd.set(base, { title: row.title, url: row.url })
      }
    }
  }

  const mdRows = mdFiles.map((file) => {
    const oldSlug = file.replace(/\.md$/, '')
    const meta = manifestByOldMd.get(oldSlug)
    return { oldSlug, title: meta?.title ?? oldSlug, url: meta?.url ?? '' }
  })
  const mdNewSlugs = allocateMachineProSlugs(mdRows.map((r) => ({ title: r.title, url: r.url })))
  mdRows.forEach((row, i) => {
    if (!row.url) return
    if (row.oldSlug !== mdNewSlugs[i]) {
      renames.push({ ...row, newSlug: mdNewSlugs[i], kind: 'md' })
    }
  })

  console.log(`${dryRun ? 'Would rename' : 'Renaming'} ${renames.length} items…`)
  for (const row of renames) {
    console.log(`  [${row.kind}] ${row.oldSlug}`)
    console.log(`    → ${row.newSlug}`)
    if (dryRun) continue

    if (row.kind === 'html') {
      const oldDir = path.join(PAGES_DIR, row.oldSlug)
      const newDir = path.join(PAGES_DIR, row.newSlug)
      if (fs.existsSync(newDir)) {
        console.warn(`    collision — exists: ${row.newSlug}`)
        continue
      }
      await fsp.rename(oldDir, newDir)
      const metaPath = path.join(newDir, 'meta.json')
      const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
      meta.slug = row.newSlug
      await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8')
    } else {
      const oldPath = path.join(OUT_DIR, `${row.oldSlug}.md`)
      const newPath = path.join(OUT_DIR, `${row.newSlug}.md`)
      if (fs.existsSync(newPath)) {
        console.warn(`    collision — exists: ${row.newSlug}.md`)
        continue
      }
      await fsp.rename(oldPath, newPath)
    }
  }

  if (!dryRun && fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'))
    /** @type {Map<string, string>} */
    const urlToSlug = new Map()
    for (const row of renames) {
      if (row.url) urlToSlug.set(row.url, row.newSlug)
    }
    for (const row of manifest.exported ?? []) {
      const newSlug =
        urlToSlug.get(row.url) ??
        (row.url ? machineProSlotNameSlug(row.title, row.url) : row.slug)
      const format = row.format === 'html' ? 'html' : 'md'
      Object.assign(row, manifestPaths(row.url, row.title, newSlug, format))
    }
    await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    console.log(`Updated ${path.relative(REPO_ROOT, MANIFEST_PATH)}`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
