/** Poker tournament catalog sync helpers for Edge Monitor. */

import { opsMonitorRunbookById } from './opsMonitorRunbooks.js'
import { opsJobHealthClass, opsJobHealthLabel } from './opsMonitorSystemHealth.js'

/**
 * Normalize catalog heartbeat from jobs snapshot (or fall back to scheduled_jobs row).
 * @param {object | null | undefined} systemHealth
 */
export function pokerCatalogMonitorSummary(systemHealth) {
  const fromRpc = systemHealth?.poker_catalog
  if (fromRpc && typeof fromRpc === 'object') {
    return {
      health: fromRpc.health || 'stale',
      lastStatus: fromRpc.last_status || null,
      lastSuccessAt: fromRpc.last_success_at || null,
      lastFailureAt: fromRpc.last_failure_at || null,
      lastStart: fromRpc.last_start || fromRpc.last_success_at || fromRpc.last_failure_at || null,
      hint: fromRpc.hint || '',
      upserted: numOrNull(fromRpc.upserted ?? fromRpc.rows),
      pruned: numOrNull(fromRpc.pruned),
      skipped: numOrNull(fromRpc.skipped),
      mttdbOnline: numOrNull(fromRpc.mttdb_online),
      mttdbLive: numOrNull(fromRpc.mttdb_live),
      rows: numOrNull(fromRpc.rows),
    }
  }

  const job = (systemHealth?.scheduled_jobs || []).find((j) => j.id === 'poker_catalog_sync_production')
  if (!job) return null
  const detail = job.last_detail || {}
  const upsert = detail.upsert || {}
  return {
    health: job.health || 'stale',
    lastStatus: job.last_status || null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastStart: job.last_start || null,
    hint: job.hint || '',
    upserted: numOrNull(upsert.upserted ?? detail.rows),
    pruned: numOrNull(upsert.pruned),
    skipped: numOrNull(upsert.skipped),
    mttdbOnline: numOrNull(detail.mttdbOnlineRows),
    mttdbLive: numOrNull(detail.mttdbLiveRows),
    rows: numOrNull(detail.rows),
  }
}

/** @param {unknown} n */
function numOrNull(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v : null
}

/** @param {ReturnType<typeof pokerCatalogMonitorSummary>} summary */
export function pokerCatalogStatTiles(summary) {
  if (!summary) return []
  return [
    { id: 'upserted', label: 'Upserted', value: summary.upserted, emphasize: true },
    { id: 'online', label: 'MTTDB online', value: summary.mttdbOnline },
    { id: 'live', label: 'MTTDB live', value: summary.mttdbLive },
    { id: 'pruned', label: 'Pruned', value: summary.pruned },
  ]
}

export { opsJobHealthClass, opsJobHealthLabel, opsMonitorRunbookById }
