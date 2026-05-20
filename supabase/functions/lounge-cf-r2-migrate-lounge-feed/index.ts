/**
 * One-off ops: copy legacy Supabase `lounge-feed` objects to Cloudflare R2 and rewrite DB URLs.
 *
 * Auth: `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` only.
 * Body: `{ "dryRun"?: boolean, "deleteOld"?: boolean }` (default deleteOld true when not dryRun).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  loungeCfR2ConfigHint,
  loungeCfR2CorsHeaders,
  loungeCfR2ExtFromContentType,
  loungeCfR2PublicUrl,
  loungeCfR2PutObject,
  readLoungeCfR2Config,
  type LoungeCfR2Config,
} from '../_shared/loungeCfR2.ts'

const LOUNGE_FEED_BUCKET = 'lounge-feed'

function requireServiceRoleAdmin(req: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const auth = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || ''
  if (!supabaseUrl || !serviceRoleKey || auth !== serviceRoleKey) {
    throw new Response(JSON.stringify({ error: 'Forbidden — service role bearer required.' }), {
      status: 403,
      headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return createClient(supabaseUrl, serviceRoleKey)
}

export function isLoungeSupabaseFeedMediaUrl(url: string): boolean {
  const s = String(url || '').toLowerCase()
  if (!s) return false
  return s.includes('/storage/v1/object/public/lounge-feed/') || s.includes('/lounge-feed/')
}

export function parseLoungeFeedStoragePath(publicUrl: string): string {
  const u = String(publicUrl || '').trim()
  if (!u) return ''
  const m = u.match(/\/object\/public\/lounge-feed\/(.+)$/i)
  if (m?.[1]) {
    return decodeURIComponent(String(m[1]).split('?')[0]).replace(/^\/+/, '')
  }
  const lower = u.toLowerCase()
  const idx = lower.indexOf('/lounge-feed/')
  if (idx < 0) return ''
  return decodeURIComponent(u.slice(idx + '/lounge-feed/'.length).split('?')[0]).replace(/^\/+/, '')
}

function contentTypeForPath(path: string): string {
  const ext = loungeCfR2ExtFromContentType('', path)
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'png') return 'image/png'
  return 'image/jpeg'
}

function collectHostedUrlsFromRow(row: Record<string, unknown>): string[] {
  const out: string[] = []
  const add = (u: unknown) => {
    const s = String(u ?? '').trim()
    if (s && isLoungeSupabaseFeedMediaUrl(s)) out.push(s)
  }
  const raw = row.image_urls
  if (Array.isArray(raw)) {
    for (const u of raw) add(u)
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) for (const u of parsed) add(u)
    } catch {
      // ignore
    }
  }
  add(row.media_url)
  add(row.stream_poster_url)
  add(row.gif_url)
  return out
}

function replaceMappedUrl(url: string, urlMap: Map<string, string>): string {
  const s = String(url || '').trim()
  return urlMap.get(s) ?? s
}

function replaceMappedJsonUrls(raw: unknown, urlMap: Map<string, string>): unknown {
  if (raw == null) return raw
  let arr = raw
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw)
    } catch {
      return raw
    }
  }
  if (!Array.isArray(arr)) return raw
  return arr.map((u) => replaceMappedUrl(String(u ?? ''), urlMap))
}

function rowNeedsUpdate(row: Record<string, unknown>, urlMap: Map<string, string>): boolean {
  return collectHostedUrlsFromRow(row).some((u) => urlMap.has(u))
}

function buildRowPatch(row: Record<string, unknown>, urlMap: Map<string, string>) {
  return {
    image_urls: replaceMappedJsonUrls(row.image_urls, urlMap),
    media_url: replaceMappedUrl(String(row.media_url ?? ''), urlMap) || null,
    stream_poster_url: replaceMappedUrl(String(row.stream_poster_url ?? ''), urlMap) || null,
    gif_url: replaceMappedUrl(String(row.gif_url ?? ''), urlMap) || null,
  }
}

async function migrateObject(
  admin: SupabaseClient,
  cfg: LoungeCfR2Config,
  oldUrl: string,
  dryRun: boolean,
): Promise<{ oldUrl: string; newUrl: string; storagePath: string }> {
  const storagePath = parseLoungeFeedStoragePath(oldUrl)
  if (!storagePath) throw new Error(`Could not parse lounge-feed path: ${oldUrl}`)

  const { data, error } = await admin.storage.from(LOUNGE_FEED_BUCKET).download(storagePath)
  if (error || !data) {
    throw new Error(`Download failed for ${storagePath}: ${error?.message || 'no data'}`)
  }
  const bytes = new Uint8Array(await data.arrayBuffer())
  const contentType = contentTypeForPath(storagePath)
  const newUrl = loungeCfR2PublicUrl(cfg, storagePath)

  if (!dryRun) {
    await loungeCfR2PutObject(cfg, storagePath, bytes, contentType)
  }

  return { oldUrl, newUrl, storagePath }
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
    const admin = requireServiceRoleAdmin(req)
    const cfg = readLoungeCfR2Config()
    if (!cfg) {
      return new Response(
        JSON.stringify({ error: `R2 not configured.${loungeCfR2ConfigHint()}` }),
        { status: 503, headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let dryRun = false
    let deleteOld = true
    try {
      const body = (await req.json()) as { dryRun?: boolean; deleteOld?: boolean }
      dryRun = body?.dryRun === true
      if (body?.deleteOld === false) deleteOld = false
    } catch {
      // defaults
    }
    if (dryRun) deleteOld = false

    const urlSet = new Set<string>()
    const postRows: Record<string, unknown>[] = []
    const commentRows: Record<string, unknown>[] = []

    const { data: posts, error: postsErr } = await admin
      .from('community_feed_posts')
      .select('id, image_urls, media_url, stream_poster_url, gif_url')
    if (postsErr) throw postsErr
    for (const row of posts || []) {
      postRows.push(row as Record<string, unknown>)
      for (const u of collectHostedUrlsFromRow(row as Record<string, unknown>)) urlSet.add(u)
    }

    const { data: comments, error: commentsErr } = await admin
      .from('feed_comments')
      .select('id, image_urls, media_url, stream_poster_url, gif_url')
    if (commentsErr) throw commentsErr
    for (const row of comments || []) {
      commentRows.push(row as Record<string, unknown>)
      for (const u of collectHostedUrlsFromRow(row as Record<string, unknown>)) urlSet.add(u)
    }

    const uniqueUrls = [...urlSet].filter((u) => {
      try {
        return new URL(u).origin !== new URL(cfg.publicBaseUrl).origin
      } catch {
        return true
      }
    })
    const urlMap = new Map<string, string>()
    const migrated: Array<{ oldUrl: string; newUrl: string; storagePath: string }> = []
    const errors: Array<{ oldUrl: string; error: string }> = []

    for (const oldUrl of uniqueUrls) {
      try {
        const r = await migrateObject(admin, cfg, oldUrl, dryRun)
        urlMap.set(r.oldUrl, r.newUrl)
        migrated.push(r)
      } catch (e) {
        errors.push({ oldUrl, error: e instanceof Error ? e.message : String(e) })
      }
    }

    let postsUpdated = 0
    let commentsUpdated = 0

    for (const row of postRows) {
      if (!rowNeedsUpdate(row, urlMap)) continue
      postsUpdated += 1
      if (!dryRun) {
        const { error } = await admin
          .from('community_feed_posts')
          .update(buildRowPatch(row, urlMap))
          .eq('id', row.id)
        if (error) throw error
      }
    }

    for (const row of commentRows) {
      if (!rowNeedsUpdate(row, urlMap)) continue
      commentsUpdated += 1
      if (!dryRun) {
        const { error } = await admin
          .from('feed_comments')
          .update(buildRowPatch(row, urlMap))
          .eq('id', row.id)
        if (error) throw error
      }
    }

    const deletedPaths: string[] = []
    if (!dryRun && deleteOld) {
      const paths = [...new Set(migrated.map((m) => m.storagePath))]
      if (paths.length > 0) {
        const { error } = await admin.storage.from(LOUNGE_FEED_BUCKET).remove(paths)
        if (error) throw error
        deletedPaths.push(...paths)
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        deleteOld: !dryRun && deleteOld,
        uniqueUrls: uniqueUrls.length,
        migrated: migrated.length,
        postsUpdated,
        commentsUpdated,
        deletedPaths: deletedPaths.length,
        migratedUrls: migrated,
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
