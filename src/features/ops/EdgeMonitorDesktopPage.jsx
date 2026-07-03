import EdgeMonitorDashboard from './EdgeMonitorDashboard.jsx'

/**
 * Full-width desktop ops dashboard at `/monitor`.
 *
 * @param {{
 *   supabaseClient: import('@supabase/supabase-js').SupabaseClient,
 *   isAdmin?: boolean,
 *   isChecking?: boolean,
 *   userEmail?: string,
 *   onOpenAuth?: () => void,
 *   onOpenApp?: () => void,
 * }} props
 */
export default function EdgeMonitorDesktopPage({
  supabaseClient,
  isAdmin = false,
  isChecking = false,
  userEmail = '',
  onOpenAuth,
  onOpenApp,
}) {
  if (isChecking) {
    return (
      <div
        data-edge-monitor-desktop
        className="edge-monitor-desktop-page flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-400"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain">
          Loading…
        </div>
      </div>
    )
  }

  if (!userEmail) {
    return (
      <div
        data-edge-monitor-desktop
        className="edge-monitor-desktop-page flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-6 py-8">
          <div className="max-w-md w-full rounded-3xl border border-zinc-800 bg-zinc-900/90 p-8 text-center">
            <div className="text-3xl font-black bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">
              Edge Monitor
            </div>
            <p className="mt-3 text-zinc-400 text-sm leading-relaxed">
              Admin-only ops dashboard. Sign in with an admin account to view product metrics.
            </p>
            <button
              type="button"
              onClick={() => onOpenAuth?.()}
              className="mt-6 w-full min-h-12 rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 text-white font-bold hover:from-cyan-500 hover:to-violet-500"
            >
              Log in
            </button>
            <button
              type="button"
              onClick={() => onOpenApp?.()}
              className="mt-3 w-full min-h-10 rounded-xl text-zinc-500 text-sm font-semibold hover:text-zinc-300"
            >
              ← Back to app
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div
        data-edge-monitor-desktop
        className="edge-monitor-desktop-page flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950"
      >
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto overscroll-y-contain px-6 py-8">
          <div className="max-w-md w-full rounded-3xl border border-red-900/40 bg-red-950/20 p-8 text-center">
            <div className="text-xl font-bold text-red-100">Admin only</div>
            <p className="mt-3 text-red-200/80 text-sm leading-relaxed">
              Edge Monitor is restricted to <span className="font-semibold">profiles.role = admin</span>.
            </p>
            <button
              type="button"
              onClick={() => onOpenApp?.()}
              className="mt-6 w-full min-h-12 rounded-2xl bg-zinc-800 text-zinc-100 font-semibold hover:bg-zinc-700"
            >
              ← Back to app
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      data-edge-monitor-desktop
      className="edge-monitor-desktop-page flex h-dvh max-h-dvh flex-col overflow-hidden bg-zinc-950 text-zinc-100"
    >
      <div className="pointer-events-none fixed inset-0 edge-monitor-desktop-bg" aria-hidden />
      <header className="relative z-40 shrink-0 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/edge-lounge-logo-transparent.png" alt="" className="h-8 w-auto shrink-0" />
            <span className="text-sm font-semibold text-zinc-400 truncate hidden sm:inline">
              {userEmail}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/"
              className="min-h-9 inline-flex items-center rounded-xl bg-zinc-800/80 px-3 text-zinc-200 text-xs font-semibold hover:bg-zinc-700"
            >
              Open app
            </a>
            <a
              href="/?tab=monitor"
              className="min-h-9 inline-flex items-center rounded-xl bg-zinc-800/80 px-3 text-zinc-400 text-xs font-semibold hover:bg-zinc-700 hover:text-zinc-200"
            >
              Mobile tab
            </a>
          </div>
        </div>
      </header>
      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <div className="mx-auto max-w-[1680px] px-6 py-8 pb-16">
          <EdgeMonitorDashboard supabaseClient={supabaseClient} layout="desktop" showDesktopLink={false} />
        </div>
      </main>
    </div>
  )
}
