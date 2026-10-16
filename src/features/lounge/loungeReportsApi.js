import { deleteLoungeCommunityFeedPostTreeHostedMedia } from '../../utils/communityFeedPost.js'
import { LOUNGE_REPORT_REASON_IDS } from './loungeReportReasons.js'

const REPORT_SELECT =
  'id,reporter_id,target_kind,target_id,target_user_id,reason,details,status,reviewer_id,reviewed_at,staff_note,needs_human,triage_status,triage_action,triage_confidence,triage_reasons,triage_model,classified_at,created_at,updated_at'

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
  void requestLoungeReportTriage(supabase, data?.id)
  return data
}

export async function requestLoungeReportTriage(supabase, reportId) {
  const id = cleanUuid(reportId)
  if (!supabase || !id) return null
  try {
    const { data, error } = await supabase.functions.invoke('lounge-report-triage', {
      body: { reportId: id },
    })
    if (error) throw error
    return data
  } catch {
    return null
  }
}

export async function requestLoungeReportTriageBatch(supabase, { limit = 8 } = {}) {
  if (!supabase) throw new Error('Not signed in.')
  const { data, error } = await supabase.functions.invoke('lounge-report-triage', {
    body: { limit },
  })
  if (error) throw new Error(error.message || 'Triage failed.')
  return data
}

export async function fetchLoungeReportsForStaff(
  supabase,
  { status = 'open', needsHuman = false, limit = 80 } = {},
) {
  if (!supabase) throw new Error('Not signed in.')
  let query = supabase
    .from('lounge_reports')
    .select(REPORT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') query = query.eq('status', status)
  if (needsHuman) {
    query = query.eq('needs_human', true).in('status', ['open', 'reviewing'])
  }
  const { data, error } = await query
  if (error) throw new Error(error.message || 'Could not load reports.')
  return data || []
}

export async function hydrateLoungeReportTargets(supabase, reports) {
  const posts = [...new Set(reports.filter((row) => row.target_kind === 'post').map((row) => row.target_id))]
  const comments = [
    ...new Set(reports.filter((row) => row.target_kind === 'comment').map((row) => row.target_id)),
  ]
  const [postRes, commentRes] = await Promise.all([
    posts.length
      ? supabase.from('community_feed_posts').select('id,caption,hidden_at,user_id').in('id', posts)
      : Promise.resolve({ data: [] }),
    comments.length
      ? supabase.from('feed_comments').select('id,body,hidden_at,user_id,post_id').in('id', comments)
      : Promise.resolve({ data: [] }),
  ])
  if (postRes.error) throw new Error(postRes.error.message)
  if (commentRes.error) throw new Error(commentRes.error.message)
  return {
    posts: Object.fromEntries((postRes.data || []).map((row) => [row.id, row])),
    comments: Object.fromEntries((commentRes.data || []).map((row) => [row.id, row])),
  }
}

export async function updateLoungeReportStatus(supabase, reportId, patch) {
  const id = cleanUuid(reportId)
  if (!id) throw new Error('Missing report.')
  const next = {
    status: patch?.status,
    reviewer_id: cleanUuid(patch?.reviewerId),
    reviewed_at: patch?.reviewedAt || new Date().toISOString(),
    staff_note: patch?.staffNote == null ? undefined : String(patch.staffNote).slice(0, 1000),
    needs_human: patch?.needsHuman,
  }
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined) delete next[key]
  })
  const { error } = await supabase.from('lounge_reports').update(next).eq('id', id)
  if (error) throw new Error(error.message || 'Could not update report.')
}

async function writeModAction(supabase, report, action, actorId, note) {
  const { error } = await supabase.from('lounge_mod_actions').insert({
    report_id: report.id,
    actor_id: actorId,
    target_kind: report.target_kind,
    target_id: report.target_id,
    target_user_id: report.target_user_id,
    action,
    note: note ? String(note).slice(0, 1000) : null,
  })
  if (error) throw new Error(error.message || 'Could not record action.')
}

