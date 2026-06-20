/**
 * Audit batch synth payloads (and optional published backup) for Ryan voice — especially Risk & How to check.
 *
 * Usage:
 *   node scripts/ap-guide-voice-audit-payloads.mjs
 *   node scripts/ap-guide-voice-audit-payloads.mjs --backup ap-guide-workspace/_guide-backups/latest.json
 *   node scripts/ap-guide-voice-audit-payloads.mjs --strict   # exit 1 if any batch payload fails
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import {
  findHowToCheckSuperfluity,
  findRiskSuperfluity,
  findHowToCheckSuperfluityInMarkdown,
  findRiskSuperfluityInMarkdown,
  RYAN_EDITED_VOICE_AUDIT,
} from './lib/apGuideVoiceRules.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const strict = process.argv.includes('--strict')
const backupArg = process.argv.find((a) => a.startsWith('--backup='))?.split('=')[1]

/** @returns {Array<{ batch: number, slug: string, payload: Record<string, unknown> }>} */
function loadAllBatchPayloads() {
  const lib = path.join(__dirname, 'lib')
  /** @type {Array<{ batch: number, slug: string, payload: Record<string, unknown> }>} */
  const out = []
  for (const name of fs.readdirSync(lib)) {
    const m = /^apGuideBatch(\d+)Payloads\.mjs$/.exec(name)
    if (!m) continue
    const batch = Number(m[1])
    // dynamic import at audit time
    out.push({ batch, pending: name })
  }
  return out
}

/** @param {string} name @param {number} batch */
async function importBatch(name, batch) {
  const mod = await import(`./lib/${name}`)
  const key = `BATCH${batch}_PAYLOADS`
  const payloads = mod[key] ?? []
  return payloads.map((p) => ({
    batch,
    slug: String(p.machine.slug),
    payload: p,
  }))
}

/**
 * @param {Record<string, unknown>} payload
 */
function auditPayloadFields(payload) {
  const g = payload.guide ?? {}
  const htc = findHowToCheckSuperfluity(String(g.how_to_check ?? ''))
  const risk = findRiskSuperfluity(String(g.risk_summary ?? ''))
  return { htc, risk }
}

/**
 * @param {string} md
 */
function auditMarkdown(md) {
  return {
    htc: findHowToCheckSuperfluityInMarkdown(md),
    risk: findRiskSuperfluityInMarkdown(md),
  }
}

/** @type {Array<{ source: string, slug: string, batch?: number, htc: string[], risk: string[] }>} */
const findings = []

for (const entry of loadAllBatchPayloads()) {
  const rows = await importBatch(entry.pending, entry.batch)
  for (const { batch, slug, payload } of rows) {
    const { htc, risk } = auditPayloadFields(payload)
    if (htc.length || risk.length) {
      findings.push({ source: `batch-${batch}-payload`, batch, slug, htc, risk })
    }
  }
}

if (backupArg) {
  const backupPath = path.isAbsolute(backupArg) ? backupArg : path.join(root, backupArg)
  const doc = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  const guides = doc.guides ?? doc
  for (const g of guides) {
    const md = g.content_markdown ?? ''
    const { htc, risk } = auditMarkdown(md)
    if (htc.length || risk.length) {
      findings.push({ source: 'published-backup', slug: g.slug, htc, risk })
    }
  }
}

console.log(`Ryan voice audit — Risk & How to check (${RYAN_EDITED_VOICE_AUDIT.patterns.riskSection?.slice(0, 40) ?? 'batch synth caps'})`)
console.log(`Payload files scanned: ${loadAllBatchPayloads().length} batches`)
console.log(`Findings: ${findings.length}\n`)

const byKind = { htc: 0, risk: 0 }
for (const f of findings) {
  if (f.htc.length) byKind.htc++
  if (f.risk.length) byKind.risk++
  console.log(`${f.source}${f.batch ? ` #${f.batch}` : ''} · ${f.slug}`)
  if (f.htc.length) console.log(`  How to check: ${f.htc.join(', ')}`)
  if (f.risk.length) console.log(`  Risk: ${f.risk.join(', ')}`)
}

console.log(`\nCards flagged — How to check: ${byKind.htc}, Risk: ${byKind.risk}`)
console.log('Note: published-backup flags are advisory (Ryan MHB cards may exceed batch caps).')

if (strict && findings.some((f) => f.source.startsWith('batch-'))) {
  process.exit(1)
}
