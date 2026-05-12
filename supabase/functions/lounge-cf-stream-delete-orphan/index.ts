/**
 * Deletes a Cloudflare Stream asset by uid when the upload pipeline was abandoned or failed
 * before a `community_feed_posts` row referenced it. Caller must be authenticated (same JWT as direct-upload).
 *
 * Does not load the DB — only use for uids returned from `lounge-cf-stream-direct-upload` that never completed.
 *
 * Secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN` (Stream:Edit).
 *
 * @see https://developers.cloudflare.com/api/resources/stream/methods/delete/
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i
/** Stream direct-upload uids are 32 hex chars in practice. */
const STREAM_VIDEO_UID_RE = /^[0-9a-f]{32}$/i

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')?.trim()
    const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')?.trim()
    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({
          error: 'Video cleanup is not configured (missing Cloudflare Stream credentials on the server).',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
    if (!CLOUDFLARE_ACCOUNT_ID_RE.test(accountId)) {
      return new Response(JSON.stringify({ error: 'Invalid CLOUDFLARE_ACCOUNT_ID format on the server.' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing Authorization bearer token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let uid = ''
    try {
      const body = (await req.json()) as { uid?: string }
      uid = typeof body?.uid === 'string' ? body.uid.trim() : ''
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!uid || !STREAM_VIDEO_UID_RE.test(uid)) {
      return new Response(JSON.stringify({ error: 'Missing or invalid uid.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt)
    if (userErr || !user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${encodeURIComponent(uid)}`
    const cfRes = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
    })

    if (cfRes.status === 404) {
      return new Response(JSON.stringify({ ok: true, notFound: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ct = (cfRes.headers.get('Content-Type') || '').toLowerCase()
    let cfJson: { success?: boolean; errors?: Array<{ message?: string }> } = {}
    try {
      if (ct.includes('application/json')) {
        cfJson = (await cfRes.json()) as typeof cfJson
      } else {
        const raw = await cfRes.text()
        if (cfRes.ok) {
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        return new Response(
          JSON.stringify({
            error: `Cloudflare returned non-JSON (${cfRes.status}): ${raw.slice(0, 240)}`,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Could not read Cloudflare response.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!cfRes.ok || cfJson?.success === false) {
      const msg =
        cfJson?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
        `Cloudflare Stream delete failed (${cfRes.status})`
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
