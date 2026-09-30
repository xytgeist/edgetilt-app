/**
 * Accounts that have signed in on this device (survives sign-out). Powers the
 * "Connect account? / Continue with new" prompt when a sign-in creates a new account.
 * Display only: connecting still requires signing in to the remembered account.
 */

const STORE_KEY = 'edgeDeviceAccounts:v1'
const PENDING_KEY = 'edgeAccountConnectPending:v1'
const PROMPTED_KEY = 'edgeAccountConnectPrompted:v1'
const MAX_ACCOUNTS = 8
const PENDING_TTL_MS = 30 * 60 * 1000

const METHOD_LABEL = { google: 'Google', apple: 'Apple', phone: 'phone', email: 'email' }

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota */
  }
}

function maskEmail(email) {
  const [local, domain] = String(email || '').split('@')
  if (!local || !domain || /privaterelay\.appleid\.com$/i.test(domain)) return ''
  return `${local.slice(0, 2)}•••@${domain}`
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? `•••${digits.slice(-4)}` : ''
}

/** Sign-in methods on an auth user: google | apple | phone | email. */
export function userSignInMethods(user) {
  const providers = (user?.identities || []).map((i) => String(i?.provider || '').toLowerCase())
  const fromMeta = Array.isArray(user?.app_metadata?.providers) ? user.app_metadata.providers : []
  const all = [...new Set([...providers, ...fromMeta.map((p) => String(p).toLowerCase())])]
  return all.filter((p) => METHOD_LABEL[p])
}

export function signInMethodLabel(method) {
  return METHOD_LABEL[method] || method
}

export function listDeviceAccounts() {
  const list = readJson(STORE_KEY, [])
  return Array.isArray(list) ? list.filter((a) => a && a.user_id) : []
}

export function rememberDeviceAccount(user, profile) {
  if (!user?.id) return
  const entry = {
    user_id: user.id,
    handle: profile?.handle || '',
    display_name: profile?.display_name || '',
    avatar_url: profile?.avatar_url || '',
    methods: userSignInMethods(user),
    email_hint: maskEmail(user.email),
    phone_hint: maskPhone(user.phone),
    last_seen: Date.now(),
  }
  const rest = listDeviceAccounts().filter((a) => a.user_id !== user.id)
  writeJson(STORE_KEY, [entry, ...rest].slice(0, MAX_ACCOUNTS))
}

export function forgetDeviceAccount(userId) {
  writeJson(STORE_KEY, listDeviceAccounts().filter((a) => a.user_id !== userId))
}

export function wasConnectPromptShown(userId) {
  return readJson(PROMPTED_KEY, []).includes(userId)
}

export function markConnectPromptShown(userId) {
  const seen = readJson(PROMPTED_KEY, [])
  if (!seen.includes(userId)) writeJson(PROMPTED_KEY, [...seen, userId].slice(-20))
}

/** { targetUserId, targetHandle, targetMethods, freshMethod, freshPhone, startedAt } */
export function readConnectPending() {
  const p = readJson(PENDING_KEY, null)
  if (!p || !p.targetUserId || Date.now() - Number(p.startedAt || 0) > PENDING_TTL_MS) return null
  return p
}

export function writeConnectPending(pending) {
  writeJson(PENDING_KEY, pending ? { ...pending, startedAt: Date.now() } : null)
}
