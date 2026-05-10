const RESERVED_HANDLES = new Set([
  'admin',
  'api',
  'app',
  'billing',
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
  const raw = String(rawValue || '').toLowerCase()
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
  let v = String(raw ?? '')
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
    .select('user_id,handle,display_name,avatar_url,bio')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: data || null, error: null }
}

function candidateHandle(base, index) {
  if (index === 0) return base
  const suffix = `_${index}`
  const trunk = base.slice(0, Math.max(2, 30 - suffix.length))
  return `${trunk}${suffix}`.slice(0, 30)
}

export async function saveProfileWithHandleFallback({
  supabaseClient,
  user,
  displayName,
  requestedHandle,
  avatarUrl,
}) {
  const seed = profileSeedFromUser(user)
  const normalizedBase = normalizeHandle(requestedHandle) || seed.baseHandle
  const safeBase = RESERVED_HANDLES.has(normalizedBase) ? `${normalizedBase}_1` : normalizedBase
  const safeDisplay = String(displayName || '').trim().slice(0, 24) || seed.displayName
  const nowIso = new Date().toISOString()

  for (let i = 0; i < 30; i += 1) {
    const handle = candidateHandle(safeBase, i)
    const payload = {
      user_id: user.id,
      handle,
      display_name: safeDisplay,
      updated_at: nowIso,
    }
    if (avatarUrl !== undefined) payload.avatar_url = avatarUrl || null

    const { data, error } = await supabaseClient
      .from('profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select('user_id,handle,display_name')
      .single()

    if (!error) return { data, error: null }

    const isHandleConflict =
      error.code === '23505' &&
      (String(error.message || '').includes('profiles_handle_lower_key') ||
        String(error.details || '').includes('profiles_handle_lower_key'))
    if (isHandleConflict) continue

    return { data: null, error }
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

  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const bucket = 'profile-avatars'

  const { error: uploadError } = await supabaseClient.storage.from(bucket).upload(path, file, {
    upsert: false,
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
  })
  if (uploadError) return { data: null, error: uploadError }

  const { data } = supabaseClient.storage.from(bucket).getPublicUrl(path)
  return { data: data?.publicUrl || null, error: null }
}

