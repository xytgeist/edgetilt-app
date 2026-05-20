import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { AwsClient } from 'npm:aws4fetch@1.0.20'

export const loungeCfR2CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type LoungeCfR2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
}

export function readLoungeCfR2Config(): LoungeCfR2Config | null {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')?.trim() || ''
  const accessKeyId = Deno.env.get('LOUNGE_CF_R2_ACCESS_KEY_ID')?.trim() || ''
  const secretAccessKey = Deno.env.get('LOUNGE_CF_R2_SECRET_ACCESS_KEY')?.trim() || ''
  const bucket = Deno.env.get('LOUNGE_CF_R2_BUCKET')?.trim() || ''
  const publicBaseUrl = (Deno.env.get('LOUNGE_CF_R2_PUBLIC_BASE_URL')?.trim() || '').replace(/\/+$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null
  if (!CLOUDFLARE_ACCOUNT_ID_RE.test(accountId)) return null
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }
}

export function loungeCfR2ConfigHint(): string {
  return (
    ' Set Edge secrets LOUNGE_CF_R2_ACCESS_KEY_ID, LOUNGE_CF_R2_SECRET_ACCESS_KEY, LOUNGE_CF_R2_BUCKET, LOUNGE_CF_R2_PUBLIC_BASE_URL (plus CLOUDFLARE_ACCOUNT_ID). ' +
    'R2 bucket needs a public custom domain on your Cloudflare zone with Image Resizing enabled for /cdn-cgi/image/ delivery.'
  )
}

export function loungeCfR2AwsClient(cfg: LoungeCfR2Config): AwsClient {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

export function loungeCfR2ObjectKey(userId: string, ext: string): string {
  const safeUser = String(userId || '').trim()
  if (!UUID_RE.test(safeUser)) throw new Error('Invalid user id.')
  let safeExt = String(ext || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 8)
  if (!safeExt || safeExt === 'jpeg') safeExt = 'jpg'
  if (safeExt === 'htm' || safeExt === 'html' || safeExt === 'svg') safeExt = 'jpg'
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 10)
  return `${safeUser}/${Date.now()}-${rand}.${safeExt}`
}

export function loungeCfR2PublicUrl(cfg: LoungeCfR2Config, objectKey: string): string {
  const key = String(objectKey || '').replace(/^\/+/, '')
  return `${cfg.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function loungeCfR2ParseObjectKeyFromPublicUrl(cfg: LoungeCfR2Config, publicUrl: string): string {
  const raw = String(publicUrl || '').trim()
  if (!raw) return ''
  let pathname = ''
  try {
    const u = new URL(raw)
    const base = new URL(cfg.publicBaseUrl)
    if (u.origin !== base.origin) return ''
    pathname = u.pathname.replace(/^\/+/, '')
  } catch {
    return ''
  }
  if (!pathname) return ''
  return pathname
    .split('/')
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
    .join('/')
}

export function loungeCfR2KeyOwnedByUser(objectKey: string, userId: string): boolean {
  const key = String(objectKey || '').replace(/^\/+/, '')
  const uid = String(userId || '').trim()
  if (!key || !uid) return false
  return key === uid || key.startsWith(`${uid}/`)
}

export async function loungeCfR2PresignedPutUrl(
  cfg: LoungeCfR2Config,
  objectKey: string,
  contentType: string,
  expiresSec = 3600,
): Promise<string> {
  const key = String(objectKey || '').replace(/^\/+/, '')
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const client = loungeCfR2AwsClient(cfg)
  const signed = await client.sign(
    new Request(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
      },
    }),
    {
      aws: { signQuery: true, region: 'auto', service: 's3' },
      expires: expiresSec,
    },
  )
  return signed.url
}

export async function loungeCfR2PutObject(
  cfg: LoungeCfR2Config,
  objectKey: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const key = String(objectKey || '').replace(/^\/+/, '')
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const client = loungeCfR2AwsClient(cfg)
  const signed = await client.sign(
    new Request(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
      },
      body,
    }),
    {
      aws: { region: 'auto', service: 's3' },
    },
  )
  const res = await fetch(signed)
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(`R2 put failed (${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
  }
}

export async function loungeCfR2DeleteObject(cfg: LoungeCfR2Config, objectKey: string): Promise<void> {
  const key = String(objectKey || '').replace(/^\/+/, '')
  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
  const client = loungeCfR2AwsClient(cfg)
  const signed = await client.sign(new Request(endpoint, { method: 'DELETE' }), {
    aws: { region: 'auto', service: 's3' },
  })
  const res = await fetch(signed)
  if (res.status === 404) return
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(`R2 delete failed (${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
  }
}

export async function loungeCfR2RequireUser(req: Request): Promise<{ admin: SupabaseClient; user: User }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    throw new Response(JSON.stringify({ error: 'Missing Authorization bearer token.' }), {
      status: 401,
      headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const {
    data: { user },
    error: userErr,
  } = await admin.auth.getUser(jwt)
  if (userErr || !user?.id) {
    throw new Response(JSON.stringify({ error: 'Invalid or expired session.' }), {
      status: 401,
      headers: { ...loungeCfR2CorsHeaders, 'Content-Type': 'application/json' },
    })
  }
  return { admin, user }
}

export async function loungeCfR2ViewerIsStaff(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: prof } = await admin.from('profiles').select('role').eq('user_id', userId).maybeSingle()
  const role = String(prof?.role || '').toLowerCase()
  return role === 'moderator' || role === 'admin'
}

export function loungeCfR2ExtFromContentType(contentType: string, fileName = ''): string {
  const mime = String(contentType || '').toLowerCase()
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('png')) return 'png'
  if (mime.includes('gif')) return 'gif'
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg'
  const ext = String(fileName || '')
    .split('.')
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
  if (ext && ext.length <= 8) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}
