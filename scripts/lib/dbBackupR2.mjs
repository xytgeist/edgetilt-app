/**
 * Private R2 helpers for Supabase DB dumps (S3 API via aws4fetch).
 * Distinct from Lounge public media (`LOUNGE_CF_R2_*`) … never put dumps on a public bucket.
 */
import { AwsClient } from 'aws4fetch'
import fs from 'fs'
import path from 'path'
import { repoRoot } from './supabaseEnv.mjs'

const CLOUDFLARE_ACCOUNT_ID_RE = /^[0-9a-f]{32}$/i

/**
 * Load DB_BACKUP_R2_* from process env, optionally overlaying `.env.master`.
 * @returns {{ accountId: string, accessKeyId: string, secretAccessKey: string, bucket: string }}
 */
export function readDbBackupR2Config() {
  const masterPath = path.join(repoRoot, '.env.master')
  if (fs.existsSync(masterPath)) {
    for (const line of fs.readFileSync(masterPath, 'utf8').split('\n')) {
      const s = line.trim()
      if (!s || s.startsWith('#')) continue
      const eq = s.indexOf('=')
      if (eq <= 0) continue
      const key = s.slice(0, eq).trim()
      if (!key.startsWith('DB_BACKUP_R2_')) continue
      let val = s.slice(eq + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (process.env[key] === undefined || process.env[key] === '') {
        process.env[key] = val
      }
    }
  }

  const accountId = (process.env.DB_BACKUP_R2_ACCOUNT_ID || '').trim()
  const accessKeyId = (process.env.DB_BACKUP_R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.DB_BACKUP_R2_SECRET_ACCESS_KEY || '').trim()
  const bucket = (process.env.DB_BACKUP_R2_BUCKET || '').trim()

  const missing = []
  if (!accountId) missing.push('DB_BACKUP_R2_ACCOUNT_ID')
  if (!accessKeyId) missing.push('DB_BACKUP_R2_ACCESS_KEY_ID')
  if (!secretAccessKey) missing.push('DB_BACKUP_R2_SECRET_ACCESS_KEY')
  if (!bucket) missing.push('DB_BACKUP_R2_BUCKET')
  if (missing.length) {
    throw new Error(
      `Missing ${missing.join(', ')}. Create a private R2 bucket (no public domain) and add keys to .env.master. See docs/db-r2-backups.md.`,
    )
  }
  if (!CLOUDFLARE_ACCOUNT_ID_RE.test(accountId)) {
    throw new Error('DB_BACKUP_R2_ACCOUNT_ID must be a 32-char hex Cloudflare account id.')
  }
  if (/media|public|cdn/i.test(bucket) && !/backup/i.test(bucket)) {
    process.stderr.write(
      `[db-backup-r2] warning: bucket "${bucket}" does not look like a dedicated backup bucket. Dumps must not live on the public Lounge media bucket.\n`,
    )
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

function awsClient(cfg) {
  return new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

function objectUrl(cfg, objectKey) {
  const key = String(objectKey || '').replace(/^\/+/, '')
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}

export async function dbBackupR2PutFile(cfg, objectKey, filePath, contentType) {
  const body = fs.readFileSync(filePath)
  const client = awsClient(cfg)
  const signed = await client.sign(
    new Request(objectUrl(cfg, objectKey), {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Cache-Control': 'private, no-store',
      },
      body,
    }),
    { aws: { region: 'auto', service: 's3' } },
  )
  const res = await fetch(signed)
  if (!res.ok) {
    const raw = await res.text().catch(() => '')
    throw new Error(`R2 put failed (${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
  }
  return body.length
}

function parseListObjectsV2(xml) {
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
    m[1]
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"'),
  )
  const lastModified = [...xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)].map((m) => m[1])
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const nextMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)
  return {
    objects: keys.map((key, i) => ({ key, lastModified: lastModified[i] || null })),
    truncated,
    nextToken: nextMatch?.[1],
  }
}

export async function dbBackupR2ListPrefix(cfg, prefix) {
  const client = awsClient(cfg)
  const out = []
  let continuationToken
  do {
    const url = new URL(`https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('max-keys', '1000')
    url.searchParams.set('prefix', prefix)
    if (continuationToken) url.searchParams.set('continuation-token', continuationToken)
    const signed = await client.sign(new Request(url.toString(), { method: 'GET' }), {
      aws: { region: 'auto', service: 's3' },
    })
    const res = await fetch(signed)
    if (!res.ok) {
      const raw = await res.text().catch(() => '')
      throw new Error(`R2 list failed (${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
    }
    const parsed = parseListObjectsV2(await res.text())
    out.push(...parsed.objects)
    continuationToken = parsed.truncated ? parsed.nextToken : undefined
  } while (continuationToken)
  return out
}

export async function dbBackupR2DeleteObject(cfg, objectKey) {
  const client = awsClient(cfg)
  const signed = await client.sign(new Request(objectUrl(cfg, objectKey), { method: 'DELETE' }), {
    aws: { region: 'auto', service: 's3' },
  })
  const res = await fetch(signed)
  if (!res.ok && res.status !== 204) {
    const raw = await res.text().catch(() => '')
    throw new Error(`R2 delete failed (${res.status})${raw ? `: ${raw.slice(0, 200)}` : ''}`)
  }
}

/**
 * Delete objects under prefix whose LastModified is older than retainDays.
 * @returns {Promise<{ deleted: string[], kept: number }>}
 */
export async function dbBackupR2PrunePrefix(cfg, prefix, retainDays) {
  const cutoff = Date.now() - retainDays * 24 * 60 * 60 * 1000
  const objects = await dbBackupR2ListPrefix(cfg, prefix)
  const deleted = []
  let kept = 0
  for (const obj of objects) {
    const ts = obj.lastModified ? Date.parse(obj.lastModified) : NaN
    if (!Number.isFinite(ts) || ts >= cutoff) {
      kept += 1
      continue
    }
    await dbBackupR2DeleteObject(cfg, obj.key)
    deleted.push(obj.key)
  }
  return { deleted, kept }
}
