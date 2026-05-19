import { APP_BUILD_SHA, SHOW_APP_BUILD_BADGE } from '../utils/appBuildInfo.js'

/**
 * Muted title-bar status: optional feed refresh copy + test build SHA.
 * Build badge: local dev or `VITE_SHOW_BUILD_BADGE=true` (set on test Vercel).
 */
export default function TitleBarStatusLine({ loading = false }) {
  const showBuild = SHOW_APP_BUILD_BADGE
  if (!loading && !showBuild) return null

  return (
    <div className="pointer-events-none truncate text-right text-zinc-600 text-[13px]">
      {loading ? 'Updating…' : null}
      {loading && showBuild ? ' · ' : null}
      {showBuild ? (
        <span className="font-mono text-amber-600/90" title={`Build ${APP_BUILD_SHA}`}>
          {APP_BUILD_SHA}
        </span>
      ) : null}
    </div>
  )
}
