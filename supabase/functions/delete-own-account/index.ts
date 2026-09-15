import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(error: string) {
  return json({ ok: false, error })
}

function errorText(err: unknown, fallback: string) {
  if (!err) return fallback
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  if (typeof err === 'object') {
    const rec = err as { message?: unknown; error?: unknown; code?: unknown }
    const message = rec.message != null ? String(rec.message).trim() : ''
    if (message) return message
    const nested = rec.error != null ? String(rec.error).trim() : ''
    if (nested) return nested
    const code = rec.code != null ? String(rec.code).trim() : ''
    if (code) return code
  }
  return fallback
}

/**
 * Deletes the Auth user identified by the JWT (caller can only delete themselves).
 * Always returns HTTP 200 with `{ ok: true }` or `{ ok: false, error }`.
 *
 * Prefer GoTrue `deleteUser` (this is what worked before the Review/SIWA work).
 * If app triggers abort that (`Database error deleting user`), fall back to
 * `public.delete_own_account_user()` (replica role).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return fail('Method not allowed')
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return fail('Server is missing delete credentials.')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return fail('Sign in again, then delete the account.')
    }

    let confirm = false
    try {
      const body = await req.json()
      confirm = body?.confirm === true
    } catch {
      confirm = false
    }
    if (!confirm) {
      return fail('Confirm account deletion to continue.')
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt)
    if (userErr || !user?.id) {
      return fail('Invalid or expired session. Sign in again, then delete the account.')
    }

    // Do not CASCADE-wipe group chats this user created.
    await admin.from('chat_rooms').update({ creator_user_id: null }).eq('creator_user_id', user.id)

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (!delErr) {
      return json({ ok: true })
    }

    const delMsg = errorText(delErr, 'Could not delete user.')
    if (!/database error deleting user/i.test(delMsg)) {
      return fail(delMsg)
    }

    const asUser = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data, error: rpcErr } = await asUser.rpc('delete_own_account_user')
    if (!rpcErr && data && typeof data === 'object' && data.ok === true) {
      return json({ ok: true })
    }
    const rpcError =
      rpcErr
        ? errorText(rpcErr, '')
        : data && typeof data === 'object' && data.error != null
          ? String(data.error).trim()
          : ''
    if (rpcError && !/schema cache/i.test(rpcError)) {
      return fail(rpcError)
    }
    return fail(delMsg)
  } catch (e) {
    return fail(errorText(e, 'Server error'))
  }
})
