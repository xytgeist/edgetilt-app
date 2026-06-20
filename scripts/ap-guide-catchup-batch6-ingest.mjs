/**
 * Ingest batch 6 catch-up slugs (easy-money-deluxe, egyptian-gems-rise-of-pharoah-rise-of-queen).
 * Usage: node scripts/ap-guide-catchup-batch6-ingest.mjs
 */
import { CATCHUP_BATCH6_PAYLOADS } from './lib/apGuideCatchupBatch6Payloads.mjs'
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
  findOakShorthand,
  bankrollStartsWithUnits,
} from './lib/apGuideVoiceRules.mjs'
import {
  readBatchProgress,
  writeBatchProgress,
  moveWorkspaceFolderToDone,
} from './lib/apGuideWorkspaceBatch.mjs'

const failures = []
const completed = []

for (const payload of CATCHUP_BATCH6_PAYLOADS) {
  const slug = String(payload.machine.slug)
  const md = buildGuideMarkdown({ ...payload, diagrams: [] })
  const bad = [
    ...findForbiddenSourceRefs(md),
    ...findTravelLanguage(md),
    ...findWtfScoutFiller(md),
    ...findGameplayApCopy(md),
    ...findAiTells(md),
    ...findWhenToStopBrokeTalk(md),
    ...findRiskWalkAway(md),
    ...findWeakBankrollLead(md),
    ...findOakShorthand(md),
  ]
  if (!bankrollStartsWithUnits(String(payload.guide?.risk_bankroll ?? ''))) {
    failures.push(`${slug}: bankroll must lead with unit count`)
    continue
  }
  if (bad.length) {
    failures.push(`${slug}: voice check (${bad.join(', ')})`)
    continue
  }

  try {
    const out = await runSlotGuideIngest({
      payload,
      target: 'test',
      writeRepo: false,
      syncSupabase: true,
    })
    if (!out.ok) throw new Error(out.errors?.join('; ') || 'ingest failed')
    completed.push(slug)
    await moveWorkspaceFolderToDone(slug)
    console.log(`✓ ${slug}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    failures.push(`${slug}: ${msg}`)
    console.error(`✗ ${slug}: ${msg}`)
  }
}

const doc = await readBatchProgress()
const batch6 = doc.batches.find((b) => b.batch === 6)
if (batch6) {
  for (const slug of completed) {
    batch6.skipped = (batch6.skipped ?? []).filter((s) => s.slug !== slug)
    if (!batch6.completed.some((c) => c.slug === slug)) {
      batch6.completed.push({ slug, at: new Date().toISOString() })
    }
  }
  doc.updatedAt = new Date().toISOString()
  await writeBatchProgress(doc)
}

console.log(`\nCatch-up: ${completed.length} created, ${failures.length} failed`)
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
