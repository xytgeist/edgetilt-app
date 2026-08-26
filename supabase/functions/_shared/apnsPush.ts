import { resolvePublicAppOrigin } from './publicAppOrigin.ts'

export type ApnsEnvironment = 'sandbox' | 'production'

export type ApnsAlertPayload = {
  title: string
  body: string
  url: string
  activityEventId?: string
  activityBatchId?: string
  eventType?: string
  chatCallId?: string
}

type ApnsTokenRow = {
  id: string
  token: string
  environment: ApnsEnvironment
  bundle_id: string
}

type ApnsSendStats = {
  sent: number
  failed: number
  removed: number
  skipped: boolean
  reason?: 'not_configured' | 'no_tokens'
}

type ApnsConfig = {
  keyId: string
  teamId: string
  bundleId: string
  p8: string
}

let cachedJwt: { token: string; expMs: number } | null = null
let cachedKey: CryptoKey | null = null
let cachedKeyFingerprint = ''

function otherEnvironment(env: ApnsEnvironment): ApnsEnvironment {
  return env === 'sandbox' ? 'production' : 'sandbox'
}

function apnsHost(env: ApnsEnvironment): string {
  return env === 'production'
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com'
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const trimmed = String(pem || '').trim()
  const b64 = trimmed
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '')
  const raw = atob(b64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i)
  return buf.buffer
}

export function readApnsConfig(): ApnsConfig | null {
  const keyId = (Deno.env.get('APNS_KEY_ID') || '').trim()
  const teamId = (Deno.env.get('APNS_TEAM_ID') || '8932AKQW4W').trim()
  const bundleId = (Deno.env.get('APNS_BUNDLE_ID') || 'com.edgetilt.app').trim()
  const p8 = (Deno.env.get('APNS_P8') || '').trim()
  if (!keyId || !p8) return null
  return { keyId, teamId, bundleId, p8 }
}

export function absolutePushUrl(relativeOrAbsolute: string): string {
  const raw = String(relativeOrAbsolute || '').trim() || '/?tab=home'
  if (/^https?:\/\//i.test(raw)) return raw
  const origin = resolvePublicAppOrigin()
  return `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`
}

async function importP8Key(p8: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyFingerprint === p8) return cachedKey
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(p8),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  cachedKey = key
  cachedKeyFingerprint = p8
  return key
}

async function mintApnsJwt(config: ApnsConfig): Promise<string> {
  const now = Date.now()
  if (cachedJwt && cachedJwt.expMs - 60_000 > now) return cachedJwt.token

  const header = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ alg: 'ES256', kid: config.keyId })),
  )
  const iat = Math.floor(now / 1000)
  const claims = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ iss: config.teamId, iat })),
  )
  const signingInput = new TextEncoder().encode(`${header}.${claims}`)
  const key = await importP8Key(config.p8)
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, signingInput)
  const token = `${header}.${claims}.${base64UrlEncode(new Uint8Array(sig))}`
  cachedJwt = { token, expMs: now + 50 * 60 * 1000 }
  return token
}

function buildApnsBody(notification: ApnsAlertPayload): Record<string, unknown> {
  const body: Record<string, unknown> = {
    aps: {
      alert: {
        title: notification.title,
        body: notification.body,
      },
      sound: 'default',
    },
    url: absolutePushUrl(notification.url),
  }
  if (notification.activityEventId) body.activityEventId = notification.activityEventId
  if (notification.activityBatchId) body.activityBatchId = notification.activityBatchId
  if (notification.eventType) body.eventType = notification.eventType
  if (notification.chatCallId) body.chatCallId = notification.chatCallId
  return body
}

function collapseId(notification: ApnsAlertPayload): string | null {
  const raw = String(notification.activityBatchId || notification.activityEventId || '').trim()
  if (!raw) return null
  return raw.slice(0, 64)
}

type ApnsPostResult = {
  ok: boolean
  status: number
  reason: string
}

async function postApns(
  config: ApnsConfig,
  tokenHex: string,
  environment: ApnsEnvironment,
  bundleId: string,
  notification: ApnsAlertPayload,
): Promise<ApnsPostResult> {
  const jwt = await mintApnsJwt(config)
  const topic = (bundleId || config.bundleId || 'com.edgetilt.app').trim()
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    'apns-topic': topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  }
  const cid = collapseId(notification)
  if (cid) headers['apns-collapse-id'] = cid

  const res = await fetch(`${apnsHost(environment)}/3/device/${tokenHex}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildApnsBody(notification)),
  })
  let reason = ''
  try {
    const json = await res.json() as { reason?: string }
    reason = String(json?.reason || '')
  } catch {
    reason = ''
  }
  return { ok: res.ok, status: res.status, reason }
}

function shouldDropToken(status: number, reason: string): boolean {
  if (status === 410) return true
  const r = reason.toLowerCase()
  return r === 'unregistered' || r === 'expiredtoken' || r === 'devicetokennotfortopic'
}

export async function sendApnsToUser(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  notification: ApnsAlertPayload,
): Promise<ApnsSendStats> {
  const config = readApnsConfig()
  const { data: rows, error } = await admin
    .from('apns_device_tokens')
    .select('id, token, environment, bundle_id')
    .eq('user_id', userId)

  if (error) throw error
  const tokens = (rows || []) as ApnsTokenRow[]
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, removed: 0, skipped: true, reason: 'no_tokens' }
  }
  if (!config) {
    return { sent: 0, failed: tokens.length, removed: 0, skipped: true, reason: 'not_configured' }
  }

  let sent = 0
  let failed = 0
  let removed = 0

  for (const row of tokens) {
    const env: ApnsEnvironment = row.environment === 'production' ? 'production' : 'sandbox'
    try {
      let result = await postApns(config, row.token, env, row.bundle_id, notification)
      if (!result.ok && result.reason === 'BadDeviceToken') {
        const alt = otherEnvironment(env)
        const retry = await postApns(config, row.token, alt, row.bundle_id, notification)
        if (retry.ok) {
          await admin.from('apns_device_tokens').update({ environment: alt }).eq('id', row.id)
          result = retry
        } else {
          result = retry
        }
      }
      if (result.ok) {
        sent += 1
        continue
      }
      failed += 1
      if (shouldDropToken(result.status, result.reason) || result.reason === 'BadDeviceToken') {
        const { error: deleteError } = await admin
          .from('apns_device_tokens')
          .delete()
          .eq('id', row.id)
          .eq('user_id', userId)
        if (!deleteError) removed += 1
      }
    } catch {
      failed += 1
    }
  }

  return { sent, failed, removed, skipped: false }
}