async function writeStaffNotice(supabase, { recipientUserId, kind, body, reportId, createdBy }) {
  if (!recipientUserId) return
  const { error } = await supabase.from('lounge_staff_notices').insert({
    recipient_user_id: recipientUserId,
    kind,
    body: String(body || '').slice(0, 500),
    report_id: reportId || null,
    created_by: createdBy || null,
  })
  if (error) throw new Error(error.message || 'Could not send notice.')
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

export async function deleteLoungeReportTarget(supabase, report) {
  const kind = String(report?.target_kind || '')
  const targetId = cleanUuid(report?.target_id)
  if (!targetId) throw new Error('Missing target.')
  if (kind === 'comment') {
    const { error } = await supabase.from('feed_comments').delete().eq('id', targetId)
    if (error) throw new Error(error.message || 'Could not delete comment.')
    return
  }
  if (kind !== 'post') throw new Error('Delete applies to posts and comments.')
  const { data: postRow, error: loadErr } = await supabase
    .from('community_feed_posts')
    .select('id,user_id,caption,image_urls,stream_video_uid,media_url')
    .eq('id', targetId)
    .maybeSingle()
  if (loadErr) throw new Error(loadErr.message)
  if (!postRow) return
  await deleteLoungeCommunityFeedPostTreeHostedMedia(supabase, { postId: targetId, postRow })
  const { error } = await supabase.from('community_feed_posts').delete().eq('id', targetId)
  if (error) throw new Error(error.message || 'Could not delete post.')
}

export async function actionLoungeReport(supabase, report, { action, reviewerId, note = '' }) {
  const actorId = cleanUuid(reviewerId)
  if (!actorId) throw new Error('Sign in as staff.')
  const trimmed = String(note || '').trim()

  if (action === 'hide') {
    await hideLoungeReportTarget(supabase, report)
    await writeModAction(supabase, report, 'hide', actorId, trimmed)
    if (report.target_user_id) {
      await writeStaffNotice(supabase, {
        recipientUserId: report.target_user_id,
        kind: 'removed',
        body: 'A Lounge post or comment was removed after a report.',
        reportId: report.id,
        createdBy: actorId,
      })
    }
    await updateLoungeReportStatus(supabase, report.id, {
      status: 'actioned',
      reviewerId: actorId,
      staffNote: trimmed || report.staff_note,
      needsHuman: false,
    })
    return
  }

  if (action === 'delete') {
    await deleteLoungeReportTarget(supabase, report)
    await writeModAction(supabase, report, 'delete', actorId, trimmed)
    if (report.target_user_id) {
      await writeStaffNotice(supabase, {
        recipientUserId: report.target_user_id,
        kind: 'deleted',
        body: 'A Lounge post or comment was deleted by staff.',
        reportId: report.id,
        createdBy: actorId,
      })
    }
    await updateLoungeReportStatus(supabase, report.id, {
      status: 'actioned',
      reviewerId: actorId,
      staffNote: trimmed || report.staff_note,
      needsHuman: false,
    })
    return
  }

  if (action === 'warn') {
    await writeModAction(supabase, report, 'warn', actorId, trimmed)
    if (!report.target_user_id) throw new Error('No account to warn.')
    await writeStaffNotice(supabase, {
      recipientUserId: report.target_user_id,
      kind: 'warn',
      body: trimmed || 'Staff sent a warning about a Lounge report. Review the Community Guidelines.',
      reportId: report.id,
      createdBy: actorId,
    })
    await updateLoungeReportStatus(supabase, report.id, {
      status: 'actioned',
      reviewerId: actorId,
      staffNote: trimmed || 'Warned.',
      needsHuman: false,
    })
    return
  }

  if (action === 'dismiss') {
    await writeModAction(supabase, report, 'dismiss', actorId, trimmed)
    await updateLoungeReportStatus(supabase, report.id, {
      status: 'dismissed',
      reviewerId: actorId,
      staffNote: trimmed || report.staff_note,
      needsHuman: false,
    })
    return
  }

  throw new Error('Unknown action.')
}

export async function fetchUnreadLoungeStaffNotices(supabase) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('lounge_staff_notices')
    .select('id,kind,body,created_at')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) return []
  return data || []
}

export async function markLoungeStaffNoticeRead(supabase, noticeId) {
  const id = cleanUuid(noticeId)
  if (!supabase || !id) return
  await supabase.from('lounge_staff_notices').update({ read_at: new Date().toISOString() }).eq('id', id)
}
