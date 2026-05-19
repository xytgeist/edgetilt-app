/** Short git SHA baked in at `vite build` / Vercel deploy (`VERCEL_GIT_COMMIT_SHA`). */
export const APP_BUILD_SHA = String(import.meta.env.VITE_BUILD_SHA || 'unknown')

/** Title-bar build badge: local dev, or explicit env on test/preview deploys. */
export const SHOW_APP_BUILD_BADGE =
  import.meta.env.DEV ||
  String(import.meta.env.VITE_SHOW_BUILD_BADGE || '').toLowerCase() === 'true'
