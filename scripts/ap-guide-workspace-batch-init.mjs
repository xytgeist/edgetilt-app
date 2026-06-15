/**
 * Build / refresh ap-guide-workspace/_batch-progress.json
 *
 * Usage:
 *   node scripts/ap-guide-workspace-batch-init.mjs
 *   node scripts/ap-guide-workspace-batch-init.mjs --force
 */
import { initBatchProgress, PROGRESS_PATH } from './lib/apGuideWorkspaceBatch.mjs'

const force = process.argv.includes('--force')

try {
  const { doc } = await initBatchProgress({ force })
  console.log(`Wrote ${PROGRESS_PATH}`)
  console.log(JSON.stringify(doc.stats, null, 2))
  console.log(`\nBatch 0 (${doc.batch0.items.length} updates):`)
  for (const item of doc.batch0.items) {
    console.log(`  - ${item.guideSlug} ← ${item.workspaceFolder}${item.note ? ` (${item.note})` : ''}`)
  }
  console.log(`\nCreate batches: ${doc.batches.length} × ${doc.batchSize} = ${doc.stats.toCreate} cards`)
  console.log(`First batch folders:`)
  for (const slug of doc.batches[0]?.planned ?? []) console.log(`  - ${slug}`)
} catch (err) {
  if (!force && String(err.message).includes('Progress file exists')) {
    console.error(err.message)
    console.error('Use --force to rebuild the queue (does not undo ingested guides).')
  } else {
    console.error(err instanceof Error ? err.message : err)
  }
  process.exit(1)
}
