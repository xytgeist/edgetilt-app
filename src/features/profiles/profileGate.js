import { pickDefaultProfileBannerUrl } from './defaultProfileBanners'
import {
  requestCfR2DirectUpload,
  uploadFileToCfR2PresignedUrl,
} from '../../utils/loungeCfImageMedia.js'

/** Strip invisible chars that often sneak in from mobile paste/autocorrect. */
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF]/g

/**
 * One line for UI: which step failed + message + PostgREST/Storage fields when present.
 * @param {unknown} err
 * @param {'Avatar upload'|'Save profile'} stepLabel
 */
export function formatProfileSaveDebugError(err, stepLabel = '') {
  if (err == null) return stepLabel ? `${stepLabel}: unknown error` : 'Unknown error'
  if (typeof err === 'string') return [stepLabel, err].filter(Boolean).join(': ')

  const msg =
    (typeof err.message === 'string' && err.message) ||
    (typeof err.error_description === 'string' && err.error_description) ||
    (typeof err.error === 'string' && err.error) ||
    ''
  const code = err.code ?? err.statusCode ?? err.status
  const details = typeof err.details === 'string' ? err.details : ''
  const hint = typeof err.hint === 'string' ? err.hint : ''
  const name = typeof err.name === 'string' && err.name !== 'Error' ? err.name : ''

  const head = [stepLabel, name, msg.trim()].filter(Boolean).join(' - ')
  const metaParts = []
  if (code != null && code !== '') metaParts.push(`code=${code}`)
  if (details) metaParts.push(`details=${details}`)
  if (hint) metaParts.push(`hint=${hint}`)
  const meta = metaParts.length ? ` (${metaParts.join(' · ')})` : ''
  return head ? `${head}${meta}` : stepLabel ? `${stepLabel}: could not read error` : 'Could not read error'
}

const RESERVED_HANDLES = new Set([
  'admin',
  'api',
  'app',
  'billing',
  'guidelines',
  'help',
  'login',
  'logout',
  'moderator',
  'mod',
  'privacy',
  'root',
  'settings',
  'signup',
  'support',
  'system',
  'terms',
  'user',
  'users',
  'www',
])

function toTitleCase(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function normalizeHandle(rawValue) {
  const raw = String(rawValue || '').replace(ZERO_WIDTH_RE, '').toLowerCase()
  const compact = raw
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (!compact) return ''
  const clipped = compact.slice(0, 30)
  if (clipped.length < 2) return ''
  return clipped
}

/** Single-field @handle input → stored slug (no @). Max length matches handle column clipping. */
export function handleSlugFromAtInput(raw) {
  let v = String(raw ?? '').replace(ZERO_WIDTH_RE, '')
  if (v === '' || v === '@') return ''
  if (!v.startsWith('@')) v = `@${v.replace(/@/g, '')}`
  const tail = v.slice(1).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30)
  return tail
}

/** Two-letter initials for profile avatar placeholder (matches Lounge fallback style). */
export function profileAvatarInitials(displayName, handle) {
  const base = String(displayName || handle || 'Member')
    .trim()
    .replace(/\s+/g, ' ')
  if (!base) return 'ME'
  const words = base.split(' ').filter(Boolean)
  if (words.length >= 2) return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase()
  const letters = base.replace(/[^a-z0-9]/gi, '').toUpperCase()
  return letters.slice(0, 2) || 'ME'
}

export function profileAvatarToneClass(seedValue) {
  const seed = String(seedValue || '')
  const tones = [
    'bg-rose-600/70',
    'bg-amber-600/70',
    'bg-emerald-600/70',
    'bg-sky-600/70',
    'bg-violet-600/70',
    'bg-fuchsia-600/70',
    'bg-cyan-600/70',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return tones[hash % tones.length]
}

export function profileSeedFromUser(user) {
  const email = String(user?.email || '')
  const local = email.includes('@') ? email.split('@')[0] : ''
  const baseHandle = normalizeHandle(local) || `user_${String(user?.id || '').slice(0, 6)}`
  const displayFromLocal = local
    .replace(/[._-]+/g, ' ')
    .trim()
  const displayName = toTitleCase(displayFromLocal) || 'Member'
  return { baseHandle, displayName }
}

export async function fetchOwnProfile(supabaseClient, userId) {
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('user_id,handle,display_name,avatar_url,bio,about_me,banner_url,location,category_pills,created_at,role,handle_changed_at,is_og')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: data || null, error: null }
}

/**
 * If the user has no `profiles` row yet, create one from email-based seed (handle + display name).
 * Idempotent. Call after login / when `user` is set (including OAuth) so the Lounge composer reads real
 * initials from `profiles` instead of falling back to `composerStableInitialsFromUid` (first two hex
 * digits of the user id, e.g. “65”). The app still shows the “Complete your profile” gate for new rows
 * until the user saves once (see `readProfileGateAck` / `writeProfileGateAck` in Lounge).
 */
