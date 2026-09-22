/**
 * Mint a presigned PUT URL for Lounge chat videos (Cloudflare R2).
 * Only accepts video/mp4. byteSize must fit the viewer's Lounge duration cap and a 5 GiB R2 PUT.
 *
 * Secrets (same as lounge-cf-r2-direct-upload):
 *   CLOUDFLARE_ACCOUNT_ID
 *   LOUNGE_CF_R2_ACCESS_KEY_ID
 *   LOUNGE_CF_R2_SECRET_ACCESS_KEY
 *   LOUNGE_CF_R2_BUCKET
 *   LOUNGE_CF_R2_PUBLIC_BASE_URL   (public custom domain, e.g. https://media.example.com)
 */
import {
  loungeCfR2ConfigHint,
  loungeCfR2CorsHeaders,
  loungeCfR2ObjectKey,
  loungeCfR2PresignedPutUrl,
  loungeCfR2PublicUrl,
  loungeCfR2RequireUser,
  readLoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'
import {
  loungeStreamUploadAllowance,
  loungeVideoTooLargeMessage,
} from '../_shared/loungeStreamUploadLimits.ts'

/** R2 PutObject max is 5 GiB. Stay under it. Matches CHAT_R2_PUT_MAX_BYTES in loungeVideoUpload.js. */
const CHAT_R2_PUT_MAX_BYTES = 5 * 1024 * 1024 * 1024 - 1024 * 1024

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
        JSON.stringify({
          error: `Video uploads are not configured (missing Cloudflare R2 credentials on the server).${loungeCfR2ConfigHint()}`,
        }),
        { status: 503, headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const { user, admin } = await loungeCfR2RequireUser(req)

    let contentType = 'video/mp4'
    let byteSize = 0
    try {
      const body = (await req.json()) as { contentType?: string; byteSize?: number }
      if (typeof body?.contentType === 'string' && body.contentType.trim()) {
        contentType = body.contentType.trim()
      }
      byteSize = Number(body?.byteSize)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!Number.isFinite(byteSize) || byteSize <= 0) {
      return new Response(JSON.stringify({ error: 'Video upload is missing a file size.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const allowance = await loungeStreamUploadAllowance(admin, user.id)
    const maxBytes = Math.min(allowance.maxBytes, CHAT_R2_PUT_MAX_BYTES)
    if (byteSize > maxBytes) {
      return new Response(JSON.stringify({ error: loungeVideoTooLargeMessage(maxBytes) }), {
        status: 413,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (contentType.toLowerCase() !== 'video/mp4') {
      return new Response(JSON.stringify({ error: 'Only video/mp4 uploads are allowed.' }), {
        status: 400,
        headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const objectKey = loungeCfR2ObjectKey(user.id, 'mp4')
    const uploadURL = await loungeCfR2PresignedPutUrl(cfg, objectKey, 'video/mp4')
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
