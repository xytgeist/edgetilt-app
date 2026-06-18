/**
 * Re-push guide payloads to test (no workspace archive).
 * Usage: node scripts/ap-guide-reingest-payloads.mjs [--force] [batchNumber...]
 *
 * WARNING: Overwrites guides.content_markdown on test from repo payloads.
 * Pull form edits to payloads first (ap-guide-sync-test-to-payloads.mjs) or use --force knowingly.
 */
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import {
  bankrollStartsWithUnits,
  findAiTells,
  findForbiddenSourceRefs,
  findGameplayApCopy,
  findRiskWalkAway,
  findTravelLanguage,
  findWeakBankrollLead,
  findWhenToStopBrokeTalk,
  findWtfScoutFiller,
} from './lib/apGuideVoiceRules.mjs'
import { BATCH1_PAYLOADS } from './lib/apGuideBatch1Payloads.mjs'
import { BATCH2_PAYLOADS } from './lib/apGuideBatch2Payloads.mjs'
import { BATCH3_PAYLOADS } from './lib/apGuideBatch3Payloads.mjs'

const BATCH_PAYLOAD_IMPORTS = [1, 2, 3, 4, 5, 6]

const argv = process.argv.slice(2)
const force = argv.includes('--force')
const batches = argv.map(Number).filter((n) => n >= 1)

if (!force) {
  console.error(
    'Refusing to re-ingest without --force (overwrites test DB guides.content_markdown).\n' +
      'If you edited in /slot-guide-form, run: node scripts/ap-guide-sync-test-to-payloads.mjs\n' +
      'Usage: node scripts/ap-guide-reingest-payloads.mjs --force [batchNumber...]',
  )
  process.exit(1)
}
/** @type {typeof BATCH1_PAYLOADS} */
let payloads = []
if (batches.length) {
  for (const n of batches) {
    const mod = await import(`./lib/apGuideBatch${n}Payloads.mjs`)
    payloads.push(...mod[`BATCH${n}_PAYLOADS`])
  }
} else {
  for (const n of BATCH_PAYLOAD_IMPORTS) {
    const mod = await import(`./lib/apGuideBatch${n}Payloads.mjs`)
    payloads.push(...mod[`BATCH${n}_PAYLOADS`])
  }
}

for (const payload of payloads) {
  const slug = String(payload.machine.slug)
  const md = buildGuideMarkdown({ ...payload, diagrams: payload.diagrams ?? [] })
  if (!bankrollStartsWithUnits(String(payload.guide.risk_bankroll))) {
    throw new Error(`${slug}: bankroll must lead with units`)
  }
  const bad = [
    ...findForbiddenSourceRefs(md),
    ...findTravelLanguage(md),
    ...findWtfScoutFiller(md),
    ...findGameplayApCopy(md),
    ...findAiTells(md),
    ...findWhenToStopBrokeTalk(md),
    ...findRiskWalkAway(md),
    ...findWeakBankrollLead(md),
  ]
  if (bad.length) throw new Error(`${slug}: voice check: ${bad.join(', ')}`)

  const out = await runSlotGuideIngest({
    payload,
    target: 'test',
    writeRepo: false,
    syncSupabase: true,
  })
  if (!out.ok) throw new Error(`${slug}: ${out.errors?.join('; ')}`)
  console.log(`Updated ${slug}`)
}
