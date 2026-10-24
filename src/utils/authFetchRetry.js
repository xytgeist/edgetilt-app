/**
 * Supabase client `fetch` that retries auth calls which never reached the server. iOS reports those as
 * "Load failed" (Safari: "Failed to fetch"), most often on the first sign-in after an install while the network is
 * still waking. Only connection failures on `/auth/v1/` retry; any real response (bad password, rate limit) and
 * aborted requests pass straight through.
 */
const NETWORK_ERROR = /load failed|failed to fetch|networkerror|network request failed|network connection was lost/i
const WAITS_MS = [400, 1200]

export async function authFetchRetry(input, init) {
  const url = typeof input === 'string' ? input : input?.url || ''
  if (!/\/auth\/v1\//.test(url)) return fetch(input, init)
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(input, init)
    } catch (err) {
      const retryable = attempt < WAITS_MS.length && !init?.signal?.aborted && NETWORK_ERROR.test(String(err?.message || err))
      if (!retryable) throw err
      await new Promise((resolve) => setTimeout(resolve, WAITS_MS[attempt]))
    }
  }
}
