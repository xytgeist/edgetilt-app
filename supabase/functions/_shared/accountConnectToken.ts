/**
 * Connect-account hand-off: `account-connect-prepare` signs the fresh account id plus its
 * already-verified phone / email for one target user; `account-connect-attach` (called as the
 * target) deletes the fresh account and attaches them without a second OTP. HMAC key is the service role key (never leaves the server).
 */

export type ConnectTransfer = {
  v: 1
  target: string
  /** Fresh account to delete once the target signs in (absent on legacy discard tokens). */
  fresh?: string
  phone?: string
  email?: string
  exp: number
}

export const CONNECT_TRANSFER_TTL_MS = 30 * 60 * 1000

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function hmac(key: string, data: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`connect-transfer:${data}`)))
}

export async function signConnectTransfer(key: string, payload: ConnectTransfer): Promise<string> {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)))
  return `${body}.${b64url(await hmac(key, body))}`
}

export async function verifyConnectTransfer(key: string, token: string): Promise<ConnectTransfer | null> {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig) return null
  const expected = b64url(await hmac(key, body))
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as ConnectTransfer
    if (payload?.v !== 1 || !payload.target || !(payload.exp > Date.now())) return null
    return payload
  } catch {
    return null
  }
}
