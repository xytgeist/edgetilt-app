import { createClient } from 'npm:@supabase/supabase-js@2'
import { freshAccountActivity } from '../_shared/accountConnectActivity.ts'
import { verifyConnectTransfer } from '../_shared/accountConnectToken.ts'

/**
 * Connect-account flow, step 2: the caller signed in to the account they chose on
 * "Connect account?". Deletes the fresh account named in the hand-off (signed by
 * `account-connect-prepare`, re-checked for activity), then attaches the phone / email it had
 * already verified so they are not asked for another code. Never overwrites a different phone
 * or email already on the account.
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

const digits = (v: unknown) => String(v || '').replace(/\D/g, '')

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

  let body: { transfer_token?: string } = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const transfer = await verifyConnectTransfer(serviceRoleKey, String(body?.transfer_token || ''))
  if (!transfer) return json({ error: 'This connect link expired. Connect it in Settings → Account info.', code: 'bad_token' }, 400)
  if (transfer.target !== user.id) return json({ error: 'This connect request is for a different account.', code: 'wrong_account' }, 403)

  // Delete the fresh account only now that they proved they own the target. Frees its phone / identity.
  if (transfer.fresh && transfer.fresh !== user.id) {
    const { data: freshUser } = await admin.auth.admin.getUserById(transfer.fresh)
    if (freshUser?.user?.id) {
      const activity = await freshAccountActivity(admin, transfer.fresh)
      if (activity === 'error') return json({ error: 'Could not check the new account. Try again.' }, 500)
      if (activity) {
        return json(
          { error: 'The new account has activity now, so it can’t be merged automatically.', code: 'has_activity' },
          409,
        )
      }
      const { error: delErr } = await admin.auth.admin.deleteUser(transfer.fresh)
      if (delErr) return json({ error: delErr.message || 'Could not remove the new account.' }, 400)
    }
  }

  const update: Record<string, unknown> = {}
  const attached: string[] = []

  if (transfer.phone) {
    const current = digits(user.phone)
    if (current && current !== digits(transfer.phone)) {
      return json(
        { error: 'This account already has a different phone number. Change it in Settings → Account info.', code: 'phone_differs' },
        409,
      )
    }
    if (!current) {
      update.phone = `+${digits(transfer.phone)}`
      update.phone_confirm = true
    }
    attached.push('phone')
  }

  if (transfer.email && !String(user.email || '').trim()) {
    update.email = transfer.email
    update.email_confirm = true
    attached.push('email')
  }

  if (Object.keys(update).length) {
    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, update)
    if (updErr) {
      const msg = String(updErr.message || '')
      if (/already|registered|exists/i.test(msg)) {
        return json({ error: 'That number is already on another account.', code: 'in_use' }, 409)
      }
      return json({ error: msg || 'Could not connect.' }, 400)
    }
  }

  return json({ ok: true, attached })
})
