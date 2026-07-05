/**
 * Publish due scheduled editorial queue rows (+ optional immediate publish).
 * Body: { "queueId": "uuid" } | { "publishDue": true } | { "publishScheduledOdds": true }
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  adminOpsCorsHeaders,
  adminOpsJson,
  isKnownServiceRoleBearer,
  requireAdminUser,
  serviceRoleCredentialFromRequest,
} from '../_shared/adminAuth.ts'
import { publishDueQueueRows, publishQueueRow } from '../_shared/loungeBotQueuePublish.ts'
import { drainDueScheduledBotPosts } from '../_shared/loungeBotPublishSchedule.ts'

async function authorize(req: Request): Promise<{ admin: SupabaseClient; reviewerId: string | null }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  if (!supabaseUrl || !serviceRoleKey) throw adminOpsJson(503, { error: 'Missing env.' })

  const credential = serviceRoleCredentialFromRequest(req)
  if (isKnownServiceRoleBearer(credential, serviceRoleKey, supabaseUrl)) {
    return { admin: createClient(supabaseUrl, credential || serviceRoleKey), reviewerId: null }
  }

  const { admin, user } = await requireAdminUser(req)
  return { admin, reviewerId: user.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: adminOpsCorsHeaders })
  if (req.method !== 'POST') return adminOpsJson(405, { error: 'POST required.' })

  try {
    const { admin, reviewerId } = await authorize(req)
    const body = await req.json().catch(() => ({}))

    if (body?.queueId) {
      const { data: row, error } = await admin
        .from('lounge_bot_queue')
        .select('id, bot_user_id, draft_caption, category_pills, attach_source_link, source_url, status')
        .eq('id', body.queueId)
        .maybeSingle()
      if (error || !row) return adminOpsJson(404, { error: 'Queue row not found.' })

      const result = await publishQueueRow(admin, row, reviewerId)
      if (!result.postId) return adminOpsJson(500, { error: result.error || 'Publish failed.' })
      return adminOpsJson(200, { ok: true, postId: result.postId })
    }

    if (body?.publishDue === true) {
      const stats = await publishDueQueueRows(admin, {
        botUserId: body.botUserId || undefined,
        limit: 20,
      })
      return adminOpsJson(200, { ok: true, ...stats })
    }

    if (body?.publishScheduledOdds === true) {
      const stats = await drainDueScheduledBotPosts(admin, {
        limit: Number(body.limit) || 10,
      })
      return adminOpsJson(200, { ok: true, ...stats })
    }

    return adminOpsJson(400, { error: 'Provide queueId, publishDue:true, or publishScheduledOdds:true' })
  } catch (err) {
    if (err instanceof Response) return err
    return adminOpsJson(500, { error: err instanceof Error ? err.message : 'Unexpected error' })
  }
})
