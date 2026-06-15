/**
 * Scaffold ap-guide-workspace/ with one empty folder per unique export slug.
 * You manually copy site mirror folders into each game directory.
 *
 * Usage:
 *   npm run ap-guide:workspace:init
 *   npm run ap-guide:workspace:init -- --clean
 */
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { AP_GUIDE_SOURCES, loadAllExportEntries } from './lib/apGuideSources.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const WORKSPACE_ROOT = path.join(REPO_ROOT, 'ap-guide-workspace')

function parseArgs(argv) {
  return { clean: argv.includes('--clean') }
}

/** @param {string} dir */
async function ensureEmptyGameDir(dir) {
  await fsp.mkdir(dir, { recursive: true })
  const entries = await fsp.readdir(dir)
  if (entries.length === 0) {
    await fsp.writeFile(path.join(dir, '.gitkeep'), '', 'utf8')
  }
}

function buildSourceIndex(entries) {
  /** @type {Map<string, { slug: string, bySite: Map<string, { folder: string, title: string, exportPath: string, url: string }> }>} */
  const bySlug = new Map()

  for (const row of entries) {
    const slug = row.folder
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { slug, bySite: new Map() })
    }
    const group = bySlug.get(slug)
    const sourceDef = AP_GUIDE_SOURCES.find((s) => s.id === row.source)
    group.bySite.set(row.source, {
      folder: row.folder,
      title: row.title,
      exportPath: sourceDef ? `${sourceDef.dir}/${row.folder}/` : `${row.folder}/`,
      url: row.url,
    })
  }

  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug))
}

function readmeText(slugCount, guideCount) {
  return `# AP guide workspace

One **empty folder per unique export slug** (${slugCount} folders from ${guideCount} mirrored guides).

You combine sources manually ... copy whole mirror folders from the site exports into the game folder you want.

## Site exports (copy FROM)

| Site | Path |
| --- | --- |
| Machine Pro | \`machinepro-export/pages/<slug>/\` |
| Advantage Slots | \`advantageslots-export/pages/<slug>/\` |
| AdvantagePlay | \`advantageplay-export/pages/<slug>/\` |
| SlotFarmers | \`slotfarmers-export/pages/<slug>/\` |

Each mirror folder contains \`index.html\`, \`meta.json\`, and \`images/\`.

## Suggested layout (YOU fill this in)

When a game matches across sites, copy each site mirror **into the same game folder**:

\`\`\`text
ap-guide-workspace/
  buffalo-link/
    machinepro/       ← copy machinepro-export/pages/buffalo-link/
    advantageslots/   ← copy advantageslots-export/pages/buffalo-link/
    advantageplay/    ← copy advantageplay-export/pages/buffalo-link-advantage-play/  (slug may differ!)
    slotfarmers/      ← copy slotfarmers-export/pages/buffalo-link/
    REWRITE.md        ← optional: your Edge guide draft
\`\`\`

Same game often has **different folder slugs** on different sites (e.g. \`buffalo-ascension\` vs \`buffalo-ascension-advantage-play\`). Use **_SOURCE-INDEX.md** to find them, then merge into one game folder and delete the extra empty scaffold folder if you want.

## Files in this workspace

| File | Purpose |
| --- | --- |
| **_SOURCE-INDEX.md** | Every mirrored guide, grouped by site and by slug |
| **<slug>/** | Empty scaffold ... your combined game workspace |

## Re-scaffold

\`\`\`bash
npm run ap-guide:workspace:init          # add missing empty dirs only
npm run ap-guide:workspace:init -- --clean   # wipe workspace and rebuild empty dirs
\`\`\`

**Warning:** \`--clean\` deletes everything under \`ap-guide-workspace/\` except it rebuilds empty dirs + index files.
`
}

function formatSourceIndex(slugs) {
  const lines = [
    '# AP guide source index',
    '',
    'Use this while manually combining mirrors. Paths are relative to the repo root.',
    '',
    '## By site',
    '',
  ]

  for (const source of AP_GUIDE_SOURCES) {
    const rows = slugs
      .filter((s) => s.bySite.has(source.id))
      .map((s) => {
        const info = s.bySite.get(source.id)
        return { slug: s.slug, ...info }
      })
      .sort((a, b) => a.title.localeCompare(b.title))

    lines.push(`### ${source.label} (${rows.length})`, '')
    lines.push('| Title | Export folder | Workspace scaffold |')
    lines.push('| --- | --- | --- |')
    for (const r of rows) {
      lines.push(`| ${r.title} | \`${r.exportPath}\` | \`${r.slug}/\` |`)
    }
    lines.push('')
  }

  lines.push('## By slug (same name on multiple sites)', '')
  lines.push('| Slug | Sites | Titles |')
  lines.push('| --- | --- | --- |')
  for (const s of slugs) {
    if (s.bySite.size < 2) continue
    const sites = [...s.bySite.keys()].join(', ')
    const titles = [...s.bySite.values()].map((v) => v.title).join(' / ')
    lines.push(`| \`${s.slug}\` | ${sites} | ${titles} |`)
  }
  lines.push('')

  lines.push('## All slugs (alphabetical)', '')
  lines.push('| Slug | # sites |')
  lines.push('| --- | ---: |')
  for (const s of slugs) {
    lines.push(`| \`${s.slug}\` | ${s.bySite.size} |`)
  }
  lines.push('')

  return `${lines.join('\n')}\n`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const { entries } = await loadAllExportEntries(REPO_ROOT)
  const slugs = buildSourceIndex(entries)

  if (opts.clean && fs.existsSync(WORKSPACE_ROOT)) {
    await fsp.rm(WORKSPACE_ROOT, { recursive: true, force: true })
  }

  await fsp.mkdir(WORKSPACE_ROOT, { recursive: true })

  let created = 0
  let skipped = 0
  for (const s of slugs) {
    const dir = path.join(WORKSPACE_ROOT, s.slug)
    if (fs.existsSync(dir)) {
      skipped += 1
      continue
    }
    await ensureEmptyGameDir(dir)
    created += 1
  }

  await fsp.writeFile(path.join(WORKSPACE_ROOT, 'README.md'), readmeText(slugs.length, entries.length), 'utf8')
  await fsp.writeFile(path.join(WORKSPACE_ROOT, '_SOURCE-INDEX.md'), formatSourceIndex(slugs), 'utf8')

  console.log('AP guide workspace scaffold')
  console.log(`  ${path.relative(REPO_ROOT, WORKSPACE_ROOT)}/`)
  console.log(`  ${slugs.length} game folders (${created} created, ${skipped} already existed)`)
  console.log(`  README.md + _SOURCE-INDEX.md`)
  console.log('\nCopy site mirror folders into each game directory by hand.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
