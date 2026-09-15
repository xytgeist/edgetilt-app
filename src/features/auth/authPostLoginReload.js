const AUTH_POST_LOGIN_RELOAD_KEY = 'lvslotpro-auth-post-login-reload:v1'

/** Seed profile, then hard-reload. Do not set React `user` first ... that mounts legal/welcome and the tap is lost on reload. */
export async function reloadAfterAuthSession(ensureProfile, user) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(AUTH_POST_LOGIN_RELOAD_KEY, '1')
  } catch {
    // ignore
  }
  if (typeof ensureProfile === 'function' && user) {
    await ensureProfile(user)
  }
  window.location.reload()
}