export async function ensureDefaultProfileRow(supabaseClient, user) {
  if (!user?.id) return { data: null, error: null, created: false }
  const existing = await fetchOwnProfile(supabaseClient, user.id)
  if (existing.error) return { data: null, error: existing.error, created: false }
  if (existing.data) return { data: existing.data, error: null, created: false }
  const seed = profileSeedFromUser(user)
  const { data, error } = await saveProfileWithHandleFallback({
    supabaseClient,
    user,
    displayName: seed.displayName,
    requestedHandle: seed.baseHandle,
    avatarUrl: undefined,
  })
  return { data, error, created: !error && !!data }
}

function candidateHandle(base, index) {
  if (index === 0) return base
  const suffix = `_${index}`
  const trunk = base.slice(0, Math.max(2, 30 - suffix.length))
  return `${trunk}${suffix}`.slice(0, 30)
}

export function isReservedProfileHandle(rawHandle) {
  const handle = normalizeHandle(rawHandle)
  return Boolean(handle && RESERVED_HANDLES.has(handle))
}

export function profileHandleCandidate(baseHandle, index) {
  const base = normalizeHandle(baseHandle)
  if (!base) return ''
  return candidateHandle(base, index)
}

async function fetchProfileRowByHandleIlike(supabaseClient, handle) {
  const slug = normalizeHandle(handle)
  if (!slug) return null
  const { data, error } = await supabaseClient
    .from('profiles')
    .select('user_id,handle')
    .ilike('handle', slug)
    .maybeSingle()
  if (error) return null
  return data
}

/** First slug starting at `baseHandle` (+ numeric suffix) not reserved and not owned by another user. */
export async function suggestAvailableProfileHandle(supabaseClient, baseHandle, excludeUserId) {
  const normalizedBase = normalizeHandle(baseHandle)
  if (!normalizedBase) return null
  let safeBase = normalizedBase
  if (RESERVED_HANDLES.has(safeBase)) {
    safeBase = candidateHandle(safeBase, 1)
  }
  const exclude = String(excludeUserId || '')

  for (let i = 0; i < 30; i += 1) {
    const candidate = candidateHandle(safeBase, i)
    if (!candidate || RESERVED_HANDLES.has(candidate)) continue
    const row = await fetchProfileRowByHandleIlike(supabaseClient, candidate)
    if (!row || String(row.user_id) === exclude) return candidate
  }
  return null
}

/**
 * Client preflight before an explicit handle save. Returns `{ ok: true, handle }` or
 * `{ ok: false, reason: 'taken'|'reserved', handle, suggestedHandle }`.
 */
export async function checkProfileHandleAvailability({ supabaseClient, requestedHandle, excludeUserId }) {
  const handle = normalizeHandle(requestedHandle)
  if (!handle || handle.length < 2) {
    return { ok: false, reason: 'invalid', handle: handle || '', suggestedHandle: null }
  }

  if (isReservedProfileHandle(handle)) {
    const suggestedHandle = await suggestAvailableProfileHandle(supabaseClient, handle, excludeUserId)
    return { ok: false, reason: 'reserved', handle, suggestedHandle }
  }

  const existing = await fetchProfileRowByHandleIlike(supabaseClient, handle)
  if (existing && String(existing.user_id) !== String(excludeUserId || '')) {
    const suggestedHandle = await suggestAvailableProfileHandle(supabaseClient, handle, excludeUserId)
    return { ok: false, reason: 'taken', handle, suggestedHandle }
  }

  return { ok: true, handle }
}

/** Postgres 23505 on `profiles_handle_lower_key` / lower(handle) - try next handle candidate. */
export function isProfileHandleUniqueViolation(error) {
  if (!error) return false
  const pgMsg = [error.message, error.details, error.hint, error.constraint]
    .filter(Boolean)
    .join(' ')
  return (
    String(error.code || '') === '23505' &&
    (/profiles_handle_lower_key/i.test(pgMsg) || /lower\s*\(\s*handle\s*\)/i.test(pgMsg))
  )
}

const PROFILE_SAVE_SELECT =
  'user_id,handle,display_name,avatar_url,bio,about_me,banner_url,location,category_pills,created_at,role,handle_changed_at,is_og'

