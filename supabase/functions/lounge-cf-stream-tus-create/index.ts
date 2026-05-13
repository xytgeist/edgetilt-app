/**
 * Proxies browser tus-js-client **creation** POST to Cloudflare Stream (`?direct_user=true`).
 * Returns the same status/headers (incl. `Location`, `stream-media-id`) so the client can PATCH
 * chunks directly to Cloudflare. Verifies Supabase JWT; never exposes `CLOUDFLARE_STREAM_API_TOKEN`.
 *
 * @see https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/#direct-creator-uploads-with-tus-protocol
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const allowRequestHeaders =
  'authorization, x-client-info, apikey, content-type, tus-resumable, upload-length, upload-metadata, upload-offset, upload-checksum'

const exposeResponseHeaders =
  'Location, Tus-Resumable, stream-media-id, upload-offset, upload-length, Content-Type'

Deno.serve(async (req) => {
  const h = new Headers(corsHeaders)
  h.set('Access-Control-Allow-Headers', allowRequestHeaders)
  h.set('Access-Control-Expose-Headers', exposeResponseHeaders)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: h })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...h, 'Content-Type': 'application/json' },
    })
  }

  try {
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')?.trim()
    const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')?.trim()
    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'Video uploads are not configured (missing Cloudflare Stream credentials on the server).' }),
        { status: 503, headers: { ...h, 'Content-Type': 'application/json' } },
      )
    }
    if (!CLOUDFLARE_ACCOUNT_ID_RE.test(accountId)) {
      return new Response(JSON.stringify({ error: 'CLOUDFLARE_ACCOUNT_ID is invalid.' }), {
        status: 503,
        headers: { ...h, 'Content-Type': 'application/json' },
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
        headers: { ...h, 'Content-Type': 'application/json' },
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
        headers: { ...h, 'Content-Type': 'application/json' },
      })
    }

    const tusResumable = req.headers.get('Tus-Resumable') || req.headers.get('tus-resumable') || '1.0.0'
    const uploadLength = req.headers.get('Upload-Length') || req.headers.get('upload-length') || ''
    const uploadMetadata = req.headers.get('Upload-Metadata') || req.headers.get('upload-metadata') || ''

    const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?direct_user=true`
    const cfHeaders = new Headers({
      Authorization: `Bearer ${apiToken}`,
      'Tus-Resumable': tusResumable,
      'Upload-Length': uploadLength,
      'Upload-Metadata': uploadMetadata,
    })

    const cfRes = await fetch(cfUrl, {
      method: 'POST',
      headers: cfHeaders,
    })

    const out = new Headers(h)
    const forwardNames = [
      'location',
      'tus-resumable',
      'stream-media-id',
      'upload-offset',
      'upload-length',
      'content-type',
    ]
    for (const name of forwardNames) {
      const v = cfRes.headers.get(name)
      if (v) out.set(name, v)
    }

    return new Response(cfRes.body, { status: cfRes.status, headers: out })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[lounge-video-upload]', {
      ts: new Date().toISOString(),
      phase: 'cf_stream_tus_create_edge',
      outcome: 'unhandled_throw',
      message: (msg || 'Server error').slice(0, 500),
    })
    return new Response(JSON.stringify({ error: msg || 'Server error' }), {
      status: 500,
      headers: { ...h, 'Content-Type': 'application/json' },
    })
  }
})
