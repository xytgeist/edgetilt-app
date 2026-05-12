/**
 * Deletes Cloudflare Stream assets stuck in **pendingupload** (direct upload minted, file never finished).
 * Intended for a **cron** or manual ops call — not for browser clients.
 *
 * Auth: header `x-lounge-cf-stream-purge-secret` must equal env `LOUNGE_CF_STREAM_PURGE_SECRET`.
 *
 * Body (JSON, optional):
 *   `maxAgeHours` — only delete if `created` is older than this many hours (default 24, min 1).
 *   `dryRun` — if true, only report uids that would be deleted.
 *
 * Secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_STREAM_API_TOKEN`, `LOUNGE_CF_STREAM_PURGE_SECRET`.
 *
 * @see https://developers.cloudflare.com/api/resources/stream/methods/list/
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lounge-cf-stream-purge-secret',
}

const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i

type CfListVideo = {
  uid?: string
  created?: string
}

type CfListJson = {
  success?: boolean
  errors?: Array<{ message?: string }>
  result?: CfListVideo[]
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
    const purgeSecret = Deno.env.get('LOUNGE_CF_STREAM_PURGE_SECRET')?.trim()
    if (!purgeSecret) {
      return new Response(
        JSON.stringify({
          error:
            'Set LOUNGE_CF_STREAM_PURGE_SECRET on this function, then call with header x-lounge-cf-stream-purge-secret.',
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const got = req.headers.get('x-lounge-cf-stream-purge-secret')?.trim()
    if (got !== purgeSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')?.trim()
    const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')?.trim()
    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({
          error: 'Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_STREAM_API_TOKEN.',
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

    let maxAgeHours = 24
    let dryRun = false
    try {
      const raw = await req.text()
      if (raw.trim()) {
        const body = JSON.parse(raw) as { maxAgeHours?: number; dryRun?: boolean }
        if (typeof body.maxAgeHours === 'number' && Number.isFinite(body.maxAgeHours)) {
          maxAgeHours = Math.max(1, Math.min(168, Math.floor(body.maxAgeHours)))
        }
        if (body.dryRun === true) dryRun = true
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000
    const listBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`
    const listUrl = `${listBase}?status=pendingupload&limit=1000`

    const listRes = await fetch(listUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiToken}` },
    })

    const ct = (listRes.headers.get('Content-Type') || '').toLowerCase()
    let listJson: CfListJson = {}
    try {
      if (ct.includes('application/json')) {
        listJson = (await listRes.json()) as CfListJson
      } else {
        const raw = await listRes.text()
        return new Response(
          JSON.stringify({
            error: `Cloudflare list failed (${listRes.status}): ${raw.slice(0, 240)}`,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Could not read Cloudflare list response.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!listRes.ok || listJson?.success === false) {
      const msg =
        listJson?.errors?.map((e) => e.message).filter(Boolean).join('; ') ||
        `Cloudflare Stream list failed (${listRes.status})`
      return new Response(JSON.stringify({ error: msg }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const rows = Array.isArray(listJson.result) ? listJson.result : []
    const stale: { uid: string; created: string }[] = []
    for (const v of rows) {
      const uid = String(v?.uid || '').trim()
      const created = String(v?.created || '').trim()
      if (!uid || !created) continue
      const t = Date.parse(created)
      if (!Number.isFinite(t) || t > cutoff) continue
      stale.push({ uid, created })
    }

    const deleted: string[] = []
    const deleteErrors: { uid: string; message: string }[] = []

    if (!dryRun) {
      for (const { uid } of stale) {
        const delUrl = `${listBase}/${encodeURIComponent(uid)}`
        const delRes = await fetch(delUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiToken}` },
        })
        if (delRes.status === 404 || delRes.ok) {
          deleted.push(uid)
          continue
        }
        let msg = `HTTP ${delRes.status}`
        try {
          const dj = (await delRes.json()) as { errors?: Array<{ message?: string }> }
          msg = dj?.errors?.map((e) => e.message).filter(Boolean).join('; ') || msg
        } catch {
          // ignore
        }
        deleteErrors.push({ uid, message: msg })
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dryRun,
        maxAgeHours,
        pendingUploadRowCount: rows.length,
        staleCandidates: stale.length,
        deleted,
        deleteErrors,
        wouldDelete: dryRun ? stale.map((s) => s.uid) : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
