import { useCallback, useEffect, useState } from 'react'
import {
  fetchOpsMonitorBillingDrift,
  fetchOpsMonitorScheduledJobs,
} from './opsMonitorApi.js'

const KNOWN_GAPS = [
  {
    id: 'send_due_offer_reminders',
    label: 'Offer push reminders',
    schedule_hint: 'Edge fn exists · no pg_cron in repo',
    runbook_id: 'prod-checklist',
    critical: true,
  },
  {
    id: 'poker_catalog_sync_production',
    label: 'Poker catalog sync',
    schedule_hint: 'GitHub Actions only — add heartbeat in v2',
    runbook_id: 'prod-checklist',
    critical: false,
  },
]

/** @param {object | null} driftData @param {object | null} jobsData @param {string} [jobsError] */
function mergeSystemHealth(driftData, jobsData, jobsError = '') {
  const drift = driftData?.billing_drift || []
  const driftCount = drift.length
  const jobs = jobsData?.scheduled_jobs || []
  const jobsOk = jobsData?.jobs_ok ?? jobs.filter((j) => j.health === 'ok').length
  const jobsIssue =
    jobsData?.jobs_issue ??
    jobs.filter((j) => ['failed', 'stale', 'unscheduled'].includes(j.health)).length
  const jobsTotal = jobsData?.jobs_total ?? jobs.length

  let overall = 'ok'
  if (driftCount > 0) overall = 'critical'
  else if (jobsIssue > 0) overall = 'warn'

  return {
    generated_at: driftData?.generated_at || jobsData?.generated_at || new Date().toISOString(),
    summary: {
      overall,
      jobs_ok: jobsOk,
      jobs_issue: jobsIssue,
      drift_cases: driftCount,
      jobs_total: jobsTotal,
    },
    billing_drift: drift,
    scheduled_jobs: jobs,
    known_gaps: KNOWN_GAPS,
    jobs_error: jobsError || null,
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient | null | undefined} supabaseClient
 * @param {{ enabled?: boolean, autoRefreshMs?: number }} [opts]
 */
export function useEdgeMonitorSystemHealth(supabaseClient, opts = {}) {
  const { enabled = true, autoRefreshMs = 0 } = opts
  const [systemHealth, setSystemHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled || !supabaseClient) {
        setLoading(false)
        return
      }
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError('')

      const [driftRes, jobsRes] = await Promise.all([
        fetchOpsMonitorBillingDrift(supabaseClient),
        fetchOpsMonitorScheduledJobs(supabaseClient),
      ])

      const driftErr = driftRes.error?.message || ''
      const jobsErr = jobsRes.error?.message || ''

      if (driftErr && jobsErr) {
        setError(driftErr || jobsErr)
        setSystemHealth(null)
      } else {
        setSystemHealth(
          mergeSystemHealth(driftRes.data, jobsRes.data, jobsErr || ''),
        )
        setError(driftErr || '')
      }

      setLoading(false)
      setRefreshing(false)
    },
    [enabled, supabaseClient],
  )

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    if (!autoRefreshMs || autoRefreshMs < 5_000 || !enabled || !supabaseClient) return undefined
    const id = window.setInterval(() => void load(true), autoRefreshMs)
    return () => window.clearInterval(id)
  }, [autoRefreshMs, enabled, load, supabaseClient])

  return { systemHealth, loading, error, refreshing, load }
}
