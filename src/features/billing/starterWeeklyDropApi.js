/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} unlockId
 */
export async function fetchStarterWeeklyDropReveal(supabaseClient, unlockId) {
  if (!supabaseClient || !unlockId) {
    return { data: null, error: new Error('Missing client or unlock id') }
  }
  const { data, error } = await supabaseClient.rpc('get_starter_weekly_drop_reveal', {
    p_unlock_id: unlockId,
  })
  if (error) return { data: null, error }
  const row = Array.isArray(data) ? data[0] : data
  return { data: row || null, error: null }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchPendingStarterWeeklyDrops(supabaseClient) {
  if (!supabaseClient) return { data: [], error: null }
  const { data, error } = await supabaseClient.rpc('get_my_pending_starter_weekly_drops')
  if (error) {
    if (error.code === 'PGRST202') return { data: [], error: null }
    return { data: [], error }
  }
  return { data: Array.isArray(data) ? data : [], error: null }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {string} unlockId
 */
export async function markStarterWeeklyDropScratched(supabaseClient, unlockId) {
  if (!supabaseClient || !unlockId) {
    return { ok: false, error: new Error('Missing client or unlock id') }
  }
  const { data, error } = await supabaseClient.rpc('mark_starter_weekly_drop_scratched', {
    p_unlock_id: unlockId,
  })
  if (error) return { ok: false, error }
  return { ok: Boolean(data), error: null }
}

/** @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient */
export async function fetchStarterWeeklyDropPoolExhausted(supabaseClient) {
  if (!supabaseClient) return { exhausted: false, error: null }
  const { data, error } = await supabaseClient.rpc('starter_has_exhausted_weekly_drop_pool')
  if (error) {
    if (error.code === 'PGRST202') return { exhausted: false, error: null }
    return { exhausted: false, error }
  }
  return { exhausted: Boolean(data), error: null }
}

export const STARTER_WEEKLY_DROP_OPEN_EVENT = 'starter-weekly-drop-open'

/** @param {string} unlockId */
export function dispatchStarterWeeklyDropOpen(unlockId) {
  if (typeof window === 'undefined' || !unlockId) return
  window.dispatchEvent(
    new CustomEvent(STARTER_WEEKLY_DROP_OPEN_EVENT, { detail: { unlockId: String(unlockId) } }),
  )
}

/**
 * @param {(detail: { unlockId: string }) => void} handler
 */
export function listenStarterWeeklyDropOpen(handler) {
  if (typeof window === 'undefined') return () => {}
  const wrapped = (event) => {
    const unlockId = event?.detail?.unlockId
    if (unlockId) handler({ unlockId: String(unlockId) })
  }
  window.addEventListener(STARTER_WEEKLY_DROP_OPEN_EVENT, wrapped)
  return () => window.removeEventListener(STARTER_WEEKLY_DROP_OPEN_EVENT, wrapped)
}

/** @param {string} guideSlug */
export function navigateToGuideSlug(guideSlug) {
  if (typeof window === 'undefined' || !guideSlug) return
  const params = new URLSearchParams(window.location.search || '')
  params.set('tab', 'guides')
  params.set('guide', guideSlug)
  const next = `/?${params.toString()}`
  if (window.location.pathname + window.location.search !== next) {
    window.history.pushState({}, '', next)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }
}

/** Remove `starterDrop=` deep link after opening the scratch modal. */
export function stripStarterDropQueryParam() {
  if (typeof window === 'undefined') return
  const u = new URL(window.location.href)
  if (!u.searchParams.has('starterDrop')) return
  u.searchParams.delete('starterDrop')
  const qs = u.searchParams.toString()
  const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash}`
  window.history.replaceState(window.history.state ?? {}, '', next)
}

/** @param {string} unlockId @param {string | null | undefined} [activityEventId] */
export function buildStarterWeeklyDropDeepLink(unlockId, activityEventId = null) {
  const params = new URLSearchParams()
  params.set('tab', 'home')
  params.set('lounge', 'notifications')
  params.set('starterDrop', unlockId)
  if (activityEventId) params.set('activityEvent', activityEventId)
  return `/?${params.toString()}`
}
