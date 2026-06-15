/**
 * Mark batch progress after ingest.
 * Usage:
 *   node scripts/ap-guide-workspace-batch-mark.mjs batch0 luckymon-evolutions completed
 *   node scripts/ap-guide-workspace-batch-mark.mjs batch1 5-coin-frenzy-jackpots-tiger-wealth-wukong-wealth completed
 *   node scripts/ap-guide-workspace-batch-mark.mjs batch0 ainsworth-must-hit-by failed "reason"
 */
import {
  readBatchProgress,
  writeBatchProgress,
  PROGRESS_PATH,
  DONE_DIR_NAME,
  moveWorkspaceFolderToDone,
} from './lib/apGuideWorkspaceBatch.mjs'

const [, , phase, slug, status, ...reasonParts] = process.argv
const reason = reasonParts.join(' ').trim() || undefined

if (!phase || !slug || !status) {
  console.error('Usage: node scripts/ap-guide-workspace-batch-mark.mjs <batch0|batchN> <slug> <completed|failed|skipped> [reason]')
  process.exit(1)
}

/** @param {string} folderSlug */
async function archiveIfCompleted(folderSlug) {
  if (!folderSlug) return
  const result = await moveWorkspaceFolderToDone(folderSlug)
  if (result.moved) {
    console.log(`Archived workspace → ${DONE_DIR_NAME}/${folderSlug}`)
  } else if (result.reason === 'already-in-done') {
    console.log(`Workspace already in ${DONE_DIR_NAME}/${folderSlug}`)
  } else if (result.reason !== 'source-missing') {
    console.log(`Archive skip (${folderSlug}): ${result.reason}`)
  }
}

const doc = await readBatchProgress()
const entry = { slug, at: new Date().toISOString(), reason }

/** @type {string | undefined} */
let archiveFolder

if (phase === 'batch0') {
  const item = doc.batch0.items.find((i) => i.guideSlug === slug)
  if (!item) throw new Error(`batch0 item not found: ${slug}`)
  item.status = status
  if (reason) item.reason = reason
  if (status === 'completed') {
    doc.batch0.completed.push(entry)
    archiveFolder = item.workspaceFolder
    const allDone = doc.batch0.items.every((i) => i.status === 'completed')
    if (allDone) {
      doc.batch0.status = 'completed'
      doc.next = { phase: 'batch1', batch: 1 }
    }
  } else if (status === 'failed') {
    doc.batch0.failed.push(entry)
  }
} else if (/^batch\d+$/.test(phase)) {
  const n = Number(phase.replace('batch', ''))
  const batch = doc.batches.find((b) => b.batch === n)
  if (!batch) throw new Error(`batch ${n} not found`)
  if (status === 'completed') {
    batch.completed.push(entry)
    archiveFolder = slug
  } else if (status === 'failed') batch.failed.push(entry)
  else if (status === 'skipped') batch.skipped.push(entry)
  const done = batch.completed.length + batch.failed.length + batch.skipped.length
  if (done >= batch.planned.length) {
    batch.status = batch.failed.length ? 'completed-with-failures' : 'completed'
  }
  doc.next = { phase: `batch${n + 1}`, batch: n + 1 }
} else {
  throw new Error(`Unknown phase: ${phase}`)
}

await writeBatchProgress(doc)
console.log(`Updated ${PROGRESS_PATH}: ${phase} ${slug} → ${status}`)

if (status === 'completed' && archiveFolder) {
  await archiveIfCompleted(archiveFolder)
}
