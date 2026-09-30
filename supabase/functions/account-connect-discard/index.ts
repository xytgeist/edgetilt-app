import { createClient } from 'npm:@supabase/supabase-js@2'

/**
 * Connect-account flow, step 1: delete the caller's brand-new, empty account so its sign-in
 * (Apple / phone / Google) can be linked to the account they already had on this device.
 * Refuses anything older than an hour or with any activity. Caller can only discard themselves.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_AGE_MS = 60 * 60 * 1000

const ACTIVITY_CHECKS: Array<[table: string, column: string]> = [
  ['community_feed_posts', 'user_id'],
  ['feed_comments', 'user_id'],
  ['chat_messages', 'sender_id'],
  ['follows', 'user_id'],
  ['profile_follows', 'follower_id'],
  ['user_subscriptions', 'user_id'],
  ['creator_subscriptions', 'subscriber_user_id'],
]

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server not configured.' }, 500)

  const jwt = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return json({ error: 'Missing Authorization bearer token.' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: { user }, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) return json({ error: 'Invalid or expired session.' }, 401)

  const created = Date.parse(user.created_at || '')
  if (!Number.isFinite(created) || Date.now() - created > MAX_AGE_MS) {
    return json({ error: 'This account is too old to merge automatically.', code: 'too_old' }, 409)
  }

  for (const [table, column] of ACTIVITY_CHECKS) {
    const { count, error } = await admin.from(table).select(column, { count: 'exact', head: true }).eq(column, user.id)
    if (error) return json({ error: `Could not check ${table}.` }, 500)
    if ((count ?? 0) > 0) {
      return json({ error: 'This account already has activity, so it can’t be merged automatically.', code: 'has_activity' }, 409)
    }
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) return json({ error: delErr.message || 'Could not remove the new account.' }, 400)
  return json({ ok: true })
})
