/**
 * Cross-site AP guide coverage: how many sources have a guide per slot.
 *
 * Usage:
 *   node scripts/ap-guide-coverage.mjs
 *   node scripts/ap-guide-coverage.mjs --json
 *   node scripts/ap-guide-coverage.mjs --min=2
 *   node scripts/ap-guide-coverage.mjs --one-site-only
 */
import fsp from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { AP_GUIDE_SOURCES, buildCoverageRows, loadAllExportEntries } from './lib/apGuideSources.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const SOURCES = AP_GUIDE_SOURCES

function parseArgs(argv) {
  const opts = {
    json: false,
    minSites: 1,
    oneSiteOnly: false,
    out: path.join(REPO_ROOT, 'docs', 'ap-guide-source-coverage.md'),
  }
  for (const arg of argv) {
    if (arg === '--json') opts.json = true
    else if (arg === '--one-site-only') opts.oneSiteOnly = true
    else if (arg.startsWith('--min=')) opts.minSites = Math.max(1, Number(arg.slice(6)) || 1)
    else if (arg.startsWith('--out=')) opts.out = path.resolve(REPO_ROOT, arg.slice(6))
  }
  return opts
}

function formatMarkdown(rows, totals) {
  const lines = [
    '# AP guide source coverage',
    '',
    'Auto-generated from local export mirrors. Re-run: `npm run ap-guide:coverage`',
    '',
    'Matching uses **alias clustering** (URL slug, folder name, quoted titles, combo splits like `A / B`), not strict slug equality.',
    '',
    'For **combining sources when writing cards**, scaffold `ap-guide-workspace/` and copy mirrors by hand: `npm run ap-guide:workspace:init`',
    '',
    '## Summary',
    '',
    `| Source | Guides |`,
    `| --- | ---: |`,
    ...SOURCES.map((s) => `| ${s.label} | ${totals.bySource[s.id] ?? 0} |`),
    '',
    `| Metric | Count |`,
    `| --- | ---: |`,
    `| Unique slots (clustered) | ${rows.length} |`,
    `| On 4 sites | ${rows.filter((r) => r.siteCount === 4).length} |`,
    `| On 3 sites | ${rows.filter((r) => r.siteCount === 3).length} |`,
    `| On 2 sites | ${rows.filter((r) => r.siteCount === 2).length} |`,
    `| On 1 site only | ${rows.filter((r) => r.siteCount === 1).length} |`,
    '',
    '## All slots by site count',
    '',
    '| Sites | Slot | Machine Pro | Advantage Slots | AdvantagePlay | SlotFarmers |',
    '| ---: | --- | --- | --- | --- | --- |',
  ]

  for (const row of rows) {
    const cols = SOURCES.map((s) => (row.sites[s.id] ? '✓' : ''))
    lines.push(`| ${row.siteCount} | ${row.title} | ${cols.join(' | ')} |`)
  }

  return `${lines.join('\n')}\n`
}

function formatOneSiteMarkdown(rows, totals) {
  const oneSite = rows.filter((r) => r.siteCount === 1)
  const lines = [
    '# AP guides — 1 site only',
    '',
    'Auto-generated from local export mirrors. Re-run: `npm run ap-guide:coverage -- --one-site-only`',
    '',
    `Total: **${oneSite.length}** slots appear on only one source (alias clustering).`,
    '',
    '| Site | Count |',
    '| --- | ---: |',
    ...SOURCES.map((s) => {
      const count = oneSite.filter((r) => r.sites[s.id]).length
      return `| ${s.label} | ${count} |`
    }),
    '',
  ]

  for (const source of SOURCES) {
    const siteRows = oneSite
      .filter((r) => r.sites[source.id])
      .sort((a, b) => a.title.localeCompare(b.title))
    lines.push(`## ${source.label} (${siteRows.length})`, '')
    for (const row of siteRows) {
      lines.push(`- ${row.title}`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const { entries: allEntries, totals } = await loadAllExportEntries(REPO_ROOT)

  let coverage = buildCoverageRows(allEntries)
  if (opts.minSites > 1) coverage = coverage.filter((r) => r.siteCount >= opts.minSites)

  if (opts.oneSiteOnly) {
    const outPath = path.join(REPO_ROOT, 'docs', 'ap-guide-1-site-only.md')
    await fsp.mkdir(path.dirname(outPath), { recursive: true })
    await fsp.writeFile(outPath, formatOneSiteMarkdown(coverage, totals), 'utf8')
    const oneSite = coverage.filter((r) => r.siteCount === 1)
    console.log(`Wrote ${path.relative(REPO_ROOT, outPath)} (${oneSite.length} slots)`)
    for (const s of SOURCES) {
      const count = oneSite.filter((r) => r.sites[s.id]).length
      console.log(`  ${s.label}: ${count}`)
    }
    return
  }

  if (opts.json) {
    console.log(JSON.stringify({ totals, coverage }, null, 2))
    return
  }

  await fsp.mkdir(path.dirname(opts.out), { recursive: true })
  await fsp.writeFile(opts.out, formatMarkdown(coverage, totals), 'utf8')

  console.log('AP guide coverage (alias clustering)')
  for (const s of SOURCES) {
    console.log(`  ${s.label}: ${totals.bySource[s.id] ?? 0}`)
  }
  console.log(`  unique slots: ${coverage.length}`)
  console.log(`  4-site overlap: ${coverage.filter((r) => r.siteCount === 4).length}`)
  console.log(`  3-site overlap: ${coverage.filter((r) => r.siteCount === 3).length}`)
  console.log(`  2-site overlap: ${coverage.filter((r) => r.siteCount === 2).length}`)
  console.log(`  1-site only: ${coverage.filter((r) => r.siteCount === 1).length}`)
  console.log(`\nWrote ${path.relative(REPO_ROOT, opts.out)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