export async function saveProfileWithHandleFallback({
  supabaseClient,
  user,
  displayName,
  requestedHandle,
  avatarUrl,
  bannerUrl,
  /** When true, save exactly `requestedHandle` (no silent `_1` suffix retries). */
  strictHandle = false,
}) {
  const seed = profileSeedFromUser(user)
  const normalizedBase = normalizeHandle(requestedHandle) || seed.baseHandle
  const safeBase = RESERVED_HANDLES.has(normalizedBase) ? `${normalizedBase}_1` : normalizedBase
  const safeDisplay = String(displayName || '').trim().slice(0, 24) || seed.displayName
  const nowIso = new Date().toISOString()

  const existing = await fetchOwnProfile(supabaseClient, user.id)
  if (existing.error) return { data: null, error: existing.error }
  const existingRole = String(existing.data?.role || '').toLowerCase()
  const preserveStaffRole =
    existingRole === 'moderator' || existingRole === 'admin' ? existing.data.role : null

  const attemptCount = strictHandle ? 1 : 30

  for (let i = 0; i < attemptCount; i += 1) {
    const handle = strictHandle ? normalizedBase : candidateHandle(safeBase, i)

    if (existing.data) {
      const updatePayload = {
        handle,
        display_name: safeDisplay,
        updated_at: nowIso,
      }
      if (avatarUrl !== undefined) updatePayload.avatar_url = avatarUrl || null
      if (preserveStaffRole) updatePayload.role = preserveStaffRole

      const { data, error } = await supabaseClient
        .from('profiles')
        .update(updatePayload)
        .eq('user_id', user.id)
        .select(PROFILE_SAVE_SELECT)
        .maybeSingle()

      if (error) {
        if (isProfileHandleUniqueViolation(error)) continue
        return { data: null, error }
      }
      if (!data) {
        return {
          data: null,
          error: new Error('Could not update profile (row missing). Refresh and try again.'),
        }
      }
      return { data, error: null }
    }

    const insertPayload = {
      user_id: user.id,
      handle,
      display_name: safeDisplay,
      updated_at: nowIso,
      role: 'user',
    }
    if (avatarUrl !== undefined) insertPayload.avatar_url = avatarUrl || null
    if (bannerUrl !== undefined) {
      insertPayload.banner_url = bannerUrl || null
    } else {
      insertPayload.banner_url = pickDefaultProfileBannerUrl(user.id)
    }

    const { data, error } = await supabaseClient
      .from('profiles')
      .insert(insertPayload)
      .select(PROFILE_SAVE_SELECT)
      .single()

    if (error) {
      if (isProfileHandleUniqueViolation(error)) continue
      return { data: null, error }
    }
    return { data, error: null }
  }

  return {
    data: null,
    error: new Error('Could not find an available handle. Try a different handle.'),
  }
}

export async function uploadProfileAvatar({ supabaseClient, user, file }) {
  const mime = String(file?.type || '').toLowerCase()
  if (!mime.startsWith('image/')) {
    return { data: null, error: new Error('Please choose an image file.') }
  }

  try {
    const mint = await requestCfR2DirectUpload(supabaseClient, {
      contentType: file.type || 'image/jpeg',
      fileName: file.name || '',
    })
    if (mint.configured) {
      await uploadFileToCfR2PresignedUrl(mint.data.uploadURL, file)
      return { data: mint.data.publicUrl, error: null }
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return { data: null, error: new Error('Could not upload your photo. Check your connection and try again.') }
    }
    return { data: null, error: e instanceof Error ? e : new Error(raw || 'Could not upload avatar image.') }
  }

  // R2 not configured - fall back to Supabase Storage
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bucket = 'profile-avatars'

  const { error: uploadError } = await supabaseClient.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
  })
  if (uploadError) {
    const raw = String(
      uploadError.message || uploadError.error || uploadError.statusCode || uploadError || ''
    ).trim()
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return {
        data: null,
        error: new Error('Could not upload your photo. Check your connection and try again.'),
      }
    }
    return {
      data: null,
      error: uploadError instanceof Error ? uploadError : new Error(raw || 'Could not upload avatar image.'),
    }
  }

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path)
  return { data: data?.publicUrl || null, error: null }
}

/** Wide banner for full-screen profile. Falls back to Supabase `profile-banners` bucket if R2 is not configured. */
export async function uploadProfileBanner({ supabaseClient, user, file }) {
  const mime = String(file?.type || '').toLowerCase()
  if (!mime.startsWith('image/')) {
    return { data: null, error: new Error('Please choose an image file.') }
  }

  try {
    const mint = await requestCfR2DirectUpload(supabaseClient, {
      contentType: file.type || 'image/jpeg',
      fileName: file.name || '',
    })
    if (mint.configured) {
      await uploadFileToCfR2PresignedUrl(mint.data.uploadURL, file)
      return { data: mint.data.publicUrl, error: null }
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return { data: null, error: new Error('Could not upload your banner. Check your connection and try again.') }
    }
    return { data: null, error: e instanceof Error ? e : new Error(raw || 'Could not upload banner image.') }
  }

  // R2 not configured - fall back to Supabase Storage
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bucket = 'profile-banners'

  const { error: uploadError } = await supabaseClient.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
  })
  if (uploadError) {
    const raw = String(
      uploadError.message || uploadError.error || uploadError.statusCode || uploadError || ''
    ).trim()
    if (/load failed|failed to fetch|networkerror|network request failed/i.test(raw)) {
      return {
        data: null,
        error: new Error('Could not upload your banner. Check your connection and try again.'),
      }
    }
    return {
      data: null,
      error: uploadError instanceof Error ? uploadError : new Error(raw || 'Could not upload banner image.'),
    }
  }

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path)
  return { data: data?.publicUrl || null, error: null }
}

