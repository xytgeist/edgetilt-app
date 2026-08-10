/**
 * Full-surface first-load placeholder for Poker Bankroll / Stable Manager.
 * Avoids flashing empty $0 heroes + "Loading…" under half-rendered chrome.
 */
export default function PokerSurfaceBootLoading({ label = 'Loading…' }) {
  return (
    <div
      data-poker-surface-boot-loading
      className="space-y-4 py-1"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        data-elevated-card="surface"
        className="rounded-3xl border border-zinc-800/80 bg-zinc-900/70 px-5 py-5"
      >
        <div className="h-3 w-32 animate-pulse rounded bg-zinc-700/70" />
        <div className="mt-4 h-10 w-44 animate-pulse rounded-xl bg-zinc-700/45" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="h-14 animate-pulse rounded-2xl bg-zinc-800/80" />
          <div className="h-14 animate-pulse rounded-2xl bg-zinc-800/80" />
          <div className="h-14 animate-pulse rounded-2xl bg-zinc-800/80" />
        </div>
        <div className="mt-4 h-11 w-full animate-pulse rounded-2xl bg-zinc-800/60" />
      </div>
      <div
        data-elevated-card="surface"
        className="rounded-3xl border border-zinc-800/80 bg-zinc-900/50 px-4 py-10"
      >
        <div className="mx-auto h-3 w-40 animate-pulse rounded bg-zinc-700/50" />
        <div className="mx-auto mt-4 h-16 w-full max-w-sm animate-pulse rounded-2xl bg-zinc-800/70" />
        <p className="sr-only">{label}</p>
      </div>
    </div>
  )
}
