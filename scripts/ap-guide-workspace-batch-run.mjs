/**
 * Ingest one batch of AP guides from prebuilt payloads.
 * Usage: node scripts/ap-guide-workspace-batch-run.mjs <batchNumber>
 *
 * DESTRUCTIVE on test: overwrites guides.content_markdown from repo payloads.
 * Ryan must explicitly request a batch run. Backup first:
 *   node scripts/ap-guide-backup-test-guides.mjs --all-batch
 * See AGENTS.md AGENT_RULE_TEST_IS_PROD.
 */
import { runSlotGuideIngest } from './lib/runSlotGuideIngest.mjs'
import { buildGuideMarkdown } from './lib/slotGuideIngestCore.mjs'
import {
  findAiTells,
  findForbiddenSourceRefs,
  findGameplayApCopy,
  findTravelLanguage,
  findWhenToStopBrokeTalk,
  findRiskWalkAway,
  findWeakBankrollLead,
  findWtfScoutFiller,
  findMarkdownInEvThreshold,
  findBankrollExtraProse,
  findHowToCheckSuperfluity,
  findRiskSuperfluity,
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

const skippedSlugs = new Set((batch.skipped ?? []).map((s) => s.slug))

for (const folderSlug of batch.planned) {
  if (skippedSlugs.has(folderSlug)) {
    console.log(`– ${folderSlug} (skipped)`)
    continue
  }

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
  const badWalk = findRiskWalkAway(md)
  const badBankroll = findWeakBankrollLead(md)
  const badEvThreshold = findMarkdownInEvThreshold(String(payload.guide?.card_ev_threshold ?? ''))
  const badBankrollOnly = findBankrollExtraProse(String(payload.guide?.risk_bankroll ?? ''))
  const badHtc = findHowToCheckSuperfluity(String(payload.guide?.how_to_check ?? ''))
  const badRisk = findRiskSuperfluity(String(payload.guide?.risk_summary ?? ''))
  if (badBankrollOnly.length) {
    failures.push(`${folderSlug}: bankroll must be unit count only (${badBankrollOnly.join(', ')})`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: badBankrollOnly.join(', ') })
    continue
  }
  if (/\*\*Summary:\*\*/i.test(md)) {
    failures.push(`${folderSlug}: contains WtF Summary line`)
    batch.failed.push({ slug: folderSlug, at: new Date().toISOString(), reason: 'wtf-summary' })
    continue
  }
  if (
    badSrc.length ||
    badTravel.length ||
    badWtf.length ||
    badGameplay.length ||
    badAi.length ||
    badStop.length ||
    badWalk.length ||
    badBankroll.length ||
    badEvThreshold.length ||
    badHtc.length ||
    badRisk.length
  ) {
    failures.push(
      `${folderSlug}: voice check failed (${[...badSrc, ...badTravel, ...badWtf, ...badGameplay, ...badAi, ...badStop, ...badWalk, ...badBankroll, ...badEvThreshold, ...badHtc, ...badRisk].join(', ')})`,
    )
    batch.failed.push({
      slug: folderSlug,
      at: new Date().toISOString(),
      reason: `voice: ${[...badSrc, ...badTravel, ...badWtf, ...badGameplay, ...badAi, ...badStop, ...badWalk, ...badBankroll, ...badEvThreshold, ...badHtc, ...badRisk].join(', ')}`,
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

const done = batch.completed.length + batch.failed.length + (batch.skipped?.length ?? 0)
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
