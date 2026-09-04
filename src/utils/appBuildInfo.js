/** Semantic version for EdgeTilt web & platform. */
export const APP_VERSION = '1.4.33'

/** Short git SHA baked in at `vite build` / Vercel deploy (`VERCEL_GIT_COMMIT_SHA`). */
export const APP_BUILD_SHA = String(import.meta.env.VITE_BUILD_SHA || 'unknown')

