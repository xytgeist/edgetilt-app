/**
 * Post as @sharpesyndicate via OAuth 1.0a user tokens.
 * App-only X_API_BEARER_TOKEN cannot tweet. Secrets live on Edge only.
 */
import { toPlainOutboundText } from './loungeBotPlainOutbound.ts'
import { formatXApiFailure } from './loungeBotXApi.ts'

const TWEET_URL = 'https://api.x.com/2/tweets'
/** Default tweet cap (free / standard). */
export const X_SAFE_CHARS = 280
/** Premium long-form cap … used when X gets the same card as VIP chat (TNF / SNF / MNF). */
export const X_LONG_FORM_CHARS = 4000

export type SyndicateXPublishResult = {
  tweetId: string | null
  warning?: string
}

function readSecret(name: string): string {
  return String(Deno.env.get(name) || '').trim()
}

export function syndicateXSecretsReady(): boolean {
  return Boolean(
    readSecret('X_SYNDICATE_API_KEY')
      && readSecret('X_SYNDICATE_API_SECRET')
      && readSecret('X_SYNDICATE_ACCESS_TOKEN')
      && readSecret('X_SYNDICATE_ACCESS_TOKEN_SECRET'),
  )
}

/** RFC 3986 encode for OAuth 1.0a. */
function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function randomNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function hmacSha1Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  const bytes = new Uint8Array(sig)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

async function oauth1AuthorizationHeader(): Promise<string> {
  const consumerKey = readSecret('X_SYNDICATE_API_KEY')
  const consumerSecret = readSecret('X_SYNDICATE_API_SECRET')
  const token = readSecret('X_SYNDICATE_ACCESS_TOKEN')
  const tokenSecret = readSecret('X_SYNDICATE_ACCESS_TOKEN_SECRET')
  const oauth: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomNonce(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: '1.0',
  }
  const paramString = Object.keys(oauth)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauth[k]!)}`)
    .join('&')
  const base = ['POST', percentEncode(TWEET_URL), percentEncode(paramString)].join('&')
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`
  oauth.oauth_signature = await hmacSha1Base64(signingKey, base)
  const header = Object.keys(oauth)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauth[k]!)}"`)
    .join(', ')
  return `OAuth ${header}`
}

/** Drop http(s) URLs so the tweet stays on the cheap text price. */
function stripHttpUrls(text: string): string {
  return String(text || '')
    .replace(/https?:\/\/[^\s]+/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function formatSyndicateXText(raw: string, maxChars: number = X_SAFE_CHARS): string {
  const cap = Number.isFinite(maxChars) && maxChars > 0 ? maxChars : X_SAFE_CHARS
  const plain = stripHttpUrls(toPlainOutboundText(raw))
  if (plain.length <= cap) return plain
  return `${plain.slice(0, cap - 3).trimEnd()}...`
}

export async function publishSyndicateXPost(
  rawCaption: string,
  opts?: { maxChars?: number },
): Promise<SyndicateXPublishResult> {
  if (!syndicateXSecretsReady()) {
    return {
      tweetId: null,
      warning: 'X secrets missing (X_SYNDICATE_API_KEY / SECRET / ACCESS_TOKEN / ACCESS_TOKEN_SECRET).',
    }
  }
  const text = formatSyndicateXText(rawCaption, opts?.maxChars)
  if (!text) {
    return { tweetId: null, warning: 'X caption empty after plain-text strip.' }
  }

  try {
    const authorization = await oauth1AuthorizationHeader()
    const res = await fetch(TWEET_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { tweetId: null, warning: formatXApiFailure(res.status, detail) }
    }
    const json = await res.json().catch(() => null)
    const id = String(json?.data?.id || '').trim()
    if (!id) return { tweetId: null, warning: 'X accepted the post but returned no tweet id.' }
    return { tweetId: id }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { tweetId: null, warning: `X publish error: ${message}` }
  }
}
