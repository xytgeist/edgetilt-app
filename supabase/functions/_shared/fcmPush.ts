import { absolutePushUrl, type ApnsAlertPayload } from './apnsPush.ts'

/**
 * FCM HTTP v1 sender for the EdgeAndroid shell (`fcm_device_tokens`).
 * Secret: FCM_SERVICE_ACCOUNT_JSON (Firebase service account key JSON, whole file).
 * Messages are data-only so the app's EdgePushService always builds the notification.
 */

type FcmSendStats = {
  sent: number
  failed: number
  removed: number
  skipped: boolean
  reason?: 'not_configured' | 'no_tokens'
}

type ServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
}

let cachedAccess: { token: string; expMs: number; email: string } | null = null
let cachedKey: { pem: string; key: CryptoKey } | null = null

export function readFcmServiceAccount(): ServiceAccount | null {
  const raw = (Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null
    return parsed as ServiceAccount
  } catch {
    return null
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\\n/g, '')
    .replace(/\s+/g, '')
  const raw = atob(b64)
  const buf = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) buf[i] = raw.charCodeAt(i)
  return buf.buffer
}

async function importRsaKey(pem: string): Promise<CryptoKey> {
  if (cachedKey?.pem === pem) return cachedKey.key
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  cachedKey = { pem, key }
  return key
}

async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Date.now()
  if (cachedAccess && cachedAccess.email === sa.client_email && cachedAccess.expMs - 60_000 > now) {
    return cachedAccess.token
  }
  const iat = Math.floor(now / 1000)
  const enc = (o: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(o)))
  const signingInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
  })}`
  const key = await importRsaKey(sa.private_key)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput))
  const assertion = `${signingInput}.${base64UrlEncode(new Uint8Array(sig))}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  const json = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !json.access_token) throw new Error(`fcm oauth ${res.status} ${json.error || ''}`)
  cachedAccess = {
    token: json.access_token,
    expMs: now + (json.expires_in || 3600) * 1000,
    email: sa.client_email,
  }
  return json.access_token
}

function buildData(notification: ApnsAlertPayload): Record<string, string> {
  const data: Record<string, string> = {
    title: notification.title,
    body: notification.body,
    url: absolutePushUrl(notification.url),
  }
  if (notification.activityEventId) data.activityEventId = notification.activityEventId
  if (notification.activityBatchId) data.activityBatchId = notification.activityBatchId
  if (notification.eventType) data.eventType = notification.eventType
  if (notification.chatCallId) data.chatCallId = notification.chatCallId
  if (notification.avatarUrl) data.avatarUrl = notification.avatarUrl
  if (notification.roomId) data.roomId = notification.roomId
  if (notification.callerName) data.callerName = notification.callerName
  if (notification.hasVideo != null) data.hasVideo = notification.hasVideo ? 'true' : 'false'
  return data
}

type FcmPostResult = { ok: boolean; status: number; errorCode: string }

export async function postFcm(
  sa: ServiceAccount,
  token: string,
  notification: ApnsAlertPayload,
): Promise<FcmPostResult> {
  const access = await fcmAccessToken(sa)
  const collapse = String(notification.activityBatchId || notification.activityEventId || '').slice(0, 64)
  const message: Record<string, unknown> = {
    token,
    data: buildData(notification),
    android: {
      priority: 'HIGH',
      ...(notification.eventType === 'chat_call_invite' ? { ttl: '30s' } : {}),
      ...(collapse ? { collapse_key: collapse } : {}),
    },
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })
  let errorCode = ''
  if (!res.ok) {
    try {
      const json = await res.json() as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> }
      }
      errorCode = String(
        json.error?.details?.find((d) => d.errorCode)?.errorCode || json.error?.status || '',
      )
    } catch {
      errorCode = ''
    }
  }
  return { ok: res.ok, status: res.status, errorCode }
}

function shouldDropToken(status: number, errorCode: string): boolean {
  const code = errorCode.toUpperCase()
  if (code === 'UNREGISTERED') return true
  return status === 400 && code === 'INVALID_ARGUMENT'
}

export async function sendFcmToUser(
  // deno-lint-ignore no-explicit-any
  admin: any,
  userId: string,
  notification: ApnsAlertPayload,
): Promise<FcmSendStats> {
  const { data: rows, error } = await admin
    .from('fcm_device_tokens')
    .select('id, token')
    .eq('user_id', userId)
  if (error) throw error
  const tokens = (rows || []) as Array<{ id: string; token: string }>
  if (tokens.length === 0) {
    return { sent: 0, failed: 0, removed: 0, skipped: true, reason: 'no_tokens' }
  }
  const sa = readFcmServiceAccount()
  if (!sa) {
    return { sent: 0, failed: tokens.length, removed: 0, skipped: true, reason: 'not_configured' }
  }

  let sent = 0
  let failed = 0
  let removed = 0
  for (const row of tokens) {
    try {
      const result = await postFcm(sa, row.token, notification)
      if (result.ok) {
        sent += 1
        continue
      }
      failed += 1
      if (shouldDropToken(result.status, result.errorCode)) {
        const { error: deleteError } = await admin
          .from('fcm_device_tokens')
          .delete()
          .eq('id', row.id)
          .eq('user_id', userId)
        if (!deleteError) removed += 1
      }
    } catch (err) {
      console.warn('[sendFcmToUser] send failed', err)
      failed += 1
    }
  }
  return { sent, failed, removed, skipped: false }
}
