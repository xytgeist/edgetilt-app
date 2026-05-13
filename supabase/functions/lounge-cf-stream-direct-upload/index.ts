/**
 * Mint a one-time Cloudflare Stream direct upload URL (product cap 60s; CF maxDurationSeconds has headroom for probe/encoder drift). Caller must be authenticated.
 *
 * Secrets (Supabase project → Edge Functions):
 *   CLOUDFLARE_ACCOUNT_ID
 *   CLOUDFLARE_STREAM_API_TOKEN   (Stream:Edit)
 *
 * @see https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/
 */
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Slightly above 60 so clips that read as ~59s in an editor but measure just over 60s at upload are not rejected by Cloudflare. Client still enforces the 60s product cap. */
const MAX_DURATION_SECONDS = 75

/** Cloudflare Account IDs are 32 hex chars (same length as Zone IDs — use Account ID from the dashboard sidebar, not a zone). */
const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i

function cloudflareAccountHint(): string {
  return (
    ' In Supabase Edge secrets, set CLOUDFLARE_ACCOUNT_ID to your Cloudflare Account ID: ' +
    'dash.cloudflare.com → pick the account → copy Account ID from the right-hand sidebar (or Workers & Pages overview). ' +
    'It must be 32 hexadecimal characters with no dashes or underscores. Do not use a Zone ID, API Token, or Stream video UID.'
  )
}

/** Stream storage is prepaid; zero purchased minutes means uploads fail even with an empty video list. */
function cloudflareStreamStorageHint(): string {
  return (
    ' Cloudflare Stream bills stored minutes as prepaid blocks (developers.cloudflare.com/stream/pricing). ' +
    'If purchased or allocated storage is zero, uploads are rejected until you add storage in the dashboard ' +
    '(Stream or Billing). Direct upload links also temporarily reserve up to maxDurationSeconds until the upload finishes or the link expires.'
  )
}

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
          error: 'Video uploads are not configured (missing Cloudflare Stream credentials on the server).',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (!CLOUDFLARE_ACCOUNT_ID_RE.test(accountId)) {
      return new Response(
        JSON.stringify({
          error: `CLOUDFLARE_ACCOUNT_ID is not a valid Cloudflare Account ID (expected 32 hex characters).${cloudflareAccountHint()}`,
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
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

    /** Direct upload URL stops accepting bytes after this time (RFC 3339). Orphan Stream rows may still show pendingupload until deleted — see `lounge-cf-stream-purge-pending-uploads` and client orphan delete. */
    const uploadExpiryMs = 6 * 60 * 60 * 1000
    const expiry = new Date(Date.now() + uploadExpiryMs).toISOString()

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`
    const cfRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxDurationSeconds: MAX_DURATION_SECONDS,
        requireSignedURLs: false,
        expiry,
      }),
    })

    const ct = (cfRes.headers.get('Content-Type') || '').toLowerCase()
    let cfJson: {
      success?: boolean
      errors?: Array<{ message?: string }>
      result?: { uploadURL?: string; uid?: string }
    } = {}
    try {
      if (ct.includes('application/json')) {
        cfJson = (await cfRes.json()) as typeof cfJson
      } else {
        const raw = await cfRes.text()
        console.warn('[lounge-video-upload]', {
          ts: new Date().toISOString(),
          phase: 'cf_stream_mint_cloudflare_api',
          outcome: 'non_json_response',
          cfHttpStatus: cfRes.status,
          snippet: raw.slice(0, 240),
        })
        return new Response(
          JSON.stringify({
            error: `Cloudflare returned non-JSON (${cfRes.status}): ${raw.slice(0, 240)}`,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } catch {
      console.warn('[lounge-video-upload]', {
        ts: new Date().toISOString(),
        phase: 'cf_stream_mint_cloudflare_api',
        outcome: 'json_parse_or_read_failed',
        cfHttpStatus: cfRes.status,
      })
      return new Response(JSON.stringify({ error: 'Could not read Cloudflare response.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!cfRes.ok || !cfJson?.success || !cfJson.result?.uploadURL || !cfJson.result?.uid) {
      let msg =
        cfJson?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
        `Cloudflare Stream error (${cfRes.status})`
      if (/could not route|object identifier is invalid|invalid account/i.test(msg)) {
        msg += cloudflareAccountHint()
      }
      if (/storage capacity|storage quota|allocated storage|exceeded your.*storage|purchase more minutes/i.test(msg)) {
        msg += cloudflareStreamStorageHint()
      }
      console.warn('[lounge-video-upload]', {
        ts: new Date().toISOString(),
        phase: 'cf_stream_mint_cloudflare_api',
        outcome: 'cf_error_or_incomplete',
        cfHttpStatus: cfRes.status,
        cfSuccess: Boolean(cfJson?.success),
        hasUploadUrl: Boolean(cfJson?.result?.uploadURL),
        hasUid: Boolean(cfJson?.result?.uid),
        errorSummary: msg.slice(0, 500),
      })
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(
      JSON.stringify({
        uploadURL: cfJson.result.uploadURL,
        uid: cfJson.result.uid,
        maxDurationSeconds: MAX_DURATION_SECONDS,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[lounge-video-upload]', {
      ts: new Date().toISOString(),
      phase: 'cf_stream_mint_edge',
      outcome: 'unhandled_throw',
      message: (msg || 'Server error').slice(0, 500),
    })
    return new Response(JSON.stringify({ error: msg || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
