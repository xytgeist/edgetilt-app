import { LOUNGE_REPORT_REASON_IDS } from './loungeReportReasons.js'

const REPORT_SELECT =
  'id,reporter_id,target_kind,target_id,target_user_id,reason,details,status,reviewer_id,reviewed_at,staff_note,created_at,updated_at'

function cleanUuid(value) {
  const id = String(value || '').trim()
  return id || null
}

export async function submitLoungeReport(supabase, payload) {
  const reporterId = cleanUuid(payload?.reporterId)
  const targetKind = String(payload?.targetKind || '').trim()
  const targetId = cleanUuid(payload?.targetId)
  const targetUserId = cleanUuid(payload?.targetUserId)
  const reason = String(payload?.reason || '').trim()
  const details = String(payload?.details || '').trim().slice(0, 1000)

  if (!supabase) throw new Error('Not signed in.')
  if (!reporterId) throw new Error('Sign in to report.')
  if (!['post', 'comment', 'profile'].includes(targetKind)) throw new Error('Invalid report target.')
  if (!targetId) throw new Error('Missing report target.')
  if (!LOUNGE_REPORT_REASON_IDS.has(reason)) throw new Error('Pick a reason.')
  if (targetUserId && targetUserId === reporterId) throw new Error('You cannot report yourself.')

  const row = {
    reporter_id: reporterId,
    target_kind: targetKind,
    target_id: targetId,
    target_user_id: targetUserId,
    reason,
    details: details || null,
    status: 'open',
  }

  const { data, error } = await supabase.from('lounge_reports').insert(row).select('id').maybeSingle()
  if (error) {
    if (error.code === '23505') {
      const err = new Error('You already reported this.')
      err.code = 'already_reported'
      throw err
    }
    throw new Error(error.message || 'Could not send report.')
  }
  return data
}

export async function fetchLoungeReportsForStaff(supabase, { status = 'open', limit = 80 } = {}) {
  if (!supabase) throw new Error('Not signed in.')
  let query = supabase
    .from('lounge_reports')
    .select(REPORT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message || 'Could not load reports.')
  return data || []
}

export async function updateLoungeReportStatus(supabase, reportId, patch) {
  const id = cleanUuid(reportId)
  if (!id) throw new Error('Missing report.')
  const next = {
    status: patch?.status,
    reviewer_id: cleanUuid(patch?.reviewerId),
    reviewed_at: patch?.reviewedAt || new Date().toISOString(),
    staff_note: patch?.staffNote == null ? undefined : String(patch.staffNote).slice(0, 1000),
  }
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined) delete next[key]
  })
  const { error } = await supabase.from('lounge_reports').update(next).eq('id', id)
  if (error) throw new Error(error.message || 'Could not update report.')
}

export async function hideLoungeReportTarget(supabase, report) {
  const kind = String(report?.target_kind || '')
  const targetId = cleanUuid(report?.target_id)
  if (!targetId) throw new Error('Missing target.')
  const hiddenAt = new Date().toISOString()
  if (kind === 'post') {
    const { error } = await supabase
      .from('community_feed_posts')
      .update({ hidden_at: hiddenAt })
      .eq('id', targetId)
    if (error) throw new Error(error.message || 'Could not hide post.')
    return
  }
  if (kind === 'comment') {
    const { error } = await supabase
      .from('feed_comments')
      .update({ hidden_at: hiddenAt })
      .eq('id', targetId)
    if (error) throw new Error(error.message || 'Could not hide comment.')
    return
  }
  throw new Error('Hide applies to posts and comments.')
}
