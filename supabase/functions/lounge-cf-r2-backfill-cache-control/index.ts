/**
 * Ops: set Cache-Control on all objects in the R2 bucket (copy-in-place metadata replace).
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` only.
 * Body: `{ "dryRun"?: boolean }`
 */
import {
  loungeCfR2ConfigHint,
  loungeCfR2CopyObjectReplaceCacheControl,
  loungeCfR2CorsHeaders,
  loungeCfR2ExtFromContentType,
  loungeCfR2HeadObjectContentType,
  loungeCfR2ListAllObjectKeys,
  loungeCfR2RequireServiceRoleAdmin,
  LOUNGE_CF_R2_OBJECT_CACHE_CONTROL,
  readLoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'

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
    loungeCfR2RequireServiceRoleAdmin(req)
    const cfg = readLoungeCfR2Config()
    if (!cfg) {
      return new Response(
        JSON.stringify({ error: `R2 not configured.${loungeCfR2ConfigHint()}` }),
        { status: 503, headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let dryRun = false
    try {
      const body = (await req.json()) as { dryRun?: boolean }
      dryRun = body?.dryRun === true
    } catch {
      // default
    }

    const keys = await loungeCfR2ListAllObjectKeys(cfg)
    const updated: string[] = []
    const errors: Array<{ key: string; error: string }> = []

    for (const key of keys) {
      try {
        let contentType = 'application/octet-stream'
        try {
          contentType = await loungeCfR2HeadObjectContentType(cfg, key)
        } catch {
          contentType = loungeCfR2ExtFromContentType('', key) === 'gif'
            ? 'image/gif'
            : loungeCfR2ExtFromContentType('', key) === 'webp'
              ? 'image/webp'
              : loungeCfR2ExtFromContentType('', key) === 'png'
                ? 'image/png'
                : 'image/jpeg'
        }
        if (!dryRun) {
          await loungeCfR2CopyObjectReplaceCacheControl(cfg, key, contentType)
        }
        updated.push(key)
      } catch (e) {
        errors.push({ key, error: e instanceof Error ? e.message : String(e) })
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        cacheControl: LOUNGE_CF_R2_OBJECT_CACHE_CONTROL,
        objectCount: keys.length,
        updated: updated.length,
        updatedKeys: updated,
        errors,
      }),
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
