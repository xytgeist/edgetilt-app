/**
 * GPS-ranked nearby casinos (shared by Bankroll + Play Logbook).
 */

/** @param {number} lat1 @param {number} lng1 @param {number} lat2 @param {number} lng2 */
export function haversineMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   cacheRef: { current: unknown[] | null },
 *   onLoading?: (loading: boolean) => void,
 *   onNearby?: (casinos: Array<Record<string, unknown> & { distanceMi: number }>) => void,
 *   onNearest?: (name: string) => void,
 * }} opts
 */
export async function fetchNearbyCasinos(supabaseClient, { cacheRef, onLoading, onNearby, onNearest }) {
  if (!navigator.geolocation) return
  onLoading?.(true)
  try {
    if (!cacheRef.current) {
      const { data } = await supabaseClient
        .from('casinos')
        .select('id, name, city, state, country, lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
      cacheRef.current = data ?? []
    }
    const casinos = /** @type {Array<{ name: string, lat: number, lng: number }>} */ (cacheRef.current)
    if (!casinos.length) {
      onLoading?.(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const withDist = casinos.map(c => ({
          ...c,
          distanceMi: haversineMiles(latitude, longitude, c.lat, c.lng),
        })).sort((a, b) => a.distanceMi - b.distanceMi)

        const top = withDist.slice(0, 20)
        onNearby?.(top)
        if (top.length > 0) onNearest?.(top[0].name)
        onLoading?.(false)
      },
      () => onLoading?.(false),
      { timeout: 8000, maximumAge: 60000 },
    )
  } catch {
    onLoading?.(false)
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 */
export async function fetchActiveBankrollSession(supabaseClient) {
  const { data, error } = await supabaseClient
    .from('bankroll_sessions')
    .select('id, casino_name, status, start_at')
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Active session casino if set; otherwise nearest casino via GPS (same as Bankroll start session).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @param {{
 *   cacheRef: { current: unknown[] | null },
 *   onLoading?: (loading: boolean) => void,
 *   onNearby?: (casinos: Array<Record<string, unknown> & { distanceMi: number }>) => void,
 *   onCasino: (name: string) => void,
 * }} opts
 */
export async function resolveDefaultCaptureCasino(supabaseClient, { cacheRef, onLoading, onNearby, onCasino }) {
  onNearby?.([])
  onLoading?.(false)

  let active = null
  try {
    active = await fetchActiveBankrollSession(supabaseClient)
  } catch {
    // Bankroll table unavailable - fall through to GPS
  }

  const sessionCasino = (active?.casino_name || '').trim()
  if (sessionCasino) {
    onCasino(sessionCasino)
    return { source: 'active_session', activeSession: active }
  }

  onCasino('')
  await fetchNearbyCasinos(supabaseClient, {
    cacheRef,
    onLoading,
    onNearby,
    onNearest: onCasino,
  })
  return { source: 'gps', activeSession: null }
}
