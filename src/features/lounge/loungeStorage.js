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
      bio: o.bio ?? '',
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
        bio: profile.bio ?? '',
      })
    )
  } catch {
    // ignore
  }
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
    return { postText, composerExpanded }
  } catch {
    return null
  }
}

export function persistLoungeComposerDraft(text, expanded, mediaFile) {
  if (typeof window === 'undefined') return
  try {
    const hasText = String(text || '').trim().length > 0
    const hasMedia = !!mediaFile
    if (!hasText && !expanded && !hasMedia) {
      sessionStorage.removeItem(LOUNGE_COMPOSER_DRAFT_KEY)
      return
    }
    sessionStorage.setItem(
      LOUNGE_COMPOSER_DRAFT_KEY,
      JSON.stringify({
        postText: String(text || '').slice(0, 280),
        composerExpanded: expanded === true,
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
