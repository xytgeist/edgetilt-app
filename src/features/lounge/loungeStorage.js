import { normalizeLoungePostCategoryPills } from '../../utils/loungePostCategoryPills.js'

/** Lounge composer: last loaded profile for this browser (validated against session user id). */
export const LOUNGE_PROFILE_CACHE_KEY = 'lounge_composer_profile_v1'

export function readLoungeProfileCache(uid) {
  if (!uid || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(LOUNGE_PROFILE_CACHE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || o.user_id !== uid) return null
    return {
      user_id: o.user_id,
      handle: o.handle ?? null,
      display_name: o.display_name ?? null,
      avatar_url: o.avatar_url ?? null,
      role: o.role ?? 'user',
      bio: o.bio ?? '',
      created_at: o.created_at ?? null,
    }
  } catch {
    return null
  }
}

export function writeLoungeProfileCache(profile) {
  if (!profile?.user_id || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      LOUNGE_PROFILE_CACHE_KEY,
      JSON.stringify({
        user_id: profile.user_id,
        handle: profile.handle,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        role: profile.role ?? 'user',
        bio: profile.bio ?? '',
        created_at: profile.created_at ?? null,
      })
    )
  } catch {
    // ignore
  }
}

/** After Save on the Lounge profile gate, suppress repeat “confirm starter profile” prompts. */
const PROFILE_GATE_ACK_KEY = 'lvslotpro_profile_gate_ack_v1'

export function readProfileGateAck(uid) {
  if (!uid || typeof window === 'undefined') return false
  try {
    const raw = window.localStorage.getItem(PROFILE_GATE_ACK_KEY)
    if (!raw) return false
    const o = JSON.parse(raw)
    return Boolean(o && typeof o === 'object' && o[uid])
  } catch {
    return false
  }
}

export function writeProfileGateAck(uid) {
  if (!uid || typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(PROFILE_GATE_ACK_KEY)
    const o = raw ? JSON.parse(raw) : {}
    const next = o && typeof o === 'object' ? { ...o } : {}
    next[uid] = true
    window.localStorage.setItem(PROFILE_GATE_ACK_KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

const PROFILE_GATE_RECENT_PROFILE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Missing handle/name, or email-seeded row created recently without browser ack (`readProfileGateAck`).
 * Rows with a real avatar URL are treated as already established (photo upload never ran through the
 * Lounge-only ack path for long-time / migrated users).
 */
export function loungeProfileNeedsGate(profile, userId) {
  if (!userId) return false
  const h = String(profile?.handle || '').trim()
  const d = String(profile?.display_name || '').trim()
  if (!h || !d) return true
  if (readProfileGateAck(userId)) return false
  const avatar = String(profile?.avatar_url || '').trim()
  if (avatar) return false
  const createdMs = profile?.created_at ? new Date(profile.created_at).getTime() : NaN
  const now = Date.now()
  const profileRecent =
    Number.isFinite(createdMs) && createdMs <= now && now - createdMs < PROFILE_GATE_RECENT_PROFILE_MS
  return profileRecent
}

export const LOUNGE_COMPOSER_DRAFT_KEY = 'lounge_composer_draft_v1'

export function readLoungeComposerDraft() {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(LOUNGE_COMPOSER_DRAFT_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') return null
    const postText = typeof o.postText === 'string' ? o.postText.slice(0, 280) : ''
    const composerExpanded = o.composerExpanded === true
    const composerMediaUrl =
      typeof o.composerMediaUrl === 'string' ? o.composerMediaUrl.trim().slice(0, 2048) : ''
    return { postText, composerExpanded, composerMediaUrl }
  } catch {
    return null
  }
}

export function persistLoungeComposerDraft(text, expanded, hasLocalMedia, mediaUrl = '') {
  if (typeof window === 'undefined') return
  try {
    const hasText = String(text || '').trim().length > 0
    const hasMedia = !!hasLocalMedia
    const url = String(mediaUrl || '').trim()
    const hasUrl = url.length > 0
    if (!hasText && !expanded && !hasMedia && !hasUrl) {
      sessionStorage.removeItem(LOUNGE_COMPOSER_DRAFT_KEY)
      return
    }
    sessionStorage.setItem(
      LOUNGE_COMPOSER_DRAFT_KEY,
      JSON.stringify({
        postText: String(text || '').slice(0, 280),
        composerExpanded: expanded === true,
        ...(hasUrl ? { composerMediaUrl: url.slice(0, 2048) } : {}),
      })
    )
  } catch {
    // Quota or private mode — ignore.
  }
}

export function clearLoungeComposerDraft() {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(LOUNGE_COMPOSER_DRAFT_KEY)
  } catch {
    // ignore
  }
}

export const LOUNGE_COMPOSER_LAST_CATEGORY_PILLS_KEY = 'loungeComposerLastCategoryPills:v1'

export function readLoungeComposerLastCategoryPills() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(LOUNGE_COMPOSER_LAST_CATEGORY_PILLS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeLoungePostCategoryPills(parsed)
  } catch {
    return []
  }
}

export function writeLoungeComposerLastCategoryPills(pills) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      LOUNGE_COMPOSER_LAST_CATEGORY_PILLS_KEY,
      JSON.stringify(normalizeLoungePostCategoryPills(pills)),
    )
  } catch {
    // ignore
  }
}
