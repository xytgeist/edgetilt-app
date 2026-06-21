/**
 * Mint a presigned PUT URL for AP Guide hero / diagram images (Cloudflare R2).
 *
 * Object key pattern:  guides/{slug}/{filename}
 * e.g.                 guides/buffalo-link/hero.webp
 *
 * Auth (one of):
 *   1. Supabase user JWT — caller must have profiles.role = 'admin'
 *   2. Supabase service-role bearer — for server-to-server calls from the ingest API
 *
 * Secrets (shared with lounge-cf-r2-direct-upload):
 *   CLOUDFLARE_ACCOUNT_ID
 *   LOUNGE_CF_R2_ACCESS_KEY_ID
 *   LOUNGE_CF_R2_SECRET_ACCESS_KEY
 *   LOUNGE_CF_R2_BUCKET
 *   LOUNGE_CF_R2_PUBLIC_BASE_URL
 */
import {
  loungeCfR2ConfigHint,
  loungeCfR2CorsHeaders,
  loungeCfR2ExtFromContentType,
  loungeCfR2PresignedPutUrl,
  loungeCfR2PublicUrl,
  loungeCfR2RequireUser,
  readLoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'

const SLUG_RE     = /^[a-z0-9][a-z0-9-]{0,119}$/
const FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,119}$/

async function requireAdminAccess(req: Request): Promise<void> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() || ''
  const authHeader     = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || ''

  // Service-role bearer — trusted server caller (e.g. ingest Vercel function)
  if (serviceRoleKey && authHeader === serviceRoleKey) return

  // Otherwise: validate user JWT and check admin role
  const { admin, user } = await loungeCfR2RequireUser(req)
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    throw new Response(
      JSON.stringify({ error: 'Admin role required.' }),
      { status: 403, headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
    )
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: loungeCfR2CorsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const cfg = readLoungeCfR2Config()
    if (!cfg) {
      return new Response(
        JSON.stringify({ error: `Guide image uploads are not configured (missing R2 credentials).${loungeCfR2ConfigHint()}` }),
        { status: 503, headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    await requireAdminAccess(req)

    let body: { slug?: string; contentType?: string; filename?: string } = {}
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const slug        = String(body?.slug || '').trim().toLowerCase()
    const contentType = String(body?.contentType || 'image/webp').trim()
    const filenameRaw = String(body?.filename || '').trim().toLowerCase()

    if (!SLUG_RE.test(slug)) {
      return new Response(JSON.stringify({ error: 'Invalid or missing slug.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!contentType.startsWith('image/')) {
      return new Response(JSON.stringify({ error: 'Only image uploads are allowed.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const ext      = loungeCfR2ExtFromContentType(contentType, filenameRaw)
    const filename = filenameRaw && FILENAME_RE.test(filenameRaw) ? filenameRaw : `hero.${ext}`
    const objectKey = `guides/${slug}/${filename}`

    const uploadURL = await loungeCfR2PresignedPutUrl(cfg, objectKey, contentType)
    const publicUrl = loungeCfR2PublicUrl(cfg, objectKey)

    return new Response(
      JSON.stringify({ uploadURL, publicUrl, objectKey }),
      { headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    if (e instanceof Response) return e
    const msg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: msg || 'Server error' }), {
      status: 500,
      headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
