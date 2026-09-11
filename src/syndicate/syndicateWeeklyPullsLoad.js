import {
  WEEKLY_PULL_ROLLUP,
  WEEKLY_PULLS,
  resolveWeeklyPullStatus,
} from './syndicateWeeklyPulls.js'

function laterIso(a, b) {
  const am = a ? Date.parse(a) : NaN
  const bm = b ? Date.parse(b) : NaN
  if (!Number.isFinite(am)) return b || null
  if (!Number.isFinite(bm)) return a || null
  return am >= bm ? a : b
}

async function probeTableFreshness(supabase, pull) {
  let q = supabase.from(pull.table).select(pull.timeCol).order(pull.timeCol, { ascending: false }).limit(1)
  if (pull.skipOverrides) q = q.eq('is_custom_override', false)
  if (pull.notesLike) q = q.like('notes', pull.notesLike)
  if (pull.notesIlike) q = q.ilike('notes', pull.notesIlike)
  if (pull.notesNotIlike) q = q.not('notes', 'ilike', pull.notesNotIlike)

  const { data, error } = await q
  if (error && pull.fallbackTimeCol) {
    let q2 = supabase
      .from(pull.table)
      .select(pull.fallbackTimeCol)
      .order(pull.fallbackTimeCol, { ascending: false })
      .limit(1)
    if (pull.skipOverrides) q2 = q2.eq('is_custom_override', false)
    const retry = await q2
    if (retry.error) return { at: null, rowsHint: retry.error.message, error: retry.error.message }
    return { at: retry.data?.[0]?.[pull.fallbackTimeCol] || null, rowsHint: null }
  }
  if (error) return { at: null, rowsHint: error.message, error: error.message }
  return { at: data?.[0]?.[pull.timeCol] || null, rowsHint: null }
}

export async function loadWeeklyPullBoard(supabase) {
  const jobIds = [...WEEKLY_PULLS.map((p) => p.jobId), WEEKLY_PULL_ROLLUP.jobId]
  const { data: beats, error: beatErr } = await supabase
    .from('admin_ops_job_heartbeats')
    .select('job_id, last_success_at, last_failure_at, last_status, last_detail, updated_at')
    .in('job_id', jobIds)

  const beatById = new Map((beats || []).map((row) => [row.job_id, row]))

  const rows = []
  for (const pull of WEEKLY_PULLS) {
    const probe = await probeTableFreshness(supabase, pull)
    const beat = beatById.get(pull.jobId)
    const lastOkAt = laterIso(beat?.last_success_at, probe.at)
    const lastFailAt = beat?.last_failure_at || null
    const lastStatus = beat?.last_status || (probe.at ? 'ok' : 'unknown')
    const status = resolveWeeklyPullStatus({
      lastOkAt,
      lastFailAt,
      lastStatus,
    })
    rows.push({
      ...pull,
      status,
      lastOkAt,
      lastFailAt,
      lastStatus,
      source: beat?.last_success_at || beat?.last_failure_at ? 'heartbeat' : probe.at ? 'table' : 'none',
      tableError: probe.error || null,
      message: beat?.last_detail?.message || probe.error || null,
    })
  }

  const rollBeat = beatById.get(WEEKLY_PULL_ROLLUP.jobId)
  const rollup = {
    ...WEEKLY_PULL_ROLLUP,
    status: resolveWeeklyPullStatus({
      lastOkAt: rollBeat?.last_success_at || null,
      lastFailAt: rollBeat?.last_failure_at || null,
      lastStatus: rollBeat?.last_status || 'unknown',
    }),
    lastOkAt: rollBeat?.last_success_at || null,
    lastFailAt: rollBeat?.last_failure_at || null,
    lastStatus: rollBeat?.last_status || 'unknown',
    source: rollBeat ? 'heartbeat' : 'none',
    message: rollBeat?.last_detail?.message || (beatErr ? beatErr.message : null),
  }

  return { rows, rollup, beatError: beatErr?.message || null }
}
