/**
 * Invoke `lounge-sports-scoreboard` with the caller's session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function loungeSportsScoreboard(supabase) {
  let {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return { error: 'You must be signed in for live scores.' }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) session = refreshed.session
  }

  const { data, error } = await supabase.functions.invoke('lounge-sports-scoreboard', {
    body: {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error) {
    let message = error.message || 'Scoreboard request failed.'
    try {
      const ctx = error.context
      if (ctx && typeof ctx.json === 'function') {
        const errBody = await ctx.json()
        if (errBody?.error) message = String(errBody.error)
      }
    } catch {
      /* ignore */
    }
    return { error: message }
  }
  if (data && typeof data === 'object' && data.error) return { error: String(data.error) }
  return data
}
