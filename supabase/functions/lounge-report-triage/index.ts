/**
 * Silent first-pass on lounge_reports.
 * Auto-dismiss obvious spam only. Never auto-hide. Legal/safety always needs a human.
 *
 * Auth: service role, or any signed-in user (triage pending rows only).
 * Writes use the service role.
 */
import { createClient } from 'npm:@supabase/supabase-js@2'
import { adminOpsCorsHeaders, adminOpsJson, isKnownServiceRoleBearer } from '../_shared/adminAuth.ts'
import {
  decideLoungeReportTriage,
  LOUNGE_REPORT_NEVER_AUTO_REASONS,
} from '../_shared/loungeReportTriage.ts'
import {
  openaiChatReasoningNone,
  resolveOpenAiChatModel,
} from '../_shared/openaiModelDefaults.ts'

const OPENAI_TIMEOUT_MS = 12_000

type ReportRow = {
  id: string
  reason: string
  details: string | null
  target_kind: string
  target_id: string
  status: string
  triage_status: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: adminOpsCorsHeaders })
  }
  if (req.method !== 'POST') {
    return adminOpsJson(405, { error: 'POST only.' })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
    if (!supabaseUrl || !serviceRoleKey) {
      return adminOpsJson(503, { error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' })
    }

    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!bearer) return adminOpsJson(401, { error: 'Missing Authorization bearer token.' })

    const admin = createClient(supabaseUrl, serviceRoleKey)
    if (!isKnownServiceRoleBearer(bearer, serviceRoleKey, supabaseUrl)) {
      const { data: { user }, error: userErr } = await admin.auth.getUser(bearer)
      if (userErr || !user?.id) return adminOpsJson(401, { error: 'Invalid or expired session.' })
    }

    let body: { reportId?: string; limit?: number } = {}
    try {
      body = (await req.json()) as { reportId?: string; limit?: number }
    } catch {
      body = {}
    }

    const reportId = String(body.reportId || '').trim()
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 20)

    let query = admin
      .from('lounge_reports')
      .select('id,reason,details,target_kind,target_id,status,triage_status')
      .eq('triage_status', 'pending')
      .in('status', ['open', 'reviewing'])
      .order('created_at', { ascending: true })
      .limit(reportId ? 1 : limit)
    if (reportId) query = query.eq('id', reportId)

    const { data: rows, error: loadErr } = await query
    if (loadErr) return adminOpsJson(500, { error: loadErr.message })
    const reports = (rows || []) as ReportRow[]
    if (!reports.length) {
      return adminOpsJson(200, { ok: true, classified: 0, results: [] })
    }

    const results = []
    for (const report of reports) {
      results.push(await classifyOne(admin, report))
    }
    return adminOpsJson(200, { ok: true, classified: results.length, results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Triage failed.'
    return adminOpsJson(500, { error: message })
  }
})

async function loadTargetText(
  admin: ReturnType<typeof createClient>,
  report: ReportRow,
): Promise<string> {
  if (report.target_kind === 'post') {
    const { data } = await admin
      .from('community_feed_posts')
      .select('caption')
      .eq('id', report.target_id)
      .maybeSingle()
    return String(data?.caption || '').trim()
  }
  if (report.target_kind === 'comment') {
    const { data } = await admin
      .from('feed_comments')
      .select('body')
      .eq('id', report.target_id)
      .maybeSingle()
    return String(data?.body || '').trim()
  }
  return ''
}

async function classifyOne(admin: ReturnType<typeof createClient>, report: ReportRow) {
  const model = resolveOpenAiChatModel()
  const targetText = await loadTargetText(admin, report)
  let guess: { category?: string; action?: string; confidence?: number; reasons?: string } | null = null

  if (LOUNGE_REPORT_NEVER_AUTO_REASONS.has(report.reason)) {
    const decision = decideLoungeReportTriage(report.reason, {
      category: report.reason,
      action: 'escalate',
      confidence: 1,
      reasons: 'Reporter picked a legal or safety reason.',
    })
    await writeDecision(admin, report.id, decision, model)
    return { id: report.id, ...decision, model }
  }

  const key = Deno.env.get('OPENAI_API_KEY')?.trim()
  if (!key) {
    const decision = decideLoungeReportTriage(report.reason, null)
    await writeDecision(admin, report.id, { ...decision, triage_status: 'failed', reasons: 'OPENAI_API_KEY missing.' }, model)
    return { id: report.id, error: 'missing_openai', needs_human: true }
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), OPENAI_TIMEOUT_MS)
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        ...openaiChatReasoningNone(),
        temperature: 0,
        max_tokens: 180,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You triage EdgeTilt Lounge user reports. EdgeTilt is an adult gambling social app. Trash talk about betting is normal. ' +
              'Return JSON only: {"category":"spam|harassment|hate|sexual|impersonation|illegal|other","action":"dismiss|escalate","confidence":0-1,"reasons":"short"}. ' +
              'action=dismiss only for obvious ads, bots, or repetitive junk. Escalate anything sexual, illegal, impersonation, threats, hate, or uncertain. Never invent copyright claims.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              reporter_reason: report.reason,
              reporter_details: report.details || '',
              target_kind: report.target_kind,
              target_text: targetText.slice(0, 1200),
            }),
          },
        ],
      }),
    })
    clearTimeout(timer)
    if (!res.ok) throw new Error(`OpenAI ${res.status}`)
    const payload = await res.json()
    const raw = String(payload?.choices?.[0]?.message?.content || '')
    guess = JSON.parse(raw) as typeof guess
  } catch (err) {
    const reasons = err instanceof Error ? err.message : 'classify failed'
    await writeDecision(
      admin,
      report.id,
      {
        triage_status: 'failed',
        triage_action: 'escalate',
        needs_human: true,
        reasons,
      },
      model,
    )
    return { id: report.id, error: reasons, needs_human: true }
  }

  const decision = decideLoungeReportTriage(report.reason, guess)
  await writeDecision(admin, report.id, decision, model)
  return { id: report.id, ...decision, model }
}

async function writeDecision(
  admin: ReturnType<typeof createClient>,
  reportId: string,
  decision: {
    triage_status: string
    triage_action: string
    needs_human: boolean
    report_status?: string
    staff_note?: string
    reasons: string
    confidence?: number | null
  },
  model: string,
) {
  const confidence = Number(decision.confidence)
  const patch: Record<string, unknown> = {
    needs_human: decision.needs_human,
    triage_status: decision.triage_status,
    triage_action: decision.triage_action,
    triage_confidence: Number.isFinite(confidence) ? confidence : null,
    triage_reasons: String(decision.reasons || '').slice(0, 1000),
    triage_model: model,
    classified_at: new Date().toISOString(),
  }
  if (decision.report_status) patch.status = decision.report_status
  if (decision.staff_note) patch.staff_note = decision.staff_note
  const { error } = await admin.from('lounge_reports').update(patch).eq('id', reportId)
  if (error) throw new Error(error.message)
}
