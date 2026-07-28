/**
 * Mirror the Vercel-built /call-egress.html (+ assets + logo) onto Lounge R2 so
 * LiveKit RoomComposite headless Chrome can load it without Vercel bot challenges.
 *
 * Auth: service role bearer only.
 * Body: { source_origin?: "https://lvslotpro.com" }
 */
import {
  loungeCfR2PublicUrl,
  loungeCfR2PutObject,
  readLoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

function isServiceRoleBearer(token: string, serviceKey: string, supabaseUrl: string): boolean {
  if (!token) return false
  if (token === serviceKey) return true
  if (!token.startsWith('eyJ')) return false
  const payload = parseJwtPayload(token)
  if (!payload || payload.role !== 'service_role') return false
  const ref = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1]
  if (ref && payload.ref && String(payload.ref) !== ref) return false
  return true
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetch(url, {
    headers: {
      // Prefer a non-browser UA so CDN bot walls are less likely to challenge us.
      'User-Agent': 'EdgeCallEgressPublisher/1.0',
      Accept: '*/*',
    },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Fetch ${url} failed (${res.status}): ${t.slice(0, 180)}`)
  }
  const buf = new Uint8Array(await res.arrayBuffer())
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  return { bytes: buf, contentType }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '').trim()
  if (!supabaseUrl || !serviceKey || !token) {
    return json(401, { error: 'Authorization bearer required.' })
  }
  if (!isServiceRoleBearer(token, serviceKey, supabaseUrl)) {
    return json(401, { error: 'Service role bearer required.' })
  }

  const r2 = readLoungeCfR2Config()
  if (!r2) return json(500, { error: 'R2 is not configured.' })

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const defaultOrigin = supabaseUrl.includes('jtjgtucumuoswnbauxry')
    ? 'https://edgetilt.com'
    : 'https://lvslotpro.com'
  const origin = String(body.source_origin || defaultOrigin).replace(/\/+$/, '')
  const prefix = 'call-egress'

  try {
    const htmlUrl = `${origin}/call-egress.html`
    const htmlRes = await fetchBytes(htmlUrl)
    let html = new TextDecoder().decode(htmlRes.bytes)

    const assetRe = /(?:src|href)="(\/assets\/callEgress-[^"]+)"/g
    const assetPaths = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = assetRe.exec(html)) != null) {
      assetPaths.add(m[1])
    }

    const uploaded: string[] = []
    for (const assetPath of assetPaths) {
      const abs = `${origin}${assetPath}`
      const fileName = assetPath.split('/').pop() || 'asset'
      const key = `${prefix}/${fileName}`
      const file = await fetchBytes(abs)
      const ct = fileName.endsWith('.css')
        ? 'text/css; charset=utf-8'
        : fileName.endsWith('.js')
          ? 'application/javascript; charset=utf-8'
          : file.contentType
      await loungeCfR2PutObject(r2, key, file.bytes, ct)
      const publicUrl = loungeCfR2PublicUrl(r2, key)
      html = html.split(`"${assetPath}"`).join(`"${publicUrl}"`)
      uploaded.push(publicUrl)
    }

    const logo = await fetchBytes(`${origin}/edge-lounge-logo-transparent.png`)
    // Sibling of HTML (relative logo) + site-root path (absolute /edge-lounge-logo… in older bundles).
    for (const logoKey of [
      `${prefix}/edge-lounge-logo-transparent.png`,
      'edge-lounge-logo-transparent.png',
    ]) {
      await loungeCfR2PutObject(r2, logoKey, logo.bytes, 'image/png')
      uploaded.push(loungeCfR2PublicUrl(r2, logoKey))
    }

    const htmlKey = `${prefix}/call-egress.html`
    const htmlBytes = new TextEncoder().encode(html)
    await loungeCfR2PutObject(r2, htmlKey, htmlBytes, 'text/html; charset=utf-8')
    const templateUrl = loungeCfR2PublicUrl(r2, htmlKey)

    return json(200, {
      ok: true,
      template_url: templateUrl,
      uploaded,
      hint:
        'Set Edge secrets CHAT_CALL_EGRESS_TEMPLATE_BASE_URL=<template_url> and CHAT_CALL_EGRESS_USE_CUSTOM=1, then redeploy chat-calls.',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('publish-call-egress-template', msg)
    return json(500, { error: msg })
  }
})
