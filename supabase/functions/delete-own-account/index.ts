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
 * Always returns HTTP 200 with `{ ok: true }` or `{ ok: false, error }` so WKWebView
 * / supabase-js can read the body (non-2xx often arrives as `{}`).
 * Gateway verify_jwt is off; this handler checks the bearer via Auth.
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

    // Feed delete triggers can abort a cascaded auth.users delete. Clear own
    // comments/posts first so deleteUser is not fighting those denorm guards.
    const { error: commentErr } = await admin.from('feed_comments').delete().eq('user_id', user.id)
    if (commentErr) {
      return fail(errorText(commentErr, 'Could not delete your comments.'))
    }
    const { error: postErr } = await admin.from('community_feed_posts').delete().eq('user_id', user.id)
    if (postErr) {
      return fail(errorText(postErr, 'Could not delete your posts.'))
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
    if (delErr) {
      return fail(errorText(delErr, 'Could not delete user.'))
    }

    return json({ ok: true })
  } catch (e) {
    return fail(errorText(e, 'Server error'))
  }
})
