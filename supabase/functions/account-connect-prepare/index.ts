import { createClient } from 'npm:@supabase/supabase-js@2'
import { CONNECT_FRESH_MAX_AGE_MS, freshAccountActivity } from '../_shared/accountConnectActivity.ts'
import { CONNECT_TRANSFER_TTL_MS, signConnectTransfer } from '../_shared/accountConnectToken.ts'

/**
 * Connect-account flow, step 1: the caller (a brand-new, empty account) picked an account they
 * already had on this device. Nothing is deleted here ... returns a signed hand-off naming this
 * fresh account, the target, and the phone / email it already verified. `account-connect-attach`
 * deletes the fresh account only after they have signed in to the target.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

  let body: { target_user_id?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const target = String(body?.target_user_id || '').trim()
  if (!target || target === user.id) return json({ error: 'Pick the account to connect to.', code: 'bad_target' }, 400)

  const created = Date.parse(user.created_at || '')
  if (!Number.isFinite(created) || Date.now() - created > CONNECT_FRESH_MAX_AGE_MS) {
    return json({ error: 'This account is too old to merge automatically.', code: 'too_old' }, 409)
  }
  const activity = await freshAccountActivity(admin, user.id)
  if (activity === 'error') return json({ error: 'Could not check this account. Try again.' }, 500)
  if (activity) {
    return json({ error: 'This account already has activity, so it can’t be merged automatically.', code: 'has_activity' }, 409)
  }

  const { data: targetUser } = await admin.auth.admin.getUserById(target)
  if (!targetUser?.user?.id) return json({ error: 'That account no longer exists.', code: 'target_missing' }, 404)

  const providers = Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []
  const phone = user.phone && user.phone_confirmed_at ? String(user.phone) : ''
  const email = providers.includes('email') && user.email && user.email_confirmed_at ? String(user.email) : ''
  const transferToken = await signConnectTransfer(serviceRoleKey, {
    v: 1,
    target,
    fresh: user.id,
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    exp: Date.now() + CONNECT_TRANSFER_TTL_MS,
  })
  return json({ ok: true, transfer_token: transferToken })
})
