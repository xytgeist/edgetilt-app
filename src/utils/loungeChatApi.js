/**
 * Invoke `lounge-chat` Edge function with the caller's Supabase session JWT.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Record<string, unknown>} payload Must include `action`.
 */
export async function loungeChatInvoke(supabase, payload) {
  // Let the SDK manage the auth header — it auto-refreshes expired tokens
  // before the request, avoiding stale-token 401s from the Edge Function.
  // Fall back to explicit check only to surface a clean "sign in" message.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sign in to use chat.')
  }

  const { data, error, response } = await supabase.functions.invoke('lounge-chat', {
    body: payload,
  })

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
