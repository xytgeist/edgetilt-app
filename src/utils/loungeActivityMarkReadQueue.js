/** @typedef {{ activityEventId?: string | null, activityBatchId?: string | null }} LoungeActivityMarkReadItem */

/** @type {LoungeActivityMarkReadItem[]} */
let pending = []

function markReadKey(item) {
  const batchId = String(item?.activityBatchId || '').trim()
  if (batchId) return `batch:${batchId}`
  const eventId = String(item?.activityEventId || '').trim()
  if (eventId) return `event:${eventId}`
  return ''
}

/** Queue mark-read until the Lounge session is ready (push tap / cold start). */
export function queueLoungeActivityMarkRead(item) {
  const key = markReadKey(item)
  if (!key) return
  if (pending.some((p) => markReadKey(p) === key)) return
  pending.push({
    activityEventId: item?.activityEventId ? String(item.activityEventId) : null,
    activityBatchId: item?.activityBatchId ? String(item.activityBatchId) : null,
  })
}

export function drainLoungeActivityMarkReadQueue() {
  return pending.splice(0)
}
