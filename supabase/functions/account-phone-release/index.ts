import { createClient } from 'npm:@supabase/supabase-js@2'

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

function e164FromAuthPhone(phone: string) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits ? `+${digits}` : ''
}

function releaseErrorMessage(raw: string) {
  const lower = raw.toLowerCase()
  if (lower.includes('email_not_confirmed') || lower.includes('email_identity_required')) {
    return 'Add an email and confirm the code before you can remove this number.'
  }
  if (lower.includes('phone_release_forbidden')) {
    return 'Could not remove this number.'
  }
  return 'Could not remove this number. Try again in a minute.'
}

/**
 * Clears the signed-in user's login phone after they prove the SMS code.
 * Requires a confirmed email. Does not accept a phone from the body.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      throw new Error('Missing Supabase env')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return json({ error: 'Missing Authorization bearer token.' }, 401)
    }

    let token = ''
    try {
      const body = await req.json()
      token = String(body?.token || '').replace(/\D/g, '')
    } catch {
      token = ''
    }
    if (token.length < 4) {
      return json({ error: 'Enter the code from the text.' }, 400)
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt)
    if (userErr || !user?.id) {
      return json({ error: 'Invalid or expired session.' }, 401)
    }

    const phone = e164FromAuthPhone(String(user.phone || ''))
    if (!phone) {
      return json({ error: 'This account has no phone number to remove.' }, 400)
    }
    if (!user.email_confirmed_at) {
      return json({ error: 'Add an email and confirm the code before you can remove this number.' }, 400)
    }

    const verifyRes = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'sms', phone, token }),
    })
    const verifyBody = await verifyRes.json().catch(() => null)
    if (!verifyRes.ok) {
      return json({ error: 'That code is incorrect or expired.' }, 400)
    }
    const verifiedId = String(verifyBody?.user?.id || '')
    if (!verifiedId || verifiedId !== user.id) {
      return json({ error: 'That code does not match this account.' }, 403)
    }

    const { error: releaseErr } = await admin.rpc('release_account_phone', { p_user_id: user.id })
    if (releaseErr) {
      return json({ error: releaseErrorMessage(String(releaseErr.message || '')) }, 400)
    }

    return json({ ok: true })
  } catch {
    return json({ error: 'Could not remove this number. Try again in a minute.' }, 500)
  }
})
