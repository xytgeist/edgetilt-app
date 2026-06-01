/**
 * Invoke `lounge-chat` Edge function with the caller's Supabase session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function loungeChatInvoke(supabase, payload) {
  // On mobile, iOS suspends background JS timers so the Supabase auto-refresh
  // never fires while the app is asleep. Proactively refresh when the token
  // is expired or within 60s of expiry before calling the Edge Function.
  let { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sign in to use chat.')
  }

  const nowSecs = Math.floor(Date.now() / 1000)
  if (!session.expires_at || session.expires_at - nowSecs < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession()
    if (refreshed?.session?.access_token) {
      session = refreshed.session
    }
  }

  const { data, error, response } = await supabase.functions.invoke('lounge-chat', {
    body: payload,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (error || (data && typeof data === 'object' && 'error' in data && data.error)) {
    const status = response?.status ?? null
    const bodyText = await response?.clone()?.text().catch(() => '') ?? ''
    console.error('[lounge-chat] invoke error', {
      action: payload?.action,
      status,
      error,
      bodyText,
      tokenExpiresAt: session.expires_at,
      nowSecs: Math.floor(Date.now() / 1000),
    })
  }

  if (error) {
    throw new Error(await formatLoungeChatInvokeError(error, response))
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(String(data.error))
  }
  return data
}

/**
 * @param {unknown} error
 * @param {Response | undefined} response
 * @returns {Promise<string>}
 */
async function formatLoungeChatInvokeError(error, response) {
  const raw =
    error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message.trim()
      : ''
  const status = response && typeof response.status === 'number' ? response.status : null

  if (status === 404) {
    return (
      'Chat service not found (HTTP 404). Deploy Edge Function `lounge-chat` on this Supabase project ' +
      '(repo: `supabase functions deploy lounge-chat`) and confirm `VITE_SUPABASE_URL` matches that project.'
    )
  }

  if (response && status != null && status >= 400) {
    try {
      const text = await response.clone().text()
      const j = JSON.parse(text)
      if (j && typeof j === 'object' && j.error != null && String(j.error).trim()) {
        return String(j.error).trim()
      }
    } catch {
      /* ignore parse */
    }
  }

  if (status === 401) {
    return 'Sign in again, then retry (session expired or chat service rejected the token).'
  }

  const lower = raw.toLowerCase()
  if (
    /failed to send a request to the edge function|failed to fetch|load failed|networkerror|network request failed/i.test(
      lower,
    )
  ) {
    return (
      `${raw || 'Could not reach chat service.'} ` +
      'Typical causes: `lounge-chat` is not deployed on this Supabase project, `VITE_SUPABASE_URL` / anon key ' +
      'point at a different project than where you deployed, or a browser extension / network is blocking …/functions/v1/lounge-chat.'
    )
  }

  return raw || 'Chat request failed.'
}
