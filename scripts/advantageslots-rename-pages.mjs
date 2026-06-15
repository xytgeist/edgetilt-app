/**
 * Rename advantageslots-export/pages/* to short slot-name slugs.
 *
 *   node scripts/advantageslots-rename-pages.mjs
 *   node scripts/advantageslots-rename-pages.mjs --dry-run
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { allocateSlotSlugs, slotNameSlug } from './lib/exportSlotSlug.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const PAGES_DIR = path.join(REPO_ROOT, 'advantageslots-export', 'pages')
const MANIFEST_PATH = path.join(REPO_ROOT, 'advantageslots-export', 'manifest.json')

function relWin(subpath) {
  return subpath.split('/').join('\\')
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const entries = await fsp.readdir(PAGES_DIR, { withFileTypes: true })
  /** @type {{ oldSlug: string, title: string, url: string }[]} */
  const rows = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const metaPath = path.join(PAGES_DIR, entry.name, 'meta.json')
    try {
      const meta = JSON.parse(await fsp.readFile(metaPath, 'utf8'))
      rows.push({ oldSlug: entry.name, title: meta.title, url: meta.url })
    } catch {
      console.warn(`  skip (no meta.json): ${entry.name}`)
    }
  }

  const newSlugs = allocateSlotSlugs(rows)
  /** @type {{ oldSlug: string, newSlug: string, url: string }[]} */
  const renames = rows
    .map((row, i) => ({ oldSlug: row.oldSlug, newSlug: newSlugs[i], url: row.url }))
    .filter(({ oldSlug, newSlug }) => oldSlug !== newSlug)

  console.log(`${dryRun ? 'Would rename' : 'Renaming'} ${renames.length} folders to slot names…`)
  for (const { oldSlug, newSlug } of renames) {
    const newDir = path.join(PAGES_DIR, newSlug)
    if (fs.existsSync(newDir)) {
      console.warn(`  collision — target exists: ${newSlug} (from ${oldSlug})`)
      continue
    }
    console.log(`  ${oldSlug}`)
    console.log(`    → ${newSlug}`)
    if (!dryRun) {
      await fsp.rename(path.join(PAGES_DIR, oldSlug), newDir)
      const meta = JSON.parse(await fsp.readFile(path.join(newDir, 'meta.json'), 'utf8'))
      meta.slug = newSlug
      await fsp.writeFile(path.join(newDir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8')
    }
  }

  if (!dryRun && fs.existsSync(MANIFEST_PATH)) {
    const manifest = JSON.parse(await fsp.readFile(MANIFEST_PATH, 'utf8'))
    for (const row of manifest.exported ?? []) {
      if (row.format !== 'html' || !row.url) continue
      const newSlug = slotNameSlug(row.title, row.url)
      if (/looking-for-a-more-advanced-analysis/i.test(row.url)) {
        row.slug = `${newSlug}-analysis`
      } else {
        row.slug = newSlug
      }
      row.file = relWin(`advantageslots-export/pages/${row.slug}/index.html`)
      row.dir = relWin(`advantageslots-export/pages/${row.slug}`)
    }
    // Fix manifest dupes to match on-disk names from allocate pass
    for (const { url, newSlug } of renames) {
      const row = manifest.exported.find((e) => e.url === url)
      if (row) {
        row.slug = newSlug
        row.file = relWin(`advantageslots-export/pages/${newSlug}/index.html`)
        row.dir = relWin(`advantageslots-export/pages/${newSlug}`)
      }
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
