/**
 * Ingest one batch of AP guides from prebuilt payloads.
 * Usage: node scripts/ap-guide-workspace-batch-run.mjs <batchNumber>
 */
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import {
  findAiTells,
  findForbiddenSourceRefs,
  findGameplayApCopy,
  findTravelLanguage,
  findWhenToStopBrokeTalk,
  findWeakBankrollLead,
  findWtfScoutFiller,
  bankrollStartsWithUnits,
} from './lib/apGuideVoiceRules.mjs'
import {
  readBatchProgress,
  writeBatchProgress,
  moveWorkspaceFolderToDone,
} from './lib/apGuideWorkspaceBatch.mjs'

const batchNum = Number(process.argv[2])
if (!Number.isInteger(batchNum) || batchNum < 1) {
  console.error('Usage: node scripts/ap-guide-workspace-batch-run.mjs <batchNumber>')
  process.exit(1)
}

/** @param {number} n */
async function loadBatchPayloads(n) {
  try {
    const mod = await import(`./lib/apGuideBatch${n}Payloads.mjs`)
    const key = `BATCH${n}_PAYLOADS`
    if (!mod[key]?.length) throw new Error(`empty ${key}`)
    return mod[key]
  } catch (err) {
    throw new Error(`No payloads for batch ${n} (scripts/lib/apGuideBatch${n}Payloads.mjs): ${err instanceof Error ? err.message : err}`)
  }
}

const payloads = await loadBatchPayloads(batchNum)

const doc = await readBatchProgress()
const batch = doc.batches.find((b) => b.batch === batchNum)
if (!batch) throw new Error(`Batch ${batchNum} not found in progress file`)

/** @type {Record<string, (typeof payloads)[0]>} */
const payloadBySlug = Object.fromEntries(payloads.map((p) => [p.machine.slug, p]))

/** @type {string[]} */
const failures = []
/** @type {string[]} */
const completed = []

for (const folderSlug of batch.planned) {
  const payload = payloadBySlug[folderSlug]
  if (!payload) {
    failures.push(`${folderSlug}: no payload`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: 'no-payload' })
    continue
  }

  const md = buildGuideMarkdown({ ...payload, diagrams: payload.diagrams ?? [] })
  const badSrc = findForbiddenSourceRefs(md)
  const badTravel = findTravelLanguage(md)
  const badWtf = findWtfScoutFiller(md)
  const badGameplay = findGameplayApCopy(md)
  const badAi = findAiTells(md)
  const badStop = findWhenToStopBrokeTalk(md)
  const badBankroll = findWeakBankrollLead(md)
  if (!bankrollStartsWithUnits(String(payload.guide?.risk_bankroll ?? ''))) {
    failures.push(`${folderSlug}: bankroll must lead with unit count`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: 'bankroll-units' })
    continue
  }
  if (/\*\*Summary:\*\*/i.test(md)) {
    failures.push(`${folderSlug}: contains WtF Summary line`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: 'wtf-summary' })
    continue
  }
  if (badSrc.length || badTravel.length || badWtf.length || badGameplay.length || badAi.length || badStop.length || badBankroll.length) {
    failures.push(
      `${folderSlug}: voice check failed (${[...badSrc, ...badTravel, ...badWtf, ...badGameplay, ...badAi, ...badStop, ...badBankroll].join(', ')})`,
    )
    batch.failed.push({
      slug: folderSlug,
      at: new Date().toISOString(),
      reason: `voice: ${[...badSrc, ...badTravel, ...badWtf, ...badGameplay, ...badAi, ...badStop, ...badBankroll].join(', ')}`,
    })
    continue
  }

  try {
    const out = await runSlotGuideIngest({
      payload,
      target: 'test',
      writeRepo: false,
      syncSupabase: true,
    })
    if (!out.ok) {
      throw new Error(out.errors?.join('; ') || 'ingest failed')
    }

    batch.completed.push({ slug: folderSlug, at: new Date().toISOString() })
    completed.push(folderSlug)
    await moveWorkspaceFolderToDone(folderSlug)
    console.log(`✓ ${folderSlug}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${folderSlug}: ${msg}`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: msg })
    console.error(`✗ ${folderSlug}: ${msg}`)
  }
}

const done = batch.completed.length + batch.failed.length
if (done >= batch.planned.length) {
  batch.status = batch.failed.length ? 'completed-with-failures' : 'completed'
}
doc.next = { phase: `batch${batchNum + 1}`, batch: batchNum + 1 }
doc.updatedAt = new Date().toISOString()
await writeBatchProgress(doc)

console.log(`\nBatch ${batchNum}: ${completed.length} created, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
